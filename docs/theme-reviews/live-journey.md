# Live Journey authored-world review

## Review status

The source and composed consumer gates pass. A local `/themes/` in-app-browser smoke pass on 2026-08-30 confirmed the desktop preview and both Home and Experience selectors. The full generated-consumer browser matrix remains pending; the gallery smoke pass is not claimed as six-viewport coverage.

## Authored-world assessment

- **Hierarchy:** Home leads with the nearest unresolved task or reservation fact, then readiness, commitments, and day entry. Experience leads with a Now/Next board whose owner IDs come directly from `model.live`; it never creates a countdown when timing is unknown.
- **Map grammar:** The neutral, medium-density map uses distinct current, next, completed, candidate, selected, uncertain, and unavailable marker/route treatments. Route width, casing, and dash tuples differ by walking, transit, and flight; route owners retain their edge IDs.
- **Timeline:** Future stops remain scannable, current and next stops receive stronger rules and labels, and completed history recedes through hierarchy plus a `DONE` text marker. No automatic scroll is used.
- **Disruption:** Loading and unavailable route results remain attached to the same route owner, expose a retry action, and show provider reason text only when supplied. Map error keeps the itinerary available and offers an explicit retry.
- **Semantics:** Candidate comparison is a single-choice panel with explicit cancel/confirm. Shopping uses native selects; reservations and tasks use native dialogs; location, sheet snaps, list/map focus, and external navigation preserve controller semantics.
- **Accessibility and motion:** The manifest uses a 200ms interruptible transition with an instant reduced-motion path. Focus outlines, 44px targets, forced-color borders/labels/dashes, and a 200% text-flow mode are source-defined. Normal operational text is at least 14px; smaller data labels are secondary metadata.

## Verification evidence

- `tests/generation/live-journey.test.ts`: **4/4 passed**.
- Combined authored-world, recipe-v2, and Field Atlas source suites after adding Live Journey: **131/131 passed**.
- Staged Live Journey consumer: **152 tests passed**, type-check passed, ESLint passed, and Vite production build passed (`68 modules`, CSS `27.93 kB`).
- Root TypeScript check, plugin contract validation, marketplace check, focused ESLint, and `git diff --check`: passed.
- Static source checks: no remote URLs, gradients, backdrop blur, continuous keyframes, recipe assets, or runtime theme selector; features are limited to the declared `dense-telemetry` contract and fonts remain system-only.

## Browser matrix (gallery smoke-tested; full matrix pending)

The required matrix remains `320`, `390`, `430`, `768`, `1024`, and `1440` CSS-pixel widths, covering Home, default/expanded Experience, Now/Next, candidate, reservation, task, shopping, setup, loading, fatal, disruption, route-error, map-error, all sheet snaps, keyboard-only focus/restore, 200% text, forced colors, reduced motion, grayscale, accent replacement, and local clock advancement. Those checks remain pending rather than passed; the current evidence is limited to the interactive gallery's desktop smoke pass.

## Provenance and customization

No Flighty, Apple, Citymapper, branded map, screenshot, logo, proprietary font, or trade dress was copied. The recipe documents token, component, presentation-tree, and full-UI replacement paths; it adds no npm theme dependency or runtime selector.
