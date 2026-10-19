# Workflow

Use this lifecycle for every intent. Scale the work to the request, but do not skip preservation or verification.

## Create inputs and locale

Reconcile the user's material into canonical `TripProjectInputV2` JSON: `{ "schemaVersion": 2, "trip": ..., "enrichmentPolicy": ..., "placeOwners": [...] }`. The input file identifies the whole authored Trip and its owner queries; it is not a raw provider response or an accepted ledger. For an authored Trip, ask for missing locale and IANA timezone before Create. With a Trip, use only `trip.locale` and its authored timezone; do not pass `--setup-locale` as an override.

Without a Trip, ask only for the intended setup locale and use `--setup-locale zh-Hant-TW` (or the supplied locale) instead of `--trip`; the IANA timezone becomes required when Trip content is supplied. Do not infer locale from the browser or machine. Complete reference catalogs cover `en` and `zh-Hant`, including matching regional locales such as `zh-Hant-TW`. Every other locale requires a complete, validated authored catalog JSON through `--copy-catalog /absolute/catalog.json`; do not translate or fill missing copy silently.

The packaged schema is `$EP_PLUGIN/recipes-v2/oak-washi/presentation/copy/catalog-schema.json`. Full reference catalogs are `$EP_PLUGIN/recipes-v2/oak-washi/presentation/copy/en.json` and `$EP_PLUGIN/recipes-v2/oak-washi/presentation/copy/zh-Hant.json`. Use those exact fields/placeholders to author the matching locale catalog. Create validates the supplied JSON against its complete copy contract and materializes it; there is no separate catalog-validation CLI to invent.

## Installed registry workflow

Use this when all four pinned packages exist in the registry. Resolve `EP_PLUGIN` to the installed plugin root (the directory containing `scripts/`), `EP_PROJECT` to a missing/empty absolute target, and `EP_INPUT` to the authored input JSON.

<!-- registry-workflow -->
1. `create-trip-project.mjs`
2. `npm ci`
3. `enrich-trip-project.mjs search` (optional)
4. `enrich-trip-project.mjs accept` (optional, after review)
5. `validate-trip-project.mjs`
6. `verify-trip-project.mjs`
<!-- /registry-workflow -->

```sh
EP_PLUGIN=/absolute/installed/eternal-pose
EP_PROJECT=/absolute/output/my-trip
EP_INPUT=/absolute/input/trip-input.json
node "$EP_PLUGIN/scripts/create-trip-project.mjs" --target "$EP_PROJECT" --trip "$EP_INPUT" --recipe oak-washi
(cd "$EP_PROJECT" && npm ci)
```

For an empty starter, replace the Create invocation with:

```sh
node "$EP_PLUGIN/scripts/create-trip-project.mjs" --target "$EP_PROJECT" --setup-locale zh-Hant-TW
```

For a supplied Trip with another locale, after authoring the complete matching catalog:

```sh
node "$EP_PLUGIN/scripts/create-trip-project.mjs" --target "$EP_PROJECT" --trip "$EP_INPUT" --copy-catalog /absolute/input/catalog.json
```

Do not run Enrich or installed-package validation/test/build commands before installation. For optional place enrichment, obtain explicit authorization and configured server `ETERNAL_POSE_GOOGLE_PLACES_API_KEY` outside committed files. The separate browser `VITE_GOOGLE_MAPS_API_KEY` enables the map and cannot substitute for that server credential. See `provider-boundaries.md`.

```sh
node "$EP_PLUGIN/scripts/enrich-trip-project.mjs" search --project "$EP_PROJECT" --review /absolute/private/place-review.json
```

Pause for human selection from the review's candidates. Author a selection JSON with `schemaVersion: 1`, `reviewHash` (SHA-256 of canonical review JSON, not raw pretty-printed bytes), and one decision per review owner. A resolved decision has `ownerId`, `status: "resolved"`, and the selected candidate's exact `providerReference: { provider: "google", id: ... }`; an unresolved decision has `ownerId`, `status: "unresolved"`, and `reason: "ambiguous"` or `"no-accepted-candidate"`. Compute the hash with the plugin's exported `sha256CanonicalJson` from `lib/canonical-json.mjs`. Do not preselect places or manufacture provider observations. Runtime candidate confirmation is separate from this acceptance.

