# Authored Product Worlds Implementation Plan (Phase 2 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author and prove three complete, compositionally distinct recipe-v2 products—Reset Arcade, Live Journey, and Pocket Instrument—against the shared controller and map-profile contracts from Phase 1.

**Architecture:** Each recipe remains an independent source tree under the implementation-only `plugins/eternal-pose/recipes-v2/` catalog. It exports one `TripPresentation`, owns all markup/CSS/icons/copy, and maps the same semantic controller data into a different hierarchy. The internal staging harness composes one recipe at a time, ensuring generated consumers never contain another world or a runtime selector.

**Tech Stack:** React 19, TypeScript 5.9, local CSS, Lucide icons already present in the starter, Motion 13 only for state-driven interruptible transitions, Vitest, Testing Library, Playwright, in-app browser inspection.

**Spec:** `docs/superpowers/specs/2026-08-27-authored-theme-catalog-design.md`

## Global Constraints

- Complete Phase 1 first. Do not duplicate controller behavior, map adapters, package hooks, progress storage, or provider setup inside a recipe.
- Keep all three recipes under `recipes-v2/`; do not change public selector IDs, docs, defaults, CLI help, or the old `recipes/` directories in this phase.
- A recipe must implement Home, Experience, Setup Required, Loading, Fatal Error, candidate, shopping, reservation, task, route-error, and map-error states before it is considered complete.
- Composition and map grammar must differ from Field Atlas. Every world must differ in at least two additional authored dimensions and pass a grayscale/accent-replacement review.
- Do not share a catch-all visual component library between recipes. Shared types/actions come from controllers; visible components stay recipe-owned so users can replace them locally.
- Keep conventional semantics for buttons, links, checkboxes, selects, dialogs, tabs, and disclosures. Visual novelty may not invent unfamiliar controls for ordinary actions.
- No remote fonts, remote images, data URLs, trademarked product assets, copied screenshots, fake scores, fake system controls, ambient animation, gradients, backdrop blur, or runtime theme code.
- Reservation references stay hidden until an explicit labeled reveal, are cleared when the disclosure/dialog closes, and never appear in screenshots, logs, test names, or accessible labels before reveal.
- At 200% text zoom, all primary facts and controls remain usable without horizontal page overflow. All required viewport, focus, forced-color, reduced-motion, touch-target, safe-area, map attribution, and external-request gates remain mandatory.
- Do not touch or stage unrelated untracked user files.

---

### Task 1: Add the reusable authored-world assertion helper (TDD)

**Files:**
- Create: `tests/generation/authored-world-contract.ts`
- Create: `tests/generation/authored-world-contract.test.ts`
- Modify: `tests/generation/recipe-v2.test.ts`

**Interfaces:**

```ts
export interface AuthoredWorldExpectation {
  id: string;
  requiredSourceSignals: RegExp[];
  forbiddenSourceSignals: RegExp[];
  requiredMapModes: string[];
  requiredStates: string[];
}

export function inspectAuthoredWorld(
  recipeRoot: string,
  expectation: AuthoredWorldExpectation,
): AuthoredWorldFinding[];
```

The helper reads only declared recipe files, reports stable `{code, path, message}` findings, and never decides visual quality from colors alone.

- [ ] **Step 1: Write failing helper tests**

Build synthetic valid/invalid recipe trees and assert findings for missing views, map profile failures across tone/source/certainty/mode fixtures, missing responsive breakpoints, missing reduced-motion/forced-colors rules, absent focus-visible treatment, forbidden remote imports, forbidden gradients/backdrop filters, underspecified README customization levels, and identical `home`/`experience` root signatures.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- tests/generation/authored-world-contract.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement deterministic source-contract inspection**

Inspect the manifest-declared entry, CSS, profile, README, and source tree. Require all five presentation views plus empty collections, memory-only persistence, candidate, shopping, reservation, task, route-error, and map-error treatments; require media-query coverage for the declared viewports, `:focus-visible`, `@media (forced-colors: active)`, and `@media (prefers-reduced-motion: reduce)`. Reject `http:`/`https:` imports, `url(data:)`, gradients, `backdrop-filter`, `background-clip: text`, and source references to other recipe IDs.

