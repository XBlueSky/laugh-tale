# Eternal Pose v2 Tokyo / Oak & Washi Flagship Design

## Status

- Date: 2026-09-04
- Status: approved for implementation planning
- Target: the long-lived Eternal Pose 2.0 branch created from the accepted
  Tokyo baseline
- Baseline evidence: docs/audits/2026-09-tokyo-baseline-parity.md
- Governing decisions: ADR-0001 through ADR-0006

This design was approved section by section. It defines the first Eternal Pose
2.0 delivery milestone and the contract that later authored presentations must
share. It does not authorize implementation until a separate execution plan
has been reviewed.

## Product decision

Eternal Pose 2.0 treats the no-theme path as the flagship path. A user who
provides an itinerary and does not request visual customization receives a
production-ready trip site whose interaction feel, visual craft, and map/list
choreography meet the standard of the hand-built tokyo-trip-map benchmark. The
current 1.0 generated Tokyo site is baseline evidence, not the intended product
quality.

The v2 catalog will ultimately contain exactly four complete authored
presentations:

1. oak-washi, shown as **Tokyo / Oak & Washi**, and selected by default;
2. manga-parade;
3. postcard-companion;
4. pocket-quest.

This milestone implements and releases only oak-washi. The other three may not
be selectable, documented as available, or represented by hand-authored gallery
approximations until each passes the same contract and quality sign-off.

The first milestone follows a faithful-port strategy. The benchmark's
composition, density, typography hierarchy, marker grammar, map treatment,
sheet choreography, and interaction feel are reproduced before further visual
reinterpretation. The port must be trip-content-neutral: it carries the
benchmark's product grammar, never its private facts or Tokyo-specific
assumptions.

## Compatibility and release scope

Eternal Pose 2.0 is a clean breaking release.

- Existing 1.0 generated sites remain pinned to their current source and
  dependencies.
- There is no automatic migration, ownership-aware rewrite, recipe alias, or
  compatibility shim in this milestone.
- The 1.0 recipes quiet-wood, sticker-brutalist, native-minimal, and field-atlas
  retire without aliases.
- The paused wander-collage default is replaced by oak-washi; it is not an
  additional catalog entry.
- URL and deep-link state remain out of scope as required by ADR-0002.

The absence of a 1.0 migration is deliberate. It keeps the first milestone
focused on a correct new-project contract and avoids rewriting presentation
source already owned and possibly edited by users.

## Goals

1. Make oak-washi the polished default when a user supplies no visual
   direction.
2. Match the benchmark's active trip experience closely enough that a manual
   phone side-by-side does not read as a lower-quality implementation.
3. Centralize semantic behavior, adapter lifecycles, choreography, and camera
   policy so future presentations cannot silently reimplement them.
4. Keep all visible JSX, CSS, copy, icons, and visual assets in the generated
   project.
5. Produce the same presentation source in the recipe, runnable starter, and
   Tokyo flagship, with differences restricted to documented trip-content.
6. Make route, place, timing, progress, and provider states truthful under
   success, uncertainty, and failure.
7. Establish automated and manual acceptance strong enough to gate all four
   eventual themes.

## Non-goals

This milestone does not:

- migrate or rewrite an existing 1.0 generated project;
- implement manga-parade, postcard-companion, or pocket-quest;
- add a runtime theme selector or ship multiple presentations in one generated
  site;
- put visible components, CSS, copy, icons, fonts, or theme assets in npm
  packages;
- add a second map provider;
- add URL/deep-link synchronization;
- add dark mode;
- copy private itinerary facts, credentials, build or binary artifacts, or
  unlicensed third-party assets from the benchmark;
- generalize logistics grouping into arbitrary nested authored groups;
- infer missing facts merely to make a fixture or screenshot look complete.

ADR-0003 explicitly permits the benchmark's authored behavior, controller,
viewport, adapter, test, and visual-token work to be lifted and refactored.
This design preserves that permission. The prohibition is against private
content and unrelated artifacts, not against using the product's own behavior
source.

## Architecture approaches considered

### Chosen: coarse-grained injected TripPresentation

The React package owns a headless trip controller and publishes one versioned
presentation seam. A selected recipe implements the complete visible
presentation over semantic model, actions, and bindings values. It can replace
composition and markup without gaining access to raw controller state or a
provider SDK.

This is the shortest safe route from the current unpublished presentation
contract to benchmark parity. It also gives each later theme a complete sibling
implementation rather than forcing every theme through one visible shell.

The principal risk is a growing props contract. The design controls that risk
by grouping the view model by domain, publishing contract tests, and exposing
derived semantic projections rather than raw application state.

### Rejected: feature-sliced presentation ports

This approach would publish separate Map, Sheet, Timeline, Candidate, and
similar ports for themes to arrange. It localizes individual additions, but
multiplies public wiring and ref-registration points. That makes it easier for
a theme to omit a protected behavior and adds a large contract surface before
the first flagship is proven.

### Rejected: external store, selectors, and command protocol

This approach would expose canonical runtime state plus selectors and commands,
leaving every generated presentation to construct its own view-model bridge.
It offers maximum composition freedom, but recreates the exact failure mode
2.0 is meant to remove: generated code can derive different meanings for
current, next, focus, fit, route ownership, or uncertainty.

## Dependency and ownership model

    @laugh-tale-island/core
      domain truth, semantic projection, reducers, policies, intents
                             |
                             v
    @laugh-tale-island/react
      headless controller, React effects, DOM and layout bindings
                             |
                             v
            semantic model + actions + bindings
                             |
                             v
    generated local presentation
      JSX, CSS, copy, icons, map profile, visible motion

    @laugh-tale-island/adapters/google
      implements the neutral browser adapter contracts

    @laugh-tale-island/testing
      drives the same contracts with deterministic fakes and fixtures

Dependencies may only point downward through these boundaries. A package may
never import a generated presentation. A presentation may not reach through
the seam to a controller instance or Google object.

### Core package

The core package remains framework-neutral and owns:

- the v2 Trip model and validation;
- authoritative locale, timezone, schedule, and live-state calculations;
- candidate resolution and progress reduction;
- stable node, route, candidate, and group ownership;
- timeline projection and presentation roles;
- place-resolution and route-runtime state types;
- map place/route semantic projections;
- pure camera, fit, focus, and outlier policies;
- pure choreography state machines and intents;
- neutral browser adapter interfaces exposed from the core/browser subpath;
- a serializable TripNavigationState and neutral TripNavigationStore seam for
  a later URL-state adapter.

Core does not own DOM measurement, provider SDK lifecycles, JSX, localized UI
copy, or visual geometry.

TripNavigationState contains only the active surface, selected day, and
selected semantic owner. The v2 milestone uses an in-memory store; it does not
implement URL parsing or writing. The seam exists now so a later URL adapter
does not require replacing TripController or changing presentation actions.

### React package

The React package remains visually headless and owns:

- an invisible TripController used by the generated starter;
- useTripExperience as the advanced composition escape hatch;
- minute-clock and viewport effects;
- adapter lifecycle, cancellation, staleness, and retry coordination;
- sheet pointer capture, requestAnimationFrame drag coalescing, snap control,
  and keyboard stepping;
- layout measurement and safe-area/visual-viewport observation;
- focus ownership and restoration;
- execution of core camera and choreography intents;
- the versioned TripPresentationV2 contract.

The existing six 1.0 hooks are not a compatibility promise. An individual hook
remains public only if the v2 implementation demonstrates a supported custom
composition use case for it.

### Adapters package

The package exposes one provider subpath in this milestone:
@laugh-tale-island/adapters/google.

