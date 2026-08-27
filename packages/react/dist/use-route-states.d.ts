import type { RouteEdge } from "@laugh-tale/core";
import type { RouteResult } from "@laugh-tale/core";
import type { RouteAdapter } from "@laugh-tale/core/browser";
export type RouteLoadState = RouteResult | {
    status: "loading";
};
export interface RouteStates {
    states: Readonly<Record<string, RouteLoadState>>;
    mapResults: Readonly<Record<string, RouteResult>>;
    retry(routeId: string): boolean;
}
export interface UseRouteStatesOptions {
    /**
     * Maps an adapter failure to the `reason` carried by the unavailable
     * result. The default keeps a non-blank `Error` message (provider data)
     * and otherwise returns an empty string; visible copy belongs to the
     * consuming site.
     */
    adapterErrorReason?: (error: unknown) => string;
}
export declare function useRouteStates(routes: readonly RouteEdge[], routeAdapterFactory?: () => RouteAdapter, options?: UseRouteStatesOptions): RouteStates;
