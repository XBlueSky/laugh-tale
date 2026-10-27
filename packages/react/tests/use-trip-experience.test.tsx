import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  createMemoryTripNavigationStore,
  type Trip,
  type RouteProviderResult,
} from "@laugh-tale-island/core";
import {
  useTripExperience,
  type UseTripExperienceInput,
} from "../src/use-trip-experience.js";
import type {
  MapAdapterV2,
  ProgressStore,
} from "@laugh-tale-island/core/browser";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("keeps itinerary actions usable without a map and rejects foreign owners", async () => {
  const trip: Trip = {
    id: "trip",
    title: "Trip",
    locale: "en",
    timezone: "Etc/UTC",
    startDate: "2040-06-12",
    endDate: "2040-06-12",
    days: [
      {
        id: "one",
        date: "2040-06-12",
        title: "One",
        nodes: [
          {
            id: "museum",
            dayId: "one",
            title: "Museum",
            kind: "sightseeing",
            payload: {},
            timing: { certainty: "unknown" },
            optionality: "core",
          },
        ],
      },
    ],
    routes: [],
    candidateGroups: [],
    tasks: [],
    reservations: [],
  };
  const navigationStore = createMemoryTripNavigationStore({
    surface: "experience",
    dayId: "one",
    ownerId: null,
  });
  const progressStore: ProgressStore = {
    read: () => ({ status: "ready", value: null }),
    write: () => true,
    subscribe: () => () => {},
  };
  const { result } = renderHook(() =>
    useTripExperience({
      trip,
      navigationStore,
      progressStore,
      clock: () => "2040-06-12T10:00:00Z",
      presentation: {
        mapVisualProfile: {
          id: "plain",
          basemap: {
            mode: "neutral",
            density: "low",
            contrast: "soft",
            poi: "minimal",
            stationLabels: "hidden",
            palette: {
              geometry: "gray",
              label: "black",
              labelStroke: "white",
              water: "blue",
              park: "green",
              road: "gray",
            },
          },
          routeStyle: () => null,
        },
        createMarkerContent: () => {
          throw new Error("unused");
        },
        createUserLocationContent: () => {
          throw new Error("unused");
        },
      },
    }),
  );
  await waitFor(() =>
    expect(result.current.model.owners.selectedId).toBe("museum"),
  );
  expect(result.current.model.providers.map).toEqual({
    status: "unavailable",
    reason: "missing-configuration",
    retryable: false,
  });
  act(() => result.current.actions.selectNode("museum"));
  expect(result.current.model.owners.selectedId).toBe("museum");
  act(() => result.current.actions.selectNode("foreign"));
  expect(result.current.model.owners.selectedId).toBe("museum");
});

function fixture() {
  const place = (name: string, lat: number) => ({
    name,
    certainty: "confirmed" as const,
    identity: {
      status: "resolved" as const,
      coordinates: { lat, lng: 139 },
      providerReference: { provider: "neutral", id: name },
    },
  });
  const trip: Trip = {
    id: "trip",
    title: "Trip",
    locale: "en",
    timezone: "Asia/Tokyo",
    startDate: "2040-06-12",
    endDate: "2040-06-13",
    days: [
      {
        id: "one",
        title: "One",
        date: "2040-06-12",
        nodes: [
          {
            id: "hotel",
            dayId: "one",
            title: "Hotel",
            kind: "lodging",
            payload: { role: "base" },
            timing: { certainty: "unknown" },
            optionality: "optional",
            place: place("Hotel", 35),
          },
          {
            id: "museum",
            dayId: "one",
            title: "Museum",
            kind: "sightseeing",
            payload: {},
            timing: { start: "09:00", end: "11:00", certainty: "fixed" },
            optionality: "optional",
            place: place("Museum", 36),
          },
          {
            id: "meal",
            dayId: "one",
            title: "Meal",
            kind: "dining",
            payload: { candidateGroupId: "food" },
            timing: { start: "12:00", end: "13:00", certainty: "fixed" },
            optionality: "candidate",
            place: place("Meal", 37),
          },
        ],
      },
      {
        id: "two",
        title: "Two",
        date: "2040-06-13",
        nodes: [
          {
            id: "park",
            dayId: "two",
            title: "Park",
            kind: "sightseeing",
            payload: {},
            timing: { certainty: "unknown" },
            optionality: "core",
            place: place("Park", 38),
          },
        ],
      },
    ],
    routes: [
      {
        id: "edge",
        dayId: "one",
        fromNodeId: "museum",
        toNodeId: "meal",
        mode: "transit",
        source: "manual",
        certainty: "confirmed",
      },
    ],
    candidateGroups: [
      {
        id: "food",
        parentNodeId: "meal",
        mode: "single",
        defaultOptionId: "a",
        options: [
          { id: "a", title: "A", place: place("A", 37) },
          { id: "b", title: "B", place: place("B", 39) },
        ],
      },
    ],
    tasks: [],
    reservations: [],
  };
  let value: string | null = null;
  const progressStore: ProgressStore = {
    read: () => ({ status: "ready", value }),
    write: (next) => {
      value = next;
      return true;
    },
    subscribe: () => () => {},
  };
  const adapter = {
    mount: vi.fn<MapAdapterV2["mount"]>(() => Promise.resolve()),
    render: vi.fn<MapAdapterV2["render"]>(),
    applyCameraIntent: vi.fn<MapAdapterV2["applyCameraIntent"]>(),
    getCameraSnapshot: vi.fn<MapAdapterV2["getCameraSnapshot"]>(() => ({
      zoom: 13,
    })),
    setUserLocation: vi.fn<MapAdapterV2["setUserLocation"]>(),
    destroy: vi.fn<MapAdapterV2["destroy"]>(),
  };
  const input: UseTripExperienceInput = {
    trip,
    navigationStore: createMemoryTripNavigationStore({
      surface: "experience",
      dayId: "one",
      ownerId: null,
    }),
    progressStore,
    clock: () => "2040-06-12T01:30:00Z",
    presentation: {
      mapVisualProfile: {
        id: "test",
        basemap: {
          mode: "neutral",
          density: "low",
          contrast: "soft",
          poi: "minimal",
          stationLabels: "hidden",
          palette: {
            geometry: "gray",
            label: "black",
            labelStroke: "white",
            water: "blue",
            park: "green",
            road: "gray",
          },
        },
        routeStyle: () => null,
      },
      createMarkerContent: () => ({
        element: document.createElement("div"),
        update() {},
        dispose() {},
      }),
      createUserLocationContent: () => ({
        element: document.createElement("div"),
        update() {},
        dispose() {},
      }),
    },
    runtime: { createMap: () => adapter },
    onDiagnostic: vi.fn(),
  };
  return { input, adapter };
}
async function setup(input: UseTripExperienceInput) {
  const hook = renderHook(useTripExperience, { initialProps: input });
  const host = document.createElement("div");
  document.body.append(host);
  host.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 400,
    bottom: 800,
    width: 400,
    height: 800,
    toJSON: () => ({}),
  });
  act(() => {
    hook.result.current.bindings.layout.mapViewportRef(host);
  });
  await waitFor(() =>
    expect(hook.result.current.model.providers.map.status).toBe("ready"),
  );
  return hook;
}

