import { lstat, mkdir, open, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { publishCreatedProject } from "../lib/atomic-publication.mjs";
import { canonicalizeJson } from "../lib/canonical-json.mjs";
import { assertAncestors, pathIdentity, readRegularFile, samePathIdentity, snapshotAncestors, validateTargetDirectory } from "../lib/path-safety.mjs";
import { parsePlaceResolutionLedger, unresolvedLedgerForInput } from "../lib/place-resolution-ledger.mjs";
import { buildTripProjectManifest, assertManifestMatchesLedger } from "../lib/project-manifest-v2.mjs";
import { validateTripProject } from "./validate-trip-project.mjs";
import { loadRecipeV2, loadRecipeV2Catalog } from "../lib/recipe-v2.mjs";
import { emptyTripProjectInputV2, parseTripProjectInputV2 } from "../lib/trip-project-input-v2.mjs";

const USAGE = "Usage: node create-trip-project.mjs --target /absolute/output/my-trip [--recipe oak-washi] (--trip /absolute/input.json | --setup-locale zh-Hant-TW) [--copy-catalog /absolute/catalog.json] [--resolutions /absolute/place-resolutions.json]";
const OMITTED = new Set([".ds_store", ".cache", ".eslintcache", ".git", ".next", ".parcel-cache", ".turbo", ".vite", "thumbs.db", "build", "cache", "coverage", "dist", "node_modules", "out", "playwright-report", "test-results"]);
const PACKAGES = {
  "@laugh-tale-island/adapters": "dependencies",
  "@laugh-tale-island/core": "dependencies",
  "@laugh-tale-island/react": "dependencies",
  "@laugh-tale-island/testing": "devDependencies",
};
const EXACT_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function contained(parent, child) {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}
function overlap(left, right) { return contained(left, right) || contained(right, left); }
async function canonicalDirectory(path, label) {
  const absolute = resolve(path);
  const stats = await lstat(absolute);
  if (!stats.isDirectory() || stats.isSymbolicLink() || await realpath(absolute) !== absolute) throw new Error(`${label} must not be a symbolic link`);
  return absolute;
}
async function readJson(path) {
  try { return JSON.parse((await readRegularFile(path)).bytes.toString("utf8")); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error(`invalid JSON: ${path}`, { cause: error });
    throw error;
  }
}
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortDeep(value[key])]));
  return value;
}
function validateCopy(value, schema, path = "catalog") {
  if (schema.type === "object") {
    if (!object(value)) throw new Error(`${path} must be an object`);
    for (const key of Object.keys(value)) if (!Object.hasOwn(schema.properties ?? {}, key)) throw new Error(`${path}.${key} is not allowed`);
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) throw new Error(`${path}.${key} is required`);
    for (const [key, child] of Object.entries(value)) validateCopy(child, schema.properties[key], `${path}.${key}`);
  } else if (schema.type === "string") {
    if (typeof value !== "string") throw new Error(`${path} must be a string`);
  } else throw new Error(`unsupported copy schema at ${path}`);
}

export async function materializeCopyCatalog({ locale, recipeRoot, authoredCatalogPath }) {
  let canonicalLocale;
  try { canonicalLocale = Intl.getCanonicalLocales(locale)[0]; }
  catch { throw new Error(`invalid locale: ${locale}`); }
  if (!canonicalLocale) throw new Error("locale is required");
  const recipe = await loadRecipeV2(recipeRoot, "oak-washi");
  if (!recipe.copy) throw new Error("recipe copy contract is required");
  const schema = await readJson(recipe.copy.schema);
  let sourceCatalog;
  let catalog;
  if (authoredCatalogPath !== undefined) {
    if (!isAbsolute(authoredCatalogPath)) throw new Error("copy-catalog path must be absolute");
    const authored = await readJson(authoredCatalogPath);
    if (!object(authored) || Object.keys(authored).sort().join(",") !== "catalog,locale" || !object(authored.catalog)) throw new Error("copy-catalog must contain exactly locale and catalog");
    if (authored.locale !== canonicalLocale) throw new Error("copy-catalog locale must match selected locale");
    sourceCatalog = "authored";
    catalog = authored.catalog;
  } else {
    sourceCatalog = canonicalLocale === "en" || canonicalLocale.startsWith("en-") ? "en"
      : canonicalLocale === "zh-Hant" || canonicalLocale.startsWith("zh-Hant-") ? "zh-Hant" : undefined;
    if (!sourceCatalog) throw new Error(`locale ${canonicalLocale} requires --copy-catalog`);
    catalog = await readJson(recipe.copy.references[sourceCatalog]);
  }
  validateCopy(catalog, schema);
  const source = `import type { OakWashiCopy } from "./schema.js";\n\nexport const locale = ${JSON.stringify(canonicalLocale)};\n\nexport const catalog = ${JSON.stringify(sortDeep(catalog), null, 2)} satisfies OakWashiCopy;\n`;
  return { canonicalLocale, sourceCatalog, source };
}

