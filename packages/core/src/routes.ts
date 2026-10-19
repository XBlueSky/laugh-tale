import type { PlaceRef, RouteEdge, RouteMode, TripDay, TripNode } from "./model.js";
import type { EffectiveNode } from "./resolve-itinerary.js";
import { deriveNavigationTarget } from "./navigation-target.js";

export interface RoutePresentation {
  edge: RouteEdge;
  display: "hidden" | "compact" | "full";
  navigable: boolean;
}

export type RoutePresentationDay = TripDay & { routes: readonly RouteEdge[] };

function routeOwnerError(id: string): Error {
  return new Error(`Duplicate route owner ID: ${id}`);
}

export interface RouteOwnerOptions {
  /** Providers supported by the navigation adapter; no provider is implicit. */
  supportedNavigationProviders?: readonly string[];
  /**
   * How to handle duplicate route owner IDs. `validateTrip` already reports
   * duplicates as structured issues; `"throw"` turns them into a hard error
   * for development builds, while the default `"ignore"` keeps the first
   * owner and drops later duplicates so a live site never crashes.
   */
  onDuplicateRoute?: "throw" | "ignore";
}

export function deduplicateRouteOwners(
  routes: readonly RouteEdge[],
  options: RouteOwnerOptions = {},
): RouteEdge[] {
  const owners = new Set<string>();
  const unique: RouteEdge[] = [];

  for (const route of routes) {
    if (owners.has(route.id)) {
      if (options.onDuplicateRoute === "throw") {
        throw routeOwnerError(route.id);
      }
      continue;
    }
    owners.add(route.id);
    unique.push(route);
  }

  return unique;
}

function placeFingerprint(place: PlaceRef | undefined): string {
  if (place === undefined) {
    return "missing";
  }
  return JSON.stringify([
    place.name,
    place.identity.status,
    place.identity.status === "resolved" ? place.identity.coordinates?.lat ?? null : null,
    place.identity.status === "resolved" ? place.identity.coordinates?.lng ?? null : null,
    place.identity.status === "resolved" ? place.identity.providerReference?.provider ?? null : null,
    place.identity.status === "resolved" ? place.identity.providerReference?.id ?? null : null,
  ]);
}

function endpointPlaceChanged(sourceNode: TripNode, effectiveNode: EffectiveNode): boolean {
  return placeFingerprint(sourceNode.place) !== placeFingerprint(effectiveNode.node.place);
}

function validNavigation(navigation: RouteEdge["navigation"] | undefined): RouteEdge["navigation"] | undefined {
  return navigation !== undefined && navigation.origin.trim().length > 0 && navigation.destination.trim().length > 0
    ? navigation
    : undefined;
}

function freshEstimatedEdge(
  edge: Pick<RouteEdge, "id" | "dayId" | "fromNodeId" | "toNodeId" | "mode">,
  authoredNavigation?: RouteEdge["navigation"],
): RouteEdge {
  const navigation = validNavigation(authoredNavigation);
  return {
    id: edge.id,
    dayId: edge.dayId,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    mode: edge.mode,
    source: "recomposed",
    certainty: "unverified",
    ...(navigation === undefined ? {} : { navigation }),
  };
}

function aggregateMode(path: readonly RouteEdge[]): RouteMode {
  if (path.some(({ mode }) => mode === "unknown")) {
    return "unknown";
  }
  const substantiveModes: RouteMode[] = [];
  for (const { mode } of path) {
    if (mode !== "walking" && !substantiveModes.includes(mode)) {
      substantiveModes.push(mode);
    }
  }

  if (substantiveModes.length === 0) {
    return "walking";
  }
  if (substantiveModes.length === 1) {
    return substantiveModes[0] ?? "walking";
  }
  return "unknown";
}

