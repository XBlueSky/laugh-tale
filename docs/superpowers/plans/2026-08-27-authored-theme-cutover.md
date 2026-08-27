# Authored Theme Atomic Cutover and Hardening Implementation Plan (Phase 4 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atomically replace the public three-skin catalog with exactly six recipe-v2 presentations, make Field Atlas the committed/default starter, delete all transitional v1 machinery, update every supported surface, and gate all six generated consumers in CI.

**Architecture:** `plugins/eternal-pose/recipes/` becomes the only catalog and contains six validated v2 directories. The generator has one code path: validate the full catalog, default to Field Atlas, replace `src/presentation`, copy only selected assets/guide, record schema 2, and publish through its existing owned-stage/owned-target transaction. The committed starter contains the same Field Atlas presentation tree as the recipe and uses no runtime selector. CI stages one recipe per matrix job against locally packed headless packages.

**Tech Stack:** Existing Node.js/TypeScript/React toolchain, recipe-v2 compiler, Vitest, Playwright, GitHub Actions, Astro marketplace site.

**Spec:** `docs/superpowers/specs/2026-08-27-authored-theme-catalog-design.md`

## Global Constraints

- Complete and review Phases 1–3 first. Do not begin cutover while any recipe-specific test, browser review, media case, or composed consumer is failing.
- This phase is one breaking catalog change. Tasks 1–4 remain uncommitted checkpoints until generator, starter, docs, site, and tests agree; Task 4 creates the single atomic cutover commit. Never commit a state where old and new recipe IDs are both public, fewer than six new IDs are public, or docs claim a catalog different from the generator.
- Delete `quiet-wood`, `sticker-brutalist`, and `native-minimal` directories and supported references. Do not add aliases, warnings, deprecation maps, migration helpers, automatic substitutions, or compatibility branches.
- Delete every `TRANSITIONAL_V1` branch and the standalone `recipe.css` contract. Final generation replaces a complete presentation tree.
- `field-atlas` is the API/CLI/default guidance choice when no visual direction is supplied.
- Generated output contains one presentation, its declared local assets, its optional Google guide, and no recipe catalog/registry/selector.
- Preserve user target safety: unknown IDs and invalid catalogs fail before destination reservation; non-empty targets remain untouched; race/symlink/ownership failures leave no partial destination.
- Preserve the four customization levels in docs. Audit observable safety/behavior, never byte identity, after a user edits a generated site.
- No theme npm package, runtime selector, shared production Google map ID, remote asset dependency, copied reference asset, or private fixture.
- Historical references may remain only in `CHANGELOG.md` and approved `docs/superpowers/{specs,plans}/`; supported docs, source, tests, site copy, plugin guidance, and selector output must contain none of the removed IDs.
- Do not stage unrelated untracked user files.

---

### Task 1: Write the atomic cutover regression test (RED)

**Files:**
- Create: `tests/generation/catalog-cutover.test.ts`
- Modify: `tests/generation/recipes.test.ts`
- Modify: `tests/generation/create-real-starter.test.ts`
- Modify: `tests/scripts/create-trip-project.test.ts`

**Interfaces:**

```ts
export const RECIPE_IDS = [
  "field-atlas",
  "live-journey",
  "memory-cinema",
  "pocket-instrument",
  "reset-arcade",
  "vacation-os",
] as const;

export const DEFAULT_RECIPE_ID = "field-atlas";
```

- [ ] **Step 1: Replace old catalog expectations with exact v2 expectations**

The new test must assert:

