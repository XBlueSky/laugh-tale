import type { RouteEdge, TripDay } from "./model.js";
import type { EffectiveNode } from "./resolve-itinerary.js";
export interface RoutePresentation {
    edge: RouteEdge;
    display: "hidden" | "compact" | "full";
    navigable: boolean;
}
export type RoutePresentationDay = TripDay & {
    routes: readonly RouteEdge[];
};
export interface RouteOwnerOptions {
    /**
     * How to handle duplicate route owner IDs. `validateTrip` already reports
     * duplicates as structured issues; `"throw"` turns them into a hard error
     * for development builds, while the default `"ignore"` keeps the first
     * owner and drops later duplicates so a live site never crashes.
     */
    onDuplicateRoute?: "throw" | "ignore";
}
export declare function deduplicateRouteOwners(routes: readonly RouteEdge[], options?: RouteOwnerOptions): RouteEdge[];
export declare function resolveRouteEdges(day: TripDay, sourceRoutes: readonly RouteEdge[], effectiveNodes: readonly EffectiveNode[], options?: RouteOwnerOptions): RouteEdge[];
export declare function buildRoutePresentations(day: RoutePresentationDay, effectiveNodes: readonly EffectiveNode[], options?: RouteOwnerOptions): RoutePresentation[];
