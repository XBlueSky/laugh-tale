import { describe, expect, it } from "vitest";

import {
  hasMaterialMapLayoutChange,
  resolveMapLayout,
  type MapLayoutSnapshot,
  type MapViewportMetrics,
  type OcclusionRect,
} from "../src/index.js";

function materialSnapshot(): MapLayoutSnapshot {
  return {
    viewport: { width: 390, height: 844 },
    occlusions: [{ x: 12, y: 12, width: 366, height: 112 }],
    usableRegion: { x: 0, y: 124, width: 390, height: 340 },
    edgeInsets: { top: 124, right: 0, bottom: 380, left: 0 },
  };
}

type SnapshotChange = {
  field: string;
  apply: (snapshot: MapLayoutSnapshot, delta: number) => void;
};

const materialChanges: readonly SnapshotChange[] = [
  { field: "viewport.width", apply: (value, delta) => { value.viewport.width += delta; } },
  { field: "viewport.height", apply: (value, delta) => { value.viewport.height += delta; } },
  { field: "occlusions[0].x", apply: (value, delta) => { value.occlusions[0].x += delta; } },
  { field: "occlusions[0].y", apply: (value, delta) => { value.occlusions[0].y += delta; } },
  { field: "occlusions[0].width", apply: (value, delta) => { value.occlusions[0].width += delta; } },
  { field: "occlusions[0].height", apply: (value, delta) => { value.occlusions[0].height += delta; } },
  { field: "usableRegion.x", apply: (value, delta) => { value.usableRegion.x += delta; } },
  { field: "usableRegion.y", apply: (value, delta) => { value.usableRegion.y += delta; } },
  { field: "usableRegion.width", apply: (value, delta) => { value.usableRegion.width += delta; } },
  { field: "usableRegion.height", apply: (value, delta) => { value.usableRegion.height += delta; } },
  { field: "edgeInsets.top", apply: (value, delta) => { value.edgeInsets.top += delta; } },
  { field: "edgeInsets.right", apply: (value, delta) => { value.edgeInsets.right += delta; } },
  { field: "edgeInsets.bottom", apply: (value, delta) => { value.edgeInsets.bottom += delta; } },
  { field: "edgeInsets.left", apply: (value, delta) => { value.edgeInsets.left += delta; } },
];