- exact sorted six-directory inventory and unique schema-2 IDs;
- `DEFAULT_RECIPE_ID === "field-atlas"`;
- no `plugins/eternal-pose/recipes-v2` directory;
- no `recipe.css` in recipe or starter source;
- one `TripPresentation` entry, required CSS, declared assets, profile, and optional guide per manifest;
- the recursive regular-file inventory and bytes of Field Atlas `presentation/` equal the committed starter `src/presentation/` source tree, excluding generated caches, test files, and the mirrored README; the recipe root `README.md` is byte-identical to starter `src/presentation/README.md`;
- removed IDs reject before destination creation and the error lists the six valid IDs;
- omitted API/CLI recipe selects Field Atlas;
- generated provenance records `recipeSchemaVersion: 2`;
- a generated consumer includes only the selected presentation, its copied `src/presentation/README.md`, assets, and guide, with no other recipe ID/catalog source/runtime selector;
- no manifest path escape or symlink can publish a target.

- [ ] **Step 2: Run the cutover tests and confirm RED**

Run:

```bash
npm test -- tests/generation/catalog-cutover.test.ts tests/generation/recipes.test.ts tests/generation/create-real-starter.test.ts tests/scripts/create-trip-project.test.ts
```

Expected: FAIL on old directories, v1 manifest shape, old CSS composition, and missing defaults.

- [ ] **Step 3: Do not weaken the assertions**

Keep the exact six-ID and removed-ID expectations. Phase 4 implementation changes source to satisfy the test; it does not add an allowlist, alias, compatibility flag, or conditional old behavior.

---

### Task 2: Move the six recipes into the public catalog and make the generator v2-only

**Files:**
- Delete: `plugins/eternal-pose/recipes/quiet-wood/**`
- Delete: `plugins/eternal-pose/recipes/sticker-brutalist/**`
- Delete: `plugins/eternal-pose/recipes/native-minimal/**`
- Move: `plugins/eternal-pose/recipes-v2/field-atlas` → `plugins/eternal-pose/recipes/field-atlas`
- Move: `plugins/eternal-pose/recipes-v2/reset-arcade` → `plugins/eternal-pose/recipes/reset-arcade`
- Move: `plugins/eternal-pose/recipes-v2/pocket-instrument` → `plugins/eternal-pose/recipes/pocket-instrument`
- Move: `plugins/eternal-pose/recipes-v2/vacation-os` → `plugins/eternal-pose/recipes/vacation-os`
- Move: `plugins/eternal-pose/recipes-v2/memory-cinema` → `plugins/eternal-pose/recipes/memory-cinema`
- Move: `plugins/eternal-pose/recipes-v2/live-journey` → `plugins/eternal-pose/recipes/live-journey`
- Modify: `plugins/eternal-pose/lib/recipe-v2.mjs`
- Create: `plugins/eternal-pose/lib/verify-composed-project.mjs`
- Modify: `plugins/eternal-pose/scripts/create-trip-project.mjs`
- Modify: `scripts/stage-starter-consumer.mjs`
- Modify: `tests/generation/catalog-cutover.test.ts`
- Modify: `tests/generation/recipes.test.ts`
- Modify: `tests/generation/create-real-starter.test.ts`
- Modify: `tests/scripts/create-trip-project.test.ts`
- Modify: `tests/scripts/stage-starter-consumer.test.ts`
- Create: `tests/generation/verify-composed-project.test.ts`

- [ ] **Step 1: Move/delete the exact directories with Git-aware operations**

Use `git rm` for the three old directories and `git mv` for all six completed v2 directories. Verify `plugins/eternal-pose/recipes-v2` is empty, then remove the empty directory. Do not delete or rewrite anything outside these exact recipe roots.

- [ ] **Step 2: Make catalog validation unconditional**

At module startup or the beginning of `createTripProject`, load the complete canonical `plugins/eternal-pose/recipes` catalog and require exact unique manifests before validating the selected ID. Keep a dependency-injected `catalogRoot` only for isolated tests; remove all v1 detection, CSS-file selection, canonical single-CSS helpers, and `TRANSITIONAL_V1` branches.

`createTripProject` accepts:

```ts
interface CreateTripProjectOptions {
  pluginRoot: string;
  targetDir: string;
  recipe?: string;
  starterDir?: string;
  catalogRoot?: string;
}
```

