import { describe, expect, it } from "vitest";

import {
  CAMERA_POLICY_V2,
  reframeCameraIntent,
  resolveFitCameraIntent,
  resolveFocusCameraIntent,
  resolveRecenterUserCameraIntent,
  type CameraIntent,
  type CameraIntentContext,
  type CameraSnapshot,
  type Coordinates,
  type FitCameraGeometry,
  type MapLayoutSnapshot,
} from "../src/index.js";

function layout(seed: number): MapLayoutSnapshot {
  return {
    viewport: { width: 390 + seed, height: 844 + seed },
    occlusions: [{ x: seed, y: seed, width: 100, height: 40 }],
    usableRegion: { x: seed, y: 40 + seed, width: 390, height: 500 },
    edgeInsets: { top: 40 + seed, right: seed, bottom: 304, left: seed },
  };
}

function context(overrides: Partial<CameraIntentContext> = {}): CameraIntentContext {
  return {
    intentId: "day-1:place-1",
    layout: layout(0),
    reducedMotion: false,
    ...overrides,
  };
}

// Synthetic neutral coordinates: invented fixtures unrelated to any benchmark location.
const place: Coordinates = { lat: 12.3456, lng: -45.6789 };
const secondPlace: Coordinates = { lat: -23.4567, lng: 67.8901 };

function expectSharedFields(intent: CameraIntent, reducedMotion: boolean): void {
  expect(intent.intentId).toBe("day-1:place-1");
  expect(intent.transition).toBe(reducedMotion ? "immediate" : "animate");
  expect(intent.viewport).toEqual(layout(0).viewport);
  expect(intent.usableRegion).toEqual(layout(0).usableRegion);
  expect(intent.edgeInsets).toEqual(layout(0).edgeInsets);
}

