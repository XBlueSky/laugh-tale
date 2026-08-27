import type { Timing } from "../trip-core/model";

export function formatTimingLabel(timing: Timing): string {
  if (timing.certainty === "unknown" || timing.start === undefined) {
    return "時間未定";
  }

  return timing.certainty === "suggested" ? `約 ${timing.start}` : timing.start;
}