Normalize `recipe ?? DEFAULT_RECIPE_ID`. An unknown ID error is:

```text
Unknown recipe "<id>". Choose one of: field-atlas, live-journey, memory-cinema, pocket-instrument, reset-arcade, vacation-os.
```

This error occurs before creating a stage or target directory.

- [ ] **Step 3: Make CLI recipe selection optional**

Accept `--target` with optional `--recipe`; omission uses Field Atlas. Keep `--starter` for controlled tests. Usage text names Field Atlas as the default and does not mention old IDs, v1, `recipes-v2`, or migration.

- [ ] **Step 4: Preserve atomic whole-tree composition**

The v2 path remains the only path: skip the starter `src/presentation` and `public/theme-assets`, copy the selected presentation to `src/presentation`, copy the recipe README to `src/presentation/README.md`, copy its declared `assets/` contents to `public/theme-assets/`, copy its guide, write schema-2 provenance, verify inventory, then copy into the owned target. Add failure injection tests during presentation/README copy, asset copy, guide copy, provenance write, stage verification, target copy, and target finalization; each retains current recoverability/ownership behavior.

- [ ] **Step 5: Verify the composed project before destination publication**

`createTripProject` gains a dependency-injected `verifyStage?: (stageRoot: string) => Promise<void>` operation and calls it after owned-stage composition/inventory verification but before reserving or creating the user destination. The merged operations default `verifyStage` to `verifyComposedProject`; direct unit tests inject a deterministic no-op/failure verifier, while the internal tarball-staging helper explicitly defers verification only because it immediately installs the local tarballs and runs the same `check` before use. The public CLI and ordinary API calls can never silently skip verification.

`verifyComposedProject` must leave the owned composition stage untouched. It creates a canonical non-symlink disposable sibling, copies the composed stage there, runs these non-shell commands, and safely cleans that exact disposable directory:

