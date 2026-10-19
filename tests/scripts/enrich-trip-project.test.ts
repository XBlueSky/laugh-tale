import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import type { PlaceSearchAdapter, PlaceSearchQuery, PlaceSearchResult } from "@laugh-tale-island/core/enrichment";

const script = fileURLToPath(new URL("../../plugins/eternal-pose/scripts/enrich-trip-project.mjs", import.meta.url));
const lib = fileURLToPath(new URL("../../plugins/eternal-pose/lib/", import.meta.url));
const { canonicalizeJson, sha256CanonicalJson } = await import(join(lib, "canonical-json.mjs")) as { canonicalizeJson: (value: unknown) => string; sha256CanonicalJson: (value: unknown) => string };
const { buildTripProjectManifest } = await import(join(lib, "project-manifest-v2.mjs")) as { buildTripProjectManifest: (request: { generatorVersion: string; recipeId: string; recipeSourceVersion: string; packageVersion: string; ledger: unknown }) => unknown };
const { unresolvedLedgerForInput, parsePlaceReviewArtifact } = await import(join(lib, "place-resolution-ledger.mjs")) as { unresolvedLedgerForInput: (input: unknown) => unknown; parsePlaceReviewArtifact: (review: unknown, input: unknown) => Review };
const { snapshotTree } = await import(join(lib, "path-safety.mjs")) as { snapshotTree: (path: string) => Promise<unknown> };

