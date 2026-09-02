# Tokyo baseline parity report (2026-09)

Baseline required by ADR-0005: Eternal Pose 0.1.0 on `@laugh-tale-island/core` and `@laugh-tale-island/react` **packed from `main` HEAD** (see "Why not the published 1.0.0" below), recipe `quiet-wood`, measured against the benchmark (`tokyo-trip-map`, read-only). Nothing in `packages/` or `plugins/` was changed during the run. Every defect below is recorded, not fixed.

Statuses are exactly: `verified`, `partially verified`, `not exercised by input`, `blocked by configuration`, `blocked by model`, `failed`. Categories: `package`, `starter`, `plugin`, `documentation`, `example`. Where a row was checked with the starter's own synthetic fixture rather than the Tokyo content, the note says "synthetic".

## Summary

- Nodes: 100 across 6 days. Route edges: 92 (legs with a user-supplied mode). `unknown` legs: 2 (`D3-2`, `D3-3`), no edge.
- Places: 89 resolved (`suggested`), 1 unresolved (`unverified`, Pelican Cafe). Oracle distance check: match 30, near 42, over 500 m 17, unresolved 1, against the 34 benchmark stops that carry inline coordinates.
- Gates on the example: unit 259/259, Playwright 39/39 at 320, 390, 430 (3 of them expected-fail records), copy-out install and `check` pass, root provenance test 2/2, publication scan 0 findings, `git diff --check` clean.
- Rows (run + A + B + C, 53 total): verified 23, partially verified 22, blocked by configuration 1, blocked by model 1, failed 6. "Not exercised by input" appears in notes rather than as a status, because every such capability was still checked with the starter's synthetic fixture.
- Invariant: `/usr/bin/git diff --stat main -- packages plugins` printed nothing at every commit.
- Manual feel sign-off (section D): **pending**, needs the user on a phone.

## Why not the published 1.0.0

The run started exactly as specified, against the registry artifacts (commit `817b952`). The generated site failed type-check (exit 2), build (exit 2), and 20 unit tests, and its experience view crashed into `PresentationErrorBoundary` with `useOptionalCandidateDecision is not a function`. Cause: commit `b95a340` (2026-08-28) added `useOptionalCandidateDecision` to `react` and `source`, `certainty`, `mode` on `MapRoutePresentation` plus `routes` on `MapPresentationContext` to `core`, and the starter on `main` uses all of them, but the squash-merge title carried no conventional-commit prefix, so semantic-release cut no release. CI never noticed because it stages tarballs from HEAD source, never from the registry. The user chose option (c): pack both packages from `main` HEAD into `examples/tokyo/vendor/` and install them with relative `file:` specifiers (commit `f389d54`, `vendor/PROVENANCE.md`). Everything else still resolves from `https://registry.npmjs.org/`.

## Run rows

| # | Claim | Status | Category | Evidence / note |
| --- | --- | --- | --- | --- |
| R1 | A site generated from `main` runs on the published 1.0.0 packages | failed | package | Missing exports listed above; type-check 2, build 2, 20 unit failures, runtime error boundary. Release process: `b95a340` shipped package changes without a release; CI tests HEAD tarballs only. |
| R2 | `validate-trip-project.mjs` passes on a real generated project | failed | plugin | `project.missing-directory src/ui`; the starter's layout is `src/presentation`. The root generation tests validate a synthetic fixture only. |
| R3 | Validator accepts the option-(c) vendored specifiers | blocked by configuration | plugin | Two `project.invalid-package-specifier` errors, by design of option (c). |
| R4 | Enrich has a deterministic place-resolution step | failed | plugin | The skill names Enrich but ships no script (`grep` of `skills/` for any script: 0 hits). An example-local `scripts/resolve-places.mjs` was written for this run. ADR-0006 gap. |
| R5 | Public places resolve from authored names alone | verified | example | 90 unique titles, one Text Search pass (`zh-TW`, `JP`, Tokyo bias). 85 first candidates were exact-name matches; 2 exact-name candidates were not first; 3 titles named no branch and were decided by day context: 宇奈とと and Minatoya landed 0 m and 309 m from the oracle, Pelican Cafe contradicted the oracle and was set back to unresolved. Finding for Enrich: adjacent-stop inference is unsafe when the adjacent legs are `unknown`. |
| R6 | A leg whose mode is unknown can exist as a route edge | blocked by model | package | `RouteMode` has no unknown value; `D3-2`, `D3-3` produce no edge. ADR-0002 model change. |
| R7 | The starter's accessible names are documented for test authors | partially verified | documentation | Selectors were guessed from the starter's own e2e (`Enter Day 1 · …`, `Time not set|時間未定`, `Return to the current itinerary item`) and worked first time; nothing documents them. |
| R8 | The flagship is installable when copied out of the checkout | verified | example | `rsync` to a temp dir, `npm ci` in place: 399 packages, both Laugh Tale packages 1.0.0 from `file:vendor/`; `npm run check` 259/259 and build. Note: `npm --prefix <dir> ci` fails with `EUSAGE … Missing: tokyo@0.1.0` outside the repo; run in place (CI job uses `working-directory`). |

