import { existsSync, readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { expect, it } from "vitest";

const root = process.cwd();
const approved = ["fixtures/oak-washi-visual-cases.ts", "visual/render-oak-washi-case.ts"];
function files(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(`${path}/${item.name}`) : [`${path}/${item.name}`]);
}
function visitImports(path: string, seen = new Set<string>()): void {
  if (seen.has(path)) return;
  seen.add(path);
  expect(path).toMatch(/\/packages\/(testing|core|react|adapters)\/src\//);
  const ast = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const inspect = (node: ts.Node): void => {
    let specifier: ts.Node | undefined;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) specifier = node.argument.literal;
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === "require")) specifier = node.arguments[0];
    if (specifier && ts.isStringLiteralLike(specifier)) {
      const name = specifier.text;
      expect(name).not.toMatch(/plugins\/|recipes-v2|tests\/fixtures|\.(css|svg|png|woff2?)$/);
      if (name.startsWith(".")) {
        const base = resolve(dirname(path), name).replace(/\.js$/, "");
        const target = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(existsSync);
        expect(target, `unresolved import ${name} in ${path}`).toBeDefined();
        visitImports(target!, seen);
      } else expect(name).toMatch(/^(?:@laugh-tale-island\/(?:core|react|adapters)(?:\/.*)?|react(?:-dom)?(?:\/.*)?|vitest)$/);
    }
    ts.forEachChild(node, inspect);
  };
  inspect(ast);
}

it("keeps exactly two neutral Oak modules in the published testing graph", () => {
  const manifest = JSON.parse(readFileSync("packages/testing/package.json", "utf8")) as { dependencies: Record<string, string> };
  expect(manifest.dependencies).toEqual({ "@laugh-tale-island/adapters": "2.0.0", "@laugh-tale-island/core": "2.0.0", "@laugh-tale-island/react": "2.0.0" });
  expect(files("packages/testing/src").filter(path => /oak-washi/.test(path)).map(path => path.replace("packages/testing/src/", "")).sort()).toEqual(approved);
  for (const path of approved) visitImports(resolve(root, "packages/testing/src", path));
});
it("keeps recipe-aware browser assembly under unpublished root fixtures", () => {
  expect(existsSync("tests/fixtures/oak-washi/test-presentation.tsx")).toBe(true);
  expect(existsSync("tests/fixtures/oak-washi/browser/OakWashiHarness.tsx")).toBe(true);
  for (const name of ["testing", "core", "react", "adapters"]) {
    const manifest = JSON.parse(readFileSync(`packages/${name}/package.json`, "utf8")) as { files: string[] };
    expect(manifest.files).toEqual(["dist", "README.md", "LICENSE"]);
    for (const path of files(`packages/${name}/dist`)) expect(readFileSync(path, "utf8")).not.toMatch(/tests\/fixtures\/oak-washi|recipes-v2\/oak-washi/);
  }
  expect(existsSync("plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.ts")).toBe(true);
});

function visitBrowserImports(entry: string) {
  const seen = new Set<string>();
  const visit = (path: string): void => {
    if (seen.has(path) || /\.css$/.test(path)) return;
    seen.add(path);
    const ast = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    const walk = (node: ts.Node): void => {
      let specifier: ts.Node | undefined;
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) specifier = node.moduleSpecifier;
      if (ts.isExportDeclaration(node) && !node.isTypeOnly) specifier = node.moduleSpecifier;
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) specifier = node.arguments[0];
      if (specifier && ts.isStringLiteralLike(specifier)) {
        const value = specifier.text;
        expect(value, path).not.toMatch(/^(?:node:|vitest$|@playwright\/test|@axe-core\/playwright|@laugh-tale-island\/testing$)|(?:^|\/)checks\.js$/);
        if (value.startsWith(".")) {
          const base = resolve(dirname(path), value).replace(/\.js$/, "");
          const target = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
          expect(target, path).toBeDefined(); visit(target!);
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(ast);
  };
  visit(entry);
  return seen;
}
it.each([
  'export * from "./forbidden.js";',
  'export { check } from "./forbidden.js";',
  'export const load = () => import("./forbidden.js");',
])("browser graph rejects forbidden dependencies behind %s", source => {
  const directory = mkdtempSync(resolve(tmpdir(), "oak-browser-boundary-"));
  try {
    writeFileSync(resolve(directory, "entry.ts"), source);
    writeFileSync(resolve(directory, "forbidden.ts"), 'import { test } from "vitest"; export const check = test;');
    expect(() => visitBrowserImports(resolve(directory, "entry.ts"))).toThrow();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
it("keeps browser entry reachability free of Node, Playwright and the eager Vitest package barrel", () => {
  const seen = visitBrowserImports(resolve("tests/fixtures/oak-washi/browser/main.tsx"));
  expect(seen.has(resolve("tests/fixtures/oak-washi/test-presentation.tsx"))).toBe(true);
});

it("contains only individually reviewed PNGs with matching provenance hashes", () => {
  const directory = "docs/theme-reviews/oak-washi";
  const manifest = JSON.parse(readFileSync(`${directory}/fixture-review.json`, "utf8")) as { sourceSnapshot: { directories: string[]; sha256: string }; entries: { file: string; caseId: string; viewport: string; sourceSnapshotSha256: string; playwright: string; chromium: string; revision: string; fonts: string[]; sha256: string; reviewer: string; date: string; verdict: string }[] };
  const renderInputs = ["packages/core/src", "packages/react/src", "packages/adapters/src", "packages/testing/src", "plugins/eternal-pose/recipes-v2/oak-washi/presentation", "tests/fixtures/oak-washi"];
  expect(manifest.sourceSnapshot.directories).toEqual(renderInputs);
  const sourceHashes = renderInputs.flatMap(files).sort().map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")]);
  const sourceHash = createHash("sha256").update(JSON.stringify(sourceHashes)).digest("hex");
  expect(manifest.sourceSnapshot.sha256).toBe(sourceHash);
  const pngs = existsSync(`${directory}/goldens`) ? files(`${directory}/goldens`).filter(path => path.endsWith(".png")) : [];
  expect(manifest.entries.map(entry => `${directory}/goldens/${entry.file}`).sort()).toEqual(pngs.sort());
  for (const entry of manifest.entries) {
    expect(entry.verdict).toBe("accepted"); expect(entry.reviewer.trim()).not.toBe("");
    expect(entry).not.toHaveProperty("sourceCommit");
    expect(entry.sourceSnapshotSha256).toBe(sourceHash);
    expect(entry.playwright).toBe("1.62.1"); expect(entry.chromium).toBe("151.0.7922.34"); expect(entry.revision).toBe("1234");
    expect(entry.fonts.length).toBeGreaterThan(0); expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(entry.file).toContain(`${entry.caseId}-${entry.viewport}-`);
    expect(createHash("sha256").update(readFileSync(`${directory}/goldens/${entry.file}`)).digest("hex")).toBe(entry.sha256);
  }
});

it("keeps ordinary runs read-only for snapshots and rejects candidate capture as CI proof", async () => {
  const { default: config } = await import("../../packages/testing/playwright.config.js");
  expect(config.updateSnapshots).toBe("none");
  expect(config.webServer).toMatchObject({ reuseExistingServer: false, url: "http://127.0.0.1:4176" });
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", "await import('./packages/testing/playwright.config.ts')"], { cwd: root, encoding: "utf8", env: { ...process.env, CI: "1", OAK_CAPTURE_CANDIDATES: "1" } });
  expect(child.status).not.toBe(0);
  expect(child.stderr).toContain("Candidate capture is not a CI regression gate");
});
