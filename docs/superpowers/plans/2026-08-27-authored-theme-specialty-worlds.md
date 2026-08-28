# Authored Specialty Worlds and Optional Media Implementation Plan (Phase 3 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Vacation OS, add the narrowly scoped provider-neutral media primitive to core, and complete Memory Cinema with deterministic no-media and failed-media fallbacks.

**Architecture:** Vacation OS keeps window/tab state inside its local presentation because it is visual navigation over unchanged controller semantics. Media is the only package-level addition: `Trip.cover` and `TripNode.media` carry optional semantic image references, while core validates strings without fetching or probing. Memory Cinema consumes those fields locally and always preserves map, timeline, routing, selection, and operational facts when media is absent or fails.

**Tech Stack:** TypeScript 5.9, React 19, Vitest, Testing Library, Playwright, local CSS, existing Motion dependency for interruptible state transitions, optional original local raster assets produced through the image-generation workflow and checked into the selected recipe only.

**Spec:** `docs/superpowers/specs/2026-08-27-authored-theme-catalog-design.md`

## Global Constraints

- Complete Phases 1 and 2 first. Keep both recipes under `plugins/eternal-pose/recipes-v2/`; public catalog cutover remains Phase 4 only.
- Vacation OS windows must be functional navigation surfaces. Do not render fake close, resize, traffic-light, login, notification, or system-dialog controls.
- Desktop windows are bounded and non-draggable. Mobile renders exactly one active primary surface with a semantic tablist/dock; it never shrinks a desktop into tiny windows.
- Media remains optional. A valid trip with no cover and no node media must behave exactly as before in scheduling, route ownership, progress, selection, and validation.
- Core never downloads, decodes, dimensions, caches, transforms, or checks the existence of a media source. Presentations own loading and fallback UI.
- Relative media sources are normalized project-relative POSIX paths. Absolute paths, dot segments, backslashes, protocol-relative strings, and every scheme other than HTTPS are invalid.
- Alternative text is required and nonblank. Optional caption/attribution values, when present, are also nonblank.
- Failed images do not retry automatically, hide the node, clear selection, remove route facts, or cause layout collapse.
- No remote stock service, runtime image API, base64/data URL, proprietary asset, copied trade dress, or new carousel/gallery dependency.
- Reservation references stay hidden until an explicit labeled reveal, are cleared on close, and never leak into media captions, fallbacks, screenshots, logs, or pre-reveal accessibility text.
- Every state still meets the complete responsive/accessibility/browser review matrix and blocks external requests in automated tests.
- Do not touch or stage unrelated untracked user files.

---

### Task 1: Build Vacation OS (TDD + browser review)

**Files:**
- Create: `plugins/eternal-pose/recipes-v2/vacation-os/recipe.json`
- Create: `plugins/eternal-pose/recipes-v2/vacation-os/README.md`
- Create: `plugins/eternal-pose/recipes-v2/vacation-os/provider-guides/google-map-style.json`
- Create: `plugins/eternal-pose/recipes-v2/vacation-os/presentation/index.ts`
- Create: `plugins/eternal-pose/recipes-v2/vacation-os/presentation/theme-map-profile.ts`
- Create: `plugins/eternal-pose/recipes-v2/vacation-os/presentation/home/VacationOsHome.tsx`
- Create: `plugins/eternal-pose/recipes-v2/vacation-os/presentation/experience/VacationOsExperience.tsx`
- Create: `plugins/eternal-pose/recipes-v2/vacation-os/presentation/components/DesktopWorkspace.tsx`
- Create: `plugins/eternal-pose/recipes-v2/vacation-os/presentation/components/MobileDock.tsx`
- Create: `plugins/eternal-pose/recipes-v2/vacation-os/presentation/components/AppWindow.tsx`
- Create: `plugins/eternal-pose/recipes-v2/vacation-os/presentation/components/VacationPanels.tsx`
- Create: `plugins/eternal-pose/recipes-v2/vacation-os/presentation/components/VacationStates.tsx`
- Create: `plugins/eternal-pose/recipes-v2/vacation-os/presentation/styles/index.css`
- Create: `plugins/eternal-pose/recipes-v2/vacation-os/presentation/styles/tokens.css`
- Create: `plugins/eternal-pose/recipes-v2/vacation-os/presentation/styles/layout.css`
- Create: `plugins/eternal-pose/recipes-v2/vacation-os/presentation/styles/windows.css`
- Create: `plugins/eternal-pose/recipes-v2/vacation-os/presentation/styles/accessibility.css`
- Test: `tests/generation/vacation-os.test.ts`
- Create review record: `docs/theme-reviews/vacation-os.md`

