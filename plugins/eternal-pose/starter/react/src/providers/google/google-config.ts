import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { MapAdapter } from "@laugh-tale-island/core/browser";
import type { MapVisualProfile } from "../../controllers/presentation-contract";
import {
  GoogleMapAdapter,
  type GoogleMapAdapterOptions,
} from "./GoogleMapAdapter";

export interface GoogleMapsRuntime {
  Map: typeof google.maps.Map;
  Marker: typeof google.maps.Marker;
  AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement;
  Polyline: typeof google.maps.Polyline;
}

export interface GoogleMapsLoader {
  load(apiKey: string): Promise<GoogleMapsRuntime>;
}

export interface GoogleMapsLoaderBindings {
  setOptions(options: { key: string; v: string }): void;
  importLibrary(
    name: "maps" | "marker",
  ): Promise<google.maps.MapsLibrary | google.maps.MarkerLibrary>;
}

export type GoogleMapsConfigState =
  | { status: "missing-key" }
  | { status: "ready"; adapter: MapAdapter }
  | { status: "load-error"; reason: string };

export interface GoogleMapsConfigInput {
  apiKey?: string;
  mapId?: string;
  development: boolean;
  profile: MapVisualProfile;
}

export interface GoogleMapsDependencies {
  createLoader(): GoogleMapsLoader;
  createAdapter(
    runtime: GoogleMapsRuntime,
    options: GoogleMapAdapterOptions,
  ): MapAdapter;
}

function errorReason(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return typeof error === "string" && error.trim().length > 0
    ? error
    : "Google Maps failed to load";
}

const DIFFERENT_KEY_REASON =
  "Google Maps is already configured for a different key";
const DIFFERENT_MAP_ID_REASON =
  "Google Maps is already configured for a different map ID";
const DIFFERENT_PROFILE_REASON =
  "Google Maps is already configured for a different visual profile";
const DIFFERENT_ENVIRONMENT_REASON =
  "Google Maps is already configured for a different environment";

const defaultLoaderBindings: GoogleMapsLoaderBindings = {
  setOptions,
  importLibrary: (name) =>
    name === "maps" ? importLibrary("maps") : importLibrary("marker"),
};

export function createGoogleMapsLoader(
  bindings: GoogleMapsLoaderBindings = defaultLoaderBindings,
): GoogleMapsLoader {
  let configuredKey: string | undefined;
  let runtime: GoogleMapsRuntime | undefined;
  let inFlight: Promise<GoogleMapsRuntime> | undefined;

  return {
    load(rawApiKey: string): Promise<GoogleMapsRuntime> {
      const apiKey = rawApiKey.trim();
      if (apiKey.length === 0) {
        return Promise.reject(new Error("Google Maps API key is missing"));
      }
      if (configuredKey !== undefined && configuredKey !== apiKey) {
        return Promise.reject(new Error(DIFFERENT_KEY_REASON));
      }
      if (runtime !== undefined) {
        return Promise.resolve(runtime);
      }
      if (inFlight !== undefined) {
        return inFlight;
      }
      if (configuredKey === undefined) {
        try {
          bindings.setOptions({ key: apiKey, v: "weekly" });
          configuredKey = apiKey;
        } catch (error) {
          return Promise.reject(
            error instanceof Error ? error : new Error(errorReason(error)),
          );
        }
      }

      const attempt = Promise.resolve()
        .then(() =>
          Promise.all([
            bindings.importLibrary("maps"),
            bindings.importLibrary("marker"),
          ]),
        )
        .then(([mapsLibrary, markerLibrary]) => {
          const maps = mapsLibrary as google.maps.MapsLibrary;
          const marker = markerLibrary as google.maps.MarkerLibrary;
          return {
            Map: maps.Map,
            Marker: marker.Marker,
            Polyline: maps.Polyline,
            AdvancedMarkerElement: marker.AdvancedMarkerElement,
          };
        });
      inFlight = attempt;
      void attempt.then(
        (loadedRuntime) => {
          runtime = loadedRuntime;
          if (inFlight === attempt) {
            inFlight = undefined;
          }
        },
        () => {
          if (inFlight === attempt) {
            inFlight = undefined;
          }
        },
      );
      return attempt;
    },
  };
}

