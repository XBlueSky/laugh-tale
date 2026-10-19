import { expect, it } from "vitest";
import type { CameraIntent } from "@laugh-tale-island/core";
import { projectMapLibreCamera } from "../src/maplibre/camera.js";
const fit = (lngs: number[]): CameraIntent => ({ kind: "fit", intentId: "fit", transition: "immediate", maximumZoom: 16,
  points: lngs.map(lng => ({ lat: 0, lng })), paths: [], viewport: { width: 400, height: 400 },
  usableRegion: { x: 0, y: 0, width: 400, height: 400 }, edgeInsets: { top: 0, right: 0, bottom: 0, left: 0 } });
it("fits the short dateline interval in 512px world units", () => {
  const camera = projectMapLibreCamera(fit([179, -179]), 0)!;
  expect(Math.abs(camera.center[0])).toBeCloseTo(180);
  expect(camera.center[1]).toBeCloseTo(0);
  expect(camera.zoom).toBeCloseTo(7.135709286);
  expect(projectMapLibreCamera(fit([-179, 179]), 0)).toEqual(camera);
});
it("deduplicates the wrap seam and caps single-point zoom", () => {
  expect(projectMapLibreCamera(fit([180, -180]), 0)?.zoom).toBe(16);
  expect(projectMapLibreCamera(fit([11, 11]), 0)?.center).toEqual([11, 0]);
});
it("leaves empty and nonfinite geometry alone", () => {
  expect(projectMapLibreCamera(fit([]), 0)).toBeNull();
  expect(projectMapLibreCamera(fit([NaN, Infinity]), 0)).toBeNull();
});
it("fits path-only geometry and adjusts for legal chrome and asymmetric layout", () => {
  const intent = fit([]);
  if (intent.kind !== "fit") throw new Error("fixture");
  intent.paths = [[{ lat: 0, lng: 10 }, { lat: 0, lng: 12 }]];
  expect(projectMapLibreCamera(intent, 0)?.center[0]).toBeCloseTo(11);
  intent.usableRegion = { x: 0, y: 20, width: 320, height: 280 };
  const camera = projectMapLibreCamera(intent, 32)!;
  expect(camera.center[0]).toBeCloseTo(11.25);
  expect(camera.center[1]).toBeLessThan(0);
  expect(projectMapLibreCamera(intent, 300)).toBeNull();
});
it.each(["focus", "recenter-user"] as const)("projects %s without changing requested zoom", kind => {
  const intent: CameraIntent = { ...fit([]), kind, coordinate: { lat: 90, lng: 12 }, targetZoom: 12 };
  const camera = projectMapLibreCamera(intent, 0)!;
  expect(camera.zoom).toBe(12);
  expect(camera.center[1]).toBeCloseTo(85.051129);
});
