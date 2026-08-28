import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const starterRoot = join(repoRoot, "plugins/eternal-pose/starter/react");
const contractDriverPath = join(starterRoot, "tests/e2e/contract-driver.ts");

function listPlaywrightTests({ recipe, files = [] }: { recipe?: string; files?: string[] } = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
  if (recipe === undefined) delete env.ETERNAL_POSE_RECIPE_UNDER_TEST;
  else env.ETERNAL_POSE_RECIPE_UNDER_TEST = recipe;
  const npmArguments = ["run", "test:e2e", "--", "--list", ...files];
  const invocation = process.env.npm_execpath
    ? { command: process.execPath, arguments: [process.env.npm_execpath, ...npmArguments] }
    : {
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        arguments: npmArguments,
      };
  return spawnSync(invocation.command, invocation.arguments, {
    cwd: starterRoot,
    encoding: "utf8",
    env,
    shell: false,
  });
}

describe("presentation contract harness", () => {
  test("keeps the internal-only contract out of the default public Playwright collection", () => {
    const result = listPlaywrightTests();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("presentation-contract.spec.ts");
    expect(result.stdout).toContain("Total: 27 tests in 1 file");
  });

  test("collects the shared contract at every viewport for an identified internal recipe", () => {
    const result = listPlaywrightTests({
      recipe: "field-atlas",
      files: ["tests/e2e/presentation-contract.spec.ts"],
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("mobile-trip.spec.ts");
    expect(result.stdout).toContain("Total: 3 tests in 1 file");
  });

  test("locates presentation behavior through generic contract ownership", () => {
    const source = readFileSync(contractDriverPath, "utf8");

    for (const hook of [
      'data-contract-action="',
      'data-contract-owner="',
      'data-contract-surface="',
      'data-owner-id',
    ]) {
      expect(source).toContain(hook);
    }
  });

  test("keeps the driver neutral to authored themes, copy, CSS, and pointer geometry", () => {
    const source = readFileSync(contractDriverPath, "utf8");

    expect(source).not.toMatch(
      /field[-_ ]?atlas|atlas[-_]|native-minimal|classic-travel|editorial-journal/i,
    );
    expect(source).not.toMatch(/\b(?:locator|click)\(\s*["'`]\s*[.#][a-z_-]/i);
    expect(source).not.toMatch(/\[\s*(?:class|id)(?:\s*[~|^$*]?=|\s*\])/i);
    expect(source).not.toMatch(/\bgetBy(?:Text|Label|Placeholder|AltText|Title)\s*\(/);
    expect(source).not.toMatch(/\bgetByRole\s*\([\s\S]{0,160}\bname\s*:/);
    expect(source).not.toMatch(/\b(?:page\.)?mouse\.(?:click|move|down|up)\s*\(/);
    expect(source).not.toMatch(/\.(?:click|tap)\s*\(\s*\{[^}]*\bposition\s*:/s);
    expect(source).not.toContain("boundingBox(");
  });
});