const defaultDependencies: GoogleMapsDependencies = {
  createLoader: createGoogleMapsLoader,
  createAdapter: (runtime, options) => new GoogleMapAdapter(runtime, options),
};

export type GoogleMapsConfigurator = (
  input: GoogleMapsConfigInput,
) => Promise<GoogleMapsConfigState>;

export function createGoogleMapsConfigurator(
  dependencies: GoogleMapsDependencies,
): GoogleMapsConfigurator {
  let configured:
    | {
        apiKey: string;
        mapId?: string;
        development: boolean;
        profile: MapVisualProfile;
      }
    | undefined;
  let loader: GoogleMapsLoader | undefined;
  let adapter: MapAdapter | undefined;
  let inFlight: Promise<GoogleMapsConfigState> | undefined;

  return (input) => {
    const apiKey = input.apiKey?.trim() ?? "";
    const trimmedMapId = input.mapId?.trim() ?? "";
    const mapId = trimmedMapId.length === 0 ? undefined : trimmedMapId;
    if (apiKey.length === 0) {
      return Promise.resolve({ status: "missing-key" });
    }
    if (configured !== undefined && configured.apiKey !== apiKey) {
      return Promise.resolve({
        status: "load-error",
        reason: DIFFERENT_KEY_REASON,
      });
    }
    if (configured !== undefined && configured.mapId !== mapId) {
      return Promise.resolve({
        status: "load-error",
        reason: DIFFERENT_MAP_ID_REASON,
      });
    }
    if (configured !== undefined && configured.profile.id !== input.profile.id) {
      return Promise.resolve({
        status: "load-error",
        reason: DIFFERENT_PROFILE_REASON,
      });
    }
    if (
      configured !== undefined &&
      configured.development !== input.development
    ) {
      return Promise.resolve({
        status: "load-error",
        reason: DIFFERENT_ENVIRONMENT_REASON,
      });
    }
    if (adapter !== undefined) {
      return Promise.resolve({ status: "ready", adapter });
    }
    if (inFlight !== undefined) {
      return inFlight;
    }

    configured ??= {
      apiKey,
      ...(mapId === undefined ? {} : { mapId }),
      development: input.development,
      profile: input.profile,
    };
    try {
      loader ??= dependencies.createLoader();
    } catch (error) {
      return Promise.resolve({
        status: "load-error",
        reason: errorReason(error),
      });
    }

    const attempt: Promise<GoogleMapsConfigState> = Promise.resolve()
      .then(() => loader!.load(apiKey))
      .then((runtime) => {
        const createdAdapter = dependencies.createAdapter(runtime, {
          development: configured!.development,
          ...(configured!.mapId === undefined
            ? {}
            : { mapId: configured!.mapId }),
          profile: configured!.profile,
        });
        adapter = createdAdapter;
        return { status: "ready", adapter: createdAdapter } as const;
      })
      .catch((error: unknown) => ({
        status: "load-error" as const,
        reason: errorReason(error),
      }));
    inFlight = attempt;
    void attempt.then(() => {
      if (inFlight === attempt) {
        inFlight = undefined;
      }
    });
    return attempt;
  };
}

const configureDefaultGoogleMaps =
  createGoogleMapsConfigurator(defaultDependencies);

export async function configureGoogleMaps(
  input: GoogleMapsConfigInput,
  dependencies: Partial<GoogleMapsDependencies> = {},
): Promise<GoogleMapsConfigState> {
  if (
    dependencies.createLoader === undefined &&
    dependencies.createAdapter === undefined
  ) {
    return configureDefaultGoogleMaps(input);
  }
  const configureIsolatedGoogleMaps = createGoogleMapsConfigurator({
    createLoader: () =>
      dependencies.createLoader === undefined
        ? defaultDependencies.createLoader()
        : dependencies.createLoader(),
    createAdapter: (runtime, options) =>
      dependencies.createAdapter === undefined
        ? defaultDependencies.createAdapter(runtime, options)
        : dependencies.createAdapter(runtime, options),
  });
  return configureIsolatedGoogleMaps(input);
}
