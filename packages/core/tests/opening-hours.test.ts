import { describe, expect, it } from "vitest";
import { evaluateOpeningHours, type OpeningHoursFacts } from "@laugh-tale-island/core";

const sundayMorning: OpeningHoursFacts = {
  kind: "weekly",
  completeness: "complete",
  periods: [{ open: { day: 0, hour: 9, minute: 0 }, close: { day: 0, hour: 17, minute: 0 } }],
};

describe("evaluateOpeningHours", () => {
  it.each(["temporarily-closed", "permanently-closed"] as const)("explicit %s overrides weekly and always-open hours", status => {
    for (const facts of [sundayMorning, { kind: "always-open" } as const, undefined]) {
      expect(evaluateOpeningHours(facts, "2026-09-06T10:00:00Z", "UTC", status)).toEqual({ status: "closed" });
    }
    expect(evaluateOpeningHours(sundayMorning, "2026-09-06T10:00:00Z", "UTC", "operational")).toEqual({ status: "open" });
  });
  it("reports explicitly always-open places as open", () => {
    expect(evaluateOpeningHours({ kind: "always-open" }, "2026-09-06T00:00:00.000Z", "UTC")).toEqual({
      status: "open",
    });
  });

  it.each([
    ["before", "2026-09-06T08:59:00.000Z", { status: "closed" }],
    ["during", "2026-09-06T09:00:00.000Z", { status: "open" }],
    ["after", "2026-09-06T17:00:00.000Z", { status: "closed" }],
  ] as const)("evaluates a complete same-day period %s its interval", (_name, instant, expected) => {
    expect(evaluateOpeningHours(sundayMorning, instant, "UTC")).toEqual(expected);
  });

  it("carries a Friday period through Saturday morning", () => {
    const hours: OpeningHoursFacts = {
      kind: "weekly",
      completeness: "complete",
      periods: [{ open: { day: 5, hour: 22, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } }],
    };

    expect(evaluateOpeningHours(hours, "2026-09-05T01:30:00.000Z", "UTC")).toEqual({ status: "open" });
  });

  it("carries a Sunday period through Monday", () => {
    const hours: OpeningHoursFacts = {
      kind: "weekly",
      completeness: "complete",
      periods: [{ open: { day: 0, hour: 22, minute: 0 }, close: { day: 1, hour: 2, minute: 0 } }],
    };

    expect(evaluateOpeningHours(hours, "2026-09-07T01:30:00.000Z", "UTC")).toEqual({ status: "open" });
  });

  it("uses the supplied trip timezone for the same instant", () => {
    const mondayMorning: OpeningHoursFacts = {
      kind: "weekly",
      completeness: "complete",
      periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 10, minute: 0 } }],
    };

    expect(evaluateOpeningHours(mondayMorning, "2026-09-07T00:30:00.000Z", "Asia/Tokyo")).toEqual({ status: "open" });
    expect(evaluateOpeningHours(mondayMorning, "2026-09-07T00:30:00.000Z", "America/Los_Angeles")).toEqual({ status: "closed" });
  });

  it("returns invalid when any complete period is malformed, even after a matching period", () => {
    const hours = {
      kind: "weekly",
      completeness: "complete",
      periods: [
        { open: { day: 0, hour: 9, minute: 0 }, close: { day: 0, hour: 17, minute: 0 } },
        { open: { day: 7, hour: 9, minute: 0 }, close: { day: 0, hour: 10, minute: 0 } },
      ],
    } as unknown as OpeningHoursFacts;

    expect(evaluateOpeningHours(hours, "2026-09-06T10:00:00.000Z", "UTC")).toEqual({ status: "unknown", reason: "invalid" });
  });

  it.each([
    [undefined, "absent"],
    [{ kind: "weekly", completeness: "incomplete", periods: [] }, "incomplete"],
    [{ kind: "weekly", completeness: "complete", periods: [{ open: { day: 0, hour: 9, minute: 0 } }] }, "invalid"],
    [{ kind: "weekly", completeness: "complete", periods: [{ open: { day: 7, hour: 9, minute: 0 }, close: { day: 0, hour: 10, minute: 0 } }] }, "invalid"],
    [{ kind: "weekly", completeness: "complete", periods: [{ open: { day: 0, hour: 24, minute: 0 }, close: { day: 0, hour: 10, minute: 0 } }] }, "invalid"],
    [{ kind: "weekly", completeness: "complete", periods: [{ open: { day: 0, hour: 9, minute: 60 }, close: { day: 0, hour: 10, minute: 0 } }] }, "invalid"],
    [{ kind: "weekly", completeness: "complete", periods: [] }, "invalid"],
  ] as const)("returns unknown %s facts", (facts, reason) => {
    expect(evaluateOpeningHours(facts as OpeningHoursFacts | undefined, "2026-09-06T09:00:00.000Z", "UTC")).toEqual({ status: "unknown", reason });
  });

  it.each([
    ["not-an-instant", "UTC"],
    ["2026-09-06T09:00:00.000Z", "Not/A_Timezone"],
  ])("returns invalid for invalid instant or timezone", (instant, timeZone) => {
    expect(evaluateOpeningHours(sundayMorning, instant, timeZone)).toEqual({ status: "unknown", reason: "invalid" });
  });
});
