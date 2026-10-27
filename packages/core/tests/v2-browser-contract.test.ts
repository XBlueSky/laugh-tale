import { describe, expect, it } from "vitest";

import "../src/browser/v2-adapters.js";
import "../src/browser/v2-map.js";
import type {
  CameraIntent,
  CameraSnapshot,
  Coordinates,
  NavigationTargetV2,
  PlaceRequestV2,
  ProviderUnavailableResult,
  RouteEdge,
  RouteProviderResult,
  RouteRequestV2,
} from "@laugh-tale-island/core";
import type {
  MapAdapterV2,
  MapMountConfig,
  MapPresentationV2,
  MapRouteStyle,
  MapVisualProfile,
  MarkerContentFactory,
  MarkerDescriptor,
  NavigationAdapterV2,
  NavigationRequestV2,
  PlaceAdapterV2,
  RouteAdapterV2,
  UserLocationContentFactory,
} from "@laugh-tale-island/core/browser";

const coordinate: Coordinates = { lat: 35.6762, lng: 139.6503 };

const unavailable: ProviderUnavailableResult = {
  status: "unavailable",
  reason: "unsupported",
  retryable: false,
};

const markerFactory: MarkerContentFactory = (descriptor) => ({
  element: {} as HTMLElement,
  update(next) {
    expect(next.ownerId).toBe(descriptor.ownerId);
  },
  dispose() {},
});

const userLocationFactory: UserLocationContentFactory = () => ({
  element: {} as HTMLElement,
  update(next) {
    expect(next.coordinates).toEqual(coordinate);
  },
  dispose() {},
});

const visualProfile: MapVisualProfile = {
  id: "neutral",
  basemap: {
    mode: "neutral",
    density: "medium",
    contrast: "standard",
    poi: "minimal",
    stationLabels: "legible",
    palette: {
      geometry: "#f7f4ee",
      label: "#312f2c",
      labelStroke: "#f7f4ee",
      water: "#bad7e6",
      park: "#d8e8cc",
      road: "#ffffff",
    },
  },
  routeStyle(route) {
    if (route.mode === "walking") {
      return null;
    }
    if (route.mode === "transit") {
      return {
        kind: "solid",
        stroke: { color: "#283593", opacity: 1, width: 4 },
        casing: { color: "#ffffff", opacity: 0.8, width: 6 },
      };
    }
    return {
      kind: "symbol",
      symbol: {
        shape: "circle",
        repeatPx: 12,
        scale: 1,
        fill: { color: "#78909c", opacity: 0.9 },
        stroke: { color: "#ffffff", opacity: 1, width: 1 },
      },
    };
  },
};

const mountConfig: MapMountConfig = {
  events: {
    onMarkerSelect() {},
    onRouteSelect() {},
    onUnavailable(result) {
      expect(result).toEqual(unavailable);
    },
  },
  visualProfile,
  createMarkerContent: markerFactory,
  createUserLocationContent: userLocationFactory,
};

// @ts-expect-error Map mounts require event callbacks.
const mountWithoutEvents: MapMountConfig = {
  visualProfile,
  createMarkerContent: markerFactory,
  createUserLocationContent: userLocationFactory,
};

// @ts-expect-error Map mounts require a visual profile.
const mountWithoutProfile: MapMountConfig = {
  events: mountConfig.events,
  createMarkerContent: markerFactory,
  createUserLocationContent: userLocationFactory,
};

// @ts-expect-error Map mounts require the itinerary marker factory.
const mountWithoutMarkerFactory: MapMountConfig = {
  events: mountConfig.events,
  visualProfile,
  createUserLocationContent: userLocationFactory,
};

// @ts-expect-error Map mounts require the user-location factory.
const mountWithoutUserLocationFactory: MapMountConfig = {
  events: mountConfig.events,
  visualProfile,
  createMarkerContent: markerFactory,
};

const profileWithoutStationLabels: MapVisualProfile = {
  id: "incomplete-stations",
  // @ts-expect-error Basemaps require explicit station-label guidance.
  basemap: {
    mode: "neutral",
    density: "low",
    contrast: "soft",
    poi: "minimal",
    palette: visualProfile.basemap.palette,
  },
  routeStyle() {
    return null;
  },
};

const profileWithoutRoadPaint: MapVisualProfile = {
  id: "incomplete-palette",
  basemap: {
    mode: "neutral",
    density: "low",
    contrast: "soft",
    poi: "minimal",
    stationLabels: "hidden",
    // @ts-expect-error Basemap palettes require a road paint.
    palette: {
      geometry: "#f7f4ee",
      label: "#312f2c",
      labelStroke: "#f7f4ee",
      water: "#bad7e6",
      park: "#d8e8cc",
    },
  },
  routeStyle() {
    return null;
  },
};

const dashRouteStyle: MapRouteStyle = {
  kind: "symbol",
  symbol: {
    shape: "dash",
    repeatPx: 16,
    scale: 1,
    stroke: { color: "#607d8b", opacity: 0.8, width: 2 },
  },
};

