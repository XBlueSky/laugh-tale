import type { CandidateGroup, RouteEdge } from "./model.js";
import type { EffectiveDay } from "./resolve-itinerary.js";
import type { MapPresentation, RouteResult } from "./provider-data.js";
interface MapPresentationSelectionContext {
    expandedCandidateGroup?: CandidateGroup;
    activeCandidateOptionId?: string;
    selectedNodeId?: string;
    selectedRouteId?: string;
}
type MapPresentationRouteContext = {
    routes?: never;
    routeResults?: never;
} | {
    routes: readonly RouteEdge[];
    routeResults: Readonly<Record<string, RouteResult>>;
};
export type MapPresentationContext = MapPresentationSelectionContext & MapPresentationRouteContext;
export declare function buildMapPresentation(effectiveDay: EffectiveDay, context?: MapPresentationContext): MapPresentation;
export {};