type Operations = { beforeMutation?: (event: { phase: string }) => void | Promise<void> };
type ReviewEntry = { provenanceSchemaVersion: number; ownerId: string; source: string; query: PlaceSearchQuery; result: string; unavailableReason?: string; candidates: unknown[]; observedAt?: string };
type Review = { schemaVersion: number; project: { tripId: string; inputHash: string }; provider: string; observedAt: string; policy: unknown; entries: ReviewEntry[] };
type SelectionDecision = { ownerId: string; status: string; providerReference?: { provider: string; id: string }; reason?: string };
type Selection = { schemaVersion: number; reviewHash: string; decisions: SelectionDecision[] };
type Ledger = { entries: Array<{ ownerId: string; status: string; source: string; query: PlaceSearchQuery; provider?: string; observedAt?: string; accepted?: ReturnType<typeof candidate>; reason?: string }> };
type Manifest = { enrichment: { schemaVersion: number; provenanceHash: string } };
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const bias = { center: { lat: 35.68, lng: 139.76 }, radiusMeters: 5000 };
const policy = { provider: "google", regionCode: "JP", locationBias: bias };
const queries = {
  museum: { ownerId: "place:museum", text: "Museum", locale: "zh-Hant-TW", regionCode: "JP", locationBias: bias, maxCandidates: 3 },
  cafe: { ownerId: "place:cafe", text: "Cafe", locale: "zh-Hant-TW", regionCode: "JP", locationBias: bias, maxCandidates: 3 },
};
const trip = {
  id: "sample-trip", title: "Sample", locale: "zh-Hant-TW", timezone: "Asia/Tokyo", startDate: "2026-09-04", endDate: "2026-09-04",
  days: [{ id: "day-1", date: "2026-09-04", title: "Day", nodes: [
    { id: "museum", dayId: "day-1", kind: "sightseeing", title: "Museum", timing: { certainty: "unknown" }, optionality: "core", payload: {} },
    { id: "cafe", dayId: "day-1", kind: "dining", title: "Cafe", timing: { certainty: "unknown" }, optionality: "core", payload: {} },
  ] }], routes: [], candidateGroups: [], reservations: [], tasks: [],
};
function input() {
  return { schemaVersion: 2, trip: structuredClone(trip), enrichmentPolicy: structuredClone(policy), placeOwners: [
    { ownerId: "place:museum", source: "itinerary", query: structuredClone(queries.museum), bindings: [{ kind: "node", id: "museum" }] },
    { ownerId: "place:cafe", source: "itinerary", query: structuredClone(queries.cafe), bindings: [{ kind: "node", id: "cafe" }] },
  ] };
}
async function fixture(value: unknown = input(), priorReview?: string) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "enrich-search-"))); roots.push(root);
  const projectDir = join(root, "project"); const reviewPath = join(root, "review.json");
  await mkdir(join(projectDir, "src/trip-content"), { recursive: true });
  const ledger = unresolvedLedgerForInput(value);
  const manifest = buildTripProjectManifest({ generatorVersion: "2.0.0", recipeId: "oak-washi", recipeSourceVersion: "2.0.0", packageVersion: "2.0.0", ledger });
  await writeFile(join(projectDir, "package.json"), canonicalizeJson({ dependencies: { "@laugh-tale-island/core": "2.0.0", "@laugh-tale-island/react": "2.0.0", "@laugh-tale-island/adapters": "2.0.0" }, devDependencies: { "@laugh-tale-island/testing": "2.0.0" } }));
  await writeFile(join(projectDir, "eternal-pose.json"), canonicalizeJson(manifest));
  await writeFile(join(projectDir, "src/trip-content/trip-input.json"), canonicalizeJson(value));
  await writeFile(join(projectDir, "src/trip-content/place-resolutions.json"), canonicalizeJson(ledger));
  if (priorReview !== undefined) await writeFile(reviewPath, priorReview);
  return { root, projectDir, reviewPath, value };
}
async function api() { return await import(script) as { searchTripPlaces: (request: { projectDir: string; reviewPath: string; adapter: PlaceSearchAdapter; observedAt?: () => Date }, operations?: Operations) => Promise<Review>; acceptTripPlaceSelections: (request: { projectDir: string; reviewPath: string; selectionPath: string }, operations?: Operations) => Promise<unknown> }; }
function candidate(id: string) { return { providerReference: { provider: "google", id }, displayName: `Place ${id}`, formattedAddress: "Tokyo", coordinates: { lat: 35.68, lng: 139.76 }, categories: ["museum", "point_of_interest"] }; }
function adapter(result: (query: PlaceSearchQuery) => PlaceSearchResult): PlaceSearchAdapter { return { search(query) { return Promise.resolve(result(query)); } }; }
function request(f: Awaited<ReturnType<typeof fixture>>, searchAdapter: PlaceSearchAdapter) { return { projectDir: f.projectDir, reviewPath: f.reviewPath, adapter: searchAdapter, observedAt: () => new Date("2026-09-04T08:00:00.000Z") }; }
function failOnceAt(phase: string): Operations { let failed = false; return { beforeMutation(event) { if (!failed && event.phase === phase) { failed = true; throw new Error(`injected ${phase}`); } } }; }
async function projectReviewAndSelection(value: unknown = input(), result?: (query: PlaceSearchQuery) => PlaceSearchResult) {
  const f = await fixture(value);
  const review = await (await api()).searchTripPlaces(request(f, adapter(result ?? ((query) => ({ status: "ready", candidates: [candidate(query.ownerId)] })))));
  const selectionPath = join(f.root, "selection.json");
  const selection: Selection = { schemaVersion: 1, reviewHash: sha256CanonicalJson(review), decisions: review.entries.map((entry) => entry.result === "unavailable"
    ? { ownerId: entry.ownerId, status: "unresolved", reason: "no-accepted-candidate" }
    : { ownerId: entry.ownerId, status: "resolved", providerReference: (entry.candidates[0] as ReturnType<typeof candidate>).providerReference }) };
  await writeFile(selectionPath, canonicalizeJson(selection));
  return { ...f, review, selection, selectionPath };
}
async function readAccepted(f: Awaited<ReturnType<typeof projectReviewAndSelection>>) {
  const ledger = JSON.parse(await readFile(join(f.projectDir, "src/trip-content/place-resolutions.json"), "utf8")) as Ledger;
  const manifest = JSON.parse(await readFile(join(f.projectDir, "eternal-pose.json"), "utf8")) as Manifest;
  return { ledger, manifest };
}
async function installCliStubs(f: Awaited<ReturnType<typeof fixture>>, adapterSource: string) {
  const coreRoot = join(f.projectDir, "node_modules/@laugh-tale-island/core");
  const adapterRoot = join(f.projectDir, "node_modules/@laugh-tale-island/adapters");
  await mkdir(join(coreRoot, "dist"), { recursive: true }); await mkdir(join(adapterRoot, "dist"), { recursive: true });
  await writeFile(join(coreRoot, "package.json"), JSON.stringify({ name: "@laugh-tale-island/core", version: "2.0.0", type: "module", exports: { "./enrichment": "./dist/enrichment.js" } }));
  await writeFile(join(adapterRoot, "package.json"), JSON.stringify({ name: "@laugh-tale-island/adapters", version: "2.0.0", type: "module", exports: { "./google/node": "./dist/node.js" } }));
  await writeFile(join(coreRoot, "dist/enrichment.js"), `export { createPortablePlaceSearchQuery as createPlaceSearchQuery, createPortablePlaceResolutionProvenance as createPlaceResolutionProvenance } from ${JSON.stringify(pathToFileURL(join(lib, "portable-enrichment-contract.mjs")).href)};`);
  await writeFile(join(adapterRoot, "dist/node.js"), adapterSource);
}