## A. Craft sources (benchmark review)

| # | Claim | Status | Category | Evidence / note |
| --- | --- | --- | --- | --- |
| A1 | Sheet drag: pointer capture, rAF-coalesced moves, live ceiling, transition off while dragging, drag interrupts a running snap | partially verified | package | `use-itinerary-sheet` (react dist): `setPointerCapture`/`releasePointerCapture`, velocity-directed snapping, `transitionDuration` and `data-dragging` while dragging; interruptible drag covered by the inherited e2e "interruptible three-snap sheet". No `requestAnimationFrame` coalescing; ceiling comes from `resolveSheetGeometry` on measured viewport metrics, not from live computed style. |
| A2 | Map padding derived from sheet geometry; fit and focus respect it; focus lands centred in the uncovered map | partially verified | starter | Padding = header clearance + sheet snap + safe areas (`use-trip-experience-controller.ts:682-710`, `use-map-lifecycle.ts` `setPadding`); `fitBounds(bounds, padding)` (`GoogleMapAdapter.ts:423`). No post-focus `panBy` compensation exists (grep: 0). Centring pending sign-off M2. |
| A3 | Flight polylines drawn but excluded from bounds fitting | failed | starter | Bounds iterate every coordinate with no mode filter (`GoogleMapAdapter.ts:156-185`; grep `flight`: 0). Not observed at runtime: this input has no flight edge. |
| A4 | Movement rendered as an edge; only primary nodes consume a map number | partially verified | package | Route edges are their own timeline entries (core `timeline`), never nodes: verified. Map labels are decorated by the controller; core labels every node with its title, and whether lodging/transfer nodes skip numbering was not verified. |
| A5 | Candidates compared simultaneously on the main map as lettered provisional pins | verified | package | Inherited e2e "compares dining and snack candidates together on the persistent map with draft and commit semantics" (`Map place 5A · …`, `5B`). Synthetic; the Tokyo input has no candidate group. |
| A6 | Pin: single-element teardrop, counter-rotated label, type badge, transform-only selection scale | failed | starter | `.map-marker` is a 28 px bordered inline-grid with a text label; selection changes background colour only (`base.css:804-821`); no teardrop, no type badge, no transform scale. |
| A7 | Live clock on the minute boundary with truthful current/next and return-to-now | partially verified | starter | Minute-boundary timer exists (`MINUTE_IN_MILLISECONDS`, `setTimeout` at `use-trip-experience-controller.ts:465`). "Return to the current itinerary item" is rendered unconditionally in `DayHeader.tsx:79` and `ItinerarySheetView.tsx:87` even when no node has a time; recorded by the expected-fail e2e test. |
| A8 | Designed degradation: map failure keeps the list readable with retry; route failure scoped to its edge | verified | starter | `ItineraryMapView.tsx:34-37` alert "Map unavailable. The itinerary remains available." with Retry; `RouteConnector.tsx` per-edge unavailable state with retry; inherited e2e "route retry". |
| A9 | Typography: system stack, compressed scale, hierarchy by weight | partially verified | starter | No remote fonts (no `@font-face`, no font link). `--font-body` starts with `Inter` (renders in Inter only where installed, otherwise system). Two tokens: title 0.95 rem, meta 0.75 rem. Weight hierarchy pending sign-off V5. |
| A10 | Craft-level e2e coverage for motion, gesture ownership, and reflow exists | partially verified | starter | Nine inherited claims cover interruptible sheet, asymmetric safe areas, touch-target audit, forced colors, reduced motion, location. No coverage for header-plus-sheet single transition, pinch ownership, or 200 % text reflow. |
| A11 | Provider neutrality enforced by a test | verified | package | `packages/core/tests/boundaries.test.ts` and `packages/react/tests/boundaries.test.ts` forbid `google.maps`, React, DOM, CSS, and display strings in the packages. |
| A12 | Domain-accurate opening-hours handling | failed | starter | `GooglePlaceAdapter.ts` contains no opening-hours handling (grep `opening|regularOpeningHours|periods`: 0). Not exercised by input either. |

