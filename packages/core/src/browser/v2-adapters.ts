import type { CameraIntent, CameraSnapshot, MapLayoutSnapshot } from "../map-camera.js";
import type { Coordinates } from "../model.js";
import type { NavigationTargetV2 } from "../navigation-target.js";
import type { PlaceProviderResult, PlaceRequestV2 } from "../place-runtime.js";
import type { RouteProviderResult, RouteRequestV2 } from "../route-runtime.js";
import type { MapMountConfig, MapPresentationV2 } from "./v2-map.js";

export interface MapAdapterV2 {
  mount(element: HTMLElement, config: MapMountConfig): Promise<void>;
  /** Committed viewport/occlusions, including when no geometry yields a camera intent. */
  setLayout?(layout: MapLayoutSnapshot | null): void;
  render(presentation: MapPresentationV2): void;
  applyCameraIntent(intent: CameraIntent): void;
  getCameraSnapshot(): CameraSnapshot | null;
  setUserLocation(location: Coordinates | null): void;
  destroy(): void;
}

export interface RouteAdapterV2 {
  load(request: RouteRequestV2, signal: AbortSignal): Promise<RouteProviderResult>;
}

export interface PlaceAdapterV2 {
  load(request: PlaceRequestV2, signal: AbortSignal): Promise<PlaceProviderResult>;
}

export type NavigationRequestV2 =
  | {
      readonly kind: "place";
      readonly destination: NavigationTargetV2;
    }
  | {
      readonly kind: "route";
      readonly origin: NavigationTargetV2;
      readonly destination: NavigationTargetV2;
      readonly travelMode: "walking" | "driving" | "transit";
    }
  | {
      readonly kind: "authored-external";
      readonly origin: string;
      readonly destination: string;
      readonly travelMode?: "walking" | "driving" | "transit";
    };

export interface NavigationAdapterV2 {
  readonly supportedPlaceProviders: readonly string[];
  open(request: NavigationRequestV2): boolean;
}
