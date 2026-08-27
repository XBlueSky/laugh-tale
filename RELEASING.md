# Releasing Laugh Tale

Three release lines share this repository: the Eternal Pose plugin/marketplace,
and the two npm packages `@laugh-tale-island/core` and `@laugh-tale-island/react`.
Since 2026-08-27 the two packages ship as **one lockstep release train**
published automatically by semantic-release (modeled on `cc-marketspec`),
superseding the earlier manual runbook. A successful local pack is still
**never** a release.

## How a package release happens

1. A push to `main` runs the `check` job (workspace gates against the staged
   tarball-installed starter, including Playwright E2E).
2. When `check` is green, the `release` job runs `npx semantic-release`:
   - the version is computed from conventional commits since the last tag
     (`fix:` → patch, `feat:` → minor, `BREAKING CHANGE:` → major; other types
     release nothing);
   - `scripts/set-release-versions.mjs` lockstep-bumps both packages and pins
     react's `peerDependencies`/`devDependencies` on core to the exact new
     version, then the lockfile is resynced;
   - both packages are built and published with `--provenance --access public`,
     core before react;
   - a GitHub release and `CHANGELOG.md` entry are created, and the version
     bump is committed back with `[skip ci]`.

There is no publish path outside that job. Locally you can rehearse with
`npx semantic-release --dry-run` (needs a `GITHUB_TOKEN`).

## One-time setup (owner actions)

- [x] Own the `laugh-tale-island` npm organization (free plan; public packages).
- [x] Create a **granular npm access token** with read/write on the
      `@laugh-tale-island` scope, allowed to bypass 2FA for automation, and add
      it to the GitHub repository as the `NPM_TOKEN` Actions secret.
- [x] ~~Push the `v0.0.0` baseline tag together with `main`.~~ This step never
      ran: the baseline tag stayed local, so semantic-release started at
      `1.0.0` on 2026-08-27. `1.0.0` is therefore the first published version
      of both packages, and the starter's pins were updated to match it.

## After the first successful publish (completed 2026-08-27 for 1.0.0)

1. [x] The starter pins the published `1.0.0` packages and its lockfile
       resolves entirely from the public registry. CI deliberately keeps the
       staged tarball flow (`npm run stage:starter`) instead of switching to
       direct starter installs, so every check still exercises unpublished
       workspace changes the way a consumer would install them.
2. [x] A clean site generated through
       `plugins/eternal-pose/scripts/create-trip-project.mjs` passed `npm ci`
       and its full checks with no Laugh Tale checkout on any resolution path.
3. [ ] Announcing the package-backed plugin release in any marketplace remains
       separately approval-gated.

## Subsequent releases

- Core and react always share one version; react declares the exact
  `@laugh-tale-island/core` version it was tested against (enforced by
  `set-release-versions.mjs`).
- Before `1.0.0`, a breaking public API change requires a migration note and a
  minor-version bump — type the commit accordingly.
- Starter pins and recorded `eternal-pose` versions are **not** bumped by the
  release train. A plugin release that bumps the starter's pinned versions does
  so deliberately, tests against them, and records those versions in its
  release notes so Update and Audit flows can recognize them.
- Generated sites are never upgraded automatically (see the Eternal Pose
  `packages.md` reference for the explicit upgrade flow).