```text
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

The second command runs the composed consumer's unit tests, type-check, lint, and build. Capture stdout/stderr without printing environment values. A dependency-install or check failure rejects generation; the destination still does not exist (or remains its original empty directory), and a cleanup failure is reported without recursively touching an unverified/replaced path.

In `tests/generation/verify-composed-project.test.ts`, inject fake process/filesystem operations and prove exact command arguments/cwd, no `shell`, first-failure short circuit, stage immutability, bounded cleanup, replacement/symlink refusal, and no target reservation before success. Add one create-script test whose verifier rejects and assert no partial destination/stage remains.

- [ ] **Step 6: Update the staging helper**

`stageStarterConsumer` defaults to Field Atlas and accepts another canonical public recipe. Remove `recipeCatalogRoot` and internal naming. Package tarballs are still built once per staging invocation and rewritten after successful recipe composition.

- [ ] **Step 7: Run cutover and safety tests**

Run:

```bash
npm test -- tests/generation/catalog-cutover.test.ts tests/generation/recipes.test.ts tests/generation/create-real-starter.test.ts tests/generation/verify-composed-project.test.ts tests/scripts/create-trip-project.test.ts tests/scripts/stage-starter-consumer.test.ts
```

Expected: PASS with exactly six public v2 recipes and no v1 path.

- [ ] **Step 8: Hold the catalog/compiler checkpoint uncommitted**

Review `git diff -- plugins/eternal-pose/recipes plugins/eternal-pose/lib plugins/eternal-pose/scripts scripts/stage-starter-consumer.mjs tests/generation tests/scripts`. Do not stage or commit yet; supported docs and the committed starter still need to change in Tasks 3–4.

---

### Task 3: Sync Field Atlas into the committed starter and remove transitional presentation code

**Files:**
- Create: `plugins/eternal-pose/scripts/sync-default-presentation.mjs`
- Create: `tests/scripts/sync-default-presentation.test.ts`
- Replace: `plugins/eternal-pose/starter/react/src/presentation/**` with `plugins/eternal-pose/recipes/field-atlas/presentation/**`
- Delete: `plugins/eternal-pose/starter/react/src/App.tsx`
- Delete: `plugins/eternal-pose/starter/react/src/experience-shell/TripExperience.tsx`
- Delete: remaining empty `plugins/eternal-pose/starter/react/src/ui/**` and `src/experience-shell/**` transitional presentation files
- Modify: `plugins/eternal-pose/starter/react/src/main.tsx`
- Modify: `plugins/eternal-pose/starter/react/src/app/App.tsx`
- Modify: starter tests/imports
- Modify: `tests/generation/no-duplicate-runtime.test.ts`

**Interfaces:**
- `syncDefaultPresentation({ recipeRoot, starterRoot, dryRun?: boolean }) -> Promise<{ added: string[]; changed: string[]; removed: string[] }>`
- The script targets only `starter/react/src/presentation`, mirrors the recipe's root README to `src/presentation/README.md`, and refuses symlinked roots/entries.
- `--check` exits nonzero when the two trees differ and never writes.

- [ ] **Step 1: Write failing sync/parity tests**

Use temporary trees to prove deterministic add/change/remove reporting, exact byte copy, stale-file removal only within the bounded presentation target, dry-run immutability, and symlink rejection. Assert real-repo `--check` currently fails because the transitional presentation differs from Field Atlas.

- [ ] **Step 2: Implement the bounded sync script**

Canonicalize both roots, inventory regular non-symlink files, compare normalized relative paths and bytes, and update only the explicit destination tree. Use `apply_patch` for hand edits; the sync script itself may perform the reviewed bulk mechanical mirror. Never point it at a workspace/repository root.

- [ ] **Step 3: Sync and remove re-export shims**

Run the script once without `--check`, then delete the two transitional re-export files and update imports to `src/app/App` and `src/presentation`. Remove obsolete old-UI tests only after their protected assertions have moved to controller/shared-presentation tests. Keep progress storage under `src/controllers` or `src/app`, not an empty compatibility folder.

- [ ] **Step 4: Enforce final dependency boundaries**

Update scans to require the exact top-level responsibility directories and reject:

- `src/ui` and `src/experience-shell` imports/directories;
- CSS/icons/copy in controllers/providers;
- presentation imports from packages/controllers/providers;
- raw Google SDK objects passed to views;
- multiple presentation registries or runtime recipe selection.

- [ ] **Step 5: Run parity, starter, and default E2E gates**

Run:

```bash
node plugins/eternal-pose/scripts/sync-default-presentation.mjs --check
npm test -- tests/scripts/sync-default-presentation.test.ts tests/generation/catalog-cutover.test.ts tests/generation/no-duplicate-runtime.test.ts
npm run stage:starter
npm run test:starter:staged
npm run test:e2e:staged
```

Expected: Field Atlas parity check and all default consumer gates PASS.

- [ ] **Step 6: Hold the starter checkpoint uncommitted**

Review the bounded starter/parity diff and rerun `sync-default-presentation.mjs --check`. Do not stage or commit yet; the public guidance/site still describe the old catalog.

---

### Task 4: Rewrite supported documentation, plugin guidance, and marketplace presentation

**Files:**
- Modify: `README.md`
- Modify: `plugins/eternal-pose/skills/eternal-pose/references/design-recipes.md`
- Modify: `plugins/eternal-pose/skills/eternal-pose/references/workflow.md`
- Modify: `plugins/eternal-pose/starter/react/README.md`
- Modify: `plugins/eternal-pose/starter/react/docs/trip-experience-contract.md`
- Modify: `plugins/eternal-pose/starter/react/.env.example`
- Modify: `plugins/eternal-pose/recipes/*/README.md`
- Modify: `site/src/pages/index.astro`
- Modify: `site/src/styles/global.css`
- Modify: `tests/plugin/skill-contract.test.ts`
- Modify: `tests/scripts/publication-scan.test.ts`
- Create: `tests/generation/supported-theme-docs.test.ts`

- [ ] **Step 1: Write failing supported-doc tests**

Scan supported docs/source/site/tests while excluding only `CHANGELOG.md` and `docs/superpowers/{specs,plans}`. Require all six IDs, Field Atlas default, schema-v2 directory contents, one-selected-presentation behavior, four customization levels, optional `VITE_GOOGLE_MAP_ID`, neutral fallback truth, optional media truth, and explicit no-npm-theme/no-runtime-selector language. Reject the three removed IDs and claims that a recipe is merely one CSS file.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- tests/generation/supported-theme-docs.test.ts tests/plugin/skill-contract.test.ts tests/scripts/publication-scan.test.ts`

