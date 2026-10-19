import { type CameraIntent, type CandidateGroup, type Coordinates, type ExperienceCameraRequest, type ProviderUnavailableResult, type SheetGeometry, type SheetSnap } from "@laugh-tale-island/core";
import type { MapAdapterV2, MapEventsV2, MapPresentationV2, MapVisualProfile, MarkerContentFactory, UserLocationContentFactory } from "@laugh-tale-island/core/browser";
import type { ExperienceBindings } from "./presentation-contract.js";
import { type MapAdapterLifecycleController, type UseMapAdapterLifecycleInput } from "./use-map-adapter-lifecycle.js";
import { type OwnerFocusRegistry } from "./use-owner-focus-registry.js";
import { type ItinerarySheetController } from "./use-itinerary-sheet.js";
import { type VisibleMapLayoutController } from "./use-visible-map-layout.js";
export interface UseExperienceBindingsInput {
    ownershipKey: string;
    dayId: string;
    sheetSnap: SheetSnap;
    cameraRequest: ExperienceCameraRequest | null;
    presentation: MapPresentationV2;
    candidateGroups: readonly CandidateGroup[];
    visualProfile: MapVisualProfile;
    createMarkerContent: MarkerContentFactory;
    createUserLocationContent: UserLocationContentFactory;
    createAdapter?: () => MapAdapterV2;
    userLocation: Coordinates | null;
    development: boolean;
    onSnapChange(snap: SheetSnap): void;
    onMarkerSelect: MapEventsV2["onMarkerSelect"];
    onRouteSelect: MapEventsV2["onRouteSelect"];
    onFailure?: UseMapAdapterLifecycleInput["onFailure"];
}
export interface ExperienceBindingsController {
    bindings: ExperienceBindings;
    geometry: SheetGeometry | null;
    cameraIntent: CameraIntent | null;
    mapUnavailable: ProviderUnavailableResult | null;
    clearMapUnavailable(): void;
    layout: VisibleMapLayoutController;
    lifecycle: MapAdapterLifecycleController;
    sheet: ItinerarySheetController;
    focus: OwnerFocusRegistry;
}
export declare function useExperienceBindings(input: UseExperienceBindingsInput): ExperienceBindingsController;
