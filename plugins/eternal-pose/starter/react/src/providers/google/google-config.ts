import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { MapAdapter } from "@laugh-tale-island/core/browser";
import { GoogleMapAdapter } from "./GoogleMapAdapter";

export interface GoogleMapsRuntime {
  Map: typeof google.maps.Map;
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

const DIFFERENT_KEY_REASON =
  "Google Maps is already configured for a different key";

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
  createAdapter: (runtime) => new GoogleMapAdapter(runtime),
};

export type GoogleMapsConfigurator = (
  input: GoogleMapsConfigInput,
) => Promise<GoogleMapsConfigState>;

export function createGoogleMapsConfigurator(
  dependencies: GoogleMapsDependencies,
): GoogleMapsConfigurator {
  let configuredKey: string | undefined;
  let loader: GoogleMapsLoader | undefined;
  let adapter: MapAdapter | undefined;
  let inFlight: Promise<GoogleMapsConfigState> | undefined;

  return (input) => {
    const apiKey = input.apiKey?.trim() ?? "";
    if (apiKey.length === 0) {
      return Promise.resolve({ status: "missing-key" });
    }
    if (configuredKey !== undefined && configuredKey !== apiKey) {
      return Promise.resolve({
        status: "load-error",
        reason: DIFFERENT_KEY_REASON,
      });
    }
    if (adapter !== undefined) {
      return Promise.resolve({ status: "ready", adapter });
    }
    if (inFlight !== undefined) {
      return inFlight;
    }

    configuredKey = apiKey;
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
        const createdAdapter = dependencies.createAdapter(runtime);
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
    createAdapter: (runtime) =>
      dependencies.createAdapter === undefined
        ? defaultDependencies.createAdapter(runtime)
        : dependencies.createAdapter(runtime),
  });
  return configureIsolatedGoogleMaps(input);
}
