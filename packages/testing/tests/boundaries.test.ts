import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import * as testing from "../src/index.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const packageNames = ["core", "react", "adapters", "testing"] as const;
const generatedSourceRoot = "@laugh-tale-island/generated-source";
const generatedSourceDirectories = [
  join(repositoryRoot, "plugins", "eternal-pose", "starter", "react", "src", "presentation"),
  join(repositoryRoot, "examples"),
] as const;
const allowed = {
  core: new Set<string>(),
  react: new Set(["@laugh-tale-island/core"]),
  adapters: new Set(["@laugh-tale-island/core"]),
  testing: new Set(["@laugh-tale-island/core", "@laugh-tale-island/react", "@laugh-tale-island/adapters"]),
} as const;

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

function relativeFiles(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? relativeFiles(join(directory, entry.name), relative) : [relative];
  }).sort();
}

function importedPackageRoots(source: string, path: string): string[] {
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const imports = new Set<string>();
  const add = (specifier: ts.Expression | undefined): void => {
    if (specifier !== undefined && ts.isStringLiteralLike(specifier)) imports.add(specifier.text);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression);
    if (ts.isCallExpression(node) && node.arguments.length >= 1) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0]);
      if (ts.isIdentifier(node.expression) && node.expression.text === "require") add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const roots = new Set<string>();
  for (const specifier of imports) {
    if (specifier.startsWith("@laugh-tale-island/")) {
      roots.add(specifier.split("/").slice(0, 2).join("/"));
      continue;
    }
    if (!specifier.startsWith(".")) continue;
    const absolute = resolve(dirname(path), specifier);
    if (
      generatedSourceDirectories.some(
        (root) => absolute === root || absolute.startsWith(`${root}/`),
      )
    ) {
      roots.add(generatedSourceRoot);
      continue;
    }
    for (const packageName of packageNames) {
      const root = join(repositoryRoot, "packages", packageName);
      if (absolute === root || absolute.startsWith(`${root}/`)) roots.add(`@laugh-tale-island/${packageName}`);
    }
  }
  return [...roots];
}

function internalSpecifiers(path: string): string[] {
  return importedPackageRoots(readFileSync(path, "utf8"), path);
}

