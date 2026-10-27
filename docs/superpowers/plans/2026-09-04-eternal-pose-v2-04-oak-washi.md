# Eternal Pose v2 Phase 04: Tokyo / Oak & Washi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the one canonical Tokyo / Oak & Washi presentation so its Home, active Experience, map language, states, accessibility, and responsive behavior reach the approved benchmark quality without embedding Tokyo-specific truth.

**Architecture:** The sole editable product source is `plugins/eternal-pose/recipes-v2/oak-washi/presentation`. It consumes the frozen Phase 03 semantic models/actions/bindings and provides five view components, one provider-neutral map profile, and presentation-owned itinerary-marker and user-location content factories. The published testing package may own the approved pure Oak case catalog and an injection-based render helper, but imports no plugin/recipe and contains no copied presentation; recipe-aware browser composition stays in the repository-root harness. Phase 05 later makes the canonical recipe composition the starter and Tokyo source of record.

**Tech Stack:** React 19.2, TypeScript 5.9, CSS, Lucide React 1.34, Vitest 4, Testing Library, Playwright 1.62, axe-core.

**Spec:** `docs/superpowers/specs/2026-09-04-eternal-pose-v2-oak-washi-flagship-design.md`

## Global Constraints

- Start only after the Phase 03 public seam and alternate-presentation gate are frozen.
- Edit canonical recipe source only. Do not hand-copy repairs into starter or `examples/tokyo`; Phase 05 owns mechanical composition.
- Use no wood/paper grain, gradient, glass effect, pastel stop-kind card stack, nested generic cards, decorative state stamp, decorative venue photography, remote font, emoji icon, or page-load spectacle.
- Use only semantic data supplied by `TripPresentationV2`. Never derive timeline role/index, current/next, route validity, camera policy, provider truth, navigation availability, place identity, or opening state in presentation code.
- UI copy comes only from a complete local typed catalog selected by authored Trip locale. Runtime must not read browser locale or silently mix languages.
- All iconography is local Lucide: 18px/1.75px controls and 10px type-badge glyphs. Icon-only controls have localized names and 44px targets.
- CSS reference dimensions may grow for 200-percent text. Copy and controls take precedence over pixel preservation.
- The first benchmark comparison is manual quality approval, not a cross-project screenshot diff. Once approved, Oak goldens use `maxDiffPixelRatio <= 0.002`.
- `packages/testing/src/fixtures/oak-washi-visual-cases.ts` is the one approved Oak-specific, provider-neutral executable catalog required by the spec; `packages/testing/src/visual/render-oak-washi-case.ts` may consume an injected `TripPresentationV2`. Neither file nor any other published testing source may import a plugin/recipe, copy Oak presentation code, contain Tokyo/private facts, or add a dependency beyond core/react/adapters and existing test-runtime peers. Recipe-aware fixture assembly stays under root `tests/fixtures/oak-washi/**`.

---

### Task 1: Establish the canonical recipe and typed visual foundation

**Files:**
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/README.md`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/recipe.json`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/provider-guides/google-map-style.json`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.ts`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/schema.ts`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog-schema.json`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/en.json`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/zh-Hant.json`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/resolve-copy.ts`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.ts`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles/index.css`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles/tokens.css`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles/layers.css`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles/layout.css`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles/components.css`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles/states.css`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles/accessibility.css`
- Create: `tests/generation/oak-washi-foundation.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Modify: `eslint.config.js`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: frozen `TripPresentationV2` and recipe schema 2.
- Produces: materialized `locale`/`catalog`, `documentMetadataCopy`, plus the canonical entry shape that ultimately exports `presentation`, `oakWashiMapVisualProfile`, `createOakWashiMarkerContent`, and `createOakWashiUserLocationContent`.

- [ ] **Step 1: Write a failing canonical-file and token test**

Assert the exact required foundation paths, the entry's concrete `locale`/`catalog` exports, no symlink/path escape, one CSS import graph, complete copy-source identity (including every metadata key), and these literal semantic tokens. Do not require or stub a map/view export before its owning task; each later owning test adds its export assertion.

```css
:root {
  --oak-canvas: #f6f2ea;
  --oak-surface: #fbf9f5;
  --oak-surface-muted: #f2ede4;
  --oak-surface-strong: #fffdf9;
  --oak-ink: #352f2a;
  --oak-ink-muted: #766e65;
  --oak-rule: #d8d0c4;
  --oak-route-teal: #6f8f8c;
  --oak-accent: #b86f4b;
  --oak-accent-surface: #f2e3d9;
  --oak-warning: #9a7338;
  --oak-focus: #8f5036;
  --oak-map-surface: #e8e2d8;
}
```

Reject `url(` font/texture imports, gradients, backdrop filters, emoji ranges, a second icon package, and generic stop-kind color tokens.

```bash
npm test -- tests/generation/oak-washi-foundation.test.ts
```

Expected: FAIL because `oak-washi` is absent.

- [ ] **Step 2: Create the recipe manifest**

Declare `id: "oak-washi"`, presentation root/entry/styles/assets, map profile, Google guide, motion policy, system-font policy, supported features, viewports `[320,390,430,768,1024,1440]`, and every required screenshot case. Declare the copy inputs by exact contained relative path: `copy/catalog-schema.json`, reference catalogs `copy/en.json` and `copy/zh-Hant.json`, typed resolver `copy/resolve-copy.ts`, and materialized output `copy/catalog.ts`; reject extra reference entries, path escape, or overlap between generator-only inputs and the materialized output. Do not assign a separate marketing version; `sourceVersion` comes from generator/plugin composition in Phase 05.

- [ ] **Step 3: Enable root recipe/TSX verification and implement the token/layer systems**

Install the exact root-only development dependencies needed to compile and exercise canonical recipe JSX before a generated project exists:

