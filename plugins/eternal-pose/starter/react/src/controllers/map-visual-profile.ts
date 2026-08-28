import type {
  CandidateOption,
  MapPlacePresentation,
  MapRoutePresentation,
} from "@laugh-tale-island/core";

import type {
  MapMarkerVisual,
  MapRouteVisual,
  MapVisualProfile,
} from "./presentation-contract";
import { resolveMapFallbackPaint } from "./map-fallback-paint";

export type {
  MapMarkerPart,
  MapMarkerVisual,
  MapRouteVisual,
  MapVisualProfile,
} from "./presentation-contract";

const MARKER_FIXTURES: readonly MapPlacePresentation[] = [
  "default",
  "candidate",
  "selected",
  "completed",
  "skipped",
].map((tone, index) => ({
  ownerId: `profile-marker-${tone}`,
  label: `Profile ${tone} marker`,
  coordinates: { lat: 25 + index / 100, lng: 121 + index / 100 },
  tone: tone as MapPlacePresentation["tone"],
}));

const CANDIDATE_FIXTURES: readonly CandidateOption[] = [
  {
    id: "profile-candidate-a",
    title: "Candidate A",
    place: { name: "Candidate A", certainty: "candidate" },
  },
  {
    id: "profile-candidate-b",
    title: "Candidate B",
    place: { name: "Candidate B", certainty: "candidate" },
  },
];

const ROUTE_TONES = ["default", "selected", "unavailable"] as const;
const ROUTE_SOURCES = ["manual", "provider", "recomposed"] as const;
const ROUTE_CERTAINTIES = [
  "confirmed",
  "suggested",
  "candidate",
  "unverified",
] as const;
const ROUTE_MODES = ["walking", "transit", "driving", "flight"] as const;
const BASEMAP_MODES = [
  "neutral",
  "topographic",
  "flat",
  "technical",
  "coastal",
  "subdued",
] as const;
const BASEMAP_DENSITIES = ["low", "medium", "high"] as const;
const BASEMAP_CONTRASTS = ["soft", "standard", "high"] as const;
const BASEMAP_POI = ["minimal", "standard"] as const;
const BASEMAP_KEYS = ["mode", "density", "contrast", "poi"] as const;

const ROUTE_FIXTURES: readonly MapRoutePresentation[] = ROUTE_TONES.flatMap(
  (tone) =>
    ROUTE_SOURCES.flatMap((source) =>
      ROUTE_CERTAINTIES.flatMap((certainty) =>
        ROUTE_MODES.map((mode) => ({
          edgeId: `profile-${tone}-${source}-${certainty}-${mode}`,
          path:
            tone === "unavailable"
              ? []
              : [
                  { lat: 25, lng: 121 },
                  { lat: 25.01, lng: 121.01 },
                ],
          tone,
          source,
          certainty,
          mode,
        })),
      ),
    ),
);

function assertNonBlank(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Map visual profile ${label} must be nonblank`);
  }
}

function assertOpacity(value: unknown, label: string): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(`Map visual profile ${label} must be finite and within [0,1]`);
  }
}

function assertPositive(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Map visual profile ${label} must be finite and positive`);
  }
}

function assertEnumMember<const Member extends string>(
  value: unknown,
  allowed: readonly Member[],
  label: string,
): asserts value is Member {
  if (typeof value !== "string" || !allowed.includes(value as Member)) {
    throw new Error(
      `Map visual profile ${label} must be one of ${allowed.join(", ")}`,
    );
  }
}

function assertBasemap(value: unknown): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Map visual profile basemap must be an object");
  }
  const basemap = value as Record<string, unknown>;
  for (const key of Reflect.ownKeys(basemap)) {
    if (
      typeof key !== "string" ||
      !BASEMAP_KEYS.includes(key as (typeof BASEMAP_KEYS)[number])
    ) {
      throw new Error(`Map visual profile basemap.${String(key)} is not allowed`);
    }
  }
  for (const key of BASEMAP_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(basemap, key)) {
      throw new Error(`Map visual profile basemap.${key} is required`);
    }
  }
  assertEnumMember(basemap.mode, BASEMAP_MODES, "basemap.mode");
  assertEnumMember(basemap.density, BASEMAP_DENSITIES, "basemap.density");
  assertEnumMember(basemap.contrast, BASEMAP_CONTRASTS, "basemap.contrast");
  assertEnumMember(basemap.poi, BASEMAP_POI, "basemap.poi");
}

function assertFallbackPaint(value: unknown, label: string): asserts value is string {
  assertNonBlank(value, label);
  if (resolveMapFallbackPaint(value) === undefined) {
    throw new Error(`Map visual profile ${label} must be a safe paint value`);
  }
}

