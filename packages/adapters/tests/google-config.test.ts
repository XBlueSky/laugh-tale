import type { MapAdapterV2 } from "@laugh-tale-island/core/browser";
import { describe, expect, it, vi } from "vitest";
import {
  configureGoogleMaps,
  createGoogleMapsConfigurator,
  createGoogleMapsLoader,
  type GoogleMapsConfigInput,
  type GoogleMapsRuntime,
} from "../src/google/google-config.js";

function runtime(): GoogleMapsRuntime {
  return {
    Map: class FakeConfiguredMap {},
    AdvancedMarkerElement: class FakeConfiguredAdvancedMarker {},
    OverlayView: class FakeConfiguredOverlay {},
    Polyline: class FakeConfiguredPolyline {},
    SymbolPath: { CIRCLE: "provider-circle" },
    Point: class { constructor(public x: number, public y: number) {} },
    CollisionBehavior: { REQUIRED: "REQUIRED", REQUIRED_AND_HIDES_OPTIONAL: "REQUIRED_AND_HIDES_OPTIONAL", OPTIONAL_AND_HIDES_LOWER_PRIORITY: "OPTIONAL_AND_HIDES_LOWER_PRIORITY" },
  } as unknown as GoogleMapsRuntime;
}

describe("Google Maps loader", () => {
  it("loads maps and marker libraries once, shares in-flight work, and exposes no classic marker", async () => {
    const loaded = runtime();
    let resolveMaps!: (value: unknown) => void;
    const maps = new Promise<unknown>((resolve) => {
      resolveMaps = resolve;
    });
    const setOptions = vi.fn();
    const importLibrary = vi.fn((name: "maps" | "marker" | "core") =>
      name === "maps"
        ? maps
        : Promise.resolve(name === "marker"
          ? { AdvancedMarkerElement: loaded.AdvancedMarkerElement, CollisionBehavior: loaded.CollisionBehavior }
          : { SymbolPath: loaded.SymbolPath, Point: loaded.Point }),
    );
    const loader = createGoogleMapsLoader({ setOptions, importLibrary });

    const first = loader.load(" key ");
    const second = loader.load("key");
    expect(first).toBe(second);
    resolveMaps({
      Map: loaded.Map,
      OverlayView: loaded.OverlayView,
      Polyline: loaded.Polyline,
    });

    const result = await first;
    expect(result).toMatchObject(loaded);
    expect(setOptions).toHaveBeenCalledExactlyOnceWith({ key: "key", v: "weekly" });
    expect(importLibrary.mock.calls.map(([name]) => name)).toEqual(["maps", "marker", "core"]);
    expect(result).not.toHaveProperty("Marker");
    await expect(loader.load("other-key")).rejects.toThrow(/different key/i);
    expect(importLibrary).toHaveBeenCalledTimes(3);
  });

  it("retries library loading after a failed attempt without resetting the configured key", async () => {
    const loaded = runtime();
    let mapAttempts = 0;
    const setOptions = vi.fn();
    const importLibrary = vi.fn(async (name: "maps" | "marker" | "core") => {
      if (name === "marker") return { AdvancedMarkerElement: loaded.AdvancedMarkerElement, CollisionBehavior: loaded.CollisionBehavior };
      if (name === "core") return { SymbolPath: loaded.SymbolPath, Point: loaded.Point };
      mapAttempts += 1;
      if (mapAttempts === 1) throw new Error("temporary load failure");
      return {
        Map: loaded.Map,
        OverlayView: loaded.OverlayView,
        Polyline: loaded.Polyline,
      };
    });
    const loader = createGoogleMapsLoader({ setOptions, importLibrary });

    await expect(loader.load("key")).rejects.toThrow("temporary load failure");
    await expect(loader.load("key")).resolves.toMatchObject(loaded);
    expect(setOptions).toHaveBeenCalledTimes(1);
    expect(mapAttempts).toBe(2);
  });

  it("retries an asynchronously failed loader configuration for the same key", async () => {
    const loaded = runtime();
    let optionAttempts = 0;
    const setOptions = vi.fn(async () => {
      optionAttempts += 1;
      if (optionAttempts === 1) throw new Error("options failed");
    });
    const importLibrary = vi.fn(async (name: "maps" | "marker" | "core") => {
      if (name === "maps") {
        return { Map: loaded.Map, OverlayView: loaded.OverlayView, Polyline: loaded.Polyline };
      }
      if (name === "marker") return { AdvancedMarkerElement: loaded.AdvancedMarkerElement, CollisionBehavior: loaded.CollisionBehavior };
      return { SymbolPath: loaded.SymbolPath, Point: loaded.Point };
    });
    const loader = createGoogleMapsLoader({ setOptions, importLibrary });

    await expect(loader.load("key")).rejects.toThrow("options failed");
    await expect(loader.load("key")).resolves.toMatchObject(loaded);
    expect(setOptions).toHaveBeenCalledTimes(2);
    expect(importLibrary).toHaveBeenCalledTimes(3);
  });

  it("rejects a structurally incomplete provider runtime instead of returning unusable mechanics", async () => {
    const loader = createGoogleMapsLoader({
      setOptions: vi.fn(),
      importLibrary: vi.fn(async (name: "maps" | "marker" | "core") =>
        name === "maps"
          ? { Map: class {}, Polyline: class {} }
          : name === "marker"
            ? { AdvancedMarkerElement: class {} }
            : { SymbolPath: { CIRCLE: "circle" } },
      ),
    });

    await expect(loader.load("key")).rejects.toThrow(/runtime.*invalid/i);
  });

  it("snapshots the provider circle primitive during runtime validation", async () => {
    const loaded = runtime();
    let reads = 0;
    const SymbolPath = Object.defineProperty({}, "CIRCLE", {
      enumerable: true,
      get: () => {
        reads += 1;
        if (reads > 1) throw new Error("circle getter read twice");
        return "provider-circle";
      },
    });
    const loader = createGoogleMapsLoader({
      setOptions: vi.fn(),
      importLibrary: vi.fn(async (name: "maps" | "marker" | "core") => {
        if (name === "maps") {
          return { Map: loaded.Map, OverlayView: loaded.OverlayView, Polyline: loaded.Polyline };
        }
        if (name === "marker") return { AdvancedMarkerElement: loaded.AdvancedMarkerElement, CollisionBehavior: loaded.CollisionBehavior };
        return { SymbolPath, Point: loaded.Point };
      }),
    });

    const result = await loader.load("key");
    expect(result.SymbolPath.CIRCLE).toBe("provider-circle");
    expect(reads).toBe(1);
  });
});

