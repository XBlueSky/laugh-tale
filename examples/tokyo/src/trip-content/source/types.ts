import type { RouteMode } from "@laugh-tale-island/core";

export type SourceKind =
  | "transfer"
  | "lodging"
  | "dining"
  | "shopping"
  | "sightseeing"
  | "experience";

export type LegMode = RouteMode | "unknown";

export interface SourceStop {
  /** ASCII slug, lowercase, hyphenated; combined with day and sequence into the node ID. */
  slug: string;
  /** User-supplied title, copied verbatim from the approved itinerary. */
  title: string;
  /** Agent inference, not a user fact. */
  kind: SourceKind;
}

export interface SourceDay {
  id: string;
  date: string;
  title: string;
  stops: SourceStop[];
  /** legs[i] is the user-supplied movement mode from stops[i] to stops[i + 1]. Length is stops.length - 1. */
  legs: LegMode[];
}

export interface SourceItinerary {
  title: string;
  timezone: string;
  startDate: string;
  endDate: string;
  days: SourceDay[];
}

export type ResolvedPlaceRecord =
  | {
      status: "resolved";
      placeId: string;
      lat: number;
      lng: number;
      displayName: string;
      formattedAddress: string;
      queriedAs: string;
    }
  | { status: "unresolved"; reason: string; queriedAs: string };

/** Keyed by the authored title. The same title in several nodes shares one record. */
export type ResolvedPlaces = Record<string, ResolvedPlaceRecord>;

/** Narrows the imported JSON, which TypeScript types structurally, to the record shape. */
export function asResolvedPlaces(value: unknown): ResolvedPlaces {
  return value as ResolvedPlaces;
}

const KINDS: ReadonlySet<string> = new Set([
  "transfer",
  "lodging",
  "dining",
  "shopping",
  "sightseeing",
  "experience",
]);
const LEGS: ReadonlySet<string> = new Set(["walking", "transit", "driving", "flight", "unknown"]);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(path: string, message: string): never {
  throw new Error(`tokyo-itinerary.json ${path}: ${message}`);
}

export function assertSourceItinerary(value: unknown): SourceItinerary {
  if (typeof value !== "object" || value === null) fail("", "must be an object");
  const v = value as Record<string, unknown>;
  for (const key of ["title", "timezone", "startDate", "endDate"]) {
    if (typeof v[key] !== "string" || v[key] === "") fail(key, "must be a non-empty string");
  }
  if (!Array.isArray(v.days) || v.days.length === 0) fail("days", "must be a non-empty array");
  v.days.forEach((day, dayIndex) => {
    const d = day as Record<string, unknown>;
    const path = `days[${dayIndex}]`;
    if (typeof d.id !== "string" || !SLUG.test(d.id)) fail(`${path}.id`, "must be a slug");
    if (typeof d.date !== "string" || !DATE.test(d.date)) fail(`${path}.date`, "must be YYYY-MM-DD");
    if (typeof d.title !== "string" || d.title === "") fail(`${path}.title`, "must be a non-empty string");
    if (!Array.isArray(d.stops) || d.stops.length === 0) fail(`${path}.stops`, "must be a non-empty array");
    d.stops.forEach((stop, stopIndex) => {
      const s = stop as Record<string, unknown>;
      const sp = `${path}.stops[${stopIndex}]`;
      if (typeof s.slug !== "string" || !SLUG.test(s.slug)) fail(`${sp}.slug`, "must be a slug");
      if (typeof s.title !== "string" || s.title.trim() === "") fail(`${sp}.title`, "must be a non-empty string");
      if (typeof s.kind !== "string" || !KINDS.has(s.kind)) fail(`${sp}.kind`, "unknown kind");
    });
    if (!Array.isArray(d.legs) || d.legs.length !== d.stops.length - 1) {
      fail(`${path}.legs`, `must have ${d.stops.length - 1} entries`);
    }
    d.legs.forEach((leg, legIndex) => {
      if (typeof leg !== "string" || !LEGS.has(leg)) fail(`${path}.legs[${legIndex}]`, "unknown mode");
    });
  });
  return value as SourceItinerary;
}
