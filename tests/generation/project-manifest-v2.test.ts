import { describe, expect, test } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateTrip, type Trip } from "@laugh-tale-island/core";
import type { PlaceSearchQuery } from "@laugh-tale-island/core/enrichment";

type Input = { trip: { locale: string } | null; placeOwners: { ownerId: string; source: string; query: PlaceSearchQuery }[] };
type Ledger = { entries: { ownerId: string; reason?: string; observedAt?: string; accepted?: { categories: string[] } }[] };
type Manifest = { packages: Record<string, string>; [key: string]: unknown };
const pluginLib = fileURLToPath(new URL("../../plugins/eternal-pose/lib/", import.meta.url));
const { canonicalizeJson, sha256CanonicalJson } = await import(join(pluginLib, "canonical-json.mjs")) as { canonicalizeJson: (value: unknown) => string; sha256CanonicalJson: (value: unknown) => string };
const { createPortablePlaceSearchQuery } = await import(join(pluginLib, "portable-enrichment-contract.mjs")) as { createPortablePlaceSearchQuery: (input: Omit<PlaceSearchQuery, "maxCandidates">) => PlaceSearchQuery };
const { emptyTripProjectInputV2, parseTripProjectInputV2 } = await import(join(pluginLib, "trip-project-input-v2.mjs")) as { emptyTripProjectInputV2: (locale: string) => Input; parseTripProjectInputV2: (value: unknown) => Input };
const { parsePlaceResolutionLedger, unresolvedLedgerForInput } = await import(join(pluginLib, "place-resolution-ledger.mjs")) as { parsePlaceResolutionLedger: (value: unknown, input: Input) => Ledger; unresolvedLedgerForInput: (input: Input) => Ledger };
const { assertManifestMatchesLedger, buildTripProjectManifest, parseTripProjectManifest } = await import(join(pluginLib, "project-manifest-v2.mjs")) as {
  assertManifestMatchesLedger: (manifest: unknown, ledger: unknown) => void;
  buildTripProjectManifest: (input: { generatorVersion: string; recipeId: string; recipeSourceVersion: string; packageVersion: string; ledger: Ledger }) => Manifest;
  parseTripProjectManifest: (value: unknown) => unknown;
};

const observedAt = "2026-09-04T10:11:12.000Z";
const bias = { center: { lat: 35.68, lng: 139.76 }, radiusMeters: 5000 };

function completeInputFixture() {
  const trip: Trip = {
    id: "sample-trip", title: "Sample City", locale: "en", timezone: "Etc/UTC",
    startDate: "2026-09-04", endDate: "2026-09-04",
    days: [{ id: "day-1", date: "2026-09-04", title: "Friday", nodes: [
      { id: "museum-node", dayId: "day-1", kind: "sightseeing", title: "Museum", timing: { certainty: "unknown" }, optionality: "core", payload: {} },
      { id: "cafe-node", dayId: "day-1", kind: "dining", title: "Cafe", timing: { certainty: "unknown" }, optionality: "candidate", payload: {} },
    ] }],
    routes: [], candidateGroups: [{ id: "cafes", parentNodeId: "cafe-node", mode: "single", options: [{ id: "cafe-option", title: "Cafe" }] }],
    reservations: [], tasks: [],
  };
  return {
    schemaVersion: 2,
    trip,
    enrichmentPolicy: { provider: "google", regionCode: "JP", locationBias: bias },
    placeOwners: [
      { ownerId: "place:museum", source: "itinerary", query: createPortablePlaceSearchQuery({ ownerId: "place:museum", text: " Museum ", locale: "en", regionCode: "jp", locationBias: bias }), bindings: [{ kind: "node", id: "museum-node" }] },
      { ownerId: "place:cafe", source: "itinerary", query: createPortablePlaceSearchQuery({ ownerId: "place:cafe", text: "Cafe", locale: "en", regionCode: "JP", locationBias: bias }), bindings: [{ kind: "candidate", id: "cafe-option" }] },
    ],
  };
}