Expected: FAIL on old README/site/skill copy and old publication fixture ID.

- [ ] **Step 3: Rewrite `design-recipes.md` as the operational catalog**

Document a concise six-row catalog with Field Atlas default and each product idea. Explain complete presentation recipes, generated ownership, selected-only copying, the manifest/entry/profile contract, all four customization levels, map ID/guide fallback, optional media, authored-world gate, and how Restyle preserves existing user work. Do not duplicate every recipe README or add migration guidance.

- [ ] **Step 4: Update starter/user documentation**

Explain the five-directory structure and customization boundaries. Add `VITE_GOOGLE_MAP_ID` to Google configuration as optional, clarify `DEMO_MAP_ID` development behavior and production neutral marker fallback, and document media source rules. The trip-experience contract protects observable behaviors while affirming that users may replace `presentation`, controllers, or the entire UI.

- [ ] **Step 5: Replace marketplace color swatches with six structural world previews**

Change the site section heading to “Six authored starting worlds.” Each preview must suggest its actual composition—not just palette—using semantic HTML/CSS micro-layouts:

- atlas index/map grid;
- outlined mission select;
- instrument rack/channel strip;
- desktop windows/dock;
- cinematic frame/filmstrip;
- now/next live board.

Keep the static Astro site at zero client JavaScript and responsive at narrow widths. Update site tests/build if the section structure changes.

- [ ] **Step 6: Update test fixtures and publication paths**

Use Field Atlas wherever a supported recipe is required. Publication scanning must continue to prove no credentials, private data, generated catalogs, or unrelated plugin internals leak into output.

- [ ] **Step 7: Run docs/site/plugin gates**

Run:

```bash
npm test -- tests/generation/supported-theme-docs.test.ts tests/plugin/skill-contract.test.ts tests/scripts/publication-scan.test.ts
npm run validate:plugins
npm --prefix site test
npm --prefix site run build
```

Expected: PASS; the built site names exactly six authored worlds and contains none of the removed IDs.

- [ ] **Step 8: Inspect the marketplace theme section in the in-app browser**

Review the six structural previews at mobile and desktop widths, keyboard focus, 200% zoom, reduced motion, and forced colors. Confirm the section communicates different compositions without copying the generated presentations wholesale or becoming a palette-swatch grid.

- [ ] **Step 9: Commit the complete breaking cutover atomically**

```bash
git add README.md plugins/eternal-pose/recipes plugins/eternal-pose/lib/recipe-v2.mjs plugins/eternal-pose/lib/verify-composed-project.mjs plugins/eternal-pose/scripts/create-trip-project.mjs plugins/eternal-pose/scripts/sync-default-presentation.mjs plugins/eternal-pose/skills plugins/eternal-pose/starter/react scripts/stage-starter-consumer.mjs site/src tests/generation tests/plugin/skill-contract.test.ts tests/scripts
git commit -m "feat: replace recipe skins with six authored theme worlds"
```

Immediately inspect `git show --stat --oneline HEAD` and rerun the exact catalog/doc/parity tests. If anything is inconsistent, fix it in a follow-up before moving to CI; never split or cherry-pick only part of this cutover commit.

---

### Task 5: Add the six-recipe staged-consumer CI matrix

