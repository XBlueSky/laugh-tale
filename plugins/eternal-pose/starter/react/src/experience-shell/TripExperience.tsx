import { Temporal } from "@js-temporal/polyfill";
import { LocateFixed, MapPin, Pause } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import type { Trip } from "../trip-core/model";
import { emptyTripProgress, nodeCompletionKey } from "../trip-core/progress";
import { resolveEffectiveItinerary } from "../trip-core/resolve-itinerary";
import { findLiveState, resolveSchedule } from "../trip-core/time";
import { DayHeader } from "../ui/DayHeader";
import { ItineraryTimeline } from "../ui/ItineraryTimeline";
import "../ui/styles/base.css";
import "../ui/styles/recipe.css";
import { ItineraryMap } from "./ItineraryMap";
import { ItinerarySheet } from "./ItinerarySheet";
import { buildMapPresentation } from "./map-presentation";
import {
  decodeMapPlaceOwnerId,
  nodeMapOwnerId,
  type MapAdapter,
  type MapFocusTarget,
  type MapPadding,
} from "./provider-contracts";
import {
  resolveSheetGeometry,
  type SheetSnap,
} from "./sheet-geometry";
import { useTripSelection } from "./useTripSelection";
import { useUserLocation } from "./useUserLocation";

export interface TripExperienceProps {
  trip: Trip;
  adapterFactory: () => MapAdapter;
  clock?: () => string;
}

interface ViewportMetrics {
  width: number;
  height: number;
  safeTop: number;
  safeBottom: number;
}

const DEFAULT_VIEWPORT: ViewportMetrics = {
  width: 390,
  height: 844,
  safeTop: 0,
  safeBottom: 0,
};
const EXPANDED_HEADER_HEIGHT = 148;
const COLLAPSED_HEADER_HEIGHT = 72;
const COLLAPSED_SHEET_HEIGHT = 128;

