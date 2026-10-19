import {
  buildDaySemanticProjection,
  checklistCompletionKey,
  deriveNavigationTarget,
  evaluateOpeningHours,
  nodeCompletionKey,
  resolveEffectiveItinerary,
  resolveSchedule,
  selectEffectiveDay,
  selectLiveState,
  selectAutomaticOwnerId,
  type CandidateGroup,
  type ExperienceChoreographyState,
  type PlaceRef,
  type PlaceRuntimeState,
  type RouteRequestV2,
  type PlaceRequestV2,
  type RouteRuntimeState,
  type SemanticNodeProjection,
  type Trip,
  type TripNode,
  type TripProgressV1,
} from "@laugh-tale-island/core";
import type {
  NavigationAdapterV2,
  NavigationRequestV2,
} from "@laugh-tale-island/core/browser";
import type {
  CandidateDecisionModel,
  ExperienceModel,
  LocationModel,
  PlaceStateModel,
  ProviderStateModel,
  RouteStateModel,
  TimelineEntryModel,
  TimelineNodeFactsModel,
  TimelineNodeModel,
} from "./presentation-contract.js";
import { bookingFact, projectHomeModel, timingFact } from "./project-home-model.js";
import type { ProgressPersistenceStatus } from "./use-trip-progress.js";

export interface ExperienceProjectionInput {
  trip: Trip;
  progress: TripProgressV1;
  instant: string;
  choreography: ExperienceChoreographyState;
  persistenceStatus: ProgressPersistenceStatus;
  viewingOwnerId?: string | null;
  navigation?: NavigationAdapterV2;
  providers?: ProviderStateModel;
  routeStates?: Readonly<Record<string, RouteRuntimeState>>;
  placeStates?: Readonly<Record<string, PlaceRuntimeState>>;
  retryRouteIds?: readonly string[];
  retryPlaceOwnerIds?: readonly string[];
  candidates?: readonly CandidateDecisionModel[];
  activeCandidateGroup?: CandidateGroup;
  location?: LocationModel;
  sheet?: ExperienceModel["sheet"];
  mapLayout?: ExperienceModel["map"]["layout"];
  cameraIntent?: ExperienceModel["map"]["cameraIntent"];
  reducedMotion?: boolean;
}

const absent = {
  status: "unavailable",
  reason: "missing-configuration",
  retryable: false,
} as const;

function placeFact(place: PlaceRef) {
  return {
    label: place.name,
    certainty: place.certainty,
    resolution:
      place.identity.status === "resolved"
        ? { status: "resolved" as const }
        : { status: "unresolved" as const, reason: place.identity.reason },
  };
}

function nodeFacts(
  node: TripNode,
  progress: TripProgressV1,
): TimelineNodeFactsModel {
  const checklist = (items: readonly { id: string; title: string }[]) =>
    items.map((item) => ({
      id: checklistCompletionKey(item.id),
      title: item.title,
      completed: progress.completedIds.includes(
        checklistCompletionKey(item.id),
      ),
    }));
  switch (node.kind) {
    case "transport":
      return {
        kind: node.kind,
        mode: node.payload.mode,
        ...(node.payload.plan === undefined ? {} : { plan: node.payload.plan }),
      };
    case "transfer":
      return {
        kind: node.kind,
        mode: node.payload.mode,
        ...(node.payload.terminal === undefined
          ? {}
          : { terminal: node.payload.terminal }),
      };
    case "lodging":
      return {
        kind: node.kind,
        role: node.payload.role,
        checklist: checklist(node.payload.checklist ?? []),
      };
    case "dining":
      return {
        kind: node.kind,
        ...(node.payload.cuisine === undefined
          ? {}
          : { cuisine: node.payload.cuisine }),
        ...(node.payload.candidateGroupId === undefined
          ? {}
          : { candidateGroupId: node.payload.candidateGroupId }),
      };
    case "shopping":
      return {
        kind: node.kind,
        items: node.payload.items.map((item) => ({
          id: item.id,
          title: item.title,
          ...(item.note === undefined ? {} : { note: item.note }),
          ...(item.priority === undefined ? {} : { priority: item.priority }),
          status:
            (Object.hasOwn(progress.shoppingStatuses, item.id)
              ? progress.shoppingStatuses[item.id]
              : undefined) ??
            item.initialStatus ??
            "pending",
        })),
      };
    case "sightseeing":
      return {
        kind: node.kind,
        ...(node.payload.area === undefined ? {} : { area: node.payload.area }),
      };
    case "experience":
      return {
        kind: node.kind,
        ...(node.payload.durationMinutes === undefined
          ? {}
          : { durationMinutes: node.payload.durationMinutes }),
      };
    case "logistics":
      return { kind: node.kind, checklist: checklist(node.payload.checklist) };
    case "custom":
      return {
        kind: node.kind,
        customKind: node.payload.customKind,
        data: Object.fromEntries(
          Object.entries(node.payload.data).filter(([, value]) =>
            ["string", "number", "boolean"].includes(typeof value),
          ),
        ),
      };
  }
}