**Files:**
- Create: `scripts/test-recipe-matrix.mjs`
- Create: `tests/scripts/test-recipe-matrix.test.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `plugins/eternal-pose/starter/react/playwright.config.ts`

**Interfaces:**
- `node scripts/test-recipe-matrix.mjs --recipe <id> --mode check|e2e|all`
- Root scripts:

```json
{
  "test:recipe": "node scripts/test-recipe-matrix.mjs --mode all",
  "test:recipes": "node scripts/test-recipe-matrix.mjs --all --mode all"
}
```

- [ ] **Step 1: Write failing orchestration tests**

Inject a fake command runner and assert exact sorted six-recipe execution, rejection of unknown IDs, immediate stop on first failure, isolated `tmp/recipe-matrix/<id>` destinations, package build/pack reuse within one `--all` run, and propagation of nonzero child status.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- tests/scripts/test-recipe-matrix.test.ts`

Expected: FAIL because the matrix runner does not exist.

- [ ] **Step 3: Implement deterministic staged checks**

For each recipe, compose one consumer, rewrite dependencies to the already packed local tarballs, install, run `check`, then run the shared and recipe-specific Playwright tests. Keep outputs isolated and preserve a failed consumer directory for diagnosis; clean successful ones through bounded explicit paths only.

- [ ] **Step 4: Add a parallel CI matrix**

Add a `themes` job with an exact six-ID matrix. Install root dependencies and Chromium once per job, stage the selected recipe, run its starter `check`, then E2E. Make `release` depend on both `check` and `themes`. The ordinary `check` job continues to cover root/packages/default Field Atlas.

- [ ] **Step 5: Run the orchestrator test and one local smoke**

Run:

```bash
npm test -- tests/scripts/test-recipe-matrix.test.ts
npm run test:recipe -- --recipe field-atlas
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/test-recipe-matrix.mjs tests/scripts/test-recipe-matrix.test.ts package.json .github/workflows/ci.yml plugins/eternal-pose/starter/react/playwright.config.ts
git commit -m "ci: gate every authored theme consumer"
```

---

### Task 6: Harden accessibility, responsive behavior, media, and map fallback across all six

**Files:**
- Create: `plugins/eternal-pose/starter/react/tests/e2e/accessibility-contract.spec.ts`
- Create: `plugins/eternal-pose/starter/react/tests/e2e/responsive-contract.spec.ts`
- Create: `plugins/eternal-pose/starter/react/tests/e2e/map-profile-contract.spec.ts`
- Modify: `plugins/eternal-pose/starter/react/tests/e2e/presentation-contract.spec.ts`
- Modify: `tests/generation/recipes.test.ts`
- Modify: any recipe/controller/provider files required by failures
- Modify: `docs/theme-reviews/six-world-comparison.md`

- [ ] **Step 1: Add the final browser contract matrix**

For every composed recipe, cover:

- Home, Experience, expanded detail, empty collections, memory-only persistence, candidate, shopping, reservation, task, setup-required, loading, route error/retry, map error/retry, and fatal error;
- reservation references absent before an explicit reveal, visible only after activation, and cleared on close/reopen;
- `320`, `390`, `430`, `768`, `1024`, and `1440` widths plus a short-height mobile case;
- no horizontal overflow at normal and 200% text zoom;
- all visible interactive controls and label-backed inputs at least 44-by-44 CSS pixels;
- logical tab order, visible focus, focus restoration, Escape/dialog behavior, sheet keyboard operation, and Vacation OS tab operation;
- useful ARIA snapshots and unique IDs/relationships;
- forced-colors visibility, reduced-motion zero-duration state changes, safe areas, dynamic viewport resize, and visible map attribution/control zones;
- custom map-ID option, development demo ID, production neutral fallback, profile marker/route states, route casing/dash fallback, and unchanged semantic owner events;
- Memory Cinema no-media/local-media/failed-media cases with no external requests.

