import type { NavigationAdapterV2, NavigationRequestV2 } from "@laugh-tale-island/core/browser";

export interface GoogleNavigationAdapterOptions {
  openExternal?: (url: string) => void;
}

const providers = Object.freeze(["google"] as const);
const supportedModes = new Set(["walking", "driving", "transit"]);

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

function hasProperty(value: unknown, key: PropertyKey): boolean {
  if (!record(value)) return false;
  try {
    return key in value;
  } catch {
    return false;
  }
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || (code >= 127 && code <= 159)) return undefined;
  }
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  return normalized;
}

function point(value: unknown): string | undefined {
  if (
    !record(value) ||
    !hasOwn(value, "lat") ||
    !hasOwn(value, "lng") ||
    hasOwn(value, "latitude") ||
    hasOwn(value, "longitude")
  ) {
    return undefined;
  }
  const lat = get(value, "lat");
  const lng = get(value, "lng");
  return typeof lat === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
    ? `${lat},${lng}`
    : undefined;
}

function appendTarget(
  params: URLSearchParams,
  name: "origin" | "destination",
  value: unknown,
): boolean {
  if (!record(value) || !hasOwn(value, "kind") || !hasOwn(value, "label")) return false;
  const kind = get(value, "kind");
  if (!text(get(value, "label"))) return false;
  if (kind === "coordinates") {
    const coordinates = point(get(value, "coordinates"));
    if (!coordinates) return false;
    params.set(name, coordinates);
    return true;
  }
  if (kind !== "provider-reference") return false;
  if (!hasOwn(value, "providerReference")) return false;
  const reference = get(value, "providerReference");
  if (!record(reference) || !hasOwn(reference, "provider") || !hasOwn(reference, "id")) return false;
  const label = text(get(value, "label"));
  const id = get(reference, "provider") === "google" ? text(get(reference, "id")) : undefined;
  if (!label || !id) return false;
  params.set(name, label);
  params.set(`${name}_place_id`, id);
  return true;
}

export function createGoogleMapsUrl(request: NavigationRequestV2): string | null {
  try {
    if (!record(request)) return null;
    if (!hasOwn(request, "kind")) return null;
    const kind = get(request, "kind");
    const params = new URLSearchParams({ api: "1" });
    if (kind === "place") {
      if (!hasOwn(request, "destination")) return null;
      if (!appendTarget(params, "destination", get(request, "destination"))) return null;
      const destination = params.get("destination");
      if (!destination) return null;
      const placeId = params.get("destination_place_id");
      params.delete("destination");
      params.delete("destination_place_id");
      params.set("query", destination);
      if (placeId) params.set("query_place_id", placeId);
      return `https://www.google.com/maps/search/?${params.toString()}`;
    }

    if (kind === "authored-external") {
      if (!hasOwn(request, "origin") || !hasOwn(request, "destination")) return null;
      const origin = text(get(request, "origin"));
      const destination = text(get(request, "destination"));
      if (!origin || !destination) return null;
      params.set("origin", origin);
      params.set("destination", destination);
      if (!hasOwn(request, "travelMode") && hasProperty(request, "travelMode")) return null;
      let travelMode: unknown;
      try {
        travelMode = (request as unknown as Record<PropertyKey, unknown>).travelMode;
      } catch {
        return null;
      }
      if (!hasOwn(request, "travelMode") || travelMode === undefined) {
        return `https://www.google.com/maps/dir/?${params.toString()}`;
      }
      if (typeof travelMode === "string" && supportedModes.has(travelMode)) {
        params.set("travelmode", travelMode);
      } else if (travelMode !== "flight" && travelMode !== "unknown") {
        return null;
      }
      return `https://www.google.com/maps/dir/?${params.toString()}`;
    }

    if (kind !== "route") return null;
    if (
      !hasOwn(request, "origin") ||
      !hasOwn(request, "destination") ||
      !hasOwn(request, "travelMode")
    ) {
      return null;
    }
    const travelMode = get(request, "travelMode");
    if (typeof travelMode !== "string" || !supportedModes.has(travelMode)) return null;
    if (
      !appendTarget(params, "origin", get(request, "origin")) ||
      !appendTarget(params, "destination", get(request, "destination"))
    ) {
      return null;
    }
    params.set("travelmode", travelMode);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  } catch {
    return null;
  }
}

function defaultOpenExternal(url: string): void {
  if (typeof globalThis.open === "function") {
    globalThis.open(url, "_blank", "noopener,noreferrer");
  }
}

export class GoogleNavigationAdapter implements NavigationAdapterV2 {
  readonly supportedPlaceProviders = providers;
  private readonly openExternal: (url: string) => void;

  constructor(options: GoogleNavigationAdapterOptions = {}) {
    const supplied = get(options, "openExternal");
    this.openExternal = hasOwn(options, "openExternal") && typeof supplied === "function"
      ? (supplied as (url: string) => void)
      : defaultOpenExternal;
  }

  open(request: NavigationRequestV2): boolean {
    const url = createGoogleMapsUrl(request);
    if (!url) return false;
    this.openExternal(url);
    return true;
  }
}
