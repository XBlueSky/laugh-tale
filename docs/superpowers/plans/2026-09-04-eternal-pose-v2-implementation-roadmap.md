# Eternal Pose v2 Oak & Washi Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Eternal Pose 2.0 so an omitted-theme Create produces the Tokyo / Oak & Washi flagship at benchmark quality from four lockstep headless packages and the real Claude/Codex plugin.

**Architecture:** Work proceeds through six ordered, independently testable plans: domain and provider truth, choreography and camera, the injected presentation seam, the canonical Oak & Washi presentation, deterministic generation plus the Tokyo flagship, then hardening and staged release. The package layers own semantics and effects; the generated presentation owns every visible pixel; release evidence closes the same atomic parity report used during development.

**Tech Stack:** Node 22.13+, npm 11, TypeScript 5.9, React 19.2, Vitest 4, Playwright 1.62, Vite 8, Google Maps JavaScript API, Google Places API (New), axe-core, npm workspaces, Claude and Codex Git-backed marketplaces.

**Spec:** `docs/superpowers/specs/2026-09-04-eternal-pose-v2-oak-washi-flagship-design.md`

## Global Constraints

- Execute from an isolated worktree created with `superpowers:using-git-worktrees`; base it on `feat/tokyo-golden-path-baseline` at or after design commit `5a453e1`.
- Read the design spec and the plan for the active phase before editing. When touching either generated site, also read its `AGENTS.md` and `docs/trip-experience-contract.md`.
- Node is `>=22.13.0`; use npm 11. Package, plugin, recipe, and project-manifest release version is `2.0.0` unless a later reviewed release commit supplies another exact 2.x version.
- `@laugh-tale-island/core`, `react`, `adapters`, and `testing` form one exact-version train. The DAG is core → react/adapters → testing; generated production dependencies are core/react/adapters and testing is a dev dependency.
- `plugins/eternal-pose/recipes-v2/oak-washi/presentation/` is the only editable canonical presentation. Starter and Tokyo presentation/runtime source are generated and must not be hand-repaired.
- Only `oak-washi` is selectable in this milestone. Do not ship aliases, the retired recipes, a runtime theme switcher, dark mode, URL state, a second map provider, or a 1.0 migration.
- All visible JSX, CSS, copy, icons, marker DOM, and motion styling stay in generated local presentation source. Package code may expose semantic values, actions, bindings, and provider mechanics only.
- Never invent place identity, coordinates, route mode, geometry, duration, distance, opening status, transit line, current/next state, or navigation capability.
- The Tokyo release fixture stays at six days, 100 nodes, 94 edges, and 89 resolved places; D3-2 and D3-3 are `unknown`, and Pelican Cafe remains unresolved.
- Browser credential: `VITE_GOOGLE_MAPS_API_KEY`. Node-only Enrich credential: `ETERNAL_POSE_GOOGLE_PLACES_API_KEY`. Neither may be printed, copied, committed, or placed in an artifact.
- Use TDD for every behavior change: write one focused failing test, run it and observe the expected failure, implement the minimum behavior, rerun the target, then run the phase gate.
- Use `apply_patch` for source edits. Preserve unrelated user files and untracked artifacts. Never stage with `git add .`.
- No npm publish, marketplace default change, Git push, or Git default-branch update occurs before Plan 06 and fresh user authorization for those external mutations.
- Every task ends in a focused Conventional Commit. Before each commit run the named target tests plus `git diff --check`; before a phase is called complete use `superpowers:verification-before-completion`.

---

## Stable Cross-Plan Interface Ledger

Later plans consume these exact public names. A change requires updating every later plan before implementation proceeds.

### `@laugh-tale-island/core`

```ts
export type RouteMode = "walking" | "transit" | "driving" | "flight" | "unknown";
export type TimelineRole = "primary" | "base" | "journey" | "connector" | "task" | "logistics-group";
export type MarkerMode = "numbered" | "base" | "none";
export type ProviderFailureReason =
  | "missing-configuration"
  | "loader-failed"
  | "request-denied"
  | "not-found"
  | "malformed-response"
  | "implausible-result"
  | "network"
  | "cancelled"
  | "unsupported";

export interface TripNavigationState {
  surface: "home" | "experience";
  dayId: string | null;
  ownerId: string | null;
}

export interface TripNavigationStore {
  read(): TripNavigationState;
  write(next: TripNavigationState): void;
  subscribe(listener: () => void): () => void;
}

export type CameraTransition = "animate" | "immediate";
export type CameraIntent = FitCameraIntent | FocusCameraIntent | RecenterUserCameraIntent;
```

The complete types live in the phase plans, but names in this ledger do not drift.

### `@laugh-tale-island/core/browser`