test("searches owners in stable order and atomically writes one credential-free review", async () => {
  const f = await fixture(); const calls: PlaceSearchQuery[] = [];
  const searchAdapter = adapter((query) => { calls.push(structuredClone(query)); query.text = "tampered"; if (query.locationBias) query.locationBias.center.lat = 0; return { status: "ready", candidates: [candidate(query.ownerId)] }; });
  const review = await (await api()).searchTripPlaces(request(f, searchAdapter));
  expect(calls).toEqual([queries.cafe, queries.museum]);
  expect(review).toEqual(JSON.parse(await readFile(f.reviewPath, "utf8")));
  expect(review.project).toEqual({ tripId: "sample-trip", inputHash: sha256CanonicalJson(f.value) });
  expect(review.provider).toBe("google"); expect(review.observedAt).toBe("2026-09-04T08:00:00.000Z");
  expect(review.policy).toEqual(policy);
  expect(review.entries.map((entry) => entry.ownerId)).toEqual(["place:cafe", "place:museum"]);
  expect(review.entries.map((entry) => entry.query)).toEqual([queries.cafe, queries.museum]);
  expect(review.entries.every((entry) => entry.provenanceSchemaVersion === 1 && !Object.hasOwn(entry, "observedAt"))).toBe(true);
  expect(review.entries.every((entry) => entry.result === "candidates" && entry.candidates.length === 1)).toBe(true);
  expect((await readFile(join(f.projectDir, "src/trip-content/trip-input.json"), "utf8"))).toBe(canonicalizeJson(f.value));
  expect(await stat(f.reviewPath).then((value) => value.mode & 0o777)).toBe(0o600);
  expect(await readFile(f.reviewPath, "utf8")).not.toContain("server-secret");
  expect(parsePlaceReviewArtifact(review, f.value)).toEqual(review);
});

test.each(["stage-write", "stage-fsync", "file-rename", "directory-fsync"])("preserves previous review byte-for-byte when search fails at %s", async (phase) => {
  const f = await fixture(input(), "old review bytes\n");
  const before = await readFile(f.reviewPath); const projectFiles = await Promise.all(["package.json", "eternal-pose.json", "src/trip-content/trip-input.json", "src/trip-content/place-resolutions.json"].map((name) => readFile(join(f.projectDir, name))));
  const parentInventory = await snapshotTree(f.root);
  await expect((await api()).searchTripPlaces(request(f, adapter(() => ({ status: "ready", candidates: [candidate("one")] }))), failOnceAt(phase))).rejects.toThrow(/injected/);
  expect(await readFile(f.reviewPath)).toEqual(before);
  expect(await snapshotTree(f.root)).toEqual(parentInventory);
  expect(await Promise.all(["package.json", "eternal-pose.json", "src/trip-content/trip-input.json", "src/trip-content/place-resolutions.json"].map((name) => readFile(join(f.projectDir, name))))).toEqual(projectFiles);
});

test("typed request denial is reviewable and no candidates remain explicit", async () => {
  const f = await fixture();
  const review = await (await api()).searchTripPlaces(request(f, adapter((query) => query.ownerId === "place:cafe" ? { status: "unavailable", reason: "request-denied", retryable: false, diagnostic: "server-secret body" } : { status: "ready", candidates: [] })));
  expect(review.entries.map((entry) => [entry.result, entry.unavailableReason, entry.candidates])).toEqual([["unavailable", "request-denied", []], ["candidates", undefined, []]]);
  expect(await readFile(f.reviewPath, "utf8")).not.toContain("server-secret");
});

