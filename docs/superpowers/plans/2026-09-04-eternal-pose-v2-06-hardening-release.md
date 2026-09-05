# Eternal Pose v2 Phase 06: Hardening, Sign-off, and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every Eternal Pose v2 P0 claim with reproducible evidence, verify immutable package and plugin candidates in clean hosts, then promote those exact artifacts with a rehearsed forward rollback.

**Architecture:** One machine-validated parity report is the release ledger. Local deterministic, live-provider, physical-device, registry-candidate, and postpromotion evidence each close only their declared gate rows. Candidate construction happens once; its hashes flow through detached marketplace installs and exact-registry consumers. npm dist-tags and `origin/main` are treated as five independent default pointers; every mutation is guarded by the recorded prior value or the exact release target, and rollback refuses third-party drift rather than overwriting it.

**Tech Stack:** Node 22.13+, npm 11, Vitest 4, Playwright 1.62, axe-core, Verdaccio 6.10.2, Git bare remotes, GitHub Actions, Claude Code and Codex plugin CLIs, physical iPhone Safari.

**Spec:** `docs/superpowers/specs/2026-09-04-eternal-pose-v2-oak-washi-flagship-design.md`

## Global Constraints

- Start only after the Phase 05 gate is green and its starter/Tokyo byte-identity inventory is committed.
- Work from the isolated execution worktree. Preserve every unrelated user artifact; release outputs go to an absolute directory outside the checkout.
- Use four separate absolute paths: writable `$RELEASE_RUN_DIR`, immutable read-only artifacts at `$CANDIDATE_DIR=$RELEASE_RUN_DIR/candidate`, one detached full-SHA source worktree at `$CANDIDATE_SOURCE_ROOT=$RELEASE_RUN_DIR/source` that is treated as read-only after creation, and writable sibling `$RELEASE_EVIDENCE_DIR=$RELEASE_RUN_DIR/evidence`. Set all four in one dedicated release shell at Task 6 entry, and require the candidate/source paths to be absent. Never write evidence or snapshots beneath the read-only candidate directory or detached source worktree.
- The release train is exactly `2.0.0` for `core`, `react`, `adapters`, `testing`, both plugin manifests, both marketplace entries, and generated manifest pins.
- Do not rebuild after candidate attestation. Every later install verifies the original tarball or plugin archive SHA-256.
- CI never reads live Google credentials, queries Google, or treats Simulator evidence as physical-device evidence.
- A P0 row closes only as `verified`. `partially verified`, `not exercised by input`, `blocked by configuration`, and `failed` are release blockers.
- No npm publish, dist-tag write, remote Git ref, pull request, merge, or `origin/main` mutation occurs without a fresh explicit user authorization at the named stop.
- Rollback changes pointers forward: restore npm tags and push a reviewed revert commit. It may change only a pointer still equal to the failed-promotion value; an already-restored snapshot is a no-op, and any third-party value is preserved and blocks automatic rollback. Never delete published versions, force-push, reset, or rewrite `main`.

---

### Task 1: Make the 71-row parity report executable

**Files:**
- Create: `docs/audits/2026-09-eternal-pose-v2-oak-washi-parity.md`
- Create: `scripts/parity/read-parity-report.mjs`
- Create: `scripts/parity/verify-parity-report.mjs`
- Create: `tests/parity/report-schema.test.ts`
- Create: `tests/parity/baseline-mapping.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: all 71 source rows from `docs/audits/2026-09-tokyo-baseline-parity.md` and the v2 P0 table in the approved design.
- Produces: `npm run test:parity -- --gate <prepublication|registry-candidate|postpromotion>` and one committed report whose rows have stable IDs.

Use this exact row schema in the Markdown table:

```ts
interface ParityClaim {
  id: string;
  baselineIds: readonly string[];
  requirement: string;
  priority: "P0" | "P1";
  gate: "prepublication" | "registry-candidate" | "postpromotion";
  fixture: string;
  procedure: string;
  evidence: string;
  owner: "core" | "react" | "adapters" | "testing" | "presentation" | "generator" | "release" | "product-owner";
  status: "verified" | "partially verified" | "not exercised by input" | "blocked by configuration" | "failed";
  disposition: string;
}
```

- [ ] **Step 1: Add failing schema and coverage tests**

Parse both Markdown reports. Assert unique v2 IDs; exact enum values; non-empty fixture/procedure/evidence/owner; every P0 design area represented; every baseline row ID occurs in at least one v2 `baselineIds`; and baseline F2 maps to a v2 claim containing `position` but not `velocity`.

```bash
npm test -- tests/parity/report-schema.test.ts tests/parity/baseline-mapping.test.ts
```

Expected: FAIL because the v2 report and parser do not exist.

- [ ] **Step 2: Implement a strict Markdown parser**

Reject malformed separators, duplicate IDs, unknown statuses, and evidence paths that escape the repository. A `verified` row requires an existing evidence path; a non-verified row may name its exact future repository path, but its closure procedure must be executable and the gate still fails. The gate selector must fail when any selected P0 row is not `verified`; it must not rewrite the report.

- [ ] **Step 3: Seed the atomic v2 report**

Create one row per atomic claim, split broad P0 areas when their fixture, gate, owner, or procedure differs. Map all 71 baseline rows explicitly; map previously verified rows too. Normalize the historical `blocked by model` row to `failed`. Initial evidence-backed passes may be `verified`; all other claims begin `failed` with an exact closing procedure, never an invented pass.

- [ ] **Step 4: Wire the command**

Add:

```json
{
  "scripts": {
    "test:parity": "node scripts/parity/verify-parity-report.mjs docs/audits/2026-09-eternal-pose-v2-oak-washi-parity.md"
  }
}
```

- [ ] **Step 5: Run report validation**

```bash
npm test -- tests/parity/report-schema.test.ts tests/parity/baseline-mapping.test.ts
npm run test:parity -- --schema-only
```

Expected: PASS. `npm run test:parity -- --gate prepublication` may still exit nonzero and list the precise unclosed P0 IDs.

- [ ] **Step 6: Commit the release ledger**

```bash
git add docs/audits/2026-09-eternal-pose-v2-oak-washi-parity.md scripts/parity/read-parity-report.mjs scripts/parity/verify-parity-report.mjs tests/parity/report-schema.test.ts tests/parity/baseline-mapping.test.ts package.json
git diff --cached --check
git commit -m "test: make the v2 parity ledger executable"
```

---

### Task 2: Complete deterministic visual, responsive, and accessibility evidence

**Files:**
- Verify: `packages/testing/src/fixtures/oak-washi-visual-cases.ts`
- Verify: `packages/testing/src/visual/render-oak-washi-case.ts`
- Modify: `packages/testing/playwright.config.ts`
- Verify: `tests/fixtures/oak-washi/browser/OakWashiHarness.tsx`
- Verify: `tests/visual/oak-washi-catalog.test.ts`
- Verify: `tests/visual/oak-washi.visual.spec.ts`
- Create: `tests/visual/oak-washi-release-evidence.test.ts`
- Verify: `tests/accessibility/oak-washi-a11y.spec.ts`
- Verify: `tests/accessibility/oak-washi-style-contract.spec.ts`
- Create: `tests/performance/sheet-drag.spec.ts`
- Create: `docs/theme-reviews/oak-washi/manifest.json`
- Modify: `docs/theme-reviews/oak-washi/README.md`
- Verify: `docs/theme-reviews/oak-washi/fixture-review.json`
- Verify: reviewed PNGs under `docs/theme-reviews/oak-washi/goldens/`
- Create: raw JSON/trace summaries under `docs/theme-reviews/oak-washi/evidence/`
- Modify: `docs/audits/2026-09-eternal-pose-v2-oak-washi-parity.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: the Phase 04 approved Oak presentation and all 17 named visual fixtures from the design.
- Produces: `test:visual:v2`, `test:a11y:v2`, and `test:performance:v2` with committed, hashed evidence.

- [ ] **Step 1: Add failures only for the new release manifest and performance evidence**

In `oak-washi-release-evidence.test.ts`, read Phase04's existing catalog, `fixture-review.json`, and committed goldens without changing them. Require the release manifest to cover these exact fixture IDs and its entries to point to the already-approved case/viewport hashes:

```text
home
experience-default
experience-collapsed-current
experience-expanded-dense
candidate-open
candidate-zoom-200
selection-truth
route-state-matrix
opening-hours-matrix
camera-adversarial
marker-backends
map-error
setup-states
loading-owned
runtime-degraded
accessibility-media
desktop-bounded
```

Require the existing catalog/review to retain viewports `320x568`, `390x844`, `430x932`, `768x1024`, `1024x900`, and `1440x1000`, plus Home's `1024x900` and candidate 200-percent zoom. The new manifest must record catalog SHA-256, fixture-review SHA-256, every approved PNG SHA-256, Playwright/Chromium/font identities, source commit, performance raw-evidence path/hash, reviewer, and review date. The test fails on a missing/extra case, stale hash, unreviewed golden, handwritten performance pass, or an evidence path outside `docs/theme-reviews/oak-washi/`.

```bash
npm test -- tests/visual/oak-washi-release-evidence.test.ts
npx playwright test --config=packages/testing/playwright.config.ts tests/performance/sheet-drag.spec.ts
```

Expected: FAIL because the Phase06 release manifest, performance spec registration, and measured performance evidence do not exist. The Phase04 catalog, visual specs, accessibility specs, fixture review, and goldens already pass and are not the red target.

- [ ] **Step 2: Re-run the frozen Phase04 visual environment**

Run `npm run test:oak-washi:unit` and the existing visual browser spec. Verify that the fake provider, fixed locale/timezone/clock, deterministic progress, reduced motion, network denial, named masks, font guard, and browser revision still match `fixture-review.json`. If any existing assertion or golden fails, return the defect to Phase04 and reproduce it there; do not repair catalog/helper/spec/golden bytes in this task.

- [ ] **Step 3: Verify Phase04 semantics, geometry, and accessibility unchanged**

Use the existing root specs to verify title uniqueness, owner state, no page-level overflow, header/sheet/control/attribution non-collision, row scan slots, 44px targets, collapsed/half/expanded geometry, route ownership, marker accessible state, camera intent, WCAG 2.2 A/AA, contrast, forced colors, reduced motion, 200-percent reflow, focus behavior, and the complete keyboard journey. These are verify-only Phase04 inputs; screenshots remain supplementary.

- [ ] **Step 4: Verify the approved goldens without rewriting them**

Run the existing `expect(page).toHaveScreenshot` checks with `maxDiffPixelRatio: 0.002`; never invoke the update-goldens command in Phase06. Keep the catalog, `fixture-review.json`, and committed PNG bytes unchanged.

- [ ] **Step 5: Keep recipe-aware browser ownership at the root**

Do not create recipe-aware tests beneath `packages/testing` or add package-local Playwright scripts. Phase04's package source remains only the pure catalog plus injection helper; Phase06 adds the root performance spec and release-manifest test.

- [ ] **Step 6: Add the pinned-runner performance contract and release manifest**

