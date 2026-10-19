import { canonicalizeJson } from "./canonical-json.mjs";

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} must be nonblank`);
  return value.trim();
}

function canonicalLocale(value) {
  const locale = requiredText(value, "locale");
  const locales = Intl.getCanonicalLocales(locale);
  if (locales.length !== 1) throw new Error("locale must be a valid locale tag");
  return locales[0];
}

function cloneBias(value) {
  const { lat, lng } = value.center;
  const { radiusMeters } = value;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || !Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > 50_000) {
    throw new Error("locationBias must have valid coordinates and radius");
  }
  return Object.freeze({ center: Object.freeze({ lat, lng }), radiusMeters });
}

export function createPortablePlaceSearchQuery(input) {
  const regionCode = input.regionCode?.trim();
  if (regionCode !== undefined && !/^[A-Za-z]{2}$/.test(regionCode)) throw new Error("regionCode must be a two-letter code");
  return Object.freeze({
    ownerId: requiredText(input.ownerId, "ownerId"), text: requiredText(input.text, "text"), locale: canonicalLocale(input.locale),
    ...(regionCode === undefined ? {} : { regionCode: regionCode.toUpperCase() }),
    ...(input.locationBias === undefined ? {} : { locationBias: cloneBias(input.locationBias) }),
    maxCandidates: 3,
  });
}

const EXACT_UTC_MILLISECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function createPortablePlaceResolutionProvenance(input) {
  const query = input.query;
  if (query.maxCandidates !== 3) throw new Error("maxCandidates must be 3");
  const clonedQuery = createPortablePlaceSearchQuery(query);
  const observedAt = input.observedAt;
  if (typeof observedAt !== "string" || !EXACT_UTC_MILLISECOND.test(observedAt) || !Number.isFinite(new Date(observedAt).valueOf()) || new Date(observedAt).toISOString() !== observedAt) {
    throw new Error("observedAt must be an exact UTC-millisecond timestamp");
  }
  return Object.freeze({ schemaVersion: 1, ownerId: requiredText(input.ownerId, "ownerId"), source: requiredText(input.source, "source"), query: clonedQuery, provider: requiredText(input.provider, "provider"), observedAt });
}

export function assertPortableEnrichmentConformance(core) {
  const base = { ownerId: " place:cafe ", text: " Cafe ", locale: "ZH-hant-tw" };
  const validQueries = [base, { ...base, regionCode: " jp " }, { ...base, locationBias: { center: { lat: -90, lng: 180 }, radiusMeters: 0.1 } }];
  const invalidQueries = [{ ...base, ownerId: " " }, { ...base, text: " " }, { ...base, regionCode: "JPN" }, { ...base, locationBias: { center: { lat: 91, lng: 0 }, radiusMeters: 1 } }];
  const compare = (name, portable, coreCall, valid) => {
    let left; let right; let leftError; let rightError;
    try { left = portable(); } catch (error) { leftError = error; }
    try { right = coreCall(); } catch (error) { rightError = error; }
    if (Boolean(leftError) !== Boolean(rightError) || (valid && (leftError || canonicalizeJson(left) !== canonicalizeJson(right))) || (!valid && !leftError)) {
      throw new Error(`portable enrichment conformance mismatch: ${name}`);
    }
  };
  validQueries.forEach((value, index) => compare(`query valid ${index}`, () => createPortablePlaceSearchQuery(value), () => core.createPlaceSearchQuery(value), true));
  invalidQueries.forEach((value, index) => compare(`query invalid ${index}`, () => createPortablePlaceSearchQuery(value), () => core.createPlaceSearchQuery(value), false));
  const query = createPortablePlaceSearchQuery(base);
  const provenance = { ownerId: "place:cafe", source: "itinerary", query, provider: "google", observedAt: "2026-09-04T10:11:12.000Z" };
  compare("provenance valid", () => createPortablePlaceResolutionProvenance(provenance), () => core.createPlaceResolutionProvenance(provenance), true);
  for (const [name, changes] of [["offset", { observedAt: "2026-09-04T18:11:12.000+08:00" }], ["calendar", { observedAt: "2026-02-30T10:11:12.000Z" }], ["provider", { provider: " " }]]) {
    const value = { ...provenance, ...changes };
    compare(`provenance ${name}`, () => createPortablePlaceResolutionProvenance(value), () => core.createPlaceResolutionProvenance(value), false);
  }
}
