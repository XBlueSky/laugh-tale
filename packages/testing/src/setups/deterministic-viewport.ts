import type { MapViewportMetrics, OcclusionRect } from "@laugh-tale-island/core/browser";

export interface DeterministicViewportSetup {
  viewport: MapViewportMetrics;
  occlusions: readonly OcclusionRect[];
}

function positiveFinite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be finite and positive`);
  return value;
}

function finite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

function clippedRectangle(value: OcclusionRect, viewport: MapViewportMetrics): OcclusionRect {
  if (typeof value !== "object" || value === null) throw new TypeError("occlusion must be a rectangle");
  const x = finite(value.x, "occlusion.x");
  const y = finite(value.y, "occlusion.y");
  const width = positiveFinite(value.width, "occlusion.width");
  const height = positiveFinite(value.height, "occlusion.height");
  const left = Math.max(0, Math.min(viewport.width, x));
  const top = Math.max(0, Math.min(viewport.height, y));
  const right = Math.max(left, Math.min(viewport.width, x + width));
  const bottom = Math.max(top, Math.min(viewport.height, y + height));
  return Object.freeze({ x: left, y: top, width: right - left, height: bottom - top });
}

export function createDeterministicViewportSetup(input: {
  width?: number;
  height?: number;
  occlusions?: readonly OcclusionRect[];
} = {}): DeterministicViewportSetup {
  const viewport = Object.freeze({
    width: positiveFinite(input.width ?? 800, "width"),
    height: positiveFinite(input.height ?? 600, "height"),
  });
  if (input.occlusions !== undefined && !Array.isArray(input.occlusions)) throw new TypeError("occlusions must be an array");
  const values: readonly OcclusionRect[] = input.occlusions ?? [];
  const occlusions: OcclusionRect[] = [];
  for (let index = 0; index < values.length; index += 1) {
    if (!Object.hasOwn(values, index)) throw new TypeError("occlusions must not contain sparse entries");
    occlusions.push(clippedRectangle(values[index], viewport));
  }
  Object.freeze(occlusions);
  return Object.freeze({ viewport, occlusions });
}