function finitePixel(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function useViewportMetrics(
  safeAreaProbeRef: RefObject<HTMLDivElement | null>,
): ViewportMetrics {
  const [metrics, setMetrics] = useState<ViewportMetrics>(() =>
    typeof window === "undefined"
      ? DEFAULT_VIEWPORT
      : {
          width: window.innerWidth,
          height: window.innerHeight,
          safeTop: 0,
          safeBottom: 0,
        },
  );

  useEffect(() => {
    const measure = (): void => {
      const probe = safeAreaProbeRef.current;
      const computed = probe === null ? null : window.getComputedStyle(probe);
      const next: ViewportMetrics = {
        width: window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
        safeTop: finitePixel(computed?.paddingTop ?? ""),
        safeBottom: finitePixel(computed?.paddingBottom ?? ""),
      };
      setMetrics((current) =>
        current.width === next.width &&
        current.height === next.height &&
        current.safeTop === next.safeTop &&
        current.safeBottom === next.safeBottom
          ? current
          : next,
      );
    };
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [safeAreaProbeRef]);

  return metrics;
}

function useReducedMotionPreference(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

function dayForNode(trip: Trip, nodeId: string | null): string | undefined {
  if (nodeId === null) {
    return undefined;
  }
  return trip.days.find((day) => day.nodes.some((node) => node.id === nodeId))?.id;
}

function formatLocalClock(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(new Date(instant));
}

export function TripExperience({
  trip,
  adapterFactory,
  clock = () => new Date().toISOString(),
}: TripExperienceProps) {
  const safeAreaProbeRef = useRef<HTMLDivElement>(null);
  const viewport = useViewportMetrics(safeAreaProbeRef);
  const reducedMotion = useReducedMotionPreference();
  const [adapter] = useState<MapAdapter>(() => adapterFactory());
  const [mountedAdapter, setMountedAdapter] = useState<MapAdapter | null>(null);
  const [headerExpanded, setHeaderExpanded] = useState(true);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("half");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [progress] = useState(emptyTripProgress);

  const nowInstant = clock();
  const effectiveTrip = useMemo(
    () => resolveEffectiveItinerary(trip, progress),
    [progress, trip],
  );
  const schedule = useMemo(() => resolveSchedule(trip), [trip]);
  const ignoredNodeIds = useMemo(() => {
    const ignored = new Set(progress.skippedNodeIds);
    for (const day of trip.days) {
      for (const node of day.nodes) {
        if (progress.completedIds.includes(nodeCompletionKey(node.id))) {
          ignored.add(node.id);
        }
      }
    }
    return ignored;
  }, [progress.completedIds, progress.skippedNodeIds, trip.days]);
  const liveState = findLiveState(
    schedule,
    Temporal.Instant.from(nowInstant).toZonedDateTimeISO(trip.timezone),
    { ignoredNodeIds },
  );
  const availableNodeIds = useMemo(
    () =>
      effectiveTrip.days.flatMap((day) =>
        day.nodes.map((node) => node.sourceNodeId),
      ),
    [effectiveTrip.days],
  );
  const automaticNodeId =
    liveState.currentId ?? liveState.nextId ?? availableNodeIds[0] ?? null;
  const selection = useTripSelection(automaticNodeId, availableNodeIds);
  const initialDayId =
    dayForNode(trip, automaticNodeId) ?? trip.days[0]?.id ?? "";
  const [selectedDayId, setSelectedDayId] = useState(initialDayId);

  const selectionDayId = dayForNode(trip, selection.selection.nodeId);
  const selectedEffectiveDay =
    effectiveTrip.days.find(
      ({ day }) => day.id === (selectionDayId ?? selectedDayId),
    ) ??
    effectiveTrip.days[0];
  if (selectedEffectiveDay === undefined) {
    throw new Error("TripExperience requires at least one trip day.");
  }

  const selectedDayRoutes = useMemo(() => {
    const owners = new Map<string, (typeof effectiveTrip.routes)[number]>();
    for (const route of effectiveTrip.routes) {
      if (route.dayId === selectedEffectiveDay.day.id && !owners.has(route.id)) {
        owners.set(route.id, route);
      }
    }
    return [...owners.values()];
  }, [effectiveTrip, selectedEffectiveDay.day.id]);

  const presentation = useMemo(
    () =>
      buildMapPresentation(selectedEffectiveDay, {
        ...(selection.selection.nodeId === null
          ? {}
          : { selectedNodeId: selection.selection.nodeId }),
        ...(selectedRouteId === null ? {} : { selectedRouteId }),
      }),
    [selectedEffectiveDay, selectedRouteId, selection.selection.nodeId],
  );

  const headerClearance =
    (headerExpanded ? EXPANDED_HEADER_HEIGHT : COLLAPSED_HEADER_HEIGHT) +
    viewport.safeTop;
  const geometry = resolveSheetGeometry({
    viewportHeight: viewport.height,
    topClearance: headerClearance,
    safeBottom: viewport.safeBottom,
    collapsedHeight: COLLAPSED_SHEET_HEIGHT,
  });
  const sheetHeight = geometry[sheetSnap];
  const mapPadding = useMemo<MapPadding>(
    () => ({
      top: headerClearance,
      right: 16,
      bottom: sheetHeight + 16,
      left: 16,
    }),
    [headerClearance, sheetHeight],
  );
  const pendingMapFocusRef = useRef<MapFocusTarget | null>(null);

  useEffect(() => {
    if (mountedAdapter !== null && pendingMapFocusRef.current !== null) {
      mountedAdapter.focus(pendingMapFocusRef.current);
      pendingMapFocusRef.current = null;
    }
  }, [mountedAdapter]);

  const focusMap = (target: MapFocusTarget): void => {
    if (mountedAdapter === null) {
      pendingMapFocusRef.current = target;
    } else {
      mountedAdapter.focus(target);
    }
  };

  const selectNode = (nodeId: string): void => {
    if (!availableNodeIds.includes(nodeId)) {
      return;
    }
    selection.selectManual(nodeId);
    const ownerDay = dayForNode(trip, nodeId);
    if (ownerDay !== undefined) {
      setSelectedDayId(ownerDay);
    }
    focusMap({ kind: "place", id: nodeMapOwnerId(nodeId) });
  };

  const selectRoute = (routeId: string): void => {
    if (!selectedDayRoutes.some((route) => route.id === routeId)) {
      return;
    }
    setSelectedRouteId(routeId);
    focusMap({ kind: "route", id: routeId });
  };

  const handleMapPlaceSelect = (ownerId: string): void => {
    const owner = decodeMapPlaceOwnerId(ownerId);
    if (owner?.kind === "node") {
      selectNode(owner.id);
      return;
    }
    if (owner?.kind !== "candidate") {
      return;
    }
    const group = trip.candidateGroups.find((candidateGroup) =>
      candidateGroup.options.some((option) => option.id === owner.id),
    );
    if (group !== undefined) {
      selectNode(group.parentNodeId);
    }
  };

  const returnToNow = (): void => {
    selection.returnToNow();
    const liveDayId = dayForNode(trip, automaticNodeId);
    if (liveDayId !== undefined) {
      setSelectedDayId(liveDayId);
    }
    if (automaticNodeId !== null) {
      focusMap({ kind: "place", id: nodeMapOwnerId(automaticNodeId) });
    }
  };

  const returnToLodging = (): void => {
    const lodging = effectiveTrip.days
      .flatMap((day) => day.nodes)
      .find(({ node }) => node.kind === "lodging" && node.place !== undefined);
    if (lodging !== undefined) {
      selectNode(lodging.sourceNodeId);
    }
  };

  const userLocation = useUserLocation(mountedAdapter);
  const shellStyle = {
    "--safe-area-top": `${viewport.safeTop}px`,
    "--safe-area-bottom": `${viewport.safeBottom}px`,
    "--header-clearance": `${headerClearance}px`,
    "--sheet-ceiling": `${geometry.ceiling}px`,
    "--map-padding-top": `${mapPadding.top}px`,
    "--map-padding-bottom": `${mapPadding.bottom}px`,
    "--shell-motion-duration": reducedMotion ? "0ms" : "200ms",
    maxInlineSize: "100vw",
    overflowX: "hidden",
  } as CSSProperties;

  const selectDay = (dayId: string): void => {
    const day = effectiveTrip.days.find((candidate) => candidate.day.id === dayId);
    if (day === undefined) {
      return;
    }
    setSelectedDayId(dayId);
    setSheetSnap("half");
    const firstNode = day.nodes[0];
    if (firstNode !== undefined) {
      selection.selectManual(firstNode.sourceNodeId);
    }
  };

  return (
    <main
      className="trip-experience"
      data-testid="trip-experience"
      data-geometry-source="shared"
      data-header-expanded={headerExpanded ? "true" : "false"}
      data-motion={reducedMotion ? "reduced" : "full"}
      data-viewport-width={String(viewport.width)}
      style={shellStyle}
    >
      <div ref={safeAreaProbeRef} className="safe-area-probe" aria-hidden="true" />
      <ItineraryMap
        adapter={adapter}
        presentation={presentation}
        padding={mapPadding}
        onPlaceSelect={handleMapPlaceSelect}
        onRouteSelect={selectRoute}
        onReady={setMountedAdapter}
      />

      <DayHeader
        tripTitle={trip.title}
        timezoneLabel={trip.timezone}
        clockLabel={formatLocalClock(nowInstant, trip.timezone)}
        days={trip.days}
        selectedDayId={selectedEffectiveDay.day.id}
        expanded={headerExpanded}
        reducedMotion={reducedMotion}
        onExpandedChange={setHeaderExpanded}
        onDaySelect={selectDay}
        onReturnToNow={returnToNow}
        onReturnToLodging={returnToLodging}
      />

      <div className="map-controls" role="toolbar" aria-label="Map controls">
        <button
          type="button"
          className="map-controls__location icon-control"
          aria-label={
            userLocation.status === "active"
              ? "Recenter my location"
              : userLocation.status === "requesting"
                ? "Requesting location"
                : "Use my location"
          }
          data-touch-target="44"
          disabled={userLocation.status === "requesting"}
          onClick={
            userLocation.status === "active"
              ? userLocation.recenter
              : userLocation.start
          }
        >
          {userLocation.status === "active" ? (
            <LocateFixed aria-hidden="true" size={19} strokeWidth={1.8} />
          ) : (
            <MapPin aria-hidden="true" size={19} strokeWidth={1.8} />
          )}
        </button>
        {userLocation.status === "active" ? (
          <button
            type="button"
            className="icon-control"
            aria-label="Stop location sharing"
            data-touch-target="44"
            onClick={userLocation.stop}
          >
            <Pause aria-hidden="true" size={18} strokeWidth={1.8} />
          </button>
        ) : null}
        <span className="map-controls__status" aria-live="polite">
          {userLocation.label}
        </span>
      </div>

      <ItinerarySheet
        snap={sheetSnap}
        geometry={geometry}
        dayTitle={selectedEffectiveDay.day.title}
        itineraryCount={selectedEffectiveDay.nodes.length}
        onSnapChange={setSheetSnap}
        onReturnToNow={returnToNow}
      >
        <ItineraryTimeline
          nodes={selectedEffectiveDay.nodes}
          routes={selectedDayRoutes}
          selection={selection.selection}
          selectedRouteId={selectedRouteId}
          onNodeSelect={selectNode}
          onRouteSelect={selectRoute}
        />
      </ItinerarySheet>
    </main>
  );
}
