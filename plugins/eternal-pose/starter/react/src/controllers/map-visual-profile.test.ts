import { describe, expect, it } from "vitest";

import type {
  MapMarkerVisual,
  MapRouteVisual,
  MapVisualProfile,
} from "./presentation-contract";
import { assertMapVisualProfile } from "./map-visual-profile";

function markerVisual(label = "Marker"): MapMarkerVisual {
  return {
    title: label,
    className: "profile-marker",
    label,
    parts: [{ className: "profile-marker__label", text: label }],
    fallback: { fill: "#ffffff", stroke: "#111827", text: "1" },
  };
}

function routeVisual(): MapRouteVisual {
  return {
    stroke: "#2563eb",
    opacity: 0.8,
    width: 4,
    casing: { stroke: "#ffffff", opacity: 0.7, width: 7 },
    dash: [6, 3],
  };
}

function validProfile(overrides: Partial<MapVisualProfile> = {}): MapVisualProfile {
  return {
    id: "test-profile",
    basemap: {
      mode: "neutral",
      density: "medium",
      contrast: "standard",
      poi: "minimal",
    },
    candidateTitle: (sequenceNumber, index, option) =>
      `${sequenceNumber}${String.fromCharCode(65 + index)} · ${option.title}`,
    marker: (place) => markerVisual(place.label),
    userLocation: () => markerVisual("Current location"),
    route: routeVisual,
    ...overrides,
  };
}

