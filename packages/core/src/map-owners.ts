const MAP_PLACE_OWNER_PREFIX = "map-place-owner:";

/**
 * Provider-neutral identity carried by map presentations and place-selection
 * events. UI consumers can decode a token before applying raw node/candidate
 * selection; the user-location token remains a camera-only target.
 */
export type MapPlaceOwner =
  | { kind: "node"; id: string }
  | { kind: "candidate"; id: string }
  | { kind: "user-location" };

function encodedMapPlaceOwner(parts: readonly string[]): string {
  return `${MAP_PLACE_OWNER_PREFIX}${JSON.stringify(parts)}`;
}

export function nodeMapOwnerId(nodeId: string): string {
  return encodedMapPlaceOwner(["node", nodeId]);
}

export function candidateMapOwnerId(candidateOptionId: string): string {
  return encodedMapPlaceOwner(["candidate", candidateOptionId]);
}

export const USER_LOCATION_OWNER_ID = encodedMapPlaceOwner(["user-location"]);

export function decodeMapPlaceOwnerId(ownerId: string): MapPlaceOwner | undefined {
  if (!ownerId.startsWith(MAP_PLACE_OWNER_PREFIX)) {
    return undefined;
  }
  try {
    const decoded: unknown = JSON.parse(ownerId.slice(MAP_PLACE_OWNER_PREFIX.length));
    if (!Array.isArray(decoded)) {
      return undefined;
    }
    if (decoded.length === 1 && decoded[0] === "user-location") {
      return { kind: "user-location" };
    }
    const kind: unknown = decoded[0];
    const id: unknown = decoded[1];
    if (
      decoded.length === 2 &&
      (kind === "node" || kind === "candidate") &&
      typeof id === "string"
    ) {
      return { kind, id };
    }
  } catch {
    return undefined;
  }
  return undefined;
}
