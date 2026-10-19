import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const source = resolve(import.meta.dirname, "..");
function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? entry.name === "test" ? [] : productionFiles(path) : /\.[jt]sx?$/.test(path) && !/\.test\./.test(path) ? [path] : [];
  });
}
function importContracts(sourceText: string): { specifier: string; typeOnly: boolean }[] {
  const result: { specifier: string; typeOnly: boolean }[] = [];
  const ast = ts.createSourceFile("source.tsx", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node: ts.Node): void {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      let typeOnly = false;
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        typeOnly = clause?.isTypeOnly === true || (!clause?.name && !!clause?.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every(item => item.isTypeOnly));
      } else typeOnly = node.isTypeOnly || !!node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every(item => item.isTypeOnly);
      result.push({ specifier: node.moduleSpecifier.text, typeOnly });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      result.push({ specifier: node.argument.literal.text, typeOnly: true });
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require") && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      result.push({ specifier: node.arguments[0].text, typeOnly: false });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return result;
}
const allowedPresentationImport = ({ specifier, typeOnly }: { specifier: string; typeOnly: boolean }) => !specifier.startsWith("@laugh-tale-island/") || specifier === "@laugh-tale-island/react" || typeOnly && ["@laugh-tale-island/core", "@laugh-tale-island/core/browser"].includes(specifier);
function imports(path: string) { return importContracts(readFileSync(path, "utf8")); }

describe("generated package boundary", () => {
  it("contains no extracted controller, provider, or transitional owner", () => {
    for (const name of ["controllers", "providers", "App.tsx", "experience-shell"]) {
      expect(existsSync(join(source, name)), name).toBe(false);
    }
  });
  it("keeps app composition and presentation on their public input boundaries", () => {
    const violations: string[] = [];
    for (const area of ["app", "presentation"]) {
      for (const path of productionFiles(join(source, area))) {
        for (const contract of imports(path)) {
          const { specifier } = contract;
          if (specifier.startsWith(".")) {
            const target = resolve(dirname(path), specifier);
            const allowed = area === "app" ? ["app", "presentation", "trip-content"] : ["presentation"];
            if (!allowed.some((name) => target === join(source, name) || target.startsWith(join(source, name) + "/"))) violations.push(`${path}: ${specifier}`);
          } else if (area === "presentation" && !allowedPresentationImport(contract)) {
            violations.push(`${path}: ${specifier}`);
          }
        }
        if (area === "presentation" && /import\.meta\.env|process\.env/.test(readFileSync(path, "utf8"))) violations.push(path);
      }
    }
    expect(violations).toEqual([]);
  });
  it("never imports the test package in generated production source", () => {
    expect(productionFiles(source).filter((path) => imports(path).some(item => item.specifier === "@laugh-tale-island/testing" || item.specifier.startsWith("@laugh-tale-island/testing/")))).toEqual([]);
  });
  it.each([
    ['import type { ProviderFailureReason } from "@laugh-tale-island/core"', true],
    ['import { type MarkerSpec } from "@laugh-tale-island/core/browser"', true],
    ['export type { MarkerSpec } from "@laugh-tale-island/core/browser"', true],
    ['type Reason = import("@laugh-tale-island/core").ProviderFailureReason', true],
    ['type Marker = import("@laugh-tale-island/core/browser").MarkerSpec', true],
    ['type Module = typeof import("@laugh-tale-island/react")', true],
    ['type Fake = import("@laugh-tale-island/testing").FakeMapAdapterV2', false],
    ['type Private = import("@laugh-tale-island/core/private").X', false],
    ['type Fake = typeof import("@laugh-tale-island/testing/private")', false],
    ['import { MarkerSpec } from "@laugh-tale-island/core/browser"', false],
    ['import { type MarkerSpec, runtime } from "@laugh-tale-island/core/browser"', false],
    ['import "@laugh-tale-island/core"', false],
    ['import("@laugh-tale-island/core")', false],
    ['import type { Private } from "@laugh-tale-island/core/dist/model"', false],
    ['import type { Provider } from "@laugh-tale-island/adapters"', false],
    ['import type { Fake } from "@laugh-tale-island/testing"', false],
  ])("classifies the public type-only boundary: %s", (sourceText, allowed) => {
    const contracts = importContracts(sourceText);
    expect(contracts).toHaveLength(1);
    expect(allowedPresentationImport(contracts[0])).toBe(allowed);
  });
  it("leaves static identity to the authored document metadata hook", () => {
    const shell = readFileSync(join(source, "../index.html"), "utf8");
    expect(shell).not.toMatch(/<html[^>]+lang=|<title>[^<]+|og:|application-name|name=["']description/);
    for (const path of [join(source, "app/App.tsx"), join(source, "app/use-document-metadata.ts"), join(source, "../index.html")]) {
      expect(existsSync(path), path).toBe(true);
      if (existsSync(path)) expect(readFileSync(path, "utf8")).not.toMatch(/Tokyo|Asia\/Tokyo|\+09|35\.6|139\.7|og:image[^\n]+https:/i);
    }
  });
});
