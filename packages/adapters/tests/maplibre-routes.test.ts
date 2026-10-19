import { expect, it } from "vitest";
import { createRouteFeatures, sampleRouteSymbols, MapLibreRoutes } from "../src/maplibre/routes.js";
import type { Map as LibreMap } from "maplibre-gl";
import type { MapRouteStyle } from "@laugh-tale-island/core/browser";
import { profile } from "./helpers/maplibre-profile.js";
import { vi } from "vitest";
it("retains edge identity without claiming a provider route", () => {
  const result = createRouteFeatures([{ edgeId: "edge/one", mode: "walking", source: "manual", certainty: "confirmed", selected: true, geometry: [{ lat: 0, lng: 0 }, { lat: 0, lng: 2 }] }]);
  expect(result.features[0].properties).toMatchObject({ edgeId: "edge/one", selected: true, mode: "walking" });
  expect(result.features[0].geometry).toEqual({ type: "LineString", coordinates: [[0, 0], [2, 0]] });
});
it("samples dots at screen-pixel spacing across segments, excluding zero-length segments", () => {
  expect(sampleRouteSymbols([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 30, y: 0 }], 12)).toEqual([
    { x: 0, y: 0, dx: 1, dy: 0 }, { x: 12, y: 0, dx: 1, dy: 0 }, { x: 24, y: 0, dx: 1, dy: 0 },
  ]);
});
it("refuses unbounded sampling and invalid spacing", () => {
  expect(() => sampleRouteSymbols([{ x: 0, y: 0 }, { x: 1e9, y: 0 }], 1)).toThrow();
  expect(() => sampleRouteSymbols([{ x: 0, y: 0 }, { x: 30, y: 0 }], 0)).toThrow();
});
it.each<MapRouteStyle>([
  { kind: "solid", stroke: { color: "#555555", width: 4, opacity: 1 }, casing: { color: "#ffffff", width: 7, opacity: 1 } },
  { kind: "symbol", symbol: { shape: "circle", repeatPx: 12, scale: 2, fill: { color: "#555555", opacity: 1 } } },
  { kind: "symbol", symbol: { shape: "dash", repeatPx: 14, scale: 1, stroke: { color: "#555555", width: 2, opacity: 1 } } },
])("renders route paint and removes only its own layers for $kind", style => {
  const layers: { id: string; type: string }[] = [];
  const removeLayer = vi.fn(); const removeSource = vi.fn();
  const setData = vi.fn<(data: GeoJSON.FeatureCollection<GeoJSON.Geometry, { edgeId: string }>) => Promise<void>>().mockResolvedValue(undefined);
  const map = { addSource: vi.fn(), addLayer: (layer: { id: string; type: string }) => layers.push(layer),
    getLayer: () => ({}), getSource: () => ({ setData }), removeLayer, removeSource,
    project: ([x, y]: [number, number]) => ({ x, y }), unproject: ([lng, lat]: [number, number]) => ({ lng, lat }) } as unknown as LibreMap;
  const routes = new MapLibreRoutes(map, { ...profile, routeStyle: () => style }, vi.fn());
  routes.render([{ edgeId: "edge-one", mode: "walking", source: "manual", certainty: "confirmed", selected: true, geometry: [{ lat: 0, lng: 0 }, { lat: 0, lng: 30 }] }]);
  expect(layers.map(layer => layer.type)).toEqual(style.kind === "solid" ? ["line", "line"] : [style.symbol.shape === "circle" ? "circle" : "line"]);
  if (style.kind === "symbol") expect(setData.mock.calls[0][0].features[0].properties.edgeId).toBe("edge-one");
  routes.render([]); expect(removeLayer).toHaveBeenCalledTimes(layers.length); expect(removeSource).toHaveBeenCalledExactlyOnceWith("ep-route-0");
});
