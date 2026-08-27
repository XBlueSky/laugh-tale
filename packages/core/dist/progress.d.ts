import type { ShoppingStatus, Trip } from "./model.js";
export interface TripProgressV1 {
    version: 1;
    selectedCandidateIds: Record<string, string>;
    shoppingStatuses: Record<string, ShoppingStatus>;
    skippedNodeIds: string[];
    completedIds: string[];
}
export interface DayProgressScope {
    candidateGroupIds: string[];
    shoppingItemIds: string[];
    skippedNodeIds: string[];
    completionIds: string[];
}
export type TripProgressAction = {
    type: "select-candidate";
    groupId: string;
    candidateId: string;
} | {
    type: "set-shopping-status";
    itemId: string;
    status: ShoppingStatus;
} | {
    type: "set-node-skipped";
    nodeId: string;
    skipped: boolean;
} | {
    type: "set-completed";
    id: string;
    completed: boolean;
} | {
    type: "reset-day";
    scope: DayProgressScope;
};
export declare function nodeCompletionKey(nodeId: string): string;
export declare function checklistCompletionKey(checklistId: string): string;
export declare function taskCompletionKey(taskId: string): string;
export declare function emptyTripProgress(): TripProgressV1;
export declare function parseTripProgress(raw: string | null): TripProgressV1;
export declare function tripProgressReducer(state: TripProgressV1, action: TripProgressAction): TripProgressV1;
export declare function collectDayProgressScope(trip: Trip, dayId: string): DayProgressScope;