it("keeps standalone fallback progress for same-trip updates and rehydrates on trip identity replacement", async () => {
  const { input } = fixture();
  let active = 0;
  const read = vi.fn<ProgressStore["read"]>(() => ({ status: "unavailable" }));
  const store: ProgressStore = { read, write: () => false, subscribe: () => { active++; return () => { active--; }; } };
  const props = { ...input, progressStore: store, runtime: undefined };
  const hook = renderHook(useTripExperience, { initialProps: props });
  await waitFor(() => expect(hook.result.current.model.persistence.status).toBe("memory-only"));
  const actions = hook.result.current.actions;
  act(() => actions.updateProgress({ kind: "completion", id: "node:museum", completed: true }));
  hook.rerender({ ...props, trip: { ...input.trip, title: "Updated title" } });
  expect(hook.result.current.model.progress.completedIds).toEqual(["node:museum"]);
  expect(read).toHaveBeenCalledTimes(1);
  hook.rerender({ ...props, trip: { ...input.trip, id: "replacement" } });
  await waitFor(() => expect(hook.result.current.model.progress.completedIds).toEqual([]));
  expect(hook.result.current.actions).toBe(actions);
  expect(read).toHaveBeenCalledTimes(2);
  expect(active).toBe(1);
  hook.unmount();
  expect(active).toBe(0);
});

it.each([
  { name: "endpoint mismatch", result: { status: "ready", durationMinutes: 60, steps: [], geometry: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }] }, reason: "implausible-result" },
  { name: "detour", result: { status: "ready", durationMinutes: 60, steps: [], geometry: [{ lat: 36, lng: 139 }, { lat: 0, lng: 0 }, { lat: 37, lng: 139 }] }, reason: "implausible-result" },
  { name: "duration", result: { status: "ready", durationMinutes: 1441, steps: [] }, reason: "implausible-result" },
  { name: "distance", result: { status: "ready", durationMinutes: 60, distanceMeters: 2000001, steps: [] }, reason: "implausible-result" },
  { name: "speed", result: { status: "ready", durationMinutes: 1, distanceMeters: 10000, steps: [] }, reason: "implausible-result" },
  { name: "malformed ready", result: { status: "ready", durationMinutes: 10 }, reason: "malformed-response" },
])("keeps rejected $name out of public map and camera while preserving authored route and navigation", async ({ result, reason }) => {
  const { input, adapter } = fixture();
  // This route keeps its authored endpoints; candidate recomposition is covered separately.
  input.trip.candidateGroups = [];
  input.trip.days[0].nodes = input.trip.days[0].nodes.map((node) => node.kind === "dining" ? { ...node, payload: {}, optionality: "core" } : node);
  input.trip.routes[0] = { ...input.trip.routes[0], durationMinutes: 42, summary: "Authored rail connection" };
  const open = vi.fn(() => true);
  input.runtime = { ...input.runtime, createRoutes: () => ({ load: () => Promise.resolve(result as RouteProviderResult) }), navigation: { supportedPlaceProviders: ["neutral"], open } };
  const hook = await setup(input);
  const route = () => hook.result.current.model.routes.find((route) => route.routeId === "edge");
  await waitFor(() => expect(route()?.runtime).toEqual({ status: "unavailable", reason, retryable: false }));
  expect(route()?.authored).toEqual({ durationMinutes: 42, summary: "Authored rail connection" });
  expect(route()?.navigationAvailable).toBe(true);
  expect(hook.result.current.model.map.presentation.routes).toEqual([]);
  expect(adapter.render.mock.calls.every(([model]) => model.routes.length === 0)).toBe(true);
  adapter.applyCameraIntent.mockClear();
  act(() => hook.result.current.actions.selectRoute("edge", "list"));
  expect(adapter.applyCameraIntent).not.toHaveBeenCalled();
  act(() => hook.result.current.actions.openNavigation("edge"));
  expect(open).toHaveBeenCalledOnce();
});

it("publishes a validated route into public DTOs and the map", async () => {
  const { input, adapter } = fixture();
  input.runtime = { ...input.runtime, createRoutes: () => ({ load: () => Promise.resolve({ status: "ready", durationMinutes: 60, distanceMeters: 111000, steps: ["Ride"], geometry: [{ lat: 36, lng: 139 }, { lat: 37, lng: 139 }] }) }) };
  const hook = await setup(input);
  await waitFor(() => expect(hook.result.current.model.routes.find((route) => route.routeId === "edge")?.runtime).toEqual({ status: "ready", durationMinutes: 60, distanceMeters: 111000, steps: ["Ride"], transitLines: [] }));
  expect(hook.result.current.model.map.presentation.routes[0].geometry).toEqual([{ lat: 36, lng: 139 }, { lat: 37, lng: 139 }]);
  expect(adapter.render.mock.calls.some(([model]) => model.routes[0]?.edgeId === "edge")).toBe(true);
});