## B. Benchmark production contract (`tests/e2e/mobile-itinerary.spec.ts`, 27 claims)

| # | Claim (provider-neutral) | Status | Category | Evidence / note |
| --- | --- | --- | --- | --- |
| B1 | Itinerary stays usable at 320×568, 390×844, 430×932, and a short viewport | verified | starter | Inherited "keeps the persistent map and interruptible three-snap sheet inside every mobile viewport" plus the Tokyo spec, all three projects; 320×568 is the short case. |
| B2 | Route loading feedback is centred on the row that owns the edge | partially verified | starter | Per-edge loading state in `RouteConnector.tsx`; centring not asserted. |
| B3 | Collapsing the day rail keeps header tools reachable | partially verified | starter | `DayHeader` keeps return-to-lodging, return-to-now, expand controls outside the rail; rail is `inert` when collapsed. No e2e; sign-off F4. |
| B4 | Header, map controls, and sheet move as one transition | partially verified | starter | Header clearance feeds sheet `topClearance` and map padding; one `--shell-motion-duration`. Unity of the transition untested; sign-off F4. |
| B5 | Sheet geometry stays continuous when the header transition reverses mid-way | partially verified | starter | Same mechanism; no reversal test; sign-off F4. |
| B6 | Keyboard focus indicator stays explicit in forced-colors mode | verified | starter | Inherited "preserves keyboard names, forced-color selection, and reduced-motion behavior"; `forced-colors` blocks in `base.css` and `recipe.css`. |
| B7 | Expanded sheet never collides with the reopening header | partially verified | starter | Ceiling accounts for header clearance; no collision test; sign-off F4. |
| B8 | Expanded content stays below a top safe area | verified | starter | `env(safe-area-inset-*)` probe (`use-viewport-metrics.ts`) and 21 CSS uses; inherited "asymmetric safe areas" test. |
| B9 | Header clearance holds with a top safe area on a short screen | verified | starter | Same test at 320×568. |
| B10 | Every snap point respects the top safe area on a short viewport | verified | starter | Same test. |
| B11 | Collapsed sheet shows one compact row | partially verified | starter | Collapsed toolbar shows day title and stop count (`ItinerarySheetView.tsx:47-83`); the benchmark shows the current stop with a navigate action instead. |
| B12 | Map and itinerary are visible together at every mobile width | verified | starter | Inherited test plus Tokyo spec (`data-e2e-map-surface` and itinerary region visible). |
| B13 | Expanded sheet stays clear of day controls | partially verified | starter | Ceiling below header clearance; not asserted; sign-off F4. |
| B14 | Pinch gestures stay inside the interactive map | partially verified | starter | `touch-action: none` and `pan-y` plus `overscroll-behavior: contain` in `base.css:511-732`; no gesture test; sign-off F7. |
| B15 | Focusing one node and restoring the full-day fit | partially verified | starter | Focus verified (Tokyo spec `data-e2e-focus-kind="place"`). The map toolbar offers only "Recenter my location"; there is no restore-full-day control. |
| B16 | All candidates render on the map without a selection | verified | package | Inherited candidates test (synthetic). |
| B17 | Device location shows only after permission and is never persisted | verified | package | Inherited "handles location success, denied retry, stale callbacks, and explicit recenter without camera chasing"; `useUserLocation` has no storage. |
| B18 | Expanded first day keeps exact order and navigation links | verified | starter | Tokyo spec Day 1 order; inherited link "Open live transit directions from … to …" (synthetic). |
| B19 | Height animation is disabled while the sheet follows a drag | verified | package | `transitionDuration` zeroed under `data-dragging` (react dist); inherited interruptible-sheet test. |
| B20 | Switching days resets the sheet; details disclose progressively | partially verified | starter | `selectDay` sets the sheet to `half` (`use-trip-experience-controller.ts:965-976`); Tokyo spec verifies per-day counts. Progressive disclosure not asserted. |
| B21 | Sheet stays above the map after a day-switch repaint | partially verified | starter | Layering uses literal `z-index` 15/20/30/40 (no named scale); no repaint test. |
| B22 | Day overview, reservations, and full details sit behind compact actions | verified | starter | Inherited "renders all semantics, lodging roles, tasks, dialogs" (synthetic). |
| B23 | Fixed confirmed tickets and suggested unbooked slots are distinguished | verified | starter | Same inherited test (synthetic); Tokyo input carries no bookings. |
| B24 | Candidate selection persists and is exclusive | verified | package | Inherited candidates test with draft/commit and reload (synthetic). |
| B25 | Long names stay readable at 320 px | partially verified | starter | Tokyo spec renders 44-character titles at 320 and counts pass; readability and ellipsis not asserted; sign-off V2. |
| B26 | Transit uses a curated plan plus a consumer Google Maps deep link | partially verified | starter | Deep link verified (`google-maps-url.ts`, inherited link test). Curated plan exists only as `transport` node `payload.plan`; this input has no transport node. Live transit is an opt-in Routes flag. |
| B27 | Progress persists through reload and resets per day | verified | package | Inherited "trip-scoped progress reload and reset". |

