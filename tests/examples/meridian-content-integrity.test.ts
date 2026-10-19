import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { syntheticTripV2 } from "../../packages/testing/src/fixtures/synthetic-trip-v2.js";
import { exampleRoot, inputPath, json, paths, pluginRoot } from "../fixtures/public-release.js";

test("Meridian publishes only the neutral synthetic trip with no provider acceptance claims", async () => {
  const trip = structuredClone(syntheticTripV2);
  trip.locale = "zh-Hant-TW";
  const expected = { schemaVersion: 2, trip, enrichmentPolicy: null, placeOwners: [] };
  expect(await json<unknown>(inputPath)).toEqual(expected);
  expect(await json<unknown>(join(exampleRoot, paths.input))).toEqual(expected);
  const { scanPublicationSnapshot } = await import(join(pluginRoot, "lib/publication-analysis.mjs")) as {
    scanPublicationSnapshot: (root: string, files: Map<string, Buffer>) => Promise<unknown[]>;
  };
  expect(await scanPublicationSnapshot(exampleRoot, new Map([[paths.input, await readFile(inputPath)]]))).toEqual([]);
});