**Interfaces:**
- Manifest features: `["desktop-windows"]`; font policy: `system`; map mode: `coastal`, low density, standard contrast.
- Local surface IDs: `"map" | "itinerary" | "reservations" | "tasks"`.
- Geometry: mobile top bar `56/88`, active-panel footer/dock `72`, minimum map gap `16`, desktop breakpoint `768`.
- Motion: `220ms` open/focus/dock selection only, interruptible, instant under reduced motion.

- [ ] **Step 1: Write the failing functional-window tests**

Require a real tablist/dock, unique tab/panel IDs, `aria-selected`, `aria-controls`, one visible mobile tabpanel, four labeled desktop regions, persistent map identity while switching, focus movement to the chosen surface, and no fake controls. Assert reservations/tasks disappear from the dock when their semantic collections are empty only if their facts remain reachable from the itinerary; otherwise retain disabled-free empty panels.

Use the authored-world helper to require `desktop-workspace`, `app-window`, `mobile-dock`, `active-surface`, functional route/map/list state, and the five presentation views. Reject `draggable`, `resize`, `close-window`, `traffic-light`, `crt`, `scanline`, copied macOS/Windows vocabulary, tiny desktop simulation under `768px`, and decorative icons without labels.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- tests/generation/vacation-os.test.ts`

Expected: FAIL because Vacation OS does not exist.

- [ ] **Step 3: Author the desktop and mobile compositions**

- Desktop Home is a bounded resort desktop with real Day files and readiness documents. Desktop Experience coordinates a large Map window with Itinerary, Reservations, and Tasks windows in an explicit CSS grid.
- Window title bars label real regions and expose only functional focus navigation. The dock scrolls/focuses the corresponding window; it does not pretend to minimize or close anything.
- Mobile uses a sticky semantic tablist. Map and itinerary are the first two surfaces; exactly one panel is active, while the underlying map adapter remains mounted and receives updated padding.
- Candidate comparison opens within the active Itinerary surface and still previews on the persistent Map surface. Switching to Map after preview focuses the same owner.
- Setup, loading, map-error, and fatal states use the same vacation-computer grammar without fake OS dialogs.
- Use sun-faded coastal colors, poster-like map framing, compact window chrome, conventional labels, and no gradients/CRT filters.

- [ ] **Step 4: Compose and verify**

Run:

```bash
npm test -- tests/generation/vacation-os.test.ts
npm run test:recipes:internal -- --recipe vacation-os
```

Expected: PASS at all mobile projects and desktop contract viewports.

- [ ] **Step 5: Inspect in the in-app browser**

At `320/390/430`, verify one active surface, full labels, tab keyboard behavior, no miniature windows, persistent map identity, and visible attribution. At `768/1024/1440`, verify the breakpoint, bounded windows, logical focus order, no overlaps, and real dock navigation. Repeat 200% zoom, forced colors, reduced motion, grayscale, accent replacement, every error/decision state, and short-height resizing. Record fixes in `docs/theme-reviews/vacation-os.md` and record that no Poolsuite, PostHog, Windows, or macOS assets/trade dress were copied.

- [ ] **Step 6: Commit**

```bash
git add plugins/eternal-pose/recipes-v2/vacation-os tests/generation/vacation-os.test.ts docs/theme-reviews/vacation-os.md
git commit -m "feat: author the Vacation OS presentation"
```

---

### Task 2: Add the optional core media model and validation (TDD)

**Files:**
- Modify: `packages/core/src/model.ts`
- Modify: `packages/core/src/validation.ts`
- Modify: `packages/core/tests/validation.test.ts`
- Modify: `packages/core/tests/resolve-itinerary.test.ts`
- Modify: `packages/core/tests/exports.test.ts`
- Modify: `packages/core/README.md`
- Modify: `plugins/eternal-pose/starter/react/src/trip-content/fixtures/complete-trip.ts`

**Interfaces:**

```ts
export interface MediaAsset {
  src: string;
  alt: string;
  caption?: string;
  attribution?: string;
}

export interface NodeBase<K extends string, P> {
  id: string;
  dayId: string;
  kind: K;
  title: string;
  timing: Timing;
  optionality: Optionality;
  place?: PlaceRef;
  booking?: Booking;
  details?: string[];
  media?: MediaAsset[];
  payload: P;
}

