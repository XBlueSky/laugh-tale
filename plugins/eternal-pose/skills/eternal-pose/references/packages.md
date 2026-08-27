# Package dependencies

Generated sites depend on two public npm packages that carry the protected runtime behavior:

- `@laugh-tale-island/core` — the trip model, validation, scheduling, progress, candidate transitions, route composition, map/timeline presentation builders, owner IDs, and sheet geometry; browser adapter contracts and the localStorage progress store live under `@laugh-tale-island/core/browser`.
- `@laugh-tale-island/react` — the behavior hooks: `useTripSelection`, `useTripProgress`, `useRouteStates`, `useUserLocation`, `useCandidateDecision`, `useItinerarySheet`.

## Rules

- Both dependencies are pinned to **exact registry versions** with a committed lockfile. Never introduce ranges, `file:`, `link:`, `git:`, workspace, or tarball specifiers into a generated site.
- Prefer package APIs for protected behavior; keep visible JSX, CSS, icons, wording, and information architecture in local source. Do not copy package internals into the site merely to restyle them — restyle the local composition instead.
- Semantic statuses come from the packages; the site maps them to its own locale and copy. Moving copy into package code is a defect.
- `eternal-pose.json` records the generated package versions in its `packages` map. That record is the truth for what this site was generated against; never rewrite it silently.

## Inspect and Audit

- During Inspect, read `eternal-pose.json` and compare its `packages` map with `package.json` dependencies and the installed lockfile versions.
- During Audit, report any drift between recorded, declared, and installed versions as a finding. Audit performs zero writes; it never updates versions, lockfiles, or metadata.

## Upgrades

An upgrade is an explicit, user-approved change — never automatic:

1. Inspect the site's customizations that touch package APIs.
2. Read the release notes of the target package versions.
3. Update the exact versions and the lockfile together.
4. Adapt local composition if the release notes require it.
5. Run the generated-site gates in `testing.md`.
6. Present the diff and updated `eternal-pose.json` to the user.

Before `1.0.0`, a breaking public API change ships with a migration note under a minor-version bump; treat every pre-1.0 minor as potentially breaking.
