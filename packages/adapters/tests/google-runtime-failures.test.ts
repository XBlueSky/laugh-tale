import { afterEach, expect, it, vi } from "vitest";
import { createGoogleMapsLoader } from "../src/google/google-config.js";
import { GoogleMapAdapter } from "../src/google/google-map-adapter.js";
import type { MapMountConfig } from "@laugh-tale-island/core/browser";

const host = globalThis as typeof globalThis & { gm_authFailure?: () => void };
afterEach(() => vi.unstubAllGlobals());

async function loadedRuntime() {
  return createGoogleMapsLoader({
    setOptions() {},
    async importLibrary(name) {
      return name === "maps" ? { Map: class { unbindAll() {} }, OverlayView: class {}, Polyline: class {} }
        : name === "marker" ? { AdvancedMarkerElement: class {}, CollisionBehavior: { REQUIRED: "REQUIRED", REQUIRED_AND_HIDES_OPTIONAL: "REQUIRED_AND_HIDES_OPTIONAL", OPTIONAL_AND_HIDES_LOWER_PRIORITY: "OPTIONAL_AND_HIDES_LOWER_PRIORITY" } }
        : { SymbolPath: { CIRCLE: "circle" }, Point: class { constructor(public x: number, public y: number) {} } };
    },
  }).load("fixture");
}

it("delivers the real loader bridge to current mounted adapters once and releases its final global owner", async () => {
  const previous = vi.fn(); vi.stubGlobal("gm_authFailure", previous);
  const runtime = await loadedRuntime();
  const config: MapMountConfig = {
    visualProfile: { id: "profile", basemap: { mode: "neutral", density: "low", contrast: "soft", poi: "minimal", stationLabels: "legible", palette: { geometry: "#eee", label: "#111", labelStroke: "#fff", water: "#abc", park: "#bca", road: "#ddd" } }, routeStyle: () => null },
    events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable: vi.fn() },
    createMarkerContent: () => { throw new Error("no marker work"); },
    createUserLocationContent: () => { throw new Error("no user work"); },
  };
  const first = new GoogleMapAdapter(runtime, { development: false });
  const second = new GoogleMapAdapter(runtime, { development: false });
  const firstEvent = vi.fn(); const oldSecondEvent = vi.fn(); const currentEvent = vi.fn();
  await first.mount({} as HTMLElement, { ...config, events: { ...config.events, onUnavailable: firstEvent } });
  await second.mount({} as HTMLElement, { ...config, events: { ...config.events, onUnavailable: oldSecondEvent } });
  await second.mount({} as HTMLElement, { ...config, events: { ...config.events, onUnavailable: currentEvent } });
  first.destroy();
  host.gm_authFailure?.(); host.gm_authFailure?.();
  expect(firstEvent).not.toHaveBeenCalled(); expect(oldSecondEvent).not.toHaveBeenCalled();
  expect(currentEvent).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "request-denied", retryable: false, diagnostic: "Google Maps authentication failed" });
  second.destroy();
  expect(host.gm_authFailure).toBe(previous);
});

it("bridges the real global authentication callback across loaders and restores the previous owner after the final unsubscribe", async () => {
  const previous = vi.fn();
  vi.stubGlobal("gm_authFailure", previous);
  const first = await loadedRuntime();
  const second = await loadedRuntime();
  const a = vi.fn(); const b = vi.fn();
  const stopA = first.subscribeFailures?.(a);
  const stopB = second.subscribeFailures?.(b);
  try {
    host.gm_authFailure?.();
    expect.soft(a).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "request-denied", retryable: false, diagnostic: "Google Maps authentication failed" });
    expect(b).toHaveBeenCalledTimes(1);
    expect(previous).toHaveBeenCalledTimes(1);
    stopA?.();
    host.gm_authFailure?.();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  } finally { stopA?.(); stopB?.(); }
  expect(host.gm_authFailure).toBe(previous);
});

it("does not overwrite a later global callback owner during teardown", async () => {
  const previous = vi.fn(); const replacement = vi.fn();
  vi.stubGlobal("gm_authFailure", previous);
  const runtime = await loadedRuntime();
  const stop = runtime.subscribeFailures?.(vi.fn());
  host.gm_authFailure = replacement;
  stop?.();
  expect(host.gm_authFailure).toBe(replacement);
});

