import { StrictMode, type ReactElement } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import type { RouteAdapter } from "@laugh-tale-island/core/browser";
import { GoogleNavigationAdapter } from "./providers/google/google-maps-url";
import { trip } from "./trip-content/trip";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Root element not found.");
}

const root = createRoot(rootElement);
const navigationAdapter = new GoogleNavigationAdapter();

function render(element: ReactElement): void {
  root.render(<StrictMode>{element}</StrictMode>);
}

function safeReason(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Google Maps failed to load";
}

function environmentString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function start(): Promise<void> {
  if (
    import.meta.env.DEV &&
    import.meta.env.VITE_E2E_FAKE_PROVIDER === "true"
  ) {
    const fixture = await import("../tests/e2e/fixtures/e2e-trip");
    render(
      <App
        tripOverride={fixture.e2eTrip}
        adapterFactory={fixture.createE2EMapAdapter}
        routeAdapterFactory={fixture.createE2ERouteAdapter}
        navigationAdapter={navigationAdapter}
        clock={fixture.e2eClock}
      />,
    );
    return;
  }

  if (trip === null) {
    render(<App tripOverride={null} />);
    return;
  }

  const apiKey = environmentString(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  ).trim();
  if (apiKey.length === 0) {
    render(<App tripOverride={trip} />);
    return;
  }

  const { configureGoogleMaps } = await import(
    "./providers/google/google-config"
  );
  const configured = await configureGoogleMaps({ apiKey });
  if (configured.status === "missing-key") {
    render(<App tripOverride={trip} />);
    return;
  }
  if (configured.status === "load-error") {
    render(
      <App
        tripOverride={trip}
        setupIssue={{ kind: "provider-load", reason: configured.reason }}
      />,
    );
    return;
  }

  let routeAdapterFactory: (() => RouteAdapter) | undefined;
  if (
    environmentString(import.meta.env.VITE_GOOGLE_ROUTES_ENABLED) === "true"
  ) {
    const { GoogleRouteAdapter } = await import(
      "./providers/google/GoogleRouteAdapter"
    );
    const transitEnabled =
      environmentString(import.meta.env.VITE_GOOGLE_TRANSIT_ENABLED) === "true";
    routeAdapterFactory = () =>
      new GoogleRouteAdapter({ apiKey, transitEnabled });
  }

  render(
    <App
      tripOverride={trip}
      adapterFactory={() => configured.adapter}
      navigationAdapter={navigationAdapter}
      {...(routeAdapterFactory === undefined ? {} : { routeAdapterFactory })}
    />,
  );
}

void start().catch((error: unknown) => {
  if (trip === null) {
    render(<App tripOverride={null} />);
    return;
  }
  render(
    <App
      tripOverride={trip}
      setupIssue={{ kind: "provider-load", reason: safeReason(error) }}
    />,
  );
});
