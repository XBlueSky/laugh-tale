import { candidateMapOwnerId, nodeMapOwnerId } from "./map-owners.js";
function validCoordinates(value) {
    return (value !== undefined &&
        Number.isFinite(value.lat) &&
        value.lat >= -90 &&
        value.lat <= 90 &&
        Number.isFinite(value.lng) &&
        value.lng >= -180 &&
        value.lng <= 180);
}
function cloneCoordinates({ lat, lng }) {
    return { lat, lng };
}
function effectivePlaces(effectiveDay, context) {
    const expandedParentId = context.expandedCandidateGroup?.parentNodeId;
    return effectiveDay.nodes.flatMap((effectiveNode) => {
        const { node, sourceNodeId } = effectiveNode;
        if (sourceNodeId === expandedParentId ||
            !validCoordinates(node.place?.coordinates)) {
            return [];
        }
        const tone = sourceNodeId === context.selectedNodeId
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
function expandedCandidatePlaces(effectiveDay, context) {
    const group = context.expandedCandidateGroup;
    if (group === undefined ||
        !effectiveDay.day.nodes.some(({ id }) => id === group.parentNodeId)) {
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
                tone: option.id === context.activeCandidateOptionId
                    ? "selected"
                    : "candidate",
            },
        ];
    });
}
function selectedPlaceOwnerId(places, context) {
    const candidateId = context.activeCandidateOptionId;
    const candidateOwnerId = candidateId === undefined ? undefined : candidateMapOwnerId(candidateId);
    if (context.expandedCandidateGroup !== undefined &&
        candidateOwnerId !== undefined &&
        places.some(({ ownerId }) => ownerId === candidateOwnerId)) {
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
export function buildMapPresentation(effectiveDay, context = {}) {
    let routeEdges = [];
    let routeResults = {};
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
    const routeOwners = new Set();
    const routes = routeEdges.flatMap((edge) => {
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
                    tone: edge.id === context.selectedRouteId
                        ? "selected"
                        : "default",
                    ...semantics,
                },
            ]
            : [
                {
                    edgeId: edge.id,
                    path: [],
                    tone: "unavailable",
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
