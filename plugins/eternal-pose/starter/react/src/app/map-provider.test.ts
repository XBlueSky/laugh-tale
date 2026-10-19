import { expect, it } from "vitest";
import { completeTrip } from "../trip-content/fixtures/complete-trip";
import { hasUnsupportedMapGeometry, readMapLibreOptions, readMapProvider } from "./map-provider";
it.each([[undefined, "google"], ["", "google"], ["  ", "google"], ["google", "google"], ["maplibre", "maplibre"], ["other", "invalid"]])("selects provider %s explicitly", (value, expected) => { expect(readMapProvider(value)).toBe(expected); });
it("keeps world defaults and requires a complete finite explicit overview", () => {
  expect(readMapLibreOptions({}, false)).not.toHaveProperty("initialView");
  expect(() => readMapLibreOptions({ VITE_MAPLIBRE_INITIAL_LAT: "35" }, false)).toThrow();
  expect(() => readMapLibreOptions({ VITE_MAPLIBRE_INITIAL_LAT: "bad", VITE_MAPLIBRE_INITIAL_LNG: "139", VITE_MAPLIBRE_INITIAL_ZOOM: "11" }, false)).toThrow();
  expect(readMapLibreOptions({ VITE_MAPLIBRE_INITIAL_LAT: "35.6812", VITE_MAPLIBRE_INITIAL_LNG: "139.7671", VITE_MAPLIBRE_INITIAL_ZOOM: "11" }, false)).toMatchObject({ initialView: { center: { lat: 35.6812, lng: 139.7671 }, zoom: 11 } });
  expect(readMapLibreOptions({}, false).allowLocalhostHTTP).toBe(false);
});
it("refuses provider routes without rewriting input", () => {
  const before = JSON.stringify(completeTrip); expect(hasUnsupportedMapGeometry(completeTrip)).toBe(true); expect(JSON.stringify(completeTrip)).toBe(before);
});
it("checks candidate coordinates, not only the currently selected node", () => {
  const trip = structuredClone(completeTrip); trip.routes = [];
  expect(hasUnsupportedMapGeometry(trip)).toBe(false);
  const place = { name: "Synthetic station", certainty: "confirmed" as const, identity: { status: "resolved" as const, coordinates: { lat: 1, lng: 2 }, providerReference: { provider: "google", id: "synthetic" } } };
  trip.candidateGroups = [{ id: "group", parentNodeId: "node", mode: "single", options: [{ id: "candidate", title: "Synthetic", place }] }];
  expect(hasUnsupportedMapGeometry(trip)).toBe(true);
});
it("accepts unresolved places and authored coordinates", () => {
  const trip = structuredClone(completeTrip); trip.routes = [];
  trip.days[0].nodes[0].place = { name: "Unreviewed", certainty: "unverified", identity: { status: "unresolved", reason: "not-reviewed" } };
  expect(hasUnsupportedMapGeometry(trip)).toBe(false);
});
