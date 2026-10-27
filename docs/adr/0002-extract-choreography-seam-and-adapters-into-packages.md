---
status: accepted
date: 2026-09-02
---

# Extract choreography, the presentation seam, and adapters into packages (2.0)

The 1.0 packages hold pure functions and six hooks, about 3,000 lines. The starter holds about 17,400 lines, including a 1,198-line experience controller, the Google adapters, and the unpublished `TripPresentation` contract that every recipe implements. Every generated site copies all of that, so the craft that lives there decays one site at a time. The packages were cut along "pure versus side-effecting" when the useful cut is "behaviour versus presentation".

We decided that 2.0 is a breaking release that moves three layers into packages and stops at the fourth:

- **Choreography** — selection and focus coordination between map and list, camera policy, map padding derived from header and sheet, the minute clock, return-to-now and return-to-lodging, day switching. State machines go into `core`, React bindings into `react`.
- **Presentation seam** — the view-model, actions, and bindings contract a recipe implements is published and versioned, and guarded by tests.
- **Adapters** — provider implementations move to a new `@laugh-tale-island/adapters` package (ADR-0004); fake adapters, fixtures, and the experience contract suite move to `@laugh-tale-island/testing`.
- **Not extracted** — visible components, CSS, copy, icons. A generated site continues to own every pixel. This is the one property that separates Laugh Tale from both UI kits and headless frameworks.

The four packages ship as one lockstep release train.

## Considered options

- Keep the thin-package boundary and improve the starter. Rejected: the starter is copied, not shared, so improvements do not reach existing sites.
- Move components and CSS into npm. Rejected: gives up site ownership of presentation.

## Consequences

- Supersedes, from the 2026-08-27 packages spec: "react exports exactly six hooks and no components" and the non-goal "no MapAdapter or provider package". Supersedes, from the 2026-08-30 theme spec: "no new hooks" and "no change to the Trip model".
- The Trip model gains route-mode uncertainty so a route edge can exist before its mode is confirmed. Unknown never defaults to walking.
- All 1.0 recipes (`quiet-wood`, `sticker-brutalist`, `native-minimal`, `field-atlas`) retire without aliases. One recipe format remains. Source stays in git history.
- 2.0 is built on one long-lived branch off `main` and merged once. During that time the flagship and starter install the packages from locally packed tarballs, never workspace links or `file:` specifiers, so packaging errors surface before publication.
- URL and deep-link state is out of scope for 2.0, but the state model must leave an adapter seam for it, in the same way `ProgressStore` does for persistence. It is the first capability added after parity.