describe("camera policy", () => {
  it("keeps the versioned policy record frozen and authoritative for later resolutions", () => {
    expect(CAMERA_POLICY_V2).toEqual({
      focusMinimumZoom: 15,
      focusMaximumZoom: 18,
      userLocationZoom: 16,
      fitMaximumZoom: 15,
    });
    expect(Object.isFrozen(CAMERA_POLICY_V2)).toBe(true);

    const attemptedMutation = () => {
      (CAMERA_POLICY_V2 as unknown as { focusMinimumZoom: number }).focusMinimumZoom = 1;
    };
    expect(attemptedMutation).toThrow(TypeError);
    expect(CAMERA_POLICY_V2.focusMinimumZoom).toBe(15);
    expect(resolveFocusCameraIntent(context(), place, null)?.targetZoom).toBe(15);
  });

  it.each([false, true])("copies common fields and chooses %s motion", (reducedMotion) => {
    const fit = resolveFitCameraIntent(
      context({ reducedMotion }),
      { points: [place], paths: [] },
    );
    const focus = resolveFocusCameraIntent(context({ reducedMotion }), place, null);
    const recenter = resolveRecenterUserCameraIntent(context({ reducedMotion }), place);

    expect(fit).not.toBeNull();
    expect(focus).not.toBeNull();
    expect(recenter).not.toBeNull();
    expectSharedFields(fit!, reducedMotion);
    expectSharedFields(focus!, reducedMotion);
    expectSharedFields(recenter!, reducedMotion);
  });

  it("rejects empty IDs through every resolver and invalid focus or recenter coordinates", () => {
    const invalidCoordinates: Coordinates[] = [
      { lat: Number.NaN, lng: 0 },
      { lat: Number.POSITIVE_INFINITY, lng: 0 },
      { lat: 0, lng: Number.NEGATIVE_INFINITY },
      { lat: 90.001, lng: 0 },
      { lat: -90.001, lng: 0 },
      { lat: 0, lng: 180.001 },
      { lat: 0, lng: -180.001 },
    ];

    for (const intentId of ["", "   "]) {
      expect(resolveFitCameraIntent(context({ intentId }), {
        points: [place],
        paths: [],
      })).toBeNull();
      expect(resolveFocusCameraIntent(context({ intentId }), place, null)).toBeNull();
      expect(resolveRecenterUserCameraIntent(context({ intentId }), place)).toBeNull();
    }
    for (const coordinate of invalidCoordinates) {
      expect(resolveFocusCameraIntent(context(), coordinate, null)).toBeNull();
      expect(resolveRecenterUserCameraIntent(context(), coordinate)).toBeNull();
    }
  });

  it("filters invalid standalone fit points and rejects paths with invalid points", () => {
    const validPoint = { ...place };
    const validPath = [{ ...place }, { ...secondPlace }];
    const geometry: FitCameraGeometry = {
      points: [validPoint, { lat: Number.NaN, lng: 0 }, { lat: 0, lng: 181 }],
      paths: [
        validPath,
        [{ ...place }],
        [{ ...place }, { lat: 91, lng: 0 }],
      ],
    };

    const result = resolveFitCameraIntent(context(), geometry);

    expect(result).not.toBeNull();
    expect(result?.points).toEqual([place]);
    expect(result?.paths).toEqual([[place, secondPlace]]);
    expect(result?.maximumZoom).toBe(15);
    expect(result?.points).not.toBe(geometry.points);
    expect(result?.paths).not.toBe(geometry.paths);
    expect(result?.paths[0]).not.toBe(validPath);
    expect(result?.points[0]).not.toBe(validPoint);
    expect(resolveFitCameraIntent(context(), {
      points: [{ lat: Number.NaN, lng: 0 }],
      paths: [[{ ...place }, { lat: 91, lng: 0 }]],
    })).toBeNull();
  });

  it("resolves focus zoom from finite snapshots with inclusive policy bounds", () => {
    const cases: readonly [CameraSnapshot | null, number][] = [
      [null, 15],
      [{ zoom: 12 }, 15],
      [{ zoom: 16.5 }, 16.5],
      [{ zoom: 21 }, 18],
      [{ zoom: Number.NaN }, 15],
      [{ zoom: 14.999 }, 15],
      [{ zoom: 15 }, 15],
      [{ zoom: 18 }, 18],
      [{ zoom: 18.001 }, 18],
    ];

    for (const [snapshot, expectedZoom] of cases) {
      expect(resolveFocusCameraIntent(context(), place, snapshot)?.targetZoom).toBe(expectedZoom);
    }
    expect(resolveRecenterUserCameraIntent(context(), place)?.targetZoom).toBe(16);
  });

  it("clones fit and focus coordinates so later output mutation cannot alter inputs", () => {
    const points = [place];
    const path = [{ ...place }, { ...secondPlace }];
    const geometry = { points, paths: [path] };
    const fit = resolveFitCameraIntent(context(), geometry);
    const focus = resolveFocusCameraIntent(context(), place, null);

    expect(fit).not.toBeNull();
    expect(focus).not.toBeNull();
    fit!.points[0].lat = 1;
    fit!.paths[0][0].lng = 1;
    focus!.coordinate.lat = 1;
    expect(points[0]).toEqual(place);
    expect(path[0]).toEqual(place);
    expect(place).toEqual({ lat: 12.3456, lng: -45.6789 });
  });

  it("reframes every intent with new layout fields and an immediate stable-ID transition", () => {
    const originalLayout = layout(0);
    const nextLayout = layout(7);
    const intents: CameraIntent[] = [
      resolveFitCameraIntent(context({ layout: originalLayout }), {
        points: [place],
        paths: [[place, secondPlace]],
      })!,
      resolveFocusCameraIntent(context({ layout: originalLayout }), place, { zoom: 16.5 })!,
      resolveRecenterUserCameraIntent(context({ layout: originalLayout }), secondPlace)!,
    ];

    for (const original of intents) {
      const originalCopy = structuredClone(original);
      const reframed = reframeCameraIntent(original, nextLayout);
      expect(reframed.kind).toBe(original.kind);
      expect(reframed.intentId).toBe(original.intentId);
      expect(reframed.transition).toBe("immediate");
      expect(reframed.viewport).toEqual(nextLayout.viewport);
      expect(reframed.usableRegion).toEqual(nextLayout.usableRegion);
      expect(reframed.edgeInsets).toEqual(nextLayout.edgeInsets);
      if (reframed.kind === "fit" && original.kind === "fit") {
        expect(reframed.points).toEqual(original.points);
        expect(reframed.paths).toEqual(original.paths);
        expect(reframed.maximumZoom).toBe(original.maximumZoom);
      } else if (reframed.kind !== "fit" && original.kind !== "fit") {
        expect(reframed.coordinate).toEqual(original.coordinate);
        expect(reframed.targetZoom).toBe(original.targetZoom);
      }
      expect(original).toEqual(originalCopy);
    }
    expect(originalLayout).toEqual(layout(0));
    expect(nextLayout).toEqual(layout(7));
  });
});
