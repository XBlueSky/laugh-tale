import { expect, it } from "vitest";
import { createShortbreadStyle } from "../src/maplibre/style.js";
import { profile } from "./helpers/maplibre-profile.js";
const source = { tiles: ["https://tiles.example/{z}/{x}/{y}.mvt"], minzoom: 0, maxzoom: 14 };
it("projects recipe palette into geographical layers with local glyphs", () => {
  const style = createShortbreadStyle(profile, source);
  expect(style).not.toHaveProperty("glyphs");
  expect(style).not.toHaveProperty("sprite");
  expect(style.layers.find(layer => layer.id === "water")?.paint).toMatchObject({ "fill-color": "#D9E2DF" });
  expect(style.layers.find(layer => layer.id === "roads")?.paint).toMatchObject({ "line-color": "#FAF7F1" });
  expect(style.layers.find(layer => layer.id === "stations")?.paint).toMatchObject({ "text-color": "#5E574F", "text-halo-color": "#F8F4ED" });
});
it("honors hidden stations without adding incidental POI labels", () => {
  const style = createShortbreadStyle({ ...profile, basemap: { ...profile.basemap, stationLabels: "hidden" } }, source);
  expect(style.layers.some(layer => layer.id === "stations")).toBe(false);
  expect(style.layers.some(layer => "source-layer" in layer && layer["source-layer"] === "pois")).toBe(false);
});
