import { vi } from "vitest";
export class FakeMap {
  static instances: FakeMap[] = [];
  static defer = false;
  readonly events = new Map<string, Set<(event: Record<string, unknown>) => void>>();
  readonly sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  readonly layers = new Map<string, Record<string, unknown>>();
  readonly remove = vi.fn(() => this.canvas.remove());
  readonly resize = vi.fn();
  readonly jumpTo = vi.fn();
  readonly easeTo = vi.fn();
  readonly dragRotate = { disable: vi.fn() };
  readonly touchZoomRotate = { disableRotation: vi.fn() };
  readonly touchPitch = { disable: vi.fn() };
  readonly canvas = document.createElement("canvas");
  loaded = false;
  covered = [{ canonical: { z: 11, x: 1819, y: 806 } }];
  coveringTiles() { return this.covered; }
  constructor(readonly options: { container: HTMLElement }) {
    FakeMap.instances.push(this); options.container.append(this.canvas);
    if (!FakeMap.defer) queueMicrotask(() => this.emit("style.load", {}));
  }
  on(type: string, callback: (event: Record<string, unknown>) => void) { const set = this.events.get(type) ?? new Set(); set.add(callback); this.events.set(type, set); return this; }
  off(type: string, callback: (event: Record<string, unknown>) => void) { this.events.get(type)?.delete(callback); return this; }
  emit(type: string, data: Record<string, unknown>) { for (const callback of this.events.get(type) ?? []) callback(data); }
  getZoom() { return 11; }
  isSourceLoaded() { return this.loaded; }
  getCanvas() { return this.canvas; }
  addSource(id: string) { this.sources.set(id, { setData: vi.fn().mockResolvedValue(undefined) }); }
  getSource(id: string) { return this.sources.get(id); }
  removeSource(id: string) { this.sources.delete(id); }
  addLayer(layer: Record<string, unknown> & { id: string }) { this.layers.set(layer.id, layer); }
  getLayer(id: string) { return this.layers.get(id); }
  removeLayer(id: string) { this.layers.delete(id); }
  queryRenderedFeatures() { return []; }
  project(coordinate: [number, number]) { return { x: coordinate[0] * 10, y: coordinate[1] * 10 }; }
  unproject(point: [number, number]) { return { lng: point[0] / 10, lat: point[1] / 10 }; }
}
export class FakeMarker {
  static instances: FakeMarker[] = [];
  readonly setLngLat = vi.fn(() => this);
  readonly remove = vi.fn(() => this.options.element.remove());
  constructor(readonly options: { element: HTMLElement; anchor: string }) { FakeMarker.instances.push(this); }
  addTo(map: FakeMap) { map.options.container.append(this.options.element); return this; }
}
export const tileJSON = { tilejson: "3.0.0", minzoom: 0, maxzoom: 14, tiles: ["https://tiles.example/{z}/{x}/{y}.mvt"],
  vector_layers: ["ocean", "water_polygons", "water_lines", "land", "buildings", "streets", "place_labels", "street_labels", "public_transport"].map(id => ({ id, fields: { kind: "String", name: "String", rail: "Boolean" } })) };
