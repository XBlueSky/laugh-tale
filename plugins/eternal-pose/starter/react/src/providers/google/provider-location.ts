import type { Coordinates } from "../../trip-core/model";

function finiteCoordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

export function normalizeProviderLocation(value: unknown): Coordinates | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const location = value as Record<string, unknown>;
  const lat = location.lat ?? location.latitude;
  const lng = location.lng ?? location.longitude;
  return finiteCoordinate(lat, -90, 90) &&
    finiteCoordinate(lng, -180, 180)
    ? { lat, lng }
    : undefined;
}
