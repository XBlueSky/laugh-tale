import type { Coordinates } from "@laugh-tale-island/core";

function valid(value: unknown, low: number, high: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
}

export function normalizeProviderLocation(value: unknown): Coordinates | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  try {
    if (Array.isArray(value)) return undefined;
    const record = value as Record<PropertyKey, unknown>;
    const neutral = Object.hasOwn(record, "lat") || Object.hasOwn(record, "lng");
    const google = Object.hasOwn(record, "latitude") || Object.hasOwn(record, "longitude");
    if (neutral === google) return undefined;
    const lat = neutral ? record.lat : record.latitude;
    const lng = neutral ? record.lng : record.longitude;
    return valid(lat, -90, 90) && valid(lng, -180, 180) ? { lat, lng } : undefined;
  } catch {
    return undefined;
  }
}
