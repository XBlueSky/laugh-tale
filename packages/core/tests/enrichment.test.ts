import { describe, expect, it } from "vitest";
import {
  createPlaceResolutionProvenance,
  createPlaceSearchQuery,
} from "@laugh-tale-island/core/enrichment";
import * as enrichment from "@laugh-tale-island/core/enrichment";

describe("enrichment policy", () => {
  it("keeps internal query cloning out of the public enrichment API", () => {
    expect(enrichment).not.toHaveProperty("clonePlaceSearchQuery");
  });

  it("exports deterministic normalized search queries with finite location bias", () => {
    expect(
      createPlaceSearchQuery({
        ownerId: "  node:ramen  ",
        text: "  Ramen Street  ",
        locale: "en-us",
        regionCode: " jp ",
        locationBias: { center: { lat: 35.6762, lng: 139.6503 }, radiusMeters: 500 },
      }),
    ).toEqual({
      ownerId: "node:ramen",
      text: "Ramen Street",
      locale: "en-US",
      regionCode: "JP",
      locationBias: { center: { lat: 35.6762, lng: 139.6503 }, radiusMeters: 500 },
      maxCandidates: 3,
    });
  });

  it.each([
    [{ ownerId: " ", text: "place", locale: "en-US" }],
    [{ ownerId: "owner", text: " ", locale: "en-US" }],
    [{ ownerId: "owner", text: "place", locale: "not_a_locale" }],
    [{ ownerId: "owner", text: "place", locale: "en-US", regionCode: "JPN" }],
    [{ ownerId: "owner", text: "place", locale: "en-US", locationBias: { center: { lat: 91, lng: 0 }, radiusMeters: 1 } }],
    [{ ownerId: "owner", text: "place", locale: "en-US", locationBias: { center: { lat: 0, lng: Number.NaN }, radiusMeters: 1 } }],
    [{ ownerId: "owner", text: "place", locale: "en-US", locationBias: { center: { lat: 0, lng: 0 }, radiusMeters: 0 } }],
    [{ ownerId: "owner", text: "place", locale: "en-US", locationBias: { center: { lat: 0, lng: 0 }, radiusMeters: 50_001 } }],
  ])("rejects invalid search input %#", (input) => {
    expect(() => createPlaceSearchQuery(input)).toThrow();
  });

  it.each([-1, Number.NaN, Infinity, -Infinity])("rejects malformed radius %s", (radiusMeters) => {
    expect(() => createPlaceSearchQuery({ ownerId: "owner", text: "place", locale: "en-US", locationBias: { center: { lat: 0, lng: 0 }, radiusMeters } })).toThrow();
  });

  it.each([0.001, 50_000])("accepts radius boundary %s with world-coordinate boundaries", (radiusMeters) => {
    expect(createPlaceSearchQuery({
      ownerId: "owner", text: "place", locale: "en-US",
      locationBias: { center: { lat: -90, lng: 180 }, radiusMeters },
    }).locationBias).toEqual({ center: { lat: -90, lng: 180 }, radiusMeters });
  });

  it("isolates nested geographic bias across input, query and provenance", () => {
    const input = { ownerId: "owner", text: "place", locale: "en-US", locationBias: { center: { lat: 35, lng: 139 }, radiusMeters: 500 } };
    const query = createPlaceSearchQuery(input);
    const provenance = createPlaceResolutionProvenance({ ownerId: "owner", source: "review", provider: "google", observedAt: "2026-09-06T12:34:56.789Z", query });
    input.locationBias.center.lat = 0;
    input.locationBias.radiusMeters = 100;
    expect(query.locationBias).toEqual({ center: { lat: 35, lng: 139 }, radiusMeters: 500 });
    query.locationBias!.center.lng = 0;
    query.locationBias!.radiusMeters = 1;
    expect(provenance.query.locationBias).toEqual({ center: { lat: 35, lng: 139 }, radiusMeters: 500 });
  });

  it("preserves a supplied query and timestamp in a fresh provenance snapshot", () => {
    const query = createPlaceSearchQuery({ ownerId: "node:ramen", text: "Ramen Street", locale: "ja-jp" });
    const provenance = createPlaceResolutionProvenance({
      ownerId: " node:ramen ",
      source: " editorial-import ",
      query,
      provider: " places-api ",
      observedAt: "2026-09-06T12:34:56.789Z",
    });

    expect(provenance).toEqual({
      schemaVersion: 1,
      ownerId: "node:ramen",
      source: "editorial-import",
      query: { ownerId: "node:ramen", text: "Ramen Street", locale: "ja-JP", maxCandidates: 3 },
      provider: "places-api",
      observedAt: "2026-09-06T12:34:56.789Z",
    });
    expect(provenance.query).not.toBe(query);
  });

  it.each([
    { ownerId: " ", source: "source", provider: "provider", observedAt: "2026-09-06T12:34:56.789Z" },
    { ownerId: "owner", source: " ", provider: "provider", observedAt: "2026-09-06T12:34:56.789Z" },
    { ownerId: "owner", source: "source", provider: " ", observedAt: "2026-09-06T12:34:56.789Z" },
    { ownerId: "owner", source: "source", provider: "provider", observedAt: "2026-09-06T12:34:56Z" },
    { ownerId: "owner", source: "source", provider: "provider", observedAt: "2026-09-06T12:34:56.789+00:00" },
    { ownerId: "owner", source: "source", provider: "provider", observedAt: "+010000-09-06T12:34:56.789Z" },
    { ownerId: "owner", source: "source", provider: "provider", observedAt: "2026-02-30T12:34:56.789Z" },
    ...["2026-09-06T12:34:56.7890Z", "2026-09-06T24:00:00.000Z", "2026-09-06T12:60:00.000Z", "2026-09-06T12:34:60.000Z"].map((observedAt) => ({ ownerId: "owner", source: "source", provider: "provider", observedAt })),
  ])("rejects invalid provenance input %#", (input) => {
    const query = createPlaceSearchQuery({ ownerId: "owner", text: "place", locale: "en-US" });
    expect(() => createPlaceResolutionProvenance({ ...input, query })).toThrow();
  });
});
