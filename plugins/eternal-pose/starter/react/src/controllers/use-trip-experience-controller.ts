import { Temporal } from "@js-temporal/polyfill";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefCallback,
} from "react";

import {
  buildMapPresentation,
  candidateMapOwnerId,
  decodeMapPlaceOwnerId,
  emptyTripProgress,
  findLiveState,
  nodeCompletionKey,
  nodeMapOwnerId,
  resolveEffectiveItinerary,
  resolveSchedule,
  resolveSheetGeometry,
  tripProgressReducer,
  type CandidateGroup,
  type CandidateMapOverride,
  type CandidatePreviewRequest,
  type EffectiveDay,
  type EffectiveNode,
  type MapFocusTarget,
  type MapPadding,
  type MapPresentation,
  type SheetSnap,
  type ShoppingStatus,
  type Trip,
  type TripNode,
} from "@laugh-tale-island/core";
import type {
  MapAdapter,
  NavigationAdapter,
  RouteAdapter,
} from "@laugh-tale-island/core/browser";
import {
  useItinerarySheet,
  useOptionalCandidateDecision,
  useRouteStates,
  useTripSelection,
  useUserLocation,
  type TripProgressController,
  type UseCandidateDecisionOptions,
} from "@laugh-tale-island/react";

import type {
  ExperienceBindings,
  ExperienceRouteViewModel,
  ExperienceViewProps,
  MapVisualProfile,
  PresentationGeometry,
} from "./presentation-contract";
import { useMapLifecycle } from "./use-map-lifecycle";
import {
  useReducedMotionPreference,
  useViewportMetrics,
} from "./use-viewport-metrics";

const MINUTE_IN_MILLISECONDS = 60_000;
const MAP_EDGE_PADDING = 16;

export interface UseTripExperienceControllerInput {
  trip: Trip;
  adapterFactory: () => MapAdapter;
  routeAdapterFactory?: () => RouteAdapter;
  navigationAdapter?: NavigationAdapter;
  clock?: () => string;
  initialDayId?: string;
  progressController?: TripProgressController;
  onBackToHome?: () => void;
  presentation: {
    geometry: PresentationGeometry;
    mapProfile: MapVisualProfile;
  };
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

type OwnerKind = "node" | "route";

interface PendingOwnerFocus {
  kind: OwnerKind;
  id: string;
}

interface CandidateInteractionState {
  override: CandidateMapOverride | null;
  previewRequest?: CandidatePreviewRequest;
  fitIntent: number;
}

function systemClock(): string {
  return new Date().toISOString();
}

function nextMinuteDelay(epochMilliseconds: number): number {
  const remainder = epochMilliseconds % MINUTE_IN_MILLISECONDS;
  return remainder === 0
    ? MINUTE_IN_MILLISECONDS
    : MINUTE_IN_MILLISECONDS - remainder;
}

function assertPresentationGeometry(geometry: PresentationGeometry): void {
  const values = [
    geometry.header.expanded,
    geometry.header.collapsed,
    geometry.sheet.collapsed,
    geometry.sheet.minGap,
    geometry.desktopBreakpoint,
  ];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Presentation geometry must contain finite non-negative values.");
  }
}

function dayForNode(trip: Trip, nodeId: string | null): string | undefined {
  if (nodeId === null) return undefined;
  return trip.days.find((day) =>
    day.nodes.some((node) => node.id === nodeId),
  )?.id;
}

function sourceNode(trip: Trip, nodeId: string | null): TripNode | undefined {
  if (nodeId === null) return undefined;
  return trip.days
    .flatMap(({ nodes }) => nodes)
    .find(({ id }) => id === nodeId);
}

function candidateGroupForNode(
  trip: Trip,
  node: TripNode | undefined,
): CandidateGroup | undefined {
  if (node === undefined) return undefined;
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
  if (node.node.kind !== "lodging") return false;
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
  candidates.sort(
    (left, right) =>
      Math.abs(left.dayIndex - displayedIndex) -
        Math.abs(right.dayIndex - displayedIndex) ||
      left.dayIndex - right.dayIndex ||
      left.nodeIndex - right.nodeIndex,
  );
  return candidates[0]?.node;
}

