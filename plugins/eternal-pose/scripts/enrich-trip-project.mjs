import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { realpath } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";

import { readProjectFileSet, recoverProjectFileTransaction, replaceProjectFiles, writeArtifactAtomically } from "../lib/atomic-publication.mjs";
import { canonicalizeJson, sha256CanonicalJson } from "../lib/canonical-json.mjs";
import { acceptedLedgerFromReview, parsePlaceResolutionLedger, parsePlaceReviewArtifact, parsePlaceSelection } from "../lib/place-resolution-ledger.mjs";
import { assertManifestMatchesLedger, parseTripProjectManifest } from "../lib/project-manifest-v2.mjs";
import { createPortablePlaceResolutionProvenance, createPortablePlaceSearchQuery, assertPortableEnrichmentConformance } from "../lib/portable-enrichment-contract.mjs";
import { inspectPath, readRegularFile, samePathIdentity } from "../lib/path-safety.mjs";
import { parseTripProjectInputV2 } from "../lib/trip-project-input-v2.mjs";

const FILES = ["package.json", "eternal-pose.json", "src/trip-content/trip-input.json", "src/trip-content/place-resolutions.json"];
const PACKAGES = { "@laugh-tale-island/core": "dependencies", "@laugh-tale-island/react": "dependencies", "@laugh-tale-island/adapters": "dependencies", "@laugh-tale-island/testing": "devDependencies" };
const FAILURE_REASONS = new Set(["missing-configuration", "loader-failed", "request-denied", "not-found", "malformed-response", "implausible-result", "network", "cancelled", "unsupported"]);
const USAGE = "Usage: node enrich-trip-project.mjs search --project /absolute/project --review /absolute/review.json\n       node enrich-trip-project.mjs accept --project /absolute/project --review /absolute/review.json --selection /absolute/selection.json";
export { parsePlaceReviewArtifact } from "../lib/place-resolution-ledger.mjs";

function fail(message) { throw new Error(message); }
function plain(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactPath(value, label) { if (typeof value !== "string" || !isAbsolute(value) || resolve(value) !== value) fail(`${label} must be an absolute normalized path`); return value; }
function assertReviewDestination(projectDir, reviewPath) { if (FILES.some((name) => join(projectDir, name) === reviewPath)) fail("review destination overlaps an accepted project file"); }
function json(bytes, field) { try { return JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { fail(`${field} must be valid JSON`); } }
function contained(parent, child) { const path = relative(parent, child); return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path); }

function declaredPackages(packageJson, manifest) {
  if (!plain(packageJson)) fail("package.json must be an object");
  for (const [name, section] of Object.entries(PACKAGES)) {
    const occurrences = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].filter((candidate) => Object.hasOwn(packageJson[candidate] ?? {}, name));
    if (occurrences.length !== 1 || occurrences[0] !== section || packageJson[section][name] !== manifest.packages[name]) fail(`package declaration mismatch: ${name}`);
  }
}

function parseProjectFiles(files) {
  const packageJson = json(files.get(FILES[0]), FILES[0]);
  const manifest = parseTripProjectManifest(json(files.get(FILES[1]), FILES[1]));
  const input = parseTripProjectInputV2(json(files.get(FILES[2]), FILES[2]));
  const ledger = parsePlaceResolutionLedger(json(files.get(FILES[3]), FILES[3]), input);
  assertManifestMatchesLedger(manifest, ledger);
  declaredPackages(packageJson, manifest);
  if (input.trip === null || input.enrichmentPolicy === null) fail("search requires a Trip and enrichment policy");
  return { packageJson, manifest, input, ledger };
}

async function projectSnapshot(projectDir) {
  const files = await readProjectFileSet({ projectDir, paths: FILES });
  return { ...parseProjectFiles(files), files };
}

async function destinationHash(reviewPath) {
  if (!await inspectPath(reviewPath)) return null;
  return (await readRegularFile(reviewPath)).hash;
}

function resultEntry(result, provenance) {
  if (!plain(result)) fail("place search result invalid");
  const base = { provenanceSchemaVersion: provenance.schemaVersion, ownerId: provenance.ownerId, source: provenance.source, query: provenance.query };
  if (result.status === "unavailable") {
    if (!FAILURE_REASONS.has(result.reason) || typeof result.retryable !== "boolean") fail("place search unavailable result invalid");
    return { ...base, result: "unavailable", unavailableReason: result.reason, candidates: [] };
  }
  if (result.status !== "ready" || !Array.isArray(result.candidates) || result.candidates.length > 3) fail("place search candidates invalid");
  return { ...base, result: "candidates", candidates: result.candidates.map((item) => ({
    providerReference: item?.providerReference,
    displayName: item?.displayName,
    formattedAddress: item?.formattedAddress,
    coordinates: item?.coordinates,
    categories: item?.categories,
  })) };
}

