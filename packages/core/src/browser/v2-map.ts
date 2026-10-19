import type { Coordinates, MarkerMode, RouteEdge, RouteMode, TimingCertainty } from "../model.js";
import type { ProviderUnavailableResult } from "../provider-failure.js";
import type { SemanticOwnerState } from "../semantic-state.js";

export type MarkerSemanticState = SemanticOwnerState;

export interface MarkerDescriptor {
  ownerId: string;
  label: string;
  coordinates: Coordinates;
  markerMode: Exclude<MarkerMode, "none">;
  displayIndex?: number;
  ordinal?: string;
  sourceKind: string;
  timing: TimingCertainty;
  states: readonly MarkerSemanticState[];
}

export interface MarkerContentHandle {
  element: HTMLElement;
  update(descriptor: MarkerDescriptor): void;
  dispose(): void;
}

export type MarkerContentFactory = (descriptor: MarkerDescriptor) => MarkerContentHandle;

export interface UserLocationDescriptor {
  coordinates: Coordinates;
}

export interface UserLocationContentHandle {
  element: HTMLElement;
  update(descriptor: UserLocationDescriptor): void;
  dispose(): void;
}

export type UserLocationContentFactory = (
  descriptor: UserLocationDescriptor,
) => UserLocationContentHandle;

export interface MapBasemapPalette {
  geometry: string;
  label: string;
  labelStroke: string;
  water: string;
  park: string;
  road: string;
}

export interface MapRoutePaint {
  color: string;
  opacity: number;
}

export interface MapRouteStroke extends MapRoutePaint {
  width: number;
}

export interface MapSolidRouteStyle {
  kind: "solid";
  stroke: MapRouteStroke;
  casing?: MapRouteStroke;
}

export type MapRouteSymbol =
  | {
      shape: "circle";
      repeatPx: number;
      scale: number;
      fill: MapRoutePaint;
      stroke?: MapRouteStroke;
    }
  | {
      shape: "dash";
      repeatPx: number;
      scale: number;
      fill?: MapRoutePaint;
      stroke: MapRouteStroke;
    };

export interface MapSymbolRouteStyle {
  kind: "symbol";
  symbol: MapRouteSymbol;
}

export type MapRouteStyle = MapSolidRouteStyle | MapSymbolRouteStyle;

export interface MapRoutePresentationV2 {
  edgeId: string;
  mode: RouteMode;
  source: RouteEdge["source"];
  certainty: RouteEdge["certainty"];
  geometry: readonly Coordinates[];
  selected: boolean;
}

export interface MapVisualProfile {
  id: string;
  basemap: {
    mode: "neutral" | "topographic" | "flat" | "technical" | "coastal" | "subdued";
    density: "low" | "medium" | "high";
    contrast: "soft" | "standard" | "high";
    poi: "minimal" | "standard";
    stationLabels: "hidden" | "legible";
    palette: MapBasemapPalette;
  };
  routeStyle(route: MapRoutePresentationV2): MapRouteStyle | null;
}

export interface MapPresentationV2 {
  markers: readonly MarkerDescriptor[];
  routes: readonly MapRoutePresentationV2[];
}

export interface MapEventsV2 {
  onMarkerSelect(ownerId: string): void;
  onRouteSelect(routeId: string): void;
  onUnavailable(result: ProviderUnavailableResult): void;
}

export interface MapMountConfig {
  events: MapEventsV2;
  visualProfile: MapVisualProfile;
  createMarkerContent: MarkerContentFactory;
  createUserLocationContent: UserLocationContentFactory;
}
