import { type Trip, type TripNavigationStore } from "@laugh-tale-island/core";
import type { ProgressStore } from "@laugh-tale-island/core/browser";
import type { ExperienceBindings, ExperienceModel, ProviderBootstrapState, TripActions, TripDiagnosticSink, TripPresentationV2, TripRuntimeAdapters } from "./presentation-contract.js";
import { type TripProgressController } from "./use-trip-progress.js";
export interface UseTripExperienceInput {
    trip: Trip;
    navigationStore: TripNavigationStore;
    progressStore: ProgressStore;
    presentation: Pick<TripPresentationV2, "mapVisualProfile" | "createMarkerContent" | "createUserLocationContent">;
    runtime?: TripRuntimeAdapters;
    providerBootstrap?: ProviderBootstrapState;
    clock?: () => string;
    onDiagnostic?: TripDiagnosticSink;
}
export interface TripExperienceController {
    model: ExperienceModel;
    actions: TripActions;
    bindings: ExperienceBindings;
}
export declare function useTripExperience(input: UseTripExperienceInput): TripExperienceController;
/** Package-private composition; the caller owns the progress lifetime. */
export declare function useTripExperienceWithProgress(input: UseTripExperienceInput, progress: TripProgressController): TripExperienceController;
