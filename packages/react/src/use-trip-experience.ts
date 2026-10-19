import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  createExperienceChoreographyState,
  formatCandidateOrdinal,
  reduceExperienceChoreography,
  type ExperienceChoreographyEvent,
  type Trip,
  type TripNavigationStore,
} from "@laugh-tale-island/core";
import type { ProgressStore } from "@laugh-tale-island/core/browser";
import type {
  CandidateDecisionModel,
  ExperienceBindings,
  ExperienceModel,
  ProviderBootstrapState,
  ProviderChannelStateModel,
  TripActions,
  TripDiagnosticSink,
  TripPresentationV2,
  TripRuntimeAdapters,
} from "./presentation-contract.js";
import { projectExperienceModel } from "./project-experience-model.js";
import { bookingFact } from "./project-home-model.js";
import { useTripProgress, type TripProgressController } from "./use-trip-progress.js";
import { useTripNavigation } from "./use-trip-navigation.js";
import { useMinuteClock } from "./use-minute-clock.js";
import { useTripSelection } from "./use-trip-selection.js";
import { useOptionalCandidateDecision } from "./use-candidate-decision.js";
import { useUserLocation } from "./use-user-location.js";
import {
  useRuntimeProviders,
  reportProviderFailure,
  sanitizeProviderFailure,
} from "./use-runtime-providers.js";
import { useExperienceBindings } from "./use-experience-bindings.js";
import {
  createActionFacade,
  createProgressDelegates,
  useCommittedTripActions,
  type TripActionSlot,
} from "./trip-actions.js";
import { ControllerStateFailure } from "./normalize-controller-error.js";

export interface UseTripExperienceInput {
  trip: Trip;
  navigationStore: TripNavigationStore;
  progressStore: ProgressStore;
  presentation: Pick<
    TripPresentationV2,
    "mapVisualProfile" | "createMarkerContent" | "createUserLocationContent"
  >;
  runtime?: TripRuntimeAdapters;
  providerBootstrap?: ProviderBootstrapState;
  clock?: () => string;
  onDiagnostic?: TripDiagnosticSink;
}
export interface TripExperienceController {
  model: ExperienceModel;
  actions: TripActions;
  bindings: ExperienceBindings;
}
const noOverride = () => {};
type NavigationEvent = ExperienceChoreographyEvent | { type: "sequence"; events: readonly ExperienceChoreographyEvent[] };
function reduceNavigationEvents(state: Parameters<typeof reduceExperienceChoreography>[0], event: NavigationEvent) {
  return event.type === "sequence" ? event.events.reduce(reduceExperienceChoreography, state) : reduceExperienceChoreography(state, event);
}

