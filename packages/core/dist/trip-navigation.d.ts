export interface TripNavigationState {
    surface: "home" | "experience";
    dayId: string | null;
    ownerId: string | null;
}
export interface TripNavigationStore {
    read(): TripNavigationState;
    write(next: TripNavigationState): void;
    subscribe(listener: () => void): () => void;
}
export declare function createMemoryTripNavigationStore(initial?: TripNavigationState): TripNavigationStore;
