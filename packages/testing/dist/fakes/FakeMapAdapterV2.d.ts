import type { Coordinates, ProviderUnavailableResult } from "@laugh-tale-island/core";
import type { CameraIntent, CameraSnapshot, MapAdapterV2, MapMountConfig, MapPresentationV2, MarkerDescriptor, UserLocationDescriptor } from "@laugh-tale-island/core/browser";
export interface FakeMapAdapterV2Options {
    cameraSnapshot?: CameraSnapshot | null;
}
export interface FakeMapMountCall {
    readonly element: HTMLElement;
    readonly config: MapMountConfig;
}
export declare class FakeMapAdapterV2 implements MapAdapterV2 {
    readonly testOnly: true;
    readonly mountCalls: FakeMapMountCall[];
    readonly renderCalls: MapPresentationV2[];
    readonly cameraIntentCalls: CameraIntent[];
    readonly userLocationCalls: Array<Coordinates | null>;
    readonly markerFactoryCalls: MarkerDescriptor[];
    readonly markerElements: HTMLElement[];
    readonly markerPositionCalls: Coordinates[];
    readonly userLocationFactoryCalls: UserLocationDescriptor[];
    readonly userLocationElements: HTMLElement[];
    readonly userLocationPositionCalls: Coordinates[];
    destroyCount: number;
    cameraSnapshotReadCount: number;
    markerDisposalCount: number;
    userLocationDisposalCount: number;
    private cameraSnapshot;
    private config;
    private mounted;
    private pendingPresentation;
    private userLocation;
    private readonly markers;
    private userRecord;
    private lifecycleGeneration;
    private renderOperation;
    private userLocationOperation;
    constructor(options?: FakeMapAdapterV2Options);
    mount(element: HTMLElement, config: MapMountConfig): Promise<void>;
    render(presentation: MapPresentationV2): void;
    applyCameraIntent(intent: CameraIntent): void;
    getCameraSnapshot(): CameraSnapshot | null;
    setCameraSnapshot(snapshot: CameraSnapshot | null): void;
    setUserLocation(location: Coordinates | null): void;
    destroy(): void;
    emitMarkerSelect(ownerId: string): void;
    emitRouteSelect(routeId: string): void;
    emitUnavailable(result: ProviderUnavailableResult): void;
    private reportFailure;
    private ownsRender;
    private ownsUserLocation;
    private renderCurrent;
    private createUserLocation;
    private releaseMarker;
    private releaseUserLocationRecord;
    private releaseUserLocation;
    private releaseMount;
}
