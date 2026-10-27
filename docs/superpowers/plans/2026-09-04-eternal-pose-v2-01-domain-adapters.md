# Eternal Pose v2 Phase 01: Domain Truth and Google Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the truthful v2 trip/place/route model, final provider-neutral adapter contracts, Google browser and Node implementations, deterministic testing primitives, and the four-package acyclic release graph required before choreography or presentation work begins.

**Architecture:** `@laugh-tale-island/core` owns authored truth, runtime result types, opening-hours evaluation, route quarantine, enrichment policy, and neutral browser DTOs. `@laugh-tale-island/adapters` implements those contracts only under `./google` and `./google/node`. `@laugh-tale-island/testing` is a leaf that supplies marked fakes, fixtures, and conformance runners. React may coordinate request lifecycle, but neither React nor an adapter may invent facts or decide visible wording. This phase defines camera DTOs for the adapter boundary but deliberately leaves usable-region calculation and camera-intent resolution to Phase 02.

**Tech Stack:** Node 22.13+, npm 11, TypeScript 5.9 with NodeNext ESM, React 19.2, Vitest 4, jsdom 30, `@js-temporal/polyfill` 0.5.1, Google Maps JavaScript API loader 2.1.1, Google Routes API, and Google Places API (New).

**Spec:** `docs/superpowers/specs/2026-09-04-eternal-pose-v2-oak-washi-flagship-design.md`

**Master ledger:** `docs/superpowers/plans/2026-09-04-eternal-pose-v2-implementation-roadmap.md`

## Phase Boundary

This phase closes the domain/provider prerequisites for later camera work:

- baseline R6 and M4: explicit `unknown` routes and explicit unresolved place identity;
- baseline A12: truthful opening-hours facts and evaluation;
- baseline F6/M1: malformed, implausible, endpoint-mismatched, and geographically remote route results are quarantined before map projection;
- baseline M5: successful transit responses retain provider duration and line facts;
- ADR-0004: Google browser and Node implementations sit behind neutral package contracts;
- ADR-0002: the four-package DAG and lockstep artifact checks exist.

This phase does **not** implement `ExperienceChoreographyState`, usable-region selection, numeric camera policy, `TripController`, Oak & Washi JSX/CSS, Enrich filesystem transactions, project schema 2, the Tokyo regeneration, or release promotion. Those belong to Plans 02, 03, 04, 05, and 06 respectively. The current starter and `examples/tokyo` may continue to contain their 1.0 provider copies until their generated runtime is replaced in the later plans; do not hand-edit those generated runtime trees in this phase. There is no published 1.0 compatibility layer and no 1.0 migration command.

## Global Constraints

- Execute after the roadmap's isolated-worktree and baseline task has passed.
- Use the exact public names in the roadmap ledger: `ProviderFailureReason`, `MapAdapterV2`, `RouteAdapterV2`, `PlaceAdapterV2`, `RouteRequestV2`, `RouteProviderResult`, `CameraIntent`, `CameraSnapshot`, and `MapMountConfig`.
- Cross-package versions are exactly `2.0.0` in this plan. Internal dependencies never use ranges, `workspace:`, `file:`, Git, or tags.
- Final runtime DAG: core has no Laugh Tale dependency; React depends exactly on core; adapters depends exactly on core; testing depends exactly on core, React, and adapters. No production package imports testing.
- The Google Maps SDK is an optional peer of adapters and is imported only from `@laugh-tale-island/adapters/google`. `@laugh-tale-island/adapters/google/node` must remain importable without the browser SDK or DOM.
- Browser runtime place lookup accepts an already-reviewed provider reference only. Text search and candidate disambiguation exist only under the Node enrichment boundary.
- Raw provider text is diagnostic data. Public unavailable states expose a stable `ProviderFailureReason`, a retryability bit, and an optional diagnostic string; presentation code must never use the diagnostic as copy.
- A provider result never mutates authored route mode, summary, certainty, external-navigation capability, place identity, or place certainty.
- Opening hours never use the provider's transient `openNow` flag as authoritative output. Core evaluates complete periods at an explicit instant in the Trip timezone.
- Google route results are normalized first and then passed through the core route validator. Only validated geometry may enter `MapPresentationV2` or later camera bounds.
- No task performs live Google calls. All provider tests use injected `fetch`, injected loader bindings, and deterministic fixtures.
- Use one focused red test before implementation in every task. Observe the named failure, implement the minimum complete behavior, run the task's green commands, run `git diff --check`, and commit only the files listed for that task.

## Phase-Owned Public Contracts

The following are the complete Phase 01 shapes. Later plans consume them without renaming.

### Authored identity and Trip facts

```ts
// packages/core/src/model.ts
export type RouteMode = "walking" | "transit" | "driving" | "flight" | "unknown";

export type TimelineRole =
  | "primary"
  | "base"
  | "journey"
  | "connector"
  | "task"
  | "logistics-group";

export type MarkerMode = "numbered" | "base" | "none";

export interface ProviderReference {
  provider: string;
  id: string;
}

export type PlaceUnresolvedReason =
  | "not-reviewed"
  | "no-accepted-candidate"
  | "ambiguous";

export type ResolvedPlaceIdentity =
  | {
      status: "resolved";
      coordinates: Coordinates;
      providerReference?: ProviderReference;
    }
  | {
      status: "resolved";
      providerReference: ProviderReference;
      coordinates?: never;
    };

export type PlaceIdentity =
  | ResolvedPlaceIdentity
  | { status: "unresolved"; reason: PlaceUnresolvedReason };

export interface PlaceRef {
  name: string;
  certainty: FactCertainty;
  identity: PlaceIdentity;
}

export interface Trip {
  id: string;
  title: string;
  locale: string;
  timezone: string;
  startDate: string;
  endDate: string;
  destinationLabel?: string;
  travelerLabel?: string;
  clockPlaceLabel?: string;
  days: TripDay[];
  routes: RouteEdge[];
  candidateGroups: CandidateGroup[];
  reservations: Reservation[];
  tasks: TripTask[];
}
```

`CustomNode.payload.presentationRole` is required and is limited to `"primary" | "journey" | "task"`; `base` remains lodging-only and `connector` remains route-only. `PlaceRef` no longer has top-level `coordinates` or Google-shaped `{ name, placeId }` data.

### Provider and runtime truth

```ts
// packages/core/src/provider-failure.ts
export type ProviderFailureReason =
  | "missing-configuration"
  | "loader-failed"
  | "request-denied"
  | "not-found"
  | "malformed-response"
  | "implausible-result"
  | "network"
  | "cancelled"
  | "unsupported";

export interface ProviderUnavailableResult {
  status: "unavailable";
  reason: ProviderFailureReason;
  retryable: boolean;
  diagnostic?: string;
}

// packages/core/src/route-runtime.ts
export interface RouteEndpointV2 {
  ownerId: string;
  label: string;
  identity: ResolvedPlaceIdentity;
}

export interface RouteRequestV2 {
  edge: RouteEdge;
  origin: RouteEndpointV2;
  destination: RouteEndpointV2;
  departureAt?: string;
  transitPreferences?: {
    allowedModes?: readonly ("subway" | "rail" | "bus")[];
  };
}

export interface TransitLineFact {
  name?: string;
  shortName?: string;
}

export interface RouteProviderReadyResult {
  status: "ready";
  durationMinutes: number;
  distanceMeters?: number;
  steps: readonly string[];
  geometry?: readonly Coordinates[];
  transit?: { lines: readonly TransitLineFact[] };
}

export type RouteProviderResult = RouteProviderReadyResult | ProviderUnavailableResult;
export type RouteRuntimeState =
  | { status: "idle" }
  | { status: "loading" }
  | RouteProviderResult;

// packages/core/src/place-runtime.ts
export interface PlaceRequestV2 {
  ownerId: string;
  providerReference: ProviderReference;
  locale: string;
  timeZone: string;
}

export type BusinessStatus =
  | "operational"
  | "temporarily-closed"
  | "permanently-closed"
  | "unknown";

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WeeklyClockTime {
  day: WeekdayIndex;
  hour: number;
  minute: number;
}

export interface OpeningPeriod {
  open: WeeklyClockTime;
  close?: WeeklyClockTime;
}

export type OpeningHoursFacts =
  | { kind: "always-open" }
  | {
      kind: "weekly";
      completeness: "complete" | "incomplete";
      periods: readonly OpeningPeriod[];
    };

export interface PlaceRuntimeFacts {
  formattedAddress?: string;
  businessStatus?: BusinessStatus;
  openingHours?: OpeningHoursFacts;
}

export type PlaceProviderResult =
  | { status: "ready"; facts: PlaceRuntimeFacts }
  | ProviderUnavailableResult;

export type PlaceRuntimeState =
  | { status: "idle" }
  | { status: "loading" }
  | PlaceProviderResult;

export type PlaceOpeningState =
  | { status: "open" }
  | { status: "closed" }
  | { status: "unknown"; reason: "absent" | "incomplete" | "invalid" };

export function evaluateOpeningHours(
  facts: OpeningHoursFacts | undefined,
  instant: string,
  timeZone: string,
): PlaceOpeningState;
```

### Enrichment boundary

```ts
// packages/core/src/enrichment/place-search.ts
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

export interface PlaceResolutionProvenance {
  schemaVersion: 1;
  ownerId: string;
  source: string;
  query: PlaceSearchQuery;
  provider: string;
  observedAt: string;
}

export function createPlaceSearchQuery(input: {
  ownerId: string;
  text: string;
  locale: string;
  regionCode?: string;
  locationBias?: { center: Coordinates; radiusMeters: number };
}): PlaceSearchQuery;

export function createPlaceResolutionProvenance(input: {
  ownerId: string;
  source: string;
  query: PlaceSearchQuery;
  provider: string;
  observedAt: string;
}): PlaceResolutionProvenance;
```

The helpers validate and normalize values; they do not read environment variables, call a provider, select a candidate, or write a ledger. Phase 05 owns review/accept filesystem transactions and RFC 8785 ledger hashing.

### Total semantic day projection and navigation truth

```ts
// packages/core/src/navigation-target.ts
export type NavigationTargetV2 =
  | {
      kind: "coordinates";
      label: string;
      coordinates: Coordinates;
    }
  | {
      kind: "provider-reference";
      label: string;
      providerReference: ProviderReference;
    };

export function deriveNavigationTarget(
  place: PlaceRef | undefined,
  supportedProviders: readonly string[],
): NavigationTargetV2 | null;

// packages/core/src/semantic-state.ts
export type SemanticOwnerState =
  | "current"
  | "next"
  | "viewing"
  | "selected"
  | "completed"
  | "skipped"
  | "candidate"
  | "unresolved";

// packages/core/src/semantic-projection.ts
export type NodeTimelineRole = "primary" | "base" | "journey" | "task";

export interface SemanticNodeProjection {
  kind: "node";
  ownerId: string;
  nodeId: string;
  label: string;
  sourceKind: TripNode["kind"];
  role: NodeTimelineRole;
  markerMode: MarkerMode;
  displayIndex?: number;
  ordinal?: string;
  timing: TimingCertainty;
  states: readonly SemanticOwnerState[];
  incomingRouteIds: readonly string[];
  navigationTarget: NavigationTargetV2 | null;
  node: TripNode;
}

export interface SemanticRouteProjection {
  kind: "route";
  ownerId: string;
  routeId: string;
  role: "connector";
  states: readonly SemanticOwnerState[];
  route: RoutePresentation;
}

export interface SemanticLogisticsGroupProjection {
  kind: "logistics-group";
  ownerId: string;
  role: "logistics-group";
  childOwnerIds: readonly string[];
  incomingRouteIds: readonly string[];
  children: readonly SemanticNodeProjection[];
}

export interface SemanticCandidateProjection {
  kind: "candidate";
  ownerId: string;
  optionId: string;
  parentOwnerId: string;
  label: string;
  sourceKind: TripNode["kind"];
  role: "primary";
  markerMode: "numbered";
  ordinal: string;
  timing: TimingCertainty;
  states: readonly SemanticOwnerState[];
  navigationTarget: NavigationTargetV2 | null;
  option: CandidateOption;
}

export interface SemanticMapOwnerProjection {
  ownerId: string;
  label: string;
  sourceKind: TripNode["kind"];
  markerMode: "numbered" | "base";
  displayIndex?: number;
  ordinal?: string;
  timing: TimingCertainty;
  states: readonly SemanticOwnerState[];
  coordinates: Coordinates;
}

export type SemanticTimelineEntry =
  | SemanticNodeProjection
  | SemanticRouteProjection
  | SemanticLogisticsGroupProjection;

export interface DaySemanticProjection {
  entries: readonly SemanticTimelineEntry[];
  candidates: readonly SemanticCandidateProjection[];
  mapOwners: readonly SemanticMapOwnerProjection[];
}

export interface DaySemanticProjectionInput {
  day: EffectiveDay;
  routes: readonly RouteEdge[];
  candidateGroups: readonly CandidateGroup[];
  currentNodeId: string | null;
  nextNodeId: string | null;
  viewingOwnerId: string | null;
  selectedOwnerId: string | null;
  supportedNavigationProviders: readonly string[];
}

export function timelineRoleForNode(node: TripNode): NodeTimelineRole;

export function formatCandidateOrdinal(
  parentDisplayIndex: number,
  zeroBasedOptionIndex: number,
): string;

export function buildDaySemanticProjection(
  input: DaySemanticProjectionInput,
): DaySemanticProjection;
```

