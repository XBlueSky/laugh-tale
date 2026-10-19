import type { PlaceSearchAdapter, PlaceSearchQuery, PlaceSearchResult } from "@laugh-tale-island/core/enrichment";
export declare const GOOGLE_PLACES_SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.types";
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export interface GooglePlaceSearchAdapterOptions {
    apiKey: string;
    fetch: FetchLike;
}
export declare class GooglePlaceSearchAdapter implements PlaceSearchAdapter {
    private readonly key;
    private readonly fetcher;
    constructor(options: GooglePlaceSearchAdapterOptions);
    search(query: PlaceSearchQuery, signal: AbortSignal): Promise<PlaceSearchResult>;
    private perform;
}
export {};