## C. Interaction coverage (2026-08-27 spec, fake adapters, 320/390/430)

| # | Claim | Status | Category | Evidence / note |
| --- | --- | --- | --- | --- |
| C1 | Day switching and stable manual selection | verified | starter | Tokyo spec "switches days and keeps exact per-day counts"; inherited selection tests. |
| C2 | List-to-map and map-to-list synchronization for resolved places | verified | starter | Tokyo spec focus test; inherited "synchronizes dates, live current state, list places, map places". |
| C3 | Collapsed, half, expanded, interrupted-drag, reduced-motion, and return-to-map behaviour | partially verified | starter | All but return-to-map verified by inherited tests; no restore-full-day control (see B15). |
| C4 | Unique route ownership, provider failure, retry, and external navigation | verified | package | Inherited "independent route owners", "route retry", navigation link. |
| C5 | Representative lodging, dining, shopping, sightseeing, experience, and transfer renderers | verified | starter | Tokyo input exercises all six kinds; inherited "keeps every semantic renderer visible". |
| C6 | Keyboard operation, focus restoration, visible focus, touch targets, forced colors, truthful unresolved states | partially verified | starter | Keyboard, focus, forced colors, and the 44 px touch-target audit verified by inherited tests. No explicit unresolved-place indicator was found in `labels.ts` or `TimelineEntry.tsx`; how the unresolved Pelican Cafe node reads is pending sign-off M4. |

## D. Feel sign-off (manual, phone, side by side)

**Pending.** ADR-0005 makes this the user's step. Procedure (plan Task 7): add `VITE_GOOGLE_ROUTES_ENABLED=true` and `VITE_GOOGLE_TRANSIT_ENABLED=true` to `examples/tokyo/.env.local` for the session; serve the benchmark and `npm --prefix examples/tokyo run dev -- --host 0.0.0.0 --port 4174` on the LAN; walk the F1–F8, V1–V5, M1–M5 checklist in `docs/superpowers/specs/2026-09-02-tokyo-signoff-notes.md` (skeleton in the plan), benchmark first; remove the two flags afterwards. Rows B3, B4, B5, B7, B13, B14, B25, A2, A9, C6 name the sign-off item that closes them.

## Resolution and oracle

- Unresolved: `Pelican Cafe` (title names no branch; Asakusa original and Azabudai Hills branch both plausible; both adjacent legs `unknown`).
- `unknown` legs: `D3-2` Balcony by 6th → Pelican Cafe, `D3-3` Pelican Cafe → 東京麻布台之丘.
- Oracle (distance only, no coordinates): match 30, near 42, over 500 m 17, unresolved 1, benchmark stops parsed 34. The 17 rows over 500 m are all places for which the benchmark has no stop within 500 m (its parsed stops are area anchors such as "Pelican Cafe (淺草)" and "Shibuya SKY"); none is a wrong-branch resolution after the Pelican correction.