`ownerId` is the existing authored node, route, or candidate-option ID; validation makes those three itinerary-owner namespaces mutually unique. A derived logistics-group owner is exactly `logistics-group:${JSON.stringify(orderedChildOwnerIds)}`. State arrays are deduplicated in the declared union order. Only a `primary` node has `displayIndex`; candidate options have `ordinal` instead and use spreadsheet-style lowercase suffixes (`1a`…`1z`, `1aa`…) in authored option order.

`deriveNavigationTarget` prefers a nonblank provider reference when its provider exactly matches one of the adapter-declared supported providers, otherwise uses valid coordinates, otherwise returns `null`. It never uses the label as a geocoding query. Consequently an unresolved place or a resolved place carrying only an unsupported foreign reference has no navigation target, while a foreign reference accompanied by valid coordinates remains navigable by coordinates.

### Browser adapter and map DTOs

```ts
// packages/core/src/map-camera.ts
export interface MapViewportMetrics {
  width: number;
  height: number;
}

// x/y are CSS pixels relative to the map viewport's top-left corner.
export interface OcclusionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UsableRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type CameraTransition = "animate" | "immediate";

export interface CameraIntentBase {
  intentId: string;
  transition: CameraTransition;
  viewport: MapViewportMetrics;
  usableRegion: UsableRegion;
  edgeInsets: EdgeInsets;
}

export interface FitCameraIntent extends CameraIntentBase {
  kind: "fit";
  points: readonly Coordinates[];
  paths: readonly (readonly Coordinates[])[];
  maximumZoom: number;
}

export interface FocusCameraIntent extends CameraIntentBase {
  kind: "focus";
  coordinate: Coordinates;
  targetZoom: number;
}

export interface RecenterUserCameraIntent extends CameraIntentBase {
  kind: "recenter-user";
  coordinate: Coordinates;
  targetZoom: number;
}

export type CameraIntent = FitCameraIntent | FocusCameraIntent | RecenterUserCameraIntent;

export interface CameraSnapshot {
  zoom: number;
}

// packages/core/src/browser/v2-map.ts
export type MarkerSemanticState = SemanticOwnerState;

export interface MarkerDescriptor {
  ownerId: string;
  label: string;
  coordinates: Coordinates;
  markerMode: Exclude<MarkerMode, "none">;
  displayIndex?: number;
  ordinal?: string;
  sourceKind: string;
  timing: TimingCertainty;
  states: readonly MarkerSemanticState[];
}

export interface MarkerContentHandle {
  element: HTMLElement;
  update(descriptor: MarkerDescriptor): void;
  dispose(): void;
}

export type MarkerContentFactory = (descriptor: MarkerDescriptor) => MarkerContentHandle;

export interface UserLocationDescriptor {
  coordinates: Coordinates;
}

export interface UserLocationContentHandle {
  element: HTMLElement;
  update(descriptor: UserLocationDescriptor): void;
  dispose(): void;
}

export type UserLocationContentFactory = (
  descriptor: UserLocationDescriptor,
) => UserLocationContentHandle;

export interface MapBasemapPalette {
  geometry: string;
  label: string;
  labelStroke: string;
  water: string;
  park: string;
  road: string;
}

export interface MapRoutePaint {
  color: string;
  opacity: number;
}

export interface MapRouteStroke extends MapRoutePaint {
  width: number;
}

export interface MapSolidRouteStyle {
  kind: "solid";
  stroke: MapRouteStroke;
  casing?: MapRouteStroke;
}

export type MapRouteSymbol =
  | {
    shape: "circle";
    repeatPx: number;
    scale: number;
    fill: MapRoutePaint;
    stroke?: MapRouteStroke;
  }
  | {
    shape: "dash";
    repeatPx: number;
    scale: number;
    fill?: MapRoutePaint;
    stroke: MapRouteStroke;
  };

export interface MapSymbolRouteStyle {
  kind: "symbol";
  symbol: MapRouteSymbol;
}

export type MapRouteStyle = MapSolidRouteStyle | MapSymbolRouteStyle;

export interface MapRoutePresentationV2 {
  edgeId: string;
  mode: RouteMode;
  source: RouteEdge["source"];
  certainty: RouteEdge["certainty"];
  geometry: readonly Coordinates[];
  selected: boolean;
}

export interface MapVisualProfile {
  id: string;
  basemap: {
    mode: "neutral" | "topographic" | "flat" | "technical" | "coastal" | "subdued";
    density: "low" | "medium" | "high";
    contrast: "soft" | "standard" | "high";
    poi: "minimal" | "standard";
    stationLabels: "hidden" | "legible";
    palette: MapBasemapPalette;
  };
  routeStyle(route: MapRoutePresentationV2): MapRouteStyle | null;
}

export interface MapPresentationV2 {
  markers: readonly MarkerDescriptor[];
  routes: readonly MapRoutePresentationV2[];
}

// Reconciliation keys are MarkerDescriptor.ownerId and
// MapRoutePresentationV2.edgeId. The first occurrence wins defensively.

export interface MapEventsV2 {
  onMarkerSelect(ownerId: string): void;
  onRouteSelect(routeId: string): void;
  onUnavailable(result: ProviderUnavailableResult): void;
}

export interface MapMountConfig {
  events: MapEventsV2;
  visualProfile: MapVisualProfile;
  createMarkerContent: MarkerContentFactory;
  createUserLocationContent: UserLocationContentFactory;
}

// packages/core/src/browser/v2-adapters.ts
export interface MapAdapterV2 {
  mount(element: HTMLElement, config: MapMountConfig): Promise<void>;
  render(presentation: MapPresentationV2): void;
  applyCameraIntent(intent: CameraIntent): void;
  getCameraSnapshot(): CameraSnapshot | null;
  setUserLocation(location: Coordinates | null): void;
  destroy(): void;
}

export interface RouteAdapterV2 {
  load(request: RouteRequestV2, signal: AbortSignal): Promise<RouteProviderResult>;
}

export interface PlaceAdapterV2 {
  load(request: PlaceRequestV2, signal: AbortSignal): Promise<PlaceProviderResult>;
}

export type NavigationRequestV2 =
  | {
      readonly kind: "place";
      readonly destination: NavigationTargetV2;
    }
  | {
      readonly kind: "route";
      readonly origin: NavigationTargetV2;
      readonly destination: NavigationTargetV2;
      readonly travelMode: "walking" | "driving" | "transit";
    }
  | {
      readonly kind: "authored-external";
      readonly origin: string;
      readonly destination: string;
      readonly travelMode?: "walking" | "driving" | "transit";
    };

export interface NavigationAdapterV2 {
  readonly supportedPlaceProviders: readonly string[];
  open(request: NavigationRequestV2): boolean;
}
```

The v2 map contract coexists on the implementation branch with the current 1.0 `MapAdapter` only until Phase 02 migrates the remaining old hooks. Phase 03 removes the old exports before any 2.0 artifact is eligible for release; this is implementation sequencing, not a compatibility promise.

### Route quarantine contract

```ts
// packages/core/src/route-validation.ts
export interface RouteValidationPolicyV2 {
  maxEndpointGapMeters: number;
  maxPointDetourRatio: number;
  pointDetourSlackMeters: number;
  maxDurationMinutes: Readonly<Record<"walking" | "transit" | "driving" | "flight", number>>;
  maxDistanceMeters: Readonly<Record<"walking" | "transit" | "driving" | "flight", number>>;
  maxSpeedMetersPerSecond: Readonly<Record<"walking" | "transit" | "driving" | "flight", number>>;
}

export const ROUTE_VALIDATION_POLICY_V2: RouteValidationPolicyV2 = {
  maxEndpointGapMeters: 2_000,
  maxPointDetourRatio: 8,
  pointDetourSlackMeters: 10_000,
  maxDurationMinutes: {
    walking: 720,
    transit: 1_440,
    driving: 1_440,
    flight: 2_880,
  },
  maxDistanceMeters: {
    walking: 100_000,
    transit: 2_000_000,
    driving: 2_000_000,
    flight: 22_000_000,
  },
  maxSpeedMetersPerSecond: {
    walking: 5,
    transit: 120,
    driving: 100,
    flight: 400,
  },
};

export function validateRouteProviderResult(
  request: RouteRequestV2,
  result: RouteProviderResult,
  policy?: RouteValidationPolicyV2,
): RouteProviderResult;
```

Validation preserves an existing unavailable result byte-for-byte except for defensive cloning. A ready result without geometry remains ready and can supply duration/line facts. Geometry, when present, must have at least two finite world coordinates, start/end within `maxEndpointGapMeters` when endpoint coordinates exist, and no point whose `origin → point → destination` distance exceeds direct endpoint distance times `maxPointDetourRatio` plus `pointDetourSlackMeters`. Duration, distance, and implied speed are checked against the mode table, including the explicit flight limits. A ready result for `unknown` becomes non-retryable `unsupported`; a plausible flight result remains ready for flight-specific presentation/focus, while Phase 02 excludes it from ordinary day-fit bounds. Shape failures become non-retryable `malformed-response`; plausible-shape failures become non-retryable `implausible-result`. Diagnostics name the failed guard but are never display text.

---

### Task 1: Make authored Trip identity and route uncertainty truthful

**Files:**