It owns the Google implementations of map, routes, places, and navigation,
including capability declarations and structured failures. The Google SDK is
an optional peer dependency loaded only through the Google subpath. Neither
core nor React depends on it.

Google Places support includes capability-gated opening-hours data because the
benchmark exposes that product behavior. Unknown, incomplete, overnight, and
timezone-sensitive hours remain explicit; absence of hours never becomes an
open claim. Google transit output may expose duration and line facts when
present, but realtime status is never invented.

Enrich-time place search uses a separate Node-safe provider boundary. The
@laugh-tale-island/core/enrichment subpath publishes a framework-neutral
PlaceSearchAdapter contract and query/provenance policy;
@laugh-tale-island/adapters/google/node implements it with Google's server API
and never imports the browser Maps SDK. The Eternal Pose plugin orchestrates
that adapter but does not implement a second Google client. Browser runtime
construction continues to use @laugh-tale-island/adapters/google.

The two credential capabilities are deliberately separate. The generated
browser reads the public, referrer-restricted VITE_GOOGLE_MAPS_API_KEY. Enrich
reads ETERNAL_POSE_GOOGLE_PLACES_API_KEY from the command environment, never
copies it into Vite configuration or a review artifact, and fails explicitly
when the key lacks the required server-side capability.

### Testing package

The testing package owns:

- fake map, route, place, navigation, clock, and persistence adapters;
- adapter conformance suites;
- a provider-neutral synthetic trip fixture;
- adversarial route and place fixtures;
- the experience contract and presentation driver;
- deterministic viewport, clock, locale, progress, and provider state setup.

The synthetic fixture covers behavior not exercised by the Tokyo itinerary. It
must not contain benchmark private facts. A test-only alternate presentation
proves the public seam has not hard-coded Oak & Washi composition, but it is not
a shippable recipe.

Core, React, adapters, and testing publish as one lockstep version train. Their
cross-package dependencies use the same exact release version so a generated
site cannot accidentally assemble an untested contract combination.

The package graph is acyclic and fixes both dependency placement and publish
order:

- core has no Eternal Pose package dependency;
- react has an exact runtime dependency on core and peer dependencies on React
  and React DOM;
- adapters has an exact runtime dependency on core and no dependency on react
  or testing;
- testing is a leaf with exact dependencies on core, react, and adapters plus
  its test-runtime peers; no production package imports it;
- a generated site lists core, react, and adapters as exact production
  dependencies and testing as an exact dev dependency.

Publication therefore orders core first, react and adapters next, testing
after both, and default-branch plugin promotion only after exact-registry
verification. Lockstep versioning does not imply a dependency cycle or allow
duplicate incompatible core instances.

### Generated project

The generated project has three primary owned areas:

    src/
    ├── app/              entry, runtime configuration, and composition
    ├── presentation/     selected theme's complete visible source
    └── trip-content/     authored trip and committed enrichment output

Provider implementation code no longer lives in each generated project. The
project retains explicit provider construction and environment configuration
so credentials and capabilities remain visible to the owner.

The local presentation owns every pixel: Home, Experience, Setup Required,
Loading, Fatal Error, map chrome, rows, pins, dialogs, CSS, copy, iconography,
and motion styling. It may not recompute timeline meaning, current/next state,
camera policy, route validity, or adapter failures.

## Canonical presentation and repository invariants

plugins/eternal-pose/recipes-v2/oak-washi/presentation is the canonical visible
source.

- Applying the recipe must reproduce the starter presentation byte for byte.
- The committed starter remains directly runnable and is checked against the
  recipe rather than edited independently.
- examples/tokyo is generated from the same source. Its allowed differences
  are confined to trip-content: Tokyo itinerary data, committed public place
  resolutions, and structurally equivalent fictitious private facts.
- Runtime composition and provider configuration outside trip-content are
  identical between the starter and flagship.
- Generated output contains one presentation only.
- Gallery evidence, when added, must be rendered from the real recipe output.

The generator and equivalence tests own the mechanical synchronization. Human
contributors and agents edit the canonical recipe, never three independent
copies.

## Map rendering boundary

The map boundary is split so provider mechanics can be packaged without
putting visible markers in a package.

The core/browser subpath owns only provider-neutral types:

- MapVisualProfile for basemap guidance and route-style values;
- MarkerDescriptor for owner, marker mode, ordinal, kind, timing, and semantic
  state;
- MarkerContentFactory, which creates, updates, and disposes a local
  presentation-owned HTMLElement;
- CameraIntent, CameraSnapshot, MapViewportMetrics, OcclusionRect,
  UsableRegion, and EdgeInsets.

TripPresentationV2 supplies both the MapVisualProfile value and the
MarkerContentFactory implementation. The Google adapter receives them through
its mount configuration and imports only their core/browser types. It never
imports React or a recipe and never constructs branded marker markup, icons, or
fallback SVG.

When a Google Map ID supports AdvancedMarkerElement, the adapter uses it for
placement and collision behavior. Without a Map ID, the adapter uses an
OverlayView-based placement fallback around the exact same recipe-owned marker
content. The fallback may differ in provider collision optimization, but may
not fall back to a visually different classic Google marker. A Map ID is
therefore an enhancement rather than a hidden prerequisite for Oak & Washi
identity.

Google's default control UI remains disabled to match the benchmark. Provider
attribution and required legal chrome remain visible; overview, restore,
location, and status controls are app-owned presentation controls.

## Presentation contract

TripPresentationV2 provides:

- Home;
- Experience;
- SetupRequired;
- Loading;
- FatalError;
- one provider-neutral map visual profile;
- visible layout registrations consumed by React bindings.

Each view receives grouped semantic values instead of a raw Trip plus a bag of
controller internals. React selects the active view from TripNavigationState;
the presentation does not infer a surface from the URL or its own local state.

Home receives a HomeModel containing authored trip identity and dates,
effective entry day, ordered day summaries, optional destination/traveler and
lodging facts, tasks, reservations, progress, and capabilities. Experience
receives the model below. SetupRequired receives typed missing/invalid input
issues and safe configuration actions. Loading receives an operation and its
semantic owner so feedback stays on the correct surface or edge. FatalError
receives a normalized category, localized copy key, retained-content
capabilities, and only valid recovery actions; raw diagnostics stay outside
presentation props.

All views use the same public action object. openExperience optionally accepts
a valid day owner, openHome returns to Home, and both update the core-owned
active surface through TripNavigationStore. Home's itinerary entry point and
Experience's return affordance call those actions rather than reaching around
the seam to browser history or local navigation state.

### Model

The experience model includes:

- authoritative trip, effective day, locale, timezone, clock facts, and an
  optional authored clockPlaceLabel;
- current, next, and manually viewed owner IDs as independent facts;
- timeline entries with stable IDs, roles, display indices, timing certainty,
  semantic states, incoming routes, and capability facts;
- route and place resolution states;
- map places, routes, selected owners, and camera intent state;
- sheet state and measured viewport/occlusion facts;
- progress, candidates, reservations, tasks, location, persistence, and
  provider state;
- available controls and recovery capabilities.

Timeline roles are:

- primary for numbered destinations;
- base for lodging;
- journey for a travel event such as a flight or major transfer;
- connector for a route edge between owners;
- task for a non-destination action;
- logistics-group for the benchmark-required derived grouping of related
  preparation steps.

Role derivation is total and deterministic:

| Source | Timeline role |
| --- | --- |
| dining, shopping, sightseeing, experience | primary |
| lodging | base |
| transport, transfer | journey |
| logistics | task |
| route edge | connector |
| custom node | the required v2 presentationRole declared by the authored node |

