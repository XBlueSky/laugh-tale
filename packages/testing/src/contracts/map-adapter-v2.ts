import type { Coordinates, ProviderUnavailableResult } from "@laugh-tale-island/core";
import type {
  MapAdapterV2, MapMountConfig, MapPresentationV2, MapVisualProfile,
  MapRoutePresentationV2, MarkerContentFactory, MarkerContentHandle, MarkerDescriptor,
  UserLocationContentFactory, UserLocationContentHandle, UserLocationDescriptor,
} from "@laugh-tale-island/core/browser";
import { describe, expect, it, vi } from "vitest";

export const MAP_ADAPTER_V2_CONTRACT_BRIDGE = Symbol.for("@laugh-tale-island/testing/map-adapter-v2-contract-bridge");

export interface MapContractPlacement {
  readonly element: HTMLElement;
  readonly initialPosition: Coordinates;
  readonly positionUpdates: readonly Coordinates[];
  readonly detachCount: number;
  select(): void;
}

export interface MapContractRoute {
  readonly creation: MapContractRouteMutation;
  readonly updates: readonly MapContractRouteMutation[];
  readonly detachCount: number;
  select(): void;
}

export interface MapContractRouteMutation {
  readonly edgeId: string;
  readonly geometry: readonly Coordinates[];
  readonly paint: {
    readonly color: string;
    readonly opacity: number;
    readonly width: number;
  };
  readonly clickable: boolean;
  readonly mapAssociated: boolean;
}

export interface MapAdapterV2ContractBridge {
  readonly sequence: string[];
  readonly mapConstructions: number;
  readonly markerPlacements: readonly MapContractPlacement[];
  readonly routePlacements: readonly MapContractRoute[];
  readonly fitCalls: readonly (readonly unknown[])[];
  readonly immediateCameraCalls: readonly unknown[];
  readonly animatedCameraCalls: readonly unknown[];
  readonly panByCalls: readonly unknown[];
  readonly zoomWrites: readonly number[];
  readonly expectedUnavailable: ProviderUnavailableResult;
  zoom: number;
  routeOwner(edgeId: string): void;
  idle(): void;
  unavailable(): void;
}

type ContractHost = HTMLElement & { [MAP_ADAPTER_V2_CONTRACT_BRIDGE]: MapAdapterV2ContractBridge };

const profile: MapVisualProfile = {
  id: "contract-profile",
  basemap: { mode: "neutral", density: "low", contrast: "standard", poi: "minimal", stationLabels: "legible", palette: { geometry: "#111111", label: "#222222", labelStroke: "#ffffff", water: "#334455", park: "#445533", road: "#777777" } },
  routeStyle: () => ({ kind: "solid", stroke: { color: "#123456", opacity: 1, width: 3 } }),
};

function expectedRouteMutation(edgeId: string, geometry: readonly Coordinates[]): MapContractRouteMutation {
  return {
    edgeId,
    geometry,
    paint: { color: "#123456", opacity: 1, width: 3 },
    clickable: true,
    mapAssociated: true,
  };
}

function marker(ownerId = "contract-marker", coordinates = { lat: 10, lng: 20 }): MarkerDescriptor {
  return { ownerId, label: "Contract marker", coordinates, markerMode: "numbered", displayIndex: 1, ordinal: "1st", sourceKind: "sightseeing", timing: "suggested", states: ["selected"] };
}

function route(edgeId = "contract-route", geometry: readonly Coordinates[] = [{ lat: 10, lng: 20 }, { lat: 10.01, lng: 20.01 }], selected = false): MapRoutePresentationV2 {
  return { edgeId, mode: "walking", source: "provider", certainty: "suggested", geometry, selected };
}

function presentation(descriptor = marker(), routeDescriptor = route()): MapPresentationV2 {
  return { markers: [descriptor], routes: [routeDescriptor] };
}

interface ContentLedger<TDescriptor, THandle> {
  descriptors: TDescriptor[];
  handles: THandle[];
  elements: HTMLElement[];
  updates: TDescriptor[];
  disposals: number;
}

function bridge(host: HTMLElement): MapAdapterV2ContractBridge {
  const value = (host as Partial<ContractHost>)[MAP_ADAPTER_V2_CONTRACT_BRIDGE];
  if (value === undefined) throw new Error("createHost must install the documented map contract bridge");
  return value;
}

