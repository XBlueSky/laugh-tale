import type { RouteRequest, RouteResult } from "@laugh-tale-island/core";
import type { RouteAdapter } from "@laugh-tale-island/core/browser";
import type { Coordinates, RouteMode } from "@laugh-tale-island/core";
import { normalizeProviderLocation } from "./provider-location";

const ROUTES_ENDPOINT =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

export const GOOGLE_ROUTES_FIELD_MASK =
  "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction.instructions";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface GoogleRouteAdapterOptions {
  apiKey: string;
  fetch?: FetchLike;
  transitEnabled?: boolean;
}

interface InFlightRoute {
  controller: AbortController;
  promise: Promise<RouteResult>;
  subscribers: number;
}

interface GoogleRouteBody {
  origin: { address: string };
  destination: { address: string };
  travelMode: "WALK" | "DRIVE" | "TRANSIT";
  departureTime?: string;
  transitPreferences?: {
    allowedTravelModes: ("SUBWAY" | "TRAIN" | "BUS")[];
  };
}

const CANONICAL_TRANSIT_MODES = [
  ["subway", "SUBWAY"],
  ["rail", "TRAIN"],
  ["bus", "BUS"],
] as const;

function trimmed(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
}

function allowedTransitModes(
  request: RouteRequest,
): ("SUBWAY" | "TRAIN" | "BUS")[] {
  if (request.edge.mode !== "transit") {
    return [];
  }
  const requested = new Set(request.transitPreferences?.allowedModes ?? []);
  return CANONICAL_TRANSIT_MODES.flatMap(([neutral, googleMode]) =>
    requested.has(neutral) ? [googleMode] : [],
  );
}

export function routeRequestCacheKey(request: RouteRequest): string {
  return JSON.stringify({
    edgeId: request.edge.id,
    dayId: request.edge.dayId,
    source: request.edge.source,
    fromNodeId: request.edge.fromNodeId,
    toNodeId: request.edge.toNodeId,
    mode: request.edge.mode,
    origin: trimmed(request.edge.navigation?.origin) ?? null,
    destination: trimmed(request.edge.navigation?.destination) ?? null,
    departureAt: trimmed(request.departureAt) ?? null,
    allowedModes: allowedTransitModes(request),
  });
}

function cloneResult(result: RouteResult): RouteResult {
  return result.status === "unavailable"
    ? { ...result }
    : {
        ...result,
        path: result.path.map((point) => ({ ...point })),
        steps: [...result.steps],
      };
}

function unavailable(reason: string): RouteResult {
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
    : "Google Routes request failed";
}

function providerTravelMode(
  mode: RouteMode,
): GoogleRouteBody["travelMode"] | undefined {
  switch (mode) {
    case "walking":
      return "WALK";
    case "driving":
      return "DRIVE";
    case "transit":
      return "TRANSIT";
    default:
      return undefined;
  }
}

function requestEligibility(
  request: RouteRequest,
  transitEnabled: boolean,
): string | undefined {
  if (providerTravelMode(request.edge.mode) === undefined) {
    return "Live routes are unavailable for this travel mode";
  }

  const navigation = request.edge.navigation;
  const hasEndpoints =
    trimmed(navigation?.origin) !== undefined &&
    trimmed(navigation?.destination) !== undefined;
  if (
    (request.edge.source === "recomposed" && !hasEndpoints) ||
    !hasEndpoints
  ) {
    return "Route has no explicit provider navigation endpoints";
  }
  if (request.edge.mode === "transit" && !transitEnabled) {
    return "Live transit routes are not enabled";
  }
  return undefined;
}

function buildRequestBody(request: RouteRequest): GoogleRouteBody {
  const origin = trimmed(request.edge.navigation?.origin);
  const destination = trimmed(request.edge.navigation?.destination);
  const travelMode = providerTravelMode(request.edge.mode);
  if (
    origin === undefined ||
    destination === undefined ||
    travelMode === undefined
  ) {
    throw new Error("Route request is not eligible");
  }

  const departureTime = trimmed(request.departureAt);
  const modes = allowedTransitModes(request);
  return {
    origin: { address: origin },
    destination: { address: destination },
    travelMode,
    ...(departureTime === undefined ? {} : { departureTime }),
    ...(modes.length === 0
      ? {}
      : { transitPreferences: { allowedTravelModes: modes } }),
  };
}

