import { Temporal } from "@js-temporal/polyfill";
import type { Trip, TripDay, TripNode } from "./model.js";
export interface ResolvedScheduleEntry {
    id: string;
    nodeId: string;
    dayId: string;
    node: TripNode;
    day: TripDay;
    startsAt: Temporal.ZonedDateTime;
    endsAt: Temporal.ZonedDateTime;
}
export interface LiveState {
    currentId: string | null;
    nextId: string | null;
}
export interface LiveStateOptions {
    ignoredNodeIds?: ReadonlySet<string>;
}
export declare function resolveSchedule(trip: Pick<Trip, "timezone" | "days">): ResolvedScheduleEntry[];
export declare function findLiveState(fullSchedule: readonly ResolvedScheduleEntry[], now: Temporal.ZonedDateTime, options?: LiveStateOptions): LiveState;