describe("resolveMapLayout", () => {
  it.each([
    ["width", 0],
    ["width", -1],
    ["width", Number.NaN],
    ["width", Number.POSITIVE_INFINITY],
    ["width", Number.NEGATIVE_INFINITY],
    ["height", 0],
    ["height", -1],
    ["height", Number.NaN],
    ["height", Number.POSITIVE_INFINITY],
    ["height", Number.NEGATIVE_INFINITY],
  ] satisfies ReadonlyArray<readonly [keyof MapViewportMetrics, number]>) (
    "rejects a viewport whose %s is %s",
    (field, value) => {
      expect(
        resolveMapLayout({ width: 100, height: 80, [field]: value }, []),
      ).toBeNull();
    },
  );

  it("clips, drops, sorts, and deduplicates occlusions without mutating inputs", () => {
    const viewport = Object.freeze({ width: 100, height: 80 });
    const occlusions = Object.freeze([
      Object.freeze({ x: 40, y: 30, width: 80, height: 60 }),
      Object.freeze({ x: 10, y: 0, width: 30, height: 10 }),
      Object.freeze({ x: 10, y: 0, width: 20, height: 10 }),
      Object.freeze({ x: 10, y: 0, width: 20, height: 5 }),
      Object.freeze({ x: 5, y: 0, width: 20, height: 10 }),
      Object.freeze({ x: -10, y: 5, width: 30, height: 20 }),
      Object.freeze({ x: -10, y: 5, width: 30, height: 20 }),
      Object.freeze({ x: Number.NaN, y: 0, width: 10, height: 10 }),
      Object.freeze({ x: 0, y: Number.POSITIVE_INFINITY, width: 10, height: 10 }),
      Object.freeze({ x: 0, y: 0, width: Number.NEGATIVE_INFINITY, height: 10 }),
      Object.freeze({ x: 0, y: 0, width: 10, height: Number.POSITIVE_INFINITY }),
      Object.freeze({ x: 0, y: 0, width: 0, height: 10 }),
      Object.freeze({ x: 0, y: 0, width: 10, height: 0 }),
      Object.freeze({ x: 0, y: 0, width: -10, height: 10 }),
      Object.freeze({ x: 101, y: 0, width: 10, height: 10 }),
    ] satisfies readonly OcclusionRect[]);

    const result = resolveMapLayout(viewport, occlusions);

    expect(result?.occlusions).toEqual([
      { x: 5, y: 0, width: 20, height: 10 },
      { x: 10, y: 0, width: 20, height: 5 },
      { x: 10, y: 0, width: 20, height: 10 },
      { x: 10, y: 0, width: 30, height: 10 },
      { x: 0, y: 5, width: 20, height: 20 },
      { x: 40, y: 30, width: 60, height: 50 },
    ]);
    expect(result?.viewport).toEqual({ width: 100, height: 80 });
    expect(result?.viewport).not.toBe(viewport);
    expect(viewport).toEqual({ width: 100, height: 80 });
    expect(occlusions).toHaveLength(15);
    expect(occlusions[0]).toEqual({ x: 40, y: 30, width: 80, height: 60 });
    expect(occlusions[5]).toEqual({ x: -10, y: 5, width: 30, height: 20 });
  });

  it("uses the full viewport and zero insets when there are no occlusions", () => {
    expect(resolveMapLayout({ width: 390, height: 844 }, [])).toEqual({
      viewport: { width: 390, height: 844 },
      occlusions: [],
      usableRegion: { x: 0, y: 0, width: 390, height: 844 },
      edgeInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  });

  it("selects the largest mobile region and derives its edge insets", () => {
    const result = resolveMapLayout(
      { width: 390, height: 844 },
      [
        { x: 12, y: 12, width: 366, height: 112 },
        { x: 0, y: 464, width: 390, height: 380 },
      ],
    );

    expect(result?.usableRegion).toEqual({ x: 0, y: 124, width: 390, height: 340 });
    expect(result?.edgeInsets).toEqual({ top: 124, right: 0, bottom: 380, left: 0 });
  });

  it("selects the largest desktop region beside a full-height rail", () => {
    expect(
      resolveMapLayout(
        { width: 1440, height: 900 },
        [{ x: 880, y: 0, width: 560, height: 900 }],
      )?.usableRegion,
    ).toEqual({ x: 0, y: 0, width: 880, height: 900 });
  });

  it("prefers a center-containing equal-area candidate before a wider candidate", () => {
    expect(
      resolveMapLayout(
        { width: 6, height: 6 },
        [
          { x: 0, y: 0, width: 1, height: 2 },
          { x: 3, y: 0, width: 1, height: 4 },
        ],
      )?.usableRegion,
    ).toEqual({ x: 0, y: 2, width: 3, height: 4 });
  });

  it("prefers greater width among equal-area candidates that equally miss the center", () => {
    expect(
      resolveMapLayout(
        { width: 100, height: 100 },
        [{ x: 40, y: 40, width: 20, height: 20 }],
      )?.usableRegion,
    ).toEqual({ x: 0, y: 0, width: 100, height: 40 });
  });

  it("prefers smaller y among otherwise equal-area candidates", () => {
    expect(
      resolveMapLayout(
        { width: 100, height: 100 },
        [{ x: 0, y: 40, width: 100, height: 20 }],
      )?.usableRegion,
    ).toEqual({ x: 0, y: 0, width: 100, height: 40 });
  });

  it("prefers the left region when a center-spanning occluder leaves equal sides", () => {
    expect(
      resolveMapLayout(
        { width: 100, height: 100 },
        [{ x: 40, y: 0, width: 20, height: 100 }],
      )?.usableRegion,
    ).toEqual({ x: 0, y: 0, width: 40, height: 100 });
  });

  it("subtracts overlapping occlusions by positive area", () => {
    expect(
      resolveMapLayout(
        { width: 100, height: 100 },
        [
          { x: 0, y: 0, width: 100, height: 30 },
          { x: 0, y: 20, width: 100, height: 20 },
        ],
      )?.usableRegion,
    ).toEqual({ x: 0, y: 40, width: 100, height: 60 });
  });

  it("returns null when occlusions cover the complete viewport", () => {
    expect(
      resolveMapLayout(
        { width: 100, height: 100 },
        [
          { x: 0, y: 0, width: 50, height: 100 },
          { x: 50, y: 0, width: 50, height: 100 },
        ],
      ),
    ).toBeNull();
  });
});

describe("hasMaterialMapLayoutChange", () => {
  it.each(materialChanges)(
    "uses a one-CSS-pixel threshold for $field",
    ({ apply }) => {
      const previous = materialSnapshot();
      const subpixel = materialSnapshot();
      const positivePixel = materialSnapshot();
      const negativePixel = materialSnapshot();

      apply(subpixel, 0.999);
      apply(positivePixel, 1);
      apply(negativePixel, -1);

      expect(hasMaterialMapLayoutChange(previous, subpixel)).toBe(false);
      expect(hasMaterialMapLayoutChange(previous, positivePixel)).toBe(true);
      expect(hasMaterialMapLayoutChange(previous, negativePixel)).toBe(true);
    },
  );

  it("ignores simultaneous subpixel differences in every corresponding field", () => {
    const previous = materialSnapshot();
    const next = materialSnapshot();

    for (const change of materialChanges) change.apply(next, 0.999);

    expect(hasMaterialMapLayoutChange(previous, next)).toBe(false);
  });

  it("distinguishes null transitions and treats two null values as unchanged", () => {
    const snapshot = materialSnapshot();

    expect(hasMaterialMapLayoutChange(null, null)).toBe(false);
    expect(hasMaterialMapLayoutChange(null, snapshot)).toBe(true);
    expect(hasMaterialMapLayoutChange(snapshot, null)).toBe(true);
  });

  it("treats a normalized occlusion array length change as material", () => {
    const previous = materialSnapshot();
    const next = materialSnapshot();
    next.occlusions = [
      ...next.occlusions,
      { x: 0, y: 464, width: 390, height: 380 },
    ];

    expect(hasMaterialMapLayoutChange(previous, next)).toBe(true);
  });
});
