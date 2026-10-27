import { describe, expect, it } from "vitest";
import * as testing from "@laugh-tale-island/testing";
import { validateTrip } from "@laugh-tale-island/core";
import { visualTrip } from "../fixtures/oak-washi/visual-trip.js";
import { providerStates } from "../fixtures/oak-washi/provider-states.js";

const assigned = {
  home: ["390x844", "1024x900"],
  "experience-default": ["390x844"],
  "experience-collapsed-current": ["390x844"],
  "experience-expanded-dense": ["320x568", "430x932"],
  "candidate-open": ["390x844"],
  "candidate-zoom-200": ["320x568"],
  "selection-truth": ["390x844"],
  "route-state-matrix": ["390x844"],
  "opening-hours-matrix": ["390x844"],
  "camera-adversarial": ["390x844"],
  "marker-backends": ["390x844"],
  "map-error": ["390x844"],
  "setup-states": ["390x844"],
  "loading-owned": ["390x844"],
  "runtime-degraded": ["390x844"],
  "accessibility-media": ["390x844"],
  "desktop-bounded": ["768x1024", "1024x900", "1440x1000"],
};

describe("Oak visual catalog", () => {
  it("observes an overnight opening period before midnight and again on the following date", () => {
    const visualCase = testing.oakWashiVisualCases.find(item => item.id === "opening-hours-matrix")!;
    const instants = ["overnight", "cross-midnight"].map(id => providerStates(visualCase, visualCase.variants.find(variant => variant.id === id)!).clock.now());
    expect(instants).toEqual(["2042-03-04T23:00:00.000Z", "2042-03-05T01:00:00.000Z"]);
    expect(new Set(instants.map(instant => instant.slice(0, 10))).size).toBe(2);
  });
  it("publishes exactly the 17 assigned cases and viewport coverage", () => {
    expect(testing).toHaveProperty("oakWashiVisualCases");
    const cases = testing.oakWashiVisualCases;
    expect(cases.map(item => item.id)).toEqual(Object.keys(assigned));
    for (const item of cases) {
      expect([...new Set(item.variants.map(variant => `${variant.viewport.width}x${variant.viewport.height}`))]).toEqual(assigned[item.id as keyof typeof assigned]);
      expect(new Set(item.variants.map(variant => variant.id)).size).toBe(item.variants.length);
    }
  });
  it("deeply freezes pure scenario data without private facts or presentation code", () => {
    expect(testing).toHaveProperty("oakWashiVisualCases");
    const walk = (value: unknown): void => {
      if (value !== null && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(true);
        for (const child of Object.values(value)) walk(child);
      } else expect(["string", "number", "boolean"]).toContain(typeof value);
    };
    walk(testing.oakWashiVisualCases);
    expect(JSON.stringify(testing.oakWashiVisualCases)).not.toMatch(/Tokyo|Taipei|ChIJ|lat(?:itude)?"|lng"|recipes-v2|plugins\/|<\w|[\u3400-\u9fff]/);
  });
  it("publishes an explicit injection-only renderer", () => {
    expect(testing).toHaveProperty("renderOakWashiCase");
    const visualCase = testing.oakWashiVisualCases[0];
    const variant = visualCase.variants[0];
    const adapters = { createMap: () => new testing.FakeMapAdapterV2() };
    const element = testing.renderOakWashiCase(visualCase, variant, testing.alternateTestPresentation, adapters, { trip: testing.syntheticTripV2 });
    expect(element.props.presentation).toBe(testing.alternateTestPresentation);
    expect(element.props.runtime).toBe(adapters);
    expect(element.props.trip).toBe(testing.syntheticTripV2);
    expect(() => testing.renderOakWashiCase({ ...visualCase }, variant, testing.alternateTestPresentation, adapters, { trip: testing.syntheticTripV2 })).toThrow("Unknown or duplicate");
    expect(() => { Reflect.apply(testing.renderOakWashiCase, undefined, [visualCase, variant, undefined, adapters, { trip: testing.syntheticTripV2 }]); }).toThrow("explicit presentation");
  });
  it("preserves every assigned state/backend/media branch instead of reducing 17 cases to 17 images", () => {
    const states = Object.fromEntries(testing.oakWashiVisualCases.map(item => [item.id, item.variants.map(variant => variant.id)]));
    expect(states).toEqual({
      home: ["zero-mobile", "zero-desktop"], "experience-default": ["full-day"], "experience-collapsed-current": ["current-next"],
      "experience-expanded-dense": ["dense-half", "dense-expanded-small", "dense-expanded"], "candidate-open": ["open", "draft", "confirmed", "cancelled"], "candidate-zoom-200": ["comparison"],
      "selection-truth": ["selected-resolved", "selected-unresolved", "grayscale"], "route-state-matrix": ["walking", "transit", "driving", "flight", "unknown", "loading", "external", "unavailable", "retry", "authored-fallback"],
      "opening-hours-matrix": ["known-open", "known-closed", "absent", "incomplete", "overnight", "cross-midnight", "trip-timezone"], "camera-adversarial": ["implausible-duration", "remote-point", "flight"], "marker-backends": ["advanced", "overlay"],
      "map-error": ["runtime-failure"], "setup-states": ["missing-content", "missing-key", "loader-failure"], "loading-owned": ["startup", "place", "route"], "runtime-degraded": ["fatal", "memory-only", "location-denied", "location-unavailable"],
      "accessibility-media": ["keyboard-focus", "selected-error", "forced-colors", "reduced-motion", "asymmetric-safe-areas", "text-reflow"], "desktop-bounded": ["default-768", "expanded-768", "default-1024", "expanded-1024", "default-1440", "expanded-1440"],
    });
    const variants = testing.oakWashiVisualCases.flatMap(item => item.variants);
    expect(variants).toHaveLength(60);
    expect(variants.filter(variant => variant.scenario.textScale === 2).map(variant => variant.id)).toEqual(["comparison", "text-reflow"]);
    expect(variants.filter(variant => variant.scenario.backend === "overlay").map(variant => variant.id)).toEqual(["overlay"]);
    expect(variants.filter(variant => variant.mode === "home").map(variant => variant.id)).toEqual(["zero-mobile", "zero-desktop"]);
  });
  it("assembles valid provider-neutral Trips without mutating the frozen package fixture", () => {
    const before = JSON.stringify(testing.syntheticTripV2);
    for (const item of testing.oakWashiVisualCases) for (const variant of item.variants) {
      expect(validateTrip(visualTrip(item, variant)).errors, `${item.id}/${variant.id}`).toEqual([]);
    }
    expect(JSON.stringify(testing.syntheticTripV2)).toBe(before);
  });
});