## Replay

Run from `/Users/bluesky/arsenal/laugh-tale` on `feat/tokyo-golden-path-baseline`.

1. `npm test -- tests/generation/create-real-starter.test.ts tests/generation/generated-project.test.ts` → 0, 31 passed (Vite warns about a missing source map under `plugins/eternal-pose/vendor/entities/`).
2. `node plugins/eternal-pose/scripts/create-trip-project.mjs --target $PWD/examples/tokyo --recipe quiet-wood` → 0.
3. `npm --prefix examples/tokyo ci` → 0; lockfile: both packages `1.0.0` from `registry.npmjs.org`, no `file:`/`link:`/`workspace:`.
4. `npm --prefix examples/tokyo run check` → 1 (20 failing tests); `run type-check` → 2; `run build` → 2.
5. `node plugins/eternal-pose/scripts/validate-trip-project.mjs $PWD/examples/tokyo --mode local` → 1 (`project.missing-directory src/ui`).
6. Commit `817b952`.
7. `npm run build` and `npm pack --pack-destination …/examples/tokyo/vendor` in `packages/core` and `packages/react` → 0 (19 503 B, 12 686 B).
8. Rewrite the two dependencies to `file:vendor/…`; `npm --prefix examples/tokyo install --registry=https://registry.npmjs.org` → 0; lockfile: Laugh Tale entries `file:vendor/`, all others `registry.npmjs.org`.
9. Commit `f389d54`.
10. Author `src/trip-content/source/tokyo-itinerary.json`, `source/types.ts`, `tokyo-trip.ts`, `tokyo-trip.test.ts`, `trip.ts`, `index.html`; `npm --prefix examples/tokyo test -- src/trip-content/tokyo-trip.test.ts` → 0; `run lint` → 0; `run type-check` → 0.
11. Commit `2b0763e`.
12. `node examples/tokyo/scripts/resolve-places.mjs --probe` → 403 `Requests from referer <empty> are blocked`; with `PLACES_REFERER=http://localhost:5173/` → `probe ok`.
13. `--search` → 90 titles, every one with 1–3 candidates; decisions recorded; `--accept` → 89 resolved, 1 unresolved.
14. Commit `b666832`.
15. `TOKYO_ORACLE_ROOT=/Users/bluesky/arsenal/tokyo-trip-map node examples/tokyo/scripts/oracle-check.mjs` → match 30, near 42, mismatch 17, unresolved 1.
16. Commit `1e97079`.
17. `npm --prefix examples/tokyo run check` → 0 (259 passed, build 564 ms).
18. `npm --prefix examples/tokyo run test:e2e -- tests/e2e/tokyo-trip.spec.ts` → 0 (12 passed, 3 of them expected-fail).
19. `npm --prefix examples/tokyo run test:e2e` → 0 (39 passed).
20. Commit `6096f47`.
21. `npm test -- tests/examples/tokyo-provenance.test.ts` → 0; CI YAML parses; commit `927809a`.
22. Copy-out: `rsync` excluding `node_modules`, `dist`, `.env.local`, `scripts/.resolve-review.json`; `npm ci` in place → 0 (399 packages); `npm run check` → 0; validator → 1 (3 errors as in R2/R3); temp dir removed.
23. `node plugins/eternal-pose/scripts/scan-publication.mjs $PWD/examples/tokyo` → 0 (0 findings); `/usr/bin/git diff --check` → clean; `/usr/bin/git diff --stat main -- packages plugins` → empty.

## Known limitations

- Route parity for `D3-2` and `D3-3` is `blocked by model` (`RouteMode` has no unknown value in 1.0).
- Candidate, reservation, task, and shopping-checklist behaviours are verified with the starter's synthetic fixture only; the Tokyo input contains none of them.
- The Google key is a browser key with an HTTP-referrer restriction; the resolver sends a localhost `Referer`. Sign-off on a LAN phone may hit the same restriction and fall back to desktop device emulation.
- The tarballs under `vendor/` say `1.0.0` but are not the published 1.0.0; `vendor/PROVENANCE.md` explains, and they are removed when 2.0 is published.
- Root `npm test` prints a Vite warning about a missing `.js.map` under `plugins/eternal-pose/vendor/entities/`; tests pass.
