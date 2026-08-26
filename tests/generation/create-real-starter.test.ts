import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { open as openPath } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

type CreateTripProject = (
  options: {
    pluginRoot: string;
    targetDir: string;
    recipe: string;
    starterDir?: string;
  },
  testOperations?: {
    open?: (path: string, flags: string, mode?: number) => Promise<FileHandle>;
  },
) => Promise<void>;

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const pluginRoot = join(repoRoot, "plugins/eternal-pose");
const starterRoot = join(pluginRoot, "starter/react");
const createModuleUrl = pathToFileURL(join(pluginRoot, "scripts/create-trip-project.mjs")).href;
const { createTripProject } = (await import(createModuleUrl)) as {
  createTripProject: CreateTripProject;
};
const recipes = ["quiet-wood", "sticker-brutalist", "native-minimal"] as const;
const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "eternal-pose-real-starter-"));
  temporaryRoots.push(root);
  return root;
}

function walk(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    const relativePath = relative(root, absolutePath);
    return entry.isDirectory()
      ? [relativePath, ...walk(root, absolutePath)]
      : [relativePath];
  });
}

function textInventory(root: string): Array<{ path: string; contents: string }> {
  return walk(root)
    .filter((path) => !existsSync(join(root, path)) || !readdirSafe(join(root, path)))
    .flatMap((path) => {
      const absolutePath = join(root, path);
      try {
        return [{ path, contents: readFileSync(absolutePath, "utf8") }];
      } catch {
        return [];
      }
    });
}

function readdirSafe(path: string): boolean {
  try {
    readdirSync(path);
    return true;
  } catch {
    return false;
  }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("real starter generation", () => {
  test.each(recipes)("generates an independent %s trip site with only its selected recipe", async (recipe) => {
    const root = temporaryRoot();
    const targetDir = join(root, `${recipe}-trip`);

    await createTripProject({ pluginRoot, targetDir, recipe });

    expect(readFileSync(join(targetDir, "src/ui/styles/recipe.css"), "utf8")).toBe(
      readFileSync(join(pluginRoot, "recipes", recipe, "recipe.css"), "utf8"),
    );
    expect(readFileSync(join(targetDir, "eternal-pose.json"), "utf8")).toBe(
      JSON.stringify({ generatorVersion: "0.1.0", recipe }, null, 2),
    );

    const paths = walk(targetDir);
    expect(paths).toEqual(expect.arrayContaining([
      "README.md",
      "AGENTS.md",
      "CLAUDE.md",
      ".env.example",
      "docs/trip-experience-contract.md",
      "package-lock.json",
      "tests/e2e",
    ]));
    expect(paths.some((path) => path.split("/").includes("recipes"))).toBe(false);
    expect(paths.some((path) => path.includes(".claude-plugin"))).toBe(false);
    expect(paths.some((path) => path.includes(".codex-plugin"))).toBe(false);
    expect(paths.some((path) => path.split("/").includes("skills"))).toBe(false);
    expect(paths.some((path) => path.split("/").includes("node_modules"))).toBe(false);
    expect(paths.some((path) => ["dist", "coverage", "test-results", "playwright-report"].some((part) => path.split("/").includes(part)))).toBe(false);

    const banned = /tokyoTrip|AIza|tokyo-six-day-map|mockup-v[12]/;
    expect(textInventory(targetDir).filter(({ contents }) => banned.test(contents))).toEqual([]);
    expect(readFileSync(join(targetDir, "eternal-pose.json"), "utf8")).not.toContain(pluginRoot);
    expect(readFileSync(join(targetDir, "eternal-pose.json"), "utf8")).not.toContain(starterRoot);
  });

  test("keeps one shared experience contract instead of duplicating it into agent files", async () => {
    const root = temporaryRoot();
    const targetDir = join(root, "documented-trip");
    await createTripProject({ pluginRoot, targetDir, recipe: "quiet-wood" });

    const contract = readFileSync(join(targetDir, "docs/trip-experience-contract.md"), "utf8");
    const agents = readFileSync(join(targetDir, "AGENTS.md"), "utf8");
    const claude = readFileSync(join(targetDir, "CLAUDE.md"), "utf8");
    for (const agentFile of [agents, claude]) {
      expect(agentFile).toContain("docs/trip-experience-contract.md");
      expect(agentFile).not.toContain(contract);
    }
    expect(contract).toContain("Map-first");
    expect(contract).toContain("freely editable");
    expect(contract).toContain("protected invariants");
  });

  test("never overwrites a racing provenance file outside the owned inventory", async () => {
    const root = temporaryRoot();
    const targetDir = join(root, "collision-trip");
    let collisionPath: string | undefined;

    await expect(
      createTripProject(
        { pluginRoot, targetDir, recipe: "quiet-wood" },
        {
          open: async (path, flags, mode) => {
            if (path.endsWith("eternal-pose.json") && collisionPath === undefined) {
              collisionPath = path;
              writeFileSync(path, "foreign provenance\n");
            }
            return openPath(path, flags, mode);
          },
        },
      ),
    ).rejects.toThrow();

    expect(collisionPath).toBeDefined();
    expect(readFileSync(collisionPath!, "utf8")).toBe("foreign provenance\n");
    expect(existsSync(targetDir)).toBe(false);
    expect(dirname(collisionPath!)).toContain(".laugh-tale-stage-");
  });
});
