import { type RouteProviderResult, type RouteRequestV2, type RouteRuntimeState } from "@laugh-tale-island/core";
import type { RouteAdapterV2 } from "@laugh-tale-island/core/browser";
export type RouteLoadState = RouteRuntimeState;
export interface RouteStates {
    states: Readonly<Record<string, RouteLoadState>>;
    mapResults: Readonly<Record<string, Extract<RouteProviderResult, {
        status: "ready";
    }>>>;
    retry(routeId: string): boolean;
}
export interface UseRouteStatesOptions {
    /** Converts adapter failures to non-display diagnostic data. */
    adapterErrorReason?: (error: unknown) => string;
}
export declare function useRouteStates(requests: readonly RouteRequestV2[], routeAdapterFactory?: () => RouteAdapterV2, options?: UseRouteStatesOptions): RouteStates;