Create only the recipe-aware root `tests/performance/sheet-drag.spec.ts` and add that exact path to the existing `packages/testing/playwright.config.ts` match list. Record ten warm two-second fake-map sheet drags. Fail on any main-thread task over 50ms or aggregate p95 animation-frame interval above 25ms. Record runner image, OS, browser build, harness commit, all raw samples, and computed summary; tests read the raw samples rather than a hand-authored pass flag. After the raw performance file exists, generate `manifest.json` from the unchanged existing catalog, `fixture-review.json`, committed PNG bytes, and that raw summary. The release-manifest test recomputes every hash, so copying an approval string cannot create a pass.

- [ ] **Step 7: Wire and run deterministic gates**

```json
{
  "scripts": {
    "test:visual:v2": "playwright test --config=packages/testing/playwright.config.ts tests/visual/oak-washi.visual.spec.ts",
    "test:a11y:v2": "playwright test --config=packages/testing/playwright.config.ts tests/accessibility/oak-washi-a11y.spec.ts tests/accessibility/oak-washi-style-contract.spec.ts",
    "test:performance:v2": "playwright test --config=packages/testing/playwright.config.ts tests/performance/sheet-drag.spec.ts"
  }
}
```

These commands use Phase04's root-test Playwright config and browser fixture directly. Extend only its root-test match list for `tests/performance/sheet-drag.spec.ts`; do not change its deterministic runner settings.

```bash
npm run test:visual:v2
npm run test:a11y:v2
npm run test:performance:v2
npm test -- tests/visual/oak-washi-release-evidence.test.ts
```

Expected: PASS with zero axe violations, no geometry/semantic failures, max golden diff `<= 0.002`, no long task, and p95 frame interval `<= 25ms`.

- [ ] **Step 8: Update evidence rows and commit**

Mark only directly proven report rows `verified`, link exact manifest/evidence paths, then run `npm run test:parity -- --schema-only`.

```bash
git add packages/testing/playwright.config.ts tests/visual/oak-washi-release-evidence.test.ts tests/performance/sheet-drag.spec.ts docs/theme-reviews/oak-washi/manifest.json docs/theme-reviews/oak-washi/README.md docs/theme-reviews/oak-washi/evidence docs/audits/2026-09-eternal-pose-v2-oak-washi-parity.md package.json
git diff --cached --check
git commit -m "test: lock Oak and Washi release evidence"
```

---

### Task 3: Close content integrity, equivalence, artifacts, and hard-code traps

**Files:**
- Create: `tests/release/tokyo-content-integrity.test.ts`
- Create: `tests/release/generated-equivalence.test.ts`
- Create: `tests/release/hard-code-traps.test.ts`
- Create: `tests/release/generated-source-identity.test.ts`
- Create: `scripts/release/verify-generated-source-identity.mjs`
- Modify: `tests/packages/artifacts.test.ts`
- Modify: `tests/packages/clean-consumer.test.ts`
- Modify: `tests/plugin/install-smoke.test.ts`
- Create: `tests/plugin/run-installed-enrich-harness.mjs`
- Create: `tests/release/production-construction.test.ts`
- Modify: `package.json`
- Modify: `docs/audits/2026-09-eternal-pose-v2-oak-washi-parity.md`

**Interfaces:**
- Consumes: Phase 05 starter/Tokyo inventories, manifests, and generated hashes.
- Produces: a single local artifact gate that cannot resolve package workspace source or plugin source-worktree fallbacks, plus a test-only deterministic Enrich harness that imports the installed plugin's real search module.

- [ ] **Step 1: Add failing Tokyo invariants**

Assert six days, exactly 100 nodes, exactly 94 route edges, exactly 89 resolved places, Pelican Cafe unresolved, D3-2/D3-3 mode `unknown`, and exact authored owner order. Parse `examples/tokyo-input/private-fact-allowlist.json` and require the exact value `[]`; scan production Tokyo authored input, ledger, generated source, and packed production files for reservation/ticket/account/confirmation or benchmark-private facts and require the same empty result. Synthetic non-benchmark fixtures are allowed only under `tests/fixtures/**` and `packages/testing/src/fixtures/**`, never as a production exception. Fail on any added allowlist entry, discovered private fact, duplicate owner ID, or unresolved/resolved count hidden by duplication.

```bash
npm test -- tests/release/tokyo-content-integrity.test.ts
```

Expected: FAIL on any v1 or partially converted fixture.

- [ ] **Step 2: Prove canonical-source identity**

Hash every canonical recipe presentation/runtime file, starter counterpart, and Tokyo counterpart. Require starter equality byte for byte; require Tokyo equality outside the exact `src/trip-content/**` allowlist. Verify recipe, project, plugin, and package versions from parsed manifests rather than filenames.

Implement `verify-generated-source-identity.mjs` with exact arguments `--expected <absolute-committed-project> --actual <absolute-staged-project> --candidate-attestation <absolute-json> --output <absolute-absent-json>`. It compares every regular file and symlink target byte-for-byte, with only these normalized exceptions: the four known `@laugh-tale-island/{core,react,adapters,testing}` dependency specifier values in `package.json`; the corresponding four root dependency/resolution records and integrity values in `package-lock.json`; `.laugh-tale-local-candidates.json`; `node_modules/**`; and `dist/**`. Each permitted package/lock difference must name one of the four invocation-owned tarballs and match its candidate-attestation name/version/size/SHA-256/SHA-512 integrity; every script, external dependency, package metadata field, unrelated lock package/edge, and all other bytes must equal committed Tokyo. The project manifest still pins `2.0.0`. Its sanitized result records both normalized source inventories, their common canonical SHA-256, the four archive hashes, and no absolute paths. In `generated-source-identity.test.ts`, require failures for a changed script, unrelated dependency, unrelated lock entry, non-excluded byte, missing/extra source file, symlink, broadened exception, or unbound tarball before any staged build/dev is allowed.

- [ ] **Step 3: Add static and behavioral hard-code traps**

Reject literal Tokyo day labels, `Asia/Tokyo`, Tokyo coordinates/zoom, fixed six-column layout, `+09`, Tokyo document metadata/social art, or `DAY` UI labels outside trip-content, localized copy catalogs, and named test fixtures. Generate a synthetic non-Tokyo, non-six-day project and prove document language, rail length, clock label, fit, title, and metadata follow authored content.

- [ ] **Step 4: Prove production construction and four package artifacts**

Inspect `npm pack --json` archives, declared files, types, root/provider/Node subpaths, and exact dependency DAG. In empty caches install only the four tarballs plus peers, compile root and provider subpath imports, render the alternate presentation, and ensure production starter construction imports Google only from `@laugh-tale-island/adapters/google`. Fail on `workspace:`, monorepo absolute paths, source aliases, test fakes, credentials, private facts, undeclared remote assets, or benchmark paths.

- [ ] **Step 5: Run clean Claude and Codex local plugin installs**

Use distinct temporary HOME/config/cache directories and a detached local clone at the current full commit. Register each marketplace independently and install the plugin. From each CLI's installed-plugin listing/cache, resolve the installed `eternal-pose` root to a real path and require it to be inside that host's isolated plugin directory and outside both the original repository and detached marketplace clone. Resolve `scripts/enrich-trip-project.mjs` from that installed root, require its real path to remain beneath the same installed root, hash it, and dynamically import its `searchTripPlaces` export by file URL.

Create `run-installed-enrich-harness.mjs` as a test-only executable with exact arguments `--plugin-root`, `--project`, `--review`, and `--selection`. It injects this inline, network-free `PlaceSearchAdapter` into the imported export and a fixed `2026-09-04T08:00:00.000Z` clock:

```js
const adapter = {
  async search(query, signal) {
    if (signal.aborted) throw signal.reason;
    return {
      status: "ready",
      candidates: [{
        providerReference: { provider: "google", id: `fixture:${query.ownerId}` },
        displayName: `Fixture ${query.ownerId}`,
        formattedAddress: "Deterministic fixture address",
        coordinates: { lat: 35.681236, lng: 139.767125 },
        categories: ["fixture"],
      }],
    };
  },
};
```

The harness calls `searchTripPlaces`, writes a complete selection keyed by each returned provider reference, and prints one JSON object containing the installed-root-relative module path, module SHA-256, adapter kind `inline-deterministic`, call count, and review/selection hashes. It must reject zero adapter calls, a module path outside the installed root, or either credential in its environment/output. It never imports a repository/worktree Enrich module, instantiates `GooglePlaceSearchAdapter`, or claims to exercise the production `search` CLI.

For each installed marketplace, use one temporary one-owner `zh-Hant-TW` Trip input and run this exact process sequence with `shell: false` and both `VITE_GOOGLE_MAPS_API_KEY` and `ETERNAL_POSE_GOOGLE_PLACES_API_KEY` deleted from the child environment:

```bash
node "$INSTALLED_PLUGIN_ROOT/scripts/create-trip-project.mjs" --target "$GENERATED_PROJECT" --trip "$SMOKE_TRIP_INPUT"
node tests/plugin/run-installed-enrich-harness.mjs --plugin-root "$INSTALLED_PLUGIN_ROOT" --project "$GENERATED_PROJECT" --review "$REVIEW_PATH" --selection "$SELECTION_PATH"
node "$INSTALLED_PLUGIN_ROOT/scripts/enrich-trip-project.mjs" accept --project "$GENERATED_PROJECT" --review "$REVIEW_PATH" --selection "$SELECTION_PATH"
node "$INSTALLED_PLUGIN_ROOT/scripts/validate-trip-project.mjs" "$GENERATED_PROJECT" --mode local
```

Add red cases for a source-checkout module path, a symlink escaping the installed root, missing `searchTripPlaces`, zero adapter calls, any attempted network access, and either credential becoming visible. Assert the installed accept CLI changes only the ledger/manifest transaction, then parse the installed static Validate prefix and require zero errors. Do not run Verify in Task 3: the newly created project intentionally has no `node_modules`, and its committed exact-`2.0.0` registry lock cannot install before candidate publication. Full installed-plugin Verify belongs to Task 7, where the attested local tarballs are installed under candidate mode. The local receipt records the installed module relative path/SHA-256, adapter kind/call count, exact Create/harness/accept/Validate argv, and both credential-presence booleans as `false`; later attested/registry/default receipts additionally record Verify argv and all six ordered commands.

- [ ] **Step 6: Wire and run the local release gate**

Add `"test:release:local": "vitest run tests/release tests/packages/artifacts.test.ts tests/packages/clean-consumer.test.ts tests/plugin/install-smoke.test.ts"` to the root scripts.

```bash
npm run check
npm run test:generator:v2
npm test -- tests/release tests/packages/artifacts.test.ts tests/packages/clean-consumer.test.ts tests/plugin/install-smoke.test.ts
node scripts/stage-starter-consumer.mjs --out "$PWD/tmp/staged-starter" --recipe oak-washi --setup-locale zh-Hant-TW
npm run test:starter:staged
npm run test:e2e:staged
node scripts/stage-starter-consumer.mjs --out "$PWD/tmp/phase06-task3-staged-tokyo" --recipe oak-washi --trip "$PWD/examples/tokyo-input/trip-input.json" --resolutions "$PWD/examples/tokyo-input/place-resolutions.json"
node scripts/release/verify-generated-source-identity.mjs --expected "$PWD/examples/tokyo" --actual "$PWD/tmp/phase06-task3-staged-tokyo" --candidate-attestation "$PWD/tmp/phase06-task3-staged-tokyo/.laugh-tale-local-candidates.json" --output "$PWD/tmp/phase06-task3-staged-tokyo-source-identity.json"
ETERNAL_POSE_CANDIDATE_ATTESTATION="$PWD/tmp/phase06-task3-staged-tokyo/.laugh-tale-local-candidates.json" node plugins/eternal-pose/scripts/validate-trip-project.mjs "$PWD/tmp/phase06-task3-staged-tokyo" --mode candidate
ETERNAL_POSE_CANDIDATE_ATTESTATION="$PWD/tmp/phase06-task3-staged-tokyo/.laugh-tale-local-candidates.json" node plugins/eternal-pose/scripts/verify-trip-project.mjs "$PWD/tmp/phase06-task3-staged-tokyo" --mode candidate
npm --prefix "$PWD/tmp/phase06-task3-staged-tokyo" run test:e2e
```

