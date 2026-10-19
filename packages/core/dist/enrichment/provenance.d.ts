import { type PlaceSearchQuery } from "./place-search.js";
export interface PlaceResolutionProvenance {
    schemaVersion: 1;
    ownerId: string;
    source: string;
    query: PlaceSearchQuery;
    provider: string;
    observedAt: string;
}
export declare function createPlaceResolutionProvenance(input: {
    ownerId: string;
    source: string;
    query: PlaceSearchQuery;
    provider: string;
    observedAt: string;
}): PlaceResolutionProvenance;
