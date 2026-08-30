import type { CandidateOption } from "@laugh-tale-island/core";

import type { MapVisualProfile } from "../controllers/presentation-contract";

function indexLabel(index: number): string {
  return String(index + 1).padStart(2, "0");
}

function candidateTitle(sequenceNumber: number, index: number, option: CandidateOption): string {
  return `CH-${sequenceNumber}.${String.fromCharCode(65 + (index % 26))} · ${option.title}`;
}

export const pocketInstrumentMapProfile = {
  id: "pocket-instrument",
  basemap: {
    mode: "technical",
    density: "low",
    contrast: "high",
    poi: "minimal",
  },
  candidateTitle,
  marker: (place, index) => {
    const number = indexLabel(index);
    const tone = place.tone;
    const selected = tone === "selected";
    return {
      title: place.label,
      className: `instrument-marker instrument-marker--${tone}`,
      label: `${number} ${place.label}`,
      parts: [
        { className: "instrument-index", text: number },
        { className: "status-lamp", text: selected ? "ACTIVE" : tone === "completed" ? "DONE" : tone === "candidate" ? "OPTION" : "READY" },
      ],
      fallback: selected
        ? { fill: "#1b7f6a", stroke: "#172421", labelColor: "#ffffff", text: number, size: 54, shape: "square", strokeWidth: 4 }
        : tone === "completed"
          ? { fill: "#d4ddda", stroke: "#536660", labelColor: "#172421", text: `D${number}`, size: 48, shape: "diamond", strokeWidth: 3 }
          : tone === "candidate"
            ? { fill: "#f7f9f8", stroke: "#41534e", labelColor: "#172421", text: `?${number}`, size: 48, shape: "square", strokeWidth: 3 }
            : tone === "skipped"
              ? { fill: "#bbc5c1", stroke: "#52635e", labelColor: "#172421", text: `X${number}`, size: 48, shape: "circle", strokeWidth: 3 }
              : { fill: "#f7f9f8", stroke: "#41534e", labelColor: "#172421", text: number, size: 48, shape: "circle", strokeWidth: 3 },
    };
  },
  userLocation: () => ({
    title: "Current location",
    className: "instrument-marker instrument-marker--location",
    label: "Current location",
    parts: [
      { className: "instrument-crosshair", text: "+" },
      { className: "status-lamp", text: "YOU" },
    ],
    fallback: { fill: "#1b7f6a", stroke: "#ffffff", labelColor: "#ffffff", text: "+", size: 48, shape: "circle", strokeWidth: 3 },
  }),
  route: (route) => {
    const uncertain = route.source === "recomposed" || route.certainty === "candidate" || route.certainty === "unverified";
    const selected = route.tone === "selected";
    const unavailable = route.tone === "unavailable";
    const mode = route.mode === "walking"
      ? { width: 3, casing: 7, dash: [2, 5] }
      : route.mode === "transit"
        ? { width: 5, casing: 10, dash: [9, 3] }
        : route.mode === "flight"
          ? { width: 4, casing: 8, dash: [15, 5, 2, 5] }
          : { width: 4, casing: 8, dash: undefined };
    return {
      stroke: selected ? "#1b7f6a" : unavailable ? "#7d8b86" : "#26332f",
      opacity: unavailable ? 0.68 : 1,
      width: selected ? 7 : unavailable ? 3 : mode.width,
      casing: { stroke: "#f7f9f8", opacity: 0.96, width: selected ? 12 : unavailable ? 7 : mode.casing },
      ...((uncertain || unavailable) ? { dash: [7, 5] } : mode.dash === undefined ? {} : { dash: mode.dash }),
    };
  },
} satisfies MapVisualProfile;