Expected: PASS from empty temporary caches with no source fallback. Every prepublication Tokyo command runs against the fresh local-tarball stage whose source inventory matches committed `examples/tokyo`; no command installs or executes the committed registry lock.

- [ ] **Step 7: Update the parity evidence and commit**

```bash
git add scripts/release/verify-generated-source-identity.mjs tests/release tests/packages/artifacts.test.ts tests/packages/clean-consumer.test.ts tests/plugin/install-smoke.test.ts tests/plugin/run-installed-enrich-harness.mjs docs/audits/2026-09-eternal-pose-v2-oak-washi-parity.md package.json
git diff --cached --check
git commit -m "test: close v2 generation and artifact invariants"
```

---

### Task 4: Capture sanitized live Google evidence and offline replay

**Files:**
- Create: `scripts/evidence/capture-live-google.mjs`
- Create: `scripts/evidence/sanitize-google-evidence.mjs`
- Create: `scripts/evidence/verify-google-evidence.mjs`
- Create: `tests/evidence/google-build-provenance.test.ts`
- Create: `tests/evidence/google-replay.test.ts`
- Modify: `tests/release/generated-equivalence.test.ts`
- Create: `plugins/eternal-pose/starter/react/src/build-info.ts`
- Modify: `plugins/eternal-pose/starter/react/src/main.tsx`
- Modify: `plugins/eternal-pose/starter/react/vite.config.ts`
- Modify after the final package-affecting Phase 06 edit: `plugins/eternal-pose/starter/react/package-lock.json`
- Regenerate mechanically: `examples/tokyo/**` through Phase 05 Create plus `replace-generated-project.mjs`; do not edit a Tokyo file directly
- Create: `docs/theme-reviews/oak-washi/evidence/google/manifest.json`
- Create: sanitized JSON and screenshots under `docs/theme-reviews/oak-washi/evidence/google/`
- Create under the ignored repository temp root: `$PWD/tmp/phase06-final-lock-starter/`, `$PWD/tmp/phase06-build-info-tokyo/`, `$PWD/tmp/pre-phase06-build-info-tokyo/`, `$LIVE_RUN_DIR/generated-tokyo/`, `$LIVE_RUN_DIR/source-identity.json`, and `$LIVE_RUN_DIR/raw/`
- Modify: `.gitignore`
- Modify: `docs/audits/2026-09-eternal-pose-v2-oak-washi-parity.md`

**Interfaces:**
- Consumes: exact clean production source, `VITE_GOOGLE_MAPS_API_KEY`, the two release flags, explicit source commit/project-tree IDs, and a separately authorized live evidence run.
- Produces: an app-consumed build-info module, an independently readable `dist/build-info.json`, and credential-free replay fixtures for one walking success, one deliberately selected transit success with duration and line, attribution, malformed/outlier quarantine, and unavailable mapping.

The build provenance contract is exact:

```ts
interface TripBuildInfoV1 {
  schemaVersion: 1;
  source: {
    commit: string | null;
    projectTree: string | null;
  };
  capabilities: {
    googleRoutesEnabled: boolean;
    googleTransitEnabled: boolean;
  };
}
```

`commit` and `projectTree` are either both null for an ordinary unattested local build or both lowercase 40-character Git IDs supplied through `ETERNAL_POSE_SOURCE_COMMIT` and `ETERNAL_POSE_PROJECT_TREE`. A live-evidence build requires both IDs. The object contains no key, build host, path, or timestamp.

- [ ] **Step 1: Write sanitizer and replay failures before any live call**

First use `stage-starter-consumer.mjs --trip ... --resolutions ...` in a temporary root so the build has four freshly packed/installed local tarballs; never install the committed Tokyo registry lock. Build that stage with a fixed 40-character commit/tree and both release flags true. Assert `validation/build-info.mjs` exports exactly the same frozen object as parsed `build-info.json`, and that application construction consumes `buildInfo.capabilities` rather than separately reading the two Vite flags. Add failures for a missing half of the source pair, a non-full ID, an emitted module/JSON mismatch, false or absent shipping flags during live capture, and any key-like field/value in either artifact.

Feed replay fixtures containing API keys, query strings, headers, cookies, session IDs, full diagnostic stacks, and undeclared place facts. Assert sanitizer removes/rejects them, normalizes only the typed provider result, and refuses output missing or mismatching source commit, project tree, build-info SHA-256, generated-source-identity receipt SHA-256, exact four local package names/versions/SHA-256/integrities, flags, provider, capture time, and schema version.

```bash
npm test -- tests/evidence/google-build-provenance.test.ts tests/evidence/google-replay.test.ts
```

Expected: FAIL because evidence tooling is absent.

- [ ] **Step 2: Implement the build-owned provenance and explicit sanitation**

Create `src/build-info.ts` only in the canonical starter app. It binds a compile-time `__ETERNAL_POSE_BUILD_INFO__` constant and exports `buildInfo: Readonly<TripBuildInfoV1>`. Make the canonical starter `main.tsx` use its capability booleans for route/transit construction; it must not also read `VITE_GOOGLE_ROUTES_ENABLED` or `VITE_GOOGLE_TRANSIT_ENABLED`.

Make the canonical starter Vite config derive one validated object from the two exact-string flags and optional paired source IDs, inject that same object as `__ETERNAL_POSE_BUILD_INFO__`, expose `src/build-info.ts` as the fixed `validation/build-info.mjs` entry, and emit canonical JSON plus newline as `build-info.json` from the same in-memory object in `generateBundle`. Do not use or reinterpret Vite's asset manifest as environment provenance. After Task 2's final possible testing-package byte change, stage all four packages once and use Phase 05's attestation-bound lock writer to refresh the canonical starter lock before generation. Then generate a complete Tokyo candidate from the committed canonical input/ledger and replace `examples/tokyo` only through Phase 05's validated whole-directory transaction. The old Tokyo tree, including ignored residue, stays intact at the explicit backup until post-commit verification. Extend `generated-equivalence.test.ts` to prove the generated starter/Tokyo modules, lockfile, and Vite config are byte-identical; a direct Tokyo source edit is a failure.

Capture writes raw output only beneath a gitignored absolute directory supplied by `--raw-output`. Before opening a browser it parses `build-info.json`, imports `validation/build-info.mjs`, requires exact equality, requires both capabilities true, and matches the two explicit expected Git IDs. Sanitization reads that directory and writes a staged sibling; it scans values and filenames for both credential environment values before atomic publication. Its committed manifest records the source commit, project tree, SHA-256 of the exact `build-info.json`, SHA-256 of the sanitized generated-source-identity receipt, the receipt's exact four package names/versions/SHA-256/integrities without archive paths, both capability booleans, provider/capture/schema fields, and sanitized artifact hashes. Screenshots must show legal attribution but no browser address/query containing a key. `verify-google-evidence.mjs` accepts `--scan-root <absolute-repository-root>`, walks only tracked files under `docs`, `tests`, `packages`, `plugins`, and `examples`, and fails on a key-shaped value or credential assignment; traversal/read errors are hard failures rather than being treated as a successful no-match.

- [ ] **Step 3: Run offline tests and commit the provenance tooling**

```bash
node scripts/stage-starter-consumer.mjs --out "$PWD/tmp/phase06-final-lock-starter" --recipe oak-washi --setup-locale zh-Hant-TW
node scripts/write-registry-lockfile.mjs --source-lock "$PWD/tmp/phase06-final-lock-starter/package-lock.json" --package-json "$PWD/plugins/eternal-pose/starter/react/package.json" --attestation "$PWD/tmp/phase06-final-lock-starter/.laugh-tale-local-candidates.json" --destination-lock "$PWD/plugins/eternal-pose/starter/react/package-lock.json"
test ! -e "$PWD/tmp/phase06-build-info-tokyo"
test ! -e "$PWD/tmp/pre-phase06-build-info-tokyo"
node plugins/eternal-pose/scripts/create-trip-project.mjs --target "$PWD/tmp/phase06-build-info-tokyo" --trip "$PWD/examples/tokyo-input/trip-input.json" --resolutions "$PWD/examples/tokyo-input/place-resolutions.json"
node scripts/replace-generated-project.mjs --candidate "$PWD/tmp/phase06-build-info-tokyo" --target "$PWD/examples/tokyo" --backup "$PWD/tmp/pre-phase06-build-info-tokyo" --expected-input "$PWD/examples/tokyo-input/trip-input.json" --expected-resolutions "$PWD/examples/tokyo-input/place-resolutions.json"
npm test -- tests/evidence/google-build-provenance.test.ts tests/evidence/google-replay.test.ts tests/release/generated-equivalence.test.ts
git add scripts/evidence tests/evidence/google-build-provenance.test.ts tests/evidence/google-replay.test.ts plugins/eternal-pose/starter/react/src/build-info.ts plugins/eternal-pose/starter/react/src/main.tsx plugins/eternal-pose/starter/react/vite.config.ts plugins/eternal-pose/starter/react/package-lock.json tests/release/generated-equivalence.test.ts .gitignore
git add -A examples/tokyo
git diff --cached --check
git commit -m "test: bind Google evidence to build provenance"
```

Expected: tests pass without network or credentials. The provenance test builds only a fresh local-tarball stage and runs `verify-generated-source-identity`; it never executes `examples/tokyo`. The committed starter lock is bound to the final four package bytes, committed Tokyo is a complete Create output from that lock, the prior whole tree remains recoverable at `$PWD/tmp/pre-phase06-build-info-tokyo`, and the commit must be clean before any evidence build so its full source identity is meaningful. Any later package or generated-project byte change invalidates this task and its live evidence and must restart here before Task 6.

- [ ] **Step 4: Run the exact production build with shipping flags**

After obtaining explicit authorization for the live call, use:

