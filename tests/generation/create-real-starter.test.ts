import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const pluginRoot = join(repoRoot, "plugins/eternal-pose");
const starterRoot = join(pluginRoot, "starter/react");
const recipePresentation = join(pluginRoot, "recipes-v2/oak-washi/presentation");
const { createTripProject } = await import(pathToFileURL(join(pluginRoot, "scripts/create-trip-project.mjs")).href) as {
  createTripProject: (request: { pluginRoot: string; targetDir: string; setupLocale: string }) => Promise<void>;
};
const { materializeCopyCatalog } = await import(pathToFileURL(join(pluginRoot, "scripts/create-trip-project.mjs")).href) as {
  materializeCopyCatalog: (request: { locale: string; recipeRoot: string }) => Promise<{ source: string }>;
};
const roots: string[] = [];
function ownedRoot() { const root = mkdtempSync(join(realpathSync(tmpdir()), "ep-real-starter-")); roots.push(root); return root; }
function files(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(root, path) : [relative(root, path).split("\\").join("/")];
  }).sort();
}
function json(path: string): unknown { return JSON.parse(readFileSync(path, "utf8")) as unknown; }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("real Oak & Washi starter generation", () => {
  test("publishes one self-contained presentation with canonical zh-Hant-TW copy", async () => {
    const targetDir = join(ownedRoot(), "site");
    await createTripProject({ pluginRoot, targetDir, setupLocale: "zh-Hant-TW" });
    const targetPresentation = join(targetDir, "src/presentation");
    const privateInputs = new Set(["copy/catalog-schema.json", "copy/en.json", "copy/zh-Hant.json", "copy/resolve-copy.ts"]);
    expect(files(targetPresentation)).toEqual(files(recipePresentation).filter((path) => !privateInputs.has(path)));
    for (const path of files(recipePresentation).filter((entry) => !privateInputs.has(entry))) {
      expect(readFileSync(join(targetPresentation, path)), path).toEqual(readFileSync(join(recipePresentation, path)));
    }
    expect(readFileSync(join(targetPresentation, "index.ts"), "utf8")).toContain("documentMetadataCopy");
    expect(readFileSync(join(targetPresentation, "index.ts"), "utf8")).toContain("catalog.metadata");
    const generatedPresentation = await import(pathToFileURL(join(targetPresentation, "index.ts")).href) as {
      documentMetadataCopy: unknown;
      catalog: { metadata: unknown };
    };
    expect(generatedPresentation.documentMetadataCopy).toBe(generatedPresentation.catalog.metadata);
    expect(readFileSync(join(targetPresentation, "copy/catalog.ts"), "utf8")).toBe((await materializeCopyCatalog({ locale: "zh-Hant-TW", recipeRoot: dirname(recipePresentation) })).source);
    expect(readFileSync(join(targetDir, "public/OFL-Huninn.txt"))).toEqual(readFileSync(join(recipePresentation, "assets/OFL-Huninn.txt")));
    expect(readFileSync(join(targetDir, "index.html"), "utf8")).toContain('<link rel="license" href="/OFL-Huninn.txt" />');
    for (const path of files(join(starterRoot, "src/app"))) expect(readFileSync(join(targetDir, "src/app", path)), path).toEqual(readFileSync(join(starterRoot, "src/app", path)));
    const generatedPaths = files(targetDir);
    expect(generatedPaths.filter(path => path.endsWith("/copy/catalog.ts"))).toEqual(["src/presentation/copy/catalog.ts"]);
    const generatedOwned = new Set(["eternal-pose.json", "src/trip-content/trip-input.json", "src/trip-content/place-resolutions.json", "docs/provider-guides/google-map-style.json"]);
    for (const path of generatedPaths) {
      if (path.startsWith("src/presentation/") || path.startsWith("public/theme-assets/") || generatedOwned.has(path)) continue;
      expect(readFileSync(join(targetDir, path)), path).toEqual(readFileSync(join(starterRoot, path)));
    }
    for (const path of generatedPaths.filter(path => path.startsWith("src/") && /\.[jt]sx?$/.test(path))) {
      const source = readFileSync(join(targetDir, path), "utf8");
      expect(source, path).not.toMatch(/(?:from\s*|import\s*\()["'][^"']*(?:plugins\/|scripts\/|en\.json|zh-Hant\.json|catalog-schema\.json|resolve-copy)/);
      expect(source, path).not.toMatch(/navigator\.(?:language|languages)/);
    }
    expect(json(join(targetDir, "eternal-pose.json"))).toMatchObject({
      schemaVersion: 2,
      generatorVersion: "2.0.0",
      recipe: { id: "oak-washi", sourceVersion: "2.0.0" },
      packages: {
        "@laugh-tale-island/adapters": "2.0.0",
        "@laugh-tale-island/core": "2.0.0",
        "@laugh-tale-island/react": "2.0.0",
        "@laugh-tale-island/testing": "2.0.0",
      },
    });
  }, 20_000);

  test("retains shared starter source and documentation without local artifacts", async () => {
    const targetDir = join(ownedRoot(), "site");
    await createTripProject({ pluginRoot, targetDir, setupLocale: "en-US" });
    const paths = files(targetDir);
    for (const path of ["README.md", "AGENTS.md", "CLAUDE.md", ".env.example", "docs/trip-experience-contract.md", "src/app/App.tsx", "src/trip-content/trip-input.json", "src/trip-content/place-resolutions.json"]) expect(paths).toContain(path);
    for (const path of paths) expect(path).not.toMatch(/(?:^|\/)(?:node_modules|dist|coverage|test-results|playwright-report|recipes)(?:\/|$)/);
    expect(paths).not.toContain("src/presentation/copy/en.json");
    expect(paths).not.toContain("src/presentation/copy/resolve-copy.ts");
    expect(readFileSync(join(targetDir, "src/presentation/copy/catalog.ts"), "utf8")).toContain('export const locale = "en-US";');
    expect(readFileSync(join(targetDir, "src/app/App.tsx"))).toEqual(readFileSync(join(starterRoot, "src/app/App.tsx")));
    expect(existsSync(join(targetDir, "node_modules"))).toBe(false);
  });

  test("same locale produces byte-identical complete presentation trees", async () => {
    const root = ownedRoot(), first = join(root, "one"), second = join(root, "two");
    await createTripProject({ pluginRoot, targetDir: first, setupLocale: "en-US" });
    await createTripProject({ pluginRoot, targetDir: second, setupLocale: "en-US" });
    expect(files(join(first, "src/presentation"))).toEqual(files(join(second, "src/presentation")));
    for (const path of files(join(first, "src/presentation"))) {
      expect(readFileSync(join(first, "src/presentation", path))).toEqual(readFileSync(join(second, "src/presentation", path)));
    }
  }, 20_000);
});
