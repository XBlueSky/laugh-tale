import { describe, expect, it } from "vitest";

import { formatTimingLabel } from "./timing-label";

describe("formatTimingLabel", () => {
  it("keeps fixed time exact, marks suggestions, and labels unknown time", () => {
    expect(formatTimingLabel({ start: "14:00", certainty: "fixed" })).toBe("14:00");
    expect(formatTimingLabel({ start: "15:00", certainty: "suggested" })).toBe("約 15:00");
    expect(formatTimingLabel({ certainty: "unknown" })).toBe("時間未定");
    expect(formatTimingLabel({ certainty: "fixed" })).toBe("時間未定");
  });
});
