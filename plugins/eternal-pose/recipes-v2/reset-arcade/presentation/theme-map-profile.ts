import type { CandidateOption } from "@laugh-tale-island/core";

import type { MapVisualProfile } from "../controllers/presentation-contract";

function missionLetter(index: number): string {
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
  return `M${sequenceNumber}.${missionLetter(index)} · ${option.title}`;
}

export const resetArcadeMapProfile = {
  id: "reset-arcade",
  basemap: {
    mode: "flat",
    density: "low",
    contrast: "high",
    poi: "minimal",
  },
  candidateTitle,
  marker: (place, index) => {
    const number = String(index + 1).padStart(2, "0");
    const tone = place.tone;
    return {
      title: place.label,
      className: `arcade-marker arcade-marker--${tone}`,
      label: `${number} ${place.label}`,
      parts: [
        { className: "mission-number", text: number },
        { className: "arcade-marker__tone", text: tone === "candidate" ? "?" : "" },
        ...(tone === "completed"
          ? [{ className: "arcade-marker__completion", text: "✓" }]
          : []),
      ],
      fallback:
        tone === "selected"
          ? {
              fill: "#d64b28",
              stroke: "#171918",
              labelColor: "#ffffff",
              text: `S${number}`,
              size: 52,
              shape: "square",
              strokeWidth: 4,
            }
          : tone === "completed"
            ? {
                fill: "#e4e9dd",
                stroke: "#2d5542",
                labelColor: "#18201b",
                text: `✓${number}`,
                size: 48,
                shape: "diamond",
                strokeWidth: 4,
              }
            : tone === "skipped"
              ? {
                  fill: "#b9beb9",
                  stroke: "#3d4540",
                  labelColor: "#171918",
                  text: `×${number}`,
                  size: 48,
                  shape: "circle",
                  strokeWidth: 4,
                }
              : tone === "candidate"
                ? {
                    fill: "#f5f5f2",
                    stroke: "#171918",
                    labelColor: "#171918",
                    text: `?${number}`,
                    size: 48,
                    shape: "square",
                    strokeWidth: 3,
                  }
                : {
                    fill: "#f5f5f2",
                    stroke: "#171918",
                    labelColor: "#171918",
                    text: number,
                    size: 48,
                    shape: "circle",
                    strokeWidth: 3,
                  },
    };
  },
  userLocation: () => ({
    title: "Current location",
    className: "arcade-marker arcade-marker--location",
    label: "Current location",
    parts: [
      { className: "arcade-marker__crosshair", text: "+" },
      { className: "arcade-marker__tone", text: "YOU" },
    ],
    fallback: {
      fill: "#2d5542",
      stroke: "#ffffff",
      labelColor: "#ffffff",
      text: "+",
      size: 48,
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
        ? { width: 3, casingWidth: 7, dash: [3, 5] }
        : route.mode === "transit"
          ? { width: 5, casingWidth: 9, dash: [12, 4] }
          : route.mode === "flight"
            ? { width: 4, casingWidth: 8, dash: [16, 6, 2, 6] }
            : { width: 4, casingWidth: 8, dash: undefined };
    const dash = uncertain || unavailable ? [7, 5] : modeTreatment.dash;
    return {
      stroke: selected ? "#d64b28" : unavailable ? "#69716b" : "#202321",
      opacity: unavailable ? 0.72 : 1,
      width: selected ? 6 : unavailable ? 3 : modeTreatment.width,
      casing: {
        stroke: "#f5f5f2",
        opacity: 0.95,
        width: selected ? 11 : unavailable ? 7 : modeTreatment.casingWidth,
      },
      ...(dash === undefined ? {} : { dash }),
    };
  },
} satisfies MapVisualProfile;
