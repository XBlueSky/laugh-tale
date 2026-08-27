import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { open as openPath } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";

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
  test.each(recipes)("excludes local-only artifacts from a %s generated site without hiding legitimate source", async (recipe) => {
    const root = temporaryRoot();
    const starterDir = join(root, "contaminated-starter");
    const targetDir = join(root, `${recipe}-sanitized-trip`);
    const runtimeKey = ["runtime", "_", "K".repeat(28)].join("");
    const excluded = [
      ".env.local",
      ".env.development.local",
      "tsconfig.app.tsbuildinfo",
      "src/generated.js.map",
      "src/generated.d.ts.map",
      "src/generated.ts.map",
      "src/generated.tsx.map",
      "packages/BUILD/bundle.js",
      "packages/.CaChE/result.json",
      "packages/TEST-RESULTS/result.json",
      "packages/.ESLINTCACHE",
      "dist/bundle.js",
      "coverage/report.json",
      ".cache/result.json",
      "test-results/result.json",
      "playwright-report/index.html",
      "credentials.json",
      "service-account-key.json",
      "mobile/Google-Services.json",
      "private-key.pem",
    ];
    const preserved = [
      ".env.example",
      "src/build.ts",
      "src/cache.ts",
      "src/credential-form.tsx",
      "src/map.ts",
      "src/atlas.map",
    ];

    for (const path of [...excluded, ...preserved]) {
      mkdirSync(dirname(join(starterDir, path)), { recursive: true });
      writeFileSync(
        join(starterDir, path),
        path === ".env.local" ? `VITE_GOOGLE_MAPS_API_KEY=${runtimeKey}\n` : `safe:${path}\n`,
      );
    }

    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const captureProbe = "generator-output-capture-probe";
    let capturedLog: string;
    let capturedError: string;
    try {
      console.log(captureProbe);
      console.error(captureProbe);
      await createTripProject({ pluginRoot, targetDir, recipe, starterDir });
    } finally {
      capturedLog = consoleLog.mock.calls.flat().join(" ");
      capturedError = consoleError.mock.calls.flat().join(" ");
      consoleLog.mockRestore();
      consoleError.mockRestore();
    }

    const generatedPaths = walk(targetDir);
    for (const path of excluded) expect(generatedPaths).not.toContain(path);
    for (const path of preserved) expect(generatedPaths).toContain(path);
    expect(textInventory(targetDir).some(({ contents }) => contents.includes(runtimeKey))).toBe(false);
    expect(capturedLog).toContain(captureProbe);
    expect(capturedError).toContain(captureProbe);
    expect(capturedLog).not.toContain(runtimeKey);
    expect(capturedError).not.toContain(runtimeKey);
  });

  test.each(recipes)("generates an independent %s trip site with only its selected recipe", async (recipe) => {
    const root = temporaryRoot();
    const targetDir = join(root, `${recipe}-trip`);

    await createTripProject({ pluginRoot, targetDir, recipe });

    expect(readFileSync(join(targetDir, "src/ui/styles/recipe.css"), "utf8")).toBe(
      readFileSync(join(pluginRoot, "recipes", recipe, "recipe.css"), "utf8"),
    );
    const metadata = JSON.parse(readFileSync(join(targetDir, "eternal-pose.json"), "utf8")) as {
      generatorVersion: string;
      recipe: string;
      packages: Record<string, string>;
    };
    expect(metadata.generatorVersion).toBe("0.1.0");
    expect(metadata.recipe).toBe(recipe);
    const starterManifest = JSON.parse(
      readFileSync(join(pluginRoot, "starter/react/package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    expect(metadata.packages).toEqual({
      "@laugh-tale-island/core": starterManifest.dependencies["@laugh-tale-island/core"],
      "@laugh-tale-island/react": starterManifest.dependencies["@laugh-tale-island/react"],
    });

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
