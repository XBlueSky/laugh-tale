import { Temporal } from "@js-temporal/polyfill";
import type { Trip, TripDay, TripNode } from "./model.js";
/** Authored day order with manual, local calendar day, upcoming, then final fallback. */
export declare function selectEffectiveDay(trip: Pick<Trip, "timezone" | "days">, instant: string, manualDayId?: string | null): TripDay | null;
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
/** String-instant boundary for consumers without their own Temporal runtime. */
export declare function selectLiveState(trip: Pick<Trip, "timezone" | "days">, instant: string, options?: LiveStateOptions): LiveState;
/** Incomplete temporal owners precede the first remaining authored owner. */
export declare function selectAutomaticOwnerId(trip: Pick<Trip, "timezone" | "days">, instant: string, ignoredNodeIds: ReadonlySet<string>): string | null;
export declare function resolveSchedule(trip: Pick<Trip, "timezone" | "days">): ResolvedScheduleEntry[];
export declare function findLiveState(fullSchedule: readonly ResolvedScheduleEntry[], now: Temporal.ZonedDateTime, options?: LiveStateOptions): LiveState;