export interface Trip {
  id: string;
  title: string;
  timezone: string;
  startDate: string;
  endDate: string;
  cover?: MediaAsset;
  days: TripDay[];
  routes: RouteEdge[];
  candidateGroups: CandidateGroup[];
  reservations: Reservation[];
  tasks: TripTask[];
}
```

Validation codes:

- `INVALID_MEDIA_SOURCE`
- `BLANK_MEDIA_ALT`
- `BLANK_MEDIA_CAPTION`
- `BLANK_MEDIA_ATTRIBUTION`

- [ ] **Step 1: Write failing core tests**

Valid cases:

```ts
{ src: "media/harbor.jpg", alt: "Harbor at sunrise" }
{ src: "assets/trip/day-1/cafe.webp", alt: "Cafe entrance", caption: "Morning stop" }
{ src: "https://images.example.test/trip/harbor.jpg?size=large#frame", alt: "Harbor" }
```

Invalid sources include blank, `/root.jpg`, `../secret.jpg`, `media/../secret.jpg`, `./media.jpg`, `media//photo.jpg`, `C:\\photo.jpg`, `\\server\\photo.jpg`, `//example.test/photo.jpg`, `http:`, `data:`, `blob:`, `file:`, `javascript:`, and malformed HTTPS strings. Add separate exact-path assertions for cover and `days[i].nodes[j].media[k]` findings. Test blank alt and present-but-blank caption/attribution.

Also prove `validateTrip` accepts no media, media ordering is preserved by `resolveEffectiveItinerary`, and media never changes route, schedule, progress, or candidate resolution output.

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
npm --workspace @laugh-tale-island/core test -- validation.test.ts resolve-itinerary.test.ts exports.test.ts
```

Expected: FAIL because `MediaAsset`, `cover`, and `media` do not exist.

- [ ] **Step 3: Implement source validation without I/O**

Treat a string beginning with exact `https://` and accepted by `new URL` with a nonblank hostname as remote. Otherwise accept a project-relative POSIX path only when every slash-separated segment is non-empty and neither `.` nor `..`; reject leading slash, backslash, NUL, `%`, `?`, `#`, protocol-relative strings, drive syntax, and any URI scheme. Add `%2e%2e/secret.jpg`, `media/photo.jpg?raw=1`, and `media/photo.jpg#frame` to the invalid relative cases. Do not check filesystem existence.

Call `validateMedia` for `trip.cover` and each node media item. Trim only for blank checks; retain authored strings in the model and never mutate the trip.

- [ ] **Step 4: Document package neutrality**

Add a core README section with the exact interface, valid/invalid examples, no-I/O guarantee, and reminder that rendering, preload, error UI, attribution placement, and asset bundling are consumer responsibilities. Do not add media hooks or visual components to `@laugh-tale-island/react`.

- [ ] **Step 5: Run package gates**

Run:

```bash
npm --workspace @laugh-tale-island/core test
npm --workspace @laugh-tale-island/core run type-check
npm --workspace @laugh-tale-island/core run lint
npm --workspace @laugh-tale-island/core run build
npm --workspace @laugh-tale-island/react test
```

Expected: PASS; core boundary scan still finds no React, CSS, Google SDK, or visible UI copy.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/model.ts packages/core/src/validation.ts packages/core/tests packages/core/README.md plugins/eternal-pose/starter/react/src/trip-content/fixtures/complete-trip.ts
git commit -m "feat: add optional trip media metadata"
```

---

### Task 3: Add deterministic media fixtures and failure-state tests

**Files:**
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/assets/demo/harbor-memory.webp`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/assets/demo/garden-memory.webp`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/assets/LICENSE.md`
- Create: `plugins/eternal-pose/starter/react/tests/e2e/fixtures/media-trip.ts`
- Create: `plugins/eternal-pose/starter/react/tests/e2e/media-contract.spec.ts`
- Modify: `plugins/eternal-pose/starter/react/tests/e2e/fixtures/e2e-trip.ts`
- Modify: `plugins/eternal-pose/starter/react/src/main.tsx`

- [ ] **Step 1: Write failing E2E media scenarios**

Add three deterministic trip variants:

1. no cover and no node media;
2. valid local cover/node media;
3. valid metadata whose image request returns a local `404`.

