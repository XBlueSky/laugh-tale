import type { Coordinates, PlaceRef, RouteEdge } from "../trip-core/model";

const MAP_PLACE_OWNER_PREFIX = "map-place-owner:";

/**
 * Provider-neutral identity carried by map presentations and place-selection
 * events. UI consumers can decode a token before applying raw node/candidate
 * selection; the user-location token remains a camera-only target.
 */
export type MapPlaceOwner =
  | { kind: "node"; id: string }
  | { kind: "candidate"; id: string }
  | { kind: "user-location" };

function encodedMapPlaceOwner(parts: readonly string[]): string {
  return `${MAP_PLACE_OWNER_PREFIX}${JSON.stringify(parts)}`;
}

export function nodeMapOwnerId(nodeId: string): string {
  return encodedMapPlaceOwner(["node", nodeId]);
}

export function candidateMapOwnerId(candidateOptionId: string): string {
  return encodedMapPlaceOwner(["candidate", candidateOptionId]);
}

export const USER_LOCATION_OWNER_ID = encodedMapPlaceOwner(["user-location"]);

export function decodeMapPlaceOwnerId(ownerId: string): MapPlaceOwner | undefined {
  if (!ownerId.startsWith(MAP_PLACE_OWNER_PREFIX)) {
    return undefined;
  }
  try {
    const decoded: unknown = JSON.parse(ownerId.slice(MAP_PLACE_OWNER_PREFIX.length));
    if (!Array.isArray(decoded)) {
      return undefined;
    }
    if (decoded.length === 1 && decoded[0] === "user-location") {
      return { kind: "user-location" };
    }
    const kind: unknown = decoded[0];
    const id: unknown = decoded[1];
    if (
      decoded.length === 2 &&
      (kind === "node" || kind === "candidate") &&
      typeof id === "string"
    ) {
      return { kind, id };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

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
