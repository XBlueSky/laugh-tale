import type { MapAdapterV2 } from "@laugh-tale-island/core/browser";
import type { Coordinates, ProviderUnavailableResult } from "@laugh-tale-island/core";
import { type GoogleMapAdapterOptions } from "./google-map-adapter.js";
export interface GoogleMapsProjection {
    fromLatLngToPoint(coordinate: Coordinates): {
        x: number;
        y: number;
    } | null;
    fromPointToLatLng(point: {
        x: number;
        y: number;
    }): {
        lat(): number;
        lng(): number;
    } | null;
}
export interface GoogleMapsMapInstance {
    addListener(name: string, callback: () => void): {
        remove(): void;
    };
    fitBounds(bounds: unknown, padding: unknown): void;
    getZoom(): unknown;
    moveCamera(options: {
        center: unknown;
        zoom: number;
        heading?: number;
        tilt?: number;
    }): void;
    getProjection(): GoogleMapsProjection | undefined;
    panBy(x: number, y: number): void;
    panTo(coordinate: unknown): void;
    setZoom(zoom: number): void;
    unbindAll(): void;
}
export interface GoogleMapsAdvancedMarkerInstance {
    map: unknown;
    position: unknown;
    zIndex?: number;
    collisionBehavior?: unknown;
    addEventListener(name: string, listener: (event: unknown) => void): void;
    removeEventListener(name: string, listener: (event: unknown) => void): void;
}
export interface GoogleMapsOverlayInstance {
    setMap(map: GoogleMapsMapInstance | null): void;
    getPanes(): {
        overlayMouseTarget: {
            appendChild(element: HTMLElement): unknown;
        };
    } | null;
    getProjection(): {
        fromLatLngToDivPixel(coordinate: unknown): {
            x: number;
            y: number;
        } | null;
    } | null;
}
export interface GoogleMapsPolylineInstance {
    addListener(name: string, callback: () => void): {
        remove(): void;
    };
    setMap(map: GoogleMapsMapInstance | null): void;
    setOptions?(options: Record<string, unknown>): void;
}
export interface GoogleMapsRuntime {
    Point: new (x: number, y: number) => {
        x: number;
        y: number;
    };
    subscribeFailures?(listener: (failure: ProviderUnavailableResult) => void): () => void;
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapsMapInstance;
    AdvancedMarkerElement: new (options: Record<string, unknown>) => GoogleMapsAdvancedMarkerInstance;
    OverlayView: new () => GoogleMapsOverlayInstance;
    Polyline: new (options: Record<string, unknown>) => GoogleMapsPolylineInstance;
    SymbolPath: {
        CIRCLE: unknown;
    };
    CollisionBehavior: {
        REQUIRED: unknown;
        REQUIRED_AND_HIDES_OPTIONAL: unknown;
        OPTIONAL_AND_HIDES_LOWER_PRIORITY: unknown;
    };
}
export interface GoogleMapsLoader {
    load(apiKey: string): Promise<GoogleMapsRuntime>;
}
export interface GoogleMapsLoaderBindings {
    subscribeFailures?(listener: (failure: ProviderUnavailableResult) => void): () => void;
    setOptions(options: {
        key: string;
        v: string;
    }): void | Promise<void>;
    importLibrary(name: "maps" | "marker" | "core"): Promise<unknown>;
}
export interface GoogleMapsConfigInput {
    apiKey?: string;
    mapId?: string;
    cloudStyleProfileId?: string;
    development: boolean;
}
export type GoogleMapsConfigState = {
    status: "missing-configuration";
} | {
    status: "ready";
    createMap: () => MapAdapterV2;
} | {
    status: "unavailable";
    reason: "loader-failed";
    retryable: true;
    diagnostic?: string;
};
interface GoogleMapsDependencies {
    createLoader(): GoogleMapsLoader;
    createAdapter(runtime: GoogleMapsRuntime, options: GoogleMapAdapterOptions): MapAdapterV2;
}
export type GoogleMapsConfigurator = (input: GoogleMapsConfigInput) => Promise<GoogleMapsConfigState>;
export declare function createGoogleMapsLoader(bindings?: GoogleMapsLoaderBindings): GoogleMapsLoader;
export declare function createGoogleMapsConfigurator(dependencies: GoogleMapsDependencies): GoogleMapsConfigurator;
export declare function configureGoogleMaps(input: GoogleMapsConfigInput, dependencies?: Partial<GoogleMapsDependencies>): Promise<GoogleMapsConfigState>;
export {};