Print only the canonical hash to copy into `reviewHash`:

```sh
node --input-type=module - "$EP_PLUGIN" /absolute/private/place-review.json <<'NODE'
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const [plugin, reviewPath] = process.argv.slice(2);
const { sha256CanonicalJson } = await import(pathToFileURL(plugin + "/lib/canonical-json.mjs").href);
console.log(sha256CanonicalJson(JSON.parse(await readFile(reviewPath, "utf8"))));
NODE
```

```sh
node "$EP_PLUGIN/scripts/enrich-trip-project.mjs" accept --project "$EP_PROJECT" --review /absolute/private/place-review.json --selection /absolute/private/place-selection.json
node "$EP_PLUGIN/scripts/validate-trip-project.mjs" "$EP_PROJECT" --mode registry
node "$EP_PLUGIN/scripts/verify-trip-project.mjs" "$EP_PROJECT" --mode registry
```

Enrich accept is the only accepted-ledger mutation: it atomically updates the ledger and matching manifest hash after validating the review and decisions. If enrichment is omitted, run the last two commands directly and report unresolved owners. A null-Trip starter truthfully fails trip-readiness validation until authored content is supplied.

## Prepublication contributor workflow

Before 2.0.0 is published, the generated registry lock cannot install unpublished packages. In a contributor checkout, use `stage-starter-consumer.mjs` with four freshly packed, attested local tarballs. It builds/packs core, react, adapters, and testing, validates package identity, and performs its own clean install into a private owned candidate. Do not use workspace links, copied package internals, arbitrary archives, or `--no-install` as a readiness substitute.

```sh
EP_REPO=/absolute/laugh-tale
EP_CANDIDATE="$EP_REPO/tmp/my-candidate"
node "$EP_REPO/scripts/stage-starter-consumer.mjs" --out "$EP_CANDIDATE" --recipe oak-washi --trip /absolute/input/trip-input.json
ETERNAL_POSE_CANDIDATE_ATTESTATION="$EP_CANDIDATE/.laugh-tale-local-candidates.json" node "$EP_REPO/plugins/eternal-pose/scripts/validate-trip-project.mjs" "$EP_CANDIDATE" --mode candidate
ETERNAL_POSE_CANDIDATE_ATTESTATION="$EP_CANDIDATE/.laugh-tale-local-candidates.json" node "$EP_REPO/plugins/eternal-pose/scripts/verify-trip-project.mjs" "$EP_CANDIDATE" --mode candidate
```

The staging command also accepts `--setup-locale` instead of `--trip`, and `--copy-catalog` where required. Supply `--resolutions /absolute/accepted-ledger.json` only when real reviewed provenance already exists; absence means a normal unreviewed Create, not accepted places. Candidate mode checks the four archive names/versions, size, SHA-256, lock/specifier identity, and supplied integrity against `.laugh-tale-local-candidates.json`. It does not establish human acceptance or live provider success.

After `next` publication, a clean installed-plugin smoke returns to ordinary Create → `npm ci` → registry-mode Validate → Verify. Registry mode forbids local package references.

## Upgrade and existing projects

Update and Restyle require agent judgment and preservation of custom IA/UI. Finish changes with Validate then Verify using the project's appropriate registry/candidate mode.

Upgrade supports only schema-v2, same presentation-contract major, and exact package/tool versions. The existing `upgrade-trip-project.mjs` entry is an exported API, not a flags CLI. For explicitly chosen published 2.x versions, invoke it as:

```sh
node --input-type=module - "$EP_PLUGIN" "$EP_PROJECT" 2.0.0 2.0.0 <<'NODE'
import { pathToFileURL } from "node:url";
const [plugin, projectDir, packagesVersion, toolVersion] = process.argv.slice(2);
const { upgradeTripProject } = await import(pathToFileURL(plugin + "/scripts/upgrade-trip-project.mjs").href);
await upgradeTripProject({ projectDir, packagesVersion, toolVersion });
NODE
(cd "$EP_PROJECT" && npm ci)
node "$EP_PLUGIN/scripts/validate-trip-project.mjs" "$EP_PROJECT" --mode registry
node "$EP_PLUGIN/scripts/verify-trip-project.mjs" "$EP_PROJECT" --mode registry
```

