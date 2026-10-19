import type { NavigationRequestV2 } from "@laugh-tale-island/core/browser";
import { describe, expect, it, vi } from "vitest";
import {
  createGoogleMapsUrl,
  GoogleNavigationAdapter,
  type GoogleNavigationAdapterOptions,
} from "../src/google/GoogleNavigationAdapter.js";

const provider = (label: string, id: string) => ({
  kind: "provider-reference" as const,
  label,
  providerReference: { provider: "google", id },
});

const coordinates = (label: string, lat: number, lng: number) => ({
  kind: "coordinates" as const,
  label,
  coordinates: { lat, lng },
});

function inherited(prototype: object): Record<string, never> {
  const value: Record<string, never> = {};
  Object.setPrototypeOf(value, prototype);
  return value;
}

describe("GoogleNavigationAdapter", () => {
  it("creates the exact provider place URL without origin, travel mode, or key", () => {
    expect(
      createGoogleMapsUrl({
        kind: "place",
        destination: provider("Museum & Café", "place/id ?"),
      }),
    ).toBe(
      "https://www.google.com/maps/search/?api=1&query=Museum+%26+Caf%C3%A9&query_place_id=place%2Fid+%3F",
    );
  });

  it("creates the exact coordinate place URL", () => {
    expect(
      createGoogleMapsUrl({
        kind: "place",
        destination: coordinates("Ignored label", -33.5, 151.25),
      }),
    ).toBe("https://www.google.com/maps/search/?api=1&query=-33.5%2C151.25");
  });

  it("creates the exact provider-provider route URL", () => {
    expect(
      createGoogleMapsUrl({
        kind: "route",
        origin: provider("A & B", "origin/id"),
        destination: provider("Café", "destination id"),
        travelMode: "transit",
      }),
    ).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=A+%26+B&origin_place_id=origin%2Fid&destination=Caf%C3%A9&destination_place_id=destination+id&travelmode=transit",
    );
  });

  it("creates the exact coordinate-coordinate route URL", () => {
    expect(
      createGoogleMapsUrl({
        kind: "route",
        origin: coordinates("A", 1.25, -2.5),
        destination: coordinates("B", 3.75, 4.5),
        travelMode: "walking",
      }),
    ).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=1.25%2C-2.5&destination=3.75%2C4.5&travelmode=walking",
    );
  });

  it("creates exact mixed route URLs in both directions", () => {
    expect(
      createGoogleMapsUrl({
        kind: "route",
        origin: provider("Origin", "origin"),
        destination: coordinates("Destination", 25, 121),
        travelMode: "driving",
      }),
    ).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=Origin&origin_place_id=origin&destination=25%2C121&travelmode=driving",
    );
    expect(
      createGoogleMapsUrl({
        kind: "route",
        origin: coordinates("Origin", 25, 121),
        destination: provider("Destination", "destination"),
        travelMode: "driving",
      }),
    ).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=25%2C121&destination=Destination&destination_place_id=destination&travelmode=driving",
    );
  });

  it("uses provider labels only as human-readable context and never as fallback geocoding", () => {
    const foreign = {
      kind: "provider-reference",
      label: "Would otherwise geocode",
      providerReference: { provider: "other", id: "x" },
    } as const;
    expect(createGoogleMapsUrl({ kind: "place", destination: foreign })).toBeNull();
    expect(
      createGoogleMapsUrl({
        kind: "route",
        origin: foreign,
        destination: provider("Destination", "destination"),
        travelMode: "walking",
      }),
    ).toBeNull();
  });

  it("accepts only walking, driving, and transit on resolved routes", () => {
    for (const travelMode of ["walking", "driving", "transit"] as const) {
      expect(
        createGoogleMapsUrl({
          kind: "route",
          origin: coordinates("A", 1, 2),
          destination: coordinates("B", 3, 4),
          travelMode,
        }),
      ).toContain(`travelmode=${travelMode}`);
    }
    for (const travelMode of ["flight", "unknown", "WALKING", 1, null]) {
      expect(
        createGoogleMapsUrl({
          kind: "route",
          origin: coordinates("A", 1, 2),
          destination: coordinates("B", 3, 4),
          travelMode,
        } as NavigationRequestV2),
      ).toBeNull();
    }
  });

  it("accepts only absent, undefined, supported, flight, or unknown authored travel modes", () => {
    for (const travelMode of [undefined, "flight", "unknown"]) {
      expect(
        createGoogleMapsUrl({
          kind: "authored-external",
          origin: "Tokyo Station",
          destination: "Kyoto Station",
          travelMode,
        } as NavigationRequestV2),
      ).toBe(
        "https://www.google.com/maps/dir/?api=1&origin=Tokyo+Station&destination=Kyoto+Station",
      );
    }
    expect(
      createGoogleMapsUrl({
        kind: "authored-external",
        origin: "Tokyo Station",
        destination: "Kyoto Station",
      }),
    ).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=Tokyo+Station&destination=Kyoto+Station",
    );
    for (const travelMode of ["walking", "driving", "transit"] as const) {
      expect(
        createGoogleMapsUrl({
          kind: "authored-external",
          origin: "Tokyo Station",
          destination: "Kyoto Station",
          travelMode,
        }),
      ).toContain(`travelmode=${travelMode}`);
    }
    for (const travelMode of ["cycling", null, 2, {}, []]) {
      expect(
        createGoogleMapsUrl({
          kind: "authored-external",
          origin: "Tokyo Station",
          destination: "Kyoto Station",
          travelMode,
        } as NavigationRequestV2),
      ).toBeNull();
    }
    const inheritedMode = inherited({ travelMode: "walking" }) as Record<string, unknown>;
    Object.assign(inheritedMode, {
      kind: "authored-external",
      origin: "Tokyo Station",
      destination: "Kyoto Station",
    });
    expect(createGoogleMapsUrl(inheritedMode as NavigationRequestV2)).toBeNull();
  });

  it("rejects a failed own authored travelMode read without invoking the external opener", () => {
    const request = {
      kind: "authored-external",
      origin: "Tokyo Station",
      destination: "Kyoto Station",
    } as Record<string, unknown>;
    Object.defineProperty(request, "travelMode", {
      enumerable: true,
      get: () => {
        throw new Error("travel mode getter failed");
      },
    });
    const openExternal = vi.fn<(url: string) => void>();
    const adapter = new GoogleNavigationAdapter({ openExternal });

    expect(createGoogleMapsUrl(request as NavigationRequestV2)).toBeNull();
    expect(adapter.open(request as NavigationRequestV2)).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("rejects null, primitive, malformed, and incomplete navigation requests", () => {
    const malformed: unknown[] = [
      null,
      undefined,
      1,
      "request",
      {},
      { kind: "place" },
      { kind: "place", destination: null },
      { kind: "route", origin: null, destination: null, travelMode: "walking" },
      { kind: "authored-external", origin: "A" },
    ];
    for (const candidate of malformed) {
      expect(() => createGoogleMapsUrl(candidate as NavigationRequestV2)).not.toThrow();
      expect(createGoogleMapsUrl(candidate as NavigationRequestV2)).toBeNull();
    }
  });

  it("rejects malformed coordinates and provider targets", () => {
    const malformedTargets: unknown[] = [
      {},
      { kind: "coordinates", label: "A", coordinates: null },
      { kind: "coordinates", label: "A", coordinates: { lat: 91, lng: 0 } },
      { kind: "coordinates", label: "A", coordinates: { lat: 0, lng: Number.NaN } },
      { kind: "provider-reference", label: "A", providerReference: null },
      {
        kind: "provider-reference",
        label: "A",
        providerReference: { provider: "google", id: " " },
      },
    ];
    for (const destination of malformedTargets) {
      expect(
        createGoogleMapsUrl({ kind: "place", destination } as NavigationRequestV2),
      ).toBeNull();
    }
  });

  it("rejects C0, DEL, and C1 in every label, id, origin, and destination text branch", () => {
    const controls = ["\u0000", "\u007f", "\u0085"];
    for (const control of controls) {
      expect(
        createGoogleMapsUrl({
          kind: "place",
          destination: provider(`Bad${control}label`, "id"),
        }),
      ).toBeNull();
      expect(
        createGoogleMapsUrl({
          kind: "place",
          destination: provider("Label", `bad${control}id`),
        }),
      ).toBeNull();
      expect(
        createGoogleMapsUrl({
          kind: "place",
          destination: coordinates(`Bad${control}label`, 1, 2),
        }),
      ).toBeNull();
      expect(
        createGoogleMapsUrl({
          kind: "authored-external",
          origin: `Bad${control}origin`,
          destination: "B",
        }),
      ).toBeNull();
      expect(
        createGoogleMapsUrl({
          kind: "authored-external",
          origin: "A",
          destination: `Bad${control}destination`,
        }),
      ).toBeNull();
    }
  });

  it("rejects leading and trailing controls before trimming every navigation text field", () => {
    const controlled = ["\tMuseum", "Museum\t", "\nMuseum", "Museum\n", "\u0085Museum", "Museum\u007f"];
    for (const value of controlled) {
      expect(
        createGoogleMapsUrl({ kind: "place", destination: provider(value, "id") }),
      ).toBeNull();
      expect(
        createGoogleMapsUrl({ kind: "place", destination: provider("Museum", value) }),
      ).toBeNull();
      expect(
        createGoogleMapsUrl({ kind: "place", destination: coordinates(value, 1, 2) }),
      ).toBeNull();
      expect(
        createGoogleMapsUrl({
          kind: "authored-external",
          origin: value,
          destination: "Destination",
        }),
      ).toBeNull();
      expect(
        createGoogleMapsUrl({
          kind: "authored-external",
          origin: "Origin",
          destination: value,
        }),
      ).toBeNull();
    }
  });

  it("rejects prototype-backed navigation request, target, reference, coordinate, and text fields", () => {
    const place = { kind: "place", destination: provider("Museum", "id") } as const;
    const inheritedRequest = inherited(place) as unknown as NavigationRequestV2;
    const inheritedTarget = {
      kind: "place",
      destination: inherited(provider("Museum", "id")),
    } as unknown as NavigationRequestV2;
    const inheritedReference = {
      kind: "place",
      destination: {
        kind: "provider-reference",
        label: "Museum",
        providerReference: inherited({ provider: "google", id: "id" }),
      },
    } as unknown as NavigationRequestV2;
    const inheritedCoordinates = {
      kind: "place",
      destination: {
        kind: "coordinates",
        label: "Museum",
        coordinates: inherited({ lat: 1, lng: 2 }),
      },
    } as unknown as NavigationRequestV2;
    const inheritedText = inherited({ origin: "Origin", destination: "Destination" }) as Record<
      string,
      unknown
    >;
    inheritedText.kind = "authored-external";

    for (const candidate of [
      inheritedRequest,
      inheritedTarget,
      inheritedReference,
      inheritedCoordinates,
      inheritedText as NavigationRequestV2,
    ]) {
      expect(createGoogleMapsUrl(candidate)).toBeNull();
    }
  });

  it("invokes an injected effect exactly once for valid input and zero times for invalid input", () => {
    const openExternal = vi.fn<(url: string) => void>();
    const adapter = new GoogleNavigationAdapter({ openExternal });
    const valid: NavigationRequestV2 = {
      kind: "place",
      destination: provider("Museum", "id"),
    };

    expect(adapter.open(valid)).toBe(true);
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(
      "https://www.google.com/maps/search/?api=1&query=Museum&query_place_id=id",
    );
    expect(adapter.open(null as unknown as NavigationRequestV2)).toBe(false);
    expect(openExternal).toHaveBeenCalledTimes(1);
  });

  it("uses frozen Google provider support and tolerates invalid constructor options", () => {
    for (const options of [null, undefined, 1, {}, { openExternal: "not a function" }]) {
      expect(() => new GoogleNavigationAdapter(options as GoogleNavigationAdapterOptions)).not.toThrow();
    }
    const adapter = new GoogleNavigationAdapter();
    expect(adapter.supportedPlaceProviders).toEqual(["google"]);
    expect(Object.isFrozen(adapter.supportedPlaceProviders)).toBe(true);
  });

  it("calls the patched global opener with exact security arguments and restores its descriptor", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "open");
    const opener = vi.fn();
    Object.defineProperty(globalThis, "open", {
      configurable: true,
      writable: true,
      value: opener,
    });
    try {
      const adapter = new GoogleNavigationAdapter();
      expect(
        adapter.open({ kind: "place", destination: provider("Museum", "id") }),
      ).toBe(true);
      expect(opener).toHaveBeenCalledExactlyOnceWith(
        "https://www.google.com/maps/search/?api=1&query=Museum&query_place_id=id",
        "_blank",
        "noopener,noreferrer",
      );
    } finally {
      if (original) Object.defineProperty(globalThis, "open", original);
      else Reflect.deleteProperty(globalThis, "open");
    }
  });
});
