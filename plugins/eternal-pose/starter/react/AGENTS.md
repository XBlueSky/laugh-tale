# Agent guidance

Inspect the actual repository structure and current user customizations before editing. Do not assume the generated first draft is still authoritative.

Read [docs/trip-experience-contract.md](docs/trip-experience-contract.md) before changing the experience. Preserve intentional user customizations while maintaining its protected invariants. Run `npm run check` for every implementation change and targeted Playwright tests with `npm run test:e2e` whenever a protected interaction contract changes. Pure trip runtime comes from the pinned `@laugh-tale/core` package; do not copy its internals into this repository to restyle them.