function useExperienceNavigation(
  input: UseTripExperienceInput,
  progress: ReturnType<typeof useTripProgress>,
  instant: string,
) {
  const { trip } = input;
  const { state: navigation, store: navigationStore } = useTripNavigation(
    input.navigationStore,
  );
  const [choreography, dispatch] = useReducer(
    reduceNavigationEvents,
    undefined,
    () => {
      const seed = createExperienceChoreographyState({
        navigation: {
          surface: "experience",
          dayId: navigation.dayId,
          ownerId: null,
        },
        automaticOwnerId: null,
      });
      const initial = projectExperienceModel({
        trip,
        progress: progress.progress,
        instant,
        choreography: seed,
        persistenceStatus: progress.persistenceStatus,
      });
      let state = createExperienceChoreographyState({
        navigation: {
          surface: "experience",
          dayId: initial.model.day.id,
          ownerId: null,
        },
        automaticOwnerId: initial.targets.automaticId,
      });
      const owner = navigation.ownerId;
      if (
        owner !== null &&
        initial.model.capabilities.selectNodeIds.includes(owner)
      )
        state = reduceExperienceChoreography(state, {
          type: "select-node",
          dayId: initial.model.day.id,
          nodeId: owner,
          source: "list",
        });
      else if (
        owner !== null &&
        initial.model.capabilities.selectRouteIds.includes(owner)
      )
        state = reduceExperienceChoreography(state, {
          type: "select-route",
          dayId: initial.model.day.id,
          routeId: owner,
          source: "list",
        });
      return state;
    },
  );
  const base = useMemo(
    () =>
      projectExperienceModel({
        trip,
        progress: progress.progress,
        instant,
        choreography,
        persistenceStatus: progress.persistenceStatus,
        ...(input.runtime?.navigation === undefined
          ? {}
          : { navigation: input.runtime.navigation }),
      }),
    [
      trip,
      progress.progress,
      instant,
      choreography,
      progress.persistenceStatus,
      input.runtime?.navigation,
    ],
  );
  const dayId = base.model.day.id;
  const selection = useTripSelection(base.targets.automaticId, [
    ...base.model.capabilities.selectNodeIds,
    ...base.model.capabilities.selectRouteIds,
  ]);
  const lastNavigation = useRef(navigation);
  useEffect(() => {
    const last = lastNavigation.current;
    if (
      last.surface === navigation.surface &&
      last.dayId === navigation.dayId &&
      last.ownerId === navigation.ownerId
    )
      return;
    lastNavigation.current = navigation;
    if (navigation.surface === "home") {
      dispatch({ type: "open-home" });
      return;
    }
    const next = projectExperienceModel({
      trip,
      progress: progress.progress,
      instant,
      persistenceStatus: progress.persistenceStatus,
      choreography: createExperienceChoreographyState({
        navigation,
        automaticOwnerId: null,
      }),
    });
    const nextDay = next.model.day.id;
    if (nextDay !== dayId || navigation.ownerId === null) {
      selection.returnToNow();
      dispatch({
        type: "select-day",
        dayId: nextDay,
        automaticOwnerId: next.targets.automaticId,
      });
    }
    if (
      navigation.ownerId !== null &&
      next.model.capabilities.selectNodeIds.includes(navigation.ownerId)
    )
      dispatch({
        type: "select-node",
        dayId: nextDay,
        nodeId: navigation.ownerId,
        source: "list",
      });
    else if (
      navigation.ownerId !== null &&
      next.model.capabilities.selectRouteIds.includes(navigation.ownerId)
    )
      dispatch({
        type: "select-route",
        dayId: nextDay,
        routeId: navigation.ownerId,
        source: "list",
      });
  }, [
    navigation,
    trip,
    progress.progress,
    progress.persistenceStatus,
    instant,
    dayId,
    selection.returnToNow,
  ]);
  useEffect(() => {
    dispatch({
      type: "automatic-owner-changed",
      dayId,
      ownerId: base.targets.automaticId,
    });
  }, [dayId, base.targets.automaticId]);
  const writeEvent = (...events: ExperienceChoreographyEvent[]) => {
    const event: NavigationEvent = { type: "sequence", events };
    const next = reduceNavigationEvents(choreography, event);
    if (next === choreography) return;
    dispatch(event);
    lastNavigation.current = next.navigation;
    navigationStore.write(next.navigation);
  };
  return { choreography, dispatch, base, dayId, selection, writeEvent };
}

