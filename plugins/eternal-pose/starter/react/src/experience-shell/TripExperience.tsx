import { Temporal } from "@js-temporal/polyfill";
import { House, LocateFixed, MapPin, Pause } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import { GoogleNavigationAdapter } from "../providers/google/google-maps-url";
import type { CandidateGroup, Trip, TripNode } from "../trip-core/model";
import {
  emptyTripProgress,
  nodeCompletionKey,
  tripProgressReducer,
} from "../trip-core/progress";
import {
  resolveEffectiveItinerary,
  type EffectiveDay,
  type EffectiveNode,
} from "../trip-core/resolve-itinerary";
import { findLiveState, resolveSchedule } from "../trip-core/time";
import { DayHeader } from "../ui/DayHeader";
import { ItineraryTimeline } from "../ui/ItineraryTimeline";
import {
  CandidateDecision,
  type CandidateMapOverride,
  type CandidatePreviewRequest,
} from "../ui/decisions/CandidateDecision";
import {
  resolveShoppingStatus,
  ShoppingStatusSelect,
} from "../ui/decisions/ShoppingStatusSelect";
import { ReservationPanel } from "../ui/reservations/ReservationPanel";
import "../ui/styles/base.css";
import "../ui/styles/recipe.css";
import { TaskWidget } from "../ui/tasks/TaskWidget";
import { ItineraryMap } from "./ItineraryMap";
import { ItinerarySheet } from "./ItinerarySheet";
import { buildMapPresentation } from "./map-presentation";
import {
  decodeMapPlaceOwnerId,
  candidateMapOwnerId,
  nodeMapOwnerId,
  type MapAdapter,
  type MapFocusTarget,
  type MapPadding,
  type MapPresentation,
} from "./provider-contracts";
import {
  resolveSheetGeometry,
  type SheetSnap,
} from "./sheet-geometry";
import { useTripSelection } from "./useTripSelection";
import type { TripProgressController } from "./useTripProgress";
import { useUserLocation } from "./useUserLocation";

export interface TripExperienceProps {
  trip: Trip;
  adapterFactory: () => MapAdapter;
  clock?: () => string;
  initialDayId?: string;
  progressController?: TripProgressController;
  onBackToHome?: () => void;
}

interface ViewportMetrics {
  width: number;
  height: number;
  safeTop: number;
  safeBottom: number;
}

interface PendingMapFocus {
  dayId: string;
  target: MapFocusTarget;
}

