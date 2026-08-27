const MAP_PLACE_OWNER_PREFIX = "map-place-owner:";
function encodedMapPlaceOwner(parts) {
    return `${MAP_PLACE_OWNER_PREFIX}${JSON.stringify(parts)}`;
}
export function nodeMapOwnerId(nodeId) {
    return encodedMapPlaceOwner(["node", nodeId]);
}
export function candidateMapOwnerId(candidateOptionId) {
    return encodedMapPlaceOwner(["candidate", candidateOptionId]);
}
export const USER_LOCATION_OWNER_ID = encodedMapPlaceOwner(["user-location"]);
export function decodeMapPlaceOwnerId(ownerId) {
    if (!ownerId.startsWith(MAP_PLACE_OWNER_PREFIX)) {
        return undefined;
    }
    try {
        const decoded = JSON.parse(ownerId.slice(MAP_PLACE_OWNER_PREFIX.length));
        if (!Array.isArray(decoded)) {
            return undefined;
        }
        if (decoded.length === 1 && decoded[0] === "user-location") {
            return { kind: "user-location" };
        }
        const kind = decoded[0];
        const id = decoded[1];
        if (decoded.length === 2 &&
            (kind === "node" || kind === "candidate") &&
            typeof id === "string") {
            return { kind, id };
        }
    }
    catch {
        return undefined;
    }
    return undefined;
}