describe("Google Maps configuration", () => {
  it.each([
    { mapId: "map" }, { cloudStyleProfileId: "profile" },
    { mapId: "map", cloudStyleProfileId: " " },
    { mapId: 4, cloudStyleProfileId: "profile" },
    { mapId: "map", cloudStyleProfileId: null },
  ])("refuses incomplete or malformed paired style configuration %# before provider work", async (style) => {
    const load = vi.fn(async () => runtime());
    const configure = createGoogleMapsConfigurator({ createLoader: () => ({ load }), createAdapter: () => ({} as MapAdapterV2) });
    expect(await configure({ apiKey: "key", development: false, ...style } as unknown as GoogleMapsConfigInput)).toMatchObject({ status: "unavailable" });
    expect(load).not.toHaveBeenCalled();
  });

  it("owns the declared cloud profile in equivalent and different configurations", async () => {
    const load = vi.fn(async () => runtime());
    const createAdapter = vi.fn<(runtime: GoogleMapsRuntime, options: unknown) => MapAdapterV2>(() => ({} as MapAdapterV2));
    const configure = createGoogleMapsConfigurator({ createLoader: () => ({ load }), createAdapter });
    const first = configure({ apiKey: "key", mapId: " map ", cloudStyleProfileId: " profile ", development: false });
    const equivalent = configure({ apiKey: "key", mapId: "map", cloudStyleProfileId: "profile", development: false });
    expect(first).toBe(equivalent);
    expect(await configure({ apiKey: "key", mapId: "map", cloudStyleProfileId: "other", development: false })).toMatchObject({ status: "unavailable" });
    const ready = await first;
    if (ready.status !== "ready") throw new Error("expected ready");
    ready.createMap();
    expect(createAdapter.mock.calls[0]?.[1]).toEqual({ development: false, mapId: "map", cloudStyleProfileId: "profile" });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("returns typed missing configuration without constructing loader or adapter", async () => {
    const createLoader = vi.fn();
    const createAdapter = vi.fn();
    const configure = createGoogleMapsConfigurator({ createLoader, createAdapter });

    await expect(configure({ apiKey: "  ", development: false })).resolves.toEqual({
      status: "missing-configuration",
    });
    expect(createLoader).not.toHaveBeenCalled();
    expect(createAdapter).not.toHaveBeenCalled();
  });

  it("normalizes mechanics options and returns a fresh adapter factory over one loaded runtime", async () => {
    const loaded = runtime();
    const load = vi.fn(async () => loaded);
    const createLoader = vi.fn(() => ({ load }));
    const adapters: MapAdapterV2[] = [];
    const createAdapter = vi.fn(() => {
      const adapter = { destroy: vi.fn() } as unknown as MapAdapterV2;
      adapters.push(adapter);
      return adapter;
    });
    const configure = createGoogleMapsConfigurator({ createLoader, createAdapter });

    const [first, second] = await Promise.all([
      configure({ apiKey: " key ", cloudStyleProfileId: "profile", mapId: " explicit-map ", development: true }),
      configure({ apiKey: "key", cloudStyleProfileId: "profile", mapId: "explicit-map", development: true }),
    ]);
    expect(first).toBe(second);
    expect(first.status).toBe("ready");
    if (first.status !== "ready") throw new Error("expected ready configuration");
    const firstAdapter = first.createMap();
    firstAdapter.destroy();
    const retryAdapter = first.createMap();

    expect(retryAdapter).not.toBe(firstAdapter);
    expect(adapters).toEqual([firstAdapter, retryAdapter]);
    expect(createLoader).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledExactlyOnceWith("key");
    expect(createAdapter).toHaveBeenNthCalledWith(1, loaded, {
      development: true,
      cloudStyleProfileId: "profile", mapId: "explicit-map",
    });
  });

  it("refuses changed key, map ID, or environment after initialization without new work", async () => {
    const loaded = runtime();
    const load = vi.fn(async () => loaded);
    const createAdapter = vi.fn(() => ({} as MapAdapterV2));
    const configure = createGoogleMapsConfigurator({
      createLoader: () => ({ load }),
      createAdapter,
    });
    await configure({ apiKey: "key", cloudStyleProfileId: "profile", mapId: "map", development: false });

    for (const input of [
      { apiKey: "other", cloudStyleProfileId: "profile", mapId: "map", development: false },
      { apiKey: "key", cloudStyleProfileId: "profile", mapId: "other", development: false },
      { apiKey: "key", cloudStyleProfileId: "profile", mapId: "map", development: true },
    ]) {
      const result = await configure(input);
      expect(result).toMatchObject({
        status: "unavailable",
        reason: "loader-failed",
        retryable: true,
      });
      expect(result.status === "unavailable" ? typeof result.diagnostic : "missing").toBe("string");
    }
    expect(load).toHaveBeenCalledTimes(1);
    expect(createAdapter).not.toHaveBeenCalled();
  });

  it("maps loader failures to typed unavailable state and retries the same configuration", async () => {
    const loaded = runtime();
    let attempts = 0;
    const load = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("blocked SDK");
      return loaded;
    });
    const configure = createGoogleMapsConfigurator({
      createLoader: () => ({ load }),
      createAdapter: () => ({} as MapAdapterV2),
    });

    await expect(configure({ apiKey: "key", development: false })).resolves.toEqual({
      status: "unavailable",
      reason: "loader-failed",
      retryable: true,
      diagnostic: "blocked SDK",
    });
    const ready = await configure({ apiKey: "key", development: false });
    expect(ready.status).toBe("ready");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("settles a loader rejection whose Error message cannot be read", async () => {
    const hostileError = Object.defineProperty(new Error(), "message", {
      configurable: true,
      get: () => {
        throw new Error("message getter failed");
      },
    });
    const configure = createGoogleMapsConfigurator({
      createLoader: () => ({ load: () => Promise.reject(hostileError) }),
      createAdapter: () => ({} as MapAdapterV2),
    });

    await expect(configure({ apiKey: "key", development: false })).resolves.toMatchObject({
      status: "unavailable",
      reason: "loader-failed",
      retryable: true,
    });
  });

  it("supports an isolated configureGoogleMaps dependency seam", async () => {
    const loaded = runtime();
    const state = await configureGoogleMaps(
      { apiKey: "key", development: false },
      {
        createLoader: () => ({ load: async () => loaded }),
        createAdapter: () => ({} as MapAdapterV2),
      },
    );
    expect(state.status).toBe("ready");
  });

  it("settles hostile configuration records as typed unavailable state", async () => {
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const configure = createGoogleMapsConfigurator({
      createLoader: vi.fn(),
      createAdapter: vi.fn(),
    });

    await expect(
      Promise.resolve().then(() => configure(revoked.proxy as GoogleMapsConfigInput)),
    ).resolves.toMatchObject({
      status: "unavailable",
      reason: "loader-failed",
      retryable: true,
    });
  });
});