function starterPackageVersion(manifest) {
  if (!object(manifest)) throw new Error("starter package.json must be an object");
  const versions = new Set();
  for (const [name, section] of Object.entries(PACKAGES)) {
    const occurrences = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].filter((key) => Object.hasOwn(manifest[key] ?? {}, name));
    if (occurrences.length !== 1 || occurrences[0] !== section) throw new Error(`starter package ${name} must be declared only in ${section}`);
    const version = manifest[section][name];
    if (typeof version !== "string" || !EXACT_VERSION.test(version)) throw new Error(`starter package ${name} must use an exact registry version`);
    versions.add(version);
  }
  for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    for (const name of Object.keys(manifest[section] ?? {})) if (name.startsWith("@laugh-tale-island/") && !Object.hasOwn(PACKAGES, name)) throw new Error("starter must declare only the complete four-package Laugh Tale graph");
  }
  if (versions.size !== 1) throw new Error("starter Laugh Tale packages must use one shared version");
  return [...versions][0];
}

function shouldCopyStarter(path) {
  const parts = path.split(sep);
  if (parts.some((part) => OMITTED.has(part.toLowerCase()))) return false;
  const filename = parts.at(-1)?.toLowerCase() ?? "";
  if (filename.startsWith(".env") && filename !== ".env.example") return false;
  if (filename.endsWith(".tsbuildinfo") || /\.(?:css|[cm]?[jt]sx?)\.map$/i.test(filename)) return false;
  if (/^(?:credentials|(?:google[-_])?service[-_]?account(?:[-_]?key)?|client[-_]?secret)(?:[-_.][a-z0-9-]+)*\.json$/i.test(filename)) return false;
  if (["application_default_credentials.json", "google-services.json", "googleservice-info.plist", "id_rsa", "id_ed25519"].includes(filename) || /\.(?:key|p12|pem|pfx)$/i.test(filename)) return false;
  return true;
}

