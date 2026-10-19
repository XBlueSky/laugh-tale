import type { CameraIntent, Coordinates } from "@laugh-tale-island/core";
const wrap = (lng: number) => ((lng + 180) % 360 + 360) % 360 - 180;
const projectY = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + Math.max(-85.051129, Math.min(85.051129, lat)) * Math.PI / 360)) / Math.PI) / 2;
export function projectMapLibreCamera(intent: CameraIntent, legalHeight: number): { center: [number, number]; zoom: number } | null {
  const region = intent.usableRegion;
  const height = region.height - (legalHeight > 0 ? legalHeight + 8 : 0);
  if (![region.width, height, region.x, region.y, intent.viewport.width, intent.viewport.height].every(Number.isFinite) || region.width <= 0 || height <= 0) return null;
  const points: readonly Coordinates[] = intent.kind === "fit" ? [...intent.points, ...intent.paths.flat()] : [intent.coordinate];
  const valid = points.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (!valid.length) return null;
  const xs = [...new Set(valid.map(point => (wrap(point.lng) + 180) / 360))].sort((a, b) => a - b);
  let gap = -1, start = xs[0];
  for (let i = 0; i < xs.length; i++) {
    const next = i + 1 < xs.length ? xs[i + 1] : xs[0] + 1;
    if (next - xs[i] > gap) { gap = next - xs[i]; start = next % 1; }
  }
  const dx = 1 - gap;
  const ys = valid.map(point => projectY(point.lat));
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const dy = maxY - minY;
  let zoom = intent.kind === "fit" ? Math.min(intent.maximumZoom, dx > 1e-12 ? Math.log2(region.width / (512 * dx)) : Infinity, dy > 1e-12 ? Math.log2(height / (512 * dy)) : Infinity) : intent.targetZoom;
  if (!Number.isFinite(zoom)) return null;
  zoom = Math.max(0, Math.min(22, zoom));
  const scale = 512 * 2 ** zoom;
  const x = start + dx / 2 + (intent.viewport.width / 2 - region.x - region.width / 2) / scale;
  const y = (minY + maxY) / 2 + (intent.viewport.height / 2 - region.y - height / 2) / scale;
  return { center: [wrap(x * 360 - 180), Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI], zoom };
}