```bash
npm install --save-dev --save-exact @testing-library/jest-dom@7.0.1 @testing-library/react@16.3.2 @testing-library/user-event@14.6.6 @types/react@19.2.18 @types/react-dom@19.2.5 jsdom@30.0.1 lucide-react@1.34.0 motion@13.1.1 react@19.2.8 react-dom@19.2.8
```

Set root TypeScript to `jsx: "react-jsx"` and include both `.ts` and `.tsx` under `tests/**` and `plugins/eternal-pose/recipes-v2/**`, along with the root config files. Extend the typed ESLint file matcher to the same recipe/test `.ts`/`.tsx` sets. Change only the root Vitest unit project's include glob from `tests/**/*.test.ts` to `tests/**/*.test.{ts,tsx}`; keep package-building serialization and every existing exclusion unchanged, and do not include Playwright `*.spec.ts` files. Every root DOM or component test declares jsdom with Vitest's per-file environment annotation so package-building tests remain Node-only.

Use platform UI font first, with locale class stacks adding Noto Sans TC or Noto Sans JP only as locally available fallbacks. Define named layers in ascending order for map content, routes, markers, legal attribution, app map controls, header, sheet, and modal. Define focus rings, safe-area variables, and motion values `220ms` expand/sheet, `160ms` collapse, `cubic-bezier(0.22, 1, 0.36, 1)`.

- [ ] **Step 4: Define and exhaustively validate copy keys**

Create one `OakWashiCopy` interface covering Home, Experience, role/type labels, timing certainty, composable status, routes, provider states, opening-hours states, location, persistence, setup/loading/fatal, candidate, progress, navigation, accessible names, and this exact metadata branch:

```ts
export interface OakWashiMetadataCopy {
  productName: string;
  setupTitle: string;
  setupDescription: string;
}
```

`OakWashiCopy.metadata` is exactly `OakWashiMetadataCopy`. Make `catalog-schema.json` a closed, Node-readable schema for that complete recursively string-valued object: every object has `additionalProperties: false`, every key is required, and no fallback/default keyword may manufacture copy. The English JSON source uses `Eternal Pose`, `Set up your trip`, and `Add a valid trip to begin planning.`; the Traditional Chinese JSON source uses `Eternal Pose`, `設定你的旅程`, and `加入有效的旅程資料即可開始規劃。` in the same key order. Enable `resolveJsonModule`; in `resolve-copy.ts`, import both JSON values with import attributes and bind each through `satisfies OakWashiCopy` with no cast. `resolveOakWashiCopy(locale)` selects exact tag, then `zh-Hant-*`/language reference, and throws for unsupported locale during generation/validation rather than reading navigator language.

Every visible component and the app metadata hook import only the named `locale` and `catalog` exports from `copy/catalog.ts`; none imports `en.json`, `zh-Hant.json`, `catalog-schema.json`, or `resolve-copy.ts`. Commit `catalog.ts` as the deterministic self-contained `zh-Hant-TW` materialization used by the no-content starter and Tokyo fixture, with no import back to a reference catalog. The canonical presentation entry re-exports `locale` and `catalog` and defines `documentMetadataCopy = catalog.metadata` for the app-local metadata hook without adding any of them to the package-level `TripPresentationV2` contract. The foundation test requires reference identity between `documentMetadataCopy` and `catalog.metadata`, enumerates the complete sorted key-path set, validates both JSON sources against the closed schema, asserts both source catalogs have exactly that set, verifies the three exact localized metadata values in each source, and compares the complete materialized catalog bytes/object to the resolver's `zh-Hant-TW` output. It also materializes English and proves its entire object, including `metadata`, is source-identical to `en.json`; no metadata fallback or browser-language substitution is permitted. It reads the source JSON and schema through `fs` as a plain Node smoke too, proving Phase 05 can consume them without importing TypeScript. Phase 05 treats the two JSON references, schema, and typed resolver as generator inputs and atomically replaces only `catalog.ts` when another authored locale is selected.

- [ ] **Step 5: Run foundation gates**

```bash
npm test -- tests/generation/oak-washi-foundation.test.ts
npm run type-check
npm run lint
```

Expected: PASS with complete catalogs and no forbidden treatment.

- [ ] **Step 6: Commit the canonical foundation**

```bash
git add plugins/eternal-pose/recipes-v2/oak-washi tests/generation/oak-washi-foundation.test.ts package.json package-lock.json tsconfig.json eslint.config.js vitest.config.ts
git diff --cached --check
git commit -m "feat(recipe): establish Oak and Washi foundations"
```

---

### Task 2: Implement the map profile and both presentation-owned map content factories

**Files:**
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/map/oak-washi-map-profile.ts`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/map/create-oak-washi-marker-content.ts`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/map/create-oak-washi-user-location-content.ts`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/map/OakWashiMapSurface.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/map/OakWashiMapControls.tsx`
- Create: `tests/fixtures/oak-washi/map-content-cases.ts`
- Create: `tests/generation/oak-washi-map.test.ts`
- Create: `tests/generation/oak-washi-map-backends.test.ts`
- Modify: `packages/core/tests/map-presentation.test.ts`
- Modify: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.ts`

**Interfaces:**
- Consumes: `MapVisualProfile`, `MarkerDescriptor`, `MarkerContentFactory`, `UserLocationDescriptor`, `UserLocationContentFactory`, and the provider-neutral Phase 01 map conformance runner exported by `@laugh-tale-island/testing`.
- Produces: `oakWashiMapVisualProfile`, `createOakWashiMarkerContent`, `createOakWashiUserLocationContent`, and `oakWashiMapBindings`, each with deterministic create/update/dispose semantics where applicable. Task 6 spreads the exact binding object into the complete canonical `TripPresentationV2`.

- [ ] **Step 1: Add failing map-profile assertions**

Assert basemap guidance: geometry `#EEE8DE`, label `#5E574F` with stroke `#F8F4ED`, water `#D9E2DF`, parks `#E3E6D8`, roads `#FAF7F1`, simplified POIs, legible stations, default controls disabled, and legal attribution unobscured. Assert route styles exactly:

- transit `#6F8F8C`, solid, 4px/0.42 ordinary and 7px/1 selected;
- walking `#B86F4B` circles, 12px cadence, scale 2.2/0.55 ordinary and 3/1 selected, no base stroke;
- driving `#57514C`, solid, 4px/0.42 ordinary and 7px/1 selected;
- flight `#7F776F`, 14px dash symbols, 2px/0.5 ordinary and 3px/0.9 selected, no base stroke;
- unknown/unavailable has no renderable geometry style.

```bash
npm test -- tests/generation/oak-washi-map.test.ts
```

Expected: FAIL before profile creation.

- [ ] **Step 2: Prove `markerMode: "none"` is filtered before the factory**

First extend `packages/core/tests/map-presentation.test.ts` with an authored owner whose semantic `markerMode` is `"none"`; assert `buildMapPresentation` omits it while preserving the surrounding owner order. In `oak-washi-map.test.ts`, pass that projected result through a spy around `createOakWashiMarkerContent` and assert the spy is never called for the omitted owner. Also add a compile-time `@ts-expect-error` showing that an object with `markerMode: "none"` cannot satisfy `MarkerDescriptor`. The Oak factory itself must have no `none` branch, sentinel return, or empty-content handle.

- [ ] **Step 3: Add failing itinerary-marker and user-location lifecycle cases**

Cover numbered primary, numbered candidate suffix, base/lodging, selected/current/next/viewing/skipped/completed combinations, long accessible name, forced colors, grayscale, and update from unselected to selected. Require a 44px hit target around a 32px teardrop, counter-rotated ordinal, separate 16px type badge with 10px Lucide glyph, transform-only selected scale, and `aria-pressed`.

For user location require one non-interactive, `aria-hidden="true"`, 40px square host with no text or coordinate serialization: a centered 28px `rgba(111, 143, 140, 0.20)` halo and a 14px `#6F8F8C` circular core with a 3px `#FFFDF9` ring and 1px `#352F2A` outline. It has `pointer-events: none`, no pulse/animation, no provider class, and a forced-colors rule using system colors while retaining the ring/core distinction. Cover create, multiple coordinate updates on the same element, and dispose exactly once.

- [ ] **Step 4: Implement both presentation-owned factories**

The itinerary-marker factory creates local DOM, updates all text/classes/ARIA in place, and removes listeners/content on dispose. It never reads a Google type. Candidate preserves parent ordinal plus stable alphabetic suffix; base has lodging glyph and no ordinal/type badge. Accessible name contains ordinal when present, kind, timing, title, and explicit candidate/skipped wording.

The user-location factory creates exactly the inert visual described in Step 3, retains the same element through coordinate updates, never writes raw coordinates into DOM or accessible text, and removes its owned DOM on dispose. Neither factory imports an adapter/provider type. Export both from the canonical entry and create one `oakWashiMapBindings` object that `satisfies Pick<TripPresentationV2, "mapVisualProfile" | "createMarkerContent" | "createUserLocationContent">`; do not stub the five view components or a partial `presentation` object.

- [ ] **Step 5: Prove backend DOM and lifecycle identity**

In the root `oak-washi-map-backends.test.ts`, invoke the generic map conformance runner from `@laugh-tale-island/testing` against the AdvancedMarkerElement and OverlayView fake runtimes, supplying the two canonical Oak factories and root-only case data. Serialize the recipe-owned subtree before provider wrapping and require byte-identical itinerary markup/classes/text/ARIA, selection updates, hit geometry, focus, click behavior, and cleanup. For user location, require both backends to mount the exact factory-owned element instance, call `update` before each coordinate move, preserve the computed halo/core geometry, and call `dispose` once on clear/remount/destroy. Provider wrapper/collision metadata may differ; recipe-owned DOM may not. Assert neither backend creates a fallback marker or location dot.

- [ ] **Step 6: Implement map surface and app controls**

Register the map viewport binding, render provider/loading/unavailable status without covering attribution, and render only capability-gated full-day, location, and recenter controls. No Google default control clone or provider object enters JSX.

- [ ] **Step 7: Run map gates and commit**

```bash
npm test --workspace @laugh-tale-island/core -- tests/map-presentation.test.ts
npm test -- tests/generation/oak-washi-map.test.ts tests/generation/oak-washi-map-backends.test.ts
npm run type-check
```

Expected: PASS; semantic `none` owners never reach the factory, both content factories pass both backends, and every itinerary-marker/user-location lifecycle is balanced.

```bash
git add plugins/eternal-pose/recipes-v2/oak-washi/presentation/map plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.ts packages/core/tests/map-presentation.test.ts tests/fixtures/oak-washi/map-content-cases.ts tests/generation/oak-washi-map.test.ts tests/generation/oak-washi-map-backends.test.ts
git diff --cached --check
git commit -m "feat(recipe): build the Oak and Washi map language"
```

---

### Task 3: Build the active Experience shell and responsive choreography

**Files:**
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/experience/OakWashiExperience.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/experience/FloatingDayHeader.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/experience/DayRail.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/experience/ItinerarySheet.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/experience/CollapsedOwnerSummary.tsx`
- Create: `tests/generation/oak-washi-experience.test.tsx`
- Create: `tests/generation/oak-washi-choreography.test.tsx`
- Modify: recipe CSS files
- Modify: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.ts`

**Interfaces:**
- Consumes: `ExperienceViewProps`, `model.header`, `model.itinerary`, package sheet/layout/focus bindings, and camera/choreography state already resolved in the model.
- Produces: `presentation.Experience` with map-first mobile and bounded-rail desktop composition.