A custom presentationRole is validated against its declared capabilities; it
has no inference fallback. In this milestone custom nodes may declare primary,
journey, or task, while base remains reserved for authored lodging and
connector for route edges. TripTask records remain Home or utility-surface
content and do not enter the itinerary order merely because their scope is a
day.

Two or more consecutive logistics nodes form one derived logistics-group only
when no route edge separates them. The group ID is derived from the ordered
child IDs; each child and any incoming route retain their original owner.

Only primary entries receive a displayIndex. Row and map projections use the
same index, owner, kind, and semantic state. A logistics group preserves each
child owner, incoming route, progress state, unresolved state, and action; the
group is a display aggregation, not a new source of truth.

Display indices increment in authored order within a day. Candidate options
reuse their primary parent's number with stable alphabetic suffixes and do not
consume new primary indices. An unresolved primary retains its list index even
though it has no precise map marker.

Current, next, viewing, completed, skipped, candidate, and unresolved are not a
single mutually exclusive tone. The model preserves composable facts, while a
presentation decides how to phrase them without changing their meaning.

Timing certainty is one of fixed, suggested, or unknown. Unknown timing does
not become Planned or an estimate.

### Place resolution

Authored fact certainty, Enrich-time identity, and runtime provider facts are
orthogonal concepts.

Place identity is resolved or unresolved. A resolved identity may carry an
opaque provider reference and coordinates. Runtime facts for that identity
have a separate idle, loading, ready, or unavailable status and may carry
address, opening-hours, or business-status data. Navigation capability is
derived separately from usable coordinates or a valid provider reference.

Provider-search candidates created during Enrich are not itinerary candidate
groups. Provider candidates exist only to resolve an authored place; itinerary
candidates are deliberate A/B choices in the trip itself.

Place disambiguation occurs during Enrich, not opportunistically at runtime.
The accepted provider reference and coordinates are committed with provenance.
An unresolved place remains visible in the itinerary, carries a truthful state,
does not receive a precise pin, and does not expose navigation as available.
Failure to fetch optional runtime facts does not turn a resolved identity back
into an unresolved one.

### Route state and truthfulness

RouteMode includes unknown. An unknown route edge is valid data and never falls
back to walking.

Each route projection keeps authored facts and provider state separate:

- authored mode, certainty, summary, and external-navigation capability remain
  available whenever supplied;
- provider status is idle, loading, ready, or unavailable;
- a ready provider result contains validated duration, distance, steps, and
  optional geometry;
- an unavailable provider result uses a stable reason enum;
- renderable geometry exists only after validation and is never synthesized
  from an error state.

Raw provider error text is diagnostic data, never presentation copy. Provider
loading or failure cannot erase an authored summary or valid external
navigation capability.

Before a provider path can render or contribute to camera bounds, policy checks
validate endpoint proximity, decoded-point geography, duration/distance
plausibility, and route mode. A quarantined route is not drawn and does not
affect fit. Flight paths can render with their own grammar but do not enter
ordinary day bounds.

### Actions and capabilities

The public action set covers:

- open the Experience, optionally on a valid day, or return to Home;
- select day, node, route, or candidate owner;
- set or step a sheet snap;
- restore automatic selection or return to the actual current owner;
- return to lodging when a lodging owner exists;
- restore the full-day camera view;
- retry map, route, or supported provider operations;
- open valid navigation;
- begin, recenter, or stop user location;
- preview, cancel, confirm, or reopen an itinerary candidate decision;
- update and reset supported progress.

Actions that lack a valid target are absent from the capability contract. A
presentation therefore cannot legitimately render a false Return to now,
Return to lodging, navigation, or retry control. Action implementations remain
defensively safe if custom generated code calls them incorrectly.

### Bindings and layout measurement

React bindings own:

- map mount and provider lifecycle;
- map viewport registration;
- header and itinerary-surface measurement;
- sheet pointer and keyboard props;
- node and route owner refs;
- dialog and disclosure focus restoration;
- safe-area and visual-viewport changes.

The presentation chooses its physical composition and registers the visible
surfaces. Core camera policy then works from measured occlusion rather than
hard-coded Oak & Washi dimensions. A place focus targets the center of the
currently uncovered map area, applies an appropriate minimum zoom, and is
reapplied when registered geometry materially changes. Day fit, owner focus,
user recenter, and restore-full-day are distinct intents.

Layout registration is rectangle-based and deterministic. A presentation
registers one map viewport and every header, sheet, rail, or other surface that
occludes map content. React clips their DOM rectangles to the viewport and
normalizes them as provider-neutral OcclusionRects. Core subtracts those
rectangles and chooses the largest non-occluded axis-aligned UsableRegion;
ties prefer the region containing the viewport center, then greater width,
then topmost and leftmost coordinates. This represents full-width mobile edges
and partial-width centered desktop rails without pretending both are simple
edge padding.

EdgeInsets are derived only from the chosen UsableRegion at the adapter
boundary. App-owned floating controls that do not reserve a camera region
remain presentation layout concerns and are covered by chrome-collision tests.

Core/browser defines the adapter-facing CameraIntent union. Every variant
contains the viewport, chosen UsableRegion, derived EdgeInsets, a stable
semantic intent ID, and transition mode animate or immediate:

- fit contains validated point and path bounds and a maximum zoom;
- focus contains one coordinate and a resolved targetZoom;
- recenter-user contains one coordinate and a resolved targetZoom.

The adapter reports its last finite zoom through CameraSnapshot. Core resolves
a focus target by clamping that zoom to the versioned focus minimum and maximum,
or uses the minimum when no snapshot exists. Core resolves user recenter to its
versioned fixed location zoom. The adapter therefore receives a number rather
than choosing between preserve, minimum, maximum, or a provider default.

Restore-full-day produces the same deterministic fit intent as the selected
day. The map adapter exposes one applyCameraIntent operation and translates the
numeric intent to its provider API; it does not choose policy or animation.
A user selection, day change, restore, or explicit recenter creates an animated
semantic intent unless reduced motion requests immediate behavior. If viewport,
occlusion, or UsableRegion geometry changes by at least one CSS pixel, React
reapplies the same semantic intent ID in immediate mode at most once per
animation frame. A drag can therefore update camera placement continuously
without restarting or competing with a focus animation.

## Runtime data flow

    authored Trip
      -> core validation and semantic projection
      -> adapter requests with stable owners and cancellation
      -> structured provider results
      -> core reducers, route guards, and camera intents
      -> React effects and measured layout bindings
      -> semantic model, actions, and bindings
      -> selected local TripPresentationV2

    presentation action
      -> typed React/core intent
      -> reducer and/or adapter effect
      -> new semantic model

The presentation never derives a competing timeline or reads a provider object
to decide what is true.

## Locale and authored content

Locale and timezone are required v2 Trip facts. Locale must canonicalize as a
BCP 47 language tag, and timezone must be accepted as an IANA zone. Generation
asks when either is missing; runtime does not infer them from the viewer's
device. The document language, date/number formatting, scheduling, and
screenshot output therefore remain deterministic.

Trip may also contain optional authored destinationLabel and travelerLabel
metadata for Home plus a short clockPlaceLabel for the Experience header. These
values are never inferred, are treated as potentially private authored content
by publication checks, and are omitted from their presentation region when
absent. A timezone never silently becomes a city label.

Oak & Washi defines a typed copy-key schema and ships complete English and
Traditional Chinese reference catalogs in this milestone. Create materializes
one complete local copy catalog for the Trip locale. For another locale, the
agent may author that catalog as content during generation, but validation
fails on a missing key and runtime never mixes an implicit browser-language
fallback into the UI.

