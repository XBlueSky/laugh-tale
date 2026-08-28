import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

type Manifest = {
  schemaVersion: number;
  id: string;
  label: string;
  summary: string;
  register: string;
  presentation: { source: string; entry: string; css: string[]; assets: string[] };
  map: { profile: string; googleStyleGuide?: string };
  motion: { durationMs: number; easing: string; interruptible: boolean; reducedMotion: string };
  features: string[];
  font: { policy: string; assets: string[]; license?: string };
  validation: { viewports: number[]; screenshots: string[] };
};
type LoadedRecipe = {
  id: string;
  root: string;
  manifest: Readonly<Manifest>;
  presentationRoot: string;
  presentationEntry: string;
  cssFiles: readonly string[];
  assetRoots: readonly string[];
  mapProfile: string;
  googleStyleGuide?: string;
};
type RecipeV2Module = {
  RECIPE_SCHEMA_VERSION: number;
  loadRecipeV2: (recipeDir: string, expectedId: string) => Promise<LoadedRecipe>;
  loadRecipeV2Catalog: (catalogRoot: string) => Promise<ReadonlyMap<string, LoadedRecipe>>;
};
type MutationEvent = { phase: string; path: string; stageDir: string; targetDir: string };
type CreateTripProject = (
  options: { pluginRoot: string; targetDir: string; recipe: string; starterDir?: string; recipeCatalogRoot?: string },
  operations?: { beforeMutation?: (event: MutationEvent) => void },
) => Promise<void>;

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixtureCatalog = join(repoRoot, "tests/fixtures/recipe-v2");
const fixtureRecipe = join(fixtureCatalog, "valid");
const pluginRoot = join(repoRoot, "plugins/eternal-pose");
const recipeV2ModuleUrl = pathToFileURL(join(pluginRoot, "lib/recipe-v2.mjs")).href;
const createTripProjectModuleUrl = pathToFileURL(join(pluginRoot, "scripts/create-trip-project.mjs")).href;
const { RECIPE_SCHEMA_VERSION, loadRecipeV2, loadRecipeV2Catalog } = (await import(recipeV2ModuleUrl)) as RecipeV2Module;
const { createTripProject } = (await import(createTripProjectModuleUrl)) as { createTripProject: CreateTripProject };
const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "eternal-pose-recipe-v2-")));
  temporaryRoots.push(root);
  return root;
}

function readManifest(recipeDir: string): Manifest {
  return JSON.parse(readFileSync(join(recipeDir, "recipe.json"), "utf8")) as Manifest;
}