```bash
test -z "$(git status --short)"
export LIVE_SOURCE_COMMIT="$(git rev-parse HEAD)"
export LIVE_PROJECT_TREE="$(git rev-parse "$LIVE_SOURCE_COMMIT:examples/tokyo")"
export LIVE_RUN_DIR="$PWD/tmp/live-google-$LIVE_SOURCE_COMMIT"
export LIVE_BUILD_ROOT="$LIVE_RUN_DIR/generated-tokyo"
export LIVE_RAW_DIR="$LIVE_RUN_DIR/raw"
test "${#LIVE_SOURCE_COMMIT}" -eq 40
test "${#LIVE_PROJECT_TREE}" -eq 40
test ! -e "$LIVE_RUN_DIR"
mkdir -p "$LIVE_RUN_DIR"
node scripts/stage-starter-consumer.mjs --out "$LIVE_BUILD_ROOT" --recipe oak-washi --trip "$PWD/examples/tokyo-input/trip-input.json" --resolutions "$PWD/examples/tokyo-input/place-resolutions.json"
node scripts/release/verify-generated-source-identity.mjs --expected "$PWD/examples/tokyo" --actual "$LIVE_BUILD_ROOT" --candidate-attestation "$LIVE_BUILD_ROOT/.laugh-tale-local-candidates.json" --output "$LIVE_RUN_DIR/source-identity.json"
ETERNAL_POSE_SOURCE_COMMIT="$LIVE_SOURCE_COMMIT" ETERNAL_POSE_PROJECT_TREE="$LIVE_PROJECT_TREE" VITE_GOOGLE_MAPS_API_KEY="$VITE_GOOGLE_MAPS_API_KEY" VITE_GOOGLE_ROUTES_ENABLED=true VITE_GOOGLE_TRANSIT_ENABLED=true npm --prefix "$LIVE_BUILD_ROOT" run build
node scripts/evidence/capture-live-google.mjs --build "$LIVE_BUILD_ROOT/dist" --source-identity "$LIVE_RUN_DIR/source-identity.json" --expected-source-commit "$LIVE_SOURCE_COMMIT" --expected-project-tree "$LIVE_PROJECT_TREE" --expected-routes-enabled true --expected-transit-enabled true --raw-output "$LIVE_RAW_DIR"
node scripts/evidence/sanitize-google-evidence.mjs --input "$LIVE_RAW_DIR" --source-identity "$LIVE_RUN_DIR/source-identity.json" --expected-source-commit "$LIVE_SOURCE_COMMIT" --expected-project-tree "$LIVE_PROJECT_TREE" --output docs/theme-reviews/oak-washi/evidence/google
```

The capture tool serves the staged, already-built hashed `dist`; it does not rebuild or reinterpret flags. It verifies the dedicated build-info module and manifest, local-tarball attestation, and committed-source identity receipt—not Vite's asset manifest—before opening the page. Expected: walking is ready; the selected transit result contains both duration and line and renders both; attribution is visible; malformed/outlier/unavailable cases normalize as designed. If configuration blocks any P0 case, leave its parity row non-verified.

- [ ] **Step 5: Replay without network and scan for secrets**

```bash
env -u VITE_GOOGLE_MAPS_API_KEY -u ETERNAL_POSE_GOOGLE_PLACES_API_KEY npm test -- tests/evidence/google-build-provenance.test.ts tests/evidence/google-replay.test.ts
node scripts/evidence/verify-google-evidence.mjs docs/theme-reviews/oak-washi/evidence/google --expected-source-commit "$LIVE_SOURCE_COMMIT" --expected-project-tree "$LIVE_PROJECT_TREE" --scan-root "$PWD"
```

Expected: tests and verifier pass. The verifier recomputes every artifact hash, rejects a source/build-info mismatch, distinguishes a clean scan from a traversal failure, and reports no credential-shaped tracked bytes.

- [ ] **Step 6: Commit only sanitized evidence**

```bash
git add docs/theme-reviews/oak-washi/evidence/google docs/audits/2026-09-eternal-pose-v2-oak-washi-parity.md
git diff --cached --check
git commit -m "test: record sanitized Google provider evidence"
```

Do not add the raw directory, credential values, network logs, browser profiles, or rebuilt product bytes. Task 6 must require the attested `examples/tokyo` tree to equal this evidence manifest's `source.projectTree`; any intervening Tokyo source change invalidates the live rows and returns to Step 4.

---

### Task 5: Finish every release and verification tool before attestation

**Files:**
- Create: `scripts/release/release-model.mjs`
- Create: `scripts/release/deterministic-plugin-archive.mjs`
- Create: `scripts/release/build-v2-candidate.mjs`
- Create: `scripts/release/verify-v2-attestation.mjs`
- Create: `scripts/release/verify-local-attested-candidate.mjs`
- Create: `scripts/release/publish-v2-next.mjs`
- Create: `scripts/release/snapshot-defaults.mjs`
- Create: `scripts/release/promote-v2-defaults.mjs`
- Create: `scripts/release/rollback-v2-defaults.mjs`
- Create: `scripts/release/verify-registry-candidate.mjs`
- Create: `scripts/release/run-disposable-registry.mjs`
- Create: `scripts/release/run-rollback-rehearsal.mjs`
- Create: `scripts/release/verify-default-installs.mjs`
- Create: `scripts/release/import-v2-release-evidence.mjs`
- Create: `scripts/release/build-release-test-fixture.mjs`
- Create: `tests/release/release-model.test.ts`
- Create: `tests/release/candidate-reproducibility.test.ts`
- Create: `tests/release/local-attested-candidate.test.ts`
- Create: `tests/release/pointer-safety.test.ts`
- Create: `tests/release/registry-candidate.test.ts`
- Create: `tests/release/rollback-rehearsal.test.ts`
- Create: `tests/release/default-installs.test.ts`
- Create: `tests/release/import-v2-release-evidence.test.ts`
- Create: `tests/release/build-release-test-fixture.test.ts`
- Create: `tests/fixtures/verdaccio/config.yml`
- Modify: `scripts/set-release-versions.mjs`
- Modify: `.github/workflows/ci.yml`
- Delete: `.releaserc.json`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: a clean full Git commit and the four-package lockstep DAG.
- Produces: deterministic candidate/attestation, explicit `next`, promotion, snapshot, rollback, clean-host verification, disposable rehearsal, and evidence-import commands. No executable or test needed after attestation is allowed to be created later, and no `main` push can publish implicitly.

The attestation schema is:

```ts
interface V2ReleaseAttestation {
  schemaVersion: 1;
  version: "2.0.0";
  source: { origin: string; commit: string; rootTree: string; pluginTree: string };
  plugin: { version: "2.0.0"; archive: string; bytes: number; sha256: string };
  packages: readonly {
    name: "@laugh-tale-island/core" | "@laugh-tale-island/react" | "@laugh-tale-island/adapters" | "@laugh-tale-island/testing";
    version: "2.0.0";
    archive: string;
    bytes: number;
    sha256: string;
    integrity: string;
  }[];
  manifests: readonly { path: string; sha256: string }[];
  createdAt: string;
}
```

The default snapshot and every promotion/rollback result use these exact pointer fields:

```ts
interface DefaultPointerSnapshotV1 {
  schemaVersion: 1;
  attestationSha256: string;
  registry: string;
  packages: readonly {
    name: "@laugh-tale-island/core" | "@laugh-tale-island/react" | "@laugh-tale-island/adapters" | "@laugh-tale-island/testing";
    tag: "latest";
    value: string | null;
  }[];
  git: {
    remote: string;
    ref: "refs/heads/main";
    commit: string;
    pluginTree: string;
    pluginVersion: string;
  };
}

interface PointerMutationObservation {
  pointer: string;
  operation: "promote" | "restore";
  snapshot: string | null;
  failedPromotionValue: string;
  observedBefore: string | null;
  observedAfter: string | null;
  action: "write-target" | "restore-snapshot" | "already-target" | "already-snapshot" | "refused-third-party-drift";
}
```

- [ ] **Step 1: Write release-model and post-attestation-tool failures**

Assert full 40-character commit IDs, exact origin URL, clean worktree, four packages in publish order `core`, `react`, `adapters`, `testing`, exact cross-dependencies, identical plugin/marketplace versions, identical Claude/Codex plugin trees, and refusal to publish/promote when candidate source bytes differ from attestation. Add red contract tests for local attested-path smokes, exact candidate clone verification, disjoint Claude/Codex homes, empty npm caches, five-point rollback injection, default install verification, and an evidence importer that accepts only schema-valid outputs bound to the same attestation. In `pointer-safety.test.ts`, reject a missing/implicit registry on publish, snapshot, promote, or rollback; reject a missing Git remote/default ref on snapshot or rollback; and prove `promote --packages-only` requires only its explicit registry and neither reads nor accepts a Git remote.

Add a table-driven compare-before-write matrix for each of the four package tags. Promotion may write only when the just-read value equals its snapshot; an already-`2.0.0` value is an idempotent no-op, and any third value must stop before that or any later write. Restore may change only a just-read `2.0.0` value back to its snapshot (including removing `latest` when the snapshot recorded absence); an already-snapshot value is a no-op, and a third-party value is preserved with `refused-third-party-drift`. Inject drift independently before all eight write/restore points and assert the structured observations contain exact before/after values. Add Git cases for PR-base mismatch, snapshot-main mismatch immediately before merge, PR-head mismatch, main already at snapshot, main exactly at the recorded failed-promotion commit, and unrelated main drift; only the failed-promotion case may create one forward restoration commit.

```bash
npm test -- tests/release/release-model.test.ts tests/release/pointer-safety.test.ts tests/release/local-attested-candidate.test.ts tests/release/registry-candidate.test.ts tests/release/rollback-rehearsal.test.ts tests/release/default-installs.test.ts tests/release/import-v2-release-evidence.test.ts
```

Expected: FAIL because explicit tooling is absent.

- [ ] **Step 2: Implement deterministic candidate construction**

Require an absolute, absent output directory outside the checkout. Run all package builds once, invoke `npm pack --json` for each package, create a normalized plugin archive with sorted POSIX paths, modes, uid/gid zero, timestamp zero, and no symlink traversal, then hash every byte. Write the attestation last via temp file, fsync, rename, and make the candidate directory read-only. A dirty tree, wrong version, wrong dependency, missing subpath, or non-empty output fails before publication.

The archive builder is also a standalone, read-only source command with exact form:

```text
deterministic-plugin-archive.mjs --plugin-root <absolute-directory> --output <absolute-absent-tar.gz> --metadata-output <absolute-absent-json>
```

It atomically writes the archive and a schema-valid metadata object containing plugin version, byte count, SHA-256, and normalized entry count; it never includes an absolute source path. `build-v2-candidate` must call this same exported implementation rather than reimplement archive packing.

- [ ] **Step 3: Prove repeatability**

From the same clean commit, build into two separate temporary directories and compare all four tarball SHA-256 values, the plugin archive SHA-256, and normalized attestations excluding `createdAt` and absolute archive paths.

```bash
npm test -- tests/release/candidate-reproducibility.test.ts
```

Expected: PASS with byte-identical archives.

- [ ] **Step 4: Implement explicit pointer operations**

The pointer CLIs have these exact authority boundaries:

```text
publish-v2-next.mjs --attestation <absolute-json> --registry <https-or-loopback-url> --confirm-version 2.0.0 (--dry-run | --execute)
snapshot-defaults.mjs --attestation <absolute-json> --registry <https-or-loopback-url> --git-remote <name-or-url> --default-ref refs/heads/main --output <absolute-absent-json>
promote-v2-defaults.mjs --attestation <absolute-json> --snapshot <absolute-json> --registry <https-or-loopback-url> --confirm-version 2.0.0 --packages-only (--dry-run | --execute)
rollback-v2-defaults.mjs --attestation <absolute-json> --snapshot <absolute-json> --registry <https-or-loopback-url> --git-remote <name-or-url> --default-ref refs/heads/main --confirm-version 2.0.0 [--failed-promotion-main <40-char>] (--dry-run | --execute)
```

