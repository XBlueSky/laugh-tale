import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { configureGoogleMaps, GoogleNavigationAdapter, GooglePlaceAdapter, GoogleRouteAdapter } from "@laugh-tale-island/adapters/google";
import type { ProviderBootstrapState, TripDiagnosticSink, TripRuntimeAdapters } from "@laugh-tale-island/react";
import { App, type AppProps } from "./app/App";
import { presentation } from "./presentation";
import { trip } from "./trip-content/trip";
import { setupLocale } from "./trip-content/app-locale";
import { hasUnsupportedMapGeometry, MapProviderConfigurationError, readMapLibreOptions, readMapProvider } from "./app/map-provider";

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("Root element not found.");
const root = createRoot(rootElement);
const navigation = new GoogleNavigationAdapter();
const environmentString = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const apiKey = environmentString(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
const redact = (value: string): string => apiKey.length === 0 ? value : value.replaceAll(apiKey, "[redacted]");
const onDiagnostic: TripDiagnosticSink | undefined = import.meta.env.DEV ? (event) => {
  // Never pass unknown cause objects (or provider credentials) to the console.
  let cause: string | undefined;
  try {
    if (typeof event.cause === "string") cause = redact(event.cause);
    else if (event.cause instanceof Error && typeof event.cause.message === "string") cause = redact(event.cause.message);
  } catch { /* Hostile cause access has no useful safe display value. */ }
  console.warn("Trip diagnostic", {
    scope: event.scope,
    phase: event.phase,
    ...(event.scope === "provider" ? { channel: event.channel, reason: event.reason } : { category: event.category }),
    ...(event.diagnostic === undefined ? {} : { diagnostic: redact(event.diagnostic) }),
    ...(cause === undefined ? {} : { cause }),
  });
} : undefined;
const missing = { status: "unavailable", reason: "missing-configuration", retryable: false } as const;

function render(props: AppProps): void {
  root.render(<StrictMode><App {...props} {...(onDiagnostic === undefined ? {} : { onDiagnostic })} /></StrictMode>);
}
async function start(): Promise<void> {
  if (import.meta.env.DEV && import.meta.env.VITE_E2E_FAKE_PROVIDER === "true") {
    const fixture = await import("../tests/e2e/fixtures/e2e-trip");
    render({ trip: fixture.e2eTrip, setupLocale, clock: fixture.e2eClock,
      runtime: { createMap: fixture.createE2EMapAdapter, createRoutes: fixture.createE2ERouteAdapter, navigation } });
    return;
  }
  if (trip === null) { render({ trip, setupLocale }); return; }
  const runtime: TripRuntimeAdapters = { navigation };
  const providerBootstrap: ProviderBootstrapState = {};
  const provider = readMapProvider(import.meta.env.VITE_MAP_PROVIDER);
  if (provider === "invalid" || provider === "maplibre" && hasUnsupportedMapGeometry(trip)) {
    render({ trip, setupLocale, runtime, providerBootstrap: { map: { status: "unavailable", reason: "unsupported", retryable: false }, routes: missing, places: missing } });
    return;
  }
  if (provider === "maplibre") {
    providerBootstrap.routes = missing; providerBootstrap.places = missing;
    let attempt = 0;
    const publish = () => render({ trip, setupLocale, runtime: { ...runtime }, providerBootstrap: { ...providerBootstrap } });
    const configure = async (): Promise<void> => {
      const ownAttempt = ++attempt;
      delete runtime.createMap; providerBootstrap.map = { status: "loading", retryable: false }; publish();
      try {
        const options = readMapLibreOptions(import.meta.env, import.meta.env.DEV);
        const { createMapLibreRuntime } = await import("./app/maplibre-runtime");
        const configured = await createMapLibreRuntime(options);
        if (ownAttempt !== attempt) return;
        runtime.createMap = configured.createMap; delete providerBootstrap.map;
      } catch (error) {
        if (ownAttempt !== attempt) return;
        providerBootstrap.map = { status: "unavailable", reason: error instanceof MapProviderConfigurationError ? "unsupported" : "loader-failed", retryable: !(error instanceof MapProviderConfigurationError) };
      }
      publish();
    };
    runtime.retryMapBootstrap = () => { void configure(); };
    await configure();
    return;
  }
  if (apiKey.length === 0) {
    render({ trip, setupLocale, runtime, providerBootstrap: { map: missing, routes: missing, places: missing } });
    return;
  }
  if (environmentString(import.meta.env.VITE_GOOGLE_ROUTES_ENABLED) === "true") {
    const transitEnabled = environmentString(import.meta.env.VITE_GOOGLE_TRANSIT_ENABLED) === "true";
    runtime.createRoutes = () => new GoogleRouteAdapter({ apiKey, transitEnabled });
  } else providerBootstrap.routes = missing;
  if (environmentString(import.meta.env.VITE_GOOGLE_PLACES_ENABLED) === "true") runtime.createPlaces = () => new GooglePlaceAdapter({ apiKey });
  else providerBootstrap.places = missing;
  const mapId = environmentString(import.meta.env.VITE_GOOGLE_MAP_ID);
  const cloudStyleProfileId = environmentString(import.meta.env.VITE_GOOGLE_CLOUD_STYLE_PROFILE_ID);
  const paired = (mapId.length === 0 && cloudStyleProfileId.length === 0) ||
    (mapId.length > 0 && cloudStyleProfileId === presentation.mapVisualProfile.id);
  if (!paired) {
    providerBootstrap.map = { status: "unavailable", reason: "loader-failed", retryable: false, diagnostic: "Map visual profile configuration mismatch" };
  } else {
    let attempt = 0;
    const publish = () => render({ trip, setupLocale, runtime: { ...runtime }, providerBootstrap: { ...providerBootstrap } });
    const configure = async (): Promise<void> => {
      const ownAttempt = ++attempt;
      delete runtime.createMap;
      providerBootstrap.map = { status: "loading", retryable: false };
      publish();
      try {
        const configured = await configureGoogleMaps({
          apiKey, development: import.meta.env.DEV,
          ...(mapId.length === 0 ? {} : { mapId, cloudStyleProfileId }),
        });
        if (ownAttempt !== attempt) return;
        if (configured.status === "ready") {
          runtime.createMap = configured.createMap;
          delete providerBootstrap.map;
        } else if (configured.status === "missing-configuration") {
          providerBootstrap.map = missing;
          providerBootstrap.routes = missing;
          providerBootstrap.places = missing;
          delete runtime.createRoutes;
          delete runtime.createPlaces;
        } else providerBootstrap.map = {
          status: "unavailable", reason: configured.reason, retryable: configured.retryable,
          ...(configured.diagnostic === undefined ? {} : { diagnostic: redact(configured.diagnostic) }),
        };
      } catch {
        if (ownAttempt !== attempt) return;
        providerBootstrap.map = { status: "unavailable", reason: "loader-failed", retryable: true, diagnostic: "Map bootstrap failed" };
      }
      publish();
    };
    runtime.retryMapBootstrap = () => { void configure(); };
    await configure();
    return;
  }
  render({ trip, setupLocale, runtime, providerBootstrap });
}
void start().catch(() => {
  render({ trip, setupLocale, runtime: { navigation }, providerBootstrap: { map: { status: "unavailable", reason: "loader-failed", retryable: false } } });
});