- [ ] **Step 4: Run helper and recipe-v2 tests**

Run: `npm test -- tests/generation/authored-world-contract.test.ts tests/generation/recipe-v2.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/generation/authored-world-contract.ts tests/generation/authored-world-contract.test.ts tests/generation/recipe-v2.test.ts
git commit -m "test: define authored presentation quality contracts"
```

---

### Task 2: Build Reset Arcade (TDD + browser review)

**Files:**
- Create: `plugins/eternal-pose/recipes-v2/reset-arcade/recipe.json`
- Create: `plugins/eternal-pose/recipes-v2/reset-arcade/README.md`
- Create: `plugins/eternal-pose/recipes-v2/reset-arcade/provider-guides/google-map-style.json`
- Create: `plugins/eternal-pose/recipes-v2/reset-arcade/presentation/index.ts`
- Create: `plugins/eternal-pose/recipes-v2/reset-arcade/presentation/theme-map-profile.ts`
- Create: `plugins/eternal-pose/recipes-v2/reset-arcade/presentation/home/ResetArcadeHome.tsx`
- Create: `plugins/eternal-pose/recipes-v2/reset-arcade/presentation/experience/ResetArcadeExperience.tsx`
- Create: `plugins/eternal-pose/recipes-v2/reset-arcade/presentation/components/MissionSelect.tsx`
- Create: `plugins/eternal-pose/recipes-v2/reset-arcade/presentation/components/StageTimeline.tsx`
- Create: `plugins/eternal-pose/recipes-v2/reset-arcade/presentation/components/ArcadePanels.tsx`
- Create: `plugins/eternal-pose/recipes-v2/reset-arcade/presentation/components/ArcadeStates.tsx`
- Create: `plugins/eternal-pose/recipes-v2/reset-arcade/presentation/styles/index.css`
- Create: `plugins/eternal-pose/recipes-v2/reset-arcade/presentation/styles/tokens.css`
- Create: `plugins/eternal-pose/recipes-v2/reset-arcade/presentation/styles/layout.css`
- Create: `plugins/eternal-pose/recipes-v2/reset-arcade/presentation/styles/components.css`
- Create: `plugins/eternal-pose/recipes-v2/reset-arcade/presentation/styles/accessibility.css`
- Test: `tests/generation/reset-arcade.test.ts`
- Create review record: `docs/theme-reviews/reset-arcade.md`

**Interfaces:**
- Manifest features: `[]`; font policy: `system`; map mode: `flat`, low density, high contrast.
- Geometry: mobile header `64/112`, collapsed stage list `120`, minimum gap `20`, desktop breakpoint `768`.
- Motion: `180ms`, interruptible, pressed translation no greater than `3px`, instant under reduced motion.

- [ ] **Step 1: Write the failing Reset Arcade tests**

