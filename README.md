# Laugh Tale

Laugh Tale is an MIT-licensed, agent-native toolkit for building independent, map-first, mobile-first travel websites from real itinerary material.

Its first shared skill, **Eternal Pose**, can turn prose, CSV, Markdown, documents, links, and conversation into a travel-site starting point, then help update, restyle, or audit it. The generated site remains an independent React project and does not need the plugin at runtime.

## Laugh Tale and Eternal Pose

Laugh Tale is the open-source toolkit and marketplace. Eternal Pose is its Claude Code and Codex plugin. It supplies one shared skill and an independent React starter with three compile-time design recipes:

- **Quiet Wood** — warm, restrained, and softly tactile
- **Sticker Brutalist** — high-contrast editorial labels and crisp borders
- **Native Minimal** — neutral, platform-minded clarity

The common contract is a real persistent map, a synchronized mobile itinerary, independent route edges, candidate comparison on the main map, safe drag behavior, and provider-neutral trip data. Generated information architecture, home pages, type renderers, and visual systems remain yours to change.

## Install from a local checkout

This repository does not claim a published marketplace release. Clone or open a trusted local checkout, change into its root, and add that checkout explicitly.

Claude Code:

```bash
claude plugin marketplace add "$PWD"
claude plugin install eternal-pose@laugh-tale
```

Codex:

```bash
codex plugin marketplace add "$PWD"
codex plugin add eternal-pose@laugh-tale
```

Use natural language, such as “turn these itinerary notes into a map-first mobile trip site.” You can also invoke `$eternal-pose` in Codex or `/eternal-pose:eternal-pose` in Claude Code.

## What the skill can do

- **Create** an independent site from prose, CSV, Markdown, documents, links, or conversation.
- **Update** a generated or customized site without restoring the starter over user-owned work.
- **Enrich** places, candidates, routes, and reservations while preserving uncertainty and source boundaries.
- **Restyle** with a built-in recipe or a custom visual system.
- **Audit** map/list behavior, mobile UX, accessibility, privacy, provider boundaries, and release readiness without changing files.
- **Prepare/Deploy** by validating local output first, then stopping for explicit approval before any publication action.

## Privacy and publication

Work stays local and private by default. Eternal Pose does not invent coordinates, reservations, routes, or other facts, and it does not create a remote, make a repository public, push, publish, or deploy without explicit approval for that action. Google Maps JavaScript, Places, Routes, and Transit support are separately configured; generated sites remain useful through external Maps URLs when provider data is unavailable.

## Develop and contribute

Requirements: Node.js 22 or newer and npm.

```bash
npm ci
npm run stage:starter
LAUGH_TALE_STARTER_ROOT="$PWD/tmp/staged-starter" npm run check
npm run test:starter:staged
npm --prefix tmp/staged-starter exec playwright install chromium
npm run test:e2e:staged
```

Until `@laugh-tale/core` is published, starter checks run against a staged copy in `tmp/staged-starter` whose dependencies install from locally packed tarballs; `npm run stage:starter` builds and refreshes it.

Marketplace presentation source lives in `.cc-marketspec/catalog.yaml` and `.cc-marketspec/entries/`. `npm run check:marketplace` validates without writing; `npm run build:marketplace` produces the ignored `.cc-marketspec/dist/manifest.json` only when a consumer needs it. Contributions should preserve the map-first/mobile-first experience contract, keep provider calls fake in tests, and include focused regression coverage.

## License and attribution

Code and original repository content are available under [MIT](LICENSE). See [NOTICE.md](NOTICE.md) for the non-affiliation statement.
