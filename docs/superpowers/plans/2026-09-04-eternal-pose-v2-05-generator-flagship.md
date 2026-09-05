# Eternal Pose v2 Phase 05 Generator and Flagship Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an omitted-recipe Eternal Pose Create produce a schema-v2 Oak & Washi project, add deterministic and atomic Enrich/Validate/Verify/Upgrade commands, and generate the canonical Tokyo flagship with its reviewed 89-resolved/one-unresolved place ledger and no hand repair.

**Architecture:** The plugin owns small Node-only workflow modules: canonical JSON and provenance validation, transaction-safe file publication, and thin command entrypoints. A generated project keeps authored trip input and accepted place resolutions as separate canonical files; `eternal-pose.json` binds those bytes to the exact recipe, presentation contract, generator, and four-package release. Oak & Washi remains the only public recipe, the starter is the generated zero-content case, and Tokyo is regenerated from committed release input through the same command.

**Tech Stack:** Node.js 22.13+, npm 11, ECMAScript modules, TypeScript 5.9, React 19.2, Vitest 4, Playwright 1.62, Vite 8, RFC 8785 canonical JSON, SHA-256, Google Places API (New) through `@laugh-tale-island/adapters/google/node`.

**Spec:** `docs/superpowers/specs/2026-09-04-eternal-pose-v2-oak-washi-flagship-design.md`

## Global Constraints

- Enter only after Plans 01–04 are green and the product owner has approved the canonical Oak & Washi presentation.
- Execute in the isolated v2 worktree created by `superpowers:using-git-worktrees`; read the root `CLAUDE.md`, this plan, the design spec, and both generated-project instruction files before editing.
- Package, plugin, recipe source, generator, and generated-project package version is exactly `2.0.0` for this milestone.
- `@laugh-tale-island/core`, `react`, `adapters`, and `testing` are one exact-version train. Generated production dependencies are core/react/adapters; testing is an exact dev dependency.
- The package DAG is core → react/adapters → testing. Do not add a package edge in the opposite direction.
- `plugins/eternal-pose/recipes-v2/oak-washi/presentation/` is the only canonical visible source. Never repair the starter or Tokyo presentation independently.
- Generated projects contain one locale catalog: Create reads the canonical Node-readable catalog JSON/schema, deterministically materializes `src/presentation/copy/catalog.ts`, and never copies the reference catalogs or generator-only schema/resolver.
- Only `oak-washi` is selectable. The omitted `--recipe` value means `oak-washi`; the four 1.0 recipes do not remain as aliases.
- The generated project owns exactly `src/app/`, `src/presentation/`, and `src/trip-content/`; provider implementation code must not be copied into it.
- Create, Enrich search, Enrich accept, and Upgrade each have their own filesystem transaction. A failed command or process interruption restores every pre-existing byte or durably finalizes the complete new generation and leaves no accepted partial provenance. Every project reader uses the journal-aware stable-read seam and refuses an in-flight generation.
- Validate and Verify are read-only with respect to project source. Verify directs build output and caches to an owned temporary directory and removes only identity-verified owned files.
- The accepted ledger is `src/trip-content/place-resolutions.json`. It is the sole SHA-256 provenance preimage and has no self-hash.
- Enrich search reads only `ETERNAL_POSE_GOOGLE_PLACES_API_KEY`; the browser continues to read only `VITE_GOOGLE_MAPS_API_KEY`. Neither credential may enter stdout, stderr, source, review output, snapshots, or fixtures.
- CI replays committed place and provider results. It never calls Google.
- The Tokyo release fixture remains six days, 100 nodes, 94 edges, 89 resolved place owners, and one unresolved place owner (`place:pelican-cafe`); D3-2 and D3-3 retain route mode `unknown`.
- Phase 05 does not create a release-acceptance or parity ledger. Phase 06 must map the 71 rows directly from `docs/audits/2026-09-tokyo-baseline-parity.md`; the place-resolution ledger in this plan is provider provenance only.
- Use one red test, one minimal green implementation, the named broader gate, and one focused Conventional Commit per task. Never stage with `git add .`.
- Do not publish npm packages, push a candidate ref, change either marketplace default, or update `origin/main` in this phase.

---

## File Structure and Ownership

### New production files

- `plugins/eternal-pose/lib/canonical-json.mjs` — RFC 8785 serialization, JSON-domain rejection, and SHA-256 helpers.
- `plugins/eternal-pose/lib/portable-enrichment-contract.mjs` — dependency-free Create-side normalization/provenance validation with executable conformance against the installed core enrichment subpath.
- `plugins/eternal-pose/lib/trip-project-input-v2.mjs` — exact Create input envelope and stable place-owner/binding validation; generated runtime composition remains app-local.
- `plugins/eternal-pose/lib/place-resolution-ledger.mjs` — review, selection, and accepted-ledger schemas plus canonical ordering.
- `plugins/eternal-pose/lib/project-manifest-v2.mjs` — parse/build/compare `eternal-pose.json` and its four exact package pins.
- `plugins/eternal-pose/lib/atomic-publication.mjs` — owned temporary files, fsync, rename, rollback, and fault-injection hooks for directory and file-set transactions.
- `plugins/eternal-pose/scripts/enrich-trip-project.mjs` — `search` and `accept` CLI entrypoint.
- `plugins/eternal-pose/scripts/verify-trip-project.mjs` — isolated executable checks; no structural validation logic duplicated from Validate.
- `plugins/eternal-pose/scripts/upgrade-trip-project.mjs` — same-major, pin-only, three-file project upgrade.
- `scripts/build-tokyo-release-input.mjs` — deterministic conversion of the recorded authored Tokyo itinerary to `TripProjectInputV2`.
- `scripts/build-tokyo-place-selection.mjs` — exact prior-Place-ID to fresh-review selection conversion for one reviewed Tokyo cutover.
- `scripts/write-registry-lockfile.mjs` — derive a registry-shaped generated-project lockfile from four locally packed, hashed candidates without requiring unpublished `2.0.0` packages from npm.
- `examples/tokyo-input/tokyo-itinerary.json` — the recorded authored itinerary moved out of generated output.
- `examples/tokyo-input/trip-input.json` — canonical v2 Create input generated from the recorded itinerary.
- `examples/tokyo-input/place-resolutions.json` — accepted Google resolution ledger produced by Enrich accept.
- `plugins/eternal-pose/starter/react/src/trip-content/materialize-trip.ts` — generated-project-local pure composition of validated Trip input plus the accepted ledger.

### Existing production files to modify