Use `inspectAuthoredWorld` and source/render assertions for `mission-select`, `mission-number`, `stage-list`, `progress-score`, `pressed-state`, numbered map tokens, all required functional states, and hard shadow/border language. Reject pixel body text, fake score values, random rotation, neon/cyberpunk/glow vocabulary, continuous keyframes, and icon-only unlabeled navigation.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- tests/generation/reset-arcade.test.ts`

Expected: FAIL because Reset Arcade does not exist.

- [ ] **Step 3: Author the full presentation**

- Home presents days as large, numbered missions with real completion/readiness facts and one trip-level status anchor. Progress values come only from the Home model.
- Experience treats the map as a restrained board, stops as numbered tokens, and itinerary as a stage list. The current stage is dominant; routes remain independent edge controls.
- Buttons use strong ink borders, hard offset shadows, and a real pressed displacement. Focus is at least as visible as hover/pressed state.
- Candidate comparison is a mission-choice panel over the persistent map; confirmation and cancellation remain explicit. Shopping, tasks, and reservations retain native semantics.
- Setup/loading/fatal/map-error states use the same modular outline grammar without pretending to be game scores or achievements.
- On desktop, mission index and stage list flank the map. On mobile, the map and interruptible sheet stay primary.

- [ ] **Step 4: Compose and verify the consumer**

Run:

```bash
npm test -- tests/generation/reset-arcade.test.ts
npm run test:recipes:internal -- --recipe reset-arcade
```

Expected: schema/source tests, composed starter check, and shared Playwright contract PASS.

- [ ] **Step 5: Inspect in the in-app browser**

Inspect all shared states at `320/390/430/768/1024/1440`, keyboard-only, 200% zoom, forced colors, reduced motion, grayscale, and with the accent changed. Record fixed defects in `docs/theme-reviews/reset-arcade.md`. Confirm the page remains recognizable from border/shadow/mission composition without its original palette and that no Codex Resets or Playdate assets/trade dress were copied.

- [ ] **Step 6: Commit**

```bash
git add plugins/eternal-pose/recipes-v2/reset-arcade tests/generation/reset-arcade.test.ts docs/theme-reviews/reset-arcade.md
git commit -m "feat: author the Reset Arcade presentation"
```

---

### Task 3: Build Live Journey (TDD + browser review)

**Files:**
- Create: `plugins/eternal-pose/recipes-v2/live-journey/recipe.json`
- Create: `plugins/eternal-pose/recipes-v2/live-journey/README.md`
- Create: `plugins/eternal-pose/recipes-v2/live-journey/provider-guides/google-map-style.json`
- Create: `plugins/eternal-pose/recipes-v2/live-journey/presentation/index.ts`
- Create: `plugins/eternal-pose/recipes-v2/live-journey/presentation/theme-map-profile.ts`
- Create: `plugins/eternal-pose/recipes-v2/live-journey/presentation/home/LiveJourneyHome.tsx`
- Create: `plugins/eternal-pose/recipes-v2/live-journey/presentation/experience/LiveJourneyExperience.tsx`
- Create: `plugins/eternal-pose/recipes-v2/live-journey/presentation/components/NowNextBoard.tsx`
- Create: `plugins/eternal-pose/recipes-v2/live-journey/presentation/components/LiveTimeline.tsx`
- Create: `plugins/eternal-pose/recipes-v2/live-journey/presentation/components/DisruptionPanel.tsx`
- Create: `plugins/eternal-pose/recipes-v2/live-journey/presentation/components/LiveUtilityPanels.tsx`
- Create: `plugins/eternal-pose/recipes-v2/live-journey/presentation/components/LiveStates.tsx`
- Create: `plugins/eternal-pose/recipes-v2/live-journey/presentation/styles/index.css`
- Create: `plugins/eternal-pose/recipes-v2/live-journey/presentation/styles/tokens.css`
- Create: `plugins/eternal-pose/recipes-v2/live-journey/presentation/styles/layout.css`
- Create: `plugins/eternal-pose/recipes-v2/live-journey/presentation/styles/components.css`
- Create: `plugins/eternal-pose/recipes-v2/live-journey/presentation/styles/accessibility.css`
- Test: `tests/generation/live-journey.test.ts`
- Create review record: `docs/theme-reviews/live-journey.md`

**Interfaces:**
- Manifest features: `["dense-telemetry"]`; font policy: `system`; map mode: `neutral`, medium density, high contrast.
- Geometry: mobile live header `96/132`, collapsed journey rail `136`, minimum gap `20`, desktop breakpoint `768`.
- Motion: `200ms`, state-only and interruptible, no ambient pulse.

- [ ] **Step 1: Write the failing Live Journey tests**

Require `now-next`, real local time, current/next owner IDs, route progress/state, urgency ordering, completed-history treatment, disruption/error semantics, and independent route owners. Reject decorative KPI cards, fake telemetry, brand-red alerts, pulsing keyframes, automatic scrolling, and route progress inferred from facts the model does not provide.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- tests/generation/live-journey.test.ts`

Expected: FAIL because Live Journey does not exist.

- [ ] **Step 3: Author the full presentation**

- Home leads with the nearest actionable fact, then unresolved readiness and reservations ordered by urgency. It never invents countdowns when timing is unknown.
- Experience synchronizes a dominant Now/Next board, active route, current timeline entry, and map. Completed history recedes through hierarchy plus non-color state markers; future stops remain scannable.
- Route loading, ready, unavailable, retry, selected, and recomposed states remain attached to the same route ID.
- Alerts use semantic colors only when an actual error/unavailable state exists. Normal brand surfaces stay calm and legible.
- Desktop uses a narrow operational rail plus large map; mobile keeps Now/Next above the map without crowding attribution or the draggable journey sheet.

