import type {
  CameraIntent,
  MapMountConfig,
  MapRoutePresentationV2,
  MapVisualProfile,
  MarkerDescriptor,
} from "@laugh-tale-island/core/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GoogleMapAdapter,
  type GoogleMapAdapterOptions,
} from "../src/google/google-map-adapter.js";
import type { GoogleMapsRuntime } from "../src/google/google-config.js";

interface Listener {
  remove(): void;
}

class TestElement {
  readonly ownerDocument = { createElement: () => new TestElement() };
  readonly children: TestElement[] = [];
  matches(): boolean { return false; }
  appendChild(element: TestElement): TestElement {
    element.parentNode?.removeChild(element); this.children.push(element); element.parentNode = this; return element;
  }
  removeChild(element: TestElement): TestElement {
    const index = this.children.indexOf(element); if (index >= 0) this.children.splice(index, 1); element.parentNode = null; return element;
  }
  readonly attributes = new Map<string, string>([["aria-label", "presentation-owned"]]);
  readonly style: Record<string, string> = {};
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  parentNode: TestPane | TestElement | null = null;

  addEventListener(name: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name: string, listener: (event: unknown) => void): void {
    this.listeners.get(name)?.delete(listener);
  }

  dispatch(name: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(name) ?? []) listener(event);
  }
}

class TestPane {
  readonly children: TestElement[] = [];

  appendChild(element: TestElement): TestElement {
    element.parentNode?.removeChild(element);
    this.children.push(element);
    element.parentNode = this;
    return element;
  }

  removeChild(element: TestElement): TestElement {
    const index = this.children.indexOf(element);
    if (index >= 0) this.children.splice(index, 1);
    element.parentNode = null;
    return element;
  }
}

class FakeMap {
  static failureSubscribers = new Set<() => void>();
  static instances: FakeMap[] = [];
  static onListenerRemove: ((name: string) => void) | undefined;
  static onGetZoom: (() => void) | undefined;
  readonly overlayMouseTarget = new TestPane();
  readonly listeners = new Map<string, Set<() => void>>();
  readonly projection = {
    fromLatLngToDivPixel: vi.fn(({ lat, lng }: { lat: number; lng: number }) => ({
      x: lng * 10,
      y: lat * 10,
    })),
  };
  readonly fitBounds = vi.fn();
  readonly moveCamera = vi.fn();
  readonly panTo = vi.fn();
  readonly panBy = vi.fn();
  readonly setZoom = vi.fn((zoom: number) => {
    this.zoom = zoom;
  });
  readonly unbindAll = vi.fn();
  zoom: unknown = 11;
  projectionReady = true;
  getProjection() {
    if (!this.projectionReady) return undefined;
    return {
      fromLatLngToPoint: ({ lat, lng }: { lat: number; lng: number }) => ({
        x: (lng + 180) * 256 / 360,
        y: 128 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 128 / Math.PI,
      }),
      fromPointToLatLng: ({ x, y }: { x: number; y: number }) => ({
        lat: () => Math.atan(Math.sinh((128 - y) * Math.PI / 128)) * 180 / Math.PI,
        lng: () => x * 360 / 256 - 180,
      }),
    };
  }

  constructor(
    readonly element: HTMLElement,
    readonly options: Record<string, unknown>,
  ) {
    FakeMap.instances.push(this);
    this.listeners.set("auth-failure", new Set(FakeMap.failureSubscribers));
  }

  addListener(name: string, callback: () => void): Listener {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(callback);
    this.listeners.set(name, listeners);
    return {
      remove: () => {
        listeners.delete(callback);
        FakeMap.onListenerRemove?.(name);
      },
    };
  }

  emit(name: string): void {
    for (const listener of [...(this.listeners.get(name) ?? [])]) listener();
  }

  getZoom(): unknown {
    FakeMap.onGetZoom?.();
    return this.zoom;
  }
}

class FakeAdvancedMarker {
  static instances: FakeAdvancedMarker[] = [];
  static onDetach: (() => void) | undefined;
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  private mapValue: unknown;
  position: unknown;
  readonly content: unknown;

  constructor(readonly options: Record<string, unknown>) {
    this.mapValue = options.map;
    this.position = options.position;
    this.content = options.content;
    FakeAdvancedMarker.instances.push(this);
  }

  get map(): unknown {
    return this.mapValue;
  }

  set map(value: unknown) {
    this.mapValue = value;
    if (value === null) FakeAdvancedMarker.onDetach?.();
  }

  addEventListener(name: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name: string, listener: (event: unknown) => void): void {
    this.listeners.get(name)?.delete(listener);
  }

  emit(name: string): void {
    for (const listener of this.listeners.get(name) ?? []) listener({ type: name });
  }
}

class FakeOverlayView {
  static instances: FakeOverlayView[] = [];
  private map: FakeMap | null = null;

  constructor() {
    FakeOverlayView.instances.push(this);
  }

  setMap(map: FakeMap | null): void {
    if (this.map !== null) (this as unknown as { onRemove(): void }).onRemove();
    this.map = map;
    if (map !== null) {
      (this as unknown as { onAdd(): void }).onAdd();
      (this as unknown as { draw(): void }).draw();
    }
  }

  getPanes(): { overlayMouseTarget: TestPane } | null {
    return this.map === null ? null : { overlayMouseTarget: this.map.overlayMouseTarget };
  }

  getProjection(): FakeMap["projection"] | null {
    return this.map?.projection ?? null;
  }
}

class FakePolyline {
  static instances: FakePolyline[] = [];
  readonly listeners = new Map<string, Set<() => void>>();
  readonly setMap = vi.fn((map: unknown) => {
    this.map = map;
  });
  readonly setOptions = vi.fn((options: Record<string, unknown>) => {
    this.options = { ...this.options, ...options };
    this.map = this.options.map;
  });
  map: unknown;

  constructor(public options: Record<string, unknown>) {
    this.map = options.map;
    FakePolyline.instances.push(this);
  }

  addListener(name: string, callback: () => void): Listener {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(callback);
    this.listeners.set(name, listeners);
    return { remove: () => listeners.delete(callback) };
  }

  emit(name: string): void {
    for (const listener of this.listeners.get(name) ?? []) listener();
  }
}

function runtime(): GoogleMapsRuntime {
  return {
    subscribeFailures(listener: Parameters<NonNullable<GoogleMapsRuntime["subscribeFailures"]>>[0]) {
      const callback = () => listener({ status: "unavailable", reason: "request-denied", retryable: false, diagnostic: "Google Maps authentication failed" });
      FakeMap.failureSubscribers.add(callback);
      return () => { FakeMap.failureSubscribers.delete(callback); for (const map of FakeMap.instances) map.listeners.get("auth-failure")?.delete(callback); };
    },
    Point: class { constructor(public x: number, public y: number) {} },
    Map: FakeMap,
    AdvancedMarkerElement: FakeAdvancedMarker,
    OverlayView: FakeOverlayView,
    Polyline: FakePolyline,
    SymbolPath: { CIRCLE: "provider-circle" },
    CollisionBehavior: { REQUIRED: "REQUIRED", REQUIRED_AND_HIDES_OPTIONAL: "REQUIRED_AND_HIDES_OPTIONAL", OPTIONAL_AND_HIDES_LOWER_PRIORITY: "OPTIONAL_AND_HIDES_LOWER_PRIORITY" },
  } as unknown as GoogleMapsRuntime;
}

const marker = (ownerId: string, label = ownerId, lat = 25, lng = 121): MarkerDescriptor => ({
  ownerId,
  label,
  coordinates: { lat, lng },
  markerMode: "numbered",
  displayIndex: 2,
  ordinal: "2nd",
  sourceKind: "sightseeing",
  timing: "suggested",
  states: ["selected"],
});

const route = (
  edgeId: string,
  geometry: MapRoutePresentationV2["geometry"] = [
    { lat: 25, lng: 121 },
    { lat: 26, lng: 122 },
  ],
): MapRoutePresentationV2 => ({
  edgeId,
  mode: "walking",
  source: "provider",
  certainty: "suggested",
  geometry,
  selected: false,
});

const profile: MapVisualProfile = {
  id: "map-test",
  basemap: {
    mode: "technical",
    density: "high",
    contrast: "soft",
    poi: "minimal",
    stationLabels: "legible",
    palette: {
      geometry: "#101010",
      label: "#202020",
      labelStroke: "#303030",
      water: "#404040",
      park: "#505050",
      road: "#606060",
    },
  },
  routeStyle(candidate) {
    if (candidate.edgeId === "solid") {
      return {
        kind: "solid",
        stroke: { color: "#111111", opacity: 0.8, width: 4 },
        casing: { color: "#ffffff", opacity: 0.5, width: 7 },
      };
    }
    if (candidate.edgeId === "circle") {
      return {
        kind: "symbol",
        symbol: {
          shape: "circle",
          repeatPx: 12,
          scale: 3,
          fill: { color: "#123456", opacity: 0.7 },
          stroke: { color: "#abcdef", opacity: 0.9, width: 2 },
        },
      };
    }
    if (candidate.edgeId === "dash") {
      return {
        kind: "symbol",
        symbol: {
          shape: "dash",
          repeatPx: 18,
          scale: 5,
          fill: { color: "#fedcba", opacity: 0.2 },
          stroke: { color: "#654321", opacity: 0.6, width: 3 },
        },
      };
    }
    return null;
  },
};

interface Handles {
  markerElements: TestElement[];
  markerUpdates: Array<ReturnType<typeof vi.fn>>;
  markerDisposes: Array<ReturnType<typeof vi.fn>>;
  userElements: TestElement[];
  userUpdates: Array<ReturnType<typeof vi.fn>>;
  userDisposes: Array<ReturnType<typeof vi.fn>>;
}

function mountConfig(overrides: Partial<MapMountConfig> = {}): MapMountConfig & { handles: Handles } {
  const handles: Handles = {
    markerElements: [],
    markerUpdates: [],
    markerDisposes: [],
    userElements: [],
    userUpdates: [],
    userDisposes: [],
  };
  return Object.assign({
    events: {
      onMarkerSelect: vi.fn(),
      onRouteSelect: vi.fn(),
      onUnavailable: vi.fn(),
    },
    visualProfile: profile,
    createMarkerContent: vi.fn(() => {
      const element = new TestElement();
      const update = vi.fn();
      const dispose = vi.fn();
      handles.markerElements.push(element);
      handles.markerUpdates.push(update);
      handles.markerDisposes.push(dispose);
      return { element: element as unknown as HTMLElement, update, dispose };
    }),
    createUserLocationContent: vi.fn(() => {
      const element = new TestElement();
      const update = vi.fn();
      const dispose = vi.fn();
      handles.userElements.push(element);
      handles.userUpdates.push(update);
      handles.userDisposes.push(dispose);
      return { element: element as unknown as HTMLElement, update, dispose };
    }),
    ...overrides,
  }, { handles });
}

