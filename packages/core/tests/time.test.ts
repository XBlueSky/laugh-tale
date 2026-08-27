import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import type { Timing, Trip, TripNode } from "@laugh-tale-island/core";
import { findLiveState, resolveSchedule } from "@laugh-tale-island/core";

function sightseeingNode(id: string, dayId: string, timing: Timing): TripNode {
  return {
    id,
    dayId,
    kind: "sightseeing",
    title: id,
    timing,
    optionality: "core",
    payload: {},
  };
}

function nowAt(localDateTime: string, timezone: string): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from(`${localDateTime}[${timezone}]`);
}


describe("resolveSchedule", () => {
  it("rejects timing strings that are not exactly valid HH:mm values", () => {
    const trip = {
      timezone: "Asia/Tokyo",
      days: [
        {
          id: "day-1",
          date: "2026-08-23",
          title: "Malformed time",
          nodes: [
            sightseeingNode("bad-time", "day-1", {
              start: "08:15:garbage",
              certainty: "fixed",
            }),
          ],
        },
      ],
    } satisfies Pick<Trip, "timezone" | "days">;

    expect(() => resolveSchedule(trip)).toThrow(/bad-time.*HH:mm/i);
  });

  it.each([-1, 1.5])("rejects invalid dayOffset %s directly", (dayOffset) => {
    const trip = {
      timezone: "Asia/Tokyo",
      days: [
        {
          id: "day-1",
          date: "2026-08-23",
          title: "Invalid offset",
          nodes: [
            sightseeingNode("bad-offset", "day-1", {
              start: "08:15",
              end: "09:00",
              dayOffset,
              certainty: "fixed",
            }),
          ],
        },
      ],
    } satisfies Pick<Trip, "timezone" | "days">;

    expect(() => resolveSchedule(trip)).toThrow(/bad-offset.*dayOffset/i);
  });

  it("fails fast when two nodes have the same absolute start", () => {
    const trip = {
      timezone: "Asia/Tokyo",
      days: [
        {
          id: "day-1",
          date: "2026-08-23",
          title: "Ambiguous schedule",
          nodes: [
            sightseeingNode("same-a", "day-1", {
              start: "10:00",
              certainty: "suggested",
            }),
            sightseeingNode("same-b", "day-1", {
              start: "10:00",
              certainty: "suggested",
            }),
          ],
        },
      ],
    } satisfies Pick<Trip, "timezone" | "days">;

    expect(() => resolveSchedule(trip)).toThrow(/duplicate schedule start.*same-a.*same-b/i);
  });

  it("resolves the day absolute date in the trip IANA timezone", () => {
    const trip = {
      timezone: "Asia/Tokyo",
      days: [
        {
          id: "day-1",
          date: "2026-08-23",
          title: "Tokyo day",
          nodes: [
            sightseeingNode("stop-1", "day-1", {
              start: "08:15",
              end: "09:00",
              certainty: "fixed",
            }),
          ],
        },
      ],
    } satisfies Pick<Trip, "timezone" | "days">;

    const [entry] = resolveSchedule(trip);

    expect(entry?.startsAt.toString()).toBe("2026-08-23T08:15:00+09:00[Asia/Tokyo]");
    expect(entry?.endsAt.toString()).toBe("2026-08-23T09:00:00+09:00[Asia/Tokyo]");
  });

  it("applies an end dayOffset for a cross-midnight schedule", () => {
    const trip = {
      timezone: "Asia/Tokyo",
      days: [
        {
          id: "day-1",
          date: "2026-08-23",
          title: "Late night",
          nodes: [
            sightseeingNode("late-stop", "day-1", {
              start: "23:30",
              end: "00:30",
              dayOffset: 1,
              certainty: "fixed",
            }),
          ],
        },
      ],
    } satisfies Pick<Trip, "timezone" | "days">;

    const [entry] = resolveSchedule(trip);

    expect(entry?.startsAt.toPlainDateTime().toString()).toBe("2026-08-23T23:30:00");
    expect(entry?.endsAt.toPlainDateTime().toString()).toBe("2026-08-24T00:30:00");
  });

  it("infers missing ends from the full schedule before ignored nodes are filtered", () => {
    const trip = {
      timezone: "Asia/Tokyo",
      days: [
        {
          id: "day-1",
          date: "2026-08-23",
          title: "Boundary day",
          nodes: [
            sightseeingNode("stop-09", "day-1", {
              start: "09:00",
              certainty: "suggested",
            }),
            sightseeingNode("stop-10", "day-1", {
              start: "10:00",
              certainty: "suggested",
            }),
            sightseeingNode("stop-11", "day-1", {
              start: "11:00",
              certainty: "suggested",
            }),
          ],
        },
      ],
    } satisfies Pick<Trip, "timezone" | "days">;
    const fullSchedule = resolveSchedule(trip);

    expect(fullSchedule[0]?.endsAt.toPlainTime().toString()).toBe("10:00:00");
    expect(
      findLiveState(fullSchedule, nowAt("2026-08-23T10:30", "Asia/Tokyo"), {
        ignoredNodeIds: new Set(["stop-10"]),
      }),
    ).toEqual({ currentId: null, nextId: "stop-11" });
  });

  it("uses a 120-minute fallback only for the final missing end", () => {
    const trip = {
      timezone: "Asia/Tokyo",
      days: [
        {
          id: "day-1",
          date: "2026-08-23",
          title: "Fallback day",
          nodes: [
            sightseeingNode("last-stop", "day-1", {
              start: "21:00",
              certainty: "unknown",
            }),
          ],
        },
      ],
    } satisfies Pick<Trip, "timezone" | "days">;

    const [entry] = resolveSchedule(trip);

    expect(entry?.endsAt.toPlainDateTime().toString()).toBe("2026-08-23T23:00:00");
  });
});