- [ ] **Step 4: Compose and verify the consumer**

Run:

```bash
npm test -- tests/generation/live-journey.test.ts
npm run test:recipes:internal -- --recipe live-journey
```

Expected: PASS.

- [ ] **Step 5: Inspect in the in-app browser**

Review every shared state and viewport, including clock advancement and transition from current to next. Record results in `docs/theme-reviews/live-journey.md`. Prove grayscale/accent independence through status hierarchy, route weight, typography, and completed/future density. Record that no Flighty, Apple, or Citymapper asset/trade dress was copied.

- [ ] **Step 6: Commit**

```bash
git add plugins/eternal-pose/recipes-v2/live-journey tests/generation/live-journey.test.ts docs/theme-reviews/live-journey.md
git commit -m "feat: author the Live Journey presentation"
```

---

### Task 4: Build Pocket Instrument (TDD + browser review)

**Files:**
- Create: `plugins/eternal-pose/recipes-v2/pocket-instrument/recipe.json`
- Create: `plugins/eternal-pose/recipes-v2/pocket-instrument/README.md`
- Create: `plugins/eternal-pose/recipes-v2/pocket-instrument/provider-guides/google-map-style.json`
- Create: `plugins/eternal-pose/recipes-v2/pocket-instrument/presentation/index.ts`
- Create: `plugins/eternal-pose/recipes-v2/pocket-instrument/presentation/theme-map-profile.ts`
- Create: `plugins/eternal-pose/recipes-v2/pocket-instrument/presentation/home/PocketInstrumentHome.tsx`
- Create: `plugins/eternal-pose/recipes-v2/pocket-instrument/presentation/experience/PocketInstrumentExperience.tsx`
- Create: `plugins/eternal-pose/recipes-v2/pocket-instrument/presentation/components/InstrumentRack.tsx`
- Create: `plugins/eternal-pose/recipes-v2/pocket-instrument/presentation/components/ChannelStrip.tsx`
- Create: `plugins/eternal-pose/recipes-v2/pocket-instrument/presentation/components/StatusLamp.tsx`
- Create: `plugins/eternal-pose/recipes-v2/pocket-instrument/presentation/components/InstrumentPanels.tsx`
- Create: `plugins/eternal-pose/recipes-v2/pocket-instrument/presentation/components/InstrumentStates.tsx`
- Create: `plugins/eternal-pose/recipes-v2/pocket-instrument/presentation/styles/index.css`
- Create: `plugins/eternal-pose/recipes-v2/pocket-instrument/presentation/styles/tokens.css`
- Create: `plugins/eternal-pose/recipes-v2/pocket-instrument/presentation/styles/layout.css`
- Create: `plugins/eternal-pose/recipes-v2/pocket-instrument/presentation/styles/components.css`
- Create: `plugins/eternal-pose/recipes-v2/pocket-instrument/presentation/styles/accessibility.css`
- Test: `tests/generation/pocket-instrument.test.ts`
- Create review record: `docs/theme-reviews/pocket-instrument.md`

**Interfaces:**
- Manifest features: `["dense-telemetry"]`; font policy: `system`; map mode: `technical`, low density, high contrast.
- Geometry: mobile panel header `72/116`, collapsed channel strip `124`, minimum gap `16`, desktop breakpoint `768`.
- Motion: `170ms` latch/indicator transitions, instant under reduced motion, no blinking.

- [ ] **Step 1: Write the failing Pocket Instrument tests**

