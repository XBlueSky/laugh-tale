# Package dependencies

Version 2.0.0 generates four exactly pinned packages:

- `@laugh-tale-island/core` — the trip model, validation, scheduling, progress, candidate transitions, route composition, map/timeline presentation builders, owner IDs, and sheet geometry; browser adapter contracts and the localStorage progress store live under `@laugh-tale-island/core/browser`.
- `@laugh-tale-island/react` — `TripController`, `useTripExperience`, behavior and presentation contracts.
- `@laugh-tale-island/adapters` — provider implementations, including browser Google adapters and the separate Google Node search adapter.
- `@laugh-tale-island/testing` — deterministic fake adapters, synthetic trips and generated contract-test support.

Core, react, and adapters belong in `dependencies`; testing belongs in `devDependencies`. Testing helpers and synthetic trips stay out of production flows.

## Rules

- All four dependencies use **exact registry versions** with a committed npm lockfile in registry mode; ranges, `file:`, `link:`, Git, workspace, and local archive references are forbidden there. The separate prepublication contributor workflow in `workflow.md` permits only four attested candidate archives, checked against their package identities, size, SHA-256, integrity, specifiers and lock entries.
- Prefer package APIs for protected behavior; keep visible JSX, CSS, icons, wording, and information architecture in local source. Do not copy package internals into the site merely to restyle them — restyle the local composition instead.
- Semantic statuses come from the packages; the site maps them to its own locale and copy. Moving copy into package code is a defect.
- `eternal-pose.json` records schema 2, generator 2.0.0, recipe `oak-washi` at 2.0.0, presentation contract 2, all four package versions, and enrichment ledger schema/hash. That record describes generated identity; never rewrite it silently or use it to discard customizations.

## Inspect and Audit

- During Inspect, read `eternal-pose.json` and compare its `packages` map with `package.json` dependencies and the installed lockfile versions.
- During Audit, report any drift between recorded, declared, and installed versions as a finding. Audit performs zero writes; it never updates versions, lockfiles, or metadata.

## Upgrades

An upgrade is an explicit, user-approved change — never automatic:

1. Inspect the site's customizations that touch package APIs.
2. Read the release notes of the target package versions.
3. Use the exact exported `upgradeTripProject` invocation in `workflow.md` for schema-v2, same presentation-contract major and explicit exact versions. It atomically changes only `package.json`, `package-lock.json`, and `eternal-pose.json`.
4. After successful Upgrade, run `npm ci` in the project. Package-lock-only regeneration leaves installed `node_modules` unchanged; the lock update alone cannot certify newly installed packages.
5. Run Validate then Verify and the generated-site gates in `testing.md`. Adapt local composition separately only when required and authorized.
6. Present the diff and updated `eternal-pose.json` to the user.

An installation failure is an incomplete upgrade workflow. Audit remains zero-write and reports recorded/declared/installed drift.