test.each([
  { status: "ready", candidates: [candidate("same"), candidate("same")] },
  { status: "ready", candidates: [candidate(" ")] },
  { status: "ready", candidates: [{ ...candidate("one"), coordinates: { lat: 91, lng: 0 } }] },
  { status: "ready", candidates: [{ ...candidate("one"), coordinates: undefined }] },
  { status: "ready", candidates: [{ ...candidate("one"), formattedAddress: undefined }] },
  { status: "unknown", candidates: [] },
  { status: "unavailable", reason: "unknown", retryable: false },
])("rejects malformed adapter result without changing previous review: %j", async (result) => {
  const f = await fixture(input(), "old review bytes\n");
  await expect((await api()).searchTripPlaces(request(f, adapter(() => result as PlaceSearchResult)))).rejects.toThrow();
  expect(await readFile(f.reviewPath, "utf8")).toBe("old review bytes\n");
});

test("process adapter failure aborts the whole review transaction", async () => {
  const f = await fixture(input(), "old review bytes\n");
  await expect((await api()).searchTripPlaces(request(f, { search() { return Promise.reject(new Error("process failure")); } }))).rejects.toThrow(/process failure/);
  expect(await readFile(f.reviewPath, "utf8")).toBe("old review bytes\n");
});

test("preserves a review changed after its expected hash was captured", async () => {
  const f = await fixture(input(), "old review bytes\n"); let changed = false;
  await expect((await api()).searchTripPlaces(request(f, { async search() {
    if (!changed) { changed = true; await writeFile(f.reviewPath, "foreign review bytes\n"); }
    return { status: "ready", candidates: [candidate("one")] };
  } }))).rejects.toThrow(/hash mismatch/);
  expect(await readFile(f.reviewPath, "utf8")).toBe("foreign review bytes\n");
});

test("refuses to use an accepted project file as the review destination", async () => {
  const f = await fixture(); const inputPath = join(f.projectDir, "src/trip-content/trip-input.json");
  const before = await readFile(inputPath); let calls = 0;
  await expect((await api()).searchTripPlaces({ ...request(f, adapter(() => { calls++; return { status: "ready", candidates: [] }; })), reviewPath: inputPath })).rejects.toThrow(/review destination/);
  expect(calls).toBe(0); expect(await readFile(inputPath)).toEqual(before);
});

test("rejects drifted review query, provenance schema, redundant timestamp and project hash", async () => {
  const f = await fixture(); const review = await (await api()).searchTripPlaces(request(f, adapter(() => ({ status: "ready", candidates: [candidate("one")] }))));
  for (const transform of [
    (value: Review) => { Object.assign(value.entries[0], { query: "Cafe" }); },
    (value: Review) => { value.entries[0].provenanceSchemaVersion = 2; },
    (value: Review) => { value.entries[0].observedAt = value.observedAt; },
    (value: Review) => { value.entries[0].query.locale = "en"; },
    (value: Review) => { value.entries[0].query.regionCode = "US"; },
    (value: Review) => { if (value.entries[0].query.locationBias) value.entries[0].query.locationBias.center.lat = 34; },
    (value: Review) => { value.entries[0].query.text = "Other cafe"; },
    (value: Review) => { Object.assign(value.entries[0].query, { maxCandidates: 4 }); },
    (value: Review) => { value.project.inputHash = "0".repeat(64); },
  ]) { const altered = structuredClone(review); transform(altered); expect(() => parsePlaceReviewArtifact(altered, f.value)).toThrow(); }
});

test("rejects null Trip and null enrichment policy before calling adapter", async () => {
  const empty = { schemaVersion: 2, trip: null, setupLocale: "en", enrichmentPolicy: null, placeOwners: [] };
  for (const value of [empty, { ...input(), enrichmentPolicy: null }]) {
    const f = await fixture(value); let calls = 0;
    await expect((await api()).searchTripPlaces(request(f, adapter(() => { calls++; return { status: "ready", candidates: [] }; })))).rejects.toThrow();
    expect(calls).toBe(0);
  }
});

