import type { Coordinates, PlaceRef, ProviderReference } from "./model.js";
export type NavigationTargetV2 = {
    kind: "coordinates";
    label: string;
    coordinates: Coordinates;
} | {
    kind: "provider-reference";
    label: string;
    providerReference: ProviderReference;
};
export declare function deriveNavigationTarget(place: PlaceRef | undefined, supportedProviders: readonly string[]): NavigationTargetV2 | null;
