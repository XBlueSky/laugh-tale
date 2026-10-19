import type { HomeCapabilities, TripActions } from "./presentation-contract.js";
import type { TripProgressController } from "./use-trip-progress.js";
/** Shared policy delegates over the active surface's existing progress owner. */
export declare function createProgressDelegates(progress: TripProgressController, allowed: HomeCapabilities["progress"]): Pick<TripActions, "updateProgress" | "resetProgress">;
/** Private attachment point for the later Experience child; only committed delegates are live. */
export interface TripActionSlot {
    current: Partial<TripActions>;
}
export declare function useCommittedTripActions(slot: TripActionSlot, delegates: Partial<TripActions>): void;
export declare function createActionFacade(content: TripActionSlot, recovery: TripActionSlot, failure: {
    current: (cause: unknown) => void;
}): TripActions;
