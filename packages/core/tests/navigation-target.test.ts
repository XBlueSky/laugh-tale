import { describe, expect, it } from "vitest";

import { deriveNavigationTarget, type PlaceRef } from "@laugh-tale-island/core";

const coordinates = { lat: 35.6762, lng: 139.6503 };

function resolvedPlace(overrides: Partial<PlaceRef> = {}): PlaceRef {
  return {
    name: "Tokyo Station",
    certainty: "confirmed",
    identity: { status: "resolved", coordinates },
    ...overrides,
  };
}

describe("deriveNavigationTarget", () => {
  it("prefers a supported provider reference over coexisting coordinates", () => {
    const place = resolvedPlace({
      identity: {
        status: "resolved",
        coordinates,
        providerReference: { provider: "google", id: "ChIJ" },
      },
    });

    expect(deriveNavigationTarget(place, ["google"])).toEqual({
      kind: "provider-reference",
      label: "Tokyo Station",
      providerReference: { provider: "google", id: "ChIJ" },
    });
  });

  it("uses coordinates when no supported provider reference exists", () => {
    expect(deriveNavigationTarget(resolvedPlace(), ["google"])).toEqual({
      kind: "coordinates",
      label: "Tokyo Station",
      coordinates,
    });
    expect(
      deriveNavigationTarget(
        resolvedPlace({
          identity: {
            status: "resolved",
            coordinates,
            providerReference: { provider: "foreign", id: "elsewhere" },
          },
        }),
        ["google"],
      ),
    ).toEqual({ kind: "coordinates", label: "Tokyo Station", coordinates });
  });

  it("returns null for unresolved or provider-only unsupported places and malformed runtime values", () => {
    const unsupportedOnly = resolvedPlace({
      identity: {
        status: "resolved",
        providerReference: { provider: "foreign", id: "elsewhere" },
      },
    });
    const unresolved = resolvedPlace({
      identity: { status: "unresolved", reason: "not-reviewed" },
    });
    const invalidCoordinates = resolvedPlace({
      identity: { status: "resolved", coordinates: { lat: 91, lng: Number.NaN } },
    });
    const blankReference = resolvedPlace({
      identity: {
        status: "resolved",
        providerReference: { provider: " ", id: " " },
      },
    });

    for (const place of [unsupportedOnly, unresolved, invalidCoordinates, blankReference, undefined]) {
      expect(deriveNavigationTarget(place, ["", " "])).toBeNull();
    }
  });

  it.each([
    ["blank provider name", { provider: " ", id: "place-id" }, ["google"]],
    ["blank provider ID", { provider: "google", id: " " }, ["google"]],
    ["blank supported provider", { provider: "google", id: "place-id" }, ["", " "]],
  ] as const)("does not accept a %s", (_label, providerReference, supportedProviders) => {
    const place = resolvedPlace({
      identity: { status: "resolved", providerReference },
    });

    expect(deriveNavigationTarget(place, supportedProviders)).toBeNull();
  });

  it("clones inputs without using the label as an untyped navigation target", () => {
    const place = resolvedPlace({
      identity: {
        status: "resolved",
        coordinates: { lat: 35.6762, lng: 139.6503 },
        providerReference: { provider: "google", id: "place-id" },
      },
    });
    const supported = ["google", "google"];
    const target = deriveNavigationTarget(place, supported);

    expect(target).toEqual({
      kind: "provider-reference",
      label: "Tokyo Station",
      providerReference: { provider: "google", id: "place-id" },
    });
    expect(target).not.toBe("Tokyo Station");
    expect(place.identity).toEqual({
      status: "resolved",
      coordinates: { lat: 35.6762, lng: 139.6503 },
      providerReference: { provider: "google", id: "place-id" },
    });
    expect(supported).toEqual(["google", "google"]);
    if (target?.kind === "provider-reference" && place.identity.status === "resolved") {
      expect(target.providerReference).not.toBe(place.identity.providerReference);
    }

    const coordinateTarget = deriveNavigationTarget(
      resolvedPlace({ identity: { status: "resolved", coordinates } }),
      [],
    );
    if (coordinateTarget?.kind === "coordinates") {
      expect(coordinateTarget.coordinates).not.toBe(coordinates);
    }
  });
});