Raw authored titles, descriptions, reservation facts, tasks, and notes remain
authored content and render without translation or invented detail. Provider
error messages are mapped to short localized states; full diagnostics remain
available to developers.

The Home model derives its primary day from the same selection policy as the
experience: a valid manual day selection first, then the current trip day, then
the first upcoming day, then the final day after the trip. If no day exists,
trip validation fails before Home renders. Optional destination, traveler, and
lodging regions do not reserve empty layout space.

## Error and degraded-state design

All error states preserve the itinerary whenever the input is valid.

| Condition | Required behavior |
| --- | --- |
| Missing or invalid trip content | Show a distinct Setup Required state before starting runtime. |
| Missing Google credential | Keep valid itinerary content usable, explain configuration directly, and never start a fake production provider. |
| Provider loader failure | Keep the itinerary usable, show map unavailability, and offer retry when supported. |
| Map runtime failure | Preserve list interaction and valid external navigation. |
| Route malformed or implausible | Quarantine the route, retain authored movement text, and expose a typed unavailable state. |
| Place unresolved | Keep the row, state that location is unverified, omit a precise pin, and disable navigation capability. |
| Location denied or unavailable | Explain the state without blocking map/list usage. |
| Persistence unavailable | Continue in memory-only mode with a persistent truthful notice. |
| Opening hours absent or uncertain | Omit or mark as unknown; never claim the venue is open. |

The recipe supplies visually complete Setup Required, Loading, Fatal Error,
inline unavailable, retry, and memory-only treatments. Loading uses stable
layout or a skeleton treatment rather than an isolated spinner that replaces
the task surface.

Production construction and bundles may contain only the explicitly selected
provider. Fake adapters are test-only, visibly identifiable under test, and
never substitute for a failed production adapter.

## Tokyo / Oak & Washi design system

### Design intent

Oak & Washi is a quiet, precise travel workspace. Its identity comes from
map-first composition, compact hierarchy, warm restrained color, thin rules,
and confident typography. It must not reduce to a beige theme.

The visual system faithfully carries the benchmark's authored language:

- light-oak and washi color temperature without literal wood or paper texture;
- near-black ink for structure;
- muted teal for route information;
- terracotta for selection and actionable emphasis;
- thin dividers instead of stacks of cards;
- decisive, compact type rather than decorative travel typography.

Forbidden treatments include wood grain, paper grain, gradients,
glassmorphism, generic pastel cards by stop kind, nested cards, ornamental
stamps that imply state, and decorative page-load sequences.

### Core color tokens

The faithful port starts from the benchmark palette:

| Role | Value |
| --- | --- |
| canvas | #F6F2EA |
| surface | #FBF9F5 |
| muted surface | #F2EDE4 |
| strong surface | #FFFDF9 |
| ink | #352F2A |
| muted ink | #766E65 |
| rule | #D8D0C4 |
| route teal | #6F8F8C |
| terracotta accent | #B86F4B |
| accent surface | #F2E3D9 |
| warning | #9A7338 |
| focus | #8F5036 |
| map surface | #E8E2D8 |

Semantic variants are derived from these roles and must pass WCAG AA. Gray text
on a tinted surface is adjusted toward that surface's ink hue rather than made
generically lighter.

### Typography

Oak & Washi starts with the platform UI stack:

    system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif

Language-specific fallbacks are selected from the authored Trip locale rather
than imposed globally. Traditional Chinese adds Noto Sans TC, Japanese adds
Noto Sans JP, and other scripts receive an appropriate complete local stack.
The presentation may use locally available faces but does not fetch a font at
runtime or make one locale pass through another locale's glyph design.

It uses a compact product scale close to the benchmark:

- primary header and sheet heading: 16px, approximately 780 weight;
- row title: 14px, approximately 780 weight;
- time: 12px, approximately 720 weight, tabular numerals;
- type label: 10px, approximately 820 weight;
- secondary copy: 11px with sufficient line height;
- compact status: 9px at approximately 820 weight, retained only where its
  measured contrast and zoom behavior pass the acceptance matrix.

Visible labels, buttons, route facts, and dense itinerary copy use the product
face. There is no display font in controls. Long Latin and CJK content must
wrap or reflow without hiding the primary action.

### Active experience composition

The production benchmark opens directly into the active experience. On mobile
the composition is:

1. a persistent full-viewport map;
2. a floating safe-area-aware day header inset 12px from the sides;
3. map controls that move with header clearance;
4. a full-width three-snap itinerary sheet.

The header contains concise trip/day identity, authoritative local time,
capability-gated controls, and an expandable day rail. Its title remains a
single ellipsized line; long trip copy may reflow elsewhere but may not make the
floating header wrap unpredictably. When clockPlaceLabel is supplied, it is
shown beside the authoritative time and hidden below 22rem width; when absent,
only the time renders and no city is inferred. The rail supports any number of
authored days; the benchmark's six-column implementation is not hard-coded.

The sheet states are:

- collapsed: 104px plus bottom safe area, showing the selected owner, then
  current, then next, then the first useful owner as a deterministic fallback;
- half: clamp from 300px through 46dvh to 430px as the benchmark starting point;
- expanded: the available height below the currently measured header.

At viewport heights below 43.75rem, half uses 43dvh with a minimum of the
lesser of 17rem and the available expanded height. This short-height rule is a
faithful benchmark requirement, not an optional compact variant.

The floating header uses a 16px radius and restrained float shadow. The sheet
uses a 24px top radius and an upward shadow. Its 44px handle band contains a
36x4px grip and a separate named 44x44 toggle target. In half and expanded
states, the sticky 52px sheet heading shows a localized itinerary section
label, primary-count summary, and at most two compact actions or badges. The
day title remains owned by the floating header and is not duplicated here. The
collapsed sheet instead uses its dedicated compact summary geometry: one
actionable owner row with semantic mark, time/type, one-line title, and an
optional 44px navigation action. These dimensions are reference geometry and
may grow for 200 percent text; copy is never clipped merely to preserve them.

The presentation declares a named layer scale for map content, routes,
markers, app map controls, header, sheet, and modal surfaces. Provider-required
attribution remains above map artwork and below app surfaces without ever
becoming covered or inoperable.

At widths of at least 45rem, the map remains full viewport. Header and sheet
become centered bounded rails, approximately 32.5rem and 35rem respectively.
The faithful milestone does not turn desktop into a generic dashboard.

### Home composition

The production benchmark has no canonical Home screen, so Home is a deliberate
extension of the same visual language rather than a cross-project parity claim.

Home contains:

- trip title, dates, destination, and traveler context;
- one truthful entry into today's or the selected day's itinerary;
- lodging summary when authored;
- pre-trip tasks and real progress;
- ticket and reservation state;
- the complete ordered day list.

Mobile uses one clear editorial column. Desktop may use a restrained editorial
split, but not a KPI dashboard or a grid of identical cards. Home reuses the
same ink, rules, type scale, control vocabulary, and state semantics as the
experience.

### Timeline row grammar

Primary rows scan in this order:

    time -> title -> type/context -> location or route facts -> one status region

The title appears once. Timing, type, context, location certainty, and route
state have distinct semantic slots. Current, next, and viewing can combine in
one visible status region without changing their underlying independent facts.

Rows are primarily separated by 1px rules and spacing. Ordinary entries stay
compact; selected entries reveal relevant progressive content. Type-specific
facts, candidate decisions, shopping progress, route detail, and navigation
appear only where owned.