The shared scenario asserts selection/map ownership and all operational facts survive all three. The failed asset is requested at most once per mounted frame, produces a labeled fallback, and never triggers an external request or infinite layout/retry loop. In development E2E mode only, `main.tsx` selects these synthetic fixtures from a `fixture` query parameter through a typed `fixtureForE2E(name)` export; production startup never reads that parameter.

- [ ] **Step 2: Run and confirm RED**

Run: `npm --prefix plugins/eternal-pose/starter/react run test:e2e -- media-contract.spec.ts`

Expected: FAIL because the media-aware presentation and fixtures do not exist.

- [ ] **Step 3: Create original local demo images through the image-generation workflow**

Generate two restrained, non-branded landscape photographs/illustrations suitable for a cinematic travel memory. They must contain no logo, text, identifiable private person, trademarked location treatment, or reference-product composition. Save optimized WebP files at the exact paths above and document their original/generated provenance and repository license in `assets/LICENSE.md`.

Do not use placeholder rectangles, remote stock URLs, copied screenshots, or data URLs.

- [ ] **Step 4: Wire deterministic local fixture references**

Use project-relative sources matching the eventual composed target:

```ts
cover: {
  src: "theme-assets/demo/harbor-memory.webp",
  alt: "Harbor water reflecting a pale morning sky",
  caption: "First light at the harbor",
  attribution: "Original Laugh Tale demo artwork",
}
```

Node media uses the garden image with equally concrete alt/caption/attribution. Keep all data synthetic.

- [ ] **Step 5: Leave the test red for the next task**

Run the core package tests again and confirm they pass, while `media-contract.spec.ts` still fails only because Memory Cinema rendering is absent. Commit fixtures/assets separately so the next task has a stable red test.

- [ ] **Step 6: Commit**

```bash
git add plugins/eternal-pose/recipes-v2/memory-cinema/assets plugins/eternal-pose/starter/react/tests/e2e/fixtures/media-trip.ts plugins/eternal-pose/starter/react/tests/e2e/media-contract.spec.ts plugins/eternal-pose/starter/react/tests/e2e/fixtures/e2e-trip.ts plugins/eternal-pose/starter/react/src/main.tsx
git commit -m "test: add deterministic optional media fixtures"
```

---

### Task 4: Build Memory Cinema with no-media and failed-media fallbacks (TDD + browser review)

**Files:**
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/recipe.json`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/README.md`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/provider-guides/google-map-style.json`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/presentation/index.ts`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/presentation/theme-map-profile.ts`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/presentation/home/MemoryCinemaHome.tsx`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/presentation/experience/MemoryCinemaExperience.tsx`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/presentation/components/MediaFrame.tsx`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/presentation/components/MapPosterFallback.tsx`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/presentation/components/FilmstripTimeline.tsx`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/presentation/components/CinemaPanels.tsx`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/presentation/components/CinemaStates.tsx`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/presentation/styles/index.css`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/presentation/styles/tokens.css`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/presentation/styles/layout.css`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/presentation/styles/media.css`
- Create: `plugins/eternal-pose/recipes-v2/memory-cinema/presentation/styles/accessibility.css`
- Test: `tests/generation/memory-cinema.test.ts`
- Create review record: `docs/theme-reviews/memory-cinema.md`

**Interfaces:**
- Manifest features: `["media"]`; declared asset root: `assets` (so demo files and `LICENSE.md` ship together); font policy: `system`; map mode: `subdued`, low density, standard contrast.
- Geometry: mobile chapter header `64/104`, collapsed filmstrip `132`, minimum gap `20`, desktop breakpoint `768`.
- `MediaFrame` receives `{ asset, fallback, selected, onSelect }` and resets its single `failed` flag only when `asset?.src` changes.
- Motion: `240ms` selected-frame/map-focus transitions, no autoplay and no crossfade dependency under reduced motion.

- [ ] **Step 1: Write failing source/render tests**

