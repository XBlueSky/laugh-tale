import type { CandidateGroup, Coordinates, RouteEdge } from "./model.js";
import type { EffectiveDay } from "./resolve-itinerary.js";
import { candidateMapOwnerId, nodeMapOwnerId } from "./map-owners.js";
import type {
  MapPlacePresentation,
  MapPresentation,
  MapRoutePresentation,
  RouteResult,
} from "./provider-data.js";

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
      routeResults: Readonly<Record<string, RouteResult>>;
    };

export type MapPresentationContext = MapPresentationSelectionContext &
  MapPresentationRouteContext;

function validCoordinates(value: Coordinates | undefined): value is Coordinates {
  return (
    value !== undefined &&
    Number.isFinite(value.lat) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    Number.isFinite(value.lng) &&
    value.lng >= -180 &&
    value.lng <= 180
  );
}

function cloneCoordinates({ lat, lng }: Coordinates): Coordinates {
  return { lat, lng };
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
      !validCoordinates(node.place?.coordinates)
    ) {
      return [];
    }

    const tone: MapPlacePresentation["tone"] =
      sourceNodeId === context.selectedNodeId
        ? "selected"
        : effectiveNode.completed
          ? "completed"
          : "default";
    return [
      {
        ownerId: nodeMapOwnerId(sourceNodeId),
        label: node.title,
        coordinates: cloneCoordinates(node.place.coordinates),
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
    if (!validCoordinates(option.place?.coordinates)) {
      return [];
    }
    return [
      {
        ownerId: candidateMapOwnerId(option.id),
        label: option.title,
        coordinates: cloneCoordinates(option.place.coordinates),
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
  let routeResults: Readonly<Record<string, RouteResult>> = {};
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
    const result = routeResults[edge.id];
    if (result === undefined) {
      return [];
    }
    const semantics = {
      source: edge.source,
      certainty: edge.certainty,
      mode: edge.mode,
    };
    return result.status === "ready"
      ? [
          {
            edgeId: edge.id,
            path: result.path.map(cloneCoordinates),
            tone:
              edge.id === context.selectedRouteId
                ? ("selected" as const)
                : ("default" as const),
            ...semantics,
          },
        ]
      : [
          {
            edgeId: edge.id,
            path: [],
            tone: "unavailable" as const,
            ...semantics,
          },
        ];
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
