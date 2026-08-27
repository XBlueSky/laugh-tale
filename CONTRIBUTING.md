# Contributing to Laugh Tale

Thanks for your interest in improving Laugh Tale! This document explains how to
set up a development environment, what we expect from changes, and how releases
work. By participating you agree to follow our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** — open a [bug report](https://github.com/XBlueSky/laugh-tale/issues/new/choose)
  with reproduction steps.
- **Propose a feature** — start a [discussion](https://github.com/XBlueSky/laugh-tale/discussions)
  or open a feature request issue before writing code, so we can agree on the
  direction first.
- **Improve docs** — small documentation PRs are always welcome without prior
  discussion.
- **Report a security issue** — never through a public issue; see
  [SECURITY.md](SECURITY.md).

## Repository layout

| Path | What lives there |
| --- | --- |
| `packages/core` | `@laugh-tale-island/core` — framework-neutral trip behavior |
| `packages/react` | `@laugh-tale-island/react` — React hooks and prop-getters |
| `plugins/eternal-pose` | The Eternal Pose plugin: shared skill, recipes, and the React starter |
| `.cc-marketspec` | Marketplace presentation source (`catalog.yaml`, `entries/`) |
| `scripts` | Release and staging automation |

## Development setup

Requirements: Node.js 22.13 or newer and npm.

```bash
npm ci
npm run stage:starter
LAUGH_TALE_STARTER_ROOT="$PWD/tmp/staged-starter" npm run check
npm run test:starter:staged
npm --prefix tmp/staged-starter exec playwright install chromium
npm run test:e2e:staged
```

`npm run stage:starter` builds the workspace packages, packs them into
tarballs, and installs a copy of the starter in `tmp/staged-starter` against
those tarballs — so every check runs against your local, unpublished changes
exactly the way a consumer would install them.

`npm run check` bundles plugin-contract validation, marketplace validation,
package builds, unit tests, type checks, and linting. CI runs the same
commands, so a green local run is a good predictor of a green PR.

## What we expect from changes

- **Preserve the experience contract.** Generated sites are map-first and
  mobile-first: a real persistent map, a synchronized mobile itinerary,
  independent route edges, candidate comparison on the main map, safe drag
  behavior, and provider-neutral trip data.
- **Keep provider calls fake in tests.** Tests must never hit Google Maps or
  any other external service.
- **Include focused regression coverage.** A bug fix should come with a test
  that fails without it; a feature should come with tests for its contract.
- **Keep PRs small and focused.** One logical change per PR reviews faster and
  lands sooner.

## Commit messages

This repository releases automatically with
[semantic-release](https://github.com/semantic-release/semantic-release), which
computes versions from [Conventional Commits](https://www.conventionalcommits.org/):

- `fix: …` → patch release
- `feat: …` → minor release
- `fix!: …` / `feat!: …` or a `BREAKING CHANGE:` footer → major release
- `docs:`, `test:`, `chore:`, `refactor:`, … → no release

Because of this, **never bump versions or edit `CHANGELOG.md` by hand** — the
release pipeline owns both. Just write an accurate conventional commit and the
right release happens on merge.

## Pull request process

1. Fork the repository and create a branch from `main`.
2. Make your change, following the expectations above.
3. Run the full check suite locally (see “Development setup”).
4. Open a PR with a conventional-commit-style title and fill in the template.
5. CI must pass and a maintainer will review. Squash merges keep the
   conventional history that semantic-release reads.

## Releases

Releases are fully automated — see [RELEASING.md](RELEASING.md) for how the
release train works. Contributors never publish anything manually.
