import type { CandidateGroup, Coordinates } from "../trip-core/model";
import type { EffectiveDay } from "../trip-core/resolve-itinerary";
import {
  candidateMapOwnerId,
  nodeMapOwnerId,
  type MapPlacePresentation,
  type MapPresentation,
  type RouteResult,
} from "./provider-contracts";

export interface MapPresentationContext {
  expandedCandidateGroup?: CandidateGroup;
  activeCandidateOptionId?: string;
  selectedNodeId?: string;
  selectedRouteId?: string;
  routeResults?: Readonly<Record<string, RouteResult>>;
}

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
  const places = [
    ...effectivePlaces(effectiveDay, context),
    ...expandedCandidatePlaces(effectiveDay, context),
  ];
  const routes = Object.entries(context.routeResults ?? {}).map(([edgeId, result]) =>
    result.status === "ready"
      ? {
          edgeId,
          path: result.path.map(cloneCoordinates),
          tone:
            edgeId === context.selectedRouteId
              ? ("selected" as const)
              : ("default" as const),
        }
      : { edgeId, path: [], tone: "unavailable" as const },
  );
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
