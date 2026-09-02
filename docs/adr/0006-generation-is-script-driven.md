---
status: accepted
date: 2026-09-02
---

# Generation is script-driven; the agent judges content

The Eternal Pose skill is narrative only. `create-trip-project.mjs` and `validate-trip-project.mjs` exist but are invoked solely by CI, and the skill's references have drifted from the code they describe.

We decided that every mechanical step — creating a project, applying a recipe, validating, pinning and upgrading package versions — is a deterministic script that the skill invokes explicitly. Agent judgement is reserved for understanding itinerary content, asking about missing facts, and Restyle trade-offs.

"Agent-first" (ADR-0001) means reliable reproduction, not free improvisation. The north-star acceptance is only repeatable if generation is.