const symbolStyleWithUnderlyingLine: MapRouteStyle = {
  kind: "symbol",
  symbol: {
    shape: "circle",
    repeatPx: 12,
    scale: 1,
    fill: { color: "#78909c", opacity: 0.9 },
  },
  // @ts-expect-error Symbol styles cannot carry an underlying line stroke.
  stroke: { color: "#ffffff", opacity: 1, width: 1 },
};

const mapAdapter: MapAdapterV2 = {
  mount(element, config) {
    expect(element).toBeDefined();
    expect(config).toBe(mountConfig);
    return Promise.resolve();
  },
  render(presentation) {
    expect(presentation).toBeDefined();
  },
  applyCameraIntent(intent) {
    expect(intent.intentId).toBeTruthy();
  },
  getCameraSnapshot() {
    return { zoom: 12 };
  },
  setUserLocation(location) {
    expect(location).toBeNull();
  },
  destroy() {},
};

const routeAdapter: RouteAdapterV2 = {
  load(request, signal) {
    expect(request).toBe(routeRequest);
    expect(signal.aborted).toBe(false);
    return Promise.resolve({
      status: "ready",
      durationMinutes: 15,
      steps: ["Walk to the station"],
      geometry: [coordinate],
      transit: { lines: [{ name: "Blue", shortName: "B" }] },
    });
  },
};

const placeAdapter: PlaceAdapterV2 = {
  load(request, signal) {
    expect(request).toBe(placeRequest);
    expect(signal.aborted).toBe(false);
    return Promise.resolve({ status: "ready" as const, facts: { formattedAddress: "1 Harbor Road" } });
  },
};

const navigationAdapter: NavigationAdapterV2 = {
  supportedPlaceProviders: ["example"],
  open(request) {
    return request.kind === "place" || request.kind === "route" || request.kind === "authored-external";
  },
};

const destination: NavigationTargetV2 = {
  kind: "coordinates",
  label: "Harbor",
  coordinates: coordinate,
};

const routeEdge: RouteEdge = {
  id: "route-a-b",
  dayId: "day-one",
  fromNodeId: "a",
  toNodeId: "b",
  mode: "transit",
  source: "provider",
  certainty: "confirmed",
};

const routeRequest: RouteRequestV2 = {
  edge: routeEdge,
  origin: {
    ownerId: "a",
    label: "Origin",
    identity: { status: "resolved", coordinates: coordinate },
  },
  destination: {
    ownerId: "b",
    label: "Destination",
    identity: { status: "resolved", coordinates: coordinate },
  },
  transitPreferences: { allowedModes: ["subway", "rail", "bus"] },
};

const placeRequest: PlaceRequestV2 = {
  ownerId: "destination",
  providerReference: { provider: "example", id: "harbor" },
  locale: "en-US",
  timeZone: "Asia/Tokyo",
};

const navigationRequests: readonly NavigationRequestV2[] = [
  { kind: "place", destination },
  { kind: "route", origin: destination, destination, travelMode: "transit" },
  {
    kind: "authored-external",
    origin: "Origin",
    destination: "Destination",
    travelMode: "walking",
  },
];

const flightNavigation: NavigationRequestV2 = {
  kind: "route",
  origin: destination,
  destination,
  // @ts-expect-error Navigation requests cannot route flights.
  travelMode: "flight",
};

const unknownNavigation: NavigationRequestV2 = {
  kind: "route",
  origin: destination,
  destination,
  // @ts-expect-error Navigation requests cannot use an unknown travel mode.
  travelMode: "unknown",
};

const marker: MarkerDescriptor = {
  ownerId: "destination",
  label: "Harbor",
  coordinates: coordinate,
  markerMode: "numbered",
  displayIndex: 2,
  ordinal: "2nd",
  sourceKind: "sightseeing",
  timing: "suggested",
  states: ["current", "selected"],
};

const baseMarker: MarkerDescriptor = {
  ...marker,
  markerMode: "base",
};

const hiddenMarker: MarkerDescriptor = {
  ...marker,
  // @ts-expect-error Markers filtered by projection cannot reach a content factory.
  markerMode: "none",
};

const cameraIntents: readonly CameraIntent[] = [
  {
    kind: "fit",
    intentId: "fit-day",
    transition: "animate",
    viewport: { width: 320, height: 640 },
    usableRegion: { x: 0, y: 0, width: 320, height: 560 },
    edgeInsets: { top: 16, right: 16, bottom: 80, left: 16 },
    points: [coordinate],
    paths: [[coordinate]],
    maximumZoom: 15,
  },
  {
    kind: "focus",
    intentId: "focus-marker",
    transition: "immediate",
    viewport: { width: 320, height: 640 },
    usableRegion: { x: 0, y: 0, width: 320, height: 560 },
    edgeInsets: { top: 16, right: 16, bottom: 80, left: 16 },
    coordinate,
    targetZoom: 16,
  },
  {
    kind: "recenter-user",
    intentId: "recenter-user",
    transition: "animate",
    viewport: { width: 320, height: 640 },
    usableRegion: { x: 0, y: 0, width: 320, height: 560 },
    edgeInsets: { top: 16, right: 16, bottom: 80, left: 16 },
    coordinate,
    targetZoom: 14,
  },
];

