import type {
  NavigationRequestV2,
  MapMountConfig,
  MapPresentationV2,
  MarkerContentFactory,
  PlaceAdapterV2,
  RouteAdapterV2,
  UserLocationContentFactory,
} from "@laugh-tale-island/core/browser";
import type { PlaceProviderResult, PlaceRequestV2, RouteProviderResult, RouteRequestV2 } from "@laugh-tale-island/core";
import { describe, expect, it, vi } from "vitest";

import { FakeClock } from "../src/fakes/FakeClock.js";
import { FakeMapAdapterV2 } from "../src/fakes/FakeMapAdapterV2.js";
import { FakeNavigationAdapterV2 } from "../src/fakes/FakeNavigationAdapterV2.js";
import { FakePlaceAdapterV2 } from "../src/fakes/FakePlaceAdapterV2.js";
import { FakeProgressStore } from "../src/fakes/FakeProgressStore.js";
import { FakeRouteAdapterV2 } from "../src/fakes/FakeRouteAdapterV2.js";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function routeRequest(edgeId = "route-alpha"): RouteRequestV2 {
  return {
    edge: {
      id: edgeId,
      dayId: "day-neutral",
      fromNodeId: "node-origin",
      toNodeId: "node-destination",
      mode: "walking",
      source: "provider",
      certainty: "suggested",
    },
    origin: {
      ownerId: "node-origin",
      label: "Synthetic origin",
      identity: { status: "resolved", coordinates: { lat: 10, lng: 20 } },
    },
    destination: {
      ownerId: "node-destination",
      label: "Synthetic destination",
      identity: { status: "resolved", coordinates: { lat: 10.01, lng: 20.01 } },
    },
  };
}

function placeRequest(id = "synthetic-place-alpha"): PlaceRequestV2 {
  return {
    ownerId: "node-place",
    providerReference: { provider: "synthetic", id },
    locale: "en",
    timeZone: "UTC",
  };
}

const readyRoute = (): RouteProviderResult => ({
  status: "ready",
  durationMinutes: 12,
  steps: ["Proceed through the synthetic corridor"],
  geometry: [{ lat: 10, lng: 20 }, { lat: 10.01, lng: 20.01 }],
});

const readyPlace = (): PlaceProviderResult => ({
  status: "ready",
  facts: { formattedAddress: "1 Neutral Way", openingHours: { kind: "always-open" } },
});

