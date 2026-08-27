import type { CandidateOption } from "@laugh-tale-island/core";

import type { MapVisualProfile } from "../controllers/presentation-contract";

function optionKey(index: number): string {
  let value = index + 1;
  let output = "";
  while (value > 0) {
    value -= 1;
    output = String.fromCharCode(65 + (value % 26)) + output;
    value = Math.floor(value / 26);
  }
  return output;
}

function candidateTitle(
  sequenceNumber: number,
  index: number,
  option: CandidateOption,
): string {
  return `${sequenceNumber}${optionKey(index)} · ${option.title}`;
}

export const fieldAtlasMapProfile = {
  id: "field-atlas",
  basemap: {
    mode: "topographic",
    density: "high",
    contrast: "high",
    poi: "minimal",
  },
  candidateTitle,
  marker: (place, index) => {
    const number = String(index + 1).padStart(2, "0");
    const tone = place.tone;
    return {
      title: place.label,
      className: `atlas-marker atlas-marker--${tone}`,
      label: place.label,
      parts: [
        { className: "stop-number", text: number },
        { className: "atlas-marker__key", text: tone === "candidate" ? "C" : "" },
        ...(tone === "completed"
          ? [{ className: "atlas-marker__completion", text: "✓" }]
          : []),
      ],
      fallback:
        tone === "selected"
          ? { fill: "#2457c5", stroke: "#17212b", text: number }
          : tone === "completed"
            ? { fill: "#e5ebef", stroke: "#2457c5", text: number }
            : tone === "skipped"
              ? { fill: "#c2ccd3", stroke: "#3f4e59", text: number }
              : { fill: "#f4f7f9", stroke: "#263541", text: number },
    };
  },
  userLocation: () => ({
    title: "Current location",
    className: "atlas-marker atlas-marker--location",
    label: "Current location",
    parts: [
      { className: "atlas-marker__crosshair", text: "+" },
      { className: "atlas-marker__key", text: "LOC" },
    ],
    fallback: { fill: "#2457c5", stroke: "#f4f7f9", text: "+" },
  }),
  route: (route) => {
    const uncertain =
      route.source === "recomposed" ||
      route.certainty === "candidate" ||
      route.certainty === "unverified";
    const selected = route.tone === "selected";
    const unavailable = route.tone === "unavailable";
    return {
      stroke: selected ? "#2457c5" : unavailable ? "#596a76" : "#263541",
      opacity: unavailable ? 0.76 : 1,
      width: selected ? 6 : unavailable ? 3 : 4,
      casing: {
        stroke: "#eef2f4",
        opacity: 0.92,
        width: selected ? 10 : 8,
      },
      ...(uncertain || unavailable ? { dash: [8, 5] } : {}),
    };
  },
} satisfies MapVisualProfile;