function writeManifest(recipeDir: string, mutate: (manifest: Manifest) => void): void {
  const manifest = readManifest(recipeDir);
  mutate(manifest);
  writeFileSync(join(recipeDir, "recipe.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function makeRecipe(root: string, id: string, mutate?: (manifest: Manifest, recipeDir: string) => void): string {
  const recipeDir = join(root, id);
  cpSync(fixtureRecipe, recipeDir, { recursive: true });
  writeManifest(recipeDir, (manifest) => {
    manifest.id = id;
    mutate?.(manifest, recipeDir);
  });
  return recipeDir;
}

function makeStarter(root: string): string {
  const starter = join(root, "starter");
  mkdirSync(join(starter, "src/presentation"), { recursive: true });
  mkdirSync(join(starter, "src/ui"), { recursive: true });
  writeFileSync(join(starter, "src/presentation/foreign.txt"), "starter presentation must not publish\n");
  writeFileSync(join(starter, "src/ui/keep.ts"), "export const keep = true;\n");
  writeFileSync(
    join(starter, "package.json"),
    JSON.stringify({ dependencies: { "@laugh-tale-island/core": "1.2.3", "@laugh-tale-island/react": "4.5.6" } }),
  );
  return starter;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("recipe v2 manifest loading", () => {
  test("loads the complete internal fixture catalog", async () => {
    const catalog = await loadRecipeV2Catalog(fixtureCatalog);
    const valid = catalog.get("valid")!;

    expect(RECIPE_SCHEMA_VERSION).toBe(2);
    expect(valid.manifest.schemaVersion).toBe(2);
    expect([...catalog.keys()]).toEqual(["valid"]);
    expect(valid.manifest.validation.viewports).toEqual([320, 390, 430, 768, 1024, 1440]);
    expect(new Set(valid.manifest.presentation.css).size).toBe(valid.manifest.presentation.css.length);
    expect(new Set(valid.manifest.presentation.assets).size).toBe(valid.manifest.presentation.assets.length);
    expect(new Set(valid.manifest.features).size).toBe(valid.manifest.features.length);
    expect(valid.manifest.motion.durationMs).toSatisfy(Number.isFinite);
    expect(valid.manifest.motion.durationMs).toBeGreaterThanOrEqual(0);
    expect(valid.mapProfile).toEqual(expect.any(String));
    expect(lstatSync(valid.mapProfile).isFile()).toBe(true);
    expect(lstatSync(valid.mapProfile).isSymbolicLink()).toBe(false);
    expect(valid.googleStyleGuide).toEqual(expect.any(String));
    expect(lstatSync(valid.googleStyleGuide!).isFile()).toBe(true);
    expect(lstatSync(valid.googleStyleGuide!).isSymbolicLink()).toBe(false);
    for (const value of [valid.manifest.id, valid.manifest.label, valid.manifest.summary, valid.manifest.presentation.entry, valid.manifest.map.profile, valid.manifest.motion.easing]) {
      expect(value.trim()).not.toBe("");
    }
    expect(Object.isFrozen(valid)).toBe(true);
    expect(Object.isFrozen(valid.manifest)).toBe(true);
  });

  test("loads and freezes empty feature and screenshot arrays", async () => {
    const root = temporaryRoot();
    const recipeDir = makeRecipe(root, "empty-arrays", (manifest) => {
      manifest.features = [];
      manifest.validation.screenshots = [];
    });

    const loaded = await loadRecipeV2(recipeDir, "empty-arrays");

    expect(loaded.manifest.features).toEqual([]);
    expect(loaded.manifest.validation.screenshots).toEqual([]);
    expect(Object.isFrozen(loaded.manifest.features)).toBe(true);
    expect(Object.isFrozen(loaded.manifest.validation.screenshots)).toBe(true);
    expect(() => loaded.manifest.features.push("media")).toThrow(TypeError);
    expect(() => loaded.manifest.validation.screenshots.push("home")).toThrow(
      TypeError,
    );
  });

  test.each([
    [
      "duplicate features",
      (manifest: Manifest) => { manifest.features = ["media", "media"]; },
      /features.*duplicates/i,
    ],
    [
      "unknown features",
      (manifest: Manifest) => { manifest.features = ["media", "unknown-feature"]; },
      /features\[1\].*one of/i,
    ],
    [
      "duplicate screenshots",
      (manifest: Manifest) => { manifest.validation.screenshots = ["home", "home"]; },
      /validation\.screenshots.*duplicates/i,
    ],
    [
      "unknown screenshots",
      (manifest: Manifest) => { manifest.validation.screenshots = ["home", "unknown-screenshot"]; },
      /validation\.screenshots\[1\].*one of/i,
    ],
  ] as const)("rejects %s in non-empty enum arrays", async (name, mutate, error) => {
    const root = temporaryRoot();
    const recipeDir = makeRecipe(root, `invalid-${name.replaceAll(" ", "-")}`, mutate);

    await expect(loadRecipeV2(recipeDir, `invalid-${name.replaceAll(" ", "-")}`)).rejects.toThrow(error);
  });

  test.each([
    ["unknown-schema", (manifest: Manifest) => { manifest.schemaVersion = 1; }, /schemaVersion.*2/],
    ["id-mismatch", (manifest: Manifest) => { manifest.id = "another-id"; }, /id.*directory/i],
    ["missing-entry", (manifest: Manifest) => { manifest.presentation.entry = "missing.ts"; }, /presentation\.entry/],
    ["dot-dot-path", (manifest: Manifest) => { manifest.presentation.entry = "../escape.ts"; }, /root-contained/],
    ["absolute-path", (manifest: Manifest) => { manifest.presentation.entry = "/tmp/escape.ts"; }, /relative/],
    ["backslash-path", (manifest: Manifest) => { manifest.presentation.entry = "styles\\index.css"; }, /normalized/],
    ["local-font-without-license", (manifest: Manifest) => { manifest.font = { policy: "local-open-license", assets: [] }; }, /font\.license/],
  ] as const)("rejects %s", async (id, mutate, error) => {
    const root = temporaryRoot();
    const recipeDir = makeRecipe(root, id, mutate);
    await expect(loadRecipeV2(recipeDir, id)).rejects.toThrow(error);
  });

  test("rejects a symbolic-link presentation entry", async () => {
    const root = temporaryRoot();
    const recipeDir = makeRecipe(root, "symlink-entry");
    const entry = join(recipeDir, "presentation/index.ts");
    const external = join(root, "external.ts");
    writeFileSync(external, "export const external = true;\n");
    unlinkSync(entry);
    symlinkSync(external, entry, "file");

    await expect(loadRecipeV2(recipeDir, "symlink-entry")).rejects.toThrow(/symbolic link/);
  });

  test("rejects duplicate recipe ids in deterministic catalog order", async () => {
    const root = temporaryRoot();
    makeRecipe(root, "alpha", (manifest) => { manifest.id = "duplicate"; });
    makeRecipe(root, "beta", (manifest) => { manifest.id = "duplicate"; });

    await expect(loadRecipeV2Catalog(root)).rejects.toThrow(/duplicate recipe id/);
  });

  test("rejects a catalog recipe whose manifest id does not match its directory", async () => {
    const root = temporaryRoot();
    makeRecipe(root, "alpha", (manifest) => { manifest.id = "beta"; });

    await expect(loadRecipeV2Catalog(root)).rejects.toThrow(/id.*directory/i);
  });
});

describe("recipe v2 internal composition", () => {
  test("composes only the selected recipe and records schema 2 provenance", async () => {
    const root = temporaryRoot();
    const catalog = join(root, "catalog");
    makeRecipe(catalog, "selected");
    writeFileSync(join(catalog, "undeclared.txt"), "do not publish\n");
    const starterDir = makeStarter(root);
    const targetDir = join(root, "trip");

    await createTripProject({ pluginRoot, targetDir, recipe: "selected", starterDir, recipeCatalogRoot: catalog });

    expect(readFileSync(join(targetDir, "src/presentation/index.ts"), "utf8")).toContain('"valid"');
    expect(readFileSync(join(targetDir, "src/presentation/styles/index.css"), "utf8")).toContain("fixture-presentation");
    expect(readFileSync(join(targetDir, "src/presentation/README.md"), "utf8")).toContain("Valid Recipe");
    expect(existsSync(join(targetDir, "src/presentation/foreign.txt"))).toBe(false);
    expect(existsSync(join(targetDir, "catalog"))).toBe(false);
    expect(existsSync(join(targetDir, "undeclared.txt"))).toBe(false);
    expect(existsSync(join(targetDir, "public/theme-assets/logo.svg"))).toBe(true);
    expect(existsSync(join(targetDir, "docs/provider-guides/google-map-style.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(targetDir, "eternal-pose.json"), "utf8"))).toEqual({
      generatorVersion: "0.1.0",
      recipe: "selected",
      recipeSchemaVersion: 2,
      packages: { "@laugh-tale-island/core": "1.2.3", "@laugh-tale-island/react": "4.5.6" },
    });
  });

  test("loads the v2 recipe before reserving a destination", async () => {
    const root = temporaryRoot();
    const catalog = join(root, "catalog");
    makeRecipe(catalog, "broken", (manifest) => { manifest.presentation.entry = "missing.ts"; });
    const targetDir = join(root, "trip");

    await expect(createTripProject({ pluginRoot, targetDir, recipe: "broken", starterDir: makeStarter(root), recipeCatalogRoot: catalog })).rejects.toThrow(/presentation\.entry/);
    expect(existsSync(targetDir)).toBe(false);
  });

  test("rejects a v2 target inside the supplied catalog root", async () => {
    const root = temporaryRoot();
    const catalog = join(root, "catalog");
    makeRecipe(catalog, "selected");
    const targetDir = join(catalog, "generated-trip");

    await expect(createTripProject({ pluginRoot, targetDir, recipe: "selected", starterDir: makeStarter(root), recipeCatalogRoot: catalog })).rejects.toThrow(/refusing overlapping target/);
    expect(existsSync(targetDir)).toBe(false);
  });

  test("removes the missing target after a v2 mutation failure", async () => {
    const root = temporaryRoot();
    const catalog = join(root, "catalog");
    makeRecipe(catalog, "selected");
    const targetDir = join(root, "trip");

    await expect(createTripProject(
      { pluginRoot, targetDir, recipe: "selected", starterDir: makeStarter(root), recipeCatalogRoot: catalog },
      { beforeMutation: ({ phase, path }) => { if (phase === "target-copy" && path.endsWith("index.ts")) throw new Error("injected failure"); } },
    )).rejects.toThrow("injected failure");
    expect(existsSync(targetDir)).toBe(false);
  });

  test("aborts when a v2 source becomes a symbolic link between validation and copy", async () => {
    const root = temporaryRoot();
    const catalog = join(root, "catalog");
    const recipeDir = makeRecipe(catalog, "selected");
    const targetDir = join(root, "trip");
    const external = join(root, "external.ts");
    writeFileSync(external, "export const outside = true;\n");
    let replaced = false;

    await expect(createTripProject(
      { pluginRoot, targetDir, recipe: "selected", starterDir: makeStarter(root), recipeCatalogRoot: catalog },
      { beforeMutation: ({ phase }) => {
        if (!replaced && phase === "stage-copy") {
          replaced = true;
          const entry = join(recipeDir, "presentation/index.ts");
          unlinkSync(entry);
          symlinkSync(external, entry, "file");
        }
      } },
    )).rejects.toThrow(/symbolic links/);
    expect(existsSync(targetDir)).toBe(false);
  });
});
