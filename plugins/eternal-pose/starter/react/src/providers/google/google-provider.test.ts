import { describe, expect, it, vi } from "vitest";
import { candidateMapOwnerId, decodeMapPlaceOwnerId, nodeMapOwnerId, USER_LOCATION_OWNER_ID, type MapPresentation, type MapRoutePresentation, type RouteRequest, type RouteResult } from "@laugh-tale-island/core";
import type { RouteEdge } from "@laugh-tale-island/core";
import type { MapVisualProfile } from "../../controllers/presentation-contract";
import { FakeRouteAdapter } from "../fake/FakeRouteAdapter";
import {
  configureGoogleMaps,
  createGoogleMapsConfigurator,
  createGoogleMapsLoader,
  type GoogleMapsConfigInput,
  type GoogleMapsRuntime,
} from "./google-config";
import { GoogleMapAdapter } from "./GoogleMapAdapter";
import {
  GOOGLE_ROUTES_FIELD_MASK,
  GoogleRouteAdapter,
  routeRequestCacheKey,
} from "./GoogleRouteAdapter";
import {
  GOOGLE_PLACES_DETAIL_FIELD_MASK,
  GOOGLE_PLACES_SEARCH_FIELD_MASK,
  GooglePlaceAdapter,
} from "./GooglePlaceAdapter";
import { normalizeProviderLocation } from "./provider-location";

type TestFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function jsonResponse(value: unknown, options: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: vi.fn().mockResolvedValue(value),
  } as unknown as Response;
}

function parseJsonBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") {
    throw new Error("Expected a JSON string request body");
  }
  const parsed: unknown = JSON.parse(init.body);
  return parsed;
}

function routeEdge(overrides: Partial<RouteEdge> = {}): RouteEdge {
  return {
    id: "route-a-b",
    dayId: "day-one",
    fromNodeId: "a",
    toNodeId: "b",
    mode: "walking",
    source: "manual",
    certainty: "confirmed",
    navigation: { origin: "Place A", destination: "Place B" },
    ...overrides,
  };
}

const googleMapProfile: MapVisualProfile = {
  id: "google-provider-test",
  basemap: {
    mode: "neutral",
    density: "medium",
    contrast: "standard",
    poi: "minimal",
  },
  candidateTitle: (sequenceNumber, index, option) =>
    `${sequenceNumber}:${index}:${option.title}`,
  marker: (place, index) => ({
    title: `Profile title: ${place.label}`,
    className: `profile-marker profile-marker--${place.tone}`,
    label: `Profile label: ${place.label}`,
    parts: [
      { className: "profile-marker__index", text: String(index + 1) },
      { className: "profile-marker__label", text: place.label },
    ],
    fallback: {
      fill: place.tone === "selected" ? "#123456" : "#fefefe",
      stroke: "#654321",
      text: String(index + 1),
    },
  }),
  userLocation: () => ({
    title: "Profile current location",
    className: "profile-marker profile-marker--location",
    label: "Profile location label",
    parts: [{ className: "profile-marker__location-dot", text: "" }],
    fallback: { fill: "#2563eb", stroke: "#ffffff", text: "U" },
  }),
  route: () => ({ stroke: "#4b5563", opacity: 0.9, width: 4 }),
};

function googleConfigInput(
  overrides: Partial<GoogleMapsConfigInput> = {},
): GoogleMapsConfigInput {
  return {
    apiKey: "test-key",
    development: true,
    profile: googleMapProfile,
    ...overrides,
  };
}

describe("Google provider configuration", () => {
  it("does not instantiate a loader or adapter when the key is missing", async () => {
    const createLoader = vi.fn();
    const createAdapter = vi.fn();

    const state = await configureGoogleMaps(
      googleConfigInput({ apiKey: "  " }),
      { createLoader, createAdapter },
    );

    expect(state).toEqual({ status: "missing-key" });
    expect(createLoader).not.toHaveBeenCalled();
    expect(createAdapter).not.toHaveBeenCalled();
  });

  it("returns ready only after the loader resolves and then creates one adapter", async () => {
    const runtime = {} as GoogleMapsRuntime;
    const adapter = {} as GoogleMapAdapter;
    const load = vi.fn().mockResolvedValue(runtime);
    const createLoader = vi.fn(() => ({ load }));
    const createAdapter = vi.fn(() => adapter);

    const state = await configureGoogleMaps(
      googleConfigInput(),
      { createLoader, createAdapter },
    );

    expect(load).toHaveBeenCalledWith("test-key");
    expect(createAdapter).toHaveBeenCalledWith(runtime, {
      development: true,
      profile: googleMapProfile,
    });
    expect(state).toEqual({ status: "ready", adapter });
  });

  it("trims a configured map ID before passing it to google.maps.Map", async () => {
    const state = await configureGoogleMaps(
      googleConfigInput({ mapId: "  test-user-map-id  ", development: false }),
      {
        createLoader: () => ({ load: vi.fn().mockResolvedValue(fakeRuntime()) }),
      },
    );

    expect(state.status).toBe("ready");
    if (state.status !== "ready") {
      return;
    }
    await state.adapter.mount(document.createElement("div"), {
      onPlaceSelect: vi.fn(),
      onRouteSelect: vi.fn(),
    });

    expect(FakeGoogleMap.instances[0]?.options.mapId).toBe("test-user-map-id");
  });

  it("reports load-error without constructing an adapter", async () => {
    const createAdapter = vi.fn();
    const state = await configureGoogleMaps(
      googleConfigInput(),
      {
        createLoader: () => ({ load: vi.fn().mockRejectedValue(new Error("loader failed")) }),
        createAdapter,
      },
    );

    expect(state).toEqual({ status: "load-error", reason: "loader failed" });
    expect(createAdapter).not.toHaveBeenCalled();
  });

  it("shares one default-style loader and adapter for concurrent equivalent keys", async () => {
    const setLoaderOptions = vi.fn();
    const mapsLibrary = {
      Map: class FakeConfiguredMap {},
      Polyline: class FakeConfiguredPolyline {},
    } as unknown as google.maps.MapsLibrary;
    const markerLibrary = {
      AdvancedMarkerElement: class FakeConfiguredMarker {},
      Marker: class FakeConfiguredClassicMarker {},
    } as unknown as google.maps.MarkerLibrary;
    const importLoaderLibrary = vi.fn(
      (name: "maps" | "marker") =>
        Promise.resolve(name === "maps" ? mapsLibrary : markerLibrary),
    );
    const createLoader = vi.fn(() =>
      createGoogleMapsLoader({
        setOptions: setLoaderOptions,
        importLibrary: importLoaderLibrary,
      }),
    );
    const adapter = {} as GoogleMapAdapter;
    const createAdapter = vi.fn(() => adapter);
    const configure = createGoogleMapsConfigurator({
      createLoader,
      createAdapter,
    });

    const [first, concurrent] = await Promise.all([
      configure(
        googleConfigInput({ apiKey: "  shared-key  ", mapId: " test-map-id " }),
      ),
      configure(googleConfigInput({ apiKey: "shared-key", mapId: "test-map-id" })),
    ]);
    const repeated = await configure(
      googleConfigInput({ apiKey: "shared-key", mapId: "test-map-id" }),
    );
    const conflicting = await configure(
      googleConfigInput({ apiKey: "different-key", mapId: "test-map-id" }),
    );

    expect(first).toEqual({ status: "ready", adapter });
    expect(concurrent).toEqual({ status: "ready", adapter });
    expect(repeated).toEqual({ status: "ready", adapter });
    expect(conflicting).toEqual({
      status: "load-error",
      reason: "Google Maps is already configured for a different key",
    });
    expect(createLoader).toHaveBeenCalledTimes(1);
    expect(setLoaderOptions).toHaveBeenCalledTimes(1);
    expect(setLoaderOptions).toHaveBeenCalledWith({
      key: "shared-key",
      v: "weekly",
    });
    expect(importLoaderLibrary.mock.calls.map(([name]) => name)).toEqual([
      "maps",
      "marker",
    ]);
    expect(createAdapter).toHaveBeenCalledTimes(1);
    expect(createAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ Marker: markerLibrary.Marker }),
      {
        development: true,
        mapId: "test-map-id",
        profile: googleMapProfile,
      },
    );
  });

  it("rejects different map IDs and profile IDs after initialization", async () => {
    const adapter = {} as GoogleMapAdapter;
    const configure = createGoogleMapsConfigurator({
      createLoader: () => ({ load: vi.fn().mockResolvedValue({}) }),
      createAdapter: vi.fn(() => adapter),
    });

    expect(
      await configure(googleConfigInput({ mapId: " initial-map-id " })),
    ).toEqual({ status: "ready", adapter });
    expect(
      await configure(googleConfigInput({ mapId: "different-map-id" })),
    ).toEqual({
      status: "load-error",
      reason: "Google Maps is already configured for a different map ID",
    });
    expect(
      await configure(
        googleConfigInput({
          mapId: "initial-map-id",
          profile: { ...googleMapProfile, id: "different-profile" },
        }),
      ),
    ).toEqual({
      status: "load-error",
      reason: "Google Maps is already configured for a different visual profile",
    });
  });

  it("retries the same key after load error without resetting global loader options", async () => {
    const setLoaderOptions = vi.fn();
    const mapsLibrary = {
      Map: class FakeConfiguredMap {},
      Polyline: class FakeConfiguredPolyline {},
    } as unknown as google.maps.MapsLibrary;
    const markerLibrary = {
      AdvancedMarkerElement: class FakeConfiguredMarker {},
      Marker: class FakeConfiguredClassicMarker {},
    } as unknown as google.maps.MarkerLibrary;
    let mapsAttempts = 0;
    const importLoaderLibrary = vi.fn(
      (name: "maps" | "marker") => {
        if (name === "maps" && ++mapsAttempts === 1) {
          return Promise.reject(new Error("temporary loader failure"));
        }
        return Promise.resolve(name === "maps" ? mapsLibrary : markerLibrary);
      },
    );
    const createLoader = vi.fn(() =>
      createGoogleMapsLoader({
        setOptions: setLoaderOptions,
        importLibrary: importLoaderLibrary,
      }),
    );
    const adapter = {} as GoogleMapAdapter;
    const createAdapter = vi.fn(() => adapter);
    const configure = createGoogleMapsConfigurator({
      createLoader,
      createAdapter,
    });

    expect(await configure(googleConfigInput({ apiKey: "retry-key" }))).toEqual({
      status: "load-error",
      reason: "temporary loader failure",
    });
    expect(await configure(googleConfigInput({ apiKey: "other-key" }))).toEqual({
      status: "load-error",
      reason: "Google Maps is already configured for a different key",
    });
    expect(await configure(googleConfigInput({ apiKey: " retry-key " }))).toEqual({
      status: "ready",
      adapter,
    });

    expect(createLoader).toHaveBeenCalledTimes(1);
    expect(setLoaderOptions).toHaveBeenCalledTimes(1);
    expect(importLoaderLibrary.mock.calls.map(([name]) => name)).toEqual([
      "maps",
      "marker",
      "maps",
      "marker",
    ]);
    expect(createAdapter).toHaveBeenCalledTimes(1);
  });
});

