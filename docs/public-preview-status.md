# Public V2 source preview

This snapshot was published as the 2.0.0 packages; it is not a production-readiness
certificate. It starts from public `main` and contains no private development
ancestry. The generated Meridian example uses fictional test content. Private
trip inputs, operational reports, deployment records and live environment files
are deliberately absent.

## Verification boundary

The public example must remain byte-identical to fresh Create output. The root
identity tests check its neutral input, empty acceptance ledger, canonical
presentation and runtime. `npm run stage:example` installs local package tarballs;
`npm run test:example:staged` checks that independent generated application.
The Oak browser suite compares 60 synthetic baselines without updating them.

Fresh local checks on 2026-10-19:

- Staged Meridian `check`: 80 tests, type-check, lint and production build passed.
- Four workspace package test suites: 1,181 tests passed.
- Scoped Oak unit suite on local Node 26: 303 passed. Earlier parallel-load runs
  hit 5-second timeouts in the presentation synchronization tests; the unchanged
  suite passed after the browser load finished.
- Oak browser suite: 382 passed, including all 60 read-only visual comparisons.
- Generated MapLibre browser suite: 75 passed with local synthetic tiles.
- Generated mobile Playwright suite: 51 passed after replacing a stale DOM-class
  assertion with explicit selected-date and confirmation-date checks.
- Public example identity and atomic replacement/recovery suites: 24 passed.
  The neutral input uses the generator's canonical JSON bytes so strict artifact
  verification and injected-failure/crash tests exercise the intended boundary.

## Repository-wide gates (2026-10-27, integrated with `main`)

The 2026-10-19 blockers were resolved while landing V2 on `main`:

- Root `npm run type-check` and `npm run lint` pass. Field Atlas still targets
  the removed v1 presentation contract, so `plugins/eternal-pose/recipes-v2/field-atlas`
  is excluded from both root gates until it is migrated; Create already rejects
  it as a retired recipe.
- The v1-contract product worlds added on `main` (Live Journey, Pocket Instrument,
  Reset Arcade) and their tests were removed rather than shipped broken. Their
  source remains in history (commit `58de156`) and on
  `codex/headless-theme-implementation`.
- Bare `npm test` completes; it does not stall. The Create/Upgrade/Verify suites are
  slow (4-15 s per case on macOS), so the unit project uses a 30 s test timeout.
- `jsdom` is pinned to 30.0.1 in the root workspace: 30.1.3 computes
  `border-width` overrides of a `var()` border shorthand as `0px`, which breaks
  the Oak map-marker state assertions.
- The 60 reviewed Oak goldens are macOS Chromium renders. CI (Linux) runs every
  Oak browser assertion but compares screenshots only on macOS, and allows a
  one-pixel run-width difference in the selective-font shaping proof (HarfBuzz
  shapes the subset and original identically). Run `npm run test:oak-washi:browser`
  on macOS before changing Oak presentation.
- `npm audit`: production dependencies report 0 vulnerabilities. Two
  development findings (`undici`, `ip-address`) remain inside the npm CLI bundled
  by `@semantic-release/npm`, already at the latest npm 11 release.
- The historical `npm run test:starter` convenience script assumes `tmp/`
  exists. Use the documented `npm run stage:starter -- --setup-locale en` flow
  first on a fresh clone.

Do not merge or publish based solely on successful example checks. Physical
device VoiceOver, field Core Web Vitals, live-provider behavior and aesthetic
sign-off remain distinct checks, not claims established by synthetic fixtures.