```ts
export interface MapAdapterV2 {
  mount(element: HTMLElement, config: MapMountConfig): Promise<void>;
  render(presentation: MapPresentationV2): void;
  applyCameraIntent(intent: CameraIntent): void;
  getCameraSnapshot(): CameraSnapshot | null;
  setUserLocation(location: Coordinates | null): void;
  destroy(): void;
}

export interface RouteAdapterV2 {
  load(request: RouteRequestV2, signal: AbortSignal): Promise<RouteProviderResult>;
}

export interface PlaceAdapterV2 {
  load(request: PlaceRequestV2, signal: AbortSignal): Promise<PlaceProviderResult>;
}

export type NavigationRequestV2 =
  | { readonly kind: "place"; readonly destination: NavigationTargetV2 }
  | {
      readonly kind: "route";
      readonly origin: NavigationTargetV2;
      readonly destination: NavigationTargetV2;
      readonly travelMode: "walking" | "driving" | "transit";
    }
  | {
      readonly kind: "authored-external";
      readonly origin: string;
      readonly destination: string;
      readonly travelMode?: "walking" | "driving" | "transit";
    };

export interface NavigationAdapterV2 {
  readonly supportedPlaceProviders: readonly string[];
  open(request: NavigationRequestV2): boolean;
}
```

### `@laugh-tale-island/react`

```ts
export interface TripPresentationV2 {
  Home: React.ComponentType<HomeViewProps>;
  Experience: React.ComponentType<ExperienceViewProps>;
  SetupRequired: React.ComponentType<SetupRequiredViewProps>;
  Loading: React.ComponentType<LoadingViewProps>;
  FatalError: React.ComponentType<FatalErrorViewProps>;
  mapVisualProfile: MapVisualProfile;
  createMarkerContent: MarkerContentFactory;
  createUserLocationContent: UserLocationContentFactory;
}

export interface TripRuntimeAdapters {
  createMap?(): MapAdapterV2;
  createRoutes?(): RouteAdapterV2;
  createPlaces?(): PlaceAdapterV2;
  navigation?: NavigationAdapterV2;
}

export interface ProviderBootstrapState {
  map?: ProviderUnavailableResult;
  routes?: ProviderUnavailableResult;
  places?: ProviderUnavailableResult;
}

export function TripController(props: TripControllerProps): React.ReactElement;
export function useTripExperience(input: UseTripExperienceInput): TripExperienceController;
```

`TimelineNodeFactsModel` is the exact recursively readonly discriminated union frozen in Plan 03; every projected node carries it, including ordered checklist/shopping state. `ExperienceModel.itinerary` owns `primaryCount`, `collapsedOwnerId`, and `focusFallback`, and `owners.selectedId` is distinct from manual `viewingId`. Presentations render those policies and never derive them.

### Canonical presentation

```ts
// plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.ts
export const presentation: TripPresentationV2;
export { locale, catalog } from "./copy/catalog.js";
export const documentMetadataCopy: {
  readonly productName: string;
  readonly setupTitle: string;
  readonly setupDescription: string;
};
export { oakWashiMapVisualProfile } from "./map/oak-washi-map-profile.js";
export { createOakWashiMarkerContent } from "./map/create-oak-washi-marker-content.js";
export { createOakWashiUserLocationContent } from "./map/create-oak-washi-user-location-content.js";
```

### Eternal Pose commands

```text
Usage: node create-trip-project.mjs --target /absolute/output/my-trip [--recipe oak-washi] (--trip /absolute/input.json | --setup-locale zh-Hant-TW) [--copy-catalog /absolute/catalog.json] [--resolutions /absolute/place-resolutions.json]
enrich-trip-project.mjs search --project <absolute-path> --review <file>
enrich-trip-project.mjs accept --project <absolute-path> --review <file> --selection <file>
validate-trip-project.mjs <absolute-path> --mode local|candidate|registry
verify-trip-project.mjs <absolute-path> --mode local|candidate|registry
upgrade-trip-project.mjs <absolute-path> --packages-version <exact-2.x>
```

Clean Create is dependency-free: its plugin-local portable enrichment contract and Node-readable `copy/{catalog-schema,en,zh-Hant}.json` inputs are executable without repository or package `node_modules`. Installed Enrich must first prove that portable behavior matches `@laugh-tale-island/core/enrichment`. Generated output contains only the selected materialized `copy/catalog.ts` plus shared typed presentation source; whole starter/Tokyo replacement uses the journaled `replaceOwnedDirectoryAtomically` primitive and retains the complete prior directory at an explicit backup path.

---

## Ordered Phase Plans

