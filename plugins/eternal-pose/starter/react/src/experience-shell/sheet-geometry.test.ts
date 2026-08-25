import { describe, expect, it } from "vitest";

import {
  clampSheetHeight,
  nearestSheetSnap,
  resolveSheetGeometry,
} from "./sheet-geometry";

describe("sheet geometry", () => {
  it("uses one safe-area-aware ceiling for every snap on a short screen", () => {
    expect(
      resolveSheetGeometry({
        viewportHeight: 500,
        topClearance: 236,
        safeBottom: 0,
        collapsedHeight: 128,
      }),
    ).toEqual({ collapsed: 128, half: 186, expanded: 264, ceiling: 264 });
  });

  it("never raises the ceiling above the header on extremely short screens", () => {
    expect(
      resolveSheetGeometry({
        viewportHeight: 260,
        topClearance: 180,
        safeBottom: 34,
        collapsedHeight: 128,
      }),
    ).toEqual({ collapsed: 128, half: 128, expanded: 128, ceiling: 128 });
  });

  it("subtracts the bottom safe area and clamps every derived height", () => {
    const geometry = resolveSheetGeometry({
      viewportHeight: 844,
      topClearance: 118,
      safeBottom: 34,
      collapsedHeight: 128,
    });

    expect(geometry.ceiling).toBe(692);
    expect(geometry.expanded).toBe(692);
    expect(geometry.half).toBeGreaterThanOrEqual(geometry.collapsed);
    expect(geometry.half).toBeLessThanOrEqual(geometry.expanded);
    expect(clampSheetHeight(90, { min: 128, max: 264 })).toBe(128);
    expect(clampSheetHeight(320, { min: 128, max: 264 })).toBe(264);
  });

  it("uses release velocity to select the next stable snap in the drag direction", () => {
    const geometry = { collapsed: 128, half: 186, expanded: 249 };

    expect(nearestSheetSnap(249, geometry, -0.6)).toBe("expanded");
    expect(nearestSheetSnap(170, geometry, -0.6)).toBe("half");
    expect(nearestSheetSnap(170, geometry, 0.6)).toBe("collapsed");
    expect(nearestSheetSnap(220, geometry, 0)).toBe("expanded");
  });
});
