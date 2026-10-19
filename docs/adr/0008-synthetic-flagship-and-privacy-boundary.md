---
status: accepted
date: 2026-09-02
supersedes-in-part: 0003-tokyo-trip-map-as-benchmark-and-behaviour-source
---

# Synthetic flagship and public example privacy boundary

The public repository needs a generated site that exercises map/list choreography, presentation, and package integration without publishing a person's trip. The flagship-first direction (ADR-0001) therefore uses an explicitly synthetic example.

We decided:

- **The flagship is `examples/meridian`.** It is generated from the neutral `syntheticTripV2` input and serves as the public end-to-end target.
- **All trip details are fictional.** Future dates, names, coordinates, travel segments, lodging, and reservation-shaped data are test inputs. They do not identify a traveller, describe real bookings, establish place resolution, or represent verified provider results.
- **Private content stays outside the public snapshot.** Personal itinerary files, private site URLs and deployment identities, private machine paths, and private source commit references are excluded from public examples and documentation.
- **The starter and flagship share presentation.** The starter contains the shared runtime and Oak & Washi presentation with its trip content removed. Content differences are intentional; shared presentation changes should be synchronized.
- **Behaviour is owned by packages.** Controllers, map viewport policy, provider adapters, and their tests belong behind the documented package boundaries. The example consumes those contracts.
- **Verification states its scope.** Synthetic fixtures and automated screenshots verify only their declared assertions. They are not evidence of external visual parity, live provider correctness, VoiceOver testing, or an award assessment.

## Considered options

- Publish a personal itinerary after replacing selected fields. Rejected: schedules, place combinations, and development records can still reveal personal facts.
- Use only an empty starter. Rejected: it does not exercise populated itinerary interactions.
- Use a generated synthetic flagship. Chosen: it exercises the public contracts while keeping personal trip material outside the repository.

## Consequences

- The experience contract in `@laugh-tale-island/testing` uses synthetic fixtures that can run without personal trip data or a live provider.
- Fictional example content must remain clearly labelled. Generated sites based on a user's real itinerary must preserve authored facts and uncertainty rather than inventing replacements.
- Public documentation describes reproducible checks without copying private operational records or claiming verification that has not been performed.
- This replaces ADR-0003's choice of `examples/tokyo` as the flagship. The Tokyo baseline generated against the 1.x packages stays in the repository as a historical parity record (its itinerary is not considered sensitive), but it is no longer the end-to-end target.