| Order | Plan | Independent deliverable | Entry gate |
| --- | --- | --- | --- |
| 01 | `2026-09-04-eternal-pose-v2-01-domain-adapters.md` | Truthful v2 domain, Google browser/Node adapters, package DAG, deterministic testing primitives | Design commit present |
| 02 | `2026-09-04-eternal-pose-v2-02-choreography-camera.md` | Benchmark sheet/header/camera behavior driven by neutral intents | Plan 01 phase gate green |
| 03 | `2026-09-04-eternal-pose-v2-03-presentation-seam.md` | Packaged `TripController` and `TripPresentationV2`, current starter running only through the seam | Plan 02 phase gate green |
| 04 | `2026-09-04-eternal-pose-v2-04-oak-washi.md` | Canonical Oak & Washi Home/Experience/states, markers, CSS, and reviewed deterministic goldens | Plan 03 seam frozen |
| 05 | `2026-09-04-eternal-pose-v2-05-generator-flagship.md` | Omitted-recipe Create, atomic Enrich/upgrade, schema-v2 manifests, generated starter and exact Tokyo flagship | Plan 04 visual approval |
| 06 | `2026-09-04-eternal-pose-v2-06-hardening-release.md` | 71-row parity closure, artifact/marketplace smokes, physical sign-off, candidate release, promotion and rollback | Plans 01–05 green |

Phase order is mandatory. A later phase may add a failing contract test early, but it may not ship implementation or freeze an upstream interface before the prior phase gate passes.

## Requirement Ownership Matrix

Every normative design section has one closing phase. Earlier phases may establish prerequisites, but the closing phase owns the executable proof and may not mark the requirement as deferred.

| Design section | Prerequisite phase(s) | Closing plan and proof |
| --- | --- | --- |
| Product decision, compatibility, goals, non-goals | Roadmap | Plan 05 rejects 1.0/retired recipes and emits only Oak; Plan 06 artifact inventory proves the clean 2.0 train |
| Architecture approaches, dependency ownership | 01, 02 | Plan 03 package-boundary scan plus alternate presentation |
| Core package | — | Plan 01 unit, conformance, and public-export gates |
| React package | 01 | Plans 02–03 strict-mode lifecycle, contract, boundary, and clean-consumer gates |
| Adapters package and Node enrichment subpath | — | Plan 01 browser/Node conformance, credential separation, and artifact import gates |
| Testing package | 01 | Plan 03 alternate-presentation driver; Plan 04 provider-neutral Oak fixture catalog/injected harness; Plan 06 complete catalog evidence |
| Generated project and canonical repository invariants | 03, 04 | Plan 05 byte inventory and allowed-difference hash gate |
| Map rendering boundary | 01 | Plan 02 camera intent translation; Plan 04 identical marker-DOM backend fixture |
| Presentation contract and runtime data flow | 01, 02 | Plan 03 frozen public API and external clean-consumer compile |
| Locale and authored content | 01 | Plan 03 identical app-local document metadata synchronization from Trip/setup locale; Plan 04 complete `en`/`zh-Hant` catalogs, missing-key validation, and no-device-locale assertions |
| Error and degraded-state design | 01, 03 | Plan 04 deterministic setup/loading/fatal/degraded fixtures |
| Oak & Washi design system | 02, 03 | Plan 04 exact geometry, token, component, accessibility, and reviewed-golden gates |
| Generation and enrichment workflow | 01, 04 | Plan 05 crash-recoverable journal, concurrent-reader refusal, transaction fault matrix, schema-v2 validation, provenance, and pin-only upgrade |
| Verification and release acceptance | 01–05 | Plan 06 atomic 71-row report and phase-selectable status validator |
| P0 release gates | 01–05 | Plan 06 local, registry-candidate, and postpromotion command suites |
| Deterministic visual fixtures | 02–04 | Plan 06 full catalog run, axe/contrast/target assertions, and golden inventory |
| Manual side-by-side sign-off | 04, 05 | Plan 06 physical-iPhone F1–F8, V1–V5, M1–M5 record and product-owner approval |
| Provider and release evidence | 01, 05 | Plan 06 sanitized live replay, immutable attestation, detached dual-host install, staged promotion, and forward rollback |
| Final polish | 04 | Plan 06 finding ledger: every P0 verified and every accepted post-v2 disposition explicitly non-P0 |
| Risks, superseded directions, completion condition | all | Plan 06 hard-code scans, artifact hashes, exact default-pointer verification, and final completion gate |

Before a phase closes, compare its implementation and evidence back to this table and the full prose requirement—not only to its abbreviated task title.

---

### Task 1: Create the isolated execution worktree and capture the baseline

