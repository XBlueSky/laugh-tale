import type { TripNavigationState, TripNavigationStore } from "@laugh-tale-island/core";
/** The controller owns its one fallback store; this hook only subscribes. */
export declare function useTripNavigation(store: TripNavigationStore): {
    state: TripNavigationState;
    store: TripNavigationStore;
};