A full itinerary primary row starts with a 40px semantic-mark column,
continues with a flexible selection/content column, and reserves a 44px
detail/action column only when that action exists. Its reference minimum height
is 76px. Timed rows use a 52px internal time subcolumn. The collapsed summary
is a distinct compact projection rather than a clipped full row. At narrow
widths or 200 percent text these values yield to semantic reflow rather than
causing page-level overflow.

Different roles use different structures:

- primary destinations use stable ordinal markers;
- lodging/base entries use a base or lodging mark rather than consuming an
  ordinal;
- route connectors remain independent edge rows close to their destination;
- major journeys retain their own composition;
- tasks do not masquerade as map destinations;
- logistics groups expose a visible group title, progress, and ordered child
  owners.

Selection uses a low-concentration terracotta surface plus an inset rule.
Current, skipped, completed, candidate, and unresolved states retain a
non-color cue.

### Map markers and routes

The marker projection exposes one explicit marker mode: numbered, base, or
none. Primary destinations are numbered and lodging anchors use base. Candidate
is a composable semantic tone on a numbered marker, not a fourth marker shape;
it preserves the parent's ordinal with its stable alphabetic suffix. Tasks,
journeys, logistics groups, unresolved places, and other non-map owners use
none unless their domain projection explicitly supplies a valid location and
marker mode.

Numbered markers use the benchmark grammar:

- a 32px teardrop silhouette;
- a counter-rotated stable ordinal, including a candidate suffix;
- a separate 16px type badge with a 10px glyph.

A base marker uses the same interactive silhouette with a centered 16px
lodging glyph and has neither ordinal nor type badge. Every rendered marker has
a minimum 44px interactive hit area, transform-only selected scaling, and an
accessible name containing ordinal when present, kind, timing, title, and
explicit candidate or skipped wording when applicable.

Selection is exposed with aria-pressed and a non-color visual cue. Candidate,
skipped, and selected states remain distinct in grayscale and forced-colors
modes. A completed-pin treatment is permitted only as a clearly tested v2
extension; it is not claimed as benchmark parity and must not obscure current,
next, viewing, candidate, or skipped state. Unresolved places do not receive a
fabricated precise marker. Marker-mode none never enters placement or collision
handling. Among rendered markers, collision policy prioritizes selected first,
then numbered candidate, numbered primary, and base markers before applying
provider-specific collision behavior.

The faithful Google profile starts with #EEE8DE geometry, #5E574F labels on
#F8F4ED label strokes, #D9E2DF water, #E3E6D8 parks, and #FAF7F1 roads. Points
of interest are simplified, stations remain legible, Google's default controls
remain disabled, and required attribution remains visible. #E8E2D8 is the
presentation's map surface behind the provider, not a substitute tile color.

Route grammar is semantic:

- transit: muted teal solid line;
- walking: terracotta dots with no underlying stroke;
- driving: warm graphite solid line;
- flight: taupe dashed line;
- unknown authored mode: visible textual state and no inferred walking style;
- unavailable provider result: no route geometry, with its owning textual state
  kept beside the relevant edge.

Transit uses #6F8F8C and driving #57514C; their ordinary solid strokes are 4px
at 0.42 opacity and selected strokes are 7px at full opacity. Walking uses
#B86F4B circles at a 12px cadence, scale 2.2 and 0.55 fill opacity normally,
then scale 3 and full fill opacity when selected. Flight uses #7F776F 14px dash
symbols with a 2px stroke at 0.5 opacity normally and a 3px stroke at 0.9
opacity when selected. Walking and flight have no underlying line stroke. A
ready result can use these styles only after geometry validation; an
unavailable result never receives a decorative or patterned fake path.

App-owned map controls, provider-required attribution and legal chrome, header,
and sheet may not occlude each other at any supported viewport or snap.

Oak & Washi uses one local Lucide icon vocabulary: 18px control glyphs,
1.75px strokes, currentColor, and 10px glyphs inside type badges. It does not
mix emoji, text-symbol substitutes, or a second icon library. Icon-only buttons
have localized accessible names. Itinerary lists contain no decorative venue
photography; a detail surface may show a real, licensed image only with source
and attribution carried by authored content.

### Motion and gesture ownership

The faithful starting timings are:

- header expansion: 220ms;
- header collapse: 160ms;
- sheet snap: 220ms;
- primary easing: cubic-bezier(0.22, 1, 0.36, 1).

Header, map-control clearance, sheet ceiling, and map occlusion update as one
choreography. Reversing the header transition mid-flight remains continuous.
Dragging disables height animation, uses pointer capture and rAF coalescing,
and settles to the nearest snap by position, matching the benchmark. Velocity
settling is a possible later product improvement and is not part of the
faithful milestone. List scrolling, sheet dragging, and map pinch retain
explicit ownership so one gesture does not leak into the other surface.

Motion communicates state only. Reduced motion makes state changes immediate
without removing information or operability.

### Accessibility and responsive requirements

Oak & Washi must support:

- 320, 390, and 430 CSS-pixel mobile widths;
- 320x568 and other short-height viewports;
- 768, 1024, and 1440px desktop evidence;
- asymmetric safe areas and mobile browser toolbar changes;
- 200 percent text reflow without page-level horizontal overflow;
- all visible interaction targets at least 44x44 CSS pixels;
- WCAG 2.2 AA contrast for body, metadata, state, and overlays;
- visible keyboard focus and logical DOM/focus order;
- correct aria-current, aria-pressed, dialog naming, inert hidden content, and
  focus restoration;
- forced-colors semantics that do not rely on background color;
- reduced-motion alternatives;
- visible and operable app-owned map controls plus provider attribution and
  legal chrome.

## Generation and enrichment workflow

Generation is deterministic and script-driven. Atomicity applies to each
state-changing command, not to an imaginary transaction spanning human review,
CI, and registry publication:

    create -> enrich search -> human review -> enrich accept -> validate -> verify

### Create

When no recipe is supplied, Create selects oak-washi. It validates the recipe
manifest and destination, composes the base project and selected presentation
in a temporary sibling directory, records provenance, and does not expose a
partial destination. Its transaction is the creation of one complete project
directory. Unresolved authored places are valid output and do not make the
filesystem transaction partial.

Create may also receive a previously accepted place-resolution ledger as an
explicit input alongside the Trip. It validates schema, stable owner coverage,
provider facts, and provenance before copying it. Without that input, Create
materializes every authored place as unresolved. The canonical Tokyo release
input includes its reviewed ledger, while generic no-theme creation does not
silently perform network enrichment.

### Enrich

Enrich search resolves public places through a deterministic query policy with
locale and geographic bias. It atomically writes one review artifact containing
candidates and provenance; it does not mutate committed trip content. Only an
explicit Enrich accept operation may atomically update the accepted resolution
and provenance, rerun validation, and replace the prior committed files. A
failed acceptance leaves both the prior project and review artifact intact.
Ambiguous places remain unresolved; the agent asks rather than guesses.

Accepted resolution output records at least source, query, provider, accepted
provider reference, observed-at timestamp, and schema version. The review
artifact owns the observation timestamp; acceptance copies it rather than
inventing a new time. CI replays committed results and does not query Google.

### Validate and verify

The validator reads the actual v2 manifest and declared presentation entrypoints
instead of hard-coding the obsolete src/ui layout. It distinguishes local
package-candidate verification from deployable exact-registry dependencies
without accepting arbitrary unproven local package references.

Validate and Verify are read-only with respect to project source. Before
publication, the composed project passes manifest validation, type-check, unit
tests, experience contract, accessibility checks, and build. Build output is a
disposable artifact rather than a source mutation.

