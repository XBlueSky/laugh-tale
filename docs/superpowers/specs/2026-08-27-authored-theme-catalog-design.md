# Authored Theme Catalog Design

## Status and decision

This document supersedes the three-recipe catalog described in
`docs/specs/laugh-tale-eternal-pose-plugin-design.md` and
`plugins/eternal-pose/skills/eternal-pose/references/design-recipes.md`.
The package boundary, semantic trip model, map-first behavior, privacy rules,
and user-owned UI contract from the earlier specifications remain
authoritative unless this document explicitly extends them.

The approved direction is a breaking replacement of the current CSS-skin
catalog with six authored presentation recipes:

1. `field-atlas`
2. `reset-arcade`
3. `pocket-instrument`
4. `vacation-os`
5. `memory-cinema`
6. `live-journey`

The old `quiet-wood`, `sticker-brutalist`, and `native-minimal` recipe IDs,
directories, documentation, and tests are deleted. There are no aliases,
deprecated entries, compatibility shims, or automatic migrations. An old ID
is simply an unknown recipe after this change. Already-generated repositories
are unaffected because their visible UI and CSS are local, user-owned files.

The default recipe becomes `field-atlas`.

## Problem

The existing catalog applies three standalone CSS files to one shared React
composition. Color, border, radius, shadow, and typography can vary, but the
home page, map workspace silhouette, itinerary row structure, interaction
rhythm, map configuration, and information hierarchy remain substantially the
same. This produces three recognizable skins, not three distinct products.

That limitation is structural:

- all recipes target the same JSX and class names;
- `recipe.json` describes only identity, one CSS file, register, and motion;
- the Google map always mounts with `DEMO_MAP_ID`;
- route colors and weights are hard-coded in `GoogleMapAdapter`;
- map marker structure is created inside the provider;
- the trip schema has no optional media for photography-led presentation;
- layout constants in `TripExperience` assume one header and sheet grammar.

Adding more tokens to this arrangement would create more polished skins but
would not satisfy the requirement that each theme have a memorable visual
world of its own.

## Goals

The theme system must:

1. Generate a polished product without requiring the user to design anything.
2. Make each recipe identifiable by composition and interaction, even after
   its palette is changed or the screenshot is viewed in grayscale.
3. Keep `@laugh-tale-island/core` framework-neutral and
   `@laugh-tale-island/react` headless.
4. Copy only one selected presentation into the generated repository.
5. Give the generated repository full ownership of visible JSX, CSS, icons,
   wording, assets, layout, and provider presentation.
6. Support progressive customization: tokens, individual components, full
   presentation replacement, or a completely new UI.
7. Preserve the protected trip, route-owner, map/list synchronization, sheet,
   focus, reduced-motion, and accessibility behaviors.
8. Let map presentation participate in a theme while degrading honestly when
   a provider-specific custom basemap is not configured.
9. Let media-aware themes use optional local media without making media a
   requirement for valid trip data.

## Non-goals

This change does not:

- publish a starter-theme npm package;
- add a runtime theme switcher;
- ship all six themes to a generated site;
- make recipe selection part of the semantic trip schema;
- require users to keep the generated folder structure;
- make Eternal Pose restore a recipe over later user customizations;
- add Mapbox, MapLibre, or another map provider;
- copy proprietary fonts, logos, screenshots, illustrations, or signature
  brand assets from reference products;
- recreate reference websites one-for-one;
- make decorative novelty more important than task completion.

## Chosen architecture

Three approaches were considered.

### Rejected: one DOM plus larger CSS skins

This is the cheapest approach and preserves the current implementation, but it
cannot create a different information hierarchy, responsive silhouette, map
grammar, component vocabulary, or interaction model. It fails the primary
goal.

### Chosen: shared behavior plus authored presentation recipes

Behavior orchestration and protected contracts are shared. A recipe supplies a
complete visible presentation that consumes a stable view-model/action
contract. Each presentation can use different markup and internal components
without reimplementing selection, progress, route, geolocation, candidate, or
sheet state machines.

This boundary gives the catalog meaningful visual range while keeping defects
and protected behavior centralized.

### Rejected: six independent full starters

Independent starters allow unlimited divergence, but they duplicate provider
setup, application state, route lifecycles, fixtures, behavior tests, and bug
fixes. They would quickly become six applications with inconsistent contracts.

## Repository boundaries

The generated React project keeps five responsibilities separate:

```text
src/
├── app/                    application entry and home/experience routing
├── controllers/            presentation-neutral orchestration and view models
├── presentation/           the selected recipe; all visible UI lives here
├── providers/              Google and fake provider implementations
└── trip-content/           user-owned trip data and optional media references
```

These top-level responsibility boundaries and the dependency direction are
fixed. Recipe-owned files below `presentation/` may use any internal structure:

```text
core + react packages
        ↓
local controllers + providers
        ↓
selected local presentation
```

The presentation must not be imported by a package, controller, core model, or
provider-neutral contract. A presentation may import its local controller
types and use the headless packages directly for deliberately custom behavior.

### Presentation-neutral controllers

The current `TripExperience` mixes orchestration, layout constants, provider
lifecycle, and visible JSX. It is split by responsibility.

Controllers own:

- resolving days, current and next nodes, and effective itinerary state;
- composing selection, progress, route, location, candidate, and sheet hooks;
- coordinating provider mount, render, focus, fit, and padding;
- deriving stable, localized-neutral view models;
- exposing actions and prop-getters needed to preserve keyboard, pointer,
  focus, and ARIA behavior;
- measuring viewport and safe-area facts without choosing visual proportions.

Presentations own:

- DOM structure and landmarks;
- visible labels and content hierarchy;
- header, home, map chrome, sheet, timeline, renderer, reservation, task, and
  decision components;
- responsive layout and visual geometry within controller-provided safety
  constraints;
- icons, typography, CSS, assets, animation, and theme-specific empty states;
- the selected map visual profile.

A theme can replace the familiar top-header/bottom-sheet composition with a
window, instrument, editorial, or live-status composition. It cannot discard
the semantic state or accessibility exposed by the controller contract unless
the user later chooses to replace the whole experience intentionally.

## Recipe v2 contract

Every recipe directory is a complete compile-time presentation source:

```text
recipes/<id>/
├── recipe.json
├── README.md
├── presentation/
│   ├── index.ts
│   ├── home/
│   ├── experience/
│   ├── components/
│   ├── styles/
│   └── theme-map-profile.ts
├── assets/                 optional, locally shippable assets only
└── provider-guides/
    └── google-map-style.json   optional Cloud style import source
```

The exact internal component folders are recipe-owned. Only the presentation
entry contract and declared files are stable.

`presentation/index.ts` exports one `TripPresentation` object satisfying the
local controller contract. It supplies the Home, Experience, Setup Required,
Loading, and Fatal Error views plus the recipe's map visual profile. Each view
receives a presentation-neutral view model and action/prop-getter object; it
does not receive a controller instance or provider SDK object. This is the
only stable TypeScript boundary between shared orchestration and recipe-owned
visible UI.

`recipe.json` uses `schemaVersion: 2` and records:

- `id`, `label`, `summary`, and `register`;
- the presentation source directory and entry module;
- required CSS and optional asset roots;
- the map visual profile and optional Google style guide;
- motion duration, easing, interruption, and reduced-motion policy;
- supported presentation features such as media, desktop windows, or dense
  telemetry;
- font policy (`system` or locally bundled redistributable open-license
  assets, including the corresponding license file);
- recipe-specific validation and screenshot cases.

Manifest paths must be relative, normalized, root-contained, and free of
symlink traversal. Unknown schema versions, duplicate IDs, missing declared
files, or escaping paths fail catalog validation before generation begins.

### Composition flow

The committed starter remains a directly runnable Field Atlas draft. The
Field Atlas recipe is the canonical source for its `src/presentation` tree, and
a deterministic check proves the committed starter presentation is identical
to applying that recipe.

Generation occurs in a temporary directory:

1. Validate the selected recipe and destination preconditions.
2. Copy the base starter into a temporary sibling directory.
3. Replace only generator-owned presentation and theme-asset paths in the
   temporary copy.
4. Copy the selected recipe presentation and assets.
5. Record recipe ID and recipe schema version in `eternal-pose.json`.
6. Validate, type-check, test, and build the composed project as required by
   the create workflow.
7. Publish the completed directory atomically to the requested destination.

The operation never deletes or overwrites a non-empty user destination. Update
and Restyle inspect the actual user-owned repository and do not replay this
composition flow unless the user explicitly authorizes a full replacement.

## Customization contract

Generated UI is source code, not a runtime dependency. Four customization
levels are explicitly supported:

1. **Token customization** — change color, typography, density, shapes, and
   motion through the selected presentation's documented semantic tokens.
2. **Component customization** — replace a marker, row, header, renderer,
   window, media frame, or other local component.
3. **Presentation customization** — replace the entire `presentation` tree
   while keeping controllers, providers, and headless packages.
4. **Full UI replacement** — delete the generated app, controllers, or folder
   layout and build a new UI directly on the headless packages or another state
   organization.

Eternal Pose treats all four as valid. Audit checks protected observable
contracts rather than comparing the repository to the starter. An update must
not restore deleted starter components, class names, or recipe tokens.

## Authored-world quality gate

A recipe is not accepted merely because it has a new palette. It must differ
from the default in at least four of the following seven dimensions, and
composition plus map presentation are mandatory differences:

1. composition and responsive silhouette;
2. typography and information-density rhythm;
3. component shape, border, and elevation language;
4. map, marker, route, and location presentation;
5. iconography and status-indicator language;
6. state-driven motion and interaction feedback;
7. imagery, media, or content-framing language.

Each theme must also:

- feel coherent across home, active map workspace, expanded itinerary,
  decisions, tasks, reservations, empty states, loading, and errors;
- retain its identity in grayscale and after its accent color is replaced;
- have one memorable focal idea instead of making every component loud;
- use familiar product affordances for standard actions;
- avoid decorative motion, fake controls, gratuitous glassmorphism,
  cyan-purple gradients, generic bento dashboards, and card grids without a
  product reason;
- include explicit anti-patterns in its README.

## Theme catalog

The references below are sources of principles, not assets to copy.

### `field-atlas` — default

**Product idea:** the trip is a precise contemporary expedition atlas.

**Signature:** a map grid, indexed stops, coordinate-like metadata, a
fold-out legend, and route bands create the silhouette. The itinerary reads as
the map's legend rather than a generic stack of cards.

**Home:** a trip folio with one dominant route overview, an indexed day grid,
readiness facts, and compact reservations. It resembles an information-rich
atlas cover, not a beige scrapbook.

**Experience:** the map remains the primary surface. Day navigation behaves
like an atlas index. Expanded itinerary content uses strong rules, numbered
entries, route keys, and asymmetrical information bands.

**Map:** topographic or mineral-inspired basemap guidance; clear land/water and
road hierarchy; numbered markers; selected routes with decisive weight;
recomposed or uncertain routes use a distinct non-color pattern when the
provider supports it.

**Motion:** short index and fold transitions that communicate state. No paper
flutter, page-curl theater, or scroll choreography.

**Avoid:** faux aged paper, stamps, torn edges, script fonts, field-notebook
e-commerce styling, and low-contrast brown-on-beige surfaces.

**Reference principles:** National Park Service Unigrid structure, Atlas of
Design cartographic range, Felt's map-first tool hierarchy, and Mapbox styles
such as American Memory, Finland Topo, Mineral, and Standard Oil Company.

### `reset-arcade`

**Product idea:** the trip is a playful mission-select screen that is ready to
be acted on.

**Signature:** strong ink borders, hard offset shadows, mission numbers,
score-like progress, compact pattern fields, and tactile pressed states.

**Home:** days are missions with visible readiness and progress. One bold
trip-level status anchors the screen; the rest supports it.

**Experience:** the map is a game board without becoming a game. Stops are
large numbered tokens, the active route is unmistakable, and the itinerary is
a stage list with conventional buttons and disclosures.

**Map:** restrained flat basemap, high-recognition tokens, and one clear route
signal. Color is limited so status semantics remain readable.

**Motion:** brief press displacement, selected-token spring, and progress
change feedback. Motion is interruptible and removed under reduced motion.

**Avoid:** all-pixel body copy, neon cyberpunk, random rotations, bouncing
everything, fake scores, and novelty controls with unclear affordance.

**Reference principles:** Codex Resets' outlined modular language, Playdate's
toy-like physical confidence and one-bit discipline, and arcade-kiosk graphic
systems.

### `pocket-instrument`

**Product idea:** the trip is a compact precision instrument carried in one
hand.

**Signature:** hardware-panel modules, fine grid lines, tiny mono annotations,
status lamps, tactile control surfaces, and a measured density contrast between
telemetry and primary actions.

**Home:** readiness, reservations, and days form an instrument rack. Current
state and unresolved items read as functional indicators, not decoration.