async function searchSnapshot({ reviewPath, adapter, observedAt = () => new Date() }, snapshot, testOperations) {
  if (!adapter || typeof adapter.search !== "function") fail("place search adapter required");
  const { input } = snapshot;
  const expectedDestinationSha256 = await destinationHash(reviewPath);
  const date = observedAt();
  if (!(date instanceof Date) || !Number.isFinite(date.valueOf())) fail("observedAt clock invalid");
  const timestamp = date.toISOString();
  const entries = [];
  for (const owner of [...input.placeOwners].sort((left, right) => left.ownerId < right.ownerId ? -1 : left.ownerId > right.ownerId ? 1 : 0)) {
    const query = createPortablePlaceSearchQuery({ ownerId: owner.ownerId, text: owner.query.text, locale: input.trip.locale, regionCode: input.enrichmentPolicy.regionCode, locationBias: input.enrichmentPolicy.locationBias });
    if (canonicalizeJson(query) !== canonicalizeJson(owner.query)) fail("owner query does not match enrichment policy");
    const provenance = createPortablePlaceResolutionProvenance({ ownerId: owner.ownerId, source: owner.source, query, provider: "google", observedAt: timestamp });
    const result = await adapter.search(globalThis.structuredClone(query), new globalThis.AbortController().signal);
    entries.push(resultEntry(result, provenance));
  }
  const review = parsePlaceReviewArtifact({ schemaVersion: 1, project: { tripId: input.trip.id, inputHash: sha256CanonicalJson(input) }, provider: "google", observedAt: timestamp, policy: input.enrichmentPolicy, entries }, input);
  await writeArtifactAtomically({ destination: reviewPath, contents: `${canonicalizeJson(review)}\n`, mode: 0o600, expectedDestinationSha256 }, testOperations);
  return review;
}

export async function searchTripPlaces(request, testOperations) {
  if (!plain(request)) fail("search request required");
  const projectDir = exactPath(request.projectDir, "project");
  const reviewPath = exactPath(request.reviewPath, "review");
  assertReviewDestination(projectDir, reviewPath);
  if (await realpath(projectDir) !== projectDir) fail("project must be a real directory");
  const snapshot = await projectSnapshot(projectDir);
  return searchSnapshot({ ...request, projectDir, reviewPath }, snapshot, testOperations);
}

export async function acceptTripPlaceSelections(request, testOperations) {
  if (!plain(request)) fail("accept request required");
  const projectDir = exactPath(request.projectDir, "project");
  const reviewPath = exactPath(request.reviewPath, "review");
  const selectionPath = exactPath(request.selectionPath, "selection");
  assertReviewDestination(projectDir, reviewPath);
  assertReviewDestination(projectDir, selectionPath);
  if (reviewPath === selectionPath) fail("review and selection paths must differ");
  if (await realpath(projectDir) !== projectDir) fail("project must be a real directory");
  await recoverProjectFileTransaction(projectDir);
  const snapshot = await projectSnapshot(projectDir);
  const reviewFile = await readRegularFile(reviewPath);
  const selectionFile = await readRegularFile(selectionPath);
  const review = parsePlaceReviewArtifact(json(reviewFile.bytes, "review"), snapshot.input);
  const selection = parsePlaceSelection(json(selectionFile.bytes, "selection"), review);
  const nextLedger = acceptedLedgerFromReview(review, selection, snapshot.input);
  const nextManifest = parseTripProjectManifest({
    ...snapshot.manifest,
    enrichment: { ...snapshot.manifest.enrichment, schemaVersion: 1, provenanceHash: sha256CanonicalJson(nextLedger) },
  });
  async function assertExternalStable() {
    for (const [path, expected] of [[reviewPath, reviewFile], [selectionPath, selectionFile]]) {
      const current = await readRegularFile(path);
      if (!samePathIdentity(current.identity, expected.identity) || current.hash !== expected.hash) fail(`external file identity changed: ${path}`);
    }
  }
  async function validateAcceptedProject(stageView) {
    const stagedFiles = new Map(await Promise.all(FILES.map(async (name) => [name, (await readRegularFile(join(stageView, name))).bytes])));
    const staged = parseProjectFiles(stagedFiles);
    for (const name of [FILES[0], FILES[2]]) {
      if (!Buffer.from(stagedFiles.get(name)).equals(snapshot.files.get(name))) fail(`project input changed during transaction: ${name}`);
    }
    if (stageView !== projectDir) {
      for (const name of [FILES[1], FILES[3]]) {
        const current = (await readRegularFile(join(projectDir, name))).bytes;
        if (!current.equals(snapshot.files.get(name))) fail(`project generation changed during transaction: ${name}`);
      }
    }
    if (sha256CanonicalJson(staged.input) !== review.project.inputHash ||
        canonicalizeJson(staged.manifest) !== canonicalizeJson(nextManifest) ||
        canonicalizeJson(staged.ledger) !== canonicalizeJson(nextLedger)) fail("accepted project changed during transaction");
    await assertExternalStable();
  }
  await assertExternalStable();
  await replaceProjectFiles({
    projectDir,
    replacements: new Map([
      ["eternal-pose.json", `${canonicalizeJson(nextManifest)}\n`],
      ["src/trip-content/place-resolutions.json", `${canonicalizeJson(nextLedger)}\n`],
    ]),
    allowedPaths: new Set(["eternal-pose.json", "src/trip-content/place-resolutions.json"]),
    validate: validateAcceptedProject,
  }, testOperations);
  return nextLedger;
}

