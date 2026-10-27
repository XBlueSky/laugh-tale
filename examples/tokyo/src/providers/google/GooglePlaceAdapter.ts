import type { PlaceRequest, PlaceResult } from "@laugh-tale-island/core";
import type { PlaceAdapter } from "@laugh-tale-island/core/browser";
import type { PlaceRef } from "@laugh-tale-island/core";
import { normalizeProviderLocation } from "./provider-location";

const PLACES_BASE_URL = "https://places.googleapis.com/v1";

export const GOOGLE_PLACES_DETAIL_FIELD_MASK = "id,displayName,location";
export const GOOGLE_PLACES_SEARCH_FIELD_MASK =
  "places.id,places.displayName,places.location";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface GooglePlaceAdapterOptions {
  apiKey: string;
  fetch?: FetchLike;
}

interface NormalizedPlaceRequest {
  query?: string;
  providerPlaceId?: string;
}

interface InFlightPlace {
  controller: AbortController;
  promise: Promise<PlaceResult>;
  subscribers: number;
}

function trimmed(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
}

function normalizeRequest(request: PlaceRequest): NormalizedPlaceRequest {
  const query = trimmed(request.query);
  const providerPlaceId = trimmed(request.providerPlaceId);
  return {
    ...(query === undefined ? {} : { query }),
    ...(providerPlaceId === undefined ? {} : { providerPlaceId }),
  };
}

function requestCacheKey(
  request: NormalizedPlaceRequest,
): string | undefined {
  if (request.providerPlaceId !== undefined) {
    return `id:${request.providerPlaceId}`;
  }
  return request.query === undefined ? undefined : `query:${request.query}`;
}

function clonePlace(place: PlaceRef): PlaceRef {
  return {
    name: place.name,
    ...(place.coordinates === undefined
      ? {}
      : { coordinates: { ...place.coordinates } }),
    ...(place.provider === undefined
      ? {}
      : { provider: { ...place.provider } }),
    certainty: place.certainty,
  };
}

function cloneResult(result: PlaceResult): PlaceResult {
  return result.status === "unavailable"
    ? { ...result }
    : { status: "ready", place: clonePlace(result.place) };
}

function unavailable(reason: string): PlaceResult {
  return { status: "unavailable", reason };
}

function errorReason(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Request aborted";
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return typeof error === "string" && error.trim().length > 0
    ? error
    : "Google Places request failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizePlace(value: unknown): PlaceResult {
  if (!isRecord(value) || !isRecord(value.displayName)) {
    return unavailable("Google Places returned a malformed place");
  }
  const name =
    typeof value.displayName.text === "string"
      ? value.displayName.text.trim()
      : "";
  if (name.length === 0) {
    return unavailable("Google Places returned a place without a name");
  }
  const providerPlaceId =
    typeof value.id === "string" ? trimmed(value.id) : undefined;
  const coordinates = normalizeProviderLocation(value.location);
  return {
    status: "ready",
    place: {
      name,
      ...(coordinates === undefined ? {} : { coordinates }),
      provider: {
        name: "google",
        ...(providerPlaceId === undefined ? {} : { placeId: providerPlaceId }),
      },
      certainty: "unverified",
    },
  };
}

export class GooglePlaceAdapter implements PlaceAdapter {
  private readonly apiKey: string;
  private readonly fetch: FetchLike;
  private readonly cache = new Map<string, PlaceResult>();
  private readonly inFlight = new Map<string, InFlightPlace>();

  constructor(options: GooglePlaceAdapterOptions) {
    this.apiKey = options.apiKey.trim();
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  resolve(request: PlaceRequest, signal: AbortSignal): Promise<PlaceResult> {
    if (signal.aborted) {
      return Promise.resolve(unavailable("Request aborted"));
    }
    if (this.apiKey.length === 0) {
      return Promise.resolve(unavailable("Google Places API key is missing"));
    }
    const normalized = normalizeRequest(request);
    const key = requestCacheKey(normalized);
    if (key === undefined) {
      return Promise.resolve(unavailable("Place request is blank"));
    }

    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return Promise.resolve(cloneResult(cached));
    }
    const entry =
      this.inFlight.get(key) ?? this.startRequest(key, normalized);
    return this.waitForCaller(key, entry, signal);
  }

  private startRequest(
    key: string,
    request: NormalizedPlaceRequest,
  ): InFlightPlace {
    const controller = new AbortController();
    const promise = this.fetchPlace(request, controller.signal).then((result) => {
      if (result.status === "ready" && !controller.signal.aborted) {
        this.cache.set(key, cloneResult(result));
      }
      return result;
    });
    const entry: InFlightPlace = { controller, promise, subscribers: 0 };
    this.inFlight.set(key, entry);
    void promise.finally(() => {
      if (this.inFlight.get(key) === entry) {
        this.inFlight.delete(key);
      }
    });
    return entry;
  }

  private waitForCaller(
    key: string,
    entry: InFlightPlace,
    signal: AbortSignal,
  ): Promise<PlaceResult> {
    entry.subscribers += 1;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: PlaceResult, aborted: boolean): void => {
        if (settled) {
          return;
        }
        settled = true;
        signal.removeEventListener("abort", onAbort);
        entry.subscribers -= 1;
        if (aborted && entry.subscribers === 0) {
          if (this.inFlight.get(key) === entry) {
            this.inFlight.delete(key);
          }
          entry.controller.abort();
        }
        resolve(cloneResult(result));
      };
      const onAbort = (): void => {
        finish(unavailable("Request aborted"), true);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      void entry.promise.then((result) => {
        finish(result, false);
      });
    });
  }

  private async fetchPlace(
    request: NormalizedPlaceRequest,
    signal: AbortSignal,
  ): Promise<PlaceResult> {
    try {
      if (request.providerPlaceId !== undefined) {
        const response = await this.fetch(
          `${PLACES_BASE_URL}/places/${encodeURIComponent(request.providerPlaceId)}`,
          {
            method: "GET",
            headers: {
              "X-Goog-Api-Key": this.apiKey,
              "X-Goog-FieldMask": GOOGLE_PLACES_DETAIL_FIELD_MASK,
            },
            signal,
          },
        );
        if (!response.ok) {
          return unavailable(
            `Google Places request failed (${response.status})`,
          );
        }
        const payload: unknown = await response.json();
        return normalizePlace(payload);
      }

      if (request.query === undefined) {
        return unavailable("Place request is blank");
      }
      const response = await this.fetch(
        `${PLACES_BASE_URL}/places:searchText`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.apiKey,
            "X-Goog-FieldMask": GOOGLE_PLACES_SEARCH_FIELD_MASK,
          },
          body: JSON.stringify({ textQuery: request.query }),
          signal,
        },
      );
      if (!response.ok) {
        return unavailable(
          `Google Places request failed (${response.status})`,
        );
      }
      const payload: unknown = await response.json();
      if (!isRecord(payload) || !Array.isArray(payload.places)) {
        return unavailable("Google Places returned a malformed response");
      }
      return payload.places.length === 0
        ? unavailable("No place returned")
        : normalizePlace(payload.places[0]);
    } catch (error) {
      return unavailable(errorReason(error));
    }
  }
}
