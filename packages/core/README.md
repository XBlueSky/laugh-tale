# @laugh-tale-island/core

Framework-neutral trip behavior for map-first travel sites: the semantic trip model, validation, timezone-aware scheduling, device progress, effective-itinerary and candidate resolution, candidate comparison-session transitions, route-edge composition, pure map/timeline presentation builders, stable owner identifiers, and sheet snap geometry.

This package contains **no finished visual system** — no components, CSS, icons, wording, or page structure. A consuming site owns all of those; the package protects the behavior invariants underneath them.

## Install

```bash
npm install @laugh-tale-island/core
```

Requires Node.js `>=22.13.0` for building and testing. ESM only.

Core is the root of the four-package DAG and has no dependency on React, adapters, or testing. React and adapters each depend on core; the test-only testing package depends on all three. Internal package edges and versions are exact and released in lockstep.

## Entry points

- `@laugh-tale-island/core` — the default entry. Usable without React, a DOM, local storage, geolocation, or a map SDK.
- `@laugh-tale-island/core/browser` — provider-neutral browser contracts (`MapAdapter`, `RouteAdapter`, `PlaceAdapter`, `NavigationAdapter`) and an injectable `ProgressStore` with a `localStorage` adapter. This subpath may reference web-platform types.
- `@laugh-tale-island/core/enrichment` — provider-neutral place-search queries, results, adapters, and resolution provenance for server-side enrichment workflows.

No other import path is public; the `exports` map blocks package internals.

## Minimal usage

```ts
import {
  validateTrip,
  resolveEffectiveItinerary,
  emptyTripProgress,
  buildTimelineEntries,
  buildMapPresentation,
  type Trip,
} from "@laugh-tale-island/core";

const trip: Trip = /* your typed trip content */;

const validation = validateTrip(trip);
if (!validation.valid) {
  // Structured issues with paths and codes — render them your own way.
  throw new Error(validation.issues.map((issue) => issue.message).join("\n"));
}

const effective = resolveEffectiveItinerary(trip, emptyTripProgress());
const day = effective.days[0]!;
const timeline = buildTimelineEntries(day, effective);
const map = buildMapPresentation(day, {});
```

## Failure semantics and privacy

- Invalid trip data returns structured validation issues; documented programmer misuse may throw.
- Provider operations return structured unavailable reasons and optional diagnostics. Diagnostics are non-display evidence: map reasons and messages to site-owned copy instead of rendering provider text.
- Selectors treat inputs as immutable and never fabricate coordinates, bookings, or provider facts.
- Semantic statuses are returned instead of display strings; the consuming site maps them to its own locale and wording.
- The package performs no network access or runtime place search and ships no itinerary data, credentials, or personal information. Enrichment is explicit build-time or server-side work through an injected adapter; the package never discovers an API key or service on its own. The `localStorage` progress adapter degrades to memory-only when storage fails and never stores live location.

## Experience contract

The behaviors here are extracted from and verified against the Eternal Pose React starter. The map-first experience contract lives at
[`plugins/eternal-pose/starter/react/docs/trip-experience-contract.md`](../../plugins/eternal-pose/starter/react/docs/trip-experience-contract.md).

## License

MIT. Laugh Tale is an unofficial fan homage; see the repository [NOTICE](../../NOTICE.md) for the non-affiliation statement.