function useExperienceCandidates(
  trip: Trip,
  base: ReturnType<typeof projectExperienceModel>,
  progress: ReturnType<typeof useTripProgress>,
) {
  const [groupId, setGroupId] = useState<string | null>(null);
  const group = trip.candidateGroups.find(
    (candidate) =>
      candidate.id === groupId &&
      base.model.capabilities.selectNodeIds.includes(candidate.parentNodeId),
  );
  const committed =
    group === undefined
      ? undefined
      : progress.progress.selectedCandidateIds[group.id];
  const decision = useOptionalCandidateDecision(
    group === undefined
      ? null
      : {
          group,
          ...(committed === undefined ? {} : { committedOptionId: committed }),
          onMapOverrideChange: noOverride,
          onConfirm: (optionId) => progress.selectCandidate(group.id, optionId),
        },
  );
  const openedGroup = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (group === undefined) {
      openedGroup.current = null;
      return;
    }
    if (openedGroup.current !== group.id) {
      openedGroup.current = group.id;
      decision?.openComparison();
    }
  }, [group, decision]);
  const candidates: CandidateDecisionModel[] = trip.candidateGroups
    .filter((candidate) =>
      base.model.timeline.some(
        (entry) =>
          entry.kind === "node" &&
          entry.capabilities.candidateGroupId === candidate.id,
      ),
    )
    .map((candidate) => {
      const parent = base.model.timeline.find(
        (entry) =>
          entry.kind === "node" && entry.ownerId === candidate.parentNodeId,
      );
      const active = candidate.id === group?.id ? decision : null;
      const selected =
        progress.progress.selectedCandidateIds[candidate.id] ??
        candidate.defaultOptionId;
      const validSelected = candidate.options.some(
        (option) => option.id === selected,
      )
        ? selected
        : undefined;
      return {
        groupId: candidate.id,
        parentOwnerId: candidate.parentNodeId,
        mode: candidate.mode,
        open: active?.open ?? false,
        sessionId: active?.sessionId ?? null,
        ...(validSelected === undefined
          ? {}
          : { committedOptionId: validSelected }),
        ...(candidate.mode !== "single" || active?.draftOptionId === undefined
          ? {}
          : { draftOptionId: active.draftOptionId }),
        options: candidate.options.map((option, index) => ({
          id: option.id,
          title: option.title,
          ordinal: formatCandidateOrdinal(
            parent?.kind === "node" ? (parent.displayIndex ?? 0) : 0,
            index,
          ),
          ...(option.place === undefined
            ? {}
            : {
                place: {
                  label: option.place.name,
                  certainty: option.place.certainty,
                  resolution:
                    option.place.identity.status === "resolved"
                      ? { status: "resolved" as const }
                      : {
                          status: "unresolved" as const,
                          reason: option.place.identity.reason,
                        },
                },
              }),
          ...(option.booking === undefined
            ? {}
            : { booking: bookingFact(option.booking) }),
          selected: option.id === validSelected,
          draft: candidate.mode === "single" && option.id === active?.draftOptionId,
        })),
        capabilities: {
          previewOptionIds: active?.open && candidate.mode === "single"
            ? candidate.options.map((option) => option.id)
            : [],
          cancel: active?.open ?? false,
          confirm:
            candidate.mode === "single" &&
            active?.open === true &&
            candidate.options.some(
              (option) => option.id === active.draftOptionId,
            ),
          reopen: active?.open !== true,
        },
      };
    });
  return { group, decision, candidates, setGroupId };
}

export function useTripExperience(
  input: UseTripExperienceInput,
): TripExperienceController {
  const progress = useTripProgress(input.trip, input.progressStore);
  return useTripExperienceWithProgress(input, progress);
}

