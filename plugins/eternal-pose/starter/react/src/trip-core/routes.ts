import type { PlaceRef, RouteEdge, RouteMode, TripDay, TripNode } from "./model";
import type { EffectiveNode } from "./resolve-itinerary";

export interface RoutePresentation {
  edge: RouteEdge;
  display: "hidden" | "compact" | "full";
  navigable: boolean;
}

export type RoutePresentationDay = TripDay & { routes: readonly RouteEdge[] };

function routeOwnerError(id: string): Error {
  return new Error(`Duplicate route owner ID: ${id}`);
}

export function deduplicateRouteOwners(routes: readonly RouteEdge[]): RouteEdge[] {
  const owners = new Set<string>();
  const unique: RouteEdge[] = [];

  for (const route of routes) {
    if (owners.has(route.id)) {
      if (import.meta.env.DEV) {
        throw routeOwnerError(route.id);
      }
      continue;
    }
    owners.add(route.id);
    unique.push(route);
  }

  return unique;
}

function navigationEndpoint(node: EffectiveNode): string | undefined {
  const name = node.node.place?.name;
  return name !== undefined && name.trim().length > 0 ? name : undefined;
}

function placeFingerprint(place: PlaceRef | undefined): string {
  if (place === undefined) {
    return "missing";
  }
  return JSON.stringify([
    place.name,
    place.coordinates?.lat ?? null,
    place.coordinates?.lng ?? null,
    place.provider?.name ?? null,
    place.provider?.placeId ?? null,
  ]);
}

function endpointPlaceChanged(sourceNode: TripNode, effectiveNode: EffectiveNode): boolean {
  return placeFingerprint(sourceNode.place) !== placeFingerprint(effectiveNode.node.place);
}

function endpointNavigation(
  origin: EffectiveNode,
  destination: EffectiveNode,
): RouteEdge["navigation"] | undefined {
  const navigationOrigin = navigationEndpoint(origin);
  const navigationDestination = navigationEndpoint(destination);
  return navigationOrigin !== undefined && navigationDestination !== undefined
    ? { origin: navigationOrigin, destination: navigationDestination }
    : undefined;
}

function freshEstimatedEdge(
  edge: Pick<RouteEdge, "id" | "dayId" | "fromNodeId" | "toNodeId" | "mode">,
  origin: EffectiveNode,
  destination: EffectiveNode,
  options: { summary?: string; includeNavigation: boolean },
): RouteEdge {
  const navigation = options.includeNavigation
    ? endpointNavigation(origin, destination)
    : undefined;
  return {
    id: edge.id,
    dayId: edge.dayId,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    mode: edge.mode,
    source: "recomposed",
    certainty: "unverified",
    ...(options.summary === undefined ? {} : { summary: options.summary }),
    ...(navigation === undefined ? {} : { navigation }),
  };
}

interface AggregateMode {
  mode: RouteMode;
  mixedSummary?: string;
}

function aggregateMode(path: readonly RouteEdge[]): AggregateMode {
  const substantiveModes: RouteMode[] = [];
  for (const { mode } of path) {
    if (mode !== "walking" && !substantiveModes.includes(mode)) {
      substantiveModes.push(mode);
    }
  }

  if (substantiveModes.length === 0) {
    return { mode: "walking" };
  }
  if (substantiveModes.length === 1) {
    return { mode: substantiveModes[0] ?? "walking" };
  }

  // The first substantive leg is the deterministic primary presentation mode.
  return {
    mode: substantiveModes[0] ?? "walking",
    mixedSummary: `Mixed modes: ${substantiveModes.join(" → ")}`,
  };
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
      mode: aggregate.mode,
    },
    origin,
    destination,
    {
      summary: aggregate.mixedSummary,
      includeNavigation: aggregate.mixedSummary === undefined && aggregate.mode !== "flight",
    },
  );
}

export function resolveRouteEdges(
  day: TripDay,
  sourceRoutes: readonly RouteEdge[],
  effectiveNodes: readonly EffectiveNode[],
): RouteEdge[] {
  const routes = deduplicateRouteOwners(sourceRoutes.filter((route) => route.dayId === day.id));
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
            ? freshEstimatedEdge(edge, origin, destination, {
                includeNavigation: edge.mode !== "flight",
              })
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

  return deduplicateRouteOwners(output);
}

function isNavigable(edge: RouteEdge, nodesById: ReadonlyMap<string, EffectiveNode>): boolean {
  if (edge.mode === "flight") {
    return false;
  }
  if (edge.source === "recomposed" && edge.summary?.startsWith("Mixed modes: ") === true) {
    return false;
  }
  if (
    edge.navigation !== undefined &&
    edge.navigation.origin.trim().length > 0 &&
    edge.navigation.destination.trim().length > 0
  ) {
    return true;
  }

  const origin = nodesById.get(edge.fromNodeId);
  const destination = nodesById.get(edge.toNodeId);
  return (
    origin !== undefined &&
    destination !== undefined &&
    navigationEndpoint(origin) !== undefined &&
    navigationEndpoint(destination) !== undefined
  );
}

export function buildRoutePresentations(
  day: RoutePresentationDay,
  effectiveNodes: readonly EffectiveNode[],
): RoutePresentation[] {
  const edges = resolveRouteEdges(day, day.routes, effectiveNodes);
  const nodesById = new Map(effectiveNodes.map((node) => [node.sourceNodeId, node]));

  return edges.map((edge) => ({
    edge,
    display:
      edge.mode === "walking" &&
      edge.durationMinutes !== undefined &&
      edge.durationMinutes <= 5
        ? "compact"
        : "full",
    navigable: isNavigable(edge, nodesById),
  }));
}
