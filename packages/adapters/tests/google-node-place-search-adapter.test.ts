import type { PlaceSearchQuery } from "@laugh-tale-island/core/enrichment";
import { describe, expect, it, vi } from "vitest";
import {
  GooglePlaceSearchAdapter,
  GOOGLE_PLACES_SEARCH_FIELD_MASK,
  type GooglePlaceSearchAdapterOptions,
} from "../src/google/node/GooglePlaceSearchAdapter.js";

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
  } as Response;
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

const query: PlaceSearchQuery = {
  ownerId: "owner",
  text: "Museum & café",
  locale: "en-US",
  regionCode: "JP",
  locationBias: { center: { lat: 35.5, lng: 139.75 }, radiusMeters: 1250 },
  maxCandidates: 3,
};

function afterEventLoopTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function inherited(prototype: object): Record<string, never> {
  const value: Record<string, never> = {};
  Object.setPrototypeOf(value, prototype);
  return value;
}

describe("GooglePlaceSearchAdapter", () => {
  it("posts the exact endpoint, headers, and normalized body", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const fetcher: FetchLike = async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({ places: [{ id: "id", displayName: { text: "Museum" } }] });
    };

    await new GooglePlaceSearchAdapter({ apiKey: " server-key ", fetch: fetcher }).search(
      query,
      new AbortController().signal,
    );

    expect(calls).toHaveLength(1);
    expect(inputUrl(calls[0]?.input)).toBe(
      "https://places.googleapis.com/v1/places:searchText",
    );
    expect(calls[0]?.init?.method).toBe("POST");
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Goog-Api-Key")).toBe("server-key");
    expect(headers.get("X-Goog-FieldMask")).toBe(GOOGLE_PLACES_SEARCH_FIELD_MASK);
    expect(parsedBody(calls[0]?.init)).toEqual({
      textQuery: "Museum & café",
      languageCode: "en-US",
      regionCode: "JP",
      pageSize: 3,
      locationBias: {
        circle: {
          center: { latitude: 35.5, longitude: 139.75 },
          radius: 1250,
        },
      },
    });
  });

  it("retains provider order, limits to three, and never auto-accepts a candidate", async () => {
    const places = Array.from({ length: 4 }, (_, index) => ({
      id: `id-${index}`,
      displayName: { text: `Name ${index}` },
    }));
    const result = await new GooglePlaceSearchAdapter({
      apiKey: "key",
      fetch: async () => jsonResponse({ places }),
    }).search(query, new AbortController().signal);

    expect(result).toEqual({
      status: "ready",
      candidates: [0, 1, 2].map((index) => ({
        providerReference: { provider: "google", id: `id-${index}` },
        displayName: `Name ${index}`,
        categories: [],
      })),
    });
    expect(result).not.toHaveProperty("acceptedCandidate");
  });

  it("normalizes candidate coordinates, address, and nonblank categories", async () => {
    const result = await new GooglePlaceSearchAdapter({
      apiKey: "key",
      fetch: async () =>
        jsonResponse({
          places: [
            {
              id: " id ",
              displayName: { text: " Museum " },
              formattedAddress: " Address ",
              location: { latitude: 25, longitude: 121 },
              types: ["museum", " ", 3, "tourist_attraction"],
            },
          ],
        }),
    }).search(query, new AbortController().signal);

    expect(result).toEqual({
      status: "ready",
      candidates: [
        {
          providerReference: { provider: "google", id: "id" },
          displayName: "Museum",
          formattedAddress: "Address",
          coordinates: { lat: 25, lng: 121 },
          categories: ["museum", "tourist_attraction"],
        },
      ],
    });
  });

  it("returns typed failures without fetching for invalid options, key, signal, or query shapes", async () => {
    let fetches = 0;
    const fetcher: FetchLike = async () => {
      fetches += 1;
      return jsonResponse({ places: [] });
    };
    const invalidOptions: unknown[] = [null, undefined, 1, {}, { apiKey: 1 }, { apiKey: "key" }];
    for (const options of invalidOptions) {
      const adapter = new GooglePlaceSearchAdapter(options as GooglePlaceSearchAdapterOptions);
      await expect(adapter.search(query, new AbortController().signal)).resolves.toMatchObject({
        status: "unavailable",
      });
    }
    const adapter = new GooglePlaceSearchAdapter({ apiKey: "key", fetch: fetcher });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    for (const malformed of [
      null,
      undefined,
      1,
      {},
      { text: " " },
      { ...query, maxCandidates: 4 },
      revoked.proxy,
    ]) {
      await expect(
        adapter.search(malformed as PlaceSearchQuery, new AbortController().signal),
      ).resolves.toMatchObject({ reason: "unsupported" });
    }
    await expect(adapter.search(query, null as unknown as AbortSignal)).resolves.toMatchObject({
      reason: "cancelled",
    });
    expect(fetches).toBe(0);
  });

  it("rejects prototype-backed search queries and nested bias coordinates without fetching", async () => {
    let fetches = 0;
    const adapter = new GooglePlaceSearchAdapter({
      apiKey: "key",
      fetch: async () => {
        fetches += 1;
        return jsonResponse({ places: [] });
      },
    });
    const inheritedQuery = inherited(query) as unknown as PlaceSearchQuery;
    const inheritedBias = {
      ...query,
      locationBias: inherited(query.locationBias!),
    } as unknown as PlaceSearchQuery;
    const inheritedCenter = {
      ...query,
      locationBias: {
        ...query.locationBias!,
        center: inherited(query.locationBias!.center),
      },
    } as unknown as PlaceSearchQuery;

    for (const candidate of [inheritedQuery, inheritedBias, inheritedCenter]) {
      await expect(
        adapter.search(candidate, new AbortController().signal),
      ).resolves.toMatchObject({ reason: "unsupported", retryable: false });
    }
    expect(fetches).toBe(0);
  });

  it("returns cancelled for structural signals with throwing state or listener methods", async () => {
    let fetches = 0;
    const adapter = new GooglePlaceSearchAdapter({
      apiKey: "key",
      fetch: async () => {
        fetches += 1;
        return jsonResponse({ places: [{ id: "id", displayName: { text: "Museum" } }] });
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
        Promise.resolve().then(() => adapter.search(query, signal as AbortSignal)),
      ).resolves.toMatchObject({ reason: "cancelled", retryable: false });
    }
    expect(fetches).toBe(0);
  });

  it("maps an empty place list to not-found and all-invalid places to malformed", async () => {
    await expect(
      new GooglePlaceSearchAdapter({
        apiKey: "key",
        fetch: async () => jsonResponse({ places: [] }),
      }).search(query, new AbortController().signal),
    ).resolves.toMatchObject({ reason: "not-found", retryable: false });
    await expect(
      new GooglePlaceSearchAdapter({
        apiKey: "key",
        fetch: async () => jsonResponse({ places: [null, {}, { id: "id" }] }),
      }).search(query, new AbortController().signal),
    ).resolves.toMatchObject({ reason: "malformed-response", retryable: false });
  });

  it("maps every search HTTP status class", async () => {
    const cases = [
      [400, "request-denied", false],
      [401, "request-denied", false],
      [403, "request-denied", false],
      [404, "not-found", false],
      [429, "network", true],
      [500, "network", true],
    ] as const;
    for (const [status, reason, retryable] of cases) {
      await expect(
        new GooglePlaceSearchAdapter({
          apiKey: "key",
          fetch: async () => jsonResponse({}, status),
        }).search(query, new AbortController().signal),
      ).resolves.toMatchObject({ reason, retryable, diagnostic: `HTTP ${status}` });
    }
  });

  it("maps transport and JSON rejection without throwing", async () => {
    await expect(
      new GooglePlaceSearchAdapter({
        apiKey: "key",
        fetch: async () => {
          throw new Error("offline");
        },
      }).search(query, new AbortController().signal),
    ).resolves.toMatchObject({ reason: "network", retryable: true });
    await expect(
      new GooglePlaceSearchAdapter({
        apiKey: "key",
        fetch: async () =>
          ({
            ok: true,
            status: 200,
            json: async () => {
              throw new Error("bad JSON");
            },
          }) as unknown as Response,
      }).search(query, new AbortController().signal),
    ).resolves.toMatchObject({ reason: "malformed-response", retryable: false });
  });

  it("maps null, primitive, missing-list, and malformed search payloads", async () => {
    for (const payload of [null, 3, {}, { places: null }, { places: "wrong" }]) {
      await expect(
        new GooglePlaceSearchAdapter({
          apiKey: "key",
          fetch: async () => jsonResponse(payload),
        }).search(query, new AbortController().signal),
      ).resolves.toMatchObject({ reason: "malformed-response" });
    }
  });

  it("maps revoked place and category arrays to nonretryable malformed responses", async () => {
    const revokedPlaces = Proxy.revocable([], {});
    const revokedCategories = Proxy.revocable([], {});
    revokedPlaces.revoke();
    revokedCategories.revoke();
    const payloads = [
      { places: revokedPlaces.proxy },
      {
        places: [
          {
            id: "id",
            displayName: { text: "Museum" },
            types: revokedCategories.proxy,
          },
        ],
      },
    ];

    for (const payload of payloads) {
      await expect(
        new GooglePlaceSearchAdapter({
          apiKey: "key",
          fetch: async () => jsonResponse(payload),
        }).search(query, new AbortController().signal),
      ).resolves.toMatchObject({
        reason: "malformed-response",
        retryable: false,
      });
    }
  });

  it("rejects provider candidates whose required fields are inherited", async () => {
    const inheritedCandidate = inherited({
      id: "id",
      displayName: { text: "Museum" },
    });
    await expect(
      new GooglePlaceSearchAdapter({
        apiKey: "key",
        fetch: async () => jsonResponse({ places: [inheritedCandidate] }),
      }).search(query, new AbortController().signal),
    ).resolves.toMatchObject({ reason: "malformed-response", retryable: false });
  });

  it("lets cancellation win immediately against a fetch that ignores its signal", async () => {
    const hung = deferred<Response>();
    const controller = new AbortController();
    const pending = new GooglePlaceSearchAdapter({
      apiKey: "key",
      fetch: async () => hung.promise,
    }).search(query, controller.signal);

    controller.abort();
    await expect(pending).resolves.toMatchObject({ reason: "cancelled", retryable: false });
  });

  it("observes an abort fired synchronously inside fetch after listener registration", async () => {
    const controller = new AbortController();
    const fetcher: FetchLike = () => {
      controller.abort();
      return new Promise<Response>(() => undefined);
    };

    await expect(
      new GooglePlaceSearchAdapter({ apiKey: "key", fetch: fetcher }).search(
        query,
        controller.signal,
      ),
    ).resolves.toMatchObject({ reason: "cancelled" });
  });

  it("cancels after JSON starts, cleans its listener, and suppresses late JSON settlement", async () => {
    for (const lateOutcome of ["resolve", "reject"] as const) {
      const jsonGate = deferred<unknown>();
      const jsonStarted = deferred<void>();
      const unhandled: unknown[] = [];
      let jsonCalls = 0;
      const response = {
        ok: true,
        status: 200,
        json: () => {
          jsonCalls += 1;
          jsonStarted.resolve();
          return jsonGate.promise;
        },
      } as Response;
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      const onUnhandled = (error: unknown): void => {
        unhandled.push(error);
      };
      process.on("unhandledRejection", onUnhandled);
      try {
        const pending = new GooglePlaceSearchAdapter({
          apiKey: "key",
          fetch: async () => response,
        }).search(query, controller.signal);

        await jsonStarted.promise;
        expect(jsonCalls).toBe(1);
        controller.abort();
        await expect(pending).resolves.toMatchObject({ reason: "cancelled", retryable: false });
        expect(remove).toHaveBeenCalledTimes(1);
        if (lateOutcome === "resolve") {
          jsonGate.resolve({ places: [{ id: "late", displayName: { text: "Late" } }] });
        } else {
          jsonGate.reject(new Error("late JSON rejection"));
        }
        await afterEventLoopTurn();
        expect(unhandled).toEqual([]);
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
    }
  });

  it("keeps cancellation after a generic late rejection and suppresses the late error", async () => {
    const fetchGate = deferred<Response>();
    const controller = new AbortController();
    const pending = new GooglePlaceSearchAdapter({
      apiKey: "key",
      fetch: async () => fetchGate.promise,
    }).search(query, controller.signal);

    controller.abort();
    fetchGate.reject(new Error("late failure"));
    await expect(pending).resolves.toMatchObject({ reason: "cancelled" });
  });

  it("removes its cancellation listener when either work or cancellation settles", async () => {
    const successController = new AbortController();
    const successAdd = vi.spyOn(successController.signal, "addEventListener");
    const successRemove = vi.spyOn(successController.signal, "removeEventListener");
    const adapter = new GooglePlaceSearchAdapter({
      apiKey: "key",
      fetch: async () =>
        jsonResponse({ places: [{ id: "id", displayName: { text: "Museum" } }] }),
    });
    await adapter.search(query, successController.signal);
    expect(successAdd).toHaveBeenCalledTimes(1);
    expect(successRemove).toHaveBeenCalledTimes(1);

    const cancelController = new AbortController();
    const cancelRemove = vi.spyOn(cancelController.signal, "removeEventListener");
    const pending = new GooglePlaceSearchAdapter({
      apiKey: "key",
      fetch: async () => new Promise<Response>(() => undefined),
    }).search(query, cancelController.signal);
    cancelController.abort();
    await pending;
    expect(cancelRemove).toHaveBeenCalledTimes(1);
  });
});
