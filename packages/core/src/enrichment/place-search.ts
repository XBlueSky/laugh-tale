import type { Coordinates, ProviderReference } from "../model.js";
import type { ProviderUnavailableResult } from "../provider-failure.js";

export interface PlaceSearchQuery {
  ownerId: string;
  text: string;
  locale: string;
  regionCode?: string;
  locationBias?: { center: Coordinates; radiusMeters: number };
  maxCandidates: 3;
}

export interface PlaceSearchCandidate {
  providerReference: ProviderReference;
  displayName: string;
  coordinates?: Coordinates;
  formattedAddress?: string;
  categories: readonly string[];
}

export type PlaceSearchResult =
  | { status: "ready"; candidates: readonly PlaceSearchCandidate[] }
  | ProviderUnavailableResult;

export interface PlaceSearchAdapter {
  search(query: PlaceSearchQuery, signal: AbortSignal): Promise<PlaceSearchResult>;
}

type LocationBias = NonNullable<PlaceSearchQuery["locationBias"]>;

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${field} must be nonblank.`);
  return normalized;
}

function canonicalLocale(locale: string): string {
  const normalized = requiredText(locale, "locale");
  const locales = Intl.getCanonicalLocales(normalized);
  if (locales.length !== 1) throw new Error("locale must be a valid locale tag.");
  return locales[0];
}

function cloneLocationBias(value: LocationBias): LocationBias {
  const { lat, lng } = value.center;
  const { radiusMeters } = value;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180 ||
    !Number.isFinite(radiusMeters) ||
    radiusMeters <= 0 ||
    radiusMeters > 50_000
  ) {
    throw new Error("locationBias must have valid coordinates and a radius in (0, 50_000].");
  }

  return { center: { lat, lng }, radiusMeters };
}

export function createPlaceSearchQuery(input: {
  ownerId: string;
  text: string;
  locale: string;
  regionCode?: string;
  locationBias?: { center: Coordinates; radiusMeters: number };
}): PlaceSearchQuery {
  const regionCode = input.regionCode?.trim();
  if (regionCode !== undefined && !/^[A-Za-z]{2}$/.test(regionCode)) {
    throw new Error("regionCode must be a two-letter code.");
  }

  return {
    ownerId: requiredText(input.ownerId, "ownerId"),
    text: requiredText(input.text, "text"),
    locale: canonicalLocale(input.locale),
    ...(regionCode === undefined ? {} : { regionCode: regionCode.toUpperCase() }),
    ...(input.locationBias === undefined ? {} : { locationBias: cloneLocationBias(input.locationBias) }),
    maxCandidates: 3,
  };
}

export function clonePlaceSearchQuery(query: PlaceSearchQuery): PlaceSearchQuery {
  if (query.maxCandidates !== 3) throw new Error("maxCandidates must be 3.");

  return createPlaceSearchQuery({
    ownerId: query.ownerId,
    text: query.text,
    locale: query.locale,
    ...(query.regionCode === undefined ? {} : { regionCode: query.regionCode }),
    ...(query.locationBias === undefined ? {} : { locationBias: query.locationBias }),
  });
}