function recomposeEdge(
  day: TripDay,
  routes: readonly RouteEdge[],
  origin: EffectiveNode,
  destination: EffectiveNode,
): RouteEdge | undefined {
  const sourceIndex = new Map(day.nodes.map((node, index) => [node.id, index]));
  const originIndex = sourceIndex.get(origin.sourceNodeId);
  const destinationIndex = sourceIndex.get(destination.sourceNodeId);

  if (
    originIndex === undefined ||
    destinationIndex === undefined ||
    destinationIndex <= originIndex + 1
  ) {
    return undefined;
  }

  const path: RouteEdge[] = [];
  for (let index = originIndex; index < destinationIndex; index += 1) {
    const fromNodeId = day.nodes[index]?.id;
    const toNodeId = day.nodes[index + 1]?.id;
    const edge = routes.find(
      (candidate) =>
        candidate.fromNodeId === fromNodeId && candidate.toNodeId === toNodeId,
    );
    if (edge === undefined) {
      return undefined;
    }
    path.push(edge);
  }

  const aggregate = aggregateMode(path);
  return freshEstimatedEdge(
    {
      id: `route:${origin.sourceNodeId}--${destination.sourceNodeId}`,
      dayId: day.id,
      fromNodeId: origin.sourceNodeId,
      toNodeId: destination.sourceNodeId,
      mode: aggregate,
    },
  );
}

export function resolveRouteEdges(
  day: TripDay,
  sourceRoutes: readonly RouteEdge[],
  effectiveNodes: readonly EffectiveNode[],
  options: RouteOwnerOptions = {},
): RouteEdge[] {
  const routes = deduplicateRouteOwners(
    sourceRoutes.filter((route) => route.dayId === day.id),
    options,
  );
  const output: RouteEdge[] = [];
  const sourceNodes = new Map(day.nodes.map((node) => [node.id, node]));

  for (let index = 0; index < effectiveNodes.length - 1; index += 1) {
    const origin = effectiveNodes[index];
    const destination = effectiveNodes[index + 1];
    if (origin === undefined || destination === undefined) {
      continue;
    }

    const direct = routes.filter(
      (route) =>
        route.fromNodeId === origin.sourceNodeId &&
        route.toNodeId === destination.sourceNodeId,
    );
    if (direct.length > 0) {
      const sourceOrigin = sourceNodes.get(origin.sourceNodeId);
      const sourceDestination = sourceNodes.get(destination.sourceNodeId);
      const placeChanged =
        sourceOrigin === undefined ||
        sourceDestination === undefined ||
        endpointPlaceChanged(sourceOrigin, origin) ||
        endpointPlaceChanged(sourceDestination, destination);

      output.push(
        ...direct.map((edge) =>
          placeChanged
            ? freshEstimatedEdge(edge, edge.mode === "unknown" ? edge.navigation : undefined)
            : { ...edge },
        ),
      );
      continue;
    }

    const recomposed = recomposeEdge(day, routes, origin, destination);
    if (recomposed !== undefined) {
      output.push(recomposed);
    }
  }

  return deduplicateRouteOwners(output, options);
}

function isNavigable(edge: RouteEdge, nodesById: ReadonlyMap<string, EffectiveNode>, supportedProviders: readonly string[]): boolean {
  if (
    edge.navigation !== undefined &&
    edge.navigation.origin.trim().length > 0 &&
    edge.navigation.destination.trim().length > 0
  ) {
    return true;
  }

  if (edge.mode === "unknown" || edge.mode === "flight") {
    return false;
  }

  const origin = nodesById.get(edge.fromNodeId);
  const destination = nodesById.get(edge.toNodeId);
  return (
    origin !== undefined &&
    destination !== undefined &&
    deriveNavigationTarget(origin.node.place, supportedProviders) !== null &&
    deriveNavigationTarget(destination.node.place, supportedProviders) !== null
  );
}

export function buildRoutePresentations(
  day: RoutePresentationDay,
  effectiveNodes: readonly EffectiveNode[],
  options: RouteOwnerOptions = {},
): RoutePresentation[] {
  const edges = resolveRouteEdges(day, day.routes, effectiveNodes, options);
  const nodesById = new Map(effectiveNodes.map((node) => [node.sourceNodeId, node]));

  return edges.map((edge) => ({
    edge,
    display:
      edge.mode === "walking" &&
      edge.durationMinutes !== undefined &&
      edge.durationMinutes <= 5
        ? "compact"
        : "full",
    navigable: isNavigable(edge, nodesById, options.supportedNavigationProviders ?? []),
  }));
}
