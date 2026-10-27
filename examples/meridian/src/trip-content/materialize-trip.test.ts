import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syntheticTripV2 } from "@laugh-tale-island/testing";
import { materializeTrip } from "./materialize-trip.js";

const query = { ownerId: "owner-a", text: "Synthetic gate", locale: "en", regionCode: "US", maxCandidates: 3 };

function fixture() {
  const trip = structuredClone(syntheticTripV2);
  const input = {
    schemaVersion: 2 as const,
    trip,
    enrichmentPolicy: null,
    placeOwners: [{
      ownerId: "owner-a", source: "synthetic-source", query,
      bindings: [{ kind: "node" as const, id: "node-transport" }, { kind: "candidate" as const, id: "candidate-meal-a" }],
    }],
  };
  const ledger = {
    schemaVersion: 1 as const, provider: "google" as const,
    entries: [{
      ownerId: "owner-a", status: "resolved" as const, source: "synthetic-source", query,
      provider: "google" as const, observedAt: "2042-03-01T00:00:00Z",
      accepted: {
        coordinates: { lat: 12, lng: 34 },
        providerReference: { provider: "google", id: "synthetic-place-id" },
        displayName: "Synthetic gate", formattedAddress: "Synthetic address", categories: [],
      },
    }],
  };
  return { input, ledger };
}

describe("materializeTrip", () => {
  test("generated trip imports stay within public package and local source boundaries", () => {
    const directory = dirname(fileURLToPath(import.meta.url));
    const visited = new Set<string>();
    const scan = (path: string): void => {
      if (visited.has(path)) return;
      visited.add(path);
      const contents = readFileSync(path, "utf8");
      for (const match of contents.matchAll(/\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g)) {
        const specifier = match[1];
        expect(specifier).not.toMatch(/(?:^|\/)(?:plugins|scripts)\//);
        if (specifier.startsWith(".")) {
          expect(specifier).not.toContain("..");
          const local = resolve(dirname(path), specifier.replace(/\.js$/, ".ts"));
          scan(local);
        } else {
          expect(specifier).toBe("@laugh-tale-island/core");
        }
      }
    };
    scan(resolve(directory, "materialize-trip.ts"));
    scan(resolve(directory, "trip.ts"));
    scan(resolve(directory, "app-locale.ts"));
    scan(resolve(directory, "validation-entry.ts"));
  });

  test("clones authored data and applies a resolved identity to every binding", () => {
    const { input, ledger } = fixture();
    const before = structuredClone(input);
    const trip = materializeTrip(input, ledger);
    expect(input).toEqual(before);
    expect(trip).not.toBe(input.trip);
    expect(trip?.locale).toBe("en");
    const resolved = { status: "resolved", coordinates: { lat: 12, lng: 34 }, providerReference: { provider: "google", id: "synthetic-place-id" } };
    expect(trip?.days[0]?.nodes[0]?.place?.identity).toEqual(resolved);
    expect(trip?.candidateGroups[0]?.options[0]?.place?.identity).toEqual(resolved);
  });

  test("uses the ledger's unresolved reason for every binding", () => {
    const { input, ledger } = fixture();
    const unresolved = { schemaVersion: ledger.schemaVersion, provider: ledger.provider, entries: [{ ownerId: "owner-a", source: "synthetic-source", query, status: "unresolved" as const, reason: "ambiguous" as const }] };
    const trip = materializeTrip(input, unresolved);
    expect(trip?.days[0]?.nodes[0]?.place?.identity).toEqual({ status: "unresolved", reason: "ambiguous" });
    expect(trip?.candidateGroups[0]?.options[0]?.place?.identity).toEqual({ status: "unresolved", reason: "ambiguous" });
  });

  test("rejects resolved ledger coordinates outside the Trip model range", () => {
    const { input, ledger } = fixture();
    ledger.entries[0].accepted.coordinates.lat = 91;
    expect(() => materializeTrip(input, ledger)).toThrow(/latitude|coordinates|identity/i);
  });

  test("rejects a resolved ledger provider reference outside Google", () => {
    const { input, ledger } = fixture();
    ledger.entries[0].accepted.providerReference.provider = "synthetic";
    expect(() => materializeTrip(input, ledger)).toThrow(/google|provider/i);
  });

  test("rejects owner coverage and binding drift", () => {
    const { input, ledger } = fixture();
    expect(() => materializeTrip(input, { ...ledger, entries: [] })).toThrow(/owner|coverage/i);
    const changed = structuredClone(input);
    changed.placeOwners[0].bindings[0].id = "missing-node";
    expect(() => materializeTrip(changed, ledger)).toThrow(/binding|node/i);
  });

  test("returns null only for explicit no-Trip input", () => {
    expect(materializeTrip({ schemaVersion: 2, trip: null, setupLocale: "zh-Hant-TW", enrichmentPolicy: null, placeOwners: [] }, { schemaVersion: 1, provider: "google", entries: [] })).toBeNull();
    expect(() => materializeTrip({ schemaVersion: 2, trip: null, setupLocale: "zh-Hant-TW", enrichmentPolicy: null, placeOwners: [] }, { schemaVersion: 1, provider: "google", entries: [fixture().ledger.entries[0]] })).toThrow(/owner|coverage/i);
  });
});
