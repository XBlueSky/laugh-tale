import type { RouteRequestV2 } from "@laugh-tale-island/core";
import { describe, expect, it } from "vitest";
import {
  GoogleRouteAdapter,
  GOOGLE_ROUTES_FIELD_MASK,
  routeRequestCacheKey,
  type GoogleRouteAdapterOptions,
} from "../src/google/GoogleRouteAdapter.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as Response;
}

function rejectedJsonResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => {
      throw new Error("invalid JSON");
    },
  } as unknown as Response;
}

function inputUrl(value: string | URL | Request | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (value instanceof URL) return value.href;
  return value?.url;
}

function parsedBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") throw new Error("expected a string request body");
  return JSON.parse(init.body) as unknown;
}

function request(overrides: Partial<RouteRequestV2> = {}): RouteRequestV2 {
  return {
    edge: {
      id: "a-b",
      dayId: "day",
      fromNodeId: "a",
      toNodeId: "b",
      mode: "walking",
      source: "manual",
      certainty: "confirmed",
    },
    origin: {
      ownerId: "a",
      label: "Origin label",
      identity: {
        status: "resolved",
        providerReference: { provider: "google", id: "origin/id" },
      },
    },
    destination: {
      ownerId: "b",
      label: "Destination label",
      identity: {
        status: "resolved",
        coordinates: { lat: 25, lng: 121 },
      },
    },
    ...overrides,
  };
}

function transitRequest(): RouteRequestV2 {
  return request({
    edge: { ...request().edge, mode: "transit" },
    departureAt: "2040-01-01T09:00:00Z",
    transitPreferences: { allowedModes: ["bus", "subway", "rail", "bus"] },
  });
}

function afterEventLoopTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function inherited(prototype: object): Record<string, never> {
  const value: Record<string, never> = {};
  Object.setPrototypeOf(value, prototype);
  return value;
}