The mechanical upgrade-trip-project command supports schema-v2 projects within
the same presentation-contract major. Its mutation allowlist is package.json,
the detected package-manager lockfile, and eternal-pose.json. It structurally
updates only the four exact Eternal Pose dependency or dev-dependency entries,
regenerates the lockfile in a staged project, and records the new exact package
versions plus lastUpgradeToolVersion. generatorVersion, recipe.sourceVersion,
presentationContractVersion, enrichment data, and every app, presentation, and
trip-content byte remain unchanged.

The command begins only when the current package entries match the current
manifest; a divergent pin, unsupported lockfile, required presentation rewrite,
or major-version mismatch is an ownership conflict and causes refusal. It
hashes every non-allowlisted file before and after the staged operation and
publishes the three-file transaction only after validation. It is not a 1.0
migration tool and does not weaken the clean-break decision.

### Manifest

The generated project manifest eternal-pose.json records:

- schemaVersion: 2;
- generatorVersion: the exact Eternal Pose release that originally composed
  the project and remains unchanged by a pin-only upgrade;
- optional lastUpgradeToolVersion: the exact same-major tool release that most
  recently updated package pins without recomposing source;
- recipe.id and recipe.sourceVersion, where sourceVersion is the exact plugin
  or generator release containing that recipe source;
- presentationContractVersion: 2, aligned with the package major;
- exact versions of core, React, adapters, and testing packages;
- enrichment.schemaVersion;
- enrichment.provenanceHash, computed as SHA-256 over RFC 8785 canonical JSON.

The sole provenance preimage is
src/trip-content/place-resolutions.json. It has no self-hash: it contains its
schemaVersion, provider, and entries sorted by stable owner ID. Every authored
place has one entry whose status is resolved or unresolved. A resolved entry
contains accepted identity, coordinate, query, source, and observation
provenance; an unresolved entry contains a stable reason such as not-reviewed
or no-accepted-candidate and no fabricated identity. When no accepted ledger is
supplied, Create writes the canonical form with the required unresolved
entries, including entries: [] when the Trip has no places. Enrich accept
replaces the ledger and manifest together. Validation recomputes the manifest
hash over the entire canonical ledger; there is no second accepted-output
integrity hash.

The recipe manifest is a different file and does not invent an independent
marketing version. It declares its stable ID, presentation root, entry module,
styles, assets, map profile, provider guidance, motion policy, supported
features, and required screenshot cases. All paths remain normalized,
root-contained, and free of symlink traversal. Validation rejects unknown
schema or contract majors instead of guessing compatibility.

## Verification and release acceptance

Automation proves protected behavior and regression stability. Manual
side-by-side review proves product quality. Neither replaces the other.

For every P0 row, only verified closes the milestone. Partially verified,
blocked by configuration, not exercised by input, and failed do not. The
historical baseline's blocked-by-model result is normalized to failed for v2,
restoring ADR-0005's five-status vocabulary. Capabilities absent from the Tokyo
itinerary are exercised by the synthetic fixture instead of being waived.

The milestone maintains one committed atomic parity report at
docs/audits/2026-09-eternal-pose-v2-oak-washi-parity.md. Each row represents one
claim and records its stable ID, source requirement, priority, gate phase,
fixture, exact command or manual procedure, evidence path, owner, and one of
the five statuses. Gate phase is prepublication, registry-candidate, or
postpromotion, making the release subsets mechanically selectable. Every one
of the 71 rows from the 1.0 baseline, including previously verified rows, maps
to one or more v2 claims with an explicit disposition. The F2 mapping records
the corrected position-based faithful criterion. A broad section verdict may
summarize rows but may not replace them.

### P0 release gates

| Area | Required evidence |
| --- | --- |
| Visual identity | Oak & Washi palette, compact type hierarchy, exact chrome and row grammar, marker modes, type badges, icon vocabulary, map profile, and complete state treatments are present; no Quiet Wood generic row or marker grammar remains. |
| Copy and row integrity | No duplicated title or metadata, mixed implicit UI locale, false fallback label, orphan status, or ownerless loading state remains; progressive disclosure keeps optional content behind its owning selection or disclosure. |
| Sheet feel | Collapsed, half, expanded, short-height half, slow drag, position-based snap, snap interruption, and zero-duration drag tracking pass the provider-neutral contract and physical-device review. |
| Choreography | Header, controls, sheet, and map occlusion share one continuous transition, including mid-transition reversal and header reopening while expanded. |
| Selection | List-to-map, map-to-list, route-owner focus, current, next, viewing, return-to-now, return-to-lodging, and restore-full-day remain truthful and do not remount the map. |
| Camera safety | Day fit, uncovered-area focus, endpoint validation, flight exclusion, and adversarial route quarantine pass exact intent and geometry assertions. |
| Domain behavior | Route ownership, candidate draft/cancel/commit, progress reload/reset, minute boundaries, persistence fallback, and non-following location pass the synthetic experience contract. |
| Edge ownership | Route loading feedback stays on the route edge that owns it; list and map remain usable during load; the sheet remains above a map repaint, resize, and provider remount. |
| Provider boundaries | Production constructs Google adapters only; test fakes are marked and isolated; missing key, loader failure, and runtime failure remain distinct. |
| Provider truth | Walking, transit, driving, flight, unknown, loading, ready, external, and unavailable states preserve authored facts; opening-hours absent/incomplete/overnight/timezone cases and successful transit duration/line facts pass without invention. |
| Marker backend parity | With and without a Google Map ID, AdvancedMarkerElement and OverlayView mount the same recipe-owned marker DOM and preserve size, names, hit targets, tone, selection, focus, cleanup, and list/map interaction. |
| Responsive | 320x568, 390x844, 430x932, 768, 1024, and 1440 evidence shows no blocked controls, page overflow, or chrome collision. |
| Accessibility | Every visual case has zero automated axe violations for WCAG 2.2 A/AA tags; contrast and 44px targets have separate assertions; full keyboard and VoiceOver journeys, visible focus, semantic names/states, focus restoration, inert hidden content, 200 percent text, forced colors, and reduced motion all pass. |
| Recipe composition | Oak & Washi schema-v2 composition emits one declared presentation with no path escape, catalog leakage, or partial destination. |
| Filesystem atomicity | Fault injection before and during copy, write, validation, fsync, and final rename proves failed Create leaves no destination; failed Enrich search preserves the prior review artifact byte for byte or leaves it absent; failed Enrich accept preserves both prior project and review artifact; and failed v2 upgrade preserves the prior project byte for byte. No case leaves accepted partial provenance. |
| Starter and flagship | Inventory and hashes prove byte-identical presentation and runtime configuration; only the documented trip-content files differ. |
| Tokyo content integrity | The flagship retains six days, 100 nodes, and 94 v2 edges: the 92 known edges plus D3-2 and D3-3 as unknown. It retains 89 resolved places, keeps Pelican Cafe unresolved, preserves exact authored order and allowed fictitious private facts, and records resolution provenance. |
| Presentation independence | The test-only alternate presentation passes the complete semantic interaction contract without importing Oak & Washi or duplicating controller policy. |
| Package artifacts | Archive inspection and a clean temporary consumer prove all four lockstep package tarballs contain declared exports, types, root/provider subpaths, and exact dependencies without workspace-link or source-tree resolution. |
| Plugin artifact | Separate clean Claude and Codex hosts clone the published repository at the exact candidate commit, register that detached checkout as the marketplace, and install Eternal Pose. Both marketplace manifests, both plugin manifests, the plugin Git tree, version, and deterministic archive SHA-256 match the release manifest before Create, Enrich search/accept, Validate, and Verify run without source-worktree fallback. |
| Real generation | The clean artifact-installed run passes validator, install, unit, type-check, lint, experience contract, accessibility, and production build without manual repair. |
| Hard-code traps | Static and behavioral checks reject literal DAY/Tokyo/+09 UI facts outside localized copy and test fixtures, Asia/Tokyo defaults, fixed six-column rails, Tokyo center/zoom, and Tokyo-specific document metadata, language, or social images outside trip-content. |
| Live Google | The exact production build and release flags produce sanitized committed evidence for one successful walking response and one deliberately selected transit response containing and rendering both duration and line, plus attribution, typed malformed/outlier rejection, and unavailable mapping without exposing credentials. |
| Runtime smoothness | On the pinned fake-map browser runner, ten warm two-second sheet drags contain no main-thread task over 50ms and produce an aggregate p95 animation-frame interval at or below 25ms; runner image, browser build, trace harness, and raw samples are recorded. A representative physical iPhone receives three qualitative repetitions. |
| Promotion rollback | Before real default promotion, failure injection after each of the four package-tag writes and the Git default-branch update in a disposable npm registry and bare Git remote proves that package tags return to their prior versions and a forward revert makes the default branch resolve to the prior plugin tree/version without history rewriting. |
| Release truth | Final artifacts pass locally, are published under non-default candidate references, match their approved hashes, pass an exact-registry clean smoke, and are only then promoted through a recorded default-pointer manifest with verified rollback. No artifact contains a fake version, credential, private fact, undeclared remote asset, or benchmark path. |

