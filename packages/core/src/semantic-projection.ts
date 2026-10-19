import type {
  CandidateGroup,
  CandidateOption,
  Coordinates,
  MarkerMode,
  RouteEdge,
  TripNode,
  TimingCertainty,
} from "./model.js";
import { deriveNavigationTarget, type NavigationTargetV2 } from "./navigation-target.js";
import type { EffectiveDay } from "./resolve-itinerary.js";
import type { RoutePresentation } from "./routes.js";
import type { SemanticOwnerState } from "./semantic-state.js";

export type NodeTimelineRole = "primary" | "base" | "journey" | "task";

export interface SemanticNodeProjection {
  kind: "node";
  ownerId: string;
  nodeId: string;
  label: string;
  sourceKind: TripNode["kind"];
  role: NodeTimelineRole;
  markerMode: MarkerMode;
  displayIndex?: number;
  ordinal?: string;
  timing: TimingCertainty;
  states: readonly SemanticOwnerState[];
  incomingRouteIds: readonly string[];
  navigationTarget: NavigationTargetV2 | null;
  node: TripNode;
}

export interface SemanticRouteProjection {
  kind: "route";
  ownerId: string;
  routeId: string;
  role: "connector";
  states: readonly SemanticOwnerState[];
  route: RoutePresentation;
}

export interface SemanticLogisticsGroupProjection {
  kind: "logistics-group";
  ownerId: string;
  role: "logistics-group";
  childOwnerIds: readonly string[];
  incomingRouteIds: readonly string[];
  children: readonly SemanticNodeProjection[];
}

export interface SemanticCandidateProjection {
  kind: "candidate";
  ownerId: string;
  optionId: string;
  parentOwnerId: string;
  label: string;
  sourceKind: TripNode["kind"];
  role: "primary";
  markerMode: "numbered";
  ordinal: string;
  timing: TimingCertainty;
  states: readonly SemanticOwnerState[];
  navigationTarget: NavigationTargetV2 | null;
  option: CandidateOption;
}

export interface SemanticMapOwnerProjection {
  ownerId: string;
  label: string;
  sourceKind: TripNode["kind"];
  markerMode: "numbered" | "base";
  displayIndex?: number;
  ordinal?: string;
  timing: TimingCertainty;
  states: readonly SemanticOwnerState[];
  coordinates: Coordinates;
}

export type SemanticTimelineEntry =
  | SemanticNodeProjection
  | SemanticRouteProjection
  | SemanticLogisticsGroupProjection;

export interface DaySemanticProjection {
  entries: readonly SemanticTimelineEntry[];
  candidates: readonly SemanticCandidateProjection[];
  mapOwners: readonly SemanticMapOwnerProjection[];
}

export interface DaySemanticProjectionInput {
  day: EffectiveDay;
  routes: readonly RouteEdge[];
  candidateGroups: readonly CandidateGroup[];
  currentNodeId: string | null;
  nextNodeId: string | null;
  viewingOwnerId: string | null;
  selectedOwnerId: string | null;
  supportedNavigationProviders: readonly string[];
}

const STATE_ORDER: readonly SemanticOwnerState[] = [
  "current", "next", "viewing", "selected", "completed", "skipped", "candidate", "unresolved",
];

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validCoordinates(value: unknown): value is Coordinates {
  if (typeof value !== "object" || value === null) return false;
  const { lat, lng } = value as { lat?: unknown; lng?: unknown };
  return Number.isFinite(lat) && (lat as number) >= -90 && (lat as number) <= 90 &&
    Number.isFinite(lng) && (lng as number) >= -180 && (lng as number) <= 180;
}

function coordinatesFor(node: { place?: TripNode["place"] }): Coordinates | undefined {
  const identity = node.place?.identity;
  return identity?.status === "resolved" && validCoordinates(identity.coordinates)
    ? { lat: identity.coordinates.lat, lng: identity.coordinates.lng }
    : undefined;
}

function isUnresolved(node: { place?: TripNode["place"] }): boolean {
  return node.place?.identity.status === "unresolved";
}

function ownerStates(
  ownerId: string,
  facts: {
    current?: boolean; next?: boolean; viewing?: boolean; selected?: boolean; completed?: boolean;
    skipped?: boolean; candidate?: boolean; unresolved?: boolean;
  },
): readonly SemanticOwnerState[] {
  const active: Readonly<Record<SemanticOwnerState, boolean>> = {
    current: facts.current === true,
    next: facts.next === true,
    viewing: facts.viewing === true,
    selected: facts.selected === true,
    completed: facts.completed === true,
    skipped: facts.skipped === true,
    candidate: facts.candidate === true,
    unresolved: facts.unresolved === true,
  };
  void ownerId;
  return STATE_ORDER.filter((state) => active[state]);
}

