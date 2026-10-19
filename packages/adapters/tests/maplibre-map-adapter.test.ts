// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MapMountConfig, MarkerDescriptor } from "@laugh-tale-island/core/browser";
import { MapLibreMapAdapter } from "../src/maplibre/maplibre-map-adapter.js";
import { profile } from "./helpers/maplibre-profile.js";
import { FakeMap, FakeMarker, tileJSON } from "./helpers/maplibre-runtime.js";
const loader = vi.hoisted(() => vi.fn());
vi.mock("../src/maplibre/runtime.js", () => ({ loadMapLibreRuntime: loader }));
const adapters: MapLibreMapAdapter[] = [];
const marker: MarkerDescriptor = { ownerId: "node-a", label: "A", coordinates: { lat: 0, lng: 1 }, markerMode: "numbered", sourceKind: "sightseeing", timing: "unknown", states: [] };
function fixture() {
  const host = document.createElement("div"); document.body.append(host);
  const content = document.createElement("button"); content.style.transform = "scale(1.1)";
  const handle = { element: content, update: vi.fn(), dispose: vi.fn() };
  const config = { visualProfile: profile, events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable: vi.fn() },
    createMarkerContent: vi.fn(() => handle), createUserLocationContent: () => ({ element: document.createElement("span"), update: vi.fn(), dispose: vi.fn() }) } satisfies MapMountConfig;
  const adapter = new MapLibreMapAdapter({ tileJSONUrl: "https://tiles.example/tilejson.json" }); adapters.push(adapter);
  return { host, handle, config, adapter };
}
beforeEach(() => {
  FakeMap.instances = []; FakeMarker.instances = []; FakeMap.defer = false;
  loader.mockReset().mockResolvedValue({ Map: FakeMap, Marker: FakeMarker });
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(tileJSON)))));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { for (const adapter of adapters.splice(0)) adapter.destroy(); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("isolates SDK positioning in an owned full-size surface without mutating the recipe host", async () => {
  const { adapter, host, config } = fixture(); host.className = "recipe-map";
  await adapter.mount(host, config);
  const surface = FakeMap.instances[0].options.container as HTMLElement;
  expect(surface).not.toBe(host);
  expect(surface.parentElement).toBe(host);
  expect(surface.style.position).toBe("absolute");
  expect(surface.style.inset).toBe("0px");
  expect(host.className).toBe("recipe-map");
  adapter.destroy(); expect(host.childElementCount).toBe(0);
});
it("mounts, updates exact recipe handles, selects one owner and disposes once", async () => {
  const { adapter, host, config, handle } = fixture(); await adapter.mount(host, config);
  adapter.render({ markers: [marker], routes: [] });
  expect(host.contains(handle.element)).toBe(true);
  expect(FakeMarker.instances[0].options.anchor).toBe("bottom");
  handle.element.click(); expect(config.events.onMarkerSelect).toHaveBeenCalledExactlyOnceWith("node-a");
  adapter.render({ markers: [{ ...marker, label: "changed", states: ["selected"] }], routes: [] });
  expect(handle.update).toHaveBeenLastCalledWith(expect.objectContaining({ label: "changed" }));
  expect(FakeMarker.instances).toHaveLength(1);
  expect(handle.element.style.transform).toBe("scale(1.1)");
  expect(handle.element.parentElement?.style.zIndex).toBe("4");
  adapter.render({ markers: [], routes: [] }); adapter.destroy(); adapter.destroy();
  expect(handle.dispose).toHaveBeenCalledOnce(); expect(FakeMap.instances[0].remove).toHaveBeenCalledOnce();
  expect(host.childElementCount).toBe(0);
});
it("does not revive a destroyed pending SDK load", async () => {
  let settle!: (value: unknown) => void;
  loader.mockReturnValue(new Promise(resolve => { settle = resolve; }));
  const { adapter, host, config } = fixture();
  const mounting = adapter.mount(host, config); const rejected = expect(mounting).rejects.toBeDefined();
  adapter.destroy(); settle({ Map: FakeMap, Marker: FakeMarker }); await rejected;
  expect(FakeMap.instances).toHaveLength(0); expect(config.events.onUnavailable).not.toHaveBeenCalled();
});
it("reports unsupported configuration before mount rejection", async () => {
  const { host, config } = fixture(); const adapter = new MapLibreMapAdapter({ tileJSONUrl: "http://unsafe.example/x" }); adapters.push(adapter);
  await expect(adapter.mount(host, config)).rejects.toBeDefined();
  expect(config.events.onUnavailable).toHaveBeenCalledWith({ status: "unavailable", reason: "unsupported", retryable: false });
  expect(loader).not.toHaveBeenCalled();
});
it("reserves legal layout without inventing a camera action", async () => {
  const { adapter, host, config } = fixture(); await adapter.mount(host, config);
  adapter.setLayout({ viewport: { width: 390, height: 844 }, occlusions: [], usableRegion: { x: 0, y: 80, width: 390, height: 300 }, edgeInsets: { top: 80, right: 0, bottom: 464, left: 0 } });
  expect(host.querySelector("a")?.href).toBe("https://www.openstreetmap.org/copyright");
  expect(FakeMap.instances[0].jumpTo).not.toHaveBeenCalled();
  adapter.applyCameraIntent({ kind: "focus", coordinate: marker.coordinates, targetZoom: 14, intentId: "focus", transition: "immediate", viewport: { width: 390, height: 844 }, usableRegion: { x: 0, y: 80, width: 390, height: 300 }, edgeInsets: { top: 80, right: 0, bottom: 464, left: 0 } });
  expect(FakeMap.instances[0].jumpTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 14, bearing: 0, pitch: 0 }));
  expect(FakeMap.instances[0].easeTo).not.toHaveBeenCalled();
});
it("validates a shrinking legal region even when credit height is unchanged, after layout settles", async () => {
  const { adapter, host, config } = fixture(); await adapter.mount(host, config); vi.useFakeTimers();
  const credit = host.querySelector('[aria-label="Map attribution"]')!;
  vi.spyOn(credit, "getBoundingClientRect").mockReturnValue({ height: 22 } as DOMRect);
  const layout = { viewport: { width: 390, height: 844 }, occlusions: [], usableRegion: { x: 0, y: 0, width: 390, height: 100 }, edgeInsets: { top: 0, right: 0, bottom: 744, left: 0 } };
  adapter.setLayout(layout); await vi.advanceTimersByTimeAsync(300);
  adapter.setLayout({ ...layout, usableRegion: { ...layout.usableRegion, height: 20 } });
  await vi.advanceTimersByTimeAsync(300);
  expect(config.events.onUnavailable).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "unsupported", retryable: false });
});
it("does not fail transient legal wrapping before the next committed layout", async () => {
  const { adapter, host, config } = fixture(); await adapter.mount(host, config); vi.useFakeTimers();
  const credit = host.querySelector('[aria-label="Map attribution"]')!;
  vi.spyOn(credit, "getBoundingClientRect").mockReturnValue({ height: 70 } as DOMRect);
  const layout = { viewport: { width: 390, height: 844 }, occlusions: [], usableRegion: { x: 0, y: 0, width: 390, height: 44 }, edgeInsets: { top: 0, right: 0, bottom: 800, left: 0 } };
  adapter.setLayout(layout);
  await vi.advanceTimersByTimeAsync(100);
  expect(config.events.onUnavailable).not.toHaveBeenCalled();
  adapter.setLayout({ ...layout, usableRegion: { ...layout.usableRegion, height: 88 } });
  await vi.advanceTimersByTimeAsync(300); expect(config.events.onUnavailable).not.toHaveBeenCalled();
});
it("keeps a partly loaded viewport healthy but fails a fully failing new viewport", async () => {
  const { adapter, host, config } = fixture(); await adapter.mount(host, config); vi.useFakeTimers();
  const map = FakeMap.instances[0];
  map.emit("sourcedata", { sourceId: "shortbread", tile: { state: "loaded" }, coord: map.covered[0] });
  map.emit("error", { sourceId: "shortbread", error: new Error("tile offline") });
  await vi.advanceTimersByTimeAsync(30000); expect(config.events.onUnavailable).not.toHaveBeenCalled();
  map.emit("movestart", {}); map.covered = [{ canonical: { z: 11, x: 1800, y: 800 } }]; map.emit("moveend", {});
  map.emit("error", { sourceId: "shortbread", error: new Error("tiles offline") });
  await vi.advanceTimersByTimeAsync(15000);
  expect(config.events.onUnavailable).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "network", retryable: true });
});
it("bounds style initialization and removes listeners after destroy", async () => {
  vi.useFakeTimers(); FakeMap.defer = true;
  const { adapter, host, config } = fixture();
  const check = expect(adapter.mount(host, config)).rejects.toBeDefined();
  await vi.advanceTimersByTimeAsync(15000); await check;
  expect(config.events.onUnavailable).toHaveBeenCalledWith({ status: "unavailable", reason: "network", retryable: true });
  adapter.destroy();
  for (const listeners of FakeMap.instances[0].events.values()) expect(listeners.size).toBe(0);
});
it("does not count metadata content or settled errored tiles as a healthy initial viewport", async () => {
  const { adapter, host, config } = fixture(); await adapter.mount(host, config); vi.useFakeTimers();
  const map = FakeMap.instances[0]; map.loaded = true;
  map.emit("sourcedata", { sourceId: "shortbread", sourceDataType: "content" });
  map.emit("error", { sourceId: "shortbread", error: { status: 503 } });
  await vi.advanceTimersByTimeAsync(15000);
  expect(config.events.onUnavailable).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "network", retryable: true });
});
it("keeps an actually successful empty tile after movement despite an isolated failed tile", async () => {
  const { adapter, host, config } = fixture(); await adapter.mount(host, config); vi.useFakeTimers();
  const map = FakeMap.instances[0]; map.emit("movestart", {}); map.emit("moveend", {});
  map.emit("error", { sourceId: "shortbread", error: { status: 503 } });
  // Pinned SDK tile completion has tile/coord, not sourceDataType=content. An empty tile is valid.
  map.emit("sourcedata", { sourceId: "shortbread", tile: { state: "loaded" }, coord: map.covered[0] });
  await vi.advanceTimersByTimeAsync(30000);
  expect(config.events.onUnavailable).not.toHaveBeenCalled();
});
it("does not treat all errored tiles settling during movement as successful", async () => {
  const { adapter, host, config } = fixture(); await adapter.mount(host, config); vi.useFakeTimers();
  const map = FakeMap.instances[0]; map.emit("movestart", {});
  map.emit("error", { sourceId: "shortbread", error: { status: 503 } });
  map.loaded = true; map.emit("moveend", {});
  await vi.advanceTimersByTimeAsync(15000);
  expect(config.events.onUnavailable).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "network", retryable: true });
});
it("recognizes a retained empty tile after a small move without a new network event", async () => {
  const { adapter, host, config } = fixture(); await adapter.mount(host, config); vi.useFakeTimers();
  const map = FakeMap.instances[0];
  const tile = { state: "loaded" };
  map.emit("sourcedata", { sourceId: "shortbread", tile, coord: map.covered[0] });
  map.emit("movestart", {}); map.emit("moveend", {});
  map.emit("error", { sourceId: "shortbread", error: { status: 503 } });
  await vi.advanceTimersByTimeAsync(30000);
  expect(config.events.onUnavailable).not.toHaveBeenCalled();
});
it("does not count a late successful tile outside the current viewport", async () => {
  const { adapter, host, config } = fixture(); await adapter.mount(host, config); vi.useFakeTimers();
  const map = FakeMap.instances[0];
  map.emit("sourcedata", { sourceId: "shortbread", tile: { state: "loaded" }, coord: { canonical: { z: 11, x: 1, y: 1 } } });
  map.emit("error", { sourceId: "shortbread", error: { status: 503 } });
  await vi.advanceTimersByTimeAsync(15000);
  expect(config.events.onUnavailable).toHaveBeenCalledOnce();
});
it("starts the failure grace period after motion when tiles failed during motion", async () => {
  const { adapter, host, config } = fixture(); await adapter.mount(host, config); vi.useFakeTimers();
  const map = FakeMap.instances[0]; map.emit("movestart", {});
  map.emit("error", { sourceId: "shortbread", error: new Error("offline") });
  await vi.advanceTimersByTimeAsync(20000); expect(config.events.onUnavailable).not.toHaveBeenCalled();
  map.emit("moveend", {}); await vi.advanceTimersByTimeAsync(15000);
  expect(config.events.onUnavailable).toHaveBeenCalledWith({ status: "unavailable", reason: "network", retryable: true });
});
it("animates only explicit animated camera intents and updates location content", async () => {
  const { adapter, host, config } = fixture(); const dispose = vi.fn(); const update = vi.fn();
  config.createUserLocationContent = () => ({ element: document.createElement("span"), update, dispose });
  await adapter.mount(host, config); adapter.setUserLocation({ lat: 1, lng: 2 }); adapter.setUserLocation({ lat: 3, lng: 4 });
  adapter.applyCameraIntent({ kind: "recenter-user", coordinate: { lat: 3, lng: 4 }, targetZoom: 14, intentId: "location", transition: "animate", viewport: { width: 390, height: 844 }, usableRegion: { x: 0, y: 80, width: 390, height: 300 }, edgeInsets: { top: 80, right: 0, bottom: 464, left: 0 } });
  expect(FakeMap.instances[0].easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 14, duration: 300, essential: false }));
  expect(update).toHaveBeenCalledWith({ coordinates: { lat: 3, lng: 4 } });
  adapter.setUserLocation(null); adapter.destroy(); expect(dispose).toHaveBeenCalledOnce();
});
it.each([401, 403])("reports fatal source authorization %s once", async status => {
  const { adapter, host, config } = fixture(); await adapter.mount(host, config);
  const map = FakeMap.instances[0]; map.emit("error", { sourceId: "shortbread", error: { status } }); map.emit("error", { sourceId: "shortbread", error: { status } });
  expect(config.events.onUnavailable).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "request-denied", retryable: false });
  expect(map.remove).toHaveBeenCalledOnce();
});
