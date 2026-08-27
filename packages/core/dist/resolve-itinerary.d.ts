import type { RouteEdge, Trip, TripDay, TripNode } from "./model.js";
import { type TripProgressV1 } from "./progress.js";
import { type RouteOwnerOptions } from "./routes.js";
export interface EffectiveNode {
    node: TripNode;
    sourceNodeId: string;
    completed: boolean;
    selectedCandidateId?: string;
}
export interface EffectiveDay {
    day: TripDay;
    nodes: EffectiveNode[];
}
export interface EffectiveTrip {
    tripId: string;
    days: EffectiveDay[];
    routes: RouteEdge[];
}
export declare function resolveEffectiveItinerary(trip: Trip, progress: TripProgressV1, options?: RouteOwnerOptions): EffectiveTrip;