export function timelineRoleForNode(node: TripNode): NodeTimelineRole {
  switch (node.kind) {
    case "dining":
    case "shopping":
    case "sightseeing":
    case "experience":
      return "primary";
    case "lodging":
      return "base";
    case "transport":
    case "transfer":
      return "journey";
    case "logistics":
      return "task";
    case "custom": {
      switch (node.payload.presentationRole) {
        case "primary":
        case "journey":
        case "task":
          return node.payload.presentationRole;
      }
    }
  }
}

function markerMode(role: NodeTimelineRole): MarkerMode {
  return role === "primary" ? "numbered" : role === "base" ? "base" : "none";
}

function routePresentation(
  route: RouteEdge,
  nodesByOwner: ReadonlyMap<string, TripNode>,
  supportedProviders: readonly string[],
): RoutePresentation {
  const navigation = route.navigation;
  const hasAuthoredNavigation =
    navigation !== undefined && navigation.origin.trim().length > 0 && navigation.destination.trim().length > 0;
  const endpointIsNavigable = (node: TripNode | undefined): boolean =>
    deriveNavigationTarget(node?.place, supportedProviders) !== null;
  return {
    edge: route,
    display: route.mode === "walking" && route.durationMinutes !== undefined && route.durationMinutes <= 5
      ? "compact"
      : "full",
    navigable: hasAuthoredNavigation ||
      (route.mode !== "flight" && route.mode !== "unknown" && endpointIsNavigable(nodesByOwner.get(route.fromNodeId)) && endpointIsNavigable(nodesByOwner.get(route.toNodeId))),
  };
}

function optionSuffix(zeroBasedOptionIndex: number): string | undefined {
  if (!Number.isInteger(zeroBasedOptionIndex) || zeroBasedOptionIndex < 0) return undefined;
  let index = zeroBasedOptionIndex + 1;
  let suffix = "";
  while (index > 0) {
    index -= 1;
    suffix = String.fromCharCode(97 + (index % 26)) + suffix;
    index = Math.floor(index / 26);
  }
  return suffix;
}

export function formatCandidateOrdinal(parentDisplayIndex: number, zeroBasedOptionIndex: number): string {
  const suffix = optionSuffix(zeroBasedOptionIndex);
  return Number.isInteger(parentDisplayIndex) && parentDisplayIndex > 0 && suffix !== undefined
    ? `${parentDisplayIndex}${suffix}`
    : "";
}

function projectMapOwner(
  projection: SemanticNodeProjection | SemanticCandidateProjection,
  coordinates: Coordinates | undefined,
): SemanticMapOwnerProjection | undefined {
  if (coordinates === undefined || (projection.markerMode !== "numbered" && projection.markerMode !== "base")) return undefined;
  return {
    ownerId: projection.ownerId,
    label: projection.label,
    sourceKind: projection.sourceKind,
    markerMode: projection.markerMode,
    ...("displayIndex" in projection && projection.displayIndex !== undefined ? { displayIndex: projection.displayIndex } : {}),
    ...("ordinal" in projection && projection.ordinal !== undefined ? { ordinal: projection.ordinal } : {}),
    timing: projection.timing,
    states: projection.states,
    coordinates,
  };
}

