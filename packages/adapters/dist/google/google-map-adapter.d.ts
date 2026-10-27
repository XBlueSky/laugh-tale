import type { Coordinates } from "@laugh-tale-island/core";
import type { CameraIntent, CameraSnapshot, MapAdapterV2, MapMountConfig, MapPresentationV2 } from "@laugh-tale-island/core/browser";
import type { GoogleMapsRuntime } from "./google-config.js";
export interface GoogleMapAdapterOptions {
    development: boolean;
    mapId?: string;
    cloudStyleProfileId?: string;
}
export declare class GoogleMapAdapter implements MapAdapterV2 {
    private readonly runtime;
    private readonly mapId;
    private readonly cloudStyleProfileId;
    private map;
    private config;
    private pendingPresentation;
    private userLocation;
    private userRecord;
    private readonly markers;
    private readonly routes;
    private readonly mapListeners;
    private cameraIdleListener;
    private cameraOperation;
    private cameraIntent;
    private renderOperation;
    private userOperation;
    private generation;
    private terminal;
    constructor(runtime: GoogleMapsRuntime, options: GoogleMapAdapterOptions);
    mount(element: HTMLElement, config: MapMountConfig): Promise<void>;
    render(presentation: MapPresentationV2): void;
    applyCameraIntent(intent: CameraIntent): void;
    getCameraSnapshot(): CameraSnapshot | null;
    setUserLocation(location: Coordinates | null): void;
    destroy(): void;
    private renderNow;
    private createPlacement;
    private mountUserLocation;
    private clearUserLocation;
    private clearMarkers;
    private clearRoutes;
    private releaseMarker;
    private releaseUserLocation;
    private detachRoute;
    private releaseMap;
    private cancelCameraClamp;
}
