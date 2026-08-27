# Releasing Laugh Tale

Three release lines share this repository: the Eternal Pose plugin/marketplace, `@laugh-tale/core`, and `@laugh-tale/react`. Every externally visible action below is separately approval-gated. A successful local pack is **never** reported as a release.

## Initial package release (from branch `headless-packages`)

1. [ ] Workspace gates green: `npm ci && npm run stage:starter && LAUGH_TALE_STARTER_ROOT="$PWD/tmp/staged-starter" npm run check`.
2. [ ] Staged starter gates green: `npm run test:starter:staged && npm run test:e2e:staged`.
3. [ ] Artifact gates green: `npx vitest run tests/packages` (tarball allowlists + clean tarball consumer).
4. [ ] Publication scan clean over both packed tarball file lists.
5. [ ] **STOP — explicit user approval required.** Confirm all of: npm authentication (2FA), control of the `@laugh-tale` npm organization, and the exact versions to publish. If the scope cannot be obtained, stop and revise the design spec; do not publish under another name.
6. [ ] Publish `@laugh-tale/core@0.1.0` publicly, then `@laugh-tale/react@0.1.0` publicly.
7. [ ] Regenerate the starter lockfile from the public registry (`npm --prefix plugins/eternal-pose/starter/react install`) and commit it on this branch; restore direct starter installs in CI (`npm ci` in the starter replaces the staged path).
8. [ ] Generate a clean site through `plugins/eternal-pose/scripts/create-trip-project.mjs`, run `npm ci` and its full checks in that site with no Laugh Tale checkout on any resolution path.
9. [ ] Merge `headless-packages` into `main` only after steps 6–8 succeed, so `main` never carries a starter whose lockfile cannot resolve.
10. [ ] **STOP — separate approvals** for each of: pushing to the remote, creating a GitHub release or tag, and announcing the package-backed plugin release in any marketplace.

## Subsequent releases

- Packages follow SemVer independently; `@laugh-tale/react` declares the exact `@laugh-tale/core` version it was tested against.
- Before `1.0.0`, a breaking public API change requires a migration note and a minor-version bump.
- A plugin release that bumps the starter's pinned versions records those versions in its release notes so Update and Audit flows can recognize them.
- Every release line keeps release notes; generated sites are never upgraded automatically (see the Eternal Pose `packages.md` reference for the explicit upgrade flow).
- CI stays read-only. A future trusted-publishing workflow remains separately approval-gated.
