# Trip experience contract

## Product principle

Eternal Pose is a Map-first mobile travel experience: one persistent large map stays synchronized with a highly usable itinerary list. It is not a generic card dashboard and it must not turn every route into a place row.

## Freely editable

The homepage, information architecture, wording, section order, semantic renderers, custom itinerary types, color tokens, typography, icons, and selected visual recipe are freely editable. An agent may replace the starter composition, add new widgets, or reorganize content when that better fits the traveler. Preserve existing user customizations unless the user asks to replace them.

## Protected invariants

The following protected invariants keep a customized site recognizably safe and useful:

- Keep a persistent map and mobile itinerary sheet as coordinated primary surfaces. The list must remain smooth and interruptibly draggable across collapsed, half, and expanded snaps, including short screens and safe areas.
- A place selected from the list focuses the same place on the map; a map selection returns to and selects the same list owner. Candidate comparison uses the persistent large map, with draft, confirm, cancel, selected-only collapse, and reopen semantics.
- Routes are independent edge owners between places. Short walking context stays compact; longer walking and transit can disclose details. Static authored routes remain useful without a route provider. Loading, ready, unavailable, retry, list focus, and map focus all belong to the same route id.
- Calendar dates and the trip timezone are authoritative. Express fixed, suggested, and unknown timing honestly, including cross-midnight experiences. Never infer a booking or completion state.
- Progress is trip-scoped, versioned, and resilient when persistence is unavailable. Never write live location or provider credentials to progress storage.
- Provider-neutral interfaces remain outside provider implementations. Production uses configured Google adapters only; missing content, missing keys, and provider load failures are explicit setup states. Fake providers are test-only and visibly labeled.
- Touch controls are at least 44 by 44 CSS pixels, keyboard focus remains visible and restorable, screen-reader names contain meaningful dates and certainty, forced colors remain legible, and reduced-motion preferences remove nonessential movement.

The pure trip model, validation, scheduling, progress, route, timeline, map-presentation, and sheet-geometry invariants are provided by the exact pinned `@laugh-tale/core` version; upgrade the package rather than re-implementing them locally.

## Change protocol

Inspect current code and user-authored content first. Keep a focused test for every protected behavior you change, run `npm run check`, and run the relevant mobile Playwright coverage. Use synthetic fixtures only in tests; never copy private itinerary or credential data into reusable source.
