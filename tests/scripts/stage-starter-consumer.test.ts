import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const script = join(repoRoot, "scripts/stage-starter-consumer.mjs");
const recipeCatalogRoot = join(repoRoot, "plugins/eternal-pose/recipes-v2");
const packRoot = join(repoRoot, "tmp/staged-packs");
const nonPackageWorkspaceDir = join(repoRoot, "packages/.staging-non-package");
const coreVersion = (
  JSON.parse(readFileSync(join(repoRoot, "packages/core/package.json"), "utf8")) as {
    version: string;
  }
).version;
const { stageStarterConsumer } = (await import(pathToFileURL(script).href)) as {
  stageStarterConsumer: (options?: {
    install?: boolean;
    outDir?: string;
    recipe?: string;
    recipeCatalogRoot?: string;
  }) => Promise<{ stagedRoot: string; tarballs: string[] }>;
};
const stagedRoots: string[] = [];

function stagedRoot(name: string): string {
  const root = join(repoRoot, `tmp/${name}`);
  stagedRoots.push(root);
  return root;
}

function filesBelow(root: string, current = root): string[] {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const path = join(current, entry.name);
    if (entry.isDirectory()) return filesBelow(root, path);
    return [relative(root, path).split(sep).join("/")];
  });
}

function expectWorkspaceTarballs(staged: string, tarballs: readonly string[]): void {
  const manifest = JSON.parse(readFileSync(join(staged, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
  };
  const escapedVersion = coreVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  expect(tarballs).toHaveLength(2);
  expect(new Set(tarballs).size).toBe(tarballs.length);
  for (const tarball of tarballs) expect(existsSync(tarball)).toBe(true);
  expect(manifest.dependencies["@laugh-tale-island/core"]).toMatch(
    new RegExp(`^file:.*laugh-tale-island-core-${escapedVersion}\\.tgz$`),
  );
  expect(manifest.dependencies["@laugh-tale-island/react"]).toMatch(
    /^file:.*laugh-tale-island-react-\d+\.\d+\.\d+.*\.tgz$/,
  );
}

afterEach(() => {
  for (const root of stagedRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  rmSync(nonPackageWorkspaceDir, { recursive: true, force: true });
});

describe("stage-starter-consumer", () => {
  test("keeps the public starter-copy path clean while ignoring non-package workspace entries", async () => {
    const outDir = stagedRoot("staged-public-starter-test");
    mkdirSync(nonPackageWorkspaceDir);
    writeFileSync(join(nonPackageWorkspaceDir, "README.md"), "not a package\n");
    const { stagedRoot: staged, tarballs } = await stageStarterConsumer({
      install: false,
      outDir,
    });

    expect(staged).toBe(outDir);
    expectWorkspaceTarballs(staged, tarballs);
    expect(existsSync(join(repoRoot, "packages/.DS_Store"))).toBe(true);
    expect(existsSync(join(staged, "src/App.tsx"))).toBe(true);
    expect(existsSync(join(staged, "src/presentation/DayHeader.tsx"))).toBe(true);
    expect(existsSync(join(staged, "package-lock.json"))).toBe(false);
    expect(existsSync(join(staged, "node_modules"))).toBe(false);
    expect(existsSync(join(staged, "dist"))).toBe(false);
  }, 120_000);

  test("composes only the selected schema-2 authored presentation before packaging", async () => {
    const outDir = stagedRoot("staged-field-atlas-test");
    const { stagedRoot: staged, tarballs } = await stageStarterConsumer({
      install: false,
      outDir,
      recipe: "field-atlas",
      recipeCatalogRoot,
    });

    expect(staged).toBe(outDir);
    expectWorkspaceTarballs(staged, tarballs);
    expect(JSON.parse(readFileSync(join(staged, "eternal-pose.json"), "utf8"))).toMatchObject({
      recipe: "field-atlas",
      recipeSchemaVersion: 2,
    });
    expect(filesBelow(join(staged, "src/presentation")).sort()).toEqual([
      "README.md",
      "components/AtlasDecisions.tsx",
      "components/AtlasMapSurface.tsx",
      "components/AtlasStates.tsx",
      "components/AtlasTimeline.tsx",
      "components/AtlasUtilityPanels.tsx",
      "experience/FieldAtlasExperience.tsx",
      "home/FieldAtlasHome.tsx",
      "index.ts",
      "styles/accessibility.css",
      "styles/components.css",
      "styles/index.css",
      "styles/layout.css",
      "styles/tokens.css",
      "theme-map-profile.ts",
    ]);
    expect(existsSync(join(staged, "recipes-v2"))).toBe(false);
    expect(existsSync(join(staged, "recipe.json"))).toBe(false);
    expect(existsSync(join(staged, "node_modules"))).toBe(false);
    expect(existsSync(join(staged, "dist"))).toBe(false);
    expect(existsSync(join(staged, "package-lock.json"))).toBe(false);
  }, 120_000);

  test("rejects composition before mutating package-build output", async () => {
    const outDir = stagedRoot("staged-unknown-recipe-test");
    const sentinel = join(packRoot, "composition-must-precede-packing.txt");
    writeFileSync(sentinel, "keep\n");

    await expect(
      stageStarterConsumer({
        install: false,
        outDir,
        recipe: "unknown-recipe",
        recipeCatalogRoot,
      }),
    ).rejects.toThrow("unknown recipe id: unknown-recipe");

    expect(readFileSync(sentinel, "utf8")).toBe("keep\n");
    expect(existsSync(outDir)).toBe(false);
  }, 120_000);
});
