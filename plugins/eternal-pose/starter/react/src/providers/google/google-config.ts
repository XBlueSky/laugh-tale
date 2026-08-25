import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { MapAdapter } from "../../experience-shell/provider-contracts";
import { GoogleMapAdapter } from "./GoogleMapAdapter";

export interface GoogleMapsRuntime {
  Map: typeof google.maps.Map;
  AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement;
  Polyline: typeof google.maps.Polyline;
}

export interface GoogleMapsLoader {
  load(apiKey: string): Promise<GoogleMapsRuntime>;
}

export type GoogleMapsConfigState =
  | { status: "missing-key" }
  | { status: "ready"; adapter: MapAdapter }
  | { status: "load-error"; reason: string };

export interface GoogleMapsConfigInput {
  apiKey?: string;
}

export interface GoogleMapsDependencies {
  createLoader(): GoogleMapsLoader;
  createAdapter(runtime: GoogleMapsRuntime): MapAdapter;
}

function errorReason(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return typeof error === "string" && error.trim().length > 0
    ? error
    : "Google Maps failed to load";
}

export function createGoogleMapsLoader(): GoogleMapsLoader {
  return {
    async load(apiKey: string): Promise<GoogleMapsRuntime> {
      setOptions({ key: apiKey, v: "weekly" });
      const [maps, marker] = await Promise.all([
        importLibrary("maps"),
        importLibrary("marker"),
      ]);
      return {
        Map: maps.Map,
        Polyline: maps.Polyline,
        AdvancedMarkerElement: marker.AdvancedMarkerElement,
      };
    },
  };
}

const defaultDependencies: GoogleMapsDependencies = {
  createLoader: createGoogleMapsLoader,
  createAdapter: (runtime) => new GoogleMapAdapter(runtime),
};

export async function configureGoogleMaps(
  input: GoogleMapsConfigInput,
  dependencies: Partial<GoogleMapsDependencies> = {},
): Promise<GoogleMapsConfigState> {
  const apiKey = input.apiKey?.trim() ?? "";
  if (apiKey.length === 0) {
    return { status: "missing-key" };
  }

  try {
    const loader =
      dependencies.createLoader === undefined
        ? defaultDependencies.createLoader()
        : dependencies.createLoader();
    const runtime = await loader.load(apiKey);
    const adapter =
      dependencies.createAdapter === undefined
        ? defaultDependencies.createAdapter(runtime)
        : dependencies.createAdapter(runtime);
    return { status: "ready", adapter };
  } catch (error) {
    return { status: "load-error", reason: errorReason(error) };
  }
}
