import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const repoRoot = process.cwd();
const recipeIds = ["field-atlas", "reset-arcade", "live-journey", "pocket-instrument"] as const;
const recipesRoot = join(repoRoot, "plugins/eternal-pose/recipes-v2");

interface ComparisonManifest {
  id: string;
  presentation: { entry: string };
  motion: { durationMs: number };
  map: { profile: string };
  features: string[];
}

function files(root: string): string[] {
  if (!existsSync(root)) return [];
  return statSync(root).isDirectory()
    ? readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const path = join(root, entry.name);
        return entry.isDirectory() ? files(path) : [path];
      })
    : [root];
}

function sourceFor(id: string): string {
  return files(join(recipesRoot, id))
    .filter((path) => /\.(?:ts|tsx|css)$/.test(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

function manifestFor(id: string): ComparisonManifest {
  return JSON.parse(readFileSync(join(recipesRoot, id, "recipe.json"), "utf8")) as ComparisonManifest;
}

describe("authored product worlds", () => {
  test("ship four independent v2 worlds with different geometry and map modes", () => {
    const manifests = recipeIds.map(manifestFor);
    expect(new Set(manifests.map((manifest) => manifest.id)).size).toBe(recipeIds.length);
    expect(new Set(manifests.map((manifest) => manifest.presentation.entry)).size).toBe(1);
    expect(new Set(manifests.map((manifest) => manifest.motion.durationMs)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(manifests.map((manifest) => manifest.map.profile)).size).toBe(1);
    const mapModes = recipeIds.map((id) => sourceFor(id).match(/basemap:\s*\{[\s\S]*?mode:\s*"([^"]+)"/)?.[1] ?? "");
    expect(new Set(mapModes).size).toBe(4);
    expect(manifests.map((manifest) => manifest.features)).toEqual([
      ["dense-telemetry"],
      [],
      ["dense-telemetry"],
      ["dense-telemetry"],
    ]);
  });

  test("retain different root landmarks and source vocabularies", () => {
    const sources = recipeIds.map(sourceFor);
    const rootLandmarks = [
      /atlas-home|FieldAtlasHome|atlas-route-overview/i,
      /reset-arcade-home|MissionSelect|arcade-mission-grid/i,
      /live-journey-home|LiveJourneyHome|now-next/i,
      /pocket-instrument-home|PocketInstrumentHome|instrument-rack/i,
    ];
    for (const [index, source] of sources.entries()) expect(source).toMatch(rootLandmarks[index]);
    const distinctiveSignals = [
      /atlas-key|stop-number|field-atlas/i,
      /mission-number|pressed-state|arcade-marker/i,
      /now-next|completed-history|live-marker/i,
      /status-lamp|channel-strip|fine-grid/i,
    ];
    for (const [index, signal] of distinctiveSignals.entries()) expect(sources[index]).toMatch(signal);
    for (let first = 0; first < sources.length; first += 1) {
      for (let second = first + 1; second < sources.length; second += 1) {
        expect(sources[first]).not.toContain(`recipes-v2/${recipeIds[second]}`);
        expect(sources[second]).not.toContain(`recipes-v2/${recipeIds[first]}`);
      }
    }
  });

  test("keep marker classes, route tuples, and geometry structurally distinct", () => {
    const sources = recipeIds.map(sourceFor);
    const markerClasses = sources.map((source) => source.match(/className:\s*[`"]([^`"]*marker[^`"]*)/i)?.[1] ?? "");
    expect(new Set(markerClasses).size).toBe(4);
    const routeSignatures = sources.map((source) => [...source.matchAll(/dash:\s*\[([^\]]+)\]/g)].map((match) => match[1]).join("|"));
    expect(new Set(routeSignatures).size).toBe(4);
    const geometrySignals = sources.map((source) => source.match(/header:\s*\{\s*expanded:\s*(\d+),\s*collapsed:\s*(\d+)/)?.slice(1).join("/") ?? "");
    expect(new Set(geometrySignals).size).toBe(4);
  });

  test("keep the public catalog isolated from internal product worlds", () => {
    const publicRecipeRoot = join(repoRoot, "plugins/eternal-pose/recipes");
    const publicRecipeDirs = readdirSync(publicRecipeRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    expect(publicRecipeDirs).toEqual(["native-minimal", "quiet-wood", "sticker-brutalist"]);
  });
});
