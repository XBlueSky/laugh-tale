import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { CameraIntent, MapLayoutSnapshot, PlaceRef, RouteMode, Trip } from "@laugh-tale-island/core";
import type { MapAdapterV2, MapPresentationV2 } from "@laugh-tale-island/core/browser";
import { App } from "../../../src/app/App";
import { createMapLibreRuntime } from "../../../src/app/maplibre-runtime";
import { e2eTrip, e2eClock } from "../../e2e/fixtures/e2e-trip";

// Test-only authored input. This entry never runs production bootstrap or fake providers.
const unresolved = new URLSearchParams(location.search).has("unresolved");
const withoutCoordinates = (place: PlaceRef | undefined): PlaceRef | undefined => place === undefined ? undefined : { ...place, identity: { status: "unresolved", reason: "not-reviewed" } };
const trip: Trip = unresolved ? { ...e2eTrip,
  days: e2eTrip.days.map(day => ({ ...day, nodes: day.nodes.map(node => ({ ...node, place: withoutCoordinates(node.place) })) })),
  candidateGroups: e2eTrip.candidateGroups.map(group => ({ ...group, options: group.options.map(option => ({ ...option, place: withoutCoordinates(option.place) })) })),
} : e2eTrip;
const runtime = await createMapLibreRuntime({
  tileJSONUrl: `${location.origin}/tilejson.json`, allowLocalhostHTTP: true,
  initialView: { center: { lat: -0.02197, lng: 0.02197 }, zoom: 13 },
});
declare global {
  interface Window {
    mapLibreFixture: { intent: CameraIntent | null; layout: MapLayoutSnapshot | null; routeSelection: string | null; probeRoute(mode: RouteMode): void; moveMap(): void };
  }
}
let active: MapAdapterV2 | undefined;
let probing = false;
let renderProbe: ((data: MapPresentationV2) => void) | undefined;
let cameraProbe: ((intent: CameraIntent) => void) | undefined;
window.mapLibreFixture = { intent: null, layout: null, routeSelection: null, probeRoute(mode) {
  const layout = window.mapLibreFixture.layout;
  if (!layout || !active) throw new Error("Map not mounted");
  probing = true;
  window.mapLibreFixture.routeSelection = null;
  renderProbe?.({ markers: [], routes: [{ edgeId: "route-start-shuttle", mode, source: "manual", certainty: "confirmed", selected: true,
    geometry: [{ lat: 35.68, lng: 139.755 }, { lat: 35.68, lng: 139.765 }] }] });
  cameraProbe?.({ ...layout, kind: "focus", coordinate: { lat: 35.68, lng: 139.76 }, targetZoom: 14,
    intentId: `fixture-route-${mode}`, transition: "immediate" });
}, moveMap() {
  const layout = window.mapLibreFixture.layout;
  if (!layout || !active) throw new Error("Map not mounted");
  probing = true;
  cameraProbe?.({ ...layout, kind: "focus", coordinate: { lat: 20, lng: 20 }, targetZoom: 13,
    intentId: "fixture-tile-health", transition: "animate" });
} };
const createMap = runtime.createMap;
runtime.createMap = () => {
  const adapter = createMap(); active = adapter;
  const mount = adapter.mount.bind(adapter);
  const setLayout = adapter.setLayout?.bind(adapter);
  const camera = adapter.applyCameraIntent.bind(adapter);
  const render = adapter.render.bind(adapter);
  renderProbe = render;
  cameraProbe = intent => { window.mapLibreFixture.intent = intent; camera(intent); };
  adapter.render = data => { if (!probing) render(data); };
  adapter.mount = (element, config) => mount(element, { ...config,
    visualProfile: { ...config.visualProfile, routeStyle(route) {
      const style = config.visualProfile.routeStyle(route);
      // The generic public profile also supports casings; the stock Oak solid style does not request one.
      return route.mode === "driving" && style?.kind === "solid" ? { ...style, casing: { color: "#ffffff", width: 12, opacity: 1 } } : style;
    }, ...(new URLSearchParams(location.search).has("invalid-style") ? {
      basemap: { ...config.visualProfile.basemap, palette: { ...config.visualProfile.basemap.palette, geometry: "invalid-synthetic-color" } },
    } : {}) },
    events: { ...config.events, onRouteSelect(id) {
    window.mapLibreFixture.routeSelection = id; config.events.onRouteSelect(id);
  } } });
  adapter.setLayout = layout => { window.mapLibreFixture.layout = layout; setLayout?.(layout); };
  adapter.applyCameraIntent = intent => { if (!probing) { window.mapLibreFixture.intent = intent; camera(intent); } };
  return adapter;
};
const host = document.getElementById("root");
if (host === null) throw new Error("Missing root");
createRoot(host).render(createElement(App, { trip, runtime, setupLocale: "en", clock: e2eClock }));