function markerLedger(factory: MarkerContentFactory, hostBridge: MapAdapterV2ContractBridge): { ledger: ContentLedger<MarkerDescriptor, MarkerContentHandle>; factory: MarkerContentFactory } {
  const ledger: ContentLedger<MarkerDescriptor, MarkerContentHandle> = { descriptors: [], handles: [], elements: [], updates: [], disposals: 0 };
  return { ledger, factory(descriptor) {
    const snapshot = structuredClone(descriptor);
    ledger.descriptors.push(snapshot);
    const original = factory(structuredClone(snapshot));
    ledger.handles.push(original);
    ledger.elements.push(original.element);
    return { element: original.element, update(next) { hostBridge.sequence.push("content-update"); ledger.updates.push(structuredClone(next)); original.update(structuredClone(next)); }, dispose() { ledger.disposals += 1; original.dispose(); } };
  } };
}

function userLedger(factory: UserLocationContentFactory, hostBridge: MapAdapterV2ContractBridge): { ledger: ContentLedger<UserLocationDescriptor, UserLocationContentHandle>; factory: UserLocationContentFactory } {
  const ledger: ContentLedger<UserLocationDescriptor, UserLocationContentHandle> = { descriptors: [], handles: [], elements: [], updates: [], disposals: 0 };
  return { ledger, factory(descriptor) {
    const snapshot = structuredClone(descriptor);
    ledger.descriptors.push(snapshot);
    const original = factory(structuredClone(snapshot));
    ledger.handles.push(original);
    ledger.elements.push(original.element);
    return { element: original.element, update(next) { hostBridge.sequence.push("content-update"); ledger.updates.push(structuredClone(next)); original.update(structuredClone(next)); }, dispose() { ledger.disposals += 1; original.dispose(); } };
  } };
}

function config(hostBridge: MapAdapterV2ContractBridge, markerFactory: MarkerContentFactory, userFactory: UserLocationContentFactory, events: MapMountConfig["events"] = { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable: vi.fn() }): MapMountConfig {
  return {
    events,
    visualProfile: {
      ...profile,
      routeStyle(routeDescriptor) {
        const style = profile.routeStyle(routeDescriptor);
        if (style !== null) hostBridge.routeOwner(routeDescriptor.edgeId);
        return style;
      },
    },
    createMarkerContent: markerFactory,
    createUserLocationContent: userFactory,
  };
}

