# Laugh Tale

Laugh Tale is an agent-native toolkit that generates map-first, mobile-first travel sites from real itinerary material, with a single generated flagship as its quality truth.

## Language

### Product surfaces

**Laugh Tale**:
The toolkit and marketplace as a whole: packages, plugin, flagship, and site.

**Eternal Pose**:
The Claude Code and Codex plugin. One skill plus the starter and recipes it applies.

**Flagship**:
The generated Tokyo site kept in the repository as the quality truth and end-to-end target.
_Avoid_: demo, golden path site, reference site, example

**Benchmark**:
The hand-built `tokyo-trip-map` site that the flagship is measured against. Read-only; behaviour may be extracted from it, trip content may not.
_Avoid_: reference implementation, source, original

**Generated site**:
A site produced by Eternal Pose. Independent of the plugin at runtime; depends only on published packages.
_Avoid_: output, consumer, project

**Starter**:
The flagship with its trip content removed. The copy source for every generated site.
_Avoid_: template, boilerplate, scaffold

**Recipe**:
A complete authored presentation applied to a site at generation time. One per site, never switched at runtime.
_Avoid_: theme, skin, world, design system

### Behaviour and presentation

**Behaviour**:
What the packages own: everything that is true about a trip regardless of how it is drawn.
_Avoid_: logic, core (as a layer name)

**Presentation**:
Everything visible: components, CSS, copy, icons, layout. Owned entirely by the site.
_Avoid_: UI, view layer, theme

**Protected behaviour**:
A behaviour guaranteed by the packages that a site must not reimplement locally.

**Choreography**:
The coordination of selection, camera, sheet, header, and clock across the map and the list.
_Avoid_: orchestration, controller logic, sync

**Presentation seam**:
The published view-model, actions, and bindings contract that a recipe implements.
_Avoid_: theme API, presentation contract, TripPresentation (the type, not the concept)

**Camera intent**:
A request for the map to fit, focus, or pan, expressed in trip terms and executed by an adapter.
_Avoid_: fitBounds, zoom, viewport change

**Provider**:
An external service the site talks to: Google Maps, Google Routes, Google Places.
_Avoid_: backend, API, vendor

**Adapter**:
An implementation of one of the neutral provider interfaces (map, route, place, navigation) for a specific provider.
_Avoid_: driver, plugin, integration, provider (for the implementation)

### Trip model

**Trip**:
One journey with a timezone, a date range, and its days.
_Avoid_: itinerary (for the whole), plan, journey

**Day**:
One calendar day of a trip and its ordered nodes.
_Avoid_: date, page, chapter, stage

**Node**:
One thing a traveller does on a day: dining, sightseeing, lodging, logistics, and so on. Only nodes are places on the map.
_Avoid_: stop, item, entry, card, place

**Route edge**:
The movement between two nodes, with a mode that may be unknown. An edge, never a node.
_Avoid_: leg, segment, transport stop, connector (the connector is its rendering)

**Candidate group**:
Alternatives for one node, compared on the main map, one of which may be selected.
_Avoid_: options, alternatives, choices

**Place**:
A resolved geographic identity a node refers to: coordinates and a provider place ID, each with a stated certainty.
_Avoid_: location, POI, venue

**Progress**:
What the traveller has done or decided: completions, skips, candidate selections, shopping status. Persisted per trip.
_Avoid_: state, user data, session

### Quality process

**North star**:
The single acceptance: a generated flagship placed beside the benchmark must not read as lower quality.
_Avoid_: goal, KPI, definition of done

**Experience contract**:
The provider-neutral end-to-end test suite every generated site must pass.
_Avoid_: e2e tests, contract tests, smoke tests

**Parity report**:
The row-by-row comparison of a generated flagship against the benchmark, using exactly five statuses: verified, partially verified, not exercised by input, blocked by configuration, failed.
_Avoid_: audit (an Eternal Pose intent), review, scorecard

**Sign-off**:
The manual side-by-side check on a phone that closes a milestone.
_Avoid_: QA, review, acceptance test
