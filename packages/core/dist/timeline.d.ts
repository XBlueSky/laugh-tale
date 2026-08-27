import type { TripNode } from "./model.js";
import type { EffectiveDay, EffectiveTrip } from "./resolve-itinerary.js";
import { type RoutePresentation } from "./routes.js";
export interface NodeEntry {
    kind: "node";
    id: string;
    node: TripNode;
}
export interface RouteEntry {
    kind: "route";
    id: string;
    route: RoutePresentation;
}
export interface LogisticsGroupEntry {
    kind: "logistics-group";
    id: string;
    entries: NodeEntry[];
}
export type TimelinePresentationEntry = NodeEntry | RouteEntry | LogisticsGroupEntry;
/**
 * Builds the list-only projection of one effective day. Route edges retain
 * their own IDs and positions; visual grouping never transfers route
 * ownership into a node.
 */
export declare function buildTimelineEntries(day: EffectiveDay, effectiveTrip: Pick<EffectiveTrip, "routes">): TimelinePresentationEntry[];