beforeEach(() => {
  FakeMap.failureSubscribers.clear();
  FakeMap.instances = [];
  FakeMap.onListenerRemove = undefined;
  FakeMap.onGetZoom = undefined;
  FakeAdvancedMarker.instances = [];
  FakeAdvancedMarker.onDetach = undefined;
  FakeOverlayView.instances = [];
  FakePolyline.instances = [];
});

function holdMapCallback(map: FakeMap, name: string): () => void {
  const callback = [...(map.listeners.get(name) ?? [])].at(-1);
  if (callback === undefined) throw new Error(`missing ${name} callback`);
  return callback;
}

describe("GoogleMapAdapter marker backends and lifecycle", () => {
  it("refuses a Map ID whose declared cloud profile differs from the recipe before constructing the map", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false, mapId: "map", cloudStyleProfileId: "other" });
    await expect(adapter.mount({} as HTMLElement, mountConfig())).rejects.toThrow(/profile/i);
    expect(FakeMap.instances).toHaveLength(0);
  });

  it("uses inline raster style by default and only the declared cloud style with a Map ID, with provider controls disabled", async () => {
    for (const style of [{}, { mapId: "map", cloudStyleProfileId: "map-test" }]) {
      const adapter = new GoogleMapAdapter(runtime(), { development: false, ...style });
      await adapter.mount({} as HTMLElement, mountConfig());
      const options = FakeMap.instances.at(-1)!.options;
      expect.soft(options.disableDefaultUI).toBe(true);
      if ("mapId" in style) expect(options).not.toHaveProperty("styles");
      else {
        expect(options.renderingType).toBe("RASTER");
        expect(options.styles).toEqual(expect.arrayContaining([{ featureType: "water", elementType: "geometry", stylers: [{ color: "#404040" }] }]));
      }
      adapter.destroy();
    }
  });

  it("uses AdvancedMarker only for an explicit Map ID and reconciles presentation-owned handles by ownerId", async () => {
    const onMarkerSelect = vi.fn();
    const config = mountConfig({
      events: { onMarkerSelect, onRouteSelect: vi.fn(), onUnavailable: vi.fn() },
    });
    const adapter = new GoogleMapAdapter(runtime(), { development: false, cloudStyleProfileId: "map-test", mapId: " map-id " });
    await adapter.mount({} as HTMLElement, config);

    adapter.render({ markers: [marker("first", "First"), marker("first", "Ignored")], routes: [] });
    expect(FakeAdvancedMarker.instances).toHaveLength(1);
    expect(FakeOverlayView.instances).toHaveLength(0);
    expect(FakeAdvancedMarker.instances[0]?.content).toBe(config.handles.markerElements[0]);
    expect(config.createMarkerContent).toHaveBeenCalledExactlyOnceWith(marker("first", "First"));

    adapter.render({ markers: [marker("first", "Updated", 26, 122)], routes: [] });
    expect(config.handles.markerUpdates[0]).toHaveBeenCalledExactlyOnceWith(
      marker("first", "Updated", 26, 122),
    );
    expect(FakeAdvancedMarker.instances[0]?.position).toEqual({ lat: 26, lng: 122 });
    FakeAdvancedMarker.instances[0]?.emit("gmp-click");
    expect(onMarkerSelect).toHaveBeenCalledExactlyOnceWith("first");

    adapter.render({ markers: [], routes: [] });
    expect(FakeAdvancedMarker.instances[0]?.map).toBeNull();
    expect(config.handles.markerDisposes[0]).toHaveBeenCalledTimes(1);
    FakeAdvancedMarker.instances[0]?.emit("gmp-click");
    expect(onMarkerSelect).toHaveBeenCalledTimes(1);
    adapter.destroy();
    expect(config.handles.markerDisposes[0]).toHaveBeenCalledTimes(1);
  });

  it("rejects a held AdvancedMarker activation after its owner is removed", async () => {
    const onMarkerSelect = vi.fn();
    const adapter = new GoogleMapAdapter(runtime(), { development: false, cloudStyleProfileId: "map-test", mapId: "map" });
    await adapter.mount({} as HTMLElement, mountConfig({
      events: { onMarkerSelect, onRouteSelect: vi.fn(), onUnavailable: vi.fn() },
    }));
    adapter.render({ markers: [marker("advanced")], routes: [] });
    const heldActivation = [...(FakeAdvancedMarker.instances[0]?.listeners.get("gmp-click") ?? [])][0];
    if (heldActivation === undefined) throw new Error("missing AdvancedMarker activation");
    heldActivation({ type: "gmp-click" });
    expect(onMarkerSelect).toHaveBeenCalledExactlyOnceWith("advanced");

    adapter.render({ markers: [], routes: [] });
    heldActivation({ type: "gmp-click" });
    expect(onMarkerSelect).toHaveBeenCalledTimes(1);
  });

  it("quarantines the first invalid duplicate owner without retaining or stealing its prior marker", async () => {
    const config = mountConfig();
    const adapter = new GoogleMapAdapter(runtime(), { development: false, cloudStyleProfileId: "map-test", mapId: "map" });
    await adapter.mount({} as HTMLElement, config);
    adapter.render({ markers: [marker("owner")], routes: [] });

    adapter.render({
      markers: [
        marker("owner", "Invalid first", Number.NaN, 121),
        marker("owner", "Valid later", 26, 122),
      ],
      routes: [],
    });

    expect(FakeAdvancedMarker.instances).toHaveLength(1);
    expect(config.handles.markerUpdates[0]).not.toHaveBeenCalled();
    expect(config.handles.markerDisposes[0]).toHaveBeenCalledTimes(1);
    expect(FakeAdvancedMarker.instances[0]?.map).toBeNull();
  });

  it.each([
    ["development", true, undefined],
    ["production", false, undefined],
    ["blank development", true, "  "],
    ["blank production", false, "\t"],
  ])("uses OverlayView for an absent or blank Map ID in %s", async (_label, development, mapId) => {
    const onMarkerSelect = vi.fn();
    const config = mountConfig({
      events: { onMarkerSelect, onRouteSelect: vi.fn(), onUnavailable: vi.fn() },
    });
    const adapter = new GoogleMapAdapter(runtime(), { development, ...(mapId === undefined ? {} : { mapId }) });
    await adapter.mount({} as HTMLElement, config);
    adapter.render({ markers: [marker("overlay")], routes: [] });

    const map = FakeMap.instances[0];
    const element = config.handles.markerElements[0];
    expect(FakeAdvancedMarker.instances).toHaveLength(0);
    expect(FakeOverlayView.instances).toHaveLength(1);
    expect(map?.overlayMouseTarget.children[0]?.children).toEqual([element]);
    expect(map?.projection.fromLatLngToDivPixel).toHaveBeenCalledWith({ lat: 25, lng: 121 });
    expect(element?.style.transform).toBeUndefined();
    expect(element?.parentNode).toMatchObject({ style: { left: "1210px", top: "250px", transform: "translate(-50%, -100%)" } });
    expect(element?.attributes.get("aria-label")).toBe("presentation-owned");
    element?.dispatch("click");
    expect(onMarkerSelect).toHaveBeenCalledExactlyOnceWith("overlay");

    adapter.destroy();
    expect(map?.overlayMouseTarget.children).toEqual([]);
    expect(config.handles.markerDisposes[0]).toHaveBeenCalledTimes(1);
  });

  it("rejects held OverlayView activations after their owner is removed", async () => {
    const onMarkerSelect = vi.fn();
    const config = mountConfig({
      events: { onMarkerSelect, onRouteSelect: vi.fn(), onUnavailable: vi.fn() },
    });
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, config);
    adapter.render({ markers: [marker("overlay")], routes: [] });
    const element = config.handles.markerElements[0]!;
    const heldClick = [...(element.listeners.get("click") ?? [])][0];
    const heldKeyDown = [...(element.listeners.get("keydown") ?? [])][0];
    if (heldClick === undefined || heldKeyDown === undefined) {
      throw new Error("missing OverlayView activation");
    }
    heldClick({ type: "click" });
    expect(onMarkerSelect).toHaveBeenCalledExactlyOnceWith("overlay");

    adapter.render({ markers: [], routes: [] });
    heldClick({ type: "click" });
    heldKeyDown({ key: "Enter" });
    expect(onMarkerSelect).toHaveBeenCalledTimes(1);
  });

  it("owns one user-location handle across updates and never moves camera", async () => {
    const config = mountConfig();
    const adapter = new GoogleMapAdapter(runtime(), { development: false, cloudStyleProfileId: "map-test", mapId: "map" });
    await adapter.mount({} as HTMLElement, config);
    const map = FakeMap.instances[0];

    adapter.setUserLocation({ lat: 24, lng: 120 });
    expect(config.createUserLocationContent).toHaveBeenCalledExactlyOnceWith({
      coordinates: { lat: 24, lng: 120 },
    });
    expect(FakeAdvancedMarker.instances[0]?.content).toBe(config.handles.userElements[0]);
    adapter.setUserLocation({ lat: 24.5, lng: 120.5 });
    expect(config.handles.userUpdates[0]).toHaveBeenCalledExactlyOnceWith({
      coordinates: { lat: 24.5, lng: 120.5 },
    });
    expect(FakeAdvancedMarker.instances[0]?.position).toEqual({ lat: 24.5, lng: 120.5 });
    expect(map?.panTo).not.toHaveBeenCalled();
    expect(map?.moveCamera).not.toHaveBeenCalled();

    adapter.setUserLocation(null);
    expect(config.handles.userDisposes[0]).toHaveBeenCalledTimes(1);
    adapter.setUserLocation(null);
    adapter.destroy();
    expect(config.handles.userDisposes[0]).toHaveBeenCalledTimes(1);
  });

  it("mounts the exact user-location element through OverlayView and disposes it once", async () => {
    const config = mountConfig();
    const adapter = new GoogleMapAdapter(runtime(), { development: true });
    await adapter.mount({} as HTMLElement, config);
    const map = FakeMap.instances[0]!;

    adapter.setUserLocation({ lat: 24, lng: 120 });
    expect(FakeAdvancedMarker.instances).toHaveLength(0);
    expect(FakeOverlayView.instances).toHaveLength(1);
    expect(map.overlayMouseTarget.children[0]?.children).toEqual([config.handles.userElements[0]]);
    adapter.setUserLocation({ lat: 24.5, lng: 120.5 });
    expect(config.handles.userUpdates[0]).toHaveBeenCalledExactlyOnceWith({
      coordinates: { lat: 24.5, lng: 120.5 },
    });
    expect(map.projection.fromLatLngToDivPixel).toHaveBeenLastCalledWith({
      lat: 24.5,
      lng: 120.5,
    });
    adapter.setUserLocation(null);
    expect(map.overlayMouseTarget.children).toEqual([]);
    expect(config.handles.userDisposes[0]).toHaveBeenCalledTimes(1);
    adapter.destroy();
    expect(config.handles.userDisposes[0]).toHaveBeenCalledTimes(1);
  });

  it("disposes mounted content on remount and recreates current user and queued presentation handles", async () => {
    const first = mountConfig();
    const second = mountConfig();
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    adapter.render({ markers: [marker("queued")], routes: [] });
    adapter.setUserLocation({ lat: 24, lng: 120 });
    await adapter.mount({} as HTMLElement, first);
    expect(first.handles.markerElements).toHaveLength(1);
    expect(first.handles.userElements).toHaveLength(1);

    await adapter.mount({} as HTMLElement, second);
    expect(first.handles.markerDisposes[0]).toHaveBeenCalledTimes(1);
    expect(first.handles.userDisposes[0]).toHaveBeenCalledTimes(1);
    expect(second.handles.markerElements).toHaveLength(1);
    expect(second.handles.userElements).toHaveLength(1);
    expect(FakeMap.instances[0]?.unbindAll).toHaveBeenCalledTimes(1);
  });

  it.each(["detach", "dispose"] as const)(
    "preserves a newer marker render produced by %s during remount cleanup",
    async (trigger) => {
      const adapter = new GoogleMapAdapter(runtime(), { development: false, cloudStyleProfileId: "map-test", mapId: "map" });
      const oldDispose = vi.fn();
      const oldElement = new TestElement();
      const oldConfig = mountConfig({
        createMarkerContent: () => ({
          element: oldElement as unknown as HTMLElement,
          update: vi.fn(),
          dispose: oldDispose,
        }),
      });
      await adapter.mount({} as HTMLElement, oldConfig);
      adapter.render({ markers: [marker("old")], routes: [] });
      let reentered = false;
      const renderReplacement = (): void => {
        if (reentered) return;
        reentered = true;
        adapter.render({ markers: [marker("replacement", "Replacement", 27, 123)], routes: [] });
      };
      if (trigger === "detach") FakeAdvancedMarker.onDetach = renderReplacement;
      else oldDispose.mockImplementation(renderReplacement);
      const nextConfig = mountConfig();

      await adapter.mount({} as HTMLElement, nextConfig);
      FakeAdvancedMarker.onDetach = undefined;

      expect(oldDispose).toHaveBeenCalledTimes(1);
      expect(nextConfig.createMarkerContent).toHaveBeenCalledExactlyOnceWith(
        marker("replacement", "Replacement", 27, 123),
      );
      expect(FakeAdvancedMarker.instances).toHaveLength(2);
      expect(FakeAdvancedMarker.instances[0]?.map).toBeNull();
      expect(FakeAdvancedMarker.instances[1]?.content).toBe(nextConfig.handles.markerElements[0]);
      expect(FakeAdvancedMarker.instances[1]?.position).toEqual({ lat: 27, lng: 123 });
      adapter.destroy();
      expect(nextConfig.handles.markerDisposes[0]).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["detach", "dispose"] as const)(
    "preserves a newer user location produced by %s during remount cleanup",
    async (trigger) => {
      const adapter = new GoogleMapAdapter(runtime(), { development: false, cloudStyleProfileId: "map-test", mapId: "map" });
      const oldDispose = vi.fn();
      const oldElement = new TestElement();
      const oldConfig = mountConfig({
        createUserLocationContent: () => ({
          element: oldElement as unknown as HTMLElement,
          update: vi.fn(),
          dispose: oldDispose,
        }),
      });
      await adapter.mount({} as HTMLElement, oldConfig);
      adapter.setUserLocation({ lat: 25, lng: 121 });
      let reentered = false;
      const setReplacement = (): void => {
        if (reentered) return;
        reentered = true;
        adapter.setUserLocation({ lat: 28, lng: 124 });
      };
      if (trigger === "detach") FakeAdvancedMarker.onDetach = setReplacement;
      else oldDispose.mockImplementation(setReplacement);
      const nextConfig = mountConfig();

      await adapter.mount({} as HTMLElement, nextConfig);
      FakeAdvancedMarker.onDetach = undefined;

      expect(oldDispose).toHaveBeenCalledTimes(1);
      expect(nextConfig.createUserLocationContent).toHaveBeenCalledExactlyOnceWith({
        coordinates: { lat: 28, lng: 124 },
      });
      expect(FakeAdvancedMarker.instances).toHaveLength(2);
      expect(FakeAdvancedMarker.instances[0]?.map).toBeNull();
      expect(FakeAdvancedMarker.instances[1]?.content).toBe(nextConfig.handles.userElements[0]);
      expect(FakeAdvancedMarker.instances[1]?.position).toEqual({ lat: 28, lng: 124 });
      adapter.destroy();
      expect(nextConfig.handles.userDisposes[0]).toHaveBeenCalledTimes(1);
    },
  );

  it("does not finish a stale mount after destroy", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    const pending = adapter.mount({} as HTMLElement, mountConfig());
    adapter.destroy();
    await pending;
    expect(FakeMap.instances).toHaveLength(0);
  });

  it("does not resurrect a map whose provider constructor reentrantly destroys the mount", async () => {
    class ReentrantMap extends FakeMap {
      static onConstruct: (() => void) | undefined;

      constructor(element: HTMLElement, options: Record<string, unknown>) {
        super(element, options);
        ReentrantMap.onConstruct?.();
      }
    }
    const adapter = new GoogleMapAdapter({
      ...runtime(),
      Map: ReentrantMap,
    } as unknown as GoogleMapsRuntime, { development: false, cloudStyleProfileId: "map-test", mapId: "map" });
    ReentrantMap.onConstruct = () => adapter.destroy();

    await adapter.mount({} as HTMLElement, mountConfig());
    adapter.render({ markers: [marker("stale")], routes: [] });

    expect(FakeMap.instances[0]?.unbindAll).toHaveBeenCalledTimes(1);
    expect(FakeAdvancedMarker.instances).toHaveLength(0);
  });

  it("removes a subscription returned after registration reentrantly destroys the mount", async () => {
    const unsubscribe = vi.fn();
    const onUnavailable = vi.fn();
    let held: ((failure: { status: "unavailable"; reason: "request-denied"; retryable: false }) => void) | undefined;
    const adapter = new GoogleMapAdapter({
      ...runtime(), subscribeFailures(listener) {
        held = listener;
        adapter.destroy();
        return unsubscribe;
      },
    }, { development: false });
    await adapter.mount({} as HTMLElement, mountConfig({
      events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable },
    }));
    held?.({ status: "unavailable", reason: "request-denied", retryable: false });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(FakeMap.instances).toHaveLength(0);
  });

  it("disposes a handle created by a reentrant destroy without mounting stale provider work", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false, cloudStyleProfileId: "map-test", mapId: "map" });
    const dispose = vi.fn();
    const config = mountConfig({
      createMarkerContent: vi.fn(() => {
        adapter.destroy();
        return {
          element: new TestElement() as unknown as HTMLElement,
          update: vi.fn(),
          dispose,
        };
      }),
    });
    await adapter.mount({} as HTMLElement, config);

    adapter.render({ markers: [marker("stale")], routes: [] });

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(FakeAdvancedMarker.instances).toHaveLength(0);
  });

  it("lets a same-owner factory reentrant render win and disposes the outer handle once", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false, cloudStyleProfileId: "map-test", mapId: "map" });
    const outerElement = new TestElement();
    const innerElement = new TestElement();
    const outerDispose = vi.fn();
    const innerDispose = vi.fn();
    const createMarkerContent = vi.fn((descriptor: MarkerDescriptor) => {
      if (descriptor.label === "Outer") {
        adapter.render({ markers: [marker("same", "Inner", 26, 122)], routes: [] });
        return {
          element: outerElement as unknown as HTMLElement,
          update: vi.fn(),
          dispose: outerDispose,
        };
      }
      return {
        element: innerElement as unknown as HTMLElement,
        update: vi.fn(),
        dispose: innerDispose,
      };
    });
    await adapter.mount({} as HTMLElement, mountConfig({ createMarkerContent }));

    adapter.render({ markers: [marker("same", "Outer")], routes: [] });

    expect(FakeAdvancedMarker.instances).toHaveLength(1);
    expect(FakeAdvancedMarker.instances[0]?.content).toBe(innerElement);
    expect(FakeAdvancedMarker.instances[0]?.position).toEqual({ lat: 26, lng: 122 });
    expect(outerDispose).toHaveBeenCalledTimes(1);
    expect(innerDispose).not.toHaveBeenCalled();
  });

  it("cleans an outer placement when its provider constructor reentrantly renders the same owner", async () => {
    let reentered = false;
    class ReentrantAdvancedMarker extends FakeAdvancedMarker {
      constructor(options: Record<string, unknown>) {
        super(options);
        if (!reentered) {
          reentered = true;
          adapter.render({ markers: [marker("same", "Inner", 26, 122)], routes: [] });
        }
      }
    }
    const adapter = new GoogleMapAdapter({
      ...runtime(),
      AdvancedMarkerElement: ReentrantAdvancedMarker,
    } as unknown as GoogleMapsRuntime, { development: false, cloudStyleProfileId: "map-test", mapId: "map" });
    const config = mountConfig();
    await adapter.mount({} as HTMLElement, config);

    adapter.render({ markers: [marker("same", "Outer")], routes: [] });

    expect(FakeAdvancedMarker.instances).toHaveLength(2);
    expect(FakeAdvancedMarker.instances[0]?.map).toBeNull();
    expect(FakeAdvancedMarker.instances[1]?.map).toBe(FakeMap.instances[0]);
    expect(FakeAdvancedMarker.instances[1]?.content).toBe(config.handles.markerElements[1]);
    expect(config.handles.markerDisposes[0]).toHaveBeenCalledTimes(1);
    expect(config.handles.markerDisposes[1]).not.toHaveBeenCalled();
  });

  it("removes marker ownership before detach reentrantly renders a replacement", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false, cloudStyleProfileId: "map-test", mapId: "map" });
    const config = mountConfig();
    await adapter.mount({} as HTMLElement, config);
    adapter.render({ markers: [marker("same", "Old")], routes: [] });
    let reentered = false;
    FakeAdvancedMarker.onDetach = () => {
      if (reentered) return;
      reentered = true;
      adapter.render({ markers: [marker("same", "Replacement", 27, 123)], routes: [] });
    };

    adapter.render({ markers: [], routes: [] });

    expect(FakeAdvancedMarker.instances).toHaveLength(2);
    expect(FakeAdvancedMarker.instances[0]?.map).toBeNull();
    expect(FakeAdvancedMarker.instances[1]?.map).toBe(FakeMap.instances[0]);
    expect(config.handles.markerDisposes[0]).toHaveBeenCalledTimes(1);
    expect(config.handles.markerDisposes[1]).not.toHaveBeenCalled();
  });

  it("removes marker ownership before dispose reentrantly destroys the adapter", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false, cloudStyleProfileId: "map-test", mapId: "map" });
    let reentered = false;
    const dispose = vi.fn(() => {
      if (reentered) return;
      reentered = true;
      adapter.destroy();
    });
    await adapter.mount({} as HTMLElement, mountConfig({
      createMarkerContent: () => ({
        element: new TestElement() as unknown as HTMLElement,
        update: vi.fn(),
        dispose,
      }),
    }));
    adapter.render({ markers: [marker("owner")], routes: [] });

    adapter.render({ markers: [], routes: [] });

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(FakeAdvancedMarker.instances[0]?.map).toBeNull();
  });

  it("finishes destroy invalidation when disposal reentrantly renders and throws", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false, cloudStyleProfileId: "map-test", mapId: "map" });
    const dispose = vi.fn(() => {
      adapter.render({ markers: [marker("resurrected")], routes: [] });
      throw new Error("dispose failed");
    });
    await adapter.mount({} as HTMLElement, mountConfig({
      createMarkerContent: () => ({
        element: new TestElement() as unknown as HTMLElement,
        update: vi.fn(),
        dispose,
      }),
    }));
    adapter.render({ markers: [marker("old")], routes: [] });

    expect(() => adapter.destroy()).toThrow("dispose failed");
    const nextConfig = mountConfig();
    await adapter.mount({} as HTMLElement, nextConfig);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(nextConfig.createMarkerContent).not.toHaveBeenCalled();
  });

  it("preserves a newer mount started reentrantly during destroy cleanup", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false, cloudStyleProfileId: "map-test", mapId: "map" });
    const onMarkerSelect = vi.fn();
    const onUnavailable = vi.fn();
    const nextConfig = mountConfig({
      events: { onMarkerSelect, onRouteSelect: vi.fn(), onUnavailable },
    });
    let nestedMount: Promise<void> | undefined;
    const oldDispose = vi.fn(() => {
      nestedMount = adapter.mount({} as HTMLElement, nextConfig);
    });
    await adapter.mount({} as HTMLElement, mountConfig({
      createMarkerContent: () => ({
        element: new TestElement() as unknown as HTMLElement,
        update: vi.fn(),
        dispose: oldDispose,
      }),
    }));
    adapter.render({ markers: [marker("old")], routes: [] });

    adapter.destroy();
    if (nestedMount === undefined) throw new Error("destroy cleanup did not start the nested mount");
    await nestedMount;
    adapter.render({ markers: [marker("current")], routes: [] });
    adapter.setUserLocation({ lat: 28, lng: 124 });

    expect(oldDispose).toHaveBeenCalledTimes(1);
    expect(nextConfig.createMarkerContent).toHaveBeenCalledExactlyOnceWith(marker("current"));
    expect(nextConfig.createUserLocationContent).toHaveBeenCalledExactlyOnceWith({
      coordinates: { lat: 28, lng: 124 },
    });
    expect(FakeAdvancedMarker.instances).toHaveLength(3);
    FakeAdvancedMarker.instances[1]?.emit("gmp-click");
    expect(onMarkerSelect).toHaveBeenCalledExactlyOnceWith("current");
    FakeMap.instances[1]?.emit("auth-failure");
    expect(onUnavailable).toHaveBeenCalledTimes(1);

    adapter.destroy();
    expect(nextConfig.handles.markerDisposes[0]).toHaveBeenCalledTimes(1);
    expect(nextConfig.handles.userDisposes[0]).toHaveBeenCalledTimes(1);
    expect(FakeMap.instances[1]?.unbindAll).toHaveBeenCalledTimes(1);
  });

  it("lets a reentrant user-location factory own the final location without leaking the outer handle", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false, cloudStyleProfileId: "map-test", mapId: "map" });
    const outerDispose = vi.fn();
    const innerDispose = vi.fn();
    const outerElement = new TestElement();
    const innerElement = new TestElement();
    let calls = 0;
    await adapter.mount({} as HTMLElement, mountConfig({
      createUserLocationContent: vi.fn(() => {
        calls += 1;
        if (calls === 1) {
          adapter.setUserLocation({ lat: 26, lng: 122 });
          return {
            element: outerElement as unknown as HTMLElement,
            update: vi.fn(),
            dispose: outerDispose,
          };
        }
        return {
          element: innerElement as unknown as HTMLElement,
          update: vi.fn(),
          dispose: innerDispose,
        };
      }),
    }));

    adapter.setUserLocation({ lat: 25, lng: 121 });

    expect(FakeAdvancedMarker.instances).toHaveLength(1);
    expect(FakeAdvancedMarker.instances[0]?.content).toBe(innerElement);
    expect(FakeAdvancedMarker.instances[0]?.position).toEqual({ lat: 26, lng: 122 });
    expect(outerDispose).toHaveBeenCalledTimes(1);
    expect(innerDispose).not.toHaveBeenCalled();
  });

  it("disposes newly created content when provider placement construction throws", async () => {
    class ThrowingAdvancedMarker {
      constructor() {
        throw new Error("provider marker failed");
      }
    }
    const hostileRuntime = {
      ...runtime(),
      AdvancedMarkerElement: ThrowingAdvancedMarker,
    } as unknown as GoogleMapsRuntime;
    const config = mountConfig();
    const adapter = new GoogleMapAdapter(hostileRuntime, { development: false, cloudStyleProfileId: "map-test", mapId: "map" });
    await adapter.mount({} as HTMLElement, config);

    expect(() => adapter.render({ markers: [marker("failed")], routes: [] })).toThrow(
      "provider marker failed",
    );
    expect(config.handles.markerDisposes[0]).toHaveBeenCalledTimes(1);
  });

  it("detaches a constructed AdvancedMarker when activation registration throws", async () => {
    class ThrowingListenerAdvancedMarker extends FakeAdvancedMarker {
      override addEventListener(name: string, listener: (event: unknown) => void): void {
        super.addEventListener(name, listener);
        throw new Error("advanced listener failed");
      }
    }
    const hostileRuntime = {
      ...runtime(),
      AdvancedMarkerElement: ThrowingListenerAdvancedMarker,
    } as unknown as GoogleMapsRuntime;
    const config = mountConfig();
    const adapter = new GoogleMapAdapter(hostileRuntime, { development: false, cloudStyleProfileId: "map-test", mapId: "map" });
    await adapter.mount({} as HTMLElement, config);

    expect(() => adapter.render({ markers: [marker("failed")], routes: [] })).toThrow(
      "advanced listener failed",
    );
    expect(FakeAdvancedMarker.instances[0]?.map).toBeNull();
    expect(FakeAdvancedMarker.instances[0]?.listeners.get("gmp-click")?.size ?? 0).toBe(0);
    expect(config.handles.markerDisposes[0]).toHaveBeenCalledTimes(1);
  });

  it("rolls back a partially attached OverlayView when provider setup throws", async () => {
    class ThrowingAttachedOverlay extends FakeOverlayView {
      override setMap(map: FakeMap | null): void {
        super.setMap(map);
        if (map !== null) throw new Error("overlay setup failed");
      }
    }
    const hostileRuntime = {
      ...runtime(),
      OverlayView: ThrowingAttachedOverlay,
    } as unknown as GoogleMapsRuntime;
    const config = mountConfig();
    const adapter = new GoogleMapAdapter(hostileRuntime, { development: false });
    await adapter.mount({} as HTMLElement, config);

    expect(() => adapter.render({ markers: [marker("failed")], routes: [] })).toThrow(
      "overlay setup failed",
    );
    expect(FakeMap.instances[0]?.overlayMouseTarget.children).toEqual([]);
    expect(config.handles.markerElements[0]?.listeners.get("click")?.size ?? 0).toBe(0);
    expect(config.handles.markerElements[0]?.listeners.get("keydown")?.size ?? 0).toBe(0);
    expect(config.handles.markerDisposes[0]).toHaveBeenCalledTimes(1);
  });

  it("rolls back an OverlayView listener that attaches before DOM registration throws", async () => {
    class ThrowingListenerElement extends TestElement {
      override addEventListener(name: string, listener: (event: unknown) => void): void {
        super.addEventListener(name, listener);
        throw new Error("DOM listener failed");
      }
    }
    const element = new ThrowingListenerElement();
    const dispose = vi.fn();
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig({
      createMarkerContent: () => ({
        element: element as unknown as HTMLElement,
        update: vi.fn(),
        dispose,
      }),
    }));

    expect(() => adapter.render({ markers: [marker("failed")], routes: [] })).toThrow(
      "DOM listener failed",
    );
    expect(element.listeners.get("click")?.size ?? 0).toBe(0);
    expect(FakeMap.instances[0]?.overlayMouseTarget.children).toEqual([]);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("reports a provider terminal failure once only to the current mounted generation", async () => {
    const oldUnavailable = vi.fn();
    const oldConfig = mountConfig({
      events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable: oldUnavailable },
    });
    const onUnavailable = vi.fn();
    const currentConfig = mountConfig({
      events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable },
    });
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, oldConfig);
    const oldMap = FakeMap.instances[0];
    await adapter.mount({} as HTMLElement, currentConfig);
    const currentMap = FakeMap.instances[1];

    oldMap?.emit("auth-failure");
    expect(oldUnavailable).not.toHaveBeenCalled();
    currentMap?.emit("auth-failure");
    currentMap?.emit("auth-failure");
    expect(onUnavailable).toHaveBeenCalledExactlyOnceWith({
      status: "unavailable",
      reason: "request-denied",
      retryable: false,
      diagnostic: "Google Maps authentication failed",
    });
    adapter.render({ markers: [marker("suppressed")], routes: [] });
    expect(currentConfig.createMarkerContent).not.toHaveBeenCalled();
    adapter.destroy();
    currentMap?.emit("auth-failure");
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });
});

