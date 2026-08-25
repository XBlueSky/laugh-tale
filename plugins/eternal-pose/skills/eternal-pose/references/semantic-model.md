# Semantic Model

Use semantics to preserve trip meaning independently of card design or folder layout.

## Core entities and identity

- Model a `Trip` with a stable ID, title, IANA timezone, date range, and days.
- Model each `Day` with an absolute date, title, summary, and itinerary nodes.
- Model a `Node` as a timeline event or place the traveler understands or operates.
- Model movement between nodes as a separate `RouteEdge`.
- Model one decision slot with multiple alternatives as a `CandidateGroup`.
- Model a `Reservation` or `Booking` with status, time, reference, and a safe HTTPS URL when supplied.
- Model preparation and reminders as `TripTask`, separate from timeline types.
- Model device-local choices and completion as versioned `TripProgress`.

Give every persistent entity a stable, non-empty ID unique within its namespace. Keep IDs stable when labels, order, presentation, or resolved provider facts change.

## Built-in types

Support these eight built-in semantic types without treating them as an immutable IA:

| Type | Meaning |
| --- | --- |
| `transport` | Local movement that itself has a readable plan or state; keep ordinary short movement as an edge. |
| `transfer` | Long-distance travel with ticket, seat, check-in, or boarding responsibility. |
| `lodging` | Daily base, check-in/out, return, rest, or bag-drop event. |
| `dining` | A chosen venue or a same-slot candidate decision. |
| `shopping` | Store, purchase task, item list, and completion state. |
| `sightseeing` | Landmark, walk, district, or flexible visit. |
| `experience` | Exhibition, activity, viewpoint, or admission-based event. |
| `logistics` | On-trip ordered procedure such as immigration, bag storage, or baggage handling. |

Allow custom types only when they declare their required capabilities. Do not make a renderer infer behavior from a novel type name.

## Orthogonal capabilities

Compose capabilities independently of type:

- Timing: start, end, day offset, and fixed, suggested, or unknown certainty.
- Optionality: core, optional, or candidate.
- Place: coordinates, provider place ID, or unresolved venue.
- Booking: confirmed or pending state, supplied reference, arrival buffer, and safe URL.
- Choice: single-select candidates, committed selection, and draft preview.
- Completion: root task, nested checklist, and shopping-item state.
- Route: walking, transit, driving, or flight plus manual, live, or unavailable source state.
- Presentation hints: safe defaults only; never a permanent CSS or component contract.

Express certainty in visible text and the accessibility tree. Mark an estimated time with “about” or equivalent language; never render a fixed booking as an estimate.

## Candidates

- Show a collapsed group summary; after commitment show only the selected choice plus a clear compare-again action.
- Show every candidate in the list and on the main map while comparison is expanded when locations are available.
- Keep preview separate from commit. Previewing candidate B must not overwrite committed candidate A.
- Persist the stable candidate ID on confirm, collapse the group, and restore focus.
- Rebuild draft selection from the committed choice on cancel or reopen.
- Use matching candidate numbers and state in markers, visible labels, and accessible names.
- Keep unresolved candidates in the list and disclose how many cannot yet be located.

## Tasks and reservations

- Put pre-trip tasks on a replaceable home or preparation surface and day tasks behind that day's tool entry.
- Keep a task out of the itinerary count, markers, and route graph unless it is genuinely a timed event, transport, or ordered on-site process.
- Give disclosure only to nested tasks; do not add expansion to a single step for visual uniformity.
- Preserve reservation truth exactly. Never infer confirmation, ticket state, reference, arrival buffer, or booking time.

## Progress and time

- Derive current and next boundaries from the full schedule before filtering skipped or completed candidates.
- Support cross-midnight time with explicit day offsets and compute in the trip timezone, not the browser timezone.
- Persist candidate choice, shopping status, skipped optional nodes, completed logistics/tasks, and daily reset in strictly validated versioned device-local state.
- Include the trip stable ID in the storage key. Reject malformed payloads as a whole rather than partially trusting them.
- Avoid storage during the first render. Commit hydration for the exact key before persistence; withstand StrictMode replay and key changes without overwriting another trip.
- Keep in-memory progress usable when storage fails and disclose the limitation quietly.
