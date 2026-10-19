import type { RouteProviderResult, RouteRequestV2 } from "@laugh-tale-island/core";
import type { RouteAdapterV2 } from "@laugh-tale-island/core/browser";
export declare const GOOGLE_ROUTES_FIELD_MASK: string;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export interface GoogleRouteAdapterOptions {
    apiKey: string;
    fetch?: FetchLike;
    transitEnabled?: boolean;
}
export declare function routeRequestCacheKey(request: RouteRequestV2): string;
export declare class GoogleRouteAdapter implements RouteAdapterV2 {
    private readonly apiKey;
    private readonly fetcher;
    private readonly transitEnabled;
    private readonly cache;
    private readonly inFlight;
    constructor(options: GoogleRouteAdapterOptions);
    load(request: RouteRequestV2, signal: AbortSignal): Promise<RouteProviderResult>;
    private start;
    private subscribe;
    private resolve;
    private fetch;
}
export {};