No command reads an implicit npm registry or Git remote. Registry URLs must be HTTPS except an exact `http://127.0.0.1:<port>` issued by the disposable-registry harness; other HTTP hosts fail closed. The packages-only promote command neither requires nor accepts a Git input; the reviewed PR merge is the one real Git promotion. `publish-v2-next` publishes attested paths only and verifies `npm view <name>@2.0.0 dist.integrity --registry <same-url>` afterward. `snapshot-defaults` records all four current `latest` resolutions plus the supplied default-ref commit/plugin tree/version, including an absent tag. `promote-v2-defaults` refuses without that snapshot and attestation.

Immediately before every `latest` add/change/removal, the implementation re-reads that exact package/tag from the supplied registry. Promotion accepts only `observed === snapshot` or `observed === "2.0.0"`; restore accepts only `observed === "2.0.0"` or `observed === snapshot`. It performs the mutation only in the first case, treats the second as an idempotent no-op, immediately re-reads the result, and emits a `PointerMutationObservation`. A different value fails closed without overwriting it. The ordered result includes observations for every attempted pointer, so a caller can distinguish complete rollback from a drift-blocked partial result; drift is never reported as success.

`publish-v2-next` is prefix-retry safe: before each package it queries exact `@2.0.0`; absent means publish the attested tarball, present with identical registry integrity means skip publication and repair/verify `next`, and present with any other integrity hard-stops. Test every 0–4 already-published prefix so a network failure cannot strand an unrestartable train.

`rollback-v2-defaults` is the one production and rehearsal implementation: with `--execute`, it actually restores all four recorded tags against the supplied registry. With no `--failed-promotion-main`, it requires the supplied default ref still equal the snapshot and emits `gitAction: "none"`. With that flag, it requires the current ref equal either the supplied failed-promotion commit or the snapshot: the former creates one child forward-restoration commit whose plugin tree/version equal the snapshot and pushes it as a normal fast-forward; the latter is a no-op. Any other ref is preserved and returns `refused-third-party-drift`. The final normal push supplies the exact remote/ref and fails if a concurrent update makes it non-fast-forward. It never merely prints an operation while the caller implements different behavior.

- [ ] **Step 5: Implement all clean-host, rehearsal, default, and evidence tools now**

Install `verdaccio@6.10.2` as an exact development dependency in this pre-attestation task.

```bash
npm install --save-dev --save-exact verdaccio@6.10.2
```

`verify-local-attested-candidate` uses only the attested tarball/plugin paths for a clean consumer, staged starter, generated Tokyo, detached Claude install, and detached Codex install, then writes one attestation-bound prepublication receipt. For each marketplace it resolves the installed plugin root, invokes its Create with the deterministic one-owner `zh-Hant-TW` smoke Trip and omitted recipe, rewrites only the four internal dependency/lock identities to the attested local archives, performs a clean install, then uses Task 3's deterministic harness to import that installed artifact's `searchTripPlaces`, invokes the installed accept CLI, and runs the installed Validate/Verify in `candidate` mode with `ETERNAL_POSE_CANDIDATE_ATTESTATION` set to the portable local attestation. This is the first full installed-plugin Verify; it cannot resolve a repository module or unpublished registry lock. `verify-registry-candidate` resolves `--candidate-ref refs/heads/<name>` with `ls-remote`, requires `--expected-commit <40-char>` and an explicit `--registry <https-url>`, checks out that commit detached into two clean roots, gives Claude and Codex separate homes/caches, installs exact registry versions immediately after Create, repeats the same installed-module harness plus installed accept/Validate/Verify sequence in `registry` mode, compares downloaded bytes with attestation, and writes a schema-valid JSON result. `run-disposable-registry` launches Verdaccio `6.10.2` on an OS-assigned loopback port with uplinks disabled and isolated config/storage. `run-rollback-rehearsal` publishes the four real Laugh Tale package names from attested tarballs into that isolated registry, passes the returned loopback registry URL, absolute bare-remote path, and `refs/heads/main` explicitly into the production promote/rollback modules, injects failure after each of four tag writes and the Git default update, then separately injects a third-party value before each tag restore and an unrelated commit before Git restore. It verifies both successful condition-specific restoration and safe drift refusal and writes out-of-tree JSON. `verify-default-installs` requires an explicit registry, exercises the two README defaults in separate clean homes, repeats the registry-mode installed-plugin sequence, and writes postpromotion JSON.

The local-attested verifier's generation form is exact:

```text
verify-local-attested-candidate.mjs --attestation <absolute-json> --source-root <absolute-detached-source> [--physical-review-root <absolute-absent-directory>] --output <absolute-absent-json>
```

When `--physical-review-root` is present, it retains one Tokyo project only after installing the four attested tarballs, deriving its local candidate attestation from those exact entries, passing candidate Validate/Verify, and passing `verify-generated-source-identity` against `<source-root>/examples/tokyo`. It never copies `node_modules`, a lockfile, or build output from a prior smoke. The replay form rejects `--physical-review-root`.

Each of those four verifiers has exactly two modes: generation uses `--output <absolute-absent-json>` plus its declared live inputs; offline replay uses `--verify-evidence <repository-json>` plus `--attestation` and performs no network mutation. Their fixture tests cover both modes and reject using `--output` with `--verify-evidence`.

`build-release-test-fixture` creates an owned temporary Git checkout, four minimal real-name package archives, deterministic plugin archive, portable attestation, defaults snapshot, isolated bare Git remote, and an endpoint manifest at `<fixture-root>/endpoints.json`. It prints the same result as one JSON object and the manifest contains exactly `{ "registryUrl": "http://127.0.0.1:<assigned-port>", "gitRemote": "<absolute-fixture-path>/remote.git", "defaultRef": "refs/heads/main" }`. Tests and dry runs consume those returned endpoints; do not commit an attestation or endpoint manifest containing machine-specific absolute paths. Dry-run pointer commands must validate but never contact these endpoints; the rollback harness starts the corresponding isolated registry before it invokes the production rollback module.

`import-v2-release-evidence` is the only post-attestation repository writer. It takes the immutable attestation plus local-attested/registry/rehearsal/postpromotion JSON paths, verifies their schemas and attestation hash, emits a sanitized attestation receipt without absolute archive paths, rejects credentials and absolute temp paths, then atomically copies only the supplied evidence files to their declared repository paths and updates only matching parity rows. It refuses any package, plugin, recipe, starter, Tokyo, script, test, manifest, lockfile, or version-tree difference from the attested source. The attestation verifier accepts `--source-root <absolute-detached-candidate>` so an evidence-only integration checkout can verify the immutable candidate without pretending its own root tree is attested.

- [ ] **Step 6: Disable implicit release and expose the complete command set**

Remove the `release` job from CI and delete `.releaserc.json`. CI on `main` runs verification only. Add explicit local scripts:

```json
{
  "scripts": {
    "release:v2:build": "node scripts/release/build-v2-candidate.mjs",
    "release:v2:verify": "node scripts/release/verify-v2-attestation.mjs",
    "release:v2:publish-next": "node scripts/release/publish-v2-next.mjs",
    "release:v2:snapshot": "node scripts/release/snapshot-defaults.mjs",
    "release:v2:promote": "node scripts/release/promote-v2-defaults.mjs",
    "release:v2:rollback": "node scripts/release/rollback-v2-defaults.mjs",
    "release:v2:import-evidence": "node scripts/release/import-v2-release-evidence.mjs",
    "test:release:attested-local": "node scripts/release/verify-local-attested-candidate.mjs",
    "test:release:registry": "node scripts/release/verify-registry-candidate.mjs",
    "test:release:rollback": "node scripts/release/run-rollback-rehearsal.mjs",
    "test:release:defaults": "node scripts/release/verify-default-installs.mjs"
  }
}
```

- [ ] **Step 7: Run every tooling test, local rehearsal, and dry run**

```bash
npm test -- tests/release/release-model.test.ts tests/release/candidate-reproducibility.test.ts tests/release/pointer-safety.test.ts tests/release/local-attested-candidate.test.ts tests/release/registry-candidate.test.ts tests/release/rollback-rehearsal.test.ts tests/release/default-installs.test.ts tests/release/import-v2-release-evidence.test.ts tests/release/build-release-test-fixture.test.ts
node scripts/release/build-release-test-fixture.mjs --output "$ABSOLUTE_EMPTY_TEMP/release-fixture"
FIXTURE_REGISTRY="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).registryUrl' "$ABSOLUTE_EMPTY_TEMP/release-fixture/endpoints.json")"
FIXTURE_GIT_REMOTE="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).gitRemote' "$ABSOLUTE_EMPTY_TEMP/release-fixture/endpoints.json")"
npm run test:release:rollback -- --attestation "$ABSOLUTE_EMPTY_TEMP/release-fixture/attestation.json" --output "$ABSOLUTE_EMPTY_TEMP/rehearsal.json"
npm run release:v2:publish-next -- --attestation "$ABSOLUTE_EMPTY_TEMP/release-fixture/attestation.json" --registry "$FIXTURE_REGISTRY" --confirm-version 2.0.0 --dry-run
npm run release:v2:promote -- --attestation "$ABSOLUTE_EMPTY_TEMP/release-fixture/attestation.json" --snapshot "$ABSOLUTE_EMPTY_TEMP/release-fixture/defaults.json" --registry "$FIXTURE_REGISTRY" --confirm-version 2.0.0 --packages-only --dry-run
npm run release:v2:rollback -- --attestation "$ABSOLUTE_EMPTY_TEMP/release-fixture/attestation.json" --snapshot "$ABSOLUTE_EMPTY_TEMP/release-fixture/defaults.json" --registry "$FIXTURE_REGISTRY" --git-remote "$FIXTURE_GIT_REMOTE" --default-ref refs/heads/main --confirm-version 2.0.0 --dry-run
npm test -- tests/scripts/write-registry-lockfile.test.ts tests/packages/artifacts.test.ts
```

Expected: tests pass; dry runs validate explicit isolated endpoints, print ordered intended mutations, and perform no network write. Recompute the four current package archive hashes and assert they equal the package identities already bound into Task 4's committed starter lock and regenerated Tokyo; this task may not update either tree. Any mismatch returns to Task 4 and requires fresh live evidence before attestation.

- [ ] **Step 8: Commit the complete pre-attestation release mechanism**

```bash
git add scripts/release tests/release tests/fixtures/verdaccio/config.yml scripts/set-release-versions.mjs .github/workflows/ci.yml package.json package-lock.json
git rm .releaserc.json
git diff --cached --check
git commit -m "build: make the v2 release explicitly staged"
```

---

### Task 6: Build and attest the final artifacts exactly once

**Files:**
- Verify: all four package manifests
- Verify: `plugins/eternal-pose/.claude-plugin/plugin.json`
- Verify: `plugins/eternal-pose/.codex-plugin/plugin.json`
- Verify: `.claude-plugin/marketplace.json`
- Verify: `.agents/plugins/marketplace.json`
- Verify: `plugins/eternal-pose/recipes-v2/oak-washi/recipe.json`
- Verify: `docs/audits/2026-09-eternal-pose-v2-oak-washi-parity.md`
- Create outside repository: `$CANDIDATE_DIR/attestation.json`, four `.tgz` files, and one deterministic plugin `.tar.gz`
- Create outside repository: detached full-SHA `$CANDIDATE_SOURCE_ROOT`