it.each(["__proto__", "constructor", "toString"])("projects public provider truth for requested and coordinate-only %s owners", async (id) => {
  const { input } = fixture();
  input.trip.days[0].nodes = input.trip.days[0].nodes.slice(0, 2).map((node) => node.id === "hotel" ? { ...node, id } : node);
  input.trip.candidateGroups = [];
  input.trip.routes = [{ id, dayId: "one", fromNodeId: id, toNodeId: "museum", mode: "transit", source: "manual", certainty: "confirmed" }];
  let resolveRoute!: (value: RouteProviderResult) => void;
  let resolvePlace!: (value: import("@laugh-tale-island/core").PlaceProviderResult) => void;
  input.runtime = {
    createRoutes: () => ({ load: () => new Promise<RouteProviderResult>((resolve) => { resolveRoute = resolve; }) }),
    createPlaces: () => ({ load: (request) => request.ownerId === id ? new Promise((resolve) => { resolvePlace = resolve; }) : Promise.resolve({ status: "ready", facts: {} }) }),
  };
  const hook = renderHook(useTripExperience, { initialProps: input });
  await waitFor(() => expect(hook.result.current.model.routes[0].runtime).toEqual({ status: "loading" }));
  expect(hook.result.current.model.providers.routes).toEqual({ status: "loading", retryable: false });
  expect(hook.result.current.model.places.find((place) => place.ownerId === id)?.runtime).toEqual({ status: "loading" });
  await act(async () => { resolveRoute({ status: "unavailable", reason: "network", retryable: true }); resolvePlace({ status: "ready", facts: {} }); await Promise.resolve(); });
  expect(hook.result.current.model.routes[0].runtime).toEqual({ status: "unavailable", reason: "network", retryable: true });
  expect(hook.result.current.model.providers.routes).toEqual({ status: "unavailable", reason: "network", retryable: true });
  expect(hook.result.current.model.providers.places).toEqual({ status: "ready", retryable: false });
  expect(hook.result.current.model.places.find((place) => place.ownerId === id)?.runtime.status).toBe("ready");
  const coordinateOnly = { ...input.trip, days: input.trip.days.map((day) => ({ ...day, nodes: day.nodes.map((node) => node.id === id ? { ...node, place: { name: "Coordinates", certainty: "confirmed" as const, identity: { status: "resolved" as const, coordinates: { lat: 35, lng: 139 } } } } : node) })), routes: input.trip.routes.map((edge) => ({ ...edge, mode: "flight" as const })) };
  hook.rerender({ ...input, trip: coordinateOnly });
  expect(hook.result.current.model.routes[0].runtime).toEqual({ status: "idle" });
  expect(hook.result.current.model.places.find((place) => place.ownerId === id)?.runtime).toEqual({ status: "idle" });
});

it("selects the authored current day on an initial null-day mount", async () => {
  const { input } = fixture();
  input.navigationStore = createMemoryTripNavigationStore();
  input.clock = () => "2040-06-13T01:30:00Z";
  input.trip.days[1].nodes[0].timing = {
    start: "09:00",
    end: "11:00",
    certainty: "fixed",
  };
  const { result } = renderHook(() => useTripExperience(input));
  await waitFor(() => expect(result.current.model.day.id).toBe("two"));
  expect(result.current.model.owners.currentId).toBe("park");
  expect(result.current.model.owners.selectedId).toBe("park");
});

it("does not enable bootstrap retries without executable route or place owners", async () => {
  const { input } = fixture();
  input.runtime = {};
  input.providerBootstrap = {
    routes: { status: "unavailable", reason: "loader-failed", retryable: true },
    places: { status: "unavailable", reason: "network", retryable: true },
  };
  const { result } = renderHook(() => useTripExperience(input));
  await waitFor(() =>
    expect(result.current.model.providers.routes.status).toBe("unavailable"),
  );
  expect(
    result.current.model.routes.find((route) => route.routeId === "edge")
      ?.runtime,
  ).toEqual(input.providerBootstrap.routes);
  expect(
    result.current.model.places.find((place) => place.ownerId === "museum")
      ?.runtime,
  ).toEqual(input.providerBootstrap.places);
  expect(result.current.model.capabilities.retryRouteIds).toEqual([]);
  expect(result.current.model.capabilities.retryPlaceOwnerIds).toEqual([]);
  act(() => {
    result.current.actions.retryProvider("route", "edge");
    result.current.actions.retryProvider("place", "museum");
  });
  expect(result.current.model.providers.routes).toEqual(
    input.providerBootstrap.routes,
  );
  expect(result.current.model.providers.places).toEqual(
    input.providerBootstrap.places,
  );
});

it("exposes executable request retry capabilities until each real owner recovers", async () => {
  const { input } = fixture();
  let routeLoads = 0;
  const placeLoads = new Map<string, number>();
  input.runtime = {
    createRoutes: () => ({
      load: () =>
        Promise.resolve(
          ++routeLoads === 1
            ? { status: "unavailable", reason: "network", retryable: true }
            : { status: "ready", durationMinutes: 12, steps: [] },
        ),
    }),
    createPlaces: () => ({
      load: (request) => {
        const count = (placeLoads.get(request.ownerId) ?? 0) + 1;
        placeLoads.set(request.ownerId, count);
        return Promise.resolve(
          count === 1
            ? { status: "unavailable", reason: "network", retryable: true }
            : { status: "ready", facts: {} },
        );
      },
    }),
  };
  const { result } = renderHook(() => useTripExperience(input));
  await waitFor(() =>
    expect(result.current.model.capabilities.retryRouteIds).toEqual(["edge"]),
  );
  expect(result.current.model.capabilities.retryPlaceOwnerIds).toContain(
    "museum",
  );
  act(() => {
    result.current.actions.retryProvider("route", "edge");
    result.current.actions.retryProvider("place", "museum");
  });
  await waitFor(() =>
    expect(
      result.current.model.routes.find((route) => route.routeId === "edge")
        ?.runtime.status,
    ).toBe("ready"),
  );
  await waitFor(() =>
    expect(
      result.current.model.places.find((place) => place.ownerId === "museum")
        ?.runtime.status,
    ).toBe("ready"),
  );
  expect(result.current.model.capabilities.retryRouteIds).toEqual([]);
  expect(result.current.model.capabilities.retryPlaceOwnerIds).not.toContain(
    "museum",
  );
});

