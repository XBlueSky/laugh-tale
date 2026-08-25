import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import type { Stats } from "node:fs";
import {
  lstat as lstatPath,
  open as openPath,
  realpath as realpathPath,
  unlink as unlinkPath,
  writeFile as writeFilePath,
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

type CreateTripProject = (options: {
  pluginRoot: string;
  targetDir: string;
  recipe: string;
  starterDir?: string;
}, testOperations?: TestOperations) => Promise<void>;
type ValidateTargetDirectory = (targetDir: string) => Promise<"missing" | "empty">;
type OpenOperation = (path: string, flags: string, mode?: number) => Promise<FileHandle>;
type LstatOperation = (path: string) => Promise<Stats>;
type RealpathOperation = (path: string) => Promise<string>;
interface MutationEvent {
  phase: string;
  path: string;
  stageDir: string;
  targetDir: string;
}
interface TestOperations {
  beforeMutation?: (event: MutationEvent) => Promise<void> | void;
  lstat?: LstatOperation;
  open?: OpenOperation;
  realpath?: RealpathOperation;
  unlink?: (path: string) => Promise<void>;
  writeFile?: (
    path: string,
    contents: string,
    options: { encoding: "utf8"; flag: "wx"; mode: number },
  ) => Promise<void>;
}

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
  const root = realpathSync(mkdtempSync(join(tmpdir(), "eternal-pose-create-")));
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

function createStarterWithPlaceholderRecipe(parent: string): string {
  const starterDir = join(parent, "placeholder-recipe-starter");
  mkdirSync(join(starterDir, "src/ui/styles"), { recursive: true });
  writeFileSync(join(starterDir, "src/ui/styles/recipe.css"), "placeholder must be replaced\n");
  return starterDir;
}

function failTargetCopy(targetDir: string, afterSuccessfulCopies = 0): (event: MutationEvent) => void {
  const preparedFiles = new Set<string>();
  let successfulCopies = 0;
  return ({ phase, path }) => {
    if (phase !== "target-copy" || !path.startsWith(`${targetDir}/`)) return;
    if (!preparedFiles.has(path)) {
      preparedFiles.add(path);
      return;
    }
    if (successfulCopies >= afterSuccessfulCopies) throw new Error("injected target copy failure");
    successfulCopies += 1;
  };
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

  test("rejects a missing target beneath a symbolic-link ancestor", async () => {
    const root = createTemporaryRoot();
    const realParent = join(root, "real-parent");
    const linkedParent = join(root, "linked-parent");
    mkdirSync(realParent);
    symlinkSync(realParent, linkedParent, "dir");

    await expect(validateTargetDirectory(join(linkedParent, "missing"))).rejects.toThrow(
      "target path components must not be symbolic links",
    );
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

  test("omits generated artifacts and cache directories from the published starter", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const starterDir = join(root, "starter-with-artifacts");
    const targetDir = join(root, "my-trip");
    const omittedDirectories = [
      ".cache",
      ".git",
      ".next",
      ".parcel-cache",
      ".turbo",
      ".vite",
      "build",
      "cache",
      "coverage",
      "dist",
      "node_modules",
      "out",
      "playwright-report",
      "test-results",
    ];
    mkdirSync(starterDir);
    writeFileSync(join(starterDir, "README.md"), "starter\n");
    for (const directory of omittedDirectories) {
      mkdirSync(join(starterDir, directory), { recursive: true });
      writeFileSync(join(starterDir, directory, "generated.txt"), "must not publish\n");
    }

    await createTripProject({ pluginRoot, targetDir, recipe: "quiet-wood", starterDir });

    expect(readFileSync(join(targetDir, "README.md"), "utf8")).toBe("starter\n");
    for (const directory of omittedDirectories) expect(existsSync(join(targetDir, directory))).toBe(false);
  });

  test("rejects a symbolic-link recipe before creating a target", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const recipePath = join(pluginRoot, "recipes/quiet-wood/recipe.css");
    const externalRecipe = join(root, "external-recipe.css");
    const targetDir = join(root, "my-trip");
    writeFileSync(externalRecipe, "external\n");
    unlinkSync(recipePath);
    symlinkSync(externalRecipe, recipePath);

    await expect(
      createTripProject({ pluginRoot, targetDir, recipe: "quiet-wood", starterDir: fixtureStarter }),
    ).rejects.toThrow("recipe must be a regular non-symbolic-link file");

    expect(existsSync(targetDir)).toBe(false);
    expect(stagingDirectories(root)).toEqual([]);
  });

  test.each(["plugin", "starter"] as const)("rejects a symbolic-link %s root", async (sourceRoot) => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const linkedPluginRoot = join(root, "linked-plugin");
    const linkedStarter = join(root, "linked-starter");
    const targetDir = join(root, "my-trip");
    symlinkSync(pluginRoot, linkedPluginRoot, "dir");
    symlinkSync(fixtureStarter, linkedStarter, "dir");

    await expect(
      createTripProject({
        pluginRoot: sourceRoot === "plugin" ? linkedPluginRoot : pluginRoot,
        targetDir,
        recipe: "quiet-wood",
        starterDir: sourceRoot === "starter" ? linkedStarter : fixtureStarter,
      }),
    ).rejects.toThrow(`${sourceRoot} root must not be a symbolic link`);

    expect(existsSync(targetDir)).toBe(false);
  });

  test("rejects a target that overlaps the canonical starter root", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const starterDir = join(root, "starter");
    mkdirSync(starterDir);
    writeFileSync(join(starterDir, "README.md"), "starter\n");

    await expect(
      createTripProject({ pluginRoot, targetDir: join(starterDir, "output"), recipe: "quiet-wood", starterDir }),
    ).rejects.toThrow("refusing overlapping target");

    expect(existsSync(join(starterDir, "output"))).toBe(false);
  });

  test("rejects symbolic links in the publishable starter tree", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const starterDir = join(root, "starter");
    const externalFile = join(root, "external.txt");
    const targetDir = join(root, "my-trip");
    mkdirSync(starterDir);
    writeFileSync(externalFile, "must not escape\n");
    symlinkSync(externalFile, join(starterDir, "escape.txt"));

    await expect(createTripProject({ pluginRoot, targetDir, recipe: "quiet-wood", starterDir })).rejects.toThrow(
      "source tree must not contain symbolic links",
    );

    expect(existsSync(targetDir)).toBe(false);
    expect(stagingDirectories(root)).toEqual([]);
  });

  test.each(["missing", "empty"] as const)("rolls back an injected post-reservation copy failure for an %s target", async (targetState) => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const targetDir = join(root, "my-trip");
    if (targetState === "empty") mkdirSync(targetDir);

    await expect(
      createTripProject(
        { pluginRoot, targetDir, recipe: "quiet-wood", starterDir: fixtureStarter },
        { beforeMutation: failTargetCopy(targetDir) },
      ),
    ).rejects.toThrow("injected target copy failure");

    if (targetState === "missing") {
      expect(existsSync(targetDir)).toBe(false);
    } else {
      expect(readdirSync(targetDir)).toEqual([]);
    }
    expect(stagingDirectories(root)).toEqual([]);
  });

  test("retains its marker when an existing empty target gains a foreign entry during adoption", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const targetDir = join(root, "my-trip");
    const foreignPath = join(targetDir, "foreign.txt");
    mkdirSync(targetDir);

    await expect(
      createTripProject(
        { pluginRoot, targetDir, recipe: "quiet-wood", starterDir: fixtureStarter },
        {
          writeFile: async (path, contents, options) => {
            await writeFilePath(path, contents, options);
            if (dirname(path) === targetDir && path.includes(".laugh-tale-incomplete-")) {
              writeFileSync(foreignPath, "preserve\n");
            }
          },
        },
      ),
    ).rejects.toThrow("target directory must be missing or empty");

    expect(readFileSync(foreignPath, "utf8")).toBe("preserve\n");
    expect(readdirSync(targetDir).some((name) => name.startsWith(".laugh-tale-incomplete-"))).toBe(true);
    expect(stagingDirectories(root)).toEqual([]);
  });

  test("rejects an existing empty target replaced by a symlink before canonical adoption", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const targetDir = join(root, "my-trip");
    const displacedTarget = join(root, "displaced-target");
    const externalTarget = join(root, "external-target");
    mkdirSync(targetDir);
    mkdirSync(externalTarget);
    let targetRealpathCalls = 0;

    await expect(
      createTripProject(
        { pluginRoot, targetDir, recipe: "quiet-wood", starterDir: fixtureStarter },
        {
          realpath: async (path) => {
            if (path === targetDir) {
              targetRealpathCalls += 1;
              if (targetRealpathCalls === 2) {
                renameSync(targetDir, displacedTarget);
                symlinkSync(externalTarget, targetDir, "dir");
              }
            }
            return realpathPath(path);
          },
        },
      ),
    ).rejects.toThrow("target ownership changed");

    expect(lstatSync(targetDir).isSymbolicLink()).toBe(true);
    expect(readdirSync(externalTarget)).toEqual([]);
    expect(readdirSync(displacedTarget)).toEqual([]);
    expect(stagingDirectories(root)).toEqual([]);
  });

  test("treats an EEXIST race as foreign and never removes the foreign file", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const targetDir = join(root, "my-trip");
    const foreignPath = join(targetDir, "README.md");

    await expect(
      createTripProject(
        { pluginRoot, targetDir, recipe: "quiet-wood", starterDir: fixtureStarter },
        {
          open: async (path, flags, mode) => {
            if (path === foreignPath && flags === "wx") writeFileSync(foreignPath, "foreign\n");
            return openPath(path, flags, mode);
          },
        },
      ),
    ).rejects.toThrow();

    expect(readFileSync(foreignPath, "utf8")).toBe("foreign\n");
    expect(readdirSync(targetDir).some((name) => name.startsWith(".laugh-tale-incomplete-"))).toBe(true);
    expect(stagingDirectories(root)).toEqual([]);
  });

  test("rejects a recorded child directory replaced by a symlink before a descendant write", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const starterDir = join(root, "nested-starter");
    const targetDir = join(root, "my-trip");
    const externalDir = join(root, "external");
    const displacedDir = join(targetDir, "nested-owned");
    mkdirSync(join(starterDir, "nested"), { recursive: true });
    mkdirSync(externalDir);
    writeFileSync(join(starterDir, "nested/child.txt"), "starter child\n");
    let replaced = false;

    await expect(
      createTripProject(
        { pluginRoot, targetDir, recipe: "quiet-wood", starterDir },
        {
          beforeMutation: ({ phase, path }) => {
            if (phase !== "target-copy" || !path.endsWith(join("nested", "child.txt")) || replaced) return;
            replaced = true;
            renameSync(join(targetDir, "nested"), displacedDir);
            symlinkSync(externalDir, join(targetDir, "nested"), "dir");
          },
        },
      ),
    ).rejects.toThrow();

    expect(existsSync(join(externalDir, "child.txt"))).toBe(false);
    expect(lstatSync(join(targetDir, "nested")).isSymbolicLink()).toBe(true);
    expect(existsSync(displacedDir)).toBe(true);
    expect(readdirSync(targetDir).some((name) => name.startsWith(".laugh-tale-incomplete-"))).toBe(true);
  });

  test("retains the marker when a foreign entry appears immediately before finalization", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const targetDir = join(root, "my-trip");
    const foreignPath = join(targetDir, "foreign.txt");

    await expect(
      createTripProject(
        { pluginRoot, targetDir, recipe: "quiet-wood", starterDir: fixtureStarter },
        {
          beforeMutation: ({ phase }) => {
            if (phase === "target-finalize" && !existsSync(foreignPath)) writeFileSync(foreignPath, "foreign\n");
          },
        },
      ),
    ).rejects.toThrow("target inventory changed");

    expect(readFileSync(foreignPath, "utf8")).toBe("foreign\n");
    expect(readdirSync(targetDir).some((name) => name.startsWith(".laugh-tale-incomplete-"))).toBe(true);
  });

  test("rolls back a newly created root when marker writing fails before mutation", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const targetDir = join(root, "my-trip");

    await expect(
      createTripProject(
        { pluginRoot, targetDir, recipe: "quiet-wood", starterDir: fixtureStarter },
        {
          writeFile: async (path, contents, options) => {
            if (path.includes(".laugh-tale-stage-") && path.includes(".laugh-tale-incomplete-")) {
              throw new Error("injected marker write failure");
            }
            await writeFilePath(path, contents, options);
          },
        },
      ),
    ).rejects.toThrow("injected marker write failure");

    expect(existsSync(targetDir)).toBe(false);
    expect(stagingDirectories(root)).toEqual([]);
  });

  test("diagnoses a provisional stage when its first post-mkdir identity read fails", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const targetDir = join(root, "my-trip");
    let failedStage: string | undefined;
    let thrown: unknown;

    try {
      await createTripProject(
        { pluginRoot, targetDir, recipe: "quiet-wood", starterDir: fixtureStarter },
        {
          lstat: async (path) => {
            if (failedStage === undefined && path.includes(".laugh-tale-stage-") && existsSync(path)) {
              failedStage = path;
              throw new Error("injected stage root identity failure");
            }
            return lstatPath(path);
          },
        },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    const messages = thrown instanceof AggregateError ? thrown.errors.map((error: Error) => error.message) : [];
    expect(messages).toContain("injected stage root identity failure");
    expect(messages).toContain("stage ownership is uncertain");
    expect(failedStage).toBeDefined();
    expect(readdirSync(failedStage!)).toEqual([]);
    expect(existsSync(targetDir)).toBe(false);
  });

  test("diagnoses a provisional missing target when its first post-mkdir identity read fails", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const targetDir = join(root, "my-trip");
    let failed = false;
    let thrown: unknown;

    try {
      await createTripProject(
        { pluginRoot, targetDir, recipe: "quiet-wood", starterDir: fixtureStarter },
        {
          lstat: async (path) => {
            if (!failed && path === targetDir && existsSync(path)) {
              failed = true;
              throw new Error("injected target root identity failure");
            }
            return lstatPath(path);
          },
        },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    const messages = thrown instanceof AggregateError ? thrown.errors.map((error: Error) => error.message) : [];
    expect(messages).toContain("injected target root identity failure");
    expect(messages).toContain("target ownership is uncertain");
    expect(readdirSync(targetDir)).toEqual([]);
    expect(stagingDirectories(root)).toEqual([]);
  });

  test("leaves an incomplete marker when a created file cannot be identity-recorded", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const targetDir = join(root, "my-trip");

    await expect(
      createTripProject(
        { pluginRoot, targetDir, recipe: "quiet-wood", starterDir: fixtureStarter },
        {
          lstat: async (path) => {
            if (path.includes(".laugh-tale-stage-") && path.endsWith("README.md") && existsSync(path)) {
              throw new Error("injected identity record failure");
            }
            return lstatPath(path);
          },
        },
      ),
    ).rejects.toThrow("injected identity record failure");

    expect(existsSync(targetDir)).toBe(false);
    const [stageName] = stagingDirectories(root);
    expect(stageName).toBeDefined();
    expect(readFileSync(join(root, stageName, "README.md"), "utf8")).toBe("");
    expect(readdirSync(join(root, stageName)).some((name) => name.startsWith(".laugh-tale-incomplete-"))).toBe(true);
  });

  test("refuses cleanup after the reserved target is replaced", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const targetDir = join(root, "my-trip");
    const displacedTarget = join(root, "displaced-target");
    let replaced = false;

    await expect(
      createTripProject(
        { pluginRoot, targetDir, recipe: "quiet-wood", starterDir: fixtureStarter },
        {
          beforeMutation: ({ phase }) => {
            if (phase !== "target-copy" || replaced) return;
            replaced = true;
            renameSync(targetDir, displacedTarget);
            mkdirSync(targetDir);
            writeFileSync(join(targetDir, "foreign.txt"), "preserve\n");
          },
        },
      ),
    ).rejects.toThrow("target ownership changed");

    expect(readFileSync(join(targetDir, "foreign.txt"), "utf8")).toBe("preserve\n");
    expect(existsSync(displacedTarget)).toBe(true);
    expect(stagingDirectories(root)).toEqual([]);
  });

  test("refuses cleanup after the owned stage is replaced", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const targetDir = join(root, "my-trip");
    let replaced = false;

    await expect(
      createTripProject(
        { pluginRoot, targetDir, recipe: "quiet-wood", starterDir: fixtureStarter },
        {
          beforeMutation: ({ phase, stageDir }) => {
            if (phase !== "stage-cleanup" || replaced) return;
            replaced = true;
            renameSync(stageDir, `${stageDir}-displaced`);
            mkdirSync(stageDir);
            writeFileSync(join(stageDir, "foreign.txt"), "preserve\n");
          },
        },
      ),
    ).rejects.toThrow("stage ownership changed");

    expect(readFileSync(join(targetDir, "README.md"), "utf8")).toContain("minimal fixture");
    const replacementStage = stagingDirectories(root).find((name) => existsSync(join(root, name, "foreign.txt")));
    expect(replacementStage).toBeDefined();
  });

  test("runs target restoration and stage cleanup independently and preserves all failures", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = createPluginRoot(root);
    const targetDir = join(root, "my-trip");
    mkdirSync(targetDir);
    const injectedCopy = failTargetCopy(targetDir, 1);

    let thrown: unknown;
    try {
      await createTripProject(
        { pluginRoot, targetDir, recipe: "quiet-wood", starterDir: fixtureStarter },
        {
          beforeMutation: injectedCopy,
          unlink: async (path) => {
            if (path === join(targetDir, "README.md")) throw new Error("injected target cleanup failure");
            await unlinkPath(path);
          },
        },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    const messages = thrown instanceof AggregateError ? thrown.errors.map((error: Error) => error.message) : [];
    expect(messages).toContain("injected target copy failure");
    expect(messages).toContain("injected target cleanup failure");
    expect(stagingDirectories(root)).toEqual([]);
    expect(existsSync(join(targetDir, "README.md"))).toBe(true);
    expect(readdirSync(targetDir).some((name) => name.startsWith(".laugh-tale-incomplete-"))).toBe(true);
  });
});

describe("create CLI", () => {
  test("exits nonzero with safe usage output when required arguments are missing", () => {
    const result = spawnSync(process.execPath, [createScript], { encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });
});
