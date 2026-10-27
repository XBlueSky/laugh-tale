import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const scriptPath = join(repositoryRoot, "scripts/set-release-versions.mjs");
const { setReleaseVersions } = (await import(pathToFileURL(scriptPath).href)) as {
  setReleaseVersions: (
    version: string,
    options?: { repoRoot?: string },
  ) => Promise<{ version: string; packages: string[] }>;
};
const temporaryRoots: string[] = [];
const packageNames = ["core", "react", "adapters", "testing"] as const;

type Manifest = {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function manifests(): Record<(typeof packageNames)[number], Manifest> {
  return {
    core: {
      name: "@laugh-tale-island/core",
      version: "2.0.0",
      dependencies: { "@js-temporal/polyfill": "0.5.1" },
    },
    react: {
      name: "@laugh-tale-island/react",
      version: "2.0.0",
      dependencies: { "@laugh-tale-island/core": "2.0.0" },
      peerDependencies: { react: ">=19.2.0 <20", "react-dom": ">=19.2.0 <20" },
      devDependencies: { react: "19.2.8", "react-dom": "19.2.8" },
    },
    adapters: {
      name: "@laugh-tale-island/adapters",
      version: "2.0.0",
      dependencies: { "@laugh-tale-island/core": "2.0.0" },
      peerDependencies: { "@googlemaps/js-api-loader": ">=2.1.1 <3" },
      devDependencies: { "@googlemaps/js-api-loader": "2.1.1" },
    },
    testing: {
      name: "@laugh-tale-island/testing",
      version: "2.0.0",
      dependencies: {
        "@laugh-tale-island/adapters": "2.0.0",
        "@laugh-tale-island/core": "2.0.0",
        "@laugh-tale-island/react": "2.0.0",
      },
      peerDependencies: {
        react: ">=19.2.0 <20",
        "react-dom": ">=19.2.0 <20",
        vitest: ">=4.1.0 <5",
      },
      devDependencies: { react: "19.2.8", "react-dom": "19.2.8", vitest: "4.1.11" },
    },
  };
}

function fixture(mutate?: (fixtureManifests: ReturnType<typeof manifests>) => void): string {
  const root = mkdtempSync(join(tmpdir(), "laugh-tale-release-versions-"));
  temporaryRoots.push(root);
  const fixtureManifests = manifests();
  mutate?.(fixtureManifests);
  for (const name of packageNames) {
    const path = join(root, "packages", name, "package.json");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(fixtureManifests[name], null, 2)}\n`);
  }
  return root;
}

function manifestPath(root: string, name: (typeof packageNames)[number]): string {
  return join(root, "packages", name, "package.json");
}

function readManifest(root: string, name: (typeof packageNames)[number]): Manifest {
  return JSON.parse(readFileSync(manifestPath(root, name), "utf8")) as Manifest;
}

function snapshot(root: string): string[] {
  return packageNames.map((name) => readFileSync(manifestPath(root, name), "utf8"));
}

describe("setReleaseVersions", () => {
  test("updates all package versions and exact internal DAG edges without changing external peers", async () => {
    const root = fixture();

    await expect(setReleaseVersions("3.1.4-beta.2+build.5", { repoRoot: root })).resolves.toEqual({
      version: "3.1.4-beta.2+build.5",
      packages: ["core", "react", "adapters", "testing"],
    });

    const core = readManifest(root, "core");
    const react = readManifest(root, "react");
    const adapters = readManifest(root, "adapters");
    const testing = readManifest(root, "testing");
    for (const manifest of [core, react, adapters, testing]) {
      expect(manifest.version).toBe("3.1.4-beta.2+build.5");
    }
    expect(react.dependencies).toEqual({ "@laugh-tale-island/core": "3.1.4-beta.2+build.5" });
    expect(adapters.dependencies).toEqual({ "@laugh-tale-island/core": "3.1.4-beta.2+build.5" });
    expect(testing.dependencies).toEqual({
      "@laugh-tale-island/adapters": "3.1.4-beta.2+build.5",
      "@laugh-tale-island/core": "3.1.4-beta.2+build.5",
      "@laugh-tale-island/react": "3.1.4-beta.2+build.5",
    });
    expect(react.peerDependencies).toEqual({ react: ">=19.2.0 <20", "react-dom": ">=19.2.0 <20" });
    expect(adapters.peerDependencies).toEqual({ "@googlemaps/js-api-loader": ">=2.1.1 <3" });
    expect(testing.peerDependencies).toEqual({
      react: ">=19.2.0 <20",
      "react-dom": ">=19.2.0 <20",
      vitest: ">=4.1.0 <5",
    });
  });

  test.each(["1.2", "v1.2.3", "01.2.3", "1.02.3", "1.2.03", "1.2.3-01", "1.2.3+"])(
    "rejects invalid strict SemVer %s before writing",
    async (version) => {
      const root = fixture();
      const before = snapshot(root);

      await expect(setReleaseVersions(version, { repoRoot: root })).rejects.toThrow(
        `not a valid semver version: ${version}`,
      );
      expect(snapshot(root)).toEqual(before);
    },
  );

  test.each([
    ["missing", (values: ReturnType<typeof manifests>) => delete values.testing.dependencies!["@laugh-tale-island/core"]],
    ["misplaced peer", (values: ReturnType<typeof manifests>) => {
      delete values.react.dependencies!["@laugh-tale-island/core"];
      values.react.peerDependencies!["@laugh-tale-island/core"] = "2.0.0";
    }],
    ["duplicate dev", (values: ReturnType<typeof manifests>) => {
      values.testing.devDependencies!["@laugh-tale-island/core"] = "2.0.0";
    }],
    ["optional", (values: ReturnType<typeof manifests>) => {
      values.core.optionalDependencies = { "@laugh-tale-island/testing": "2.0.0" };
    }],
    ["unexpected reverse", (values: ReturnType<typeof manifests>) => {
      values.core.dependencies!["@laugh-tale-island/testing"] = "2.0.0";
    }],
    ["non-exact range", (values: ReturnType<typeof manifests>) => {
      values.adapters.dependencies!["@laugh-tale-island/core"] = "^2.0.0";
    }],
    ["skewed package version", (values: ReturnType<typeof manifests>) => {
      values.testing.version = "2.0.1";
    }],
    ["skewed exact pin", (values: ReturnType<typeof manifests>) => {
      values.adapters.dependencies!["@laugh-tale-island/core"] = "1.9.0";
    }],
  ] as const)("rejects a %s internal edge with zero partial writes", async (_label, mutate) => {
    const root = fixture(mutate);
    const before = snapshot(root);

    await expect(setReleaseVersions("3.0.0", { repoRoot: root })).rejects.toThrow(
      /invalid internal dependency graph/,
    );
    expect(snapshot(root)).toEqual(before);
  });
});

describe("set-release-versions CLI", () => {
  test("prints the current usage error when invoked without a version", () => {
    const result = spawnSync(process.execPath, [scriptPath], { encoding: "utf8", shell: false });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("usage: node scripts/set-release-versions.mjs <version>\n");
  });
});
