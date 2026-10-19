import type { Coordinates, OpeningHoursFacts, ProviderUnavailableResult, RouteProviderResult } from "@laugh-tale-island/core";
import type { CameraIntent, MapAdapterV2, MapMountConfig, MapPresentationV2, MarkerContentHandle, UserLocationContentHandle } from "@laugh-tale-island/core/browser";
import { GoogleMapAdapter, type GoogleMapsRuntime } from "@laugh-tale-island/adapters/google";
import { FakeClock } from "../../../packages/testing/src/fakes/FakeClock.js";
import { FakeNavigationAdapterV2 } from "../../../packages/testing/src/fakes/FakeNavigationAdapterV2.js";
import { FakePlaceAdapterV2 } from "../../../packages/testing/src/fakes/FakePlaceAdapterV2.js";
import { FakeProgressStore } from "../../../packages/testing/src/fakes/FakeProgressStore.js";
import { FakeRouteAdapterV2 } from "../../../packages/testing/src/fakes/FakeRouteAdapterV2.js";
import type { VisualCase, VisualVariant } from "./visual-trip.js";

/** Minimal provider placement host. It paints no map tiles and never loads a provider script. */
function fakeRuntime() {
  const placements: HTMLElement[] = [];
  const failures = new Set<(result: ProviderUnavailableResult) => void>();
  const position = (coordinate: Coordinates, host: HTMLElement) => ({ x: host.clientWidth * (0.2 + (coordinate.lng - 20) * 6), y: host.clientHeight * (0.26 + (coordinate.lat - 10) * 2) });
  class MapSurface {
    listeners = new Map<string, Set<() => void>>();
    readonly legal = document.createElement("button");
    zoom = 12;
    constructor(readonly element: HTMLElement) {
      element.dataset.fakeMap = "true";
      element.style.background = "var(--oak-map-surface)";
      const legal = this.legal;
      legal.type = "button"; legal.textContent = "Synthetic map attribution"; legal.dataset.fakeLegal = "true";
      Object.assign(legal.style, { position: "absolute", bottom: "var(--oak-safe-area-bottom)", right: "max(7px, var(--oak-safe-area-right))", minWidth: "44px", height: "44px", padding: "4px", background: "transparent", border: "0", color: "var(--oak-ink)", fontSize: "10px" });
      legal.addEventListener("click", () => { legal.dataset.activated = "true"; });
      element.append(legal);
    }
    addListener(name: string, callback: () => void) { const set = this.listeners.get(name) ?? new Set<() => void>(); set.add(callback); this.listeners.set(name, set); return { remove: () => { set.delete(callback); } }; }
    fitBounds() { for (const fn of this.listeners.get("idle") ?? []) fn(); }
    getZoom() { return this.zoom; }
    moveCamera(options: { zoom: number }) { this.zoom = options.zoom; }
    panBy() { /* deterministic camera state is recorded by the adapter wrapper */ }
    panTo() { /* deterministic camera state is recorded by the adapter wrapper */ }
    setZoom(zoom: number) { this.zoom = zoom; }
    getProjection() { return { fromLatLngToPoint: ({ lat, lng }: Coordinates) => ({ x: (lng + 180) * 256 / 360, y: 128 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 128 / Math.PI }), fromPointToLatLng: ({ x, y }: { x: number; y: number }) => ({ lat: () => Math.atan(Math.sinh((128 - y) * Math.PI / 128)) * 180 / Math.PI, lng: () => x * 360 / 256 - 180 }) }; }
    unbindAll() { this.listeners.clear(); this.legal.remove(); }
  }
  class Advanced {
    readonly element: HTMLElement;
    private host: MapSurface | null;
    private coordinates: Coordinates;
    private events = new Map<(event: unknown) => void, EventListener>();
    constructor(options: Record<string, unknown>) {
      this.host = options.map as MapSurface; this.coordinates = options.position as Coordinates;
      this.element = options.content as HTMLElement;
      const wrapper = document.createElement("div");
      Object.assign(wrapper.style, { position: "absolute", transform: "translate(-50%, -100%)" });
      wrapper.append(this.element); this.host.element.append(wrapper); placements.push(this.element); this.place();
    }
    private place() { if (!this.host) return; const point = position(this.coordinates, this.host.element); Object.assign(this.element.parentElement!.style, { left: `${point.x}px`, top: `${point.y}px` }); }
    get map(): unknown { return this.host; }
    set map(value: unknown) { this.host = value as MapSurface | null; if (!value) this.element.parentElement?.remove(); }
    get position(): unknown { return this.coordinates; }
    set position(value: unknown) { this.coordinates = value as Coordinates; this.place(); }
    addEventListener(_name: string, listener: (event: unknown) => void) { const fn: EventListener = event => listener(event); this.events.set(listener, fn); this.element.addEventListener("click", fn); }
    removeEventListener(_name: string, listener: (event: unknown) => void) { const fn = this.events.get(listener); if (fn) this.element.removeEventListener("click", fn); this.events.delete(listener); }
  }
  class Overlay {
    private host: MapSurface | null = null;
    setMap(value: unknown) { const own = this as unknown as { onAdd(): void; onRemove(): void; draw(): void }; if (this.host) own.onRemove(); this.host = value as MapSurface | null; if (this.host) { own.onAdd(); const element = this.host.element.lastElementChild?.firstElementChild as HTMLElement; placements.push(element); own.draw(); } }
    getPanes() { return this.host ? { overlayMouseTarget: this.host.element } : null; }
    getProjection() { return this.host ? { fromLatLngToDivPixel: (coordinate: unknown) => position(coordinate as Coordinates, this.host!.element) } : null; }
  }
  class Polyline {
    addListener() { return { remove() {} }; }
    setMap() { /* no dynamic map pixels */ }
    setOptions() { /* runtime route semantics are asserted independently */ }
  }
  const runtime: GoogleMapsRuntime = { Point: class { constructor(public x: number, public y: number) {} }, Map: MapSurface, AdvancedMarkerElement: Advanced, OverlayView: Overlay, Polyline, SymbolPath: { CIRCLE: "synthetic" }, CollisionBehavior: { REQUIRED: "required", REQUIRED_AND_HIDES_OPTIONAL: "selected", OPTIONAL_AND_HIDES_LOWER_PRIORITY: "optional" }, subscribeFailures(listener) { failures.add(listener); return () => { failures.delete(listener); }; } };
  return { runtime, placements, fail: (result: ProviderUnavailableResult) => { for (const listener of failures) listener(result); } };
}

