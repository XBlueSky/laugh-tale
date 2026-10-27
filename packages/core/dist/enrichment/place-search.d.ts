import type { Coordinates, ProviderReference } from "../model.js";
import type { ProviderUnavailableResult } from "../provider-failure.js";
export interface PlaceSearchQuery {
    ownerId: string;
    text: string;
    locale: string;
    regionCode?: string;
    locationBias?: {
        center: Coordinates;
        radiusMeters: number;
    };
    maxCandidates: 3;
}
export interface PlaceSearchCandidate {
    providerReference: ProviderReference;
    displayName: string;
    coordinates?: Coordinates;
    formattedAddress?: string;
    categories: readonly string[];
}
export type PlaceSearchResult = {
    status: "ready";
    candidates: readonly PlaceSearchCandidate[];
} | ProviderUnavailableResult;
export interface PlaceSearchAdapter {
    search(query: PlaceSearchQuery, signal: AbortSignal): Promise<PlaceSearchResult>;
}
export declare function createPlaceSearchQuery(input: {
    ownerId: string;
    text: string;
    locale: string;
    regionCode?: string;
    locationBias?: {
        center: Coordinates;
        radiusMeters: number;
    };
}): PlaceSearchQuery;
export declare function clonePlaceSearchQuery(query: PlaceSearchQuery): PlaceSearchQuery;