- [ ] **Step 1: Add failing structural/geometry tests**

At `390x844`, require full-viewport map, header inset 12px, full-width sheet, collapsed `104px + safe bottom`, half `clamp(300px,46dvh,430px)`, and expanded ceiling below measured header. At height below `43.75rem`, require half `43dvh` with minimum `min(17rem, expanded)`. At widths `>=45rem`, require full map plus centered header rail about `32.5rem` and sheet rail about `35rem`, not a dashboard. Assert each responsive measurement is sent through `bindings.sheet.setMeasuredGeometry`; package source must contain none of these physical values.

```bash
npm test -- tests/generation/oak-washi-experience.test.tsx tests/generation/oak-washi-choreography.test.tsx
```

Expected: FAIL because the shell is absent.

- [ ] **Step 2: Implement the floating header**

Render one ellipsized trip/day title line, authoritative local time, optional authored `clockPlaceLabel` hidden only below `22rem`, capability-gated controls, and an expandable rail for any day count. Use 16px radius, restrained shadow, measured occlusion registration, logical DOM order, `aria-current`, and inert collapsed content. Drive open/close only through `actions.setHeaderExpanded`; apply `model.header.transition.id/phase` to the semantic transition state and call `actions.settleHeaderTransition(id)` only when that exact transition finishes.

- [ ] **Step 3: Implement all sheet projections**

Use the package binding props directly. The 44px handle band receives the generic drag-band props and contains a 36x4 grip plus a separately named 44x44 toggle; the button does not receive pointer-drag props. Half/expanded use a sticky 52px heading whose localized itinerary label interpolates the exact `model.itinerary.primaryCount`, plus at most two capability-backed actions/badges; never duplicate the day title. Collapsed looks up only `model.itinerary.collapsedOwnerId` in the supplied timeline/routes and renders that one actionable owner with semantic mark, time/type, one-line title, and optional 44px navigation action; it does not choose another fallback. Candidate and disclosure close paths call `bindings.focus.restoreTrigger` after committed close state, passing `model.itinerary.focusFallback` only when it is non-null; the recipe never derives an active node/route fallback.

- [ ] **Step 4: Bind coordinated motion without new policy**

CSS reads binding/model state for header clearance, sheet ceiling, dragging, snap, and reduced motion. Header, controls, sheet, and registered map occlusion share the 220/160ms values. Pointer ownership remains map pinch, sheet handle drag, and list scroll; presentation code does not settle a snap or execute a camera intent.

- [ ] **Step 5: Test transition interruption and collisions**

Exercise expand/collapse reversal mid-flight, drag during snap, zero-duration drag tracking, reopening header while sheet expanded, asymmetric safe areas, mobile toolbar change, and map repaint/remount. Assert no header/sheet/control/attribution collision and the sheet remains above map repaint.

- [ ] **Step 6: Run Experience gates and commit**

```bash
npm test -- tests/generation/oak-washi-experience.test.tsx tests/generation/oak-washi-choreography.test.tsx
npm run type-check
npm run lint
```

Expected: PASS at all required viewport and motion states.

```bash
git add plugins/eternal-pose/recipes-v2/oak-washi/presentation/experience plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.ts tests/generation/oak-washi-experience.test.tsx tests/generation/oak-washi-choreography.test.tsx
git diff --cached --check
git commit -m "feat(recipe): compose the Oak and Washi experience"
```

---

### Task 4: Implement truthful timeline role grammar and progressive detail

