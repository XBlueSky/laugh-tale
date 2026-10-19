---
status: accepted
date: 2026-09-02
---

# Flagship-first, agent-native direction

Laugh Tale 1.0 positioned itself as "AI-generated sites first, with a small headless layer", and the theme work that followed produced four presentation worlds without touching the packages. A shared generated example makes interaction feel and map/list choreography testable alongside visual design.

We decided that a single flagship site, generated from explicitly synthetic itinerary data, is the public end-to-end target. The Eternal Pose generator exists to reproduce its capabilities for new trips; the headless packages exist to make that reproduction reliable; publishing them as a general-purpose headless library is a by-product, not the goal. APIs are designed agent-first and human-compatible: shaped for reliable reproduction by an agent, usable by a React developer.

**North star.** The generated `examples/meridian` site exercises the shared experience contract with fictional places, coordinates, travel details, and future dates. Its checks establish only their documented scope; they do not prove parity with an external site or manual device approval. When trading off, the order is interaction feel, then visual craft, then map behaviour.

## Considered options

- **General headless primitives library** (the Radix / React Aria path). Rejected: headless is a commodity and we have no differentiation there.
- **Generator only, packages as an invisible implementation detail.** Rejected: without a proven flagship the quality claim is a promise.
- **Flagship feeds generator, headless as by-product.** Chosen.

## Consequences

- The number of recipes becomes an outcome, not a target. Every recipe must satisfy the shared acceptance process (ADR-0005) to exist.
- Public examples use synthetic input and exclude personal itinerary records, private deployment identities, and private development provenance (ADR-0003).