it("forwards a nested delegating callback chain to the original owner once", async () => {
  const calls: string[] = [];
  vi.stubGlobal("gm_authFailure", () => calls.push("original"));
  const runtime = await loadedRuntime();
  const stopA = runtime.subscribeFailures!(() => calls.push("subscriber-a"));
  const bridgeA = host.gm_authFailure!;
  const external = () => { calls.push("external"); bridgeA(); };
  host.gm_authFailure = external;
  const stopB = runtime.subscribeFailures!(() => calls.push("subscriber-b"));
  try {
    host.gm_authFailure!();
    expect(calls).toEqual(["subscriber-a", "subscriber-b", "external", "original"]);
    calls.length = 0;
    stopA(); stopA();
    host.gm_authFailure!();
    expect(calls).toEqual(["subscriber-b", "external", "original"]);
    stopB(); stopB();
    expect(host.gm_authFailure).toBe(external);
    calls.length = 0;
    host.gm_authFailure!();
    expect(calls).toEqual(["external", "original"]);
  } finally { stopA(); stopB(); }
});

it.each(["subscriber", "external", "original"] as const)("contains a nested %s reentry without losing reachable owners or redispatching subscribers", async (reentry) => {
  const calls: string[] = [];
  vi.stubGlobal("gm_authFailure", () => {
    calls.push("original");
    if (reentry === "original") host.gm_authFailure!();
  });
  const runtime = await loadedRuntime();
  const stopA = runtime.subscribeFailures!(() => {
    calls.push("subscriber-a");
    if (reentry === "subscriber") host.gm_authFailure!();
  });
  const bridgeA = host.gm_authFailure!;
  host.gm_authFailure = () => {
    calls.push("external");
    if (reentry === "external") host.gm_authFailure!();
    bridgeA();
  };
  const stopB = runtime.subscribeFailures!(() => calls.push("subscriber-b"));
  try {
    for (let event = 0; event < 2; event += 1) {
      calls.length = 0;
      expect(() => host.gm_authFailure!()).not.toThrow();
      expect(calls).toEqual(["subscriber-a", "subscriber-b", "external", "original"]);
    }
    const newer = vi.fn(); host.gm_authFailure = newer;
    stopA(); stopB();
    expect(host.gm_authFailure).toBe(newer);
  } finally { stopA(); stopB(); }
});

it("releases nested dispatch guards after a predecessor throws while isolating subscriber exceptions", async () => {
  const originalFailure = new Error("original failure");
  const calls: string[] = [];
  vi.stubGlobal("gm_authFailure", () => { calls.push("original"); throw originalFailure; });
  const runtime = await loadedRuntime();
  const stopA = runtime.subscribeFailures!(() => { calls.push("subscriber-a"); throw new Error("subscriber failure"); });
  const bridgeA = host.gm_authFailure!;
  host.gm_authFailure = () => { calls.push("external"); bridgeA(); };
  const stopB = runtime.subscribeFailures!(() => calls.push("subscriber-b"));
  try {
    for (let event = 0; event < 2; event += 1) {
      calls.length = 0;
      expect(() => host.gm_authFailure!()).toThrow(originalFailure);
      expect(calls).toEqual(["subscriber-a", "subscriber-b", "external", "original"]);
    }
  } finally { stopA(); stopB(); }
});

it("keeps other subscribers observable when a subscriber or previous callback throws", async () => {
  vi.stubGlobal("gm_authFailure", () => { throw new Error("external callback"); });
  const runtime = await loadedRuntime();
  const observed = vi.fn();
  const stopA = runtime.subscribeFailures?.(() => { throw new Error("subscriber"); });
  const stopB = runtime.subscribeFailures?.(observed);
  try {
    try { host.gm_authFailure?.(); } catch { /* The prior owner's exception is its own. */ }
    expect(observed).toHaveBeenCalledTimes(1);
  } finally { stopA?.(); stopB?.(); }
});
