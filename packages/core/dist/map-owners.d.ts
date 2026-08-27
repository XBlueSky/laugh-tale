/**
 * Provider-neutral identity carried by map presentations and place-selection
 * events. UI consumers can decode a token before applying raw node/candidate
 * selection; the user-location token remains a camera-only target.
 */
export type MapPlaceOwner = {
    kind: "node";
    id: string;
} | {
    kind: "candidate";
    id: string;
} | {
    kind: "user-location";
};
export declare function nodeMapOwnerId(nodeId: string): string;
export declare function candidateMapOwnerId(candidateOptionId: string): string;
export declare const USER_LOCATION_OWNER_ID: string;
export declare function decodeMapPlaceOwnerId(ownerId: string): MapPlaceOwner | undefined;