**Experience:** the map is the instrument's main display. The timeline becomes
a compact channel strip with readable time, state, and action separation.

**Map:** monochrome technical basemap guidance; thin secondary routes; a
single signal color for active route and current location; marker geometry
resembles calibrated controls without imitating proprietary hardware.

**Motion:** 150–220 ms indicator, latch, and mode transitions. No ambient
blinking or decorative scanner effects.

**Avoid:** illegible microcopy, invented knobs for ordinary buttons, excessive
terminal styling, cyberpunk glow, and using dot-matrix type for body content.

**Reference principles:** Teenage Engineering's industrial product grammar and
Nothing OS's monochrome micrographics, transparent information widgets, and
hardware/software consistency.

### `vacation-os`

**Product idea:** the trip is a sun-faded vacation desktop with useful apps
already open.

**Signature:** Map, Itinerary, Reservations, and Tasks are functional windows
on a resort-like desktop. A dock exposes real navigation. Window chrome and
content share one compact visual grammar.

**Home:** the desktop is the overview; day files and readiness documents open
into actual product surfaces. Decorative icons do not replace navigation
labels.

**Experience:** desktop widths can show coordinated map and itinerary windows.
On mobile, exactly one window is active and a bottom dock or tab bar switches
surfaces. Mobile does not simulate tiny draggable desktop windows.

**Map:** posterized coastal/resort guidance with legible labels and strong
window framing. Provider attribution and map controls remain unobstructed.

**Motion:** window open, focus, minimize, and dock selection only when those
states are functional. There are no fake close or resize buttons.

**Avoid:** unusable nostalgia, CRT filters over text, fake system dialogs,
unbounded draggable windows, tiny hit targets, or duplicating Windows/macOS
trade dress.

**Reference principles:** Poolsuite's vacation-computer world and PostHog's
functional desktop-workspace metaphor.

### `memory-cinema`

**Product idea:** the trip is a film being remembered, with geography keeping
the story grounded.

**Signature:** cinematic image frames, a film-strip timeline, restrained
captions, map-to-memory transitions, and large asymmetric media passages.

**Home:** one trip cover, selected memories, route shape, and day chapters
replace a dashboard grid. Photography carries color when available.

**Experience:** the map remains continuously reachable and synchronized with
the timeline. Selecting a stop can reveal its media frame; selecting a frame
focuses the corresponding map owner.

**Map:** subdued basemap guidance that lets routes and media markers lead.
Photo availability never hides operational route, timing, or reservation
facts.

**Media fallback:** media is optional. With no usable image, the presentation
uses a deterministic map poster, route crop, chapter number, and place title.
It never downloads random stock imagery or leaves an empty gray card.

**Motion:** state-driven frame change, map focus, and chapter transition.
Reduced motion switches immediately with no crossfade dependency.

**Avoid:** social-feed cloning, equal-card masonry, fake film grain over all
text, low-contrast captions, automatic slideshows, and making basic trip data
dependent on photography.

**Reference principles:** Cosmos' visual curation, Polarsteps' map and journey
recap, and photography-first editorial systems such as Lightship.

### `live-journey`

**Product idea:** the trip is a live operational surface focused on what is
happening now.

**Signature:** a dominant current/next status, countdown and disruption
signals, route progress, compact telemetry, and calm supporting history.

**Home:** the nearest actionable fact leads. Readiness and reservations are
ordered by urgency rather than placed in decorative feature cards.

**Experience:** the live card, active map route, and current itinerary entry
form one synchronized system. Completed history recedes; future items remain
scannable.

**Map:** neutral high-legibility basemap guidance, semantic current/selected/
completed/unavailable routes, and clear progress without decorative color.

**Motion:** 150–250 ms state transitions for route progress, alerts, selected
entry, and sheet changes. No orchestrated load sequence.

**Avoid:** generic native-minimal styling with no point of view, decorative
dark mode, alert color used as brand color, excessive live pulsing, or hiding
important states inside modal dialogs.

**Reference principles:** Flighty's live flight hierarchy, Apple Live
Activities' glanceable state model, and Citymapper's task-oriented journey
flows.

## Map presentation contract

Map presentation has two layers.

### Provider-neutral visual profile

Each recipe supplies local presentation values for:

- marker structure and semantic tones;
- user-location treatment;
- route color, opacity, width, casing, and optional pattern by state;
- map control placement and theme-specific chrome;
- desired basemap mode, density, contrast, and point-of-interest emphasis;
- fallback values for providers that cannot render an optional treatment.

