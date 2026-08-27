export interface TripSelection {
    nodeId: string | null;
    source: "automatic" | "manual";
}
export interface TripSelectionController {
    selection: TripSelection;
    selectManual: (nodeId: string) => void;
    returnToNow: () => void;
}
export declare function useTripSelection(automaticNodeId: string | null, availableNodeIds: readonly string[]): TripSelectionController;