- [ ] **Step 2: Generalize CSS contrast/cascade tests**

Replace the old one-file token parser with tests over each manifest-declared CSS set and rendered computed styles. Check body/metadata/selected/disabled/semantic/error surfaces and overlay route/marker contrast. Retain a regression that later same-specificity rules cannot erase selected/current/semantic state, replacing the Quiet Wood-specific fixture with a recipe-independent cascade fixture.

- [ ] **Step 3: Run the full six-recipe matrix**

Run:

```bash
npm run test:recipes
```

Expected: all six `check` and E2E suites PASS. Fix product code, not test expectations, for real accessibility/responsive failures.

- [ ] **Step 4: Repeat authored-world browser review after fixes**

Use the in-app browser to compare final Home/Experience/expanded captures at `390` and `1440`, plus grayscale/accent-swapped variants. Update `docs/theme-reviews/six-world-comparison.md` with final pass/fail evidence. Re-run an individual recipe's entire matrix after any visual fix.

- [ ] **Step 5: Commit**

```bash
git add plugins/eternal-pose/starter/react/tests/e2e tests/generation/recipes.test.ts plugins/eternal-pose/recipes plugins/eternal-pose/starter/react/src docs/theme-reviews/six-world-comparison.md
git commit -m "test: harden the six-theme product matrix"
```

---

### Task 7: Final deletion audit and release-readiness verification

**Files:**
- Modify only files identified by the audit

- [ ] **Step 1: Scan for forbidden legacy and runtime-theme machinery**

Run:

```bash
rg -n "quiet-wood|sticker-brutalist|native-minimal|TRANSITIONAL_V1|recipe\.css|runtime theme|theme selector" . --glob '!CHANGELOG.md' --glob '!docs/superpowers/**' --glob '!node_modules/**' --glob '!tmp/**' --glob '!site/dist/**'
```

Expected: no matches in supported source/docs/tests/site. Inspect every match rather than broadening exclusions.

- [ ] **Step 2: Prove there is no theme package or shipped catalog**

Assert root workspaces remain `packages/*`, only core/react package names exist, generated inventories contain no `recipes`, and generated `package.json` has no theme/UI-kit dependency added by this work.

- [ ] **Step 3: Run the complete repository verification**

Run:

```bash
npm run validate:plugins
npm run check:marketplace
npm run build:packages
npm test
npm run test:packages
npm run type-check
npm run type-check:packages
npm run lint
npm run lint:packages
npm run stage:starter
npm run test:starter:staged
npm run test:e2e:staged
npm run test:recipes
npm --prefix site test
npm --prefix site run build
```

Expected: every command PASS from fresh outputs.

- [ ] **Step 4: Inspect Git state and diff scope**

Run `git status --short`, `git diff --check`, and review the complete branch diff. Confirm only intended tracked files are included, all old recipe deletions are present, all six new recipe trees are tracked, and unrelated untracked user assets remain untouched.

- [ ] **Step 5: Commit verification fixes if needed**

Use a focused commit message matching the fix. Do not create a no-op commit and do not publish, push, tag, release, or deploy without a separate explicit user request.

---

## Completion Criteria

- [ ] Exactly six public recipe-v2 IDs exist and Field Atlas is the default.
- [ ] Old directories, IDs, tests, selectors, docs, and compatibility code are absent from supported surfaces.
- [ ] The committed starter presentation is byte-identical to the Field Atlas recipe source.
- [ ] Every generated consumer contains one locally owned presentation and no runtime selector/catalog/theme dependency.
- [ ] Users can edit tokens, components, the entire presentation, or the entire UI, and docs explicitly support all four levels.
- [ ] Core remains framework-neutral except for the additive semantic media type; React remains headless.
- [ ] Map ID/profile injection, neutral fallback, media fallback, protected behavior, accessibility, responsive behavior, and all six authored-world reviews pass.
- [ ] CI gates every recipe before release, while no external publish/deploy action has been taken.