- Modify: `packages/core/package.json`
- Modify: `packages/core/src/model.ts`
- Modify: `packages/core/src/validation.ts`
- Modify: `packages/core/src/routes.ts`
- Modify: `packages/core/src/map-presentation.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/tests/v2-domain.test.ts`
- Modify: `packages/core/tests/fixtures/complete-trip.ts`
- Modify: `packages/core/tests/candidates.test.ts`
- Modify: `packages/core/tests/map-presentation.test.ts`
- Modify: `packages/core/tests/resolve-itinerary.test.ts`
- Modify: `packages/core/tests/routes.test.ts`
- Modify: `packages/core/tests/timeline.test.ts`
- Modify: `packages/core/tests/validation.test.ts`
- Modify: `packages/react/tests/use-trip-progress.test.tsx`
- Modify: `packages/react/package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Produces: `RouteMode`, `TimelineRole`, `MarkerMode`, `ProviderReference`, `PlaceUnresolvedReason`, `ResolvedPlaceIdentity`, `PlaceIdentity`, and the v2 `PlaceRef`/`Trip` shapes above.
- Changes: `CustomNode.payload.presentationRole` becomes required and restricted to `primary | journey | task`.
- Preserves: authored IDs, route ownership, candidate ownership, certainty, summary, and external-navigation data.

- [ ] **Step 1: Add focused failing domain tests**

In `packages/core/tests/v2-domain.test.ts`, add these exact cases:

1. a `Trip` with canonical `locale: "zh-Hant-TW"`, `timezone: "Asia/Tokyo"`, resolved coordinate identity, resolved provider-reference identity, and an unresolved place validates;
2. `RouteMode` accepts `unknown`, `buildRoutePresentations` gives it `display: "full"`, never synthesizes internal navigation, and preserves a separately authored valid external-navigation target when present;
3. recomposing walking → unknown → walking yields `mode: "unknown"`, not walking;
4. a provider reference `{ provider: "google", id: "places/example" }` is accepted without a Google-specific field name;
5. missing/noncanonical/invalid locale, missing or invalid IANA timezone, blank provider/id, resolved identity with neither coordinate nor provider reference, and unresolved identity carrying fabricated location data produce deterministic errors;
6. custom nodes accept only `primary`, `journey`, or `task` as `presentationRole`.

Use these new validation codes exactly: `INVALID_LOCALE`, `NONCANONICAL_LOCALE`, `INVALID_TIMEZONE`, `INVALID_PROVIDER_REFERENCE`, `INVALID_PLACE_IDENTITY`, and `INVALID_PRESENTATION_ROLE`.

- [ ] **Step 2: Run the red test**

```bash
npm run build --workspace @laugh-tale-island/core
npm test --workspace @laugh-tale-island/core -- tests/v2-domain.test.ts
```

Expected: FAIL because `RouteMode` lacks `unknown`, `PlaceRef` lacks `identity`, `Trip` lacks `locale`, and the validation codes do not exist.

- [ ] **Step 3: Implement the authored v2 types**

Apply the Phase-owned authored identity shapes verbatim. Replace all reads of `place.coordinates` with `place.identity.status === "resolved" ? place.identity.coordinates : undefined`; replace the Google-specific provider fingerprint in `routes.ts` with the normalized provider/id pair. Add required `presentationRole` to the custom payload.

For locale validation, call `Intl.getCanonicalLocales([trip.locale])`; invalid input yields `INVALID_LOCALE`, while a valid tag whose sole canonical result is not byte-equal to the authored value yields `NONCANONICAL_LOCALE`. Do not rewrite the Trip in validation.

For timezone validation, first require a nonblank string and reject raw numeric-offset syntax, then validate the authored identifier with both `new Intl.DateTimeFormat("en", { timeZone: trip.timezone })` and `Temporal.Instant.from("2000-01-01T00:00:00Z").toZonedDateTimeISO(trip.timezone)`. Missing, blank, offset-only, or rejected zones yield `INVALID_TIMEZONE`. Use only that fixed instant; do not read the host timezone, guess from destination/coordinates, or rewrite the authored value.

For identity validation:

- resolved requires at least one valid coordinate or nonblank provider reference;
- unresolved permits only `status` and `reason` and is a warning-free valid state;
- a resolved coordinate uses the existing latitude/longitude bounds;
- `provider` and `id` are trimmed only for checking, never rewritten;
- unresolved places never enter map projection and never gain navigation capability.

Change `aggregateMode` to this exhaustive rule: all-walking paths aggregate to `walking`; walking plus exactly one distinct substantive known mode aggregates to that known mode; any path containing `unknown`, or more than one distinct substantive known mode, aggregates to `unknown`. An aggregate `unknown` edge never gains inferred provider/internal navigation, but a valid external-navigation target explicitly authored on the edge remains available unchanged. Delete the synthesized English `Mixed modes:` summary and do not encode behavioral state in visible text.

Set core's package version to `2.0.0`. While React is still on its pre-Task-4 dependency placement, change both of its existing core peer/dev specifiers to exact `2.0.0`; Task 4 moves that already-aligned edge into production `dependencies`. Refresh the root lockfile before running the green suite.

- [ ] **Step 4: Convert package fixtures and compile-time consumers**

Update every listed core test fixture to the new `identity` shape. Use explicit unresolved identity instead of omitting a place location. Add `locale: "en"` to synthetic Trips except the canonical-locale case. Add `locale: "en"` to the React progress fixture so `npm run type-check --workspace @laugh-tale-island/react` remains green.

- [ ] **Step 5: Run the green domain suite**

```bash
npm install --package-lock-only --no-audit --no-fund
npm run build --workspace @laugh-tale-island/core
npm test --workspace @laugh-tale-island/core -- tests/v2-domain.test.ts tests/validation.test.ts tests/routes.test.ts tests/map-presentation.test.ts
npm test --workspace @laugh-tale-island/core
npm run type-check --workspace @laugh-tale-island/core
npm run type-check --workspace @laugh-tale-island/react
npm run lint --workspace @laugh-tale-island/core
git diff --check
```

Expected: all commands exit 0; no test treats an unknown route as walking or an unresolved place as locatable.

- [ ] **Step 6: Commit**

```bash
git add packages/core/package.json packages/core/src/model.ts packages/core/src/validation.ts packages/core/src/routes.ts packages/core/src/map-presentation.ts packages/core/src/index.ts packages/core/tests/v2-domain.test.ts packages/core/tests/fixtures/complete-trip.ts packages/core/tests/candidates.test.ts packages/core/tests/map-presentation.test.ts packages/core/tests/resolve-itinerary.test.ts packages/core/tests/routes.test.ts packages/core/tests/timeline.test.ts packages/core/tests/validation.test.ts packages/react/package.json packages/react/tests/use-trip-progress.test.tsx package-lock.json
git commit -m "feat(core): add truthful v2 place and route facts"
```

---

### Task 2: Add typed provider results, opening-hours truth, and enrichment policy

**Files:**

- Create: `packages/core/src/provider-failure.ts`
- Create: `packages/core/src/place-runtime.ts`
- Create: `packages/core/src/opening-hours.ts`
- Create: `packages/core/src/enrichment/place-search.ts`
- Create: `packages/core/src/enrichment/provenance.ts`
- Create: `packages/core/src/enrichment/index.ts`
- Modify: `packages/core/src/provider-data.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Modify: `package-lock.json`
- Create: `packages/core/tests/provider-results.test.ts`
- Create: `packages/core/tests/opening-hours.test.ts`
- Create: `packages/core/tests/enrichment.test.ts`
- Modify: `packages/core/tests/exports.test.ts`
- Modify: `packages/core/tests/boundaries.test.ts`

**Interfaces:**

- Produces: `ProviderFailureReason`, `ProviderUnavailableResult`, all place runtime/opening types, `evaluateOpeningHours`, and all `@laugh-tale-island/core/enrichment` contracts shown above.
- Package export: `@laugh-tale-island/core/enrichment` → `dist/enrichment/index.{js,d.ts}`.
- Keeps: root entry Node-safe and network-free; enrichment is policy/contracts only.

- [ ] **Step 1: Write failing runtime and export tests**

Add exact tests for:

- the nine ledger `ProviderFailureReason` values and a structured unavailable value whose `diagnostic` is separate from `reason`;
- place states `idle`, `loading`, `ready`, and `unavailable` without changing `PlaceIdentity`;
- core root importing without `window`, `document`, `HTMLElement`, or network access;
- `@laugh-tale-island/core/enrichment` exporting `createPlaceSearchQuery` and `createPlaceResolutionProvenance`;
- deterministic query normalization: trim owner/text/region, canonicalize locale, retain finite bias, and force `maxCandidates: 3`;
- rejection of blank owner/text/source/provider, invalid locale/region, invalid coordinates, radius `<= 0`, radius over `50_000`, and any `observedAt` that is not an exact valid canonical UTC-millisecond string `YYYY-MM-DDTHH:mm:ss.sssZ`;
- provenance preserving the query object and observation timestamp without reading the clock.

- [ ] **Step 2: Write the opening-hours matrix before implementation**

`packages/core/tests/opening-hours.test.ts` must cover:

- explicit `always-open` → open;
- a complete same-day period before, during, and after its interval;
- Friday 22:00 → Saturday 02:00 overnight behavior;
- Sunday → Monday week wrap;
- the same instant evaluated in `Asia/Tokyo` and `America/Los_Angeles` to prove the supplied Trip timezone is used, not the host timezone;
- absent facts, incomplete periods, missing close, invalid hour/minute/day, empty weekly periods, invalid instant, and invalid timezone → `unknown` with the exact `absent`, `incomplete`, or `invalid` reason;
- no test or implementation reads an `openNow` field.

- [ ] **Step 3: Run the red tests**

```bash
npm run build --workspace @laugh-tale-island/core
npm test --workspace @laugh-tale-island/core -- tests/provider-results.test.ts tests/opening-hours.test.ts tests/enrichment.test.ts tests/exports.test.ts
```

Expected: FAIL on missing modules, missing export map entry, and missing named exports.

- [ ] **Step 4: Implement provider/place/enrichment contracts**

Copy the public shapes from this plan exactly and pin core's existing `@js-temporal/polyfill` dependency to exact `0.5.1`. `createPlaceSearchQuery` returns a fresh deeply cloned object, uses `Intl.getCanonicalLocales`, uppercases a two-letter `regionCode`, and rejects bias radii outside `(0, 50_000]`. `createPlaceResolutionProvenance` requires nonblank owner/source/provider and an exact four-digit-year canonical UTC-millisecond `observedAt`; parse it with the imported polyfill `Temporal.Instant.from`, require `instant.toString({ fractionalSecondDigits: 3 }) === observedAt`, and reject offsets, omitted/extra fractional precision, extended years, normalization, or invalid calendar/time values. Return a fresh snapshot. It must not accept a chosen candidate or manufacture identity; Phase 05 performs acceptance.

Add `./enrichment` to the core export map. Extend the boundary test so neither root nor enrichment imports React, Google packages, generated source, CSS, `fetch`, filesystem modules, environment variables, or UI copy.

- [ ] **Step 5: Implement deterministic opening evaluation**

Convert each weekly endpoint to minutes since Sunday 00:00. A close minute less than or equal to its open minute belongs to the next week. Evaluate the supplied instant with `Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone)`, convert Temporal Monday=1…Sunday=7 to Sunday=0…Saturday=6, and compare the current minute against the period plus copies shifted by `-10_080`, `0`, and `+10_080` minutes. Return open on any containing interval, closed only for a nonempty complete weekly schedule, and unknown for every absent/incomplete/invalid input. Never consult `Date.now`, host locale/timezone, or `openNow`.

- [ ] **Step 6: Run the green core suite**

```bash
npm run build --workspace @laugh-tale-island/core
npm test --workspace @laugh-tale-island/core -- tests/provider-results.test.ts tests/opening-hours.test.ts tests/enrichment.test.ts tests/exports.test.ts tests/boundaries.test.ts
npm test --workspace @laugh-tale-island/core
npm run type-check --workspace @laugh-tale-island/core
npm run lint --workspace @laugh-tale-island/core
git diff --check
```

