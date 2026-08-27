import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const coreRoot = join(repoRoot, "packages/core");
const ALLOWED = /^(package\.json|README\.md|LICENSE|dist\/.+)$/;

describe("@laugh-tale/core artifact", () => {
  test("packs only manifest, docs, license, and dist", () => {
    const executable = process.platform === "win32" ? "npm.cmd" : "npm";
    const build = spawnSync(executable, ["run", "build"], {
      cwd: coreRoot,
      encoding: "utf8",
      shell: false,
    });
    expect(build.status, build.stderr).toBe(0);

    const result = spawnSync(executable, ["pack", "--dry-run", "--json"], {
      cwd: coreRoot,
      encoding: "utf8",
      shell: false,
    });
    expect(result.status, result.stderr).toBe(0);

    const [report] = JSON.parse(result.stdout) as Array<{ files: Array<{ path: string }> }>;
    const paths = report.files.map((file) => file.path);
    expect(paths.filter((path) => !ALLOWED.test(path))).toEqual([]);
    expect(paths).toContain("dist/index.js");
    expect(paths).toContain("dist/index.d.ts");
    expect(paths).toContain("dist/browser/index.js");
    expect(paths).toContain("dist/browser/index.d.ts");
    expect(
      paths.some(
        (path) => path.includes(".test.") || path.includes("fixtures") || path.endsWith(".map"),
      ),
    ).toBe(false);
  }, 120_000);
});