function ownState<T>(states: Readonly<Record<string, T>> | undefined, id: string): T | undefined {
  return states !== undefined && Object.hasOwn(states, id) ? states[id] : undefined;
}

function routeState(state: RouteRuntimeState | undefined): RouteStateModel {
  if (state === undefined) return { status: "idle" };
  if (state.status === "unavailable")
    return {
      status: state.status,
      reason: state.reason,
      retryable: state.retryable,
    };
  if (state.status !== "ready") return { status: state.status };
  return {
    status: "ready",
    durationMinutes: state.durationMinutes,
    ...(state.distanceMeters === undefined
      ? {}
      : { distanceMeters: state.distanceMeters }),
    steps: [...state.steps],
    transitLines: (state.transit?.lines ?? []).map((line) => ({
      ...(line.name === undefined ? {} : { name: line.name }),
      ...(line.shortName === undefined ? {} : { shortName: line.shortName }),
    })),
  };
}

function placeState(
  state: PlaceRuntimeState | undefined,
  instant: string,
  timezone: string,
): PlaceStateModel {
  if (state === undefined) return { status: "idle" };
  if (state.status === "unavailable")
    return {
      status: state.status,
      reason: state.reason,
      retryable: state.retryable,
    };
  if (state.status !== "ready") return { status: state.status };
  const { facts } = state;
  const hours = facts.openingHours;
  const openingHours =
    hours === undefined
      ? undefined
      : hours.kind === "always-open"
        ? { kind: "always-open" as const }
        : {
            kind: "weekly" as const,
            completeness: hours.completeness,
            periods: hours.periods.map((period) => ({
              open: {
                day: period.open.day,
                hour: period.open.hour,
                minute: period.open.minute,
              },
              ...(period.close === undefined
                ? {}
                : {
                    close: {
                      day: period.close.day,
                      hour: period.close.hour,
                      minute: period.close.minute,
                    },
                  }),
            })),
          };
  return {
    status: "ready",
    ...(facts.formattedAddress === undefined
      ? {}
      : { formattedAddress: facts.formattedAddress }),
    ...(facts.businessStatus === undefined
      ? {}
      : { businessStatus: facts.businessStatus }),
    ...(openingHours === undefined ? {} : { openingHours }),
    opening: evaluateOpeningHours(openingHours, instant, timezone, facts.businessStatus),
  };
}