**Interfaces:**
- Consumes: the clean final product/tooling commit after Tasks 1–5.
- Produces: the one read-only candidate directory and detached source identity consumed without rebuilding by Tasks 7–10.

- [ ] **Step 1: Freeze the final source identity**

```bash
test -n "$RELEASE_RUN_DIR"
export CANDIDATE_DIR="$RELEASE_RUN_DIR/candidate"
export CANDIDATE_SOURCE_ROOT="$RELEASE_RUN_DIR/source"
export RELEASE_EVIDENCE_DIR="$RELEASE_RUN_DIR/evidence"
test ! -e "$CANDIDATE_DIR"
test ! -e "$CANDIDATE_SOURCE_ROOT"
mkdir -p "$RELEASE_EVIDENCE_DIR"
test -z "$(git status --short)"
export ATTESTED_COMMIT="$(git rev-parse HEAD)"
test "${#ATTESTED_COMMIT}" -eq 40
git rev-parse HEAD^{tree}
git rev-parse HEAD:plugins/eternal-pose
npm run validate:plugins
npm run check:marketplace
```

Expected: clean status; full commit/root-tree/plugin-tree values recorded; both manifest validators pass. Keep `ATTESTED_COMMIT` and all three paths exported in one dedicated release shell through Task 10; never infer candidate identity from a later evidence-branch `HEAD`.

- [ ] **Step 2: Run every pre-pack automated gate**

```bash
npm run check
npm run test:visual:v2
npm run test:a11y:v2
npm run test:performance:v2
npm run test:release:local
npm run test:parity -- --schema-only
```

Expected: all implementation/evidence schemas pass. Physical, exact-candidate, and local-attested P0 rows remain `failed` until Task 7; that expected state does not authorize publication.

- [ ] **Step 3: Build the immutable candidate once**

```bash
git worktree add --detach "$CANDIDATE_SOURCE_ROOT" "$ATTESTED_COMMIT"
npm run release:v2:build -- --version 2.0.0 --output "$CANDIDATE_DIR"
npm run release:v2:verify -- --attestation "$CANDIDATE_DIR/attestation.json" --source-root "$CANDIDATE_SOURCE_ROOT"
```

Expected: exactly four package tarballs in `core`, `react`, `adapters`, `testing` order, one deterministic plugin archive, and one attestation; every hash verifies and candidate output is read-only. Require `attestation.source.commit === ATTESTED_COMMIT`, its plugin tree to equal both plugin manifests, its `examples/tokyo` tree to equal Task 4's sanitized live-evidence `source.projectTree`, and every attested package version/SHA-256/integrity to equal the package identity recorded by that live-evidence manifest.

- [ ] **Step 4: Seal the no-rebuild boundary**

Record the candidate directory identity, attestation SHA-256, four filenames/sizes/SHA-256/integrities, plugin filename/size/SHA-256, source root/tree/plugin tree, and read-only modes outside the repository. From this point, no task invokes `npm pack`, `release:v2:build`, or `deterministic-plugin-archive` again. Any product, release-script, test, manifest, lockfile, or artifact mismatch invalidates the whole candidate; abandon these paths, make the required source commit, and restart Task 6 with a new absent `$RELEASE_RUN_DIR`.

Do not create a repository commit or remote ref in this task.

---

### Task 7: Verify the attested candidate, complete physical sign-off, and close prepublication

**Files:**
- Create outside repository: `$RELEASE_EVIDENCE_DIR/local-attested-candidate.json`
- Create outside repository: `$PHYSICAL_RUN_DIR/generated-tokyo/`, source-identity receipt, and raw physical evidence
- Create on an evidence-only descendant: `docs/theme-reviews/oak-washi/evidence/release/local-attested-candidate.json`
- Create on an evidence-only descendant: `docs/theme-reviews/oak-washi/physical-iphone-signoff.md`
- Create on an evidence-only descendant: `docs/theme-reviews/oak-washi/evidence/physical/manifest.json`
- Add on an evidence-only descendant: selected stills under `docs/theme-reviews/oak-washi/evidence/physical/`
- Modify on an evidence-only descendant: `docs/audits/2026-09-eternal-pose-v2-oak-washi-parity.md`

**Interfaces:**
- Consumes: Task 6's immutable attestation/artifacts/source root, the reviewed benchmark commit, production flags, and a real iPhone.
- Produces: attestation-bound dual-marketplace/local-package evidence, benchmark-first physical verdicts for F1–F8, V1–V5, and M1–M5, product-owner approval, and one passing prepublication evidence commit. Candidate identity remains `ATTESTED_COMMIT`.

- [ ] **Step 1: Re-verify the candidate and create an attested physical-review root**

Require a caller-supplied absolute, absent `$PHYSICAL_RUN_DIR` outside the candidate/source roots. The local verifier must consume the attested archives, never pack current workspaces, and retain exactly one verified generated Tokyo root for the device run:

```bash
test -n "$PHYSICAL_RUN_DIR"
test ! -e "$PHYSICAL_RUN_DIR"
mkdir -p "$PHYSICAL_RUN_DIR"
export PHYSICAL_REVIEW_ROOT="$PHYSICAL_RUN_DIR/generated-tokyo"
npm run release:v2:verify -- --attestation "$CANDIDATE_DIR/attestation.json" --source-root "$CANDIDATE_SOURCE_ROOT"
npm run test:release:attested-local -- --attestation "$CANDIDATE_DIR/attestation.json" --source-root "$CANDIDATE_SOURCE_ROOT" --physical-review-root "$PHYSICAL_REVIEW_ROOT" --output "$RELEASE_EVIDENCE_DIR/local-attested-candidate.json"
```

Expected: clean consumer, starter, Tokyo, Claude, and Codex smokes all use only the four attested tarballs and plugin archive. For both marketplaces the receipt records the installed plugin-relative Enrich module path/SHA-256, deterministic adapter call count, exact installed Create/accept/candidate-Validate/candidate-Verify argv, and six Verify results with both credentials absent. The retained root's source inventory equals `ATTESTED_COMMIT:examples/tokyo`; its local candidate attestation is derived from and byte-bound to the four immutable package entries.

- [ ] **Step 2: Prepare the immutable physical review record**

Record reviewer, physical device model, iOS/Safari version, network mode, benchmark commit/flags, `ATTESTED_COMMIT`, attested root/plugin/Tokyo trees, generator/plugin version, attested plugin archive filename/size/SHA-256, all four attested package filenames/versions/hashes/integrities, local receipt/source-inventory hashes, start time, and whether each case uses real or fake provider data. The `deviceKind` field must equal `physical`; reject `simulator` or blank.

- [ ] **Step 3: Serve the benchmark and attested stage with exact commands**

Use exactly one benchmark command, recording which one served each case:

```bash
export BENCHMARK_ROOT=/Users/bluesky/arsenal/tokyo-trip-map
test -z "$(git -C "$BENCHMARK_ROOT" status --short)"
export BENCHMARK_COMMIT="$(git -C "$BENCHMARK_ROOT" rev-parse HEAD)"
VITE_E2E_FAKE_GOOGLE=true npm --prefix "$BENCHMARK_ROOT" run dev -- --host 0.0.0.0 --port 3000 --strictPort
VITE_GOOGLE_MAPS_API_KEY="$VITE_GOOGLE_MAPS_API_KEY" VITE_E2E_FAKE_GOOGLE=false npm --prefix "$BENCHMARK_ROOT" run dev -- --host 0.0.0.0 --port 3000 --strictPort
```

For provider-independent generated cases, run:

```bash
VITE_GOOGLE_ROUTES_ENABLED=false VITE_GOOGLE_TRANSIT_ENABLED=false npm --prefix "$PHYSICAL_REVIEW_ROOT" run dev -- --host 0.0.0.0 --port 4174 --strictPort
```

For live generated cases, build only the review application from its already-installed attested packages, then serve that output. This is verification, not a package/plugin/candidate rebuild:

```bash
export SIGNOFF_TOKYO_TREE="$(git -C "$CANDIDATE_SOURCE_ROOT" rev-parse HEAD:examples/tokyo)"
ETERNAL_POSE_SOURCE_COMMIT="$ATTESTED_COMMIT" ETERNAL_POSE_PROJECT_TREE="$SIGNOFF_TOKYO_TREE" VITE_GOOGLE_MAPS_API_KEY="$VITE_GOOGLE_MAPS_API_KEY" VITE_GOOGLE_ROUTES_ENABLED=true VITE_GOOGLE_TRANSIT_ENABLED=true npm --prefix "$PHYSICAL_REVIEW_ROOT" run build
npm --prefix "$PHYSICAL_REVIEW_ROOT" run preview -- --host 0.0.0.0 --port 4174 --strictPort
```

Run only one server on port `4174` at a time and record its clean shutdown before changing provider mode. Record exact commands, boolean environment values, LAN origins, and staged `dist/build-info.json` SHA-256. Do not modify environment files or execute committed `examples/tokyo`. If the restricted key rejects the LAN origin, either obtain explicit user authorization to add exactly that temporary referrer and remove/verify its removal after capture, or run provider-independent cases; Simulator evidence cannot substitute.

- [ ] **Step 4: Run all 18 cases benchmark-first**

For every F1–F8, V1–V5, and M1–M5 case, reset to the documented start state, observe benchmark, then generated, and record both observations, one verdict, category, and evidence filename. Exercise true pinch, Safari rubber-banding, short/long drag, mid-snap interruption, scroll boundaries, collapsed/half/expanded sheet, header reversal, long content, grayscale, camera fit/focus, transit/walking distinction, location follow/recenter, and unresolved Pelican state. F2 evaluates traveled position only.

- [ ] **Step 5: Repeat physical performance feel**

Perform three qualitative two-second sheet drags, three header reversals, three map pinch/scroll ownership passes, and one 200-percent text journey. Record frame/jank observations separately from automated thresholds.

- [ ] **Step 6: Obtain product-owner approval**

The product owner must explicitly approve Oak & Washi's visual language and every P0 manual row. A failed or partially verified P0 remains a blocker. A product defect discovered now invalidates the candidate and returns to its owning phase plus Task 6; do not patch an attested source or reinterpret the defect as polish.

- [ ] **Step 7: Sanitize and create one evidence-only descendant**

Keep raw device material under `$PHYSICAL_RUN_DIR`. Remove identifiers, accounts, unrelated coordinates, keys, and request logs from the repository evidence. Re-verify the immutable candidate, then create a local evidence branch from the exact attested commit, import the local receipt, add only sanitized physical evidence, and update only matching parity rows:

```bash
npm run release:v2:verify -- --attestation "$CANDIDATE_DIR/attestation.json" --source-root "$CANDIDATE_SOURCE_ROOT"
node scripts/release/verify-generated-source-identity.mjs --expected "$CANDIDATE_SOURCE_ROOT/examples/tokyo" --actual "$PHYSICAL_REVIEW_ROOT" --candidate-attestation "$PHYSICAL_REVIEW_ROOT/.laugh-tale-local-candidates.json" --output "$PHYSICAL_RUN_DIR/source-identity-after.json"
git switch -c codex/eternal-pose-v2.0.0-evidence-local "$ATTESTED_COMMIT"
npm run release:v2:import-evidence -- --attestation "$CANDIDATE_DIR/attestation.json" --source-root "$CANDIDATE_SOURCE_ROOT" --local-attested "$RELEASE_EVIDENCE_DIR/local-attested-candidate.json"
npm run test:parity -- --gate prepublication
git diff --name-only "$ATTESTED_COMMIT"
git add docs/theme-reviews/oak-washi/evidence/release/local-attested-candidate.json docs/theme-reviews/oak-washi/physical-iphone-signoff.md docs/theme-reviews/oak-washi/evidence/physical docs/audits/2026-09-eternal-pose-v2-oak-washi-parity.md
git diff --cached --check
git commit -m "test: record attested prepublication sign-off"
```