it("reports committed bootstrap failures before hook publication on mount and replacement", () => {
  const { input } = fixture();
  input.runtime = {};
  const observations: string[] = [];
  let renderingHook = false;
  const renderDiagnostics: string[] = [];
  input.onDiagnostic = (event) => {
    if (event.scope === "provider") {
      if (renderingHook) renderDiagnostics.push(event.channel);
      observations.push(`diagnostic:${event.channel}:${event.reason}`);
    }
  };
  input.providerBootstrap = {
    map: { status: "unavailable", reason: "loader-failed", retryable: true },
    routes: { status: "unavailable", reason: "loader-failed", retryable: true },
    places: { status: "unavailable", reason: "loader-failed", retryable: true },
  };
  const hook = renderHook(
    (props: UseTripExperienceInput) => {
      renderingHook = true;
      const controller = useTripExperience(props);
      renderingHook = false;
      for (const channel of ["map", "routes", "places"] as const) {
        const state = controller.model.providers[channel];
        if (state.status === "unavailable")
          observations.push(`view:${channel}:${state.reason}`);
      }
      return controller;
    },
    { initialProps: input },
  );
  for (const [channel, publicChannel] of [
    ["map", "map"],
    ["route", "routes"],
    ["place", "places"],
  ]) {
    expect(
      observations.indexOf(`diagnostic:${channel}:loader-failed`),
    ).toBeGreaterThanOrEqual(0);
    expect(
      observations.indexOf(`diagnostic:${channel}:loader-failed`),
    ).toBeLessThan(observations.indexOf(`view:${publicChannel}:loader-failed`));
  }
  observations.length = 0;
  hook.rerender({
    ...input,
    providerBootstrap: {
      map: { status: "unavailable", reason: "network", retryable: true },
      routes: { status: "unavailable", reason: "network", retryable: true },
      places: { status: "unavailable", reason: "network", retryable: true },
    },
  });
  for (const [channel, publicChannel] of [
    ["map", "map"],
    ["route", "routes"],
    ["place", "places"],
  ]) {
    expect(
      observations.indexOf(`diagnostic:${channel}:network`),
    ).toBeGreaterThanOrEqual(0);
    expect(observations.indexOf(`diagnostic:${channel}:network`)).toBeLessThan(
      observations.indexOf(`view:${publicChannel}:network`),
    );
  }
  expect(renderDiagnostics).toEqual([]);
});

it("settles inline equivalent bootstrap attempts without loops and reports recurrence after removal", () => {
  const { input } = fixture();
  const onDiagnostic = vi.fn();
  let renders = 0;
  const hook = renderHook(
    ({ present }: { present: boolean }) => {
      if (++renders > 20) throw new Error("bootstrap-publication-loop");
      return useTripExperience({
        ...input,
        runtime: {},
        onDiagnostic,
        providerBootstrap: present
          ? {
              map: {
                status: "unavailable",
                reason: "network",
                retryable: true,
                diagnostic: "same attempt",
              },
            }
          : {},
      });
    },
    { initialProps: { present: true } },
  );
  expect(hook.result.current.model.providers.map).toEqual({
    status: "unavailable",
    reason: "network",
    retryable: true,
  });
  expect(onDiagnostic).toHaveBeenCalledTimes(1);
  hook.rerender({ present: true });
  expect(onDiagnostic).toHaveBeenCalledTimes(1);
  hook.rerender({ present: false });
  hook.rerender({ present: true });
  expect(onDiagnostic).toHaveBeenCalledTimes(2);
  expect(renders).toBeLessThan(20);
});

it("rejects invalid authored navigation despite resolved internal endpoints", () => {
  const { input } = fixture();
  const open = vi.fn(() => true);
  input.runtime = { navigation: { supportedPlaceProviders: [], open } };
  input.trip.routes[0].navigation = {
    origin: " ",
    destination: "Explicit destination",
  };
  input.trip.candidateGroups = [];
  const { result } = renderHook(() => useTripExperience(input));
  expect(result.current.model.capabilities.navigationOwnerIds).not.toContain(
    "edge",
  );
  act(() => result.current.actions.openNavigation("edge"));
  expect(open).not.toHaveBeenCalled();
});

it("separates current/next/manual viewing/map selection and preserves one adapter through days", async () => {
  const { input, adapter } = fixture();
  const hook = await setup(input);
  const actions = hook.result.current.actions;
  act(() => actions.selectNode("hotel"));
  act(() => adapter.mount.mock.calls[0][1].events.onMarkerSelect("meal"));
  expect(hook.result.current.model.owners).toEqual({
    currentId: "museum",
    nextId: "meal",
    viewingId: "hotel",
    selectedId: "meal",
  });
  act(() => actions.selectDay("two"));
  expect(hook.result.current.model.day.id).toBe("two");
  expect(hook.result.current.actions).toBe(actions);
  expect(adapter.mount).toHaveBeenCalledTimes(1);
  expect(adapter.destroy).not.toHaveBeenCalled();
  act(() => actions.selectNode("museum"));
  expect(hook.result.current.model.owners.selectedId).toBe("park");
  hook.unmount();
  act(() => actions.selectDay("one"));
  expect(input.navigationStore.read().dayId).toBe("two");
});

it("restores the exact current owner independently of the next automatic incomplete owner", async () => {
  const { input } = fixture();
  const hook = await setup(input);
  act(() =>
    hook.result.current.actions.updateProgress({
      kind: "completion",
      id: "node:museum",
      completed: true,
    }),
  );
  act(() => hook.result.current.actions.restoreAutomaticSelection());
  expect(hook.result.current.model.owners.selectedId).toBe("meal");
  expect(hook.result.current.model.owners.currentId).toBe("museum");
  act(() => hook.result.current.actions.returnToCurrent());
  expect(hook.result.current.model.owners.selectedId).toBe("museum");
  act(() => hook.result.current.actions.returnToLodging());
  expect(hook.result.current.model.owners.selectedId).toBe("hotel");
  act(() =>
    hook.result.current.actions.updateProgress({
      kind: "node-skipped",
      nodeId: "hotel",
      skipped: true,
    }),
  );
  expect(hook.result.current.model.capabilities.returnToLodging).toBe(false);
  const before = input.navigationStore.read();
  act(() => hook.result.current.actions.returnToLodging());
  expect(input.navigationStore.read()).toEqual(before);
});

it("accepts external validated navigation without a feedback write and resets null-owner to automatic", async () => {
  const { input } = fixture();
  const write = vi.spyOn(input.navigationStore, "write");
  const hook = await setup(input);
  act(() =>
    input.navigationStore.write({
      surface: "experience",
      dayId: "two",
      ownerId: "park",
    }),
  );
  expect(hook.result.current.model.owners.selectedId).toBe("park");
  expect(write).toHaveBeenCalledTimes(1);
  act(() =>
    input.navigationStore.write({
      surface: "experience",
      dayId: "one",
      ownerId: null,
    }),
  );
  expect(hook.result.current.model.owners.selectedId).toBe("museum");
  expect(write).toHaveBeenCalledTimes(2);
});