Semantic owner IDs and route tones remain defined by core. A recipe maps those
semantics to visuals but cannot change ownership or invent provider facts.

### Google-specific configuration

The Google adapter accepts injected visual configuration instead of hard-coded
route values and `DEMO_MAP_ID`.

- `VITE_GOOGLE_MAP_ID` selects the user's Cloud-configured style when present.
- `DEMO_MAP_ID` remains a development fallback needed for advanced markers.
- A recipe may provide a JSON style guide that the user can import into Google
  Cloud and associate with their own map ID.
- The plugin never ships a shared production map ID or promises that a Cloud
  style is active when it is not.
- Marker and route overlays still express the recipe when only the neutral
  demo basemap is available.

An unavailable aesthetic capability is a graceful visual fallback, not a trip
error. Missing API credentials, billing, or provider setup remains an honest
configuration state.

## Optional media extension

The core trip model gains an additive, provider-neutral media primitive for the
Memory Cinema presentation and user-authored custom themes.

- A trip may declare one optional cover asset.
- A node may declare an ordered list of optional media assets.
- An asset records a project-relative source or an explicit HTTPS source,
  required non-empty alternative text, and optional caption and attribution.
  Other URL schemes are invalid.
- Media does not affect scheduling, route ownership, progress, or validity of
  an otherwise valid node.
- Core validates structure but never downloads, probes, transforms, or caches
  media.
- Generated demo assets must be original or carry a compatible license and
  attribution. Remote stock services are not runtime dependencies.

An image load failure invokes the presentation's deterministic fallback. It
does not remove the stop, break selection, or produce an infinite retry loop.

## Responsive and accessibility requirements

Every recipe must satisfy the same product contract:

- complete operation at 320, 390, and 430 CSS-pixel mobile widths;
- desktop validation at 768, 1024, and 1440 pixels where the composition
  changes materially;
- no horizontal overflow at 200% text zoom;
- 44-by-44 CSS-pixel minimum touch targets;
- WCAG AA contrast for body, metadata, selected, disabled, semantic, and map
  overlay states;
- visible keyboard focus and logical focus order;
- screen-reader names and relationships independent of visual layout;
- keyboard-operable sheet/window/tabs without gesture-only actions;
- usable forced-colors treatment;
- zero-duration or equivalent reduced-motion paths without loss of state;
- safe-area, browser toolbar, and viewport-resize handling;
- map attribution and provider controls must remain visible and operable.

Display typography may be expressive on the home page. Buttons, labels,
timing, reservations, errors, and dense product content must remain readable
and use a product-appropriate face.

## Failure handling

- Unknown or removed recipe IDs fail before destination creation and list the
  six valid IDs.
- Invalid manifests or escaping paths fail catalog validation with the recipe
  and field named.
- Missing presentation exports fail composition before publication.
- Composition, type-check, test, or build failure leaves no partial generated
  destination.
- Missing optional assets fail recipe validation when declared and use a
  documented runtime fallback when user media later fails to load.
- Missing custom Google map ID uses the documented neutral basemap fallback;
  missing Google credentials uses the existing setup-required experience.
- Unsupported optional map effects fall back by semantic state and never make
  a route disappear.

## Testing strategy

### Catalog and composition

- Validate exactly six unique recipe IDs and schema versions.
- Assert that all declared paths are root-contained and files exist.
- Compose each recipe into an isolated temporary consumer.
- Assert that only the selected recipe and its assets appear in output.
- Assert that the Field Atlas recipe and committed default presentation are
  identical.
- Assert removed IDs are rejected and are absent from docs and selectors.

### Type and behavior

- Type-check and build all six composed consumers.
- Reuse controller contract tests across every presentation.
- Keep package tests for selection, progress, route lifecycle, candidates,
  geolocation, and sheet behavior independent of recipes.
- Run map/list ownership, current/next, route focus, candidate preview,
  progress, and retry scenarios against every presentation entry.

### Accessibility and responsive UI

- Run automated accessibility checks on home, map workspace, expanded detail,
  decision, error, and setup-required states for all recipes.
- Verify keyboard operation, focus restoration, 44-pixel targets, text zoom,
  reduced motion, and forced colors.
- Capture deterministic screenshots at 320, 390, 430, 1024, and 1440 pixels;
  desktop-only differences may use a documented subset where appropriate.
