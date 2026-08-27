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

- [ ] Own the `laugh-tale-island` npm organization (free plan; public packages).
- [ ] Create a **granular npm access token** with read/write on the
      `@laugh-tale-island` scope, allowed to bypass 2FA for automation, and add
      it to the GitHub repository as the `NPM_TOKEN` Actions secret.
- [ ] Push the `v0.0.0` baseline tag together with `main`
      (`git push --follow-tags`). semantic-release otherwise starts at
      `1.0.0`; from the baseline, the release-setup `feat:` commit computes
      `0.1.0`, which must match the starter's exact pins.

## After the first successful publish (still required)

1. [ ] Regenerate the starter lockfile from the public registry
       (`npm --prefix plugins/eternal-pose/starter/react install`) and commit
       it; restore direct starter installs in CI (`npm ci` in the starter
       replaces the staged path).
2. [ ] Generate a clean site through
       `plugins/eternal-pose/scripts/create-trip-project.mjs`, run `npm ci`
       and its full checks in that site with no Laugh Tale checkout on any
       resolution path.
3. [ ] Announcing the package-backed plugin release in any marketplace remains
       separately approval-gated.

> Until those lockfile steps complete, direct `npm ci` inside
> `plugins/eternal-pose/starter/react` fails; use the staged flow
> (`npm run stage:starter`) documented in the README.

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
