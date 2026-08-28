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
  marker: (place, index) => {
    const number = String(index + 1);
    return {
      title: place.label,
      className: "map-marker",
      label: place.label,
      parts: [{ className: "map-marker__label", text: place.label }],
      fallback: {
        fill: place.tone === "selected" ? "#1f2937" : "#ffffff",
        stroke: "#1f2937",
        labelColor: place.tone === "selected" ? "#ffffff" : "#111827",
        text: place.tone === "completed" ? `✓${number}` : number,
        size: place.tone === "selected" ? 48 : 44,
        shape:
          place.tone === "selected"
            ? "square"
            : place.tone === "completed"
              ? "diamond"
              : "circle",
        strokeWidth: place.tone === "selected" ? 5 : 3,
      },
    };
  },
  userLocation: () => ({
    title: "Current location",
    className: "map-marker map-marker--location",
    label: "Current location",
    parts: [{ className: "map-marker__location-dot", text: "" }],
    fallback: {
      fill: "#2563eb",
      stroke: "#ffffff",
      labelColor: "#ffffff",
      text: "",
      size: 44,
      shape: "circle",
      strokeWidth: 3,
    },
  }),
  route: (route) => ({
    stroke: route.tone === "selected" ? "#1f2937" : "#64748b",
    opacity: route.tone === "unavailable" ? 0.45 : 0.9,
    width: route.tone === "selected" ? 5 : 3,
  }),
};