describe.each([
  {
    name: "route",
    make: (resolver: (request: RouteRequestV2, attempt: number) => RouteProviderResult | Promise<RouteProviderResult>): RouteAdapterV2 & { readonly testOnly: true; readonly calls: readonly RouteRequestV2[]; readonly resolverInputs: readonly RouteRequestV2[] } => new FakeRouteAdapterV2(resolver),
    request: routeRequest,
    result: readyRoute,
  },
  {
    name: "place",
    make: (resolver: (request: PlaceRequestV2, attempt: number) => PlaceProviderResult | Promise<PlaceProviderResult>): PlaceAdapterV2 & { readonly testOnly: true; readonly calls: readonly PlaceRequestV2[]; readonly resolverInputs: readonly PlaceRequestV2[] } => new FakePlaceAdapterV2(resolver),
    request: placeRequest,
    result: readyPlace,
  },
] as const)("Fake $name adapter", ({ make, request, result }) => {
  it("snapshots caller and resolver input independently and clones the settled result", async () => {
    let suppliedResult = result();
    const adapter = make(((input: RouteRequestV2 | PlaceRequestV2) => {
      if ("edge" in input) input.edge.id = "resolver-mutated";
      else input.providerReference.id = "resolver-mutated";
      return suppliedResult;
    }) as never);
    const callerInput = request();
    const pending = adapter.load(callerInput as never, new AbortController().signal);
    if ("edge" in callerInput) callerInput.edge.id = "caller-mutated";
    else callerInput.providerReference.id = "caller-mutated";
    const settled = await pending;

    expect(adapter.testOnly).toBe(true);
    expect(adapter.calls[0]).toEqual(request());
    expect(adapter.resolverInputs[0]).toEqual(request());
    expect(adapter.calls[0]).not.toBe(callerInput);
    expect(adapter.resolverInputs[0]).not.toBe(adapter.calls[0]);
    expect(settled).toEqual(result());
    expect(settled).not.toBe(suppliedResult);

    if (settled.status === "ready") {
      if ("steps" in settled) (settled.steps as string[])[0] = "consumer-mutated";
      else settled.facts.formattedAddress = "consumer-mutated";
    }
    suppliedResult = result();
    await expect(adapter.load(request() as never, new AbortController().signal)).resolves.toEqual(result());
  });

  it("settles immediate and late cancellation and isolates the abandoned late result", async () => {
    const gate = deferred<ReturnType<typeof result>>();
    let invocation = 0;
    const adapter = make((() => ++invocation === 1 ? gate.promise : result()) as never);
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expect(adapter.load(request() as never, alreadyAborted.signal)).resolves.toMatchObject({ reason: "cancelled", retryable: false });
    expect(invocation).toBe(0);

    const controller = new AbortController();
    const abandoned = adapter.load(request() as never, controller.signal);
    controller.abort();
    await expect(abandoned).resolves.toMatchObject({ reason: "cancelled", retryable: false });
    gate.resolve(result());
    await Promise.resolve();

    await expect(adapter.load(request() as never, new AbortController().signal)).resolves.toEqual(result());
    expect(invocation).toBe(2);
  });

  it("normalizes thrown and rejected resolvers to retryable network failures with diagnostics", async () => {
    const thrown = make(() => { throw new Error("synthetic throw"); });
    await expect(thrown.load(request() as never, new AbortController().signal)).resolves.toEqual({
      status: "unavailable", reason: "network", retryable: true, diagnostic: "synthetic throw",
    });
    const rejected = make(async () => {
      await Promise.resolve();
      throw new Error("synthetic reject");
    });
    await expect(rejected.load(request() as never, new AbortController().signal)).resolves.toEqual({
      status: "unavailable", reason: "network", retryable: true, diagnostic: "synthetic reject",
    });
  });
});

it("route and place fixture lookup rejects prototype-backed keys and retries deterministically", async () => {
  const routePrototype = { inherited: readyRoute() };
  const routeFixtures = Object.assign(Object.create(routePrototype) as Record<string, RouteProviderResult>, { owned: readyRoute() });
  const routes = new FakeRouteAdapterV2(routeFixtures);
  await expect(routes.load(routeRequest("inherited"), new AbortController().signal)).resolves.toMatchObject({ reason: "not-found" });
  await expect(routes.load(routeRequest("owned"), new AbortController().signal)).resolves.toEqual(readyRoute());

  const placePrototype = { inherited: readyPlace() };
  const placeFixtures = Object.assign(Object.create(placePrototype) as Record<string, PlaceProviderResult>, { owned: readyPlace() });
  const places = new FakePlaceAdapterV2(placeFixtures);
  await expect(places.load(placeRequest("inherited"), new AbortController().signal)).resolves.toMatchObject({ reason: "not-found" });
  await expect(places.load(placeRequest("owned"), new AbortController().signal)).resolves.toEqual(readyPlace());
  await expect(places.load(placeRequest("owned"), new AbortController().signal)).resolves.toEqual(readyPlace());
  expect(places.attempts).toEqual([1, 2, 3]);
});

