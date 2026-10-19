import type { CameraIntent, CameraSnapshot, Coordinates, MapLayoutSnapshot } from "@laugh-tale-island/core";
import type { MapAdapterV2, MapMountConfig, MapPresentationV2 } from "@laugh-tale-island/core/browser";
import { type MapLibreMapAdapterOptions } from "./options.js";
export declare class MapLibreMapAdapter implements MapAdapterV2 {
    #private;
    private readonly options;
    constructor(options?: MapLibreMapAdapterOptions);
    mount(element: HTMLElement, config: MapMountConfig): Promise<void>;
    setLayout(layout: MapLayoutSnapshot | null): void;
    render(presentation: MapPresentationV2): void;
    applyCameraIntent(intent: CameraIntent): void;
    getCameraSnapshot(): CameraSnapshot | null;
    setUserLocation(location: Coordinates | null): void;
    destroy(): void;
}
