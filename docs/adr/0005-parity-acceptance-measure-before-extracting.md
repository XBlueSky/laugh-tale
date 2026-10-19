---
status: accepted
date: 2026-09-02
---

# Parity acceptance runs on two tracks, and we measure before we extract

Acceptance against the north star (ADR-0001) runs on two tracks. The **experience contract** — the benchmark's craft-level end-to-end tests (header and sheet moving as one transition, drag disabling the height animation, pinch staying inside the map, candidate comparison reflowing at 200% text size, a visible focus ring in forced-colors mode) ported provider-neutral into `@laugh-tale-island/testing` — gates CI for every generated site. Each milestone additionally receives a **manual side-by-side sign-off** on a phone, beginning with sheet and header choreography. A **parity report** uses exactly five statuses: verified, partially verified, not exercised by input, blocked by configuration, failed.

Before any extraction begins, the golden-path run executes once against the published 1.0 packages to produce a baseline report. Nothing is fixed during that run. Extraction then proceeds adapters first, then choreography, then the presentation seam, and finally the visual port and flagship generation.

Automation catches "not broken" but not "good", so manual sign-off cannot be dropped; manual alone does not survive frequent package changes, so the contract suite cannot be dropped either. The baseline turns "not good enough" into a list of failed rows, and proves the measuring tool works before it is needed. Adapters come first because choreography quality cannot be measured until camera intents execute precisely; the seam comes last so its shape is decided by finished choreography rather than guessed.