Expected: all commands exit 0 and `dist/enrichment/index.js` plus `dist/enrichment/index.d.ts` exist.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/provider-failure.ts packages/core/src/place-runtime.ts packages/core/src/opening-hours.ts packages/core/src/enrichment/place-search.ts packages/core/src/enrichment/provenance.ts packages/core/src/enrichment/index.ts packages/core/src/provider-data.ts packages/core/src/index.ts packages/core/package.json packages/core/tests/provider-results.test.ts packages/core/tests/opening-hours.test.ts packages/core/tests/enrichment.test.ts packages/core/tests/exports.test.ts packages/core/tests/boundaries.test.ts package-lock.json
git commit -m "feat(core): model provider and opening-hours truth"
```

---

### Task 3: Publish the final neutral v2 browser adapter DTOs

**Files:**

- Create: `packages/core/src/route-runtime.ts`
- Create: `packages/core/src/navigation-target.ts`
- Create: `packages/core/src/semantic-state.ts`
- Create: `packages/core/src/map-camera.ts`
- Create: `packages/core/src/browser/v2-map.ts`
- Create: `packages/core/src/browser/v2-adapters.ts`
- Modify: `packages/core/src/browser/index.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/tests/v2-browser-contract.test.ts`
- Modify: `packages/core/tests/exports.test.ts`
- Modify: `packages/core/tests/boundaries.test.ts`

**Interfaces:**

- Produces: `RouteEndpointV2`, `RouteRequestV2`, `TransitLineFact`, `RouteProviderReadyResult`, `RouteProviderResult`, `RouteRuntimeState`, `NavigationTargetV2`, `NavigationRequestV2`, `SemanticOwnerState`, all camera/marker/user-location DTOs and content factories, `MapBasemapPalette`, `MapRoutePaint`, `MapRouteStroke`, `MapSolidRouteStyle`, `MapRouteSymbol`, `MapSymbolRouteStyle`, `MapRouteStyle`, `MapAdapterV2`, `RouteAdapterV2`, `PlaceAdapterV2`, and `NavigationAdapterV2` exactly as declared above. `@laugh-tale-island/core` exports `NavigationTargetV2`, `SemanticOwnerState`, and the DOM-free camera DTOs; `@laugh-tale-island/core/browser` exports `NavigationRequestV2`, marker/profile/mount, and adapter types.
- Defers: computation of `UsableRegion`, `EdgeInsets`, numeric `targetZoom`, and semantic camera intents to Phase 02.

- [ ] **Step 1: Write compile-time and runtime-shape tests**

In `v2-browser-contract.test.ts`, define minimal structural implementations of all four v2 adapters and assert:

- `MapAdapterV2.mount` requires `MapMountConfig` containing events, profile, itinerary-marker factory, and user-location factory;
- `MapVisualProfile.basemap` requires all six provider-neutral palette colors plus explicit station-label guidance;
- `MapVisualProfile.routeStyle` can return `null`, a `solid` style, or a `symbol` style; the symbol branch supports `circle`/`dash`, pixel repetition, scale, fill, and stroke but has no underlying-line stroke field;
- marker factory returns one handle with `element`, `update`, and `dispose`;
- marker descriptors preserve semantic `displayIndex`/`ordinal`; they do not calculate either value, and `markerMode: "none"` is rejected before a descriptor/factory call;
- the dedicated user-location factory receives only valid coordinates and returns its own `element`/`update`/`dispose` handle, so an adapter never authors the visible dot;
- `MapEventsV2.onUnavailable` carries a typed `ProviderUnavailableResult`; raw diagnostics never become visible copy;
- `RouteAdapterV2.load` returns only settled `RouteProviderResult`, never idle/loading;
- `PlaceAdapterV2.load` receives a provider-neutral reference plus locale/timezone;
- `NavigationAdapterV2` publishes its supported place-provider names; accepts destination-only `place`, origin/destination `route`, and validated `authored-external` requests; and rejects `flight` and `unknown` travel modes at compile time with `@ts-expect-error`;
- every `CameraIntent` has `intentId`, `transition`, `viewport`, `usableRegion`, and `edgeInsets`; focus/recenter require numeric `targetZoom`, fit requires numeric `maximumZoom`;
- `CameraSnapshot` has one required finite-zoom field at the type boundary.

Update `exports.test.ts` to import the ledger names from `@laugh-tale-island/core/browser`.

- [ ] **Step 2: Run the red contract test**

```bash
npm run build --workspace @laugh-tale-island/core
npm test --workspace @laugh-tale-island/core -- tests/v2-browser-contract.test.ts tests/exports.test.ts
npm run type-check --workspace @laugh-tale-island/core
```

Expected: FAIL because the v2 modules and exports do not exist.

- [ ] **Step 3: Implement the DTO-only contract**

Copy the Phase-owned browser interfaces exactly. Keep the files free of algorithms and provider imports. Put `NavigationTargetV2` and `SemanticOwnerState` in root-safe `navigation-target.ts` and `semantic-state.ts`; put the browser-effect `NavigationRequestV2` beside `NavigationAdapterV2` in `browser/v2-adapters.ts`. Put `MapViewportMetrics`, `OcclusionRect`, `UsableRegion`, `EdgeInsets`, `CameraTransition`, all three camera-intent members, `CameraIntent`, and `CameraSnapshot` in root-safe `map-camera.ts`; re-export those values from both the core root and browser entry. The map route DTO requires validated geometry; it cannot carry an unavailable or unknown route with an empty fabricated path. A map marker descriptor accepts only `numbered | base`; a semantic owner with `MarkerMode: "none"` is filtered by map projection before any factory call. Marker and user-location descriptors carry semantic inputs only; no class name, icon, SVG, HTML string, color, or provider object belongs in them. The basemap palette and route-style union are provider-neutral paint instructions: no Google style object, `SymbolPath`, provider enum, or provider option bag may enter the contract. A symbol style has only its repeated symbols; unlike the solid branch, it cannot carry an underlying line stroke.

Retain the current 1.0 browser exports temporarily because `useUserLocation` still consumes them before Phase 02. Put v2 contracts in separate modules so Phase 03 can delete the old `adapters.ts` export in one auditable cut rather than aliasing it.

- [ ] **Step 4: Tighten browser boundary assertions**

Extend `boundaries.test.ts` so `v2-map.ts` and `v2-adapters.ts` may mention DOM platform types but may not import React, Google, adapters/testing packages, generated source, CSS, or visible copy. Assert root entry files still contain no `HTMLElement` or `AbortSignal`; browser types are exposed only through `./browser`.

- [ ] **Step 5: Run the green contract suite**

```bash
npm run build --workspace @laugh-tale-island/core
npm test --workspace @laugh-tale-island/core -- tests/v2-browser-contract.test.ts tests/exports.test.ts tests/boundaries.test.ts
npm run type-check --workspace @laugh-tale-island/core
npm run lint --workspace @laugh-tale-island/core
git diff --check
```

Expected: all commands exit 0 and the emitted browser declarations contain every roadmap-ledger name.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/route-runtime.ts packages/core/src/navigation-target.ts packages/core/src/semantic-state.ts packages/core/src/map-camera.ts packages/core/src/browser/v2-map.ts packages/core/src/browser/v2-adapters.ts packages/core/src/browser/index.ts packages/core/src/index.ts packages/core/tests/v2-browser-contract.test.ts packages/core/tests/exports.test.ts packages/core/tests/boundaries.test.ts
git commit -m "feat(core): define v2 browser adapter contracts"
```

---

### Task 3A: Build the total semantic day and navigation projection

**Files:**

- Modify: `packages/core/src/validation.ts`
- Modify: `packages/core/src/resolve-itinerary.ts`
- Modify: `packages/core/src/timeline.ts`
- Modify: `packages/core/src/navigation-target.ts`
- Create: `packages/core/src/semantic-projection.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/tests/semantic-projection.test.ts`
- Create: `packages/core/tests/navigation-target.test.ts`
- Modify: `packages/core/tests/resolve-itinerary.test.ts`
- Modify: `packages/core/tests/timeline.test.ts`
- Modify: `packages/core/tests/validation.test.ts`
- Modify: `packages/core/tests/map-presentation.test.ts`

**Interfaces:**

- Produces: every semantic-projection type and function declared above, including `timelineRoleForNode`, `deriveNavigationTarget`, `formatCandidateOrdinal`, and `buildDaySemanticProjection`.
- Changes: `EffectiveNode` gains required `skipped: boolean`; resolving progress retains skipped optional nodes instead of removing their authored owner.
- Guarantees: list and map projections share authored owner ID, source kind, semantic states, and primary ordinal; only coordinate-resolved owners enter `mapOwners`.

- [ ] **Step 1: Write the failing total-role and custom-capability matrix**

In `semantic-projection.test.ts`, assert the exhaustive role table: dining/shopping/sightseeing/experience → `primary`; lodging → `base`; transport/transfer → `journey`; logistics → `task`; and each valid custom `presentationRole` returns itself. No default branch may turn an unrecognized runtime kind into a role.

In `validation.test.ts`, assert the exact custom compatibility rules: `primary` requires `capabilities.place`; `journey` requires `capabilities.place` or `capabilities.booking`; `task` requires `capabilities.completion` or `capabilities.shopping`. Additional capabilities are allowed. Missing/invalid roles use `INVALID_PRESENTATION_ROLE`; an allowed role with no required capability uses `INCOMPATIBLE_PRESENTATION_ROLE`. Add a cross-namespace collision case in which a node, route, or candidate-option repeats another itinerary owner ID and require `DUPLICATE_OWNER_ID` at every later path.

- [ ] **Step 2: Write grouping, ownership, indexing, and state failures**

Use one synthetic day containing base, primary, journey, unresolved primary, three consecutive logistics nodes, a route separating two later logistics nodes, and a primary with 28 candidate options. Assert:

- two or more consecutive logistics nodes group only when no edge connects adjacent children;
- the exact group ID is `logistics-group:${JSON.stringify(orderedChildOwnerIds)}` and delimiter-like child IDs cannot collide;
- every child remains present with its authored `ownerId`; every route remains a separate `connector` owner; each child's `incomingRouteIds` remains attached, including the first child’s external incoming edge;
- display indices are `1…n` over primary nodes only; base/journey/task/group/route entries have no `displayIndex` property;
- a primary node's `ordinal` is the decimal string form of its `displayIndex`; non-primary nodes have neither field;
- the unresolved primary keeps its index but is absent from `mapOwners`;
- candidate options do not increment the primary counter and produce `1a` through `1z`, then `1aa` and `1ab` in authored order;
- skipped optional nodes remain in the effective day with `skipped: true`, while non-skipped nodes carry `false`;
- state arrays use the fixed `current`, `next`, `viewing`, `selected`, `completed`, `skipped`, `candidate`, `unresolved` order without collapsing simultaneous facts;
- for every locatable primary/base/candidate, the matching `mapOwners` item has byte-equal owner ID, source kind, states, display index, and ordinal to its row/candidate projection; candidates have no `displayIndex` on either side.

Update the existing timeline/map/progress tests so they expect skipped rows to remain truthfully visible and grouping to preserve owners rather than filter them.

- [ ] **Step 3: Write navigation-target failures**

In `navigation-target.test.ts`, cover:

1. a supported Google provider reference is preferred over coexisting coordinates;
2. coordinates are used when no provider reference exists or when a coexisting reference names an unsupported provider;
3. a resolved identity containing only an unsupported foreign provider reference returns `null`;
4. unresolved identity, absent place, invalid runtime coordinates, blank provider names/IDs, and blank supported-provider entries return `null` without throwing;
5. inputs and the supported-provider array are not mutated, and no returned target aliases authored coordinate/reference objects;
6. a place label is preserved only as target context and is never returned as an untyped string target.

- [ ] **Step 4: Run the focused red tests**

```bash
npm run build --workspace @laugh-tale-island/core
npm test --workspace @laugh-tale-island/core -- tests/semantic-projection.test.ts tests/navigation-target.test.ts tests/resolve-itinerary.test.ts tests/timeline.test.ts tests/validation.test.ts tests/map-presentation.test.ts
```

Expected: FAIL because the total projection/navigation exports and skipped-state field do not exist, logistics grouping still uses first/last IDs, and skipped owners are currently removed.

- [ ] **Step 5: Implement retained effective owners and strict role validation**

Add `skipped` to `EffectiveNode`, keep every authored node in `EffectiveDay.nodes`, and set the bit from progress without changing candidate replacement or completion behavior. Resolve/recompose active route edges from `day.nodes.filter(({ skipped }) => !skipped)` so retaining a skipped row does not restore it to the travel path. Make live-time callers ignore skipped IDs explicitly instead of deleting their rows.

Implement `timelineRoleForNode` as an exhaustive switch and update validation with the exact custom-role capability matrix and one shared itinerary-owner set spanning node, route, and candidate-option IDs. Keep group/task/day/checklist namespaces separate because they are not interchangeable itinerary owners.

- [ ] **Step 6: Implement deterministic semantic projection**

Build incoming-route lookup by destination owner and connector lookup by origin owner without transferring edge ownership. Scan effective nodes in authored order, allocate a display index only when `role === "primary"`, and group maximal logistics runs only across an absent connecting edge. The derived group owns display aggregation only; its children remain full `SemanticNodeProjection` values.

Build state arrays by filtering the declared canonical order. Derive marker modes as primary → `numbered`, base → `base`, and journey/task → `none`. A resolved coordinate is required for `mapOwners`; unresolved/provider-only rows remain in entries. Project candidate options only for a valid primary parent, suffix them with the zero-based spreadsheet-style algorithm, and preserve their own identity/state/navigation target. Defensive invalid inputs are omitted, never repaired with an inferred role, coordinate, owner, or index.

- [ ] **Step 7: Implement core-owned navigation targets**

Implement `deriveNavigationTarget` exactly as declared. Compare nonblank provider names by exact authored value against a deduplicated nonblank support list, prefer a supported provider reference, then fall back to cloned finite world coordinates. Never fall back to place label, destination label, browser geocoding, or the first configured provider. `buildDaySemanticProjection` calls this helper for every node and candidate so Phase 03 consumes capability truth instead of re-deriving it.

- [ ] **Step 8: Run the green semantic suite**

```bash
npm run build --workspace @laugh-tale-island/core
npm test --workspace @laugh-tale-island/core -- tests/semantic-projection.test.ts tests/navigation-target.test.ts tests/resolve-itinerary.test.ts tests/timeline.test.ts tests/validation.test.ts tests/map-presentation.test.ts
npm test --workspace @laugh-tale-island/core
npm run type-check --workspace @laugh-tale-island/core
npm run type-check --workspace @laugh-tale-island/react
npm run lint --workspace @laugh-tale-island/core
git diff --check
```

