import type { Trip } from "@laugh-tale-island/core";
import type { MapLibreMapAdapterOptions } from "@laugh-tale-island/adapters/maplibre";
export class MapProviderConfigurationError extends Error {}
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export function readMapProvider(value: unknown): "google" | "maplibre" | "invalid" {
  const selector = text(value);
  return selector === "" || selector === "google" ? "google" : selector === "maplibre" ? "maplibre" : "invalid";
}
export function hasUnsupportedMapGeometry(trip: Trip): boolean {
  const places = [...trip.days.flatMap(day => day.nodes.map(node => node.place)), ...trip.candidateGroups.flatMap(group => group.options.map(option => option.place))];
  return trip.routes.some(edge => edge.source === "provider") || places.some(place => {
    const identity = place?.identity;
    return identity?.status === "resolved" && identity.coordinates !== undefined && identity.providerReference !== undefined;
  });
}
export function readMapLibreOptions(env: Record<string, unknown>, development: boolean): MapLibreMapAdapterOptions {
  const tileJSONUrl = text(env.VITE_MAPLIBRE_TILEJSON_URL);
  const values = [env.VITE_MAPLIBRE_INITIAL_LAT, env.VITE_MAPLIBRE_INITIAL_LNG, env.VITE_MAPLIBRE_INITIAL_ZOOM].map(text);
  const options: MapLibreMapAdapterOptions = { allowLocalhostHTTP: development, ...(tileJSONUrl ? { tileJSONUrl } : {}) };
  if (values.some(value => value !== "")) {
    const [lat, lng, zoom] = values.map(Number);
    if (values.some(value => value === "") || ![lat, lng, zoom].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || zoom < 0 || zoom > 22) throw new MapProviderConfigurationError("Invalid map overview configuration");
    options.initialView = { center: { lat, lng }, zoom };
  }
  return options;
}
