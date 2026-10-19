import type { PlaceRequestV2 } from "@laugh-tale-island/core";
import { describe, expect, it } from "vitest";
import {
  GooglePlaceAdapter,
  GOOGLE_PLACES_DETAIL_FIELD_MASK,
  type GooglePlaceAdapterOptions,
} from "../src/google/GooglePlaceAdapter.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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

const request: PlaceRequestV2 = {
  ownerId: "place",
  providerReference: { provider: "google", id: "place/id ?" },
  locale: "en-US",
  timeZone: "UTC",
};

function afterEventLoopTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function inherited(prototype: object): Record<string, never> {
  const value: Record<string, never> = {};
  Object.setPrototypeOf(value, prototype);
  return value;
}

describe("GooglePlaceAdapter", () => {
  it("recognizes only the documented singleton Sunday-midnight no-close sentinel", async () => {
    const sentinel = { open: { day: 0, hour: 0, minute: 0 } };
    const periodsCases = [
      [sentinel],
      [{ open: { day: 1, hour: 0, minute: 0 } }],
      [{ open: { day: 0, hour: 0, minute: 1 } }],
      [{ open: { day: 0, hour: 1, minute: 0 } }],
      [{ open: { day: 0, hour: 0 } }],
      [{ ...sentinel, close: null }],
      [sentinel, sentinel],
    ];
    for (const [index, periods] of periodsCases.entries()) {
      const result = await new GooglePlaceAdapter({ apiKey: "key", fetch: async () => jsonResponse({ regularOpeningHours: { periods } }) }).load(request, new AbortController().signal);
      expect(result).toMatchObject({ status: "ready", facts: { openingHours: index === 0 ? { kind: "always-open" } : { kind: "weekly", completeness: "incomplete" } } });
    }
  });
  it("isolates cancellation, late work and retry between languages for the same reviewed place", async () => {
    const pending: Array<{ signal: AbortSignal; response: Deferred<Response> }> = [];
    const adapter = new GooglePlaceAdapter({ apiKey: "key", fetch: (_input, init) => {
      const response = deferred<Response>(); pending.push({ signal: init!.signal!, response }); return response.promise;
    } });
    const cancelEnglish = new AbortController();
    const english = adapter.load(request, cancelEnglish.signal);
    const japanese = adapter.load({ ...request, locale: "ja-JP" }, new AbortController().signal);
    cancelEnglish.abort();
    expect(await english).toMatchObject({ reason: "cancelled" });
    expect(pending[0].signal.aborted).toBe(true); expect(pending[1].signal.aborted).toBe(false);
    const retry = adapter.load({ ...request, locale: " en-US " }, new AbortController().signal);
    pending[0].response.resolve(jsonResponse({ formattedAddress: "stale" }));
    pending[1].response.resolve(jsonResponse({ formattedAddress: "日本語" }));
    pending[2].response.resolve(jsonResponse({ formattedAddress: "English" }));
    expect(await japanese).toMatchObject({ facts: { formattedAddress: "日本語" } });
    expect(await retry).toMatchObject({ facts: { formattedAddress: "English" } });
    expect(await adapter.load(request, new AbortController().signal)).toMatchObject({ facts: { formattedAddress: "English" } });
    expect(pending).toHaveLength(3);
  });

  it("isolates simultaneous language requests and their cached address facts", async () => {
    const pending: Array<{ language: string | null; response: Deferred<Response> }> = [];
    const adapter = new GooglePlaceAdapter({ apiKey: "key", fetch: (input) => {
      const response = deferred<Response>();
      pending.push({ language: new URL(inputUrl(input)!).searchParams.get("languageCode"), response });
      return response.promise;
    } });
    const english = adapter.load(request, new AbortController().signal);
    const japanese = adapter.load({ ...request, locale: "ja-JP" }, new AbortController().signal);
    expect.soft(pending.map(({ language }) => language)).toEqual(["en-US", "ja-JP"]);
    pending[0].response.resolve(jsonResponse({ formattedAddress: "English address" }));
    pending[1]?.response.resolve(jsonResponse({ formattedAddress: "日本語住所" }));
    expect(await english).toMatchObject({ facts: { formattedAddress: "English address" } });
    expect(await japanese).toMatchObject({ facts: { formattedAddress: "日本語住所" } });
    expect(await adapter.load(request, new AbortController().signal)).toMatchObject({ facts: { formattedAddress: "English address" } });
    expect(await adapter.load({ ...request, locale: "ja-JP", timeZone: "Asia/Tokyo" }, new AbortController().signal)).toMatchObject({ facts: { formattedAddress: "日本語住所" } });
    expect(pending).toHaveLength(2);
  });

  it("sends the exact encoded GET URL, key, and field mask", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const fetcher: FetchLike = async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({ formattedAddress: "1 Main" });
    };

    await new GooglePlaceAdapter({ apiKey: " key ", fetch: fetcher }).load(
      request,
      new AbortController().signal,
    );

    expect(calls).toHaveLength(1);
    expect(inputUrl(calls[0]?.input)).toBe(
      "https://places.googleapis.com/v1/places/place%2Fid%20%3F?languageCode=en-US",
    );
    expect(calls[0]?.init?.method).toBe("GET");
    expect(calls[0]?.init?.body).toBeUndefined();
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("X-Goog-Api-Key")).toBe("key");
    expect(headers.get("X-Goog-FieldMask")).toBe(GOOGLE_PLACES_DETAIL_FIELD_MASK);
  });

  it("normalizes complete weekly periods and ignores openNow", async () => {
    const payload = {
      regularOpeningHours: {
        openNow: true,
        periods: [
          {
            open: { day: 1, hour: 9, minute: 0 },
            close: { day: 1, hour: 18, minute: 30 },
          },
        ],
      },
    };

    const result = await new GooglePlaceAdapter({
      apiKey: "key",
      fetch: async () => jsonResponse(payload),
    }).load(request, new AbortController().signal);

    expect(result).toEqual({
      status: "ready",
      facts: {
        openingHours: {
          kind: "weekly",
          completeness: "complete",
          periods: [
            {
              open: { day: 1, hour: 9, minute: 0 },
              close: { day: 1, hour: 18, minute: 30 },
            },
          ],
        },
      },
    });
  });

  it("preserves valid periods and marks missing-close periods incomplete", async () => {
    const payload = {
      regularOpeningHours: {
        periods: [
          {
            open: { day: 1, hour: 9, minute: 0 },
            close: { day: 1, hour: 18, minute: 0 },
          },
          { open: { day: 2, hour: 10, minute: 15 } },
          { open: { day: 8, hour: 10, minute: 0 } },
        ],
      },
    };

    const result = await new GooglePlaceAdapter({
      apiKey: "key",
      fetch: async () => jsonResponse(payload),
    }).load(request, new AbortController().signal);

    expect(result).toMatchObject({
      facts: {
        openingHours: {
          completeness: "incomplete",
          periods: [
            {
              open: { day: 1, hour: 9, minute: 0 },
              close: { day: 1, hour: 18, minute: 0 },
            },
            { open: { day: 2, hour: 10, minute: 15 } },
          ],
        },
      },
    });
  });

  it("preserves empty and all-invalid supplied period arrays as weekly facts", async () => {
    const cases = [
      [[], "complete"],
      [[null, { open: { day: 9, hour: 0, minute: 0 } }], "incomplete"],
    ] as const;

    for (const [periods, completeness] of cases) {
      const result = await new GooglePlaceAdapter({
        apiKey: "key",
        fetch: async () => jsonResponse({ regularOpeningHours: { periods } }),
      }).load(request, new AbortController().signal);
      expect(result).toMatchObject({
        status: "ready",
        facts: { openingHours: { kind: "weekly", completeness, periods: [] } },
      });
    }
  });

  it("maps formatted address and every Google business status", async () => {
    const cases = [
      ["OPERATIONAL", "operational"],
      ["CLOSED_TEMPORARILY", "temporarily-closed"],
      ["CLOSED_PERMANENTLY", "permanently-closed"],
      ["FUTURE_STATE", "unknown"],
    ] as const;

    for (const [providerStatus, businessStatus] of cases) {
      const result = await new GooglePlaceAdapter({
        apiKey: "key",
        fetch: async () =>
          jsonResponse({ formattedAddress: " 1 Main ", businessStatus: providerStatus }),
      }).load(request, new AbortController().signal);
      expect(result).toEqual({
        status: "ready",
        facts: { formattedAddress: "1 Main", businessStatus },
      });
    }
  });

  it("returns typed failures without fetching for malformed options or requests", async () => {
    let fetches = 0;
    const fetcher: FetchLike = async () => {
      fetches += 1;
      return jsonResponse({ formattedAddress: "unused" });
    };
    const malformedOptions: unknown[] = [null, undefined, 4, {}, { apiKey: null }];
    for (const options of malformedOptions) {
      const adapter = new GooglePlaceAdapter(options as GooglePlaceAdapterOptions);
      await expect(
        adapter.load(request, new AbortController().signal),
      ).resolves.toMatchObject({ reason: "missing-configuration" });
    }
    const adapter = new GooglePlaceAdapter({ apiKey: "key", fetch: fetcher });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    for (const malformed of [
      null,
      undefined,
      4,
      "request",
      {},
      { providerReference: null },
      revoked.proxy,
    ]) {
      await expect(
        adapter.load(malformed as unknown as PlaceRequestV2, new AbortController().signal),
      ).resolves.toMatchObject({ reason: "unsupported" });
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
        return Promise.resolve(jsonResponse({ formattedAddress: "wrong" }));
      },
    });
    try {
      const adapter = new GooglePlaceAdapter({
        apiKey: "key",
        fetch: null,
      } as unknown as GooglePlaceAdapterOptions);
      await expect(adapter.load(request, new AbortController().signal)).resolves.toMatchObject({
        reason: "missing-configuration",
      });
      expect(globalFetches).toBe(0);
    } finally {
      if (original) Object.defineProperty(globalThis, "fetch", original);
      else Reflect.deleteProperty(globalThis, "fetch");
    }
  });

  it("rejects missing, blank, and foreign provider references before fetch", async () => {
    let fetches = 0;
    const fetcher: FetchLike = async () => {
      fetches += 1;
      return jsonResponse({ formattedAddress: "unused" });
    };
    const adapter = new GooglePlaceAdapter({ apiKey: "key", fetch: fetcher });
    const references: unknown[] = [
      null,
      {},
      { provider: "google", id: " " },
      { provider: "other", id: "x" },
    ];

    for (const providerReference of references) {
      await expect(
        adapter.load({ ...request, providerReference } as PlaceRequestV2, new AbortController().signal),
      ).resolves.toMatchObject({ reason: "unsupported", retryable: false });
    }
    expect(fetches).toBe(0);
  });

  it("returns cancelled for missing, malformed, and already-aborted signals", async () => {
    let fetches = 0;
    const fetcher: FetchLike = async () => {
      fetches += 1;
      return jsonResponse({});
    };
    const adapter = new GooglePlaceAdapter({ apiKey: "key", fetch: fetcher });
    const aborted = new AbortController();
    aborted.abort();

    for (const signal of [null, {}, aborted.signal]) {
      await expect(adapter.load(request, signal as AbortSignal)).resolves.toMatchObject({
        reason: "cancelled",
      });
    }
    expect(fetches).toBe(0);
  });

  it("returns cancelled for structural signals with throwing state or listener methods", async () => {
    let fetches = 0;
    const adapter = new GooglePlaceAdapter({
      apiKey: "key",
      fetch: async () => {
        fetches += 1;
        return jsonResponse({ formattedAddress: "unused" });
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
        Promise.resolve().then(() => adapter.load(request, signal as AbortSignal)),
      ).resolves.toMatchObject({ reason: "cancelled", retryable: false });
    }
    expect(fetches).toBe(0);
  });

  it("rejects prototype-backed place requests and provider references without fetching", async () => {
    let fetches = 0;
    const adapter = new GooglePlaceAdapter({
      apiKey: "key",
      fetch: async () => {
        fetches += 1;
        return jsonResponse({ formattedAddress: "unused" });
      },
    });
    const inheritedRequest = inherited(request) as unknown as PlaceRequestV2;
    const inheritedReference = {
      ...request,
      providerReference: inherited(request.providerReference),
    } as unknown as PlaceRequestV2;

    for (const candidate of [inheritedRequest, inheritedReference]) {
      await expect(
        adapter.load(candidate, new AbortController().signal),
      ).resolves.toMatchObject({ reason: "unsupported", retryable: false });
    }
    expect(fetches).toBe(0);
  });

  it("maps every place HTTP status class", async () => {
    const cases = [
      [400, "request-denied", false],
      [401, "request-denied", false],
      [403, "request-denied", false],
      [404, "not-found", false],
      [429, "network", true],
      [500, "network", true],
    ] as const;

    for (const [status, reason, retryable] of cases) {
      const result = await new GooglePlaceAdapter({
        apiKey: "key",
        fetch: async () => jsonResponse({}, status),
      }).load(request, new AbortController().signal);
      expect(result).toMatchObject({ reason, retryable, diagnostic: `HTTP ${status}` });
    }
  });

  it("maps transport, JSON rejection, empty, and malformed place responses", async () => {
    const transport: FetchLike = async () => {
      throw new Error("offline");
    };
    const rejectedJson: FetchLike = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("bad JSON");
        },
      }) as unknown as Response;

    await expect(
      new GooglePlaceAdapter({ apiKey: "key", fetch: transport }).load(
        request,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ reason: "network", retryable: true });
    await expect(
      new GooglePlaceAdapter({ apiKey: "key", fetch: rejectedJson }).load(
        request,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ reason: "malformed-response" });
    for (const payload of [null, [], {}, { places: [] }, { unexpected: true }]) {
      const result = await new GooglePlaceAdapter({
        apiKey: "key",
        fetch: async () => jsonResponse(payload),
      }).load(request, new AbortController().signal);
      expect(result.status).toBe("unavailable");
    }
  });

  it("rejects malformed supplied known place fields instead of returning ready-empty", async () => {
    const malformedPayloads: unknown[] = [
      { formattedAddress: 42 },
      { displayName: 42 },
      { location: { latitude: 91, longitude: 0 } },
      { regularOpeningHours: null },
      { businessStatus: 42 },
      { businessStatus: {} },
      { id: " " },
    ];

    for (const payload of malformedPayloads) {
      await expect(
        new GooglePlaceAdapter({
          apiKey: "key",
          fetch: async () => jsonResponse(payload),
        }).load(request, new AbortController().signal),
      ).resolves.toMatchObject({
        reason: "malformed-response",
        retryable: false,
      });
    }
  });

  it("allows a valid provider identity fact even when no display facts are emitted", async () => {
    for (const payload of [
      { id: "provider-id" },
      { displayName: { text: "Museum" } },
      { location: { latitude: 25, longitude: 121 } },
    ]) {
      await expect(
        new GooglePlaceAdapter({
          apiKey: "key",
          fetch: async () => jsonResponse(payload),
        }).load(request, new AbortController().signal),
      ).resolves.toEqual({ status: "ready", facts: {} });
    }
  });

  it("maps revoked place and opening-period arrays to nonretryable malformed responses", async () => {
    const revokedPlaces = Proxy.revocable([], {});
    const revokedPeriods = Proxy.revocable([], {});
    revokedPlaces.revoke();
    revokedPeriods.revoke();
    for (const payload of [
      { formattedAddress: "Address", places: revokedPlaces.proxy },
      { regularOpeningHours: { periods: revokedPeriods.proxy } },
    ]) {
      await expect(
        new GooglePlaceAdapter({
          apiKey: "key",
          fetch: async () => jsonResponse(payload),
        }).load(request, new AbortController().signal),
      ).resolves.toMatchObject({
        reason: "malformed-response",
        retryable: false,
      });
    }
  });

  it("shares one fetch and cancels only the requesting caller", async () => {
    const responseGate = deferred<Response>();
    let fetches = 0;
    let upstream: AbortSignal | undefined;
    const fetcher: FetchLike = async (_input, init) => {
      fetches += 1;
      const signal = init?.signal;
      upstream = signal ?? undefined;
      return responseGate.promise;
    };
    const adapter = new GooglePlaceAdapter({ apiKey: "key", fetch: fetcher });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = adapter.load(request, firstController.signal);
    const second = adapter.load(request, secondController.signal);

    expect(fetches).toBe(1);
    firstController.abort();
    expect(upstream?.aborted).toBe(false);
    responseGate.resolve(jsonResponse({ formattedAddress: "Ready" }));

    await expect(first).resolves.toMatchObject({ reason: "cancelled" });
    await expect(second).resolves.toEqual({
      status: "ready",
      facts: { formattedAddress: "Ready" },
    });
  });

  it("aborts and evicts on final cancellation, then isolates a fresh replacement", async () => {
    const fetchGates = [deferred<Response>(), deferred<Response>()];
    const signals: AbortSignal[] = [];
    let fetches = 0;
    const fetcher: FetchLike = async (_input, init) => {
      const index = fetches;
      fetches += 1;
      const signal = init?.signal;
      if (signal) signals.push(signal);
      return fetchGates[index]!.promise;
    };
    const adapter = new GooglePlaceAdapter({ apiKey: "key", fetch: fetcher });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = adapter.load(request, firstController.signal);
    const second = adapter.load(request, secondController.signal);
    firstController.abort();
    expect(signals[0]?.aborted).toBe(false);
    secondController.abort();
    expect(signals[0]?.aborted).toBe(true);
    const replacement = adapter.load(request, new AbortController().signal);

    expect(fetches).toBe(2);
    fetchGates[1]!.resolve(jsonResponse({ formattedAddress: "Replacement" }));
    await expect(replacement).resolves.toMatchObject({
      facts: { formattedAddress: "Replacement" },
    });
    fetchGates[0]!.resolve(jsonResponse({ formattedAddress: "Old" }));
    await afterEventLoopTurn();

    await expect(first).resolves.toMatchObject({ reason: "cancelled" });
    await expect(second).resolves.toMatchObject({ reason: "cancelled" });
    await expect(adapter.load(request, new AbortController().signal)).resolves.toMatchObject({
      facts: { formattedAddress: "Replacement" },
    });
    expect(fetches).toBe(2);
  });

  it("deep-clones cached weekly periods against caller mutation", async () => {
    let fetches = 0;
    const fetcher: FetchLike = async () => {
      fetches += 1;
      return jsonResponse({
        regularOpeningHours: {
          periods: [
            {
              open: { day: 1, hour: 9, minute: 0 },
              close: { day: 1, hour: 18, minute: 0 },
            },
          ],
        },
      });
    };
    const adapter = new GooglePlaceAdapter({ apiKey: "key", fetch: fetcher });
    const ready = await adapter.load(request, new AbortController().signal);
    expect(ready.status).toBe("ready");
    if (ready.status === "ready" && ready.facts.openingHours?.kind === "weekly") {
      const mutable = ready.facts.openingHours.periods as Array<{
        open: { day: number; hour: number; minute: number };
      }>;
      mutable[0]!.open.hour = 0;
      mutable.push({ open: { day: 2, hour: 0, minute: 0 } });
    }

    const cached = await adapter.load(request, new AbortController().signal);
    expect(cached).toMatchObject({
      facts: {
        openingHours: {
          periods: [
            {
              open: { day: 1, hour: 9, minute: 0 },
              close: { day: 1, hour: 18, minute: 0 },
            },
          ],
        },
      },
    });
    expect(fetches).toBe(1);
  });

  it("never caches failed place work", async () => {
    let fetches = 0;
    const fetcher: FetchLike = async () => {
      fetches += 1;
      if (fetches === 1) throw new Error("offline");
      return jsonResponse({ formattedAddress: "Recovered" });
    };
    const adapter = new GooglePlaceAdapter({ apiKey: "key", fetch: fetcher });

    await expect(adapter.load(request, new AbortController().signal)).resolves.toMatchObject({
      reason: "network",
    });
    await expect(adapter.load(request, new AbortController().signal)).resolves.toMatchObject({
      facts: { formattedAddress: "Recovered" },
    });
    expect(fetches).toBe(2);
  });
});