Expected: all commands exit 0; the semantic projection contains every authored itinerary owner exactly once, and navigation capability exists only through a typed target.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/validation.ts packages/core/src/resolve-itinerary.ts packages/core/src/timeline.ts packages/core/src/navigation-target.ts packages/core/src/semantic-projection.ts packages/core/src/index.ts packages/core/tests/semantic-projection.test.ts packages/core/tests/navigation-target.test.ts packages/core/tests/resolve-itinerary.test.ts packages/core/tests/timeline.test.ts packages/core/tests/validation.test.ts packages/core/tests/map-presentation.test.ts
git commit -m "feat(core): project total v2 itinerary semantics"
```

---

### Task 4: Quarantine unsafe routes before React exposes map geometry

**Files:**

- Create: `packages/core/src/route-validation.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/map-presentation.ts`
- Create: `packages/core/tests/route-validation.test.ts`
- Modify: `packages/core/tests/map-presentation.test.ts`
- Modify: `packages/react/src/use-route-states.ts`
- Modify: `packages/react/src/index.ts`
- Modify: `packages/react/package.json`
- Modify: `packages/react/tests/use-route-states.test.tsx`
- Modify: `packages/react/tests/boundaries.test.ts`
- Modify: `package-lock.json`

**Interfaces:**

- Produces: `RouteValidationPolicyV2`, `ROUTE_VALIDATION_POLICY_V2`, and `validateRouteProviderResult` exactly as declared above.
- Changes: `useRouteStates` accepts `readonly RouteRequestV2[]` and a `() => RouteAdapterV2` factory.
- Returns: `RouteLoadState = RouteRuntimeState`; `RouteStates.states` contains one state per stable edge ID; `RouteStates.mapResults` contains only validated ready results with present geometry; `retry(routeId)` remains owner-scoped.

- [ ] **Step 1: Write the pure route-guard red matrix**

Create `route-validation.test.ts` with exact cases for:

- a valid Tokyo-scale walking path is cloned and retained;
- a ready result without geometry retains duration, distance, steps, and transit facts;
- an existing unavailable result retains reason/retryability/diagnostic;
- NaN, infinity, out-of-world points, a one-point path, negative duration, negative distance, and non-string steps become `malformed-response`;
- a first or final point more than 2,000 m from a coordinate endpoint becomes `implausible-result`;
- a remote decoded middle point that violates the ratio/slack corridor becomes `implausible-result`;
- 172,703 walking minutes, walking over 100 km, and speed above the mode cap become `implausible-result`;
- ready geometry for `unknown` becomes non-retryable `unsupported`;
- a plausible flight result remains ready after the same shape, endpoint, corridor, duration, distance, and speed checks, while a flight exceeding its explicit cap becomes `implausible-result`;
- the input request/result are not mutated.

Use injected small policies in unit-edge tests and one test against the exact exported default constant so threshold behavior is deterministic.

- [ ] **Step 2: Write React lifecycle failures against v2 requests**

Replace the route-edge-only fixtures in `use-route-states.test.tsx` with `RouteRequestV2` fixtures. Preserve the current cancellation, stale-generation, retry, duplicate-owner, cache-signature, and prototype-key cases, then add:

- no adapter factory produces an explicit idle state per owner;
- `unknown` remains idle and performs zero provider work; `flight` is offered to a neutral route adapter and preserves either its validated ready result or its typed unavailable result;
- adapter rejection maps to retryable `network` with diagnostic isolated from `reason`;
- an implausible ready result becomes unavailable in `states` and is absent from `mapResults`;
- a valid ready result without geometry stays ready but is absent from `mapResults`;
- loading remains attached to its exact edge ID.

- [ ] **Step 3: Run the red tests**

```bash
npm run build --workspace @laugh-tale-island/core
npm run build --workspace @laugh-tale-island/react
npm test --workspace @laugh-tale-island/core -- tests/route-validation.test.ts tests/map-presentation.test.ts
npm test --workspace @laugh-tale-island/react -- tests/use-route-states.test.tsx
```

Expected: FAIL because the validator is missing and the hook still accepts `RouteEdge[]` plus raw string failures.

- [ ] **Step 4: Implement validation in core**

Implement haversine distance locally in `route-validation.ts`. Apply checks in this order: settled unavailable passthrough; reject `unknown`; scalar/step shape; geometry coordinate shape; endpoint gap; point-detour corridor; duration/distance caps; implied speed. Apply the versioned flight limits like every other known mode; do not delegate flight to Google-specific logic. Return a fresh result on every branch. Never replace authored fields on `request.edge`.

Update `buildMapPresentation` to accept `RouteProviderResult` records and emit a map route only when a result is ready with validated geometry. It must not emit empty unavailable paths. Filter every semantic map owner whose authored `markerMode` is `"none"` before constructing a `MarkerDescriptor`; the remaining descriptor type is therefore the frozen `Exclude<MarkerMode, "none">`, and no marker-content factory can ever receive a hidden owner. Add this exact assertion to `map-presentation.test.ts`. A validated flight geometry may enter `MapPresentationV2` for its dedicated symbol grammar; the ordinary day-fit filter belongs to Phase 02 and excludes `mode === "flight"`. Route textual/provider state remains outside the map projection.

- [ ] **Step 5: Implement v2 request lifecycle in React**

Snapshot the full request, including endpoint identity, departure time, and sorted transit preferences, when calculating the request signature. Initialize every request owner to idle. Start loads for every known mode—including `flight`—when a factory exists; only `unknown` is suppressed before provider work. Catch thrown/rejected work as `{ status: "unavailable", reason: "network", retryable: true, diagnostic }`, pass ready work through `validateRouteProviderResult`, and keep the existing abort/stale-generation semantics. Map an abort to `cancelled` without allowing its late result to commit.

Change React's package version to `2.0.0`, move `@laugh-tale-island/core: "2.0.0"` from peer/dev placement into `dependencies`, and add `react-dom: ">=19.2.0 <20"` beside the existing React peer. Keep exact React/React DOM dev versions for package tests.

Refresh `package-lock.json` after the manifest move and before compiling.

- [ ] **Step 6: Run the green package suites**

```bash
npm install --package-lock-only --no-audit --no-fund
npm run build --workspace @laugh-tale-island/core
npm run build --workspace @laugh-tale-island/react
npm test --workspace @laugh-tale-island/core -- tests/route-validation.test.ts tests/map-presentation.test.ts
npm test --workspace @laugh-tale-island/react -- tests/use-route-states.test.tsx tests/boundaries.test.ts
npm run type-check --workspace @laugh-tale-island/core
npm run type-check --workspace @laugh-tale-island/react
npm run lint --workspace @laugh-tale-island/core
npm run lint --workspace @laugh-tale-island/react
git diff --check
```

Expected: all commands exit 0; the adversarial route never appears in `mapResults` or `MapPresentationV2`.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/route-validation.ts packages/core/src/index.ts packages/core/src/map-presentation.ts packages/core/tests/route-validation.test.ts packages/core/tests/map-presentation.test.ts packages/react/src/use-route-states.ts packages/react/src/index.ts packages/react/package.json packages/react/tests/use-route-states.test.tsx packages/react/tests/boundaries.test.ts package-lock.json
git commit -m "feat: quarantine unsafe provider routes"
```

---

### Task 5: Create the adapters package with routes, places, navigation, and Node search

**Files:**

- Create: `packages/adapters/package.json`
- Create: `packages/adapters/tsconfig.json`
- Create: `packages/adapters/tsconfig.build.json`
- Create: `packages/adapters/vitest.config.ts`
- Create: `packages/adapters/eslint.config.js`
- Create: `packages/adapters/README.md`
- Create: `packages/adapters/LICENSE` (copy root `LICENSE`)
- Create: `packages/adapters/src/google/provider-location.ts`
- Create: `packages/adapters/src/google/provider-failure.ts`
- Create: `packages/adapters/src/google/GoogleRouteAdapter.ts`
- Create: `packages/adapters/src/google/GooglePlaceAdapter.ts`
- Create: `packages/adapters/src/google/GoogleNavigationAdapter.ts`
- Create: `packages/adapters/src/google/index.ts`
- Create: `packages/adapters/src/google/node/GooglePlaceSearchAdapter.ts`
- Create: `packages/adapters/src/google/node/index.ts`
- Create: `packages/adapters/tests/google-route-adapter.test.ts`
- Create: `packages/adapters/tests/google-place-adapter.test.ts`
- Create: `packages/adapters/tests/google-navigation-adapter.test.ts`
- Create: `packages/adapters/tests/google-node-place-search-adapter.test.ts`
- Create: `packages/adapters/tests/boundaries.test.ts`
- Modify: `package-lock.json`

**Interfaces:**

- Package: `@laugh-tale-island/adapters@2.0.0`.
- Exports: `@laugh-tale-island/adapters/google` and `@laugh-tale-island/adapters/google/node`; there is no provider-ambiguous root export.
- Browser exports: `GoogleRouteAdapter`, `GooglePlaceAdapter`, `GoogleNavigationAdapter`, `GoogleRouteAdapterOptions`, `GooglePlaceAdapterOptions`, `routeRequestCacheKey`, `createGoogleMapsUrl`, route/place field-mask constants.
- Node export: `GooglePlaceSearchAdapter`, `GooglePlaceSearchAdapterOptions`, and its search field-mask constant.

- [ ] **Step 1: Create the non-behavioral package scaffold**

Use the same ESM/build/lint conventions as core. The export map is exactly:

```json
{
  "./google": {
    "types": "./dist/google/index.d.ts",
    "default": "./dist/google/index.js"
  },
  "./google/node": {
    "types": "./dist/google/node/index.d.ts",
    "default": "./dist/google/node/index.js"
  }
}
```

Set `dependencies["@laugh-tale-island/core"]` to `"2.0.0"`. Set `peerDependencies["@googlemaps/js-api-loader"]` to `">=2.1.1 <3"` and mark it optional in `peerDependenciesMeta`; add exact `2.1.1` plus `@types/google.maps: "3.65.5"` as dev dependencies for build/tests. Do not add React or testing in any dependency section. Create only the listed manifest, TypeScript/Vitest/ESLint configuration, README, and LICENSE in this step; do not add source stubs.

```bash
npm install --package-lock-only --no-audit --no-fund
```

Expected: exit 0 and the root lockfile records the adapters workspace plus its exact internal edge.

- [ ] **Step 2: Write adapter tests by extracting current proven cases**

Port the route/place/navigation test cases from `plugins/eternal-pose/starter/react/src/providers/google/google-provider.test.ts` into the four focused package tests. Do not move or delete the starter files yet. Preserve these existing behaviors:

- normalized cache keys and mutation-safe cached values;
- shared in-flight work with per-caller cancellation;
- final-subscriber cancellation evicts work;
- transit fallback order is original request, no mode filters, then no departure;
- errors do not poison cache;
- navigation URLs are keyless and percent encoded;
- destination-only place requests omit origin and travel mode, route requests require both resolved endpoints plus a supported mode, and an explicitly authored external request alone may use its nonblank authored origin/destination strings without pretending they are provider-resolved identities;
- route endpoints accept a nonblank Google place ID or finite neutral coordinates, never an authored label; an endpoint carrying only a foreign provider reference returns `unsupported` without fetch;
- provider locations accept Google `{ latitude, longitude }` and neutral `{ lat, lng }` shapes only when finite and in world bounds.

Change expected failures from raw strings to the stable reason enum. Add route expectations for optional geometry and transit line facts; add place expectations for formatted address, business status, and complete/incomplete opening periods.

For `GooglePlaceSearchAdapter`, assert one POST to `places:searchText`, exact use of query locale/region/page size/bias, at most three normalized candidates, no automatic first-candidate acceptance, and no environment access inside the class.

- [ ] **Step 3: Run the red package command**

```bash
npm test --workspace @laugh-tale-island/adapters
```

Expected: FAIL because the focused tests import the not-yet-created adapter source modules and named exports.

- [ ] **Step 4: Implement shared typed Google failure mapping**

Map missing/blank key → `missing-configuration` non-retryable; abort → `cancelled` non-retryable; HTTP 401/403 → `request-denied` non-retryable; HTTP 404 or empty provider result → `not-found` non-retryable; HTTP 429/5xx and thrown fetch errors → `network` retryable; structurally invalid payload → `malformed-response` non-retryable; ineligible mode/reference → `unsupported` non-retryable. Put status/error detail only in `diagnostic`.

- [ ] **Step 5: Implement Google routes and transit facts**

Adapt the current `GoogleRouteAdapter` to `RouteAdapterV2`. Build each Google waypoint from a nonblank provider reference only when `provider === "google"`; otherwise use valid coordinates. If neither is usable—including an identity containing only a foreign provider reference—return non-retryable `unsupported` before fetch. The authored endpoint label may enter a cache key or diagnostic but must never be sent for runtime geocoding/disambiguation. `unknown` and `flight` return `unsupported` without fetch. Preserve transit opt-in and fallback behavior. Expand the field mask to include each step's transit line name and short name. Normalize unique, nonblank lines in route order into `transit.lines`; never synthesize a line or realtime status. A valid duration with absent geometry remains ready. Core, not this adapter, applies plausibility policy.

- [ ] **Step 6: Implement browser place facts without runtime disambiguation**

