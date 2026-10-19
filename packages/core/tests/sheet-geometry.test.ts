import { describe, expect, expectTypeOf, it } from "vitest";

import {
  clampSheetHeight,
  nearestSheetSnap,
  resolveSheetGeometry,
  type SheetGeometry,
  type SheetSnap,
} from "@laugh-tale-island/core";

describe("sheet geometry", () => {
  it("normalizes supplied snap heights without deriving presentation policy", () => {
    expect(
      resolveSheetGeometry({
        collapsedHeight: Number.NaN,
        halfHeight: 40.4,
        expandedHeight: 100.5,
      }),
    ).toEqual({ collapsed: 0, half: 40, expanded: 101, ceiling: 101 });

    expect(
      resolveSheetGeometry({
        collapsedHeight: -24,
        halfHeight: Number.POSITIVE_INFINITY,
        expandedHeight: 320.4,
      }),
    ).toEqual({ collapsed: 0, half: 0, expanded: 320, ceiling: 320 });
  });

  it("orders, clamps, and rounds each supplied snap height once", () => {
    expect(
      resolveSheetGeometry({
        collapsedHeight: 100.6,
        halfHeight: 500.2,
        expandedHeight: 80.4,
      }),
    ).toEqual({ collapsed: 101, half: 101, expanded: 101, ceiling: 101 });

    expect(
      resolveSheetGeometry({
        collapsedHeight: 100.4,
        halfHeight: 150.6,
        expandedHeight: 200.6,
      }),
    ).toEqual({ collapsed: 100, half: 151, expanded: 201, ceiling: 201 });
  });

  it("clamps arbitrary heights against normalized bounds", () => {
    expect(clampSheetHeight(90, { min: 128, max: 264 })).toBe(128);
    expect(clampSheetHeight(320, { min: 128, max: 264 })).toBe(264);
    expect(clampSheetHeight(Number.NaN, { min: 264, max: 128 })).toBe(128);
  });

  it.each([
    {
      release: "slow",
      samples: [
        { height: 300, timeStamp: 0 },
        { height: 400, timeStamp: 400 },
        { height: 450, timeStamp: 800 },
      ],
    },
    {
      release: "fast",
      samples: [
        { height: 300, timeStamp: 0 },
        { height: 400, timeStamp: 90 },
        { height: 450, timeStamp: 100 },
      ],
    },
  ])("settles a $release release solely from its final position", ({ samples }) => {
    const finalHeight = samples.at(-1)?.height;
    expect(finalHeight).toBe(450);
    expect(
      nearestSheetSnap(finalHeight ?? Number.NaN, {
        collapsed: 100,
        half: 300,
        expanded: 600,
      }),
    ).toBe("half");
  });

  it.each([
    [200, "collapsed"],
    [450, "half"],
  ] satisfies ReadonlyArray<readonly [number, SheetSnap]>) (
    "breaks the exact midpoint at %d toward the lower-height snap",
    (height, expected) => {
      expect(
        nearestSheetSnap(height, {
          collapsed: 100,
          half: 300,
          expanded: 600,
        }),
      ).toBe(expected);
    },
  );

  it("exposes a position-only two-argument snap resolver", () => {
    expectTypeOf(nearestSheetSnap).parameters.toEqualTypeOf<[
      height: number,
      geometry: Pick<SheetGeometry, "collapsed" | "half" | "expanded">,
    ]>();
  });
});