**Files:**
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/timeline/ItineraryTimeline.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/timeline/PrimaryRow.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/timeline/BaseRow.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/timeline/JourneyRow.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/timeline/RouteConnectorRow.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/timeline/TaskRow.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/timeline/LogisticsGroupRow.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/timeline/SemanticMark.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/timeline/StatusRegion.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/details/OwnerDetails.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/details/CandidateDecision.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/details/ShoppingProgress.tsx`
- Create: `tests/generation/oak-washi-timeline.test.tsx`
- Create: `tests/fixtures/oak-washi/row-cases.ts`
- Create: `tests/generation/oak-washi-row-cases.test.tsx`
- Modify: recipe CSS files

**Interfaces:**
- Consumes: already-projected timeline entries, independent state facts, capabilities, actions, and owner/focus bindings.
- Produces: one physical row grammar per semantic role without changing model truth.

- [ ] **Step 1: Add failing exhaustive role and row-case tests**

Define the full root-only matrix in `tests/fixtures/oak-washi/row-cases.ts`, then consume every named case in the real `oak-washi-row-cases.test.tsx`; no command may rely on a filter that happens to match zero tests. Render `primary`, `base`, `journey`, `connector`, `task`, and `logistics-group`; fail on an unhandled role. Require primary scan order `time → title → type/context → location or route facts → one status region`. Require title exactly once, only primary gets ordinal, candidate reuses suffixed ordinal, base uses lodging mark, and connectors remain separate edge rows adjacent to destination. Require a logistics group to resolve its exact `titleKey` through the catalog, retain all ordered independently actionable children, and never duplicate them as top-level rows. Exhaustively render synthetic examples of every `TimelineNodeFactsModel` variant, including the complete ordered checklist state and every shopping item title/priority/current status; fail on any dropped authored fact or raw custom-object dump.

```bash
npm test -- tests/generation/oak-washi-timeline.test.tsx tests/generation/oak-washi-row-cases.test.tsx
```

Expected: FAIL before role components exist.

- [ ] **Step 2: Implement compact row geometry**

Primary full row uses 40px semantic mark, flexible selection/content, optional 44px action column, reference minimum height 76px, and 52px timed subcolumn. Use 1px rules and spacing instead of nested cards. At narrow width/200-percent text switch to semantic reflow with no page overflow.

- [ ] **Step 3: Implement independent state phrasing**

Compose current, next, viewing, completed, skipped, candidate, and unresolved into one localized status region while preserving distinct ARIA/data semantics and non-color cues. Unknown timing displays unknown—not Planned or estimated. Unresolved keeps its ordinal/list position, has no navigation control, and explicitly states unverified location.

- [ ] **Step 4: Implement owned detail surfaces**

Show type facts, route detail/retry/external navigation, place/opening facts, candidate preview/cancel/confirm/reopen, shopping progress, task progress, and reservation facts only under their owning selected row/disclosure/dialog. Render type-specific details only from the discriminated `facts` value: authored plan/terminal/cuisine/area/duration and safe custom primitives, full checklist rows with current completion, and full shopping rows with title/priority/current status. Never reconstruct payload truth from `sourceKind`, capability booleans, or `ProgressSummary`. A logistics group resolves its fixed semantic `titleKey` through the validated catalog and passes each child's own `facts` unchanged to the same detail renderer. Loading stays on its owner. Dialog/disclosure refs use Phase 03 focus bindings; absent capabilities render no false action.

- [ ] **Step 5: Cover route and opening-hours matrices**

Render ready walking/transit/driving, flight, unknown, loading, external, unavailable, retry, and authored fallback. Render known-open/known-closed positives plus absent, incomplete, overnight, cross-midnight, and Trip-timezone opening states. Assert no unavailable route receives geometry and no absent hours claim open.

- [ ] **Step 6: Run row gates and commit**

```bash
npm test -- tests/generation/oak-washi-timeline.test.tsx tests/generation/oak-washi-row-cases.test.tsx
npm run type-check
```

Expected: PASS across the exhaustive matrices.

```bash
git add plugins/eternal-pose/recipes-v2/oak-washi/presentation/timeline plugins/eternal-pose/recipes-v2/oak-washi/presentation/details plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles tests/fixtures/oak-washi/row-cases.ts tests/generation/oak-washi-timeline.test.tsx tests/generation/oak-washi-row-cases.test.tsx
git diff --cached --check
git commit -m "feat(recipe): render truthful Oak and Washi itinerary rows"
```

---

### Task 5: Build the canonical Oak & Washi Home

**Files:**
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/home/OakWashiHome.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/home/TripIdentity.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/home/DayIndex.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/home/LodgingSummary.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/home/PreTripTasks.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/home/ReservationSummary.tsx`
- Create: `tests/generation/oak-washi-home.test.tsx`
- Modify: recipe CSS files
- Modify: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.ts`

**Interfaces:**
- Consumes: `HomeViewProps`; effective entry day and every capability are already resolved.
- Produces: `presentation.Home`, an editorial extension of the benchmark language rather than a dashboard.

- [ ] **Step 1: Write Home semantics and omission failures**

Cover zero/progress states, manual/current/upcoming/final effective day supplied by the model, any day count, optional destination/traveler/lodging absent, authored tasks/reservations, memory-only notice, long Latin/CJK titles, and no days (which must never reach the view). Assert the primary entry action calls `openExperience(effectiveEntryDayId)`.

```bash
npm test -- tests/generation/oak-washi-home.test.tsx
```

Expected: FAIL because Home is absent.

- [ ] **Step 2: Implement one editorial mobile column**

Render trip title and authored dates first, optional destination/traveler context only when present, one decisive effective-day entry, optional lodging, pre-trip tasks/real progress, ticket/reservation state, then the complete ordered day list. Use rules, compact hierarchy, and whitespace; do not use KPI tiles or identical bento cards.

- [ ] **Step 3: Implement restrained desktop split**

At desktop, permit one main editorial flow plus one narrow utility column while preserving reading order. Do not make each section a card or duplicate trip/day identity. Ensure a keyboard/screen-reader sequence equivalent to visual reading order.

- [ ] **Step 4: Preserve authored and private truth**

Render authored labels, task titles, reservations, and lodging exactly once. Never infer destination from timezone, traveler from storage, or missing lodging. Apply localized UI framing only; do not translate authored content.

- [ ] **Step 5: Run Home gates and commit**

```bash
npm test -- tests/generation/oak-washi-home.test.tsx
npm run type-check
npm run lint
```

Expected: PASS at `390x844` and `1024x900`, including optional-section removal without blank reserved regions.

```bash
git add plugins/eternal-pose/recipes-v2/oak-washi/presentation/home plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.ts tests/generation/oak-washi-home.test.tsx
git diff --cached --check
git commit -m "feat(recipe): add the canonical Oak and Washi home"
```

---

### Task 6: Complete setup, loading, failure, and degraded treatments

**Files:**
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/states/OakWashiSetupRequired.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/states/OakWashiLoading.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/states/OakWashiFatalError.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/states/InlineProviderState.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/states/PersistenceNotice.tsx`
- Create: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/states/LocationState.tsx`
- Create: `tests/generation/oak-washi-states.test.tsx`
- Modify: recipe CSS/copy files
- Modify: `plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.ts`

**Interfaces:**
- Consumes: `SetupRequiredViewProps`, `LoadingViewProps`, `FatalErrorViewProps`, structured provider/location/persistence models, and capability records.
- Produces: the remaining three top-level views plus complete inline degraded states.

- [ ] **Step 1: Add the failing degraded-state matrix**

Assert distinct output and action sets for invalid/missing trip, missing Google configuration with retained valid itinerary/Home, loader failure, runtime map failure, malformed/implausible route, unresolved place, location denied/unavailable, persistence memory-only, opening-hours absent/uncertain, owner-specific route/place loading, and fatal render/state/provider categories. Missing/invalid Trip alone renders `SetupRequired`; missing credentials and loader/runtime failures render the valid Home or Experience plus inline provider state.

```bash
npm test -- tests/generation/oak-washi-states.test.tsx
```

Expected: FAIL before state components exist.

- [ ] **Step 2: Implement stable top-level states**

Setup shows typed missing/invalid content issues and only safe recovery actions. It never receives provider bootstrap failures. Loading uses a surface- or owner-shaped skeleton with stable geometry, never an isolated spinner replacing content. Fatal Error shows localized category copy and only the retained/retry/Home actions supplied by capabilities; no raw diagnostic appears.

- [ ] **Step 3: Implement inline provider truth**

Map unavailable preserves itinerary; route unavailable preserves authored mode/summary/external navigation; unresolved place preserves row/index without precise pin/navigation; absent hours omits or says unknown; location and persistence notices do not block map/list. Retry renders only when its capability exists and remains on its owning surface/edge.

- [ ] **Step 4: Assemble the complete canonical presentation**

After all five view exports exist, construct `presentation` once in `presentation/index.ts` as a value that `satisfies TripPresentationV2`. Spread `oakWashiMapBindings` without wrapping or recreating its members. Assert in `oak-washi-states.test.tsx` that `presentation.mapVisualProfile`, `presentation.createMarkerContent`, and `presentation.createUserLocationContent` are reference-identical to the three named Oak exports, and that all five view members are concrete components. This is the first task that may export the complete `presentation`; no earlier task creates placeholder views.

- [ ] **Step 5: Assert no mixed language or false fallback**

For `en` and `zh-Hant`, run the presentation test twice with the `copy/catalog.ts` module replaced by each deterministic materialization; this is a test-time module substitution, not a runtime theme/locale switch. Walk every state and fail on a missing key, implicit browser-language text, raw provider message, inferred city, `Planned` for unknown timing, or `walking` for unknown route.

- [ ] **Step 6: Run state gates and commit**

```bash
npm test -- tests/generation/oak-washi-states.test.tsx
npm run type-check
npm run lint
```

Expected: PASS with itinerary retention and exact capability-backed controls.

```bash
git add plugins/eternal-pose/recipes-v2/oak-washi/presentation/states plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.ts tests/generation/oak-washi-states.test.tsx
git diff --cached --check
git commit -m "feat(recipe): finish Oak and Washi runtime states"
```

---

### Task 7: Establish the deterministic Oak catalog, browser, and golden harness

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `packages/testing/src/index.ts`
- Create: `packages/testing/src/fixtures/oak-washi-visual-cases.ts`
- Create: `packages/testing/src/visual/render-oak-washi-case.ts`
- Create: `packages/testing/playwright.config.ts`
- Create: `tests/fixtures/oak-washi/visual-trip.ts`
- Create: `tests/fixtures/oak-washi/provider-states.ts`
- Create: `tests/fixtures/oak-washi/test-presentation.tsx`
- Create: `tests/fixtures/oak-washi/browser/index.html`
- Create: `tests/fixtures/oak-washi/browser/main.tsx`
- Create: `tests/fixtures/oak-washi/browser/OakWashiHarness.tsx`
- Create: `tests/fixtures/oak-washi/browser/vite.config.ts`
- Create: `tests/visual/oak-washi-catalog.test.ts`
- Create: `tests/visual/oak-washi.visual.spec.ts`
- Create: `tests/accessibility/oak-washi-a11y.spec.ts`
- Create: `tests/accessibility/oak-washi-style-contract.spec.ts`
- Create: `tests/packages/oak-washi-harness-boundary.test.ts`
- Create: `docs/theme-reviews/oak-washi/README.md`
- Create: `docs/theme-reviews/oak-washi/fixture-review.json`
- Add: initial reviewed PNGs under `docs/theme-reviews/oak-washi/goldens/`

**Interfaces:**
- Consumes: the canonical recipe presentation plus generic `@laugh-tale-island/testing` fakes, neutral fixture, presentation driver, clock, locale, viewport, and adapter conformance helpers.
- Produces: named testing-package exports `oakWashiVisualCases` (the exact pure 17-case catalog) and `renderOakWashiCase` (the injection-only render helper requiring an explicit `TripPresentationV2` and adapters); a non-published recipe-aware root browser app; deterministic Playwright/axe checks; and the first approved goldens. Published testing source remains free of recipe imports and presentation copies.

- [ ] **Step 1: Add failing catalog and package-boundary tests**

In `oak-washi-catalog.test.ts`, import the catalog from `@laugh-tale-island/testing` and require these IDs with their specified modes/viewports: `home`, `experience-default`, `experience-collapsed-current`, `experience-expanded-dense`, `candidate-open`, `candidate-zoom-200`, `selection-truth`, `route-state-matrix`, `opening-hours-matrix`, `camera-adversarial`, `marker-backends`, `map-error`, `setup-states`, `loading-owned`, `runtime-degraded`, `accessibility-media`, and `desktop-bounded`. Require `320x568`, `390x844`, `430x932`, `768x1024`, `1024x900`, and `1440x1000` coverage exactly where the design assigns them. Assert the published catalog is deeply frozen, contains only IDs/modes/viewport/scenario inputs over the provider-neutral synthetic fixture, and contains no JSX, localized copy, Tokyo fact, coordinate, Place ID, or recipe path.

In `oak-washi-harness-boundary.test.ts`, assert `packages/testing/package.json` has only exact internal runtime edges to core/react/adapters plus its existing external peers/dev tools. Allow exactly the two named Oak package-source files, recursively require their reachable imports to stay within testing/core/react/adapters, and reject imports from `plugins/`, `recipes-v2/`, root fixtures, CSS/assets, or a concrete presentation. Assert every recipe-aware fixture/test-presentation support file is under `tests/fixtures/oak-washi` and excluded from all four package tarballs; the canonical product presentation remains under its recipe path.

```bash
npm test -- tests/visual/oak-washi-catalog.test.ts tests/packages/oak-washi-harness-boundary.test.ts
```

Expected: FAIL because the root catalog and browser harness do not exist; the command must discover both named test files, never pass through a zero-match filter.

- [ ] **Step 2: Install and configure the Phase 04 browser harness**

Install the harness dependencies at the repository root, not in `packages/testing`, with exact versions aligned to the already-pinned starter toolchain:

```bash
npm install --save-dev --save-exact @axe-core/playwright@4.11.0 @playwright/test@1.62.1 @vitejs/plugin-react@6.1.0 vite@8.2.2
npx playwright install chromium
```

Add these exact root scripts:

```json
{
  "test:oak-washi:unit": "vitest run --project unit oak-washi",
  "test:oak-washi:browser": "playwright test --config=packages/testing/playwright.config.ts",
  "test:oak-washi:update-goldens": "playwright test --config=packages/testing/playwright.config.ts tests/visual/oak-washi.visual.spec.ts --update-snapshots"
}
```

Create `packages/testing/playwright.config.ts` with its project-relative `testDir` resolving the root `tests` tree, an explicit match for only the three Oak `*.spec.ts` files, Chromium only, one worker, no retries, `deviceScaleFactor: 1`, reduced motion, stable locale/timezone/color scheme, and a `127.0.0.1:4176` Vite `webServer` using `reuseExistingServer: false`. Put transient output under root `tmp/playwright/oak-washi`; set the committed snapshot template to root `docs/theme-reviews/oak-washi/goldens/{arg}{ext}` and require each snapshot argument to include case ID plus viewport so paths cannot collide. Fail on focused/skipped tests in CI. The Vite config uses `strictPort: true`, root-only aliases, and no proxy or remote asset fallback.

- [ ] **Step 3: Build provider-neutral fixture state in the root recipe harness**

The package catalog derives only scenario inputs from the neutral package fixture without mutating it. Its render helper accepts the catalog case, an injected `TripPresentationV2`, and injected test adapters; it has no default presentation or recipe lookup. Root `visual-trip.ts` adds no Tokyo private facts, `provider-states.ts` composes only typed fake results, and `test-presentation.tsx` is the one recipe-aware boundary that injects the canonical Oak presentation/factories into that helper. `OakWashiHarness.tsx` selects a validated package catalog case from the URL and exposes stable `data-owner-id`, geometry, camera-intent, focus, font, and readiness probes for Playwright; invalid or duplicate case IDs fail loudly.

Cover every role, composable status, candidate lifecycle, progress state, resolved/unresolved place, opening-hours case, route/provider case, camera quarantine case, both marker backends, user-location handle, location state, persistence state, and fatal/setup/loading state. Fix clock, timezone, authored locale, progress, viewport, device scale 1, color mode, and reduced motion. Abort every browser request whose origin is not exactly the harness origin; use the fake map surface and never request Google tiles, fonts, analytics, or another network resource.

- [ ] **Step 4: Add exact geometry, text, ownership, lifecycle, and semantics assertions**

For each case assert relevant token values, font availability, title uniqueness, row slot order, stable owner IDs, camera intent, sheet height, no page overflow, no chrome/attribution collision, correct ARIA, and no false action. The `marker-backends` case must assert itinerary and user-location factory-owned DOM identity/lifecycle across both fake backends. Screenshot comparisons cannot replace these checks. Every Playwright test waits for the explicit harness readiness probe and fails on console errors, page errors, unexpected requests, missing fonts, duplicate IDs, or unsettled motion.

- [ ] **Step 5: Add accessibility gates**

Use `@axe-core/playwright` to run axe WCAG 2.2 A/AA tags with zero violations for every catalog case. Separately assert calculated contrast, 44x44 visible targets, visible focus, logical order, dialog names, inert hidden rail/sheet content, focus restoration, forced-colors non-color cues, reduced motion, asymmetric safe areas, and 200-percent text reflow. The browser spec executes one complete keyboard journey; the manual VoiceOver journey is recorded in Task 8 rather than represented as an automated pass.

- [ ] **Step 6: Capture and review the first goldens**

Run the pinned Playwright build and assert local font fallback availability before capture. Exclude the fake map canvas from visual comparison only where a case does not test map-owned content; mask only named dynamic regions. Generate candidates with:

```bash
npm run test:oak-washi:update-goldens
```

Review the benchmark first and then each generated Oak image. Only accepted images remain under `goldens`; store case, viewport, canonical source commit, Playwright version, Chromium version/revision, font result, PNG SHA-256, reviewer, date, and verdict in `fixture-review.json`. Require exactly one manifest entry per committed PNG and no unreviewed PNG. After this first approval, ordinary runs use `maxDiffPixelRatio: 0.002` and never auto-update.

- [ ] **Step 7: Run the root catalog/browser gates and commit**

```bash
npm run test:oak-washi:unit
npm run test:oak-washi:browser
npm run type-check
npm run lint
npm run type-check:packages
npm run lint:packages
```

Expected: all 17 fixtures pass exact assertions, screenshots, and axe; every initial PNG is explicitly reviewed; the two approved Oak testing modules remain provider-neutral and package-clean, and no recipe-aware import/copy/dependency exists in `packages/testing`.

```bash
git add package.json package-lock.json packages/testing/src/fixtures/oak-washi-visual-cases.ts packages/testing/src/visual/render-oak-washi-case.ts packages/testing/src/index.ts packages/testing/playwright.config.ts tests/fixtures/oak-washi tests/visual/oak-washi-catalog.test.ts tests/visual/oak-washi.visual.spec.ts tests/accessibility/oak-washi-a11y.spec.ts tests/accessibility/oak-washi-style-contract.spec.ts tests/packages/oak-washi-harness-boundary.test.ts docs/theme-reviews/oak-washi
git diff --cached --check
git commit -m "test: establish Oak and Washi visual goldens"
```

---

### Task 8: Run the benchmark-led polish and freeze canonical source

**Files:**
- Modify after findings: canonical Oak presentation files only
- Create: `docs/theme-reviews/oak-washi/design-review.md`
- Create: `docs/theme-reviews/oak-washi/polish-findings.json`
- Modify after approved changes: affected goldens and `fixture-review.json`
- Modify: `tests/generation/oak-washi-foundation.test.ts`
- Modify after a reproduced defect: the exact affected `packages/testing/src/fixtures/oak-washi-visual-cases.ts`, injection helper, root `tests/fixtures/oak-washi/**`, `tests/generation/oak-washi-*.test.{ts,tsx}`, `tests/visual/oak-washi.visual.spec.ts`, or `tests/accessibility/oak-washi-*.spec.ts` file

**Interfaces:**
- Consumes: benchmark `tokyo-trip-map`, the canonical recipe harness, all deterministic fixtures, and the approved design language.
- Produces: product-approved canonical visual source ready for mechanical generator composition.

- [ ] **Step 1: Run benchmark-first review at the primary states**

Compare benchmark then Oak at mobile `390x844` for half/collapsed/expanded Experience, selected primary, route, candidate, unresolved, map loading/error, and at `1024x900` for Home/Experience. Evaluate composition, hierarchy, density, type, rule rhythm, marker identity, route contrast, control placement, shadow/radii, and state clarity. Do not pixel-diff the two products.

- [ ] **Step 2: Log every finding before editing**

Each finding records stable ID, viewport/state, evidence, category (`correctness`, `accessibility`, `optical`, `collision`, `motion`), priority, owning file, and expected verification. Mixed-language, duplicate metadata/title, false state, ownerless state, blocked action, and row-grammar defects are P0 correctness findings.

- [ ] **Step 3: Apply one focused polish batch at a time**

Limit optical changes to measured 2–4px spacing, alignment, shadow, control state, collision, and interruption corrections. After each batch, rerun its semantic/component tests plus impacted screenshots. Never repair only the starter or Tokyo output.

- [ ] **Step 4: Verify responsive and media variants**

Review `320x568`, `430x932`, `768x1024`, `1440x1000`, grayscale, forced colors, reduced motion, and 200-percent text. Confirm narrow/CJK copy reflows; map remains full viewport; desktop stays bounded rails; legal chrome and app controls remain operable.

On the macOS execution host, also use an available Xcode iPhone Simulator Safari as a supplementary touch/safe-area/rubber-band smoke after the deterministic browser gate. Discover the installed device/runtime with `xcrun simctl list devices available`, record the exact simulated model/iOS and any finding in `polish-findings.json`, and reproduce every defect in the deterministic harness before editing. Simulator screenshots are iteration evidence only; Plan 06 still requires the physical iPhone for P0 sign-off.

- [ ] **Step 5: Obtain canonical visual approval**

The product owner records an explicit approval of Oak & Washi as the v2 flagship visual language. Any P0 finding must be fixed and reverified. A non-P0 finding may receive a named post-v2 disposition; it may not be silently dropped. Physical-device certification remains Plan 06.

- [ ] **Step 6: Run the Phase 04 gate**

```bash
npm run test:oak-washi:unit
npm run test:oak-washi:browser
npm run type-check:packages
npm run lint:packages
npm run check
```

Expected: PASS; 17 approved fixture entries exist; all P0 polish findings are verified; canonical source has no forbidden token/treatment/hard-code.

- [ ] **Step 7: Request code/design review and commit the freeze**

Use `superpowers:requesting-code-review`. Reviewer checks every design-system subsection, locale completeness, all view/state exports, provider-neutrality, and no Tokyo-specific truth. Then:

```bash
git add plugins/eternal-pose/recipes-v2/oak-washi packages/testing/src/fixtures/oak-washi-visual-cases.ts packages/testing/src/visual/render-oak-washi-case.ts packages/testing/src/index.ts packages/testing/playwright.config.ts docs/theme-reviews/oak-washi tests/fixtures/oak-washi tests/generation/oak-washi-foundation.test.ts tests/generation/oak-washi-map.test.ts tests/generation/oak-washi-map-backends.test.ts tests/generation/oak-washi-experience.test.tsx tests/generation/oak-washi-choreography.test.tsx tests/generation/oak-washi-timeline.test.tsx tests/generation/oak-washi-row-cases.test.tsx tests/generation/oak-washi-home.test.tsx tests/generation/oak-washi-states.test.tsx tests/visual/oak-washi-catalog.test.ts tests/visual/oak-washi.visual.spec.ts tests/accessibility/oak-washi-a11y.spec.ts tests/accessibility/oak-washi-style-contract.spec.ts tests/packages/oak-washi-harness-boundary.test.ts
git diff --cached --check
git commit -m "feat(recipe): freeze the Oak and Washi flagship"
```

## Phase Gate

Phase 05 may start only after the Task 8 commands pass, the product-owner visual approval is committed, and these scans are clean:

```bash
npm test -- tests/generation/oak-washi-foundation.test.ts tests/packages/oak-washi-harness-boundary.test.ts
npm test --workspace @laugh-tale-island/testing -- tests/boundaries.test.ts
test "$(rg --files packages/testing/src | rg 'oak-washi' | sort)" = $'packages/testing/src/fixtures/oak-washi-visual-cases.ts\npackages/testing/src/visual/render-oak-washi-case.ts'
```

Expected: the dedicated boundary tests' explicit forbidden-token matrices and the exact allowlist assertion pass; the package catalog/helper are provider-neutral, and no recipe import or copied presentation exists in testing. Record the exact canonical tree hash, approved golden manifest hash, reviewer, and phase-gate commit for Phase 05's byte-identity tests.
