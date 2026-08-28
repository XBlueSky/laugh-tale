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
          ? {
              fill: "#2457c5",
              stroke: "#17212b",
              labelColor: "#f4f7f9",
              text: `S${number}`,
              size: 48,
              shape: "square",
              strokeWidth: 5,
            }
          : tone === "completed"
            ? {
                fill: "#e5ebef",
                stroke: "#2457c5",
                labelColor: "#17212b",
                text: `✓${number}`,
                size: 44,
                shape: "diamond",
                strokeWidth: 5,
              }
            : tone === "skipped"
              ? {
                  fill: "#c2ccd3",
                  stroke: "#3f4e59",
                  labelColor: "#17212b",
                  text: `×${number}`,
                  size: 44,
                  shape: "circle",
                  strokeWidth: 5,
                }
              : tone === "candidate"
                ? {
                    fill: "#f4f7f9",
                    stroke: "#263541",
                    labelColor: "#17212b",
                    text: `C${number}`,
                    size: 44,
                    shape: "square",
                    strokeWidth: 3,
                  }
                : {
                    fill: "#f4f7f9",
                    stroke: "#263541",
                    labelColor: "#17212b",
                    text: number,
                    size: 44,
                    shape: "circle",
                    strokeWidth: 3,
                  },
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
    fallback: {
      fill: "#2457c5",
      stroke: "#f4f7f9",
      labelColor: "#f4f7f9",
      text: "+",
      size: 44,
      shape: "circle",
      strokeWidth: 3,
    },
  }),
  route: (route) => {
    const uncertain =
      route.source === "recomposed" ||
      route.certainty === "candidate" ||
      route.certainty === "unverified";
    const selected = route.tone === "selected";
    const unavailable = route.tone === "unavailable";
    const modeTreatment =
      route.mode === "walking"
        ? { width: 3.5, casingWidth: 7.5, dash: [3, 4] }
        : route.mode === "transit"
          ? { width: 4.5, casingWidth: 9, dash: [11, 4] }
          : route.mode === "flight"
            ? { width: 4, casingWidth: 8, dash: [14, 6, 2, 6] }
            : { width: 4, casingWidth: 8, dash: undefined };
    const dash = uncertain || unavailable ? [8, 5] : modeTreatment.dash;
    return {
      stroke: selected ? "#2457c5" : unavailable ? "#596a76" : "#263541",
      opacity: unavailable ? 0.76 : 1,
      width: selected ? 6 : unavailable ? 3 : modeTreatment.width,
      casing: {
        stroke: "#eef2f4",
        opacity: 0.92,
        width: selected ? 10 : unavailable ? 7 : modeTreatment.casingWidth,
      },
      ...(dash === undefined ? {} : { dash }),
    };
  },
} satisfies MapVisualProfile;