it("snapshots nested fixture records at construction and resolver replacement boundaries", async () => {
  const routeFixture = readyRoute();
  const routeFixtures = { owned: routeFixture };
  const routes = new FakeRouteAdapterV2(routeFixtures);
  if (routeFixture.status === "ready") {
    routeFixture.durationMinutes = 99;
    (routeFixture.geometry as { lat: number; lng: number }[])[0].lat = 99;
  }
  routeFixtures.owned = { status: "unavailable", reason: "not-found", retryable: false };
  await expect(routes.load(routeRequest("owned"), new AbortController().signal)).resolves.toEqual(readyRoute());

  const replacement = readyRoute();
  routes.setResolver({ replacement });
  if (replacement.status === "ready") (replacement.steps as string[])[0] = "mutated after setResolver";
  await expect(routes.load(routeRequest("replacement"), new AbortController().signal)).resolves.toEqual(readyRoute());
  routes.setResolver(Object.create({ inherited: readyRoute() }) as Record<string, RouteProviderResult>);
  await expect(routes.load(routeRequest("inherited"), new AbortController().signal)).resolves.toMatchObject({ status: "unavailable", reason: "not-found" });

  const placeFixture = readyPlace();
  const placeFixtures = { owned: placeFixture };
  const places = new FakePlaceAdapterV2(placeFixtures);
  if (placeFixture.status === "ready") placeFixture.facts.formattedAddress = "mutated after construction";
  placeFixtures.owned = { status: "unavailable", reason: "not-found", retryable: false };
  await expect(places.load(placeRequest("owned"), new AbortController().signal)).resolves.toEqual(readyPlace());

  const placeReplacement = readyPlace();
  places.setResolver({ replacement: placeReplacement });
  if (placeReplacement.status === "ready") placeReplacement.facts.formattedAddress = "mutated after setResolver";
  await expect(places.load(placeRequest("replacement"), new AbortController().signal)).resolves.toEqual(readyPlace());
  places.setResolver(Object.create({ inherited: readyPlace() }) as Record<string, PlaceProviderResult>);
  await expect(places.load(placeRequest("inherited"), new AbortController().signal)).resolves.toMatchObject({ status: "unavailable", reason: "not-found" });
});

it("captures synchronous resolver results before the caller can mutate them", async () => {
  const routeResult = readyRoute();
  const routes = new FakeRouteAdapterV2(() => routeResult);
  const routePending = routes.load(routeRequest(), new AbortController().signal);
  if (routeResult.status === "ready") {
    routeResult.durationMinutes = 99;
    (routeResult.geometry as { lat: number; lng: number }[])[0].lat = 99;
  }
  await expect(routePending).resolves.toEqual(readyRoute());
  await expect(routes.load(routeRequest(), new AbortController().signal)).resolves.toEqual({
    ...readyRoute(), durationMinutes: 99, geometry: [{ lat: 99, lng: 20 }, { lat: 10.01, lng: 20.01 }],
  });

  const placeResult = readyPlace();
  const places = new FakePlaceAdapterV2(() => placeResult);
  const placePending = places.load(placeRequest(), new AbortController().signal);
  if (placeResult.status === "ready") placeResult.facts.formattedAddress = "mutated after load";
  await expect(placePending).resolves.toEqual(readyPlace());
});

it("settles hostile resolver then-access as a deterministic typed failure", async () => {
  const hostile = Object.defineProperty({}, "then", {
    get() { throw new Error("hostile then getter"); },
  });
  const routes = new FakeRouteAdapterV2(() => hostile as RouteProviderResult);
  await expect(routes.load(routeRequest(), new AbortController().signal)).resolves.toEqual({
    status: "unavailable", reason: "network", retryable: true, diagnostic: "hostile then getter",
  });
  const places = new FakePlaceAdapterV2(() => hostile as PlaceProviderResult);
  await expect(places.load(placeRequest(), new AbortController().signal)).resolves.toEqual({
    status: "unavailable", reason: "network", retryable: true, diagnostic: "hostile then getter",
  });
});

it("keys place retry attempts by semantic owner while looking fixtures up by provider id", async () => {
  const places = new FakePlaceAdapterV2({ X: readyPlace(), Y: readyPlace() });
  const request = (ownerId: string, id: string): PlaceRequestV2 => ({ ...placeRequest(id), ownerId });
  await places.load(request("A", "X"), new AbortController().signal);
  await places.load(request("B", "X"), new AbortController().signal);
  await places.load(request("A", "Y"), new AbortController().signal);
  expect(places.attempts).toEqual([1, 1, 2]);
});

