import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";
import { completeV2Project, repoRoot, snapshotTree, type ValidationResult } from "../generation/generated-project-v2-fixture.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const script = (name: string) => join(repoRoot, "plugins/eternal-pose/scripts", name + ".mjs");
const load = async (path: string) => await import(pathToFileURL(path).href) as Record<string, (request: unknown, operations?: unknown) => Promise<unknown>>;
const protectedPaths = ["eternal-pose.json", "package.json", "package-lock.json", "src/trip-content/trip-input.json", "src/trip-content/place-resolutions.json"];

function poisonedProject(parentJournal: boolean) {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), "project-reader-boundary-")); roots.push(parent);
  const root = join(parent, "project"); mkdirSync(join(root, "src/trip-content"), { recursive: true });
  for (const path of protectedPaths) writeFileSync(join(root, path), "not JSON: must never parse while journaled");
  writeFileSync(join(parentJournal ? parent : root, ".laugh-tale-transaction-boundary"), "uncertain journal");
  return { parent, root };
}

// These behavioral probes make a direct read fail differently from the stable
// reader. They prove ordering/refusal and preservation, not helper-name presence.
test.each([false, true])("all public readers refuse %s parent journal before poisoned accepted bytes", async parentJournal => {
  const { root, parent } = poisonedProject(parentJournal); const before = snapshotTree(parent);
  const enrich = await load(script("enrich-trip-project"));
  const request = { projectDir: root, reviewPath: join(parent, "review.json"), selectionPath: join(parent, "selection.json"), adapter: { search() { throw new Error("provider must not run"); } } };
  await expect(enrich.searchTripPlaces(request)).rejects.toThrow(/transaction|journal/i);
  await expect(enrich.acceptTripPlaceSelections(request)).rejects.toThrow(/transaction|journal/i);
  const upgrade = await load(script("upgrade-trip-project"));
  await expect(upgrade.upgradeTripProject({ projectDir: root, packagesVersion: "2.0.0", toolVersion: "2.0.0" })).rejects.toThrow(/transaction|journal/i);
  const validate = await load(script("validate-trip-project"));
  const verify = await load(script("verify-trip-project"));
  for (const [module, method] of [[validate, "validateTripProject"], [verify, "verifyTripProject"]] as const) {
    const result = await module[method](root, "local") as ValidationResult & { commands?: unknown[] };
    expect(result.findings).toEqual([expect.objectContaining({ code: "project.transaction-in-progress" })]);
    if (result.commands) expect(result.commands).toEqual([]);
  }
  const replace = await load(join(repoRoot, "scripts/replace-generated-project.mjs"));
  await expect(replace.replaceGeneratedProject({ candidateDir: root, targetDir: join(parent, "target"), backupDir: join(parent, "backup"), expectedInputPath: join(root, "package.json"), expectedResolutionsPath: join(root, "eternal-pose.json") })).rejects.toThrow(/transaction|journal/i);
  const preflight = await load(join(repoRoot, "plugins/eternal-pose/starter/react/scripts/assert-project-readable.mjs"));
  await expect(preflight.assertProjectReadable(root)).rejects.toThrow(/transaction-in-progress/);
  expect(snapshotTree(parent)).toEqual(before);
});

