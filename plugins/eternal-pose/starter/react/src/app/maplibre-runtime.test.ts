import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapMountConfig } from "@laugh-tale-island/core/browser";
import { presentation } from "../presentation";

const sdk = vi.hoisted(() => ({
  imports: 0,
  workerUrl: "",
  order: [] as string[],
  importGate: undefined as Promise<void> | undefined,
}));

vi.mock("maplibre-gl", async () => {
  sdk.imports += 1;
  if (sdk.importGate) await sdk.importGate;
  return { setWorkerUrl: (url: string) => { sdk.workerUrl = url; sdk.order.push("worker"); } };
});

function mountConfig() {
  const onUnavailable = vi.fn();
  const config = {
    visualProfile: presentation.mapVisualProfile,
    createMarkerContent: presentation.createMarkerContent,
    createUserLocationContent: presentation.createUserLocationContent,
    events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable },
  } satisfies MapMountConfig;
  return { config, onUnavailable };
}

beforeEach(() => {
  vi.resetModules();
  sdk.imports = 0;
  sdk.workerUrl = "";
  sdk.order = [];
  sdk.importGate = undefined;
  document.documentElement.removeAttribute("data-oak-map-provider");
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("MapLibre runtime bootstrap", () => {
  it("publishes a synchronous map factory without loading the SDK on Home", async () => {
    const { createMapLibreRuntime } = await import("./maplibre-runtime");
    const runtime = await createMapLibreRuntime({});

    expect(document.documentElement.dataset.oakMapProvider).toBe("maplibre");
    expect(sdk.imports).toBe(0);
    const adapter = runtime.createMap();
    expect(typeof adapter.mount).toBe("function");
    expect(sdk.imports).toBe(0);
    adapter.destroy();
  });

  it("configures the worker before the original adapter mount starts", async () => {
    const { createMapLibreRuntime } = await import("./maplibre-runtime");
    const runtime = await createMapLibreRuntime({ tileJSONUrl: "https://tiles.example/tilejson.json" });
    const adapter = runtime.createMap();
    const host = document.createElement("div");
    const { config, onUnavailable } = mountConfig();
    vi.stubGlobal("fetch", vi.fn(() => {
      sdk.order.push("source");
      return Promise.reject(new Error("offline"));
    }));

    await expect(adapter.mount(host, config)).rejects.toMatchObject({ failure: { reason: "network", retryable: true } });
    expect(sdk.imports).toBe(1);
    expect(sdk.workerUrl).toBeTruthy();
    expect(sdk.order).toEqual(["worker", "source"]);
    expect(onUnavailable).toHaveBeenCalledWith({ status: "unavailable", reason: "network", retryable: true });
    adapter.destroy();
  });

  it("keeps a destroyed adapter cancelled when its SDK import settles later", async () => {
    let release!: () => void;
    sdk.importGate = new Promise<void>(resolve => { release = resolve; });
    const { createMapLibreRuntime } = await import("./maplibre-runtime");
    const runtime = await createMapLibreRuntime({});
    const adapter = runtime.createMap();
    const host = document.createElement("div");
    const { config, onUnavailable } = mountConfig();
    const mounting = adapter.mount(host, config);
    const rejected = expect(mounting).rejects.toMatchObject({ failure: { reason: "cancelled" } });

    adapter.destroy();
    release();
    await rejected;
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(host.childElementCount).toBe(0);
  });

  it("propagates an SDK import failure without starting the original mount", async () => {
    vi.doMock("maplibre-gl", () => { throw new Error("SDK chunk unavailable"); });
    vi.resetModules();
    const { createMapLibreRuntime } = await import("./maplibre-runtime");
    const runtime = await createMapLibreRuntime({ tileJSONUrl: "https://tiles.example/tilejson.json" });
    const adapter = runtime.createMap();
    const { config, onUnavailable } = mountConfig();
    const fetch = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetch);

    await expect(adapter.mount(document.createElement("div"), config)).rejects.toMatchObject({ cause: { message: "SDK chunk unavailable" } });
    expect(fetch).not.toHaveBeenCalled();
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(sdk.workerUrl).toBe("");
    adapter.destroy();
  });
});
