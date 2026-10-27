import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const ALLOWED = /^(package\.json|README\.md|LICENSE|dist\/.+)$/;
const packageCases = [
  {
    name: "core",
    entries: [
      "dist/index.js",
      "dist/index.d.ts",
      "dist/browser/index.js",
      "dist/browser/index.d.ts",
      "dist/enrichment/index.js",
      "dist/enrichment/index.d.ts",
    ],
  },
  {
    name: "react",
    entries: ["dist/index.js", "dist/index.d.ts"],
  },
  {
    name: "adapters",
    entries: [
      "dist/google/index.js",
      "dist/google/index.d.ts",
      "dist/google/node/index.js",
      "dist/google/node/index.d.ts",
      "dist/maplibre/index.js",
      "dist/maplibre/index.d.ts",
    ],
  },
  {
    name: "testing",
    entries: ["dist/index.js", "dist/index.d.ts"],
  },
] as const;

const internalEdges = {
  core: [],
  react: ["@laugh-tale-island/core"],
  adapters: ["@laugh-tale-island/core"],
  testing: [
    "@laugh-tale-island/adapters",
    "@laugh-tale-island/core",
    "@laugh-tale-island/react",
  ],
} as const;

const testingFixturePaths = [
  "dist/fixtures/adversarial-places.d.ts",
  "dist/fixtures/adversarial-places.js",
  "dist/fixtures/adversarial-routes.d.ts",
  "dist/fixtures/adversarial-routes.js",
  "dist/fixtures/oak-washi-visual-cases.d.ts",
  "dist/fixtures/oak-washi-visual-cases.js",
  "dist/fixtures/synthetic-trip-v2.d.ts",
  "dist/fixtures/synthetic-trip-v2.js",
] as const;
const testingFixturePathSet = new Set<string>(testingFixturePaths);

interface DependencyManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function assertRegistryDependencies(manifest: DependencyManifest, packageName: string): void {
  for (const section of [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies, manifest.optionalDependencies]) {
    for (const [name, version] of Object.entries(section ?? {})) {
      if (name.startsWith("@laugh-tale-island/")) {
        expect(version, `${packageName} ${name} must be an exact registry version`).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
      }
      expect(version, `${packageName} ${name} must not resolve to a workspace`).not.toMatch(/^(?:file:|link:|workspace:)/);
    }
  }
}

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
  run(packageDir, ["run", "build", "--ignore-scripts"]);
  const [report] = JSON.parse(run(packageDir, ["pack", "--dry-run", "--json"])) as Array<{
    files: Array<{ path: string }>;
  }>;
  return report.files.map((file) => file.path);
}

function isForbiddenArtifactPath(packageName: string, path: string): boolean {
  return (
    path.includes(".test.") ||
    /(^|\/)(?:src|tests?)\//.test(path) ||
    path.endsWith(".map") ||
    /(?:\.css$|recipes-v2|starter\/react)/.test(path) ||
    (path.includes("fixtures") &&
      (packageName !== "testing" || !testingFixturePathSet.has(path)))
  );
}

describe("package artifacts", () => {
  test.each(["file:/tmp/vendor", "link:../vendor", "workspace:*"])("rejects an optional external dependency with local specifier %s", (version) => {
    expect(() => assertRegistryDependencies({ optionalDependencies: { "external-vendor": version } }, "fixture")).toThrow(/must not resolve to a workspace/);
  });
  test.each([
    ["core", "dist/fixtures/rogue.js"],
    ["testing", "dist/fixtures/unused.js"],
  ])("rejects unauthorized compiled fixture %s/%s", (packageName, path) => {
    expect(isForbiddenArtifactPath(packageName, path)).toBe(true);
  });

  test("all four tarballs contain only declared compiled package artifacts", () => {
    for (const packageCase of packageCases) {
      const packageDir = join(repoRoot, "packages", packageCase.name);
      const paths = packedPaths(packageDir);
      expect(
        paths.filter((path) => !ALLOWED.test(path)),
        `${packageCase.name} contains files outside its package artifact allowlist`,
      ).toEqual([]);
      expect(
        paths.some((path) => isForbiddenArtifactPath(packageCase.name, path)),
        `${packageCase.name} contains source, test, undeclared fixture, or source-map output`,
      ).toBe(false);
      expect(
        paths.filter((path) => path.startsWith("dist/fixtures/")).sort(),
        `${packageCase.name} compiled fixture inventory`,
      ).toEqual(packageCase.name === "testing" ? [...testingFixturePaths] : []);
      for (const entry of packageCase.entries) expect(paths, packageCase.name).toContain(entry);

      for (const path of paths.filter((path) => /\.(?:js|ts)$/.test(path))) {
        const content = readFileSync(join(packageDir, path), "utf8");
        expect(content, `${packageCase.name}/${path} presentation contamination`).not.toMatch(
          /recipes-v2|starter\/react|["'][^"'\n]*\.css["']|lucide|Oak & Washi|Start your trip|尚未定位/,
        );
        if (packageCase.name !== "testing") {
          expect(content, `${packageCase.name}/${path} test contamination`).not.toMatch(
            /@laugh-tale-island\/testing|@testing-library|["']vitest["']|Fake(?:Map|Route|Place|Navigation|Progress)|syntheticTripV2|Test fixture:/,
          );
        }
        if (packageCase.name === "core" || packageCase.name === "react") {
          expect(content, `${packageCase.name}/${path} SDK isolation`).not.toMatch(/@googlemaps|google\.maps/);
        }
      }

      const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as DependencyManifest;
      const placed = Object.keys(manifest.dependencies ?? {})
        .filter((name) => name.startsWith("@laugh-tale-island/"))
        .sort();
      expect(placed, `${packageCase.name} internal runtime dependency placement`).toEqual([
        ...internalEdges[packageCase.name],
      ]);
      assertRegistryDependencies(manifest, packageCase.name);
    }
  }, 240_000);
});
