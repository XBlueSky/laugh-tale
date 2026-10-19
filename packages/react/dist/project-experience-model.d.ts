import { type CandidateGroup, type ExperienceChoreographyState, type PlaceRuntimeState, type RouteRequestV2, type PlaceRequestV2, type RouteRuntimeState, type Trip, type TripProgressV1 } from "@laugh-tale-island/core";
import type { NavigationAdapterV2, NavigationRequestV2 } from "@laugh-tale-island/core/browser";
import type { CandidateDecisionModel, ExperienceModel, LocationModel, ProviderStateModel } from "./presentation-contract.js";
import type { ProgressPersistenceStatus } from "./use-trip-progress.js";
export interface ExperienceProjectionInput {
    trip: Trip;
    progress: TripProgressV1;
    instant: string;
    choreography: ExperienceChoreographyState;
    persistenceStatus: ProgressPersistenceStatus;
    viewingOwnerId?: string | null;
    navigation?: NavigationAdapterV2;
    providers?: ProviderStateModel;
    routeStates?: Readonly<Record<string, RouteRuntimeState>>;
    placeStates?: Readonly<Record<string, PlaceRuntimeState>>;
    retryRouteIds?: readonly string[];
    retryPlaceOwnerIds?: readonly string[];
    candidates?: readonly CandidateDecisionModel[];
    activeCandidateGroup?: CandidateGroup;
    location?: LocationModel;
    sheet?: ExperienceModel["sheet"];
    mapLayout?: ExperienceModel["map"]["layout"];
    cameraIntent?: ExperienceModel["map"]["cameraIntent"];
    reducedMotion?: boolean;
}
export declare function projectExperienceModel(input: ExperienceProjectionInput): {
    model: ExperienceModel;
    targets: {
        currentId: string | null;
        currentDestination: {
            dayId: string;
            ownerId: string;
        } | null;
        automaticId: string | null;
        lodgingId: string | null;
    };
    navigationRequests: Map<string, NavigationRequestV2>;
    routeRequests: RouteRequestV2[];
    placeRequests: PlaceRequestV2[];
    effectiveDay: import("@laugh-tale-island/core").EffectiveDay;
};
