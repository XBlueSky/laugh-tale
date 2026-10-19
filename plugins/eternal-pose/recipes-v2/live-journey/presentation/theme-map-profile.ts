import type { CandidateOption } from "@laugh-tale-island/core";

import type { MapVisualProfile } from "../controllers/presentation-contract";

function sequenceLabel(index: number): string {
  return String(index + 1).padStart(2, "0");
}

function candidateTitle(sequenceNumber: number, index: number, option: CandidateOption): string {
  return `${sequenceNumber}.${String.fromCharCode(65 + (index % 26))} / ${option.title}`;
}

export const liveJourneyMapProfile = {
  id: "live-journey",
  basemap: {
    mode: "neutral",
    density: "medium",
    contrast: "high",
    poi: "standard",
  },
  candidateTitle,
  marker: (place, index) => {
    const number = sequenceLabel(index);
    const tone = place.tone;
    const current = tone === "selected";
    return {
      title: place.label,
      className: `live-marker live-marker--${tone}`,
      label: `${current ? "NOW" : number} ${place.label}`,
      parts: [
        { className: "live-marker__index", text: number },
        { className: "live-marker__status", text: current ? "NOW" : tone === "completed" ? "DONE" : tone === "candidate" ? "OPTION" : "NEXT" },
      ],
      fallback:
        current
          ? {
              fill: "#2f6774",
              stroke: "#14262b",
              labelColor: "#ffffff",
              text: "NOW",
              size: 56,
              shape: "square",
              strokeWidth: 4,
            }
          : tone === "completed"
            ? {
                fill: "#d4e0e0",
                stroke: "#50686d",
                labelColor: "#1e2b2e",
                text: `D${number}`,
                size: 48,
                shape: "diamond",
                strokeWidth: 3,
              }
            : tone === "candidate"
              ? {
                  fill: "#f7f9f9",
                  stroke: "#40565c",
                  labelColor: "#203237",
                  text: `?${number}`,
                  size: 48,
                  shape: "square",
                  strokeWidth: 3,
                }
              : {
                  fill: "#f7f9f9",
                  stroke: "#40565c",
                  labelColor: "#203237",
                  text: number,
                  size: 48,
                  shape: "circle",
                  strokeWidth: 3,
                },
    };
  },
  userLocation: () => ({
    title: "Current location",
    className: "live-marker live-marker--location",
    label: "Current location",
    parts: [
      { className: "live-marker__crosshair", text: "+" },
      { className: "live-marker__status", text: "YOU" },
    ],
    fallback: {
      fill: "#2f6774",
      stroke: "#ffffff",
      labelColor: "#ffffff",
      text: "+",
      size: 48,
      shape: "circle",
      strokeWidth: 3,
    },
  }),
  route: (route) => {
    const uncertain = route.source === "recomposed" || route.certainty === "candidate" || route.certainty === "unverified";
    const selected = route.tone === "selected";
    const unavailable = route.tone === "unavailable";
    const mode = route.mode === "walking"
      ? { width: 3, casing: 7, dash: [2, 6] }
      : route.mode === "transit"
        ? { width: 5, casing: 10, dash: [10, 4] }
        : route.mode === "flight"
          ? { width: 4, casing: 8, dash: [14, 5, 2, 5] }
          : { width: 4, casing: 8, dash: undefined };
    return {
      stroke: selected ? "#2f6774" : unavailable ? "#829095" : "#27383d",
      opacity: unavailable ? 0.68 : 1,
      width: selected ? 7 : unavailable ? 3 : mode.width,
      casing: {
        stroke: "#f7f9f9",
        opacity: 0.96,
        width: selected ? 12 : unavailable ? 7 : mode.casing,
      },
      ...((uncertain || unavailable) ? { dash: [7, 5] } : mode.dash === undefined ? {} : { dash: mode.dash }),
    };
  },
} satisfies MapVisualProfile;