test("source readers never recover a dead writer; project mutators recover before parsing", async () => {
  const { root, parent } = poisonedProject(false);
  rmSync(join(root, ".laugh-tale-transaction-boundary"));
  // Produce a genuine recoverable writer record through the reviewed seam, then
  // exit the child at stage-write. No fabricated ownership record can pass this.
  const moduleUrl = pathToFileURL(join(repoRoot, "plugins/eternal-pose/lib/atomic-publication.mjs")).href;
  const worker = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { replaceProjectFiles } from ${JSON.stringify(moduleUrl)};
    await replaceProjectFiles({projectDir:process.argv[1],replacements:new Map([["package.json","{}"]]),allowedPaths:new Set(["package.json"]),validate:async()=>{}}, {beforeMutation({phase}){if(phase==="stage-write")process.exit(23);}});
  `, root], { encoding: "utf8" });
  expect(worker.status, worker.stderr).toBe(23);
  const reserved = snapshotTree(parent);
  const enrich = await load(script("enrich-trip-project"));
  const request = { projectDir: root, reviewPath: join(parent, "review.json"), selectionPath: join(parent, "selection.json") };
  await expect(enrich.searchTripPlaces(request)).rejects.toThrow(/transaction/);
  expect(snapshotTree(parent)).toEqual(reserved);
  await expect(enrich.acceptTripPlaceSelections(request)).rejects.toThrow(/package.json must be valid JSON/);
  const preflight = await load(join(repoRoot, "plugins/eternal-pose/starter/react/scripts/assert-project-readable.mjs"));
  await expect(preflight.assertProjectReadable(root)).resolves.toBeUndefined();
  expect(readFileSync(join(root, "package.json"), "utf8")).toBe("not JSON: must never parse while journaled");
});

test("staging refuses transaction-owned composed bytes before any package command", async () => {
  const stage = await load(join(repoRoot, "scripts/stage-starter-consumer.mjs"));
  const parent = mkdtempSync(join(repoRoot, "tmp/task11-reader-stage-")); roots.push(parent);
  let candidate = ""; let commands = 0;
  await expect(stage.stageStarterConsumer({ outDir: join(parent, "output"), install: false }, {
    afterStarterComposed(context: { candidate: string }) {
      candidate = context.candidate; roots.push(dirname(candidate));
      writeFileSync(join(candidate, ".laugh-tale-transaction-boundary"), "uncertain journal");
      writeFileSync(join(candidate, "package.json"), "must not parse");
    },
    onCommand() { commands++; throw new Error("package command must not run"); },
  })).rejects.toThrow(/transaction|journal/i);
  expect(commands).toBe(0);
  expect(existsSync(join(parent, "output"))).toBe(false);
  expect(readFileSync(join(candidate, "package.json"), "utf8")).toBe("must not parse");
  expect(readFileSync(join(candidate, ".laugh-tale-transaction-boundary"), "utf8")).toBe("uncertain journal");
});

test("search owns only its artifact and accept validates private views while holding the project writer", async () => {
  const { root, parent } = await completeV2Project(); roots.push(parent);
  const input = { schemaVersion: 2, trip: { id: "boundary-trip", title: "Synthetic boundary trip", locale: "en-US", timezone: "UTC", startDate: "2042-03-04", endDate: "2042-03-04", days: [{ id: "day", date: "2042-03-04", title: "Day", nodes: [] }], routes: [], candidateGroups: [], reservations: [], tasks: [] }, enrichmentPolicy: { provider: "google", regionCode: "US", locationBias: { center: { lat: 0, lng: 0 }, radiusMeters: 1000 } }, placeOwners: [] };
  writeFileSync(join(root, "src/trip-content/trip-input.json"), JSON.stringify(input));
  const before = snapshotTree(root);
  const atomic = await load(join(repoRoot, "plugins/eternal-pose/lib/atomic-publication.mjs"));
  const enrich = await load(script("enrich-trip-project"));
  const reviewPath = join(parent, "review.json"), selectionPath = join(parent, "selection.json");
  let artifactRead = false;
  const review = await enrich.searchTripPlaces({ projectDir: root, reviewPath, adapter: { search() { throw new Error("no place owners"); } } }, { async beforeMutation({ phase }: { phase: string }) {
    if (phase !== "stage-write") return;
    await atomic.readProjectFileSet({ projectDir: root, paths: protectedPaths }); artifactRead = true;
  } });
  expect(artifactRead).toBe(true); expect(snapshotTree(root)).toEqual(before);
  const { sha256CanonicalJson } = await import(pathToFileURL(join(repoRoot, "plugins/eternal-pose/lib/canonical-json.mjs")).href) as { sha256CanonicalJson: (value: unknown) => string };
  writeFileSync(selectionPath, JSON.stringify({ schemaVersion: 1, reviewHash: sha256CanonicalJson(review), decisions: [] }));
  const privatePhases: string[] = [];
  await enrich.acceptTripPlaceSelections({ projectDir: root, reviewPath, selectionPath }, { async beforeMutation({ phase }: { phase: string }) {
    if (phase !== "stage-validate" && phase !== "file-set-validate") return;
    await expect(atomic.readProjectFileSet({ projectDir: root, paths: protectedPaths })).rejects.toThrow(/transaction/);
    privatePhases.push(phase);
  } });
  expect(privatePhases).toEqual(["stage-validate", "file-set-validate"]);
  await expect(atomic.readProjectFileSet({ projectDir: root, paths: protectedPaths })).resolves.toBeInstanceOf(Map);
  expect(readFileSync(join(root, "src/trip-content/trip-input.json"), "utf8")).toBe(JSON.stringify(input));
});

test("reader entrypoint inventory reaches shared ownership checks and remains in the generator gate", () => {
  function reachable(path: string, visited = new Set<string>()): Set<string> {
    if (visited.has(path)) return visited;
    visited.add(path);
    for (const [, specifier] of readFileSync(path, "utf8").matchAll(/(?:from\s*|import\s*\()["'](\.[^"']+\.mjs)["']/g)) {
      const dependency = resolve(dirname(path), specifier);
      if (!dependency.includes("/vendor/")) reachable(dependency, visited);
    }
    return visited;
  }
  for (const path of [script("enrich-trip-project"), script("validate-trip-project"), script("verify-trip-project"), script("upgrade-trip-project"), join(repoRoot, "scripts/stage-starter-consumer.mjs"), join(repoRoot, "scripts/replace-generated-project.mjs"), join(repoRoot, "scripts/write-registry-lockfile.mjs")]) {
    expect(reachable(path).has(join(repoRoot, "plugins/eternal-pose/lib/atomic-publication.mjs"))).toBe(true);
  }
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { scripts: Record<string, string> };
  expect(pkg.scripts["test:generator:v2"]).toContain("tests/scripts/project-reader-boundaries.test.ts");
});
