import type { Map as LibreMap } from "maplibre-gl";
import type { MapRoutePresentationV2, MapVisualProfile } from "@laugh-tale-island/core/browser";
export declare function createRouteFeatures(routes: readonly MapRoutePresentationV2[]): GeoJSON.FeatureCollection<GeoJSON.LineString>;
export declare function sampleRouteSymbols(points: readonly {
    x: number;
    y: number;
}[], spacing: number): {
    x: number;
    y: number;
    dx: number;
    dy: number;
}[];
export declare class MapLibreRoutes {
    #private;
    private readonly map;
    private readonly profile;
    private readonly onFailure;
    constructor(map: LibreMap, profile: MapVisualProfile, onFailure: () => void);
    get layerIds(): string[];
    clear(): void;
    refresh(): void;
    render(routes: readonly MapRoutePresentationV2[]): void;
}