function assertMarkerVisual(visual: MapMarkerVisual, label: string): void {
  if (visual === null || typeof visual !== "object") {
    throw new Error(`Map visual profile ${label} must return a marker visual`);
  }
  assertNonBlank(visual.title, `${label} title`);
  assertNonBlank(visual.className, `${label} class`);
  assertNonBlank(visual.label, `${label} label`);
  const rawParts: unknown = visual.parts;
  if (!Array.isArray(rawParts)) {
    throw new Error(`Map visual profile ${label} parts must be an array`);
  }
  rawParts.forEach((rawPart, index) => {
    const part: unknown = rawPart;
    if (part === null || typeof part !== "object") {
      throw new Error(`Map visual profile ${label} part ${index} must be an object`);
    }
    if (!("className" in part) || !("text" in part)) {
      throw new Error(`Map visual profile ${label} part ${index} is incomplete`);
    }
    assertNonBlank(part.className, `${label} part class`);
    if (typeof part.text !== "string") {
      throw new Error(`Map visual profile ${label} part text must be a string`);
    }
  });
  if (visual.fallback === null || typeof visual.fallback !== "object") {
    throw new Error(`Map visual profile ${label} fallback must be an object`);
  }
  assertFallbackPaint(visual.fallback.fill, `${label} fallback fill`);
  assertFallbackPaint(visual.fallback.stroke, `${label} fallback stroke`);
  assertFallbackPaint(
    visual.fallback.labelColor,
    `${label} fallback label color`,
  );
  if (typeof visual.fallback.text !== "string") {
    throw new Error(`Map visual profile ${label} fallback text must be a string`);
  }
  if (
    typeof visual.fallback.size !== "number" ||
    !Number.isFinite(visual.fallback.size) ||
    visual.fallback.size < 44 ||
    visual.fallback.size > 96
  ) {
    throw new Error(
      `Map visual profile ${label} fallback size must be finite and within [44,96]`,
    );
  }
  if (!(["circle", "square", "diamond"] as const).includes(visual.fallback.shape)) {
    throw new Error(
      `Map visual profile ${label} fallback shape must be circle, square, or diamond`,
    );
  }
  if (
    typeof visual.fallback.strokeWidth !== "number" ||
    !Number.isFinite(visual.fallback.strokeWidth) ||
    visual.fallback.strokeWidth <= 0 ||
    visual.fallback.strokeWidth > visual.fallback.size / 2
  ) {
    throw new Error(
      `Map visual profile ${label} fallback stroke width must be finite and fit the marker`,
    );
  }
}

function assertRouteVisual(visual: MapRouteVisual, label: string): void {
  if (visual === null || typeof visual !== "object") {
    throw new Error(`Map visual profile ${label} must return a route visual`);
  }
  assertNonBlank(visual.stroke, `${label} stroke`);
  assertOpacity(visual.opacity, `${label} opacity`);
  assertPositive(visual.width, `${label} width`);
  if (visual.casing !== undefined) {
    if (visual.casing === null || typeof visual.casing !== "object") {
      throw new Error(`Map visual profile ${label} casing must be an object`);
    }
    assertNonBlank(visual.casing.stroke, `${label} casing stroke`);
    assertOpacity(visual.casing.opacity, `${label} casing opacity`);
    assertPositive(visual.casing.width, `${label} casing width`);
  }
  if (visual.dash !== undefined) {
    if (!Array.isArray(visual.dash)) {
      throw new Error(`Map visual profile ${label} dash must be an array`);
    }
    for (const value of visual.dash) {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0
      ) {
        throw new Error(
          `Map visual profile ${label} dash values must be finite and non-negative`,
        );
      }
    }
  }
}

export function assertMapVisualProfile(profile: MapVisualProfile): void {
  if (profile === null || typeof profile !== "object") {
    throw new Error("Map visual profile must be an object");
  }
  assertNonBlank(profile.id, "id");
  assertBasemap(profile.basemap);

  for (const [index, option] of CANDIDATE_FIXTURES.entries()) {
    assertNonBlank(
      profile.candidateTitle(3, index, option),
      "candidate title",
    );
  }
  for (const [index, place] of MARKER_FIXTURES.entries()) {
    assertMarkerVisual(profile.marker(place, index), "marker");
  }
  assertMarkerVisual(profile.userLocation(), "user-location marker");
  for (const route of ROUTE_FIXTURES) {
    assertRouteVisual(profile.route(route), "route");
  }
}