async function installedAdapter(projectDir, manifest) {
  const require = createRequire(join(projectDir, "package.json"));
  const root = await realpath(join(projectDir, "node_modules"));
  if (!contained(projectDir, root)) fail("project node_modules must be inside project");
  async function load(packageName, subpath) {
    const packageRoot = await realpath(join(root, packageName));
    if (!contained(root, packageRoot)) fail("installed package resolved outside project node_modules");
    const installed = json((await readRegularFile(join(packageRoot, "package.json"))).bytes, `${packageName}/package.json`);
    if (installed.name !== packageName || installed.version !== manifest.packages[packageName]) fail(`installed package version mismatch: ${packageName}`);
    const specifier = `${packageName}/${subpath}`;
    const file = await realpath(require.resolve(specifier));
    if (!contained(packageRoot, file)) fail("installed package resolved outside declared package");
    return import(pathToFileURL(file).href);
  }
  const core = await load("@laugh-tale-island/core", "enrichment");
  assertPortableEnrichmentConformance(core);
  const adapters = await load("@laugh-tale-island/adapters", "google/node");
  if (typeof adapters.GooglePlaceSearchAdapter !== "function") fail("installed Google place search adapter missing");
  return adapters.GooglePlaceSearchAdapter;
}

async function main(args) {
  if (args[0] === "accept") {
    if (args.length !== 7 || args[1] !== "--project" || args[3] !== "--review" || args[5] !== "--selection") fail(USAGE);
    await acceptTripPlaceSelections({ projectDir: args[2], reviewPath: args[4], selectionPath: args[6] });
    return;
  }
  if (args.length !== 5 || args[0] !== "search" || args[1] !== "--project" || args[3] !== "--review") fail(USAGE);
  const projectDir = exactPath(args[2], "project"); const reviewPath = exactPath(args[4], "review");
  assertReviewDestination(projectDir, reviewPath);
  if (await realpath(projectDir) !== projectDir) fail("project must be a real directory");
  const snapshot = await projectSnapshot(projectDir);
  const GooglePlaceSearchAdapter = await installedAdapter(projectDir, snapshot.manifest);
  const key = process.env.ETERNAL_POSE_GOOGLE_PLACES_API_KEY?.trim();
  if (!key) fail("ETERNAL_POSE_GOOGLE_PLACES_API_KEY is required");
  await searchSnapshot({ projectDir, reviewPath, adapter: new GooglePlaceSearchAdapter({ apiKey: key, fetch: globalThis.fetch }) }, snapshot);
}

if (process.argv[1] && await realpath(resolve(process.argv[1])) === await realpath(fileURLToPath(import.meta.url))) {
  try { await main(process.argv.slice(2)); }
  catch (error) { console.error(error?.message === "ETERNAL_POSE_GOOGLE_PLACES_API_KEY is required" ? error.message : `Enrich ${process.argv[2] === "accept" ? "accept" : "search"} failed`); process.exitCode = 1; }
}