it("opens exact destination-only and internal route requests once, containing false results and stale owners", async () => {
  const { input } = fixture();
  const open = vi.fn(() => false);
  input.runtime = {
    ...input.runtime,
    navigation: { supportedPlaceProviders: ["neutral"], open },
  };
  const hook = await setup(input);
  act(() => hook.result.current.actions.openNavigation("museum"));
  expect(open.mock.calls[0]).toEqual([
    {
      kind: "place",
      destination: {
        kind: "provider-reference",
        label: "Museum",
        providerReference: { provider: "neutral", id: "Museum" },
      },
    },
  ]);
  act(() => hook.result.current.actions.openNavigation("edge"));
  expect(open.mock.calls[1]).toEqual([
    {
      kind: "route",
      origin: {
        kind: "provider-reference",
        label: "Museum",
        providerReference: { provider: "neutral", id: "Museum" },
      },
      destination: {
        kind: "provider-reference",
        label: "A",
        providerReference: { provider: "neutral", id: "A" },
      },
      travelMode: "transit",
    },
  ]);
  act(() => hook.result.current.actions.selectDay("two"));
  act(() => hook.result.current.actions.openNavigation("edge"));
  expect(open).toHaveBeenCalledTimes(2);
});

it("retains exact mounted unavailable reasons and diagnostics while itinerary remains actionable", async () => {
  const { input, adapter } = fixture();
  const hook = await setup(input);
  act(() =>
    adapter.mount.mock.calls[0][1].events.onUnavailable({
      status: "unavailable",
      reason: "request-denied",
      retryable: false,
      diagnostic: "private",
    }),
  );
  expect(input.onDiagnostic).toHaveBeenCalledExactlyOnceWith({
    scope: "provider",
    channel: "map",
    phase: "runtime",
    reason: "request-denied",
    diagnostic: "private",
  });
  expect(hook.result.current.model.providers.map).toEqual({
    status: "unavailable",
    reason: "request-denied",
    retryable: false,
  });
  expect(JSON.stringify(hook.result.current.model)).not.toContain("private");
  act(() => hook.result.current.actions.selectNode("meal"));
  expect(hook.result.current.model.owners.selectedId).toBe("meal");
  act(() => hook.result.current.actions.retryProvider("map"));
  expect(adapter.mount).toHaveBeenCalledTimes(1);
});

it("accepts responsive measured geometry, reduced motion and exact header transition settlement", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  const { input, adapter } = fixture();
  const hook = await setup(input);
  expect(hook.result.current.model.sheet.geometry).toBeNull();
  act(() => hook.result.current.actions.setSheetSnap("expanded"));
  expect(hook.result.current.model.sheet.snap).toBe("half");
  act(() =>
    hook.result.current.bindings.sheet.setMeasuredGeometry({
      collapsedHeight: 77,
      halfHeight: 155,
      expandedHeight: 411,
    }),
  );
  act(() => hook.result.current.actions.setSheetSnap("expanded"));
  expect(hook.result.current.model.sheet).toEqual({
    geometry: { collapsed: 77, half: 155, expanded: 411, ceiling: 411 },
    snap: "expanded",
    interactive: true,
  });
  act(() =>
    hook.result.current.bindings.sheet.setMeasuredGeometry({
      collapsedHeight: 91,
      halfHeight: 201,
      expandedHeight: 501,
    }),
  );
  expect(hook.result.current.model.sheet.geometry?.expanded).toBe(501);
  await waitFor(() =>
    expect(adapter.applyCameraIntent.mock.calls.length).toBeGreaterThan(0),
  );
  expect(adapter.applyCameraIntent.mock.calls.at(-1)?.[0].transition).toBe(
    "immediate",
  );
  act(() => hook.result.current.actions.setHeaderExpanded(false));
  act(() => hook.result.current.actions.setHeaderExpanded(true));
  act(() => hook.result.current.actions.settleHeaderTransition(1));
  expect(hook.result.current.model.header.transition).toEqual({
    id: 2,
    phase: "expanding",
  });
  act(() => hook.result.current.actions.settleHeaderTransition(2));
  expect(hook.result.current.model.header.transition).toBeNull();
});

it("returns from a viewed foreign day to the actual trip current owner with one navigation publication", async () => {
  const { input, adapter } = fixture();
  const hook = await setup(input);
  act(() => hook.result.current.actions.selectDay("two"));
  expect(hook.result.current.model.owners.currentId).toBeNull();
  expect(hook.result.current.model.capabilities.returnToCurrent).toBe(true);
  const write = vi.spyOn(input.navigationStore, "write");
  const mounts = adapter.mount.mock.calls.length;
  act(() => hook.result.current.actions.returnToCurrent());
  expect(hook.result.current.model.day.id).toBe("one");
  expect(hook.result.current.model.owners.selectedId).toBe("museum");
  expect(write).toHaveBeenCalledExactlyOnceWith({ surface: "experience", dayId: "one", ownerId: "museum" });
  expect(adapter.mount).toHaveBeenCalledTimes(mounts);
});

it("owns candidate preview/confirmation and replaces parent markers only during comparison", async () => {
  const { input, adapter } = fixture();
  const hook = await setup(input);
  act(() => hook.result.current.actions.reopenCandidate("food"));
  expect(hook.result.current.model.candidates[0]).toMatchObject({
    open: true,
    draftOptionId: "a",
  });
  expect(
    hook.result.current.model.map.presentation.markers.map(
      (marker) => marker.ownerId,
    ),
  ).toEqual(["hotel", "museum", "a", "b"]);
  act(() => adapter.mount.mock.calls[0][1].events.onMarkerSelect("b"));
  expect(hook.result.current.model.candidates[0].draftOptionId).toBe("b");
  act(() => hook.result.current.actions.confirmCandidate("food"));
  expect(hook.result.current.model.progress.selectedCandidates).toEqual([
    { groupId: "food", optionId: "b" },
  ]);
  expect(hook.result.current.model.candidates[0].open).toBe(false);
  act(() => hook.result.current.actions.selectDay("two"));
  expect(hook.result.current.model.candidates).toEqual([]);
});