function completeLedgerFixture() {
  const input = completeInputFixture();
  return { schemaVersion: 1, provider: "google", entries: [
    { ownerId: "place:museum", status: "resolved", source: "itinerary", query: input.placeOwners[0].query, provider: "google", accepted: {
      providerReference: { provider: "google", id: "place-id" }, displayName: "Museum", formattedAddress: "Tokyo", coordinates: { lat: 35.68, lng: 139.76 }, categories: ["museum", "art_gallery"],
    }, observedAt },
    { ownerId: "place:cafe", status: "unresolved", source: "itinerary", query: input.placeOwners[1].query, reason: "no-accepted-candidate", observedAt },
  ] };
}

function ledgerMissingOneOwner() { return { ...completeLedgerFixture(), entries: completeLedgerFixture().entries.slice(0, 1) }; }
function ledgerWithExtraOwner() { return { ...completeLedgerFixture(), entries: [...completeLedgerFixture().entries, { ...completeLedgerFixture().entries[1], ownerId: "place:extra" }] }; }

describe("v2 project contracts", () => {
  test("accepts only matching authored location evidence for resolved itinerary owners", () => {
    const input = completeInputFixture();
    input.trip.days[0].nodes[0].place = {
      name: "Museum", certainty: "unverified", identity: { status: "resolved", coordinates: { lat: 35.68, lng: 139.76 } },
    };
    const evidence = {
      schemaVersion: 1, sourceSha256: "a".repeat(64),
      entries: [{ binding: { kind: "node", id: "museum-node" }, sourceTitle: "Museum", coordinates: { lat: 35.68, lng: 139.76 } }],
    };
    const withEvidence = { ...input, authoredLocationEvidence: evidence };
    expect((parseTripProjectInputV2(withEvidence) as typeof withEvidence).authoredLocationEvidence.entries).toHaveLength(1);
    expect(() => parseTripProjectInputV2({ ...input, authoredLocationEvidence: { ...evidence, sourceSha256: "bad" } })).toThrow(/authored location evidence/);
    expect(() => parseTripProjectInputV2({ ...input, authoredLocationEvidence: { ...evidence, entries: [{ ...evidence.entries[0], coordinates: { lat: 35.7, lng: 139.76 } }] } })).toThrow(/authored location evidence/);
  });
  test.each(["unknown", "flight", "rail", "bus"] as const)("preserves explicit %s transfer and absent terminal through strict parsing", mode => {
    const input = completeInputFixture();
    input.trip.days[0].nodes.push({ id: "transfer", dayId: "day-1", kind: "transfer", title: "Transfer", timing: { certainty: "unknown" }, optionality: "core", payload: { mode } });
    const parsed = parseTripProjectInputV2(input).trip as Trip;
    expect(parsed.days[0].nodes.at(-1)?.payload).toEqual({ mode });
    expect(validateTrip(parsed).errors).toEqual([]);
  });
  test.each([undefined, "ferry"])("does not infer or widen transfer mode %s", mode => {
    const input = completeInputFixture();
    const transfer = { id: "transfer", dayId: "day-1", kind: "transfer", title: "Transfer", timing: { certainty: "unknown" }, optionality: "core", payload: mode === undefined ? {} : { mode } };
    expect(() => parseTripProjectInputV2({ ...input, trip: { ...input.trip, days: [{ ...input.trip.days[0], nodes: [...input.trip.days[0].nodes, transfer] }] } })).toThrow(/payload.mode/);
  });
  test("the neutral fixture is a valid public core Trip", () => {
    expect(validateTrip(completeInputFixture().trip).errors).toEqual([]);
  });

  test("preserves optional and display strings accepted by the public Trip contract", () => {
    const input = completeInputFixture();
    const day = input.trip.days[0];
    const trip: Trip = { ...input.trip, title: "", destinationLabel: "", days: [{ ...day, title: "", summary: "", nodes: [{ ...day.nodes[0], title: "", details: [""] }, day.nodes[1]] }] };
    expect(validateTrip(trip).errors).toEqual([]);
    const parsedTrip = parseTripProjectInputV2({ ...input, trip }).trip as Trip;
    expect(parsedTrip.title).toBe("");
    expect(parsedTrip.destinationLabel).toBe("");
    expect(parsedTrip.days[0].summary).toBe("");
    expect(parsedTrip.days[0].nodes[0]).toMatchObject({ title: "", details: [""] });
  });

  test("rejects missing required Trip day and node fields before returning", () => {
    const input = completeInputFixture();
    const day = input.trip.days[0];
    const node = day.nodes[0];
    for (const field of ["id", "date", "title", "nodes"] as const) {
      const brokenDay = Object.fromEntries(Object.entries(day).filter(([key]) => key !== field));
      expect(() => parseTripProjectInputV2({ ...input, trip: { ...input.trip, days: [brokenDay] } }), `day.${field}`).toThrow();
    }
    for (const field of ["id", "dayId", "kind", "title", "timing", "optionality", "payload"] as const) {
      const brokenNode = Object.fromEntries(Object.entries(node).filter(([key]) => key !== field));
      expect(() => parseTripProjectInputV2({ ...input, trip: { ...input.trip, days: [{ ...day, nodes: [brokenNode, day.nodes[1]] }] } }), `node.${field}`).toThrow();
    }
    expect(() => parseTripProjectInputV2({ ...input, trip: { ...input.trip, days: [{ ...day, nodes: [{ id: "n" }, day.nodes[1]] }] } })).toThrow();
  });

  test("rejects malformed required fields in candidate, route, reservation, and task records", () => {
    const input = completeInputFixture();
    const group = input.trip.candidateGroups[0];
    expect(() => parseTripProjectInputV2({ ...input, trip: { ...input.trip, candidateGroups: [{ ...group, options: [{ id: "cafe-option" }] }] } })).toThrow(/title/);
    expect(() => parseTripProjectInputV2({ ...input, trip: { ...input.trip, routes: [{ id: "route-1" }] } })).toThrow(/route/);
    expect(() => parseTripProjectInputV2({ ...input, trip: { ...input.trip, reservations: [{ id: "reservation-1" }] } })).toThrow(/reservation/);
    expect(() => parseTripProjectInputV2({ ...input, trip: { ...input.trip, tasks: [{ id: "task-1" }] } })).toThrow(/task/);
  });
  test("canonicalizes RFC 8785 object ordering and hashes the exact UTF-8 bytes", () => {
    const value = { b: 1, a: { ä: 2, z: 0 } };
    expect(canonicalizeJson(value)).toBe('{"a":{"z":0,"ä":2},"b":1}');
    expect(sha256CanonicalJson(value)).toBe("af1a89113302e7873026847d481778d8b03c40d5b59fe70d1eb027dac6bb47d5");
  });

  test.each([NaN, Infinity, -Infinity, undefined, 1n, Symbol("x"), () => 1])("rejects non-JSON provenance value %s", (value) => {
    expect(() => canonicalizeJson({ value })).toThrow(/JSON domain/);
  });

  test("rejects cycles, sparse arrays, accessors, and lone surrogates", () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    const sparse = Array(2); sparse[1] = 1;
    const accessor = Object.defineProperty({}, "x", { enumerable: true, get() { return 1; } });
    for (const value of [cycle, sparse, accessor, "\ud800"]) expect(() => canonicalizeJson(value)).toThrow(/JSON domain/);
  });

  test("requires one sorted ledger entry for every stable place owner", () => {
    const input = parseTripProjectInputV2(completeInputFixture());
    expect(() => parsePlaceResolutionLedger(ledgerMissingOneOwner(), input)).toThrow(/owner coverage/);
    expect(() => parsePlaceResolutionLedger(ledgerWithExtraOwner(), input)).toThrow(/owner coverage/);
    const ledger = parsePlaceResolutionLedger(completeLedgerFixture(), input);
    expect(ledger.entries.map((entry: { ownerId: string }) => entry.ownerId)).toEqual(["place:cafe", "place:museum"]);
    expect(ledger.entries[1].accepted?.categories).toEqual(["art_gallery", "museum"]);
  });

  test("has one locale truth for Trip input and an explicit setup locale only without Trip", () => {
    expect(parseTripProjectInputV2(completeInputFixture()).trip?.locale).toBe("en");
    expect(() => parseTripProjectInputV2({ ...completeInputFixture(), locale: "zh-Hant-TW" })).toThrow(/unknown field locale/);
    expect(() => parseTripProjectInputV2({ ...completeInputFixture(), setupLocale: "en" })).toThrow(/setupLocale.*trip is null/);
    expect(emptyTripProjectInputV2("zh-Hant-TW")).toEqual({ schemaVersion: 2, trip: null, setupLocale: "zh-Hant-TW", enrichmentPolicy: null, placeOwners: [] });
  });

  test("rejects invalid owner bindings and foreign node or candidate IDs", () => {
    const input = completeInputFixture();
    expect(() => parseTripProjectInputV2({ ...input, placeOwners: [input.placeOwners[0], input.placeOwners[0]] })).toThrow(/duplicate owner/);
    expect(() => parseTripProjectInputV2({ ...input, placeOwners: [{ ...input.placeOwners[0], bindings: [] }, input.placeOwners[1]] })).toThrow(/binding/);
    expect(() => parseTripProjectInputV2({ ...input, placeOwners: [{ ...input.placeOwners[0], bindings: [{ kind: "node", id: "missing" }] }, input.placeOwners[1]] })).toThrow(/referenced node/);
    expect(() => parseTripProjectInputV2({ ...input, placeOwners: [{ ...input.placeOwners[0], bindings: [{ kind: "node", id: "museum-node" }, { kind: "node", id: "museum-node" }] }, input.placeOwners[1]] })).toThrow(/duplicate binding/);
    expect(() => parseTripProjectInputV2({ ...input, placeOwners: [input.placeOwners[0], { ...input.placeOwners[1], bindings: [{ kind: "node", id: "museum-node" }] }] })).toThrow(/binding used by two owners/);
    expect(() => parseTripProjectInputV2({ ...input, placeOwners: [input.placeOwners[0], { ...input.placeOwners[1], bindings: [{ kind: "candidate", id: "missing" }] }] })).toThrow(/referenced candidate/);
    expect(() => parseTripProjectInputV2({ ...input, placeOwners: [{ ...input.placeOwners[0], source: " " }, input.placeOwners[1]] })).toThrow(/source/);
  });

  test("rejects noncanonical policy region and out-of-range bias", () => {
    const input = completeInputFixture();
    expect(() => parseTripProjectInputV2({ ...input, enrichmentPolicy: { ...input.enrichmentPolicy, regionCode: "JPN" } })).toThrow(/regionCode/);
    expect(() => parseTripProjectInputV2({ ...input, enrichmentPolicy: { ...input.enrichmentPolicy, locationBias: { center: { lat: 91, lng: 0 }, radiusMeters: 10 } } })).toThrow(/coordinates/);
    for (const radiusMeters of [0, 50001]) {
      expect(() => parseTripProjectInputV2({ ...input, enrichmentPolicy: { ...input.enrichmentPolicy, locationBias: { center: { lat: 0, lng: 0 }, radiusMeters } } })).toThrow(/radiusMeters/);
    }
  });

  test("preserves normalized full queries and rejects every drift", () => {
    const input = parseTripProjectInputV2(completeInputFixture());
    const baseline = completeLedgerFixture();
    for (const [key, value] of [
      ["locale", "zh-Hant-TW"], ["regionCode", "US"], ["locationBias", { center: { lat: 35, lng: 139.76 }, radiusMeters: 5000 }],
      ["locationBias", { center: { lat: 35.68, lng: 139.76 }, radiusMeters: 5001 }], ["maxCandidates", 4],
    ] as const) {
      const entries = structuredClone(baseline.entries);
      entries[0].query = { ...entries[0].query, [key]: value };
      expect(() => parsePlaceResolutionLedger({ ...baseline, entries }, input), key).toThrow();
    }
    expect(() => parsePlaceResolutionLedger({ ...baseline, entries: [{ ...baseline.entries[0], query: "Museum" }, baseline.entries[1]] }, input)).toThrow();
  });

  test("requires review timestamps for reviewed unresolved entries and omits them before review", () => {
    const input = parseTripProjectInputV2(completeInputFixture());
    const pending = unresolvedLedgerForInput(input);
    expect(pending.entries.every((entry) => entry.reason === "not-reviewed" && !Object.hasOwn(entry, "observedAt"))).toBe(true);
    const ledger = completeLedgerFixture();
    const reviewedWithoutTimestamp = Object.fromEntries(Object.entries(ledger.entries[1]).filter(([key]) => key !== "observedAt"));
    const entries = [reviewedWithoutTimestamp, ledger.entries[0]];
    expect(() => parsePlaceResolutionLedger({ ...ledger, entries }, input)).toThrow(/observedAt/);
  });

  test("binds the v2 manifest to the entire canonical ledger and all four versions", () => {
    const input = parseTripProjectInputV2(completeInputFixture());
    const ledger = parsePlaceResolutionLedger(completeLedgerFixture(), input);
    const manifest = buildTripProjectManifest({ generatorVersion: "2.0.0", recipeId: "oak-washi", recipeSourceVersion: "2.0.0", packageVersion: "2.0.0", ledger });
    expect(manifest).toEqual({ schemaVersion: 2, generatorVersion: "2.0.0", recipe: { id: "oak-washi", sourceVersion: "2.0.0" }, presentationContractVersion: 2, packages: {
      "@laugh-tale-island/core": "2.0.0", "@laugh-tale-island/react": "2.0.0", "@laugh-tale-island/adapters": "2.0.0", "@laugh-tale-island/testing": "2.0.0",
    }, enrichment: { schemaVersion: 1, provenanceHash: sha256CanonicalJson(ledger) } });
    expect(parseTripProjectManifest(manifest)).toEqual(manifest);
    expect(() => assertManifestMatchesLedger(manifest, ledger)).not.toThrow();
    expect(() => assertManifestMatchesLedger(manifest, { ...ledger, entries: ledger.entries.slice(1) })).toThrow(/hash/);
    expect(() => parseTripProjectManifest({ ...manifest, packages: { ...manifest.packages, "@laugh-tale-island/testing": "2.0.1" } })).toThrow(/one shared version/);
  });

  test("requires v2 package major in built and parsed manifests while allowing same-major upgrades", () => {
    const ledger = unresolvedLedgerForInput(emptyTripProjectInputV2("en"));
    const options = { generatorVersion: "2.0.0", recipeId: "oak-washi", recipeSourceVersion: "2.0.0", packageVersion: "1.0.0", ledger };
    expect(() => buildTripProjectManifest(options)).toThrow(/major 2/);
    const upgraded = buildTripProjectManifest({ ...options, packageVersion: "2.3.4" });
    expect(parseTripProjectManifest(upgraded)).toEqual(upgraded);
    expect(() => parseTripProjectManifest({ ...upgraded, packages: Object.fromEntries(Object.keys(upgraded.packages).map((name) => [name, "1.0.0"])) })).toThrow(/major 2/);
  });
});