export function buildDaySemanticProjection(input: DaySemanticProjectionInput): DaySemanticProjection {
  const dayRoutes = input.routes.filter((route) => route.dayId === input.day.day.id && nonBlank(route.id));
  const hasConnectingEdge = (fromNodeId: string, toNodeId: string): boolean =>
    dayRoutes.some((route) =>
      (route.fromNodeId === fromNodeId && route.toNodeId === toNodeId) ||
      (route.fromNodeId === toNodeId && route.toNodeId === fromNodeId),
    );
  const routesByOrigin = new Map<string, RouteEdge[]>();
  const incomingRoutes = new Map<string, string[]>();
  for (const route of dayRoutes) {
    const origin = routesByOrigin.get(route.fromNodeId) ?? [];
    origin.push(route);
    routesByOrigin.set(route.fromNodeId, origin);
    const incoming = incomingRoutes.get(route.toNodeId) ?? [];
    incoming.push(route.id);
    incomingRoutes.set(route.toNodeId, incoming);
  }

  const nodes: Array<SemanticNodeProjection | undefined> = [];
  const nodesByOwner = new Map(input.day.nodes.map(({ sourceNodeId, node }) => [sourceNodeId, node]));
  const primaryByOwner = new Map<string, SemanticNodeProjection>();
  const mapOwners: SemanticMapOwnerProjection[] = [];
  let primaryCount = 0;
  for (const effective of input.day.nodes) {
    const { node, sourceNodeId } = effective;
    if (!nonBlank(sourceNodeId) || !nonBlank(node.id) || node.id !== sourceNodeId) {
      nodes.push(undefined);
      continue;
    }
    const role = timelineRoleForNode(node);
    if (role === undefined) {
      nodes.push(undefined);
      continue;
    }
    const displayIndex = role === "primary" ? ++primaryCount : undefined;
    const projection: SemanticNodeProjection = {
      kind: "node",
      ownerId: sourceNodeId,
      nodeId: sourceNodeId,
      label: node.title,
      sourceKind: node.kind,
      role,
      markerMode: markerMode(role),
      ...(displayIndex === undefined ? {} : { displayIndex, ordinal: String(displayIndex) }),
      timing: node.timing.certainty,
      states: ownerStates(sourceNodeId, {
        current: input.currentNodeId === sourceNodeId,
        next: input.nextNodeId === sourceNodeId,
        viewing: input.viewingOwnerId === sourceNodeId,
        selected: input.selectedOwnerId === sourceNodeId,
        completed: effective.completed,
        skipped: effective.skipped,
        unresolved: isUnresolved(node),
      }),
      incomingRouteIds: incomingRoutes.get(sourceNodeId) ?? [],
      navigationTarget: deriveNavigationTarget(node.place, input.supportedNavigationProviders),
      node,
    };
    nodes.push(projection);
    if (role === "primary") primaryByOwner.set(sourceNodeId, projection);
    const mapOwner = projectMapOwner(projection, coordinatesFor(node));
    if (mapOwner !== undefined) mapOwners.push(mapOwner);
  }

  if (mapOwners.length === 0) {
    const fallback = nodes.find((entry) =>
      entry?.role === "journey" &&
      !(entry.node.kind === "transfer" && entry.node.payload.mode === "flight") &&
      coordinatesFor(entry.node) !== undefined,
    );
    if (fallback !== undefined) {
      fallback.markerMode = "base";
      const mapOwner = projectMapOwner(fallback, coordinatesFor(fallback.node));
      if (mapOwner !== undefined) mapOwners.push(mapOwner);
    }
  }

  const candidates: SemanticCandidateProjection[] = [];
  for (const group of input.candidateGroups) {
    const parent = primaryByOwner.get(group.parentNodeId);
    if (parent === undefined || !Array.isArray(group.options)) continue;
    group.options.forEach((option, index) => {
      if (!nonBlank(option.id) || !nonBlank(option.title)) return;
      const ordinal = formatCandidateOrdinal(parent.displayIndex!, index);
      if (ordinal.length === 0) return;
      const projection: SemanticCandidateProjection = {
        kind: "candidate",
        ownerId: option.id,
        optionId: option.id,
        parentOwnerId: parent.ownerId,
        label: option.title,
        sourceKind: parent.sourceKind,
        role: "primary",
        markerMode: "numbered",
        ordinal,
        timing: parent.timing,
        states: ownerStates(option.id, {
          viewing: input.viewingOwnerId === option.id,
          selected: input.selectedOwnerId === option.id,
          candidate: true,
          unresolved: isUnresolved(option),
        }),
        navigationTarget: deriveNavigationTarget(option.place, input.supportedNavigationProviders),
        option,
      };
      candidates.push(projection);
      const mapOwner = projectMapOwner(projection, coordinatesFor(option));
      if (mapOwner !== undefined) mapOwners.push(mapOwner);
    });
  }

  const entries: SemanticTimelineEntry[] = [];
  for (let index = 0; index < nodes.length; ) {
    const current = nodes[index];
    if (current === undefined) {
      index += 1;
      continue;
    }
    if (current.role === "task" && current.sourceKind === "logistics") {
      let end = index;
      while (end + 1 < nodes.length) {
        const previous = nodes[end];
        const candidate = nodes[end + 1];
        if (
          previous === undefined || candidate === undefined ||
          candidate.role !== "task" || candidate.sourceKind !== "logistics" ||
          hasConnectingEdge(previous.ownerId, candidate.ownerId)
        ) break;
        end += 1;
      }
      if (end > index) {
        const children = nodes.slice(index, end + 1).filter((entry): entry is SemanticNodeProjection => entry !== undefined);
        const childOwnerIds = children.map(({ ownerId }) => ownerId);
        entries.push({
          kind: "logistics-group",
          ownerId: `logistics-group:${JSON.stringify(childOwnerIds)}`,
          role: "logistics-group",
          childOwnerIds,
          incomingRouteIds: children[0]?.incomingRouteIds ?? [],
          children,
        });
        entries.push(...children.flatMap(({ ownerId }) =>
          (routesByOrigin.get(ownerId) ?? []).map((route) => ({
            kind: "route" as const, ownerId: route.id, routeId: route.id, role: "connector" as const,
            states: ownerStates(route.id, { viewing: input.viewingOwnerId === route.id, selected: input.selectedOwnerId === route.id }),
            route: routePresentation(route, nodesByOwner, input.supportedNavigationProviders),
          })),
        ));
        index = end + 1;
        continue;
      }
    }
    entries.push(current);
    entries.push(...(routesByOrigin.get(current.ownerId) ?? []).map((route) => ({
      kind: "route" as const, ownerId: route.id, routeId: route.id, role: "connector" as const,
      states: ownerStates(route.id, { viewing: input.viewingOwnerId === route.id, selected: input.selectedOwnerId === route.id }),
      route: routePresentation(route, nodesByOwner, input.supportedNavigationProviders),
    })));
    index += 1;
  }
  return { entries, candidates, mapOwners };
}
