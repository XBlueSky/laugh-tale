import type { MapVisualProfile } from "@laugh-tale-island/core/browser";

export const oakWashiMapVisualProfile: MapVisualProfile = {
  id: "oak-washi",
  basemap: {
    mode: "subdued", density: "low", contrast: "soft", poi: "minimal", stationLabels: "legible",
    palette: { geometry: "#EEE8DE", label: "#5E574F", labelStroke: "#F8F4ED", water: "#D9E2DF", park: "#E3E6D8", road: "#FAF7F1" },
  },
  routeStyle({ mode, selected }) {
    switch (mode) {
      case "transit":
      case "driving":
        return { kind: "solid", stroke: { color: mode === "transit" ? "#6F8F8C" : "#57514C", width: selected ? 7 : 4, opacity: selected ? 1 : 0.42 } };
      case "walking":
        return { kind: "symbol", symbol: { shape: "circle", repeatPx: 12, scale: selected ? 3 : 2.2, fill: { color: "#B86F4B", opacity: selected ? 1 : 0.55 } } };
      case "flight":
        return { kind: "symbol", symbol: { shape: "dash", repeatPx: 14, scale: 1, stroke: { color: "#7F776F", width: selected ? 3 : 2, opacity: selected ? 0.9 : 0.5 } } };
      case "unknown": return null;
    }
  },
};
