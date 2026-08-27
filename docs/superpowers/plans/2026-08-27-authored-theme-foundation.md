# Authored Theme Foundation and Field Atlas Implementation Plan (Phase 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the recipe-v2 compiler, presentation-neutral controller boundary, injectable Google map visuals, and a complete internally staged Field Atlas presentation without changing the currently supported three-recipe catalog.

**Architecture:** Keep `plugins/eternal-pose/recipes/` as the public v1 catalog until Phase 4. Build v2 recipes under the implementation-only `plugins/eternal-pose/recipes-v2/` root and exercise them through an explicit internal catalog-root option. The starter is split into `app`, `controllers`, `presentation`, `providers`, and `trip-content`; shared React controllers expose semantic view models/actions while a single local `TripPresentation` owns every visible element. Google receives the selected presentation's map profile and an optional user-owned map ID at composition startup.

**Tech Stack:** Node.js 22 ESM, TypeScript 5.9, React 19, Vitest 4, Testing Library, Playwright 1.62, Google Maps JavaScript API, existing `@laugh-tale-island/core` and `@laugh-tale-island/react` packages.

**Spec:** `docs/superpowers/specs/2026-08-27-authored-theme-catalog-design.md`

## Global Constraints

- This is Phase 1 of 4. Execute in explicit phase order: Foundation → Product Worlds → Specialty Worlds → Atomic Cutover. Phase 4 is the only plan allowed to expose the new six-recipe catalog or delete the old catalog.
- `plugins/eternal-pose/recipes-v2/` is an implementation-only construction root. Public CLI help, plugin guidance, marketplace copy, and default selection must not mention it.
- No starter-theme npm package, runtime theme selector, recipe ID in the semantic `Trip` model, or package-to-presentation import may be introduced.
- The generated project owns `src/presentation/**`; controllers and providers must not compare it to starter source after generation.
- Controllers may import React and the two headless packages. They must not import CSS, icons, recipe assets, Google SDK types, or visible product copy.
- Presentations receive serializable/domain view models, actions, refs, and prop-getters. They never receive a controller instance or a raw provider SDK object.
- Preserve the existing supported v1 generator and its tests until Phase 4. Any temporary v1 adapter code must be plainly marked `TRANSITIONAL_V1` and deleted by the cutover plan.
- Continue using exact package versions already pinned by the starter; do not install a new UI kit, font package, animation package, or theme dependency.
- Browser tests block all non-local network traffic. Recipe assets must be local, original, redistributable, and free of credentials or private trip data.
- Every new interaction has a zero-duration reduced-motion path, visible focus, forced-colors behavior, and a 44-by-44 CSS-pixel target where interactive.
- Do not touch or stage `.impeccable/` or the untracked `ChatGPT Image Aug 27 2026 GitHub Logo (*.png)` files.

---

### Task 1: Define and validate the recipe-v2 manifest (TDD)

**Files:**
- Create: `plugins/eternal-pose/lib/recipe-v2.mjs`
- Test: `tests/generation/recipe-v2.test.ts`
- Create fixture: `tests/fixtures/recipe-v2/valid/recipe.json`
- Create fixture: `tests/fixtures/recipe-v2/valid/presentation/index.ts`
- Create fixture: `tests/fixtures/recipe-v2/valid/presentation/styles/index.css`
- Modify: `plugins/eternal-pose/scripts/create-trip-project.mjs`

**Interfaces:**
- `RECIPE_SCHEMA_VERSION = 2`
- `loadRecipeV2Catalog(catalogRoot, operations?) -> Promise<ReadonlyMap<string, LoadedRecipeV2>>`
- `loadRecipeV2(recipeDir, expectedId, operations?) -> Promise<LoadedRecipeV2>`
- `createTripProject` gains test/internal-only `recipeCatalogRoot?: string`; omission continues to use the public v1 root during this phase.

The exact manifest contract is:

```ts
interface RecipeManifestV2 {
  schemaVersion: 2;
  id: string;
  label: string;
  summary: string;
  register: "product";
  presentation: {
    source: "presentation";
    entry: string;
    css: string[];
    assets: string[];
  };
  map: {
    profile: string;
    googleStyleGuide?: string;
  };
  motion: {
    durationMs: number;
    easing: string;
    interruptible: true;
    reducedMotion: "instant";
  };
  features: Array<"media" | "desktop-windows" | "dense-telemetry">;
  font: {
    policy: "system" | "local-open-license";
    assets: string[];
    license?: string;
  };
  validation: {
    viewports: number[];
    screenshots: Array<"home" | "experience" | "experience-expanded">;
  };
}
```

- [ ] **Step 1: Write failing manifest and catalog tests**

Cover all of these cases in `tests/generation/recipe-v2.test.ts`:

```ts
expect(valid.manifest.schemaVersion).toBe(2);
expect([...catalog.keys()]).toEqual(["valid"]);
await expect(load("unknown-schema")).rejects.toThrow(/schemaVersion.*2/);
await expect(load("id-mismatch")).rejects.toThrow(/id.*directory/i);
await expect(load("missing-entry")).rejects.toThrow(/presentation\.entry/);
await expect(load("dot-dot-path")).rejects.toThrow(/root-contained/);
await expect(load("absolute-path")).rejects.toThrow(/relative/);
await expect(load("backslash-path")).rejects.toThrow(/normalized/);
await expect(load("symlink-entry")).rejects.toThrow(/symbolic link/);
await expect(loadCatalog("duplicate-id")).rejects.toThrow(/duplicate recipe id/);
await expect(load("local-font-without-license")).rejects.toThrow(/font\.license/);
```