- Add computed-style assertions for selected and semantic surfaces, including
  the existing Quiet Wood-style cascade failure class of regressions.

### Authored-world review

Automated snapshots cannot decide whether a theme is distinctive. Before a
recipe is accepted, review its home, default experience, and expanded
experience side by side and record that:

- composition and map grammar differ from Field Atlas;
- at least four authored-world dimensions differ;
- the theme remains identifiable without its accent color;
- no reference product asset or trademarked trade dress was copied;
- function, density, and readability remain credible product UI.

## Delivery sequence

All six recipes are in scope. Work is sequenced internally, but the supported
catalog cuts over atomically. There is never a released or documented state
that exposes both old and new IDs, nor a state that claims a six-recipe catalog
while only part of it exists.

### Foundation and theme construction

1. Introduce recipe v2 validation and deterministic composition behind the
   existing supported catalog.
2. Split presentation-neutral controllers from visible UI.
3. Add injected map presentation and Google map ID configuration.
4. Build and validate `field-atlas` as the canonical starter presentation.
5. Build and validate `reset-arcade` and `live-journey`.
6. Build and validate `pocket-instrument`.
7. Build and validate the responsive functional-window contract for
   `vacation-os`.
8. Add optional media and build `memory-cinema` with its no-media fallback.

Theme directories under construction are implementation-internal and are not
selectable or described as supported recipes before cutover.

### Atomic catalog cutover

9. Expose exactly the six v2 recipes and make `field-atlas` the default.
10. In the same cutover, delete the three old recipe directories, IDs, tests,
    selector entries, and current documentation. Add no alias or migration
    path.
11. Update plugin guidance, root documentation, starter contracts, examples,
    and recipe selection prompts to describe authored presentation recipes.

### Catalog hardening

12. Run the six-recipe build, behavior, accessibility, responsive, visual,
    and staged-generation matrix against the cutover catalog.

The implementation plan may group adjacent steps into reviewable tasks, but a
recipe is not shipped until its full cross-state and responsive matrix passes.
There is no compatibility phase for old recipe IDs.

## Success criteria

The work is complete when:

1. A new project can select any of the six recipes and receives only that
   presentation.
2. The default generated project is a polished Field Atlas experience.
3. The six themes are visibly different in composition and map grammar, not
   merely in palette.
4. No theme package or runtime selector is added.
5. Users can customize tokens, components, the whole presentation, or the
   whole UI without forking a styled runtime package.
6. The headless packages remain free of visible JSX, CSS, icons, copy, and
   recipe assets except for the additive semantic media type in core.
7. Custom Google map IDs and route/marker visuals are injectable, with honest
   neutral fallback behavior.
8. Memory Cinema remains complete and useful without photos.
9. All protected behavior, accessibility, responsive, build, and staged
   generation gates pass for all six presentations.
10. The old recipe IDs and compatibility machinery do not exist anywhere in
    the supported catalog.

## Research references

- Product-flow libraries: [Mobbin](https://mobbin.com/),
  [Refero](https://refero.design/), [Page Flows](https://pageflows.com/),
  [Nicelydone](https://nicelydone.club/), and
  [SaaSFrame](https://www.saasframe.io/).
- Visual-direction libraries: [Recent](https://recent.design/),
  [Land-book](https://land-book.com/),
  [SiteInspire](https://www.siteinspire.com/), and
  [Awwwards](https://www.awwwards.com/websites/).
- Map references: [Mapbox Gallery](https://www.mapbox.com/gallery),
  [Felt interface](https://help.felt.com/getting-started/tour-the-interface),
  and [NPS Unigrid specifications](https://npshistory.com/brochures/unigrid.pdf).
- Product references: [Codex Resets](https://codex-resets.com/),
  [Playdate](https://play.date/),
  [Teenage Engineering](https://teenage.engineering/products),
  [Nothing OS](https://us.nothing.tech/nothing-os),
  [Poolsuite](https://poolsuite.net/), [Cosmos](https://www.cosmos.so/),
  [Polarsteps](https://www.polarsteps.com/), and
  [Flighty](https://flighty.com/).
- Google provider constraints:
  [Map ID overview](https://developers.google.com/maps/documentation/javascript/map-ids/mapid-over),
  [map customization](https://developers.google.com/maps/documentation/javascript/map-ids/customize-maps-overview),
  and [advanced markers](https://developers.google.com/maps/documentation/javascript/advanced-markers/start).
