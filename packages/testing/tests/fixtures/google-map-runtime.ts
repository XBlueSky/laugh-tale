import type { Coordinates } from "@laugh-tale-island/core";
import type { GoogleMapsRuntime } from "@laugh-tale-island/adapters/google";
import { MAP_ADAPTER_V2_CONTRACT_BRIDGE, type MapAdapterV2ContractBridge, type MapContractRouteMutation } from "../../src/contracts/map-adapter-v2.js";

interface Listener { remove(): void }

interface RuntimePlacement {
  element: HTMLElement;
  initialPosition: Coordinates;
  positionUpdates: Coordinates[];
  detachCount: number;
  select(): void;
}

interface RuntimeRoute {
  creation: MapContractRouteMutation;
  updates: MapContractRouteMutation[];
  detachCount: number;
  select(): void;
}

interface RuntimeBridge extends MapAdapterV2ContractBridge {
  sequence: string[];
  mapConstructions: number;
  markerPlacements: RuntimePlacement[];
  routePlacements: RuntimeRoute[];
  fitCalls: unknown[][];
  immediateCameraCalls: unknown[];
  animatedCameraCalls: unknown[];
  panByCalls: unknown[];
  zoomWrites: number[];
  expectedUnavailable: { status: "unavailable"; reason: "request-denied"; retryable: false; diagnostic: string };
  currentMap: { emit(name: string): void; readonly options: Record<string, unknown> } | null;
  pendingRouteOwners: string[];
  routeOwner(edgeId: string): void;
  takeRouteOwner(): string;
  idle(): void;
}

export function runtimeBridge(element: HTMLElement): RuntimeBridge {
  const value = (element as HTMLElement & { [MAP_ADAPTER_V2_CONTRACT_BRIDGE]?: RuntimeBridge })[MAP_ADAPTER_V2_CONTRACT_BRIDGE];
  if (value === undefined) throw new Error("Missing map contract bridge");
  return value;
}

