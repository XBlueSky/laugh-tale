import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const ALLOWED = /^(package\.json|README\.md|LICENSE|dist\/.+)$/;

function run(packageDir: string, commandArguments: string[]): string {
  const executable = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(executable, commandArguments, {
    cwd: packageDir,
    encoding: "utf8",
    shell: false,
  });
  expect(result.status, `${commandArguments.join(" ")}: ${result.stderr}`).toBe(0);
  return result.stdout;
}

function packedPaths(packageDir: string): string[] {
  run(packageDir, ["run", "build"]);
  const [report] = JSON.parse(run(packageDir, ["pack", "--dry-run", "--json"])) as Array<{
    files: Array<{ path: string }>;
  }>;
  return report.files.map((file) => file.path);
}

describe("package artifacts", () => {
  test("both tarballs pack only manifest, docs, license, and dist", () => {
    const corePaths = packedPaths(join(repoRoot, "packages/core"));
    expect(corePaths.filter((path) => !ALLOWED.test(path))).toEqual([]);
    expect(corePaths).toContain("dist/index.js");
    expect(corePaths).toContain("dist/index.d.ts");
    expect(corePaths).toContain("dist/browser/index.js");
    expect(corePaths).toContain("dist/browser/index.d.ts");

    const reactPaths = packedPaths(join(repoRoot, "packages/react"));
    expect(reactPaths.filter((path) => !ALLOWED.test(path))).toEqual([]);
    expect(reactPaths).toContain("dist/index.js");
    expect(reactPaths).toContain("dist/index.d.ts");
    expect(reactPaths).toContain("dist/use-itinerary-sheet.js");

    for (const paths of [corePaths, reactPaths]) {
      expect(
        paths.some(
          (path) => path.includes(".test.") || path.includes("fixtures") || path.endsWith(".map"),
        ),
      ).toBe(false);
    }
  }, 240_000);
});