Adapt `GooglePlaceAdapter` to `PlaceAdapterV2.load`. Require `providerReference.provider === "google"` and a nonblank ID; remove text-search fallback entirely. Request only ID/display name/location, formatted address, business status, regular opening periods, and fields required to normalize them. Map Google business states to the neutral enum. Normalize opening periods defensively: all valid periods → `completeness: "complete"`; any malformed/missing close → preserve valid periods with `completeness: "incomplete"`. Ignore `openNow`.

- [ ] **Step 7: Implement navigation and the Node-only search adapter**

Implement `GoogleNavigationAdapter.supportedPlaceProviders` as the frozen value `["google"]` and accept an injectable `openExternal(url)` effect in `GoogleNavigationAdapterOptions`; the browser default opens a new `noopener,noreferrer` context. The pure exported `createGoogleMapsUrl({kind:"place"})` creates a keyless Google Maps destination URL without inventing an origin; its `route` branch requires both resolved targets and the exact walking/driving/transit mode. Both serialize coordinate targets numerically and Google-reference targets with the corresponding Google place-ID parameter; a target label supplies required human-readable URL context only and is never used as a fallback geocoding target. Only the `authored-external` branch may encode its explicit nonblank authored origin/destination strings, with an optional already-supported mode; it never feeds those strings into the route provider or claims resolved identity. Blank/control-character authored strings, foreign-only provider references, malformed coordinates, and incomplete requests return `null`; `NavigationAdapterV2.open` then returns `false` without invoking the effect. A valid request invokes `openExternal` exactly once and returns `true`. The adapter never turns `flight` or `unknown` into another travel mode; an authored external request for either simply omits `travelMode`.

Implement `GooglePlaceSearchAdapter` with injected `fetch`, injected key, and `PlaceSearchAdapter.search`. It consumes the already-normalized query, requests the current five candidate facts (ID, display name, formatted address, location, categories), retains provider order, and returns no more than three. It never reads `VITE_GOOGLE_MAPS_API_KEY`, `ETERNAL_POSE_GOOGLE_PLACES_API_KEY`, `.env`, Referer, filesystem, or browser globals; Phase 05 injects the server key from the command environment.

- [ ] **Step 8: Enforce subpath isolation**

In `boundaries.test.ts`, recursively follow relative imports from `src/google/node/index.ts` and assert the reachable source contains none of `@googlemaps/js-api-loader`, `google.maps`, `HTMLElement`, `window`, or `document`. Scan all adapter source to reject imports from React, testing, `plugins/`, `examples/`, or recipe source. Assert importing `@laugh-tale-island/adapters/google/node` in a Node test does not initialize loader bindings.

- [ ] **Step 9: Run the green adapter suite**

```bash
npm install --package-lock-only --no-audit --no-fund
npm run build --workspace @laugh-tale-island/adapters
npm test --workspace @laugh-tale-island/adapters
npm run type-check --workspace @laugh-tale-island/adapters
npm run lint --workspace @laugh-tale-island/adapters
git diff --check
```

Expected: all commands exit 0; both declared subpaths emit JavaScript and declarations; tests perform no live network work.

- [ ] **Step 10: Commit**

```bash
git add packages/adapters/package.json packages/adapters/tsconfig.json packages/adapters/tsconfig.build.json packages/adapters/vitest.config.ts packages/adapters/eslint.config.js packages/adapters/README.md packages/adapters/LICENSE packages/adapters/src/google/provider-location.ts packages/adapters/src/google/provider-failure.ts packages/adapters/src/google/GoogleRouteAdapter.ts packages/adapters/src/google/GooglePlaceAdapter.ts packages/adapters/src/google/GoogleNavigationAdapter.ts packages/adapters/src/google/index.ts packages/adapters/src/google/node/GooglePlaceSearchAdapter.ts packages/adapters/src/google/node/index.ts packages/adapters/tests/google-route-adapter.test.ts packages/adapters/tests/google-place-adapter.test.ts packages/adapters/tests/google-navigation-adapter.test.ts packages/adapters/tests/google-node-place-search-adapter.test.ts packages/adapters/tests/boundaries.test.ts package-lock.json
git commit -m "feat(adapters): extract Google route and place providers"
```

---

### Task 6: Extract Google map mechanics behind presentation-owned marker DOM

**Files:**

- Create: `packages/adapters/src/google/google-map-adapter.ts`
- Create: `packages/adapters/src/google/google-config.ts`
- Modify: `packages/adapters/src/google/index.ts`
- Create: `packages/adapters/tests/google-map-adapter.test.ts`
- Create: `packages/adapters/tests/google-config.test.ts`
- Modify: `packages/adapters/tests/boundaries.test.ts`

**Interfaces:**

- Exports: `GoogleMapAdapter`, `GoogleMapAdapterOptions`, `GoogleMapsRuntime`, `GoogleMapsLoader`, `GoogleMapsLoaderBindings`, `GoogleMapsConfigInput`, `GoogleMapsConfigState`, `createGoogleMapsLoader`, `createGoogleMapsConfigurator`, and `configureGoogleMaps`.
- Implements: roadmap-ledger `MapAdapterV2` without importing a presentation or constructing branded DOM.
- Translates: every `MapBasemapPalette`/station/POI field and both `MapRouteStyle` branches into Google mechanics; it never authors fallback paint.

```ts
export interface GoogleMapAdapterOptions {
  development: boolean;
  mapId?: string;
}

export class GoogleMapAdapter implements MapAdapterV2 {
  constructor(runtime: GoogleMapsRuntime, options: GoogleMapAdapterOptions);
  mount(element: HTMLElement, config: MapMountConfig): Promise<void>;
  render(presentation: MapPresentationV2): void;
  applyCameraIntent(intent: CameraIntent): void;
  getCameraSnapshot(): CameraSnapshot | null;
  setUserLocation(location: Coordinates | null): void;
  destroy(): void;
}
```

The constructor receives provider runtime plus mechanics-only options. `MapMountConfig` remains the sole owner of events, visual profile, itinerary-marker factory, and user-location factory.

- [ ] **Step 1: Write the marker-backend and lifecycle red tests**

Refactor the current `GoogleMapAdapter lifecycle` tests into package tests, replacing classic-Marker assertions with these exact cases:

- AdvancedMarker with a Map ID mounts `MarkerContentHandle.element`, calls `update` on descriptor changes, and calls `dispose` exactly once on removal/destroy;
- absent or blank Map IDs in both development and production use `OverlayView`; it mounts the exact same element instance in `overlayMouseTarget`, positions it through `fromLatLngToDivPixel`, and preserves the same events/accessibility supplied by the factory;
- construction is exactly `new GoogleMapAdapter(runtime, { development, mapId? })`; no constructor overload accepts a profile, marker factory, events, API key, or DOM element;
- a ready configuration's `createMap()` returns a fresh adapter on every call while the loader runtime remains single-flight, so retry never reuses a destroyed instance;
- no source or test constructs `google.maps.Marker`, a fallback SVG, branded class name, icon, ordinal, or label DOM;
- non-null user location creates exactly one `UserLocationContentHandle` through `createUserLocationContent`, AdvancedMarker and OverlayView mount that handle's exact element, coordinate changes call `update`, null/removal/remount/destroy call `dispose` exactly once, and no provider-authored dot or fallback DOM is constructed;
- selection events fire only while the generation is mounted;
- a provider-originated terminal runtime failure calls the current generation's `MapEventsV2.onUnavailable` exactly once with a typed `ProviderUnavailableResult`; a stale generation, normal cleanup, and an already-reported terminal failure emit nothing;
- marker reconciliation is keyed only by `ownerId`, route reconciliation only by `edgeId`, and a later duplicate is ignored without stealing/updating the first owner;
- basemap mode/density/contrast/POI/station guidance and all six palette values translate exactly into Google style declarations without importing a Google type into the profile;
- a `solid` route style maps only to line/casing strokes; `circle` and `dash` symbol styles map exact repeat/scale/fill/stroke values onto provider symbols with underlying polyline opacity zero; `null` or invalid numeric/paint values suppress the route rather than substituting a Google default;
- one bad coordinate quarantines that whole route render;
- user location updates do not move camera;
- queued render before mount, destroy during mount, explicit remount, listener cleanup, marker cleanup, overlay cleanup, polyline cleanup, and stale generations match the current lifecycle guarantees.

- [ ] **Step 2: Write camera translation and snapshot failures**

Add tests that:

- `fit` flattens only its supplied points/paths, applies exact edge insets, and enforces `maximumZoom` after fit settles;
- `fit` with `transition: "immediate"` still uses provider bounds fitting but explicitly selects zero-duration/no-animation behavior, while `fit` with `transition: "animate"` uses the established provider fit animation;
- animated focus/recenter uses provider pan operations and immediate uses provider move operations, both with the supplied numeric zoom;
- focus/recenter applies the edge-inset offset needed to place the coordinate at the supplied usable-region center;
- repeated intent IDs are still applied when geometry changes; the adapter does not deduplicate semantic intents;
- `getCameraSnapshot()` returns `{ zoom }` only for a finite provider zoom and otherwise returns null;
- the adapter never chooses a minimum, maximum, preserved, or provider-default focus zoom.

- [ ] **Step 3: Run the red map tests**

```bash
npm run build --workspace @laugh-tale-island/adapters
npm test --workspace @laugh-tale-island/adapters -- tests/google-map-adapter.test.ts tests/google-config.test.ts
```

Expected: FAIL because map/config exports do not exist.

- [ ] **Step 4: Implement SDK loading and typed configuration**

Port the current loader's single-flight, equivalent-key reuse, different-key refusal, retry-after-load-failure, and dependency injection. `GoogleMapsRuntime` contains `Map`, `AdvancedMarkerElement`, `OverlayView`, `Polyline`, and the provider circle-symbol primitive required to translate `shape: "circle"`; it does not contain classic `Marker`. `GoogleMapsConfigState` is:

```ts
export type GoogleMapsConfigState =
  | { status: "missing-configuration" }
  | { status: "ready"; createMap: () => MapAdapterV2 }
  | {
      status: "unavailable";
      reason: "loader-failed";
      retryable: true;
      diagnostic?: string;
    };
```

`GoogleMapsConfigInput` contains `apiKey?`, `mapId?`, and `development`; profile and marker factory enter only through `MapMountConfig`. Trim an explicitly supplied Map ID, but never inject `DEMO_MAP_ID` or any other implicit ID. Only a nonblank explicit `mapId` enables AdvancedMarker; an absent/blank ID uses OverlayView in development and production. Different key/map-ID/environment after initialization returns typed `loader-failed` diagnostic without building a second adapter.

The ready state exposes a factory, not one disposable adapter instance. Each `createMap()` call constructs a fresh `GoogleMapAdapter` over the single-flight loaded runtime and the same normalized mechanics options; two calls must be non-identical. This lets the Phase 02 lifecycle destroy a failed attempt and retry with a new adapter without reloading the SDK or resurrecting a destroyed instance.

- [ ] **Step 5: Implement one marker-content lifecycle across both backends**

Create one content handle per semantic owner through `config.createMarkerContent`. AdvancedMarker and OverlayView receive that handle's exact `element`; neither clones it. The OverlayView subclass appends/removes the node only through its panes lifecycle and routes DOM activation to `MapEventsV2`. On descriptor update, invoke `handle.update` before changing position. On owner removal, remount generation invalidation, or destroy, detach provider objects, remove listeners, then call `handle.dispose` once.

Use the parallel lifecycle for user location: `null` owns no handle or provider placement; the first valid coordinate calls `config.createUserLocationContent`, both backends place that exact element, later coordinates call `handle.update` before moving it, and clearing/remount/destroy disposes it once. The adapter must never create a default Google location dot, SVG, class, label, pulse, or other presentation fallback.

- [ ] **Step 6: Implement route, user-location, camera, and cleanup mechanics**

Draw only finite `MapRoutePresentationV2.geometry` values of length at least two. Translate basemap colors/guidance and the discriminated route-style union solely from `visualProfile`; require nonblank colors, opacity in `[0, 1]`, positive finite widths/repetition/scale, circle fill, and dash stroke. For a symbol style set the provider polyline's underlying stroke opacity to zero and translate `repeatPx` to provider pixel cadence. Apply `fitBounds` with the supplied insets, selecting zero-duration/no-animation provider behavior for `immediate` and the established animated behavior for `animate`; on the provider's next idle event clamp a finite zoom down to `maximumZoom`. For focus/recenter, set the exact coordinate/zoom and translate the pixel center by half the left-minus-right and top-minus-bottom inset differences so the target lands at the usable-region center. Do not infer policy from `kind` beyond choosing the provider operation requested by `transition`.

