import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const VERSION = "2.0.0";
const INTERNAL_PREFIX = "@laugh-tale-island/";
const packageNames = [
  "@laugh-tale-island/core",
  "@laugh-tale-island/react",
  "@laugh-tale-island/adapters",
  "@laugh-tale-island/testing",
] as const;
type PackageName = (typeof packageNames)[number];
type DependencySection =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies";
type DependencyMap = Record<string, string>;
type PackageManifest = {
  name: string;
  version: string;
  dependencies?: DependencyMap;
  devDependencies?: DependencyMap;
  optionalDependencies?: DependencyMap;
  peerDependencies?: DependencyMap;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

const packagePaths: Record<PackageName, string> = {
  "@laugh-tale-island/core": "packages/core/package.json",
  "@laugh-tale-island/react": "packages/react/package.json",
  "@laugh-tale-island/adapters": "packages/adapters/package.json",
  "@laugh-tale-island/testing": "packages/testing/package.json",
};
const expectedEdges: Record<PackageName, readonly PackageName[]> = {
  "@laugh-tale-island/core": [],
  "@laugh-tale-island/react": ["@laugh-tale-island/core"],
  "@laugh-tale-island/adapters": ["@laugh-tale-island/core"],
  "@laugh-tale-island/testing": [
    "@laugh-tale-island/core",
    "@laugh-tale-island/react",
    "@laugh-tale-island/adapters",
  ],
};

function readManifest(relativePath: string): PackageManifest {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as PackageManifest;
}

function cloneManifests(
  manifests: Readonly<Record<PackageName, PackageManifest>>,
): Record<PackageName, PackageManifest> {
  return structuredClone(manifests);
}

function internalEntries(section: DependencyMap | undefined): Array<[string, string]> {
  return Object.entries(section ?? {}).filter(([name]) => name.startsWith(INTERNAL_PREFIX));
}

function inspectPackageGraph(
  manifests: Readonly<Record<PackageName, PackageManifest>>,
): string[] {
  const issues: string[] = [];
  const graph = new Map<PackageName, PackageName[]>();

  for (const packageName of packageNames) {
    const manifest = manifests[packageName];
    if (manifest.name !== packageName) issues.push(`${packageName}: wrong manifest name`);
    if (manifest.version !== VERSION) issues.push(`${packageName}: wrong package version`);

    const occurrences = new Map<string, DependencySection[]>();
    for (const sectionName of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ] as const) {
      for (const [dependencyName] of internalEntries(manifest[sectionName])) {
        const sections = occurrences.get(dependencyName) ?? [];
        sections.push(sectionName);
        occurrences.set(dependencyName, sections);
      }
    }
    for (const [dependencyName, sections] of occurrences) {
      if (sections.length > 1) {
        issues.push(`${packageName}: duplicate ${dependencyName} in ${sections.join(",")}`);
      }
    }

    const actualDependencies = internalEntries(manifest.dependencies);
    const actualNames = actualDependencies.map(([name]) => name).sort();
    const wantedNames = [...expectedEdges[packageName]].sort();
    if (JSON.stringify(actualNames) !== JSON.stringify(wantedNames)) {
      issues.push(`${packageName}: wrong internal dependency placement`);
    }
    for (const [dependencyName, specifier] of actualDependencies) {
      if (specifier !== manifests[dependencyName as PackageName]?.version) {
        issues.push(`${packageName}: ${dependencyName} is not pinned to its owning version`);
      }
    }
    for (const sectionName of [
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ] as const) {
      if (internalEntries(manifest[sectionName]).length > 0) {
        issues.push(`${packageName}: internal edge in ${sectionName}`);
      }
    }
    graph.set(
      packageName,
      [
        ...actualNames,
        ...internalEntries(manifest.devDependencies).map(([name]) => name),
        ...internalEntries(manifest.optionalDependencies).map(([name]) => name),
        ...internalEntries(manifest.peerDependencies).map(([name]) => name),
      ] as PackageName[],
    );
  }

  const visiting = new Set<PackageName>();
  const visited = new Set<PackageName>();
  const visit = (packageName: PackageName): void => {
    if (visiting.has(packageName)) {
      issues.push(`cycle through ${packageName}`);
      return;
    }
    if (visited.has(packageName)) return;
    visiting.add(packageName);
    for (const dependency of graph.get(packageName) ?? []) visit(dependency);
    visiting.delete(packageName);
    visited.add(packageName);
  };
  for (const packageName of packageNames) visit(packageName);
  return issues;
}

