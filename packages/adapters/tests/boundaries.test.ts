import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as ts from "typescript";

const packageRoot = join(import.meta.dirname, "..");
const sourceRoot = join(packageRoot, "src");

function files(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...files(path));
    else found.push(path);
  }
  return found;
}

function reachable(file: string, seen = new Set<string>()): string[] {
  if (seen.has(file)) return [];
  seen.add(file);
  const content = readFileSync(file, "utf8");
  const parsed = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const imports: string[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.startsWith(".")
    ) {
      imports.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);

  const contents = [content];
  for (const specifier of imports) {
    const candidate = resolve(dirname(file), specifier.replace(/\.js$/, ".ts"));
    if (existsSync(candidate)) contents.push(...reachable(candidate, seen));
  }
  return contents;
}

describe("adapter boundaries", () => {
  it("keeps MapLibre public declarations SDK-free and Google implementation unchanged", () => {
    const declarations = files(join(packageRoot, "dist/maplibre"))
      .filter(file => /(?:index|options|maplibre-map-adapter)\.d\.ts$/.test(file))
      .map(file => readFileSync(file, "utf8")).join("\n");
    expect(declarations).not.toMatch(/from ["'](?:maplibre-gl|@googlemaps)/);
    expect(reachable(join(sourceRoot, "google/index.ts")).join("\n")).not.toMatch(/maplibre/);
    expect(reachable(join(sourceRoot, "maplibre/index.ts")).join("\n")).not.toMatch(/@googlemaps|google\.maps/);
  });
  it("recursively keeps the Node entry and every source dependency DOM and loader free", async () => {
    const nodeSource = reachable(join(sourceRoot, "google/node/index.ts")).join("\n");
    expect(nodeSource).not.toMatch(
      /@googlemaps\/js-api-loader|google\.maps|HTMLElement|\bwindow\b|\bdocument\b|process\.env|node:fs|Deno\.env|Bun\.env/,
    );
    await expect(import("@laugh-tale-island/adapters/google/node")).resolves.toHaveProperty(
      "GooglePlaceSearchAdapter",
    );
  });

  it("keeps all adapter source free of React, tests, apps, examples, and recipes", () => {
    const allSource = files(sourceRoot)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(allSource).not.toMatch(
      /from\s+["'](?:react|.*testing.*|.*plugins\/|.*examples\/|.*recipes\/)/,
    );
  });

  it("exports the exact frozen browser ledger without a public normalize helper", async () => {
    const browser = await import("../src/google/index.js");
    expect(Object.keys(browser).sort()).toEqual([
      "GOOGLE_PLACES_DETAIL_FIELD_MASK",
      "GOOGLE_ROUTES_FIELD_MASK",
      "GoogleMapAdapter",
      "GoogleNavigationAdapter",
      "GooglePlaceAdapter",
      "GoogleRouteAdapter",
      "configureGoogleMaps",
      "createGoogleMapsConfigurator",
      "createGoogleMapsLoader",
      "createGoogleMapsUrl",
      "routeRequestCacheKey",
    ]);
    expect(browser).not.toHaveProperty("normalizeProviderLocation");
  });

  it("keeps Google map mechanics free of presentation imports and provider-authored marker DOM", () => {
    const mapSource = [
      join(sourceRoot, "google/google-map-adapter.ts"),
      join(sourceRoot, "google/google-config.ts"),
      join(packageRoot, "tests/google-map-adapter.test.ts"),
      join(packageRoot, "tests/google-config.test.ts"),
    ].map((file) => readFileSync(file, "utf8")).join("\n");
    expect(mapSource).not.toMatch(/from\s+["'].*(?:presentation|plugins|examples|recipes)/);
    expect(mapSource).not.toMatch(/google\.maps\.Marker|new\s+[^\n;]*\.Marker\s*\(/);
    expect(mapSource).not.toMatch(/document\.createElement|createElementNS|<svg|data:image\/svg|className\s*=|\.classList\./);
  });

  it("asserts the build-first emitted subpaths and forbids root or copied-core artifacts", () => {
    const expected = [
      "dist/google/index.js",
      "dist/google/index.d.ts",
      "dist/google/google-map-adapter.js",
      "dist/google/google-map-adapter.d.ts",
      "dist/google/google-config.js",
      "dist/google/google-config.d.ts",
      "dist/google/node/index.js",
      "dist/google/node/index.d.ts",
    ];
    for (const path of expected) expect(existsSync(join(packageRoot, path))).toBe(true);
    expect(existsSync(join(packageRoot, "dist/index.js"))).toBe(false);
    expect(existsSync(join(packageRoot, "dist/index.d.ts"))).toBe(false);
    expect(existsSync(join(packageRoot, "dist/core"))).toBe(false);
  });
});