describe("assertMapVisualProfile", () => {
  it("accepts finite profile visuals for every route semantic combination", () => {
    const combinations = new Set<string>();
    const profile = validProfile({
      route: (route) => {
        combinations.add(
          [route.tone, route.source, route.certainty, route.mode].join(":"),
        );
        return routeVisual();
      },
    });

    expect(() => assertMapVisualProfile(profile)).not.toThrow();
    expect(combinations.size).toBe(3 * 3 * 4 * 4);
  });

  it("rejects a visual invalid only for a previously untested route combination", () => {
    const profile = validProfile({
      route: (route) => ({
        ...routeVisual(),
        stroke:
          route.tone === "selected" &&
          route.source === "recomposed" &&
          route.certainty === "unverified" &&
          route.mode === "flight"
            ? "   "
            : "#2563eb",
      }),
    });

    expect(() => assertMapVisualProfile(profile)).toThrow(/stroke/i);
  });

  it("exercises deterministic candidate fixtures and rejects a blank candidate title", () => {
    const calls: Array<{
      sequenceNumber: number;
      index: number;
      optionId: string;
      optionTitle: string;
    }> = [];
    const profile = validProfile({
      candidateTitle: (sequenceNumber, index, option) => {
        calls.push({
          sequenceNumber,
          index,
          optionId: option.id,
          optionTitle: option.title,
        });
        return index === 1 ? "   " : option.title;
      },
    });

    expect(() => assertMapVisualProfile(profile)).toThrow(/candidate title/i);
    expect(calls).toEqual([
      {
        sequenceNumber: 3,
        index: 0,
        optionId: "profile-candidate-a",
        optionTitle: "Candidate A",
      },
      {
        sequenceNumber: 3,
        index: 1,
        optionId: "profile-candidate-b",
        optionTitle: "Candidate B",
      },
    ]);
  });

  it.each(["default", "candidate", "selected", "completed", "skipped"] as const)(
    "validates marker visuals for the %s tone",
    (invalidTone) => {
      const profile = validProfile({
        marker: (place) => ({
          ...markerVisual(place.label),
          className:
            place.tone === invalidTone ? "   " : "profile-marker",
        }),
      });

      expect(() => assertMapVisualProfile(profile)).toThrow(/class/i);
    },
  );

  it.each([
    ["tone", "default"],
    ["tone", "selected"],
    ["tone", "unavailable"],
    ["source", "manual"],
    ["source", "provider"],
    ["source", "recomposed"],
    ["certainty", "confirmed"],
    ["certainty", "suggested"],
    ["certainty", "candidate"],
    ["certainty", "unverified"],
    ["mode", "walking"],
    ["mode", "transit"],
    ["mode", "driving"],
    ["mode", "flight"],
  ] as const)("validates route visuals for %s=%s", (field, value) => {
    const profile = validProfile({
      route: (route) => ({
        ...routeVisual(),
        stroke: route[field] === value ? "   " : "#2563eb",
      }),
    });

    expect(() => assertMapVisualProfile(profile)).toThrow(/stroke/i);
  });

  it.each([
    ["route opacity", () => ({ ...routeVisual(), opacity: Number.NaN })],
    ["route opacity", () => ({ ...routeVisual(), opacity: -0.01 })],
    ["route opacity", () => ({ ...routeVisual(), opacity: 1.01 })],
    ["route width", () => ({ ...routeVisual(), width: 0 })],
    [
      "casing opacity",
      () => ({
        ...routeVisual(),
        casing: { stroke: "#fff", opacity: Number.POSITIVE_INFINITY, width: 7 },
      }),
    ],
    [
      "casing width",
      () => ({
        ...routeVisual(),
        casing: { stroke: "#fff", opacity: 0.7, width: -1 },
      }),
    ],
    ["dash", () => ({ ...routeVisual(), dash: [4, Number.NaN] })],
    ["dash", () => ({ ...routeVisual(), dash: [4, -1] })],
  ] as const)("rejects invalid %s values", (expected, visual) => {
    expect(() =>
      assertMapVisualProfile(validProfile({ route: visual })),
    ).toThrow(new RegExp(expected, "i"));
  });

  it.each([
    ["marker title", () => ({ ...markerVisual(), title: " " })],
    ["marker class", () => ({ ...markerVisual(), className: " " })],
    ["marker label", () => ({ ...markerVisual(), label: " " })],
    [
      "marker part class",
      () => ({
        ...markerVisual(),
        parts: [{ className: " ", text: "Marker" }],
      }),
    ],
    [
      "fallback fill",
      () => ({
        ...markerVisual(),
        fallback: { fill: " ", stroke: "#111827", text: "1" },
      }),
    ],
    [
      "fallback stroke",
      () => ({
        ...markerVisual(),
        fallback: { fill: "#ffffff", stroke: " ", text: "1" },
      }),
    ],
  ] as const)("rejects a blank %s", (expected, visual) => {
    expect(() =>
      assertMapVisualProfile(validProfile({ marker: visual })),
    ).toThrow(new RegExp(expected, "i"));
  });

  it.each([
    ["fallback fill", "  UrL ( https://attacker.invalid/fill.svg#paint )  "],
    ["fallback stroke", "\turl(https://attacker.invalid/stroke.svg#paint)\n"],
    ["fallback fill", `#ffffff\u0000`],
    ["fallback stroke", `rgb(1 2 3)\u000B`],
  ] as const)("rejects an unsafe %s paint", (field, paint) => {
    const profile = validProfile({
      marker: () => {
        const visual = markerVisual();
        return {
          ...visual,
          fallback: {
            ...visual.fallback,
            [field === "fallback fill" ? "fill" : "stroke"]: paint,
          },
        };
      },
    });

    expect(() => assertMapVisualProfile(profile)).toThrow(
      new RegExp(`${field}.*safe paint`, "i"),
    );
  });

  it("accepts standard concrete CSS fallback colors containing url-like letters", () => {
    const profile = validProfile({
      marker: () => ({
        ...markerVisual(),
        fallback: {
          fill: "burlywood",
          stroke: "rgb(17 24 39 / 80%)",
          text: "1",
        },
      }),
    });

    expect(() => assertMapVisualProfile(profile)).not.toThrow();
  });

  it("validates user-location marker colors, classes, and labels", () => {
    const profile = validProfile({
      userLocation: () => ({ ...markerVisual(), label: " " }),
    });

    expect(() => assertMapVisualProfile(profile)).toThrow(/label/i);
  });
});