test.each(["prepared", "committed"])("a %s transaction journal blocks search before adapter use", async (phase) => {
  const f = await fixture(input(), "old review bytes\n"); await writeFile(join(f.projectDir, ".laugh-tale-transaction-held"), JSON.stringify({ phase }));
  let calls = 0;
  await expect((await api()).searchTripPlaces(request(f, adapter(() => { calls++; return { status: "ready", candidates: [] }; })))).rejects.toThrow();
  expect(calls).toBe(0); expect(await readFile(f.reviewPath, "utf8")).toBe("old review bytes\n");
});

test("refuses a journal arriving during the stable snapshot reread before adapter use", async () => {
  const f = await fixture(input(), "old review bytes\n");
  const before = await readFile(f.reviewPath);
  const pathSafety = join(lib, "path-safety.mjs");
  const packagePath = join(f.projectDir, "package.json");
  const journalPath = join(f.projectDir, ".laugh-tale-transaction-arrived");
  let packageReads = 0; let inserted = false; let calls = 0;
  vi.resetModules();
  vi.doMock(pathSafety, async () => {
    const actual = await vi.importActual<Record<string, unknown>>(pathSafety);
    const readRegularFile = actual.readRegularFile as (path: string) => Promise<unknown>;
    return { ...actual, async readRegularFile(path: string) {
      const file = await readRegularFile(path);
      if (path === packagePath && ++packageReads === 2) {
        await writeFile(journalPath, JSON.stringify({ phase: "prepared" }));
        inserted = true;
      }
      return file;
    } };
  });
  try {
    await expect((await api()).searchTripPlaces(request(f, adapter(() => { calls++; return { status: "ready", candidates: [] }; })))).rejects.toMatchObject({ code: "transaction-in-progress" });
    expect(inserted).toBe(true);
    expect(packageReads).toBe(2);
    expect(calls).toBe(0);
    expect(await readFile(f.reviewPath)).toEqual(before);
    expect(await readFile(journalPath, "utf8")).toContain("prepared");
  } finally { vi.doUnmock(pathSafety); vi.resetModules(); }
});

test.each([undefined, "", "   "])("CLI refuses missing or blank server key %s, even with a browser key", async (key) => {
  const f = await fixture(input(), "old review bytes\n");
  await installCliStubs(f, "export class GooglePlaceSearchAdapter { constructor() { throw Error('adapter must not be built without a key'); } }\n");
  const environment: NodeJS.ProcessEnv = { ...process.env, VITE_GOOGLE_MAPS_API_KEY: "browser-only-key" };
  if (key === undefined) delete environment.ETERNAL_POSE_GOOGLE_PLACES_API_KEY; else environment.ETERNAL_POSE_GOOGLE_PLACES_API_KEY = key;
  const result = spawnSync(process.execPath, [script, "search", "--project", f.projectDir, "--review", f.reviewPath], { encoding: "utf8", env: environment });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/ETERNAL_POSE_GOOGLE_PLACES_API_KEY/);
  expect(await readFile(f.reviewPath, "utf8")).toBe("old review bytes\n");
});

test("CLI passes server key and Node fetch to the installed adapter without network in the harness", async () => {
  const f = await fixture();
  await installCliStubs(f, `export class GooglePlaceSearchAdapter {
    constructor(options) { if (options.apiKey !== 'synthetic-server-key' || options.fetch !== globalThis.fetch) throw Error('adapter inputs missing'); }
    async search(query) { return { status: 'ready', candidates: [{ providerReference: { provider: 'google', id: query.ownerId }, displayName: 'Place', formattedAddress: 'Tokyo', coordinates: { lat: 35.68, lng: 139.76 }, categories: [] }] }; }
  }`);
  const environment: NodeJS.ProcessEnv = { ...process.env, ETERNAL_POSE_GOOGLE_PLACES_API_KEY: "synthetic-server-key", VITE_GOOGLE_MAPS_API_KEY: "browser-only-key" };
  const result = spawnSync(process.execPath, [script, "search", "--project", f.projectDir, "--review", f.reviewPath], { encoding: "utf8", env: environment });
  expect(result.status).toBe(0);
  expect(result.stdout + result.stderr).not.toContain("synthetic-server-key");
  const review = JSON.parse(await readFile(f.reviewPath, "utf8")) as Review;
  expect(review.entries.map((entry) => entry.ownerId)).toEqual(["place:cafe", "place:museum"]);
});

