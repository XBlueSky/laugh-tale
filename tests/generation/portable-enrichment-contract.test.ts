import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

import { createPlaceResolutionProvenance, createPlaceSearchQuery } from "@laugh-tale-island/core/enrichment";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const pluginLib = join(repoRoot, "plugins/eternal-pose/lib");
const { canonicalizeJson } = await import(join(pluginLib, "canonical-json.mjs")) as { canonicalizeJson: (value: unknown) => string };
const { assertPortableEnrichmentConformance, createPortablePlaceResolutionProvenance, createPortablePlaceSearchQuery } = await import(join(pluginLib, "portable-enrichment-contract.mjs")) as {
  assertPortableEnrichmentConformance: (core: { createPlaceSearchQuery: typeof createPlaceSearchQuery; createPlaceResolutionProvenance: typeof createPlaceResolutionProvenance }) => void;
  createPortablePlaceResolutionProvenance: typeof createPlaceResolutionProvenance;
  createPortablePlaceSearchQuery: typeof createPlaceSearchQuery;
};
const temporaryRoots: string[] = [];
const base = { ownerId: "place:cafe", text: " Cafe ", locale: "en" };
const timestamp = "2026-09-04T10:11:12.000Z";

afterEach(() => { for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("portable enrichment conformance", () => {
  test.each([
    ["trimmed text and owner", { ...base, ownerId: " place:cafe " }],
    ["canonical locale and region", { ...base, locale: "ZH-hant-tw", regionCode: " jp " }],
    ["absent bias", base],
    ["present bias lower bounds", { ...base, locationBias: { center: { lat: -90, lng: -180 }, radiusMeters: 0.1 } }],
    ["present bias upper bounds", { ...base, locationBias: { center: { lat: 90, lng: 180 }, radiusMeters: 50000 } }],
  ])("matches core query bytes: %s", (_name, input) => {
    const portable = createPortablePlaceSearchQuery(input);
    expect(portable.maxCandidates).toBe(3);
    expect(canonicalizeJson(portable)).toBe(canonicalizeJson(createPlaceSearchQuery(input)));
    expect(Object.isFrozen(portable)).toBe(true);
    if (portable.locationBias) expect(Object.isFrozen(portable.locationBias.center)).toBe(true);
  });

  test.each([
    ["blank owner", { ...base, ownerId: " " }],
    ["blank text", { ...base, text: " " }],
    ["invalid locale", { ...base, locale: "not_a_locale" }],
    ["invalid region", { ...base, regionCode: "JPN" }],
    ["latitude over", { ...base, locationBias: { center: { lat: 90.1, lng: 0 }, radiusMeters: 10 } }],
    ["longitude under", { ...base, locationBias: { center: { lat: 0, lng: -180.1 }, radiusMeters: 10 } }],
    ["nonfinite coordinate", { ...base, locationBias: { center: { lat: NaN, lng: 0 }, radiusMeters: 10 } }],
    ["zero radius", { ...base, locationBias: { center: { lat: 0, lng: 0 }, radiusMeters: 0 } }],
    ["radius over", { ...base, locationBias: { center: { lat: 0, lng: 0 }, radiusMeters: 50000.1 } }],
  ])("rejects query vector in both implementations: %s", (_name, input) => {
    expect(() => createPortablePlaceSearchQuery(input)).toThrow();
    expect(() => createPlaceSearchQuery(input)).toThrow();
  });

  test("matches core provenance bytes for a canonical timestamp", () => {
    const query = createPortablePlaceSearchQuery(base);
    const value = { ownerId: " place:cafe ", source: " itinerary ", query, provider: " google ", observedAt: timestamp };
    expect(canonicalizeJson(createPortablePlaceResolutionProvenance(value))).toBe(canonicalizeJson(createPlaceResolutionProvenance(value)));
  });

  test.each([
    ["blank owner", { ownerId: " " }], ["blank source", { source: " " }], ["blank provider", { provider: " " }],
    ["offset", { observedAt: "2026-09-04T18:11:12.000+08:00" }],
    ["missing fraction", { observedAt: "2026-09-04T10:11:12Z" }],
    ["short fraction", { observedAt: "2026-09-04T10:11:12.00Z" }],
    ["long fraction", { observedAt: "2026-09-04T10:11:12.0000Z" }],
    ["extended year", { observedAt: "+02026-09-04T10:11:12.000Z" }],
    ["invalid calendar", { observedAt: "2026-02-30T10:11:12.000Z" }],
    ["invalid hour", { observedAt: "2026-09-04T25:11:12.000Z" }],
    ["invalid minute", { observedAt: "2026-09-04T10:60:12.000Z" }],
  ])("rejects provenance vector in both implementations: %s", (_name, changes) => {
    const value = { ownerId: "place:cafe", source: "itinerary", query: createPortablePlaceSearchQuery(base), provider: "google", observedAt: timestamp, ...changes };
    expect(() => createPortablePlaceResolutionProvenance(value)).toThrow();
    expect(() => createPlaceResolutionProvenance(value)).toThrow();
  });

  test("runs the built-in conformance gate against actual core exports", () => {
    expect(() => assertPortableEnrichmentConformance({ createPlaceSearchQuery, createPlaceResolutionProvenance })).not.toThrow();
    expect(() => assertPortableEnrichmentConformance({ createPlaceSearchQuery: () => ({}) as never, createPlaceResolutionProvenance })).toThrow(/conformance/);
  });

  test("loads and executes plugin-only modules without workspace package resolution", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "eternal-pose-portable-")));
    temporaryRoots.push(root);
    mkdirSync(join(root, "plugin"));
    cpSync(join(repoRoot, "plugins/eternal-pose/lib"), join(root, "plugin/lib"), { recursive: true });
    const script = `import { emptyTripProjectInputV2 } from './plugin/lib/trip-project-input-v2.mjs';\nimport { unresolvedLedgerForInput } from './plugin/lib/place-resolution-ledger.mjs';\nimport { buildTripProjectManifest } from './plugin/lib/project-manifest-v2.mjs';\nconst input = emptyTripProjectInputV2('zh-Hant-TW'); const ledger = unresolvedLedgerForInput(input); const manifest = buildTripProjectManifest({generatorVersion:'2.0.0',recipeId:'oak-washi',recipeSourceVersion:'2.0.0',packageVersion:'2.0.0',ledger}); if (input.trip !== null || ledger.entries.length !== 0 || manifest.enrichment.schemaVersion !== 1) process.exit(1);`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: root, env: { PATH: process.env.PATH ?? "", HOME: root, NODE_PATH: "" }, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  test("reachable portable imports are built-in or plugin-local .mjs", () => {
    const names = ["canonical-json", "portable-enrichment-contract", "trip-project-input-v2", "place-resolution-ledger", "project-manifest-v2"];
    for (const name of names) {
      const source = readFileSync(join(repoRoot, "plugins/eternal-pose/lib", `${name}.mjs`), "utf8");
      for (const [, specifier] of source.matchAll(/\b(?:import|export)\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']/g)) {
        expect(specifier, name).toMatch(/^(?:node:[\w/]+|\.\/[-\w]+\.mjs)$/);
      }
    }
  });
});
