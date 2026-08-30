# Reset Arcade authored-world review

## Review status

The source and composed consumer gates for Reset Arcade are green. A local `/themes/` in-app-browser smoke pass on 2026-08-30 confirmed the desktop preview and both Home and Experience selectors. The full generated-consumer browser matrix remains pending; the gallery smoke pass is not claimed as six-viewport coverage.

## Authored-world assessment

- **Composition:** Home is a numbered mission board with one trip-level readiness anchor, authored reservation facts, and pre-departure tasks. Experience keeps the real map persistent between a mission index and a bounded stage sheet.
- **Identity:** Numbered mission tokens, stage-list rules, squared map markers, hard ink borders, and offset shadows carry the identity. The accent is replaceable; the structure remains legible in grayscale.
- **Map grammar:** The profile is flat, low-density, and high-contrast. Marker numbers, selected/completed treatments, route casing, and walking/transit/flight tuples are separate structural signals. Uncertain or unavailable routes use dash grammar rather than color alone.
- **Interaction:** Candidate choice is an explicit single-selection panel over the persistent map with separate cancel/confirm actions. Shopping uses a native select; reservations and tasks use native dialogs; route and map failures expose explicit retry actions; itinerary snaps are real buttons.
- **States:** Empty, memory-only, candidate, shopping, reservation, task, route-error, and map-error states are represented in the recipe-owned source. Setup, loading, and fatal states use the same outline language without invented scores or achievements.
- **Motion and accessibility:** The manifest uses a 180ms interruptible transition and an instant reduced-motion path. Pressed controls displace by 2px, focus is visible, controls use 44px targets, forced-colors rules retain borders/labels/dash grammar, and the layout includes a 200% text-flow mode.

## Verification evidence

- `tests/generation/reset-arcade.test.ts` and the authored-world, recipe-v2, and Field Atlas suites: **131/131 tests passed** in the latest focused run.
- Root TypeScript check: **passed**.
- The exact staged starter consumer was previously composed without reinstalling dependencies and passed **152 tests**, type-check, ESLint, and the Vite production build. The recipe entry alias was then added to match the plan's `presentation/home/ResetArcadeHome.tsx` path; the composed gate should be rerun in an environment that permits the normal staging/install flow.
- Static source checks: no remote URLs, gradients, backdrop blur, continuous keyframes, or recipe assets; the recipe declares `features: []` and system fonts only.

## Browser matrix (gallery smoke-tested; full matrix pending)

The required matrix remains `320`, `390`, `430`, `768`, `1024`, and `1440` CSS-pixel widths, covering Home, default/expanded Experience, candidate, reservation, task, shopping, setup, loading, fatal, route-error, map-error, all sheet snaps, keyboard-only focus/restore, 200% text, forced colors, reduced motion, grayscale, and accent replacement. Those checks remain pending rather than passed; the current evidence is limited to the interactive gallery's desktop smoke pass.

## Provenance and customization

No Codex Resets or Playdate assets, screenshots, logos, proprietary fonts, or trade dress were copied. The recipe is locally owned and documents token, component, presentation-tree, and full-UI replacement paths; it adds no npm theme dependency or runtime theme selector.
