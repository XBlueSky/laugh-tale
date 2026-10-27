import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { MapLibreMapAdapter, type MapLibreMapAdapterOptions } from "@laugh-tale-island/adapters/maplibre";
import type { MapAdapterV2 } from "@laugh-tale-island/core/browser";

export function createMapLibreRuntime(options: MapLibreMapAdapterOptions): Promise<{ createMap: () => MapAdapterV2 }> {
  document.documentElement.dataset.oakMapProvider = "maplibre";
  return Promise.resolve({ createMap: () => {
    const adapter = new MapLibreMapAdapter(options);
    const mount = adapter.mount.bind(adapter);
    adapter.mount = async (element, config) => {
      const { setWorkerUrl } = await import("maplibre-gl");
      setWorkerUrl(workerUrl);
      return mount(element, config);
    };
    return adapter;
  } });
}