describe("GoogleMapAdapter paint and route mechanics", () => {
  it("clears symbols when the same uncased route becomes solid and restores them on the next symbol update", async () => {
    let solid = false;
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig({ visualProfile: {
      ...profile, routeStyle: () => solid
        ? { kind: "solid", stroke: { color: "#111111", opacity: 1, width: 4 } }
        : { kind: "symbol", symbol: { shape: "circle", repeatPx: 12, scale: 3, fill: { color: "#222222", opacity: 1 } } },
    } }));
    adapter.render({ markers: [], routes: [route("same")] });
    expect(FakePolyline.instances[0].options.icons).toHaveLength(1);
    solid = true;
    adapter.render({ markers: [], routes: [route("same")] });
    expect(FakePolyline.instances[0].options.icons).toEqual([]);
    expect(FakePolyline.instances[0].options.strokeOpacity).toBe(1);
    solid = false;
    adapter.render({ markers: [], routes: [route("same")] });
    expect(FakePolyline.instances).toHaveLength(1);
    expect(FakePolyline.instances[0].options.icons).toHaveLength(1);
    expect(FakePolyline.instances[0].options.strokeOpacity).toBe(0);
    adapter.destroy();
  });

  it("translates all basemap palette and guidance fields into exact Google declarations", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());

    expect(FakeMap.instances[0]?.options).toEqual({
      center: { lat: 0, lng: 0 },
      zoom: 2,
      mapTypeId: "roadmap",
      disableDefaultUI: true,
      renderingType: "RASTER",
      styles: [
        { featureType: "all", elementType: "geometry", stylers: [{ color: "#101010" }] },
        { featureType: "all", elementType: "labels.text.fill", stylers: [{ color: "#202020" }] },
        { featureType: "all", elementType: "labels.text.stroke", stylers: [{ color: "#303030" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#404040" }] },
        { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#505050" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#606060" }] },
        { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
        { featureType: "transit.station", elementType: "labels", stylers: [{ visibility: "on" }] },
        { featureType: "all", elementType: "labels.icon", stylers: [{ visibility: "on" }] },
        { featureType: "all", elementType: "geometry", stylers: [{ gamma: 0.85 }] },
        { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "on" }] },
      ],
    });
  });

  it("translates every basemap mode, density, contrast, POI, and station guidance value", async () => {
    const modes = [
      ["neutral", "roadmap", { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "simplified" }] }],
      ["topographic", "terrain", { featureType: "landscape", elementType: "geometry", stylers: [{ visibility: "on" }] }],
      ["flat", "roadmap", { featureType: "landscape", elementType: "geometry", stylers: [{ visibility: "simplified" }] }],
      ["technical", "roadmap", { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "on" }] }],
      ["coastal", "roadmap", { featureType: "water", elementType: "labels", stylers: [{ visibility: "on" }] }],
      ["subdued", "roadmap", { featureType: "administrative", elementType: "labels", stylers: [{ visibility: "off" }] }],
    ] as const;
    for (const [mode, mapTypeId, modeStyle] of modes) {
      const visualProfile: MapVisualProfile = {
        ...profile,
        basemap: {
          ...profile.basemap,
          mode,
          density: mode === "neutral" ? "low" : mode === "topographic" ? "medium" : "high",
          contrast: mode === "neutral" ? "standard" : mode === "topographic" ? "high" : "soft",
          poi: mode === "neutral" ? "standard" : "minimal",
          stationLabels: mode === "neutral" ? "hidden" : "legible",
        },
      };
      const adapter = new GoogleMapAdapter(runtime(), { development: false });
      await adapter.mount({} as HTMLElement, mountConfig({ visualProfile }));
      const options = FakeMap.instances.at(-1)?.options;
      const styles = options?.styles as unknown[];
      expect(options?.mapTypeId).toBe(mapTypeId);
      expect(styles[6]).toEqual({
        featureType: "poi",
        elementType: "labels",
        stylers: [{ visibility: mode === "neutral" ? "on" : "off" }],
      });
      expect(styles[7]).toEqual({
        featureType: "transit.station",
        elementType: "labels",
        stylers: [{ visibility: mode === "neutral" ? "off" : "on" }],
      });
      expect(styles[8]).toEqual({
        featureType: "all",
        elementType: "labels.icon",
        stylers: [{ visibility: mode === "neutral" ? "off" : mode === "topographic" ? "simplified" : "on" }],
      });
      expect(styles[9]).toEqual({
        featureType: "all",
        elementType: "geometry",
        stylers: [{ gamma: mode === "neutral" ? 1 : mode === "topographic" ? 1.15 : 0.85 }],
      });
      expect(styles[10]).toEqual(modeStyle);
      adapter.destroy();
    }
  });

  it("maps solid, circle, and dash styles exactly and ignores later duplicate edge owners", async () => {
    const onRouteSelect = vi.fn();
    const config = mountConfig({
      events: { onMarkerSelect: vi.fn(), onRouteSelect, onUnavailable: vi.fn() },
    });
    const adapter = new GoogleMapAdapter(runtime(), { development: false, cloudStyleProfileId: "map-test", mapId: "map" });
    await adapter.mount({} as HTMLElement, config);
    adapter.render({
      markers: [],
      routes: [
        route("solid"),
        route("circle"),
        route("dash"),
        route("solid", [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }]),
      ],
    });

    expect(FakePolyline.instances.map(({ options }) => options)).toEqual([
      {
        map: FakeMap.instances[0],
        path: [{ lat: 25, lng: 121 }, { lat: 26, lng: 122 }],
        clickable: false,
        strokeColor: "#ffffff",
        strokeOpacity: 0.5,
        strokeWeight: 7,
        icons: [],
      },
      {
        map: FakeMap.instances[0],
        path: [{ lat: 25, lng: 121 }, { lat: 26, lng: 122 }],
        clickable: true,
        strokeColor: "#111111",
        strokeOpacity: 0.8,
        strokeWeight: 4,
        icons: [],
      },
      {
        map: FakeMap.instances[0],
        path: [{ lat: 25, lng: 121 }, { lat: 26, lng: 122 }],
        clickable: true,
        strokeOpacity: 0,
        icons: [{
          icon: {
            path: "provider-circle",
            scale: 3,
            fillColor: "#123456",
            fillOpacity: 0.7,
            strokeColor: "#abcdef",
            strokeOpacity: 0.9,
            strokeWeight: 2,
          },
          offset: "0",
          repeat: "12px",
        }],
      },
      {
        map: FakeMap.instances[0],
        path: [{ lat: 25, lng: 121 }, { lat: 26, lng: 122 }],
        clickable: true,
        strokeOpacity: 0,
        icons: [{
          icon: {
            path: "M 0,-1 0,1",
            scale: 5,
            fillColor: "#fedcba",
            fillOpacity: 0.2,
            strokeColor: "#654321",
            strokeOpacity: 0.6,
            strokeWeight: 3,
          },
          offset: "0",
          repeat: "18px",
        }],
      },
    ]);
    FakePolyline.instances[1]?.emit("click");
    expect(onRouteSelect).toHaveBeenCalledExactlyOnceWith("solid");
  });

  it("suppresses a route for invalid geometry or any invalid numeric/paint style field", async () => {
    const invalidProfile: MapVisualProfile = {
      ...profile,
      routeStyle(candidate) {
        if (candidate.edgeId === "valid") {
          return { kind: "solid", stroke: { color: "#123456", opacity: 1, width: 2 } };
        }
        if (candidate.edgeId === "bad-opacity") {
          return { kind: "solid", stroke: { color: "#123456", opacity: 2, width: 2 } };
        }
        if (candidate.edgeId === "bad-width") {
          return { kind: "solid", stroke: { color: "#123456", opacity: 1, width: Number.NaN } };
        }
        if (candidate.edgeId === "blank-paint") {
          return { kind: "solid", stroke: { color: " ", opacity: 1, width: 2 } };
        }
        return null;
      },
    };
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig({ visualProfile: invalidProfile }));
    adapter.render({
      markers: [],
      routes: [
        route("valid"),
        route("bad-opacity"),
        route("bad-width"),
        route("blank-paint"),
        route("none"),
        route("bad-coordinate", [
          { lat: 25, lng: 121 },
          { lat: Number.NaN, lng: 122 },
          { lat: 26, lng: 123 },
        ]),
      ],
    });
    expect(FakePolyline.instances).toHaveLength(1);
    expect(FakePolyline.instances[0]?.options.strokeColor).toBe("#123456");
  });

  it("suppresses a route when a returned paint field cannot be read", async () => {
    const hostileStroke = Object.defineProperty({ opacity: 1, width: 2 }, "color", {
      enumerable: true,
      get: () => {
        throw new Error("paint getter failed");
      },
    });
    const visualProfile: MapVisualProfile = {
      ...profile,
      routeStyle: () => ({ kind: "solid", stroke: hostileStroke } as unknown as ReturnType<MapVisualProfile["routeStyle"]>),
    };
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig({ visualProfile }));
    expect(() => adapter.render({ markers: [], routes: [route("hostile")] })).not.toThrow();
    expect(FakePolyline.instances).toHaveLength(0);
  });

  it("detaches route paint and listeners on removal and destroy", async () => {
    const onRouteSelect = vi.fn();
    const config = mountConfig({
      events: { onMarkerSelect: vi.fn(), onRouteSelect, onUnavailable: vi.fn() },
    });
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, config);
    adapter.render({ markers: [], routes: [route("solid")] });
    const firstPaint = [...FakePolyline.instances];
    adapter.render({ markers: [], routes: [] });
    expect(firstPaint.every(({ setMap }) => setMap.mock.calls.at(-1)?.[0] === null)).toBe(true);
    firstPaint.at(-1)?.emit("click");
    expect(onRouteSelect).not.toHaveBeenCalled();

    adapter.render({ markers: [], routes: [route("solid")] });
    const secondPaint = FakePolyline.instances.slice(firstPaint.length);
    adapter.destroy();
    expect(secondPaint.every(({ setMap }) => setMap.mock.calls.at(-1)?.[0] === null)).toBe(true);
  });

  it("reconciles an existing route by edgeId and ignores a later duplicate update", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());
    adapter.render({ markers: [], routes: [route("solid")] });
    const changed = route("solid", [{ lat: 27, lng: 123 }, { lat: 28, lng: 124 }]);
    adapter.render({
      markers: [],
      routes: [changed, route("solid", [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }])],
    });

    expect(FakePolyline.instances).toHaveLength(2);
    expect(FakePolyline.instances[0]?.setOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: changed.geometry }),
    );
    expect(FakePolyline.instances[1]?.setOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: changed.geometry }),
    );
  });

  it("lets a route-style callback reentrant render win for the same edge", async () => {
    let reentered = false;
    const innerGeometry = [{ lat: 27, lng: 123 }, { lat: 28, lng: 124 }];
    const visualProfile: MapVisualProfile = {
      ...profile,
      routeStyle(candidate) {
        if (!reentered) {
          reentered = true;
          adapter.render({ markers: [], routes: [route(candidate.edgeId, innerGeometry)] });
        }
        return {
          kind: "solid",
          stroke: { color: "#111111", opacity: 1, width: 4 },
        };
      },
    };
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig({ visualProfile }));

    adapter.render({ markers: [], routes: [route("edge")] });

    expect(FakePolyline.instances).toHaveLength(1);
    expect(FakePolyline.instances[0]?.options.path).toEqual(innerGeometry);
    expect(FakePolyline.instances[0]?.setOptions).not.toHaveBeenCalled();
  });

  it("cleans route objects when a provider constructor reentrantly renders the same edge", async () => {
    let reentered = false;
    const innerGeometry = [{ lat: 27, lng: 123 }, { lat: 28, lng: 124 }];
    class ReentrantPolyline extends FakePolyline {
      constructor(options: Record<string, unknown>) {
        super(options);
        if (!reentered) {
          reentered = true;
          adapter.render({ markers: [], routes: [route("solid", innerGeometry)] });
        }
      }
    }
    const adapter = new GoogleMapAdapter({
      ...runtime(),
      Polyline: ReentrantPolyline,
    } as unknown as GoogleMapsRuntime, { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());

    adapter.render({ markers: [], routes: [route("solid")] });

    expect(FakePolyline.instances).toHaveLength(3);
    expect(FakePolyline.instances[0]?.setMap).toHaveBeenCalledExactlyOnceWith(null);
    expect(FakePolyline.instances[1]?.map).toBe(FakeMap.instances[0]);
    expect(FakePolyline.instances[2]?.map).toBe(FakeMap.instances[0]);
    expect(FakePolyline.instances[1]?.options.path).toEqual(innerGeometry);
    expect(FakePolyline.instances[2]?.options.path).toEqual(innerGeometry);
  });

  it("detaches an earlier polyline when a later route constructor throws", async () => {
    let attempts = 0;
    class ThrowingSecondPolyline extends FakePolyline {
      constructor(options: Record<string, unknown>) {
        attempts += 1;
        if (attempts === 2) throw new Error("second polyline failed");
        super(options);
      }
    }
    const hostileRuntime = {
      ...runtime(),
      Polyline: ThrowingSecondPolyline,
    } as unknown as GoogleMapsRuntime;
    const adapter = new GoogleMapAdapter(hostileRuntime, { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());

    expect(() => adapter.render({ markers: [], routes: [route("solid")] })).toThrow(
      "second polyline failed",
    );
    expect(FakePolyline.instances).toHaveLength(1);
    expect(FakePolyline.instances[0]?.setMap).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("detaches every route object when primary listener registration throws", async () => {
    class ThrowingListenerPolyline extends FakePolyline {
      override addListener(): Listener {
        throw new Error("polyline listener failed");
      }
    }
    const hostileRuntime = {
      ...runtime(),
      Polyline: ThrowingListenerPolyline,
    } as unknown as GoogleMapsRuntime;
    const adapter = new GoogleMapAdapter(hostileRuntime, { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());

    expect(() => adapter.render({ markers: [], routes: [route("solid")] })).toThrow(
      "polyline listener failed",
    );
    expect(FakePolyline.instances).toHaveLength(2);
    expect(
      FakePolyline.instances.every(({ setMap }) => setMap.mock.calls.at(-1)?.[0] === null),
    ).toBe(true);
  });

  it("explicitly suppresses provider-default paint for absent optional symbol branches", async () => {
    const optionalProfile: MapVisualProfile = {
      ...profile,
      routeStyle(candidate) {
        return candidate.edgeId === "circle-no-stroke"
          ? {
              kind: "symbol",
              symbol: {
                shape: "circle",
                repeatPx: 10,
                scale: 2,
                fill: { color: "#123456", opacity: 0.8 },
              },
            }
          : {
              kind: "symbol",
              symbol: {
                shape: "dash",
                repeatPx: 14,
                scale: 4,
                stroke: { color: "#654321", opacity: 0.6, width: 3 },
              },
            };
      },
    };
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig({ visualProfile: optionalProfile }));
    adapter.render({
      markers: [],
      routes: [route("circle-no-stroke"), route("dash-no-fill")],
    });
    const circleIcon = (FakePolyline.instances[0]?.options.icons as Array<{ icon: unknown }>)[0]?.icon;
    const dashIcon = (FakePolyline.instances[1]?.options.icons as Array<{ icon: unknown }>)[0]?.icon;
    expect(circleIcon).toMatchObject({ strokeOpacity: 0 });
    expect(dashIcon).toMatchObject({ fillOpacity: 0 });
  });
});

describe("GoogleMapAdapter camera mechanics", () => {
  const deferredFocus: CameraIntent = {
    kind: "focus", intentId: "deferred", transition: "immediate",
    viewport: { width: 512, height: 512 }, usableRegion: { x: 0, y: 0, width: 512, height: 512 },
    edgeInsets: { top: 0, right: 0, bottom: 0, left: 0 }, coordinate: { lat: 0, lng: 0 }, targetZoom: 2,
  };

  it.each(["getProjection", "fromLatLngToPoint", "fromPointToLatLng", "moveCamera"] as const)("contains deferred %s failure once even when listener removal throws", async (method) => {
    const onUnavailable = vi.fn();
    const config = mountConfig({ events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable } });
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, config);
    const map = FakeMap.instances[0]; map.projectionReady = false;
    adapter.applyCameraIntent(deferredFocus);
    const held = holdMapCallback(map, "projection_changed");
    map.projectionReady = true;
    const failure = new Error(`deferred ${method} failed`);
    const fail = () => { throw failure; };
    const projection = map.getProjection()!;
    if (method === "getProjection") vi.spyOn(map, "getProjection").mockImplementation(fail);
    else if (method === "moveCamera") map.moveCamera.mockImplementation(fail);
    else vi.spyOn(map, "getProjection").mockReturnValue({ ...projection, [method]: fail });
    FakeMap.onListenerRemove = (name) => {
      if (name === "projection_changed") { held(); throw new Error("removal failed"); }
    };
    try {
      expect.soft(() => map.emit("projection_changed")).not.toThrow();
      expect(onUnavailable).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "network", retryable: true, diagnostic: failure.message });
      expect(map.listeners.get("projection_changed")?.size).toBe(0);
      expect(() => { held(); map.emit("auth-failure"); adapter.applyCameraIntent(deferredFocus); }).not.toThrow();
      expect(onUnavailable).toHaveBeenCalledTimes(1);
      adapter.render({ markers: [marker("suppressed")], routes: [] });
      expect(config.createMarkerContent).not.toHaveBeenCalled();
    } finally { adapter.destroy(); }
  });

  it.each(["replace", "remount", "destroy"] as const)("ignores a deferred provider throw after it reentrantly causes %s", async (action) => {
    const onUnavailable = vi.fn();
    const config = mountConfig({ events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable } });
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, config);
    const map = FakeMap.instances[0]; map.projectionReady = false;
    adapter.applyCameraIntent(deferredFocus);
    const held = holdMapCallback(map, "projection_changed");
    map.projectionReady = true;
    const projection = map.getProjection()!;
    let remount: Promise<void> | undefined;
    const getProjection = vi.spyOn(map, "getProjection").mockImplementationOnce(() => {
      if (action === "replace") adapter.applyCameraIntent({ ...deferredFocus, intentId: "newer" });
      else if (action === "remount") remount = adapter.mount({} as HTMLElement, config);
      else adapter.destroy();
      throw new Error("superseded provider failure");
    }).mockReturnValue(projection);
    try {
      expect.soft(() => held()).not.toThrow();
      await remount;
      expect(onUnavailable).not.toHaveBeenCalled();
      if (action === "replace") expect(map.moveCamera).toHaveBeenCalledTimes(1);
      if (action === "remount") {
        adapter.applyCameraIntent(deferredFocus);
        expect(FakeMap.instances[1].moveCamera).toHaveBeenCalledTimes(1);
      }
      expect(() => held()).not.toThrow();
      expect(getProjection).toHaveBeenCalledTimes(action === "replace" ? 2 : 1);
    } finally { adapter.destroy(); }
  });

  it("does not report an old deferred failure after listener removal remounts the adapter", async () => {
    const onUnavailable = vi.fn();
    const config = mountConfig({ events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable } });
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, config);
    const map = FakeMap.instances[0]; map.projectionReady = false;
    adapter.applyCameraIntent(deferredFocus);
    vi.spyOn(map, "getProjection").mockImplementation(() => { throw new Error("old projection failure"); });
    let remount: Promise<void> | undefined;
    FakeMap.onListenerRemove = (name) => {
      if (name === "projection_changed") { remount = adapter.mount({} as HTMLElement, config); throw new Error("old removal failure"); }
    };
    try {
      expect.soft(() => map.emit("projection_changed")).not.toThrow();
      await remount;
      expect(FakeMap.instances).toHaveLength(2);
      expect(onUnavailable).not.toHaveBeenCalled();
      adapter.applyCameraIntent(deferredFocus);
      expect(FakeMap.instances[1].moveCamera).toHaveBeenCalledTimes(1);
    } finally { adapter.destroy(); }
  });

  it("consumes successful deferred work despite throwing removal and permits a newer camera intent", async () => {
    const onUnavailable = vi.fn();
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig({ events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable } }));
    const map = FakeMap.instances[0]; map.projectionReady = false;
    adapter.applyCameraIntent(deferredFocus);
    const held = holdMapCallback(map, "projection_changed");
    FakeMap.onListenerRemove = (name) => { if (name === "projection_changed") { held(); throw new Error("removal failed"); } };
    map.projectionReady = true;
    try {
      expect.soft(() => held()).not.toThrow();
      held();
      expect(map.moveCamera).toHaveBeenCalledTimes(1);
      expect(onUnavailable).not.toHaveBeenCalled();
      adapter.applyCameraIntent({ ...deferredFocus, intentId: "newer" });
      expect(map.moveCamera).toHaveBeenCalledTimes(2);
    } finally { adapter.destroy(); }
  });

  it("contains deferred failure and throwing removal when readiness fires during listener registration", async () => {
    const onUnavailable = vi.fn();
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig({ events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable } }));
    const map = FakeMap.instances[0]; map.projectionReady = false;
    const register = map.addListener.bind(map);
    vi.spyOn(map, "addListener").mockImplementation((name, callback) => {
      const listener = register(name, callback);
      if (name === "projection_changed") {
        map.projectionReady = true;
        map.moveCamera.mockImplementation(() => { throw new Error("registration camera failure"); });
        callback();
      }
      return listener;
    });
    FakeMap.onListenerRemove = (name) => { if (name === "projection_changed") throw new Error("removal failed"); };
    try {
      expect.soft(() => adapter.applyCameraIntent(deferredFocus)).not.toThrow();
      expect(onUnavailable).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "network", retryable: true, diagnostic: "registration camera failure" });
      expect(map.listeners.get("projection_changed")?.size).toBe(0);
      map.emit("projection_changed");
      expect(onUnavailable).toHaveBeenCalledTimes(1);
    } finally { adapter.destroy(); }
  });

  it("contains deferred hostile error diagnostics without coercing the thrown value", async () => {
    const onUnavailable = vi.fn();
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig({ events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable } }));
    const map = FakeMap.instances[0]; map.projectionReady = false;
    adapter.applyCameraIntent(deferredFocus);
    const hostile = new Error("private");
    Object.defineProperty(hostile, "message", { get: () => { throw new Error("hostile diagnostic"); } });
    const coerce = vi.fn(() => { throw new Error("must not coerce"); });
    hostile.toString = coerce;
    vi.spyOn(map, "getProjection").mockImplementation(() => { throw hostile; });
    try {
      let escaped = false;
      try { map.emit("projection_changed"); } catch { escaped = true; }
      expect.soft(escaped).toBe(false);
      expect(onUnavailable).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "network", retryable: true, diagnostic: "Google Maps deferred camera operation failed" });
      expect(coerce).not.toHaveBeenCalled();
    } finally { adapter.destroy(); }
  });

  it("does not inspect a deferred stale error after provider work replaces the intent", async () => {
    const onUnavailable = vi.fn();
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig({ events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable } }));
    const map = FakeMap.instances[0]; map.projectionReady = false;
    adapter.applyCameraIntent(deferredFocus);
    map.projectionReady = true;
    const projection = map.getProjection()!;
    const message = vi.fn(() => { adapter.destroy(); return "stale"; });
    const failure = Object.defineProperty(new Error(), "message", { get: message });
    vi.spyOn(map, "getProjection").mockImplementationOnce(() => {
      adapter.applyCameraIntent({ ...deferredFocus, intentId: "newer" });
      throw failure;
    }).mockReturnValue(projection);
    try {
      map.emit("projection_changed");
      expect(message).not.toHaveBeenCalled();
      expect(onUnavailable).not.toHaveBeenCalled();
      expect(map.moveCamera).toHaveBeenCalledTimes(1);
      expect(adapter.getCameraSnapshot()).not.toBeNull();
    } finally { adapter.destroy(); }
  });

  it("contains deferred provider reentry before reporting the original failure once", async () => {
    const onUnavailable = vi.fn();
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig({ events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable } }));
    const map = FakeMap.instances[0]; map.projectionReady = false;
    adapter.applyCameraIntent(deferredFocus);
    const held = holdMapCallback(map, "projection_changed");
    const projection = vi.spyOn(map, "getProjection").mockImplementation(() => {
      if (projection.mock.calls.length < 2) held();
      throw new Error("original projection failure");
    });
    try {
      expect(() => held()).not.toThrow();
      expect(projection).toHaveBeenCalledTimes(1);
      expect(onUnavailable).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "network", retryable: true, diagnostic: "original projection failure" });
    } finally { adapter.destroy(); }
  });

  it("snapshots caller geometry while waiting for immediate projection readiness", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());
    const map = FakeMap.instances[0]; map.projectionReady = false;
    const intent: CameraIntent = { kind: "fit", intentId: "snapshot", transition: "immediate", viewport: { width: 512, height: 512 }, usableRegion: { x: 0, y: 0, width: 512, height: 512 }, edgeInsets: { top: 0, right: 0, bottom: 0, left: 0 }, points: [{ lat: 0, lng: -45 }], paths: [[{ lat: 0, lng: 45 }]], maximumZoom: 2 };
    adapter.applyCameraIntent(intent);
    intent.points[0].lng = 0; intent.paths[0][0].lng = 90; intent.edgeInsets.left = 100;
    map.projectionReady = true; map.emit("projection_changed");
    expect(map.moveCamera).toHaveBeenCalledExactlyOnceWith({ center: { lat: (expect.closeTo(0, 9) as unknown), lng: 0 }, zoom: 2, heading: 0, tilt: 0 });
    adapter.destroy();
  });

  it("fits the vertical path extent under the supplied maximum using projected geometry", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());
    adapter.applyCameraIntent({ kind: "fit", intentId: "vertical", transition: "immediate", viewport: { width: 512, height: 512 }, usableRegion: { x: 64, y: 0, width: 448, height: 384 }, edgeInsets: { top: 0, right: 0, bottom: 128, left: 64 }, points: [{ lat: 0, lng: 0 }], paths: [[{ lat: 66.51326044311186, lng: 0 }, { lat: -66.51326044311186, lng: 0 }]], maximumZoom: 8 });
    expect(FakeMap.instances[0].moveCamera).toHaveBeenCalledExactlyOnceWith({ center: { lat: (expect.closeTo(-40.9798980696, 9) as unknown), lng: -22.5 }, zoom: 1, heading: 0, tilt: 0 });
    adapter.destroy();
  });

  it.each(["fit", "focus", "recenter-user"] as const)("uses only a nonanimated projected move for immediate %s, including a repeated-ID inset reframe", async (kind) => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());
    const map = FakeMap.instances[0];
    const common = { intentId: "same", transition: "immediate" as const, viewport: { width: 512, height: 512 }, usableRegion: { x: 64, y: 0, width: 448, height: 384 }, edgeInsets: { top: 0, right: 0, bottom: 128, left: 64 } };
    const intent: CameraIntent = kind === "fit" ? { ...common, kind, points: [{ lat: 0, lng: -45 }], paths: [[{ lat: 0, lng: 45 }]], maximumZoom: 5 } : { ...common, kind, coordinate: { lat: 0, lng: 0 }, targetZoom: 2 };
    adapter.applyCameraIntent(intent);
    expect.soft(map.fitBounds).not.toHaveBeenCalled();
    expect.soft(map.panBy).not.toHaveBeenCalled();
    expect.soft(map.panTo).not.toHaveBeenCalled();
    expect.soft(map.setZoom).not.toHaveBeenCalled();
    expect(map.moveCamera).toHaveBeenCalledExactlyOnceWith({
      center: { lat: (expect.closeTo(-21.9430455334, 9) as unknown), lng: -11.25 }, zoom: 2, heading: 0, tilt: 0,
    });
    adapter.applyCameraIntent({ ...intent, edgeInsets: { top: 0, right: 0, bottom: 0, left: 0 } });
    expect(map.moveCamera).toHaveBeenCalledTimes(2);
    expect(map.moveCamera.mock.calls[1]?.[0]).toMatchObject({ center: { lat: (expect.closeTo(0, 9) as unknown), lng: 0 } });
    adapter.destroy();
  });

  it("waits for projection readiness and suppresses superseded or destroyed immediate operations", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());
    const map = FakeMap.instances[0]; map.projectionReady = false;
    const intent: CameraIntent = { kind: "focus", intentId: "same", transition: "immediate", viewport: { width: 512, height: 512 }, usableRegion: { x: 0, y: 0, width: 512, height: 512 }, edgeInsets: { top: 0, right: 0, bottom: 0, left: 0 }, coordinate: { lat: 0, lng: 0 }, targetZoom: 2 };
    adapter.applyCameraIntent(intent);
    expect(map.moveCamera).not.toHaveBeenCalled();
    const stale = holdMapCallback(map, "projection_changed");
    adapter.applyCameraIntent({ ...intent, coordinate: { lat: 0, lng: 45 } });
    map.projectionReady = true; stale(); map.emit("projection_changed");
    expect(map.moveCamera).toHaveBeenCalledExactlyOnceWith({ center: { lat: (expect.closeTo(0, 9) as unknown), lng: 45 }, zoom: 2, heading: 0, tilt: 0 });
    map.projectionReady = false; adapter.applyCameraIntent(intent);
    const destroyed = holdMapCallback(map, "projection_changed");
    adapter.destroy(); map.projectionReady = true; destroyed();
    expect(map.moveCamera).toHaveBeenCalledTimes(1);
  });

  const base = {
    intentId: "camera",
    viewport: { width: 400, height: 600 },
    usableRegion: { x: 40, y: 10, width: 340, height: 540 },
    edgeInsets: { top: 10, right: 20, bottom: 50, left: 40 },
  } as const;

  it("fits animated supplied geometry with exact insets, then clamps on idle", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());
    const map = FakeMap.instances[0]!;
    const animated: CameraIntent = {
      ...base,
      kind: "fit",
      transition: "animate",
      points: [{ lat: 20, lng: 130 }],
      paths: [[{ lat: 10, lng: 120 }, { lat: 30, lng: 140 }]],
      maximumZoom: 14,
    };
    adapter.applyCameraIntent(animated);
    expect(map.fitBounds).toHaveBeenLastCalledWith(
      { north: 30, south: 10, east: 140, west: 120 },
      { top: 10, right: 20, bottom: 50, left: 40 },
    );
    map.zoom = 16;
    map.emit("idle");
    expect(map.setZoom).toHaveBeenCalledExactlyOnceWith(14);

  });

  it("lets only the newest camera operation clamp zoom", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());
    const map = FakeMap.instances[0]!;
    const fit: CameraIntent = {
      ...base,
      kind: "fit",
      transition: "animate",
      points: [{ lat: 20, lng: 130 }],
      paths: [],
      maximumZoom: 14,
    };

    adapter.applyCameraIntent({ ...fit, intentId: "old-fit", maximumZoom: 9 });
    const oldIdle = holdMapCallback(map, "idle");
    adapter.applyCameraIntent({ ...fit, intentId: "new-fit" });
    const currentIdle = holdMapCallback(map, "idle");
    map.zoom = 20;

    expect(() => oldIdle()).not.toThrow();
    expect(map.setZoom).not.toHaveBeenCalled();
    currentIdle();
    expect(map.setZoom).toHaveBeenCalledExactlyOnceWith(14);
  });

  it("lets a newer intent triggered by idle-listener removal win before stale provider work", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());
    const map = FakeMap.instances[0]!;
    const fit: CameraIntent = {
      ...base,
      kind: "fit",
      transition: "animate",
      points: [{ lat: 20, lng: 130 }],
      paths: [],
      maximumZoom: 14,
    };
    adapter.applyCameraIntent(fit);
    map.fitBounds.mockClear();
    let reentered = false;
    FakeMap.onListenerRemove = (name) => {
      if (name !== "idle" || reentered) return;
      reentered = true;
      adapter.applyCameraIntent({
        ...base,
        intentId: "newer",
        kind: "focus",
        transition: "immediate",
        coordinate: { lat: 27, lng: 123 },
        targetZoom: 16,
      });
    };

    adapter.applyCameraIntent({ ...fit, intentId: "stale-outer" });

    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(map.panTo).not.toHaveBeenCalled();
    expect(map.moveCamera).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ zoom: 16, heading: 0, tilt: 0 }));
  });

  it("consumes a retained idle callback before provider cleanup so it is truly one-shot", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());
    const map = FakeMap.instances[0]!;
    adapter.applyCameraIntent({
      ...base,
      kind: "fit",
      transition: "animate",
      points: [{ lat: 20, lng: 130 }],
      paths: [],
      maximumZoom: 10,
    });
    const retainedIdle = holdMapCallback(map, "idle");
    map.zoom = 20;
    retainedIdle();
    map.zoom = 20;

    expect(() => retainedIdle()).not.toThrow();
    expect(map.setZoom).toHaveBeenCalledExactlyOnceWith(10);
  });

  it("does not let a stale clamp mutate after getZoom reentrantly applies a newer intent", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());
    const map = FakeMap.instances[0]!;
    adapter.applyCameraIntent({
      ...base,
      kind: "fit",
      transition: "animate",
      points: [{ lat: 20, lng: 130 }],
      paths: [],
      maximumZoom: 10,
    });
    const idle = holdMapCallback(map, "idle");
    map.zoom = 20;
    let reentered = false;
    FakeMap.onGetZoom = () => {
      if (reentered) return;
      reentered = true;
      adapter.applyCameraIntent({
        ...base,
        intentId: "newer",
        kind: "recenter-user",
        transition: "immediate",
        coordinate: { lat: 28, lng: 124 },
        targetZoom: 17,
      });
    };

    idle();

    expect(map.setZoom).not.toHaveBeenCalled();
    expect(map.moveCamera).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ zoom: 17, heading: 0, tilt: 0 }));
  });

  it("does not let a stale clamp mutate after getZoom reentrantly reports terminal failure", async () => {
    const onUnavailable = vi.fn();
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig({
      events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable },
    }));
    const map = FakeMap.instances[0]!;
    adapter.applyCameraIntent({
      ...base,
      kind: "fit",
      transition: "animate",
      points: [{ lat: 20, lng: 130 }],
      paths: [],
      maximumZoom: 10,
    });
    const idle = holdMapCallback(map, "idle");
    map.zoom = 20;
    let reentered = false;
    FakeMap.onGetZoom = () => {
      if (reentered) return;
      reentered = true;
      map.emit("auth-failure");
    };

    expect(() => idle()).not.toThrow();

    expect(map.setZoom).not.toHaveBeenCalled();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it.each(["focus", "recenter-user"] as const)(
    "invalidates a pending fit clamp when a newer %s intent takes ownership",
    async (kind) => {
      const adapter = new GoogleMapAdapter(runtime(), { development: false });
      await adapter.mount({} as HTMLElement, mountConfig());
      const map = FakeMap.instances[0]!;
      adapter.applyCameraIntent({
        ...base,
        intentId: "fit",
        kind: "fit",
        transition: "animate",
        points: [{ lat: 20, lng: 130 }],
        paths: [],
        maximumZoom: 10,
      });
      const staleIdle = holdMapCallback(map, "idle");
      adapter.applyCameraIntent({
        ...base,
        intentId: "replacement",
        kind,
        transition: "immediate",
        coordinate: { lat: 25, lng: 121 },
        targetZoom: 15,
      });
      map.zoom = 20;

      expect(() => staleIdle()).not.toThrow();
      expect(map.setZoom).not.toHaveBeenCalled();
    },
  );

  it("makes held idle callbacks inert after remount and destroy", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());
    const oldMap = FakeMap.instances[0]!;
    adapter.applyCameraIntent({
      ...base,
      kind: "fit",
      transition: "animate",
      points: [{ lat: 20, lng: 130 }],
      paths: [],
      maximumZoom: 10,
    });
    const beforeRemount = holdMapCallback(oldMap, "idle");
    await adapter.mount({} as HTMLElement, mountConfig());
    oldMap.zoom = 20;
    expect(() => beforeRemount()).not.toThrow();
    expect(oldMap.setZoom).not.toHaveBeenCalled();

    const currentMap = FakeMap.instances[1]!;
    adapter.applyCameraIntent({
      ...base,
      intentId: "after-remount",
      kind: "fit",
      transition: "animate",
      points: [{ lat: 21, lng: 131 }],
      paths: [],
      maximumZoom: 11,
    });
    const beforeDestroy = holdMapCallback(currentMap, "idle");
    adapter.destroy();
    currentMap.zoom = 20;
    expect(() => beforeDestroy()).not.toThrow();
    expect(currentMap.setZoom).not.toHaveBeenCalled();
  });

  it("makes a pending idle clamp inert after terminal failure", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());
    const map = FakeMap.instances[0]!;
    adapter.applyCameraIntent({
      ...base,
      kind: "fit",
      transition: "animate",
      points: [{ lat: 20, lng: 130 }],
      paths: [],
      maximumZoom: 10,
    });
    const staleIdle = holdMapCallback(map, "idle");
    map.emit("auth-failure");
    map.zoom = 20;

    expect(() => staleIdle()).not.toThrow();
    expect(map.setZoom).not.toHaveBeenCalled();
  });

  it("settles a current idle clamp when the provider zoom read throws", async () => {
    class ThrowingIdleZoomMap extends FakeMap {
      override getZoom(): unknown {
        throw new Error("idle zoom getter failed");
      }
    }
    const hostileRuntime = { ...runtime(), Map: ThrowingIdleZoomMap } as GoogleMapsRuntime;
    const adapter = new GoogleMapAdapter(hostileRuntime, { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());
    const map = FakeMap.instances[0]!;
    adapter.applyCameraIntent({
      ...base,
      kind: "fit",
      transition: "animate",
      points: [{ lat: 20, lng: 130 }],
      paths: [],
      maximumZoom: 10,
    });

    expect(() => holdMapCallback(map, "idle")()).not.toThrow();
    expect(map.setZoom).not.toHaveBeenCalled();
  });

  it("suppresses a whole fit intent when any supplied coordinate is invalid", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());
    const map = FakeMap.instances[0]!;
    adapter.applyCameraIntent({
      ...base,
      kind: "fit",
      transition: "animate",
      points: [{ lat: 20, lng: 130 }],
      paths: [[{ lat: Number.NaN, lng: 120 }, { lat: 30, lng: 140 }]],
      maximumZoom: 14,
    });
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it("applies repeated focus/recenter IDs with exact zoom, transition operation, and usable-center offset", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());
    const map = FakeMap.instances[0]!;

    adapter.applyCameraIntent({
      ...base,
      kind: "focus",
      transition: "animate",
      coordinate: { lat: 25, lng: 121 },
      targetZoom: 16,
    });
    adapter.applyCameraIntent({
      ...base,
      kind: "recenter-user",
      transition: "immediate",
      coordinate: { lat: 26, lng: 122 },
      targetZoom: 13,
    });
    adapter.applyCameraIntent({
      ...base,
      kind: "focus",
      transition: "animate",
      coordinate: { lat: 27, lng: 123 },
      targetZoom: 15,
    });

    expect(map.panTo.mock.calls).toEqual([[{ lat: 25, lng: 121 }], [{ lat: 27, lng: 123 }]]);
    expect(map.setZoom.mock.calls).toEqual([[16], [15]]);
    expect(map.moveCamera).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ zoom: 13, heading: 0, tilt: 0 }));
    const target = {
      x: base.usableRegion.x + base.usableRegion.width / 2,
      y: base.usableRegion.y + base.usableRegion.height / 2,
    };
    for (const [x, y] of map.panBy.mock.calls) {
      const providerScreenPosition = {
        x: base.viewport.width / 2 - x,
        y: base.viewport.height / 2 - y,
      };
      expect(providerScreenPosition).toEqual(target);
    }
  });

  it("returns only finite provider zoom snapshots", async () => {
    const adapter = new GoogleMapAdapter(runtime(), { development: false });
    expect(adapter.getCameraSnapshot()).toBeNull();
    await adapter.mount({} as HTMLElement, mountConfig());
    const map = FakeMap.instances[0]!;
    map.zoom = 12.5;
    expect(adapter.getCameraSnapshot()).toEqual({ zoom: 12.5 });
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, undefined, "12"]) {
      map.zoom = value;
      expect(adapter.getCameraSnapshot()).toBeNull();
    }
  });

  it("returns null when the provider zoom read fails", async () => {
    class ThrowingZoomMap extends FakeMap {
      override getZoom(): unknown {
        throw new Error("zoom getter failed");
      }
    }
    const hostileRuntime = { ...runtime(), Map: ThrowingZoomMap } as GoogleMapsRuntime;
    const adapter = new GoogleMapAdapter(hostileRuntime, { development: false });
    await adapter.mount({} as HTMLElement, mountConfig());
    expect(() => adapter.getCameraSnapshot()).not.toThrow();
    expect(adapter.getCameraSnapshot()).toBeNull();
  });
});

describe("GoogleMapAdapter constructor boundary", () => {
  it("accepts only runtime plus mechanics options", () => {
    const args: ConstructorParameters<typeof GoogleMapAdapter> = [runtime(), { development: true }];
    expect(new GoogleMapAdapter(...args)).toBeInstanceOf(GoogleMapAdapter);
    // @ts-expect-error Presentation profiles belong to MapMountConfig, not constructor options.
    new GoogleMapAdapter(runtime(), { development: true, profile });
    // @ts-expect-error DOM elements belong to mount, not construction.
    new GoogleMapAdapter(runtime(), { development: true }, {} as HTMLElement);
  });

  it("refuses a failed mapId read before any provider construction", () => {
    const options = Object.defineProperty({ development: true }, "mapId", {
      get: () => { throw new Error("map ID getter failed"); },
    });
    expect(() => new GoogleMapAdapter(runtime(), options as GoogleMapAdapterOptions)).toThrow(/valid pair/);
    expect(FakeMap.instances).toHaveLength(0);
  });
});