it("does not advertise inert preview controls for a read-only browse group", async () => {
  const { input, adapter } = fixture();
  input.trip.candidateGroups = input.trip.candidateGroups.map((group) => ({ ...group, mode: "browse" }));
  const hook = await setup(input);
  act(() => hook.result.current.actions.reopenCandidate("food"));
  expect(hook.result.current.model.candidates[0]).toMatchObject({
    mode: "browse",
    open: true,
    capabilities: { previewOptionIds: [], confirm: false },
  });
  expect(hook.result.current.model.candidates[0]).not.toHaveProperty("draftOptionId");
  expect(hook.result.current.model.candidates[0].options.every((option) => !option.draft)).toBe(true);
  act(() => hook.result.current.actions.previewCandidate("food", "b"));
  expect(hook.result.current.model.candidates[0]).not.toHaveProperty("draftOptionId");
  const option = document.createElement("div");
  option.tabIndex = -1;
  document.body.append(option);
  try {
    act(() => { hook.result.current.bindings.focus.dialogRef("b")(option); });
    act(() => adapter.mount.mock.calls[0][1].events.onMarkerSelect("b"));
    await waitFor(() => expect(document.activeElement).toBe(option));
    expect(hook.result.current.model.candidates[0]).not.toHaveProperty("draftOptionId");
  } finally { option.remove(); }
});

it.each(["cancelCandidate", "confirmCandidate"] as const)("%s closes comparison with one full-day camera request, unchanged navigation and trigger focus", async (action) => {
  const { input, adapter } = fixture();
  const hook = await setup(input);
  const trigger = document.createElement("button");
  document.body.append(trigger);
  try {
    act(() => { hook.result.current.bindings.focus.disclosureTriggerRef("food")(trigger); });
    act(() => hook.result.current.actions.reopenCandidate("food"));
    await waitFor(() => expect(adapter.applyCameraIntent.mock.calls.at(-1)?.[0].kind).toBe("fit"));
    act(() => hook.result.current.actions.previewCandidate("food", "b"));
    const count = adapter.applyCameraIntent.mock.calls.length;
    const navigation = input.navigationStore.read();
    act(() => hook.result.current.actions[action]("food"));
    await waitFor(() => expect(adapter.applyCameraIntent).toHaveBeenCalledTimes(count + 1));
    expect(adapter.applyCameraIntent.mock.calls.at(-1)?.[0]).toMatchObject({ kind: "fit" });
    expect(input.navigationStore.read()).toEqual(navigation);
    expect(hook.result.current.model.candidates[0].open).toBe(false);
    expect(hook.result.current.model.candidates[0].committedOptionId).toBe(action === "confirmCandidate" ? "b" : "a");
    expect(document.activeElement).toBe(trigger);
    act(() => hook.result.current.actions[action]("food"));
    expect(adapter.applyCameraIntent).toHaveBeenCalledTimes(count + 1);
  } finally { trigger.remove(); }
});

async function conditionalCandidateFixture(showTrigger = true) {
  const { input } = fixture();
  let controller: ReturnType<typeof useTripExperience>;
  const triggerFocus = vi.fn();
  const fallbackFocus = vi.fn();
  function Consumer({ value }: { value: UseTripExperienceInput }) {
    controller = useTripExperience(value);
    const candidate = controller.model.candidates[0];
    return <>
      <button ref={controller.bindings.owners.nodeRef("meal")} onFocus={fallbackFocus}>Meal fallback</button>
      {showTrigger && candidate?.capabilities.reopen && <button ref={controller.bindings.focus.disclosureTriggerRef("food")} onFocus={triggerFocus}>Disclosure</button>}
      {candidate?.open && <button ref={controller.bindings.focus.dialogRef("b")}>Draft option</button>}
    </>;
  }
  const view = render(<Consumer value={input} />);
  await act(async () => { await Promise.resolve(); });
  const current = () => controller;
  act(() => current().actions.selectNode("meal"));
  act(() => current().actions.reopenCandidate("food"));
  return { ...view, current, input, triggerFocus, fallbackFocus, replace: (value: UseTripExperienceInput) => view.rerender(<Consumer value={value} />) };
}

it.each(["cancelCandidate", "confirmCandidate"] as const)("%s restores a conditionally remounted disclosure exactly once after commit", async (action) => {
  const view = await conditionalCandidateFixture();
  expect(view.queryByText("Disclosure")).toBeNull();
  view.getByText("Draft option").focus();
  const focus = vi.spyOn(HTMLElement.prototype, "focus");
  act(() => view.current().actions[action]("food"));
  expect(document.activeElement).toBe(view.getByText("Disclosure"));
  expect(view.triggerFocus).toHaveBeenCalledTimes(1);
  expect(view.fallbackFocus).not.toHaveBeenCalled();
  act(() => view.current().actions[action]("food"));
  view.replace({ ...view.input, clock: () => "2040-06-12T03:30:00Z" });
  expect(view.triggerFocus).toHaveBeenCalledTimes(1);
  expect(focus.mock.contexts.filter(element => element === view.getByText("Disclosure"))).toHaveLength(1);
});

it("uses the valid row fallback once when the consumer genuinely has no disclosure", async () => {
  const view = await conditionalCandidateFixture(false);
  expect(view.current().model.itinerary.focusFallback).toEqual({ slot: "node", ownerId: "meal" });
  view.getByText("Draft option").focus();
  act(() => view.current().actions.cancelCandidate("food"));
  expect(document.activeElement).toBe(view.getByText("Meal fallback"));
  expect(view.fallbackFocus).toHaveBeenCalledTimes(1);
});

it.each(["owner", "day", "home", "reopen", "external-owner", "external-day", "external-home", "replacement", "unmount"] as const)("discards post-close disclosure restoration on %s before the closed commit", async (change) => {
  const view = await conditionalCandidateFixture();
  view.getByText("Draft option").focus();
  act(() => {
    view.current().actions.cancelCandidate("food");
    if (change === "owner") view.current().actions.selectNode("hotel");
    else if (change === "day") view.current().actions.selectDay("two");
    else if (change === "home") view.current().actions.openHome();
    else if (change === "reopen") view.current().actions.reopenCandidate("food");
    else if (change.startsWith("external-")) view.input.navigationStore.write({ surface: change === "external-home" ? "home" : "experience", dayId: change === "external-day" ? "two" : "one", ownerId: change === "external-owner" ? "hotel" : "meal" });
    else if (change === "replacement") view.replace({ ...view.input, trip: { ...view.input.trip, id: "new-trip" } });
    else view.unmount();
  });
  expect(view.triggerFocus).not.toHaveBeenCalled();
  expect(view.fallbackFocus).not.toHaveBeenCalled();
});

