import { describe, expect, it, vi } from "vitest";

import { createDeterministicLocaleSetup } from "../src/setups/deterministic-locale.js";
import { createDeterministicViewportSetup } from "../src/setups/deterministic-viewport.js";

function expectDeepFrozen(value: unknown, seen = new Set<unknown>()): void {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Reflect.ownKeys(value)) expectDeepFrozen((value as Record<PropertyKey, unknown>)[key], seen);
}

describe("createDeterministicLocaleSetup", () => {
  it("uses canonical fixed defaults without browser locale, timezone, or clock reads", () => {
    const language = vi.spyOn(window.navigator, "language", "get");
    const now = vi.spyOn(Date, "now");
    const setup = createDeterministicLocaleSetup();
    expect(setup).toEqual({ locale: "en", timeZone: "UTC", instant: "2042-03-04T05:06:07.000Z" });
    expect(language).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expectDeepFrozen(setup);
  });

  it("validates, clones, canonicalizes, and freezes explicit overrides", () => {
    const input = { locale: "fr-FR", timeZone: "Europe/Paris", instant: "2043-04-05T06:07:08.000Z" };
    const setup = createDeterministicLocaleSetup(input);
    input.locale = "en";
    expect(setup).toEqual({ locale: "fr-FR", timeZone: "Europe/Paris", instant: "2043-04-05T06:07:08.000Z" });
    expectDeepFrozen(setup);
  });

  it.each([
    { locale: "EN-us" },
    { locale: "not a locale" },
    { timeZone: "Not/A_Timezone" },
    { timeZone: "+09:00" },
    { timeZone: "-0500" },
    { instant: "2043-04-05" },
    { instant: "not-an-instant" },
    { instant: "2042-02-31T05:06:07.000Z" },
    { instant: "2042-03-04T24:00:00.000Z" },
  ])("rejects malformed override %#", (input) => {
    expect(() => createDeterministicLocaleSetup(input)).toThrow();
  });
});

describe("createDeterministicViewportSetup", () => {
  it("uses fixed synthetic dimensions with no occlusions and returns a deep-frozen clone", () => {
    const setup = createDeterministicViewportSetup();
    expect(setup).toEqual({ viewport: { width: 800, height: 600 }, occlusions: [] });
    expectDeepFrozen(setup);
  });

  it("clips finite rectangles to the neutral viewport and snapshots caller values", () => {
    const occlusions = [{ x: -10, y: 580, width: 100, height: 50 }, { x: 790, y: -5, width: 30, height: 25 }];
    const setup = createDeterministicViewportSetup({ width: 800, height: 600, occlusions });
    occlusions[0].x = 500;
    expect(setup).toEqual({
      viewport: { width: 800, height: 600 },
      occlusions: [{ x: 0, y: 580, width: 90, height: 20 }, { x: 790, y: 0, width: 10, height: 20 }],
    });
    expectDeepFrozen(setup);
  });

  it.each([
    { width: 0 },
    { height: -1 },
    { width: Number.NaN },
    { height: Infinity },
    { occlusions: [{ x: 0, y: 0, width: -1, height: 2 }] },
    { occlusions: [{ x: Number.NaN, y: 0, width: 1, height: 2 }] },
    { occlusions: [{ x: 0, y: Infinity, width: 1, height: 2 }] },
  ])("rejects invalid viewport input %#", (input) => {
    expect(() => createDeterministicViewportSetup(input)).toThrow();
  });

  it("rejects sparse occlusion arrays instead of silently skipping holes", () => {
    const occlusions = new Array(2) as { x: number; y: number; width: number; height: number }[];
    occlusions[1] = { x: 0, y: 0, width: 1, height: 1 };
    expect(() => createDeterministicViewportSetup({ occlusions })).toThrow(TypeError);
  });
});