function requestAttempts(request: RouteRequest): GoogleRouteBody[] {
  const original = buildRequestBody(request);
  if (request.edge.mode !== "transit") {
    return [original];
  }

  const noModes: GoogleRouteBody = {
    origin: original.origin,
    destination: original.destination,
    travelMode: original.travelMode,
    ...(original.departureTime === undefined
      ? {}
      : { departureTime: original.departureTime }),
  };
  const noDeparture: GoogleRouteBody = {
    origin: original.origin,
    destination: original.destination,
    travelMode: original.travelMode,
  };
  const seen = new Set<string>();
  return [original, noModes, noDeparture].filter((body) => {
    const serialized = JSON.stringify(body);
    if (seen.has(serialized)) {
      return false;
    }
    seen.add(serialized);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseDurationMinutes(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  if (match === null) {
    return undefined;
  }
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.ceil(seconds / 60)
    : undefined;
}

function decodeSignedValue(encoded: string, state: { index: number }): number {
  let result = 0;
  let shift = 0;
  while (state.index < encoded.length) {
    const value = encoded.charCodeAt(state.index) - 63;
    state.index += 1;
    if (value < 0 || value > 63 || shift > 30) {
      throw new Error("Google Routes returned an invalid polyline");
    }
    result |= (value & 0x1f) << shift;
    if (value < 0x20) {
      return result & 1 ? ~(result >> 1) : result >> 1;
    }
    shift += 5;
  }
  throw new Error("Google Routes returned an invalid polyline");
}

function decodePolyline(encoded: unknown): Coordinates[] | undefined {
  if (typeof encoded !== "string" || encoded.length === 0) {
    return undefined;
  }
  const state = { index: 0 };
  const path: Coordinates[] = [];
  let latitude = 0;
  let longitude = 0;
  try {
    while (state.index < encoded.length) {
      latitude += decodeSignedValue(encoded, state);
      longitude += decodeSignedValue(encoded, state);
      const point = normalizeProviderLocation({
        lat: latitude / 100_000,
        lng: longitude / 100_000,
      });
      if (point === undefined) {
        return undefined;
      }
      path.push(point);
    }
  } catch {
    return undefined;
  }
  return path.length >= 2 ? path : undefined;
}

function routeSteps(route: Record<string, unknown>): string[] {
  if (!Array.isArray(route.legs)) {
    return [];
  }
  return route.legs.flatMap((leg) => {
    if (!isRecord(leg) || !Array.isArray(leg.steps)) {
      return [];
    }
    return leg.steps.flatMap((step) => {
      if (!isRecord(step) || !isRecord(step.navigationInstruction)) {
        return [];
      }
      const instruction = step.navigationInstruction.instructions;
      return typeof instruction === "string" && instruction.trim().length > 0
        ? [instruction.trim()]
        : [];
    });
  });
}

function normalizeRouteResponse(payload: unknown): RouteResult {
  if (!isRecord(payload) || !Array.isArray(payload.routes)) {
    return unavailable("Google Routes returned a malformed response");
  }
  const route: unknown = payload.routes[0];
  if (!isRecord(route)) {
    return unavailable("No route returned");
  }
  const durationMinutes = parseDurationMinutes(route.duration);
  const polyline = isRecord(route.polyline)
    ? decodePolyline(route.polyline.encodedPolyline)
    : undefined;
  if (durationMinutes === undefined || polyline === undefined) {
    return unavailable("Google Routes returned an incomplete route");
  }
  const distanceMeters =
    typeof route.distanceMeters === "number" &&
    Number.isFinite(route.distanceMeters) &&
    route.distanceMeters >= 0
      ? route.distanceMeters
      : undefined;
  return {
    status: "ready",
    durationMinutes,
    ...(distanceMeters === undefined ? {} : { distanceMeters }),
    path: polyline,
    steps: routeSteps(route),
  };
}

export class GoogleRouteAdapter implements RouteAdapter {
  private readonly fetch: FetchLike;
  private readonly apiKey: string;
  private readonly transitEnabled: boolean;
  private readonly cache = new Map<string, RouteResult>();
  private readonly inFlight = new Map<string, InFlightRoute>();

  constructor(options: GoogleRouteAdapterOptions) {
    this.apiKey = options.apiKey.trim();
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.transitEnabled = options.transitEnabled ?? false;
  }

  load(request: RouteRequest, signal: AbortSignal): Promise<RouteResult> {
    if (signal.aborted) {
      return Promise.resolve(unavailable("Request aborted"));
    }
    if (this.apiKey.length === 0) {
      return Promise.resolve(unavailable("Google Routes API key is missing"));
    }
    const eligibility = requestEligibility(request, this.transitEnabled);
    if (eligibility !== undefined) {
      return Promise.resolve(unavailable(eligibility));
    }

    const key = routeRequestCacheKey(request);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return Promise.resolve(cloneResult(cached));
    }
    const entry = this.inFlight.get(key) ?? this.startRequest(key, request);
    return this.waitForCaller(key, entry, signal);
  }

  private startRequest(key: string, request: RouteRequest): InFlightRoute {
    const controller = new AbortController();
    const promise = this.resolveRequest(request, controller.signal).then((result) => {
      if (result.status === "ready" && !controller.signal.aborted) {
        this.cache.set(key, cloneResult(result));
      }
      return result;
    });
    const entry: InFlightRoute = { controller, promise, subscribers: 0 };
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
    entry: InFlightRoute,
    signal: AbortSignal,
  ): Promise<RouteResult> {
    entry.subscribers += 1;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: RouteResult, aborted: boolean): void => {
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

  private async resolveRequest(
    request: RouteRequest,
    signal: AbortSignal,
  ): Promise<RouteResult> {
    let lastResult = unavailable("No route returned");
    for (const body of requestAttempts(request)) {
      if (signal.aborted) {
        return unavailable("Request aborted");
      }
      lastResult = await this.fetchAttempt(body, signal);
      if (lastResult.status === "ready") {
        return lastResult;
      }
    }
    return lastResult;
  }

  private async fetchAttempt(
    body: GoogleRouteBody,
    signal: AbortSignal,
  ): Promise<RouteResult> {
    try {
      const response = await this.fetch(ROUTES_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": GOOGLE_ROUTES_FIELD_MASK,
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        return unavailable(
          `Google Routes request failed (${response.status})`,
        );
      }
      const payload: unknown = await response.json();
      return normalizeRouteResponse(payload);
    } catch (error) {
      return unavailable(errorReason(error));
    }
  }
}