Require instrument rack, channel strip, status lamps with text equivalents, fine-grid structure, readable primary labels, map display framing, and a single signal color. Reject body copy below `14px`, controls represented as fake knobs, all-caps paragraphs, terminal/cyberpunk vocabulary, glow, scanner effects, and any status communicated only by a lamp.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- tests/generation/pocket-instrument.test.ts`

Expected: FAIL because Pocket Instrument does not exist.

- [ ] **Step 3: Author the full presentation**

- Home is a compact functional rack: trip/readiness is the main display, reservations/tasks are labeled modules, and days are selectable channels.
- Experience makes the map the main instrument display and the itinerary a dense but readable channel strip with separate time, state, place, and action zones.
- Status lamps always have adjacent text or accessible names. Mono micro-annotations are secondary; operational copy remains product-readable.
- Candidate, shopping, reservation, task, setup, loading, map-error, and fatal states reuse the measured hardware-panel grammar without fake dials or decorative controls.
- Desktop uses a wider instrument chassis; mobile remains one-hand operable with full 44px targets despite dense visual rhythm.

- [ ] **Step 4: Compose and verify the consumer**

Run:

```bash
npm test -- tests/generation/pocket-instrument.test.ts
npm run test:recipes:internal -- --recipe pocket-instrument
```

Expected: PASS.

- [ ] **Step 5: Inspect in the in-app browser**

Review every shared state and viewport, with special attention to 320px width, 200% zoom, metadata contrast, keyboard focus against fine rules, and forced-color status lamps. Record results in `docs/theme-reviews/pocket-instrument.md`. Prove the world remains recognizable without its signal color and record that no Teenage Engineering or Nothing asset/trade dress was copied.

- [ ] **Step 6: Commit**

```bash
git add plugins/eternal-pose/recipes-v2/pocket-instrument tests/generation/pocket-instrument.test.ts docs/theme-reviews/pocket-instrument.md
git commit -m "feat: author the Pocket Instrument presentation"
```

---

### Task 5: Run the four-world comparison and correct visual convergence

**Files:**
- Create: `tests/generation/product-world-distinctiveness.test.ts`
- Create: `docs/theme-reviews/product-world-comparison.md`
- Modify: any Phase 1/2 recipe files that fail the comparison

- [ ] **Step 1: Write pairwise structural assertions**

Compare Field Atlas, Reset Arcade, Live Journey, and Pocket Instrument. Require different home root signatures, experience landmark order, geometry values, map mode/profile IDs, marker class vocabularies, route style tuples, and at least four recipe-specific source signals. Reject importing another recipe's component or CSS tree.

- [ ] **Step 2: Run all four composed consumers**

Run:

```bash
npm test -- tests/generation/field-atlas.test.ts tests/generation/reset-arcade.test.ts tests/generation/live-journey.test.ts tests/generation/pocket-instrument.test.ts tests/generation/product-world-distinctiveness.test.ts
npm run test:recipes:internal -- --recipe field-atlas
npm run test:recipes:internal -- --recipe reset-arcade
npm run test:recipes:internal -- --recipe live-journey
npm run test:recipes:internal -- --recipe pocket-instrument
```

Expected: every composed consumer passes independently.

- [ ] **Step 3: Compare browser captures side by side**

At `390` and `1440`, compare Home, Experience, and expanded Experience for all four. Record composition, typography/density, components, map grammar, icon/status, motion, and framing in `docs/theme-reviews/product-world-comparison.md`. If any pair reads as the same product with different colors, revise the weaker world and rerun its full gate.

- [ ] **Step 4: Verify public catalog isolation**

Run: `npm test -- tests/generation/recipes.test.ts tests/generation/create-real-starter.test.ts`

Expected: PASS with exactly the old public three; no Phase 2 ID is selectable yet.

- [ ] **Step 5: Commit**

```bash
git add tests/generation/product-world-distinctiveness.test.ts docs/theme-reviews/product-world-comparison.md plugins/eternal-pose/recipes-v2
git commit -m "test: verify authored product worlds stay distinct"
```

---

## Phase 2 Verification

- [ ] Run all Phase 2 source and composition tests.
- [ ] Run `npm --prefix plugins/eternal-pose/starter/react run check`.
- [ ] Run `npm run type-check` and `npm run lint`.
- [ ] Confirm every review record covers all states, five viewports, keyboard, 200% zoom, forced colors, reduced motion, grayscale, accent replacement, and non-copying review.
- [ ] Confirm `plugins/eternal-pose/recipes/` and public documentation remain untouched in this phase.
- [ ] Confirm no generated consumer contains `recipes-v2`, another recipe ID, a runtime selector, remote asset requests, or new theme dependencies.
