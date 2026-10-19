import { useLayoutEffect } from "react";
import type { HomeCapabilities, TripActions } from "./presentation-contract.js";
import type { TripProgressController } from "./use-trip-progress.js";

/** Shared policy delegates over the active surface's existing progress owner. */
export function createProgressDelegates(
  progress: TripProgressController,
  allowed: HomeCapabilities["progress"],
): Pick<TripActions, "updateProgress" | "resetProgress"> {
  return {
    updateProgress: (update) => {
      if (!progress.hydrated) return;
      if (
        update.kind === "completion" &&
        allowed.completionIds.includes(update.id)
      )
        progress.setCompleted(update.id, update.completed);
      if (
        update.kind === "node-skipped" &&
        allowed.skippableNodeIds.includes(update.nodeId)
      )
        progress.setSkipped(update.nodeId, update.skipped);
      if (
        update.kind === "shopping-status" &&
        allowed.shoppingItemIds.includes(update.itemId)
      )
        progress.setShoppingStatus(update.itemId, update.status);
    },
    resetProgress: (scope, dayId) => {
      if (!progress.hydrated) return;
      if (scope === "trip") progress.resetTrip();
      else if (
        scope === "day" &&
        dayId !== undefined &&
        allowed.resetDayIds.includes(dayId)
      )
        progress.resetDay(dayId);
    },
  };
}
const ACTION_NAMES = [
  "openExperience",
  "openReservation",
  "openHome",
  "selectDay",
  "selectNode",
  "selectRoute",
  "selectCandidate",
  "setSheetSnap",
  "stepSheet",
  "setHeaderExpanded",
  "settleHeaderTransition",
  "restoreAutomaticSelection",
  "returnToCurrent",
  "returnToLodging",
  "restoreFullDay",
  "retryProvider",
  "openNavigation",
  "beginLocation",
  "recenterLocation",
  "stopLocation",
  "previewCandidate",
  "cancelCandidate",
  "confirmCandidate",
  "reopenCandidate",
  "updateProgress",
  "resetProgress",
  "retrySetup",
  "retryFatal",
] as const satisfies readonly (keyof TripActions)[];

/** Private attachment point for the later Experience child; only committed delegates are live. */
export interface TripActionSlot {
  current: Partial<TripActions>;
}

export function useCommittedTripActions(
  slot: TripActionSlot,
  delegates: Partial<TripActions>,
): void {
  useLayoutEffect(() => {
    slot.current = delegates;
    return () => {
      if (slot.current === delegates) slot.current = {};
    };
  }, [slot, delegates]);
}

export function createActionFacade(
  content: TripActionSlot,
  recovery: TripActionSlot,
  failure: { current: (cause: unknown) => void },
): TripActions {
  return Object.fromEntries(
    ACTION_NAMES.map((name) => [
      name,
      (...args: unknown[]) => {
        const delegate = content.current[name] ?? recovery.current[name];
        try {
          (delegate as ((...values: unknown[]) => void) | undefined)?.(...args);
        } catch (cause) {
          content.current = {};
          failure.current(cause);
        }
      },
    ]),
  ) as unknown as TripActions;
}