describe("GoogleRouteAdapter", () => {
  it.each([-1, "500", Number.NaN, Infinity, null, undefined])("rejects malformed supplied distance %s before normalization can erase it", async (distanceMeters) => {
    const adapter = new GoogleRouteAdapter({ apiKey: "key", fetch: async () => jsonResponse({ routes: [{ duration: "120s", distanceMeters }] }) });
    expect(await adapter.load(request(), new AbortController().signal)).toMatchObject({
      status: "unavailable", reason: "malformed-response", retryable: false,
    });
  });

  it("posts the exact Google route endpoint, headers, and provider-coordinate body", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const fetcher: FetchLike = async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({ routes: [{ duration: "120s" }] });
    };

    const result = await new GoogleRouteAdapter({ apiKey: " key ", fetch: fetcher }).load(
      request(),
      new AbortController().signal,
    );

    expect(result).toEqual({ status: "ready", durationMinutes: 2, steps: [] });
    expect(calls).toHaveLength(1);
    expect(inputUrl(calls[0]?.input)).toBe(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
    );
    expect(calls[0]?.init?.method).toBe("POST");
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Goog-Api-Key")).toBe("key");
    expect(headers.get("X-Goog-FieldMask")).toBe(GOOGLE_ROUTES_FIELD_MASK);
    expect(parsedBody(calls[0]?.init)).toEqual({
      origin: { placeId: "origin/id" },
      destination: {
        location: { latLng: { latitude: 25, longitude: 121 } },
      },
      travelMode: "WALK",
    });
  });

  it("uses exact neutral coordinates and never sends endpoint labels for geocoding", async () => {
    let body: unknown;
    const fetcher: FetchLike = async (_input, init) => {
      body = parsedBody(init);
      return jsonResponse({ routes: [{ duration: "60s" }] });
    };
    const coordinateRoute = request({
      origin: {
        ownerId: "a",
        label: "Do not geocode this",
        identity: { status: "resolved", coordinates: { lat: -33.5, lng: 151.25 } },
      },
    });

    await new GoogleRouteAdapter({ apiKey: "key", fetch: fetcher }).load(
      coordinateRoute,
      new AbortController().signal,
    );

    expect(body).toEqual({
      origin: {
        location: { latLng: { latitude: -33.5, longitude: 151.25 } },
      },
      destination: {
        location: { latLng: { latitude: 25, longitude: 121 } },
      },
      travelMode: "WALK",
    });
    expect(JSON.stringify(body)).not.toContain("Do not geocode this");
  });

  it("canonicalizes dense transit modes in SUBWAY, TRAIN, BUS order", () => {
    const canonical = transitRequest();
    const reordered = {
      ...canonical,
      transitPreferences: { allowedModes: ["rail", "bus", "subway"] as const },
    };

    expect(routeRequestCacheKey(canonical)).toBe(routeRequestCacheKey(reordered));
    expect(routeRequestCacheKey(canonical)).toContain(
      '"transit":["SUBWAY","TRAIN","BUS"]',
    );
  });

  it("treats sparse, malformed, null-prototype, and shadowed mode arrays as empty", () => {
    const emptyKey = routeRequestCacheKey({
      ...transitRequest(),
      transitPreferences: { allowedModes: [] },
    });
    const sparse = new Array(2) as Array<"bus">;
    sparse[1] = "bus";
    const shadowed: unknown[] = ["bus"];
    Object.defineProperty(shadowed, "every", { value: null, configurable: true });
    Object.defineProperty(shadowed, "filter", { value: null, configurable: true });
    const nullPrototype = Object.setPrototypeOf(["bus"], null) as readonly "bus"[];
    const malformedValues: unknown[] = [
      sparse,
      shadowed,
      nullPrototype,
      ["bus", null],
      {},
      null,
      "bus",
    ];

    for (const allowedModes of malformedValues) {
      const candidate = {
        ...transitRequest(),
        transitPreferences: { allowedModes },
      } as unknown as RouteRequestV2;
      expect(() => routeRequestCacheKey(candidate)).not.toThrow();
      expect(routeRequestCacheKey(candidate)).toBe(emptyKey);
    }
  });

  it("settles revoked nested transit modes as malformed without fetching or unhandled rejection", async () => {
    const revoked = Proxy.revocable([], {});
    revoked.revoke();
    let fetches = 0;
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown): void => {
      unhandled.push(error);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const adapter = new GoogleRouteAdapter({
        apiKey: "key",
        transitEnabled: true,
        fetch: async () => {
          fetches += 1;
          return jsonResponse({ routes: [{ duration: "60s" }] });
        },
      });
      const pending = adapter.load(
        {
          ...transitRequest(),
          transitPreferences: { allowedModes: revoked.proxy },
        } as unknown as RouteRequestV2,
        new AbortController().signal,
      );
      const outcome = await Promise.race([
        pending,
        afterEventLoopTurn().then(() => "still-pending" as const),
      ]);

      expect(outcome).toMatchObject({
        status: "unavailable",
        reason: "malformed-response",
        retryable: false,
      });
      expect(fetches).toBe(0);
      await afterEventLoopTurn();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("returns a deterministic cache key for null, primitive, cyclic, and exotic values", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const hostile: unknown[] = [
      null,
      undefined,
      42,
      "route",
      true,
      1n,
      Symbol("route"),
      () => undefined,
      cyclic,
      revoked.proxy,
      Object.create(null),
      { edge: { id: 1n }, origin: null, destination: null },
    ];

    for (const value of hostile) {
      expect(() => routeRequestCacheKey(value as RouteRequestV2)).not.toThrow();
      expect(typeof routeRequestCacheKey(value as RouteRequestV2)).toBe("string");
      expect(routeRequestCacheKey(value as RouteRequestV2)).toBe(
        routeRequestCacheKey(value as RouteRequestV2),
      );
    }
  });

  it("returns typed failures without fetching for malformed requests and options", async () => {
    let fetches = 0;
    const fetcher: FetchLike = async () => {
      fetches += 1;
      return jsonResponse({ routes: [] });
    };
    const malformedOptions: unknown[] = [null, undefined, 3, "key", {}, { apiKey: 1 }];

    for (const options of malformedOptions) {
      const adapter = new GoogleRouteAdapter(options as GoogleRouteAdapterOptions);
      const result = await adapter.load(
        null as unknown as RouteRequestV2,
        new AbortController().signal,
      );
      expect(result).toMatchObject({ status: "unavailable" });
    }
    const adapter = new GoogleRouteAdapter({ apiKey: "key", fetch: fetcher });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    for (const malformed of [null, undefined, 1, "request", {}, { edge: null }, revoked.proxy]) {
      await expect(
        adapter.load(malformed as unknown as RouteRequestV2, new AbortController().signal),
      ).resolves.toMatchObject({ reason: "unsupported", retryable: false });
    }
    expect(fetches).toBe(0);
  });

  it("does not replace an explicitly malformed fetch option with the global fetch", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "fetch");
    let globalFetches = 0;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: () => {
        globalFetches += 1;
        return Promise.resolve(jsonResponse({ routes: [] }));
      },
    });
    try {
      const adapter = new GoogleRouteAdapter({
        apiKey: "key",
        fetch: null,
      } as unknown as GoogleRouteAdapterOptions);
      await expect(adapter.load(request(), new AbortController().signal)).resolves.toMatchObject({
        reason: "missing-configuration",
      });
      expect(globalFetches).toBe(0);
    } finally {
      if (original) Object.defineProperty(globalThis, "fetch", original);
      else Reflect.deleteProperty(globalThis, "fetch");
    }
  });

  it("returns cancelled for missing, malformed, or already-aborted signals", async () => {
    let fetches = 0;
    const fetcher: FetchLike = async () => {
      fetches += 1;
      return jsonResponse({ routes: [] });
    };
    const adapter = new GoogleRouteAdapter({ apiKey: "key", fetch: fetcher });
    const aborted = new AbortController();
    aborted.abort();

    for (const signal of [null, {}, aborted.signal]) {
      await expect(adapter.load(request(), signal as AbortSignal)).resolves.toMatchObject({
        reason: "cancelled",
        retryable: false,
      });
    }
    expect(fetches).toBe(0);
  });

  it("returns cancelled for structural signals with throwing state or listener methods", async () => {
    let fetches = 0;
    const adapter = new GoogleRouteAdapter({
      apiKey: "key",
      fetch: async () => {
        fetches += 1;
        return jsonResponse({ routes: [{ duration: "60s" }] });
      },
    });
    const signals = [
      Object.defineProperty({}, "aborted", {
        get: () => {
          throw new Error("aborted getter");
        },
      }),
      {
        aborted: false,
        addEventListener: () => {
          throw new Error("add listener");
        },
        removeEventListener: () => undefined,
      },
      {
        aborted: false,
        addEventListener: () => undefined,
        removeEventListener: () => {
          throw new Error("remove listener");
        },
      },
    ];

    for (const signal of signals) {
      await expect(
        Promise.resolve().then(() => adapter.load(request(), signal as AbortSignal)),
      ).resolves.toMatchObject({ reason: "cancelled", retryable: false });
    }
    expect(fetches).toBe(0);
  });

  it("rejects foreign-only, label-only, invalid-coordinate, unknown, flight, and disabled transit routes", async () => {
    let fetches = 0;
    const fetcher: FetchLike = async () => {
      fetches += 1;
      return jsonResponse({ routes: [] });
    };
    const adapter = new GoogleRouteAdapter({ apiKey: "key", fetch: fetcher });
    const foreign = request({
      origin: {
        ownerId: "a",
        label: "Never geocode",
        identity: {
          status: "resolved",
          providerReference: { provider: "other", id: "x" },
        },
      },
    });
    const labelOnly = request({
      origin: {
        ownerId: "a",
        label: "Never geocode",
        identity: { status: "resolved" },
      },
    } as unknown as Partial<RouteRequestV2>);
    const invalidCoordinates = request({
      origin: {
        ownerId: "a",
        label: "Never geocode",
        identity: { status: "resolved", coordinates: { lat: 91, lng: 0 } },
      },
    });
    const invalidModes = ["unknown", "flight"];

    for (const candidate of [foreign, labelOnly, invalidCoordinates]) {
      await expect(adapter.load(candidate, new AbortController().signal)).resolves.toMatchObject({
        reason: "unsupported",
      });
    }
    for (const mode of invalidModes) {
      const candidate = request({ edge: { ...request().edge, mode } as RouteRequestV2["edge"] });
      await expect(adapter.load(candidate, new AbortController().signal)).resolves.toMatchObject({
        reason: "unsupported",
      });
    }
    await expect(
      adapter.load(transitRequest(), new AbortController().signal),
    ).resolves.toMatchObject({ reason: "unsupported" });
    expect(fetches).toBe(0);
  });

  it("accepts only own paired neutral route coordinates and rejects provider-shaped or inherited coordinates", async () => {
    const bodies: unknown[] = [];
    const adapter = new GoogleRouteAdapter({
      apiKey: "key",
      fetch: async (_input, init) => {
        bodies.push(parsedBody(init));
        return jsonResponse({ routes: [{ duration: "60s" }] });
      },
    });
    const invalidCoordinates: unknown[] = [
      { latitude: 25, longitude: 121 },
      { lat: 25, lng: 121, latitude: 25, longitude: 121 },
      inherited({ lat: 25, lng: 121 }),
      { lat: 25 },
      { lng: 121 },
    ];

    for (const coordinates of invalidCoordinates) {
      await expect(
        adapter.load(
          request({
            origin: {
              ownerId: "a",
              label: "Origin",
              identity: { status: "resolved", coordinates } as RouteRequestV2["origin"]["identity"],
            },
          }),
          new AbortController().signal,
        ),
      ).resolves.toMatchObject({ reason: "unsupported", retryable: false });
    }

    await expect(
      adapter.load(
        request({
          origin: {
            ownerId: "a",
            label: "Origin",
            identity: { status: "resolved", coordinates: { lat: 25, lng: 121 } },
          },
        }),
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ status: "ready" });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      origin: { location: { latLng: { latitude: 25, longitude: 121 } } },
    });
  });

  it("rejects prototype-backed route request, edge, identity, reference, and coordinate fields", async () => {
    let fetches = 0;
    const adapter = new GoogleRouteAdapter({
      apiKey: "key",
      fetch: async () => {
        fetches += 1;
        return jsonResponse({ routes: [{ duration: "60s" }] });
      },
    });
    const valid = request();
    const inheritedRequest = inherited(valid) as unknown as RouteRequestV2;
    const inheritedEdge = request({
      edge: inherited(valid.edge) as unknown as RouteRequestV2["edge"],
    });
    const inheritedIdentity = request({
      origin: {
        ...valid.origin,
        identity: inherited(valid.origin.identity) as unknown as RouteRequestV2["origin"]["identity"],
      },
    });
    const inheritedReference = request({
      origin: {
        ...valid.origin,
        identity: {
          status: "resolved",
          providerReference: inherited(
            valid.origin.identity.providerReference!,
          ) as unknown as NonNullable<RouteRequestV2["origin"]["identity"]["providerReference"]>,
        },
      },
    });
    const inheritedCoordinates = request({
      origin: {
        ...valid.origin,
        identity: {
          status: "resolved",
          coordinates: inherited({ lat: 25, lng: 121 }) as unknown as { lat: number; lng: number },
        },
      },
    });

    for (const candidate of [
      inheritedRequest,
      inheritedEdge,
      inheritedIdentity,
      inheritedReference,
      inheritedCoordinates,
    ]) {
      await expect(
        adapter.load(candidate, new AbortController().signal),
      ).resolves.toMatchObject({ reason: "unsupported", retryable: false });
    }
    expect(fetches).toBe(0);
  });

  it("requires own ownerId, label, and identity fields on both route endpoints", async () => {
    let fetches = 0;
    const adapter = new GoogleRouteAdapter({
      apiKey: "key",
      fetch: async () => {
        fetches += 1;
        return jsonResponse({ routes: [{ duration: "60s" }] });
      },
    });

    for (const endpointName of ["origin", "destination"] as const) {
      for (const field of ["ownerId", "label", "identity"] as const) {
        const canonical = request()[endpointName];
        const endpoint = { ...canonical } as Record<string, unknown>;
        const inheritedValue = endpoint[field];
        Reflect.deleteProperty(endpoint, field);
        Object.setPrototypeOf(endpoint, { [field]: inheritedValue });
        const candidate = request({ [endpointName]: endpoint } as Partial<RouteRequestV2>);

        const outcome = await Promise.race([
          adapter.load(candidate, new AbortController().signal),
          afterEventLoopTurn().then(() => "still-pending" as const),
        ]);
        expect(outcome).toMatchObject({
          status: "unavailable",
          reason: "unsupported",
          retryable: false,
        });
      }
    }
    expect(fetches).toBe(0);
  });

  it("settles failed required endpoint reads without fetching, rejection, or hanging", async () => {
    let fetches = 0;
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown): void => {
      unhandled.push(error);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const adapter = new GoogleRouteAdapter({
        apiKey: "key",
        fetch: async () => {
          fetches += 1;
          return jsonResponse({ routes: [{ duration: "60s" }] });
        },
      });

      for (const endpointName of ["origin", "destination"] as const) {
        for (const field of ["ownerId", "label", "identity"] as const) {
          const endpoint = { ...request()[endpointName] } as Record<string, unknown>;
          Object.defineProperty(endpoint, field, {
            enumerable: true,
            get: () => {
              throw new Error(`${endpointName}.${field} getter failed`);
            },
          });
          const candidate = request({ [endpointName]: endpoint } as Partial<RouteRequestV2>);

          const outcome = await Promise.race([
            Promise.resolve().then(() =>
              adapter.load(candidate, new AbortController().signal),
            ),
            afterEventLoopTurn().then(() => "still-pending" as const),
          ]);
          expect(outcome).toMatchObject({
            status: "unavailable",
            reason: "unsupported",
            retryable: false,
          });
        }
      }
      expect(fetches).toBe(0);
      await afterEventLoopTurn();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("uses the canonical transit fallback sequence original, no modes, no departure", async () => {
    const bodies: unknown[] = [];
    const fetcher: FetchLike = async (_input, init) => {
      bodies.push(parsedBody(init));
      return bodies.length < 3
        ? jsonResponse({ routes: [] })
        : jsonResponse({ routes: [{ duration: "60s" }] });
    };
    const result = await new GoogleRouteAdapter({
      apiKey: "key",
      fetch: fetcher,
      transitEnabled: true,
    }).load(transitRequest(), new AbortController().signal);

    expect(result).toMatchObject({ status: "ready" });
    expect(bodies).toEqual([
      {
        origin: { placeId: "origin/id" },
        destination: {
          location: { latLng: { latitude: 25, longitude: 121 } },
        },
        travelMode: "TRANSIT",
        departureTime: "2040-01-01T09:00:00Z",
        transitPreferences: { allowedTravelModes: ["SUBWAY", "TRAIN", "BUS"] },
      },
      {
        origin: { placeId: "origin/id" },
        destination: {
          location: { latLng: { latitude: 25, longitude: 121 } },
        },
        travelMode: "TRANSIT",
        departureTime: "2040-01-01T09:00:00Z",
      },
      {
        origin: { placeId: "origin/id" },
        destination: {
          location: { latLng: { latitude: 25, longitude: 121 } },
        },
        travelMode: "TRANSIT",
      },
    ]);
  });

  it("normalizes duration, distance, optional geometry, steps, and unique transit lines in route order", async () => {
    const payload = {
      routes: [
        {
          duration: "121.2s",
          distanceMeters: 1234,
          polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC" },
          legs: [
            {
              steps: [
                {
                  navigationInstruction: { instructions: " Board " },
                  transitDetails: { transitLine: { name: " Blue ", shortName: " B " } },
                },
                { transitDetails: { transitLine: { name: "Blue", shortName: "B" } } },
                { transitDetails: { transitLine: { shortName: "R" } } },
              ],
            },
          ],
        },
      ],
    };
    const fetcher: FetchLike = async () => jsonResponse(payload);

    const result = await new GoogleRouteAdapter({ apiKey: "key", fetch: fetcher }).load(
      request(),
      new AbortController().signal,
    );

    expect(result).toEqual({
      status: "ready",
      durationMinutes: 3,
      distanceMeters: 1234,
      steps: ["Board"],
      geometry: [
        { lat: 38.5, lng: -120.2 },
        { lat: 40.7, lng: -120.95 },
      ],
      transit: {
        lines: [
          { name: "Blue", shortName: "B" },
          { shortName: "R" },
        ],
      },
    });
  });

  it("returns ready without geometry only when the provider omits polyline", async () => {
    await expect(
      new GoogleRouteAdapter({
        apiKey: "key",
        fetch: async () => jsonResponse({ routes: [{ duration: "60s" }] }),
      }).load(request(), new AbortController().signal),
    ).resolves.toEqual({ status: "ready", durationMinutes: 1, steps: [] });
  });

  it("maps every supplied malformed polyline to a nonretryable malformed response", async () => {
    for (const polyline of [
      null,
      3,
      {},
      { encodedPolyline: null },
      { encodedPolyline: "" },
      { encodedPolyline: " " },
      { encodedPolyline: "bad" },
      { encodedPolyline: "_p~iF" },
    ]) {
      await expect(
        new GoogleRouteAdapter({
          apiKey: "key",
          fetch: async () => jsonResponse({ routes: [{ duration: "60s", polyline }] }),
        }).load(request(), new AbortController().signal),
      ).resolves.toMatchObject({
        reason: "malformed-response",
        retryable: false,
      });
    }
  });

  it("maps every route HTTP status class", async () => {
    const cases = [
      [400, "request-denied", false],
      [401, "request-denied", false],
      [403, "request-denied", false],
      [404, "not-found", false],
      [429, "network", true],
      [500, "network", true],
    ] as const;

    for (const [status, reason, retryable] of cases) {
      const fetcher: FetchLike = async () => jsonResponse({}, status);
      await expect(
        new GoogleRouteAdapter({ apiKey: "key", fetch: fetcher }).load(
          request(),
          new AbortController().signal,
        ),
      ).resolves.toMatchObject({ reason, retryable, diagnostic: `HTTP ${status}` });
    }
  });

  it("maps transport, JSON, empty, and malformed route responses", async () => {
    const transport: FetchLike = async () => {
      throw new Error("offline");
    };
    const malformedPayloads = [null, {}, { routes: null }, { routes: [null] }, { routes: [{}] }];

    await expect(
      new GoogleRouteAdapter({ apiKey: "key", fetch: transport }).load(
        request(),
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ reason: "network", retryable: true });
    await expect(
      new GoogleRouteAdapter({ apiKey: "key", fetch: async () => rejectedJsonResponse() }).load(
        request(),
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ reason: "malformed-response", retryable: false });
    await expect(
      new GoogleRouteAdapter({
        apiKey: "key",
        fetch: async () => jsonResponse({ routes: [] }),
      }).load(request(), new AbortController().signal),
    ).resolves.toMatchObject({ reason: "not-found", retryable: false });
    for (const payload of malformedPayloads) {
      const result = await new GoogleRouteAdapter({
        apiKey: "key",
        fetch: async () => jsonResponse(payload),
      }).load(request(), new AbortController().signal);
      expect(result.status).toBe("unavailable");
    }
  });

  it("maps revoked route, leg, and step arrays to nonretryable malformed responses", async () => {
    const revokedRoutes = Proxy.revocable([], {});
    const revokedLegs = Proxy.revocable([], {});
    const revokedSteps = Proxy.revocable([], {});
    revokedRoutes.revoke();
    revokedLegs.revoke();
    revokedSteps.revoke();
    const payloads = [
      { routes: revokedRoutes.proxy },
      { routes: [{ duration: "60s", legs: revokedLegs.proxy }] },
      { routes: [{ duration: "60s", legs: [{ steps: revokedSteps.proxy }] }] },
    ];

    for (const payload of payloads) {
      await expect(
        new GoogleRouteAdapter({
          apiKey: "key",
          fetch: async () => jsonResponse(payload),
        }).load(request(), new AbortController().signal),
      ).resolves.toMatchObject({
        reason: "malformed-response",
        retryable: false,
      });
    }
  });

  it("shares one fetch while preserving per-caller cancellation", async () => {
    const responseGate = deferred<Response>();
    let fetches = 0;
    let upstream: AbortSignal | undefined;
    const fetcher: FetchLike = async (_input, init) => {
      fetches += 1;
      const signal = init?.signal;
      upstream = signal ?? undefined;
      return responseGate.promise;
    };
    const adapter = new GoogleRouteAdapter({ apiKey: "key", fetch: fetcher });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = adapter.load(request(), firstController.signal);
    const second = adapter.load(request(), secondController.signal);

    expect(fetches).toBe(1);
    firstController.abort();
    expect(upstream?.aborted).toBe(false);
    responseGate.resolve(jsonResponse({ routes: [{ duration: "60s" }] }));

    await expect(first).resolves.toMatchObject({ reason: "cancelled" });
    await expect(second).resolves.toMatchObject({ status: "ready" });
    expect(fetches).toBe(1);
  });

  it("evicts after final cancellation and isolates an old late ready result from its replacement", async () => {
    const fetchGates = [deferred<Response>(), deferred<Response>()];
    const upstreamSignals: AbortSignal[] = [];
    let fetches = 0;
    const fetcher: FetchLike = async (_input, init) => {
      const index = fetches;
      fetches += 1;
      const signal = init?.signal;
      if (signal) upstreamSignals.push(signal);
      return fetchGates[index]!.promise;
    };
    const adapter = new GoogleRouteAdapter({
      apiKey: "key",
      fetch: fetcher,
      transitEnabled: true,
    });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = adapter.load(transitRequest(), firstController.signal);
    const second = adapter.load(transitRequest(), secondController.signal);

    firstController.abort();
    expect(upstreamSignals[0]?.aborted).toBe(false);
    secondController.abort();
    expect(upstreamSignals[0]?.aborted).toBe(true);
    const replacement = adapter.load(transitRequest(), new AbortController().signal);
    expect(fetches).toBe(2);

    fetchGates[0]!.resolve(jsonResponse({ routes: [{ duration: "600s" }] }));
    await afterEventLoopTurn();
    expect(fetches).toBe(2);
    fetchGates[1]!.resolve(jsonResponse({ routes: [{ duration: "60s" }] }));

    await expect(first).resolves.toMatchObject({ reason: "cancelled" });
    await expect(second).resolves.toMatchObject({ reason: "cancelled" });
    await expect(replacement).resolves.toMatchObject({ status: "ready", durationMinutes: 1 });
    const cached = await adapter.load(transitRequest(), new AbortController().signal);
    expect(cached).toMatchObject({ status: "ready", durationMinutes: 1 });
    expect(fetches).toBe(2);
  });

  it("does not let an old late no-route result run a fallback or delete the cached replacement", async () => {
    const fetchGates = [deferred<Response>(), deferred<Response>()];
    let fetches = 0;
    const fetcher: FetchLike = async () => {
      const index = fetches;
      fetches += 1;
      return fetchGates[index]!.promise;
    };
    const adapter = new GoogleRouteAdapter({
      apiKey: "key",
      fetch: fetcher,
      transitEnabled: true,
    });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = adapter.load(transitRequest(), firstController.signal);
    const second = adapter.load(transitRequest(), secondController.signal);
    firstController.abort();
    secondController.abort();
    const replacement = adapter.load(transitRequest(), new AbortController().signal);

    fetchGates[1]!.resolve(jsonResponse({ routes: [{ duration: "60s" }] }));
    await expect(replacement).resolves.toMatchObject({ status: "ready", durationMinutes: 1 });
    fetchGates[0]!.resolve(jsonResponse({ routes: [] }));
    await afterEventLoopTurn();

    expect(fetches).toBe(2);
    await expect(first).resolves.toMatchObject({ reason: "cancelled" });
    await expect(second).resolves.toMatchObject({ reason: "cancelled" });
    await expect(
      adapter.load(transitRequest(), new AbortController().signal),
    ).resolves.toMatchObject({ status: "ready", durationMinutes: 1 });
    expect(fetches).toBe(2);
  });

  it("deep-clones cached ready values and evicts failures", async () => {
    let fetches = 0;
    const fetcher: FetchLike = async () => {
      fetches += 1;
      if (fetches === 1) throw new Error("offline");
      return jsonResponse({
        routes: [
          {
            duration: "60s",
            polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC" },
            legs: [{ steps: [{ transitDetails: { transitLine: { name: "Blue" } } }] }],
          },
        ],
      });
    };
    const adapter = new GoogleRouteAdapter({ apiKey: "key", fetch: fetcher });

    await expect(adapter.load(request(), new AbortController().signal)).resolves.toMatchObject({
      reason: "network",
    });
    const ready = await adapter.load(request(), new AbortController().signal);
    expect(ready.status).toBe("ready");
    if (ready.status === "ready") {
      (ready.geometry as { lat: number; lng: number }[])[0]!.lat = 0;
      (ready.transit?.lines as { name?: string }[])[0]!.name = "Changed";
    }
    const cached = await adapter.load(request(), new AbortController().signal);

    expect(cached).toMatchObject({
      status: "ready",
      geometry: [{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }],
      transit: { lines: [{ name: "Blue" }] },
    });
    expect(fetches).toBe(2);
  });
});
