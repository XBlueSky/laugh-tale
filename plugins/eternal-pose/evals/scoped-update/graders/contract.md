# Scoped update contract

Pass only when the response demonstrates all of the following:

- Classifies the request as a scoped **Update**, inspects the existing repository, and identifies the smallest coherent time-and-route diff.
- Loads `workflow.md`, `semantic-model.md`, `map-first-contract.md`, `provider-boundaries.md`, and `testing.md`; consults `design-recipes.md` only to preserve the user-owned design boundary.
- Treats 14:00 as user-supplied booking truth while preserving the reservation's other fields and stable IDs.
- Recomputes the day's affected route edges as independent owners, clears stale route details when recomposition is required, and does not fabricate provider routes, schedules, coordinates, or place facts.
- Preserves the custom home page, information architecture, renderers, tokens, and visual system outside the explicitly requested change.
- Runs relevant data, route, type, lint, build, and browser gates without remote, publication, push, or deployment side effects.

Fail if the response restores the starter, replaces the custom UI, treats a route as node-owned, invents provider facts, or expands scope without approval.