Expected-fail markers may document an earlier baseline but may not hide a v2 P0
blocker.

### Deterministic visual fixtures

The executable catalog lives in
packages/testing/src/fixtures/oak-washi-visual-cases.ts. It owns test state and
does not expand the public recipe schema. Reviewed output lives under
docs/theme-reviews/oak-washi/ and is linked from the atomic parity report.

| Fixture | Viewport and mode | Required state and purpose |
| --- | --- | --- |
| home | 390x844 and 1024x900 | Zero-progress Home at mobile and desktop; validates the new canonical screen. |
| experience-default | 390x844 | Day 1, half sheet, full-day fit; validates the primary composition. |
| experience-collapsed-current | 390x844 | Fixed clock with current and next owners; validates the actionable collapsed state. |
| experience-expanded-dense | 320x568 and 430x932 | Dense day with long CJK labels, short-height half, and expanded sheet. |
| candidate-open | 390x844 | Multiple candidates with draft preview, provisional pins, confirm, and cancel. |
| candidate-zoom-200 | 320x568 at 200 percent text | Candidate comparison and actions reflow without loss or page overflow. |
| selection-truth | 390x844 plus grayscale | A selected resolved owner beside an unresolved place; all state remains legible without color. |
| route-state-matrix | 390x844 | Ready walking, transit, and driving plus flight, unknown, loading, external, unavailable, retry, and authored fallback; loading stays on its edge. |
| opening-hours-matrix | 390x844 | Known-open and known-closed positive cases plus absent, incomplete, overnight, cross-midnight, and Trip-timezone cases prove both useful output and no false open claim. |
| camera-adversarial | 390x844 | Implausible duration, remote decoded point, and flight verify quarantine and bounds safety. |
| marker-backends | 390x844 | AdvancedMarkerElement and no-Map-ID OverlayView preserve the same recipe DOM, accessible state, selection, and hit geometry. |
| map-error | 390x844 | Runtime map failure while the itinerary remains fully usable and above any repaint. |
| setup-states | 390x844 | Missing content, missing key, and provider loader failure remain distinct. |
| loading-owned | 390x844 | App startup, place, and route loading use stable geometry and remain attached to the owning surface or edge. |
| runtime-degraded | 390x844 | FatalError, memory-only persistence, location denied, and location unavailable retain valid content and only valid recovery capabilities. |
| accessibility-media | 390x844 | Keyboard focus, selected/error states, forced colors, and reduced motion. |
| desktop-bounded | 768x1024, 1024x900, and 1440x1000 | Default and expanded Experience rails remain map-first, collision-free, and never become a dashboard. |

Goldens use a pinned browser build, asserted font availability, fake provider,
fixed clock, timezone, locale, seeded progress, device scale factor 1, reduced
motion, and no network. Named dynamic regions are masked; dynamic Google tiles
are excluded entirely. A reviewed image passes at maxDiffPixelRatio <= 0.002.
Geometry, text uniqueness, semantics, owner state, and camera intent use exact
assertions rather than screenshots alone.

Each fixture runs axe with the WCAG 2.2 A/AA rule tags and permits zero
violations. Separate computed-style tests enforce contrast and 44x44 targets.
One complete keyboard journey and one manual VoiceOver journey cover Home,
opening the experience, changing day, selecting a row and marker, expanding and
collapsing the sheet, candidate cancel/confirm, route failure, navigation
capability, and focus restoration.

The first comparison against tokyo-trip-map is a manual quality decision, not a
cross-project pixel-diff gate. Once the faithful Oak & Washi output is approved,
its deterministic screenshots become the regression goldens.

### Manual side-by-side sign-off

The release candidate is reviewed benchmark-first and generated-second on at
least one physical iPhone running Safari. The review repeats F1 through F8, V1
through V5, and M1 through M5 from the baseline, including real pinch and
rubber-banding. For F2, a fast fling must reach the same intended snap as the
benchmark through traveled position; this faithful milestone does not add a
separate velocity term.

Every prepublication P0 row whose procedure includes manual sign-off must be
verified before candidate publication; registry-candidate and postpromotion
rows close in their later phases. The sign-off records reviewer, device, OS,
benchmark commit and runtime flags, generated commit and runtime flags,
generator version, plugin artifact version/hash, and all package versions. The
product owner gives the final visual approval.

Simulator evidence is useful during development but is not presented as
physical-device certification.

### Provider and release evidence

Live Google evidence runs against the exact production build and the flags that
will ship. The committed record is sanitized and includes one successful
walking result, one selected transit result that contains and renders both
duration and line, visible attribution, and the normalized result of malformed,
implausible, or unavailable adapter fixtures. CI replays the sanitized results;
it does not depend on live Google or commit credentials.

The plugin has two real publication surfaces:
.claude-plugin/marketplace.json for Claude and
.agents/plugins/marketplace.json for Codex. Both are Git-backed manifests whose
local source points at plugins/eternal-pose in the same checkout. Candidate
identity is therefore the tuple of the origin URL, full 40-character commit,
plugin Git-tree ID, plugin version, and deterministic plugin-archive SHA-256.
The default for both surfaces is the plugin tree resolved from origin/main by
the README install commands; there is no imaginary plugin dist-tag.

Candidate verification clones https://github.com/XBlueSky/laugh-tale.git on a
clean host, checks out the full commit in detached mode, and registers that
local clone with each host:

    claude plugin marketplace add <clone> --scope local
    claude plugin install eternal-pose@laugh-tale --scope local --yes
    codex plugin marketplace add <clone>
    codex plugin add eternal-pose@laugh-tale

Separate clean homes prevent one marketplace cache from satisfying the other
test. Both marketplace manifests and both plugin manifests must declare the
release version and resolve to the recorded plugin tree before any Eternal Pose
command runs.

Release avoids circular gates and models the actual pointers:

1. create the final local candidate commit and build its four package tarballs
   plus a deterministic archive of plugins/eternal-pose; record source commit,
   tree, versions, sizes, and SHA-256 values in an out-of-tree immutable release
   attestation linked from the parity report, and forbid rebuilding;
2. run every prepublication P0 gate against that local commit and the immutable
   artifacts, including clean local detached-checkout installs and manual
   sign-off;
