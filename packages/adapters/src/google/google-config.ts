import type { MapAdapterV2 } from "@laugh-tale-island/core/browser";
import type { Coordinates, ProviderUnavailableResult } from "@laugh-tale-island/core";
import { subscribeGoogleRuntimeFailures } from "./google-runtime-failures.js";
import { GoogleMapAdapter, type GoogleMapAdapterOptions } from "./google-map-adapter.js";
import { normalizeGoogleMapStyle, type GoogleMapStyleConfiguration } from "./google-map-style.js";

export interface GoogleMapsProjection {
  fromLatLngToPoint(coordinate: Coordinates): { x: number; y: number } | null;
  fromPointToLatLng(point: { x: number; y: number }): { lat(): number; lng(): number } | null;
}

export interface GoogleMapsMapInstance {
  addListener(name: string, callback: () => void): { remove(): void };
  fitBounds(bounds: unknown, padding: unknown): void;
  getZoom(): unknown;
  moveCamera(options: { center: unknown; zoom: number; heading?: number; tilt?: number }): void;
  getProjection(): GoogleMapsProjection | undefined;
  panBy(x: number, y: number): void;
  panTo(coordinate: unknown): void;
  setZoom(zoom: number): void;
  unbindAll(): void;
}

export interface GoogleMapsAdvancedMarkerInstance {
  map: unknown;
  position: unknown;
  zIndex?: number;
  collisionBehavior?: unknown;
  addEventListener(name: string, listener: (event: unknown) => void): void;
  removeEventListener(name: string, listener: (event: unknown) => void): void;
}

export interface GoogleMapsOverlayInstance {
  setMap(map: GoogleMapsMapInstance | null): void;
  getPanes(): { overlayMouseTarget: { appendChild(element: HTMLElement): unknown } } | null;
  getProjection(): {
    fromLatLngToDivPixel(coordinate: unknown): { x: number; y: number } | null;
  } | null;
}

export interface GoogleMapsPolylineInstance {
  addListener(name: string, callback: () => void): { remove(): void };
  setMap(map: GoogleMapsMapInstance | null): void;
  setOptions?(options: Record<string, unknown>): void;
}

export interface GoogleMapsRuntime {
  Point: new (x: number, y: number) => { x: number; y: number };
  subscribeFailures?(listener: (failure: ProviderUnavailableResult) => void): () => void;
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapsMapInstance;
  AdvancedMarkerElement: new (
    options: Record<string, unknown>,
  ) => GoogleMapsAdvancedMarkerInstance;
  OverlayView: new () => GoogleMapsOverlayInstance;
  Polyline: new (options: Record<string, unknown>) => GoogleMapsPolylineInstance;
  SymbolPath: { CIRCLE: unknown };
  CollisionBehavior: { REQUIRED: unknown; REQUIRED_AND_HIDES_OPTIONAL: unknown; OPTIONAL_AND_HIDES_LOWER_PRIORITY: unknown };
}

export interface GoogleMapsLoader {
  load(apiKey: string): Promise<GoogleMapsRuntime>;
}

export interface GoogleMapsLoaderBindings {
  subscribeFailures?(listener: (failure: ProviderUnavailableResult) => void): () => void;
  setOptions(options: { key: string; v: string }): void | Promise<void>;
  importLibrary(name: "maps" | "marker" | "core"): Promise<unknown>;
}

export interface GoogleMapsConfigInput {
  apiKey?: string;
  mapId?: string;
  cloudStyleProfileId?: string;
  development: boolean;
}

export type GoogleMapsConfigState =
  | { status: "missing-configuration" }
  | { status: "ready"; createMap: () => MapAdapterV2 }
  | {
      status: "unavailable";
      reason: "loader-failed";
      retryable: true;
      diagnostic?: string;
    };

interface GoogleMapsDependencies {
  createLoader(): GoogleMapsLoader;
  createAdapter(runtime: GoogleMapsRuntime, options: GoogleMapAdapterOptions): MapAdapterV2;
}

export type GoogleMapsConfigurator = (
  input: GoogleMapsConfigInput,
) => Promise<GoogleMapsConfigState>;

const differentKey = "Google Maps is already configured for a different key";
const differentMapId = "Google Maps is already configured for a different map ID";
const differentEnvironment = "Google Maps is already configured for a different environment";

function diagnostic(error: unknown): string {
  try {
    if (error instanceof Error) {
      const message: unknown = error.message;
      if (typeof message === "string") {
        const normalized = message.trim();
        if (normalized.length > 0) return normalized;
      }
    }
  } catch {
    // Hostile thrown values must still normalize to a typed loader failure.
  }
  try {
    if (typeof error === "string") {
      const normalized = error.trim();
      if (normalized.length > 0) return normalized;
    }
  } catch {
    // Fall through to the stable diagnostic without coercing hostile values.
  }
  return "Google Maps failed to load";
}