/** Package-private composition; the caller owns the progress lifetime. */
export function useTripExperienceWithProgress(
  input: UseTripExperienceInput,
  progress: TripProgressController,
): TripExperienceController {
  const { trip } = input;
  const instant = useMinuteClock(input.clock);
  const { choreography, dispatch, base, dayId, selection, writeEvent } =
    useExperienceNavigation(input, progress, instant);
  const { group, decision, candidates, setGroupId } = useExperienceCandidates(
    trip,
    base,
    progress,
  );
  const location = useUserLocation(() =>
    dispatch({ type: "recenter-user", dayId }),
  );
  const providers = useRuntimeProviders({
    dayId,
    routeRequests: base.routeRequests,
    placeRequests: base.placeRequests,
    enabled: progress.hydrated,
    ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
    ...(input.providerBootstrap === undefined
      ? {}
      : { providerBootstrap: input.providerBootstrap }),
    ...(input.onDiagnostic === undefined
      ? {}
      : { onDiagnostic: input.onDiagnostic }),
  });
  const projection = projectExperienceModel({
    trip,
    progress: progress.progress,
    instant,
    choreography,
    persistenceStatus: progress.persistenceStatus,
    viewingOwnerId:
      selection.selection.source === "manual"
        ? selection.selection.nodeId
        : null,
    ...(input.runtime?.navigation === undefined
      ? {}
      : { navigation: input.runtime.navigation }),
    routeStates: providers.routeStates,
    placeStates: providers.placeStates,
    retryRouteIds: providers.retryRouteIds,
    retryPlaceOwnerIds: providers.retryPlaceOwnerIds,
    candidates,
    ...(group !== undefined && decision?.open
      ? { activeCandidateGroup: group }
      : {}),
    location: { status: location.status, hasFix: location.location !== null },
  });
  const [actionSlot] = useState<TripActionSlot>(() => ({ current: {} }));
  const closeFocusRequest = useRef<{
    trip: Trip;
    dayId: string;
    groupId: string;
    ownerId: string | null;
    navigation: ReturnType<TripNavigationStore["read"]>;
  } | null>(null);
  const returnRevealRequest = useRef<{ trip: Trip; dayId: string; ownerId: string } | null>(null);
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null);
  const [actions] = useState(() =>
    createActionFacade(
      actionSlot,
      { current: {} },
      { current: (cause) => setFailure({ cause }) },
    ),
  );
  const leaveCandidateForOwner = (id: string, kind: "node" | "route" = "node") => {
    if (kind === "route" || closeFocusRequest.current?.ownerId !== id) closeFocusRequest.current = null;
    // Clearing the owner resets its optional decision without invoking close's focus restoration.
    if (group !== undefined && (kind === "route" || group.parentNodeId !== id)) setGroupId(null);
  };
  const selectNode = (id: string, source: "list" | "map") => {
    if (
      !progress.hydrated ||
      !projection.model.capabilities.selectNodeIds.includes(id)
    )
      return;
    if (source === "list") selection.selectManual(id);
    leaveCandidateForOwner(id);
    writeEvent({ type: "select-node", dayId, nodeId: id, source });
  };
  const selectRoute = (id: string, source: "list" | "map") => {
    if (
      !progress.hydrated ||
      !projection.model.capabilities.selectRouteIds.includes(id) ||
      (source !== "list" && source !== "map")
    )
      return;
    if (source === "list") selection.selectManual(id);
    leaveCandidateForOwner(id, "route");
    writeEvent({ type: "select-route", dayId, routeId: id, source });
  };
  // Factory identity is observed here; invocation below retains the receiver.
  const createMap = useMemo(
    () => input.runtime?.createMap?.bind(input.runtime),
    // eslint-disable-next-line @typescript-eslint/unbound-method
    [input.runtime?.createMap],
  );
  const binding = useExperienceBindings({
    ownershipKey: JSON.stringify([trip.id, dayId]),
    dayId,
    sheetSnap: choreography.sheetSnap,
    cameraRequest: choreography.cameraRequest,
    presentation: projection.model.map.presentation,
    candidateGroups: trip.candidateGroups,
    visualProfile: input.presentation.mapVisualProfile,
    createMarkerContent: input.presentation.createMarkerContent,
    createUserLocationContent: input.presentation.createUserLocationContent,
    ...(createMap === undefined || !progress.hydrated
      ? {}
      : { createAdapter: createMap }),
    userLocation: location.location,
    development: false,
    onSnapChange: (snap) => dispatch({ type: "set-sheet-snap", snap }),
    onMarkerSelect: (id) => {
      try {
        const candidate = candidates.find(
          (entry) =>
            entry.open && entry.options.some((option) => option.id === id),
        );
        if (candidate !== undefined) {
          if (candidate.capabilities.previewOptionIds.includes(id)) decision?.previewOption(id);
          focus.revealAndFocus({ slot: "dialog", ownerId: id });
        }
        else selectNode(id, "map");
      } catch (cause) {
        actionSlot.current = {};
        setFailure({ cause });
      }
    },
    onRouteSelect: (id) => actions.selectRoute(id, "map"),
    onFailure: (result, cause) =>
      reportProviderFailure(
        input.onDiagnostic,
        "map",
        "runtime",
        result,
        undefined,
        cause,
      ),
  });
  const { focus, geometry, lifecycle, sheet } = binding;
  const mapProvider: ProviderChannelStateModel = providers.bootstrap.pending.map
    ? { status: "idle", retryable: false }
    : providers.bootstrap.published.map?.status === "loading"
      ? { status: "loading", retryable: false }
    : providers.bootstrap.published.map !== undefined
      ? sanitizeProviderFailure(providers.bootstrap.published.map)
      : input.runtime?.createMap === undefined
        ? {
            status: "unavailable",
            reason: "missing-configuration",
            retryable: false,
          }
        : lifecycle.status.kind === "unavailable"
          ? {
              status: "unavailable",
              reason: lifecycle.status.reason,
              retryable: lifecycle.status.retryable,
            }
          : binding.mapUnavailable !== null
            ? binding.mapUnavailable
            : {
                status:
                  lifecycle.status.kind === "mounting"
                    ? "loading"
                    : lifecycle.status.kind,
                retryable: false,
              };
  const model: ExperienceModel = {
    ...projection.model,
    providers: { map: mapProvider, ...providers.providers },
    map: {
      ...projection.model.map,
      provider: mapProvider,
      cameraIntent:
        binding.cameraIntent === null
          ? null
          : structuredClone(binding.cameraIntent),
      layout:
        binding.layout.layout === null
          ? null
          : structuredClone(binding.layout.layout),
    },
    sheet: {
      snap: choreography.sheetSnap,
      geometry:
        binding.geometry === null ? null : structuredClone(binding.geometry),
      interactive: binding.geometry !== null,
    },
    motion: binding.layout.reducedMotion ? "reduced" : "full",
    capabilities: {
      ...projection.model.capabilities,
      sheetSnaps:
        binding.geometry === null
          ? []
          : (["collapsed", "half", "expanded"] as const),
      retryMap:
        (providers.bootstrap.published.map?.status === "unavailable" &&
          providers.bootstrap.published.map.retryable && input.runtime?.retryMapBootstrap !== undefined) ||
        (lifecycle.status.kind === "unavailable" &&
          lifecycle.status.retryable) ||
        binding.mapUnavailable?.retryable === true,
    },
  };
  useEffect(() => {
    focus.cancelPendingFocus();
  }, [dayId, model.owners.selectedId, base.targets.automaticId]);
  const selectedNodeId = model.owners.selectedId !== null && model.capabilities.selectNodeIds.includes(model.owners.selectedId)
    ? model.owners.selectedId
    : null;
  useLayoutEffect(() => {
    const request = returnRevealRequest.current;
    if (request === null) return;
    returnRevealRequest.current = null;
    if (
      request.trip === trip
      && request.dayId === dayId
      && request.ownerId === selectedNodeId
      && choreography.selectionSource === "automatic"
      && projection.targets.currentDestination?.dayId === dayId
      && projection.targets.currentDestination.ownerId === request.ownerId
    ) focus.reveal({ slot: "node", ownerId: request.ownerId });
  });
  useEffect(() => {
    if (selectedNodeId !== null && choreography.selectionSource !== "map") {
      focus.reveal({ slot: "node", ownerId: selectedNodeId });
    }
  }, [dayId, selectedNodeId, choreography.selectionSource, focus.reveal]);
  useEffect(() => {
    const ownerId = choreography.focusReturnOwnerId;
    if (ownerId === null) return;
    const slot = model.capabilities.selectRouteIds.includes(ownerId)
      ? "route"
      : "node";
    focus.focus({ slot, ownerId });
    dispatch({ type: "focus-returned", ownerId });
  }, [
    choreography.focusReturnOwnerId,
    focus,
    model.capabilities.selectRouteIds,
  ]);
  useEffect(() => {
    const request = closeFocusRequest.current;
    if (request === null) return;
    // Disclosure controls may be capability-gated out of the open comparison.
    // Consume only after its closed commit has mounted refs, never in the action.
    closeFocusRequest.current = null;
    const navigation = input.navigationStore.read();
    if (
      request.trip !== trip || request.dayId !== dayId
      || request.ownerId !== model.owners.selectedId
      || request.navigation.surface !== navigation.surface
      || request.navigation.dayId !== navigation.dayId
      || request.navigation.ownerId !== navigation.ownerId
      || navigation.surface !== "experience"
      || !candidates.some(candidate => candidate.groupId === request.groupId && !candidate.open)
    ) return;
    binding.bindings.focus.restoreTrigger(request.groupId, model.itinerary.focusFallback ?? undefined);
  });
  const queueCloseFocus = (groupId: string) => {
    focus.cancelPendingFocus();
    closeFocusRequest.current = { trip, dayId, groupId, ownerId: model.owners.selectedId, navigation: input.navigationStore.read() };
  };
  useCommittedTripActions(actionSlot, {
    openHome: () => { closeFocusRequest.current = null; writeEvent({ type: "open-home" }); },
    openExperience: (id = dayId) => {
      if (model.capabilities.selectDayIds.includes(id))
        writeEvent({ type: "select-day", dayId: id, automaticOwnerId: null });
    },
    selectDay: (id) => {
      if (model.capabilities.selectDayIds.includes(id)) {
        closeFocusRequest.current = null;
        selection.returnToNow();
        setGroupId(null);
        writeEvent({ type: "select-day", dayId: id, automaticOwnerId: null });
      }
    },
    selectNode: (id) => selectNode(id, "list"),
    selectRoute,
    selectCandidate: (id) => {
      const candidate = candidates.find(
        (entry) =>
          entry.options.some((option) => option.id === id) && entry.open,
      );
      if (candidate !== undefined) decision?.previewOption(id);
    },
    setSheetSnap: (snap) => {
      if (model.capabilities.sheetSnaps.includes(snap)) sheet.setSnap(snap);
    },
    stepSheet: (direction) => {
      if (
        geometry !== null &&
        (direction === "expand" || direction === "collapse")
      )
        sheet.step(direction === "expand" ? 1 : -1);
    },
    setHeaderExpanded: (expanded) => {
      if (typeof expanded === "boolean")
        dispatch({ type: "set-header-expanded", expanded });
    },
    settleHeaderTransition: (transitionId) =>
      dispatch({ type: "settle-header-transition", transitionId }),
    restoreAutomaticSelection: () => {
      if (projection.targets.automaticId !== null) {
        leaveCandidateForOwner(projection.targets.automaticId);
        selection.returnToNow();
        writeEvent({
          type: "restore-automatic",
          dayId,
          ownerId: projection.targets.automaticId,
        });
      }
    },
    returnToCurrent: () => {
      const destination = projection.targets.currentDestination;
      if (destination !== null) {
        returnRevealRequest.current = destination.dayId === dayId
          && destination.ownerId === selectedNodeId
          && choreography.selectionSource === "automatic"
          ? { trip, dayId, ownerId: destination.ownerId }
          : null;
        leaveCandidateForOwner(destination.ownerId);
        selection.returnToNow();
        const returnEvent: ExperienceChoreographyEvent = {
          type: "return-to-current",
          dayId: destination.dayId,
          ownerId: destination.ownerId,
        };
        if (destination.dayId === dayId) writeEvent(returnEvent);
        else writeEvent({ type: "select-day", dayId: destination.dayId, automaticOwnerId: null }, returnEvent);
      }
    },
    returnToLodging: () => {
      if (projection.targets.lodgingId !== null) {
        leaveCandidateForOwner(projection.targets.lodgingId);
        writeEvent({
          type: "return-to-lodging",
          dayId,
          ownerId: projection.targets.lodgingId,
        });
      }
    },
    restoreFullDay: () => {
      if (model.capabilities.restoreFullDay)
        dispatch({ type: "restore-full-day", dayId });
    },
    retryProvider: (kind, id) => {
      if (kind === "map") {
        if (!model.capabilities.retryMap) return;
        if (providers.bootstrap.published.map?.status === "unavailable") {
          input.runtime?.retryMapBootstrap?.();
          return;
        }
        binding.clearMapUnavailable();
        lifecycle.retry();
      }
      else if (
        id !== undefined &&
        (kind === "route"
          ? model.capabilities.retryRouteIds
          : model.capabilities.retryPlaceOwnerIds
        ).includes(id)
      )
        providers.retry(kind, id);
    },
    openNavigation: (id) => {
      if (model.capabilities.navigationOwnerIds.includes(id)) {
        const request = projection.navigationRequests.get(id);
        if (request !== undefined) input.runtime?.navigation?.open(request);
      }
    },
    beginLocation: () => {
      if (model.capabilities.location.begin) location.start();
    },
    recenterLocation: () => {
      if (model.capabilities.location.recenter) location.recenter();
    },
    stopLocation: location.stop,
    previewCandidate: (id, optionId) => {
      if (
        candidates
          .find((candidate) => candidate.groupId === id)
          ?.capabilities.previewOptionIds.includes(optionId)
      )
        decision?.previewOption(optionId);
    },
    cancelCandidate: (id) => {
      if (group?.id === id && decision?.open) {
        decision.closeComparison();
        dispatch({ type: "restore-full-day", dayId });
        queueCloseFocus(id);
      }
    },
    confirmCandidate: (id) => {
      if (
        candidates.find((candidate) => candidate.groupId === id)?.capabilities
          .confirm
      ) {
        decision?.confirmDraft();
        dispatch({ type: "restore-full-day", dayId });
        queueCloseFocus(id);
      }
    },
    reopenCandidate: (id) => {
      if (closeFocusRequest.current?.groupId === id) closeFocusRequest.current = null;
      if (
        candidates.find((candidate) => candidate.groupId === id)?.capabilities
          .reopen
      ) {
        focus.cancelPendingFocus();
        if (group?.id === id) decision?.openComparison();
        else setGroupId(id);
        dispatch({ type: "fit-candidate", dayId, groupId: id });
      }
    },
    ...createProgressDelegates(progress, model.capabilities.progress),
  });
  if (failure !== null) throw new ControllerStateFailure(failure.cause);
  return { model, actions, bindings: binding.bindings };
}
