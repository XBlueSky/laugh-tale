import type { CandidateGroup, RouteEdge } from "./model.js";
import type { EffectiveDay } from "./resolve-itinerary.js";
import type { MapPresentation, RouteResult } from "./provider-data.js";
export interface MapPresentationContext {
    expandedCandidateGroup?: CandidateGroup;
    activeCandidateOptionId?: string;
    selectedNodeId?: string;
    selectedRouteId?: string;
    routes?: readonly RouteEdge[];
    routeResults?: Readonly<Record<string, RouteResult>>;
}
export declare function buildMapPresentation(effectiveDay: EffectiveDay, context?: MapPresentationContext): MapPresentation;