export function createRuntime(): GoogleMapsRuntime {
  const subscribers = new Set<() => void>();
  const maps: MapInstance[] = [];
  function observeRoute(edgeId: string, options: Record<string, unknown>, map: MapInstance): MapContractRouteMutation {
    return {
      edgeId,
      geometry: structuredClone(options.path as Coordinates[]),
      paint: {
        color: options.strokeColor as string,
        opacity: options.strokeOpacity as number,
        width: options.strokeWeight as number,
      },
      clickable: options.clickable === true,
      mapAssociated: options.map === map,
    };
  }

  class MapInstance {
    readonly listeners = new Map<string, Set<() => void>>();
    readonly bridge: RuntimeBridge;
    zoom = 9;
    constructor(readonly element: HTMLElement, readonly options: Record<string, unknown>) {
      this.bridge = runtimeBridge(element);
      this.bridge.mapConstructions += 1;
      this.bridge.currentMap = this;
      this.listeners.set("auth-failure", new Set(subscribers));
      maps.push(this);
    }
    addListener(name: string, callback: () => void): Listener {
      const bucket = this.listeners.get(name) ?? new Set();
      bucket.add(callback);
      this.listeners.set(name, bucket);
      return { remove: () => bucket.delete(callback) };
    }
    emit(name: string): void { for (const callback of [...(this.listeners.get(name) ?? [])]) callback(); }
    fitBounds(bounds: unknown, padding: unknown): void {
      this.bridge.fitCalls.push([structuredClone(bounds), structuredClone(padding)]);
      this.bridge.animatedCameraCalls.push({ method: "fitBounds" });
    }
    getZoom(): number { return this.zoom; }
    moveCamera(options: { center: unknown; zoom: number }): void { this.bridge.immediateCameraCalls.push(structuredClone(options)); this.zoom = options.zoom; }
    panBy(x: number, y: number): void { this.bridge.panByCalls.push([x, y]); this.bridge.animatedCameraCalls.push({ method: "panBy", x, y }); }
    panTo(coordinate: unknown): void { this.bridge.animatedCameraCalls.push({ method: "panTo", coordinate: structuredClone(coordinate) }); }
    setZoom(zoom: number): void { this.bridge.zoomWrites.push(zoom); this.zoom = zoom; this.bridge.animatedCameraCalls.push({ method: "setZoom", zoom }); }
    getProjection() {
      return {
        fromLatLngToPoint: ({ lat, lng }: Coordinates) => ({ x: (lng + 180) * 256 / 360, y: 128 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 128 / Math.PI }),
        fromPointToLatLng: ({ x, y }: { x: number; y: number }) => ({ lat: () => Math.atan(Math.sinh((128 - y) * Math.PI / 128)) * 180 / Math.PI, lng: () => x * 360 / 256 - 180 }),
      };
    }
    unbindAll(): void { this.listeners.clear(); }
  }

  class AdvancedMarker {
    readonly listeners = new Map<string, Set<(event: unknown) => void>>();
    readonly content: HTMLElement;
    private mapValue: MapInstance | null;
    private positionValue: unknown;
    private readonly placement: RuntimePlacement;
    constructor(options: Record<string, unknown>) {
      this.mapValue = options.map as MapInstance;
      this.positionValue = options.position;
      this.content = options.content as HTMLElement;
      this.mapValue.element.appendChild(this.content);
      this.placement = {
        element: this.content,
        initialPosition: structuredClone(this.positionValue as Coordinates),
        positionUpdates: [],
        detachCount: 0,
        select: () => this.emit("gmp-click"),
      };
      this.mapValue.bridge.markerPlacements.push(this.placement);
    }
    get map(): unknown { return this.mapValue; }
    set map(value: unknown) {
      this.mapValue = value as MapInstance | null;
      if (value === null) {
        this.placement.detachCount += 1;
        this.content.remove();
      }
    }
    get position(): unknown { return this.positionValue; }
    set position(value: unknown) {
      this.positionValue = value;
      this.placement.positionUpdates.push(structuredClone(value as Coordinates));
      this.mapValue?.bridge.sequence.push("provider-position");
    }
    addEventListener(name: string, listener: (event: unknown) => void): void {
      const bucket = this.listeners.get(name) ?? new Set();
      bucket.add(listener);
      this.listeners.set(name, bucket);
    }
    removeEventListener(name: string, listener: (event: unknown) => void): void { this.listeners.get(name)?.delete(listener); }
    emit(name: string): void { for (const callback of [...(this.listeners.get(name) ?? [])]) callback({ type: name }); }
  }

  class Overlay {
    private map: MapInstance | null = null;
    private placement: RuntimePlacement | undefined;
    setMap(map: MapInstance | null): void {
      const own = this as unknown as { onAdd(): void; draw(): void; onRemove(): void };
      if (this.map !== null) { own.onRemove(); if (this.placement) this.placement.detachCount += 1; }
      this.map = map;
      if (map !== null) { own.onAdd(); own.draw(); }
    }
    getPanes() { return this.map === null ? null : { overlayMouseTarget: this.map.element }; }
    getProjection() {
      const map = this.map;
      if (map === null) return null;
      return { fromLatLngToDivPixel: (coordinate: Coordinates) => {
        if (this.placement === undefined) {
          const element = map.element.lastElementChild?.firstElementChild as HTMLElement;
          this.placement = { element, initialPosition: structuredClone(coordinate), positionUpdates: [], detachCount: 0, select: () => element.click() };
          map.bridge.markerPlacements.push(this.placement);
        } else {
          this.placement.positionUpdates.push(structuredClone(coordinate));
          map.bridge.sequence.push("provider-position");
        }
        return { x: 400, y: 300 };
      } };
    }
  }

  class Polyline {
    readonly listeners = new Map<string, Set<() => void>>();
    readonly map: MapInstance;
    readonly route: RuntimeRoute;
    constructor(public options: Record<string, unknown>) {
      this.map = options.map as MapInstance;
      const edgeId = this.map.bridge.takeRouteOwner();
      this.route = { creation: observeRoute(edgeId, options, this.map), updates: [], detachCount: 0, select: () => this.emit("click") };
      this.map.bridge.routePlacements.push(this.route);
    }
    addListener(name: string, callback: () => void): Listener {
      const bucket = this.listeners.get(name) ?? new Set();
      bucket.add(callback);
      this.listeners.set(name, bucket);
      return { remove: () => bucket.delete(callback) };
    }
    emit(name: string): void { for (const callback of [...(this.listeners.get(name) ?? [])]) callback(); }
    setMap(value: unknown): void { if (value === null) this.route.detachCount += 1; }
    setOptions(options: Record<string, unknown>): void {
      const edgeId = this.map.bridge.takeRouteOwner();
      this.route.updates.push(observeRoute(edgeId, options, this.map));
      this.map.bridge.sequence.push("provider-route-update");
      this.options = { ...this.options, ...options };
    }
  }

  return {
    Point: class { constructor(public x: number, public y: number) {} },
    subscribeFailures(listener) {
      const callback = () => listener({ status: "unavailable", reason: "request-denied", retryable: false, diagnostic: "Google Maps authentication failed" });
      subscribers.add(callback);
      return () => { subscribers.delete(callback); for (const map of maps) map.listeners.get("auth-failure")?.delete(callback); };
    },
    Map: MapInstance,
    AdvancedMarkerElement: AdvancedMarker,
    OverlayView: Overlay,
    Polyline,
    SymbolPath: { CIRCLE: "synthetic-circle" },
    CollisionBehavior: { REQUIRED: "REQUIRED", REQUIRED_AND_HIDES_OPTIONAL: "REQUIRED_AND_HIDES_OPTIONAL", OPTIONAL_AND_HIDES_LOWER_PRIORITY: "OPTIONAL_AND_HIDES_LOWER_PRIORITY" },
  };
}

export function createContractHost(): HTMLElement {
  const element = document.createElement("div");
  const bridge: RuntimeBridge = {
    sequence: [], mapConstructions: 0, markerPlacements: [], routePlacements: [], fitCalls: [],
    immediateCameraCalls: [], animatedCameraCalls: [], panByCalls: [], zoomWrites: [], zoom: 9,
    expectedUnavailable: { status: "unavailable", reason: "request-denied", retryable: false, diagnostic: "Google Maps authentication failed" },
    currentMap: null, pendingRouteOwners: [],
    routeOwner(edgeId) {
      this.pendingRouteOwners.push(edgeId);
      this.sequence.push("route-input");
    },
    takeRouteOwner() {
      const edgeId = this.pendingRouteOwners.shift();
      if (edgeId === undefined) throw new Error("Provider route mutation was not preceded by a semantic route owner");
      return edgeId;
    },
    idle() { this.currentMap?.emit("idle"); },
    unavailable() { this.currentMap?.emit("auth-failure"); },
  };
  Object.defineProperty(bridge, "zoom", {
    get: () => (bridge.currentMap as { zoom?: number } | null)?.zoom ?? 9,
    set: (value: number) => { if (bridge.currentMap && "zoom" in bridge.currentMap) (bridge.currentMap as { zoom: number }).zoom = value; },
    enumerable: true,
    configurable: false,
  });
  Object.defineProperty(element, MAP_ADAPTER_V2_CONTRACT_BRIDGE, { value: bridge });
  return element;
}
