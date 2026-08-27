import { nodeCompletionKey } from "./progress.js";
import { deduplicateRouteOwners, resolveRouteEdges } from "./routes.js";
const FACT_CERTAINTIES = new Set([
    "confirmed",
    "suggested",
    "candidate",
    "unverified",
]);
function isFactCertainty(value) {
    return typeof value === "string" && FACT_CERTAINTIES.has(value);
}
function sanitizePlace(place) {
    if (place === undefined || typeof place.name !== "string" || place.name.trim().length === 0) {
        return undefined;
    }
    const coordinates = place.coordinates;
    const safeCoordinates = coordinates !== undefined &&
        Number.isFinite(coordinates.lat) &&
        coordinates.lat >= -90 &&
        coordinates.lat <= 90 &&
        Number.isFinite(coordinates.lng) &&
        coordinates.lng >= -180 &&
        coordinates.lng <= 180
        ? { lat: coordinates.lat, lng: coordinates.lng }
        : undefined;
    const provider = place.provider;
    const safeProvider = provider?.name === "google" &&
        (provider.placeId === undefined ||
            (typeof provider.placeId === "string" && provider.placeId.trim().length > 0))
        ? {
            name: "google",
            ...(provider.placeId === undefined ? {} : { placeId: provider.placeId }),
        }
        : undefined;
    return {
        name: place.name,
        ...(safeCoordinates === undefined ? {} : { coordinates: safeCoordinates }),
        ...(safeProvider === undefined ? {} : { provider: safeProvider }),
        certainty: isFactCertainty(place.certainty) ? place.certainty : "unverified",
    };
}
function isHttpsUrl(value) {
    try {
        return new URL(value).protocol === "https:";
    }
    catch {
        return false;
    }
}
function sanitizeBooking(booking) {
    if (booking === undefined ||
        (booking.status !== "confirmed" && booking.status !== "pending" && booking.status !== "none")) {
        return undefined;
    }
    return {
        status: booking.status,
        ...(typeof booking.reference === "string" ? { reference: booking.reference } : {}),
        ...(typeof booking.url === "string" && isHttpsUrl(booking.url) ? { url: booking.url } : {}),
        ...(Number.isInteger(booking.arrivalBufferMinutes) &&
            (booking.arrivalBufferMinutes ?? -1) >= 0
            ? { arrivalBufferMinutes: booking.arrivalBufferMinutes }
            : {}),
    };
}
function candidateForNode(node, candidateGroups, selectedCandidateIds) {
    const explicitGroupId = node.kind === "dining" ? node.payload.candidateGroupId : undefined;
    let group;
    if (explicitGroupId !== undefined) {
        group = candidateGroups.find((candidate) => candidate.id === explicitGroupId && candidate.parentNodeId === node.id);
    }
    else {
        const parentGroups = candidateGroups.filter((candidate) => candidate.parentNodeId === node.id);
        group = parentGroups.length === 1 ? parentGroups[0] : undefined;
    }
    if (group === undefined || group.mode !== "single") {
        return undefined;
    }
    const storedId = Object.hasOwn(selectedCandidateIds, group.id)
        ? selectedCandidateIds[group.id]
        : undefined;
    const storedOption = group.options.find((candidate) => candidate.id === storedId);
    const defaultOption = group.options.find((candidate) => candidate.id === group.defaultOptionId);
    return storedOption ?? defaultOption;
}
function resolveNode(node, candidateGroups, progress) {
    const selected = candidateForNode(node, candidateGroups, progress.selectedCandidateIds);
    if (selected === undefined) {
        return {
            node,
            sourceNodeId: node.id,
            completed: progress.completedIds.includes(nodeCompletionKey(node.id)),
        };
    }
    const selectedPlace = sanitizePlace(selected.place) ?? sanitizePlace(node.place);
    const selectedBooking = sanitizeBooking(selected.booking ?? node.booking);
    return {
        node: {
            ...node,
            title: selected.title,
            place: selectedPlace,
            booking: selectedBooking,
        },
        sourceNodeId: node.id,
        completed: progress.completedIds.includes(nodeCompletionKey(node.id)),
        selectedCandidateId: selected.id,
    };
}
export function resolveEffectiveItinerary(trip, progress, options = {}) {
    const skippedNodeIds = new Set(progress.skippedNodeIds);
    const days = trip.days.map((day) => ({
        day,
        nodes: day.nodes
            .filter((node) => !(node.optionality === "optional" && skippedNodeIds.has(node.id)))
            .map((node) => resolveNode(node, trip.candidateGroups, progress)),
    }));
    const routes = deduplicateRouteOwners(days.flatMap(({ day, nodes }) => resolveRouteEdges(day, trip.routes, nodes, options)), options);
    return { tripId: trip.id, days, routes };
}