export class BrowserMap implements MapAdapterV2 {
  readonly fake = fakeRuntime();
  readonly adapter: GoogleMapAdapter;
  readonly markers: MarkerContentHandle[] = [];
  readonly locations: UserLocationContentHandle[] = [];
  readonly cameras: CameraIntent[] = [];
  readonly renders: MapPresentationV2[] = [];
  markerDisposals = 0;
  locationDisposals = 0;
  mounted = false;
  constructor(backend: "advanced" | "overlay") { this.adapter = new GoogleMapAdapter(this.fake.runtime, { development: false, ...(backend === "advanced" ? { mapId: "synthetic-map", cloudStyleProfileId: "oak-washi" } : {}) }); }
  async mount(element: HTMLElement, config: MapMountConfig) {
    await this.adapter.mount(element, { ...config, createMarkerContent: descriptor => {
      const handle = config.createMarkerContent(descriptor); this.markers.push(handle);
      return { element: handle.element, update: next => handle.update(next), dispose: () => { this.markerDisposals++; handle.dispose(); } };
    }, createUserLocationContent: descriptor => {
      const handle = config.createUserLocationContent(descriptor); this.locations.push(handle);
      return { element: handle.element, update: next => handle.update(next), dispose: () => { this.locationDisposals++; handle.dispose(); } };
    } }); this.mounted = true;
  }
  render(value: MapPresentationV2) { this.renders.push(structuredClone(value)); this.adapter.render(value); }
  applyCameraIntent(value: CameraIntent) { this.cameras.push(structuredClone(value)); this.adapter.applyCameraIntent(value); }
  getCameraSnapshot() { return this.adapter.getCameraSnapshot(); }
  setUserLocation(value: Coordinates | null) { this.adapter.setUserLocation(value); }
  destroy() { this.adapter.destroy(); this.mounted = false; }
}

