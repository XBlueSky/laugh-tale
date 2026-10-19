import type {
  BusinessStatus,
  OpeningHoursFacts,
  OpeningPeriod,
  PlaceProviderResult,
  PlaceRequestV2,
  WeeklyClockTime,
} from "@laugh-tale-island/core";
import type { PlaceAdapterV2 } from "@laugh-tale-island/core/browser";
import { failure, fetchFailure, httpFailure } from "./provider-failure.js";
import { normalizeProviderLocation } from "./provider-location.js";

const base = "https://places.googleapis.com/v1";

export const GOOGLE_PLACES_DETAIL_FIELD_MASK =
  "id,displayName,location,formattedAddress,businessStatus," +
  "regularOpeningHours.periods.open,regularOpeningHours.periods.close";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface GooglePlaceAdapterOptions {
  apiKey: string;
  fetch?: FetchLike;
}

interface InFlight {
  controller: AbortController;
  promise: Promise<PlaceProviderResult>;
  subscribers: number;
}

function record(value: unknown): value is Record<PropertyKey, unknown> {
  if (typeof value !== "object" || value === null) return false;
  try {
    return !Array.isArray(value);
  } catch {
    return false;
  }
}

function get(value: unknown, key: PropertyKey): unknown {
  if (!record(value)) return undefined;
  try {
    return Object.hasOwn(value, key) ? value[key] : undefined;
  } catch {
    return undefined;
  }
}

