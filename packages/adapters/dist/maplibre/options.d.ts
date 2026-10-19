import type { Coordinates, ProviderFailureReason, ProviderUnavailableResult } from "@laugh-tale-island/core";
export interface MapLibreMapAdapterOptions {
    tileJSONUrl?: string;
    allowLocalhostHTTP?: boolean;
    initialView?: {
        center: Coordinates;
        zoom: number;
    };
    additionalAttribution?: readonly {
        text: string;
        url: string;
    }[];
}
export interface NormalizedMapLibreOptions {
    tileJSONUrl: string;
    allowLocalhostHTTP: boolean;
    initialView: {
        center: Coordinates;
        zoom: number;
    };
    attribution: readonly {
        text: string;
        url: string;
    }[];
}
export interface ShortbreadSource {
    tiles: string[];
    minzoom: number;
    maxzoom: number;
}
export declare const requiredLayers: readonly ["ocean", "water_polygons", "water_lines", "land", "buildings", "streets", "place_labels", "street_labels", "public_transport"];
export declare class MapLibreFailure extends Error {
    readonly failure: ProviderUnavailableResult;
    constructor(reason: ProviderFailureReason, retryable?: boolean);
}
export declare function normalizeMapLibreOptions(input?: MapLibreMapAdapterOptions): NormalizedMapLibreOptions;
export declare function loadShortbreadSource(options: NormalizedMapLibreOptions, signal: AbortSignal): Promise<ShortbreadSource>;
