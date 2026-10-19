import { useLayoutEffect } from "react";
/** Shared policy delegates over the active surface's existing progress owner. */
export function createProgressDelegates(progress, allowed) {
    return {
        updateProgress: (update) => {
            if (!progress.hydrated)
                return;
            if (update.kind === "completion" &&
                allowed.completionIds.includes(update.id))
                progress.setCompleted(update.id, update.completed);
            if (update.kind === "node-skipped" &&
                allowed.skippableNodeIds.includes(update.nodeId))
                progress.setSkipped(update.nodeId, update.skipped);
            if (update.kind === "shopping-status" &&
                allowed.shoppingItemIds.includes(update.itemId))
                progress.setShoppingStatus(update.itemId, update.status);
        },
        resetProgress: (scope, dayId) => {
            if (!progress.hydrated)
                return;
            if (scope === "trip")
                progress.resetTrip();
            else if (scope === "day" &&
                dayId !== undefined &&
                allowed.resetDayIds.includes(dayId))
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
];
export function useCommittedTripActions(slot, delegates) {
    useLayoutEffect(() => {
        slot.current = delegates;
        return () => {
            if (slot.current === delegates)
                slot.current = {};
        };
    }, [slot, delegates]);
}
export function createActionFacade(content, recovery, failure) {
    return Object.fromEntries(ACTION_NAMES.map((name) => [
        name,
        (...args) => {
            const delegate = content.current[name] ?? recovery.current[name];
            try {
                delegate?.(...args);
            }
            catch (cause) {
                content.current = {};
                failure.current(cause);
            }
        },
    ]));
}
