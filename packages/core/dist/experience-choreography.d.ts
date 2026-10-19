import type { SheetSnap } from "./sheet-geometry.js";
import type { TripNavigationState } from "./trip-navigation.js";
export type ExperienceSelectionSource = "automatic" | "list" | "map" | "control";
export type ExperienceCameraRequest = {
    kind: "fit-day";
    dayId: string;
    intentId: string;
} | {
    kind: "fit-candidate";
    dayId: string;
    groupId: string;
    intentId: string;
} | {
    kind: "focus-owner";
    dayId: string;
    ownerId: string;
    intentId: string;
} | {
    kind: "focus-route";
    dayId: string;
    routeId: string;
    intentId: string;
} | {
    kind: "recenter-user";
    dayId: string;
    intentId: string;
};
export interface HeaderTransitionState {
    id: number;
    phase: "expanding" | "collapsing";
}
export interface ExperienceChoreographyState {
    navigation: TripNavigationState;
    selectionSource: ExperienceSelectionSource;
    sheetSnap: SheetSnap;
    headerExpanded: boolean;
    headerRevision: number;
    headerTransition: HeaderTransitionState | null;
    cameraRequest: ExperienceCameraRequest | null;
    cameraRevision: number;
    focusReturnOwnerId: string | null;
}
export interface CreateExperienceChoreographyInput {
    navigation: TripNavigationState;
    automaticOwnerId: string | null;
}
export type ExperienceChoreographyEvent = {
    type: "select-day";
    dayId: string;
    automaticOwnerId: string | null;
} | {
    type: "automatic-owner-changed";
    dayId: string;
    ownerId: string | null;
} | {
    type: "select-node";
    dayId: string;
    nodeId: string;
    source: "list" | "map";
} | {
    type: "select-route";
    dayId: string;
    routeId: string;
    source: "list" | "map";
} | {
    type: "restore-automatic";
    dayId: string;
    ownerId: string;
} | {
    type: "return-to-current";
    dayId: string;
    ownerId: string;
} | {
    type: "return-to-lodging";
    dayId: string;
    ownerId: string;
} | {
    type: "restore-full-day";
    dayId: string;
} | {
    type: "fit-candidate";
    dayId: string;
    groupId: string;
} | {
    type: "recenter-user";
    dayId: string;
} | {
    type: "set-sheet-snap";
    snap: SheetSnap;
} | {
    type: "set-header-expanded";
    expanded: boolean;
} | {
    type: "settle-header-transition";
    transitionId: number;
} | {
    type: "focus-returned";
    ownerId: string;
} | {
    type: "open-home";
};
export declare function createExperienceChoreographyState(input: CreateExperienceChoreographyInput): ExperienceChoreographyState;
export declare function reduceExperienceChoreography(state: ExperienceChoreographyState, event: ExperienceChoreographyEvent): ExperienceChoreographyState;
