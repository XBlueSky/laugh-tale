import type { Coordinates } from "@laugh-tale-island/core";
import type { CameraIntent } from "@laugh-tale-island/core/browser";
import type { GoogleMapsProjection, GoogleMapsRuntime } from "./google-config.js";

/** Translate a core-selected target/insets into Google's north-up world projection. */
export function projectImmediateCamera(
  runtime: GoogleMapsRuntime,
  projection: GoogleMapsProjection,
  intent: CameraIntent,
): { center: Coordinates; zoom: number; heading: 0; tilt: 0 } | undefined {
  const { top, right, bottom, left } = intent.edgeInsets;
  if (![top, right, bottom, left].every((value) => Number.isFinite(value) && value >= 0)) return undefined;
  const width = intent.viewport.width - left - right;
  const height = intent.viewport.height - top - bottom;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  const coordinates = intent.kind === "fit" ? [...intent.points, ...intent.paths.flat()] : [intent.coordinate];
  if (coordinates.length === 0) return undefined;
  let west = Infinity; let east = -Infinity; let north = Infinity; let south = -Infinity;
  const worldWidth = 256;
  const wrap = (x: number) => ((x % worldWidth) + worldWidth) % worldWidth;
  const xs: number[] = [];
  for (const coordinate of coordinates) {
    if (!coordinate || !Number.isFinite(coordinate.lat) || !Number.isFinite(coordinate.lng) ||
      coordinate.lat < -90 || coordinate.lat > 90 || coordinate.lng < -180 || coordinate.lng > 180) return undefined;
    const point = projection.fromLatLngToPoint({ lat: coordinate.lat, lng: coordinate.lng });
    if (point === null || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
    xs.push(wrap(point.x));
    north = Math.min(north, point.y); south = Math.max(south, point.y);
  }
  // The complement of the largest empty arc is the smallest containing interval.
  // Google world coordinates repeat every 256 pixels at zoom zero.
  xs.sort((a, b) => a - b);
  let largestGap = -1;
  for (let index = 0; index < xs.length; index += 1) {
    const next = index + 1 < xs.length ? xs[index + 1] : xs[0] + worldWidth;
    const gap = next - xs[index];
    if (gap > largestGap) {
      largestGap = gap;
      west = next;
      east = xs[index] + worldWidth;
    }
  }
  let zoom = intent.kind === "fit" ? intent.maximumZoom : intent.targetZoom;
  if (!Number.isFinite(zoom)) return undefined;
  if (intent.kind === "fit") {
    // Google world pixels scale by 2^zoom. Integer zoom fits raster and vector maps.
    const horizontal = east > west ? Math.log2(width / (east - west)) : Infinity;
    const vertical = south > north ? Math.log2(height / (south - north)) : Infinity;
    zoom = Math.min(zoom, Math.floor(Math.min(horizontal, vertical)));
  }
  const scale = 2 ** zoom;
  if (!Number.isFinite(scale) || scale <= 0) return undefined;
  const point = new runtime.Point(
    wrap((west + east) / 2 + (right - left) / (2 * scale)),
    (north + south) / 2 + (bottom - top) / (2 * scale),
  );
  const coordinate = projection.fromPointToLatLng(point);
  if (coordinate === null) return undefined;
  const center = { lat: coordinate.lat(), lng: coordinate.lng() };
  if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return undefined;
  return { center, zoom, heading: 0, tilt: 0 };
}
