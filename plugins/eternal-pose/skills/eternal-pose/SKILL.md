---
name: eternal-pose
description: "把這份行程做成網站、建立手機旅行地圖、更新我的旅行網站、重新設計行程 type UI、檢查 map-first 與拖曳清單； build a map-first trip site, turn this itinerary or CSV into a travel website, or audit or restyle my generated trip site."
---

# Eternal Pose

Use this skill when the user wants an agent to create, change, enrich, restyle, audit, prepare, or deploy an independent map-first travel website from prose, Markdown, CSV, documents, links, or an existing repository. Treat natural-language intent as the primary interface; do not require a schema or a legacy command.

Treat a weather-only request and a flight-booking request as out of scope unless the user also asks to put that information into a trip site. Do not scaffold a repository for a generic travel question, weather lookup, reservation purchase, or booking transaction.

## Run the control flow

1. Inspect the target and classify Create, Update, Enrich, Restyle, Audit, or Prepare/Deploy.
2. Read every source the user supplied before asking questions.
3. Ask only about contradictions that change the result; preserve uncertain facts as uncertain.
4. Read the routed references before editing.
5. Draft or update without overwriting user-owned IA/UI.
6. Verify data, map/list, mobile sheet, accessibility, safety, and build gates.
7. Stop before remote creation, public access, push, or deploy unless explicitly authorized.

## Classify intent

- Choose **Create** only for an explicit new trip-site target. Refuse to overwrite a non-empty target; inspect an existing repository instead.
- Choose **Update** for scoped changes to an existing generated site. Preserve custom home pages, renderers, information architecture, visual systems, and unrelated data.
- Choose **Enrich** when adding or resolving places, candidates, routes, reservations, or uncertainty. Keep supplied facts distinct from provider results and agent inference.
- Choose **Restyle** for recipe, brand, renderer, home-page, or IA work. Allow the user to replace the default structure while protecting the experience invariants.
- Choose **Audit** for read-only review. Perform zero writes: do not edit files, install packages, run formatters with write flags, create artifacts, or mutate external systems.
- Choose **Prepare/Deploy** for release readiness or an explicitly authorized publication action. Preparation does not itself authorize a remote, public access, push, or deployment.

If intent is mixed, apply the narrowest safe combination and state which parts are read-only or approval-gated. Check available tools rather than assuming every agent has the same browser, hosting, provider, or subagent capabilities.

## Load references

Resolve every resource relative to this `SKILL.md`. Read `references/workflow.md` on every run, then load every row that matches the request. Do not rely on summaries when a routed reference is required.

| Request or gate | Required reference |
| --- | --- |
| Every Create, Update, Enrich, Restyle, Audit, or Prepare/Deploy run | `references/workflow.md` |
| Trip facts, days, nodes, candidates, tasks, reservations, progress, or custom semantics | `references/semantic-model.md` |
| Map, list, route presentation, bottom sheet, responsive behavior, focus, or motion | `references/map-first-contract.md` |
| Map/place/route lookup, provider configuration, navigation, or provider failure | `references/provider-boundaries.md` |
| Recipe selection, visual redesign, renderer work, home page, or IA changes | `references/design-recipes.md` |
| Package dependencies, versions, upgrades, or `eternal-pose.json` | `references/packages.md` |
| Credentials, personal data, destructive work, remote creation, public access, push, or deployment | `references/safety-and-deployment.md` |
| Before any completion, readiness, or compliance claim | `references/testing.md` |

Read all eight references for a full Create. For a scoped Update, load the workflow, the references touched by the requested change, and testing. For Audit, load the workflow plus every contract being audited and keep the entire run zero-write.

## Preserve core invariants

Keep a real map as the single-day base experience, synchronize map and itinerary selection, and keep the itinerary usable with external navigation when a provider fails. Keep ordinary movement as independently owned route edges. Keep the mobile itinerary in an interruptible draggable sheet with collapsed, half, and expanded states. Preserve semantic certainty, accessible focus, keyboard operation, forced-colors behavior, and reduced-motion operation.

Keep protected runtime behavior on the pinned `@laugh-tale-island/core` and `@laugh-tale-island/react` packages instead of re-implementing it locally. Treat generated IA, the home page, type renderers, styling, and folder layout as user-editable. Never restore a starter structure merely because the user reorganized it. Preserve stable facts and IDs across scoped edits. Do not invent coordinates, provider IDs, reservations, opening hours, ticket state, or precise transit facts.

Keep work local and private by default. Do not publish, push, or deploy without explicit approval. Do not create a remote, make a repository public, or create a hosting project without explicit approval for that exact action.