it.each(["list-node", "map-node", "list-route", "map-route", "current", "lodging", "automatic"] as const)("discards a candidate draft on valid %s owner change without restoring the old trigger", async (channel) => {
  const { input, adapter } = fixture();
  const hook = await setup(input);
  const unrelated = document.createElement("button");
  const trigger = document.createElement("button");
  document.body.append(unrelated, trigger);
  try {
    act(() => hook.result.current.actions.selectNode("meal"));
    act(() => { hook.result.current.bindings.focus.disclosureTriggerRef("food")(trigger); });
    act(() => hook.result.current.actions.reopenCandidate("food"));
    act(() => hook.result.current.actions.previewCandidate("food", "b"));
    unrelated.focus();
    act(() => {
      if (channel === "list-node") hook.result.current.actions.selectNode("hotel");
      else if (channel === "map-node") adapter.mount.mock.calls[0][1].events.onMarkerSelect("hotel");
      else if (channel === "list-route") hook.result.current.actions.selectRoute("edge", "list");
      else if (channel === "map-route") adapter.mount.mock.calls[0][1].events.onRouteSelect("edge");
      else if (channel === "current") hook.result.current.actions.returnToCurrent();
      else if (channel === "lodging") hook.result.current.actions.returnToLodging();
      else hook.result.current.actions.restoreAutomaticSelection();
    });
    expect(hook.result.current.model.candidates[0].open).toBe(false);
    expect(hook.result.current.model.candidates[0].committedOptionId).toBe("a");
    expect(document.activeElement).toBe(unrelated);
    act(() => hook.result.current.actions.reopenCandidate("food"));
    expect(hook.result.current.model.candidates[0].draftOptionId).toBe("a");
  } finally { unrelated.remove(); trigger.remove(); }
});

it("joins draft marker state through reopen, preview, cancel and confirm without committing previews", async () => {
  const { input, adapter } = fixture();
  const hook = await setup(input);
  const selected = () => hook.result.current.model.map.presentation.markers.filter((marker) => marker.states.includes("selected")).map((marker) => marker.ownerId);
  act(() => hook.result.current.actions.selectNode("meal"));
  act(() => hook.result.current.actions.reopenCandidate("food"));
  expect(selected()).toEqual(["a"]);
  act(() => adapter.mount.mock.calls[0][1].events.onMarkerSelect("b"));
  expect(selected()).toEqual(["b"]);
  expect(hook.result.current.model.candidates[0].committedOptionId).toBe("a");
  act(() => hook.result.current.actions.cancelCandidate("food"));
  expect(selected()).toEqual(["meal"]);
  act(() => hook.result.current.actions.reopenCandidate("food"));
  expect(selected()).toEqual(["a"]);
  act(() => hook.result.current.actions.previewCandidate("food", "b"));
  act(() => hook.result.current.actions.confirmCandidate("food"));
  act(() => hook.result.current.actions.reopenCandidate("food"));
  expect(selected()).toEqual(["b"]);
});

it("reveals and focuses the exact map-preview option without camera echo and cancels deferred focus on close", async () => {
  const { input, adapter } = fixture();
  const hook = await setup(input);
  const option = document.createElement("input");
  const unrelated = document.createElement("button");
  const late = document.createElement("input");
  const scroll = vi.fn();
  option.scrollIntoView = scroll;
  document.body.append(option, unrelated, late);
  try {
    act(() => hook.result.current.actions.reopenCandidate("food"));
    act(() => { hook.result.current.bindings.focus.dialogRef("b")(option); });
    const count = adapter.applyCameraIntent.mock.calls.length;
    act(() => adapter.mount.mock.calls[0][1].events.onMarkerSelect("b"));
    expect(document.activeElement).toBe(option);
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: "nearest", behavior: "smooth" });
    expect(adapter.applyCameraIntent).toHaveBeenCalledTimes(count);
    act(() => adapter.mount.mock.calls[0][1].events.onMarkerSelect("a"));
    act(() => hook.result.current.actions.cancelCandidate("food"));
    act(() => hook.result.current.actions.reopenCandidate("food"));
    unrelated.focus();
    act(() => { hook.result.current.bindings.focus.dialogRef("a")(late); });
    expect(document.activeElement).toBe(unrelated);
  } finally { option.remove(); unrelated.remove(); late.remove(); }
});

it("keeps preview open for option selection and ignores invalid owner/close requests", async () => {
  const { input, adapter } = fixture();
  const hook = await setup(input);
  act(() => hook.result.current.actions.reopenCandidate("food"));
  act(() => adapter.mount.mock.calls[0][1].events.onMarkerSelect("b"));
  const candidate = hook.result.current.model.candidates[0];
  const camera = adapter.applyCameraIntent.mock.calls.length;
  act(() => {
    hook.result.current.actions.selectNode("foreign");
    hook.result.current.actions.selectRoute("foreign", "list");
    hook.result.current.actions.cancelCandidate("foreign");
    hook.result.current.actions.confirmCandidate("foreign");
  });
  expect(hook.result.current.model.candidates[0]).toEqual(candidate);
  expect(candidate.open).toBe(true);
  expect(candidate.draftOptionId).toBe("b");
  expect(adapter.applyCameraIntent).toHaveBeenCalledTimes(camera);
});

it("cancels deferred map focus when same-day selection changes before its owner mounts", async () => {
  const { input, adapter } = fixture();
  const hook = await setup(input);
  const unrelated = document.createElement("button");
  const lateRoute = document.createElement("button");
  document.body.append(unrelated, lateRoute);
  unrelated.focus();
  act(() => adapter.mount.mock.calls[0][1].events.onRouteSelect("edge"));
  act(() => hook.result.current.actions.selectNode("hotel"));
  act(() => {
    hook.result.current.bindings.owners.routeRef("edge")(lateRoute);
  });
  expect(document.activeElement).toBe(unrelated);
  unrelated.remove();
  lateRoute.remove();
});