async function createOwnedStage(stageDir, testOperations) {
  const ancestors = await snapshotAncestors(stageDir);
  const rootStats = await lstat(stageDir);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) throw new Error("stage ownership changed");
  const entries = new Map([["", { identity: pathIdentity(rootStats), type: "directory" }]]);
  async function verify() {
    await assertAncestors(ancestors);
    const seen = new Set();
    async function walk(relativePath) {
      const path = relativePath ? join(stageDir, relativePath) : stageDir;
      const expected = entries.get(relativePath);
      if (!expected) throw new Error(`foreign stage entry: ${relativePath}`);
      const stats = await lstat(path);
      if (!samePathIdentity(pathIdentity(stats), expected.identity) || stats.isSymbolicLink()) throw new Error(`stage ownership identity changed: ${relativePath}`);
      seen.add(relativePath);
      if (expected.type === "directory") {
        for (const name of await readdir(path)) await walk(relativePath ? join(relativePath, name) : name);
      }
    }
    await walk("");
    if (seen.size !== entries.size) throw new Error("stage owned inventory changed");
  }
  await verify();
  async function beforeWrite(relativePath) {
    await verify();
    await testOperations.beforeStageWrite?.({ stageDir, path: join(stageDir, relativePath) });
    await verify();
  }
  async function ensureDirectory(relativePath) {
    if (!relativePath || relativePath === ".") return;
    let current = "";
    for (const part of relativePath.split(sep).filter(Boolean)) {
      current = current ? join(current, part) : part;
      if (entries.has(current)) { await verify(); continue; }
      await beforeWrite(current);
      const path = join(stageDir, current);
      await mkdir(path);
      const stats = await lstat(path);
      if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`stage directory ownership changed: ${current}`);
      entries.set(current, { identity: pathIdentity(stats), type: "directory" });
      await verify();
    }
  }
  async function write(relativePath, bytes, mode = 0o644) {
    await ensureDirectory(dirname(relativePath));
    await beforeWrite(relativePath);
    const path = join(stageDir, relativePath);
    const handle = await open(path, "wx", mode);
    try {
      const handleIdentity = pathIdentity(await handle.stat());
      const pathIdentityNow = pathIdentity(await lstat(path));
      if (handleIdentity.type !== "file" || !samePathIdentity(handleIdentity, pathIdentityNow)) throw new Error(`stage file ownership changed: ${relativePath}`);
      entries.set(relativePath, { identity: handleIdentity, type: "file" });
      await handle.writeFile(bytes);
      await verify();
    } finally { await handle.close(); }
  }
  async function cleanup() {
    await verify();
    for (const [relativePath, entry] of [...entries].reverse()) {
      if (!relativePath) continue;
      await verify();
      const path = join(stageDir, relativePath);
      if (entry.type === "directory") await rmdir(path);
      else await unlink(path);
      entries.delete(relativePath);
    }
    await verify();
  }
  return { verify, ensureDirectory, write, cleanup };
}

async function copyTree(sourceRoot, ownedStage, destinationPrefix, shouldCopy) {
  const root = await canonicalDirectory(sourceRoot, "source root");
  async function visit(relativePath = "") {
    const sourceDir = join(root, relativePath);
    const dirStats = await lstat(sourceDir);
    if (!dirStats.isDirectory() || dirStats.isSymbolicLink() || await realpath(sourceDir) !== sourceDir) throw new Error(`source tree must not contain symbolic links: ${relativePath}`);
    await ownedStage.ensureDirectory(join(destinationPrefix, relativePath));
    for (const name of (await readdir(sourceDir)).sort()) {
      const child = join(relativePath, name);
      if (name.startsWith(".laugh-tale-") || !shouldCopy(child)) continue;
      const source = join(root, child);
      const stats = await lstat(source);
      if (stats.isSymbolicLink()) throw new Error(`source tree must not contain symbolic links: ${child}`);
      if (stats.isDirectory()) await visit(child);
      else if (stats.isFile()) {
        const bytes = (await readRegularFile(source)).bytes;
        await ownedStage.write(join(destinationPrefix, child), bytes, stats.mode & 0o777);
      } else throw new Error(`source tree entry must be a regular file or directory: ${child}`);
    }
    const after = await lstat(sourceDir);
    if (dirStats.dev !== after.dev || dirStats.ino !== after.ino || after.isSymbolicLink()) throw new Error(`source directory identity changed: ${relativePath}`);
  }
  await visit();
}

async function writeOwnedJson(ownedStage, relativePath, value) {
  await ownedStage.write(relativePath, `${JSON.stringify(sortDeep(value), null, 2)}\n`);
}

async function validateStageStructure(stageDir) {
  const result = await validateTripProject(stageDir, "local");
  if (result.counts.errors) throw new Error(`Generated project failed structural validation: ${result.findings.filter(item => item.severity === "error").map(item => `${item.code}: ${item.path}`).join(", ")}`);
  for (const path of [
    "src/app/App.tsx",
    "src/trip-content/trip.ts",
    "src/trip-content/materialize-trip.ts",
    "src/main.tsx",
    "src/presentation/index.ts",
    "src/presentation/copy/schema.ts",
    "src/presentation/copy/catalog.ts",
    "index.html",
    "AGENTS.md",
    "CLAUDE.md",
    "docs/trip-experience-contract.md",
  ]) {
    try { await readRegularFile(join(stageDir, path)); }
    catch (error) { throw new Error(`required project source missing or unsafe: ${path}`, { cause: error }); }
  }
  const sourceDirectories = new Set(["app", "presentation", "trip-content"]);
  for (const entry of await readdir(join(stageDir, "src"), { withFileTypes: true })) {
    if (entry.isDirectory() && !sourceDirectories.has(entry.name)) {
      throw new Error(`unexpected source directory: src/${entry.name}`);
    }
  }
}

