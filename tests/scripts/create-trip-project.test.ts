import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const pluginRoot = join(repoRoot, "plugins/eternal-pose");
const script = join(pluginRoot, "scripts/create-trip-project.mjs");
const { createTripProject, materializeCopyCatalog } = await import(pathToFileURL(script).href) as {
  createTripProject: (request: { pluginRoot: string; targetDir: string; recipe?: string; tripPath?: string; setupLocale?: string; copyCatalogPath?: string; resolutionsPath?: string; starterDir?: string; recipeCatalogRoot?: string }, operations?: { beforeMutation?: (event: { phase: string; path: string }) => void; beforeStageWrite?: (event: { stageDir: string; path: string }) => void }) => Promise<void>;
  materializeCopyCatalog: (request: { locale: string; recipeRoot: string; authoredCatalogPath?: string }) => Promise<{ canonicalLocale: string; sourceCatalog: string; source: string }>;
};
const roots: string[] = [];
function ownedRoot() { const root = realpathSync(mkdtempSync(join(tmpdir(), "ep-create-v2-"))); roots.push(root); return root; }
function json<T = unknown>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T; }
function writeJson(path: string, value: unknown) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); }
function inputFixture(locale = "en") {
  const bias = { center: { lat: 35.68, lng: 139.76 }, radiusMeters: 5000 };
  const query = (ownerId: string, text: string) => ({ ownerId, text, locale, regionCode: "JP", locationBias: bias, maxCandidates: 3 });
  return { schemaVersion: 2, trip: { id: "sample", title: "Sample", locale, timezone: "Etc/UTC", startDate: "2026-09-04", endDate: "2026-09-04", days: [{ id: "day-1", date: "2026-09-04", title: "Friday", nodes: [{ id: "museum", dayId: "day-1", kind: "sightseeing", title: "Museum", timing: { certainty: "unknown" }, optionality: "core", payload: {} }, { id: "cafe", dayId: "day-1", kind: "dining", title: "Cafe", timing: { certainty: "unknown" }, optionality: "core", payload: {} }] }], routes: [], candidateGroups: [], reservations: [], tasks: [] }, enrichmentPolicy: { provider: "google", regionCode: "JP", locationBias: bias }, placeOwners: [{ ownerId: "place:cafe", source: "itinerary", query: query("place:cafe", "Cafe"), bindings: [{ kind: "node", id: "cafe" }] }, { ownerId: "place:museum", source: "itinerary", query: query("place:museum", "Museum"), bindings: [{ kind: "node", id: "museum" }] }] };
}
function cli(...args: string[]) { return spawnSync(process.execPath, [script, ...args], { cwd: repoRoot, encoding: "utf8" }); }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("Oak & Washi Create", () => {
  test("omitted recipe creates canonical schema-v2 output and empty ledger", async () => {
    const targetDir = join(ownedRoot(), "created-trip");
    await createTripProject({ pluginRoot, targetDir, setupLocale: "zh-Hant-TW" });
    expect(json(join(targetDir, "eternal-pose.json"))).toMatchObject({ schemaVersion: 2, generatorVersion: "2.0.0", recipe: { id: "oak-washi", sourceVersion: "2.0.0" }, presentationContractVersion: 2 });
    expect(json(join(targetDir, "src/trip-content/place-resolutions.json"))).toEqual({ schemaVersion: 1, provider: "google", entries: [] });
    expect(json(join(targetDir, "src/trip-content/trip-input.json"))).toMatchObject({ schemaVersion: 2, trip: null, setupLocale: "zh-Hant-TW" });
    for (const file of ["index.ts", "copy/catalog.ts", "copy/schema.ts"]) expect(existsSync(join(targetDir, "src/presentation", file))).toBe(true);
    for (const file of ["copy/en.json", "copy/zh-Hant.json", "copy/catalog-schema.json", "copy/resolve-copy.ts"]) expect(existsSync(join(targetDir, "src/presentation", file))).toBe(false);
    expect(readFileSync(join(targetDir, "src/presentation/copy/catalog.ts"), "utf8")).toBe(readFileSync(join(pluginRoot, "recipes-v2/oak-washi/presentation/copy/catalog.ts"), "utf8"));
    expect(readdirSync(dirname(targetDir)).filter((name) => name.startsWith(".laugh-tale-stage-"))).toEqual([]);
  });

  test("trip input without resolutions makes every owner unresolved", async () => {
    const root = ownedRoot(), targetDir = join(root, "trip"), tripPath = join(root, "input.json");
    writeJson(tripPath, inputFixture());
    await createTripProject({ pluginRoot, targetDir, tripPath });
    expect(json<{ entries: unknown[] }>(join(targetDir, "src/trip-content/place-resolutions.json")).entries).toEqual([
      expect.objectContaining({ ownerId: "place:cafe", status: "unresolved", reason: "not-reviewed" }),
      expect.objectContaining({ ownerId: "place:museum", status: "unresolved", reason: "not-reviewed" }),
    ]);
  });

  test("incomplete ledger fails before exposing target", async () => {
    const root = ownedRoot(), targetDir = join(root, "trip"), tripPath = join(root, "input.json"), resolutionsPath = join(root, "ledger.json");
    writeJson(tripPath, inputFixture()); writeJson(resolutionsPath, { schemaVersion: 1, provider: "google", entries: [] });
    await expect(createTripProject({ pluginRoot, targetDir, tripPath, resolutionsPath })).rejects.toThrow(/owner coverage/);
    expect(existsSync(targetDir)).toBe(false);
  });

  test.each(["quiet-wood", "sticker-brutalist", "native-minimal", "field-atlas"])("rejects retired recipe %s", async (recipe) => {
    const targetDir = join(ownedRoot(), recipe);
    await expect(createTripProject({ pluginRoot, targetDir, recipe, setupLocale: "en" })).rejects.toThrow(/only oak-washi/);
    expect(existsSync(targetDir)).toBe(false);
  });

  test("rejects broad, symlink and overlapping targets", async () => {
    const root = ownedRoot(), linked = join(root, "linked"); symlinkSync(root, linked, "dir");
    await expect(createTripProject({ pluginRoot, targetDir: parse(root).root, setupLocale: "en" })).rejects.toThrow(/broad target/);
    await expect(createTripProject({ pluginRoot, targetDir: join(linked, "trip"), setupLocale: "en" })).rejects.toThrow(/symbolic links/);
    await expect(createTripProject({ pluginRoot, targetDir: join(pluginRoot, "starter/react/generated"), setupLocale: "en" })).rejects.toThrow(/overlapping target|broad target/);
  });

  test("rejects a source symlink without exposing target", async () => {
    const root = ownedRoot(), starterDir = join(root, "starter"), targetDir = join(root, "trip");
    mkdirSync(starterDir); writeFileSync(join(starterDir, "package.json"), readFileSync(join(pluginRoot, "starter/react/package.json"))); writeFileSync(join(root, "outside.txt"), "outside"); symlinkSync(join(root, "outside.txt"), join(starterDir, "outside.txt"));
    await expect(createTripProject({ pluginRoot, targetDir, starterDir, setupLocale: "en" })).rejects.toThrow(/symbolic links/);
    expect(existsSync(targetDir)).toBe(false);
  });

  test("stage failure leaves missing target missing", async () => {
    const targetDir = join(ownedRoot(), "trip");
    await expect(createTripProject({ pluginRoot, targetDir, setupLocale: "en" }, { beforeMutation: ({ phase }) => { if (phase === "stage-validate") throw new Error("injected failure"); } })).rejects.toThrow("injected failure");
    expect(existsSync(targetDir)).toBe(false);
  });

  test("source replacement after recipe validation fails before publication", async () => {
    const root = ownedRoot(), catalog = join(root, "catalog"), recipe = join(catalog, "oak-washi"), targetDir = join(root, "trip");
    mkdirSync(catalog); cpSync(join(pluginRoot, "recipes-v2/oak-washi"), recipe, { recursive: true });
    const source = join(recipe, "presentation/index.ts"), outside = join(root, "outside.ts");
    writeFileSync(outside, "export const outside = true;\n");
    await expect(createTripProject({ pluginRoot, targetDir, setupLocale: "en", recipeCatalogRoot: catalog }, {
      beforeMutation: ({ phase }) => {
        if (phase === "stage-populate") { unlinkSync(source); symlinkSync(outside, source); }
      },
    })).rejects.toThrow(/symbolic links|regular file/);
    expect(existsSync(targetDir)).toBe(false);
  });

  test("preserves a foreign stage inode and keeps the target absent", async () => {
    const root = ownedRoot(), targetDir = join(root, "trip");
    let foreignPath = "";
    await expect(createTripProject({ pluginRoot, targetDir, setupLocale: "en" }, {
      beforeMutation: ({ phase, path }) => {
        if (phase === "stage-validate") { foreignPath = join(path, "foreign.txt"); writeFileSync(foreignPath, "foreign\n"); }
      },
    })).rejects.toThrow(/tree identity|foreign stage entry|cleanup refused/);
    expect(readFileSync(foreignPath, "utf8")).toBe("foreign\n");
    expect(existsSync(targetDir)).toBe(false);
  });

  test("rejects a foreign entry planted before population can adopt it", async () => {
    const root = ownedRoot(), targetDir = join(root, "trip");
    let foreignPath = "";
    await expect(createTripProject({ pluginRoot, targetDir, setupLocale: "en" }, {
      beforeMutation: ({ phase, path }) => {
        if (phase === "stage-populate") { foreignPath = join(path, "foreign.txt"); writeFileSync(foreignPath, "foreign\n"); }
      },
    })).rejects.toThrow(/foreign|inventory|owned/);
    expect(readFileSync(foreignPath, "utf8")).toBe("foreign\n");
    expect(existsSync(targetDir)).toBe(false);
  });

  test("rejects a substituted owned destination parent mid-population", async () => {
    const root = ownedRoot(), targetDir = join(root, "trip");
    let displaced = "";
    await expect(createTripProject({ pluginRoot, targetDir, setupLocale: "en" }, {
      beforeStageWrite: ({ stageDir, path }) => {
        if (displaced || !path.endsWith(join("src", "app", "App.tsx"))) return;
        const ownedParent = join(stageDir, "src/app");
        displaced = join(stageDir, "displaced-app");
        renameSync(ownedParent, displaced);
        mkdirSync(ownedParent);
      },
    })).rejects.toThrow(/ownership|inventory|identity|foreign/);
    expect(displaced).not.toBe("");
    expect(existsSync(displaced)).toBe(true);
    expect(existsSync(targetDir)).toBe(false);
  });

  test("rejects a starter without required app source", async () => {
    const root = ownedRoot(), starterDir = join(root, "starter"), targetDir = join(root, "trip");
    mkdirSync(starterDir);
    writeFileSync(join(starterDir, "package.json"), readFileSync(join(pluginRoot, "starter/react/package.json")));
    await expect(createTripProject({ pluginRoot, targetDir, starterDir, setupLocale: "en" })).rejects.toThrow(/project\.missing-file: src\/app\/App\.tsx/);
    expect(existsSync(targetDir)).toBe(false);
  });

  test("rejects provider implementation source in a starter", async () => {
    const root = ownedRoot(), starterDir = join(root, "starter"), targetDir = join(root, "trip");
    const sourceStarter = join(pluginRoot, "starter/react");
    cpSync(sourceStarter, starterDir, { recursive: true, filter: (path) => !relative(sourceStarter, path).split(/[\\/]/).some((part) => ["node_modules", "dist", "coverage"].includes(part)) });
    mkdirSync(join(starterDir, "src/providers/google"), { recursive: true });
    writeFileSync(join(starterDir, "src/providers/google/private.ts"), "export const privateProvider = true;\n");
    await expect(createTripProject({ pluginRoot, targetDir, starterDir, setupLocale: "en" })).rejects.toThrow(/unexpected source directory.*providers/i);
    expect(existsSync(targetDir)).toBe(false);
  });

  test("rejects any unlisted direct source directory", async () => {
    const root = ownedRoot(), starterDir = join(root, "starter"), targetDir = join(root, "trip");
    const sourceStarter = join(pluginRoot, "starter/react");
    cpSync(sourceStarter, starterDir, { recursive: true, filter: (path) => !relative(sourceStarter, path).split(/[\\/]/).some((part) => ["node_modules", "dist", "coverage"].includes(part)) });
    mkdirSync(join(starterDir, "src/services/google"), { recursive: true });
    writeFileSync(join(starterDir, "src/services/google/private.ts"), "export const privateProvider = true;\n");
    await expect(createTripProject({ pluginRoot, targetDir, starterDir, setupLocale: "en" })).rejects.toThrow(/unexpected source directory.*services/i);
    expect(existsSync(targetDir)).toBe(false);
  });

  test("copy materialization selects built-ins and validates authored locale", async () => {
    const root = ownedRoot(), recipeRoot = join(pluginRoot, "recipes-v2/oak-washi"), authoredCatalogPath = join(root, "catalog.json");
    expect((await materializeCopyCatalog({ locale: "en-US", recipeRoot })).sourceCatalog).toBe("en");
    expect((await materializeCopyCatalog({ locale: "zh-Hant-TW", recipeRoot })).sourceCatalog).toBe("zh-Hant");
    await expect(materializeCopyCatalog({ locale: "fr-FR", recipeRoot })).rejects.toThrow(/copy-catalog/);
    writeJson(authoredCatalogPath, { locale: "de-DE", catalog: json(join(recipeRoot, "presentation/copy/en.json")) });
    await expect(materializeCopyCatalog({ locale: "fr-FR", recipeRoot, authoredCatalogPath })).rejects.toThrow(/locale/);
    writeJson(authoredCatalogPath, { locale: "fr-FR", catalog: json(join(recipeRoot, "presentation/copy/en.json")) });
    expect((await materializeCopyCatalog({ locale: "fr-FR", recipeRoot, authoredCatalogPath })).source).toContain('export const locale = "fr-FR";');
  });

  test.each(["missing key", "extra leaf", "wrong leaf type"])("authored copy rejects %s recursively", async mutation => {
    const root = ownedRoot(), recipeRoot = join(pluginRoot, "recipes-v2/oak-washi"), authoredCatalogPath = join(root, "catalog.json");
    const catalog = json<Record<string, Record<string, unknown>>>(join(recipeRoot, "presentation/copy/en.json"));
    if (mutation === "missing key") delete catalog.home.openDay;
    if (mutation === "extra leaf") catalog.home.unexpected = "unexpected";
    if (mutation === "wrong leaf type") catalog.home.openDay = { nested: "not a string" };
    writeJson(authoredCatalogPath, { locale: "fr-FR", catalog });
    const reason = mutation === "missing key" ? "catalog.home.openDay is required" : mutation === "extra leaf" ? "catalog.home.unexpected is not allowed" : "catalog.home.openDay must be a string";
    await expect(materializeCopyCatalog({ locale: "fr-FR", recipeRoot, authoredCatalogPath })).rejects.toThrow(reason);
  });

  test("materialization reads the recipe's declared copy paths", async () => {
    const root = ownedRoot(), recipeRoot = join(root, "oak-washi");
    cpSync(join(pluginRoot, "recipes-v2/oak-washi"), recipeRoot, { recursive: true });
    renameSync(join(recipeRoot, "presentation/copy/en.json"), join(recipeRoot, "presentation/copy/en-reference.json"));
    const manifestPath = join(recipeRoot, "recipe.json"), manifest = json<{ presentation: { copy: { references: { en: string } } } }>(manifestPath);
    manifest.presentation.copy.references.en = "copy/en-reference.json";
    writeJson(manifestPath, manifest);
    expect((await materializeCopyCatalog({ locale: "en", recipeRoot })).sourceCatalog).toBe("en");
  });

  test("CLI requires one locale source and strict absolute flags", () => {
    const root = ownedRoot(), target = join(root, "trip"), tripPath = join(root, "input.json"); writeJson(tripPath, inputFixture());
    expect(cli("--target", target, "--setup-locale", "en").status).toBe(0);
    for (const args of [["--target", join(root, "missing")], ["--target", join(root, "both"), "--trip", tripPath, "--setup-locale", "en"], ["--target", join(root, "duplicate"), "--setup-locale", "en", "--setup-locale", "fr"], ["--target", join(root, "unknown"), "--setup-locale", "en", "--unknown", "x"], ["--target", "relative", "--setup-locale", "en"], ["--target", join(root, "relative-trip"), "--trip", "relative"], ["--target", join(root, "ledger"), "--setup-locale", "en", "--resolutions", tripPath]]) {
      const result = cli(...args); expect(result.status, args.join(" ")).not.toBe(0);
      expect(result.stderr).toContain("Usage: node create-trip-project.mjs --target /absolute/output/my-trip [--recipe oak-washi] (--trip /absolute/input.json | --setup-locale zh-Hant-TW) [--copy-catalog /absolute/catalog.json] [--resolutions /absolute/place-resolutions.json]");
    }
  });
});
