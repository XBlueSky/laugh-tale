import { describe, expect, it, vi } from "vitest";
import {
  USER_LOCATION_OWNER_ID,
  type MapPresentation,
  type RouteRequest,
} from "../../experience-shell/provider-contracts";
import type { RouteEdge } from "../../trip-core/model";
import {
  configureGoogleMaps,
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

describe("Google provider configuration", () => {
  it("does not instantiate a loader or adapter when the key is missing", async () => {
    const createLoader = vi.fn();
    const createAdapter = vi.fn();

    const state = await configureGoogleMaps(
      { apiKey: "  " },
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
      { apiKey: "test-key" },
      { createLoader, createAdapter },
    );

    expect(load).toHaveBeenCalledWith("test-key");
    expect(createAdapter).toHaveBeenCalledWith(runtime);
    expect(state).toEqual({ status: "ready", adapter });
  });

  it("reports load-error without constructing an adapter", async () => {
    const createAdapter = vi.fn();
    const state = await configureGoogleMaps(
      { apiKey: "test-key" },
      {
        createLoader: () => ({ load: vi.fn().mockRejectedValue(new Error("loader failed")) }),
        createAdapter,
      },
    );

    expect(state).toEqual({ status: "load-error", reason: "loader failed" });
    expect(createAdapter).not.toHaveBeenCalled();
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
  readonly listeners: FakeListener[] = [];
  readonly eventNames: string[] = [];

  constructor(options: google.maps.marker.AdvancedMarkerElementOptions) {
    this.map = options.map;
    this.position = options.position;
    this.title = options.title;
    this.content = options.content;
    this.gmpClickable = options.gmpClickable;
    FakeAdvancedMarker.instances.push(this);
  }

  addListener(eventName: string, callback: () => void): FakeListener {
    const listener = new FakeListener(callback);
    this.eventNames.push(eventName);
    this.listeners.push(listener);
    return listener;
  }
}

class FakePolyline {
  static instances: FakePolyline[] = [];
  readonly path: google.maps.PolylineOptions["path"];
  map: google.maps.Map | null | undefined;
  readonly listeners: FakeListener[] = [];
  readonly setMap = vi.fn((map: google.maps.Map | null) => {
    this.map = map;
  });

  constructor(options: google.maps.PolylineOptions) {
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
  FakePolyline.instances = [];
  return {
    Map: FakeGoogleMap as unknown as typeof google.maps.Map,
    AdvancedMarkerElement:
      FakeAdvancedMarker as unknown as typeof google.maps.marker.AdvancedMarkerElement,
    Polyline: FakePolyline as unknown as typeof google.maps.Polyline,
  };
}

describe("GoogleMapAdapter lifecycle", () => {
  const presentation: MapPresentation = {
    places: [
      {
        ownerId: "museum",
        label: "Museum",
        coordinates: { lat: 25, lng: 121 },
        tone: "default",
      },
      {
        ownerId: "candidate",
        label: "Cafe",
        coordinates: { lat: 25.01, lng: 121.01 },
        tone: "candidate",
      },
      {
        ownerId: "selected",
        label: "Park",
        coordinates: { lat: 25.02, lng: 121.02 },
        tone: "selected",
      },
      {
        ownerId: "completed",
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
      },
      { edgeId: "failed-route", path: [], tone: "unavailable" },
    ],
  };

  it("creates accessible markers, draws no failed-route fallback, and emits active events", async () => {
    const adapter = new GoogleMapAdapter(fakeRuntime());
    const onPlaceSelect = vi.fn();
    const onRouteSelect = vi.fn();
    await adapter.mount(document.createElement("div"), { onPlaceSelect, onRouteSelect });

    adapter.render(presentation);

    expect(FakeAdvancedMarker.instances.map(({ title }) => title)).toEqual([
      "Museum",
      "Candidate: Cafe",
      "Selected: Park",
      "Completed: Hotel",
    ]);
    expect(
      FakeAdvancedMarker.instances.map(({ content }) =>
        content instanceof HTMLElement ? content.getAttribute("aria-label") : null,
      ),
    ).toEqual([null, null, null, null]);
    expect(
      FakeAdvancedMarker.instances.map(({ content }) =>
        content instanceof HTMLElement ? content.getAttribute("aria-hidden") : null,
      ),
    ).toEqual(["true", "true", "true", "true"]);
    expect(
      FakeAdvancedMarker.instances.map(({ eventNames }) => eventNames),
    ).toEqual([["gmp-click"], ["gmp-click"], ["gmp-click"], ["gmp-click"]]);
    expect(
      FakeAdvancedMarker.instances.map(({ gmpClickable }) => gmpClickable),
    ).toEqual([true, true, true, true]);
    expect(
      FakeAdvancedMarker.instances.map(({ content }) =>
        content instanceof HTMLElement ? content.tagName : null,
      ),
    ).toEqual(["SPAN", "SPAN", "SPAN", "SPAN"]);
    expect(FakePolyline.instances).toHaveLength(1);

    FakeAdvancedMarker.instances[0]?.listeners[0]?.emit();
    FakePolyline.instances[0]?.listeners[0]?.emit();
    expect(onPlaceSelect).toHaveBeenCalledWith("museum");
    expect(onRouteSelect).toHaveBeenCalledWith("ready-route");
  });

  it("queues the latest render before mount is ready and supports focus, fit, and padding", async () => {
    const adapter = new GoogleMapAdapter(fakeRuntime());
    const pending = adapter.mount(document.createElement("div"), {
      onPlaceSelect: vi.fn(),
      onRouteSelect: vi.fn(),
    });
    adapter.render(presentation);
    adapter.setPadding({ top: 10, right: 20, bottom: 30, left: 40 });

    await pending;
    adapter.focus({ kind: "place", id: "museum" });
    expect(FakeGoogleMap.instances[0]?.panTo).toHaveBeenCalledWith({ lat: 25, lng: 121 });

    adapter.focus({ kind: "route", id: "ready-route" });
    adapter.fit(["museum", "ready-route"]);
    expect(FakeGoogleMap.instances[0]?.fitBounds).toHaveBeenCalledWith(
      { north: 25.01, south: 25, east: 121.01, west: 121 },
      { top: 10, right: 20, bottom: 30, left: 40 },
    );
    expect(FakeAdvancedMarker.instances).toHaveLength(4);
    expect(FakePolyline.instances).toHaveLength(1);
  });

  it("updates user location without camera chasing and exposes an explicit recenter target", async () => {
    const adapter = new GoogleMapAdapter(fakeRuntime());
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
    const adapter = new GoogleMapAdapter(fakeRuntime());
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
    itineraryMarkers[0]?.listeners[0]?.emit();

    expect(itineraryMarkers.every(({ map }) => map === null)).toBe(true);
    expect(
      itineraryMarkers.every(({ listeners }) => listeners.every(({ removed }) => removed)),
    ).toBe(true);
    expect(oldPolylines.every(({ setMap }) => setMap.mock.calls.at(-1)?.[0] === null)).toBe(true);
    expect(onPlaceSelect).not.toHaveBeenCalled();
    expect(firstUserMarker?.map).not.toBeNull();

    adapter.setUserLocation({ lat: 24.8, lng: 120.8 });
    const replacementUserMarker = FakeAdvancedMarker.instances.at(-1);
    expect(firstUserMarker?.map).toBeNull();
    expect(replacementUserMarker?.title).toBe("Your location");
    adapter.setUserLocation(null);
    expect(replacementUserMarker?.map).toBeNull();

    adapter.destroy();
    expect(FakeGoogleMap.instances[0]?.unbindAll).toHaveBeenCalledTimes(1);
  });

  it("does not finish a mount after destroy invalidates its generation", async () => {
    const adapter = new GoogleMapAdapter(fakeRuntime());
    const pending = adapter.mount(document.createElement("div"), {
      onPlaceSelect: vi.fn(),
      onRouteSelect: vi.fn(),
    });

    adapter.destroy();
    await pending;

    expect(FakeGoogleMap.instances).toHaveLength(0);
  });

  it("permits an explicit remount after destroy without retaining the old lifecycle", async () => {
    const adapter = new GoogleMapAdapter(fakeRuntime());
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