describe("FakeRouteAdapter", () => {
  it("settles immediately on abort and safely ignores a late resolver rejection", async () => {
    let rejectResolver: ((reason?: unknown) => void) | undefined;
    const adapter = new FakeRouteAdapter(
      () =>
        new Promise((_resolve, reject) => {
          rejectResolver = reject;
        }),
    );
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");

    const pending = adapter.load(
      { edge: routeEdge({ id: "never-settles" }) },
      controller.signal,
    );
    controller.abort();
    const result = await Promise.race([
      pending,
      new Promise<"still-pending">((resolve) => {
        queueMicrotask(() => resolve("still-pending"));
      }),
    ]);

    expect(result).toEqual({ status: "unavailable", reason: "Request aborted" });
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    rejectResolver?.(new Error("late resolver failure"));
    await Promise.resolve();
    await Promise.resolve();
  });

  it("treats prototype names as missing unless they are own fixture keys", async () => {
    const missing = new FakeRouteAdapter({});
    for (const id of ["__proto__", "constructor", "toString"]) {
      expect(
        await missing.load(
          { edge: routeEdge({ id }) },
          new AbortController().signal,
        ),
      ).toEqual({
        status: "unavailable",
        reason: `No fake route configured for ${id}`,
      });
    }

    const fixtures = Object.create(null) as Record<string, RouteResult>;
    for (const id of ["__proto__", "constructor", "toString"]) {
      Object.defineProperty(fixtures, id, {
        configurable: true,
        enumerable: false,
        value: {
          status: "ready",
          durationMinutes: 1,
          path: [
            { lat: 25, lng: 121 },
            { lat: 25.1, lng: 121.1 },
          ],
          steps: [id],
        } satisfies RouteResult,
      });
    }
    const configured = new FakeRouteAdapter(fixtures);
    for (const id of ["__proto__", "constructor", "toString"]) {
      expect(
        await configured.load(
          { edge: routeEdge({ id }) },
          new AbortController().signal,
        ),
      ).toMatchObject({ status: "ready", steps: [id] });
    }
  });

  it("isolates recorded requests, resolver mutation, returned values, and resolver errors", async () => {
    const request: RouteRequest = {
      edge: routeEdge({ id: "mutation-safe" }),
      departureAt: "2040-01-01T09:00:00Z",
      transitPreferences: { allowedModes: ["rail"] },
    };
    const adapter = new FakeRouteAdapter((received) => {
      if (received.edge.navigation !== undefined) {
        received.edge.navigation.origin = "resolver mutation";
      }
      received.transitPreferences?.allowedModes?.push("bus");
      throw new Error("fake resolver failed");
    });

    const result = await adapter.load(request, new AbortController().signal);
    request.edge.navigation!.origin = "caller mutation";
    request.transitPreferences?.allowedModes?.push("subway");

    expect(result).toEqual({
      status: "unavailable",
      reason: "fake resolver failed",
    });
    expect(adapter.loadCalls).toEqual([
      {
        edge: routeEdge({ id: "mutation-safe" }),
        departureAt: "2040-01-01T09:00:00Z",
        transitPreferences: { allowedModes: ["rail"] },
      },
    ]);

    const expectedReady: RouteResult = {
      status: "ready",
      durationMinutes: 2,
      path: [
        { lat: 25, lng: 121 },
        { lat: 25.1, lng: 121.1 },
      ],
      steps: ["Original"],
    };
    const readyFixture: RouteResult = {
      status: "ready",
      durationMinutes: 2,
      path: [
        { lat: 25, lng: 121 },
        { lat: 25.1, lng: 121.1 },
      ],
      steps: ["Original"],
    };
    const fixtures = new FakeRouteAdapter({ stable: readyFixture });
    if (readyFixture.status === "ready") {
      readyFixture.path[0] = { lat: 9, lng: 9 };
      readyFixture.steps[0] = "source mutation";
    }
    const successController = new AbortController();
    const removeSuccessListener = vi.spyOn(
      successController.signal,
      "removeEventListener",
    );
    const first = await fixtures.load(
      { edge: routeEdge({ id: "stable" }) },
      successController.signal,
    );
    expect(first).toEqual(expectedReady);
    expect(removeSuccessListener).toHaveBeenCalledWith(
      "abort",
      expect.any(Function),
    );
    if (first.status === "ready") {
      first.path[0] = { lat: 0, lng: 0 };
      first.steps[0] = "mutated";
    }
    expect(
      await fixtures.load(
        { edge: routeEdge({ id: "stable" }) },
        new AbortController().signal,
      ),
    ).toEqual(expectedReady);
  });
});