function locatablePresentationIds(presentation: MapPresentation): string[] {
  const ids = new Set(presentation.places.map(({ ownerId }) => ownerId));
  for (const route of presentation.routes) {
    if (route.path.length > 0) ids.add(route.edgeId);
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

function safeNavigationHref(
  edge: ExperienceRouteViewModel["edge"],
  adapter: NavigationAdapter | undefined,
): string | undefined {
  if (
    adapter === undefined ||
    edge.navigation === undefined ||
    edge.mode === "flight"
  ) {
    return undefined;
  }
  const origin = edge.navigation.origin.trim();
  const destination = edge.navigation.destination.trim();
  if (origin.length === 0 || destination.length === 0) return undefined;
  try {
    const href = adapter
      .directions({ origin, destination, travelMode: edge.mode })
      .trim();
    return href.length > 0 && new URL(href).protocol === "https:"
      ? href
      : undefined;
  } catch {
    return undefined;
  }
}

function resolvedShoppingStatus(
  initialStatus: ShoppingStatus | undefined,
  itemId: string,
  statuses: Readonly<Record<string, ShoppingStatus>>,
): ShoppingStatus {
  return Object.hasOwn(statuses, itemId)
    ? (statuses[itemId] ?? "pending")
    : (initialStatus ?? "pending");
}

function useExperienceRoutes(
  edges: readonly ExperienceRouteViewModel["edge"][],
  loadStates: Readonly<
    Record<string, NonNullable<ExperienceRouteViewModel["loadState"]>>
  >,
  selectedRouteId: string | null,
  selectionSource: "list" | "map" | null,
  navigationAdapter: NavigationAdapter | undefined,
): readonly ExperienceRouteViewModel[] {
  return useMemo(
    () =>
      edges.map((edge) => {
        const loadState = loadStates[edge.id];
        const navigationHref = safeNavigationHref(edge, navigationAdapter);
        return {
          edge,
          ...(loadState === undefined ? {} : { loadState }),
          selected: selectedRouteId === edge.id,
          selectionSource:
            selectedRouteId === edge.id ? selectionSource : null,
          ...(navigationHref === undefined ? {} : { navigationHref }),
        };
      }),
    [edges, loadStates, navigationAdapter, selectedRouteId, selectionSource],
  );
}

function useOwnerBindings(): {
  bindings: ExperienceBindings["owners"];
  focus(kind: OwnerKind, id: string): void;
  cancelPendingFocus(): void;
} {
  const nodeElementsRef = useRef(new Map<string, HTMLElement>());
  const routeElementsRef = useRef(new Map<string, HTMLElement>());
  const nodeCallbacksRef = useRef(
    new Map<string, RefCallback<HTMLElement>>(),
  );
  const routeCallbacksRef = useRef(
    new Map<string, RefCallback<HTMLElement>>(),
  );
  const pendingRef = useRef<PendingOwnerFocus | null>(null);

  const focusElement = useCallback(
    (kind: OwnerKind, id: string, element: HTMLElement | undefined): boolean => {
      if (element === undefined) return false;
      pendingRef.current = null;
      element.scrollIntoView?.({ block: "nearest" });
      element.focus({ preventScroll: true });
      return true;
    },
    [],
  );

  const callbackFor = useCallback(
    (
      kind: OwnerKind,
      id: string,
      elements: MutableRefObject<Map<string, HTMLElement>>,
      callbacks: MutableRefObject<Map<string, RefCallback<HTMLElement>>>,
    ): RefCallback<HTMLElement> => {
      const existing = callbacks.current.get(id);
      if (existing !== undefined) return existing;
      const callback: RefCallback<HTMLElement> = (element) => {
        if (element === null) {
          elements.current.delete(id);
          return;
        }
        elements.current.set(id, element);
        const pending = pendingRef.current;
        if (pending?.kind === kind && pending.id === id) {
          focusElement(kind, id, element);
        }
      };
      callbacks.current.set(id, callback);
      return callback;
    },
    [focusElement],
  );

  const nodeRef = useCallback(
    (nodeId: string) =>
      callbackFor("node", nodeId, nodeElementsRef, nodeCallbacksRef),
    [callbackFor],
  );
  const routeRef = useCallback(
    (routeId: string) =>
      callbackFor("route", routeId, routeElementsRef, routeCallbacksRef),
    [callbackFor],
  );
  const focus = useCallback(
    (kind: OwnerKind, id: string): void => {
      const elements = kind === "node" ? nodeElementsRef.current : routeElementsRef.current;
      if (!focusElement(kind, id, elements.get(id))) {
        pendingRef.current = { kind, id };
      }
    },
    [focusElement],
  );
  const cancelPendingFocus = useCallback((): void => {
    pendingRef.current = null;
  }, []);

  const bindings = useMemo(() => ({ nodeRef, routeRef }), [nodeRef, routeRef]);
  return useMemo(
    () => ({ bindings, focus, cancelPendingFocus }),
    [bindings, cancelPendingFocus, focus],
  );
}

export function useTripExperienceController({
  trip,
  adapterFactory,
  routeAdapterFactory,
  navigationAdapter,
  clock = systemClock,
  initialDayId: requestedInitialDayId,
  progressController,
  onBackToHome,
  presentation: presentationContract,
}: UseTripExperienceControllerInput): ExperienceViewProps {
  assertPresentationGeometry(presentationContract.geometry);
  const viewport = useViewportMetrics();
  const reducedMotion = useReducedMotionPreference();
  const [adapter] = useState<MapAdapter>(() => adapterFactory());
  const [headerExpanded, setHeaderExpanded] = useState(true);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("half");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [routeSelectionSource, setRouteSelectionSource] = useState<
    "list" | "map" | null
  >(null);
  const [fallbackProgress, setFallbackProgress] = useState(emptyTripProgress);
  const progress = progressController?.progress ?? fallbackProgress;
  const persistence =
    progressController?.persistenceStatus ?? ("memory-only" as const);

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
    (itemId: string, status: ShoppingStatus): void => {
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
  const setCompleted =
    progressController?.setCompleted ?? fallbackSetCompleted;
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    if (clock !== systemClock) return;
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
  const [candidateInteraction, setCandidateInteraction] =
    useState<CandidateInteractionState>({ override: null, fitIntent: 0 });
  const candidateMapOverride = candidateInteraction.override;
  const candidatePreviewRequest = candidateInteraction.previewRequest;

  const selectedEffectiveDay =
    effectiveTrip.days.find(({ day }) => day.id === displayedDayId) ??
    effectiveTrip.days[0];
  if (selectedEffectiveDay === undefined) {
    throw new Error("Trip experience requires at least one trip day.");
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
  const routeStates = useRouteStates(selectedDayRoutes, routeAdapterFactory);
  const activeSelectedRouteId = selectedDayRoutes.some(
    ({ id }) => id === selectedRouteId,
  )
    ? selectedRouteId
    : null;
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
  const decoratedCandidateGroup = useMemo<CandidateGroup | undefined>(
    () =>
      selectedCandidateGroup === undefined
        ? undefined
        : {
            ...selectedCandidateGroup,
            options: selectedCandidateGroup.options.map((option, index) => ({
              ...option,
              title: presentationContract.mapProfile.candidateTitle(
                candidateSequenceNumber,
                index,
                option,
              ),
            })),
          },
    [
      candidateSequenceNumber,
      presentationContract.mapProfile,
      selectedCandidateGroup,
    ],
  );

  const handleCandidateMapOverrideChange = useCallback(
    (next: CandidateMapOverride | null): void => {
      setCandidateInteraction((current) => {
        const groupChanged = current.override?.group.id !== next?.group.id;
        const sessionChanged = current.override?.sessionId !== next?.sessionId;
        return {
          override: next,
          fitIntent: current.fitIntent + (groupChanged ? 1 : 0),
          ...(!groupChanged && !sessionChanged && current.previewRequest !== undefined
            ? { previewRequest: current.previewRequest }
            : {}),
        };
      });
    },
    [],
  );
  const confirmCandidate = useCallback(
    (optionId: string): void => {
      if (selectedCandidateGroup !== undefined) {
        selectCandidate(selectedCandidateGroup.id, optionId);
      }
    },
    [selectCandidate, selectedCandidateGroup],
  );
  const candidateOptions = useMemo<UseCandidateDecisionOptions | null>(
    () =>
      selectedCandidateGroup === undefined || decoratedCandidateGroup === undefined
        ? null
        : {
            group: selectedCandidateGroup,
            overrideGroup: decoratedCandidateGroup,
            ...(selectedEffectiveNode?.selectedCandidateId === undefined
              ? {}
              : {
                  committedOptionId:
                    selectedEffectiveNode.selectedCandidateId,
                }),
            ...(candidatePreviewRequest === undefined
              ? {}
              : { mapPreviewRequest: candidatePreviewRequest }),
            onMapOverrideChange: handleCandidateMapOverrideChange,
            onConfirm: confirmCandidate,
          },
    [
      candidatePreviewRequest,
      confirmCandidate,
      decoratedCandidateGroup,
      handleCandidateMapOverrideChange,
      selectedCandidateGroup,
      selectedEffectiveNode,
    ],
  );
  const candidateDecision = useOptionalCandidateDecision(candidateOptions);
  const activeCandidateMapOverride =
    selectedCandidateGroup?.id === candidateMapOverride?.group.id
      ? candidateMapOverride
      : null;

  const mapPresentation = useMemo(
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
        routeResults: routeStates.mapResults,
        ...(activeSelectedRouteId === null
          ? {}
          : { selectedRouteId: activeSelectedRouteId }),
      }),
    [
      activeCandidateMapOverride,
      activeSelectedRouteId,
      routeStates.mapResults,
      selectedEffectiveDay,
      selection.selection.nodeId,
    ],
  );

  const requestedHeaderClearance =
    (headerExpanded
      ? presentationContract.geometry.header.expanded
      : presentationContract.geometry.header.collapsed) + viewport.safeTop;
  const maximumHeaderClearance = Math.max(
    viewport.safeTop,
    viewport.height -
      viewport.safeBottom -
      presentationContract.geometry.sheet.collapsed -
      presentationContract.geometry.sheet.minGap,
  );
  const headerClearance = Math.min(
    requestedHeaderClearance,
    maximumHeaderClearance,
  );
  const sheetGeometry = resolveSheetGeometry({
    viewportHeight: viewport.height,
    topClearance: headerClearance,
    safeBottom: viewport.safeBottom,
    collapsedHeight: presentationContract.geometry.sheet.collapsed,
  });
  const mapPadding = useMemo<MapPadding>(
    () => ({
      top: headerClearance,
      right: MAP_EDGE_PADDING,
      bottom:
        sheetGeometry[sheetSnap] + viewport.safeBottom + MAP_EDGE_PADDING,
      left: MAP_EDGE_PADDING,
    }),
    [headerClearance, sheetGeometry, sheetSnap, viewport.safeBottom],
  );
  const sheet = useItinerarySheet({
    snap: sheetSnap,
    geometry: sheetGeometry,
    onSnapChange: setSheetSnap,
    reducedMotion,
  });

  const lastFittedDayIntentRef = useRef(-1);
  const cameraIntent = dayCameraIntent + candidateInteraction.fitIntent;
  const pendingMapFocusRef = useRef<PendingMapFocus | null>(null);
  const renderedMapRef = useRef<RenderedMapState | null>(null);
  const ownerBindings = useOwnerBindings();

  const handlePresentationRendered = useCallback(
    (
      renderedAdapter: MapAdapter,
      renderedPresentation: MapPresentation,
    ): void => {
      const renderedDayId = selectedEffectiveDay.day.id;
      renderedMapRef.current = {
        adapter: renderedAdapter,
        dayId: renderedDayId,
        presentation: renderedPresentation,
      };
      if (lastFittedDayIntentRef.current !== cameraIntent) {
        lastFittedDayIntentRef.current = cameraIntent;
        const fitIds = locatablePresentationIds(renderedPresentation);
        if (fitIds.length > 0) renderedAdapter.fit(fitIds);
      }
      const pendingFocus = pendingMapFocusRef.current;
      if (pendingFocus?.dayId !== renderedDayId) return;
      pendingMapFocusRef.current = null;
      if (presentationHasTarget(renderedPresentation, pendingFocus.target)) {
        renderedAdapter.focus(pendingFocus.target);
      }
    },
    [cameraIntent, selectedEffectiveDay.day.id],
  );

  const markDisplayedDayIntent = useCallback((dayId: string): void => {
    pendingMapFocusRef.current = null;
    setDisplayedDayId(dayId);
    setDayCameraIntent((intent) => intent + 1);
  }, []);
  const synchronizeDisplayedDay = useCallback(
    (dayId: string): void => {
      if (dayId !== displayedDayId) markDisplayedDayIntent(dayId);
    },
    [displayedDayId, markDisplayedDayIntent],
  );
  const clearCandidateInteraction = useCallback((): void => {
    handleCandidateMapOverrideChange(null);
  }, [handleCandidateMapOverrideChange]);
  const focusMap = useCallback(
    (target: MapFocusTarget, targetDayId: string): void => {
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
    },
    [],
  );
  const selectNode = useCallback(
    (
      nodeId: string,
      options: { synchronizeDay?: boolean; restoreOwnerFocus?: boolean } = {},
    ): void => {
      if (!availableNodeIds.includes(nodeId)) return;
      ownerBindings.cancelPendingFocus();
      clearCandidateInteraction();
      setSelectedRouteId(null);
      setRouteSelectionSource(null);
      selection.selectManual(nodeId);
      const ownerDay = dayForNode(trip, nodeId);
      if (options.synchronizeDay === true && ownerDay !== undefined) {
        synchronizeDisplayedDay(ownerDay);
      }
      if (options.restoreOwnerFocus === true) {
        ownerBindings.focus("node", nodeId);
      }
      focusMap(
        { kind: "place", id: nodeMapOwnerId(nodeId) },
        ownerDay ?? selectedEffectiveDay.day.id,
      );
    },
    [
      availableNodeIds,
      clearCandidateInteraction,
      focusMap,
      ownerBindings,
      selectedEffectiveDay.day.id,
      selection,
      synchronizeDisplayedDay,
      trip,
    ],
  );
  const handleMapPlaceSelect = useCallback(
    (ownerId: string): void => {
      const owner = decodeMapPlaceOwnerId(ownerId);
      if (owner?.kind === "node") {
        selectNode(owner.id, {
          synchronizeDay: true,
          restoreOwnerFocus: true,
        });
        return;
      }
      if (owner?.kind !== "candidate") return;
      if (
        activeCandidateMapOverride?.group.options.some(
          ({ id }) => id === owner.id,
        )
      ) {
        selection.selectManual(activeCandidateMapOverride.group.parentNodeId);
        ownerBindings.focus("node", activeCandidateMapOverride.group.parentNodeId);
        setCandidateInteraction((current) => ({
          ...current,
          previewRequest: {
            groupId: activeCandidateMapOverride.group.id,
            sessionId: activeCandidateMapOverride.sessionId,
            optionId: owner.id,
            requestId: (current.previewRequest?.requestId ?? 0) + 1,
          },
        }));
        return;
      }
      const group = trip.candidateGroups.find((candidateGroup) =>
        candidateGroup.options.some((option) => option.id === owner.id),
      );
      if (group !== undefined) {
        selectNode(group.parentNodeId, {
          synchronizeDay: true,
          restoreOwnerFocus: true,
        });
      }
    },
    [activeCandidateMapOverride, ownerBindings, selectNode, selection, trip],
  );
  const routeIsDisplayed = useCallback(
    (routeId: string): boolean =>
      selectedDayRoutes.some(({ id }) => id === routeId),
    [selectedDayRoutes],
  );
  const selectRoute = useCallback(
    (routeId: string, source: "list" | "map"): void => {
      if (!routeIsDisplayed(routeId)) return;
      ownerBindings.cancelPendingFocus();
      clearCandidateInteraction();
      setSelectedRouteId(routeId);
      setRouteSelectionSource(source);
      if (source === "list") {
        focusMap(
          { kind: "route", id: routeId },
          selectedEffectiveDay.day.id,
        );
      } else {
        ownerBindings.focus("route", routeId);
      }
    },
    [
      clearCandidateInteraction,
      focusMap,
      ownerBindings,
      routeIsDisplayed,
      selectedEffectiveDay.day.id,
    ],
  );
  const handleMapRouteSelect = useCallback(
    (routeId: string): void => selectRoute(routeId, "map"),
    [selectRoute],
  );
  const mapLifecycle = useMapLifecycle({
    adapter,
    presentation: mapPresentation,
    padding: mapPadding,
    onPlaceSelect: handleMapPlaceSelect,
    onRouteSelect: handleMapRouteSelect,
    onPresentationRendered: handlePresentationRendered,
  });
  const userLocation = useUserLocation(mapLifecycle.readyAdapter);

  const returnToNow = useCallback((): void => {
    ownerBindings.cancelPendingFocus();
    clearCandidateInteraction();
    setSelectedRouteId(null);
    setRouteSelectionSource(null);
    selection.returnToNow();
    const liveDayId = dayForNode(trip, automaticNodeId);
    if (liveDayId !== undefined) synchronizeDisplayedDay(liveDayId);
    if (automaticNodeId !== null) {
      focusMap(
        { kind: "place", id: nodeMapOwnerId(automaticNodeId) },
        liveDayId ?? selectedEffectiveDay.day.id,
      );
    }
  }, [
    automaticNodeId,
    clearCandidateInteraction,
    focusMap,
    ownerBindings,
    selectedEffectiveDay.day.id,
    selection,
    synchronizeDisplayedDay,
    trip,
  ]);
  const returnToLodging = useCallback((): void => {
    const lodging = lodgingForDisplayedDay(
      effectiveTrip.days,
      selectedEffectiveDay.day.id,
    );
    if (lodging !== undefined) {
      selectNode(lodging.sourceNodeId, { synchronizeDay: true });
    }
  }, [effectiveTrip.days, selectNode, selectedEffectiveDay.day.id]);
  const selectDay = useCallback(
    (dayId: string): void => {
      const day = effectiveTrip.days.find(
        (candidate) => candidate.day.id === dayId,
      );
      if (day === undefined) return;
      ownerBindings.cancelPendingFocus();
      clearCandidateInteraction();
      setSelectedRouteId(null);
      setRouteSelectionSource(null);
      markDisplayedDayIntent(dayId);
      setSheetSnap("half");
      const firstNode = day.nodes[0];
      if (firstNode !== undefined) {
        selection.selectManual(firstNode.sourceNodeId);
      }
    },
    [
      clearCandidateInteraction,
      effectiveTrip.days,
      markDisplayedDayIntent,
      ownerBindings,
      selection,
    ],
  );
  const returnHome = useCallback((): void => {
    clearCandidateInteraction();
    onBackToHome?.();
  }, [clearCandidateInteraction, onBackToHome]);
  const locateCandidate = useCallback(
    (optionId: string): void => {
      const coordinates = selectedCandidateGroup?.options.find(
        ({ id }) => id === optionId,
      )?.place?.coordinates;
      if (
        coordinates !== undefined &&
        Number.isFinite(coordinates.lat) &&
        coordinates.lat >= -90 &&
        coordinates.lat <= 90 &&
        Number.isFinite(coordinates.lng) &&
        coordinates.lng >= -180 &&
        coordinates.lng <= 180
      ) {
        focusMap(
          { kind: "place", id: candidateMapOwnerId(optionId) },
          selectedEffectiveDay.day.id,
        );
      }
    },
    [focusMap, selectedCandidateGroup, selectedEffectiveDay.day.id],
  );

  const routeLoadStates = routeStates.states;
  const routes = useExperienceRoutes(
    selectedDayRoutes,
    routeLoadStates,
    activeSelectedRouteId,
    routeSelectionSource,
    navigationAdapter,
  );
  const shoppingNode =
    selectedEffectiveNode?.node.kind === "shopping"
      ? selectedEffectiveNode.node
      : undefined;
  const shopping = useMemo(
    () =>
      shoppingNode === undefined
        ? null
        : {
            node: shoppingNode,
            statuses: Object.fromEntries(
              shoppingNode.payload.items.map((item) => [
                item.id,
                resolvedShoppingStatus(
                  item.initialStatus,
                  item.id,
                  progress.shoppingStatuses,
                ),
              ]),
            ),
          },
    [progress.shoppingStatuses, shoppingNode],
  );
  const tasks = useMemo(
    () =>
      trip.tasks.filter(
        ({ scope, dayId }) =>
          scope === "day" && dayId === selectedEffectiveDay.day.id,
      ),
    [selectedEffectiveDay.day.id, trip.tasks],
  );

  const model = useMemo(
    () => ({
      trip,
      effectiveDay: selectedEffectiveDay,
      days: trip.days,
      clock: { instant: nowInstant, timezone: trip.timezone },
      live: {
        currentNodeId: liveState.currentId,
        nextNodeId: liveState.nextId,
      },
      selection: selection.selection,
      progress,
      persistence,
      routes,
      map: { presentation: mapPresentation, status: mapLifecycle.status },
      viewport,
      motion: reducedMotion ? ("reduced" as const) : ("full" as const),
      header: { expanded: headerExpanded },
      location: { status: userLocation.status },
      sheet: { snap: sheetSnap, geometry: sheetGeometry },
      candidate:
        selectedCandidateGroup === undefined ||
        selectedSourceNode === undefined ||
        candidateDecision === null
          ? null
          : {
              group: selectedCandidateGroup,
              sourceNode: selectedSourceNode,
              sequenceNumber: candidateSequenceNumber,
              ...(selectedEffectiveNode?.selectedCandidateId === undefined
                ? {}
                : {
                    committedOptionId:
                      selectedEffectiveNode.selectedCandidateId,
                  }),
              open: candidateDecision.open,
              sessionId: candidateDecision.sessionId,
              ...(candidateDecision.draftOptionId === undefined
                ? {}
                : { draftOptionId: candidateDecision.draftOptionId }),
            },
      shopping,
      tasks,
    }),
    [
      candidateDecision,
      candidateSequenceNumber,
      headerExpanded,
      liveState.currentId,
      liveState.nextId,
      mapLifecycle.status,
      mapPresentation,
      nowInstant,
      persistence,
      progress,
      reducedMotion,
      routes,
      selectedCandidateGroup,
      selectedEffectiveDay,
      selectedEffectiveNode,
      selectedSourceNode,
      sheetGeometry,
      sheetSnap,
      shopping,
      tasks,
      trip,
      userLocation.status,
      viewport,
      selection.selection,
    ],
  );
  const actions = useMemo(
    () => ({
      selectDay,
      selectNode: (nodeId: string) => selectNode(nodeId),
      selectRoute,
      returnToNow,
      returnToLodging,
      returnHome,
      retryRoute: (routeId: string) => {
        routeStates.retry(routeId);
      },
      retryMap: () => mapLifecycle.retry(),
      openCandidate: () => candidateDecision?.openComparison(),
      closeCandidate: () => candidateDecision?.closeComparison(),
      previewCandidate: (optionId: string) => {
        candidateDecision?.previewOption(optionId);
        locateCandidate(optionId);
      },
      confirmCandidate: () => candidateDecision?.confirmDraft(),
      setCompleted,
      setShoppingStatus,
      startLocation: () => userLocation.start(),
      recenterLocation: () => userLocation.recenter(),
      stopLocation: () => userLocation.stop(),
      setHeaderExpanded,
      setSheetSnap,
    }),
    [
      candidateDecision,
      locateCandidate,
      mapLifecycle,
      returnHome,
      returnToLodging,
      returnToNow,
      routeStates,
      selectDay,
      selectNode,
      selectRoute,
      setCompleted,
      setShoppingStatus,
      userLocation,
    ],
  );
  const bindings = useMemo<ExperienceBindings>(
    () => ({
      map: { ref: mapLifecycle.ref },
      sheet: {
        getSheetProps: sheet.getSheetProps,
        getHandleProps: sheet.getHandleProps,
      },
      owners: ownerBindings.bindings,
      candidate:
        candidateDecision === null
          ? null
          : {
              getTriggerProps: candidateDecision.getTriggerProps,
              registerOption: candidateDecision.registerOption,
            },
    }),
    [
      candidateDecision,
      mapLifecycle.ref,
      ownerBindings.bindings,
      sheet.getHandleProps,
      sheet.getSheetProps,
    ],
  );

  return useMemo(() => ({ model, actions, bindings }), [actions, bindings, model]);
}