// @ts-expect-error Every camera intent requires an intent ID.
const cameraWithoutIntentId: CameraIntent = {
  kind: "focus",
  transition: "animate",
  viewport: { width: 320, height: 640 },
  usableRegion: { x: 0, y: 0, width: 320, height: 560 },
  edgeInsets: { top: 16, right: 16, bottom: 80, left: 16 },
  coordinate,
  targetZoom: 16,
};

// @ts-expect-error Every camera intent requires edge insets.
const cameraWithoutEdgeInsets: CameraIntent = {
  kind: "focus",
  intentId: "missing-insets",
  transition: "animate",
  viewport: { width: 320, height: 640 },
  usableRegion: { x: 0, y: 0, width: 320, height: 560 },
  coordinate,
  targetZoom: 16,
};

// @ts-expect-error Fit intents require a maximum zoom.
const fitWithoutMaximumZoom: CameraIntent = {
  kind: "fit",
  intentId: "missing-maximum-zoom",
  transition: "animate",
  viewport: { width: 320, height: 640 },
  usableRegion: { x: 0, y: 0, width: 320, height: 560 },
  edgeInsets: { top: 16, right: 16, bottom: 80, left: 16 },
  points: [coordinate],
  paths: [[coordinate]],
};

// @ts-expect-error Focus intents require a numeric target zoom.
const focusWithoutTargetZoom: CameraIntent = {
  kind: "focus",
  intentId: "missing-target-zoom",
  transition: "animate",
  viewport: { width: 320, height: 640 },
  usableRegion: { x: 0, y: 0, width: 320, height: 560 },
  edgeInsets: { top: 16, right: 16, bottom: 80, left: 16 },
  coordinate,
};

// @ts-expect-error Camera snapshots require a numeric zoom.
const snapshotWithoutZoom: CameraSnapshot = {};

// @ts-expect-error Camera snapshots reject nonnumeric zoom values.
const snapshotWithTextZoom: CameraSnapshot = { zoom: "12" };

describe("v2 browser adapter contracts", () => {
  it("keeps marker and user-location factories responsible for their own content", () => {
    const markerHandle = markerFactory(marker);
    const userLocationHandle = userLocationFactory({ coordinates: coordinate });

    expect(markerHandle.element).toBeDefined();
    expect(userLocationHandle.element).toBeDefined();
    expect(baseMarker.markerMode).toBe("base");
    expect(marker.displayIndex).toBe(2);
    expect(marker.ordinal).toBe("2nd");
    expect(hiddenMarker.markerMode).toBe("none");
    expect(flightNavigation).toMatchObject({ kind: "route" });
    expect(unknownNavigation).toMatchObject({ kind: "route" });
    expect(mountWithoutEvents.visualProfile).toBe(visualProfile);
    expect(mountWithoutProfile.events).toBe(mountConfig.events);
    expect(mountWithoutMarkerFactory.visualProfile).toBe(visualProfile);
    expect(mountWithoutUserLocationFactory.visualProfile).toBe(visualProfile);
    expect(profileWithoutStationLabels.id).toBe("incomplete-stations");
    expect(profileWithoutRoadPaint.id).toBe("incomplete-palette");
    expect(dashRouteStyle.symbol.shape).toBe("dash");
    expect(symbolStyleWithUnderlyingLine.kind).toBe("symbol");
    expect(cameraWithoutIntentId.kind).toBe("focus");
    expect(cameraWithoutEdgeInsets.kind).toBe("focus");
    expect(fitWithoutMaximumZoom.kind).toBe("fit");
    expect(focusWithoutTargetZoom.kind).toBe("focus");
    expect(snapshotWithoutZoom).toEqual({});
    expect(snapshotWithTextZoom.zoom).toBe("12");
  });

  it("models only settled provider results and provider-neutral place requests", async () => {
    const routeResult: RouteProviderResult = await routeAdapter.load(
      routeRequest,
      new AbortController().signal,
    );
    const placeResult = await placeAdapter.load(placeRequest, new AbortController().signal);

    expect(routeResult.status).toBe("ready");
    expect(placeResult.status).toBe("ready");
    expect(placeRequest).toMatchObject({
      providerReference: { provider: "example", id: "harbor" },
      locale: "en-US",
      timeZone: "Asia/Tokyo",
    });
  });

  it("keeps map mounting, navigation, and camera requests structural", async () => {
    const presentation: MapPresentationV2 = { markers: [marker], routes: [] };
    const snapshot: CameraSnapshot | null = mapAdapter.getCameraSnapshot();

    await mapAdapter.mount({} as HTMLElement, mountConfig);
    mapAdapter.render(presentation);
    for (const intent of cameraIntents) mapAdapter.applyCameraIntent(intent);
    mountConfig.events.onUnavailable(unavailable);

    expect(navigationAdapter.supportedPlaceProviders).toEqual(["example"]);
    expect(navigationRequests.every((request) => navigationAdapter.open(request))).toBe(true);
    expect(snapshot).toEqual({ zoom: 12 });
    expect(Number.isFinite(snapshot?.zoom)).toBe(true);
  });
});