export async function createTripProject({ pluginRoot, targetDir, recipe = "oak-washi", tripPath, setupLocale, copyCatalogPath, resolutionsPath, starterDir, recipeCatalogRoot }, testOperations = {}) {
  if (recipe !== "oak-washi") throw new Error("only oak-washi is supported");
  if (typeof pluginRoot !== "string" || !pluginRoot.trim()) throw new Error("plugin root is required");
  if ((tripPath === undefined) === (setupLocale === undefined)) throw new Error("exactly one of trip and setup-locale is required");
  if (resolutionsPath !== undefined && tripPath === undefined) throw new Error("resolutions require a trip");
  for (const [name, path] of [["trip", tripPath], ["copy-catalog", copyCatalogPath], ["resolutions", resolutionsPath]]) if (path !== undefined && !isAbsolute(path)) throw new Error(`${name} path must be absolute`);
  const plugin = await canonicalDirectory(pluginRoot, "plugin root");
  const target = resolve(targetDir);
  const targetState = await validateTargetDirectory(target);
  if (target === plugin) throw new Error("refusing broad target");
  if (targetState !== "missing") throw new Error("new project target must be missing");
  const starter = await canonicalDirectory(starterDir ?? join(plugin, "starter/react"), "starter root");
  const catalogRoot = await canonicalDirectory(recipeCatalogRoot ?? join(plugin, "recipes-v2"), "recipe catalog root");
  if ([plugin, starter, catalogRoot].some((path) => overlap(path, target))) throw new Error("refusing overlapping target");
  const recipes = await loadRecipeV2Catalog(catalogRoot);
  const selected = recipes.get("oak-washi");
  if (!selected || !selected.copy) throw new Error("public recipe catalog must contain complete oak-washi");
  const input = tripPath ? parseTripProjectInputV2(await readJson(tripPath)) : emptyTripProjectInputV2(setupLocale);
  const ledger = resolutionsPath ? parsePlaceResolutionLedger(await readJson(resolutionsPath), input) : unresolvedLedgerForInput(input);
  const locale = tripPath ? input.trip.locale : input.setupLocale;
  const materialized = await materializeCopyCatalog({ locale, recipeRoot: selected.root, authoredCatalogPath: copyCatalogPath });
  const claudePlugin = await readJson(join(plugin, ".claude-plugin/plugin.json"));
  const codexPlugin = await readJson(join(plugin, ".codex-plugin/plugin.json"));
  if (claudePlugin.version !== codexPlugin.version) throw new Error("plugin manifest versions must match");
  const pluginVersion = claudePlugin.version;
  const packageVersion = starterPackageVersion(await readJson(join(starter, "package.json")));
  const manifest = buildTripProjectManifest({ generatorVersion: pluginVersion, recipeId: "oak-washi", recipeSourceVersion: pluginVersion, packageVersion, ledger });
  const presentationRoot = join("src", "presentation");
  const declaredCopy = selected.manifest.presentation.copy;
  const privateCopy = new Set([
    declaredCopy.schema, ...Object.values(declaredCopy.references), declaredCopy.resolver,
  ]);
  let ownedStage;
  await publishCreatedProject({
    targetDir: target,
    async populate(stageDir) {
      ownedStage = await createOwnedStage(stageDir, testOperations);
      try {
        await copyTree(starter, ownedStage, "", (path) => path !== presentationRoot && !path.startsWith(`${presentationRoot}${sep}`) && path !== join("src", "trip-content", "trip-input.json") && path !== join("src", "trip-content", "place-resolutions.json") && path !== "eternal-pose.json" && shouldCopyStarter(path));
        await copyTree(selected.presentationRoot, ownedStage, presentationRoot, (path) => !privateCopy.has(path.split(sep).join("/")) && path.split(sep).join("/") !== declaredCopy.output);
        await ownedStage.write(join(presentationRoot, declaredCopy.output), materialized.source);
        for (const assetRoot of selected.assetRoots) await copyTree(assetRoot, ownedStage, join("public", "theme-assets"), () => true);
        if (selected.googleStyleGuide) {
          await ownedStage.write("docs/provider-guides/google-map-style.json", (await readRegularFile(selected.googleStyleGuide)).bytes);
        }
        await writeOwnedJson(ownedStage, "src/trip-content/trip-input.json", input);
        await writeOwnedJson(ownedStage, "src/trip-content/place-resolutions.json", ledger);
        await writeOwnedJson(ownedStage, "eternal-pose.json", manifest);
        await ownedStage.verify();
      } catch (error) {
        try { await ownedStage.cleanup(); } catch { /* Preserve foreign or changed entries for inspection. */ }
        throw error;
      }
    },
    async validate(stageDir) {
      await ownedStage.verify();
      await validateStageStructure(stageDir);
      const stagedInput = parseTripProjectInputV2(await readJson(join(stageDir, "src/trip-content/trip-input.json")));
      const stagedLedger = parsePlaceResolutionLedger(await readJson(join(stageDir, "src/trip-content/place-resolutions.json")), stagedInput);
      assertManifestMatchesLedger(await readJson(join(stageDir, "eternal-pose.json")), stagedLedger);
      if (canonicalizeJson(stagedInput) !== canonicalizeJson(input) || canonicalizeJson(stagedLedger) !== canonicalizeJson(ledger)) throw new Error("staged input or ledger changed");
      if (starterPackageVersion(await readJson(join(stageDir, "package.json"))) !== packageVersion) throw new Error("staged package version changed");
      if ((await readRegularFile(join(stageDir, presentationRoot, declaredCopy.output))).bytes.toString("utf8") !== materialized.source) throw new Error("staged presentation copy changed");
      for (const name of privateCopy) {
        try { await lstat(join(stageDir, presentationRoot, name)); throw new Error(`private copy input published: ${name}`); }
        catch (error) { if (error?.code !== "ENOENT") throw error; }
      }
    },
  }, testOperations);
}