describe("testing package boundaries", () => {
  it("enforces the exact four-package source DAG with testing as the only leaf", () => {
    for (const packageName of packageNames) {
      const files = sourceFiles(join(repositoryRoot, "packages", packageName, "src"));
      for (const path of files) {
        for (const specifier of internalSpecifiers(path)) {
          if (specifier === `@laugh-tale-island/${packageName}`) continue;
          expect(allowed[packageName].has(specifier), `${path} illegally imports ${specifier}`).toBe(true);
        }
      }
    }
  });

  it.each([
    ["ordinary import", 'import value from "@laugh-tale-island/testing";'],
    ["ordinary export", 'export * from "@laugh-tale-island/testing/subpath";'],
    ["dynamic import", 'void import("@laugh-tale-island/testing");'],
    ["dynamic import with attributes", 'void import("@laugh-tale-island/testing", { with: { type: "json" } });'],
    ["import type node", 'type Value = import("@laugh-tale-island/testing").Value;'],
    ["import equals", 'import value = require("@laugh-tale-island/testing");'],
    ["CommonJS require", 'const value = require("@laugh-tale-island/testing");'],
    ["CommonJS require with an extra argument", 'const value = require("@laugh-tale-island/testing", undefined);'],
    ["relative cross-package import", 'import value from "../../testing/src/index.js";'],
    ["relative cross-package index import", 'export * from "../../testing/src";'],
  ])("structurally detects %s syntax", (_name, source) => {
    const probe = join(repositoryRoot, "packages", "core", "src", "nested", "probe.ts");
    const adjusted = source.replaceAll("../../testing", "../../../testing");
    const ast = ts.createSourceFile(probe, adjusted, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const parsed = ast as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] };
    expect(parsed.parseDiagnostics ?? [], `${_name} probe must be legal TypeScript syntax`).toEqual([]);
    expect(importedPackageRoots(adjusted, probe)).toEqual(["@laugh-tale-island/testing"]);
  });

  it.each([
    ["generated starter presentation", generatedSourceDirectories[0]],
    ["generated example", generatedSourceDirectories[1]],
  ])("structurally detects a %s relative import", (_name, generatedRoot) => {
    const probe = join(repositoryRoot, "packages", "core", "src", "nested", "probe.ts");
    const specifier = `${relative(dirname(probe), generatedRoot)}/fixture.js`;
    const source = `export * from ${JSON.stringify(specifier)};`;
    const ast = ts.createSourceFile(probe, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const parsed = ast as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] };
    expect(parsed.parseDiagnostics ?? [], `${_name} probe must be legal TypeScript syntax`).toEqual([]);
    expect(importedPackageRoots(source, probe)).toEqual([generatedSourceRoot]);
  });

  it("exposes exactly the frozen root export ledger", () => {
    expect(Object.keys(testing).sort()).toEqual([
      "FakeClock",
      "FakeMapAdapterV2",
      "FakeNavigationAdapterV2",
      "FakePlaceAdapterV2",
      "FakeProgressStore",
      "FakeRouteAdapterV2",
      "adversarialPlaceFixtures",
      "adversarialRouteFixtures",
      "alternateTestPresentation",
      "createDeterministicLocaleSetup",
      "createDeterministicViewportSetup",
      "createPresentationDriver",
      "defineMapAdapterV2Contract",
      "definePlaceAdapterV2Contract",
      "defineRouteAdapterV2Contract",
      "oakWashiVisualCases",
      "renderOakWashiCase",
      "renderTripContract",
      "syntheticTripV2",
    ]);
  });

  it("marks every exported fake test-only at runtime", () => {
    expect(new testing.FakeMapAdapterV2().testOnly).toBe(true);
    expect(new testing.FakeRouteAdapterV2().testOnly).toBe(true);
    expect(new testing.FakePlaceAdapterV2().testOnly).toBe(true);
    expect(new testing.FakeNavigationAdapterV2().testOnly).toBe(true);
    expect(new testing.FakeProgressStore().testOnly).toBe(true);
    expect(new testing.FakeClock("2042-03-04T05:06:07.000Z").testOnly).toBe(true);
  });

  it("declares the literal readonly testOnly = true as const on every fake class", () => {
    const names = ["FakeMapAdapterV2", "FakeRouteAdapterV2", "FakePlaceAdapterV2", "FakeNavigationAdapterV2", "FakeProgressStore", "FakeClock"];
    for (const name of names) {
      const path = join(packageRoot, "src", "fakes", `${name}.ts`);
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const declaration = source.statements.find((statement): statement is ts.ClassDeclaration => ts.isClassDeclaration(statement) && statement.name?.text === name);
      const property = declaration?.members.find((member): member is ts.PropertyDeclaration => ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name) && member.name.text === "testOnly");
      expect(property, `${name} must declare testOnly directly`).toBeDefined();
      expect(property?.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword), `${name}.testOnly must be readonly`).toBe(true);
      expect(property?.initializer?.getText(source), `${name}.testOnly must retain its literal marker`).toBe("true as const");
    }
  });

  it("keeps production source and generated entries free of testing imports", () => {
    const paths = ["core", "react", "adapters"].flatMap((name) => [
      ...sourceFiles(join(repositoryRoot, "packages", name, "src")),
      ...sourceFiles(join(repositoryRoot, "packages", name, "dist")),
    ]);
    for (const path of paths) expect(internalSpecifiers(path), path).not.toContain("@laugh-tale-island/testing");
  });

  it("emits the exact testing-owned root artifact without copied dependency trees", () => {
    const dist = join(packageRoot, "dist");
    expect(existsSync(dist), "build @laugh-tale-island/testing before running the artifact gate").toBe(true);
    const emitted = existsSync(dist) ? relativeFiles(dist) : [];
    expect(emitted).toEqual([
      "alternate-presentation.d.ts", "alternate-presentation.js",
      "contracts/map-adapter-v2.d.ts", "contracts/map-adapter-v2.js",
      "contracts/place-adapter-v2.d.ts", "contracts/place-adapter-v2.js",
      "contracts/route-adapter-v2.d.ts", "contracts/route-adapter-v2.js",
      "fakes/FakeClock.d.ts", "fakes/FakeClock.js",
      "fakes/FakeMapAdapterV2.d.ts", "fakes/FakeMapAdapterV2.js",
      "fakes/FakeNavigationAdapterV2.d.ts", "fakes/FakeNavigationAdapterV2.js",
      "fakes/FakePlaceAdapterV2.d.ts", "fakes/FakePlaceAdapterV2.js",
      "fakes/FakeProgressStore.d.ts", "fakes/FakeProgressStore.js",
      "fakes/FakeRouteAdapterV2.d.ts", "fakes/FakeRouteAdapterV2.js",
      "fixtures/adversarial-places.d.ts", "fixtures/adversarial-places.js",
      "fixtures/adversarial-routes.d.ts", "fixtures/adversarial-routes.js",
      "fixtures/oak-washi-visual-cases.d.ts", "fixtures/oak-washi-visual-cases.js",
      "fixtures/synthetic-trip-v2.d.ts", "fixtures/synthetic-trip-v2.js",
      "index.d.ts", "index.js",
      "presentation-driver.d.ts", "presentation-driver.js",
      "setups/deterministic-locale.d.ts", "setups/deterministic-locale.js",
      "setups/deterministic-viewport.d.ts", "setups/deterministic-viewport.js",
      "visual/render-oak-washi-case.d.ts", "visual/render-oak-washi-case.js",
    ]);
    expect(existsSync(join(dist, "core"))).toBe(false);
    expect(existsSync(join(dist, "react"))).toBe(false);
    expect(existsSync(join(dist, "adapters"))).toBe(false);
    expect(existsSync(join(dist, "testing"))).toBe(false);
  });
});