3. push the unchanged commit to a non-default remote release ref so its full
   SHA is a fetchable candidate, and publish the four lockstep packages under
   the non-default next dist-tag;
4. in clean directories with empty package caches, clone the exact remote
   candidate, install exact registry
   versions, verify every downloaded tarball against the four recorded hashes,
   and rerun generation, package/subpath imports, Validate, Verify, and the
   production build from both detached marketplace installations;
5. rehearse promotion and rollback against a disposable npm registry and bare
   Git remote, injecting failure after each of the four tag writes and the
   default-branch update;
6. snapshot the four current latest versions and the current origin/main plugin
   tree/version. Promote the exact package versions to latest, then update
   origin/main through a reviewed commit whose two marketplace entries, two
   plugin manifests, and plugin tree match the candidate release manifest;
7. on separate clean hosts, run the documented default marketplace adds for
   `XBlueSky/laugh-tale` in Claude and
   `https://github.com/XBlueSky/laugh-tale` in Codex, install
   `eternal-pose@laugh-tale`, verify resolved commit/tree and version, and run
   every postpromotion row;
8. if promotion or any postpromotion P0 row fails, restore all package tags and
   push a forward revert that restores the prior plugin tree/version on main.
   Verify both default installs after rollback; never reset published history.

No source, version, tree, or artifact may change between candidate smoke and
default promotion. A failed candidate smoke leaves defaults untouched; a failed
promotion or postpromotion smoke leaves immutable candidate versions available
for diagnosis but restores every prior default resolution.

### Final polish

Before product-owner approval, the milestone receives a deliberate polish pass
for:

- wording and elimination of mixed-language or duplicated metadata;
- 2px to 4px spacing, badge alignment, shadow, and optical corrections;
- non-critical collision handling;
- hover, active, pressed, and transition interruption details;
- Home and secondary-state visual consistency;
- frame-time inspection on representative mobile hardware.

Mixed-language copy, duplicate title/metadata, false or ownerless states,
blocked actions, and row-grammar defects are P0 correctness failures rather
than polish. Every remaining optical finding receives its own parity-report row
and either a verified fix or an explicit post-v2 disposition accepted by the
product owner. Only a non-P0 row may receive that post-v2 disposition; every P0
row must be verified. “Final polish” is not an unbounded completion exception.

Dark mode, URL/deep-link state, the other three themes, and broad non-Safari
device certification are explicit later work rather than hidden polish debt.

## Delivery sequence

Implementation follows the extraction order required by ADR-0005.

### 1. Adapter and domain truth

- Introduce the v2 route and place states.
- Add unknown route mode and provider-neutral references.
- Extract Google adapters and typed provider failures.
- Add opening-hours handling, transit facts, route validation, and adversarial
  fixtures.
- Close baseline failures that would make later camera work untrustworthy.

### 2. Choreography and camera

- Move pure experience and camera policy into core.
- Move React effects, sheet control, layout measurement, and adapter lifecycle
  into React.
- Match benchmark sheet/header/map coordination and camera behavior.
- Pass provider-neutral interaction and geometry contracts.

### 3. Presentation seam

- Derive the final grouped TripPresentationV2 contract from the completed
  behavior.
- Replace local behavior derivation with semantic model, actions, and bindings.
- Add a test-only alternate presentation to guard against Oak-specific
  hard-coding.
- Freeze the seam for the four-theme v2 release train.

### 4. Oak & Washi faithful port

- Port the active Experience composition, rows, markers, map profile, state
  treatments, and choreography-visible CSS.
- Build the new canonical Home in the approved Oak & Washi language.
- Complete Setup Required, Loading, Fatal Error, unavailable, retry, and
  memory-only states.
- Establish reviewed deterministic visual goldens.

### 5. Generator and flagship integration

- Make oak-washi the omitted-recipe default.
- Complete schema-v2 manifests and deterministic Create, Enrich, and Validate
  workflows.
- Enforce recipe/starter/Tokyo equivalence and provenance.
- Add the v2-only upgrade command and clean installed-plugin acceptance path.
- Generate the Tokyo flagship without presentation-side manual repair.

### 6. Hardening and sign-off

- Run the complete package, generator, responsive, accessibility, visual, and
  clean-install matrices.
- Complete the atomic parity report and exact Tokyo content-integrity checks.
- Run and sanitize the required live Google evidence without making CI
  network-dependent.
- Complete physical-iPhone side-by-side sign-off and the final polish pass.
- Gate the immutable package artifacts and detached Git candidate in both
  marketplaces, publish packages under next, and run clean exact-registry
  smokes.
- Rehearse rollback, then promote the same package versions to latest and the
  identical plugin tree through origin/main; run or roll back the postpromotion
  gates.

The implementation plan may subdivide these stages into reviewable commits,
but it may not reorder them in a way that freezes the presentation seam before
adapter and choreography behavior is proven.

## Risks and controls

### Moving the existing controller wholesale

The current large controller combines durable behavior with starter accidents,
including false return-to-now fallback, map numbering assumptions, and unsafe
fit inputs. It must be decomposed into pure reducers/policies and React effects,
not copied into the package as one public abstraction.

### Contract growth

One coarse presentation seam can become an unstructured prop bag. Models remain
grouped by domain, changes require contract tests and fixture coverage, and raw
provider or controller objects never enter the public seam.

### Visual fidelity becoming Tokyo-specific

Faithful visuals may tempt hard-coded six-day rails, Tokyo labels, coordinates,
or stop types. Every visible fact comes from the contract, the synthetic
fixture uses different shapes and lengths, and the test-only alternate
presentation verifies composition freedom.

### Screenshot confidence

Screenshots can pass while focus, gesture ownership, or route truth is wrong.
Visual goldens are always paired with exact DOM, state, intent, and geometry
assertions plus manual physical-device review.

### Package/release drift

The existing baseline proved that HEAD tarball tests can pass while the public
1.0 registry artifacts lack required exports. The v2 release tests actual
candidate artifacts in a clean consumer and reruns the final smoke test against
exact registry versions before claiming success.

### Theme quality divergence

Later themes may satisfy types while losing product quality. Each future theme
must implement the complete presentation, pass the same behavior, state,
responsive, accessibility, and generation matrices, establish its own approved
goldens, and receive manual side-by-side quality review. No shared visible shell
is introduced merely to make those themes cheaper.

## Superseded directions

This design preserves the architecture of ADR-0001 through ADR-0006 while
recording the product owner's later catalog decision.

- It supersedes earlier targets for six authored worlds.
- It supersedes the paused four-theme direction only where that direction made
  wander-collage the default.
- It confirms exactly four eventual v2 themes, while retaining ADR-0001's rule
  that no theme exists publicly before it passes flagship-quality acceptance.
- It leaves the old recipe source and design history available in Git without
  shipping aliases.

## Completion condition

The first Eternal Pose 2.0 milestone is complete only when the immutable
artifacts have passed local gates, the exact package version has passed the
next-tag registry smoke and reached latest, and origin/main resolves both
marketplace manifests and both plugin manifests to the approved plugin tree and
version. Separate clean Claude and Codex hosts must install that default and
complete a no-theme Create using the canonical Tokyo release input and its
accepted resolution ledger. Each must produce the Oak & Washi Tokyo flagship
with 89 resolved places and the explicit unresolved Pelican Cafe, without
repository fallback or manual repair. Every P0 parity row must be verified, the
bounded polish pass must be resolved, and the generated experience must have
physical-iPhone side-by-side approval against the benchmark. A failed
postpromotion row restores the prior defaults and therefore cannot satisfy this
condition.