function unavailable(reason: string): GoogleMapsConfigState {
  return {
    status: "unavailable",
    reason: "loader-failed",
    retryable: true,
    diagnostic: reason,
  };
}

function record(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function member(value: unknown, name: PropertyKey): unknown {
  if (!record(value)) return undefined;
  try {
    return Object.hasOwn(value, name) ? value[name] : undefined;
  } catch {
    return undefined;
  }
}

function runtimeFrom(maps: unknown, marker: unknown, core: unknown): GoogleMapsRuntime {
  const Map = member(maps, "Map");
  const OverlayView = member(maps, "OverlayView");
  const Polyline = member(maps, "Polyline");
  const SymbolPath = member(core, "SymbolPath");
  const Circle = member(SymbolPath, "CIRCLE");
  const Point = member(core, "Point");
  const AdvancedMarkerElement = member(marker, "AdvancedMarkerElement");
  const collision = member(marker, "CollisionBehavior");
  const CollisionBehavior = {
    REQUIRED: member(collision, "REQUIRED"),
    REQUIRED_AND_HIDES_OPTIONAL: member(collision, "REQUIRED_AND_HIDES_OPTIONAL"),
    OPTIONAL_AND_HIDES_LOWER_PRIORITY: member(collision, "OPTIONAL_AND_HIDES_LOWER_PRIORITY"),
  };
  if (
    typeof Map !== "function" || typeof Point !== "function" ||
    typeof OverlayView !== "function" ||
    typeof Polyline !== "function" ||
    typeof AdvancedMarkerElement !== "function" ||
    !record(SymbolPath) ||
    Circle === undefined || Object.values(CollisionBehavior).some((value) => value === undefined)
  ) {
    throw new Error("Google Maps runtime is invalid");
  }
  return {
    Point,
    Map,
    OverlayView,
    Polyline,
    SymbolPath: { CIRCLE: Circle },
    AdvancedMarkerElement,
    CollisionBehavior,
  } as unknown as GoogleMapsRuntime;
}

type NormalizedConfigInput =
  | { valid: false }
  | { valid: true; apiKey: string; style: GoogleMapStyleConfiguration | undefined; development: boolean };

function normalizeInput(input: unknown): NormalizedConfigInput {
  if (!record(input)) return { valid: false };
  try {
    const rawApiKey = Object.hasOwn(input, "apiKey") ? input.apiKey : undefined;
    if (!Object.hasOwn(input, "development") || typeof input.development !== "boolean") {
      return { valid: false };
    }
    const apiKey = typeof rawApiKey === "string" ? rawApiKey.trim() : "";
    return {
      valid: true,
      apiKey,
      style: normalizeGoogleMapStyle(input),
      development: input.development,
    };
  } catch {
    return { valid: false };
  }
}

interface GoogleMapsLoaderModule {
  setOptions(options: { key: string; v: string }): void;
  importLibrary(name: "maps" | "marker" | "core"): Promise<unknown>;
}

async function loadDefaultModule(): Promise<GoogleMapsLoaderModule> {
  const loaded: unknown = await import("@googlemaps/js-api-loader");
  if (
    !record(loaded) ||
    typeof loaded.setOptions !== "function" ||
    typeof loaded.importLibrary !== "function"
  ) {
    throw new Error("Google Maps loader module is invalid");
  }
  return loaded as unknown as GoogleMapsLoaderModule;
}

const defaultBindings: GoogleMapsLoaderBindings = {
  setOptions: async (options) => (await loadDefaultModule()).setOptions(options),
  importLibrary: async (name) => (await loadDefaultModule()).importLibrary(name),
};

export function createGoogleMapsLoader(
  bindings: GoogleMapsLoaderBindings = defaultBindings,
): GoogleMapsLoader {
  let configuredKey: string | undefined;
  let optionsConfigured = false;
  let loadedRuntime: GoogleMapsRuntime | undefined;
  let inFlight: Promise<GoogleMapsRuntime> | undefined;

  return {
    load(rawApiKey: string): Promise<GoogleMapsRuntime> {
      const apiKey = typeof rawApiKey === "string" ? rawApiKey.trim() : "";
      if (apiKey.length === 0) return Promise.reject(new Error("Google Maps API key is missing"));
      if (configuredKey !== undefined && configuredKey !== apiKey) {
        return Promise.reject(new Error(differentKey));
      }
      if (loadedRuntime !== undefined) return Promise.resolve(loadedRuntime);
      if (inFlight !== undefined) return inFlight;
      let configured: void | Promise<void>;
      if (!optionsConfigured) {
        try {
          configured = bindings.setOptions({ key: apiKey, v: "weekly" });
          configuredKey ??= apiKey;
        } catch (error) {
          return Promise.reject(new Error(diagnostic(error)));
        }
      } else {
        configured = undefined;
      }

      const attempt = Promise.resolve(configured).then(async () => {
        optionsConfigured = true;
        const [maps, marker, core] = await Promise.all([
          bindings.importLibrary("maps"),
          bindings.importLibrary("marker"),
          bindings.importLibrary("core"),
        ]);
        return {
          ...runtimeFrom(maps, marker, core),
          subscribeFailures: bindings.subscribeFailures === undefined
            ? subscribeGoogleRuntimeFailures
            : (listener: (failure: ProviderUnavailableResult) => void) => bindings.subscribeFailures!(listener),
        };
      });
      inFlight = attempt;
      void attempt.then(
        (runtime) => {
          loadedRuntime = runtime;
          if (inFlight === attempt) inFlight = undefined;
        },
        () => {
          if (inFlight === attempt) inFlight = undefined;
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

export function createGoogleMapsConfigurator(
  dependencies: GoogleMapsDependencies,
): GoogleMapsConfigurator {
  let configured:
    | { apiKey: string; mapId?: string; cloudStyleProfileId?: string; development: boolean }
    | undefined;
  let loader: GoogleMapsLoader | undefined;
  let runtime: GoogleMapsRuntime | undefined;
  let inFlight: Promise<GoogleMapsConfigState> | undefined;
  let ready: GoogleMapsConfigState | undefined;

  return (input) => {
    const normalized = normalizeInput(input);
    if (!normalized.valid) return Promise.resolve(unavailable("Google Maps configuration is invalid"));
    const { apiKey, style, development } = normalized;
    if (apiKey.length === 0) return Promise.resolve({ status: "missing-configuration" });
    if (style === undefined) return Promise.resolve(unavailable("Google Map ID and cloud style profile must be a valid pair"));
    const { mapId, cloudStyleProfileId } = style;
    if (configured !== undefined && configured.apiKey !== apiKey) {
      return Promise.resolve(unavailable(differentKey));
    }
    if (configured !== undefined && configured.mapId !== mapId) {
      return Promise.resolve(unavailable(differentMapId));
    }
    if (configured !== undefined && configured.cloudStyleProfileId !== cloudStyleProfileId) {
      return Promise.resolve(unavailable("Google Maps is already configured for a different cloud style profile"));
    }
    if (configured !== undefined && configured.development !== development) {
      return Promise.resolve(unavailable(differentEnvironment));
    }
    if (ready !== undefined) return Promise.resolve(ready);
    if (inFlight !== undefined) return inFlight;

    configured ??= {
      apiKey,
      ...style,
      development,
    };
    try {
      loader ??= dependencies.createLoader();
    } catch (error) {
      return Promise.resolve(unavailable(diagnostic(error)));
    }
    const attempt = Promise.resolve()
      .then(() => loader!.load(apiKey))
      .then((loaded): GoogleMapsConfigState => {
        runtime = loaded;
        const options: GoogleMapAdapterOptions = {
          development: configured!.development,
          ...(configured!.mapId === undefined ? {} : { mapId: configured!.mapId }),
          ...(configured!.cloudStyleProfileId === undefined ? {} : { cloudStyleProfileId: configured!.cloudStyleProfileId }),
        };
        const state: GoogleMapsConfigState = {
          status: "ready",
          createMap: () => dependencies.createAdapter(runtime!, options),
        };
        ready = state;
        return state;
      })
      .catch((error: unknown) => unavailable(diagnostic(error)));
    inFlight = attempt;
    void attempt.then(() => {
      if (inFlight === attempt) inFlight = undefined;
    });
    return attempt;
  };
}

const defaultConfigurator = createGoogleMapsConfigurator(defaultDependencies);

export function configureGoogleMaps(
  input: GoogleMapsConfigInput,
  dependencies: Partial<GoogleMapsDependencies> = {},
): Promise<GoogleMapsConfigState> {
  if (dependencies.createLoader === undefined && dependencies.createAdapter === undefined) {
    return defaultConfigurator(input);
  }
  return createGoogleMapsConfigurator({
    createLoader: () =>
      (dependencies.createLoader ?? defaultDependencies.createLoader)(),
    createAdapter: (runtime, options) =>
      (dependencies.createAdapter ?? defaultDependencies.createAdapter)(runtime, options),
  })(input);
}
