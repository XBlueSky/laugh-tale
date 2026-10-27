import {
  collectDayProgressScope,
  evaluateOpeningHours,
  validateRouteProviderResult,
  validateTrip,
} from "@laugh-tale-island/core";
import { describe, expect, it } from "vitest";

import { adversarialPlaceFixtures } from "../src/fixtures/adversarial-places.js";
import { adversarialRouteFixtures } from "../src/fixtures/adversarial-routes.js";
import { syntheticTripV2 } from "../src/fixtures/synthetic-trip-v2.js";

function expectDeepFrozen(value: unknown, seen = new Set<unknown>()): void {
  if ((typeof value !== "object" && typeof value !== "function") || value === null || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Reflect.ownKeys(value)) expectDeepFrozen((value as Record<PropertyKey, unknown>)[key], seen);
}

describe("syntheticTripV2", () => {
  it("is valid, recursively frozen, and covers every built-in kind plus one valid custom role", () => {
    expect(validateTrip(syntheticTripV2)).toEqual({ errors: [], warnings: [] });
    expectDeepFrozen(syntheticTripV2);
    const kinds = syntheticTripV2.days.flatMap((day) => day.nodes.map(({ kind }) => kind));
    expect(new Set(kinds)).toEqual(new Set(["transport", "transfer", "lodging", "dining", "shopping", "sightseeing", "experience", "logistics", "custom"]));
    const custom = syntheticTripV2.days.flatMap(({ nodes }) => nodes).find(({ kind }) => kind === "custom");
    expect(custom?.kind === "custom" ? custom.payload.presentationRole : undefined).toBe("task");
  });

  it("covers coordinate, provider, and unresolved identity truth plus every route mode", () => {
    const identities = syntheticTripV2.days.flatMap(({ nodes }) => nodes.flatMap(({ place }) => place ? [place.identity] : []));
    expect(identities.some((identity) => identity.status === "resolved" && "coordinates" in identity)).toBe(true);
    expect(identities.some((identity) => identity.status === "resolved" && "providerReference" in identity)).toBe(true);
    expect(identities).toContainEqual({ status: "unresolved", reason: "not-reviewed" });
    expect(new Set(syntheticTripV2.routes.map(({ mode }) => mode))).toEqual(new Set(["walking", "transit", "driving", "flight", "unknown"]));
  });

  it("contains candidate choice, booking, task, shopping, checklist, and day progress owners", () => {
    expect(syntheticTripV2.candidateGroups.some(({ mode, defaultOptionId }) => mode === "single" && typeof defaultOptionId === "string")).toBe(true);
    expect(syntheticTripV2.reservations.some(({ booking }) => booking.status === "confirmed")).toBe(true);
    expect(syntheticTripV2.tasks).toContainEqual(expect.objectContaining({ scope: "day", dayId: syntheticTripV2.days[0]?.id }));
    const scope = collectDayProgressScope(syntheticTripV2, syntheticTripV2.days[0].id);
    expect(scope.candidateGroupIds).toEqual(["candidate-meal"]);
    expect(scope.shoppingItemIds).toEqual(["shopping-journal"]);
    expect(scope.skippedNodeIds).toContain("node-custom");
    expect(scope.completionIds).toEqual(expect.arrayContaining(["node:node-lodging", "checklist:check-lodging", "task:task-day", "checklist:task-child"]));
  });

  it("uses only deliberately synthetic neutral facts rather than benchmark facts", () => {
    const serialized = JSON.stringify(syntheticTripV2);
    expect(serialized).not.toMatch(/Tokyo|Shibuya|Shinjuku|Ginza|Asakusa|Akihabara|ChIJ|Asia\/Tokyo/i);
    expect(serialized).not.toContain("35.6762");
    expect(serialized).not.toContain("139.6503");
    expect(syntheticTripV2.title).toContain("Synthetic");
    expect(syntheticTripV2.timezone).toBe("UTC");
  });
});

describe("adversarialRouteFixtures", () => {
  const expectedNames = ["valid", "validFlight", "malformedCoordinate", "onePoint", "endpointMismatch", "remoteMiddlePoint", "implausibleDuration", "implausibleFlight", "unsupportedUnknown"] as const;

  it("contains every named case with its exact stable validation status and reason", () => {
    expect(Object.keys(adversarialRouteFixtures)).toEqual(expectedNames);
    for (const name of expectedNames) {
      const fixture = adversarialRouteFixtures[name];
      const actual = validateRouteProviderResult(fixture.request, fixture.result);
      expect(actual).toMatchObject(fixture.expected);
    }
    expect(adversarialRouteFixtures.valid.expected).toEqual({ status: "ready" });
    expect(adversarialRouteFixtures.validFlight.expected).toEqual({ status: "ready" });
    expect(adversarialRouteFixtures.malformedCoordinate.expected).toEqual({ status: "unavailable", reason: "malformed-response" });
    expect(adversarialRouteFixtures.onePoint.expected).toEqual({ status: "unavailable", reason: "malformed-response" });
    expect(adversarialRouteFixtures.endpointMismatch.expected).toEqual({ status: "unavailable", reason: "implausible-result" });
    expect(adversarialRouteFixtures.remoteMiddlePoint.expected).toEqual({ status: "unavailable", reason: "implausible-result" });
    expect(adversarialRouteFixtures.implausibleDuration.expected).toEqual({ status: "unavailable", reason: "implausible-result" });
    expect(adversarialRouteFixtures.implausibleFlight.expected).toEqual({ status: "unavailable", reason: "implausible-result" });
    expect(adversarialRouteFixtures.unsupportedUnknown.expected).toEqual({ status: "unavailable", reason: "unsupported" });
    expectDeepFrozen(adversarialRouteFixtures);
  });
});

describe("adversarialPlaceFixtures", () => {
  const expectedNames = ["knownOpen", "knownClosed", "absentHours", "incompleteHours", "overnight", "wrongTimezone"] as const;

  it("contains every named case with explicit time inputs and exact opening state", () => {
    expect(Object.keys(adversarialPlaceFixtures)).toEqual(expectedNames);
    for (const name of expectedNames) {
      const fixture = adversarialPlaceFixtures[name];
      expect(fixture.instant).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(fixture.timeZone.length).toBeGreaterThan(0);
      expect(evaluateOpeningHours(fixture.facts, fixture.instant, fixture.timeZone)).toEqual(fixture.expected);
    }
    expect(adversarialPlaceFixtures.knownOpen.expected).toEqual({ status: "open" });
    expect(adversarialPlaceFixtures.knownClosed.expected).toEqual({ status: "closed" });
    expect(adversarialPlaceFixtures.absentHours.expected).toEqual({ status: "unknown", reason: "absent" });
    expect(adversarialPlaceFixtures.incompleteHours.expected).toEqual({ status: "unknown", reason: "incomplete" });
    expect(adversarialPlaceFixtures.overnight.expected).toEqual({ status: "open" });
    expect(adversarialPlaceFixtures.wrongTimezone.expected).toEqual({ status: "closed" });
    expectDeepFrozen(adversarialPlaceFixtures);
  });
});
