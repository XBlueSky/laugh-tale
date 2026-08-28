import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const starterRoot = join(repoRoot, "plugins/eternal-pose/starter/react");
const contractDriverPath = join(starterRoot, "tests/e2e/contract-driver.ts");
const contractSpecPath = join(starterRoot, "tests/e2e/presentation-contract.spec.ts");
const presentationBoundaryTestPath = join(
  starterRoot,
  "src/controllers/presentation-contract.test.tsx",
);
const authoredThemeIds = [
  "field-atlas",
  "reset-arcade",
  "pocket-instrument",
  "vacation-os",
  "memory-cinema",
  "live-journey",
] as const;
const retainedLegacyPatterns = [
  "atlas-",
  "native-minimal",
  "classic-travel",
  "editorial-journal",
] as const;

function neutralityViolations(source: string): string[] {
  const violations: string[] = [];
  const normalized = source.toLowerCase();
  for (const name of [...authoredThemeIds, ...retainedLegacyPatterns]) {
    if (normalized.includes(name)) violations.push(`theme-specific name: ${name}`);
  }
  const forbiddenPatterns = [
    ["CSS class/id locator", /\b(?:locator|click)\(\s*["'`]\s*[.#][a-z_-]/i],
    ["CSS class/id attribute selector", /\[\s*(?:class|id)(?:\s*[~|^$*]?=|\s*\])/i],
    ["copy locator", /\bgetBy(?:Text|Label|Placeholder|AltText|Title)\s*\(/],
    ["named role locator", /\bgetByRole\s*\([\s\S]{0,160}\bname\s*:/],
    ["mouse activation", /\b(?:page\.)?mouse\.(?:click|move|down|up)\s*\(/],
    ["position activation", /\.(?:click|tap)\s*\(\s*\{[^}]*\bposition\s*:/s],
    ["forced activation", /\.(?:click|tap)\s*\(\s*\{[^}]*\bforce\s*:\s*true/s],
    ["timed sleep", /\bwaitForTimeout\s*\(/],
    ["bounding-box activation", /\bboundingBox\s*\(/],
    ["tag-specific reservation reveal", /\bdialog\.locator\(\s*["'`]code["'`]\s*\)/],
  ] as const;
  for (const [label, pattern] of forbiddenPatterns) {
    if (pattern.test(source)) violations.push(label);
  }
  return violations;
}

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
    expect(source).toContain('owner("reservation-reference")');
  });

  test("configures reduced motion before the contract can navigate or render", () => {
    const specSource = readFileSync(contractSpecPath, "utf8");
    const driverSource = readFileSync(contractDriverPath, "utf8");
    const mediaIndex = specSource.indexOf('page.emulateMedia({ reducedMotion: "reduce" })');
    const installIndex = specSource.indexOf("installContractGeolocation(page)");

    expect(mediaIndex).toBeGreaterThanOrEqual(0);
    expect(mediaIndex).toBeLessThan(installIndex);
    expect(driverSource).toContain(
      'window.matchMedia("(prefers-reduced-motion: reduce)").matches',
    );
    expect(driverSource.indexOf("matchMedia")).toBeLessThan(driverSource.indexOf("page.goto"));
  });

  test("builds repeated collapsed-to-half-to-expanded snap stress into every contract run", () => {
    const source = readFileSync(contractDriverPath, "utf8");

    expect(source).toContain("const sheetSnapStressCycles = 5;");
    expect(source).toMatch(
      /for \(let cycle = 0; cycle < sheetSnapStressCycles; cycle \+= 1\)[\s\S]*for \(const snap of \["collapsed", "half", "expanded"\]/,
    );
  });

  test("discovers repository package sources without assuming a fixed consumer depth", () => {
    const source = readFileSync(presentationBoundaryTestPath, "utf8");

    expect(source).toContain("findRepositorySourceRoot(controllerDirectory)");
    expect(source).toContain("if (repositoryDirectory === undefined) return;");
    expect(source).not.toMatch(
      /resolve\(controllerDirectory,\s*["'`](?:\.\.\/){2,}["'`]\)/,
    );
  });

  test("keeps the driver neutral to authored themes, copy, CSS, and pointer geometry", () => {
    const source = readFileSync(contractDriverPath, "utf8");

    expect(neutralityViolations(source)).toEqual([]);
  });

  test.each([...authoredThemeIds, ...retainedLegacyPatterns])(
    "rejects a theme-specific driver mutation: %s",
    (themeName) => {
      expect(neutralityViolations(`const selector = "${themeName}";`)).toContain(
        `theme-specific name: ${themeName}`,
      );
    },
  );

  test("rejects a tag-specific reservation reveal mutation", () => {
    expect(neutralityViolations('await dialog.locator("code").first();')).toContain(
      "tag-specific reservation reveal",
    );
  });

  test.each([
    ['await target.click({ force: true });', "forced activation"],
    ["await page.waitForTimeout(250);", "timed sleep"],
  ])("rejects an unreliable activation mutation: %s", (mutation, violation) => {
    expect(neutralityViolations(mutation)).toContain(violation);
  });
});