export function providerStates(visualCase: VisualCase, variant: VisualVariant) {
  const state = variant.scenario.state;
  let instant = "2042-03-04T14:20:00.000Z";
  if (visualCase.id === "opening-hours-matrix") instant = state === "overnight" ? "2042-03-04T23:00:00.000Z" : state === "cross-midnight" ? "2042-03-05T01:00:00.000Z" : "2042-03-04T10:00:00.000Z";
  const clock = new FakeClock(instant);
  const map = new BrowserMap(variant.scenario.backend);
  const routes = new FakeRouteAdapterV2((request, attempt): RouteProviderResult | Promise<RouteProviderResult> => {
    const target = request.edge.id === "route-walking";
    if (target && ((visualCase.id === "route-state-matrix" && state === "loading") || (visualCase.id === "loading-owned" && state === "route"))) return new Promise(() => {});
    if (target && ["unavailable", "external", "authored-fallback", "retry"].includes(state) && !(state === "retry" && attempt > 1)) return { status: "unavailable", reason: "network", retryable: state !== "external" };
    const a = request.origin.identity.coordinates; const b = request.destination.identity.coordinates;
    if (!a || !b) return { status: "unavailable", reason: "not-found", retryable: false };
    return { status: "ready", durationMinutes: state === "implausible-duration" && target ? 721 : request.edge.mode === "flight" ? 90 : 12, distanceMeters: 1500, steps: ["Follow the synthetic path"], geometry: state === "remote-point" && target ? [a, { lat: 50, lng: 60 }, b] : [a, b], ...(request.edge.mode === "transit" ? { transit: { lines: [{ shortName: "S1", name: "Synthetic line" }] } } : {}) };
  });
  let openingHours: OpeningHoursFacts | undefined;
  if (visualCase.id === "opening-hours-matrix") {
    if (state === "incomplete") openingHours = { kind: "weekly", completeness: "incomplete", periods: [] };
    else if (state !== "absent") openingHours = { kind: "weekly", completeness: "complete", periods: [{ open: { day: 2, hour: state === "known-closed" ? 11 : state === "overnight" || state === "cross-midnight" ? 22 : 9, minute: 0 }, close: { day: state === "overnight" || state === "cross-midnight" ? 3 : 2, hour: state === "overnight" || state === "cross-midnight" ? 2 : 17, minute: 0 } }] };
  }
  const places = new FakePlaceAdapterV2(request => {
    if (visualCase.id === "loading-owned" && state === "place" && request.ownerId === "node-transfer") return new Promise(() => {});
    return { status: "ready", facts: { businessStatus: "operational", ...(openingHours ? { openingHours } : {}) } };
  });
  const progress = new FakeProgressStore(state === "memory-only" ? { readAvailable: false, writeAvailable: false } : {});
  const navigation = new FakeNavigationAdapterV2(true, ["synthetic"]);
  const bootstrap = visualCase.id === "setup-states" && state !== "missing-content" ? { map: { status: "unavailable", reason: state === "missing-key" ? "missing-configuration" : "loader-failed", retryable: state === "loader-failure" } as const } : undefined;
  return { clock, map, routes, places, progress, navigation, bootstrap, runtime: { ...(bootstrap ? {} : { createMap: () => map }), createRoutes: () => routes, createPlaces: () => places, navigation } };
}
