import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { atomic, compareGeneratedProjects, create, exampleRoot, inputPath, json, paths, pluginRoot, type Ledger } from "../fixtures/public-release.js";

const roots: string[] = [];
const recipeRoot = join(pluginRoot, "recipes-v2/oak-washi/presentation");
const recipeOnly = new Set(["copy/catalog-schema.json", "copy/en.json", "copy/zh-Hant.json", "copy/resolve-copy.ts"]);
afterAll(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function generatedPair() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "meridian-identity-"))); roots.push(directory);
  const starterRoot = join(directory, "starter"), generatedRoot = join(directory, "meridian");
  await create({ pluginRoot, targetDir: starterRoot, setupLocale: "zh-Hant-TW" });
  await create({ pluginRoot, targetDir: generatedRoot, tripPath: inputPath });
  return { starterRoot, generatedRoot };
}
// Generate each immutable reference once. Create performs a full publication
// scan, so duplicating both projects per assertion needlessly multiplies I/O.
let pair: Awaited<ReturnType<typeof generatedPair>>;
beforeAll(async () => { pair = await generatedPair(); }, 60000);

test("checked-in starter presentation has the canonical Oak & Washi bytes", async () => {
  const starter = await atomic.hashProjectFiles(join(pluginRoot, "starter/react/src/presentation"));
  const recipe = await atomic.hashProjectFiles(recipeRoot);
  const expected = [...recipe.entries()].filter(([name]) => !recipeOnly.has(name));
  expect([...starter.keys()]).toEqual(expected.map(([name]) => name));
  for (const [name, hash] of expected) expect(starter.get(name), name).toBe(hash);
});

test("neutral trip generation changes content without changing presentation or runtime", async () => {
  const { starterRoot, generatedRoot } = pair;
  const unchanged = { presentationDifferences: [], runtimeConfigurationDifferences: [], packageDifferences: [], manifestDifferences: [], otherDifferences: [] };
  expect(await compareGeneratedProjects(starterRoot, generatedRoot)).toEqual(unchanged);
  const generated = await atomic.hashProjectFiles(generatedRoot), recipe = await atomic.hashProjectFiles(recipeRoot);
  expect([...generated.keys()].filter(path => path.startsWith("src/presentation/")).map(path => path.slice("src/presentation/".length))).toEqual([...recipe.keys()].filter(path => !recipeOnly.has(path)));
  for (const [path, hash] of recipe) if (!recipeOnly.has(path)) expect(generated.get("src/presentation/" + path), path).toBe(hash);
  const pkg = await json<{ dependencies: Record<string, string>; devDependencies: Record<string, string> }>(join(generatedRoot, "package.json"));
  for (const spec of Object.values({ ...pkg.dependencies, ...pkg.devDependencies })) expect(spec).not.toMatch(/^(?:file|link|workspace):/);
  for (const path of generated.keys()) {
    expect(path).not.toMatch(/^src\/providers/);
    if (path.startsWith("src/") && /\.[jt]sx?$/.test(path)) expect(await readFile(join(generatedRoot, path), "utf8"), path).not.toMatch(/navigator\.(?:language|languages)|en\.json|zh-Hant\.json|catalog-schema\.json|resolve-copy\.ts/);
  }
  expect(await readFile(join(generatedRoot, "src/presentation/copy/catalog.ts"), "utf8")).toContain('export const locale = "zh-Hant-TW";');
  // Create canonicalizes object-key order; authored input formatting is not
  // part of the content contract. The checked-in generated tree is checked bytewise below.
  expect(await json<unknown>(join(generatedRoot, paths.input))).toEqual(await json<unknown>(inputPath));
  expect(await json<Ledger>(join(generatedRoot, paths.ledger))).toEqual({ schemaVersion: 1, provider: "google", entries: [] });
  const drift = join(generatedRoot, "src/app/unowned.ts");
  try {
    await writeFile(drift, "export const drift = true;\n");
    expect((await compareGeneratedProjects(starterRoot, generatedRoot)).runtimeConfigurationDifferences).toEqual(["src/app/unowned.ts"]);
  } finally { await rm(drift, { force: true }); }
}, 60_000);

test("checked-in Meridian is the exact generated neutral example", async () => {
  const { generatedRoot } = pair;
  const expected = await atomic.hashProjectFiles(generatedRoot);
  const localArtifacts = new Set(["node_modules", "dist", "coverage", "tmp", "test-results", "playwright-report", ".env.local"]);
  expect(await atomic.hashProjectFiles(exampleRoot, localArtifacts)).toEqual(expected);
  expect([...expected.keys()]).not.toContain(".env.local");
}, 60_000);
