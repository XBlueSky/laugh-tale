import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

type CreateTripProject = (options: {
  pluginRoot: string;
  targetDir: string;
  recipe: string;
  starterDir?: string;
}) => Promise<void>;
type ValidateTargetDirectory = (targetDir: string) => Promise<"missing" | "empty">;

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const createScript = join(repoRoot, "plugins/eternal-pose/scripts/create-trip-project.mjs");
const createModuleUrl = pathToFileURL(createScript).href;
const pathSafetyModuleUrl = pathToFileURL(join(repoRoot, "plugins/eternal-pose/lib/path-safety.mjs")).href;
const fixtureStarter = join(repoRoot, "tests/fixtures/minimal-starter");
const { createTripProject } = (await import(createModuleUrl)) as { createTripProject: CreateTripProject };
const { validateTargetDirectory } = (await import(pathSafetyModuleUrl)) as {
  validateTargetDirectory: ValidateTargetDirectory;
};
const temporaryRoots: string[] = [];

function createTemporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "eternal-pose-create-"));
  temporaryRoots.push(root);
  return root;
}

function createPluginRoot(parent: string): string {
  const pluginRoot = join(parent, "plugin");
  const recipeDir = join(pluginRoot, "recipes/quiet-wood");
  mkdirSync(recipeDir, { recursive: true });
  writeFileSync(join(recipeDir, "recipe.css"), ":root { --surface: linen; }\n");
  return pluginRoot;
}

function stagingDirectories(parent: string): string[] {
  return readdirSync(parent).filter((name) => name.startsWith(".laugh-tale-stage-"));
}

function createFailingStarter(parent: string): string {
  const starterDir = join(parent, "copy-failure-starter");
  mkdirSync(join(starterDir, "src/ui/styles/recipe.css"), { recursive: true });
  writeFileSync(join(starterDir, "README.md"), "copy must roll back\n");
  return starterDir;
}

function createStarterWithPlaceholderRecipe(parent: string): string {
  const starterDir = join(parent, "placeholder-recipe-starter");
  mkdirSync(join(starterDir, "src/ui/styles"), { recursive: true });
  writeFileSync(join(starterDir, "src/ui/styles/recipe.css"), "placeholder must be replaced\n");
  return starterDir;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("target path validation", () => {
  test("accepts only missing or empty directories", async () => {
    const root = createTemporaryRoot();
    const missing = join(root, "missing");
    const empty = join(root, "empty");
    const nonEmpty = join(root, "non-empty");
    mkdirSync(empty);
    mkdirSync(nonEmpty);
    writeFileSync(join(nonEmpty, "keep.txt"), "keep\n");

    await expect(validateTargetDirectory(missing)).resolves.toBe("missing");
    await expect(validateTargetDirectory(empty)).resolves.toBe("empty");
    await expect(validateTargetDirectory(nonEmpty)).rejects.toThrow("target directory must be missing or empty");
  });

  test("rejects filesystem-root, home, and symbolic-link targets before writes", async () => {
    const root = createTemporaryRoot();
    const empty = join(root, "empty");
    const symlinkTarget = join(root, "linked-target");
    mkdirSync(empty);
    symlinkSync(empty, symlinkTarget, "dir");

    await expect(validateTargetDirectory(parse(root).root)).rejects.toThrow("refusing broad target");
    await expect(validateTargetDirectory(homedir())).rejects.toThrow("refusing broad target");
    await expect(validateTargetDirectory(symlinkTarget)).rejects.toThrow("target must not be a symbolic link");
  });
});

describe("atomic trip project creation", () => {
  test("refuses a non-empty target and the plugin root", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const nonEmpty = join(root, "non-empty");
    mkdirSync(nonEmpty);
    writeFileSync(join(nonEmpty, "keep.txt"), "keep\n");

    await expect(
      createTripProject({ pluginRoot, targetDir: nonEmpty, recipe: "quiet-wood", starterDir: fixtureStarter }),
    ).rejects.toThrow("target directory must be missing or empty");
    await expect(
      createTripProject({ pluginRoot, targetDir: pluginRoot, recipe: "quiet-wood", starterDir: fixtureStarter }),
    ).rejects.toThrow("refusing broad target");
    expect(readFileSync(join(nonEmpty, "keep.txt"), "utf8")).toBe("keep\n");
  });

  test("publishes a starter and selected recipe without leaving staging files", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const targetDir = join(root, "my-trip");

    await createTripProject({ pluginRoot, targetDir, recipe: "quiet-wood", starterDir: fixtureStarter });

    expect(readFileSync(join(targetDir, "README.md"), "utf8")).toContain("minimal fixture");
    expect(readFileSync(join(targetDir, "src/ui/styles/recipe.css"), "utf8")).toContain("--surface: linen");
    expect(stagingDirectories(dirname(targetDir))).toEqual([]);
  });

  test("replaces a starter placeholder with the selected recipe", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const starterDir = createStarterWithPlaceholderRecipe(root);
    const targetDir = join(root, "my-trip");

    await createTripProject({ pluginRoot, targetDir, recipe: "quiet-wood", starterDir });

    expect(readFileSync(join(targetDir, "src/ui/styles/recipe.css"), "utf8")).toBe(":root { --surface: linen; }\n");
  });

  test.each(["missing", "empty"] as const)("rolls back a copy failure for an %s target", async (targetState) => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const starterDir = createFailingStarter(root);
    const targetDir = join(root, "my-trip");
    if (targetState === "empty") mkdirSync(targetDir);

    await expect(createTripProject({ pluginRoot, targetDir, recipe: "quiet-wood", starterDir })).rejects.toThrow();

    if (targetState === "missing") {
      expect(() => readdirSync(targetDir)).toThrow();
    } else {
      expect(readdirSync(targetDir)).toEqual([]);
    }
    expect(stagingDirectories(root)).toEqual([]);
  });
});

describe("create CLI", () => {
  test("exits nonzero with safe usage output when required arguments are missing", () => {
    const result = spawnSync(process.execPath, [createScript], { encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });
});
