import type { RouteEdge, TripDay } from "./model";
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

function uniqueRouteOwners(routes: readonly RouteEdge[]): RouteEdge[] {
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

  const template = path.at(-1);
  if (template === undefined) {
    return undefined;
  }

  const navigationOrigin = navigationEndpoint(origin);
  const navigationDestination = navigationEndpoint(destination);

  return {
    id: `route:${origin.sourceNodeId}--${destination.sourceNodeId}`,
    dayId: day.id,
    fromNodeId: origin.sourceNodeId,
    toNodeId: destination.sourceNodeId,
    mode: template.mode,
    source: "recomposed",
    certainty: "unverified",
    ...(navigationOrigin !== undefined && navigationDestination !== undefined
      ? { navigation: { origin: navigationOrigin, destination: navigationDestination } }
      : {}),
  };
}

export function resolveRouteEdges(
  day: TripDay,
  sourceRoutes: readonly RouteEdge[],
  effectiveNodes: readonly EffectiveNode[],
): RouteEdge[] {
  const routes = uniqueRouteOwners(sourceRoutes.filter((route) => route.dayId === day.id));
  const output: RouteEdge[] = [];

  for (let index = 0; index < effectiveNodes.length - 1; index += 1) {
    const origin = effectiveNodes[index];
    const destination = effectiveNodes[index + 1];
    if (origin === undefined || destination === undefined) {
      continue;
    }

    const direct = routes.find(
      (route) =>
        route.fromNodeId === origin.sourceNodeId &&
        route.toNodeId === destination.sourceNodeId,
    );
    const edge = direct ?? recomposeEdge(day, routes, origin, destination);
    if (edge !== undefined) {
      output.push(direct === undefined ? edge : { ...edge });
    }
  }

  return uniqueRouteOwners(output);
}

function isNavigable(edge: RouteEdge, nodesById: ReadonlyMap<string, EffectiveNode>): boolean {
  if (edge.mode === "flight") {
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
