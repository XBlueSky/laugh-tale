import { expect, test } from "vitest";
import { projectImmediateCamera } from "../src/google/google-camera.js";
import type { GoogleMapsRuntime, GoogleMapsProjection } from "../src/google/google-config.js";

const runtime = { Point: class { constructor(public x: number, public y: number) {} } } as GoogleMapsRuntime;
const projection: GoogleMapsProjection = {
  fromLatLngToPoint: ({ lat, lng }) => ({ x: (lng + 180) * 256 / 360, y: 128 - lat }),
  fromPointToLatLng: ({ x, y }) => ({ lat: () => 128 - y, lng: () => x * 360 / 256 - 180 }),
};
const fit = (lngs: number[], edgeInsets = { top: 0, right: 0, bottom: 0, left: 0 }) => projectImmediateCamera(runtime, projection, {
  kind: "fit", points: lngs.map(lng => ({ lat: 0, lng })), paths: [], maximumZoom: 16,
  intentId: "fit-test", transition: "immediate",
  usableRegion: { x: edgeInsets.left, y: edgeInsets.top, width: 400 - edgeInsets.left - edgeInsets.right, height: 400 - edgeInsets.top - edgeInsets.bottom },
  viewport: { width: 400, height: 400 }, edgeInsets,
});

test("nearby dateline points use the short wrapped interval", () => {
  const camera = fit([179, -179])!;
  expect(Math.abs(camera.center.lng)).toBeCloseTo(180);
  expect(camera.zoom).toBe(8);
  expect(fit([-179, 179])).toEqual(camera);
});
test("ordinary bounds and duplicates retain their expected center and zoom", () => {
  expect(fit([10, 12, 10])).toMatchObject({ center: { lat: 0 }, zoom: 8 });
  expect(fit([10, 12, 10])?.center.lng).toBeCloseTo(11);
  expect(fit([180, -180])?.zoom).toBe(16);
});
test("wrapped bounds apply asymmetric insets at the chosen zoom", () => {
  const camera = fit([179, -179], { top: 20, right: 80, bottom: 60, left: 0 })!;
  expect(camera.zoom).toBe(7);
  expect(camera.center.lng).toBeCloseTo(-179.560546875);
  expect(camera.center.lat).toBeCloseTo(-0.15625);
});
