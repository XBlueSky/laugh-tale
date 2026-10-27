import type { CandidateGroup, Coordinates, RouteEdge } from "./model.js";
import type { EffectiveDay } from "./resolve-itinerary.js";
import { candidateMapOwnerId, nodeMapOwnerId } from "./map-owners.js";
import type { MapPlacePresentation, MapPresentation, MapRoutePresentation } from "./provider-data.js";
import type { RouteProviderResult } from "./route-runtime.js";

interface MapPresentationSelectionContext {
  expandedCandidateGroup?: CandidateGroup;
  activeCandidateOptionId?: string;
  selectedNodeId?: string;
  selectedRouteId?: string;
}

type MapPresentationRouteContext =
  | { routes?: never; routeResults?: never }
  | {
      routes: readonly RouteEdge[];
      routeResults: Readonly<Record<string, RouteProviderResult>>;
    };

export type MapPresentationContext = MapPresentationSelectionContext &
  MapPresentationRouteContext;

function validCoordinates(value: unknown): value is Coordinates {
  if (typeof value !== "object" || value === null) return false;
  const { lat, lng } = value as { lat?: unknown; lng?: unknown };
  return (
    typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180
  );
}

function validGeometry(value: unknown): value is readonly Coordinates[] {
  if (!Array.isArray(value) || value.length < 2) return false;
  for (let index = 0; index < value.length; index += 1) if (!Object.hasOwn(value, index) || !validCoordinates(value[index])) return false;
  return true;
}

function readyGeometry(value: unknown): value is { status: "ready"; geometry: readonly Coordinates[] } {
  return typeof value === "object" && value !== null &&
    (value as { status?: unknown }).status === "ready" &&
    validGeometry((value as { geometry?: unknown }).geometry);
}

function cloneCoordinates({ lat, lng }: Coordinates): Coordinates {
  return { lat, lng };
}

function resolvedCoordinates(place: { identity: unknown } | undefined): Coordinates | undefined {
  return place?.identity !== undefined &&
    typeof place.identity === "object" &&
    place.identity !== null &&
    (place.identity as { status?: unknown }).status === "resolved"
    ? (place.identity as { coordinates?: Coordinates }).coordinates
    : undefined;
}

function effectivePlaces(
  effectiveDay: EffectiveDay,
  context: MapPresentationContext,
): MapPlacePresentation[] {
  const expandedParentId = context.expandedCandidateGroup?.parentNodeId;
  return effectiveDay.nodes.flatMap((effectiveNode) => {
    const { node, sourceNodeId } = effectiveNode;
    if (
      sourceNodeId === expandedParentId ||
      !validCoordinates(resolvedCoordinates(node.place))
    ) {
      return [];
    }

    const tone: MapPlacePresentation["tone"] =
      sourceNodeId === context.selectedNodeId
        ? "selected"
        : effectiveNode.skipped
          ? "skipped"
          : effectiveNode.completed
            ? "completed"
            : "default";
    return [
      {
        ownerId: nodeMapOwnerId(sourceNodeId),
        label: node.title,
        coordinates: cloneCoordinates(resolvedCoordinates(node.place)!),
        tone,
      },
    ];
  });
}

function expandedCandidatePlaces(
  effectiveDay: EffectiveDay,
  context: MapPresentationContext,
): MapPlacePresentation[] {
  const group = context.expandedCandidateGroup;
  if (
    group === undefined ||
    !effectiveDay.day.nodes.some(({ id }) => id === group.parentNodeId)
  ) {
    return [];
  }

  return group.options.flatMap((option) => {
    const coordinates = resolvedCoordinates(option.place);
    if (!validCoordinates(coordinates)) {
      return [];
    }
    return [
      {
        ownerId: candidateMapOwnerId(option.id),
        label: option.title,
        coordinates: cloneCoordinates(coordinates),
        tone:
          option.id === context.activeCandidateOptionId
            ? ("selected" as const)
            : ("candidate" as const),
      },
    ];
  });
}

function selectedPlaceOwnerId(
  places: readonly MapPlacePresentation[],
  context: MapPresentationContext,
): string | undefined {
  const candidateId = context.activeCandidateOptionId;
  const candidateOwnerId =
    candidateId === undefined ? undefined : candidateMapOwnerId(candidateId);
  if (
    context.expandedCandidateGroup !== undefined &&
    candidateOwnerId !== undefined &&
    places.some(({ ownerId }) => ownerId === candidateOwnerId)
  ) {
    return candidateOwnerId;
  }
  if (context.selectedNodeId === undefined) {
    return undefined;
  }
  const nodeOwnerId = nodeMapOwnerId(context.selectedNodeId);
  return places.some(({ ownerId }) => ownerId === nodeOwnerId)
    ? nodeOwnerId
    : undefined;
}

export function buildMapPresentation(
  effectiveDay: EffectiveDay,
  context: MapPresentationContext = {},
): MapPresentation {
  let routeEdges: readonly RouteEdge[] = [];
  let routeResults: Readonly<Record<string, RouteProviderResult>> = {};
  if (context.routes !== undefined || context.routeResults !== undefined) {
    if (context.routes === undefined || context.routeResults === undefined) {
      throw new Error("Map presentation routes and routeResults must be provided together");
    }
    routeEdges = context.routes;
    routeResults = context.routeResults;
  }
  const places = [
    ...effectivePlaces(effectiveDay, context),
    ...expandedCandidatePlaces(effectiveDay, context),
  ];
  const routeOwners = new Set<string>();
  const routes = routeEdges.flatMap<MapRoutePresentation>((edge) => {
    if (routeOwners.has(edge.id) || !Object.hasOwn(routeResults, edge.id)) {
      return [];
    }
    routeOwners.add(edge.id);
    const result: unknown = routeResults[edge.id];
    if (!readyGeometry(result)) {
      return [];
    }
    const semantics = {
      source: edge.source,
      certainty: edge.certainty,
      mode: edge.mode,
    };
    return [{
      edgeId: edge.id,
      path: result.geometry.map(cloneCoordinates),
      tone: edge.id === context.selectedRouteId ? ("selected" as const) : ("default" as const),
      ...semantics,
    }];
  });
  const selectedPlace = selectedPlaceOwnerId(places, context);

  return {
    places,
    routes,
    ...(selectedPlace === undefined
      ? {}
      : { selectedPlaceOwnerId: selectedPlace }),
    ...(context.selectedRouteId === undefined
      ? {}
      : { selectedRouteId: context.selectedRouteId }),
  };
}