export function defineMapAdapterV2Contract(
  label: string,
  createAdapter: () => MapAdapterV2,
  createHost: () => HTMLElement,
  createMarkerContent: MarkerContentFactory,
  createUserLocationContent: UserLocationContentFactory,
): void {
  describe(`${label} map adapter v2 contract`, () => {
    it("invalidates mount before provider construction", async () => {
      const host = createHost();
      const hostBridge = bridge(host);
      const markers = markerLedger(createMarkerContent, hostBridge);
      const users = userLedger(createUserLocationContent, hostBridge);
      const adapter = createAdapter();
      const pending = adapter.mount(host, config(hostBridge, markers.factory, users.factory));
      adapter.destroy();
      await pending;
      expect(hostBridge.mapConstructions).toBe(0);
      adapter.render(presentation());
      adapter.setUserLocation({ lat: 5, lng: 6 });
      expect(markers.ledger.descriptors).toEqual([]);
      expect(users.ledger.descriptors).toEqual([]);
    });

    it("snapshots pending render and mounts the exact factory-owned element", async () => {
      const host = createHost();
      const hostBridge = bridge(host);
      const markers = markerLedger(createMarkerContent, hostBridge);
      const users = userLedger(createUserLocationContent, hostBridge);
      const adapter = createAdapter();
      const source = presentation();
      adapter.render(source);
      source.markers[0].coordinates.lat = 99;
      await adapter.mount(host, config(hostBridge, markers.factory, users.factory));
      expect(hostBridge.mapConstructions).toBe(1);
      expect(markers.ledger.descriptors[0]?.coordinates).toEqual({ lat: 10, lng: 20 });
      expect(hostBridge.markerPlacements[0]?.element).toBe(markers.ledger.elements[0]);
      expect(host.contains(markers.ledger.elements[0])).toBe(true);
      adapter.destroy();
    });

    it("keeps stable marker ownership, orders updates before provider movement, and invalidates callbacks", async () => {
      const host = createHost();
      const hostBridge = bridge(host);
      const markers = markerLedger(createMarkerContent, hostBridge);
      const users = userLedger(createUserLocationContent, hostBridge);
      const firstSelect = vi.fn();
      const adapter = createAdapter();
      await adapter.mount(host, config(hostBridge, markers.factory, users.factory, { onMarkerSelect: firstSelect, onRouteSelect: vi.fn(), onUnavailable: vi.fn() }));
      adapter.render({ markers: [marker()], routes: [] });
      const placement = hostBridge.markerPlacements[0];
      hostBridge.sequence.length = 0;
      const updated = {
        ...marker("contract-marker", { lat: 10.02, lng: 20.02 }),
        label: "Updated contract marker",
        displayIndex: 2,
        ordinal: "2nd",
        states: ["completed"] as const,
      };
      adapter.render({ markers: [updated], routes: [] });
      expect(markers.ledger.descriptors).toHaveLength(1);
      expect(hostBridge.markerPlacements).toHaveLength(1);
      expect(markers.ledger.updates).toEqual([updated]);
      expect(placement.initialPosition).toEqual({ lat: 10, lng: 20 });
      expect(placement.positionUpdates).toEqual([{ lat: 10.02, lng: 20.02 }]);
      expect(hostBridge.sequence).toEqual(["content-update", "provider-position"]);
      placement.select();
      expect(firstSelect).toHaveBeenCalledWith("contract-marker");
      adapter.render({ markers: [], routes: [] });
      expect(placement.detachCount).toBe(1);
      expect(markers.ledger.disposals).toBe(1);
      placement.select();
      expect(firstSelect).toHaveBeenCalledTimes(1);
      adapter.destroy();
    });

    it("creates, updates, removes, remounts, and destroys stable routes exactly once", async () => {
      const firstHost = createHost();
      const firstBridge = bridge(firstHost);
      const markers = markerLedger(createMarkerContent, firstBridge);
      const users = userLedger(createUserLocationContent, firstBridge);
      const firstSelect = vi.fn();
      const adapter = createAdapter();
      await adapter.mount(firstHost, config(firstBridge, markers.factory, users.factory, { onMarkerSelect: vi.fn(), onRouteSelect: firstSelect, onUnavailable: vi.fn() }));
      const initialRoute = route();
      adapter.render({ markers: [], routes: [initialRoute] });
      const firstRoute = firstBridge.routePlacements[0];
      expect(firstRoute.creation).toEqual(expectedRouteMutation(initialRoute.edgeId, initialRoute.geometry));
      const updatedRoute = route("contract-route", [{ lat: 10.2, lng: 20.2 }, { lat: 10.3, lng: 20.3 }], true);
      firstBridge.sequence.length = 0;
      adapter.render({ markers: [], routes: [updatedRoute] });
      expect(firstBridge.routePlacements).toHaveLength(1);
      expect(firstRoute.updates).toEqual([expectedRouteMutation(updatedRoute.edgeId, updatedRoute.geometry)]);
      expect(firstBridge.sequence).toEqual(["route-input", "provider-route-update"]);
      firstRoute.select();
      expect(firstSelect).toHaveBeenCalledWith("contract-route");
      adapter.render({ markers: [], routes: [] });
      expect(firstRoute.detachCount).toBe(1);
      firstRoute.select();
      expect(firstSelect).toHaveBeenCalledTimes(1);
      adapter.render({ markers: [], routes: [updatedRoute] });
      expect(firstBridge.routePlacements).toHaveLength(2);
      expect(firstBridge.routePlacements[1].creation).toEqual(expectedRouteMutation(updatedRoute.edgeId, updatedRoute.geometry));
      const secondHost = createHost();
      const secondBridge = bridge(secondHost);
      const secondMarkers = markerLedger(createMarkerContent, secondBridge);
      const secondUsers = userLedger(createUserLocationContent, secondBridge);
      await adapter.mount(secondHost, config(secondBridge, secondMarkers.factory, secondUsers.factory));
      expect(firstBridge.routePlacements[1].detachCount).toBe(1);
      expect(secondBridge.routePlacements).toHaveLength(1);
      expect(secondBridge.routePlacements[0].creation).toEqual(expectedRouteMutation(updatedRoute.edgeId, updatedRoute.geometry));
      adapter.destroy();
      adapter.destroy();
      expect(secondBridge.routePlacements[0].detachCount).toBe(1);
    });

    it("runs an independent user-location create/update/clear/remount/destroy lifecycle", async () => {
      const firstHost = createHost();
      const firstBridge = bridge(firstHost);
      const markers = markerLedger(createMarkerContent, firstBridge);
      const users = userLedger(createUserLocationContent, firstBridge);
      const adapter = createAdapter();
      await adapter.mount(firstHost, config(firstBridge, markers.factory, users.factory));
      adapter.setUserLocation({ lat: 5, lng: 6 });
      const first = firstBridge.markerPlacements[0];
      expect(first.element).toBe(users.ledger.elements[0]);
      expect(first.initialPosition).toEqual({ lat: 5, lng: 6 });
      firstBridge.sequence.length = 0;
      adapter.setUserLocation({ lat: 7, lng: 8 });
      expect(users.ledger.updates).toEqual([{ coordinates: { lat: 7, lng: 8 } }]);
      expect(first.positionUpdates).toEqual([{ lat: 7, lng: 8 }]);
      expect(firstBridge.sequence).toEqual(["content-update", "provider-position"]);
      adapter.setUserLocation(null);
      adapter.setUserLocation(null);
      expect(first.detachCount).toBe(1);
      expect(users.ledger.disposals).toBe(1);
      adapter.setUserLocation({ lat: 9, lng: 10 });
      const secondHost = createHost();
      const secondBridge = bridge(secondHost);
      const secondMarkers = markerLedger(createMarkerContent, secondBridge);
      const secondUsers = userLedger(createUserLocationContent, secondBridge);
      await adapter.mount(secondHost, config(secondBridge, secondMarkers.factory, secondUsers.factory));
      expect(users.ledger.disposals).toBe(2);
      expect(secondUsers.ledger.descriptors).toEqual([{ coordinates: { lat: 9, lng: 10 } }]);
      adapter.destroy();
      adapter.destroy();
      expect(secondUsers.ledger.disposals).toBe(1);
      expect(secondBridge.markerPlacements[0].detachCount).toBe(1);
    });

    it("delivers typed unavailable only from the current generation", async () => {
      const firstHost = createHost();
      const firstBridge = bridge(firstHost);
      const markers = markerLedger(createMarkerContent, firstBridge);
      const users = userLedger(createUserLocationContent, firstBridge);
      const firstUnavailable = vi.fn();
      const secondUnavailable = vi.fn();
      const adapter = createAdapter();
      await adapter.mount(firstHost, config(firstBridge, markers.factory, users.factory, { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable: firstUnavailable }));
      const secondHost = createHost();
      const secondBridge = bridge(secondHost);
      const secondMarkers = markerLedger(createMarkerContent, secondBridge);
      const secondUsers = userLedger(createUserLocationContent, secondBridge);
      await adapter.mount(secondHost, config(secondBridge, secondMarkers.factory, secondUsers.factory, { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable: secondUnavailable }));
      firstBridge.unavailable();
      secondBridge.unavailable();
      secondBridge.unavailable();
      expect(firstUnavailable).not.toHaveBeenCalled();
      expect(secondUnavailable).toHaveBeenCalledTimes(1);
      expect(secondUnavailable).toHaveBeenCalledWith(secondBridge.expectedUnavailable);
      expect(secondUnavailable.mock.calls[0][0]).toEqual(secondBridge.expectedUnavailable);
      adapter.destroy();
    });

    it("animates fit with exact flattened bounds and insets, then clamps owned idle zoom", async () => {
      const host = createHost();
      const hostBridge = bridge(host);
      const markers = markerLedger(createMarkerContent, hostBridge);
      const users = userLedger(createUserLocationContent, hostBridge);
      const adapter = createAdapter();
      await adapter.mount(host, config(hostBridge, markers.factory, users.factory));
      const common = { viewport: { width: 800, height: 600 }, usableRegion: { x: 0, y: 0, width: 800, height: 600 }, edgeInsets: { top: 1, right: 2, bottom: 3, left: 4 } };
      adapter.applyCameraIntent({ ...common, kind: "fit", intentId: "fit", transition: "animate", points: [{ lat: 10, lng: 20 }, { lat: 11, lng: 21 }], paths: [[{ lat: 9, lng: 19 }, { lat: 12, lng: 22 }]], maximumZoom: 12 });
      expect(hostBridge.fitCalls).toEqual([[{ north: 12, south: 9, east: 22, west: 19 }, { top: 1, right: 2, bottom: 3, left: 4 }]]);
      expect(hostBridge.fitCalls[0]).toHaveLength(2);
      hostBridge.zoom = 15;
      hostBridge.idle();
      expect(hostBridge.zoomWrites).toEqual([12]);
      expect(adapter.getCameraSnapshot()).toEqual({ zoom: 12 });
      adapter.destroy();
    });

    it.each(["fit", "focus", "recenter-user"] as const)("applies immediate %s to the independently derived usable-center target without animation-capable operations", async (kind) => {
      const host = createHost();
      const hostBridge = bridge(host);
      const markers = markerLedger(createMarkerContent, hostBridge);
      const users = userLedger(createUserLocationContent, hostBridge);
      const adapter = createAdapter();
      await adapter.mount(host, config(hostBridge, markers.factory, users.factory));
      const common = { intentId: "same", transition: "immediate" as const, viewport: { width: 512, height: 512 }, usableRegion: { x: 64, y: 0, width: 448, height: 384 }, edgeInsets: { top: 0, right: 0, bottom: 128, left: 64 } };
      const intent = kind === "fit" ? { ...common, kind, points: [{ lat: 0, lng: -45 }], paths: [[{ lat: 0, lng: 45 }]], maximumZoom: 5 } : { ...common, kind, coordinate: { lat: 0, lng: 0 }, targetZoom: 2 };
      adapter.applyCameraIntent(intent);
      expect(hostBridge.immediateCameraCalls).toEqual([{ center: { lat: (expect.closeTo(-21.9430455334, 9) as unknown), lng: -11.25 }, zoom: 2, heading: 0, tilt: 0 }]);
      expect(hostBridge.animatedCameraCalls).toEqual([]);
      expect(hostBridge.fitCalls).toEqual([]);
      expect(hostBridge.panByCalls).toEqual([]);
      expect(hostBridge.zoomWrites).toEqual([]);
      adapter.applyCameraIntent({ ...intent, edgeInsets: { top: 0, right: 0, bottom: 0, left: 0 } });
      expect(hostBridge.immediateCameraCalls).toHaveLength(2);
      expect(hostBridge.immediateCameraCalls[1]).toMatchObject({ center: { lat: (expect.closeTo(0, 9) as unknown), lng: 0 } });
      expect(hostBridge.animatedCameraCalls).toEqual([]);
      adapter.destroy();
    });

    it("recenters with animated pan, exact zoom, insets, and derived pan delta", async () => {
      const host = createHost();
      const hostBridge = bridge(host);
      const markers = markerLedger(createMarkerContent, hostBridge);
      const users = userLedger(createUserLocationContent, hostBridge);
      const adapter = createAdapter();
      await adapter.mount(host, config(hostBridge, markers.factory, users.factory));
      const edgeInsets = { top: 8, right: 12, bottom: 20, left: 4 };
      adapter.applyCameraIntent({ kind: "recenter-user", intentId: "recenter", transition: "animate", viewport: { width: 800, height: 600 }, usableRegion: { x: 0, y: 0, width: 760, height: 560 }, edgeInsets, coordinate: { lat: 13, lng: 23 }, targetZoom: 10 });
      expect(hostBridge.immediateCameraCalls).toEqual([]);
      expect(hostBridge.animatedCameraCalls).toEqual([{ method: "panTo", coordinate: { lat: 13, lng: 23 } }, { method: "setZoom", zoom: 10 }, { method: "panBy", x: 4, y: 6 }]);
      expect(hostBridge.zoomWrites).toEqual([10]);
      expect(hostBridge.panByCalls).toEqual([[4, 6]]);
      adapter.destroy();
    });

    it("returns exact finite snapshots and rejects non-finite provider zoom", async () => {
      const host = createHost();
      const hostBridge = bridge(host);
      const markers = markerLedger(createMarkerContent, hostBridge);
      const users = userLedger(createUserLocationContent, hostBridge);
      const adapter = createAdapter();
      await adapter.mount(host, config(hostBridge, markers.factory, users.factory));
      hostBridge.zoom = 7;
      expect(adapter.getCameraSnapshot()).toEqual({ zoom: 7 });
      hostBridge.zoom = Number.NaN;
      expect(adapter.getCameraSnapshot()).toBeNull();
      adapter.destroy();
      expect(adapter.getCameraSnapshot()).toBeNull();
    });
  });
}
