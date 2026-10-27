/** Google-only operator declaration; equality does not verify cloud style bytes. */
export interface GoogleMapStyleConfiguration {
  mapId?: string;
  cloudStyleProfileId?: string;
}

export function normalizeGoogleMapStyle(input: unknown): GoogleMapStyleConfiguration | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  try {
    const raw = input as Record<string, unknown>;
    const values = ["mapId", "cloudStyleProfileId"].map((key) => {
      const value = Object.hasOwn(raw, key) ? raw[key] : undefined;
      if (value !== undefined && typeof value !== "string") throw new TypeError("Invalid map style declaration");
      return typeof value === "string" ? value.trim() : "";
    });
    const [mapId, cloudStyleProfileId] = values;
    if (Boolean(mapId) !== Boolean(cloudStyleProfileId)) return undefined;
    return mapId ? { mapId, cloudStyleProfileId } : {};
  } catch {
    return undefined;
  }
}