- `plugins/eternal-pose/lib/recipe-v2.mjs` — public catalog restriction and Oak & Washi-only screenshot declarations.
- `plugins/eternal-pose/lib/path-safety.mjs` — reusable canonical parent and non-symlink checks consumed by atomic publication.
- `plugins/eternal-pose/scripts/create-trip-project.mjs` — optional recipe, Trip input, accepted ledger, v2 manifest, and final rename.
- `plugins/eternal-pose/scripts/validate-trip-project.mjs` — static schema-v2 validation and package-mode truth; execution moves to Verify.
- `plugins/eternal-pose/starter/react/package.json` and `package-lock.json` — exact four-package dependency placement and explicit verification scripts.
- `plugins/eternal-pose/starter/react/.gitignore` — ignore local Enrich review and selection files.
- `plugins/eternal-pose/starter/react/src/trip-content/trip.ts` — materialize the authored input with the accepted ledger through the generated-project helper.
- `plugins/eternal-pose/starter/react/src/trip-content/validation-entry.ts` — export readiness without reading credentials.
- `scripts/stage-starter-consumer.mjs` — pack exactly four workspaces in dependency order and rewrite production and dev dependency pins to attested tarballs.
- `package.json` — focused Phase 05 test/generation commands.
- `plugins/eternal-pose/.claude-plugin/plugin.json`, `plugins/eternal-pose/.codex-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `.agents/plugins/marketplace.json` — one local Git-backed `2.0.0` plugin identity; remote ref publication remains Phase 06.
- `examples/tokyo/**` — regenerated output only; no hand edits.
- `plugins/eternal-pose/README.md`, `plugins/eternal-pose/skills/eternal-pose/SKILL.md`, and `plugins/eternal-pose/skills/eternal-pose/references/{workflow,packages,provider-boundaries,design-recipes,testing}.md` — exact deterministic command routing and v2 package/default facts.

### Retired files to delete at the Oak & Washi cutover

- `plugins/eternal-pose/recipes/` — Quiet Wood, Sticker Brutalist, and Native Minimal v1 source.
- `plugins/eternal-pose/recipes-v2/field-atlas/` — the internal 1.0 authored-world experiment.
- `tests/generation/field-atlas.test.ts` and `tests/generation/recipes.test.ts` — assertions for retired catalogs.
- `scripts/test-internal-recipe.mjs` and `tests/scripts/test-internal-recipe.test.ts` — the retired multi-recipe harness.
- `examples/tokyo/scripts/resolve-places.mjs` and `examples/tokyo/scripts/oracle-check.mjs` — one-off baseline tools replaced by the plugin workflow and committed release-input tests.
- `examples/tokyo/src/trip-content/resolved-places.json`, `source/types.ts`, `source/tokyo-itinerary.json`, `tokyo-trip.ts`, and `tokyo-trip.test.ts` — title-keyed 1.0 resolution and handwritten Tokyo composition.
- `examples/tokyo/vendor/` — 1.0 development tarballs and their obsolete provenance note.

### New and modified tests

- Create `tests/generation/project-manifest-v2.test.ts`.
- Create `tests/generation/portable-enrichment-contract.test.ts`.
- Create `tests/scripts/atomic-publication.test.ts`.
- Create `tests/scripts/enrich-trip-project.test.ts`.
- Create `tests/scripts/verify-trip-project.test.ts`.
- Create `tests/scripts/upgrade-trip-project.test.ts`.
- Create `tests/examples/tokyo-content-integrity.test.ts`.
- Create `tests/scripts/write-registry-lockfile.test.ts`.
- Create `tests/scripts/build-tokyo-place-selection.test.ts`.
- Create `plugins/eternal-pose/starter/react/src/trip-content/materialize-trip.test.ts`.
- Create `plugins/eternal-pose/starter/react/src/app/generated-experience.contract.test.tsx` and `generated-accessibility.contract.test.tsx`.
- Modify `tests/generation/recipe-v2.test.ts`, `create-real-starter.test.ts`, and `generated-project.test.ts`.
- Modify `tests/scripts/create-trip-project.test.ts`, `stage-starter-consumer.test.ts`, and `stage-starter-consumer-concurrency.test.ts`.
- Modify `tests/packages/artifacts.test.ts`, `clean-consumer.test.ts`, `tests/examples/tokyo-provenance.test.ts`, and `tests/plugin/{manifests,marketplace,validator,skill-contract}.test.ts` only for Phase 05 local integration assertions; Plan 06 owns remote artifact and marketplace release gates.

---

## Stable Phase 05 Interfaces

The implementation uses these exact names and shapes. If a Plan 01 export differs, update both phase plans before changing code.

```ts
import type { Coordinates, ProviderReference, Trip } from "@laugh-tale-island/core";
import type {
  PlaceResolutionProvenance,
  PlaceSearchQuery,
} from "@laugh-tale-island/core/enrichment";

export interface TripProjectInputV2Base {
  schemaVersion: 2;
  enrichmentPolicy: null | {
    provider: "google";
    regionCode: string;
    locationBias: {
      center: { lat: number; lng: number };
      radiusMeters: number;
    };
  };
  placeOwners: Array<{
    ownerId: string;
    source: string;
    query: PlaceSearchQuery;
    bindings: Array<
      | { kind: "node"; id: string }
      | { kind: "candidate"; id: string }
    >;
  }>;
}

export type TripProjectInputV2 =
  | (TripProjectInputV2Base & {
      trip: Trip;
      setupLocale?: never;
    })
  | (Omit<TripProjectInputV2Base, "enrichmentPolicy" | "placeOwners"> & {
      trip: null;
      setupLocale: string;
      enrichmentPolicy: null;
      placeOwners: [];
    });

export type UnresolvedReason = "not-reviewed" | "no-accepted-candidate" | "ambiguous";

export interface PlaceResolutionLedgerV1 {
  schemaVersion: 1;
  provider: "google";
  entries: Array<
    | {
        ownerId: string;
        status: "resolved";
        source: string;
        query: PlaceSearchQuery;
        provider: "google";
        accepted: {
          providerReference: ProviderReference & { provider: "google" };
          displayName: string;
          formattedAddress: string;
          coordinates: Coordinates;
          categories: string[];
        };
        observedAt: string;
      }
    | {
        ownerId: string;
        status: "unresolved";
        source: string;
        query: PlaceSearchQuery;
        reason: UnresolvedReason;
        observedAt?: string;
      }
  >;
}

export interface TripProjectManifestV2 {
  schemaVersion: 2;
  generatorVersion: string;
  lastUpgradeToolVersion?: string;
  recipe: { id: "oak-washi"; sourceVersion: string };
  presentationContractVersion: 2;
  packages: {
    "@laugh-tale-island/core": string;
    "@laugh-tale-island/react": string;
    "@laugh-tale-island/adapters": string;
    "@laugh-tale-island/testing": string;
  };
  enrichment: { schemaVersion: 1; provenanceHash: string };
}
```

Generated locale and trip-content paths are fixed:

```text
src/presentation/copy/catalog.ts
src/trip-content/trip-input.json
src/trip-content/place-resolutions.json
src/trip-content/materialize-trip.ts
src/trip-content/trip.ts
src/trip-content/validation-entry.ts
```

Phase 05 keeps every roadmap command and makes locale/catalog authorship explicit with the following exact Create syntax:

```text
create-trip-project.mjs --target /absolute/path [--recipe oak-washi] (--trip /absolute/input.json | --setup-locale zh-Hant-TW) [--copy-catalog /absolute/catalog.json] [--resolutions /absolute/place-resolutions.json]
enrich-trip-project.mjs search --project /absolute/path --review /absolute/review.json
enrich-trip-project.mjs accept --project /absolute/path --review /absolute/review.json --selection /absolute/selection.json
validate-trip-project.mjs /absolute/path --mode local|candidate|registry
verify-trip-project.mjs /absolute/path --mode local|candidate|registry
upgrade-trip-project.mjs /absolute/path --packages-version 2.0.0
```

---

### Task 1: Canonical provenance, Trip input, ledger, and project manifest

**Files:**
- Create: `plugins/eternal-pose/lib/canonical-json.mjs`
- Create: `plugins/eternal-pose/lib/portable-enrichment-contract.mjs`
- Create: `plugins/eternal-pose/lib/trip-project-input-v2.mjs`
- Create: `plugins/eternal-pose/lib/place-resolution-ledger.mjs`
- Create: `plugins/eternal-pose/lib/project-manifest-v2.mjs`
- Create: `tests/generation/project-manifest-v2.test.ts`
- Create: `tests/generation/portable-enrichment-contract.test.ts`

**Interfaces:**
- Consumes: the v2 `Trip` JSON shape plus the frozen Plan 01 `PlaceSearchQuery`/provenance behavior as a conformance target; the clean plugin Create path has no runtime import from a workspace or installed package; exact version `2.0.0`.
- Produces:

```ts
// canonical-json.mjs
export declare function canonicalizeJson(value: unknown): string;
export declare function sha256CanonicalJson(value: unknown): string;

// portable-enrichment-contract.mjs
export declare function createPortablePlaceSearchQuery(input: {
  ownerId: string;
  text: string;
  locale: string;
  regionCode?: string;
  locationBias?: { center: Coordinates; radiusMeters: number };
}): PlaceSearchQuery;
export declare function createPortablePlaceResolutionProvenance(input: {
  ownerId: string;
  source: string;
  query: PlaceSearchQuery;
  provider: string;
  observedAt: string;
}): PlaceResolutionProvenance;
export declare function assertPortableEnrichmentConformance(core: {
  createPlaceSearchQuery: typeof import("@laugh-tale-island/core/enrichment").createPlaceSearchQuery;
  createPlaceResolutionProvenance: typeof import("@laugh-tale-island/core/enrichment").createPlaceResolutionProvenance;
}): void;

// trip-project-input-v2.mjs
export declare function parseTripProjectInputV2(value: unknown): TripProjectInputV2;
export declare function emptyTripProjectInputV2(setupLocale: string): TripProjectInputV2;

// place-resolution-ledger.mjs
export const PLACE_RESOLUTION_SCHEMA_VERSION = 1;
export declare function unresolvedLedgerForInput(
  input: TripProjectInputV2,
): PlaceResolutionLedgerV1;
export declare function parsePlaceResolutionLedger(
  value: unknown,
  input: TripProjectInputV2,
): PlaceResolutionLedgerV1;

// project-manifest-v2.mjs
export const PROJECT_SCHEMA_VERSION = 2;
export const PRESENTATION_CONTRACT_VERSION = 2;
export const ETERNAL_POSE_PACKAGE_NAMES = Object.freeze([
  "@laugh-tale-island/core",
  "@laugh-tale-island/react",
  "@laugh-tale-island/adapters",
  "@laugh-tale-island/testing",
]);
export interface BuildTripProjectManifestInput {
  generatorVersion: string;
  recipeId: "oak-washi";
  recipeSourceVersion: string;
  packageVersion: string;
  ledger: PlaceResolutionLedgerV1;
  lastUpgradeToolVersion?: string;
}
export declare function buildTripProjectManifest(
  input: BuildTripProjectManifestInput,
): TripProjectManifestV2;
export declare function parseTripProjectManifest(value: unknown): TripProjectManifestV2;
export declare function assertManifestMatchesLedger(
  manifest: TripProjectManifestV2,
  ledger: PlaceResolutionLedgerV1,
): void;
```

- [ ] **Step 1: Write the failing canonicalization and schema tests**

Add exact assertions for key ordering, unsupported JSON values, unique/sorted owner coverage, resolved and unresolved entry shapes, normalized query preservation, and manifest hash binding:

```ts
test("canonicalizes RFC 8785 object ordering and hashes the exact UTF-8 bytes", () => {
  const value = { b: 1, a: { ä: 2, z: 0 } };
  const canonical = canonicalizeJson(value);
  expect(canonical).toBe('{"a":{"z":0,"ä":2},"b":1}');
  expect(sha256CanonicalJson(value)).toBe(
    "af1a89113302e7873026847d481778d8b03c40d5b59fe70d1eb027dac6bb47d5",
  );
});

test.each([NaN, Infinity, -Infinity, undefined, 1n])(
  "rejects non-JSON provenance value %s",
  (value) => expect(() => canonicalizeJson({ value })).toThrow(/JSON domain/),
);

test("requires one sorted ledger entry for every stable place owner", () => {
  const input = parseTripProjectInputV2(completeInputFixture());
  expect(() => parsePlaceResolutionLedger(ledgerMissingOneOwner(), input)).toThrow(
    /owner coverage/,
  );
  expect(() => parsePlaceResolutionLedger(ledgerWithExtraOwner(), input)).toThrow(
    /owner coverage/,
  );
});

test("has one locale truth for Trip input and an explicit setup locale only without Trip", () => {
  expect(parseTripProjectInputV2(completeInputFixture()).trip?.locale).toBe("en");
  expect(() => parseTripProjectInputV2({ ...completeInputFixture(), locale: "zh-Hant-TW" })).toThrow(
    /unknown field locale/,
  );
  expect(() => parseTripProjectInputV2({ ...completeInputFixture(), setupLocale: "en" })).toThrow(
    /setupLocale.*trip is null/,
  );
  expect(emptyTripProjectInputV2("zh-Hant-TW")).toEqual({
    schemaVersion: 2,
    trip: null,
    setupLocale: "zh-Hant-TW",
    enrichmentPolicy: null,
    placeOwners: [],
  });
});

test("binds the v2 manifest to the entire canonical ledger and all four versions", () => {
  const input = parseTripProjectInputV2(completeInputFixture());
  const ledger = parsePlaceResolutionLedger(completeLedgerFixture(), input);
  const manifest = buildTripProjectManifest({
    generatorVersion: "2.0.0",
    recipeId: "oak-washi",
    recipeSourceVersion: "2.0.0",
    packageVersion: "2.0.0",
    ledger,
  });
  expect(manifest).toEqual({
    schemaVersion: 2,
    generatorVersion: "2.0.0",
    recipe: { id: "oak-washi", sourceVersion: "2.0.0" },
    presentationContractVersion: 2,
    packages: {
      "@laugh-tale-island/core": "2.0.0",
      "@laugh-tale-island/react": "2.0.0",
      "@laugh-tale-island/adapters": "2.0.0",
      "@laugh-tale-island/testing": "2.0.0",
    },
    enrichment: { schemaVersion: 1, provenanceHash: sha256CanonicalJson(ledger) },
  });
});
```

For both resolved and unresolved entries, require `query` to be the complete Phase 01 `PlaceSearchQuery`: owner ID, text, canonical Trip locale, optional region code, optional location bias, and literal `maxCandidates: 3`. Clean Create and dependency-free Accept construct/validate it only with `createPortablePlaceSearchQuery`; installed Enrich search uses the core export after the conformance assertion below. No ledger/review parser accepts a legacy query string. A `not-reviewed` unresolved entry omits `observedAt`; `no-accepted-candidate` and `ambiguous` entries accepted from a review require the review's valid `observedAt`. Mutate locale, region, bias center/radius, and max-candidate count one at a time and prove parsing/hash binding detects every drift.

In `portable-enrichment-contract.test.ts`, import the real Plan 01 core enrichment subpath and run a fixed named valid/invalid matrix through both implementations. Compare canonical JSON bytes for every accepted query/provenance value; for every invalid vector require both implementations to throw, keyed by the vector's stable test name rather than comparing unstable error text. Cover blank text/owner/source/provider, locale canonicalization, region normalization, absent/present bias, coordinate/radius boundaries, exact canonical `YYYY-MM-DDTHH:mm:ss.sssZ`, offsets, missing/extra fractional precision, extended years, and invalid calendar/time spellings; every accepted query must contain literal output `maxCandidates: 3`. The portable timestamp validator uses an exact ASCII pattern plus `new Date(value).toISOString() === value`, while core's Temporal round-trip is the authority; neither accepts a wider form. Also copy only `plugins/eternal-pose` into an empty temporary home with no repository `node_modules`, execute Create for a no-Trip `zh-Hant-TW` project, and assert it succeeds without resolving any `@laugh-tale-island/*` package. A reachable-import scan must prove the portable module imports only Node built-ins and other plugin-local `.mjs` files.

Define `completeInputFixture`, `completeLedgerFixture`, `ledgerMissingOneOwner`, and `ledgerWithExtraOwner` in the same test file with two place owners (`place:museum` and `place:cafe`), one resolved entry, one `no-accepted-candidate` entry, one node binding, and one candidate binding. Do not read Tokyo data in these unit tests.

- [ ] **Step 2: Run the focused test and observe the red state**

Run:

```bash
npm test -- tests/generation/project-manifest-v2.test.ts tests/generation/portable-enrichment-contract.test.ts
```

Expected: FAIL because the five modules do not exist.

- [ ] **Step 3: Implement canonical JSON and strict schema parsing**

Implement recursive RFC 8785 serialization using ECMAScript number serialization, UTF-16 property-name order, JSON string escaping, finite-number checks, plain arrays/objects only, and rejection of cycles, sparse arrays, accessors, symbols, functions, BigInt, and lone surrogate code units. Implement the portable query/provenance functions without an npm dependency, repository-relative import, source alias, generated file, or package-resolution fallback; return fresh deeply frozen values and match the Phase 01 normalization/rejection contract exactly. `assertPortableEnrichmentConformance` runs a built-in deterministic vector set and throws before provider/file mutation on the first byte or rejection-category mismatch. Canonicalize every ledger with entries sorted by `ownerId`; preserve provider candidate ranking inside each review entry; sort only candidate `categories` lexically.

Use this exact manifest hash assignment:

```js
export function buildTripProjectManifest({
  generatorVersion,
  recipeId,
  recipeSourceVersion,
  packageVersion,
  ledger,
  lastUpgradeToolVersion,
}) {
  if (recipeId !== "oak-washi") throw new Error("recipe.id must be oak-washi");
  const packages = Object.fromEntries(
    ETERNAL_POSE_PACKAGE_NAMES.map((name) => [name, exactSemver(packageVersion, `packages.${name}`)]),
  );
  return Object.freeze({
    schemaVersion: 2,
    generatorVersion: exactSemver(generatorVersion, "generatorVersion"),
    ...(lastUpgradeToolVersion === undefined
      ? {}
      : { lastUpgradeToolVersion: exactSameMajorVersion(lastUpgradeToolVersion, 2) }),
    recipe: { id: "oak-washi", sourceVersion: exactSemver(recipeSourceVersion, "recipe.sourceVersion") },
    presentationContractVersion: 2,
    packages,
    enrichment: {
      schemaVersion: 1,
      provenanceHash: sha256CanonicalJson(ledger),
    },
  });
}
```

`parseTripProjectInputV2` must reject duplicate owner IDs, duplicate bindings, missing referenced node/candidate IDs, an owner with no binding, a binding used by two owners, blank source/query values, non-two-letter region code, non-finite/out-of-range bias coordinates, radius outside 1–50000 metres, and unknown envelope fields including top-level `locale`. When `trip` is non-null, its required canonical BCP-47 `trip.locale` is the sole locale and `setupLocale` is forbidden. When `trip` is null, require a canonical BCP-47 `setupLocale`, null policy, and zero owners. Runtime Trip materialization is deliberately not a plugin-private import; Task 3 places the fixed pure implementation inside the generated-app starter rather than exporting a plugin helper.

- [ ] **Step 4: Run the focused and package boundary tests**

```bash
npm test -- tests/generation/project-manifest-v2.test.ts tests/generation/portable-enrichment-contract.test.ts packages/core/tests/boundaries.test.ts
```

Expected: PASS; isolated Create needs no installed package, portable/core enrichment results are byte-identical across the complete matrix, and the new plugin modules do not import React, DOM, CSS, Google browser SDK, or Tokyo data.

- [ ] **Step 5: Commit the pure contract**

```bash
git add plugins/eternal-pose/lib/canonical-json.mjs plugins/eternal-pose/lib/portable-enrichment-contract.mjs plugins/eternal-pose/lib/trip-project-input-v2.mjs plugins/eternal-pose/lib/place-resolution-ledger.mjs plugins/eternal-pose/lib/project-manifest-v2.mjs tests/generation/project-manifest-v2.test.ts tests/generation/portable-enrichment-contract.test.ts
git diff --cached --check
git commit -m "feat: define v2 project provenance"
```

---

### Task 2: Transaction-safe directory and file-set publication

**Files:**
- Create: `plugins/eternal-pose/lib/atomic-publication.mjs`
- Create: `tests/scripts/atomic-publication.test.ts`
- Create: `tests/fixtures/atomic-publication-crash-worker.mjs`
- Modify: `plugins/eternal-pose/lib/path-safety.mjs`

**Interfaces:**
- Consumes: `validateTargetDirectory(targetDir)` and Node `fs/promises` primitives.
- Produces:

```ts
interface AtomicPublicationTestOperations {
  beforeMutation?: (event: AtomicMutationEvent) => void | Promise<void>;
}
export declare function publishCreatedProject(
  request: {
    targetDir: string;
    populate: (stageDir: string) => Promise<void>;
    validate: (stageDir: string) => Promise<void>;
  },
  testOperations?: AtomicPublicationTestOperations,
): Promise<void>;

export declare function writeArtifactAtomically(
  request: {
    destination: string;
    contents: string | Uint8Array;
    mode: number;
    expectedDestinationSha256?: string | null;
  },
  testOperations?: AtomicPublicationTestOperations,
): Promise<void>;

export declare function replaceProjectFiles(
  request: {
    projectDir: string;
    replacements: ReadonlyMap<string, string | Uint8Array>;
    validate: (stageView: string) => Promise<void>;
    allowedPaths: ReadonlySet<string>;
  },
  testOperations?: AtomicPublicationTestOperations,
): Promise<void>;

export declare function replaceOwnedDirectoryAtomically(
  request: {
    targetDir: string;
    candidateDir: string;
    backupDir: string;
    validateExisting: (targetDir: string) => Promise<void>;
    validateCandidate: (candidateDir: string) => Promise<void>;
    validateInstalled: (targetDir: string) => Promise<void>;
  },
  testOperations?: AtomicPublicationTestOperations,
): Promise<{ backupDir: string }>;

export declare function recoverProjectFileTransaction(
  projectDir: string,
): Promise<"clean" | "rolled-back" | "finalized">;

export declare function readProjectFileSet(
  request: {
    projectDir: string;
    paths: readonly string[];
  },
): Promise<ReadonlyMap<string, Uint8Array>>;

export declare function hashProjectFiles(
  projectDir: string,
  excludedTopLevelNames: ReadonlySet<string>,
): Promise<ReadonlyMap<string, string>>;
```

`testOperations.beforeMutation` receives this exact event:

```ts
interface AtomicMutationEvent {
  phase:
    | "stage-create"
    | "stage-populate"
    | "stage-write"
    | "stage-fsync"
    | "stage-validate"
    | "target-reserve"
    | "target-rename"
    | "directory-backup"
    | "directory-install"
    | "file-backup"
    | "file-rename"
    | "file-set-validate"
    | "journal-prepare"
    | "journal-commit"
    | "journal-recover"
    | "directory-fsync"
    | "rollback"
    | "cleanup";
  path: string;
  transactionId: string;
}
```

- [ ] **Step 1: Write the failing fault-injection matrix**

Create a temporary parent for every case and inject exactly one failure per mutation phase:

```ts
test.each([
  "stage-create",
  "stage-populate",
  "stage-write",
  "stage-fsync",
  "stage-validate",
  "target-reserve",
  "target-rename",
  "directory-fsync",
] as const)("leaves no destination when new-project publication fails at %s", async (phase) => {
  const root = ownedTemporaryRoot();
  const targetDir = join(root, "trip");
  await expect(
    publishCreatedProject(
      {
        targetDir,
        populate: async (stage) => writeFile(join(stage, "complete.txt"), "complete\n"),
        validate: async (stage) => expect(readFileSync(join(stage, "complete.txt"), "utf8")).toBe("complete\n"),
      },
      { beforeMutation: failOnceAt(phase) },
    ),
  ).rejects.toThrow(/injected/);
  expect(existsSync(targetDir)).toBe(false);
});

test.each(["stage-write", "stage-fsync", "journal-prepare", "file-backup", "file-rename", "file-set-validate", "directory-fsync", "journal-commit"] as const)(
  "restores both project files byte-for-byte when replacement fails at %s",
  async (phase) => {
    const projectDir = projectWithFiles({ "eternal-pose.json": "old manifest\n", "src/trip-content/place-resolutions.json": "old ledger\n" });
    const before = snapshotTree(projectDir);
    await expect(replaceProjectFiles(replacementRequest(projectDir), { beforeMutation: failOnceAt(phase) })).rejects.toThrow(/injected/);
    expect(snapshotTree(projectDir)).toEqual(before);
  },
);
```

Add adversarial tests that replace a stage root, target parent, backup, transaction journal, or destination with a symlink/foreign inode immediately before mutation. The command must refuse cleanup and preserve the foreign entry. Add one file-set success test proving temp files, file backup entries, and `.laugh-tale-transaction-*` journals are absent after commit; the separate whole-directory primitive deliberately retains its caller-named recovery backup.

For `writeArtifactAtomically`, cover absent-destination creation, matching-hash replacement, wrong-hash refusal, a destination appearing or changing after the comparison, failure before/after file fsync and rename, and parent-directory fsync failure. Every observation is exactly old bytes/absence or complete new bytes; a symlink, non-regular file, foreign inode, partial stage, or stale expected hash is preserved and rejected.

Add a separate existing-directory matrix for `replaceOwnedDirectoryAtomically`. Use a target containing tracked-looking source plus an ignored-style `node_modules` tree, a complete candidate on the same device, and an absolute absent backup outside the target. Inject before/after `directory-backup`, `directory-install`, validation, and directory fsync; after recovery, the target must be the complete old or complete new tree and never a merge, while the complete old tree remains recoverable at the declared backup after success. Reject cross-device candidates, a pre-existing backup, target/candidate/backup symlinks, ancestor replacement, or identity drift. Never traverse or delete the old tree: one directory rename moves ignored residue into the backup with it.

Spawn `atomic-publication-crash-worker.mjs` as a real child process and terminate it without running `catch`/cleanup after journal prepare, after each original-to-backup rename, after each candidate-to-destination rename, after directory fsync, and after journal commit. In a new process call `recoverProjectFileTransaction`, then require either the exact complete old set (`rolled-back`) or exact complete new set (`finalized`) according to the durable journal phase; a mixed set is always an error. Also run a concurrent reader loop through `readProjectFileSet` while a writer pauses between renames. Every read must return the complete old generation, the complete new generation, or a typed `transaction-in-progress` refusal—never bytes from both generations.

- [ ] **Step 2: Run the focused test and observe the red state**

```bash
npm test -- tests/scripts/atomic-publication.test.ts
```

Expected: FAIL because `atomic-publication.mjs` does not exist.

- [ ] **Step 3: Implement ownership, fsync, commit, and rollback**

Use missing-target sibling staging for Create, exclusive `wx` writes, device/inode snapshots for every owned path, file-handle `sync()`, parent-directory `sync()`, and `rename()` only after stage validation. `writeArtifactAtomically` stages and fsyncs one complete sibling file, compare-and-swaps only when the destination is absent for `null`/omitted expectation or its regular-file SHA-256 equals the supplied expectation, then renames and fsyncs the parent; a fault leaves the complete old byte string or the complete new byte string, never a partial file. For file-set replacement, stage and validate the complete candidate view first. Then write one immutable, token-bearing `.laugh-tale-transaction-<uuid>` prepare journal containing normalized allowlisted paths, original/candidate SHA-256 values, recorded inode identities, and owned backup names; sync the journal and project directory before the first visible rename. Rename each original to its recorded backup, rename each candidate into place, sync affected directories, and validate the installed candidate set. Atomically replace/sync the journal with phase `committed` only after the entire new set is durable. Clean file backups, then remove/sync the journal as the single acceptance boundary.

For `replaceOwnedDirectoryAtomically`, require three absolute, disjoint paths on the same device: an identity-validated existing target, an identity-validated complete candidate, and an absent caller-owned backup outside both trees. Persist and fsync a directory-replacement journal in the target parent before mutation, rename the target to the exact backup, rename the candidate to the exact target, fsync both parents, and validate the installed tree before committing the journal. Caught failure and crash recovery use the recorded device/inode/tree hashes to restore the old target or finalize the complete new target. On success, leave the old directory intact at `backupDir` and return that path; the primitive never recursively removes, merges, or copies it. The caller may retain it until post-commit verification, which keeps ignored local residue recoverable without letting it block the replacement.

`recoverProjectFileTransaction` inspects only a journal and paths whose identities/hashes match that immutable record. A durable `prepared` journal restores every original in reverse order; a durable `committed` journal verifies every candidate hash and finishes cleanup without rolling back. An invalid, foreign, symlinked, multiply-present, or hash-ambiguous path stops for human repair and is never removed. The same recovery runs at the start of every writer. Caught failures use this identical recovery path rather than a separate in-memory rollback algorithm.

`readProjectFileSet` opens the project directory identity, rejects any journal, opens and hashes the requested regular files without following links, then rechecks the directory identity and journal absence before returning bytes. If a writer creates a journal during the read, discard every byte and return typed `transaction-in-progress`. Official project readers and generated project preflight scripts must use this function or an artifact-local implementation with the same tested contract; no reader may treat a set as accepted merely because individual JSON files parse.

The exported replacement guard must be literal:

```js
function assertAllowedReplacement(path, allowedPaths) {
  const normalized = path.split(sep).join("/");
  if (!allowedPaths.has(normalized)) {
    throw new Error(`transaction path is not allowlisted: ${normalized}`);
  }
  return normalized;
}
```

Never call recursive removal on a path whose parent, directory, marker, or child inventory no longer matches its recorded identity.

- [ ] **Step 4: Run atomicity and existing path-race coverage**

```bash
npm test -- tests/scripts/atomic-publication.test.ts tests/scripts/create-trip-project.test.ts tests/scripts/stage-starter-consumer-concurrency.test.ts
```

Expected: PASS; existing path-race behavior remains conservative.

- [ ] **Step 5: Commit the transaction primitive**

```bash
git add plugins/eternal-pose/lib/atomic-publication.mjs plugins/eternal-pose/lib/path-safety.mjs tests/scripts/atomic-publication.test.ts tests/fixtures/atomic-publication-crash-worker.mjs
git diff --cached --check
git commit -m "feat: add atomic project publication"
```

---

### Task 3: Prepare the four-package v2 starter and local candidate lock

**Files:**
- Modify: `plugins/eternal-pose/starter/react/package.json`
- Modify: `plugins/eternal-pose/starter/react/package-lock.json`
- Modify: `plugins/eternal-pose/starter/react/src/trip-content/trip.ts`
- Modify: `plugins/eternal-pose/starter/react/src/trip-content/validation-entry.ts`
- Create: `plugins/eternal-pose/starter/react/src/trip-content/materialize-trip.ts`
- Create: `plugins/eternal-pose/starter/react/src/trip-content/materialize-trip.test.ts`
- Create: `plugins/eternal-pose/starter/react/src/trip-content/trip-input.json`
- Create: `plugins/eternal-pose/starter/react/src/trip-content/place-resolutions.json`
- Modify: `scripts/stage-starter-consumer.mjs`
- Create: `scripts/write-registry-lockfile.mjs`
- Modify: `tests/scripts/stage-starter-consumer.test.ts`
- Modify: `tests/scripts/stage-starter-consumer-concurrency.test.ts`
- Create: `tests/scripts/write-registry-lockfile.test.ts`
- Modify: `tests/packages/artifacts.test.ts`
- Modify: `tests/packages/clean-consumer.test.ts`

**Interfaces:**
- Consumes: the four built `2.0.0` package workspaces from Plans 01–03 and Task 2 atomic writes.
- Produces:

```ts
export interface LocalPackageCandidateAttestation {
  schemaVersion: 1;
  packages: Array<{
    name:
      | "@laugh-tale-island/core"
      | "@laugh-tale-island/react"
      | "@laugh-tale-island/adapters"
      | "@laugh-tale-island/testing";
    version: "2.0.0";
    archive: string;
    bytes: number;
    sha256: string;
    integrity: string;
  }>;
}
export declare function materializeTrip(
  input: TripProjectInputV2,
  ledger: PlaceResolutionLedgerV1,
): Trip | null;
export declare function stageStarterConsumer(
  request?: { install?: boolean; outDir?: string },
  testOperations?: Readonly<Record<string, unknown>>,
): Promise<{ stagedRoot: string; tarballs: string[]; attestationPath: string }>;
export declare function writeRegistryLockfile(
  request: {
    sourceLockPath: string;
    packageJsonPath: string;
    attestationPath: string;
    destinationLockPath: string;
  },
  testOperations?: AtomicPublicationTestOperations,
): Promise<void>;
```

The generated `materialize-trip.ts` declares its minimal local structural JSON types and imports only public `@laugh-tale-island/core` types/validators. It never imports a plugin script or `plugins/eternal-pose/lib`.

- [ ] **Step 1: Write the failing four-package, materializer, and lock tests**

Replace every two-package inventory in the listed staging/artifact/consumer tests with exact order `core`, `react`, `adapters`, `testing`. Assert core/react/adapters occupy `dependencies`, testing plus exact `axe-core@4.11.0` occupy `devDependencies`, all four candidate installs are real directories, and imports from core `.`, `./browser`, `./enrichment`; React `.`; adapters `./google`, `./google/node`; and testing `.` resolve from tarballs without `packages/`, `src/`, workspace links, or repository fallback.

In `materialize-trip.test.ts`, prove that `materializeTrip` clones its arguments, preserves `trip.locale`, applies resolved coordinates/provider reference to every declared binding, replaces unresolved identities with the ledger reason, rejects owner/binding drift, and returns null only for explicit no-Trip input. Recursively scan the module and generated imports to reject `plugins/`, `scripts/`, and plugin-private helpers.

In `write-registry-lockfile.test.ts`, start from a staged local-tarball lock and assert that the writer verifies exactly four regular archives by name/version/size/SHA-256/npm-integrity, rewrites the four root specifiers and four package entries to exact `2.0.0` at `https://registry.npmjs.org/@laugh-tale-island/core/-/core-2.0.0.tgz`, `https://registry.npmjs.org/@laugh-tale-island/react/-/react-2.0.0.tgz`, `https://registry.npmjs.org/@laugh-tale-island/adapters/-/adapters-2.0.0.tgz`, and `https://registry.npmjs.org/@laugh-tale-island/testing/-/testing-2.0.0.tgz`, preserves every unrelated parsed entry by deep equality—including exact `axe-core@4.11.0`—emits two-space JSON plus final newline, rejects missing/extra/local/Git/workspace output, and preserves an existing destination byte-for-byte under write/fsync/rename fault injection.

- [ ] **Step 2: Run the focused red gate**

```bash
npm test -- tests/scripts/stage-starter-consumer.test.ts tests/scripts/stage-starter-consumer-concurrency.test.ts tests/scripts/write-registry-lockfile.test.ts tests/packages/artifacts.test.ts tests/packages/clean-consumer.test.ts plugins/eternal-pose/starter/react/src/trip-content/materialize-trip.test.ts
```

Expected: FAIL because the starter knows only core/react, the stage helper packs packages alphabetically and rewrites production dependencies only, the app-local materializer/inputs are absent, and no registry-lock writer exists.

- [ ] **Step 3: Implement the starter and four-package local staging**

Set the starter package version to `2.0.0`; pin core/react/adapters under `dependencies` and testing under `devDependencies`, all exactly `2.0.0`; add exact `axe-core@4.11.0` under `devDependencies` for the generated-owned accessibility contract introduced in Task 7; preserve every other unrelated exact dependency. Add no-Trip input `{ "schemaVersion": 2, "trip": null, "setupLocale": "zh-Hant-TW", "enrichmentPolicy": null, "placeOwners": [] }` and empty ledger `{ "schemaVersion": 1, "provider": "google", "entries": [] }` as canonical JSON. Implement the local pure materializer, make `trip.ts` import only those two JSON files plus `./materialize-trip.js`, and make `validation-entry.ts` export only `{ hasTripContent: trip !== null }`.

In `stage-starter-consumer.mjs`, use exact package order `core`, `react`, `adapters`, `testing`; fail on missing/extra Laugh Tale packages; rewrite both dependency sections; install from four distinct owned tarballs; and write `.laugh-tale-local-candidates.json` inside the staged candidate before final rename. Include archive absolute path, byte size, SHA-256, and npm SHA-512 integrity. Extend the existing concurrency/fault suite through attestation write/fsync/validation/final rename, preserving the prior target exactly on failure.

- [ ] **Step 4: Derive the starter's registry-shaped lock without unpublished network access**

```bash
npm install --package-lock-only --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
node scripts/stage-starter-consumer.mjs --out "$PWD/tmp/staged-starter-base"
node scripts/write-registry-lockfile.mjs --source-lock "$PWD/tmp/staged-starter-base/package-lock.json" --package-json "$PWD/plugins/eternal-pose/starter/react/package.json" --attestation "$PWD/tmp/staged-starter-base/.laugh-tale-local-candidates.json" --destination-lock "$PWD/plugins/eternal-pose/starter/react/package-lock.json"
```

Expected: every command exits 0. The staged consumer is installable from four owned tarballs; the committed lock uses their exact integrities at the four canonical `registry.npmjs.org` URLs and contains no local/Git/workspace Laugh Tale resolution. Plan 06 must rerun the same lock derivation before its final candidate commit if any package byte changes after Phase 05.

- [ ] **Step 5: Run the green four-package gate**

```bash
npm test -- tests/scripts/stage-starter-consumer.test.ts tests/scripts/stage-starter-consumer-concurrency.test.ts tests/scripts/write-registry-lockfile.test.ts tests/packages/artifacts.test.ts tests/packages/clean-consumer.test.ts plugins/eternal-pose/starter/react/src/trip-content/materialize-trip.test.ts
npm --prefix "$PWD/tmp/staged-starter-base" run check
```

Expected: PASS without contacting Google or resolving an internal package from the source tree.

- [ ] **Step 6: Commit the v2 starter foundation**

```bash
git add package-lock.json scripts/stage-starter-consumer.mjs scripts/write-registry-lockfile.mjs plugins/eternal-pose/starter/react/package.json plugins/eternal-pose/starter/react/package-lock.json plugins/eternal-pose/starter/react/src/trip-content/trip.ts plugins/eternal-pose/starter/react/src/trip-content/materialize-trip.ts plugins/eternal-pose/starter/react/src/trip-content/materialize-trip.test.ts plugins/eternal-pose/starter/react/src/trip-content/validation-entry.ts plugins/eternal-pose/starter/react/src/trip-content/trip-input.json plugins/eternal-pose/starter/react/src/trip-content/place-resolutions.json tests/scripts/stage-starter-consumer.test.ts tests/scripts/stage-starter-consumer-concurrency.test.ts tests/scripts/write-registry-lockfile.test.ts tests/packages/artifacts.test.ts tests/packages/clean-consumer.test.ts
git diff --cached --check
git commit -m "build: prepare the four-package v2 starter"
```

---

### Task 4: Oak & Washi-only atomic Create and schema-v2 output

**Files:**
- Modify: `plugins/eternal-pose/.claude-plugin/plugin.json`
- Modify: `plugins/eternal-pose/.codex-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `.agents/plugins/marketplace.json`
- Modify: `plugins/eternal-pose/scripts/create-trip-project.mjs`
- Modify: `plugins/eternal-pose/lib/recipe-v2.mjs`
- Modify: `scripts/validate-plugin-contracts.mjs`
- Modify: `tests/scripts/create-trip-project.test.ts`
- Modify: `tests/generation/recipe-v2.test.ts`
- Modify: `tests/generation/create-real-starter.test.ts`
- Modify: `tests/plugin/manifests.test.ts`
- Modify: `tests/plugin/marketplace.test.ts`
- Modify: `tests/plugin/validator.test.ts`
- Modify: `package.json`
- Delete: `plugins/eternal-pose/recipes/`
- Delete: `plugins/eternal-pose/recipes-v2/field-atlas/`
- Delete: `tests/generation/field-atlas.test.ts`
- Delete: `tests/generation/recipes.test.ts`
- Delete: `scripts/test-internal-recipe.mjs`
- Delete: `tests/scripts/test-internal-recipe.test.ts`

**Interfaces:**
- Consumes: Task 1 parsers/builders, `publishCreatedProject`, canonical Oak recipe from Plan 04, and plugin version from `plugins/eternal-pose/.claude-plugin/plugin.json`.
- Produces:

```ts
export declare function createTripProject(
  request: {
    pluginRoot: string;
    targetDir: string;
    recipe?: "oak-washi";
    tripPath?: string;
    setupLocale?: string;
    copyCatalogPath?: string;
    resolutionsPath?: string;
    starterDir?: string;
    recipeCatalogRoot?: string;
  },
  testOperations?: AtomicPublicationTestOperations,
): Promise<void>;
export declare function materializeCopyCatalog(request: {
  locale: string;
  recipeRoot: string;
  authoredCatalogPath?: string;
}): Promise<{ canonicalLocale: string; sourceCatalog: "en" | "zh-Hant" | "authored"; source: string }>;
```

- [ ] **Step 1: Replace legacy Create expectations with failing v2 cases**

Keep existing broad-target, symlink, source-race, and foreign-inode tests. Add a manifest-coherence case that derives version from the Claude plugin manifest, requires the Codex plugin manifest and both marketplace entries to match it, and requires both marketplace sources to remain `./plugins/eternal-pose`. Replace recipe-copy assertions with these exact cases:

```ts
test("omitted recipe creates Oak & Washi with an empty canonical ledger", async () => {
  const targetDir = join(ownedRoot(), "created-trip");
  await createTripProject({ pluginRoot, targetDir, setupLocale: "zh-Hant-TW" });
  expect(readJson(join(targetDir, "eternal-pose.json"))).toEqual(
    expect.objectContaining({
      schemaVersion: 2,
      generatorVersion: "2.0.0",
      recipe: { id: "oak-washi", sourceVersion: "2.0.0" },
      presentationContractVersion: 2,
    }),
  );
  expect(readJson(join(targetDir, "src/trip-content/place-resolutions.json"))).toEqual({
    schemaVersion: 1,
    provider: "google",
    entries: [],
  });
  expect(existsSync(join(targetDir, "src/presentation/index.ts"))).toBe(true);
  expect(existsSync(join(targetDir, "src/presentation/copy/catalog.ts"))).toBe(true);
  expect(existsSync(join(targetDir, "src/presentation/copy/schema.ts"))).toBe(true);
  expect(existsSync(join(targetDir, "src/presentation/copy/en.json"))).toBe(false);
  expect(existsSync(join(targetDir, "src/presentation/copy/zh-Hant.json"))).toBe(false);
  expect(existsSync(join(targetDir, "src/presentation/copy/catalog-schema.json"))).toBe(false);
  expect(existsSync(join(targetDir, "src/presentation/copy/resolve-copy.ts"))).toBe(false);
  const generatedPresentation = await importGeneratedPresentation(targetDir);
  expect(generatedPresentation.documentMetadataCopy).toBe(
    generatedPresentation.catalog.metadata,
  );
});

test("trip input without accepted resolutions materializes every owner unresolved", async () => {
  const targetDir = join(ownedRoot(), "unresolved-trip");
  await createTripProject({ pluginRoot, targetDir, tripPath: completeInputPath });
  const ledger = readJson(join(targetDir, "src/trip-content/place-resolutions.json"));
  expect(ledger.entries).toEqual([
    expect.objectContaining({ ownerId: "place:cafe", status: "unresolved", reason: "not-reviewed" }),
    expect.objectContaining({ ownerId: "place:museum", status: "unresolved", reason: "not-reviewed" }),
  ]);
});

test("accepted resolutions must match every owner before the target is exposed", async () => {
  const targetDir = join(ownedRoot(), "rejected-trip");
  await expect(createTripProject({ pluginRoot, targetDir, tripPath: completeInputPath, resolutionsPath: incompleteLedgerPath })).rejects.toThrow(/owner coverage/);
  expect(existsSync(targetDir)).toBe(false);
});

test.each(["quiet-wood", "sticker-brutalist", "native-minimal", "field-atlas"])(
  "rejects retired recipe %s before reserving a target",
  async (recipe) => {
    const targetDir = join(ownedRoot(), recipe);
    await expect(createTripProject({ pluginRoot, targetDir, recipe })).rejects.toThrow(/only oak-washi/);
    expect(existsSync(targetDir)).toBe(false);
  },
);
```

Add CLI tests for omitted `--recipe`, absolute-only path flags, duplicate flags, a resolutions file without a Trip input, and an unknown option. Assert exactly one of `--trip` and `--setup-locale`; forbid `--setup-locale` when the Trip exists; require `--copy-catalog` for a locale not resolved by the built-in exact-tag-then-language rule; and reject an authored catalog whose declared locale differs from the selected locale. Expected usage is exactly:

```text
Usage: node create-trip-project.mjs --target /absolute/output/my-trip [--recipe oak-washi] (--trip /absolute/input.json | --setup-locale zh-Hant-TW) [--copy-catalog /absolute/catalog.json] [--resolutions /absolute/place-resolutions.json]
```

- [ ] **Step 2: Run the Create tests and observe the red state**

```bash
npm test -- tests/scripts/create-trip-project.test.ts tests/generation/recipe-v2.test.ts tests/generation/create-real-starter.test.ts tests/plugin/manifests.test.ts tests/plugin/marketplace.test.ts tests/plugin/validator.test.ts
```

Expected: FAIL because Create still requires `--recipe`, selects the legacy catalog, writes the 0.1 manifest, exposes the target through copy rather than final rename, and plugin validation hard-codes `0.1.0`.

- [ ] **Step 3: Cut Create over to the public v2 catalog**

Set both plugin manifests and both local Git-backed marketplace entries to exact version `2.0.0`, preserving their local source `./plugins/eternal-pose`. Make the validator derive the expected version from the Claude plugin manifest instead of a source constant and reject disagreement among the other three declarations. Remote candidate refs, archive identity, publication, and default-pointer changes remain exclusively Phase 06.

Make `recipes-v2` the default catalog root, accept only `oak-washi`, load and validate the complete recipe before starting a transaction, and remove the transitional `recipes/<name>/recipe.css` branch. Read the plugin release version from the Claude plugin manifest and require the Codex manifest to match before writing output.

Remove the retired root `test:recipes:internal` script in the same cutover commit; its implementation and tests are deleted here, and Task 9 replaces it with `test:generator:v2` after the complete Create-through-staging path exists.

Select exactly one authored locale before staging: `trip.locale` when `--trip` is present, otherwise the required `--setup-locale`. Canonicalize with `Intl.getCanonicalLocales`. Resolve a built-in catalog by exact tag first and language subtag second (`en-*` → `en`, `zh-Hant-*` → `zh-Hant`); an unsupported locale requires an absolute `--copy-catalog` JSON file with exactly two fields, a string `locale` and an object `catalog`. Its locale must exactly equal the selected canonical locale and its catalog must pass the same closed `catalog-schema.json` before deterministic TypeScript serialization. Cross-check the schema's sorted leaf paths against `OakWashiCopy` in the Phase 04 foundation test; Create itself remains plain Node and never imports that TypeScript interface. Never read `navigator.language`, process locale, or a second locale from the input envelope.

Treat `presentation/copy/catalog-schema.json`, `presentation/copy/en.json`, `presentation/copy/zh-Hant.json`, and `presentation/copy/resolve-copy.ts` as canonical generator inputs, not generated-project files. The plain Node Create implementation reads the JSON files with `fs`, validates the selected object against the closed JSON schema with its plugin-local dependency-free validator, and never imports recipe TypeScript. Atomically replace the canonical self-contained `presentation/copy/catalog.ts` with the selected complete materialization in the generated project; its deterministic source exports `locale` as the canonical authored tag and `catalog` as the complete object using sorted keys and JSON string literals. Generated presentation/runtime imports only this module. Copy every other presentation file byte-for-byte, including `copy/schema.ts` and the canonical entry whose `documentMetadataCopy` remains reference-identical to `catalog.metadata`; generation may not synthesize a second metadata object. The recipe-to-output identity allowlist is exactly the four recipe-only source paths plus `copy/catalog.ts` as the sole potentially changed shared file; for the canonical `zh-Hant-TW` locale it is byte-identical too. Two projects with the same selected locale, including the committed starter and Tokyo, have byte-identical complete generated `src/presentation` trees.

Inside `publishCreatedProject.populate`, copy the starter without its presentation, copy only the selected Oak presentation/assets/provider guide, write canonical `trip-input.json`, canonical `place-resolutions.json`, and this manifest:

```js
const projectManifest = buildTripProjectManifest({
  generatorVersion: pluginVersion,
  recipeId: "oak-washi",
  recipeSourceVersion: pluginVersion,
  packageVersion: packageVersions.singleVersion,
  ledger,
});
await writeOwnedJson(stageDir, "eternal-pose.json", projectManifest);
```

Validate the fully staged result with the pure structural validator before fsync/final rename. A missing target must remain missing after every injected failure. An existing empty target may be supported only by moving it to an owned backup and restoring that exact empty directory on failure.

- [ ] **Step 4: Delete retired recipe source and make catalog tests exact**

```bash
git rm -r plugins/eternal-pose/recipes plugins/eternal-pose/recipes-v2/field-atlas
git rm tests/generation/field-atlas.test.ts tests/generation/recipes.test.ts scripts/test-internal-recipe.mjs tests/scripts/test-internal-recipe.test.ts
```

Update `recipe-v2.test.ts` to assert that the public catalog contains exactly `oak-washi`, its entry/styles/assets/map/profile/provider guidance all resolve inside its root, and unknown schema/contract majors fail closed. Keep generic malformed-path and symlink fixtures under `tests/fixtures/recipe-v2/`.

- [ ] **Step 5: Run the focused Create gate**

```bash
npm test -- tests/scripts/create-trip-project.test.ts tests/generation/recipe-v2.test.ts tests/generation/create-real-starter.test.ts tests/generation/project-manifest-v2.test.ts tests/plugin/manifests.test.ts tests/plugin/marketplace.test.ts tests/plugin/validator.test.ts
npm run validate:plugins
npm run check:marketplace
```

Expected: PASS; no legacy recipe ID is accepted and every successful target has a valid v2 manifest plus ledger.

- [ ] **Step 6: Commit the Create cutover**

```bash
git add plugins/eternal-pose/.claude-plugin/plugin.json plugins/eternal-pose/.codex-plugin/plugin.json .claude-plugin/marketplace.json .agents/plugins/marketplace.json plugins/eternal-pose/scripts/create-trip-project.mjs plugins/eternal-pose/lib/recipe-v2.mjs scripts/validate-plugin-contracts.mjs tests/scripts/create-trip-project.test.ts tests/generation/recipe-v2.test.ts tests/generation/create-real-starter.test.ts tests/plugin/manifests.test.ts tests/plugin/marketplace.test.ts tests/plugin/validator.test.ts package.json
git add -u plugins/eternal-pose/recipes plugins/eternal-pose/recipes-v2/field-atlas tests/generation/field-atlas.test.ts tests/generation/recipes.test.ts scripts/test-internal-recipe.mjs tests/scripts/test-internal-recipe.test.ts
git diff --cached --check
git commit -m "feat: make Oak and Washi the atomic default"
```

---

### Task 5: Deterministic Enrich search and immutable review artifact

**Files:**
- Create: `plugins/eternal-pose/scripts/enrich-trip-project.mjs`
- Create: `tests/scripts/enrich-trip-project.test.ts`
- Modify: `plugins/eternal-pose/lib/place-resolution-ledger.mjs`
- Modify: `plugins/eternal-pose/starter/react/.gitignore`

**Interfaces:**
- Consumes: `TripProjectInputV2`, `readProjectFileSet`, `writeArtifactAtomically`, and this Plan 01 adapter export:

```ts
// @laugh-tale-island/adapters/google/node
export class GooglePlaceSearchAdapter implements PlaceSearchAdapter {
  constructor(options: { apiKey: string; fetch?: typeof fetch });
  search(query: PlaceSearchQuery, signal: AbortSignal): Promise<PlaceSearchResult>;
}
```

- Produces:

```ts
import type { ProviderFailureReason } from "@laugh-tale-island/core";
import type { PlaceSearchAdapter } from "@laugh-tale-island/core/enrichment";

export declare function searchTripPlaces(
  request: {
    projectDir: string;
    reviewPath: string;
    adapter: PlaceSearchAdapter;
    observedAt?: () => Date;
  },
  testOperations?: AtomicPublicationTestOperations,
): Promise<PlaceReviewArtifactV1>;
export declare function parsePlaceReviewArtifact(
  value: unknown,
  input: TripProjectInputV2,
): PlaceReviewArtifactV1;
```

The canonical review artifact is:

```ts
interface PlaceReviewArtifactV1 {
  schemaVersion: 1;
  project: { tripId: string; inputHash: string };
  provider: "google";
  observedAt: string;
  policy: TripProjectInputV2["enrichmentPolicy"];
  entries: Array<{
    provenanceSchemaVersion: 1;
    ownerId: string;
    source: string;
    query: PlaceSearchQuery;
    result: "candidates" | "unavailable";
    unavailableReason?: ProviderFailureReason;
    candidates: Array<{
      providerReference: ProviderReference & { provider: "google" };
      displayName: string;
      formattedAddress: string;
      coordinates: Coordinates;
      categories: string[];
    }>;
  }>;
}
```

- [ ] **Step 1: Write the failing search tests**

Use an injected fake adapter and fixed clock; do not call Google. Require each adapter call and persisted review entry to contain the same deeply cloned, complete normalized `PlaceSearchQuery`:

```ts
test("searches owners in stable order and atomically writes one credential-free review", async () => {
  const fixture = generatedProjectWithInput(["place:museum", "place:cafe"]);
  const calls: string[] = [];
  const adapter = fakeSearchAdapter((request) => {
    calls.push(request.ownerId);
    return candidateResult(request.ownerId);
  });
  await searchTripPlaces({
    projectDir: fixture.projectDir,
    reviewPath: fixture.reviewPath,
    adapter,
    observedAt: () => new Date("2026-09-04T08:00:00.000Z"),
  });
  expect(calls).toEqual(["place:cafe", "place:museum"]);
  expect(readJson(fixture.reviewPath)).toEqual(
    expect.objectContaining({
      schemaVersion: 1,
      provider: "google",
      observedAt: "2026-09-04T08:00:00.000Z",
    }),
  );
  expect(readFileSync(fixture.reviewPath, "utf8")).not.toContain("server-secret");
});

test.each(["stage-write", "stage-fsync", "target-rename", "directory-fsync"] as const)(
  "preserves the previous review byte-for-byte when search fails at %s",
  async (phase) => {
    const fixture = generatedProjectWithPriorReview();
    const before = readFileSync(fixture.reviewPath);
    await expect(searchTripPlaces(searchRequest(fixture), { beforeMutation: failOnceAt(phase) })).rejects.toThrow(/injected/);
    expect(readFileSync(fixture.reviewPath)).toEqual(before);
    expect(snapshotTree(fixture.projectDir)).toEqual(fixture.projectBefore);
  },
);
```

Assert the two calls preserve canonical locale, policy region/bias, and literal `maxCandidates: 3`; every entry has `provenanceSchemaVersion: 1` and its `observedAt` equals the envelope's one shared timestamp. Mutate the fake adapter's received object and prove neither the input nor persisted review changes. Reject a review that replaces the query object with a string, changes the per-entry schema/timestamp, or drifts any normalized field.

Add cases for missing/blank server key, browser key present but server key absent, input hash mismatch, null Trip, null enrichment policy, typed request denial, malformed result, duplicate/blank provider references, invalid coordinates, and no candidates. Typed unavailable results are reviewable entries; a process/ownership failure aborts the file transaction. A prepared/committed transaction journal or a journal appearing between the two read checks must make search refuse before calling the adapter or touching the prior review.

- [ ] **Step 2: Run the search subset and observe the red state**

```bash
npm test -- tests/scripts/enrich-trip-project.test.ts -t "search|server key|previous review"
```

Expected: FAIL because the Enrich script and search export do not exist.

- [ ] **Step 3: Implement the search operation and CLI adapter loading**

Parse only this command form:

```text
node enrich-trip-project.mjs search --project /absolute/project --review /absolute/review.json
```

Read `package.json`, `eternal-pose.json`, `src/trip-content/trip-input.json`, and `src/trip-content/place-resolutions.json` as one double-checked `readProjectFileSet` snapshot before doing provider work. The exported injection-based `searchTripPlaces` uses the portable query/provenance creators, so deterministic tests and the installed-plugin harness need no project package installation. The production CLI branch resolves the installed Node adapter and core enrichment subpath from that snapshot's package declaration using `createRequire`, then dynamically imports their resolved file URLs; reject either package when resolved outside the project's real `node_modules` tree. Before reading the credential or calling the provider, pass those installed core creators to `assertPortableEnrichmentConformance`; abort on any mismatch so the portable values used by Create/search and installed core semantics cannot diverge. For each committed owner, construct the portable query/provenance with owner ID, authored source text, required canonical `input.trip.locale`, the exact policy region/bias, provider, and one shared observed timestamp; persist every field, naming its schema field `provenanceSchemaVersion` to avoid colliding with the review envelope's own `schemaVersion`. Do not reuse the browser key, read `.env.local`, consult device/process locale, persist the server key, or print provider error bodies.

Write the result once, after all entries have normalized, with:

```js
await writeArtifactAtomically({
  destination: reviewPath,
  contents: `${canonicalizeJson(review)}\n`,
  mode: 0o600,
}, testOperations);
```

Add `.eternal-pose-review.json` and `.eternal-pose-selection.json` to the starter `.gitignore`; the CLI still requires an explicit absolute `--review` path so release jobs can keep review data outside generated source.

- [ ] **Step 4: Run the complete Enrich test file**

```bash
npm test -- tests/scripts/enrich-trip-project.test.ts tests/generation/project-manifest-v2.test.ts
```

Expected: PASS with zero network access and no credential in captured output or files.

- [ ] **Step 5: Commit Enrich search**

```bash
git add plugins/eternal-pose/scripts/enrich-trip-project.mjs plugins/eternal-pose/lib/place-resolution-ledger.mjs plugins/eternal-pose/starter/react/.gitignore tests/scripts/enrich-trip-project.test.ts
git diff --cached --check
git commit -m "feat: add deterministic place search review"
```

---

### Task 6: Explicit Enrich acceptance and provenance transaction

**Files:**
- Modify: `plugins/eternal-pose/scripts/enrich-trip-project.mjs`
- Modify: `plugins/eternal-pose/lib/place-resolution-ledger.mjs`
- Modify: `tests/scripts/enrich-trip-project.test.ts`

**Interfaces:**
- Consumes: Task 5 review artifact plus `readProjectFileSet`, `recoverProjectFileTransaction`, and `replaceProjectFiles`.
- Produces:

```ts
export declare function acceptTripPlaceSelections(
  request: { projectDir: string; reviewPath: string; selectionPath: string },
  testOperations?: AtomicPublicationTestOperations,
): Promise<PlaceResolutionLedgerV1>;
export declare function parsePlaceSelection(
  value: unknown,
  review: PlaceReviewArtifactV1,
): PlaceSelectionV1;
export declare function acceptedLedgerFromReview(
  review: PlaceReviewArtifactV1,
  selection: PlaceSelectionV1,
  input: TripProjectInputV2,
): PlaceResolutionLedgerV1;
```

Selection files have this exact shape and are keyed by the complete provider reference, never candidate index:

```ts
interface PlaceSelectionV1 {
  schemaVersion: 1;
  reviewHash: string;
  decisions: Array<
    | {
        ownerId: string;
        status: "resolved";
        providerReference: ProviderReference & { provider: "google" };
      }
    | {
        ownerId: string;
        status: "unresolved";
        reason: "no-accepted-candidate" | "ambiguous";
      }
  >;
}
```

- [ ] **Step 1: Add failing accept and rollback tests**

```ts
test("accept copies review provenance and replaces ledger plus manifest together", async () => {
  const fixture = projectReviewAndSelection();
  const reviewBytes = readFileSync(fixture.reviewPath);
  await acceptTripPlaceSelections(fixture);
  const ledger = readJson(join(fixture.projectDir, "src/trip-content/place-resolutions.json"));
  const manifest = readJson(join(fixture.projectDir, "eternal-pose.json"));
  expect(ledger.entries[0]).toEqual(
    expect.objectContaining({
      status: "resolved",
      provider: "google",
      observedAt: "2026-09-04T08:00:00.000Z",
      query: expect.objectContaining({
        ownerId: "place:cafe",
        locale: "en",
        maxCandidates: 3,
      }),
    }),
  );
  expect(manifest.enrichment.provenanceHash).toBe(sha256CanonicalJson(ledger));
  expect(readFileSync(fixture.reviewPath)).toEqual(reviewBytes);
});

test.each(["stage-write", "stage-fsync", "journal-prepare", "file-backup", "file-rename", "directory-fsync", "journal-commit"] as const)(
  "accept preserves project and review bytes when the transaction fails at %s",
  async (phase) => {
    const fixture = projectReviewAndSelection();
    const projectBefore = snapshotTree(fixture.projectDir);
    const reviewBefore = readFileSync(fixture.reviewPath);
    await expect(acceptTripPlaceSelections(fixture, { beforeMutation: failOnceAt(phase) })).rejects.toThrow(/injected/);
    expect(snapshotTree(fixture.projectDir)).toEqual(projectBefore);
    expect(readFileSync(fixture.reviewPath)).toEqual(reviewBefore);
  },
);
```

Add explicit rejections for a stale `inputHash`, wrong `reviewHash`, missing/extra/duplicate decision, provider reference absent from that owner's candidates, `resolved` decision against an unavailable result, wrong `provenanceSchemaVersion`, legacy string/drifted normalized query, invalid observation time, changed review inode during read, and an unrecognized unresolved reason. For both a resolved decision and a review-backed unresolved decision, prove locale/region/bias/maxCandidates survive byte-for-byte into the ledger and changing any query fact changes `manifest.enrichment.provenanceHash`.

- [ ] **Step 2: Run accept tests and observe the red state**

```bash
npm test -- tests/scripts/enrich-trip-project.test.ts -t "accept|reviewHash|transaction"
```

Expected: FAIL because `acceptTripPlaceSelections` is not exported and the CLI has no `accept` branch.

- [ ] **Step 3: Implement accepted-ledger construction and two-file commit**

Run `recoverProjectFileTransaction(projectDir)` before any mutation, then parse project input, current manifest, and current ledger from one `readProjectFileSet` snapshot; read the external review and selection from identity-stable file handles and recheck both identities before commit. Require `selection.reviewHash === sha256CanonicalJson(review)`. Recreate `PlaceResolutionProvenance` from each review entry with `createPortablePlaceResolutionProvenance`, reconstruct `{ schemaVersion: entry.provenanceSchemaVersion, ownerId, source, query, provider, observedAt }`, and require deep equality before accepting it. Accept must remain runnable immediately after clean Create with no project `node_modules`; the Task 1 conformance gate, plus Enrich search's startup check against installed core, prevents the portable contract from drifting. For a resolved decision, copy the selected candidate's complete Google provider reference, display name, formatted address, coordinates, and sorted categories, plus the complete normalized review owner/source/query/provider/observedAt projection; the ledger envelope's own `schemaVersion: 1` carries the accepted-output schema. For a review-backed unresolved decision, copy the same owner/source/query/observedAt and emit no `accepted`, coordinates, or provider reference; only the initial `not-reviewed` ledger may omit `observedAt`.

Build the next manifest by preserving every field except `enrichment.schemaVersion` and `enrichment.provenanceHash`, then publish only:

```js
const allowedPaths = new Set([
  "eternal-pose.json",
  "src/trip-content/place-resolutions.json",
]);
await replaceProjectFiles({
  projectDir,
  replacements: new Map([
    ["eternal-pose.json", `${canonicalizeJson(nextManifest)}\n`],
    ["src/trip-content/place-resolutions.json", `${canonicalizeJson(nextLedger)}\n`],
  ]),
  allowedPaths,
  validate: async (stageView) => validateAcceptedProject(stageView),
}, testOperations);
```

The command form is exactly:

```text
node enrich-trip-project.mjs accept --project /absolute/project --review /absolute/review.json --selection /absolute/selection.json
```

- [ ] **Step 4: Run Enrich and publication-scan coverage**

```bash
npm test -- tests/scripts/enrich-trip-project.test.ts tests/scripts/atomic-publication.test.ts tests/scripts/publication-scan.test.ts
```

Expected: PASS; the review remains unchanged and source contains no accepted partial provenance after any injected failure.

- [ ] **Step 5: Commit Enrich acceptance**

```bash
git add plugins/eternal-pose/scripts/enrich-trip-project.mjs plugins/eternal-pose/lib/place-resolution-ledger.mjs tests/scripts/enrich-trip-project.test.ts
git diff --cached --check
git commit -m "feat: accept place provenance atomically"
```

---

### Task 7: Static Validate and isolated Verify

**Files:**
- Modify: `plugins/eternal-pose/scripts/validate-trip-project.mjs`
- Create: `plugins/eternal-pose/scripts/verify-trip-project.mjs`
- Create: `plugins/eternal-pose/starter/react/scripts/assert-project-readable.mjs`
- Create: `plugins/eternal-pose/starter/react/src/app/generated-experience.contract.test.tsx`
- Create: `plugins/eternal-pose/starter/react/src/app/generated-accessibility.contract.test.tsx`
- Modify: `tests/generation/generated-project.test.ts`
- Create: `tests/scripts/verify-trip-project.test.ts`
- Modify: `plugins/eternal-pose/starter/react/package.json`

**Interfaces:**
- Consumes: Task 1 parsers, Task 2 `readProjectFileSet`, `scanPublication`, recipe path declarations, and existing owned validation-output logic.
- Produces:

```ts
export type TripProjectValidationMode = "local" | "candidate" | "registry";
export interface TripProjectFinding {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}
export interface TripProjectValidationResult {
  mode: TripProjectValidationMode | null;
  counts: { errors: number; warnings: number };
  findings: TripProjectFinding[];
}
export interface TripProjectVerificationResult extends TripProjectValidationResult {
  commands: Array<{ command: string; exitCode: number }>;
  failedCommand: { command: string; exitCode: number } | null;
}
export type VerifyTripProjectTestOperations = Readonly<Record<string, unknown>> & {
  spawnSync?: (
    command: string,
    arguments_: readonly string[],
    options: { cwd: string; env: NodeJS.ProcessEnv; shell: false },
  ) => { status: number | null };
  beforeTempMutation?: (event: { phase: string; path: string; validationDir: string }) => void;
};
export declare function validateTripProject(
  rootDir: string,
  mode: TripProjectValidationMode,
): Promise<TripProjectValidationResult>;
export declare function verifyTripProject(
  rootDir: string,
  mode: TripProjectValidationMode,
  testOperations?: VerifyTripProjectTestOperations,
): Promise<TripProjectVerificationResult>;
```

Validation modes are exact:

- `local`: four exact semver declarations and a lockfile are required; missing Trip is a warning.
- `candidate`: four local tarball specifiers are accepted only when `ETERNAL_POSE_CANDIDATE_ATTESTATION` names an absolute JSON file whose name/version/size/SHA-256 matches each tarball; source/workspace/git/link references remain errors.
- `registry`: four exact semver declarations must match `eternal-pose.json`, and every resolved Laugh Tale lockfile URL must use `https://registry.npmjs.org/`.

Candidate and registry mode treat a null Trip as an error; local mode keeps the no-Trip starter as a valid Setup Required warning. No mode requires either credential. Validate never reads `ETERNAL_POSE_GOOGLE_PLACES_API_KEY`; a missing `VITE_GOOGLE_MAPS_API_KEY` is at most a readiness warning, because the valid itinerary remains usable and Phase 06 owns live-Google capability evidence.

- [ ] **Step 1: Write failing v2 validation tests**

Replace `src/ui` and two-package fixtures with `src/app`, `src/presentation`, `src/trip-content`, four packages, a v2 manifest, and a ledger. Add these assertions:

```ts
test("validates declared v2 entrypoints and the canonical ledger hash without running commands", async () => {
  const fixture = completeV2Project();
  const before = snapshotTree(fixture.root);
  const result = await validateTripProject(fixture.root, "local");
  expect(result.counts.errors).toBe(0);
  expect(snapshotTree(fixture.root)).toEqual(before);
  expect(reachableImports(validateTripProjectModule)).not.toContain("node:child_process");
});

test.each([
  ["ledger tamper", mutateLedger, "project.provenance-mismatch"],
  ["manifest package drift", mutateManifestPackage, "project.package-version-drift"],
  ["undeclared presentation entry", mutatePresentationEntry, "project.presentation-entry-mismatch"],
] as const)("rejects %s with %s", async (_name, mutate, code) => {
  const fixture = completeV2Project();
  mutate(fixture.root);
  const result = await validateTripProject(fixture.root, "registry");
  expect(result.findings).toContainEqual(expect.objectContaining({ severity: "error", code }));
});
```

Add candidate-attestation cases for correct tarballs, wrong digest, wrong size, wrong package name, wrong version, absent attestation, a tarball symlink, and an attestation outside a regular file. Add registry cases for `file:`, `link:`, `workspace:`, Git, ranges, and non-npmjs lock URLs. In all three modes, unset both credentials, assert the server key is never read and the absent browser key is warning-only; test null Trip as warning in local and error in candidate/registry.

Add prepared/committed/injected-mid-read journal cases. Validate must return one stable `project.transaction-in-progress` error without parsing mixed files; it must never mutate or recover the project. Test the generated `scripts/assert-project-readable.mjs` against clean, in-flight, symlinked, malformed, and multiple journal entries; it exits nonzero for every non-clean case before a package command begins.

Add generated-project ownership assertions for the two app-local test entrypoints. `generated-experience.contract.test.tsx` imports `presentation` only from the sibling generated `src/presentation` entry, then passes it explicitly to `createPresentationDriver`/`renderTripContract` from `@laugh-tale-island/testing` with the package's provider-neutral fakes. It exercises Home, Experience, Setup, Loading, Fatal, progress, navigation, sheet/focus, candidate, and map-content lifecycle without importing a recipe, plugin path, repository test fixture, or default presentation. `generated-accessibility.contract.test.tsx` imports the same local presentation plus named package exports `oakWashiVisualCases` and `renderOakWashiCase`, passes the presentation and provider-neutral adapters explicitly, renders every one of the 17 cases in jsdom, and runs Task 3's locked `axe-core@4.11.0` with deterministic viewport/media shims; it fails on any axe violation, duplicate landmark/name, missing 44px target probe, or unresolved focus target. It must not use Tokyo/private facts, Google, screenshots, or a root-harness fallback. Assert every generated manifest and lock retains that exact dependency; do not relock against unpublished internal registry entries in this task.

- [ ] **Step 2: Run validation tests and observe the red state**

```bash
npm test -- tests/generation/generated-project.test.ts
```

Expected: FAIL because the validator hard-codes `src/ui`, checks two packages, accepts only local/deploy modes, and still executes project commands.

- [ ] **Step 3: Make Validate purely structural**

Keep stable JSON output prefix `ETERNAL_POSE_VALIDATION_RESULT `. Parse exactly one absolute root plus `--mode local|candidate|registry`. Obtain manifest, package, lock, trip input, and ledger bytes from one `readProjectFileSet` call before parsing any of them. Validate required root files, actual manifest-declared presentation paths, trip input, ledger coverage/hash, exact dependency placement, lockfile identity, publication scan, and readiness. Require exactly one `src/presentation/copy/catalog.ts`, require its declared locale to equal the canonical selected `trip.locale` or no-Trip `setupLocale`, and reject copied `en.json`, `zh-Hant.json`, `catalog-schema.json`, `resolve-copy.ts`, or browser/device locale access. The module and its reachable imports must not import `node:child_process`; return findings without spawning npm or writing any file.

- [ ] **Step 4: Write failing Verify order/isolation tests**

```ts
test("Verify runs the six gates in order and keeps all output outside source", async () => {
  const fixture = completeV2Project();
  const result = await verifyTripProject(fixture.root, "local", {
    spawnSync: successfulGateRunner(),
  });
  expect(result.commands).toEqual([
    { command: "npm test", exitCode: 0 },
    { command: "npm run type-check", exitCode: 0 },
    { command: "npm run lint", exitCode: 0 },
    { command: "npm run test:experience", exitCode: 0 },
    { command: "npm run test:a11y", exitCode: 0 },
    { command: "npm run build", exitCode: 0 },
  ]);
  expect(snapshotTree(fixture.root)).toEqual(fixture.before);
});
```

Retain the existing temp-root acquisition/replacement/cleanup race cases, move them to `verify-trip-project.test.ts`, and add one case per failing command proving later commands do not run. Pause a writer during every command and prove Verify's before/after stable-read checks reject the run; no successful verification result may span a file-set generation change.

- [ ] **Step 5: Run Verify tests and observe the red state**

```bash
npm test -- tests/scripts/verify-trip-project.test.ts
```

Expected: FAIL because `verify-trip-project.mjs` does not exist.

- [ ] **Step 6: Move execution into Verify**

Move the owned temp-output machinery out of Validate into Verify. Run each npm command with `shell: false`, an allowlisted environment, and these owned locations:

```js
environment.ETERNAL_POSE_VALIDATION_OUT_DIR = join(ownership.path, "output");
environment.ETERNAL_POSE_VALIDATION_CACHE_DIR = join(ownership.path, "cache");
environment.ETERNAL_POSE_VALIDATION_ENV_DIR = join(ownership.path, "environment");
```

Verify first calls static Validate for the same mode and stops before npm when any structural error exists. Before and after each spawned command, re-run the transaction-clean snapshot check; discard command success if a journal appeared or the accepted manifest/lock/input/ledger hashes changed. Keep stable output prefix `ETERNAL_POSE_VERIFICATION_RESULT `. Add the local, dependency-free `scripts/assert-project-readable.mjs` and wire it through `pretest`, `pretype-check`, `prelint`, `pretest:experience`, `pretest:a11y`, and `prebuild`; it refuses any in-flight/malformed transaction journal before the underlying project command. Set `test:experience` exactly to `vitest run src/app/generated-experience.contract.test.tsx` and `test:a11y` exactly to `vitest run src/app/generated-accessibility.contract.test.tsx`. Because both files live in the starter app, Create copies them into every project; they consume only that project's local presentation and the installed testing package.

- [ ] **Step 7: Run the complete validation/verification gate**

```bash
npm test -- tests/generation/generated-project.test.ts tests/scripts/verify-trip-project.test.ts tests/scripts/publication-scan.test.ts
```

Expected: PASS; snapshots prove Validate and Verify leave project source unchanged.

- [ ] **Step 8: Commit the Validate/Verify split**

```bash
git add plugins/eternal-pose/scripts/validate-trip-project.mjs plugins/eternal-pose/scripts/verify-trip-project.mjs plugins/eternal-pose/starter/react/scripts/assert-project-readable.mjs plugins/eternal-pose/starter/react/src/app/generated-experience.contract.test.tsx plugins/eternal-pose/starter/react/src/app/generated-accessibility.contract.test.tsx plugins/eternal-pose/starter/react/package.json tests/generation/generated-project.test.ts tests/scripts/verify-trip-project.test.ts
git diff --cached --check
git commit -m "feat: validate and verify v2 projects"
```

---

### Task 8: Same-major atomic package upgrade

**Files:**
- Create: `plugins/eternal-pose/scripts/upgrade-trip-project.mjs`
- Create: `tests/scripts/upgrade-trip-project.test.ts`

**Interfaces:**
- Consumes: `parseTripProjectManifest`, `readProjectFileSet`, `recoverProjectFileTransaction`, `replaceProjectFiles`, static Validate, and npm's committed `package-lock.json` format.
- Produces:

```ts
export type UpgradeTripProjectTestOperations = AtomicPublicationTestOperations & {
  spawnSync?: (
    command: string,
    arguments_: readonly string[],
    options: { cwd: string; env: NodeJS.ProcessEnv; shell: false },
  ) => { status: number | null };
};
export declare function upgradeTripProject(
  request: { projectDir: string; packagesVersion: string; toolVersion: string },
  testOperations?: UpgradeTripProjectTestOperations,
): Promise<TripProjectManifestV2>;
```

The only mutable relative paths are:

```js
export const UPGRADE_MUTATION_ALLOWLIST = Object.freeze([
  "package.json",
  "package-lock.json",
  "eternal-pose.json",
]);
```

- [ ] **Step 1: Write the failing refusal and success matrix**

```ts
test("updates only four exact pins, npm lockfile, and lastUpgradeToolVersion", async () => {
  const fixture = completeV2Project({ packageVersion: "2.0.0" });
  const nonAllowlistedBefore = snapshotNonAllowlisted(fixture.root);
  await upgradeTripProject(
    { projectDir: fixture.root, packagesVersion: "2.1.0", toolVersion: "2.1.0" },
    { spawnSync: successfulPackageLockUpdate("2.1.0") },
  );
  const manifest = readJson(join(fixture.root, "eternal-pose.json"));
  expect(new Set(Object.values(manifest.packages))).toEqual(new Set(["2.1.0"]));
  expect(manifest.lastUpgradeToolVersion).toBe("2.1.0");
  expect(manifest.generatorVersion).toBe("2.0.0");
  expect(snapshotNonAllowlisted(fixture.root)).toEqual(nonAllowlistedBefore);
});

test.each([
  ["schema 1", projectWithSchema1(), /schema-v2/],
  ["major 3 target", completeV2Project(), /same presentation-contract major/],
  ["manifest/package drift", driftedPinsProject(), /ownership conflict/],
  ["multiple lockfiles", multipleLockfilesProject(), /unsupported lockfile/],
  ["pnpm lockfile", pnpmProject(), /unsupported lockfile/],
  ["required presentation rewrite", contractMajorMismatchProject(), /presentation-contract major/],
] as const)("refuses %s without mutation", async (_name, fixture, message) => {
  const before = snapshotTree(fixture.root);
  await expect(upgradeTripProject(requestFor(fixture))).rejects.toThrow(message);
  expect(snapshotTree(fixture.root)).toEqual(before);
});
```

Add one fault case before/during package JSON write, lock regeneration, validation, fsync, journal prepare, each final rename, journal commit, and recovery. Every caught/prepared case must preserve the entire pre-upgrade tree byte-for-byte; an external kill after durable journal commit must recover to the complete upgraded three-file generation. Add a concurrent Validate/Verify reader and require old/new/refusal only, never a mixed accepted set.

- [ ] **Step 2: Run the upgrade test and observe the red state**

```bash
npm test -- tests/scripts/upgrade-trip-project.test.ts
```

Expected: FAIL because `upgrade-trip-project.mjs` does not exist.

- [ ] **Step 3: Implement staged lock regeneration and three-file publication**

Run `recoverProjectFileTransaction(projectDir)`, then obtain package, lock, manifest, input, and ledger from one `readProjectFileSet` snapshot. Require exactly one `package-lock.json`; reject `yarn.lock`, `pnpm-lock.yaml`, `bun.lock`, or multiple lockfiles. Verify current package.json, lockfile, and project-manifest versions agree before staging. In the stage view, update core/react/adapters in `dependencies`, testing in `devDependencies`, and run:

```js
spawnSync(npmExecutable, [
  "install",
  "--package-lock-only",
  "--ignore-scripts",
  "--no-audit",
  "--no-fund",
  "--registry=https://registry.npmjs.org",
], { cwd: stagedProject, shell: false, env: allowlistedEnvironment });
```

Rebuild the manifest by preserving `generatorVersion`, `recipe`, `presentationContractVersion`, and the complete `enrichment` object; change only the four package values and `lastUpgradeToolVersion`. Hash every non-allowlisted regular file before and after staging, run static registry-mode validation on the stage view, then call `replaceProjectFiles` with the three literal allowlisted paths.

- [ ] **Step 4: Run upgrade, manifest, and validator coverage**

```bash
npm test -- tests/scripts/upgrade-trip-project.test.ts tests/generation/project-manifest-v2.test.ts tests/generation/generated-project.test.ts
```

Expected: PASS; no schema-1 or cross-major project is mutated.

- [ ] **Step 5: Commit the upgrade command**

```bash
git add plugins/eternal-pose/scripts/upgrade-trip-project.mjs tests/scripts/upgrade-trip-project.test.ts
git diff --cached --check
git commit -m "feat: add atomic v2 package upgrades"
```

---

### Task 9: Route staging through Create and prove generated-starter identity

**Files:**
- Create: `scripts/sync-oak-washi-starter-presentation.mjs`
- Modify: `scripts/stage-starter-consumer.mjs`
- Create: `tests/scripts/sync-oak-washi-starter-presentation.test.ts`
- Modify: `tests/scripts/stage-starter-consumer.test.ts`
- Modify: `tests/scripts/stage-starter-consumer-concurrency.test.ts`
- Modify: `tests/generation/create-real-starter.test.ts`
- Regenerate mechanically: `plugins/eternal-pose/starter/react/src/presentation/**`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 3's four-package packing/attestation transaction, Task 4's atomic Create, and Task 2's journal-aware reader.
- Produces: the committed canonical zero-content Oak presentation mechanically synchronized from the recipe, plus a releasable staged starter generated through the same path as a real Trip and installed only from the four attested local package archives.

```ts
export declare function stageStarterConsumer(
  request?: {
    install?: boolean;
    outDir?: string;
    recipe?: "oak-washi";
    recipeCatalogRoot?: string;
    tripPath?: string;
    setupLocale?: string;
    copyCatalogPath?: string;
    resolutionsPath?: string;
  },
  testOperations?: Readonly<Record<string, unknown>>,
): Promise<{ stagedRoot: string; tarballs: string[]; attestationPath: string }>;

export declare function syncOakWashiStarterPresentation(request: {
  recipeRoot: string;
  starterPresentationRoot: string;
  locale: "zh-Hant-TW";
  backupDir: string;
}): Promise<{ backupDir: string; presentationSha256: string }>;
```

- [ ] **Step 1: Write failing Create-through-staging and byte-identity tests**

Extend `stage-starter-consumer.test.ts` so recipe mode invokes Create before dependency rewriting/install, forwards `tripPath`, `setupLocale`, `copyCatalogPath`, and `resolutionsPath` exactly once, and retains Task 3's `core`, `react`, `adapters`, `testing` archive order and in-tree attestation. Add strict CLI cases for duplicate/unknown flags, non-absolute paths, mutually exclusive `--trip`/`--setup-locale`, `--resolutions` without `--trip`, and this exact usage:

```text
node scripts/stage-starter-consumer.mjs [--out /absolute/staged-project] [--recipe oak-washi] [--trip /absolute/trip-input.json | --setup-locale zh-Hant-TW] [--copy-catalog /absolute/catalog.json] [--resolutions /absolute/place-resolutions.json] [--no-install]
```

Keep a no-recipe internal mode solely for Task 3's raw dependency/artifact tests. Any invocation with `--recipe`, `--trip`, `--setup-locale`, `--copy-catalog`, or `--resolutions` must use Create and must not expose the output until Create, package rewrite, install, attestation write/fsync, structural validation, and final rename all succeed. Extend the existing fault matrix across that complete transaction.

Inject a prepared/committed/malformed file-set journal into the created stage before dependency rewrite and require staging to refuse or recover through the Task 2 seam before reading any manifest/package/input/ledger bytes. During structural validation, pause a file-set writer and prove no mixed snapshot can reach the final directory rename.

In `create-real-starter.test.ts`, generate the release starter with `setupLocale: "zh-Hant-TW"` and assert:

```ts
expect(compareRecipeToGeneratedPresentation(generated)).toEqual({
  sourceOnly: [
    "copy/catalog-schema.json",
    "copy/en.json",
    "copy/resolve-copy.ts",
    "copy/zh-Hant.json",
  ],
  generatedOnly: [],
  changedSharedFiles: [],
});
expect(readFileSync(join(generated, "src/presentation/copy/catalog.ts"), "utf8")).toBe(
  (await materializeCopyCatalog({ locale: "zh-Hant-TW", recipeRoot: oakRecipeRoot })).source,
);
expect(hashTree(join(generated, "src/app"))).toEqual(
  hashTree(join(repoRoot, "plugins/eternal-pose/starter/react/src/app")),
);
```

Also inventory the full generated tree: aside from Task 4's exact recipe-to-output allowlist, every shared source byte must match its canonical starter/recipe source; only one `src/presentation/copy/catalog.ts` may exist; the installed presentation entry must expose `documentMetadataCopy === catalog.metadata`; and no reachable generated import may reference `plugins/`, `scripts/`, `en.json`, `zh-Hant.json`, `catalog-schema.json`, `resolve-copy.ts`, browser locale, or a plugin-private materializer.

In `sync-oak-washi-starter-presentation.test.ts`, start from a deliberately stale committed-starter presentation. Require the sync command to stage the canonical recipe tree, exclude exactly `copy/catalog-schema.json`, `copy/en.json`, `copy/zh-Hant.json`, and `copy/resolve-copy.ts`, materialize the exact `zh-Hant-TW` `copy/catalog.ts`, retain `documentMetadataCopy === catalog.metadata`, validate the complete inventory, then call Task 2 `replaceOwnedDirectoryAtomically`. Inject failure and crash at both directory renames and prove the old or new presentation is complete; a failed sync never overlays files. Reject a target outside the exact supplied starter root, a mismatched locale/catalog, a pre-existing backup, and any manual post-sync difference.

- [ ] **Step 2: Run the focused red gate**

```bash
npm test -- tests/scripts/sync-oak-washi-starter-presentation.test.ts tests/scripts/stage-starter-consumer.test.ts tests/scripts/stage-starter-consumer-concurrency.test.ts tests/generation/create-real-starter.test.ts
```

Expected: FAIL because the committed starter still has the Phase 03 transitional presentation, the sync command is absent, and Task 3 staging does not yet route recipe/trip options through Create or enforce generated presentation identity.

- [ ] **Step 3: Implement the generated-starter staging path**

First implement `syncOakWashiStarterPresentation` as a deterministic recipe materializer and Task 2 whole-directory transaction. It creates and validates a complete sibling candidate, then replaces only `plugins/eternal-pose/starter/react/src/presentation` while retaining the prior tree at the required absolute backup. It never copies from an ephemeral generated project and never edits an individual starter presentation file in place. Run it once with the canonical recipe and `zh-Hant-TW`; keep the backup outside the staged diff through this task's verification.

Then add the strict staging parser and pass the selected locale/input/catalog/ledger paths directly to `createTripProject`. Preserve Task 3's archive hashes and package order, but move the complete Create-plus-install work under one owned sibling-stage transaction. Before rewriting dependencies, run transaction recovery on the private stage and read its manifest/package/input/ledger through one stable snapshot; static validation repeats the snapshot before the final directory rename. Do not copy or repair presentation files after Create. The no-Trip release starter must contain canonical input with `setupLocale: "zh-Hant-TW"`, one complete `zh-Hant-TW` `copy/catalog.ts`, empty provider ledger, schema-v2 manifest, and exact four-package pins. It must build without a browser credential and its app-local `materialize-trip.ts` must remain the only Trip composer used by `trip.ts`.

Add these root scripts without weakening `check`:

```json
{
  "test:generator:v2": "vitest run tests/generation/project-manifest-v2.test.ts tests/generation/portable-enrichment-contract.test.ts tests/generation/recipe-v2.test.ts tests/generation/create-real-starter.test.ts tests/generation/generated-project.test.ts tests/scripts/atomic-publication.test.ts tests/scripts/create-trip-project.test.ts tests/scripts/enrich-trip-project.test.ts tests/scripts/verify-trip-project.test.ts tests/scripts/upgrade-trip-project.test.ts tests/scripts/sync-oak-washi-starter-presentation.test.ts tests/scripts/stage-starter-consumer.test.ts tests/scripts/stage-starter-consumer-concurrency.test.ts tests/scripts/write-registry-lockfile.test.ts plugins/eternal-pose/starter/react/src/trip-content/materialize-trip.test.ts",
  "test:tokyo:identity": "vitest run tests/examples/tokyo-content-integrity.test.ts tests/examples/tokyo-provenance.test.ts"
}
```

- [ ] **Step 4: Run the installed generated-starter gate**

```bash
test ! -e "$PWD/tmp/pre-v2-starter-presentation"
node scripts/sync-oak-washi-starter-presentation.mjs --recipe-root "$PWD/plugins/eternal-pose/recipes-v2/oak-washi/presentation" --starter-presentation-root "$PWD/plugins/eternal-pose/starter/react/src/presentation" --locale zh-Hant-TW --backup "$PWD/tmp/pre-v2-starter-presentation"
node scripts/stage-starter-consumer.mjs --out "$PWD/tmp/staged-starter" --recipe oak-washi --setup-locale zh-Hant-TW
npm --prefix "$PWD/tmp/staged-starter" run test:experience
npm --prefix "$PWD/tmp/staged-starter" run test:a11y
npm run test:starter:staged
npm run test:e2e:staged
npm test -- tests/scripts/sync-oak-washi-starter-presentation.test.ts tests/scripts/stage-starter-consumer.test.ts tests/scripts/stage-starter-consumer-concurrency.test.ts tests/generation/create-real-starter.test.ts tests/scripts/write-registry-lockfile.test.ts tests/packages/artifacts.test.ts tests/packages/clean-consumer.test.ts
```

Expected: PASS; the committed starter presentation now has the exact canonical generated inventory and hash, both generated-owned contract suites execute against that local presentation, and the staged release starter installs all four real tarballs, contains exactly one local catalog, has no Trip content, and does not contact Google. Keep `$PWD/tmp/pre-v2-starter-presentation` intact until the commit and post-commit identity check succeed; it is a recoverable local backup and is never staged.

- [ ] **Step 5: Commit the generated-starter integration**

```bash
git add package.json scripts/sync-oak-washi-starter-presentation.mjs scripts/stage-starter-consumer.mjs tests/scripts/sync-oak-washi-starter-presentation.test.ts tests/scripts/stage-starter-consumer.test.ts tests/scripts/stage-starter-consumer-concurrency.test.ts tests/generation/create-real-starter.test.ts
git add -A plugins/eternal-pose/starter/react/src/presentation
git diff --cached --check
git commit -m "feat: synchronize the canonical Oak starter"
```

---

### Task 10: Canonical Tokyo input, accepted ledger, and generated flagship identity

**Files:**
- Create: `scripts/build-tokyo-release-input.mjs`
- Create: `scripts/build-tokyo-place-selection.mjs`
- Create: `scripts/promote-tokyo-place-ledger.mjs`
- Create: `scripts/replace-generated-project.mjs`
- Create: `examples/tokyo-input/tokyo-itinerary.json`
- Create: `examples/tokyo-input/trip-input.json`
- Create: `examples/tokyo-input/place-resolutions.json`
- Create: `examples/tokyo-input/private-fact-allowlist.json`
- Create: `tests/examples/tokyo-content-integrity.test.ts`
- Create: `tests/scripts/build-tokyo-place-selection.test.ts`
- Create: `tests/scripts/promote-tokyo-place-ledger.test.ts`
- Create: `tests/scripts/replace-generated-project.test.ts`
- Modify: `tests/examples/tokyo-provenance.test.ts`
- Regenerate: `examples/tokyo/**`
- Delete: `examples/tokyo/scripts/resolve-places.mjs`
- Delete: `examples/tokyo/scripts/oracle-check.mjs`
- Delete: `examples/tokyo/src/trip-content/resolved-places.json`
- Delete: `examples/tokyo/src/trip-content/source/types.ts`
- Delete: `examples/tokyo/src/trip-content/source/tokyo-itinerary.json`
- Delete: `examples/tokyo/src/trip-content/tokyo-trip.ts`
- Delete: `examples/tokyo/src/trip-content/tokyo-trip.test.ts`
- Delete: `examples/tokyo/vendor/`
- Modify: `package.json`

**Interfaces:**
- Consumes: the current committed authored itinerary, current 89 accepted Google Place IDs, Task 4 Create, and Tasks 5–6 Enrich.
- Produces: committed `examples/tokyo-input/*` and a generated `examples/tokyo` with no presentation/runtime drift or one-off resolver.

```ts
export declare function buildTokyoReleaseInput(request: {
  sourcePath: string;
  outputPath: string;
}): Promise<TripProjectInputV2>;
export declare function buildTokyoPlaceSelection(request: {
  reviewPath: string;
  priorResolutionsPath: string;
  outputPath: string;
}): Promise<PlaceSelectionV1>;
export declare function replaceGeneratedProject(request: {
  candidateDir: string;
  targetDir: string;
  backupDir: string;
  expectedInputPath: string;
  expectedResolutionsPath: string;
}): Promise<{ backupDir: string; installedTreeSha256: string }>;
export declare function promoteTokyoPlaceLedger(request: {
  acceptedProjectDir: string;
  canonicalInputPath: string;
  destinationPath: string;
  expectedDestinationSha256?: string | null;
}): Promise<{ ledgerSha256: string }>;
```

- [ ] **Step 1: Move the authored source before changing its shape**

```bash
mkdir -p examples/tokyo-input
git mv examples/tokyo/src/trip-content/source/tokyo-itinerary.json examples/tokyo-input/tokyo-itinerary.json
```

Expected: the moved file has identical bytes and still records six authored days and every original stop/leg.

- [ ] **Step 2: Write failing Tokyo input and identity tests**

```ts
test("Tokyo release input contains six days, 100 nodes, and all 94 edges", () => {
  const input = parseTripProjectInputV2(readJson("examples/tokyo-input/trip-input.json"));
  expect(input.trip?.locale).toBe("zh-Hant-TW");
  expect(input.trip?.days).toHaveLength(6);
  expect(input.trip?.days.flatMap((day) => day.nodes)).toHaveLength(100);
  expect(input.trip?.routes).toHaveLength(94);
  expect(input.trip?.routes.filter((route) => route.mode === "unknown").map((route) => route.id)).toEqual([
    "D3-2",
    "D3-3",
  ]);
  expect(input.placeOwners).toHaveLength(90);
});

test("Tokyo accepted ledger keeps 89 resolved owners and Pelican unresolved", () => {
  const input = parseTripProjectInputV2(readJson("examples/tokyo-input/trip-input.json"));
  const ledger = parsePlaceResolutionLedger(readJson("examples/tokyo-input/place-resolutions.json"), input);
  expect(ledger.entries.filter((entry) => entry.status === "resolved")).toHaveLength(89);
  expect(ledger.entries.filter((entry) => entry.status === "unresolved")).toEqual([
    expect.objectContaining({ ownerId: "place:pelican-cafe", reason: "no-accepted-candidate" }),
  ]);
});

test("Tokyo production has no permitted private reservation or ticket facts", () => {
  expect(readJson("examples/tokyo-input/private-fact-allowlist.json")).toEqual([]);
  expect(scanTokyoProductionPrivateFacts()).toEqual([]);
});

test("generated Tokyo differs from the zero-content starter only in declared trip content and provenance hash", () => {
  const comparison = compareGeneratedProjects(starterRoot, tokyoRoot);
  expect(comparison.presentationDifferences).toEqual([]);
  expect(comparison.runtimeConfigurationDifferences).toEqual([]);
  expect(comparison.packageDifferences).toEqual([]);
  expect(comparison.manifestDifferences).toEqual(["enrichment.provenanceHash"]);
  expect(comparison.otherDifferences).toEqual([]);
});
```

Generate both `starterRoot` and `tokyoRoot` inside the test with Create, using `setupLocale: "zh-Hant-TW"` for the former and the committed Tokyo Trip/ledger for the latter. `compareGeneratedProjects` inventories normalized relative paths and SHA-256 values. Its recipe-to-output allowlist is exactly recipe-only `copy/catalog-schema.json`, `copy/en.json`, `copy/zh-Hant.json`, and `copy/resolve-copy.ts`, with `copy/catalog.ts` the sole shared path permitted to differ for a noncanonical locale; at `zh-Hant-TW` it must match byte-for-byte. Its starter-to-Tokyo allowlist is exactly `src/trip-content/trip-input.json`, `src/trip-content/place-resolutions.json`, and `eternal-pose.json`, whose only permitted semantic manifest difference is `enrichment.provenanceHash`.

Freeze `examples/tokyo-input/private-fact-allowlist.json` as the exact JSON value `[]`: no production Tokyo private reservation, ticket, account, confirmation, or unpublished benchmark-only fact is permitted. Scan authored input, accepted ledger, and generated production source against that empty oracle and fail on either a discovered fact or an added allowlist entry. Synthetic test data is not an exception to this production rule: it may exist only under the already-declared `tests/fixtures/**` or `packages/testing/src/fixtures/**` test surfaces, must use fictitious non-benchmark values, and is never scanned as Tokyo production content or shipped by a production package.

Add assertions for exact authored node order, unique node/route/place-owner IDs, shared lodging owner bindings, 92 known modes plus the two unknown modes, no benchmark coordinate/path import, no private reservation/ticket source, no `src/providers`, no `file:`/`link:`/`workspace:` dependency, and no manual Tokyo-only source outside `src/trip-content`. Assert that generated source contains only the materialized `copy/catalog.ts` plus shared `copy/schema.ts`, that its declared locale is `zh-Hant-TW`, and that neither runtime code nor output refers to `navigator.language`, `en.json`, `zh-Hant.json`, `catalog-schema.json`, or `resolve-copy.ts`.

In `promote-tokyo-place-ledger.test.ts`, read the accepted stage's manifest/input/ledger through one stable snapshot, require exact equality with the canonical input, parse every provenance entry, require the manifest provenance hash plus the fixed 89-resolved/Pelican-unresolved counts, and publish canonical JSON only through Task 2 `writeArtifactAtomically`. Cover absent and matching-hash destinations plus failures before/after stage fsync/rename; the destination remains exact old bytes/absence or complete validated new bytes. Reject stale destination hashes, a source journal, changed input/query/provenance/count, symlinked source/destination, or an existing output when the caller expected absence.

In `replace-generated-project.test.ts`, create a valid old generated target that also contains ignored residue under `node_modules/` and `dist/`, plus a complete absent-target Create output. Require `replaceGeneratedProject` to validate the candidate's exact canonical input/ledger bytes, invoke Task 2 `replaceOwnedDirectoryAtomically`, install the whole candidate, and leave the whole old tree—including ignored residue—at the declared backup. Inject failure/crash at both directory renames and validation; recovery yields one complete generation, never a merged tree. Reject a candidate generated from different input or resolutions, cross-device paths, symlinked roots, a pre-existing backup, a target outside the exact requested path, and any attempt to traverse or recursively delete the old target.

- [ ] **Step 3: Run the Tokyo tests and observe the red state**

```bash
npm test -- tests/examples/tokyo-content-integrity.test.ts tests/examples/tokyo-provenance.test.ts tests/scripts/promote-tokyo-place-ledger.test.ts tests/scripts/replace-generated-project.test.ts
```

Expected: FAIL because v2 input/ledger files and the safe whole-project replacement command do not exist, current Tokyo has only 92 edges, and presentation/runtime code is a copied 1.0 tree.

- [ ] **Step 4: Implement and run the deterministic input builder**

`build-tokyo-release-input.mjs` must read the authored source, produce node IDs `d<day>-s<two-digit-index>-<slug>`, route IDs `D<day>-<one-based-leg>`, place owner IDs `place:<slug>`, reuse one owner for repeated slugs, preserve the authored title/kind/order, and include every leg including `unknown`. It sets the sole authored locale at `trip.locale` to canonical BCP-47 `zh-Hant-TW`, which resolves by language/script to the complete `zh-Hant` reference catalog. It writes canonical `TripProjectInputV2` with this exact policy:

```json
{
  "schemaVersion": 2,
  "enrichmentPolicy": {
    "provider": "google",
    "regionCode": "JP",
    "locationBias": {
      "center": { "lat": 35.6812, "lng": 139.7671 },
      "radiusMeters": 30000
    }
  }
}
```

Create `examples/tokyo-input/private-fact-allowlist.json` separately as exact bytes `[]\n`. It is a reviewed invariant, not builder output, and neither the input builder nor Enrich may mutate it.

Run:

```bash
node scripts/build-tokyo-release-input.mjs --source "$PWD/examples/tokyo-input/tokyo-itinerary.json" --output "$PWD/examples/tokyo-input/trip-input.json"
npm test -- tests/examples/tokyo-content-integrity.test.ts -t "six days|94 edges"
```

Expected: the builder exits 0; the count/order test passes while the ledger/identity tests remain red.

- [ ] **Step 5: Produce a fresh review with server-side Places credentials**

After obtaining explicit user authorization for the billable live Places search, create an installed local-candidate Tokyo project under the repository-owned staging root. This uses the same generated source as Create and the four actual local package archives, so Enrich resolves `@laugh-tale-island/adapters/google/node` without asking npm for unpublished `2.0.0` packages:

```bash
phase05_tokyo_root="$PWD/tmp/staged-tokyo-review"
node scripts/stage-starter-consumer.mjs --out "$phase05_tokyo_root" --recipe oak-washi --trip "$PWD/examples/tokyo-input/trip-input.json"
test -n "$ETERNAL_POSE_GOOGLE_PLACES_API_KEY"
node plugins/eternal-pose/scripts/enrich-trip-project.mjs search --project "$phase05_tokyo_root" --review "$PWD/tmp/tokyo-review.json"
```

Expected: 90 owner entries, no credential output, and one shared `observedAt` timestamp. If the server key is absent or lacks Places capability, stop this task without fabricating provenance.

- [ ] **Step 6: Convert prior accepted IDs into an exact review-anchored selection**

Use the currently committed `examples/tokyo/src/trip-content/resolved-places.json` only as the prior human decision record. First write failing unit cases for a missing source title, duplicate review owner, zero or two candidate matches for one prior ID, a non-Google reference, a changed prior `queriedAs`, any count other than 89 resolved plus Pelican unresolved, and an existing output path:

```bash
npm test -- tests/scripts/build-tokyo-place-selection.test.ts
```

Expected: FAIL because `build-tokyo-place-selection.mjs` does not exist.

Implement exact title ownership: each review entry's `source` must name exactly one prior entry and its prior `queriedAs` must equal that source. For each of the 89 resolved prior entries, require exactly one candidate whose `providerReference` is `{ provider: "google", id: prior.placeId }`; never choose by rank, coordinate, or distance. Require `place:pelican-cafe` to be the sole prior unresolved entry and emit `no-accepted-candidate`. Set `reviewHash` to `sha256CanonicalJson(review)`, sort decisions by `ownerId`, and use exclusive atomic output.

Run the unit test and the real conversion:

```bash
npm test -- tests/scripts/build-tokyo-place-selection.test.ts
node scripts/build-tokyo-place-selection.mjs --review "$PWD/tmp/tokyo-review.json" --prior-resolutions "$PWD/examples/tokyo/src/trip-content/resolved-places.json" --output "$PWD/tmp/tokyo-selection.json"
```

Review the resulting 89 exact ID matches and the explicit Pelican decision against the review artifact before acceptance. Any changed or missing identity stops the task for a recorded human decision; do not substitute proximity and do not add a release-acceptance ledger.

- [ ] **Step 7: Accept, generate an absent sibling, and replace Tokyo transactionally**

```bash
node plugins/eternal-pose/scripts/enrich-trip-project.mjs accept --project "$phase05_tokyo_root" --review "$PWD/tmp/tokyo-review.json" --selection "$PWD/tmp/tokyo-selection.json"
npm test -- tests/scripts/promote-tokyo-place-ledger.test.ts
node scripts/promote-tokyo-place-ledger.mjs --accepted-project "$phase05_tokyo_root" --canonical-input "$PWD/examples/tokyo-input/trip-input.json" --destination "$PWD/examples/tokyo-input/place-resolutions.json" --expect-absent
test ! -e "$PWD/tmp/generated-tokyo-v2"
test ! -e "$PWD/tmp/pre-v2-tokyo"
node plugins/eternal-pose/scripts/create-trip-project.mjs --target "$PWD/tmp/generated-tokyo-v2" --trip "$PWD/examples/tokyo-input/trip-input.json" --resolutions "$PWD/examples/tokyo-input/place-resolutions.json"
npm test -- tests/scripts/replace-generated-project.test.ts
node scripts/replace-generated-project.mjs --candidate "$PWD/tmp/generated-tokyo-v2" --target "$PWD/examples/tokyo" --backup "$PWD/tmp/pre-v2-tokyo" --expected-input "$PWD/examples/tokyo-input/trip-input.json" --expected-resolutions "$PWD/examples/tokyo-input/place-resolutions.json"
```

Expected: Create and the transactional replacement exit 0, the installed manifest hash equals the accepted ledger hash, Pelican remains visibly unresolved, and the entire former Tokyo directory—including ignored `node_modules`/build residue—is recoverable at `$PWD/tmp/pre-v2-tokyo`.

Create publishes only into the absent candidate. `replaceGeneratedProject` then validates exact source identity and uses the Task 2 journaled whole-directory rename; it never overlays or recursively cleans the existing tree. Do not copy presentation/runtime files into Tokyo. The replacement retires the one-off resolver/oracle, 1.0 handwritten composition, and vendor tarballs listed in this task while preserving the old directory as a local recovery backup. Keep that backup until the commit and post-commit gates pass; never stage it.

- [ ] **Step 8: Install candidate tarballs and run Tokyo identity/content gates**

Append `tests/scripts/build-tokyo-place-selection.test.ts`, `tests/scripts/promote-tokyo-place-ledger.test.ts`, and `tests/scripts/replace-generated-project.test.ts` to the existing `test:generator:v2` command before running the aggregate gate; Task 9 deliberately could not name files that did not yet exist.

```bash
npm test -- tests/examples/tokyo-content-integrity.test.ts tests/examples/tokyo-provenance.test.ts tests/generation/create-real-starter.test.ts
node scripts/stage-starter-consumer.mjs --out "$PWD/tmp/phase05-task10-staged-tokyo" --recipe oak-washi --trip "$PWD/examples/tokyo-input/trip-input.json" --resolutions "$PWD/examples/tokyo-input/place-resolutions.json"
npm --prefix "$PWD/tmp/phase05-task10-staged-tokyo" run check
npm --prefix "$PWD/tmp/phase05-task10-staged-tokyo" run test:e2e
ETERNAL_POSE_CANDIDATE_ATTESTATION="$PWD/tmp/phase05-task10-staged-tokyo/.laugh-tale-local-candidates.json" node plugins/eternal-pose/scripts/validate-trip-project.mjs "$PWD/tmp/phase05-task10-staged-tokyo" --mode candidate
ETERNAL_POSE_CANDIDATE_ATTESTATION="$PWD/tmp/phase05-task10-staged-tokyo/.laugh-tale-local-candidates.json" node plugins/eternal-pose/scripts/verify-trip-project.mjs "$PWD/tmp/phase05-task10-staged-tokyo" --mode candidate
```

Expected: PASS with six days, 100 nodes, 94 edges, 89 resolved owners, Pelican unresolved, no source-worktree fallback, no manual presentation repair, and no Google request.

- [ ] **Step 9: Commit the generated flagship and canonical inputs**

```bash
git add package.json scripts/build-tokyo-release-input.mjs scripts/build-tokyo-place-selection.mjs scripts/promote-tokyo-place-ledger.mjs scripts/replace-generated-project.mjs examples/tokyo-input tests/examples/tokyo-content-integrity.test.ts tests/examples/tokyo-provenance.test.ts tests/scripts/build-tokyo-place-selection.test.ts tests/scripts/promote-tokyo-place-ledger.test.ts tests/scripts/replace-generated-project.test.ts
git add -A examples/tokyo
git diff --cached --check
git commit -m "feat: generate the canonical Tokyo flagship"
```

---

### Task 11: Route the skill through deterministic v2 commands and close Phase 05

**Files:**
- Modify: `plugins/eternal-pose/README.md`
- Modify: `plugins/eternal-pose/skills/eternal-pose/SKILL.md`
- Modify: `plugins/eternal-pose/skills/eternal-pose/references/workflow.md`
- Modify: `plugins/eternal-pose/skills/eternal-pose/references/packages.md`
- Modify: `plugins/eternal-pose/skills/eternal-pose/references/provider-boundaries.md`
- Modify: `plugins/eternal-pose/skills/eternal-pose/references/design-recipes.md`
- Modify: `plugins/eternal-pose/skills/eternal-pose/references/testing.md`
- Modify: `tests/plugin/skill-contract.test.ts`
- Create: `tests/scripts/project-reader-boundaries.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: all Phase 05 commands and version `2.0.0`.
- Produces: one portable Claude/Codex skill that invokes mechanical scripts explicitly while retaining human judgment for ingestion and place acceptance.

- [ ] **Step 1: Write the failing skill-routing test**

```ts
test("routes every mechanical v2 operation to its exact script", () => {
  const skill = readSkillAndReferences();
  for (const script of [
    "create-trip-project.mjs",
    "enrich-trip-project.mjs search",
    "enrich-trip-project.mjs accept",
    "validate-trip-project.mjs",
    "verify-trip-project.mjs",
    "upgrade-trip-project.mjs",
  ]) {
    expect(skill).toContain(script);
  }
  expect(skill).toMatch(/ETERNAL_POSE_GOOGLE_PLACES_API_KEY/);
  expect(skill).toMatch(/VITE_GOOGLE_MAPS_API_KEY/);
  expect(skill).toMatch(/--setup-locale/);
  expect(skill).toMatch(/--copy-catalog/);
  expect(skill).toMatch(/trip\.locale/);
  expect(skill).not.toMatch(/quiet-wood|sticker-brutalist|native-minimal|field-atlas/i);
});

test("installs the generated project before any installed-package command", () => {
  const workflow = readWorkflowReference();
  expect(extractRegistryWorkflow(workflow)).toEqual([
    "create-trip-project.mjs",
    "npm ci",
    "enrich-trip-project.mjs search (optional)",
    "enrich-trip-project.mjs accept (optional, after review)",
    "validate-trip-project.mjs",
    "verify-trip-project.mjs",
  ]);
  expect(workflow).toContain("stage-starter-consumer.mjs");
  expect(workflow).toMatch(/prepublication.*attested local tarballs/is);
});

```

In `project-reader-boundaries.test.ts`, enumerate Enrich search/accept, Validate, Verify, Upgrade, starter staging, Tokyo generated-project comparison, and the generated package preflight. Recursively scan their reachable project-reading modules and require each mutator to call `recoverProjectFileTransaction` before mutation and every reader to call `readProjectFileSet` (or the generated dependency-free preflight contract) before it can parse manifest/input/ledger/package/lock bytes. Reject a direct acceptance read. Assert `test:generator:v2` includes this boundary test.

Task 4 already made both plugin manifests and both local marketplace entries one `2.0.0` identity. This task documents that local identity; Phase 06 alone records the origin URL, detached full commit, plugin tree, and archive hash and performs remote candidate/default mutation.

- [ ] **Step 2: Run plugin contract tests and observe the red state**

```bash
npm test -- tests/plugin/skill-contract.test.ts tests/scripts/project-reader-boundaries.test.ts
```

Expected: FAIL because the current documentation says Version 1 and lists retired recipes and two packages, and the reader-boundary allowlist is not yet wired.

- [ ] **Step 3: Document exact workflow routing and boundaries**

Make the skill ask for missing locale/timezone before Create. With a Trip, write canonical `TripProjectInputV2` and use only `trip.locale`; without a Trip, require explicit `--setup-locale`; for a locale outside the complete `en`/`zh-Hant` references, require the validated authored `--copy-catalog` JSON. In the normal installed/registry workflow, invoke Create and then run `npm ci` inside the generated project before any Enrich, Validate/Verify execution that resolves installed packages, tests, or build tooling. Use Enrich search only with explicit server credential/configuration; pause for human selection; use Enrich accept for the only accepted-ledger mutation; run Validate then Verify; and use Upgrade only for schema-v2/same-major pin changes. State that Update and Restyle remain agent-judgment workflows but must call Validate/Verify after changes.

Document a separate prepublication contributor workflow: before `2.0.0` exists in the registry, do not run the generated registry lock against unpublished packages and do not add workspace/file fallbacks. Use `stage-starter-consumer.mjs` to build a private candidate from the four freshly packed, attested local tarballs; that command performs its own clean install before candidate-mode Validate/Verify. After `next` publication, a clean installed-plugin smoke returns to ordinary Create → `npm ci` → registry-mode Validate/Verify. The skill must never suggest Enrich before installation or an un-attested local package source.

Document all four packages and their dependency placement, `oak-washi` as the sole/default recipe, `eternal-pose.json` semantics, the separate browser/server keys, candidate-attestation requirement, journal recovery/refusal behavior, and the rule that registry mode forbids local package references. Add `tests/scripts/project-reader-boundaries.test.ts` to `test:generator:v2` without dropping any existing file.

- [ ] **Step 4: Run the focused plugin and generator gate**

```bash
npm run validate:plugins
npm run check:marketplace
npm run test:generator:v2
npm run test:tokyo:identity
```

Expected: PASS; all command references resolve inside the plugin and no retired recipe/version statement remains.

- [ ] **Step 5: Commit the deterministic skill routing**

```bash
git add plugins/eternal-pose/README.md plugins/eternal-pose/skills/eternal-pose/SKILL.md plugins/eternal-pose/skills/eternal-pose/references/workflow.md plugins/eternal-pose/skills/eternal-pose/references/packages.md plugins/eternal-pose/skills/eternal-pose/references/provider-boundaries.md plugins/eternal-pose/skills/eternal-pose/references/design-recipes.md plugins/eternal-pose/skills/eternal-pose/references/testing.md tests/plugin/skill-contract.test.ts tests/scripts/project-reader-boundaries.test.ts package.json
git diff --cached --check
git commit -m "docs: route Eternal Pose through v2 commands"
```

- [ ] **Step 6: Run the complete Phase 05 gate**

```bash
node scripts/stage-starter-consumer.mjs --out "$PWD/tmp/staged-starter" --recipe oak-washi --setup-locale zh-Hant-TW
LAUGH_TALE_STARTER_ROOT="$PWD/tmp/staged-starter" npm run check
npm --prefix "$PWD/tmp/staged-starter" run test:experience
npm --prefix "$PWD/tmp/staged-starter" run test:a11y
npm run test:starter:staged
npm run test:e2e:staged
npm run test:generator:v2
npm run test:tokyo:identity
node scripts/stage-starter-consumer.mjs --out "$PWD/tmp/phase05-gate-staged-tokyo" --recipe oak-washi --trip "$PWD/examples/tokyo-input/trip-input.json" --resolutions "$PWD/examples/tokyo-input/place-resolutions.json"
npm --prefix "$PWD/tmp/phase05-gate-staged-tokyo" run check
npm --prefix "$PWD/tmp/phase05-gate-staged-tokyo" run test:e2e
node plugins/eternal-pose/scripts/scan-publication.mjs "$PWD/plugins/eternal-pose"
ETERNAL_POSE_CANDIDATE_ATTESTATION="$PWD/tmp/phase05-gate-staged-tokyo/.laugh-tale-local-candidates.json" node plugins/eternal-pose/scripts/validate-trip-project.mjs "$PWD/tmp/phase05-gate-staged-tokyo" --mode candidate
ETERNAL_POSE_CANDIDATE_ATTESTATION="$PWD/tmp/phase05-gate-staged-tokyo/.laugh-tale-local-candidates.json" node plugins/eternal-pose/scripts/verify-trip-project.mjs "$PWD/tmp/phase05-gate-staged-tokyo" --mode candidate
git diff --check
```

Expected: every command exits 0; staged starter and Tokyo use four owned tarballs, Create defaults to Oak & Washi, Tokyo has the exact content/identity counts, and all source-changing commands pass their failure-atomicity suites. Plan 06 may now build immutable release artifacts and begin parity closure; Phase 05 itself performs no external publication.

---

## Phase 05 Completion Evidence

Record these values in the execution report before starting Plan 06:

- final Phase 05 commit SHA;
- `npm run check`, staged starter, staged E2E, generator, Tokyo identity, staged Tokyo check, and staged Tokyo E2E exit codes;
- SHA-256 of `examples/tokyo-input/trip-input.json` and `examples/tokyo-input/place-resolutions.json`;
- Tokyo counts: six days, 100 nodes, 94 edges, 89 resolved owners, one unresolved owner;
- selected locale `zh-Hant-TW`, materialized `copy/catalog.ts` SHA-256, absence of the four recipe-only catalog source files, and byte-identical starter/Tokyo presentation inventory;
- generated `eternal-pose.json` values: schema 2, generator 2.0.0, recipe `oak-washi` at 2.0.0, presentation contract 2, all four package versions, and matching enrichment hash;
- clean `git diff --check` output;
- confirmation that Phase 05 created no parity/acceptance ledger and that Phase 06 will map the baseline audit's 71 rows directly;
- confirmation that no npm publish, Git push, marketplace-default mutation, or `origin/main` update occurred.
