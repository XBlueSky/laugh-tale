import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const script = join(repoRoot, "scripts/test-internal-recipe.mjs");

function invoke(arguments_: readonly string[]) {
  return spawnSync(process.execPath, [script, ...arguments_], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

describe("internal recipe test command", () => {
  test.each([
    [[], /Usage:.*--recipe/],
    [["--recipe"], /Usage:.*--recipe/],
    [["field-atlas"], /Usage:.*--recipe/],
    [["--recipe", "field-atlas", "--recipe", "field-atlas"], /exactly once/],
    [["--recipe", "Field Atlas"], /lowercase letters, numbers, and hyphens/],
  ] as const)("rejects invalid arguments %#", (arguments_, expectedError) => {
    const result = invoke(arguments_);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(expectedError);
  });

  test("rejects an unknown internal recipe before installing a consumer", () => {
    const result = invoke(["--recipe", "not-in-the-catalog"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown recipe id: not-in-the-catalog");
  });
});