Require trip cover, asymmetric media passage, filmstrip timeline, caption/attribution semantics, map-to-frame and frame-to-map selection, no-media fallback, failed-media fallback, and all shared functional states. Reject masonry/social-feed layout, automatic slideshow/timers, global film grain, hidden operational facts, empty gray placeholders, remote stock fallback, and generic equal-sized image cards.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- tests/generation/memory-cinema.test.ts`

Expected: FAIL because the presentation source does not exist.

- [ ] **Step 3: Author the full presentation**

- Home leads with the optional cover and chapter structure; without a cover it renders a deterministic map/route poster with trip title and date range.
- Experience keeps the map continuously reachable. Selected node media occupies an asymmetric frame; selecting a frame invokes the same semantic node action and focuses its map owner.
- Filmstrip entries always show time/place/current/completion facts even with media. Photo availability never controls whether a stop exists.
- `MediaFrame` uses semantic `img` alt, visible caption when supplied, adjacent attribution when supplied, a fixed aspect-ratio shell, and `onError` to swap once to `MapPosterFallback`.
- Fallback composition uses existing route shape/map framing, chapter number, place title, and semantic status. It makes no network request and is visually complete.
- Candidate, shopping, reservations, tasks, setup, loading, map-error, and fatal states use cinematic framing while remaining operational and readable.

- [ ] **Step 4: Compose and run both no-media and media E2E gates**

Run:

```bash
npm test -- tests/generation/memory-cinema.test.ts
npm run test:recipes:internal -- --recipe memory-cinema
npm --prefix tmp/staged-starter run test:e2e -- media-contract.spec.ts
```

Expected: PASS for no-media, valid-media, and failed-media variants with zero external requests.

- [ ] **Step 5: Inspect in the in-app browser**

Inspect every standard state plus cover/no-cover, node media/no-media, failed image, media selection, and map selection at all five viewports. At 200% zoom, captions/attribution must wrap without covering controls; forced colors must preserve frame/selection boundaries; reduced motion must switch immediately with no opacity-dependent information. Record grayscale/accent-substitution evidence and fixes in `docs/theme-reviews/memory-cinema.md`. Record that no Cosmos, Polarsteps, Lightship, or film-brand assets/trade dress were copied.

- [ ] **Step 6: Commit**

```bash
git add plugins/eternal-pose/recipes-v2/memory-cinema tests/generation/memory-cinema.test.ts docs/theme-reviews/memory-cinema.md
git commit -m "feat: author the Memory Cinema presentation"
```

---

### Task 5: Compare all six worlds before cutover

**Files:**
- Create: `tests/generation/six-world-distinctiveness.test.ts`
- Create: `docs/theme-reviews/six-world-comparison.md`
- Modify: failing recipe files only

- [ ] **Step 1: Add exact internal-catalog assertions**

Assert `recipes-v2/` contains exactly:

```ts
[
  "field-atlas",
  "live-journey",
  "memory-cinema",
  "pocket-instrument",
  "reset-arcade",
  "vacation-os",
]
```

Every manifest is schema 2, every profile ID matches its recipe, only Vacation OS declares `desktop-windows`, only Memory Cinema declares `media`, and no recipe imports another recipe or a runtime theme registry.

- [ ] **Step 2: Run six independent composed consumers**

Run `npm run test:recipes:internal -- --recipe <id>` once for each ID. Expected: every consumer independently passes `check`, shared behavior E2E, external-request blocking, and its recipe-specific tests.

- [ ] **Step 3: Perform side-by-side browser review**

Compare Home, default Experience, and expanded Experience at `390` and `1440`; compare grayscale and accent-swapped captures. Record all seven authored-world dimensions for every pair likely to converge. Any world that resembles Field Atlas or another theme in composition/map grammar must be revised before Phase 4.

- [ ] **Step 4: Run media/package regression gates**

Run:

```bash
npm run test:packages
npm run type-check:packages
npm --prefix plugins/eternal-pose/starter/react run check
npm test -- tests/generation/six-world-distinctiveness.test.ts
```

Expected: PASS.

- [ ] **Step 5: Reconfirm public isolation**

Run: `npm test -- tests/generation/recipes.test.ts tests/generation/create-real-starter.test.ts`

Expected: the public catalog still exposes only the old three; all six complete v2 worlds remain internal until the next plan.

- [ ] **Step 6: Commit**

```bash
git add tests/generation/six-world-distinctiveness.test.ts docs/theme-reviews/six-world-comparison.md plugins/eternal-pose/recipes-v2
git commit -m "test: approve all six authored visual worlds"
```

---

## Phase 3 Verification

- [ ] All core media unit/type/lint/build gates pass with no React/UI additions.
- [ ] All six internal composed consumers pass their source, build, behavior, accessibility, responsive, and external-request gates.
- [ ] Memory Cinema passes no-media, valid-media, and failed-media scenarios; image failure makes one request and never changes semantic ownership.
- [ ] Vacation OS uses real tabs/regions and exactly one mobile surface; it contains no fake window controls.
- [ ] All six browser review records and the pairwise comparison are complete and defect-free.
- [ ] Public recipe selection and documentation remain unchanged until Phase 4.