it("reveals automatic and list-selected nodes without moving focus and scrolls map selection only once", async () => {
  const { input, adapter } = fixture();
  const hook = await setup(input);
  const unrelated = document.createElement("button");
  const nodes = ["museum", "meal", "hotel"].map((id) => {
    const element = document.createElement("button");
    const scroll = vi.fn();
    element.scrollIntoView = scroll;
    document.body.append(element);
    act(() => { hook.result.current.bindings.owners.nodeRef(id)(element); });
    return { id, element, scroll };
  });
  document.body.append(unrelated);
  unrelated.focus();
  try {
    expect(nodes[0].scroll).toHaveBeenCalledExactlyOnceWith({ block: "nearest", behavior: "smooth" });
    hook.rerender({ ...input, clock: () => "2040-06-12T03:30:00Z" });
    expect(hook.result.current.model.owners.selectedId).toBe("meal");
    expect(nodes[1].scroll).toHaveBeenCalledExactlyOnceWith({ block: "nearest", behavior: "smooth" });
    expect(document.activeElement).toBe(unrelated);
    hook.rerender({ ...input, clock: () => "2040-06-12T03:30:00Z" });
    expect(nodes[1].scroll).toHaveBeenCalledOnce();
    expect(hook.result.current.model.owners.currentId).toBe("meal");
    nodes[1].scroll.mockClear();
    act(() => hook.result.current.actions.returnToCurrent());
    expect(nodes[1].scroll).toHaveBeenCalledExactlyOnceWith({ block: "nearest", behavior: "smooth" });
    expect(document.activeElement).toBe(unrelated);
    act(() => hook.result.current.actions.selectNode("meal"));
    nodes[1].scroll.mockClear();
    act(() => hook.result.current.actions.returnToCurrent());
    expect(nodes[1].scroll).toHaveBeenCalledOnce();
    act(() => adapter.mount.mock.calls[0][1].events.onMarkerSelect("meal"));
    nodes[1].scroll.mockClear();
    unrelated.focus();
    act(() => hook.result.current.actions.returnToCurrent());
    expect(nodes[1].scroll).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(unrelated);
    const remountCurrent = hook.result.current.bindings.owners.nodeRef("meal");
    act(() => { remountCurrent(null); });
    nodes[1].scroll.mockClear();
    act(() => hook.result.current.actions.returnToCurrent());
    expect(nodes[1].scroll).not.toHaveBeenCalled();
    act(() => { remountCurrent(nodes[1].element); });
    expect(nodes[1].scroll).toHaveBeenCalledExactlyOnceWith({ block: "nearest", behavior: "smooth" });
    expect(document.activeElement).toBe(unrelated);
    act(() => hook.result.current.actions.selectNode("hotel"));
    expect(nodes[2].scroll).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(unrelated);
    nodes[0].scroll.mockClear();
    act(() => adapter.mount.mock.calls[0][1].events.onMarkerSelect("museum"));
    expect(nodes[0].scroll).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(nodes[0].element);
  } finally { unrelated.remove(); for (const node of nodes) node.element.remove(); }
});

it("updates authored-zone current/next facts on the minute without replacing manual viewing", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2040-06-12T01:59:30Z"));
  const { input } = fixture();
  let instant = "2040-06-12T01:59:30Z";
  const hook = renderHook(() =>
    useTripExperience({ ...input, clock: () => instant }),
  );
  await act(async () => {
    await Promise.resolve();
  });
  act(() => hook.result.current.actions.selectNode("hotel"));
  instant = "2040-06-12T03:00:00Z";
  act(() => {
    vi.advanceTimersByTime(30_000);
  });
  expect(hook.result.current.model.clock).toEqual({
    instant,
    timezone: "Asia/Tokyo",
  });
  expect(hook.result.current.model.owners).toEqual({
    currentId: "meal",
    nextId: null,
    viewingId: "hotel",
    selectedId: "hotel",
  });
});

it("sends location only through v2 lifecycle and first-fix/recenter only as semantic camera intents", async () => {
  let success: PositionCallback | undefined;
  const clearWatch = vi.fn();
  const watchPosition = vi.fn((callback: PositionCallback) => {
    success = callback;
    return 19;
  });
  vi.stubGlobal("navigator", { geolocation: { watchPosition, clearWatch } });
  const { input, adapter } = fixture();
  const hook = await setup(input);
  expect(watchPosition).not.toHaveBeenCalled();
  act(() => hook.result.current.actions.beginLocation());
  act(() =>
    success?.({
      coords: { latitude: 35.5, longitude: 139.5 },
    } as GeolocationPosition),
  );
  await waitFor(() =>
    expect(adapter.applyCameraIntent.mock.calls.at(-1)?.[0].kind).toBe(
      "recenter-user",
    ),
  );
  expect(adapter.setUserLocation.mock.calls.at(-1)).toEqual([
    { lat: 35.5, lng: 139.5 },
  ]);
  const first = adapter.applyCameraIntent.mock.calls.at(-1)?.[0].intentId;
  act(() => hook.result.current.actions.recenterLocation());
  expect(adapter.applyCameraIntent.mock.calls.at(-1)?.[0].intentId).not.toBe(
    first,
  );
  act(() => hook.result.current.actions.stopLocation());
  expect(adapter.setUserLocation.mock.calls.at(-1)).toEqual([null]);
  expect(clearWatch).toHaveBeenCalledExactlyOnceWith(19);
  const count = adapter.setUserLocation.mock.calls.length;
  act(() =>
    success?.({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition),
  );
  expect(adapter.setUserLocation.mock.calls).toHaveLength(count);
});

it.each(["render", "setUserLocation", "applyCameraIntent"] as const)(
  "projects synchronous map %s failures into only the map channel",
  async (method) => {
    const { input, adapter } = fixture();
    const cause = new Error(`private ${method}`);
    adapter[method].mockImplementation(() => {
      throw cause;
    });
    const hook = renderHook(useTripExperience, { initialProps: input });
    const host = document.createElement("div");
    document.body.append(host);
    host.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 800,
      width: 400,
      height: 800,
      toJSON: () => ({}),
    });
    act(() => {
      hook.result.current.bindings.layout.mapViewportRef(host);
    });
    await waitFor(() =>
      expect(hook.result.current.model.providers.map.status).toBe(
        "unavailable",
      ),
    );
    expect(input.onDiagnostic).toHaveBeenCalledExactlyOnceWith({
      scope: "provider",
      channel: "map",
      phase: "runtime",
      reason: "network",
      cause,
    });
    expect(hook.result.current.model.providers.map).toEqual({
      status: "unavailable",
      reason: "network",
      retryable: true,
    });
    expect(hook.result.current.model.day.id).toBe("one");
    expect(hook.result.current.model.timeline.length).toBeGreaterThan(0);
    expect(JSON.stringify(hook.result.current.model)).not.toContain(
      cause.message,
    );
  },
);