Normalize terminal provider-runtime callbacks which cannot be returned synchronously into `ProviderUnavailableResult` and send them only through the mounted generation's `config.events.onUnavailable`; put raw SDK details only in `diagnostic`. After the first terminal event, suppress further work/events until lifecycle-owned destruction. Public synchronous method throws are left catchable by the Phase 02 lifecycle, which converts them to the same typed runtime-unavailable state and destroys this adapter.

- [ ] **Step 7: Run the green map suite**

```bash
npm run build --workspace @laugh-tale-island/adapters
npm test --workspace @laugh-tale-island/adapters -- tests/google-map-adapter.test.ts tests/google-config.test.ts tests/boundaries.test.ts
npm test --workspace @laugh-tale-island/adapters
npm run type-check --workspace @laugh-tale-island/adapters
npm run lint --workspace @laugh-tale-island/adapters
git diff --check
```

Expected: all commands exit 0; source scan finds no classic marker/fallback SVG or presentation import.

- [ ] **Step 8: Commit**

```bash
git add packages/adapters/src/google/google-map-adapter.ts packages/adapters/src/google/google-config.ts packages/adapters/src/google/index.ts packages/adapters/tests/google-map-adapter.test.ts packages/adapters/tests/google-config.test.ts packages/adapters/tests/boundaries.test.ts
git commit -m "feat(adapters): extract Google map mechanics"
```

---

### Task 7: Create deterministic testing primitives and adapter conformance runners

**Files:**

- Create: `packages/testing/package.json`
- Create: `packages/testing/tsconfig.json`
- Create: `packages/testing/tsconfig.build.json`
- Create: `packages/testing/vitest.config.ts`
- Create: `packages/testing/eslint.config.js`
- Create: `packages/testing/README.md`
- Create: `packages/testing/LICENSE` (copy root `LICENSE`)
- Create: `packages/testing/src/fakes/FakeMapAdapterV2.ts`
- Create: `packages/testing/src/fakes/FakeRouteAdapterV2.ts`
- Create: `packages/testing/src/fakes/FakePlaceAdapterV2.ts`
- Create: `packages/testing/src/fakes/FakeNavigationAdapterV2.ts`
- Create: `packages/testing/src/fakes/FakeProgressStore.ts`
- Create: `packages/testing/src/fakes/FakeClock.ts`
- Create: `packages/testing/src/fixtures/synthetic-trip-v2.ts`
- Create: `packages/testing/src/fixtures/adversarial-routes.ts`
- Create: `packages/testing/src/fixtures/adversarial-places.ts`
- Create: `packages/testing/src/setups/deterministic-locale.ts`
- Create: `packages/testing/src/setups/deterministic-viewport.ts`
- Create: `packages/testing/src/contracts/route-adapter-v2.ts`
- Create: `packages/testing/src/contracts/place-adapter-v2.ts`
- Create: `packages/testing/src/contracts/map-adapter-v2.ts`
- Create: `packages/testing/src/index.ts`
- Create: `packages/testing/tests/fakes.test.ts`
- Create: `packages/testing/tests/fixtures.test.ts`
- Create: `packages/testing/tests/setups.test.ts`
- Create: `packages/testing/tests/google-conformance.test.ts`
- Create: `packages/testing/tests/boundaries.test.ts`
- Modify: `package-lock.json`

**Interfaces:**

- Package: `@laugh-tale-island/testing@2.0.0` with one root export.
- Exports: `FakeMapAdapterV2`, `FakeRouteAdapterV2`, `FakePlaceAdapterV2`, `FakeNavigationAdapterV2`, `FakeProgressStore`, `FakeClock`, `createDeterministicLocaleSetup`, `createDeterministicViewportSetup`, `syntheticTripV2`, `adversarialRouteFixtures`, `adversarialPlaceFixtures`, `defineRouteAdapterV2Contract`, `definePlaceAdapterV2Contract`, and `defineMapAdapterV2Contract`.
- Every fake has `readonly testOnly = true as const` and snapshots all input/output values.

```ts
export interface FakeClockSnapshot {
  instant: string;
  readCount: number;
}

export class FakeClock {
  readonly testOnly: true;
  constructor(initialInstant: string);
  readonly now: () => string;
  advanceMinutes(minutes: number): void;
  snapshot(): FakeClockSnapshot;
}

export interface DeterministicLocaleSetup {
  locale: string;
  timeZone: string;
  instant: string;
}

export function createDeterministicLocaleSetup(
  input?: Partial<DeterministicLocaleSetup>,
): DeterministicLocaleSetup;

export interface DeterministicViewportSetup {
  viewport: MapViewportMetrics;
  occlusions: readonly OcclusionRect[];
}

export function createDeterministicViewportSetup(input?: {
  width?: number;
  height?: number;
  occlusions?: readonly OcclusionRect[];
}): DeterministicViewportSetup;

export function defineMapAdapterV2Contract(
  label: string,
  createAdapter: () => MapAdapterV2,
  createHost: () => HTMLElement,
  createMarkerContent: MarkerContentFactory,
  createUserLocationContent: UserLocationContentFactory,
): void;
```

- [ ] **Step 1: Create the non-behavioral testing-package scaffold**

Create the listed manifest, TypeScript/Vitest/ESLint configuration, README, and LICENSE, but no source stubs. Use the core/react package build conventions with jsdom as the test environment. Set exact `2.0.0` dependencies on `@laugh-tale-island/core`, `@laugh-tale-island/react`, and `@laugh-tale-island/adapters`. Set peers `react: ">=19.2.0 <20"`, `react-dom: ">=19.2.0 <20"`, and `vitest: ">=4.1.0 <5"`; use the repository's exact current versions as dev dependencies.

```bash
npm install --package-lock-only --no-audit --no-fund
```

Expected: exit 0 and the lockfile records testing as a leaf workspace with all three exact internal edges.

- [ ] **Step 2: Write failing fake-isolation tests**

Test each fake for cloned recorded calls, cloned resolver inputs, mutation-safe results, prototype-safe fixture lookup, immediate caller cancellation, late-result isolation, and deterministic retry. For the map fake, record complete mount configs, renders, camera intents, snapshots, user locations, and destruction; emit selection/unavailable only while mounted, dispose every fake itinerary-marker handle once, and independently create/update/clear/remount/destroy every fake user-location handle exactly once. `FakeNavigationAdapterV2` records deep-cloned place/route/authored-external requests, exposes a configurable `open` result, and proves destination-only place calls cannot be silently widened into route calls. For `FakeProgressStore`, cover read/write/subscribe and injected read/write refusal without losing in-memory progress. For `FakeClock`, validate the initial instant without reading the host clock, require finite integer minute advances, prove forward/backward minute movement, count `now` reads, and return a mutation-safe `{ instant, readCount }` snapshot.

- [ ] **Step 3: Write fixture truth tests**

`syntheticTripV2` must exercise every built-in node kind, one valid custom role, resolved-by-coordinate, resolved-by-provider, unresolved place, walking/transit/driving/flight/unknown routes, candidate choice, booking, task, and progress owner without Tokyo names, coordinates, Place IDs, dates, reservations, or other benchmark private facts.

`adversarialRouteFixtures` must expose named `valid`, `validFlight`, `malformedCoordinate`, `onePoint`, `endpointMismatch`, `remoteMiddlePoint`, `implausibleDuration`, `implausibleFlight`, and `unsupportedUnknown` request/result pairs with expected stable status/reason. `validFlight` remains ready for dedicated presentation, while ordinary day-fit exclusion is tested in Phase 02. `adversarialPlaceFixtures` must expose `knownOpen`, `knownClosed`, `absentHours`, `incompleteHours`, `overnight`, and `wrongTimezone` cases with explicit instant/timezone/expected state.

In `setups.test.ts`, require the locale setup's defaults to be canonical `en`, `UTC`, and a fixed RFC 3339 instant; overrides are validated and cloned without consulting browser language/timezone. Require viewport defaults to fixed synthetic dimensions with no occlusions; finite positive overrides and finite clipped-neutral rectangles are cloned and deeply frozen, while invalid dimensions/rectangles throw. Neither setup reads `window`, `document`, `navigator`, `Date.now`, environment variables, or a benchmark fixture.

- [ ] **Step 4: Write conformance runners and Google invocation**

Each `define*Contract` function accepts a label and a factory and declares Vitest cases for cancellation, mutation isolation, stable owner behavior, and settled typed failures. `defineMapAdapterV2Contract` has the exact five-argument signature frozen above and supplies both presentation-owned DOM factories in `MapMountConfig`. In addition to route/marker/camera semantics, it proves user-location create → coordinate update → null clear → remount → destroy lifecycle, exact factory-owned element identity, update-before-provider-move, once-only disposal, and typed mounted-generation `onUnavailable` behavior. Invoke all applicable contracts against the Google implementations in `google-conformance.test.ts`; use injected fake fetch/runtime so no network or SDK load occurs.

- [ ] **Step 5: Run the red workspace test**

```bash
npm test --workspace @laugh-tale-island/testing -- tests/fakes.test.ts tests/fixtures.test.ts tests/setups.test.ts tests/google-conformance.test.ts
```

Expected: FAIL because the focused tests import the not-yet-created fake, fixture, and conformance source modules.

- [ ] **Step 6: Implement the testing primitives**

Implement every listed fake, fixture, deterministic setup, conformance runner, and root export. Keep itinerary-marker and user-location call/handle ledgers separate so one cannot accidentally satisfy the other's assertion. No core/react/adapters production source may import this package.

Factories that throw or reject map to typed `network` results in fakes, with the thrown message in `diagnostic`. Fixture maps use own-property lookup only. All public fixtures are deeply frozen after construction; fake call records are cloned but remain readable.

- [ ] **Step 7: Enforce leaf/test-only boundaries**

Scan all four package source trees. Assert testing may import core/react/adapters, adapters may import only core among Laugh Tale packages, React may import only core, and core imports none. Reject any import of testing from `packages/{core,react,adapters}/src`. Assert each fake's `testOnly` marker and assert no generated production entry imports `@laugh-tale-island/testing`.

- [ ] **Step 8: Run the green testing suite**

```bash
npm install --package-lock-only --no-audit --no-fund
npm run build --workspace @laugh-tale-island/testing
npm test --workspace @laugh-tale-island/testing
npm run type-check --workspace @laugh-tale-island/testing
npm run lint --workspace @laugh-tale-island/testing
git diff --check
```

Expected: all commands exit 0; Google implementations pass neutral conformance without live services.

- [ ] **Step 9: Commit**

```bash
git add packages/testing/package.json packages/testing/tsconfig.json packages/testing/tsconfig.build.json packages/testing/vitest.config.ts packages/testing/eslint.config.js packages/testing/README.md packages/testing/LICENSE packages/testing/src/fakes/FakeMapAdapterV2.ts packages/testing/src/fakes/FakeRouteAdapterV2.ts packages/testing/src/fakes/FakePlaceAdapterV2.ts packages/testing/src/fakes/FakeNavigationAdapterV2.ts packages/testing/src/fakes/FakeProgressStore.ts packages/testing/src/fakes/FakeClock.ts packages/testing/src/fixtures/synthetic-trip-v2.ts packages/testing/src/fixtures/adversarial-routes.ts packages/testing/src/fixtures/adversarial-places.ts packages/testing/src/setups/deterministic-locale.ts packages/testing/src/setups/deterministic-viewport.ts packages/testing/src/contracts/route-adapter-v2.ts packages/testing/src/contracts/place-adapter-v2.ts packages/testing/src/contracts/map-adapter-v2.ts packages/testing/src/index.ts packages/testing/tests/fakes.test.ts packages/testing/tests/fixtures.test.ts packages/testing/tests/setups.test.ts packages/testing/tests/google-conformance.test.ts packages/testing/tests/boundaries.test.ts package-lock.json
git commit -m "feat(testing): add deterministic v2 provider fixtures"
```

---

### Task 8: Enforce the four-package DAG in manifests, staging, and generated metadata

**Files:**

- Modify: `packages/core/package.json`
- Modify: `packages/react/package.json`
- Modify: `packages/adapters/package.json`
- Modify: `packages/testing/package.json`
- Modify: `plugins/eternal-pose/starter/react/package.json`
- Modify: `scripts/stage-starter-consumer.mjs`
- Modify: `plugins/eternal-pose/scripts/create-trip-project.mjs`
- Modify: `plugins/eternal-pose/scripts/validate-trip-project.mjs`
- Create: `tests/packages/dependency-graph.test.ts`
- Modify: `tests/scripts/stage-starter-consumer.test.ts`
- Modify: `tests/generation/create-real-starter.test.ts`
- Modify: `tests/generation/generated-project.test.ts`
- Modify: `tests/generation/recipe-v2.test.ts`
- Modify: `tests/scripts/publication-scan.test.ts`
- Modify: `package-lock.json`