**Files:**
- Read: `docs/superpowers/specs/2026-09-04-eternal-pose-v2-oak-washi-flagship-design.md`
- Read: all six phase plans listed above
- Create locally: `.worktrees/<execution-name>/` through `superpowers:using-git-worktrees`

**Interfaces:**
- Consumes: design commit `5a453e1` and the current feature branch.
- Produces: an isolated clean execution checkout and a recorded pre-change verification result.

- [ ] **Step 1: Invoke the worktree skill**

Use `superpowers:using-git-worktrees` and create a `codex/eternal-pose-v2-oak-washi` execution branch from the approved feature-branch HEAD. Do not reuse an unverified pre-existing worktree.

- [ ] **Step 2: Verify the design and all plans exist in the worktree**

```bash
git log -1 --oneline
test -f docs/superpowers/specs/2026-09-04-eternal-pose-v2-oak-washi-flagship-design.md
for phase in 01-domain-adapters 02-choreography-camera 03-presentation-seam 04-oak-washi 05-generator-flagship 06-hardening-release; do
  test -f "docs/superpowers/plans/2026-09-04-eternal-pose-v2-${phase}.md"
done
```

Expected: HEAD contains or descends from `5a453e1`; every `test -f` exits 0.

- [ ] **Step 3: Install with the supported toolchain**

```bash
node --version
npm --version
npm ci
```

Expected: Node is at least 22.13, npm major is 11, and `npm ci` exits 0.

- [ ] **Step 4: Record the fresh baseline gate**

```bash
npm run check
npm run stage:starter
npm run test:starter:staged
npm run test:e2e:staged
npm --prefix examples/tokyo run check
npm --prefix examples/tokyo run test:e2e
```

Expected: all commands exit 0 before v2 implementation. If one fails, record the exact existing failure and stop rather than folding an unrelated repair into Phase 01.

### Task 2: Execute Plans 01–05 with a reviewer gate after every task

**Files:**
- Modify: files enumerated by each phase plan
- Update during execution: the checkboxes in the active phase plan

**Interfaces:**
- Consumes: each preceding phase's named exports and green phase gate.
- Produces: five sequentially integrated, independently reviewable software increments.

- [ ] **Step 1: Select the execution workflow**

Use `superpowers:subagent-driven-development` for fresh task workers and two-stage review, or `superpowers:executing-plans` for inline batches. Do not mix workflows inside a task.

- [ ] **Step 2: Execute each phase task-by-task**

For each task, run its red test, confirm the named failure, implement only that task, run its green tests, request review, then commit with the exact message in the plan.

- [ ] **Step 3: Run the phase gate before advancing**

Use the phase's final command block. Update its completion evidence with command, date, commit, and pass/fail result. Do not begin the next phase while any required gate is red.

### Task 3: Execute Plan 06 and close the milestone

**Files:**
- Modify: release, CI, marketplace, evidence, and report paths enumerated in Plan 06
- Create: `docs/audits/2026-09-eternal-pose-v2-oak-washi-parity.md`
- Create: `docs/theme-reviews/oak-washi/**`

**Interfaces:**
- Consumes: the clean, reviewed Phase 05 product commit; Plan 06 alone builds and attests immutable candidate artifacts from that commit.
- Produces: verified registry artifacts, identical Claude/Codex plugin defaults, rollback evidence, and a 71-row-complete parity report.

- [ ] **Step 1: Build once, attest, then complete all local and manual prepublication gates**

Run Plan 06 Tasks 1–7 completely in their written order: close deterministic and sanitized live-provider evidence, finish every release executable, build the candidate exactly once from that clean reviewed product/tooling commit, attest the immutable source/artifacts, run local installs only from that attestation, then perform physical-iPhone and product-owner approval against that exact installed candidate. Import only the sanitized local/physical receipt on an evidence-only descendant and pass the prepublication gate. Never build after sign-off or sign off an unattested tree. Stop before external publication if any required prepublication P0 row is not `verified` or any protected tree differs from the attestation.

- [ ] **Step 2: Request fresh publication authorization**

Present the exact Task 7 authorization packet: package versions/files/sizes/SHA-256/integrities, plugin archive hash, attested Git/root/plugin trees, evidence commit, candidate ref, prior npm `latest` versions, and prior `origin/main` commit/plugin tree/version. Publication does not proceed on implied approval.

- [ ] **Step 3: Run candidate, promotion, and postpromotion tasks without rebuilding**

Execute the exact Plan 06 commands against the recorded artifacts. On any failure, run the documented forward rollback and verify both marketplace defaults plus all four npm tags.

- [ ] **Step 4: Verify completion**

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

Expected: all commands exit 0 and every P0 parity row is `verified`; the physical sign-off record names both commits, flags, device, OS, package versions, and plugin hash.