The diff allowlist is exactly the local receipt, physical sign-off document, physical evidence directory, and parity report. Compare packages, plugin, recipe, starter, Tokyo, release scripts/tests, manifests, and lockfiles to `$CANDIDATE_SOURCE_ROOT`; every protected byte must remain identical. Expected: every prepublication P0 is `verified`, candidate hashes still verify, and this evidence commit is a descendant—not the candidate identity. Do not push yet.

- [ ] **Step 8: Present the authorization packet and stop**

Show the user: full attested candidate commit/root/plugin/Tokyo trees, separate evidence commit and exact four-path diff, origin URL, version, four package filenames/sizes/SHA-256/integrities, plugin filename/size/SHA-256, local and physical gate summaries/product-owner approval, current `npm latest` values, current `origin/main` commit/plugin tree/version, and exact proposed candidate ref. Request explicit authorization to push `ATTESTED_COMMIT` to the candidate ref and publish those four attested packages under `next`. Do not infer approval from implementation or sign-off approval; the evidence commit is not the candidate ref.

Simulator screenshots may remain supplementary evidence but cannot close physical rows.

---

### Task 8: Publish and verify the non-default candidate

**Files:**
- Read only: the attested checkout and Task 5 release tools
- Create outside repository: `$RELEASE_EVIDENCE_DIR/registry-candidate.json`

**Interfaces:**
- Consumes: authorized immutable attestation and candidate source commit.
- Produces: fetchable Git candidate ref, four `next` dist-tags, and clean exact-registry dual-marketplace evidence; defaults remain unchanged.

- [ ] **Step 1: Verify authorization and attestation immediately before mutation**

```bash
npm run release:v2:verify -- --attestation "$CANDIDATE_DIR/attestation.json" --source-root "$CANDIDATE_SOURCE_ROOT"
git -C "$CANDIDATE_SOURCE_ROOT" rev-parse HEAD
```

Expected: the detached `$CANDIDATE_SOURCE_ROOT` HEAD equals the attested commit and every artifact hash matches; the evidence-branch HEAD is intentionally different.

- [ ] **Step 2: Push one non-default candidate ref**

```bash
git push origin "$ATTESTED_COMMIT":refs/heads/release/eternal-pose-v2.0.0-candidate.1
git ls-remote origin refs/heads/release/eternal-pose-v2.0.0-candidate.1
```

Expected: remote resolves to the attested full commit. Do not push `main`.

- [ ] **Step 3: Publish attested packages under `next`**

```bash
npm run release:v2:publish-next -- --attestation "$CANDIDATE_DIR/attestation.json" --registry https://registry.npmjs.org --confirm-version 2.0.0 --execute
```

Expected: all four `@2.0.0` versions resolve, their registry integrity matches attestation, and all four `next` tags point to `2.0.0`; `latest` snapshots are unchanged.

- [ ] **Step 4: Verify exact registry artifacts from empty caches**

Create two clean hosts. Clone the candidate ref from `https://github.com/XBlueSky/laugh-tale.git`, verify full commit/tree/version, then separately register/install Claude and Codex marketplaces. Generate from the deterministic one-owner `zh-Hant-TW` smoke Trip with omitted recipe; run `npm ci --registry https://registry.npmjs.org` in that generated root before invoking any project command; invoke Task 3's test-only deterministic adapter harness against the installed plugin's `searchTripPlaces` export; then run the installed accept CLI, registry-mode Validate/Verify, package/subpath imports, unit/type/lint/accessibility/experience tests, and production build using exact registry `2.0.0`. Compare downloaded tarballs to attested hashes. Do not invoke the production Enrich `search` CLI or require a Google key in this smoke.

- [ ] **Step 5: Record candidate evidence outside the repository**

Use the already-attested verifier. It creates its own clean directories and refuses a non-full `--expected-commit`, any candidate-ref/SHA mismatch, a warm package cache, or a source-worktree path. The output binds the attestation SHA-256, candidate full commit/tree/plugin tree, all downloaded package hashes, both host results, and the unchanged `latest` snapshot.

```bash
npm run test:release:registry -- --attestation "$CANDIDATE_DIR/attestation.json" --candidate-ref refs/heads/release/eternal-pose-v2.0.0-candidate.1 --expected-commit "$ATTESTED_COMMIT" --registry https://registry.npmjs.org --output "$RELEASE_EVIDENCE_DIR/registry-candidate.json"
```

Expected: PASS and one schema-valid out-of-tree evidence file. On failure, leave `latest` and `main` untouched, retain the failed result outside the checkout, and stop.

- [ ] **Step 6: Prove the candidate ref never moved**

```bash
git ls-remote origin refs/heads/release/eternal-pose-v2.0.0-candidate.1
npm run release:v2:verify -- --attestation "$CANDIDATE_DIR/attestation.json" --source-root "$CANDIDATE_SOURCE_ROOT"
```

Expected: the remote ref still equals the attested full commit and every source/artifact hash verifies. Do not commit or push evidence to the candidate ref; it is immutable after Step 2.

---

### Task 9: Rehearse every promotion failure against disposable defaults

**Files:**
- Read only: the attested checkout and Task 5 release/rehearsal tools
- Create outside repository: `$RELEASE_EVIDENCE_DIR/rollback-rehearsal.json`

**Interfaces:**
- Consumes: candidate artifacts, Verdaccio `6.10.2`, and a temporary bare Git remote.
- Produces: machine evidence that failures after each of five pointer writes restore all four tags and the prior plugin tree through a forward commit, plus evidence that third-party drift is preserved and blocks automatic rollback.

- [ ] **Step 1: Verify the immutable candidate before rehearsal**

```bash
npm run release:v2:verify -- --attestation "$CANDIDATE_DIR/attestation.json" --source-root "$CANDIDATE_SOURCE_ROOT"
npm test -- tests/release/rollback-rehearsal.test.ts
```

Expected: PASS; rehearsal code and pinned Verdaccio were already part of the attested commit.

- [ ] **Step 2: Create isolated old and candidate states**

Launch Verdaccio on an OS-assigned loopback port with uplinks disabled and isolated storage/config. Seed prior versions under the four real `@laugh-tale-island/*` package names, then publish the four attested candidate tarballs under those same names. Create a bare remote with a prior default plugin tree and the attested candidate plugin tree. Never point npm or Git commands at user-global configuration.

- [ ] **Step 3: Inject failure and compare-before-write drift at every pointer**

Run five independent successful-rollback cases: after core tag, react tag, adapters tag, testing tag, and default-branch update. Before each promotion write, require the observed tag equal its fixture snapshot or already equal `2.0.0`. After each injected failure, invoke the same rollback module used by real release. Before each restore, require the observed tag equal `2.0.0` or its fixture snapshot. Assert all four tags equal their captured prior values or are absent as captured. In the first four cases, omit `--failed-promotion-main`, assert the Git ref and history never moved, and require `gitAction: "none"`. Only the fifth passes the exact fixture promoted commit as `--failed-promotion-main`; it contains that failed default followed by one new forward-restoration commit whose parent is the failed value and whose plugin subtree/version equal the prior snapshot.

Run nine additional refusal cases: inject a distinct third-party version immediately before each of the four promotion tag checks, before each of the four restore tag checks, and inject an unrelated main commit before Git restore. Promotion must stop before the drifted or any later tag write. Rollback may restore other pointers only while their current values still equal `2.0.0`; it must preserve every third-party value, exit nonzero with `refused-third-party-drift`, and never claim a complete rollback. The unrelated-main case creates no restoration commit and performs no force push. Also cover already-target promotion and already-snapshot rollback as idempotent no-ops.

- [ ] **Step 4: Record raw operations and deterministic summary outside Git**

The JSON evidence records the immutable attestation hash, fixture versions, initial/final refs, injected point, every `PointerMutationObservation`, rollback completion status, refused third-party values, Git snapshot/failed-promotion/observed-before values, forward-restoration commit when present, verification results, Verdaccio version, and bare-remote hashes. It contains no credentials, temp-root paths, or user npm configuration. The verifier recomputes the expected case matrix and rejects missing drift-refusal evidence or a hand-authored pass flag.

```bash
npm run test:release:rollback -- --attestation "$CANDIDATE_DIR/attestation.json" --output "$RELEASE_EVIDENCE_DIR/rollback-rehearsal.json"
```

Expected: all five restoration cases, nine drift-refusal cases, and the idempotent target/snapshot cases produce their exact expected result, and the schema-valid evidence remains outside the checkout.

- [ ] **Step 5: Reconfirm no real pointer moved**

```bash
npm run release:v2:verify -- --attestation "$CANDIDATE_DIR/attestation.json" --source-root "$CANDIDATE_SOURCE_ROOT"
git ls-remote origin refs/heads/release/eternal-pose-v2.0.0-candidate.1 refs/heads/main
```

Expected: candidate still equals the attested commit and real `main`/`latest` remain at their prepromotion values. Do not create a repository commit in this task.

---

### Task 10: Promote exact defaults, verify, or roll forward to the snapshot

**Files:**
- Import after validation: `docs/theme-reviews/oak-washi/evidence/release/registry-candidate.json`
- Import after validation: `docs/theme-reviews/oak-washi/evidence/release/rollback-rehearsal.json`
- Create outside repository: `$RELEASE_RUN_DIR/defaults-before-promotion.json`
- Create outside repository first, then import after validation: `$RELEASE_EVIDENCE_DIR/postpromotion.json`
- Modify through evidence-only commits: `docs/audits/2026-09-eternal-pose-v2-oak-washi-parity.md`
- Modify through reviewed integration only: `origin/main`

**Interfaces:**
- Consumes: green candidate and rollback rehearsal, immutable attestation, fresh default snapshot, reviewed release integration commit, and explicit promotion authorization.
- Produces: all four `latest` tags at `2.0.0`, `origin/main` resolving to the identical attested plugin tree/version, or a verified complete rollback.

- [ ] **Step 1: Prepare an evidence-only integration locally**

Continue the unpushed evidence branch from Task 7's prepublication evidence commit. Record that commit as `PREPUBLICATION_EVIDENCE_COMMIT`. Run `release:v2:import-evidence` with the Task 8 registry result and Task 9 rehearsal result, then commit exactly the two validated JSON files plus their matching parity-row updates. Assert this task's three-path diff is exact; the full branch-to-attested allowlist is exactly six path groups: local receipt, physical sign-off document, physical evidence directory, registry receipt, rollback receipt, and parity report. Package, plugin, recipe, starter, Tokyo, scripts, tests, manifests, lockfile, and versions remain byte-identical to the attested commit.