test("CLI refuses installed core provenance drift before constructing an adapter", async () => {
  const f = await fixture(input(), "old review bytes\n");
  await installCliStubs(f, "export class GooglePlaceSearchAdapter { constructor() { throw Error('adapter constructed'); } }\n");
  await writeFile(join(f.projectDir, "node_modules/@laugh-tale-island/core/dist/enrichment.js"), "export function createPlaceSearchQuery() { return {}; } export function createPlaceResolutionProvenance() { return {}; }\n");
  const environment: NodeJS.ProcessEnv = { ...process.env, ETERNAL_POSE_GOOGLE_PLACES_API_KEY: "synthetic-server-key" };
  const result = spawnSync(process.execPath, [script, "search", "--project", f.projectDir, "--review", f.reviewPath], { encoding: "utf8", env: environment });
  expect(result.status).not.toBe(0);
  expect(result.stdout + result.stderr).not.toContain("synthetic-server-key");
  expect(result.stderr).not.toContain("adapter constructed");
  expect(await readFile(f.reviewPath, "utf8")).toBe("old review bytes\n");
});

test("accept copies review provenance and replaces ledger plus manifest together", async () => {
  const f = await projectReviewAndSelection();
  const reviewBytes = await readFile(f.reviewPath);
  const inputBytes = await readFile(join(f.projectDir, "src/trip-content/trip-input.json"));
  await (await api()).acceptTripPlaceSelections(f);
  const { ledger, manifest } = await readAccepted(f);
  expect(ledger.entries[0]).toEqual({
    ownerId: "place:cafe", status: "resolved", source: "itinerary", query: queries.cafe,
    provider: "google", observedAt: "2026-09-04T08:00:00.000Z", accepted: candidate("place:cafe"),
  });
  expect(manifest.enrichment).toEqual({ schemaVersion: 1, provenanceHash: sha256CanonicalJson(ledger) });
  expect(await readFile(f.reviewPath)).toEqual(reviewBytes);
  expect(await readFile(join(f.projectDir, "src/trip-content/trip-input.json"))).toEqual(inputBytes);
});

test("accept preserves reviewed unresolved provenance and never invents an accepted place", async () => {
  const f = await projectReviewAndSelection(input(), (query) => query.ownerId === "place:cafe"
    ? { status: "unavailable", reason: "request-denied", retryable: false }
    : { status: "ready", candidates: [candidate(query.ownerId)] });
  await (await api()).acceptTripPlaceSelections(f);
  const { ledger } = await readAccepted(f);
  expect(ledger.entries[0]).toEqual({
    ownerId: "place:cafe", status: "unresolved", source: "itinerary", query: queries.cafe,
    reason: "no-accepted-candidate", observedAt: "2026-09-04T08:00:00.000Z",
  });
  expect(ledger.entries[0]).not.toHaveProperty("accepted");
  expect(ledger.entries[0]).not.toHaveProperty("providerReference");
});

test("accept chooses the exact provider reference rather than candidate order", async () => {
  const f = await projectReviewAndSelection(input(), (query) => ({ status: "ready", candidates: query.ownerId === "place:cafe"
    ? [candidate("first"), candidate("chosen")]
    : [candidate("museum")] }));
  const selection = structuredClone(f.selection);
  selection.decisions[0] = { ownerId: "place:cafe", status: "resolved", providerReference: { provider: "google", id: "chosen" } };
  await writeFile(f.selectionPath, canonicalizeJson(selection));
  await (await api()).acceptTripPlaceSelections(f);
  expect((await readAccepted(f)).ledger.entries[0].accepted).toEqual(candidate("chosen"));
});

test.each(["stage-write", "stage-fsync", "journal-prepare", "file-backup", "file-rename", "directory-fsync", "journal-commit"])(
  "accept preserves project and review bytes when the transaction fails at %s", async (phase) => {
    const f = await projectReviewAndSelection();
    const projectBefore = await snapshotTree(f.projectDir);
    const reviewBefore = await readFile(f.reviewPath);
    const parentInventory = await snapshotTree(f.root);
    await expect((await api()).acceptTripPlaceSelections(f, failOnceAt(phase))).rejects.toThrow(/injected/);
    expect(await snapshotTree(f.projectDir)).toEqual(projectBefore);
    expect(await readFile(f.reviewPath)).toEqual(reviewBefore);
    expect(await snapshotTree(f.root)).toEqual(parentInventory);
  },
);