**Interfaces:**

- Produces exact DAG: core → none; React → core; adapters → core; testing → core/React/adapters.
- Generated manifest placement: core/React/adapters in `dependencies`, testing in `devDependencies`.
- Staging order: core, then React, then adapters, then testing; manifest rewriting covers both dependency sections.

- [ ] **Step 1: Write the failing dependency-graph test**

`dependency-graph.test.ts` reads the four manifests and starter manifest and asserts:

- all package versions equal `2.0.0`;
- every internal edge uses the exact owning package version;
- core has no `@laugh-tale-island/*` dependency;
- React has core only in `dependencies`, never peer/dev, and peers on React plus React DOM;
- adapters has core only and no React/testing dependency; loader is optional peer;
- testing has exact core/React/adapters dependencies and no package depends back on testing;
- starter has exact core/React/adapters production dependencies and exact testing dev dependency;
- a DFS over internal dependencies is acyclic.

- [ ] **Step 2: Add failing staging assertions**

Change `expectWorkspaceTarballs` and `expectExactlyOneWorkspaceBuildAndPack` in `stage-starter-consumer.test.ts` to require four unique tarballs and one build/pack per package in the exact topological order. Assert staged `dependencies` rewrite core/React/adapters to their invocation-owned tarballs and staged `devDependencies` rewrites testing. Add a failure case proving a missing testing tarball refuses publication and preserves the prior staged consumer.

- [ ] **Step 3: Add failing generated-metadata assertions**

Update generated fixtures so `package.json` carries the three production packages plus testing dev dependency. Require `eternal-pose.json.packages` to record all four exact versions. Validator tests must reject a missing, ranged, misplaced, or version-skewed package and retain `project.missing-package-dependency` / `project.invalid-package-specifier` plus new `project.misplaced-package-dependency` and `project.package-version-skew` codes.

- [ ] **Step 4: Run the red graph/script tests**

```bash
npm test -- tests/packages/dependency-graph.test.ts tests/scripts/stage-starter-consumer.test.ts tests/generation/create-real-starter.test.ts tests/generation/generated-project.test.ts tests/generation/recipe-v2.test.ts
```

Expected: FAIL on the two-package assumptions, absent package versions, missing testing dev rewrite, and dependency placement.

- [ ] **Step 5: Apply exact manifests and lockstep version**

Set every package to `2.0.0` and apply the dependency placement from the design. Add adapters `2.0.0` to the starter's production dependencies and testing `2.0.0` to dev dependencies. Do not modify the stale 1.0 Tokyo generated project in this phase; Plan 05 replaces it atomically from canonical inputs.

- [ ] **Step 6: Make staging topological and section-aware**

Replace alphabetical package discovery with the constant `PACKAGE_BUILD_ORDER = ["core", "react", "adapters", "testing"]`. Verify each directory has the expected package name before building. Continue ignoring non-package directories and metadata files. Rewrite matching Laugh Tale specifiers in both `dependencies` and `devDependencies`; reject a referenced internal package without an invocation-owned tarball. Preserve all current lock/ownership/rollback behavior and pack-root lifetime guarantees.

- [ ] **Step 7: Record and validate four generated package pins**

In Create, collect Laugh Tale packages from both dependency sections, reject duplicate names across sections, and write the sorted four-entry map. In validation, enforce production/dev placement, exact semver, and one shared version. Do not add schema-2 paths, Enrich writes, or candidate/registry mode here; Plan 05 replaces the broader validator contract.

- [ ] **Step 8: Run the green graph/script suites**

```bash
npm install --package-lock-only --no-audit --no-fund
npm test -- tests/packages/dependency-graph.test.ts tests/scripts/stage-starter-consumer.test.ts tests/scripts/stage-starter-consumer-concurrency.test.ts
npm test -- tests/generation/create-real-starter.test.ts tests/generation/generated-project.test.ts tests/generation/recipe-v2.test.ts tests/scripts/publication-scan.test.ts
npm run type-check
git diff --check
```

Expected: all commands exit 0; staging reports exactly four invocation-owned tarballs and never resolves a workspace link.

- [ ] **Step 9: Commit**

```bash
git add packages/core/package.json packages/react/package.json packages/adapters/package.json packages/testing/package.json plugins/eternal-pose/starter/react/package.json scripts/stage-starter-consumer.mjs plugins/eternal-pose/scripts/create-trip-project.mjs plugins/eternal-pose/scripts/validate-trip-project.mjs tests/packages/dependency-graph.test.ts tests/scripts/stage-starter-consumer.test.ts tests/generation/create-real-starter.test.ts tests/generation/generated-project.test.ts tests/generation/recipe-v2.test.ts tests/scripts/publication-scan.test.ts package-lock.json
git commit -m "build: enforce the four-package v2 DAG"
```

---

### Task 9: Prove all four tarballs and lockstep release plumbing

**Files:**

- Modify: `tests/packages/artifacts.test.ts`
- Modify: `tests/packages/clean-consumer.test.ts`
- Create: `tests/scripts/set-release-versions.test.ts`
- Modify: `scripts/set-release-versions.mjs`
- Modify: `.releaserc.json`
- Modify: `packages/core/README.md`
- Modify: `packages/react/README.md`
- Modify: `packages/adapters/README.md`
- Modify: `packages/testing/README.md`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `RELEASING.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `package-lock.json`

**Interfaces:**

- Artifact export proof: core `.`, `./browser`, `./enrichment`; adapters `./google`, `./google/node`; React `.`, testing `.`.
- Release mutation: one version argument updates all four manifests and every internal exact edge.
- Current semantic-release publish order: core → React → adapters → testing. Plan 06 later replaces direct default publication with candidate verification/promotion; this task only makes the existing plumbing graph-correct.

- [ ] **Step 1: Expand artifact tests and observe red**

Change `artifacts.test.ts` from “both tarballs” to a table of all four package directories and declared emitted entry files. Continue allowing only `package.json`, `README.md`, `LICENSE`, and `dist/**`; reject tests, fixtures, source, source maps, workspace links, and undeclared deep paths.

Change `clean-consumer.test.ts` to pack core first, then React and adapters, then testing; install all four tarballs plus the current external peers; type-check imports from every declared subpath; dynamically import Node-safe roots; assert all installed packages are real directories with no `src`; and assert runtime exports include `validateTrip`, `createPlaceSearchQuery`, `GoogleRouteAdapter`, `GooglePlaceSearchAdapter`, and `FakeRouteAdapterV2`.

```bash
npm test -- tests/packages/artifacts.test.ts tests/packages/clean-consumer.test.ts
```

Expected: FAIL because the tests still know two artifacts and do not inspect new subpaths/dependency placement.

- [ ] **Step 2: Write release-version tests before changing the script**

Refactorability test requirement: `setReleaseVersions(version, { repoRoot })` must accept a temporary four-manifest fixture, reject invalid semver before writing, set all package versions, set every internal exact edge, leave external peers unchanged, and perform no partial write when any manifest has a missing/misplaced expected edge. Add an executable-path test for the current CLI usage error.

```bash
npm test -- tests/scripts/set-release-versions.test.ts
```

Expected: FAIL because the function hard-codes repository paths, updates only core/React, and keeps core in React peer/dev dependencies.

- [ ] **Step 3: Implement prevalidated four-manifest version preparation**

Change `setReleaseVersions` to read and validate all four manifests before any write. Accept an optional injected repo root for tests. Update versions and internal edges according to the DAG, write each normalized JSON file only after the complete in-memory graph validates, and return `{ version, packages: ["core", "react", "adapters", "testing"] }`. This guarantees validation failures cause no partial write; it does not claim filesystem transactionality across later I/O failures. Guard CLI execution by comparing `import.meta.url` with the invoked script path so tests can import without executing it.

- [ ] **Step 4: Update current release configuration without publishing**

Add adapters/testing manifests to semantic-release Git assets. Build once, then publish core, React, adapters, and testing in that order with the existing provenance/access flags. Update the explanatory comment to state that React and adapters are peers in publication order, not package dependencies on each other. Do not run semantic-release or npm publish.

- [ ] **Step 5: Update package documentation and CI wording**

Document the exact DAG, public subpaths, browser/server credential separation, no-runtime-search rule, structured diagnostics, testing-only fake marker, and topological release order. Correct README claims that there are only two packages. In CI comments, describe four staged tarballs; do not change the independent Tokyo 1.0 baseline job until Plan 05 regenerates it.

- [ ] **Step 6: Run artifact, release, and workspace gates**

```bash
npm test -- tests/packages/artifacts.test.ts tests/packages/clean-consumer.test.ts tests/scripts/set-release-versions.test.ts
npm run build:packages
npm run test:packages
npm run type-check:packages
npm run lint:packages
npm run check
npm run stage:starter
npm --prefix tmp/staged-starter ls @laugh-tale-island/core @laugh-tale-island/react @laugh-tale-island/adapters @laugh-tale-island/testing
git diff --check
```

Expected: all commands exit 0; the staged dependency tree resolves four packed tarballs and contains no `link:`/`workspace:` source resolution. Do not run the staged starter application gate yet: its 1.0 controller/provider copies are replaced by Plans 02–03.

- [ ] **Step 7: Commit**

```bash
git add tests/packages/artifacts.test.ts tests/packages/clean-consumer.test.ts tests/scripts/set-release-versions.test.ts scripts/set-release-versions.mjs .releaserc.json packages/core/README.md packages/react/README.md packages/adapters/README.md packages/testing/README.md README.md CONTRIBUTING.md RELEASING.md .github/workflows/ci.yml package-lock.json
git commit -m "build: verify four lockstep package artifacts"
```

---

## Phase 01 Completion Gate

- [ ] **Step 1: Run every package gate from a clean built state**

```bash
npm run build:packages
npm run test:packages
npm run type-check:packages
npm run lint:packages
```

Expected: core, React, adapters, and testing all exit 0.

- [ ] **Step 2: Run repository package/script integration**

```bash
npm test -- tests/packages/dependency-graph.test.ts tests/packages/artifacts.test.ts tests/packages/clean-consumer.test.ts tests/scripts/set-release-versions.test.ts tests/scripts/stage-starter-consumer.test.ts tests/scripts/stage-starter-consumer-concurrency.test.ts
npm run check
npm run stage:starter
```

Expected: all commands exit 0 and staging returns four tarballs in topological order.

- [ ] **Step 3: Run the adversarial truth gate explicitly**

```bash
npm test --workspace @laugh-tale-island/core -- tests/v2-domain.test.ts tests/opening-hours.test.ts tests/route-validation.test.ts
npm test --workspace @laugh-tale-island/adapters -- tests/google-route-adapter.test.ts tests/google-place-adapter.test.ts tests/google-node-place-search-adapter.test.ts tests/google-map-adapter.test.ts
npm test --workspace @laugh-tale-island/testing -- tests/fixtures.test.ts tests/google-conformance.test.ts
```

Expected: all commands exit 0; unknown route, unresolved place, overnight/timezone hours, implausible duration, endpoint mismatch, remote point, transit line, missing key, abort, malformed response, and Node/browser isolation are each exercised by name.

- [ ] **Step 4: Verify phase scope and handoff**

```bash
npm test --workspace @laugh-tale-island/core -- tests/boundaries.test.ts
npm test --workspace @laugh-tale-island/react -- tests/boundaries.test.ts
npm test --workspace @laugh-tale-island/adapters -- tests/boundaries.test.ts
npm test --workspace @laugh-tale-island/testing -- tests/boundaries.test.ts
git status --short
```

Expected: the dedicated recursive boundary suites prove there is no production import of testing, no browser/Google symbol in the Node/core roots, and status contains only intentional Phase 01 changes. Record that Phase 02 now owns `ExperienceChoreographyState`, `reduceExperienceChoreography`, `useVisibleMapLayout`, `useMapAdapterLifecycle`, `useOwnerFocusRegistry`, `useMinuteClock`, `createMemoryTripNavigationStore`, usable-region selection, edge-inset derivation, and numeric camera-intent resolution using the exact DTOs in this plan.

- [ ] **Step 5: Request review before Phase 02**

Use `superpowers:requesting-code-review`. The review must confirm the roadmap names, four-package DAG, Node/browser subpath isolation, raw-diagnostic containment, route quarantine before map projection, and absence of any 1.0 migration or generated-presentation edit. Do not begin Phase 02 until every blocker is resolved and this completion gate is rerun.