Replace the example versions with the approved exact same-major release. Upgrade atomically changes only `package.json`, `package-lock.json`, and `eternal-pose.json`, using package-lock-only regeneration. Existing `node_modules` stays unchanged. The supported sequence is successful Upgrade → `npm ci` in the project → Validate → Verify; a lock change alone cannot certify the upgraded installed runtime.

## Transaction ownership

Readers refuse an active or uncertain project transaction, including a parent directory-replacement journal, before parsing accepted project bytes. Retry after the owning writer finishes; do not delete journals or force a read. Actual project mutators use recovery and a stable snapshot; private transaction validation reads its owned stage while holding writer authority. Enrich search reads a stable accepted project and atomically publishes a separate review artifact; it must not recover or mutate the accepted project. Staging and other owned publishers recover through their writer seam. Validate is source-read-only; Verify executes installed tooling in the project with owned temporary output/cache/environment directories and checks source identity before and after every command. Enrich's installed-package loader refuses dependency links escaping the project.

## Inspect

- Identify whether the target is empty, an Eternal Pose-generated site, or another existing application.
- Read repository instructions, package scripts, project contracts, trip content, tests, and the user-supplied sources before proposing changes.
- Establish the exact target for Create. Reject a non-empty target rather than force-copying a starter into it.
- Explore an existing site's actual structure. Do not assume starter paths, component names, or state organization survived customization.
- Read `eternal-pose.json` when present and note its recorded `packages` versions for later comparison (see `packages.md`).
- Record the chosen intent and the requested scope. Treat Audit as zero-write from this point onward.

## Ingest

- Accept prose, Markdown, CSV, TSV, JSON, document text, URLs, and conversation decisions without requiring the user to translate them into a schema.
- Keep source statements, provider-returned data, and agent inference distinguishable.
- Treat tickets, passports, email, attachments, contact details, and reservation documents as sensitive inputs. Do not copy raw inputs into a repository by default.
- Read all supplied material before asking questions. Ask only when a contradiction or missing core fact would materially change the result.

## Reconcile

- Normalize dates, the trip's IANA timezone, cross-midnight offsets, lodging bases, candidate groups, reservations, and movement between itinerary nodes.
- Identify conflicting dates, booked times, destinations, impossible ordering, and unresolved place identity.
- Preserve non-blocking uncertainty as confirmed, suggested, candidate, or unverified instead of inventing an answer.
- Stop and ask when the core destination or travel dates cannot be identified safely.

## Draft

- In Create, produce a locally runnable independent trip site from the approved starter when it is available. Keep the generated site independent of the plugin at runtime.
- Use the default design recipe only when the user has not supplied a style direction; include only the selected recipe in the output.
- Store canonical trip facts in typed content with validation, not as a user-maintained raw schema requirement.
- Include source notes needed to explain uncertainty without copying sensitive source documents.

## Refine

- Work by requested day, semantic type, candidate group, route, or visual surface.
- In Update and Enrich, plan the smallest coherent diff and preserve unrelated facts, stable IDs, tests, and user-authored IA/UI.
- In Restyle, allow home pages, section order, renderers, typography, palette, and component organization to change while retaining the protected experience contract.
- Never repair validation by deleting custom files or replacing an existing site wholesale.

## Verify

- Recheck semantic validation, timing, candidates, tasks, reservations, progress, route ownership, map/list synchronization, sheet geometry, accessibility, provider boundaries, and safety.
- Run the repository's relevant unit, type, lint, build, and browser gates described in `testing.md`.
- Report drift between recorded, declared, and installed package versions as a finding; never rewrite versions silently.
- Report failures and limitations precisely. Do not translate a partial result into a readiness claim.

## Publish

- End locally unless the user explicitly authorizes an external action.
- Before any authorized publication, read `safety-and-deployment.md`, scan tracked and generated content, explain visibility, and confirm the exact remote or hosting target.
- Treat remote creation, public visibility, push, hosting-project creation, and deployment as separate approval gates.
- Stop after readiness preparation when approval covers preparation only.