Also assert exact viewport membership (`320`, `390`, `430`, `768`, `1024`, `1440`), unique CSS/assets/features entries, nonblank strings, finite non-negative duration, and that the profile module and optional guide exist as regular non-symlink files.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- tests/generation/recipe-v2.test.ts`

Expected: FAIL because `plugins/eternal-pose/lib/recipe-v2.mjs` does not exist.

- [ ] **Step 3: Implement strict parsing and root-contained path resolution**

Use `lstat` followed by `realpath` for every declared file and directory. Normalize manifest paths to POSIX separators and reject absolute paths, empty segments, `.`, `..`, backslashes, NUL bytes, URL schemes, and any canonical target outside the canonical recipe directory. Return frozen metadata and canonical source paths; do not retain unvalidated manifest fields.

The result shape must be:

```js
{
  id,
  root,
  manifest,
  presentationRoot,
  presentationEntry,
  cssFiles,
  assetRoots,
  mapProfile,
  googleStyleGuide,
}
```

Sort directory entries and IDs before validation so error order and generated inventory are deterministic.

- [ ] **Step 4: Add v2 composition behind the internal catalog-root option**

When `recipeCatalogRoot` is supplied, `createTripProject` must:

1. load the selected v2 manifest before reserving the destination;
2. copy the starter into the owned stage while skipping `src/presentation/**`;
3. copy the selected recipe's `presentation/` tree to `src/presentation/`;
4. copy the selected recipe's root `README.md` to `src/presentation/README.md`;
5. copy the contents of a declared recipe `assets/` root to `public/theme-assets/`;
6. copy an optional Google guide to `docs/provider-guides/google-map-style.json`;
7. write `eternal-pose.json` with `generatorVersion`, `recipe`, `recipeSchemaVersion: 2`, and package versions;
8. retain the current owned-inventory, race, rollback, symlink, and non-empty-target guarantees.

Do not add a `recipes-v2` CLI flag. Unit tests import `createTripProject` and pass the explicit construction root.

- [ ] **Step 5: Add composition safety tests**

Extend `tests/generation/recipe-v2.test.ts` with a synthetic starter whose `src/presentation/foreign.txt` must be absent after v2 composition. Assert the selected entry/CSS and selected `src/presentation/README.md` exist, undeclared files outside the selected recipe are absent, the catalog root is absent, provenance records schema 2, a mutation failure leaves no destination, and a symlink appearing between validation and copy aborts without publishing.

- [ ] **Step 6: Run focused and generator regression tests**

Run:

```bash
npm test -- tests/generation/recipe-v2.test.ts tests/scripts/create-trip-project.test.ts tests/generation/create-real-starter.test.ts
```

Expected: PASS. The public v1 tests still select the old three IDs.

- [ ] **Step 7: Commit**

```bash
git add plugins/eternal-pose/lib/recipe-v2.mjs plugins/eternal-pose/scripts/create-trip-project.mjs tests/generation/recipe-v2.test.ts tests/fixtures/recipe-v2
git commit -m "feat: add internal recipe v2 composition"
```

---

### Task 2: Establish the presentation contract and app-state controller (TDD)

**Files:**
- Create: `plugins/eternal-pose/starter/react/src/controllers/presentation-contract.ts`
- Create: `plugins/eternal-pose/starter/react/src/controllers/map-visual-profile.ts`
- Create: `plugins/eternal-pose/starter/react/src/controllers/use-home-controller.ts`
- Create: `plugins/eternal-pose/starter/react/src/controllers/presentation-contract.test.tsx`
- Create: `plugins/eternal-pose/starter/react/src/app/PresentationErrorBoundary.tsx`
- Modify: `plugins/eternal-pose/starter/react/src/ui/SetupRequired.tsx` (import the neutral `SetupIssue` type)
- Modify: `plugins/eternal-pose/starter/react/src/App.tsx` (type import only; runtime composition stays unchanged)

**Interfaces:**

```ts
export interface TripPresentation {
  Home: ComponentType<HomeViewProps>;
  Experience: ComponentType<ExperienceViewProps>;
  SetupRequired: ComponentType<SetupRequiredViewProps>;
  Loading: ComponentType<LoadingViewProps>;
  FatalError: ComponentType<FatalErrorViewProps>;
  geometry: PresentationGeometry;
  mapProfile: MapVisualProfile;
}

export type SetupIssue =
  | { kind: "trip-content" }
  | { kind: "provider-key" }
  | { kind: "provider-load"; reason: string };

export interface HomeViewProps {
  model: HomeViewModel;
  actions: HomeActions;
}

export interface HomeViewModel {
  trip: Trip;
  progress: TripProgressV1;
  pretripCompletion: { completed: number; total: number };
  reservationCounts: { confirmed: number; pending: number; none: number };
  persistence: ProgressPersistenceStatus;
}

export interface HomeActions {
  setCompleted(id: string, completed: boolean): void;
  enterDay(dayId: string): void;
}

export interface PresentationGeometry {
  header: { expanded: number; collapsed: number };
  sheet: { collapsed: number; minGap: number };
  desktopBreakpoint: number;
}

export interface MapMarkerPart {
  className: string;
  text: string;
}

export interface MapMarkerVisual {
  title: string;
  className: string;
  label: string;
  parts: readonly MapMarkerPart[];
  fallback: { fill: string; stroke: string; text: string };
}

export interface MapRouteVisual {
  stroke: string;
  opacity: number;
  width: number;
  casing?: { stroke: string; opacity: number; width: number };
  dash?: number[];
}

export interface MapVisualProfile {
  id: string;
  basemap: {
    mode: "neutral" | "topographic" | "flat" | "technical" | "coastal" | "subdued";
    density: "low" | "medium" | "high";
    contrast: "soft" | "standard" | "high";
    poi: "minimal" | "standard";
  };
  marker(place: MapPlacePresentation, index: number): MapMarkerVisual;
  userLocation(): MapMarkerVisual;
  route(route: MapRoutePresentation): MapRouteVisual;
}
```

The same `presentation-contract.ts` file declares the exact `ExperienceViewProps`, `ExperienceViewModel`, `ExperienceActions`, and `ExperienceBindings` interfaces shown in Task 3 even though their hook is implemented there; they are pure types and must compile in this task. `SetupRequiredViewProps` carries the existing `SetupIssue`; `LoadingViewProps` carries only `kind: "progress"`; `FatalErrorViewProps` carries `{ model: { kind: "render" }, actions: { retry(): void } }` so raw exception text never crosses into visible UI. Task 4 validates and consumes the already-defined map profile.

- [ ] **Step 1: Write failing contract-host tests**

Use five spy views and a fake `TripPresentation`. Prove the five view prop contracts accept semantic model/action objects and reject controller/provider objects at type-check time. Render `useHomeController` through a test harness and prove completion/reservation counts and actions. Throw a synthetic child-view error and prove `PresentationErrorBoundary` selects Fatal Error with `kind: "render"`, no exception message, and a retry action. Assert the controller passes semantic data/actions, not rendered fragments, provider SDK objects, or visible fallback text.

- [ ] **Step 2: Run the starter test and confirm RED**

Run: `npm --prefix plugins/eternal-pose/starter/react test -- src/controllers/presentation-contract.test.tsx`

Expected: FAIL because the contract and host do not exist.

- [ ] **Step 3: Implement `useHomeController` and the presentation error boundary**

Move task completion totals and reservation counts into `useHomeController`; it consumes an already hydrated progress controller plus `enterDay` and returns only `HomeViewProps`. `PresentationErrorBoundary` receives the selected Fatal Error component and renders it after a descendant error, with no built-in DOM/copy fallback. Progress-store creation, hydration, active-day routing, and experience mounting move in Task 3 so React hooks are never called conditionally.

- [ ] **Step 4: Freeze the local presentation boundary without switching production**

Define the final app injection shape now so Task 3 can switch atomically:

```ts
presentation?: TripPresentation;
```

Change only the `SetupIssue` type import in `src/App.tsx`/the current Setup view; do not change their runtime composition or `main.tsx` in this task. The contract/error boundary can merge independently while the old app remains runnable; Task 3 creates the controller host and switches production only after the experience hook exists.

- [ ] **Step 5: Add a controller boundary test**

Scan `src/controllers/**/*.{ts,tsx}` and reject `.css` imports, `lucide`, `google.maps`, `<main`, `<header`, `<button`, hard-coded Chinese copy, and the existing visible English labels. Permit React component invocation and ARIA prop names in prop-getter types.

- [ ] **Step 6: Run tests and type-check**

Run:

```bash
npm --prefix plugins/eternal-pose/starter/react test -- src/controllers/presentation-contract.test.tsx
npm --prefix plugins/eternal-pose/starter/react run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add plugins/eternal-pose/starter/react/src/app/PresentationErrorBoundary.tsx plugins/eternal-pose/starter/react/src/controllers plugins/eternal-pose/starter/react/src/ui/SetupRequired.tsx plugins/eternal-pose/starter/react/src/App.tsx
git commit -m "refactor: define the local presentation contract"
```

---

### Task 3: Extract the experience controller and move all visible UI into presentation (TDD)

**Files:**
- Create: `plugins/eternal-pose/starter/react/src/controllers/use-trip-experience-controller.ts`
- Create: `plugins/eternal-pose/starter/react/src/controllers/use-map-lifecycle.ts`
- Create: `plugins/eternal-pose/starter/react/src/controllers/use-viewport-metrics.ts`
- Create: `plugins/eternal-pose/starter/react/src/controllers/use-trip-experience-controller.test.tsx`
- Create: `plugins/eternal-pose/starter/react/src/controllers/ExperienceController.tsx`
- Create: `plugins/eternal-pose/starter/react/src/controllers/AppController.tsx`
- Modify: `packages/react/src/use-candidate-decision.ts`
- Modify: `packages/react/tests/use-candidate-decision.test.tsx`
- Modify: `packages/react/src/index.ts`
- Modify: `packages/react/tests/exports.test.ts`
- Modify: `packages/react/README.md`
- Create: `plugins/eternal-pose/starter/react/src/app/App.tsx`
- Move: `plugins/eternal-pose/starter/react/src/App.test.tsx` → `plugins/eternal-pose/starter/react/src/app/App.test.tsx`
- Modify: `plugins/eternal-pose/starter/react/src/App.tsx` (temporary re-export only)
- Modify: `plugins/eternal-pose/starter/react/src/main.tsx`
- Create: `plugins/eternal-pose/starter/react/src/presentation/theme-map-profile.ts` (transitional neutral profile)
- Move: `plugins/eternal-pose/starter/react/src/experience-shell/progress-storage.ts` → `plugins/eternal-pose/starter/react/src/controllers/progress-storage.ts`
- Move: `plugins/eternal-pose/starter/react/src/ui/DayHeader.tsx` and `DayHeader.test.tsx` → `plugins/eternal-pose/starter/react/src/presentation/DayHeader.tsx` and `DayHeader.test.tsx`
- Move: `plugins/eternal-pose/starter/react/src/ui/ItineraryTimeline.tsx` → `plugins/eternal-pose/starter/react/src/presentation/ItineraryTimeline.tsx`
- Move: `plugins/eternal-pose/starter/react/src/ui/SetupRequired.tsx` → `plugins/eternal-pose/starter/react/src/presentation/SetupRequired.tsx`
- Move: `plugins/eternal-pose/starter/react/src/ui/labels.ts`, `timing-label.ts`, and `timing-label.test.ts` → the same filenames under `plugins/eternal-pose/starter/react/src/presentation/`
- Move: `plugins/eternal-pose/starter/react/src/ui/home/TripHome.tsx` and `TripHome.test.tsx` → the same relative paths under `plugins/eternal-pose/starter/react/src/presentation/home/`
- Move: `plugins/eternal-pose/starter/react/src/ui/decisions/CandidateDecision.tsx`, `CandidateDecision.test.tsx`, `ShoppingStatusSelect.tsx`, and `ShoppingStatusSelect.test.tsx` → the same filenames under `plugins/eternal-pose/starter/react/src/presentation/decisions/`
- Move: `plugins/eternal-pose/starter/react/src/ui/reservations/ReservationPanel.tsx` and `ReservationPanel.test.tsx` → the same relative paths under `plugins/eternal-pose/starter/react/src/presentation/reservations/`
- Move: `plugins/eternal-pose/starter/react/src/ui/tasks/TaskWidget.tsx` and `TaskWidget.test.tsx` → the same relative paths under `plugins/eternal-pose/starter/react/src/presentation/tasks/`
- Move: all nine `plugins/eternal-pose/starter/react/src/ui/renderers/*Entry.tsx` files plus `renderers.test.tsx` → the same filenames under `plugins/eternal-pose/starter/react/src/presentation/renderers/`
- Move: `plugins/eternal-pose/starter/react/src/ui/timeline/{RouteConnector,TimelineEntry}.tsx` and both matching tests → the same filenames under `plugins/eternal-pose/starter/react/src/presentation/timeline/`
- Move: `plugins/eternal-pose/starter/react/src/ui/styles/base.css` and `recipe.css` → `plugins/eternal-pose/starter/react/src/presentation/styles/base.css` and `recipe.css`
- Move: `plugins/eternal-pose/starter/react/src/experience-shell/ItineraryMap.tsx` → `plugins/eternal-pose/starter/react/src/presentation/experience/ItineraryMapView.tsx`
- Move: `plugins/eternal-pose/starter/react/src/experience-shell/ItineraryMap.test.tsx` → `plugins/eternal-pose/starter/react/src/presentation/experience/ItineraryMapView.test.tsx`
- Move: `plugins/eternal-pose/starter/react/src/experience-shell/ItinerarySheet.tsx` → `plugins/eternal-pose/starter/react/src/presentation/experience/ItinerarySheetView.tsx`
- Move: `plugins/eternal-pose/starter/react/src/experience-shell/ItinerarySheet.test.tsx` → `plugins/eternal-pose/starter/react/src/presentation/experience/ItinerarySheetView.test.tsx`
- Replace: `plugins/eternal-pose/starter/react/src/experience-shell/TripExperience.tsx` with a transitional re-export
- Create: `plugins/eternal-pose/starter/react/src/presentation/index.ts`
- Modify: starter component tests and imports under `src/presentation/**`
- Modify: `plugins/eternal-pose/scripts/create-trip-project.mjs` (`TRANSITIONAL_V1` CSS target)
- Modify: `tests/generation/create-real-starter.test.ts`
- Modify: `tests/scripts/create-trip-project.test.ts`

**Interfaces:**

`useTripExperienceController(input)` returns one stable object with these top-level groups:

```ts
interface ExperienceViewProps {
  model: ExperienceViewModel;
  actions: ExperienceActions;
  bindings: ExperienceBindings;
}

interface ExperienceViewModel {
  trip: Trip;
  effectiveDay: EffectiveDay;
  days: readonly TripDay[];
  clock: { instant: string; timezone: string };
  live: { currentNodeId: string | null; nextNodeId: string | null };
  selection: TripSelection;
  progress: TripProgressV1;
  persistence: ProgressPersistenceStatus;
  routes: readonly ExperienceRouteViewModel[];
  map: { presentation: MapPresentation; status: "mounting" | "ready" | "error" };
  viewport: { width: number; height: number; safeTop: number; safeBottom: number };
  motion: "full" | "reduced";
  sheet: { snap: SheetSnap; geometry: SheetGeometry };
  candidate: CandidateViewModel | null;
  shopping: ShoppingViewModel | null;
  tasks: readonly TripTask[];
}

interface ExperienceRouteViewModel {
  edge: RouteEdge;
  loadState?: RouteLoadState;
  selected: boolean;
  selectionSource: "list" | "map" | null;
  navigationHref?: string;
}

interface CandidateViewModel {
  group: CandidateGroup;
  sourceNode: TripNode;
  sequenceNumber: number;
  committedOptionId?: string;
  open: boolean;
  sessionId: number | null;
  draftOptionId?: string;
}

interface ShoppingViewModel {
  node: Extract<TripNode, { kind: "shopping" }>;
  statuses: Readonly<Record<string, ShoppingStatus>>;
}

interface ExperienceBindings {
  map: { ref: RefCallback<HTMLDivElement> };
  sheet: {
    getSheetProps(): HTMLAttributes<HTMLElement>;
    getHandleProps(): ButtonHTMLAttributes<HTMLButtonElement>;
  };
  owners: {
    nodeRef(nodeId: string): RefCallback<HTMLElement>;
    routeRef(routeId: string): RefCallback<HTMLElement>;
  };
  candidate: {
    getTriggerProps(): CandidateTriggerProps;
    registerOption(optionId: string): RefCallback<HTMLElement>;
  } | null;
}

interface ExperienceActions {
  selectDay(dayId: string): void;
  selectNode(nodeId: string): void;
  selectRoute(routeId: string, source: "list" | "map"): void;
  returnToNow(): void;
  returnToLodging(): void;
  returnHome(): void;
  retryRoute(routeId: string): void;
  retryMap(): void;
  openCandidate(): void;
  closeCandidate(): void;
  previewCandidate(optionId: string): void;
  confirmCandidate(): void;
  setCompleted(id: string, completed: boolean): void;
  setShoppingStatus(itemId: string, status: ShoppingStatus): void;
  startLocation(): void;
  recenterLocation(): void;
  stopLocation(): void;
  setSheetSnap(snap: SheetSnap): void;
}
```

`ExperienceActions` exposes named semantic operations: select day/node/route, return to now/lodging/home, retry route/map, open/preview/confirm/close candidate, update completion/shopping, start/stop/recenter location, and set sheet snap. `ExperienceBindings` exposes the map container ref, sheet prop-getters, stable node/route owner refs for map-originated focus restoration, and the candidate hook's trigger/option prop-getters; it contains no label text or CSS class.

`src/app/App.tsx` also accepts an optional `navigationAdapter: NavigationAdapter`; production creates the existing `GoogleNavigationAdapter` in the app composition layer and injects it. Controllers derive trimmed, safe `navigationHref` values into `ExperienceRouteViewModel`; presentations never import a navigation provider or build provider URLs themselves.

- [ ] **Step 1: Turn the existing `TripExperience` tests into controller contract tests**

Keep the existing regression scenarios for map/list bidirectionality, persistent map identity, route retry, candidate preview/commit, day switching, user location, current/next state, progress, safe areas, sheet geometry, and reduced motion. Assert controller model/action changes rather than legacy class names wherever possible.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm --prefix plugins/eternal-pose/starter/react test -- src/controllers/use-trip-experience-controller.test.tsx`

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Extract orchestration without changing behavior**

Move all state/effects/helpers from the current `TripExperience.tsx` that do not render DOM into the three controller hooks. Remove `EXPANDED_HEADER_HEIGHT`, `COLLAPSED_HEADER_HEIGHT`, and `COLLAPSED_SHEET_HEIGHT`; presentations supply visual measurements through a `PresentationGeometry` input, while controllers call `resolveSheetGeometry` and enforce safe-area/viewport bounds.

Refactor `@laugh-tale-island/react` so a shared internal implementation supports `useOptionalCandidateDecision(options: UseCandidateDecisionOptions | null): CandidateDecisionController | null`; the existing `useCandidateDecision(nonNullOptions)` remains source-compatible and delegates to it. When input becomes `null`, clear map override/session/ref state without emitting stale focus; when a new group appears, initialize from that group's committed option. The local experience controller calls the optional hook unconditionally, so candidate selection can appear/disappear without violating hook order or remounting the map. Add package tests for null → group → different group → null, focus restoration, stale preview rejection, and cleanup.

Read the geometry from the selected `presentation.geometry` object defined in Task 2. Reject non-finite or negative geometry and clamp it through core's sheet geometry resolver. Geometry changes must update map padding without remounting the adapter.

- [ ] **Step 4: Move visible code and assemble the transitional presentation**

Use `git mv` so history remains readable. `src/presentation/index.ts` exports one `TripPresentation` using the moved Home, Experience, Setup Required, Loading, and Fatal Error views. Preserve current labels, roles, test IDs, DOM, and CSS during this task; this is a behavior-preserving structural migration, not the Field Atlas redesign.

`ExperienceController` is the only component that calls `useTripExperienceController`; it renders `<presentation.Experience model={model} actions={actions} bindings={bindings} />`. `AppController` owns progress-store creation/hydration and active-day routing, then conditionally mounts a Home view or the separate `ExperienceController` component so hook order is always valid. `src/app/App.tsx` owns setup truth and the error boundary, production defaults to the transitional `src/presentation` export, `src/App.tsx` becomes the marked re-export, and `main.tsx` switches to `./app/App`.

Move `base.css` and `recipe.css` to `src/presentation/styles/`. Update the v1 generator's replacement target and old tests to `src/presentation/styles/recipe.css`, marking both branches `TRANSITIONAL_V1` for Phase 4 deletion.

- [ ] **Step 5: Enforce the five-directory dependency boundary**

Add assertions that:

- `src/controllers` and `src/providers` never import `src/presentation`;
- `src/presentation` may import controller types and headless packages;
- `packages/**` never import starter files;
- all CSS/icon imports live under `src/presentation`;
- all visible view exports are reachable only through `src/presentation/index.ts`.

- [ ] **Step 6: Run the starter and public-v1 regression suites**

Run:

```bash
npm --prefix plugins/eternal-pose/starter/react test -- src/app/App.test.tsx src/controllers/use-trip-experience-controller.test.tsx
npm --workspace @laugh-tale-island/react test -- use-candidate-decision.test.tsx exports.test.ts
npm --prefix plugins/eternal-pose/starter/react run check
npm test -- tests/generation/create-real-starter.test.ts tests/scripts/create-trip-project.test.ts tests/generation/no-duplicate-runtime.test.ts
```

Expected: PASS with the old public catalog unchanged.

- [ ] **Step 7: Commit**

```bash
git add packages/react/src/use-candidate-decision.ts packages/react/src/index.ts packages/react/tests/use-candidate-decision.test.tsx packages/react/tests/exports.test.ts packages/react/README.md plugins/eternal-pose/starter/react/src plugins/eternal-pose/scripts/create-trip-project.mjs tests/generation/create-real-starter.test.ts tests/scripts/create-trip-project.test.ts
git commit -m "refactor: separate trip controllers from visible presentation"
```

---

### Task 4: Inject the map visual profile and user-owned Google map ID (TDD)

**Files:**
- Modify: `packages/core/src/provider-data.ts`
- Modify: `packages/core/src/map-presentation.ts`
- Modify: `packages/core/tests/map-presentation.test.ts`
- Modify: `packages/core/tests/exports.test.ts`
- Modify: `plugins/eternal-pose/starter/react/src/controllers/map-visual-profile.ts`
- Create: `plugins/eternal-pose/starter/react/src/controllers/map-visual-profile.test.ts`
- Modify: `plugins/eternal-pose/starter/react/src/controllers/presentation-contract.ts`
- Modify: `plugins/eternal-pose/starter/react/src/providers/google/google-config.ts`
- Modify: `plugins/eternal-pose/starter/react/src/providers/google/GoogleMapAdapter.ts`
- Modify: `plugins/eternal-pose/starter/react/src/providers/google/google-provider.test.ts`
- Modify: `plugins/eternal-pose/starter/react/src/providers/fake/FakeMapAdapter.ts`
- Modify: `plugins/eternal-pose/starter/react/src/main.tsx`
- Modify: `plugins/eternal-pose/starter/react/.env.example`
- Modify: `plugins/eternal-pose/starter/react/README.md`

**Interfaces:**

- `assertMapVisualProfile(profile: MapVisualProfile): void` validates the profile against deterministic marker and route semantic fixtures before provider construction.

```ts
export interface MapMarkerVisual {
  title: string;
  className: string;
  label: string;
  parts: readonly MapMarkerPart[];
  fallback: { fill: string; stroke: string; text: string };
}

export interface MapRouteVisual {
  stroke: string;
  opacity: number;
  width: number;
  casing?: { stroke: string; opacity: number; width: number };
  dash?: number[];
}

export interface MapRoutePresentation {
  edgeId: string;
  path: Coordinates[];
  tone: "default" | "selected" | "unavailable";
  source: RouteEdge["source"];
  certainty: RouteEdge["certainty"];
  mode: RouteEdge["mode"];
}

export interface MapVisualProfile {
  id: string;
  basemap: {
    mode: "neutral" | "topographic" | "flat" | "technical" | "coastal" | "subdued";
    density: "low" | "medium" | "high";
    contrast: "soft" | "standard" | "high";
    poi: "minimal" | "standard";
  };
  marker(place: MapPlacePresentation, index: number): MapMarkerVisual;
  userLocation(): MapMarkerVisual;
  route(route: MapRoutePresentation): MapRouteVisual;
}

export interface GoogleMapsConfigInput {
  apiKey?: string;
  mapId?: string;
  development: boolean;
  profile: MapVisualProfile;
}
```

- [ ] **Step 1: Write profile validation and provider tests**

First assert `buildMapPresentation` preserves each edge's `source`, `certainty`, and `mode` alongside its tone/path without changing owner IDs. Assert profile results have finite opacity in `[0,1]`, positive route/casing widths, finite non-negative dash values, and nonblank colors/classes/labels for a matrix covering every tone plus manual/provider/recomposed, confirmed/suggested/candidate/unverified, and route modes. In Google tests assert:

- a trimmed `VITE_GOOGLE_MAP_ID` is passed to `google.maps.Map`;
- absent map ID uses `DEMO_MAP_ID` only when `development: true`;
- production without a map ID uses the neutral map and classic marker fallback;
- advanced marker content uses profile class/label, not hard-coded `map-marker` markup;
- selected/default/recomposed/uncertain route style, casing, and dash come from the profile;
- unsupported dash/casing gracefully drops that effect without hiding the route;
- configuration caching rejects a different API key, map ID, or profile ID after initialization.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm --prefix plugins/eternal-pose/starter/react test -- src/controllers/map-visual-profile.test.ts src/providers/google/google-provider.test.ts`

Expected: FAIL on the new config/profile assertions.

- [ ] **Step 3: Implement profile-driven overlays**

Extend core's provider-neutral route presentation with required `source`, `certainty`, and `mode` fields populated from the effective edge. Construct marker DOM from the ordered `MapMarkerVisual.parts` inside the provider so recipes control marker structure without receiving the Google runtime. Resolve each overlay through `profile.route(route)`. Extend `GoogleMapsRuntime`/loader with classic `google.maps.Marker` and add that fallback for production without a map ID; it uses the profile's fallback colors and label. Draw route casing before the route stroke and remove both polylines/listeners during rerender/destroy. Keep semantic owner IDs and event payloads unchanged.

- [ ] **Step 4: Wire environment configuration at startup**

Read and trim `VITE_GOOGLE_MAP_ID` in `main.tsx`, call `assertMapVisualProfile(presentation.mapProfile)`, then pass `import.meta.env.DEV`, the selected profile, and the optional ID to `configureGoogleMaps`. Add this documented optional entry:

```dotenv
# Optional Cloud-configured Google map style. Development falls back to DEMO_MAP_ID.
VITE_GOOGLE_MAP_ID=
```

Never place a real or shared production map ID in source, tests, docs, or generated fixtures.

- [ ] **Step 5: Run provider, boundary, and starter checks**

Run:

```bash
npm --prefix plugins/eternal-pose/starter/react test -- src/providers/google/google-provider.test.ts src/providers/provider-boundaries.test.ts
npm --workspace @laugh-tale-island/core test -- map-presentation.test.ts exports.test.ts
npm --workspace @laugh-tale-island/core run type-check
npm --prefix plugins/eternal-pose/starter/react run check
```

Expected: PASS; map/list owner semantics and persistent mount counts remain unchanged.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/provider-data.ts packages/core/src/map-presentation.ts packages/core/tests/map-presentation.test.ts packages/core/tests/exports.test.ts plugins/eternal-pose/starter/react/src/controllers plugins/eternal-pose/starter/react/src/providers plugins/eternal-pose/starter/react/src/main.tsx plugins/eternal-pose/starter/react/.env.example plugins/eternal-pose/starter/react/README.md
git commit -m "feat: inject presentation-specific map visuals"
```

---

### Task 5: Build the complete Field Atlas recipe (TDD + browser review)

**Files:**
- Create: `plugins/eternal-pose/recipes-v2/field-atlas/recipe.json`
- Create: `plugins/eternal-pose/recipes-v2/field-atlas/README.md`
- Create: `plugins/eternal-pose/recipes-v2/field-atlas/presentation/index.ts`
- Create: `plugins/eternal-pose/recipes-v2/field-atlas/presentation/theme-map-profile.ts`
- Create: `plugins/eternal-pose/recipes-v2/field-atlas/presentation/home/FieldAtlasHome.tsx`
- Create: `plugins/eternal-pose/recipes-v2/field-atlas/presentation/experience/FieldAtlasExperience.tsx`
- Create: `plugins/eternal-pose/recipes-v2/field-atlas/presentation/components/AtlasMapSurface.tsx`
- Create: `plugins/eternal-pose/recipes-v2/field-atlas/presentation/components/AtlasTimeline.tsx`
- Create: `plugins/eternal-pose/recipes-v2/field-atlas/presentation/components/AtlasDecisions.tsx`
- Create: `plugins/eternal-pose/recipes-v2/field-atlas/presentation/components/AtlasUtilityPanels.tsx`
- Create: `plugins/eternal-pose/recipes-v2/field-atlas/presentation/components/AtlasStates.tsx`
- Create: `plugins/eternal-pose/recipes-v2/field-atlas/presentation/styles/index.css`
- Create: `plugins/eternal-pose/recipes-v2/field-atlas/presentation/styles/tokens.css`
- Create: `plugins/eternal-pose/recipes-v2/field-atlas/presentation/styles/layout.css`
- Create: `plugins/eternal-pose/recipes-v2/field-atlas/presentation/styles/components.css`
- Create: `plugins/eternal-pose/recipes-v2/field-atlas/presentation/styles/accessibility.css`
- Create: `plugins/eternal-pose/recipes-v2/field-atlas/provider-guides/google-map-style.json`
- Test: `tests/generation/field-atlas.test.ts`
- Create review record: `docs/theme-reviews/field-atlas.md`

**Interfaces:**
- `presentation/index.ts` exports `presentation satisfies TripPresentation` and no other public contract.
- `theme-map-profile.ts` exports `fieldAtlasMapProfile satisfies MapVisualProfile`.
- Geometry: mobile header `72/148`, collapsed sheet `128`, minimum map gap `24`, desktop breakpoint `768`.

- [ ] **Step 1: Write the failing Field Atlas contract test**

Assert schema 2, system-font policy, exact view exports, complete states, no remote assets/fonts, and distinctive structural hooks:

```ts
expect(source).toMatch(/atlas-index/);
expect(source).toMatch(/atlas-legend/);
expect(source).toMatch(/route-band/);
expect(source).toMatch(/stop-number/);
expect(source).not.toMatch(/scrapbook|torn|stamp|script-font/i);
```

Render Home, Experience, Setup Required, Loading, and Fatal Error against synthetic models. Assert a real map region, day navigation, timeline, reservations, tasks, candidate decision, route retry, home return, current/selected semantics, and all three sheet snaps are reachable.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- tests/generation/field-atlas.test.ts`

Expected: FAIL because the recipe directory does not exist.

- [ ] **Step 3: Author the Field Atlas presentation**

Implement the approved visual world, not a recolor of the transitional presentation:

- Home is an atlas folio with a dominant route overview, indexed day grid, readiness facts, and compact reservation ledger.
- Experience uses a map grid, fold-out index navigation, numbered stops, coordinate-like metadata, decisive route bands, and an asymmetrical legend/timeline relationship.
- Candidate, shopping, task, reservation, loading, setup, map-error, and fatal states use the same rule/index language.
- Mobile keeps the persistent map and three-snap detail surface. Desktop uses a fixed atlas index beside the map and a bounded details rail without hiding attribution.
- Use mineral/topographic neutral colors, strong rules, readable product typography, and local CSS only. Do not use faux paper aging, warm beige card grids, random rotations, gradients, backdrop blur, or decorative page-turn motion.
- Map markers are indexed tokens; selected and completed states differ by shape/rule as well as color. Route casing and uncertain-route dash remain legible in grayscale.

- [ ] **Step 4: Document customization and anti-patterns**

The README must document token, component, presentation, and full-UI replacement; map profile and optional Cloud guide; `320/390/430/768/1024/1440` behavior; focus, forced colors, 200% zoom, reduced motion, and 44px targets; exact anti-patterns; and that no npm theme dependency/runtime selector exists.

- [ ] **Step 5: Compose and run the Field Atlas consumer**

Use the internal catalog-root option to create `tmp/field-atlas-consumer`, then stage local package tarballs into it. Run:

```bash
npm --prefix tmp/field-atlas-consumer run check
npm --prefix tmp/field-atlas-consumer run test:e2e
```

Expected: unit, type, lint, build, and all mobile E2E tests PASS with external requests blocked.

- [ ] **Step 6: Inspect in the in-app browser at all required states**

Open the local composed consumer and inspect Home, default Experience, expanded Experience, candidate, reservation, task, setup-required, loading, map-error, and fatal-error states at `320`, `390`, `430`, `768`, `1024`, and `1440` CSS pixels. Also inspect 200% text zoom, keyboard-only traversal, `prefers-reduced-motion`, and forced colors. Record defects and resolutions in `docs/theme-reviews/field-atlas.md`; do not accept screenshots with overflow, obscured attribution, generic cards, clipped copy, or palette-only identity.

- [ ] **Step 7: Record the authored-world gate**

The review record must explicitly confirm composition and map grammar differences plus at least four of typography/density, component language, icon/status language, motion, and content framing. Include a grayscale capture and an accent-substitution capture proving the theme remains recognizable. Record that no NPS, Felt, Mapbox, or other reference asset/trade dress was copied.

- [ ] **Step 8: Run focused and root regressions**

Run:

```bash
npm test -- tests/generation/recipe-v2.test.ts tests/generation/field-atlas.test.ts
npm --prefix plugins/eternal-pose/starter/react run check
npm run type-check
npm run lint
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add plugins/eternal-pose/recipes-v2/field-atlas tests/generation/field-atlas.test.ts docs/theme-reviews/field-atlas.md
git commit -m "feat: author the Field Atlas presentation"
```

---

### Task 6: Add a reusable internal composition and contract-test harness

**Files:**
- Modify: `scripts/stage-starter-consumer.mjs`
- Modify: `tests/scripts/stage-starter-consumer.test.ts`
- Create: `plugins/eternal-pose/starter/react/tests/e2e/presentation-contract.spec.ts`
- Create: `plugins/eternal-pose/starter/react/tests/e2e/contract-driver.ts`
- Modify: `plugins/eternal-pose/starter/react/playwright.config.ts`
- Modify: `package.json`

**Interfaces:**
- `stageStarterConsumer({ install, outDir, recipe?, recipeCatalogRoot? })`
- Root script `test:recipes:internal` stages the requested construction recipe and runs its starter check and Playwright contract suite.
- `ETERNAL_POSE_RECIPE_UNDER_TEST` is test-process metadata only; it is never read by generated runtime code.

- [ ] **Step 1: Write failing staging tests**

Assert that staging `field-atlas` through `recipes-v2` composes before package-tarball rewriting, records schema 2, contains only Field Atlas presentation files, contains no catalog directory, and preserves the existing no-`node_modules` copy guarantee.

- [ ] **Step 2: Run the staging test and confirm RED**

Run: `npm test -- tests/scripts/stage-starter-consumer.test.ts`

Expected: FAIL because the staging API has no recipe parameters.

- [ ] **Step 3: Implement one packaging path**

Refactor `stageStarterConsumer` so no-recipe staging keeps copying the public starter, while explicit recipe staging calls `createTripProject` with the internal root. Pack workspace packages once per invocation, rewrite the composed manifest to local tarballs, remove the copied lockfile, and install only after composition succeeds.

- [ ] **Step 4: Add presentation-neutral Playwright helpers**

The driver uses stable semantic ownership attributes provided by bundled presentations to exercise home entry, day selection, map/list focus, route retry, candidate preview/commit/cancel, location start/recenter/stop, reservations, tasks, all sheet snaps, and return home. It must not select by recipe class names, English/Chinese marketing copy, or visual coordinates.

- [ ] **Step 5: Run the internal Field Atlas gate**

Run:

```bash
npm run test:recipes:internal -- --recipe field-atlas
```

Expected: the composed consumer passes `check` and the shared Playwright contract at every configured viewport.

- [ ] **Step 6: Commit**

```bash
git add scripts/stage-starter-consumer.mjs tests/scripts/stage-starter-consumer.test.ts plugins/eternal-pose/starter/react/tests/e2e package.json plugins/eternal-pose/starter/react/playwright.config.ts
git commit -m "test: add the authored presentation harness"
```

---

## Phase 1 Verification

- [ ] Run the public catalog regression suite:

```bash
npm test -- tests/generation/recipes.test.ts tests/generation/create-real-starter.test.ts tests/scripts/create-trip-project.test.ts
```

- [ ] Run package and starter gates:

```bash
npm run test:packages
npm run type-check:packages
npm --prefix plugins/eternal-pose/starter/react run check
```

- [ ] Run the internal Field Atlas gate:

```bash
npm run test:recipes:internal -- --recipe field-atlas
```

- [ ] Confirm public documentation and CLI output still name only the old supported catalog, while `plugins/eternal-pose/recipes-v2/field-atlas` is reachable only through explicit test/internal APIs.

- [ ] Confirm `git status --short` contains only intended tracked Phase 1 changes plus the pre-existing untracked user files.

- [ ] Commit any verification-only fixes in focused commits; do not squash away the red/green task boundaries before review.