describe("four-package dependency graph", () => {
  const manifests = Object.fromEntries(
    packageNames.map((name) => [name, readManifest(packagePaths[name])]),
  ) as Record<PackageName, PackageManifest>;
  const starter = readManifest("plugins/eternal-pose/starter/react/package.json");

  test("pins the exact acyclic v2 graph and package-specific peers", () => {
    expect(inspectPackageGraph(manifests)).toEqual([]);
    expect(internalEntries(manifests["@laugh-tale-island/core"].dependencies)).toEqual([]);
    expect(manifests["@laugh-tale-island/react"].peerDependencies).toEqual({
      react: ">=19.2.0 <20",
      "react-dom": ">=19.2.0 <20",
    });
    expect(manifests["@laugh-tale-island/adapters"].peerDependencies).toEqual({
      "maplibre-gl": ">=6.10.0 <7",
      "@googlemaps/js-api-loader": ">=2.1.1 <3",
    });
    expect(manifests["@laugh-tale-island/adapters"].peerDependenciesMeta).toEqual({
      "maplibre-gl": { optional: true },
      "@googlemaps/js-api-loader": { optional: true },
    });
    for (const packageName of [
      "@laugh-tale-island/core",
      "@laugh-tale-island/react",
      "@laugh-tale-island/adapters",
    ] as const) {
      expect(manifests[packageName].dependencies?.["@laugh-tale-island/testing"]).toBeUndefined();
      expect(manifests[packageName].devDependencies?.["@laugh-tale-island/testing"]).toBeUndefined();
      expect(manifests[packageName].optionalDependencies?.["@laugh-tale-island/testing"]).toBeUndefined();
      expect(manifests[packageName].peerDependencies?.["@laugh-tale-island/testing"]).toBeUndefined();
    }
  });

  test("places the generated starter packages in their exact sections", () => {
    expect(internalEntries(starter.dependencies)).toEqual([
      ["@laugh-tale-island/adapters", VERSION],
      ["@laugh-tale-island/core", VERSION],
      ["@laugh-tale-island/react", VERSION],
    ]);
    expect(internalEntries(starter.devDependencies)).toEqual([
      ["@laugh-tale-island/testing", VERSION],
    ]);
    expect(internalEntries(starter.optionalDependencies)).toEqual([]);
    expect(internalEntries(starter.peerDependencies)).toEqual([]);
  });

  test("the graph gate rejects misplaced, duplicate, and cyclic internal edges", () => {
    const misplaced = cloneManifests(manifests);
    delete misplaced["@laugh-tale-island/react"].dependencies?.["@laugh-tale-island/core"];
    misplaced["@laugh-tale-island/react"].devDependencies = {
      ...misplaced["@laugh-tale-island/react"].devDependencies,
      "@laugh-tale-island/core": VERSION,
    };
    expect(inspectPackageGraph(misplaced)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("wrong internal dependency placement"),
        expect.stringContaining("internal edge in devDependencies"),
      ]),
    );

    const duplicate = cloneManifests(manifests);
    duplicate["@laugh-tale-island/testing"].devDependencies = {
      ...duplicate["@laugh-tale-island/testing"].devDependencies,
      "@laugh-tale-island/core": VERSION,
    };
    expect(inspectPackageGraph(duplicate)).toContain(
      "@laugh-tale-island/testing: duplicate @laugh-tale-island/core in dependencies,devDependencies",
    );

    const optionalBackEdge = cloneManifests(manifests);
    optionalBackEdge["@laugh-tale-island/core"].optionalDependencies = {
      "@laugh-tale-island/testing": VERSION,
    };
    expect(inspectPackageGraph(optionalBackEdge)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("internal edge in optionalDependencies"),
        expect.stringMatching(/^cycle through /),
      ]),
    );

    const peerBackEdge = cloneManifests(manifests);
    peerBackEdge["@laugh-tale-island/core"].peerDependencies = {
      "@laugh-tale-island/testing": VERSION,
    };
    expect(inspectPackageGraph(peerBackEdge)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("internal edge in peerDependencies"),
        expect.stringMatching(/^cycle through /),
      ]),
    );

    const cyclic = cloneManifests(manifests);
    cyclic["@laugh-tale-island/core"].dependencies = {
      ...cyclic["@laugh-tale-island/core"].dependencies,
      "@laugh-tale-island/testing": VERSION,
    };
    expect(inspectPackageGraph(cyclic)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^cycle through /)]),
    );
  });
});