describe("FakeNavigationAdapterV2", () => {
  it("keeps place, route, and authored-external discriminants in cloned call records", () => {
    const adapter = new FakeNavigationAdapterV2(false, ["synthetic"]);
    const calls: NavigationRequestV2[] = [
      { kind: "place", destination: { kind: "coordinates", label: "Only destination", coordinates: { lat: 4, lng: 5 } } },
      { kind: "route", origin: { kind: "coordinates", label: "A", coordinates: { lat: 1, lng: 2 } }, destination: { kind: "coordinates", label: "B", coordinates: { lat: 3, lng: 4 } }, travelMode: "walking" },
      { kind: "authored-external", origin: "Synthetic A", destination: "Synthetic B", travelMode: "transit" },
    ];
    for (const call of calls) expect(adapter.open(call)).toBe(false);
    (calls[0] as Extract<NavigationRequestV2, { kind: "place" }>).destination.label = "mutated";

    expect(adapter.testOnly).toBe(true);
    expect(adapter.supportedPlaceProviders).toEqual(["synthetic"]);
    expect(adapter.calls.map(({ kind }) => kind)).toEqual(["place", "route", "authored-external"]);
    expect(adapter.calls[0]).toEqual({ kind: "place", destination: { kind: "coordinates", label: "Only destination", coordinates: { lat: 4, lng: 5 } } });
    expect(adapter.calls[0]).not.toHaveProperty("origin");
  });
});

describe("FakeProgressStore", () => {
  it("reads, writes, publishes cloned values, and disposes subscriptions once", () => {
    const store = new FakeProgressStore({ initialValue: "initial" });
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = store.subscribe(first);
    store.subscribe(second);
    expect(store.read()).toEqual({ status: "ready", value: "initial" });
    expect(store.write("next")).toBe(true);
    store.emit("external");
    unsubscribe();
    unsubscribe();
    store.emit(null);

    expect(store.testOnly).toBe(true);
    expect(store.readCount).toBe(1);
    expect(store.writes).toEqual(["next"]);
    expect(first.mock.calls).toEqual([["external"]]);
    expect(second.mock.calls).toEqual([["external"], [null]]);
    expect(store.listenerCount).toBe(1);
  });

  it("models independent read and write refusal without discarding in-memory progress", () => {
    const store = new FakeProgressStore({ initialValue: "retained", readAvailable: false, writeAvailable: false });
    expect(store.read()).toEqual({ status: "unavailable" });
    expect(store.write("not-persisted")).toBe(false);
    store.setReadAvailable(true);
    expect(store.read()).toEqual({ status: "ready", value: "retained" });
    store.setWriteAvailable(true);
    expect(store.write("persisted")).toBe(true);
    expect(store.read()).toEqual({ status: "ready", value: "persisted" });
  });
});

