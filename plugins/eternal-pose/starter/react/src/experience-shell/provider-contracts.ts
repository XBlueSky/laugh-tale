import type { Coordinates, PlaceRef, RouteEdge } from "../trip-core/model";

export const USER_LOCATION_OWNER_ID = "map:user-location";

export interface MapPlacePresentation {
  ownerId: string;
  label: string;
  coordinates: Coordinates;
  tone: "default" | "candidate" | "selected" | "completed" | "skipped";
}

export interface MapRoutePresentation {
  edgeId: string;
  path: Coordinates[];
  tone: "default" | "selected" | "unavailable";
}

export interface MapPresentation {
  places: MapPlacePresentation[];
  routes: MapRoutePresentation[];
  selectedPlaceOwnerId?: string;
  selectedRouteId?: string;
}

export interface MapEvents {
  onPlaceSelect(placeOwnerId: string): void;
  onRouteSelect(routeId: string): void;
}

export type MapFocusTarget =
  | { kind: "place"; id: string }
  | { kind: "route"; id: string };

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
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

export interface RouteRequest {
  edge: RouteEdge;
  departureAt?: string;
  transitPreferences?: {
    allowedModes?: ("subway" | "rail" | "bus")[];
  };
}

export type RouteResult =
  | {
      status: "ready";
      durationMinutes: number;
      distanceMeters?: number;
      path: Coordinates[];
      steps: string[];
    }
  | { status: "unavailable"; reason: string };

export interface RouteAdapter {
  load(request: RouteRequest, signal: AbortSignal): Promise<RouteResult>;
}

export interface PlaceRequest {
  query: string;
  providerPlaceId?: string;
}

export type PlaceResult =
  | { status: "ready"; place: PlaceRef }
  | { status: "unavailable"; reason: string };

export interface PlaceAdapter {
  resolve(request: PlaceRequest, signal: AbortSignal): Promise<PlaceResult>;
}

export interface NavigationInput {
  origin: string;
  destination: string;
  travelMode: "walking" | "driving" | "transit";
}

export interface NavigationAdapter {
  directions(input: NavigationInput): string;
}
