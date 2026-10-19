# Public V2 source preview

This is a development snapshot, not a package release or a production-readiness
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

## Known repository-wide blockers (2026-10-19)

- Root `npm run type-check` reports 67 errors in the internal Field Atlas
  presentation/tests, which still target the earlier presentation contract.
- Bare `npm test` stalled during root test module collection and was
  interrupted after five minutes without a completed test summary on both Node
  26 and CI-matching Node 22. This is not
  a green full-suite result; separately scoped checks do not replace that gate.
- Root `npm run lint` reports 721 errors across Field Atlas and existing test
  sources, including the Oak style-contract suite. These sources were not
  migrated as part of this privacy-safe snapshot.
- Root `npm audit` reports 18 vulnerable package records: 1 critical, 15 high and 2 moderate.
  All 18 implicated package records are unchanged from public `main`; they
  principally affect the development/release toolchain. This does not make the
  findings safe to ignore. Dependency remediation is required before release.
- The historical `npm run test:starter` convenience script assumes `tmp/`
  exists. Use the documented `npm run stage:starter -- --setup-locale en` flow
  first on a fresh clone.

Do not merge or publish based solely on successful example checks. Physical
device VoiceOver, field Core Web Vitals, live-provider behavior and aesthetic
sign-off remain distinct checks, not claims established by synthetic fixtures.
