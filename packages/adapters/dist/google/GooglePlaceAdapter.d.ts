import type { PlaceProviderResult, PlaceRequestV2 } from "@laugh-tale-island/core";
import type { PlaceAdapterV2 } from "@laugh-tale-island/core/browser";
export declare const GOOGLE_PLACES_DETAIL_FIELD_MASK: string;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export interface GooglePlaceAdapterOptions {
    apiKey: string;
    fetch?: FetchLike;
}
export declare class GooglePlaceAdapter implements PlaceAdapterV2 {
    private readonly key;
    private readonly fetcher;
    private readonly cache;
    private readonly inFlight;
    constructor(options: GooglePlaceAdapterOptions);
    load(request: PlaceRequestV2, signal: AbortSignal): Promise<PlaceProviderResult>;
    private start;
    private subscribe;
    private fetch;
}
export {};
