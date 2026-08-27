import type { MapVisualProfile } from "../controllers/presentation-contract";
import { candidateOptionLabel } from "./decisions/CandidateDecision";

export const themeMapProfile: MapVisualProfile = {
  id: "transitional-v1-neutral",
  basemap: {
    mode: "neutral",
    density: "medium",
    contrast: "standard",
    poi: "standard",
  },
  candidateTitle: candidateOptionLabel,
  marker: (place, index) => ({
    title: place.label,
    className: "map-marker",
    label: place.label,
    parts: [{ className: "map-marker__label", text: place.label }],
    fallback: {
      fill: place.tone === "selected" ? "#1f2937" : "#ffffff",
      stroke: "#1f2937",
      text: String(index + 1),
    },
  }),
  userLocation: () => ({
    title: "Current location",
    className: "map-marker map-marker--location",
    label: "Current location",
    parts: [{ className: "map-marker__location-dot", text: "" }],
    fallback: { fill: "#2563eb", stroke: "#ffffff", text: "" },
  }),
  route: (route) => ({
    stroke: route.tone === "selected" ? "#1f2937" : "#64748b",
    opacity: route.tone === "unavailable" ? 0.45 : 0.9,
    width: route.tone === "selected" ? 5 : 3,
  }),
};
