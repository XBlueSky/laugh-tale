import type { MapVisualProfile } from "@laugh-tale-island/core/browser";
export const profile: MapVisualProfile = {
  id: "synthetic-oak", basemap: { mode: "neutral", density: "low", contrast: "soft", poi: "minimal", stationLabels: "legible",
    palette: { geometry: "#EEE8DE", label: "#5E574F", labelStroke: "#F8F4ED", water: "#D9E2DF", park: "#E3E6D8", road: "#FAF7F1" } },
  routeStyle: () => null,
};
