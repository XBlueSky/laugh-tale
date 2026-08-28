import type { Coordinates, PlaceRef, RouteEdge } from "./model.js";

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
  source: RouteEdge["source"];
  certainty: RouteEdge["certainty"];
  mode: RouteEdge["mode"];
}

export interface MapPresentation {
  places: MapPlacePresentation[];
  routes: MapRoutePresentation[];
  selectedPlaceOwnerId?: string;
  selectedRouteId?: string;
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

export interface PlaceRequest {
  query: string;
  providerPlaceId?: string;
}

export type PlaceResult =
  | { status: "ready"; place: PlaceRef }
  | { status: "unavailable"; reason: string };

export interface NavigationInput {
  origin: string;
  destination: string;
  travelMode: "walking" | "driving" | "transit";
}