describe("FakeClock", () => {
  it("moves forward and backward by integer minutes and counts only now reads", () => {
    const clock = new FakeClock("2042-03-04T05:06:07.000Z");
    expect(clock.testOnly).toBe(true);
    expect(clock.snapshot()).toEqual({ instant: "2042-03-04T05:06:07.000Z", readCount: 0 });
    expect(clock.now()).toBe("2042-03-04T05:06:07.000Z");
    clock.advanceMinutes(5);
    clock.advanceMinutes(-2);
    expect(clock.now()).toBe("2042-03-04T05:09:07.000Z");
    const snapshot = clock.snapshot();
    expect(snapshot).toEqual({ instant: "2042-03-04T05:09:07.000Z", readCount: 2 });
    snapshot.instant = "mutated";
    expect(clock.snapshot().instant).toBe("2042-03-04T05:09:07.000Z");
  });

  it.each(["invalid", "2042-03-04", "2042-03-04T05:06:07", "2042-02-31T05:06:07.000Z", "2042-03-04T24:00:00.000Z"])("rejects invalid initial instant %s", (instant) => {
    expect(() => new FakeClock(instant)).toThrow();
  });

  it.each([Number.NaN, Infinity, 1.5])("rejects non-finite integer minute advance %s", (minutes) => {
    const clock = new FakeClock("2042-03-04T05:06:07.000Z");
    expect(() => clock.advanceMinutes(minutes)).toThrow();
  });

  it("rejects an out-of-range advance before mutating the clock", () => {
    const clock = new FakeClock("2042-03-04T05:06:07.000Z");
    const before = clock.snapshot();
    expect(() => clock.advanceMinutes(Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
    expect(clock.snapshot()).toEqual(before);
  });
});

describe("FakeMapAdapterV2", () => {
  function profile(): MapMountConfig["visualProfile"] {
    return {
      id: "synthetic-profile",
      basemap: { mode: "neutral", density: "low", contrast: "standard", poi: "minimal", stationLabels: "legible", palette: { geometry: "#111", label: "#222", labelStroke: "#fff", water: "#33f", park: "#3f3", road: "#aaa" } },
      routeStyle: () => ({ kind: "solid", stroke: { color: "#123", opacity: 1, width: 2 } }),
    };
  }

  function presentation(): MapPresentationV2 {
    return {
      markers: [{ ownerId: "marker-one", label: "Marker", coordinates: { lat: 1, lng: 2 }, markerMode: "numbered", displayIndex: 1, sourceKind: "sightseeing", timing: "suggested", states: ["selected"] }],
      routes: [{ edgeId: "route-one", mode: "walking", source: "provider", certainty: "suggested", geometry: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }], selected: false }],
    };
  }

  it("snapshots all adapter inputs and emits current-mount events only", async () => {
    const markerFactory: MarkerContentFactory = () => ({ element: document.createElement("div"), update: vi.fn(), dispose: vi.fn() });
    const userFactory: UserLocationContentFactory = () => ({ element: document.createElement("div"), update: vi.fn(), dispose: vi.fn() });
    const firstEvents = { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable: vi.fn() };
    const secondEvents = { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable: vi.fn() };
    const adapter = new FakeMapAdapterV2();
    const host = document.createElement("div");
    await adapter.mount(host, { events: firstEvents, visualProfile: profile(), createMarkerContent: markerFactory, createUserLocationContent: userFactory });
    const source = presentation();
    adapter.render(source);
    adapter.applyCameraIntent({ kind: "focus", intentId: "camera-one", transition: "immediate", viewport: { width: 800, height: 600 }, usableRegion: { x: 0, y: 0, width: 800, height: 600 }, edgeInsets: { top: 1, right: 2, bottom: 3, left: 4 }, coordinate: { lat: 1, lng: 2 }, targetZoom: 10 });
    adapter.setUserLocation({ lat: 5, lng: 6 });
    source.markers[0].coordinates.lat = 99;
    await adapter.mount(host, { events: secondEvents, visualProfile: profile(), createMarkerContent: markerFactory, createUserLocationContent: userFactory });
    adapter.emitMarkerSelect("marker-one");
    adapter.emitRouteSelect("route-one");
    adapter.emitUnavailable({ status: "unavailable", reason: "loader-failed", retryable: true, diagnostic: "synthetic" });
    adapter.destroy();
    adapter.emitMarkerSelect("stale");

    expect(adapter.testOnly).toBe(true);
    expect(adapter.mountCalls).toHaveLength(2);
    expect(adapter.mountCalls[0]?.element).toBe(host);
    expect(adapter.renderCalls[0]?.markers[0]?.coordinates.lat).toBe(1);
    expect(adapter.cameraIntentCalls[0]).toMatchObject({ intentId: "camera-one", coordinate: { lat: 1, lng: 2 } });
    expect(adapter.userLocationCalls).toEqual([{ lat: 5, lng: 6 }]);
    expect(adapter.destroyCount).toBe(1);
    expect(firstEvents.onMarkerSelect).not.toHaveBeenCalled();
    expect(secondEvents.onMarkerSelect).toHaveBeenCalledWith("marker-one");
    expect(secondEvents.onRouteSelect).toHaveBeenCalledWith("route-one");
    expect(secondEvents.onUnavailable).toHaveBeenCalledWith({ status: "unavailable", reason: "loader-failed", retryable: true, diagnostic: "synthetic" });
  });

  it("keeps marker and user-location ledgers separate with exact identity and once-only disposal", async () => {
    const markerElements: HTMLElement[] = [];
    const markerUpdates: unknown[] = [];
    const markerDisposals: string[] = [];
    const userElements: HTMLElement[] = [];
    const userUpdates: unknown[] = [];
    const userDisposals: string[] = [];
    const markerFactory: MarkerContentFactory = (descriptor) => {
      const element = document.createElement("button");
      markerElements.push(element);
      return { element, update: (next) => markerUpdates.push(structuredClone(next)), dispose: () => markerDisposals.push(descriptor.ownerId) };
    };
    const userFactory: UserLocationContentFactory = () => {
      const element = document.createElement("span");
      userElements.push(element);
      return { element, update: (next) => userUpdates.push(structuredClone(next)), dispose: () => userDisposals.push("user") };
    };
    const config: MapMountConfig = { events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable: vi.fn() }, visualProfile: profile(), createMarkerContent: markerFactory, createUserLocationContent: userFactory };
    const adapter = new FakeMapAdapterV2();
    await adapter.mount(document.createElement("div"), config);
    adapter.render(presentation());
    adapter.setUserLocation({ lat: 8, lng: 9 });
    adapter.setUserLocation({ lat: 10, lng: 11 });
    adapter.setUserLocation(null);
    adapter.setUserLocation(null);
    await adapter.mount(document.createElement("div"), config);
    adapter.render(presentation());
    adapter.setUserLocation({ lat: 12, lng: 13 });
    adapter.destroy();
    adapter.destroy();

    expect(adapter.markerFactoryCalls).toHaveLength(2);
    expect(adapter.userLocationFactoryCalls).toHaveLength(2);
    expect(adapter.markerElements).toEqual(markerElements);
    expect(adapter.userLocationElements).toEqual(userElements);
    expect(markerUpdates).toEqual([presentation().markers[0]]);
    expect(userUpdates).toEqual([{ coordinates: { lat: 10, lng: 11 } }]);
    expect(markerDisposals).toEqual(["marker-one", "marker-one"]);
    expect(userDisposals).toEqual(["user", "user"]);
    expect(adapter.markerDisposalCount).toBe(2);
    expect(adapter.userLocationDisposalCount).toBe(2);
  });

  it("returns cloned configured camera snapshots", () => {
    const adapter = new FakeMapAdapterV2({ cameraSnapshot: { zoom: 7 } });
    const first = adapter.getCameraSnapshot();
    expect(first).toEqual({ zoom: 7 });
    if (first) first.zoom = 99;
    expect(adapter.getCameraSnapshot()).toEqual({ zoom: 7 });
    expect(adapter.cameraSnapshotReadCount).toBe(2);
  });

  it("normalizes throwing presentation factories to typed network events", async () => {
    const unavailable = vi.fn();
    const adapter = new FakeMapAdapterV2();
    await adapter.mount(document.createElement("div"), {
      events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable: unavailable },
      visualProfile: profile(),
      createMarkerContent: () => { throw new Error("marker factory failed"); },
      createUserLocationContent: () => { throw new Error("user factory failed"); },
    });

    expect(() => adapter.render(presentation())).not.toThrow();
    expect(() => adapter.setUserLocation({ lat: 1, lng: 2 })).not.toThrow();
    expect(unavailable.mock.calls).toEqual([
      [{ status: "unavailable", reason: "network", retryable: true, diagnostic: "marker factory failed" }],
      [{ status: "unavailable", reason: "network", retryable: true, diagnostic: "user factory failed" }],
    ]);
    expect(adapter.markerElements).toEqual([]);
    expect(adapter.userLocationElements).toEqual([]);
  });

  it.each(["empty", "new"] as const)("disposes a stale marker handle when its factory reenters with an %s render", async (replacement) => {
    const adapter = new FakeMapAdapterV2();
    const staleDispose = vi.fn();
    const currentUpdate = vi.fn();
    const currentDispose = vi.fn();
    let reenter = true;
    const markerFactory: MarkerContentFactory = () => {
      if (reenter) {
        reenter = false;
        adapter.render(replacement === "empty" ? { markers: [], routes: [] } : {
          markers: [{ ...presentation().markers[0], ownerId: "marker-two", label: "Replacement" }],
          routes: [],
        });
        return { element: document.createElement("div"), update: vi.fn(), dispose: staleDispose };
      }
      return { element: document.createElement("div"), update: currentUpdate, dispose: currentDispose };
    };
    await adapter.mount(document.createElement("div"), {
      events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable: vi.fn() },
      visualProfile: profile(), createMarkerContent: markerFactory,
      createUserLocationContent: () => ({ element: document.createElement("div"), update: vi.fn(), dispose: vi.fn() }),
    });

    adapter.render(presentation());
    expect(staleDispose).toHaveBeenCalledTimes(1);
    const activeOwner = replacement === "empty" ? "marker-one" : "marker-two";
    if (replacement === "empty") adapter.render({ markers: [{ ...presentation().markers[0], ownerId: activeOwner }], routes: [] });
    adapter.render({ markers: [{ ...presentation().markers[0], ownerId: activeOwner, label: "Updated" }], routes: [] });
    expect(currentUpdate).toHaveBeenCalledTimes(1);
    expect(currentDispose).not.toHaveBeenCalled();
  });

  it.each(["null", "new"] as const)("disposes a stale user-location handle when its factory reenters with %s", async (replacement) => {
    const adapter = new FakeMapAdapterV2();
    const staleDispose = vi.fn();
    const currentUpdate = vi.fn();
    const currentDispose = vi.fn();
    let reenter = true;
    const userFactory: UserLocationContentFactory = () => {
      if (reenter) {
        reenter = false;
        adapter.setUserLocation(replacement === "null" ? null : { lat: 7, lng: 8 });
        return { element: document.createElement("div"), update: vi.fn(), dispose: staleDispose };
      }
      return { element: document.createElement("div"), update: currentUpdate, dispose: currentDispose };
    };
    await adapter.mount(document.createElement("div"), {
      events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable: vi.fn() },
      visualProfile: profile(),
      createMarkerContent: () => ({ element: document.createElement("div"), update: vi.fn(), dispose: vi.fn() }),
      createUserLocationContent: userFactory,
    });

    adapter.setUserLocation({ lat: 1, lng: 2 });
    expect(staleDispose).toHaveBeenCalledTimes(1);
    adapter.setUserLocation({ lat: 9, lng: 10 });
    if (replacement === "null") adapter.setUserLocation({ lat: 11, lng: 12 });
    expect(currentUpdate).toHaveBeenCalledTimes(1);
    expect(currentDispose).not.toHaveBeenCalled();
  });

  it("continues every marker removal after the first disposer throws and never retries disposal", async () => {
    const adapter = new FakeMapAdapterV2();
    const disposals = [vi.fn(() => { throw new Error("first removal failed"); }), vi.fn()];
    let index = 0;
    await adapter.mount(document.createElement("div"), {
      events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable: vi.fn() },
      visualProfile: profile(),
      createMarkerContent: () => ({ element: document.createElement("div"), update: vi.fn(), dispose: disposals[index++] }),
      createUserLocationContent: () => ({ element: document.createElement("div"), update: vi.fn(), dispose: vi.fn() }),
    });
    const second = { ...presentation().markers[0], ownerId: "marker-two" };
    adapter.render({ markers: [presentation().markers[0], second], routes: [] });
    expect(() => adapter.render({ markers: [], routes: [] })).toThrow("first removal failed");
    expect(disposals.map((dispose) => dispose.mock.calls.length)).toEqual([1, 1]);
    expect(() => adapter.render({ markers: [], routes: [] })).not.toThrow();
    expect(disposals.map((dispose) => dispose.mock.calls.length)).toEqual([1, 1]);
  });

  it("deactivates the old mount and continues all marker and user cleanup before rejecting a remount", async () => {
    const adapter = new FakeMapAdapterV2();
    const oldSelect = vi.fn();
    const newSelect = vi.fn();
    const markerDisposals = [vi.fn(() => { adapter.emitMarkerSelect("stale"); throw new Error("first remount failed"); }), vi.fn()];
    const userDispose = vi.fn();
    let markerIndex = 0;
    await adapter.mount(document.createElement("div"), {
      events: { onMarkerSelect: oldSelect, onRouteSelect: vi.fn(), onUnavailable: vi.fn() }, visualProfile: profile(),
      createMarkerContent: () => ({ element: document.createElement("div"), update: vi.fn(), dispose: markerDisposals[markerIndex++] }),
      createUserLocationContent: () => ({ element: document.createElement("div"), update: vi.fn(), dispose: userDispose }),
    });
    adapter.render({ markers: [presentation().markers[0], { ...presentation().markers[0], ownerId: "marker-two" }], routes: [] });
    adapter.setUserLocation({ lat: 1, lng: 2 });
    await expect(adapter.mount(document.createElement("div"), {
      events: { onMarkerSelect: newSelect, onRouteSelect: vi.fn(), onUnavailable: vi.fn() }, visualProfile: profile(),
      createMarkerContent: () => ({ element: document.createElement("div"), update: vi.fn(), dispose: vi.fn() }),
      createUserLocationContent: () => ({ element: document.createElement("div"), update: vi.fn(), dispose: vi.fn() }),
    })).rejects.toThrow("first remount failed");
    expect(markerDisposals.map((dispose) => dispose.mock.calls.length)).toEqual([1, 1]);
    expect(userDispose).toHaveBeenCalledTimes(1);
    expect(oldSelect).not.toHaveBeenCalled();
    adapter.emitMarkerSelect("current");
    expect(newSelect).toHaveBeenCalledWith("current");
  });

  it("continues all cleanup during destroy and leaves callbacks inactive", async () => {
    const adapter = new FakeMapAdapterV2();
    const select = vi.fn();
    const markerDisposals = [vi.fn(() => { adapter.emitMarkerSelect("stale"); throw new Error("first destroy failed"); }), vi.fn()];
    const userDispose = vi.fn();
    let markerIndex = 0;
    await adapter.mount(document.createElement("div"), {
      events: { onMarkerSelect: select, onRouteSelect: vi.fn(), onUnavailable: vi.fn() }, visualProfile: profile(),
      createMarkerContent: () => ({ element: document.createElement("div"), update: vi.fn(), dispose: markerDisposals[markerIndex++] }),
      createUserLocationContent: () => ({ element: document.createElement("div"), update: vi.fn(), dispose: userDispose }),
    });
    adapter.render({ markers: [presentation().markers[0], { ...presentation().markers[0], ownerId: "marker-two" }], routes: [] });
    adapter.setUserLocation({ lat: 1, lng: 2 });
    expect(() => adapter.destroy()).toThrow("first destroy failed");
    expect(markerDisposals.map((dispose) => dispose.mock.calls.length)).toEqual([1, 1]);
    expect(userDispose).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
    expect(() => adapter.destroy()).not.toThrow();
    expect(markerDisposals.map((dispose) => dispose.mock.calls.length)).toEqual([1, 1]);
    expect(userDispose).toHaveBeenCalledTimes(1);
  });
});
