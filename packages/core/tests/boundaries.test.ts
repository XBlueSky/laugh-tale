import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

const v2BrowserModuleAllowlist: Readonly<Record<string, readonly string[]>> = {
  "v2-map.ts": ["../model.js", "../provider-failure.js", "../semantic-state.js"],
  "v2-adapters.ts": [
    "../map-camera.js",
    "../model.js",
    "../navigation-target.js",
    "../place-runtime.js",
    "../route-runtime.js",
    "./v2-map.js",
  ],
};

function moduleSpecifiers(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    "v2-browser-boundary.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  const addLiteralSpecifier = (specifier: ts.Expression | undefined) => {
    if (specifier !== undefined && ts.isStringLiteral(specifier)) {
      specifiers.push(specifier.text);
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addLiteralSpecifier(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addLiteralSpecifier(node.moduleReference.expression);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return specifiers;
}

describe("package boundaries", () => {
  it("scans a non-empty source tree", () => {
    expect(globSync(join(packageRoot, "src/**/*.ts*")).length).toBeGreaterThan(0);
  });

  it("keeps framework, provider, generated, network, filesystem, environment, and UI dependencies out of package sources", () => {
    for (const file of globSync(join(packageRoot, "src/**/*.ts"))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(
        /from "react"|google\.maps|@googlemaps|\.css"|generated\/|\bfetch\b|from "(?:node:)?(?:fs|fs\/promises|path|os|url)"|\bprocess\.env\b|\bimport\.meta\.env\b|[一-鿿]/,
      );
    }
  });

  it("keeps web-platform types out of the root entry modules", () => {
    for (const file of globSync(join(packageRoot, "src/*.ts"))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(
        /\bHTMLElement\b|\bAbortSignal\b|\blocalStorage\b|\bwindow\b|\bdocument\b|\bnavigator\b/,
      );
    }
  });

  it("keeps visible display strings out of the root entry modules", () => {
    for (const file of globSync(join(packageRoot, "src/*.ts"))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/[一-鿿]/);
    }
  });

  it("restricts v2 browser contract module specifiers to neutral core contracts", () => {
    for (const [name, allowedSpecifiers] of Object.entries(v2BrowserModuleAllowlist)) {
      const source = readFileSync(join(packageRoot, "src/browser", name), "utf8");
      expect(moduleSpecifiers(source).sort(), name).toEqual([...allowedSpecifiers].sort());
      expect(source, name).not.toMatch(
        /from "react"|google\.maps|@googlemaps|adapters\/testing|generated\/|\.css"|[一-鿿]/,
      );
    }
  });

  it("exposes browser platform types only through the browser entry", () => {
    for (const file of ["src/index.ts", "src/route-runtime.ts", "src/navigation-target.ts", "src/semantic-state.ts", "src/map-camera.ts"]) {
      const source = readFileSync(join(packageRoot, file), "utf8");
      expect(source, file).not.toMatch(/\bHTMLElement\b|\bAbortSignal\b/);
    }
  });

  it("never re-exports browser contracts from the core root entry", () => {
    const source = readFileSync(join(packageRoot, "src/index.ts"), "utf8");
    expect(moduleSpecifiers(source)).not.toContain("./browser/v2-adapters.js");
    expect(moduleSpecifiers(source)).not.toContain("./browser/v2-map.js");
    expect(moduleSpecifiers(source).some((specifier) => specifier.startsWith("./browser/"))).toBe(false);
  });

  it("detects attributed export specifiers regardless of their trailing clause", () => {
    const attributedExport =
      'export type { MapAdapterV2 } from "./browser/v2-adapters.js" with { type: "json" };';

    expect(moduleSpecifiers(attributedExport)).toEqual(["./browser/v2-adapters.js"]);
  });
});