test.each([
  ["wrong reviewHash", (_f: unknown, selection: Selection) => { selection.reviewHash = "0".repeat(64); }],
  ["missing decision", (_f: unknown, selection: Selection) => { selection.decisions.pop(); }],
  ["extra decision", (_f: unknown, selection: Selection) => { selection.decisions.push({ ownerId: "place:unknown", status: "unresolved", reason: "ambiguous" }); }],
  ["duplicate decision", (_f: unknown, selection: Selection) => { selection.decisions[1] = structuredClone(selection.decisions[0]); }],
  ["absent provider reference", (_f: unknown, selection: Selection) => { selection.decisions[0] = { ownerId: "place:cafe", status: "resolved", providerReference: { provider: "google", id: "not-in-review" } }; }],
  ["unrecognized unresolved reason", (_f: unknown, selection: Selection) => { selection.decisions[0] = { ownerId: "place:cafe", status: "unresolved", reason: "guess" }; }],
])("accept rejects %s without project mutation", async (_name, change) => {
  const f = await projectReviewAndSelection();
  const before = await snapshotTree(f.projectDir);
  const selection = structuredClone(f.selection);
  change(f, selection);
  if (_name === "duplicate decision") expect(selection.decisions).toHaveLength(f.selection.decisions.length);
  await writeFile(f.selectionPath, canonicalizeJson(selection));
  await expect((await api()).acceptTripPlaceSelections(f)).rejects.toThrow();
  expect(await snapshotTree(f.projectDir)).toEqual(before);
});

test("accept rejects resolution against an unavailable review result", async () => {
  const f = await projectReviewAndSelection(input(), () => ({ status: "unavailable", reason: "request-denied", retryable: false }));
  const selection = structuredClone(f.selection);
  selection.decisions[0] = { ownerId: "place:cafe", status: "resolved", providerReference: { provider: "google", id: "fabricated" } };
  await writeFile(f.selectionPath, canonicalizeJson(selection));
  await expect((await api()).acceptTripPlaceSelections(f)).rejects.toThrow();
});

test.each([
  ["stale inputHash", (review: Review) => { review.project.inputHash = "0".repeat(64); }],
  ["wrong provenanceSchemaVersion", (review: Review) => { review.entries[0].provenanceSchemaVersion = 2; }],
  ["legacy string query", (review: Review) => { review.entries[0].query = "Cafe" as unknown as PlaceSearchQuery; }],
  ["drifted normalized query", (review: Review) => { review.entries[0].query.text = "Other cafe"; }],
  ["wrong maxCandidates", (review: Review) => { review.entries[0].query.maxCandidates = 4 as 3; }],
  ["invalid observation time", (review: Review) => { review.observedAt = "2026-09-04T08:00:00+00:00"; }],
])("accept rejects %s", async (_name, change) => {
  const f = await projectReviewAndSelection();
  const review = structuredClone(f.review);
  const selection = structuredClone(f.selection);
  change(review);
  await writeFile(f.reviewPath, canonicalizeJson(review));
  selection.reviewHash = sha256CanonicalJson(review);
  await writeFile(f.selectionPath, canonicalizeJson(selection));
  const before = await snapshotTree(f.projectDir);
  await expect((await api()).acceptTripPlaceSelections(f)).rejects.toThrow();
  expect(await snapshotTree(f.projectDir)).toEqual(before);
});

