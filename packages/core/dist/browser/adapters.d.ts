import type { Coordinates } from "../model.js";
import type { MapFocusTarget, MapPadding, MapPresentation, PlaceRequest, PlaceResult, RouteRequest, RouteResult, NavigationInput } from "../provider-data.js";
export interface MapEvents {
    onPlaceSelect(placeOwnerId: string): void;
    onRouteSelect(routeId: string): void;
}
export interface MapAdapter {
    mount(element: HTMLElement, events: MapEvents): Promise<void>;
    render(presentation: MapPresentation): void;
    focus(target: MapFocusTarget): void;
    fit(ids: string[]): void;
    setPadding(padding: MapPadding): void;
    setUserLocation(location: Coordinates | null): void;
    destroy(): void;
}
export interface RouteAdapter {
    load(request: RouteRequest, signal: AbortSignal): Promise<RouteResult>;
}
export interface PlaceAdapter {
    resolve(request: PlaceRequest, signal: AbortSignal): Promise<PlaceResult>;
}
export interface NavigationAdapter {
    directions(input: NavigationInput): string;
}