describe("Google Routes normalization", () => {
  it("uses the minimal field mask, omits undefined fields, and caches by normalized request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        routes: [
          {
            duration: "480s",
            distanceMeters: 640,
            polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
            legs: [
              {
                steps: [
                  { navigationInstruction: { instructions: "Walk north" } },
                  { navigationInstruction: { instructions: "Turn right" } },
                ],
              },
            ],
            localizedValues: { duration: { text: "secret extra" } },
          },
        ],
      }),
    );
    const adapter = new GoogleRouteAdapter({ apiKey: "test-key", fetch: fetchMock });
    const request: RouteRequest = { edge: routeEdge() };
    const signal = new AbortController().signal;

    const first = await adapter.load(request, signal);
    const second = await adapter.load({ edge: { ...request.edge } }, signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
    expect(new Headers(init.headers).get("X-Goog-FieldMask")).toBe(
      GOOGLE_ROUTES_FIELD_MASK,
    );
    expect(new Headers(init.headers).get("X-Goog-Api-Key")).toBe("test-key");
    expect([...new Headers(init.headers).keys()].sort()).toEqual([
      "content-type",
      "x-goog-api-key",
      "x-goog-fieldmask",
    ]);
    expect(parseJsonBody(init)).toEqual({
      origin: { address: "Place A" },
      destination: { address: "Place B" },
      travelMode: "WALK",
    });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: "ready",
      durationMinutes: 8,
      distanceMeters: 640,
      steps: ["Walk north", "Turn right"],
    });
    if (first.status === "ready") {
      expect(first.path).toEqual([
        { lat: 38.5, lng: -120.2 },
        { lat: 40.7, lng: -120.95 },
        { lat: 43.252, lng: -126.453 },
      ]);
    }
  });

  it("includes recomposed endpoint identity in the deterministic cache key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        routes: [
          {
            duration: "60s",
            polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC" },
            legs: [],
          },
        ],
      }),
    );
    const adapter = new GoogleRouteAdapter({ apiKey: "test-key", fetch: fetchMock });
    const adjacent: RouteRequest = { edge: routeEdge({ id: "shared" }) };
    const recomposed: RouteRequest = {
      edge: routeEdge({
        id: "shared",
        source: "recomposed",
        fromNodeId: "a",
        toNodeId: "c",
        navigation: { origin: "Place A", destination: "Place C" },
      }),
    };

    expect(routeRequestCacheKey(adjacent)).not.toBe(routeRequestCacheKey(recomposed));
    await adapter.load(adjacent, new AbortController().signal);
    await adapter.load(recomposed, new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses semantic route fields instead of human-readable summary text for eligibility", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        routes: [
          {
            duration: "60s",
            polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC" },
            legs: [],
          },
        ],
      }),
    );
    const adapter = new GoogleRouteAdapter({ apiKey: "test-key", fetch: fetchMock });

    const unavailable = await adapter.load(
      {
        edge: routeEdge({
          source: "recomposed",
          navigation: undefined,
          summary: "A perfectly ordinary human-authored description",
        }),
      },
      new AbortController().signal,
    );
    const eligible = await adapter.load(
      {
        edge: routeEdge({
          id: "route-text-is-not-semantics",
          source: "recomposed",
          summary: "Mixed modes: this is user-authored prose",
        }),
      },
      new AbortController().signal,
    );

    expect(unavailable).toEqual({
      status: "unavailable",
      reason: "Route has no explicit provider navigation endpoints",
    });
    expect(eligible.status).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps transit opt-in and broadens at most original, no modes, then no departure", async () => {
    const fetchMock = vi
      .fn<TestFetch>()
      .mockResolvedValueOnce(jsonResponse({ routes: [] }))
      .mockResolvedValueOnce(jsonResponse({ routes: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          routes: [
            {
              duration: "1800s",
              polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC" },
              legs: [],
            },
          ],
        }),
      );
    const request: RouteRequest = {
      edge: routeEdge({ mode: "transit" }),
      departureAt: "2040-01-01T09:00:00Z",
      transitPreferences: { allowedModes: ["rail", "subway", "rail"] },
    };

    const disabled = new GoogleRouteAdapter({ apiKey: "test-key", fetch: fetchMock });
    expect(await disabled.load(request, new AbortController().signal)).toEqual({
      status: "unavailable",
      reason: "Live transit routes are not enabled",
    });
    expect(fetchMock).not.toHaveBeenCalled();

    const enabled = new GoogleRouteAdapter({
      apiKey: "test-key",
      fetch: fetchMock,
      transitEnabled: true,
    });
    expect((await enabled.load(request, new AbortController().signal)).status).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const bodies = fetchMock.mock.calls.map(([, init]) => parseJsonBody(init));
    expect(bodies).toEqual([
      {
        origin: { address: "Place A" },
        destination: { address: "Place B" },
        travelMode: "TRANSIT",
        departureTime: "2040-01-01T09:00:00Z",
        transitPreferences: { allowedTravelModes: ["SUBWAY", "TRAIN"] },
      },
      {
        origin: { address: "Place A" },
        destination: { address: "Place B" },
        travelMode: "TRANSIT",
        departureTime: "2040-01-01T09:00:00Z",
      },
      {
        origin: { address: "Place A" },
        destination: { address: "Place B" },
        travelMode: "TRANSIT",
      },
    ]);
  });

  it("ignores transit preferences in non-transit request bodies and cache identities", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        routes: [
          {
            duration: "60s",
            polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC" },
            legs: [],
          },
        ],
      }),
    );
    const adapter = new GoogleRouteAdapter({ apiKey: "test-key", fetch: fetchMock });

    for (const mode of ["walking", "driving"] as const) {
      const request: RouteRequest = {
        edge: routeEdge({ id: `${mode}-route`, mode }),
      };
      const withIrrelevantModes: RouteRequest = {
        ...request,
        transitPreferences: { allowedModes: ["bus", "rail"] },
      };
      expect(routeRequestCacheKey(withIrrelevantModes)).toBe(
        routeRequestCacheKey(request),
      );
      expect(
        (await adapter.load(request, new AbortController().signal)).status,
      ).toBe("ready");
      expect(
        (await adapter.load(withIrrelevantModes, new AbortController().signal))
          .status,
      ).toBe("ready");
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map((call) => {
      const [, init] = call as [string, RequestInit];
      return parseJsonBody(init);
    });
    expect(bodies).toEqual([
      {
        origin: { address: "Place A" },
        destination: { address: "Place B" },
        travelMode: "WALK",
      },
      {
        origin: { address: "Place A" },
        destination: { address: "Place B" },
        travelMode: "DRIVE",
      },
    ]);
  });

  it("deduplicates identical transit fallback bodies and catches errors and aborts", async () => {
    const noRouteFetch = vi.fn().mockResolvedValue(jsonResponse({ routes: [] }));
    const adapter = new GoogleRouteAdapter({
      apiKey: "test-key",
      fetch: noRouteFetch,
      transitEnabled: true,
    });
    const noRoute = await adapter.load(
      { edge: routeEdge({ mode: "transit" }) },
      new AbortController().signal,
    );
    expect(noRoute.status).toBe("unavailable");
    expect(noRouteFetch).toHaveBeenCalledTimes(1);

    const errorAdapter = new GoogleRouteAdapter({
      apiKey: "test-key",
      fetch: vi.fn().mockRejectedValue(new Error("offline")),
    });
    expect(
      await errorAdapter.load({ edge: routeEdge() }, new AbortController().signal),
    ).toEqual({ status: "unavailable", reason: "offline" });

    const controller = new AbortController();
    controller.abort();
    expect(await adapter.load({ edge: routeEdge() }, controller.signal)).toEqual({
      status: "unavailable",
      reason: "Request aborted",
    });
  });

  it("normalizes HTTP, malformed, empty, and invalid-polyline responses to unavailable", async () => {
    const cases: [string, TestFetch][] = [
      [
        "HTTP",
        vi.fn<TestFetch>().mockResolvedValue(
          jsonResponse({}, { ok: false, status: 503 }),
        ),
      ],
      [
        "malformed",
        vi.fn<TestFetch>().mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockRejectedValue(new Error("bad JSON")),
        } as unknown as Response),
      ],
      [
        "empty",
        vi.fn<TestFetch>().mockResolvedValue(jsonResponse({ routes: [] })),
      ],
      [
        "invalid polyline",
        vi.fn<TestFetch>().mockResolvedValue(
          jsonResponse({
            routes: [
              {
                duration: "60s",
                polyline: { encodedPolyline: "~" },
                legs: [],
              },
            ],
          }),
        ),
      ],
    ];

    for (const [name, fetchMock] of cases) {
      const adapter = new GoogleRouteAdapter({ apiKey: "test-key", fetch: fetchMock });
      const result = await adapter.load(
        { edge: routeEdge({ id: `route-${name}` }) },
        new AbortController().signal,
      );
      expect(result, name).toMatchObject({ status: "unavailable" });
    }
  });

  it("isolates caller abort from shared in-flight work and does not poison the cache", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const adapter = new GoogleRouteAdapter({ apiKey: "test-key", fetch: fetchMock });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const request = { edge: routeEdge({ id: "shared-in-flight" }) };

    const first = adapter.load(request, firstController.signal);
    const second = adapter.load(request, secondController.signal);
    firstController.abort();
    resolveFetch?.(
      jsonResponse({
        routes: [
          {
            duration: "60s",
            polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC" },
            legs: [],
          },
        ],
      }),
    );

    expect(await first).toEqual({ status: "unavailable", reason: "Request aborted" });
    expect((await second).status).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await adapter.load(request, new AbortController().signal)).status).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("evicts canceled route work once its final subscriber aborts", async () => {
    const fetchMock = vi
      .fn<TestFetch>()
      .mockImplementationOnce(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          routes: [
            {
              duration: "60s",
              polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC" },
              legs: [],
            },
          ],
        }),
      );
    const adapter = new GoogleRouteAdapter({ apiKey: "test-key", fetch: fetchMock });
    const controller = new AbortController();
    const request = { edge: routeEdge({ id: "replace-canceled-route" }) };

    const canceled = adapter.load(request, controller.signal);
    controller.abort();
    const replacement = adapter.load(request, new AbortController().signal);

    expect(await canceled).toEqual({ status: "unavailable", reason: "Request aborted" });
    expect((await replacement).status).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache rejected work and returns mutation-safe cached values", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValue(
        jsonResponse({
          routes: [
            {
              duration: "60s",
              polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC" },
              legs: [
                {
                  steps: [{ navigationInstruction: { instructions: "Original step" } }],
                },
              ],
            },
          ],
        }),
      );
    const adapter = new GoogleRouteAdapter({ apiKey: "test-key", fetch: fetchMock });
    const request = { edge: routeEdge({ id: "retryable" }) };

    expect((await adapter.load(request, new AbortController().signal)).status).toBe(
      "unavailable",
    );
    const recovered = await adapter.load(request, new AbortController().signal);
    expect(recovered.status).toBe("ready");
    if (recovered.status === "ready") {
      recovered.path[0] = { lat: 0, lng: 0 };
      recovered.steps[0] = "mutated";
    }

    const cached = await adapter.load(request, new AbortController().signal);
    expect(cached).toMatchObject({ status: "ready", steps: ["Original step"] });
    if (cached.status === "ready") {
      expect(cached.path[0]).toEqual({ lat: 38.5, lng: -120.2 });
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("Google Places normalization", () => {
  it("requests only detail fields and drops blank IDs, invalid coordinates, and extra facts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "   ",
        displayName: { text: "Test Museum", languageCode: "en" },
        location: { latitude: Number.POSITIVE_INFINITY, longitude: 181 },
        rating: 4.9,
        regularOpeningHours: { openNow: true },
        websiteUri: "https://example.com/not-requested",
      }),
    );
    const adapter = new GooglePlaceAdapter({ apiKey: "test-key", fetch: fetchMock });

    const result = await adapter.resolve(
      { query: "ignored fallback", providerPlaceId: "place/id" },
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places/place%2Fid");
    expect(new Headers(init.headers).get("X-Goog-FieldMask")).toBe(
      GOOGLE_PLACES_DETAIL_FIELD_MASK,
    );
    expect(new Headers(init.headers).get("X-Goog-Api-Key")).toBe("test-key");
    expect([...new Headers(init.headers).keys()].sort()).toEqual([
      "x-goog-api-key",
      "x-goog-fieldmask",
    ]);
    expect(result).toEqual({
      status: "ready",
      place: {
        name: "Test Museum",
        provider: { name: "google" },
        certainty: "unverified",
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/rating|OpeningHours|websiteUri|languageCode/);
  });

  it("uses a minimal text-search body and deduplicates normalized cache keys", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        places: [
          {
            id: "place-cafe",
            displayName: { text: "Test Cafe" },
            location: { latitude: 25.04, longitude: 121.52 },
            nationalPhoneNumber: "not requested",
          },
        ],
      }),
    );
    const adapter = new GooglePlaceAdapter({ apiKey: "test-key", fetch: fetchMock });

    const first = await adapter.resolve({ query: "  Test Cafe  " }, new AbortController().signal);
    const second = await adapter.resolve({ query: "Test Cafe" }, new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(new Headers(init.headers).get("X-Goog-FieldMask")).toBe(
      GOOGLE_PLACES_SEARCH_FIELD_MASK,
    );
    expect(new Headers(init.headers).get("X-Goog-Api-Key")).toBe("test-key");
    expect([...new Headers(init.headers).keys()].sort()).toEqual([
      "content-type",
      "x-goog-api-key",
      "x-goog-fieldmask",
    ]);
    expect(parseJsonBody(init)).toEqual({ textQuery: "Test Cafe" });
    expect(first).toEqual(second);
    expect(first).toEqual({
      status: "ready",
      place: {
        name: "Test Cafe",
        coordinates: { lat: 25.04, lng: 121.52 },
        provider: { name: "google", placeId: "place-cafe" },
        certainty: "unverified",
      },
    });
  });

  it("treats a blank Place ID as absent and rejects blank requests without fetching", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ places: [{ id: "place-a", displayName: { text: "A" } }] }),
    );
    const adapter = new GooglePlaceAdapter({ apiKey: "test-key", fetch: fetchMock });

    await adapter.resolve(
      { query: "A", providerPlaceId: "   " },
      new AbortController().signal,
    );
    const unavailable = await adapter.resolve(
      { query: "   ", providerPlaceId: "   " },
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("places:searchText");
    expect(unavailable).toEqual({
      status: "unavailable",
      reason: "Place request is blank",
    });
  });

  it("ignores a response that resolves after its caller was aborted", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const adapter = new GooglePlaceAdapter({ apiKey: "test-key", fetch: fetchMock });
    const controller = new AbortController();

    const pending = adapter.resolve({ query: "Late place" }, controller.signal);
    controller.abort();
    resolveFetch?.(
      jsonResponse({
        places: [{ id: "late", displayName: { text: "Late place" } }],
      }),
    );

    expect(await pending).toEqual({ status: "unavailable", reason: "Request aborted" });
  });

  it("normalizes HTTP, malformed, and empty responses to unavailable", async () => {
    const cases: [string, TestFetch][] = [
      [
        "HTTP",
        vi.fn<TestFetch>().mockResolvedValue(
          jsonResponse({}, { ok: false, status: 429 }),
        ),
      ],
      [
        "malformed",
        vi.fn<TestFetch>().mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockRejectedValue(new Error("bad JSON")),
        } as unknown as Response),
      ],
      [
        "empty",
        vi.fn<TestFetch>().mockResolvedValue(jsonResponse({ places: [] })),
      ],
      [
        "blank name",
        vi.fn<TestFetch>().mockResolvedValue(
          jsonResponse({ places: [{ id: "blank", displayName: { text: "   " } }] }),
        ),
      ],
    ];

    for (const [name, fetchMock] of cases) {
      const adapter = new GooglePlaceAdapter({ apiKey: "test-key", fetch: fetchMock });
      const result = await adapter.resolve(
        { query: `Place ${name}` },
        new AbortController().signal,
      );
      expect(result, name).toMatchObject({ status: "unavailable" });
    }
  });

  it("isolates caller abort from shared in-flight resolution", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const adapter = new GooglePlaceAdapter({ apiKey: "test-key", fetch: fetchMock });
    const firstController = new AbortController();
    const request = { query: "Shared place" };

    const first = adapter.resolve(request, firstController.signal);
    const second = adapter.resolve(request, new AbortController().signal);
    firstController.abort();
    resolveFetch?.(
      jsonResponse({
        places: [
          {
            id: "shared",
            displayName: { text: "Shared place" },
            location: { latitude: 25, longitude: 121 },
          },
        ],
      }),
    );

    expect(await first).toEqual({ status: "unavailable", reason: "Request aborted" });
    expect((await second).status).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("evicts canceled place work once its final subscriber aborts", async () => {
    const fetchMock = vi
      .fn<TestFetch>()
      .mockImplementationOnce(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          places: [{ id: "fresh", displayName: { text: "Fresh place" } }],
        }),
      );
    const adapter = new GooglePlaceAdapter({ apiKey: "test-key", fetch: fetchMock });
    const controller = new AbortController();
    const request = { query: "Replace canceled place" };

    const canceled = adapter.resolve(request, controller.signal);
    controller.abort();
    const replacement = adapter.resolve(request, new AbortController().signal);

    expect(await canceled).toEqual({ status: "unavailable", reason: "Request aborted" });
    expect((await replacement).status).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries rejected work and returns mutation-safe cached places", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValue(
        jsonResponse({
          places: [
            {
              id: "stable",
              displayName: { text: "Stable place" },
              location: { latitude: 25, longitude: 121 },
            },
          ],
        }),
      );
    const adapter = new GooglePlaceAdapter({ apiKey: "test-key", fetch: fetchMock });
    const request = { query: "Stable place" };

    expect((await adapter.resolve(request, new AbortController().signal)).status).toBe(
      "unavailable",
    );
    const recovered = await adapter.resolve(request, new AbortController().signal);
    expect(recovered.status).toBe("ready");
    if (recovered.status === "ready" && recovered.place.coordinates !== undefined) {
      recovered.place.coordinates.lat = 0;
      recovered.place.name = "mutated";
    }

    expect(await adapter.resolve(request, new AbortController().signal)).toEqual({
      status: "ready",
      place: {
        name: "Stable place",
        coordinates: { lat: 25, lng: 121 },
        provider: { name: "google", placeId: "stable" },
        certainty: "unverified",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("provider location normalization", () => {
  it("accepts both provider and neutral names and rejects non-finite or out-of-range values", () => {
    expect(normalizeProviderLocation({ latitude: 25, longitude: 121 })).toEqual({
      lat: 25,
      lng: 121,
    });
    expect(normalizeProviderLocation({ lat: -90, lng: 180 })).toEqual({
      lat: -90,
      lng: 180,
    });
    expect(normalizeProviderLocation({ latitude: Number.NaN, longitude: 121 })).toBeUndefined();
    expect(normalizeProviderLocation({ lat: 91, lng: 0 })).toBeUndefined();
  });
});

class FakeListener {
  removed = false;

  constructor(private readonly callback: () => void) {}

  remove(): void {
    this.removed = true;
  }

  emit(): void {
    if (!this.removed) {
      this.callback();
    }
  }
}

class FakeGoogleMap {
  static instances: FakeGoogleMap[] = [];
  static readonly DEMO_MAP_ID = "DEMO_MAP_ID";
  panTo = vi.fn();
  fitBounds = vi.fn();
  unbindAll = vi.fn();

  constructor(
    public readonly element: HTMLElement,
    public readonly options: google.maps.MapOptions,
  ) {
    FakeGoogleMap.instances.push(this);
  }
}

class FakeAdvancedMarker {
  static instances: FakeAdvancedMarker[] = [];
  map: google.maps.Map | null | undefined;
  readonly position: google.maps.marker.AdvancedMarkerElementOptions["position"];
  readonly title: google.maps.marker.AdvancedMarkerElementOptions["title"];
  readonly content: google.maps.marker.AdvancedMarkerElementOptions["content"];
  readonly gmpClickable: google.maps.marker.AdvancedMarkerElementOptions["gmpClickable"];
  readonly addedEventNames: string[] = [];
  readonly removedEventNames: string[] = [];
  private readonly eventListeners = new Map<
    string,
    Set<EventListenerOrEventListenerObject>
  >();

  constructor(options: google.maps.marker.AdvancedMarkerElementOptions) {
    this.map = options.map;
    this.position = options.position;
    this.title = options.title;
    this.content = options.content;
    this.gmpClickable = options.gmpClickable;
    FakeAdvancedMarker.instances.push(this);
  }

  addEventListener(
    eventName: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    this.addedEventNames.push(eventName);
    const listeners = this.eventListeners.get(eventName) ?? new Set();
    listeners.add(listener);
    this.eventListeners.set(eventName, listeners);
  }

  removeEventListener(
    eventName: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    this.removedEventNames.push(eventName);
    this.eventListeners.get(eventName)?.delete(listener);
  }

  emitGmpClick(source: "pointer" | "keyboard"): void {
    const event = new CustomEvent("gmp-click", { detail: { source } });
    for (const listener of this.eventListeners.get("gmp-click") ?? []) {
      if (typeof listener === "function") {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    }
  }
}

class FakeClassicMarker {
  static instances: FakeClassicMarker[] = [];
  map:
    | google.maps.Map
    | google.maps.StreetViewPanorama
    | null
    | undefined;
  readonly position: google.maps.MarkerOptions["position"];
  readonly title: google.maps.MarkerOptions["title"];
  readonly label: google.maps.MarkerOptions["label"];
  readonly icon: google.maps.MarkerOptions["icon"];
  readonly listeners: FakeListener[] = [];
  readonly setMap = vi.fn(
    (map: google.maps.Map | google.maps.StreetViewPanorama | null) => {
      this.map = map;
    },
  );

  constructor(options: google.maps.MarkerOptions) {
    this.map = options.map;
    this.position = options.position;
    this.title = options.title;
    this.label = options.label;
    this.icon = options.icon;
    FakeClassicMarker.instances.push(this);
  }

  addListener(_eventName: string, callback: () => void): FakeListener {
    const listener = new FakeListener(callback);
    this.listeners.push(listener);
    return listener;
  }
}

class FakePolyline {
  static instances: FakePolyline[] = [];
  readonly path: google.maps.PolylineOptions["path"];
  readonly options: google.maps.PolylineOptions;
  map: google.maps.Map | null | undefined;
  readonly listeners: FakeListener[] = [];
  readonly setMap = vi.fn((map: google.maps.Map | null) => {
    this.map = map;
  });

  constructor(options: google.maps.PolylineOptions) {
    this.options = options;
    this.path = options.path;
    this.map = options.map;
    FakePolyline.instances.push(this);
  }

  addListener(_eventName: string, callback: () => void): FakeListener {
    const listener = new FakeListener(callback);
    this.listeners.push(listener);
    return listener;
  }
}

function fakeRuntime(): GoogleMapsRuntime {
  FakeGoogleMap.instances = [];
  FakeAdvancedMarker.instances = [];
  FakeClassicMarker.instances = [];
  FakePolyline.instances = [];
  return {
    Map: FakeGoogleMap as unknown as typeof google.maps.Map,
    Marker: FakeClassicMarker as unknown as typeof google.maps.Marker,
    AdvancedMarkerElement:
      FakeAdvancedMarker as unknown as typeof google.maps.marker.AdvancedMarkerElement,
    Polyline: FakePolyline as unknown as typeof google.maps.Polyline,
  };
}

function createGoogleMapAdapter(
  options: {
    development?: boolean;
    mapId?: string;
    profile?: MapVisualProfile;
  } = {},
): GoogleMapAdapter {
  return new GoogleMapAdapter(fakeRuntime(), {
    development: options.development ?? true,
    profile: options.profile ?? googleMapProfile,
    ...(options.mapId === undefined ? {} : { mapId: options.mapId }),
  });
}

describe("GoogleMapAdapter lifecycle", () => {
  const presentation: MapPresentation = {
    places: [
      {
        ownerId: nodeMapOwnerId("museum"),
        label: "Museum",
        coordinates: { lat: 25, lng: 121 },
        tone: "default",
      },
      {
        ownerId: candidateMapOwnerId("candidate"),
        label: "Cafe",
        coordinates: { lat: 25.01, lng: 121.01 },
        tone: "candidate",
      },
      {
        ownerId: nodeMapOwnerId("selected"),
        label: "Park",
        coordinates: { lat: 25.02, lng: 121.02 },
        tone: "selected",
      },
      {
        ownerId: nodeMapOwnerId("completed"),
        label: "Hotel",
        coordinates: { lat: 25.03, lng: 121.03 },
        tone: "completed",
      },
    ],
    routes: [
      {
        edgeId: "ready-route",
        path: [
          { lat: 25, lng: 121 },
          { lat: 25.01, lng: 121.01 },
        ],
        tone: "default",
        source: "manual",
        certainty: "confirmed",
        mode: "walking",
      },
      {
        edgeId: "failed-route",
        path: [],
        tone: "unavailable",
        source: "provider",
        certainty: "unverified",
        mode: "transit",
      },
    ],
  };

  it("creates accessible markers, draws no failed-route fallback, and emits active events", async () => {
    const adapter = createGoogleMapAdapter();
    const onPlaceSelect = vi.fn();
    const onRouteSelect = vi.fn();
    await adapter.mount(document.createElement("div"), { onPlaceSelect, onRouteSelect });

    adapter.render(presentation);

    expect(FakeGoogleMap.instances[0]?.options.mapId).toBe(
      FakeGoogleMap.DEMO_MAP_ID,
    );

    expect(FakeAdvancedMarker.instances.map(({ title }) => title)).toEqual([
      "Profile title: Museum",
      "Profile title: Cafe",
      "Profile title: Park",
      "Profile title: Hotel",
    ]);
    expect(
      FakeAdvancedMarker.instances.map(({ content }) =>
        content instanceof HTMLElement ? content.getAttribute("aria-label") : null,
      ),
    ).toEqual([
      "Profile label: Museum",
      "Profile label: Cafe",
      "Profile label: Park",
      "Profile label: Hotel",
    ]);
    expect(
      FakeAdvancedMarker.instances.map(({ content }) =>
        content instanceof HTMLElement ? content.getAttribute("aria-hidden") : null,
      ),
    ).toEqual(["true", "true", "true", "true"]);
    expect(
      FakeAdvancedMarker.instances.map(({ addedEventNames }) => addedEventNames),
    ).toEqual([["gmp-click"], ["gmp-click"], ["gmp-click"], ["gmp-click"]]);
    expect(
      FakeAdvancedMarker.instances.map(({ gmpClickable }) => gmpClickable),
    ).toEqual([true, true, true, true]);
    expect(
      FakeAdvancedMarker.instances.map(({ content }) =>
        content instanceof HTMLElement ? content.tagName : null,
      ),
    ).toEqual(["SPAN", "SPAN", "SPAN", "SPAN"]);
    expect(
      FakeAdvancedMarker.instances.map(({ content }) =>
        content instanceof HTMLElement ? content.className : null,
      ),
    ).toEqual([
      "profile-marker profile-marker--default",
      "profile-marker profile-marker--candidate",
      "profile-marker profile-marker--selected",
      "profile-marker profile-marker--completed",
    ]);
    expect(
      FakeAdvancedMarker.instances[0]?.content instanceof HTMLElement
        ? [...FakeAdvancedMarker.instances[0].content.children].map((part) => ({
            className: part.className,
            text: part.textContent,
          }))
        : [],
    ).toEqual([
      { className: "profile-marker__index", text: "1" },
      { className: "profile-marker__label", text: "Museum" },
    ]);
    expect(FakePolyline.instances).toHaveLength(1);

    FakeAdvancedMarker.instances[0]?.emitGmpClick("pointer");
    FakeAdvancedMarker.instances[0]?.emitGmpClick("keyboard");
    FakePolyline.instances[0]?.listeners[0]?.emit();
    expect(onPlaceSelect).toHaveBeenNthCalledWith(1, nodeMapOwnerId("museum"));
    expect(onPlaceSelect).toHaveBeenNthCalledWith(2, nodeMapOwnerId("museum"));
    expect(onRouteSelect).toHaveBeenCalledWith("ready-route");

    const marker = FakeAdvancedMarker.instances[0];
    adapter.destroy();
    marker?.emitGmpClick("pointer");
    marker?.emitGmpClick("keyboard");
    expect(onPlaceSelect).toHaveBeenCalledTimes(2);
    expect(marker?.removedEventNames).toEqual(["gmp-click"]);
  });

  it("uses a neutral production map and classic marker fallbacks without a map ID", async () => {
    const adapter = createGoogleMapAdapter({ development: false });
    const onPlaceSelect = vi.fn();
    await adapter.mount(document.createElement("div"), {
      onPlaceSelect,
      onRouteSelect: vi.fn(),
    });

    adapter.render(presentation);

    expect(FakeGoogleMap.instances[0]?.options.mapId).toBeUndefined();
    expect(FakeAdvancedMarker.instances).toHaveLength(0);
    expect(FakeClassicMarker.instances).toHaveLength(4);
    expect(FakeClassicMarker.instances[0]).toMatchObject({
      title: "Profile title: Museum",
      label: "1",
    });
    const classicIcon = FakeClassicMarker.instances[0]?.icon;
    expect(typeof classicIcon).toBe("string");
    if (typeof classicIcon !== "string") {
      throw new Error("Expected the profile fallback to create an SVG icon");
    }
    expect(decodeURIComponent(classicIcon)).toContain('fill="#fefefe"');
    expect(decodeURIComponent(classicIcon)).toContain('stroke="#654321"');

    FakeClassicMarker.instances[0]?.listeners[0]?.emit();
    expect(onPlaceSelect).toHaveBeenCalledWith(nodeMapOwnerId("museum"));

    adapter.setUserLocation({ lat: 24.9, lng: 120.9 });
    expect(FakeClassicMarker.instances.at(-1)).toMatchObject({
      title: "Profile current location",
      label: "U",
    });
  });

  it("resolves selected, default, recomposed, and uncertain route effects through the profile", async () => {
    const receivedRoutes: MapRoutePresentation[] = [];
    const profile: MapVisualProfile = {
      ...googleMapProfile,
      id: "semantic-route-profile",
      route: (route) => {
        receivedRoutes.push(route);
        if (route.tone === "selected") {
          return {
            stroke: "#222222",
            opacity: 0.95,
            width: 6,
            casing: { stroke: "#ffffff", opacity: 0.65, width: 9 },
          };
        }
        if (route.source === "recomposed") {
          return {
            stroke: "#333333",
            opacity: 0.75,
            width: 4,
            dash: [4, 3],
          };
        }
        if (route.certainty !== "confirmed") {
          return { stroke: "#444444", opacity: 0.35, width: 3 };
        }
        return { stroke: "#111111", opacity: 0.55, width: 2 };
      },
    };
    const adapter = createGoogleMapAdapter({ profile });
    await adapter.mount(document.createElement("div"), {
      onPlaceSelect: vi.fn(),
      onRouteSelect: vi.fn(),
    });
    const routes: MapRoutePresentation[] = [
      {
        edgeId: "default-route",
        path: [
          { lat: 25, lng: 121 },
          { lat: 25.01, lng: 121.01 },
        ],
        tone: "default",
        source: "manual",
        certainty: "confirmed",
        mode: "walking",
      },
      {
        edgeId: "selected-route",
        path: [
          { lat: 25.02, lng: 121.02 },
          { lat: 25.03, lng: 121.03 },
        ],
        tone: "selected",
        source: "provider",
        certainty: "confirmed",
        mode: "driving",
      },
      {
        edgeId: "recomposed-route",
        path: [
          { lat: 25.04, lng: 121.04 },
          { lat: 25.05, lng: 121.05 },
        ],
        tone: "default",
        source: "recomposed",
        certainty: "suggested",
        mode: "transit",
      },
      {
        edgeId: "uncertain-route",
        path: [
          { lat: 25.06, lng: 121.06 },
          { lat: 25.07, lng: 121.07 },
        ],
        tone: "default",
        source: "provider",
        certainty: "unverified",
        mode: "flight",
      },
    ];

    adapter.render({ places: [], routes });

    expect(receivedRoutes).toEqual(routes);
    expect(FakePolyline.instances).toHaveLength(5);
    expect(FakePolyline.instances.map(({ options }) => ({
      stroke: options.strokeColor,
      opacity: options.strokeOpacity,
      width: options.strokeWeight,
      clickable: options.clickable,
    }))).toEqual([
      { stroke: "#111111", opacity: 0.55, width: 2, clickable: true },
      { stroke: "#ffffff", opacity: 0.65, width: 9, clickable: false },
      { stroke: "#222222", opacity: 0.95, width: 6, clickable: true },
      { stroke: "#333333", opacity: 0, width: 4, clickable: true },
      { stroke: "#444444", opacity: 0.35, width: 3, clickable: true },
    ]);
    const dashIcons = FakePolyline.instances[3]?.options.icons;
    expect(dashIcons).toHaveLength(1);
    expect(dashIcons?.[0]?.icon).toMatchObject({
      path: "M 0,0 0,4",
      strokeOpacity: 0.75,
    });
    expect(dashIcons?.[0]?.offset).toBe("0");
    expect(dashIcons?.[0]?.repeat).toBe("7px");
  });

  it("drops unsupported dash and casing effects without hiding the route", async () => {
    const adapter = createGoogleMapAdapter({
      profile: {
        ...googleMapProfile,
        id: "unsupported-effect-profile",
        route: () => ({
          stroke: "#abcdef",
          opacity: 0.6,
          width: 5,
          casing: { stroke: "#ffffff", opacity: 0.4, width: 5 },
          dash: [0, 0],
        }),
      },
    });
    await adapter.mount(document.createElement("div"), {
      onPlaceSelect: vi.fn(),
      onRouteSelect: vi.fn(),
    });

    adapter.render({ places: [], routes: [presentation.routes[0]] });

    expect(FakePolyline.instances).toHaveLength(1);
    expect(FakePolyline.instances[0]?.options).toMatchObject({
      strokeColor: "#abcdef",
      strokeOpacity: 0.6,
      strokeWeight: 5,
      clickable: true,
    });
    expect(FakePolyline.instances[0]?.options.icons).toBeUndefined();
  });

  it("queues the latest render before mount is ready and supports focus, fit, and padding", async () => {
    const adapter = createGoogleMapAdapter();
    const pending = adapter.mount(document.createElement("div"), {
      onPlaceSelect: vi.fn(),
      onRouteSelect: vi.fn(),
    });
    adapter.render(presentation);
    adapter.setPadding({ top: 10, right: 20, bottom: 30, left: 40 });

    await pending;
    adapter.focus({ kind: "place", id: nodeMapOwnerId("museum") });
    expect(FakeGoogleMap.instances[0]?.panTo).toHaveBeenCalledWith({ lat: 25, lng: 121 });

    adapter.focus({ kind: "route", id: "ready-route" });
    adapter.fit([nodeMapOwnerId("museum"), "ready-route"]);
    expect(FakeGoogleMap.instances[0]?.fitBounds).toHaveBeenCalledWith(
      { north: 25.01, south: 25, east: 121.01, west: 121 },
      { top: 10, right: 20, bottom: 30, left: 40 },
    );
    expect(FakeAdvancedMarker.instances).toHaveLength(4);
    expect(FakePolyline.instances).toHaveLength(1);
  });

  it("updates user location without camera chasing and exposes an explicit recenter target", async () => {
    const adapter = createGoogleMapAdapter();
    await adapter.mount(document.createElement("div"), {
      onPlaceSelect: vi.fn(),
      onRouteSelect: vi.fn(),
    });
    const map = FakeGoogleMap.instances[0];

    adapter.setUserLocation({ lat: 24.9, lng: 120.9 });
    expect(map?.panTo).not.toHaveBeenCalled();
    adapter.focus({ kind: "place", id: USER_LOCATION_OWNER_ID });
    expect(map?.panTo).toHaveBeenLastCalledWith({ lat: 24.9, lng: 120.9 });

    adapter.setUserLocation({ lat: 24.8, lng: 120.8 });
    adapter.render(presentation);
    expect(map?.panTo).toHaveBeenCalledTimes(1);
    adapter.focus({ kind: "place", id: USER_LOCATION_OWNER_ID });
    expect(map?.panTo).toHaveBeenLastCalledWith({ lat: 24.8, lng: 120.8 });
    expect(FakeAdvancedMarker.instances.at(-1)?.content).toBeInstanceOf(HTMLSpanElement);
  });

  it("cleans markers, polylines, listeners, user location, and ignores stale generations", async () => {
    const adapter = createGoogleMapAdapter();
    const onPlaceSelect = vi.fn();
    await adapter.mount(document.createElement("div"), {
      onPlaceSelect,
      onRouteSelect: vi.fn(),
    });
    adapter.render(presentation);
    adapter.setUserLocation({ lat: 24.9, lng: 120.9 });
    const itineraryMarkers = FakeAdvancedMarker.instances.slice(0, -1);
    const firstUserMarker = FakeAdvancedMarker.instances.at(-1);
    const oldPolylines = [...FakePolyline.instances];

    adapter.render({ places: [], routes: [] });
    itineraryMarkers[0]?.emitGmpClick("pointer");
    itineraryMarkers[0]?.emitGmpClick("keyboard");

    expect(itineraryMarkers.every(({ map }) => map === null)).toBe(true);
    expect(
      itineraryMarkers.every(({ removedEventNames }) =>
        removedEventNames.includes("gmp-click"),
      ),
    ).toBe(true);
    expect(oldPolylines.every(({ setMap }) => setMap.mock.calls.at(-1)?.[0] === null)).toBe(true);
    expect(onPlaceSelect).not.toHaveBeenCalled();
    expect(firstUserMarker?.map).not.toBeNull();

    adapter.setUserLocation({ lat: 24.8, lng: 120.8 });
    const replacementUserMarker = FakeAdvancedMarker.instances.at(-1);
    expect(firstUserMarker?.map).toBeNull();
    expect(replacementUserMarker?.title).toBe("Profile current location");
    adapter.setUserLocation(null);
    expect(replacementUserMarker?.map).toBeNull();

    adapter.destroy();
    expect(FakeGoogleMap.instances[0]?.unbindAll).toHaveBeenCalledTimes(1);
  });

  it("keeps place, route, and reserved user-location focus namespaces distinct", async () => {
    const adapter = createGoogleMapAdapter();
    const onPlaceSelect = vi.fn();
    await adapter.mount(document.createElement("div"), {
      onPlaceSelect,
      onRouteSelect: vi.fn(),
    });
    const rawNodeId = USER_LOCATION_OWNER_ID;
    const nodeOwner = nodeMapOwnerId(rawNodeId);
    const collidingRouteId = nodeOwner;
    adapter.render({
      places: [
        {
          ownerId: nodeOwner,
          label: "Reserved-looking node",
          coordinates: { lat: 25.1, lng: 121.1 },
          tone: "default",
        },
      ],
      routes: [
        {
          edgeId: collidingRouteId,
          path: [
            { lat: 25.2, lng: 121.2 },
            { lat: 25.3, lng: 121.3 },
          ],
          tone: "default",
          source: "manual",
          certainty: "confirmed",
          mode: "walking",
        },
      ],
    });
    adapter.setUserLocation({ lat: 24.9, lng: 120.9 });
    const map = FakeGoogleMap.instances[0];

    adapter.focus({ kind: "place", id: nodeOwner });
    expect(map?.panTo).toHaveBeenLastCalledWith({ lat: 25.1, lng: 121.1 });
    adapter.focus({ kind: "route", id: collidingRouteId });
    expect(map?.fitBounds).toHaveBeenLastCalledWith(
      { north: 25.3, south: 25.2, east: 121.3, west: 121.2 },
      { top: 0, right: 0, bottom: 0, left: 0 },
    );
    adapter.fit([collidingRouteId]);
    expect(map?.fitBounds).toHaveBeenLastCalledWith(
      { north: 25.3, south: 25.1, east: 121.3, west: 121.1 },
      { top: 0, right: 0, bottom: 0, left: 0 },
    );
    adapter.focus({ kind: "place", id: USER_LOCATION_OWNER_ID });
    expect(map?.panTo).toHaveBeenLastCalledWith({ lat: 24.9, lng: 120.9 });

    FakeAdvancedMarker.instances[0]?.emitGmpClick("keyboard");
    const emittedOwner: unknown = onPlaceSelect.mock.calls[0]?.[0];
    expect(typeof emittedOwner).toBe("string");
    expect(
      decodeMapPlaceOwnerId(typeof emittedOwner === "string" ? emittedOwner : ""),
    ).toEqual({
      kind: "node",
      id: rawNodeId,
    });
  });

  it("rejects a whole route path when any intermediate coordinate is invalid", async () => {
    const adapter = createGoogleMapAdapter();
    const onRouteSelect = vi.fn();
    await adapter.mount(document.createElement("div"), {
      onPlaceSelect: vi.fn(),
      onRouteSelect,
    });
    adapter.render({
      places: [],
      routes: [
        {
          edgeId: "invalid-middle",
          path: [
            { lat: 25, lng: 121 },
            { lat: Number.NaN, lng: 121.1 },
            { lat: 25.2, lng: 121.2 },
          ],
          tone: "default",
          source: "provider",
          certainty: "suggested",
          mode: "walking",
        },
      ],
    });

    adapter.focus({ kind: "route", id: "invalid-middle" });
    expect(FakePolyline.instances).toHaveLength(0);
    expect(FakeGoogleMap.instances[0]?.fitBounds).not.toHaveBeenCalled();
    expect(FakeGoogleMap.instances[0]?.panTo).not.toHaveBeenCalled();
    expect(onRouteSelect).not.toHaveBeenCalled();
  });

  it("does not finish a mount after destroy invalidates its generation", async () => {
    const adapter = createGoogleMapAdapter();
    const pending = adapter.mount(document.createElement("div"), {
      onPlaceSelect: vi.fn(),
      onRouteSelect: vi.fn(),
    });

    adapter.destroy();
    await pending;

    expect(FakeGoogleMap.instances).toHaveLength(0);
  });

  it("permits an explicit remount after destroy without retaining the old lifecycle", async () => {
    const adapter = createGoogleMapAdapter();
    const element = document.createElement("div");
    await adapter.mount(element, {
      onPlaceSelect: vi.fn(),
      onRouteSelect: vi.fn(),
    });
    adapter.destroy();

    await adapter.mount(element, {
      onPlaceSelect: vi.fn(),
      onRouteSelect: vi.fn(),
    });
    adapter.render(presentation);

    expect(FakeGoogleMap.instances).toHaveLength(2);
    expect(FakeAdvancedMarker.instances).toHaveLength(4);
  });
});