interface RenderedMapState {
  adapter: MapAdapter;
  dayId: string;
  presentation: MapPresentation;
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
const MINUTE_IN_MILLISECONDS = 60_000;
const DEFAULT_NAVIGATION_ADAPTER = new GoogleNavigationAdapter();

function systemClock(): string {
  return new Date().toISOString();
}

function nextMinuteDelay(epochMilliseconds: number): number {
  const remainder = epochMilliseconds % MINUTE_IN_MILLISECONDS;
  return remainder === 0
    ? MINUTE_IN_MILLISECONDS
    : MINUTE_IN_MILLISECONDS - remainder;
}

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

function sourceNode(trip: Trip, nodeId: string | null): TripNode | undefined {
  if (nodeId === null) {
    return undefined;
  }
  return trip.days.flatMap(({ nodes }) => nodes).find(({ id }) => id === nodeId);
}

function candidateGroupForNode(
  trip: Trip,
  node: TripNode | undefined,
): CandidateGroup | undefined {
  if (node === undefined) {
    return undefined;
  }
  if (node.kind === "dining" && node.payload.candidateGroupId !== undefined) {
    return trip.candidateGroups.find(
      (group) =>
        group.id === node.payload.candidateGroupId &&
        group.parentNodeId === node.id,
    );
  }
  const groups = trip.candidateGroups.filter(
    ({ parentNodeId }) => parentNodeId === node.id,
  );
  return groups.length === 1 ? groups[0] : undefined;
}

function isLocatableLodging(node: EffectiveNode): boolean {
  if (node.node.kind !== "lodging") {
    return false;
  }
  const coordinates = node.node.place?.coordinates;
  return (
    coordinates !== undefined &&
    Number.isFinite(coordinates.lat) &&
    coordinates.lat >= -90 &&
    coordinates.lat <= 90 &&
    Number.isFinite(coordinates.lng) &&
    coordinates.lng >= -180 &&
    coordinates.lng <= 180
  );
}

function lodgingForDisplayedDay(
  days: readonly EffectiveDay[],
  displayedDayId: string,
): EffectiveNode | undefined {
  const displayedIndex = Math.max(
    0,
    days.findIndex(({ day }) => day.id === displayedDayId),
  );
  const candidates = days.flatMap((day, dayIndex) =>
    day.nodes.flatMap((node, nodeIndex) =>
      isLocatableLodging(node) ? [{ node, dayIndex, nodeIndex }] : [],
    ),
  );

  // Deterministic fallback: nearest itinerary day, then the earlier day,
  // then the first lodging in authored order.
  candidates.sort(
    (left, right) =>
      Math.abs(left.dayIndex - displayedIndex) -
        Math.abs(right.dayIndex - displayedIndex) ||
      left.dayIndex - right.dayIndex ||
      left.nodeIndex - right.nodeIndex,
  );
  return candidates[0]?.node;
}

function formatLocalClock(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(new Date(instant));
}

function ignoreMapRouteSelection(): void {
  // Route geometry and route focus enter in the Task 8/11 integration seam.
}

function locatablePresentationIds(presentation: MapPresentation): string[] {
  const ids = new Set(presentation.places.map(({ ownerId }) => ownerId));
  for (const route of presentation.routes) {
    if (route.path.length > 0) {
      ids.add(route.edgeId);
    }
  }
  return [...ids];
}

function presentationHasTarget(
  presentation: MapPresentation,
  target: MapFocusTarget,
): boolean {
  return target.kind === "place"
    ? presentation.places.some(({ ownerId }) => ownerId === target.id)
    : presentation.routes.some(
        ({ edgeId, path }) => edgeId === target.id && path.length > 0,
      );
}

export function TripExperience({
  trip,
  adapterFactory,
  clock = systemClock,
  initialDayId: requestedInitialDayId,
  progressController,
  onBackToHome,
}: TripExperienceProps) {
  const safeAreaProbeRef = useRef<HTMLDivElement>(null);
  const viewport = useViewportMetrics(safeAreaProbeRef);
  const reducedMotion = useReducedMotionPreference();
  const [adapter] = useState<MapAdapter>(() => adapterFactory());
  const [mountedAdapter, setMountedAdapter] = useState<MapAdapter | null>(null);
  const [headerExpanded, setHeaderExpanded] = useState(true);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("half");
  const [fallbackProgress, setFallbackProgress] = useState(emptyTripProgress);
  const progress = progressController?.progress ?? fallbackProgress;
  const fallbackSelectCandidate = useCallback(
    (groupId: string, candidateId: string): void => {
      setFallbackProgress((current) =>
        tripProgressReducer(current, {
          type: "select-candidate",
          groupId,
          candidateId,
        }),
      );
    },
    [],
  );
  const fallbackSetShoppingStatus = useCallback(
    (itemId: string, status: Parameters<TripProgressController["setShoppingStatus"]>[1]): void => {
      setFallbackProgress((current) =>
        tripProgressReducer(current, {
          type: "set-shopping-status",
          itemId,
          status,
        }),
      );
    },
    [],
  );
  const fallbackSetCompleted = useCallback(
    (id: string, completed: boolean): void => {
      setFallbackProgress((current) =>
        tripProgressReducer(current, { type: "set-completed", id, completed }),
      );
    },
    [],
  );
  const selectCandidate =
    progressController?.selectCandidate ?? fallbackSelectCandidate;
  const setShoppingStatus =
    progressController?.setShoppingStatus ?? fallbackSetShoppingStatus;
  const setCompleted = progressController?.setCompleted ?? fallbackSetCompleted;
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    if (clock !== systemClock) {
      return;
    }
    const timer = window.setTimeout(() => {
      setClockTick((tick) => tick + 1);
    }, nextMinuteDelay(Date.now()));
    return () => window.clearTimeout(timer);
  }, [clock, clockTick]);

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
  const initialDisplayedDayId =
    trip.days.some(({ id }) => id === requestedInitialDayId)
      ? (requestedInitialDayId ?? "")
      : dayForNode(trip, automaticNodeId) ?? trip.days[0]?.id ?? "";
  const [displayedDayId, setDisplayedDayId] = useState(initialDisplayedDayId);
  const [dayCameraIntent, setDayCameraIntent] = useState(0);
  const [candidateMapOverride, setCandidateMapOverride] =
    useState<CandidateMapOverride | null>(null);
  const candidateMapOverrideRef = useRef<CandidateMapOverride | null>(null);
  const [candidatePreviewRequest, setCandidatePreviewRequest] =
    useState<CandidatePreviewRequest>();

  const selectedEffectiveDay =
    effectiveTrip.days.find(({ day }) => day.id === displayedDayId) ??
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

  const selectedSourceNode = sourceNode(trip, selection.selection.nodeId);
  const selectedEffectiveNode = selectedEffectiveDay.nodes.find(
    ({ sourceNodeId }) => sourceNodeId === selection.selection.nodeId,
  );
  const selectedCandidateGroup =
    selectedEffectiveNode === undefined
      ? undefined
      : candidateGroupForNode(trip, selectedSourceNode);
  const candidateSequenceNumber = Math.max(
    1,
    selectedEffectiveDay.day.nodes.findIndex(
      ({ id }) => id === selectedCandidateGroup?.parentNodeId,
    ) + 1,
  );
  const activeCandidateMapOverride =
    selectedCandidateGroup?.id === candidateMapOverride?.group.id
      ? candidateMapOverride
      : null;

  const handleCandidateMapOverrideChange = useCallback(
    (next: CandidateMapOverride | null): void => {
      const previousGroupId = candidateMapOverrideRef.current?.group.id;
      const previousSessionId = candidateMapOverrideRef.current?.sessionId;
      const nextGroupId = next?.group.id;
      const nextSessionId = next?.sessionId;
      candidateMapOverrideRef.current = next;
      setCandidateMapOverride(next);
      if (
        previousGroupId !== nextGroupId ||
        previousSessionId !== nextSessionId
      ) {
        setCandidatePreviewRequest(undefined);
      }
      if (previousGroupId !== nextGroupId) {
        setDayCameraIntent((intent) => intent + 1);
      }
    },
    [],
  );
  const clearCandidateInteraction = useCallback((): void => {
    handleCandidateMapOverrideChange(null);
  }, [handleCandidateMapOverrideChange]);

  const presentation = useMemo(
    () =>
      buildMapPresentation(selectedEffectiveDay, {
        ...(selection.selection.nodeId === null
          ? {}
          : { selectedNodeId: selection.selection.nodeId }),
        ...(activeCandidateMapOverride === null
          ? {}
          : {
              expandedCandidateGroup: activeCandidateMapOverride.group,
              ...(activeCandidateMapOverride.activeOptionId === undefined
                ? {}
                : {
                    activeCandidateOptionId:
                      activeCandidateMapOverride.activeOptionId,
                  }),
            }),
      }),
    [
      activeCandidateMapOverride,
      selectedEffectiveDay,
      selection.selection.nodeId,
    ],
  );
  const lastFittedDayIntentRef = useRef(-1);
  const pendingMapFocusRef = useRef<PendingMapFocus | null>(null);
  const renderedMapRef = useRef<RenderedMapState | null>(null);

  const handlePresentationRendered = (
    renderedAdapter: MapAdapter,
    renderedPresentation: MapPresentation,
  ): void => {
    const renderedDayId = selectedEffectiveDay.day.id;
    renderedMapRef.current = {
      adapter: renderedAdapter,
      dayId: renderedDayId,
      presentation: renderedPresentation,
    };

    if (lastFittedDayIntentRef.current !== dayCameraIntent) {
      lastFittedDayIntentRef.current = dayCameraIntent;
      const fitIds = locatablePresentationIds(renderedPresentation);
      if (fitIds.length > 0) {
        renderedAdapter.fit(fitIds);
      }
    }

    const pendingFocus = pendingMapFocusRef.current;
    if (pendingFocus?.dayId !== renderedDayId) {
      return;
    }
    pendingMapFocusRef.current = null;
    if (presentationHasTarget(renderedPresentation, pendingFocus.target)) {
      renderedAdapter.focus(pendingFocus.target);
    }
  };

  const markDisplayedDayIntent = (dayId: string): void => {
    pendingMapFocusRef.current = null;
    setDisplayedDayId(dayId);
    setDayCameraIntent((intent) => intent + 1);
  };

  const synchronizeDisplayedDay = (dayId: string): void => {
    if (dayId !== displayedDayId) {
      markDisplayedDayIntent(dayId);
    }
  };

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
      bottom: sheetHeight + viewport.safeBottom + 16,
      left: 16,
    }),
    [headerClearance, sheetHeight, viewport.safeBottom],
  );

  const focusMap = (target: MapFocusTarget, targetDayId: string): void => {
    const renderedMap = renderedMapRef.current;
    if (
      renderedMap?.dayId === targetDayId &&
      presentationHasTarget(renderedMap.presentation, target)
    ) {
      pendingMapFocusRef.current = null;
      renderedMap.adapter.focus(target);
      return;
    }
    pendingMapFocusRef.current = { dayId: targetDayId, target };
  };

  const selectNode = (
    nodeId: string,
    options: { synchronizeDay?: boolean } = {},
  ): void => {
    if (!availableNodeIds.includes(nodeId)) {
      return;
    }
    clearCandidateInteraction();
    selection.selectManual(nodeId);
    const ownerDay = dayForNode(trip, nodeId);
    if (options.synchronizeDay === true) {
      if (ownerDay !== undefined) {
        synchronizeDisplayedDay(ownerDay);
      }
    }
    focusMap(
      { kind: "place", id: nodeMapOwnerId(nodeId) },
      ownerDay ?? selectedEffectiveDay.day.id,
    );
  };

  const handleMapPlaceSelect = (ownerId: string): void => {
    const owner = decodeMapPlaceOwnerId(ownerId);
    if (owner?.kind === "node") {
      selectNode(owner.id, { synchronizeDay: true });
      return;
    }
    if (owner?.kind !== "candidate") {
      return;
    }
    if (
      activeCandidateMapOverride?.group.options.some(
        ({ id }) => id === owner.id,
      )
    ) {
      selection.selectManual(activeCandidateMapOverride.group.parentNodeId);
      setCandidatePreviewRequest((current) => ({
        groupId: activeCandidateMapOverride.group.id,
        sessionId: activeCandidateMapOverride.sessionId,
        optionId: owner.id,
        requestId: (current?.requestId ?? 0) + 1,
      }));
      return;
    }
    const group = trip.candidateGroups.find((candidateGroup) =>
      candidateGroup.options.some((option) => option.id === owner.id),
    );
    if (group !== undefined) {
      selectNode(group.parentNodeId, { synchronizeDay: true });
    }
  };

  const returnToNow = (): void => {
    clearCandidateInteraction();
    selection.returnToNow();
    const liveDayId = dayForNode(trip, automaticNodeId);
    if (liveDayId !== undefined) {
      synchronizeDisplayedDay(liveDayId);
    }
    if (automaticNodeId !== null) {
      focusMap(
        { kind: "place", id: nodeMapOwnerId(automaticNodeId) },
        liveDayId ?? selectedEffectiveDay.day.id,
      );
    }
  };

  const returnToLodging = (): void => {
    const lodging = lodgingForDisplayedDay(
      effectiveTrip.days,
      selectedEffectiveDay.day.id,
    );
    if (lodging !== undefined) {
      selectNode(lodging.sourceNodeId, { synchronizeDay: true });
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
    clearCandidateInteraction();
    markDisplayedDayIntent(dayId);
    setSheetSnap("half");
    const firstNode = day.nodes[0];
    if (firstNode !== undefined) {
      selection.selectManual(firstNode.sourceNodeId);
    }
  };

  const dayTasks = trip.tasks.filter(
    ({ scope, dayId }) =>
      scope === "day" && dayId === selectedEffectiveDay.day.id,
  );
  const completedProgressIds = new Set(progress.completedIds);
  const completedChecklistIds = new Set(
    progress.completedIds.flatMap((id) =>
      id.startsWith("checklist:") ? [id.slice("checklist:".length)] : [],
    ),
  );
  const shoppingNode =
    selectedEffectiveNode?.node.kind === "shopping"
      ? selectedEffectiveNode.node
      : undefined;

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
        onRouteSelect={ignoreMapRouteSelection}
        onReady={setMountedAdapter}
        onPresentationRendered={handlePresentationRendered}
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
        {onBackToHome === undefined ? null : (
          <button
            type="button"
            className="icon-control"
            aria-label="回到旅行首頁"
            data-touch-target="44"
            onClick={() => {
              clearCandidateInteraction();
              onBackToHome();
            }}
          >
            <House aria-hidden="true" size={19} strokeWidth={1.8} />
          </button>
        )}
        <ReservationPanel reservations={trip.reservations} />
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
        {selectedCandidateGroup === undefined || selectedSourceNode === undefined ? null : (
          <CandidateDecision
            key={`candidate-decision:${selectedCandidateGroup.id}`}
            group={selectedCandidateGroup}
            label={selectedSourceNode.title}
            sequenceNumber={candidateSequenceNumber}
            committedOptionId={selectedEffectiveNode?.selectedCandidateId}
            mapPreviewRequest={candidatePreviewRequest}
            onMapOverrideChange={handleCandidateMapOverrideChange}
            onCommit={selectCandidate}
            onLocateOption={(optionId) =>
              focusMap(
                { kind: "place", id: candidateMapOwnerId(optionId) },
                selectedEffectiveDay.day.id,
              )
            }
          />
        )}

        {shoppingNode === undefined ? null : (
          <section
            className="shopping-decision-panel"
            data-surface="shopping-progress"
            aria-label={`${shoppingNode.title} 採買清單`}
          >
            <h3>{shoppingNode.title}</h3>
            <ul className="shopping-decision-panel__items">
              {shoppingNode.payload.items.map((item) => (
                <li key={`shopping-item:${item.id}`}>
                  <span>{item.title}</span>
                  <ShoppingStatusSelect
                    item={item}
                    status={resolveShoppingStatus(item, progress.shoppingStatuses)}
                    onChange={(status) => setShoppingStatus(item.id, status)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {dayTasks.length === 0 ? null : (
          <TaskWidget
            dayTitle={selectedEffectiveDay.day.title}
            tasks={dayTasks}
            completedIds={completedProgressIds}
            onCompletedChange={setCompleted}
          />
        )}

        <ItineraryTimeline
          nodes={selectedEffectiveDay.nodes}
          routes={selectedDayRoutes}
          selection={selection.selection}
          onNodeSelect={selectNode}
          dayDate={selectedEffectiveDay.day.date}
          currentNodeId={liveState.currentId}
          navigationAdapter={DEFAULT_NAVIGATION_ADAPTER}
          completedChecklistIds={completedChecklistIds}
          shoppingStatuses={progress.shoppingStatuses}
        />
      </ItinerarySheet>
    </main>
  );
}