test.each(["resolved", "unresolved"])("accept hashes every review query fact into a %s ledger", async (status) => {
  const hashes = new Set<string>();
  for (const changed of ["baseline", "text", "locale", "region", "bias"] as const) {
    const value = input();
    if (changed === "text") value.placeOwners[0].query.text = "Different museum";
    if (changed === "locale") {
      value.trip.locale = "en";
      for (const owner of value.placeOwners) owner.query.locale = "en";
    }
    if (changed === "region") {
      value.enrichmentPolicy.regionCode = "US";
      for (const owner of value.placeOwners) owner.query.regionCode = "US";
    }
    if (changed === "bias") {
      value.enrichmentPolicy.locationBias.center.lat = 35.69;
      for (const owner of value.placeOwners) owner.query.locationBias.center.lat = 35.69;
    }
    const f = await projectReviewAndSelection(value);
    if (status === "unresolved") {
      const selection = structuredClone(f.selection);
      selection.decisions = selection.decisions.map((decision) => ({ ownerId: decision.ownerId, status: "unresolved", reason: "ambiguous" }));
      await writeFile(f.selectionPath, canonicalizeJson(selection));
    }
    await (await api()).acceptTripPlaceSelections(f);
    const { ledger, manifest } = await readAccepted(f);
    expect(ledger.entries[0].query).toEqual(value.placeOwners[1].query);
    expect(ledger.entries[1].query).toEqual(value.placeOwners[0].query);
    expect(ledger.entries.every((entry: { status: string }) => entry.status === status)).toBe(true);
    hashes.add(manifest.enrichment.provenanceHash);
  }
  expect(hashes.size).toBe(5);
});

test("accept refuses a newer project generation after its stable snapshot", async () => {
  const f = await projectReviewAndSelection();
  const ledgerPath = join(f.projectDir, "src/trip-content/place-resolutions.json");
  const manifestPath = join(f.projectDir, "eternal-pose.json");
  const ledger = JSON.parse(await readFile(ledgerPath, "utf8")) as { entries: Array<Record<string, unknown>> };
  ledger.entries[0] = { ...ledger.entries[0], reason: "ambiguous", observedAt: "2026-09-04T08:00:00.000Z" };
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  manifest.enrichment.provenanceHash = sha256CanonicalJson(ledger);
  const pathSafety = join(lib, "path-safety.mjs");
  let changed = false;
  vi.resetModules();
  vi.doMock(pathSafety, async () => {
    const actual = await vi.importActual<Record<string, unknown>>(pathSafety);
    const readRegularFile = actual.readRegularFile as (path: string) => Promise<unknown>;
    return { ...actual, async readRegularFile(path: string) {
      const result = await readRegularFile(path);
      if (path === f.reviewPath && !changed) {
        changed = true;
        await writeFile(ledgerPath, canonicalizeJson(ledger));
        await writeFile(manifestPath, canonicalizeJson(manifest));
      }
      return result;
    } };
  });
  try {
    await expect((await api()).acceptTripPlaceSelections(f)).rejects.toThrow(/project generation changed/);
    expect(changed).toBe(true);
    expect(JSON.parse(await readFile(ledgerPath, "utf8"))).toEqual(ledger);
    expect(JSON.parse(await readFile(manifestPath, "utf8"))).toEqual(manifest);
  } finally { vi.doUnmock(pathSafety); vi.resetModules(); }
});

test("accept refuses review inode replacement while it is read", async () => {
  const f = await projectReviewAndSelection();
  const original = await readFile(f.reviewPath);
  const pathSafety = join(lib, "path-safety.mjs");
  let swapped = false;
  vi.resetModules();
  vi.doMock(pathSafety, async () => {
    const actual = await vi.importActual<Record<string, unknown>>(pathSafety);
    const readRegularFile = actual.readRegularFile as (path: string) => Promise<unknown>;
    return { ...actual, async readRegularFile(path: string) {
      const file = await readRegularFile(path);
      if (path === f.reviewPath && !swapped) {
        swapped = true;
        const replacement = join(f.root, "replacement-review.json");
        await writeFile(replacement, original);
        await rename(replacement, f.reviewPath);
      }
      return file;
    } };
  });
  try {
    await expect((await api()).acceptTripPlaceSelections(f)).rejects.toThrow(/identity changed/);
    expect(swapped).toBe(true);
  } finally { vi.doUnmock(pathSafety); vi.resetModules(); }
});

test("accept CLI works without installed packages or a server credential", async () => {
  const f = await projectReviewAndSelection();
  const environment: NodeJS.ProcessEnv = { ...process.env };
  delete environment.ETERNAL_POSE_GOOGLE_PLACES_API_KEY;
  const result = spawnSync(process.execPath, [script, "accept", "--project", f.projectDir, "--review", f.reviewPath, "--selection", f.selectionPath], { encoding: "utf8", env: environment });
  expect(result.status, result.stderr).toBe(0);
  expect((await readAccepted(f)).ledger.entries[0].status).toBe("resolved");
});
