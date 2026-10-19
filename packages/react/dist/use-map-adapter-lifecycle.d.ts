import { type RefCallback } from "react";
import type { CameraIntent, CameraSnapshot, Coordinates, MapLayoutSnapshot, ProviderFailureReason, ProviderUnavailableResult } from "@laugh-tale-island/core";
import type { MapAdapterV2, MapMountConfig, MapPresentationV2 } from "@laugh-tale-island/core/browser";
export type MapAdapterLifecycleStatus = {
    kind: "idle";
} | {
    kind: "mounting";
    attempt: number;
} | {
    kind: "ready";
    attempt: number;
} | {
    kind: "unavailable";
    attempt: number;
    reason: ProviderFailureReason;
    retryable: boolean;
    diagnostic?: string;
};
export interface UseMapAdapterLifecycleInput {
    createAdapter?: () => MapAdapterV2;
    mountConfig: MapMountConfig;
    presentation: MapPresentationV2;
    cameraIntent: CameraIntent | null;
    layout: MapLayoutSnapshot | null;
    userLocation: Coordinates | null;
    development: boolean;
    onFailure?: (failure: ProviderUnavailableResult, cause?: unknown) => void;
}
export interface MapAdapterLifecycleController {
    mapRef: RefCallback<HTMLElement>;
    status: MapAdapterLifecycleStatus;
    retry(): void;
    getCameraSnapshot(): CameraSnapshot | null;
}
export declare function useMapAdapterLifecycle({ createAdapter, mountConfig, presentation, userLocation, development, cameraIntent, layout, onFailure, }: UseMapAdapterLifecycleInput): MapAdapterLifecycleController;
