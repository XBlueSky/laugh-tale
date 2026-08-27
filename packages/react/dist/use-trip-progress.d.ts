import type { ShoppingStatus, Trip, TripProgressV1 } from "@laugh-tale/core";
import type { ProgressStore } from "@laugh-tale/core/browser";
export type ProgressPersistenceStatus = "persistent" | "memory-only";
export interface TripProgressController {
    progress: TripProgressV1;
    hydrated: boolean;
    persistenceStatus: ProgressPersistenceStatus;
    selectCandidate: (groupId: string, candidateId: string) => void;
    setShoppingStatus: (itemId: string, status: ShoppingStatus) => void;
    setSkipped: (nodeId: string, skipped: boolean) => void;
    setCompleted: (id: string, completed: boolean) => void;
    resetDay: (dayId: string) => void;
}
/**
 * Trip-scoped progress bound to one injected {@link ProgressStore}. The
 * store owns key resolution and persistence; this hook owns strict
 * hydration (no store access during the first render), pending-write
 * sequencing, cross-tab subscription, and the semantic `memory-only`
 * downgrade when a write is refused.
 */
export declare function useTripProgress(trip: Trip, store: ProgressStore): TripProgressController;