```bash
PREPUBLICATION_EVIDENCE_COMMIT="$(git rev-parse HEAD)"
npm run release:v2:import-evidence -- --attestation "$CANDIDATE_DIR/attestation.json" --source-root "$CANDIDATE_SOURCE_ROOT" --registry "$RELEASE_EVIDENCE_DIR/registry-candidate.json" --rollback "$RELEASE_EVIDENCE_DIR/rollback-rehearsal.json"
git diff --name-only "$PREPUBLICATION_EVIDENCE_COMMIT"
npm run test:parity -- --gate registry-candidate
git add docs/theme-reviews/oak-washi/evidence/release/registry-candidate.json docs/theme-reviews/oak-washi/evidence/release/rollback-rehearsal.json docs/audits/2026-09-eternal-pose-v2-oak-washi-parity.md
git diff --cached --check
git commit -m "test: record v2 candidate and rollback evidence"
```

- [ ] **Step 2: Present the integration packet and stop before remote writes**

Show the evidence commit, exact three-path diff, protected-tree comparison with the attested commit, target branch, and proposed PR. Request explicit authorization to push this integration branch and open the PR. After authorization, push only that branch and open the PR; do not update candidate or `main` directly. Store the exact URL returned by `gh pr create` in exported `PROMOTION_PR_URL` in the dedicated release shell. CI must pass `check`, Tokyo, visual, accessibility, parity schema, registry-candidate, rollback, artifact, and no-live-provider gates.

- [ ] **Step 3: Snapshot real defaults immediately before promotion**

```bash
npm run release:v2:snapshot -- --attestation "$CANDIDATE_DIR/attestation.json" --registry https://registry.npmjs.org --git-remote origin --default-ref refs/heads/main --output "$RELEASE_RUN_DIR/defaults-before-promotion.json"
npm run release:v2:verify -- --attestation "$CANDIDATE_DIR/attestation.json" --source-root "$CANDIDATE_SOURCE_ROOT"
export SNAPSHOT_MAIN_COMMIT="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).git.commit' "$RELEASE_RUN_DIR/defaults-before-promotion.json")"
test "${#SNAPSHOT_MAIN_COMMIT}" -eq 40
```

Record all four real `latest` values and current `origin/main` commit/plugin tree/version. Verify the PR head's protected source trees and candidate attested plugin tree are identical; only the six full-branch evidence/report path groups named in Step 1 may differ. The snapshot is the compare-before-write authority: a later third value is not silently adopted as a new baseline.

- [ ] **Step 4: Present the final mutation packet and stop**

Show the exact five promotion writes, integration PR URL/head, snapshot main commit, current defaults, candidate defaults, green registry/rehearsal evidence, the compare-before-write/refusal rules, and both exact conditional rollback commands from Step 8. Request explicit authorization for the promotion plus immediate contingent rollback: restoring only tags still at the failed-promotion value and, only if `main` still equals the recorded promoted commit, pushing the reviewed forward-restoration tree. Without that explicit combined authorization, stop before the first write.

- [ ] **Step 5: Promote packages in recorded order**

After authorization:

```bash
npm run release:v2:promote -- --attestation "$CANDIDATE_DIR/attestation.json" --snapshot "$RELEASE_RUN_DIR/defaults-before-promotion.json" --registry https://registry.npmjs.org --confirm-version 2.0.0 --packages-only --execute
```

Expected: all four `latest` tags resolve to `2.0.0` and match the attested integrities.

For each package, the command must re-read `latest` immediately before mutation, require the snapshot value or existing target, then re-read after mutation. If it observes a third-party value, stop and enter Step 8; do not write that tag or any later tag.

- [ ] **Step 6: Compare the Git default, merge the expected PR head, and verify**

Immediately before merge, require the remote default to remain at the captured snapshot and bind the merge to the reviewed PR head:

```bash
export PROMOTION_PR_HEAD="$(gh pr view "$PROMOTION_PR_URL" --json headRefOid --jq .headRefOid)"
export PROMOTION_PR_BASE="$(gh pr view "$PROMOTION_PR_URL" --json baseRefOid --jq .baseRefOid)"
test "${#PROMOTION_PR_HEAD}" -eq 40
test "$PROMOTION_PR_BASE" = "$SNAPSHOT_MAIN_COMMIT"
export OBSERVED_MAIN_BEFORE_MERGE="$(git ls-remote origin refs/heads/main | cut -f1)"
test "$OBSERVED_MAIN_BEFORE_MERGE" = "$SNAPSHOT_MAIN_COMMIT"
gh pr merge "$PROMOTION_PR_URL" --merge --match-head-commit "$PROMOTION_PR_HEAD"
export PROMOTED_MAIN_COMMIT="$(git ls-remote origin refs/heads/main | cut -f1)"
test "${#PROMOTED_MAIN_COMMIT}" -eq 40
git fetch origin main
test "$(git rev-parse origin/main)" = "$PROMOTED_MAIN_COMMIT"
```

The PR's reported base OID and the immediately observed remote main must both equal the snapshot. A mismatching PR base, `origin/main`, or PR head aborts before merge and requires a fresh snapshot/review; it is never bypassed. Record the PR base/head, observed pre-merge main, resulting main commit, package trees, plugin tree, both marketplace entries, both plugin manifests, and version. Expected: package/plugin trees and version equal attestation even though the evidence/merge commit differs from the candidate commit.

- [ ] **Step 7: Run clean default installs on separate hosts**

Use the README defaults exactly: Claude adds `XBlueSky/laugh-tale`; Codex adds `https://github.com/XBlueSky/laugh-tale`. Each clean host installs `eternal-pose@laugh-tale`, records resolved commit/tree/version, generates from the deterministic one-owner `zh-Hant-TW` smoke Trip with omitted recipe, installs exact registry packages, runs the test-only installed-module Enrich harness plus installed accept CLI, and then runs registry-mode Validate/Verify, unit/type/lint/accessibility/experience tests, and production build. No Google key or production search CLI participates.

```bash
npm run test:release:defaults -- --attestation "$CANDIDATE_DIR/attestation.json" --registry https://registry.npmjs.org --output "$RELEASE_EVIDENCE_DIR/postpromotion.json"
```

Expected: PASS with a schema-valid out-of-tree result bound to the attestation and tested `origin/main` commit. It records each package's snapshot/observed-before/target/observed-after values plus `SNAPSHOT_MAIN_COMMIT`, `PROMOTION_PR_BASE`, `PROMOTION_PR_HEAD`, `OBSERVED_MAIN_BEFORE_MERGE`, and `PROMOTED_MAIN_COMMIT`. The attested package/plugin trees and all four artifact hashes remain unchanged.

- [ ] **Step 8: Roll back immediately on any failed write or postpromotion P0**

If failure occurs before the merge, run exactly:

```bash
npm run release:v2:rollback -- --attestation "$CANDIDATE_DIR/attestation.json" --snapshot "$RELEASE_RUN_DIR/defaults-before-promotion.json" --registry https://registry.npmjs.org --git-remote origin --default-ref refs/heads/main --confirm-version 2.0.0 --execute
```

If the merge completed and a postpromotion P0 fails, run exactly:

```bash
test "${#PROMOTED_MAIN_COMMIT}" -eq 40
npm run release:v2:rollback -- --attestation "$CANDIDATE_DIR/attestation.json" --snapshot "$RELEASE_RUN_DIR/defaults-before-promotion.json" --registry https://registry.npmjs.org --git-remote origin --default-ref refs/heads/main --confirm-version 2.0.0 --failed-promotion-main "$PROMOTED_MAIN_COMMIT" --execute
```

Consume the rollback command's structured result; do not create or push a second Git restore. Before each restore it must re-read the pointer. It may restore a tag only from `2.0.0`, treats the snapshot as a no-op, and preserves/refuses any third value. If `main` never moved, require `gitAction: "none"` and verify the remote ref and history are byte-for-byte unchanged. If `main` still equals `PROMOTED_MAIN_COMMIT`, require exactly one new forward-restoration commit from the production rollback module, verify that its parent is that failed promoted default and that its plugin tree/version equal the snapshot, and never force-push. If any tag or main contains a third-party value, require `refused-third-party-drift`, preserve it, record the blocked partial result, and stop for operator coordination rather than claiming rollback. Only a complete result permits re-running both README default installs and asserting every npm tag plus Git plugin tree matches the snapshot. Candidate versions remain published for diagnosis. Record failure evidence outside the repository and stop; do not import a passing postpromotion result.

- [ ] **Step 9: Prepare the final evidence-only commit when promotion passes**

```bash
npm run release:v2:import-evidence -- --attestation "$CANDIDATE_DIR/attestation.json" --source-root "$CANDIDATE_SOURCE_ROOT" --postpromotion "$RELEASE_EVIDENCE_DIR/postpromotion.json"
git diff --name-only origin/main
git add docs/theme-reviews/oak-washi/evidence/release/postpromotion.json docs/audits/2026-09-eternal-pose-v2-oak-washi-parity.md
git diff --cached --check
git commit -m "docs: record Eternal Pose v2 promotion evidence"
```

The local branch must start at the tested `origin/main`; the exact diff allowlist is the postpromotion JSON plus parity report. Assert all protected trees still equal attestation. Show the commit and request fresh authorization before pushing it to the non-default immutable ref `refs/heads/release/eternal-pose-v2.0.0-evidence`. Run reviewed CI on that ref (a draft evidence PR may be opened only under the same authorization), but do not merge it into `main`: `origin/main` is the single Git default-pointer write already exercised by rollback. The atomic final parity report lives at the recorded evidence ref and links the tested main commit.

```bash
git push origin HEAD:refs/heads/release/eternal-pose-v2.0.0-evidence
git ls-remote origin refs/heads/release/eternal-pose-v2.0.0-evidence
```

- [ ] **Step 10: Run final verification from the evidence ref and clean defaults**

```bash
npm run check
npm run test:release:local
npm run release:v2:verify -- --attestation "$CANDIDATE_DIR/attestation.json" --source-root "$CANDIDATE_SOURCE_ROOT"
npm run test:release:attested-local -- --attestation "$CANDIDATE_DIR/attestation.json" --verify-evidence docs/theme-reviews/oak-washi/evidence/release/local-attested-candidate.json
npm run test:release:registry -- --attestation "$CANDIDATE_DIR/attestation.json" --verify-evidence docs/theme-reviews/oak-washi/evidence/release/registry-candidate.json
npm run test:release:defaults -- --attestation "$CANDIDATE_DIR/attestation.json" --verify-evidence docs/theme-reviews/oak-washi/evidence/release/postpromotion.json
npm run test:release:rollback -- --attestation "$CANDIDATE_DIR/attestation.json" --verify-evidence docs/theme-reviews/oak-washi/evidence/release/rollback-rehearsal.json
git ls-remote origin refs/heads/release/eternal-pose-v2.0.0-candidate.1 refs/heads/release/eternal-pose-v2.0.0-evidence refs/heads/main
npm run test:parity -- --gate prepublication
npm run test:parity -- --gate registry-candidate
npm run test:parity -- --gate postpromotion
```

Expected: all commands exit 0, all P0 rows are `verified`, package defaults equal `2.0.0`, both marketplaces resolve the same attested plugin tree/version, the candidate ref still equals the attested commit, and no protected source or artifact changed after attestation.

## Completion Gate

Use `superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch`. Do not claim the milestone complete until the final commands have fresh output and the product-owner approval is linked from the atomic parity report. Report exact published versions, candidate and `main` commits, plugin tree, artifact hashes, default snapshot location, promotion result, and whether rollback was invoked.
