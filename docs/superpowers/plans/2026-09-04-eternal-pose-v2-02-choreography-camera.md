# Eternal Pose v2 Phase 02: Choreography and Camera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the provider-neutral choreography, rectangle-aware camera policy, faithful three-snap sheet controller, measured map layout, and persistent map lifecycle needed to reproduce the Tokyo benchmark without putting presentation geometry or trip content into an npm package.

**Architecture:** Phase 01 supplies the v2 domain, camera DTOs, adapter contracts, and complete Google camera-intent translation. This phase adds the neutral navigation store plus pure geometry, camera resolution, and experience reducers to core, then implements DOM effects as package-internal React hooks. The reducer emits semantic camera requests, core resolves them into `CameraIntent`, React reapplies geometry changes once per animation frame, and the existing adapter performs provider mechanics without choosing zoom or fit policy.

**Tech Stack:** Node 22.13+, npm 11, TypeScript 5.9, React 19.2, Vitest 4, Testing Library, jsdom, Google Maps JavaScript API test doubles, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-04-eternal-pose-v2-oak-washi-flagship-design.md`

## Global Constraints

- Start only after every Phase 01 package gate is green. Read the Phase 01 plan's completion evidence and inspect its landed interfaces before changing code.
- Treat the roadmap's stable interface ledger as authoritative. `CameraIntent` always uses `intentId`, `transition`, `viewport`, `usableRegion`, and `edgeInsets`; its variants remain `fit`, `focus`, and `recenter-user`.
- Phase 01 owns the DTO and complete adapter implementation, including animate/immediate translation for all three variants, numeric zoom forwarding, usable-region offset, and repeated semantic IDs. In particular, Google fit-immediate uses the reviewed zero-duration/no-animation path and fit-animate uses the provider animation path. Extend `packages/core/src/map-camera.ts`; create the single navigation seam in `packages/core/src/trip-navigation.ts`; do not modify the Google adapter or add competing types, stores, adapter methods, or constructor forms.
- Keep core framework-neutral and deterministic. It may own finite-number validation, rectangle subtraction, zoom constants, fit/focus/recenter policy, semantic IDs, and reducers, but never DOM access, timers, media queries, or provider SDK calls.
- Keep React visually headless. No file under `packages/react/src/**` may contain visible copy, CSS imports, icon imports, Tokyo coordinates, Oak & Washi colors, sheet pixel targets, breakpoints, motion durations, or easing values.
- The generated presentation owns collapsed/half/expanded dimensions, header dimensions, breakpoints, layer styling, and motion timings. React consumes measured numbers and suppresses transition duration while dragging or under reduced motion; it does not define the benchmark's `104px`, `46dvh`, `43.75rem`, `220ms`, `160ms`, or easing values.
- The Phase 02 hooks are package-internal implementation seams. Tests and the Phase 03 controller import them with relative paths. Do not export `useItinerarySheet`, `useVisibleMapLayout`, `useMapAdapterLifecycle`, `useMinuteClock`, or `useOwnerFocusRegistry` from `packages/react/src/index.ts`.
- The six 1.0 hooks are not a compatibility surface. Do not add deprecation wrappers, aliases, or tests that require those root exports to survive. Phase 03 freezes the v2 root runtime allowlist as `TripController` and `useTripExperience`.
- `MapAdapterV2` is persistent across presentation, selection, sheet, header, and camera changes. Only a factory change, mount-contract change, explicit retry after failure, host-element replacement, or unmount may replace it.
- A new user/day/restore/recenter semantic action uses `animate`, except that reduced motion uses `immediate`. A material geometry change keeps the same `intentId`, forces `immediate`, and applies at most once per animation frame.
- Use only synthetic owner/day IDs and synthetic coordinates in package tests. Read the benchmark source as an interaction oracle, but do not copy private itinerary content or depend on `/Users/bluesky/arsenal/tokyo-trip-map` at runtime or in CI.
- Use TDD for every task: add the focused failing assertion, run it and observe the named failure, implement only the task, rerun the target, run `git diff --check`, and make the exact focused commit.
- Use `apply_patch` for source changes. Preserve unrelated user files and never stage with `git add .`.
- Before declaring Phase 02 complete, use `superpowers:verification-before-completion` and run the phase gate in Task 9 from a clean worktree.

## Phase 01 Interfaces Consumed Without Redefinition

Phase 01 lands these exact shapes in `packages/core/src/map-camera.ts`:

```ts
export interface MapViewportMetrics {
  width: number;
  height: number;
}

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

export interface CameraSnapshot {
  zoom: number;
}

interface CameraIntentBase {
  intentId: string;
  transition: "animate" | "immediate";
  viewport: MapViewportMetrics;
  usableRegion: UsableRegion;
  edgeInsets: EdgeInsets;
}

export type FitCameraIntent = CameraIntentBase & {
  kind: "fit";
  points: readonly Coordinates[];
  paths: readonly (readonly Coordinates[])[];
  maximumZoom: number;
};

export type FocusCameraIntent = CameraIntentBase & {
  kind: "focus";
  coordinate: Coordinates;
  targetZoom: number;
};

export type RecenterUserCameraIntent = CameraIntentBase & {
  kind: "recenter-user";
  coordinate: Coordinates;
  targetZoom: number;
};
```

Phase 01 also lands:

- `MapPresentationV2 { markers, routes }`, `MapEventsV2 { onMarkerSelect, onRouteSelect, onUnavailable }`, `MapMountConfig { events, visualProfile, createMarkerContent, createUserLocationContent }`, and marker/user-location/profile factories in `packages/core/src/browser/v2-map.ts`;
- `MapAdapterV2` in `packages/core/src/browser/v2-adapters.ts`;
- `GoogleMapAdapter`, constructed only as `new GoogleMapAdapter(runtime, { development, mapId? })`, plus its complete `applyCameraIntent` and `getCameraSnapshot` behavior in `packages/adapters/src/google/google-map-adapter.ts`.

If the landed Phase 01 code differs from these reviewed names, stop and reconcile the Phase 01 plan, this plan, Phase 03, and the roadmap ledger together. Do not locally accommodate drift.

## Benchmark Oracle Inventory

These paths are read-only evidence. Port behavior into repository-owned tests; never import these files from package code.

| Concern | Benchmark source or test |
| --- | --- |
| Position-only three-snap geometry | `/Users/bluesky/arsenal/tokyo-trip-map/app/components/sheet/sheet-geometry.ts`; `sheet-geometry.test.ts` |
| Pointer capture, rendered ceiling, rAF drag | `/Users/bluesky/arsenal/tokyo-trip-map/app/components/sheet/ItinerarySheet.tsx`; `ItinerarySheet.test.tsx` |
| Day/header/sheet selection choreography | `/Users/bluesky/arsenal/tokyo-trip-map/app/components/mobile-day/MobileDayScreen.tsx`; `MobileDayScreen.test.tsx` |
| Fit, focus, user recenter, offset, cancellation | `/Users/bluesky/arsenal/tokyo-trip-map/app/components/map/google-map-adapter.ts`; `google-map-adapter.test.ts` |
| Persistent provider lifecycle | `/Users/bluesky/arsenal/tokyo-trip-map/app/components/map/ItineraryMap.tsx`; `ItineraryMap.test.tsx` |
| Responsive/motion acceptance | `/Users/bluesky/arsenal/tokyo-trip-map/tests/e2e/mobile-itinerary.spec.ts` |

## Delivery File Map

| Layer | Files owned by this phase | Responsibility |
| --- | --- | --- |
| Core geometry/camera | `packages/core/src/map-camera.ts`, `packages/core/tests/map-camera-layout.test.ts`, `packages/core/tests/map-camera-policy.test.ts` | Normalize measured rectangles, choose the deterministic usable region, derive edge insets, resolve numeric intents, preserve IDs on reframe |
| Core navigation/choreography | `packages/core/src/trip-navigation.ts`, `packages/core/src/experience-choreography.ts`, matching tests, `packages/core/src/index.ts` | Neutral in-memory navigation seam plus pure selection/sheet/header/camera-request state machine |
| Core sheet math | `packages/core/src/sheet-geometry.ts`, `packages/core/tests/sheet-geometry.test.ts` | Normalize presentation-supplied snap heights and settle by position only |
| React sheet | `packages/react/src/use-itinerary-sheet.ts`, `packages/react/tests/use-itinerary-sheet.test.tsx` | Pointer capture, rendered ceiling, rAF drag, keyboard stepping, cancellation cleanup |
| React layout | `packages/react/src/use-visible-map-layout.ts`, `packages/react/tests/use-visible-map-layout.test.tsx` | Register viewport/occluders, measure safe area and visual viewport, publish material layout changes |
| React map lifecycle | `packages/react/src/use-map-adapter-lifecycle.ts`, `packages/react/tests/use-map-adapter-lifecycle.test.tsx` | Persistent mount/render, retry/staleness, camera application, once-per-frame reframe |
| React clock/focus | `packages/react/src/use-minute-clock.ts`, `packages/react/src/use-owner-focus-registry.ts`, matching tests | Minute-aligned clock and ownership-keyed focus registration/restoration |
| Cross-layer contract | `packages/react/tests/choreography-camera-integration.test.tsx`, package export/boundary tests | Prove geometry-to-camera behavior without publishing low-level hooks or visible UI |

---

### Task 1: Resolve the largest visible map rectangle in core

**Files:**
- Modify: `packages/core/src/map-camera.ts`
- Create: `packages/core/tests/map-camera-layout.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: Phase 01 `MapViewportMetrics`, `OcclusionRect`, `UsableRegion`, and `EdgeInsets`.
- Produces from `@laugh-tale-island/core`: `MapLayoutSnapshot`, `resolveMapLayout`, and `hasMaterialMapLayoutChange`.

```ts
export interface MapLayoutSnapshot {
  viewport: MapViewportMetrics;
  occlusions: readonly OcclusionRect[];
  usableRegion: UsableRegion;
  edgeInsets: EdgeInsets;
}

export function resolveMapLayout(
  viewport: MapViewportMetrics,
  occlusions: readonly OcclusionRect[],
): MapLayoutSnapshot | null;

export function hasMaterialMapLayoutChange(
  previous: MapLayoutSnapshot | null,
  next: MapLayoutSnapshot | null,
): boolean;
```

- [ ] **Step 1: Add failing normalization and empty-viewport tests**

Cover all of these in `map-camera-layout.test.ts`:

1. zero, negative, `NaN`, or infinite viewport dimensions return `null`;
2. rectangles are clipped to the map viewport, non-finite/zero-area rectangles are dropped, duplicates are removed, and the normalized list is sorted by `y`, then `x`, then `width`, then `height`;
3. the input arrays and objects are not mutated;
4. no occlusions yields the full viewport and zero insets.

```bash
npm --workspace @laugh-tale-island/core test -- map-camera-layout
```

Expected: FAIL because `resolveMapLayout` and `MapLayoutSnapshot` do not exist.

- [ ] **Step 2: Implement finite clipping and deterministic normalization**

Use map-relative CSS-pixel coordinates. Clip each rectangle to `[0, width] × [0, height]`, discard it if the clipped width or height is not positive, sort the cloned results, and deduplicate exact normalized tuples. Do not round measurements before geometry comparison.

```ts
function clipOcclusion(
  viewport: MapViewportMetrics,
  rect: OcclusionRect,
): OcclusionRect | null {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return null;
  const left = Math.max(0, rect.x);
  const top = Math.max(0, rect.y);
  const right = Math.min(viewport.width, rect.x + Math.max(0, rect.width));
  const bottom = Math.min(viewport.height, rect.y + Math.max(0, rect.height));
  return right > left && bottom > top
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : null;
}

function compareRects(left: OcclusionRect, right: OcclusionRect): number {
  return left.y - right.y
    || left.x - right.x
    || left.width - right.width
    || left.height - right.height;
}
```

- [ ] **Step 3: Add failing largest-region and tie-break tests**

Use explicit synthetic cases:

```ts
expect(resolveMapLayout(
  { width: 390, height: 844 },
  [
    { x: 12, y: 12, width: 366, height: 112 },
    { x: 0, y: 464, width: 390, height: 380 },
  ],
)?.usableRegion).toEqual({ x: 0, y: 124, width: 390, height: 340 });

expect(resolveMapLayout(
  { width: 1440, height: 900 },
  [{ x: 880, y: 0, width: 560, height: 900 }],
)?.usableRegion).toEqual({ x: 0, y: 0, width: 880, height: 900 });
```

Also prove that equal-area candidates prefer, in this exact order: the candidate containing the viewport center, greater width, smaller `y`, then smaller `x`. A center-spanning occluder that leaves equal left and right regions must select the left region.

Add explicit overlapping-rectangle coverage and assert that an occlusion covering the complete map viewport returns `null`. A fully covered map must not become a zero-area region or fall back to the full viewport.

```bash
npm --workspace @laugh-tale-island/core test -- map-camera-layout
```

Expected: FAIL because the first implementation has not subtracted overlapping rectangles or applied all tie-breaks.

- [ ] **Step 4: Implement exact rectangle subtraction**

Build candidate boundaries from `0`, viewport width/height, and every clipped rectangle edge. Enumerate every positive axis-aligned rectangle defined by those boundaries, reject candidates with positive-area overlap against an occlusion, then compare area and the four reviewed tie-breaks. Boundary contact is not overlap. This finite search is deterministic and handles full-width mobile sheets plus partial-width desktop rails without reducing them to padding first.

```ts
function overlaps(left: UsableRegion, right: OcclusionRect): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function containsViewportCenter(
  region: UsableRegion,
  viewport: MapViewportMetrics,
): boolean {
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  return centerX >= region.x
    && centerX <= region.x + region.width
    && centerY >= region.y
    && centerY <= region.y + region.height;
}

function choosePreferredRegion(
  current: UsableRegion | null,
  candidate: UsableRegion,
  viewport: MapViewportMetrics,
): UsableRegion {
  if (current === null) return candidate;
  const currentArea = current.width * current.height;
  const candidateArea = candidate.width * candidate.height;
  if (candidateArea !== currentArea) return candidateArea > currentArea ? candidate : current;
  const currentContainsCenter = containsViewportCenter(current, viewport);
  const candidateContainsCenter = containsViewportCenter(candidate, viewport);
  if (candidateContainsCenter !== currentContainsCenter) {
    return candidateContainsCenter ? candidate : current;
  }
  if (candidate.width !== current.width) return candidate.width > current.width ? candidate : current;
  if (candidate.y !== current.y) return candidate.y < current.y ? candidate : current;
  return candidate.x < current.x ? candidate : current;
}

const xEdges = [...new Set([0, viewport.width, ...occlusions.flatMap(
  ({ x, width }) => [x, x + width],
)])].sort((a, b) => a - b);
const yEdges = [...new Set([0, viewport.height, ...occlusions.flatMap(
  ({ y, height }) => [y, y + height],
)])].sort((a, b) => a - b);

let best: UsableRegion | null = null;
for (let leftIndex = 0; leftIndex < xEdges.length - 1; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < xEdges.length; rightIndex += 1) {
    for (let topIndex = 0; topIndex < yEdges.length - 1; topIndex += 1) {
      for (let bottomIndex = topIndex + 1; bottomIndex < yEdges.length; bottomIndex += 1) {
        const candidate = {
          x: xEdges[leftIndex]!,
          y: yEdges[topIndex]!,
          width: xEdges[rightIndex]! - xEdges[leftIndex]!,
          height: yEdges[bottomIndex]! - yEdges[topIndex]!,
        };
        if (!occlusions.some((rect) => overlaps(candidate, rect))) {
          best = choosePreferredRegion(best, candidate, viewport);
        }
      }
    }
  }
}
```

If `best` remains null, return null for the fully covered viewport.

- [ ] **Step 5: Derive edge insets only from the selected region**

Use these equations and no occlusion-specific padding rule:

```ts
const edgeInsets: EdgeInsets = {
  top: usableRegion.y,
  right: viewport.width - usableRegion.x - usableRegion.width,
  bottom: viewport.height - usableRegion.y - usableRegion.height,
  left: usableRegion.x,
};
```

Extend the mobile assertion above to expect `{ top: 124, right: 0, bottom: 380, left: 0 }`.

- [ ] **Step 6: Add and implement the one-CSS-pixel material-change contract**

Write a red table that changes each viewport field, normalized occlusion field, usable-region field, and inset field by `0.999` and `1`. `hasMaterialMapLayoutChange` returns false only when both values are null or every corresponding value differs by less than one CSS pixel. Null-to-value, value-to-null, array length changes, and any delta at least one return true.

```ts
const changed = (left: number, right: number): boolean =>
  Math.abs(left - right) >= 1;

function rectangleChanged(
  left: OcclusionRect | UsableRegion,
  right: OcclusionRect | UsableRegion,
): boolean {
  return changed(left.x, right.x)
    || changed(left.y, right.y)
    || changed(left.width, right.width)
    || changed(left.height, right.height);
}
```

```bash
npm --workspace @laugh-tale-island/core test -- map-camera-layout
npm --workspace @laugh-tale-island/core run type-check
```

Expected after implementation: PASS.

- [ ] **Step 7: Commit core map layout**

```bash
git add packages/core/src/map-camera.ts packages/core/src/index.ts packages/core/tests/map-camera-layout.test.ts
git diff --cached --check
git commit -m "feat(core): resolve visible map geometry"
```

---

### Task 2: Resolve fit, focus, recenter, and geometry reframes in core

**Files:**
- Modify: `packages/core/src/map-camera.ts`
- Create: `packages/core/tests/map-camera-policy.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: Phase 01 `CameraIntent` variants and Task 1 `MapLayoutSnapshot`.
- Produces from `@laugh-tale-island/core`: the immutable policy record and four resolver functions below.

```ts
export const CAMERA_POLICY_V2 = {
  focusMinimumZoom: 15,
  focusMaximumZoom: 18,
  userLocationZoom: 16,
  fitMaximumZoom: 15,
} as const;

export interface CameraIntentContext {
  intentId: string;
  layout: MapLayoutSnapshot;
  reducedMotion: boolean;
}

export interface FitCameraGeometry {
  points: readonly Coordinates[];
  paths: readonly (readonly Coordinates[])[];
}

export function resolveFitCameraIntent(
  context: CameraIntentContext,
  geometry: FitCameraGeometry,
): FitCameraIntent | null;

export function resolveFocusCameraIntent(
  context: CameraIntentContext,
  coordinate: Coordinates,
  snapshot: CameraSnapshot | null,
): FocusCameraIntent | null;

export function resolveRecenterUserCameraIntent(
  context: CameraIntentContext,
  coordinate: Coordinates,
): RecenterUserCameraIntent | null;

export function reframeCameraIntent(
  intent: CameraIntent,
  layout: MapLayoutSnapshot,
): CameraIntent;
```

The value `18` is the reviewed v2 focus cap. Together, focus minimum `15`, focus maximum `18`, user-location zoom `16`, and fit maximum `15` are a core versioned contract. No adapter, React hook, or presentation may override them.

- [ ] **Step 1: Add failing shared-field and coordinate-validation tests**

Build one synthetic layout and assert every resolver copies `viewport`, `usableRegion`, and `edgeInsets`, retains the supplied non-empty `intentId`, and resolves `transition` to `animate` when `reducedMotion` is false and `immediate` when it is true. Empty IDs and invalid coordinates (`NaN`, infinity, latitude outside `[-90, 90]`, longitude outside `[-180, 180]`) return `null`.

For fit, retain valid standalone points, retain a path only when it contains at least two valid points, reject the entire path when any point is invalid, defensively clone arrays, and return `null` when no valid bounds source remains. Mode and provider plausibility are Phase 01 projection concerns; this resolver receives no route-mode string and must not infer one.

```bash
npm --workspace @laugh-tale-island/core test -- map-camera-policy
```

Expected: FAIL because the policy record and resolvers do not exist.

- [ ] **Step 2: Implement the common intent context once**

Add one private helper which validates the semantic ID and returns cloned layout fields plus the transition. All three semantic resolvers call it. Do not create variant-specific copies of reduced-motion logic.

```ts
function resolveIntentBase(
  context: CameraIntentContext,
): CameraIntentBase | null {
  if (context.intentId.trim().length === 0) return null;
  return {
    intentId: context.intentId,
    transition: context.reducedMotion ? "immediate" : "animate",
    viewport: { ...context.layout.viewport },
    usableRegion: { ...context.layout.usableRegion },
    edgeInsets: { ...context.layout.edgeInsets },
  };
}
```

- [ ] **Step 3: Add failing numeric zoom-policy tests**

Assert these exact outcomes:

| Intent | Input snapshot | Result |
| --- | --- | --- |
| focus | `null` | `targetZoom: 15` |
| focus | `{ zoom: 12 }` | `targetZoom: 15` |
| focus | `{ zoom: 16.5 }` | `targetZoom: 16.5` |
| focus | `{ zoom: 21 }` | `targetZoom: 18` |
| focus | `{ zoom: NaN }` cast through an adversarial boundary | `targetZoom: 15` |
| recenter-user | any prior snapshot | `targetZoom: 16` |
| fit | one or many validated sources | `maximumZoom: 15` |

The adapter never appears in these tests. This proves minimum/preserve/maximum/fixed decisions are core policy.

Add exact inclusive boundary assertions for `14.999`, `15`, `18`, and `18.001`, proving the first clamps to 15, the middle values remain unchanged, and the last clamps to 18.

```bash
npm --workspace @laugh-tale-island/core test -- map-camera-policy
```

Expected: FAIL until the numeric policy is implemented.

- [ ] **Step 4: Implement numeric zoom resolution**

Treat a snapshot zoom as usable only when it is finite. Clamp a usable focus zoom inclusively to `[focusMinimumZoom, focusMaximumZoom]`. Always emit the fixed recenter zoom and fit maximum from `CAMERA_POLICY_V2`.

```ts
function resolveFocusZoom(snapshot: CameraSnapshot | null): number {
  const zoom = snapshot?.zoom;
  if (zoom === undefined || !Number.isFinite(zoom)) {
    return CAMERA_POLICY_V2.focusMinimumZoom;
  }
  return Math.min(
    CAMERA_POLICY_V2.focusMaximumZoom,
    Math.max(CAMERA_POLICY_V2.focusMinimumZoom, zoom),
  );
}
```

Use one coordinate guard and build each variant only from a resolved base:

```ts
function validCoordinate({ lat, lng }: Coordinates): boolean {
  return Number.isFinite(lat)
    && lat >= -90
    && lat <= 90
    && Number.isFinite(lng)
    && lng >= -180
    && lng <= 180;
}

export function resolveFitCameraIntent(
  context: CameraIntentContext,
  geometry: FitCameraGeometry,
): FitCameraIntent | null {
  const base = resolveIntentBase(context);
  if (base === null) return null;
  const points = geometry.points.filter(validCoordinate).map((point) => ({ ...point }));
  const paths = geometry.paths
    .filter((path) => path.length >= 2 && path.every(validCoordinate))
    .map((path) => path.map((point) => ({ ...point })));
  if (points.length === 0 && paths.length === 0) return null;
  return { ...base, kind: "fit", points, paths, maximumZoom: CAMERA_POLICY_V2.fitMaximumZoom };
}

export function resolveFocusCameraIntent(
  context: CameraIntentContext,
  coordinate: Coordinates,
  snapshot: CameraSnapshot | null,
): FocusCameraIntent | null {
  const base = resolveIntentBase(context);
  return base === null || !validCoordinate(coordinate)
    ? null
    : { ...base, kind: "focus", coordinate: { ...coordinate }, targetZoom: resolveFocusZoom(snapshot) };
}

export function resolveRecenterUserCameraIntent(
  context: CameraIntentContext,
  coordinate: Coordinates,
): RecenterUserCameraIntent | null {
  const base = resolveIntentBase(context);
  return base === null || !validCoordinate(coordinate)
    ? null
    : {
        ...base,
        kind: "recenter-user",
        coordinate: { ...coordinate },
        targetZoom: CAMERA_POLICY_V2.userLocationZoom,
      };
}
```

- [ ] **Step 5: Add failing stable-ID reframe tests**

For all three variants, call `reframeCameraIntent` with a second layout and prove:

- `kind`, target coordinate, fit points/paths, numeric zoom, and `intentId` are unchanged;
- viewport, usable region, and insets come from the second layout;
- transition is always `immediate`, even when the original was `animate`;
- the original intent and both layouts remain unchanged.

Implement the shared reframe without switching on the variant:

```ts
return {
  ...intent,
  transition: "immediate",
  viewport: { ...layout.viewport },
  usableRegion: { ...layout.usableRegion },
  edgeInsets: { ...layout.edgeInsets },
};
```

```bash
npm --workspace @laugh-tale-island/core test -- map-camera-policy
npm --workspace @laugh-tale-island/core run type-check
```

Expected after implementation: PASS.

- [ ] **Step 6: Commit core camera policy**

```bash
git add packages/core/src/map-camera.ts packages/core/src/index.ts packages/core/tests/map-camera-policy.test.ts
git diff --cached --check
git commit -m "feat(core): resolve neutral camera intents"
```

---

### Task 3: Establish the neutral in-memory trip navigation seam

**Files:**
- Create: `packages/core/src/trip-navigation.ts`
- Create: `packages/core/tests/trip-navigation.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces the roadmap-ledger `TripNavigationState` and `TripNavigationStore` without URL, browser, React, or persistence coupling.
- Produces `createMemoryTripNavigationStore` as the one v2 default implementation.

```ts
export interface TripNavigationState {
  surface: "home" | "experience";
  dayId: string | null;
  ownerId: string | null;
}

export interface TripNavigationStore {
  read(): TripNavigationState;
  write(next: TripNavigationState): void;
  subscribe(listener: () => void): () => void;
}

export function createMemoryTripNavigationStore(
  initial?: TripNavigationState,
): TripNavigationStore;
```

- [ ] **Step 1: Add failing state-normalization tests**

Assert the default state is exactly `{ surface: "home", dayId: null, ownerId: null }`. A `home` write always normalizes day and owner to null. An `experience` write with a non-empty day retains the optional non-empty owner. An `experience` write with an empty/null day normalizes back to Home. Trim validation is allowed only to test emptiness; authored IDs are retained byte-for-byte when valid.

```bash
npm --workspace @laugh-tale-island/core test -- trip-navigation
```

Expected: FAIL because `trip-navigation.ts` does not exist.

- [ ] **Step 2: Implement cloned reads and normalized writes**

Never expose the mutable internal record. `read()` returns a fresh object; `write()` stores a normalized clone. Do not inspect `window`, location, history, storage, route content, or effective-day selectors.

```ts
const HOME_NAVIGATION: TripNavigationState = {
  surface: "home",
  dayId: null,
  ownerId: null,
};

function normalizeNavigation(next: TripNavigationState): TripNavigationState {
  if (
    next.surface !== "experience"
    || next.dayId === null
    || next.dayId.trim().length === 0
  ) {
    return { ...HOME_NAVIGATION };
  }
  return {
    surface: "experience",
    dayId: next.dayId,
    ownerId:
      next.ownerId === null || next.ownerId.trim().length === 0
        ? null
        : next.ownerId,
  };
}
```

- [ ] **Step 3: Add failing subscription semantics**

Prove:

1. a changed normalized state notifies each active listener once;
2. an equivalent normalized write emits nothing;
3. unsubscribe is idempotent;
4. a listener may unsubscribe itself during notification without skipping another listener;
5. a listener added during notification runs only on the next write;
6. one listener throwing does not corrupt stored state, while the first thrown error is rethrown after the current listener snapshot has been attempted.

- [ ] **Step 4: Implement snapshot-safe notification**

Compare all three normalized fields before notifying. Iterate over a cloned listener array. Complete the current snapshot, then rethrow the first listener error. Keep serialization and external adapters out of the implementation.

```ts
let state = normalizeNavigation(initial ?? HOME_NAVIGATION);
const listeners = new Set<() => void>();

return {
  read: () => ({ ...state }),
  write(next) {
    const normalized = normalizeNavigation(next);
    if (
      normalized.surface === state.surface
      && normalized.dayId === state.dayId
      && normalized.ownerId === state.ownerId
    ) return;
    state = normalized;
    let failed = false;
    let firstError: unknown;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
    if (failed) throw firstError;
  },
  subscribe(listener) {
    listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(listener);
    };
  },
};
```

```bash
npm --workspace @laugh-tale-island/core test -- trip-navigation
npm --workspace @laugh-tale-island/core run type-check
```

Expected after implementation: PASS.

- [ ] **Step 5: Commit the navigation seam**

```bash
git add packages/core/src/trip-navigation.ts packages/core/src/index.ts packages/core/tests/trip-navigation.test.ts
git diff --cached --check
git commit -m "feat(core): add neutral trip navigation state"
```

---

### Task 4: Centralize experience choreography in a pure reducer

**Files:**
- Read: `packages/core/src/trip-navigation.ts`
- Create: `packages/core/src/experience-choreography.ts`
- Create: `packages/core/tests/experience-choreography.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: Task 3 `TripNavigationState` and `TripNavigationStore`. It does not add a second store or persistence mechanism.
- Produces from `@laugh-tale-island/core`: the state, request, event, initializer, and reducer below.

```ts
export type ExperienceSelectionSource = "automatic" | "list" | "map" | "control";

export type ExperienceCameraRequest =
  | { kind: "fit-day"; dayId: string; intentId: string }
  | { kind: "fit-candidate"; dayId: string; groupId: string; intentId: string }
  | { kind: "focus-owner"; dayId: string; ownerId: string; intentId: string }
  | { kind: "focus-route"; dayId: string; routeId: string; intentId: string }
  | { kind: "recenter-user"; dayId: string; intentId: string };

export interface HeaderTransitionState {
  id: number;
  phase: "expanding" | "collapsing";
}

export interface ExperienceChoreographyState {
  navigation: TripNavigationState;
  selectionSource: ExperienceSelectionSource;
  sheetSnap: SheetSnap;
  headerExpanded: boolean;
  headerRevision: number;
  headerTransition: HeaderTransitionState | null;
  cameraRequest: ExperienceCameraRequest | null;
  cameraRevision: number;
  focusReturnOwnerId: string | null;
}

export interface CreateExperienceChoreographyInput {
  navigation: TripNavigationState;
  automaticOwnerId: string | null;
}

export type ExperienceChoreographyEvent =
  | { type: "select-day"; dayId: string; automaticOwnerId: string | null }
  | { type: "automatic-owner-changed"; dayId: string; ownerId: string | null }
  | { type: "select-node"; dayId: string; nodeId: string; source: "list" | "map" }
  | { type: "select-route"; dayId: string; routeId: string; source: "list" | "map" }
  | { type: "restore-automatic"; dayId: string; ownerId: string }
  | { type: "return-to-current"; dayId: string; ownerId: string }
  | { type: "return-to-lodging"; dayId: string; ownerId: string }
  | { type: "restore-full-day"; dayId: string }
  | { type: "fit-candidate"; dayId: string; groupId: string }
  | { type: "recenter-user"; dayId: string }
  | { type: "set-sheet-snap"; snap: SheetSnap }
  | { type: "set-header-expanded"; expanded: boolean }
  | { type: "settle-header-transition"; transitionId: number }
  | { type: "focus-returned"; ownerId: string }
  | { type: "open-home" };

export function createExperienceChoreographyState(
  input: CreateExperienceChoreographyInput,
): ExperienceChoreographyState;

export function reduceExperienceChoreography(
  state: ExperienceChoreographyState,
  event: ExperienceChoreographyEvent,
): ExperienceChoreographyState;
```

- [ ] **Step 1: Add failing initialization and day-selection tests**

Assert that initialization:

- preserves an `experience` navigation with a non-empty day and stores the automatic owner in `navigation.ownerId` without duplicating a separate viewing ID;
- normalizes Home or an experience state without a non-empty day to `{ surface: "home", dayId: null, ownerId: null }` and emits no camera request;
- starts at `half`, with `selectionSource: "automatic"`, an expanded header, `headerRevision: 0`, and no active header transition;
- emits one deterministic `fit-day` request only for a valid experience day;
- uses a deterministic semantic ID formed from the next numeric camera revision, request kind, day ID, and target ID rather than time or randomness.

Assert `select-day` clears route/manual selection, sets the supplied automatic owner, resets the sheet to `half`, preserves the current header state, and emits a fresh `fit-day` request. Empty IDs are defensive no-ops.

```bash
npm --workspace @laugh-tale-island/core test -- experience-choreography
```

Expected: FAIL because `experience-choreography.ts` does not exist.

- [ ] **Step 2: Implement immutable initialization and camera revisioning**

Create one private helper that increments `cameraRevision`, builds the semantic `intentId`, and installs a request. Encode the ID exactly as `JSON.stringify(["camera", nextRevision, kind, dayId, targetId])`, where `targetId` is the day, group, owner, route, or literal `"user"` associated with the request. This remains collision-safe even when authored IDs contain punctuation. Every event which requests a new semantic camera operation must use that helper. Geometry never enters this reducer, so rerenders cannot increment the semantic revision.

```ts
function requestCamera(
  state: ExperienceChoreographyState,
  kind: ExperienceCameraRequest["kind"],
  dayId: string,
  targetId: string,
  create: (intentId: string) => ExperienceCameraRequest,
): ExperienceChoreographyState {
  const cameraRevision = state.cameraRevision + 1;
  const intentId = JSON.stringify(["camera", cameraRevision, kind, dayId, targetId]);
  return {
    ...state,
    cameraRevision,
    cameraRequest: create(intentId),
  };
}
```

The initializer builds the non-camera fields once, then calls `requestCamera` only when normalized navigation remains on Experience with a non-null day.

```ts
export function createExperienceChoreographyState(
  input: CreateExperienceChoreographyInput,
): ExperienceChoreographyState {
  const validDay = input.navigation.surface === "experience"
    && input.navigation.dayId !== null
    && input.navigation.dayId.trim().length > 0;
  const navigation: TripNavigationState = validDay
    ? {
        surface: "experience",
        dayId: input.navigation.dayId,
        ownerId:
          input.automaticOwnerId !== null
          && input.automaticOwnerId.trim().length > 0
            ? input.automaticOwnerId
            : null,
      }
    : { surface: "home", dayId: null, ownerId: null };
  const state: ExperienceChoreographyState = {
    navigation,
    selectionSource: "automatic",
    sheetSnap: "half",
    headerExpanded: true,
    headerRevision: 0,
    headerTransition: null,
    cameraRequest: null,
    cameraRevision: 0,
    focusReturnOwnerId: null,
  };
  const dayId = navigation.dayId;
  if (dayId === null) return state;
  return requestCamera(state, "fit-day", dayId, dayId, (intentId) => ({
    kind: "fit-day",
    dayId,
    intentId,
  }));
}
```

- [ ] **Step 3: Add failing owner/route source tests**

Cover this matrix:

| Event | Navigation owner | Camera request | Focus return |
| --- | --- | --- | --- |
| list node | node ID | `focus-owner` | `null` |
| map node | node ID | `focus-owner` | node ID |
| list route | route ID | `focus-route` | `null` |
| map route | route ID | unchanged | route ID |
| automatic tick while source is automatic and day matches | new automatic owner | unchanged | unchanged |
| automatic tick while source is list/map/control or day differs | unchanged | unchanged | unchanged |
| restore automatic | automatic owner | `focus-owner` | `null` and sheet `half` |
| return to current | exact caller-validated current owner | `focus-owner` | `null` and sheet `half` |
| return to lodging | exact caller-validated lodging owner | `focus-owner` | `null` and sheet `half` |

Map-route selection does not refit a route that the user just selected on the map. It only records the semantic owner to restore list focus. A map-node selection retains the benchmark's explicit place-focus behavior because a marker may own a grouped list row at another coordinate.

```bash
npm --workspace @laugh-tale-island/core test -- experience-choreography
```

Expected: FAIL until source-specific behavior is implemented.

- [ ] **Step 4: Add and implement candidate, overview, recenter, and Home events**

Assert:

- `fit-candidate` keeps day/owner/sheet state and emits a fit request owned by the group ID;
- `restore-full-day` emits a fresh `fit-day` request for the displayed day, so Task 2 later resolves the same points, paths, and maximum zoom as day entry;
- `recenter-user` clears no truthful owner selection and emits only its own request;
- `return-to-current` uses the supplied nonblank current owner, sets selection source to `automatic`, returns the sheet to `half`, clears focus return, and emits a fresh `focus-owner` request;
- `return-to-lodging` uses the supplied nonblank lodging owner, sets selection source to `control`, returns the sheet to `half`, clears focus return, and emits a fresh `focus-owner` request;
- empty owner IDs and mismatched day IDs for either return event are no-ops; the reducer never invents or searches for either target;
- mismatched day IDs are no-ops;
- `focus-returned` clears `focusReturnOwnerId` only when the acknowledged owner matches, so a stale focus completion cannot consume a newer request;
- `open-home` writes exactly `{ surface: "home", dayId: null, ownerId: null }`, clears camera and focus-return requests, and leaves no URL behavior.

The caller in Phase 03 writes `state.navigation` through Task 3's store. Do not import storage or browser APIs here.

Implement these events as direct immutable cases; this sample fixes the two overview/location payloads and their target IDs:

```ts
case "restore-full-day":
  if (state.navigation.dayId !== event.dayId) return state;
  return requestCamera(state, "fit-day", event.dayId, event.dayId, (intentId) => ({
    kind: "fit-day",
    dayId: event.dayId,
    intentId,
  }));
case "return-to-current":
case "return-to-lodging": {
  if (
    state.navigation.dayId !== event.dayId
    || event.ownerId.trim().length === 0
  ) return state;
  const selected = {
    ...state,
    navigation: { surface: "experience", dayId: event.dayId, ownerId: event.ownerId },
    selectionSource: event.type === "return-to-current" ? "automatic" : "control",
    sheetSnap: "half",
    focusReturnOwnerId: null,
  } satisfies ExperienceChoreographyState;
  return requestCamera(selected, "focus-owner", event.dayId, event.ownerId, (intentId) => ({
    kind: "focus-owner",
    dayId: event.dayId,
    ownerId: event.ownerId,
    intentId,
  }));
}
case "recenter-user":
  if (state.navigation.dayId !== event.dayId) return state;
  return requestCamera(state, "recenter-user", event.dayId, "user", (intentId) => ({
    kind: "recenter-user",
    dayId: event.dayId,
    intentId,
  }));
case "focus-returned":
  return state.focusReturnOwnerId === event.ownerId
    ? { ...state, focusReturnOwnerId: null }
    : state;
case "open-home":
  return {
    ...state,
    navigation: { surface: "home", dayId: null, ownerId: null },
    cameraRequest: null,
    focusReturnOwnerId: null,
  };
```

- [ ] **Step 5: Add failing header reversal and sheet tests**

Assert `set-sheet-snap` stores exactly the requested `SheetSnap`. For header motion:

1. collapsing from expanded increments `headerRevision` and creates `{ id: 1, phase: "collapsing" }`;
2. expanding before collapse settles increments it again and creates `{ id: 2, phase: "expanding" }` without an idle state between them;
3. settling transition 1 is stale and leaves transition 2 active;
4. settling transition 2 clears the transition;
5. a later collapse receives ID 3 rather than reusing an already-settled ID;
6. asking for the already-targeted state returns the same object;
7. header actions do not themselves create a new semantic camera request—measured layout drives Task 7's immediate reframe.

Implement header transitions with the retained monotonic revision:

```ts
case "set-header-expanded": {
  if (event.expanded === state.headerExpanded) return state;
  const headerRevision = state.headerRevision + 1;
  return {
    ...state,
    headerExpanded: event.expanded,
    headerRevision,
    headerTransition: {
      id: headerRevision,
      phase: event.expanded ? "expanding" : "collapsing",
    },
  };
}
case "settle-header-transition":
  return state.headerTransition?.id === event.transitionId
    ? { ...state, headerTransition: null }
    : state;
```

```bash
npm --workspace @laugh-tale-island/core test -- experience-choreography
npm --workspace @laugh-tale-island/core run type-check
```

Expected after implementation: PASS.

- [ ] **Step 6: Commit core choreography**

```bash
git add packages/core/src/experience-choreography.ts packages/core/src/index.ts packages/core/tests/experience-choreography.test.ts
git diff --cached --check
git commit -m "feat(core): reduce experience choreography"
```

---

### Task 5: Make the three-snap sheet position-based and frame-coalesced

**Files:**
- Modify: `packages/core/src/sheet-geometry.ts`
- Modify: `packages/core/tests/sheet-geometry.test.ts`
- Modify: `packages/react/src/use-itinerary-sheet.ts`
- Modify: `packages/react/tests/use-itinerary-sheet.test.tsx`

**Interfaces:**
- Replaces the 1.0 viewport-derived geometry input with presentation-supplied measured heights.
- Keeps `SheetSnap = "collapsed" | "half" | "expanded"`.
- Keeps `useItinerarySheet` as a relative-import implementation seam; it is no longer exported from the React package root.

```ts
// @laugh-tale-island/core
export interface SheetGeometryInput {
  collapsedHeight: number;
  halfHeight: number;
  expandedHeight: number;
}

export interface SheetGeometry {
  collapsed: number;
  half: number;
  expanded: number;
  ceiling: number;
}

export function resolveSheetGeometry(input: SheetGeometryInput): SheetGeometry;
export function nearestSheetSnap(
  height: number,
  geometry: Pick<SheetGeometry, "collapsed" | "half" | "expanded">,
): SheetSnap;
```

`UseItinerarySheetOptions`, `SheetProps`, `SheetHandleProps`, and `ItinerarySheetController` retain their current source-file names. The v2 behavior removes every velocity field and adds no visible label.

- [ ] **Step 1: Replace the velocity tests with failing position-only tests**

In `packages/core/tests/sheet-geometry.test.ts`, remove the assertions that a velocity of `±0.5` advances a snap. Add a table in which slow and fast releases at the same height always select the same nearest point. Exact midpoint ties select the lower-height snap, producing a stable collapse bias.

Add normalization cases:

- non-finite or negative collapsed height becomes zero;
- expanded is at least collapsed;
- half is clamped between collapsed and expanded;
- all output heights are rounded once;
- `ceiling` equals normalized expanded height.

```bash
npm --workspace @laugh-tale-island/core test -- sheet-geometry
```

Expected: FAIL because `SheetGeometryInput` still derives half from viewport values and `nearestSheetSnap` still accepts velocity.

- [ ] **Step 2: Implement explicit snap-height normalization**

Do not calculate `104px`, `46dvh`, a short-height breakpoint, or header clearance in core. The presentation and DOM layout supply those values; core only makes their numeric ordering safe and settles by distance.

```ts
const finiteLength = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

export function resolveSheetGeometry(input: SheetGeometryInput): SheetGeometry {
  const collapsed = Math.round(finiteLength(input.collapsedHeight));
  const expanded = Math.max(collapsed, Math.round(finiteLength(input.expandedHeight)));
  const half = Math.round(clampSheetHeight(finiteLength(input.halfHeight), {
    min: collapsed,
    max: expanded,
  }));
  return { collapsed, half, expanded, ceiling: expanded };
}

export function nearestSheetSnap(
  height: number,
  geometry: Pick<SheetGeometry, "collapsed" | "half" | "expanded">,
): SheetSnap {
  return (["collapsed", "half", "expanded"] as const).reduce((best, snap) =>
    Math.abs(geometry[snap] - height) < Math.abs(geometry[best] - height)
      ? snap
      : best,
  );
}
```

- [ ] **Step 3: Move the React sheet test to a relative source import and add failing rAF assertions**

Change the hook import to:

```ts
import {
  useItinerarySheet,
  type UseItinerarySheetOptions,
} from "../src/use-itinerary-sheet.js";
```

Stub `requestAnimationFrame` and send three pointer moves before flushing. Assert there is one scheduled callback, zero intermediate React height commits, and one commit using the final move. Release before flushing must cancel that callback and settle using the latest ref value.

```bash
npm --workspace @laugh-tale-island/react test -- use-itinerary-sheet
```

Expected: FAIL because the current hook calls `setState` on every pointer move.

- [ ] **Step 4: Implement pointer capture and one-frame drag coalescing**

Keep `dragHeightRef` as the latest numeric height and `dragFrameRef` as the single scheduled frame ID. On pointer down:

- ignore a target within a `button`;
- read the actual rendered sheet height;
- read finite computed `max-height` as the drag-session ceiling, falling back to `geometry.expanded`;
- snapshot the normalized geometry and pointer ID;
- capture the pointer.

On move, clamp to the session's collapsed/ceiling range, update the ref, and schedule at most one state commit. On pointer up or pointer cancel, settle from the ref by position, cancel the outstanding frame, release capture when held, and clear the session. A lost capture commits the latest position without trying to release capture again.

```ts
const scheduleDragHeight = useCallback((height: number): void => {
  dragHeightRef.current = height;
  if (dragFrameRef.current !== null) return;
  dragFrameRef.current = requestAnimationFrame(() => {
    dragFrameRef.current = null;
    setDragFrame((current) => ({
      height: dragHeightRef.current ?? current?.height ?? geometry.collapsed,
      ceiling: dragRef.current?.geometry.ceiling ?? geometry.ceiling,
    }));
  });
}, [geometry.ceiling, geometry.collapsed]);

const finishDrag = useCallback((event: SheetPointerEvent): void => {
  const sample = dragRef.current;
  if (sample === null || sample.pointerId !== event.pointerId) return;
  const height = dragHeightRef.current ?? sample.startHeight;
  if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
  dragFrameRef.current = null;
  dragRef.current = null;
  dragHeightRef.current = null;
  setDragFrame(null);
  onSnapChange(nearestSheetSnap(height, sample.geometry));
  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }
}, [onSnapChange]);
```

Use a cleanup effect which cancels `dragFrameRef.current` when non-null and clears both drag refs. The lost-capture handler calls a shared settle helper with the last height but skips `releasePointerCapture`.

- [ ] **Step 5: Add failing interruption, keyboard, and cleanup tests**

Prove:

1. pointer IDs cannot steal another drag;
2. an upward drag cannot exceed the computed rendered ceiling;
3. a rerendered geometry during drag does not replace the pointer-down snapshot;
4. `ArrowUp`, `ArrowDown`, `Home`, and `End` step/clamp correctly and call `preventDefault` only when state changes;
5. a user handler that calls `preventDefault` suppresses package behavior;
6. dragging and reduced motion each yield `transitionDuration: "0ms"`, while the normal idle state leaves duration to presentation CSS;
7. unmount cancels a queued animation frame and clears the drag session.

The hook exposes semantic data attributes and numeric inline drag height only. It emits no class name, text, target size, color, duration, or easing.

```bash
npm --workspace @laugh-tale-island/core test -- sheet-geometry
npm --workspace @laugh-tale-island/react test -- use-itinerary-sheet
npm --workspace @laugh-tale-island/react run type-check
```

Expected after implementation: PASS.

- [ ] **Step 6: Commit faithful sheet control**

```bash
git add packages/core/src/sheet-geometry.ts packages/core/tests/sheet-geometry.test.ts packages/react/src/use-itinerary-sheet.ts packages/react/tests/use-itinerary-sheet.test.tsx
git diff --cached --check
git commit -m "feat(react): match position based sheet dragging"
```

---

### Task 6: Measure the map viewport, occluders, safe areas, and motion preference

**Files:**
- Create: `packages/react/src/use-visible-map-layout.ts`
- Create: `packages/react/tests/use-visible-map-layout.test.tsx`

**Interfaces:**
- Consumes: `resolveMapLayout`, `hasMaterialMapLayoutChange`, and the Phase 01/Task 1 geometry types.
- Produces package-internal `useVisibleMapLayout`; it is not exported from `packages/react/src/index.ts`.

```ts
export interface VisibleMapLayoutController {
  layout: MapLayoutSnapshot | null;
  revision: number;
  viewport: MapViewportMetrics;
  safeArea: EdgeInsets;
  reducedMotion: boolean;
  mapViewportRef: RefCallback<HTMLElement>;
  occlusionRef(id: string): RefCallback<HTMLElement>;
}

export function useVisibleMapLayout(): VisibleMapLayoutController;
```

- [ ] **Step 1: Add failing callback-registry and rectangle-normalization tests**

Render a hook harness in jsdom, stub `getBoundingClientRect`, and register one map plus named header, sheet, and desktop-rail elements. Assert:

- `mapViewportRef` is stable;
- `occlusionRef(id)` returns the same callback for the same ID and distinct callbacks for distinct IDs;
- calling a registration with `null` unregisters the prior element;
- replacing an element under the same ID stops observing the old element;
- DOM rectangles are translated relative to the map's `left`/`top` and clipped through core;
- source order does not change the published normalized layout.

```bash
npm --workspace @laugh-tale-island/react test -- use-visible-map-layout
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 2: Implement stable ref registries and a single measurement frame**

Maintain element maps in refs and memoize callbacks by registration ID. A DOM signal only schedules measurement; it never reads all layout synchronously in the observer callback. Keep one pending frame ID, read the viewport and every connected occluder in that frame, call `resolveMapLayout`, and increment `revision` only when `hasMaterialMapLayoutChange` returns true.

```ts
const [layoutState, setLayoutState] = useState<{
  layout: MapLayoutSnapshot | null;
  revision: number;
}>({ layout: null, revision: 0 });

const publishLayout = useCallback((next: MapLayoutSnapshot | null): void => {
  setLayoutState((current) =>
    hasMaterialMapLayoutChange(current.layout, next)
      ? { layout: next, revision: current.revision + 1 }
      : current,
  );
}, []);

const scheduleMeasurement = useCallback((): void => {
  if (frameRef.current !== null) return;
  frameRef.current = requestAnimationFrame(() => {
    frameRef.current = null;
    const map = mapElementRef.current;
    if (map === null || !map.isConnected) {
      publishLayout(null);
      return;
    }
    const mapRect = map.getBoundingClientRect();
    const occlusions = [...occlusionElementsRef.current.values()]
      .filter((element) => element.isConnected)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.left - mapRect.left,
          y: rect.top - mapRect.top,
          width: rect.width,
          height: rect.height,
        };
      });
    publishLayout(resolveMapLayout(
      { width: mapRect.width, height: mapRect.height },
      occlusions,
    ));
  });
}, [publishLayout]);
```

- [ ] **Step 3: Add failing observer and visual-viewport tests**

Install controllable doubles for `ResizeObserver`, `window.visualViewport`, `requestAnimationFrame`, and `cancelAnimationFrame`. Prove:

1. the observer follows the map and every current occluder;
2. map/occluder resize, window resize, visual-viewport resize, and visual-viewport scroll all schedule measurement;
3. repeated signals in one frame yield one layout read and one state update;
4. a `0.999px` change preserves object identity/revision while a `1px` change publishes once;
5. `320×568`, `390×844`, partial desktop rails, and asymmetric insets all remain finite;
6. unmount disconnects the observer, removes every listener, cancels the frame, and removes the safe-area probe.

- [ ] **Step 4: Implement a non-visible four-edge safe-area probe**

Create one imperative `aria-hidden="true"` measurement element while mounted. Its inline styles are limited to fixed zero-size hidden layout, `pointer-events: none`, and four `env(safe-area-inset-*)` paddings. Read all four computed paddings as finite non-negative CSS pixels. The probe has no class, text, role, focusability, color, z-index, or product dimensions and is removed on cleanup.

```ts
const probe = document.createElement("div");
probe.setAttribute("aria-hidden", "true");
Object.assign(probe.style, {
  position: "fixed",
  inset: "0 auto auto 0",
  width: "0",
  height: "0",
  overflow: "hidden",
  visibility: "hidden",
  pointerEvents: "none",
  paddingTop: "env(safe-area-inset-top)",
  paddingRight: "env(safe-area-inset-right)",
  paddingBottom: "env(safe-area-inset-bottom)",
  paddingLeft: "env(safe-area-inset-left)",
});
document.body.append(probe);
```

Use `visualViewport.width/height` when finite and positive; otherwise use `window.innerWidth/innerHeight`. Publish these as `viewport`, but continue deriving `layout.viewport` from the actual registered map rectangle.

- [ ] **Step 5: Add and implement reduced-motion observation**

Test `reducedMotion` with initial server/no-`matchMedia` behavior as false, initial browser matching, change notifications in both directions, query replacement on remount, and listener cleanup. Query only `(prefers-reduced-motion: reduce)`. Return the boolean on `VisibleMapLayoutController`; do not choose duration or easing.

```ts
useEffect(() => {
  if (typeof window.matchMedia !== "function") return;
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  const update = (): void => setReducedMotion(query.matches);
  update();
  query.addEventListener("change", update);
  return () => query.removeEventListener("change", update);
}, []);
```

```bash
npm --workspace @laugh-tale-island/react test -- use-visible-map-layout
npm --workspace @laugh-tale-island/react run type-check
```

Expected after implementation: PASS.

- [ ] **Step 6: Commit measured visible-map layout**

```bash
git add packages/react/src/use-visible-map-layout.ts packages/react/tests/use-visible-map-layout.test.tsx
git diff --cached --check
git commit -m "feat(react): measure visible map layout"
```

---

### Task 7: Own the persistent map adapter lifecycle and camera execution

**Files:**
- Create: `packages/react/src/use-map-adapter-lifecycle.ts`
- Create: `packages/react/tests/use-map-adapter-lifecycle.test.tsx`

**Interfaces:**
- Consumes: Phase 01 `MapAdapterV2`, `MapMountConfig`, `MapPresentationV2`; Task 1 `MapLayoutSnapshot`; Task 2 `reframeCameraIntent`.
- Produces package-internal `useMapAdapterLifecycle`; it is not exported from `packages/react/src/index.ts`.

```ts
export type MapAdapterLifecycleStatus =
  | { kind: "idle" }
  | { kind: "mounting"; attempt: number }
  | { kind: "ready"; attempt: number }
  | {
      kind: "unavailable";
      attempt: number;
      reason: ProviderFailureReason;
      retryable: boolean;
      diagnostic?: string;
    };

export interface UseMapAdapterLifecycleInput {
  createAdapter?: () => MapAdapterV2;
  mountConfig: MapMountConfig;
  presentation: MapPresentationV2;
  cameraIntent: CameraIntent | null;
  layout: MapLayoutSnapshot | null;
  userLocation: Coordinates | null;
  development: boolean;
}

export interface MapAdapterLifecycleController {
  mapRef: RefCallback<HTMLElement>;
  status: MapAdapterLifecycleStatus;
  retry(): void;
  getCameraSnapshot(): CameraSnapshot | null;
}

export function useMapAdapterLifecycle(
  input: UseMapAdapterLifecycleInput,
): MapAdapterLifecycleController;
```

- [ ] **Step 1: Add failing mount, render, and event-freshness tests**

Use a controlled `MapAdapterV2` double whose `mount` promise resolves on demand. Assert:

- no adapter is created before a host element is registered;
- an absent factory remains `{ kind: "idle" }`, constructs nothing even with a host, and can later receive a factory without a conditional hook call;
- the first host creates one adapter, calls `mount` once, then calls `render` only after mount resolves;
- presentation updates call `render` without remounting;
- `mountConfig.events.onMarkerSelect`, `onRouteSelect`, and typed `onUnavailable` always reach the latest callbacks without remounting;
- changing only the events object does not remount;
- changing `createAdapter`, `visualProfile`, `createMarkerContent`, `createUserLocationContent`, or the host replaces and destroys the old adapter exactly once.

The hook must build stable event forwarders for the exact Phase 01 event shape:

```ts
const events: MapEventsV2 = {
  onMarkerSelect(ownerId) {
    latestEvents.current.onMarkerSelect(ownerId);
  },
  onRouteSelect(routeId) {
    latestEvents.current.onRouteSelect(routeId);
  },
  onUnavailable(result) {
    latestEvents.current.onUnavailable(result);
  },
};
```

```bash
npm --workspace @laugh-tale-island/react test -- use-map-adapter-lifecycle
```

Expected: FAIL because the lifecycle hook does not exist.

- [ ] **Step 2: Implement a generation-guarded persistent mount**

Construct the adapter inside the mount effect. Give each attempt a monotonically increasing generation. A late resolve/reject from an inactive generation cannot render, change status, execute camera work, or overwrite a newer attempt. Cleanup is idempotent and calls `destroy()` even when mount is still pending.

Keep `mountConfig.events` in a latest-value ref and memoize these stable forwarders independently of profile/factory identity:

```ts
const latestEvents = useRef(mountConfig.events);
latestEvents.current = mountConfig.events;
const latestPresentationRef = useRef(presentation);
latestPresentationRef.current = presentation;
const latestUserLocationRef = useRef(userLocation);
latestUserLocationRef.current = userLocation;
const latestDevelopmentRef = useRef(development);
latestDevelopmentRef.current = development;
const stableSelectionEvents = useMemo<Pick<MapEventsV2, "onMarkerSelect" | "onRouteSelect">>(() => ({
  onMarkerSelect: (ownerId) => latestEvents.current.onMarkerSelect(ownerId),
  onRouteSelect: (routeId) => latestEvents.current.onRouteSelect(routeId),
}), []);
```

The mount effect depends on host, attempt, `createAdapter`, `mountConfig.visualProfile`, `mountConfig.createMarkerContent`, and `mountConfig.createUserLocationContent`, but not on `mountConfig.events` identity. For each attempt, build a generation-bound `MapEventsV2`: its marker/route members call `stableSelectionEvents`, while `onUnavailable` first rejects stale/already-terminal generations, then forwards the typed result to the latest consumer, destroys the current adapter exactly once, clears readiness, and commits a typed unavailable lifecycle status. This per-generation closure prevents an old adapter's late terminal event from poisoning a newer attempt.

```ts
function unavailableStatus(
  attempt: number,
  error: unknown,
  development: boolean,
): Extract<MapAdapterLifecycleStatus, { kind: "unavailable" }> {
  let diagnostic: string | undefined;
  if (development) {
    try {
      diagnostic = error instanceof Error ? error.message : String(error);
    } catch {
      diagnostic = "Map adapter mount failure";
    }
  }
  return {
    kind: "unavailable",
    attempt,
    reason: "network",
    retryable: true,
    ...(diagnostic === undefined ? {} : { diagnostic }),
  };
}

useEffect(() => {
  if (host === null || createAdapter === undefined) {
    setStatus({ kind: "idle" });
    return;
  }
  const generation = ++generationRef.current;
  cancelPendingReframe();
  lastAppliedCameraRef.current = null;
  let adapter: MapAdapterV2;
  try {
    adapter = createAdapter();
  } catch (error) {
    retryRequestedRef.current = false;
    setStatus(unavailableStatus(attempt, error, latestDevelopmentRef.current));
    return;
  }
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    adapter.destroy();
  };
  adapterRef.current = adapter;
  setStatus({ kind: "mounting", attempt });
  void adapter.mount(host, {
    events: generationEvents,
    visualProfile: mountConfig.visualProfile,
    createMarkerContent: mountConfig.createMarkerContent,
    createUserLocationContent: mountConfig.createUserLocationContent,
  }).then(() => {
    if (generation !== generationRef.current) return;
    readyRef.current = true;
    adapter.render(latestPresentationRef.current);
    adapter.setUserLocation(latestUserLocationRef.current);
    retryRequestedRef.current = false;
    setStatus({ kind: "ready", attempt });
  }).catch((error: unknown) => {
    if (generation !== generationRef.current) return;
    release();
    adapterRef.current = null;
    retryRequestedRef.current = false;
    setStatus(unavailableStatus(attempt, error, latestDevelopmentRef.current));
  });
  return () => {
    generationRef.current += 1;
    readyRef.current = false;
    adapterRef.current = null;
    release();
  };
}, [
  attempt,
  createAdapter,
  host,
  mountConfig.createMarkerContent,
  mountConfig.createUserLocationContent,
  mountConfig.visualProfile,
  stableSelectionEvents,
]);
```

`unavailableStatus` returns reason `network`, `retryable: true`, and includes a safely obtained diagnostic string only in development.

Render and location update effects delegate only while ready:

```ts
useEffect(() => {
  runReadyAdapterWork(() => adapterRef.current?.render(presentation));
}, [presentation]);

useEffect(() => {
  runReadyAdapterWork(() => adapterRef.current?.setUserLocation(userLocation));
}, [userLocation]);
```

`runReadyAdapterWork` captures the current generation and catches synchronous throws from `render`, `setUserLocation`, and, in the camera effect below, `applyCameraIntent`. It feeds the same one-shot terminal path as `generationEvents.onUnavailable`, using `{ reason: "network", retryable: true }` and a development-only safely stringified diagnostic. Once that path runs, no later render/location/camera work reaches the failed adapter; retry creates a fresh instance.

Retry and snapshot access stay lifecycle-guarded:

```ts
const retry = useCallback((): void => {
  if (
    status.kind !== "unavailable"
    || !status.retryable
    || retryRequestedRef.current
  ) return;
  retryRequestedRef.current = true;
  setAttempt((current) => current + 1);
}, [status]);

const getCameraSnapshot = useCallback((): CameraSnapshot | null =>
  readyRef.current ? adapterRef.current?.getCameraSnapshot() ?? null : null,
[]);
```

- [ ] **Step 3: Add failing retry, location, and Strict Mode tests**

Prove:

1. a rejected mount yields `{ kind: "unavailable", reason: "network", retryable: true }` and destroys that adapter;
2. a safely stringified rejection appears as `diagnostic` only when `development` is true and is omitted in production;
3. `retry()` from a retryable unavailable state creates exactly one fresh attempt, while retry during mounting/ready is a no-op;
4. the newest user location is applied after readiness and subsequent location/null updates call `setUserLocation` without remount;
5. `getCameraSnapshot()` returns null before readiness and delegates only to the ready adapter;
6. factory throws are contained as the same runtime-network unavailable shape;
7. a typed adapter `onUnavailable` during mount or after readiness becomes the exact supplied reason/retryability, reaches only the latest consumer, destroys once, and permits retry only when retryable;
8. synchronous throws from initial/subsequent `render`, initial/subsequent `setUserLocation`, and `applyCameraIntent` enter the one-shot runtime-network unavailable path rather than escaping React;
9. a stale generation's `onUnavailable` and late throw cannot replace a newer ready/unavailable state;
10. React Strict Mode, pending resolution after unmount, and repeated cleanup never double-destroy or leak state updates.

This hook classifies only failures which occur while constructing or mounting an already-selected runtime adapter. `missing-configuration` and `loader-failed` are Phase 03 bootstrap states and must be injected there rather than guessed here. Catch hostile diagnostic stringification, keep the status usable, and never expose `diagnostic` through a presentation model.

- [ ] **Step 4: Add failing semantic-intent execution tests**

After readiness and initial render:

- a new non-null `intentId` applies once with its supplied transition;
- rerendering an identical intent/layout does nothing;
- a new semantic ID cancels a queued geometry reframe and applies immediately as supplied;
- returning `cameraIntent` to null does not undo the provider camera;
- render occurs before the first camera application for a newly mounted adapter.

Do not convert reduced motion in this hook; Task 2 has already encoded it in the semantic intent.

- [ ] **Step 5: Add failing once-per-frame geometry-reframe tests**

Start from one applied animated intent, retain its ID, then publish multiple material `layout` changes before flushing one animation frame. Assert one queued callback and one call containing:

- the latest viewport, usable region, and edge insets;
- the original semantic `intentId` and variant payload;
- `transition: "immediate"`.

Prove sub-pixel changes emit nothing. Prove a material occlusion change emits even when the chosen usable region is unchanged, because `layout.occlusions` participates in Task 1 comparison. Destroy/retry/unmount must cancel the queued callback.

- [ ] **Step 6: Implement reframe coalescing**

Track the last applied semantic intent plus full `MapLayoutSnapshot`. On same-ID material layout change, store only the newest layout and schedule one frame. At flush, call core `reframeCameraIntent`; do not hand-edit a camera variant in React. When the ID changes, cancel the pending frame and apply the new semantic intent directly.

```ts
useEffect(() => {
  const adapter = readyRef.current ? adapterRef.current : null;
  if (adapter === null || cameraIntent === null || layout === null) return;
  const last = lastAppliedCameraRef.current;
  if (last === null || last.intent.intentId !== cameraIntent.intentId) {
    cancelPendingReframe();
    if (!runReadyAdapterWork(() => adapter.applyCameraIntent(cameraIntent))) return;
    lastAppliedCameraRef.current = { intent: cameraIntent, layout };
    return;
  }
  if (!hasMaterialMapLayoutChange(last.layout, layout)) return;
  pendingReframeRef.current = { intent: cameraIntent, layout };
  if (reframeIdRef.current !== null) return;
  reframeIdRef.current = requestAnimationFrame(() => {
    reframeIdRef.current = null;
    const pending = pendingReframeRef.current;
    const current = readyRef.current ? adapterRef.current : null;
    pendingReframeRef.current = null;
    if (pending === null || current === null) return;
    const reframed = reframeCameraIntent(pending.intent, pending.layout);
    if (!runReadyAdapterWork(() => current.applyCameraIntent(reframed))) return;
    lastAppliedCameraRef.current = { intent: reframed, layout: pending.layout };
  });
}, [cameraIntent, layout, status.kind]);
```

`cancelPendingReframe` cancels and nulls `reframeIdRef`, clears `pendingReframeRef`, and runs on semantic-ID replacement, retry, adapter replacement, and unmount.

```bash
npm --workspace @laugh-tale-island/react test -- use-map-adapter-lifecycle
npm --workspace @laugh-tale-island/react run type-check
```

Expected after implementation: PASS.

- [ ] **Step 7: Commit the adapter lifecycle**

```bash
git add packages/react/src/use-map-adapter-lifecycle.ts packages/react/tests/use-map-adapter-lifecycle.test.tsx
git diff --cached --check
git commit -m "feat(react): coordinate map adapter lifecycle"
```

---

### Task 8: Align minute updates and semantic focus ownership

**Files:**
- Create: `packages/react/src/use-minute-clock.ts`
- Create: `packages/react/tests/use-minute-clock.test.tsx`
- Create: `packages/react/src/use-owner-focus-registry.ts`
- Create: `packages/react/tests/use-owner-focus-registry.test.tsx`

**Interfaces:**
- Produces two package-internal hooks consumed by Phase 03 through relative imports.

```ts
export type MinuteClockSource = () => string;

export function useMinuteClock(
  clock?: MinuteClockSource,
): string;

export type FocusRegistrySlot =
  | "node"
  | "route"
  | "dialog"
  | "disclosure-trigger";

export type OwnerFocusTarget =
  | { slot: "node"; ownerId: string }
  | { slot: "route"; ownerId: string }
  | { slot: "dialog"; ownerId: string }
  | { slot: "disclosure-trigger"; ownerId: string };

export interface OwnerFocusRegistry {
  nodeRef(ownerId: string): RefCallback<HTMLElement>;
  routeRef(ownerId: string): RefCallback<HTMLElement>;
  dialogRef(ownerId: string): RefCallback<HTMLElement>;
  disclosureTriggerRef(ownerId: string): RefCallback<HTMLElement>;
  fallbackSurfaceRef: RefCallback<HTMLElement>;
  focus(target: OwnerFocusTarget, nextOwnershipKey?: string): void;
  restoreTrigger(
    ownerId: string,
    fallbackOwner?: Extract<OwnerFocusTarget, { slot: "node" | "route" }>,
  ): void;
  cancelPendingFocus(): void;
}

export function useOwnerFocusRegistry(
  ownershipKey: string,
  reducedMotion: boolean,
): OwnerFocusRegistry;
```

- [ ] **Step 1: Add failing minute-boundary tests**

Use fake timers and set wall time to a non-boundary value. Assert the hook reads its source synchronously, schedules the next update for `60_000 - (Date.now() % 60_000)`, then schedules every subsequent update on a real minute boundary rather than accumulating interval drift. A source identity change replaces the timer and value. Unmount clears it. The default source returns a valid ISO instant and contains no timezone decision.

```bash
npm --workspace @laugh-tale-island/react test -- use-minute-clock
```

Expected: FAIL because `use-minute-clock.ts` does not exist.

- [ ] **Step 2: Implement one self-correcting timeout**

Use `Date.now()` only to schedule the next wall-minute boundary. Use the injected source for the emitted time value. Core and Phase 03 apply the authored timezone; this hook never names a locale, city, or zone.

```ts
const systemClock: MinuteClockSource = () => new Date().toISOString();

export function useMinuteClock(
  clock: MinuteClockSource = systemClock,
): string {
  const [value, setValue] = useState(() => clock());
  useEffect(() => {
    let timeoutId: number | null = null;
    setValue(clock());
    const schedule = (): void => {
      const delay = 60_000 - (Date.now() % 60_000);
      timeoutId = window.setTimeout(() => {
        setValue(clock());
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [clock]);
  return value;
}
```

- [ ] **Step 3: Add failing focus-registration tests**

For all four named slots, prove:

- callback refs are stable per slot/owner/ownership key;
- a null ref unregisters only that exact element;
- immediate focus calls `scrollIntoView({ block: "nearest", behavior: "smooth" })` for node/route under full motion, then `focus({ preventScroll: true })`;
- reduced motion uses `behavior: "auto"`;
- dialog and disclosure-trigger focus do not scroll the itinerary;
- a missing element becomes one pending request and focuses when the matching element mounts;
- changing `ownershipKey` cancels a stale pending request;
- a disconnected element is treated as absent.

```bash
npm --workspace @laugh-tale-island/react test -- use-owner-focus-registry
```

Expected: FAIL because the registry does not exist.

- [ ] **Step 4: Implement semantic, ownership-keyed registration**

Keep separate maps for each slot and key callbacks by slot plus owner ID. Never query class names, labels, DOM order, or `data-testid`. A pending request stores its target and ownership key. Fulfill it only when both still match.

```ts
function focusElement(
  target: OwnerFocusTarget,
  element: HTMLElement | undefined,
): boolean {
  if (element === undefined || !element.isConnected) return false;
  if (target.slot === "node" || target.slot === "route") {
    element.scrollIntoView?.({
      block: "nearest",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }
  element.focus({ preventScroll: true });
  pendingRef.current = null;
  return true;
}

const focus = useCallback((
  target: OwnerFocusTarget,
  nextOwnershipKey = ownershipKey,
): void => {
  if (!focusElement(target, elementsRef.current[target.slot].get(target.ownerId))) {
    pendingRef.current = { target, ownershipKey: nextOwnershipKey };
  }
}, [focusElement, ownershipKey]);
```

`nodeRef`, `routeRef`, `dialogRef`, and `disclosureTriggerRef` all call one private `refFor(slot, ownerId)` helper. That helper caches by `JSON.stringify([ownershipKey, slot, ownerId])`, deletes only the matching element on null, and fulfills a matching pending target on registration.

- [ ] **Step 5: Add failing trigger-restoration and fallback tests**

Assert `restoreTrigger(ownerId, fallbackOwner)` tries, in order:

1. the connected `disclosure-trigger` registered for `ownerId`;
2. the connected explicit node/route fallback;
3. the connected fallback map surface;
4. no action when none exist.

```ts
const restoreTrigger = useCallback((
  ownerId: string,
  fallbackOwner?: Extract<OwnerFocusTarget, { slot: "node" | "route" }>,
): void => {
  pendingRef.current = null;
  const trigger = elementsRef.current["disclosure-trigger"].get(ownerId);
  if (focusElement({ slot: "disclosure-trigger", ownerId }, trigger)) return;
  if (
    fallbackOwner !== undefined
    && focusElement(
      fallbackOwner,
      elementsRef.current[fallbackOwner.slot].get(fallbackOwner.ownerId),
    )
  ) return;
  const fallback = fallbackSurfaceRef.current;
  if (fallback?.isConnected) fallback.focus({ preventScroll: true });
}, [focusElement]);
```

Assert a pending map-origin owner focus is cancelled before dialog restoration, a removed trigger cannot receive focus, and `cancelPendingFocus` prevents later registration from stealing focus. These are semantic targets; no raw previously-active element is retained across ownership changes.

```bash
npm --workspace @laugh-tale-island/react test -- use-minute-clock use-owner-focus-registry
npm --workspace @laugh-tale-island/react run type-check
```

Expected after implementation: PASS.

- [ ] **Step 6: Commit clock and focus ownership**

```bash
git add packages/react/src/use-minute-clock.ts packages/react/tests/use-minute-clock.test.tsx packages/react/src/use-owner-focus-registry.ts packages/react/tests/use-owner-focus-registry.test.tsx
git diff --cached --check
git commit -m "feat(react): align clock and focus ownership"
```

---

### Task 9: Lock the cross-layer contract and run the Phase 02 gate

**Files:**
- Create: `packages/react/tests/choreography-camera-integration.test.tsx`
- Modify: `packages/react/src/index.ts`
- Modify: `packages/core/tests/exports.test.ts`
- Modify: `packages/react/tests/exports.test.ts`
- Modify: `packages/react/tests/boundaries.test.ts`

**Interfaces:**
- Proves the Phase 02 modules compose without publishing package-owned presentation UI.
- Preserves the roadmap public names in core/browser while reserving the React root for Phase 03's `TripController` and `useTripExperience` freeze.

- [ ] **Step 1: Add a failing low-level export assertion**

Before changing `packages/react/src/index.ts`, add the five negative runtime assertions shown in Step 4 below and run:

```bash
npm --workspace @laugh-tale-island/react test -- exports
```

Expected: FAIL because the 1.0 entry point still exports `useItinerarySheet`.

- [ ] **Step 2: Remove the low-level root export**

Delete the `useItinerarySheet` export block from `packages/react/src/index.ts`. Keep the source export so Phase 03 can import `./use-itinerary-sheet.js`. Do not add a replacement root name. Rerun the export target and expect PASS.

```diff
-export {
-  useItinerarySheet,
-  type ItinerarySheetController,
-  type SheetHandleProps,
-  type SheetProps,
-  type UseItinerarySheetOptions,
-} from "./use-itinerary-sheet.js";
```

- [ ] **Step 3: Add the geometry-to-camera integration harness**

Build a test-only React harness that composes relative imports of `useVisibleMapLayout` and `useMapAdapterLifecycle` with a local fake `MapAdapterV2`. Feed it a core intent resolved from synthetic day geometry. Assert this sequence:

1. the map mounts once and renders before camera application;
2. the initial semantic day fit applies as `animate`;
3. header and sheet rectangle changes in the same frame publish one layout revision;
4. the lifecycle applies one `immediate` reframe with the original ID;
5. a new list selection applies a new animated focus ID and cancels a stale queued fit reframe;
6. sheet snap, header reversal, selection, and presentation updates never replace the adapter.

The harness renders only unlabeled test elements and imports no CSS.

Compose the two map refs in the test component and resolve the semantic intent only after layout exists:

```tsx
class RecordingMapAdapter implements MapAdapterV2 {
  readonly mountCalls: HTMLElement[] = [];
  readonly cameraIntents: CameraIntent[] = [];
  async mount(element: HTMLElement): Promise<void> {
    this.mountCalls.push(element);
  }
  render(): void {}
  applyCameraIntent(intent: CameraIntent): void {
    this.cameraIntents.push(intent);
  }
  getCameraSnapshot(): CameraSnapshot | null {
    return { zoom: 16 };
  }
  setUserLocation(): void {}
  destroy(): void {}
}

const presentation: MapPresentationV2 = { markers: [], routes: [] };
const mountConfig: MapMountConfig = {
  events: {
    onMarkerSelect: vi.fn(),
    onRouteSelect: vi.fn(),
    onUnavailable: vi.fn(),
  },
  visualProfile: {
    id: "contract-profile",
    basemap: {
      mode: "neutral",
      density: "low",
      contrast: "standard",
      poi: "minimal",
      stationLabels: "legible",
      palette: {
        geometry: "#ffffff",
        label: "#111111",
        labelStroke: "#ffffff",
        water: "#dbeafe",
        park: "#dcfce7",
        road: "#e5e7eb",
      },
    },
    routeStyle: () => null,
  },
  createMarkerContent: () => {
    const element = document.createElement("button");
    return { element, update: () => undefined, dispose: () => element.remove() };
  },
  createUserLocationContent: () => {
    const element = document.createElement("span");
    return { element, update: () => undefined, dispose: () => element.remove() };
  },
};

interface HarnessProps {
  intentId: string;
  adapter: RecordingMapAdapter;
}

function Harness({ intentId, adapter }: HarnessProps) {
  const visible = useVisibleMapLayout();
  const cameraIntent = visible.layout === null
    ? null
    : resolveFitCameraIntent(
        { intentId, layout: visible.layout, reducedMotion: visible.reducedMotion },
        { points: [{ lat: 10, lng: 20 }], paths: [] },
      );
  const lifecycle = useMapAdapterLifecycle({
    createAdapter: () => adapter,
    mountConfig,
    presentation,
    cameraIntent,
    layout: visible.layout,
    userLocation: null,
    development: false,
  });
  const mapRef = useCallback((element: HTMLElement | null): void => {
    visible.mapViewportRef(element);
    lifecycle.mapRef(element);
  }, [lifecycle.mapRef, visible.mapViewportRef]);
  return (
    <div data-region="map" ref={mapRef}>
      <div data-region="header" ref={visible.occlusionRef("header")} />
      <div data-region="sheet" ref={visible.occlusionRef("sheet")} />
    </div>
  );
}
```

The test's controlled `getBoundingClientRect`, `ResizeObserver`, and frame queue first produce the mobile layout, then replace both header and sheet rectangles in one frame. Assert the fake adapter call sequence exactly:

```ts
expect(adapter.cameraIntents).toEqual([
  expect.objectContaining({ intentId: firstId, kind: "fit", transition: "animate" }),
  expect.objectContaining({ intentId: firstId, kind: "fit", transition: "immediate" }),
]);

rerender(<Harness intentId={secondId} adapter={adapter} />);
expect(adapter.cameraIntents.at(-1)).toEqual(
  expect.objectContaining({ intentId: secondId, kind: "fit", transition: "animate" }),
);
expect(adapter.mountCalls).toHaveLength(1);
```

```bash
npm --workspace @laugh-tale-island/react test -- choreography-camera-integration
```

Expected: PASS using the already-green Task 1/2/6/7 contracts. A failure means an earlier task is incomplete: return to that named task, add the exact failing case to its focused test, and complete its red/green cycle before resuming this gate. Do not weaken the integration assertion or add a new orchestration layer here.

- [ ] **Step 4: Lock public and internal exports**

In core's export test, require `createMemoryTripNavigationStore`, `reduceExperienceChoreography`, `resolveMapLayout`, all three semantic camera resolvers, `reframeCameraIntent`, and the Phase 01 `CameraIntent` types at compile time.

In React's export test, use a dynamic root import and assert these implementation names are absent:

```ts
expect(root).not.toHaveProperty("useItinerarySheet");
expect(root).not.toHaveProperty("useVisibleMapLayout");
expect(root).not.toHaveProperty("useMapAdapterLifecycle");
expect(root).not.toHaveProperty("useMinuteClock");
expect(root).not.toHaveProperty("useOwnerFocusRegistry");
```

Do not assert continued availability of any 1.0 hook. Phase 03 replaces the root surface with the two ledger runtime exports.

- [ ] **Step 5: Strengthen the React headless boundary scan**

Retain the existing CSS/icon/Google/copy checks and add assertions that `packages/react/src/**` contains none of these recipe-owned tokens: `104px`, `46dvh`, `43.75rem`, `220ms`, `160ms`, `cubic-bezier(0.22, 1, 0.36, 1)`, `Tokyo`, `東京`, `35.6812`, or `139.7671`. Permit numeric values supplied through tests and interfaces; reject only embedded source policy.

```ts
const forbiddenPresentationPolicy = [
  /104px/,
  /46dvh/,
  /43\.75rem/,
  /220ms/,
  /160ms/,
  /cubic-bezier\(0\.22, 1, 0\.36, 1\)/,
  /Tokyo|東京|35\.6812|139\.7671/,
];
for (const file of globSync(join(packageRoot, "src/**/*.ts*"))) {
  const source = readFileSync(file, "utf8");
  for (const pattern of forbiddenPresentationPolicy) {
    expect(source, `${file}: ${pattern}`).not.toMatch(pattern);
  }
}
```

```bash
npm --workspace @laugh-tale-island/core test -- exports map-camera trip-navigation experience-choreography sheet-geometry
npm --workspace @laugh-tale-island/adapters test -- google-map-adapter
npm --workspace @laugh-tale-island/react test -- exports boundaries choreography-camera-integration
```

Expected after implementation: PASS.

- [ ] **Step 6: Run all package tests**

```bash
npm --workspace @laugh-tale-island/core test
npm --workspace @laugh-tale-island/adapters test
npm --workspace @laugh-tale-island/react test
npm --workspace @laugh-tale-island/testing test
```

Expected: PASS with no leaked timer, frame, observer, element, adapter, or unhandled promise assertion.

- [ ] **Step 7: Run package type, lint, and build gates**

```bash
npm run type-check:packages
npm run lint:packages
npm run build:packages
npm run test:packages
git diff --check
```

Expected: every command exits 0. Do not use the current generated starter as a Phase 02 compatibility oracle: Phase 03 replaces its 1.0 controller and freezes the v2 presentation seam before staged starter/E2E gates resume.

- [ ] **Step 8: Audit every Phase 02 requirement against the design**

Verify in the diff and green tests that:

- rectangle subtraction covers full-width mobile occlusion and bounded desktop rails;
- camera intent variants carry the exact Phase 01 fields and finite numeric zoom values;
- fit/route validity remains upstream and Google code contains no trip policy;
- semantic transitions animate unless reduced, while geometry reframes are immediate and once per frame;
- restore-full-day and day entry resolve through the same fit builder;
- sheet settling is position-only and pointer moves are frame-coalesced;
- header reversal state is continuous and stale settles cannot win;
- visual-viewport, safe-area, focus-restoration, timer, and adapter cleanup paths are tested;
- no low-level React hook is added to the package root;
- no presentation dimension, duration, easing, text, icon, color, or Tokyo fact entered production package code.

- [ ] **Step 9: Commit the contract gate**

```bash
git add packages/react/src/index.ts packages/react/tests/choreography-camera-integration.test.tsx packages/core/tests/exports.test.ts packages/react/tests/exports.test.ts packages/react/tests/boundaries.test.ts
git diff --cached --check
git commit -m "test: lock v2 choreography camera contracts"
```

## Phase 02 Completion Evidence

Before Phase 03 starts, record in the execution report the Phase 01 gate commit, Phase 02 final commit, exact `node --version` and `npm --version` output, the four workspace test results, package type-check/lint/build results, and the reviewer's approval with date. Attach the terminal output from Task 9 rather than transcribing a generic pass claim.

Phase 02 is complete only when Tasks 1–9 are committed, every command in Task 9 is green from the isolated worktree, the audit has no unresolved item, and the reviewer confirms that Phase 03 can compose the five package-internal hooks without redefining navigation, choreography, camera, layout, focus, clock, sheet, or adapter lifecycle behavior.