function parseArguments(args) {
  if (args.length % 2) return null;
  const allowed = new Set(["--target", "--recipe", "--trip", "--setup-locale", "--copy-catalog", "--resolutions"]);
  const values = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const [name, value] = [args[i], args[i + 1]];
    if (!allowed.has(name) || values.has(name) || !value || value.startsWith("--")) return null;
    values.set(name, value);
  }
  if (!values.has("--target") || !isAbsolute(values.get("--target"))) return null;
  if (values.has("--trip") === values.has("--setup-locale")) return null;
  if (values.has("--resolutions") && !values.has("--trip")) return null;
  if (values.has("--recipe") && values.get("--recipe") !== "oak-washi") return null;
  for (const name of ["--trip", "--copy-catalog", "--resolutions"]) if (values.has(name) && !isAbsolute(values.get(name))) return null;
  return values;
}

if (process.argv[1] && await realpath(resolve(process.argv[1])) === await realpath(fileURLToPath(import.meta.url))) {
  const args = parseArguments(process.argv.slice(2));
  if (!args) { console.error(USAGE); process.exitCode = 1; }
  else {
    try {
      await createTripProject({
        pluginRoot: fileURLToPath(new URL("..", import.meta.url)),
        targetDir: args.get("--target"),
        recipe: args.get("--recipe"),
        tripPath: args.get("--trip"),
        setupLocale: args.get("--setup-locale"),
        copyCatalogPath: args.get("--copy-catalog"),
        resolutionsPath: args.get("--resolutions"),
      });
      console.log(`Created trip project at ${args.get("--target")}`);
    } catch (error) { console.error(error instanceof Error ? error.message : "trip project creation failed"); process.exitCode = 1; }
  }
}