export function projectExperienceModel(input: ExperienceProjectionInput) {
  const { trip, progress, instant, choreography } = input;
  const authoredDay = selectEffectiveDay(
    trip,
    instant,
    choreography.navigation.dayId,
  );
  if (authoredDay === null) throw new Error("missing-effective-day");
  const effective = resolveEffectiveItinerary(trip, progress);
  const tripCurrentId = selectLiveState(trip, instant, {
    ignoredNodeIds: new Set(effective.days.flatMap((day) => day.nodes.filter((node) => node.skipped).map((node) => node.sourceNodeId))),
  }).currentId;
  const currentDay = tripCurrentId === null ? undefined : effective.days.find((day) =>
    day.nodes.some((node) => !node.skipped && node.sourceNodeId === tripCurrentId),
  );
  const currentDestination = currentDay === undefined || tripCurrentId === null ? null : { dayId: currentDay.day.id, ownerId: tripCurrentId };
  const day = effective.days.find((entry) => entry.day.id === authoredDay.id)!;
  const dayRoutes = effective.routes.filter(
    (edge) => edge.dayId === authoredDay.id,
  );
  const allowed = new Set(
    day.nodes
      .filter((entry) => !entry.skipped)
      .map((entry) => entry.sourceNodeId),
  );
  const routeIds = new Set(dayRoutes.map((edge) => edge.id));
  const validOwner = (id: string | null | undefined) =>
    id != null && (allowed.has(id) || routeIds.has(id)) ? id : null;
  const live = selectLiveState(
    { timezone: trip.timezone, days: [authoredDay] },
    instant,
    {
      ignoredNodeIds: new Set(
        day.nodes
          .filter((entry) => entry.skipped)
          .map((entry) => entry.sourceNodeId),
      ),
    },
  );
  const selectedId =
    choreography.navigation.dayId === authoredDay.id
      ? validOwner(choreography.navigation.ownerId)
      : null;
  const viewingId = validOwner(input.viewingOwnerId);
  const activeCandidate = input.candidates?.find((candidate) =>
    candidate.open && candidate.groupId === input.activeCandidateGroup?.id &&
    candidate.parentOwnerId === input.activeCandidateGroup.parentNodeId &&
    allowed.has(candidate.parentOwnerId),
  );
  const semantic = buildDaySemanticProjection({
    day,
    routes: dayRoutes,
    candidateGroups:
      input.activeCandidateGroup === undefined
        ? []
        : [input.activeCandidateGroup],
    currentNodeId: live.currentId,
    nextNodeId: live.nextId,
    selectedOwnerId: selectedId,
    viewingOwnerId: viewingId,
    supportedNavigationProviders:
      input.navigation?.supportedPlaceProviders ?? [],
  });
  const home = projectHomeModel({
    trip,
    progress,
    persistenceStatus: input.persistenceStatus,
    instant,
    manualDayId: authoredDay.id,
  });
  const schedule = new Map(resolveSchedule({ timezone: trip.timezone, days: [{ ...authoredDay, nodes: day.nodes.map(entry => entry.node) }] }).map(entry => [entry.nodeId, entry]));
  const nodeDto = (entry: SemanticNodeProjection): TimelineNodeModel => {
    const { node } = entry;
    const custom = node.kind === "custom" ? node.payload.capabilities : null;
    const complete = home.capabilities.progress.completionIds.includes(
      nodeCompletionKey(node.id),
    );
    const candidate = trip.candidateGroups.find(
      (group) =>
        group.parentNodeId === node.id &&
        (custom === null || custom.choice === true),
    );
    return {
      kind: "node",
      ownerId: entry.ownerId,
      nodeId: entry.nodeId,
      title: entry.label,
      sourceKind: entry.sourceKind,
      role: entry.role,
      markerMode: entry.markerMode,
      ...(entry.displayIndex === undefined
        ? {}
        : { displayIndex: entry.displayIndex }),
      ...(entry.ordinal === undefined ? {} : { ordinal: entry.ordinal }),
      timing: {
        ...timingFact(node.timing),
        date: authoredDay.date,
        ...(node.timing.end !== undefined && schedule.has(node.id) ? { endDate: schedule.get(node.id)!.endsAt.toPlainDate().toString() } : {}),
      },
      ...(node.booking !== undefined && (custom === null || custom.booking === true)
        ? { booking: bookingFact(node.booking) }
        : {}),
      states: [...entry.states],
      incomingRouteIds: [...entry.incomingRouteIds],
      details: [...(node.details ?? [])],
      facts: nodeFacts(node, progress),
      ...(complete
        ? {
            completion: {
              id: nodeCompletionKey(node.id),
              title: node.title,
              completed: progress.completedIds.includes(
                nodeCompletionKey(node.id),
              ),
            },
          }
        : {}),
      capabilities: {
        select: allowed.has(node.id),
        skip: node.optionality === "optional",
        complete,
        place:
          node.place !== undefined &&
          (custom === null || custom.place === true),
        booking:
          node.booking !== undefined &&
          (custom === null || custom.booking === true),
        shopping: node.kind === "shopping",
        ...(candidate === undefined ? {} : { candidateGroupId: candidate.id }),
      },
    };
  };
  const timeline: TimelineEntryModel[] = semantic.entries.map((entry) => {
    if (entry.kind === "node") return nodeDto(entry);
    if (entry.kind === "route")
      return {
        kind: "route",
        role: "connector",
        ownerId: entry.ownerId,
        routeId: entry.routeId,
        states: [...entry.states],
      };
    const children = entry.children.map(nodeDto);
    return {
      kind: "logistics-group",
      role: "logistics-group",
      ownerId: entry.ownerId,
      titleKey: "timeline.logisticsGroup",
      childOwnerIds: children.map((child) => child.ownerId),
      incomingRouteIds: [...entry.incomingRouteIds],
      children,
      progress: {
        completed: children.filter((child) => child.completion?.completed)
          .length,
        total: children.filter((child) => child.completion !== undefined)
          .length,
      },
    };
  });
  const nodes = timeline.flatMap((entry) =>
    entry.kind === "node"
      ? [entry]
      : entry.kind === "logistics-group"
        ? [...entry.children]
        : [],
  );
  const requests = new Map<string, NavigationRequestV2>();
  const routeRequests: RouteRequestV2[] = [];
  const placeRequests: PlaceRequestV2[] = [];
  const places = day.nodes.flatMap(({ node, skipped }) => {
    if (
      skipped ||
      node.place === undefined ||
      (node.kind === "custom" && node.payload.capabilities.place !== true)
    )
      return [];
    const target = deriveNavigationTarget(
      node.place,
      input.navigation?.supportedPlaceProviders ?? [],
    );
    if (target !== null)
      requests.set(node.id, { kind: "place", destination: target });
    if (
      node.place.identity.status === "resolved" &&
      node.place.identity.providerReference !== undefined
    )
      placeRequests.push({
        ownerId: node.id,
        providerReference: { ...node.place.identity.providerReference },
        locale: trip.locale,
        timeZone: trip.timezone,
      });
    return [
      {
        ownerId: node.id,
        place: placeFact(node.place),
        runtime: placeState(
          ownState(input.placeStates, node.id),
          instant,
          trip.timezone,
        ),
        navigationAvailable: target !== null && input.navigation !== undefined,
      },
    ];
  });
  const routes = dayRoutes.map((edge) => {
    const from = day.nodes.find(
      (entry) => entry.sourceNodeId === edge.fromNodeId,
    )?.node;
    const to = day.nodes.find(
      (entry) => entry.sourceNodeId === edge.toNodeId,
    )?.node;
    const mode =
      edge.mode === "walking" ||
      edge.mode === "driving" ||
      edge.mode === "transit"
        ? edge.mode
        : null;
    const origin = deriveNavigationTarget(
      from?.place,
      input.navigation?.supportedPlaceProviders ?? [],
    );
    const destination = deriveNavigationTarget(
      to?.place,
      input.navigation?.supportedPlaceProviders ?? [],
    );
    if (edge.navigation !== undefined) {
      if (edge.navigation.origin.trim() && edge.navigation.destination.trim())
        requests.set(edge.id, {
          kind: "authored-external",
          origin: edge.navigation.origin,
          destination: edge.navigation.destination,
          ...(mode === null ? {} : { travelMode: mode }),
        });
    } else if (mode !== null && origin !== null && destination !== null)
      requests.set(edge.id, {
        kind: "route",
        origin,
        destination,
        travelMode: mode,
      });
    if (
      mode !== null &&
      from?.place?.identity.status === "resolved" &&
      to?.place?.identity.status === "resolved"
    )
      routeRequests.push({
        edge: structuredClone(edge),
        origin: {
          ownerId: from.id,
          label: from.title,
          identity: structuredClone(from.place.identity),
        },
        destination: {
          ownerId: to.id,
          label: to.title,
          identity: structuredClone(to.place.identity),
        },
      });
    return {
      routeId: edge.id,
      dayId: edge.dayId,
      fromOwnerId: edge.fromNodeId,
      toOwnerId: edge.toNodeId,
      mode: edge.mode,
      source: edge.source,
      certainty: edge.certainty,
      authored: {
        ...(edge.durationMinutes === undefined
          ? {}
          : { durationMinutes: edge.durationMinutes }),
        ...(edge.distanceMeters === undefined
          ? {}
          : { distanceMeters: edge.distanceMeters }),
        ...(edge.summary === undefined ? {} : { summary: edge.summary }),
      },
      runtime: routeState(ownState(input.routeStates, edge.id)),
      selected: selectedId === edge.id,
      selectionSource:
        selectedId === edge.id ? choreography.selectionSource : null,
      navigationAvailable:
        requests.has(edge.id) && input.navigation !== undefined,
    };
  });
  const fallback = (id: string | null) =>
    id === null
      ? null
      : nodes.some((node) => node.ownerId === id && node.capabilities.select)
        ? { slot: "node" as const, ownerId: id }
        : routes.some((route) => route.routeId === id)
          ? { slot: "route" as const, ownerId: id }
          : null;
  const useful = timeline.flatMap((entry) =>
    entry.kind === "node"
      ? entry.capabilities.select
        ? [entry.ownerId]
        : []
      : entry.kind === "logistics-group"
        ? entry.children
            .filter((child) => child.capabilities.select)
            .map((child) => child.ownerId)
        : routes.some((route) => route.routeId === entry.routeId)
          ? [entry.ownerId]
          : [],
  );
  const collapsedOwnerId =
    [selectedId, live.currentId, live.nextId, ...useful].find(
      (id) => fallback(id) !== null,
    ) ?? null;
  const lodgingId =
    day.nodes.find(
      ({ node, skipped }) =>
        !skipped &&
        node.kind === "lodging" &&
        (node.payload.role === "base" || node.payload.role === "return"),
    )?.sourceNodeId ?? null;
  const automaticId = selectAutomaticOwnerId(
    { timezone: trip.timezone, days: [authoredDay] },
    instant,
    new Set(
      day.nodes
        .filter(
          (entry) =>
            entry.skipped ||
            (entry.completed &&
              home.capabilities.progress.completionIds.includes(
                nodeCompletionKey(entry.sourceNodeId),
              )),
        )
        .map((entry) => entry.sourceNodeId),
    ),
  );
  const providers = input.providers ?? {
    map: absent,
    routes: absent,
    places: absent,
  };
  const location = input.location ?? { status: "idle", hasFix: false };
  const mapRoutes = routes.flatMap((route) => {
    const state = ownState(input.routeStates, route.routeId);
    return state?.status === "ready" && state.geometry !== undefined
      ? [
          {
            edgeId: route.routeId,
            mode: route.mode,
            source: route.source,
            certainty: route.certainty,
            selected: route.selected,
            geometry: state.geometry.map(({ lat, lng }) => ({ lat, lng })),
          },
        ]
      : [];
  });
  const { tripId, ...identity } = home.identity;
  const model: ExperienceModel = {
    trip: { id: tripId, ...identity },
    days: home.days.map(({ id, date, title, ordinal }) => ({ id, date, title, ordinal })),
    day: {
      id: authoredDay.id,
      date: authoredDay.date,
      title: authoredDay.title,
      ...(authoredDay.summary === undefined
        ? {}
        : { summary: authoredDay.summary }),
      ...(authoredDay.routeLabel === undefined
        ? {}
        : { routeLabel: authoredDay.routeLabel }),
      ordinal: trip.days.findIndex((entry) => entry.id === authoredDay.id) + 1,
      orderedDayIds: trip.days.map((entry) => entry.id),
    },
    clock: {
      instant,
      timezone: trip.timezone,
      ...(trip.clockPlaceLabel === undefined
        ? {}
        : { clockPlaceLabel: trip.clockPlaceLabel }),
    },
    owners: {
      currentId: live.currentId,
      nextId: live.nextId,
      viewingId,
      selectedId,
    },
    itinerary: {
      primaryCount: nodes.filter((node) => node.role === "primary").length,
      collapsedOwnerId,
      focusFallback: fallback(selectedId) ?? fallback(collapsedOwnerId),
    },
    timeline,
    routes,
    places,
    map: {
      presentation: {
        markers: semantic.mapOwners
          .filter(
            (owner) =>
              owner.ownerId !== input.activeCandidateGroup?.parentNodeId &&
              (allowed.has(owner.ownerId) ||
                semantic.candidates.some(
                  (candidate) => candidate.ownerId === owner.ownerId,
                )),
          )
          .map((owner) => {
            const option = activeCandidate?.options.find((option) =>
              option.id === owner.ownerId &&
              input.activeCandidateGroup?.options.some((authored) => authored.id === option.id) &&
              semantic.candidates.some((candidate) => candidate.ownerId === option.id),
            );
            return {
              ...owner,
              states: option === undefined ? [...owner.states] : [
                ...owner.states.filter((state) => state !== "selected"),
                ...(option.draft ? ["selected" as const] : []),
              ],
              coordinates: { ...owner.coordinates },
            };
          }),
        routes: mapRoutes,
      },
      provider: providers.map,
      cameraIntent:
        input.cameraIntent == null ? null : structuredClone(input.cameraIntent),
      layout: input.mapLayout == null ? null : structuredClone(input.mapLayout),
    },
    sheet:
      input.sheet === undefined
        ? { snap: choreography.sheetSnap, geometry: null, interactive: false }
        : structuredClone(input.sheet),
    header: {
      expanded: choreography.headerExpanded,
      revision: choreography.headerRevision,
      transition:
        choreography.headerTransition === null
          ? null
          : { ...choreography.headerTransition },
    },
    progress: home.progress,
    persistence: home.persistence,
    providers,
    location,
    candidates: input.candidates ?? [],
    reservations: home.reservations.filter((reservation) =>
      allowed.has(reservation.ownerId),
    ),
    tasks: home.tasks.filter(
      (task) => task.scope === "pretrip" || task.dayId === authoredDay.id,
    ),
    motion: input.reducedMotion ? "reduced" : "full",
    capabilities: {
      selectDayIds: trip.days.map((entry) => entry.id),
      selectNodeIds: nodes
        .filter((node) => node.capabilities.select)
        .map((node) => node.ownerId),
      selectRouteIds: routes.map((route) => route.routeId),
      restoreAutomaticSelection: automaticId !== null,
      returnToCurrent: currentDestination !== null,
      returnToLodging: lodgingId !== null,
      restoreFullDay: day.nodes.some((entry) => !entry.skipped),
      retryMap:
        providers.map.status === "unavailable" && providers.map.retryable,
      retryRouteIds: routes
        .filter(
          (route) =>
            route.runtime.status === "unavailable" &&
            route.runtime.retryable &&
            input.retryRouteIds?.includes(route.routeId),
        )
        .map((route) => route.routeId),
      retryPlaceOwnerIds: places
        .filter(
          (place) =>
            place.runtime.status === "unavailable" &&
            place.runtime.retryable &&
            input.retryPlaceOwnerIds?.includes(place.ownerId),
        )
        .map((place) => place.ownerId),
      navigationOwnerIds:
        input.navigation === undefined ? [] : [...requests.keys()],
      location: {
        begin: location.status !== "active" && location.status !== "requesting",
        recenter: location.hasFix,
        stop: location.status === "active" || location.status === "requesting",
      },
      sheetSnaps: input.sheet?.interactive
        ? ["collapsed", "half", "expanded"]
        : [],
      progress: home.capabilities.progress,
    },
  };
  return {
    model,
    targets: { currentId: currentDestination?.ownerId ?? null, currentDestination, automaticId, lodgingId },
    navigationRequests: requests,
    routeRequests,
    placeRequests,
    effectiveDay: day,
  };
}