function hasOwn(value: unknown, key: PropertyKey): boolean {
  if (!record(value)) return false;
  try {
    return Object.hasOwn(value, key);
  } catch {
    return false;
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function abortSignal(value: unknown): value is AbortSignal {
  try {
    return value instanceof AbortSignal;
  } catch {
    return false;
  }
}

function isAborted(signal: AbortSignal): boolean {
  try {
    return signal.aborted;
  } catch {
    return true;
  }
}

function addAbortListener(signal: AbortSignal, listener: () => void): boolean {
  try {
    signal.addEventListener("abort", listener, { once: true });
    return true;
  } catch {
    return false;
  }
}

function removeAbortListener(signal: AbortSignal, listener: () => void): void {
  try {
    signal.removeEventListener("abort", listener);
  } catch {
    // A hostile signal must not prevent settlement.
  }
}

function clock(value: unknown): WeeklyClockTime | undefined {
  if (!record(value)) return undefined;
  const day = get(value, "day");
  const hour = get(value, "hour");
  const minute = get(value, "minute");
  if (
    !Number.isInteger(day) ||
    (day as number) < 0 ||
    (day as number) > 6 ||
    !Number.isInteger(hour) ||
    (hour as number) < 0 ||
    (hour as number) > 23 ||
    !Number.isInteger(minute) ||
    (minute as number) < 0 ||
    (minute as number) > 59
  ) {
    return undefined;
  }
  return {
    day: day as WeeklyClockTime["day"],
    hour: hour as number,
    minute: minute as number,
  };
}

type OpeningResult =
  | { valid: true; facts: OpeningHoursFacts }
  | { valid: false };

function opening(hours: unknown): OpeningResult {
  if (!record(hours) || !hasOwn(hours, "periods")) return { valid: false };
  const rawPeriods = get(hours, "periods");
  try {
    if (!Array.isArray(rawPeriods)) return { valid: false };
    const providerPeriods = rawPeriods as unknown[];
    const periods: OpeningPeriod[] = [];
    let incomplete = false;

    for (let index = 0; index < providerPeriods.length; index += 1) {
      if (!Object.hasOwn(providerPeriods, index)) {
        incomplete = true;
        continue;
      }
      const period: unknown = providerPeriods[index];
      const open = clock(get(period, "open"));
      if (!open) {
        incomplete = true;
        continue;
      }
      const close = clock(get(period, "close"));
      // Places regularOpeningHours documents precisely this always-open sentinel.
      // A malformed close or extra period is ambiguous and stays incomplete.
      if (providerPeriods.length === 1 && open.day === 0 && open.hour === 0 && open.minute === 0 && !hasOwn(period, "close")) {
        return { valid: true, facts: { kind: "always-open" } };
      }
      if (!close) incomplete = true;
      periods.push({ open, ...(close ? { close } : {}) });
    }

    return {
      valid: true,
      facts: {
        kind: "weekly",
        completeness: incomplete ? "incomplete" : "complete",
        periods,
      },
    };
  } catch {
    return { valid: false };
  }
}

function business(value: unknown): BusinessStatus | undefined {
  switch (value) {
    case "OPERATIONAL":
      return "operational";
    case "CLOSED_TEMPORARILY":
      return "temporarily-closed";
    case "CLOSED_PERMANENTLY":
      return "permanently-closed";
    case undefined:
      return undefined;
    default:
      return "unknown";
  }
}

function clone(value: PlaceProviderResult): PlaceProviderResult {
  if (value.status === "unavailable") return { ...value };
  const openingHours = value.facts.openingHours;
  return {
    status: "ready",
    facts: {
      ...value.facts,
      ...(openingHours?.kind === "weekly"
        ? {
            openingHours: {
              ...openingHours,
              periods: openingHours.periods.map((period) => ({
                open: { ...period.open },
                ...(period.close ? { close: { ...period.close } } : {}),
              })),
            },
          }
        : {}),
    },
  };
}

function normalizePayload(value: unknown): PlaceProviderResult {
  if (!record(value)) return failure("malformed-response");
  let keys: string[];
  try {
    keys = Object.keys(value);
  } catch {
    return failure("malformed-response");
  }
  if (keys.length === 0) return failure("not-found");
  if (hasOwn(value, "places")) {
    const places = get(value, "places");
    if (!Array.isArray(places)) return failure("malformed-response");
    if (places.length === 0) return failure("not-found");
    return failure("malformed-response");
  }
  const knownFields = [
    "id",
    "displayName",
    "location",
    "formattedAddress",
    "businessStatus",
    "regularOpeningHours",
  ] as const;
  if (!knownFields.some((field) => hasOwn(value, field))) {
    return failure("malformed-response");
  }

  let meaningful = false;
  let formattedAddress: string | undefined;
  let businessStatus: BusinessStatus | undefined;
  let openingHours: OpeningHoursFacts | undefined;

  if (hasOwn(value, "id")) {
    if (!text(get(value, "id"))) return failure("malformed-response");
    meaningful = true;
  }
  if (hasOwn(value, "displayName")) {
    const displayName = get(value, "displayName");
    if (!record(displayName) || !hasOwn(displayName, "text") || !text(get(displayName, "text"))) {
      return failure("malformed-response");
    }
    meaningful = true;
  }
  if (hasOwn(value, "location")) {
    const location = get(value, "location");
    if (!normalizeProviderLocation(location)) return failure("malformed-response");
    meaningful = true;
  }
  if (hasOwn(value, "formattedAddress")) {
    formattedAddress = text(get(value, "formattedAddress"));
    if (!formattedAddress) return failure("malformed-response");
    meaningful = true;
  }
  if (hasOwn(value, "businessStatus")) {
    const rawBusinessStatus = get(value, "businessStatus");
    if (typeof rawBusinessStatus !== "string") return failure("malformed-response");
    businessStatus = business(rawBusinessStatus);
    meaningful = true;
  }
  if (hasOwn(value, "regularOpeningHours")) {
    const normalizedOpening = opening(get(value, "regularOpeningHours"));
    if (!normalizedOpening.valid) return failure("malformed-response");
    openingHours = normalizedOpening.facts;
    meaningful = true;
  }
  if (!meaningful) return failure("malformed-response");
  return {
    status: "ready",
    facts: {
      ...(formattedAddress ? { formattedAddress } : {}),
      ...(businessStatus ? { businessStatus } : {}),
      ...(openingHours ? { openingHours } : {}),
    },
  };
}

function normalize(value: unknown): PlaceProviderResult {
  try {
    return normalizePayload(value);
  } catch {
    return failure("malformed-response");
  }
}

function defaultFetch(): FetchLike | undefined {
  return typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined;
}

export class GooglePlaceAdapter implements PlaceAdapterV2 {
  private readonly key: string;
  private readonly fetcher: FetchLike | undefined;
  private readonly cache = new Map<string, PlaceProviderResult>();
  private readonly inFlight = new Map<string, InFlight>();

  constructor(options: GooglePlaceAdapterOptions) {
    this.key = text(get(options, "apiKey")) ?? "";
    const suppliedFetch = get(options, "fetch");
    this.fetcher = hasOwn(options, "fetch")
      ? typeof suppliedFetch === "function"
        ? (suppliedFetch as FetchLike)
        : undefined
      : defaultFetch();
  }

  load(request: PlaceRequestV2, signal: AbortSignal): Promise<PlaceProviderResult> {
    if (!abortSignal(signal) || isAborted(signal)) return Promise.resolve(failure("cancelled"));
    if (!this.key || !this.fetcher) return Promise.resolve(failure("missing-configuration"));
    const reference = get(request, "providerReference");
    const id = text(get(reference, "id"));
    const language = text(get(request, "locale"));
    if (
      !record(request) ||
      !hasOwn(request, "ownerId") ||
      !hasOwn(request, "providerReference") ||
      !hasOwn(request, "locale") ||
      !hasOwn(request, "timeZone") ||
      !text(get(request, "ownerId")) ||
      !language ||
      !text(get(request, "timeZone")) ||
      !record(reference) ||
      !hasOwn(reference, "provider") ||
      !hasOwn(reference, "id") ||
      get(reference, "provider") !== "google" ||
      !id
    ) {
      return Promise.resolve(failure("unsupported"));
    }

    const key = JSON.stringify([id, language]);
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(clone(cached));
    const entry = this.inFlight.get(key) ?? this.start(key, id, language);
    return this.subscribe(key, entry, signal);
  }

  private start(key: string, id: string, language: string): InFlight {
    const controller = new AbortController();
    const entry: InFlight = {
      controller,
      subscribers: 0,
      promise: this.fetch(id, language, controller.signal).then((result) => {
        if (result.status === "ready" && !isAborted(controller.signal)) {
          this.cache.set(key, clone(result));
        }
        return result;
      }).catch(() => failure("malformed-response")),
    };
    this.inFlight.set(key, entry);
    const cleanup = (): void => {
      if (this.inFlight.get(key) === entry) this.inFlight.delete(key);
    };
    void entry.promise.then(cleanup, cleanup);
    return entry;
  }

  private subscribe(
    id: string,
    entry: InFlight,
    signal: AbortSignal,
  ): Promise<PlaceProviderResult> {
    entry.subscribers += 1;
    return new Promise((resolve) => {
      let done = false;
      const finish = (result: PlaceProviderResult, cancelled: boolean): void => {
        if (done) return;
        done = true;
        removeAbortListener(signal, onAbort);
        entry.subscribers -= 1;
        if (cancelled && entry.subscribers === 0) {
          if (this.inFlight.get(id) === entry) this.inFlight.delete(id);
          entry.controller.abort();
        }
        resolve(clone(result));
      };
      const onAbort = (): void => finish(failure("cancelled"), true);
      if (!addAbortListener(signal, onAbort)) {
        finish(failure("cancelled"), true);
        return;
      }
      if (isAborted(signal)) onAbort();
      void entry.promise.then(
        (result) => finish(result, false),
        () => finish(isAborted(signal) ? failure("cancelled") : failure("malformed-response"), false),
      );
    });
  }

  private async fetch(id: string, language: string, signal: AbortSignal): Promise<PlaceProviderResult> {
    if (isAborted(signal)) return failure("cancelled");
    try {
      const response = await this.fetcher!(`${base}/places/${encodeURIComponent(id)}?languageCode=${encodeURIComponent(language)}`, {
        method: "GET",
        headers: {
          "X-Goog-Api-Key": this.key,
          "X-Goog-FieldMask": GOOGLE_PLACES_DETAIL_FIELD_MASK,
        },
        signal,
      });
      if (isAborted(signal)) return failure("cancelled");
      if (!response || typeof response.ok !== "boolean" || typeof response.status !== "number") {
        return failure("malformed-response");
      }
      if (!response.ok) return httpFailure(response.status);
      if (isAborted(signal)) return failure("cancelled");
      if (typeof response.json !== "function") return failure("malformed-response");
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return isAborted(signal) ? failure("cancelled") : failure("malformed-response");
      }
      if (isAborted(signal)) return failure("cancelled");
      return normalize(payload);
    } catch (error) {
      return isAborted(signal) ? failure("cancelled") : fetchFailure(error);
    }
  }
}
