import { Temporal } from "@js-temporal/polyfill";

import type { Timing, Trip, TripDay, TripNode } from "./model";

export interface ResolvedScheduleEntry {
  id: string;
  nodeId: string;
  dayId: string;
  node: TripNode;
  day: TripDay;
  startsAt: Temporal.ZonedDateTime;
  endsAt: Temporal.ZonedDateTime;
}

export interface LiveState {
  currentId: string | null;
  nextId: string | null;
}

export interface LiveStateOptions {
  ignoredNodeIds?: ReadonlySet<string>;
}

interface UnboundedScheduleEntry {
  id: string;
  nodeId: string;
  dayId: string;
  node: TripNode;
  day: TripDay;
  startsAt: Temporal.ZonedDateTime;
  explicitEnd?: Temporal.ZonedDateTime;
}

export function formatTimingLabel(timing: Timing): string {
  if (timing.certainty === "unknown" || timing.start === undefined) {
    return "時間未定";
  }

  return timing.certainty === "suggested" ? `約 ${timing.start}` : timing.start;
}

function atLocalTime(
  date: Temporal.PlainDate,
  time: string,
  timezone: string,
): Temporal.ZonedDateTime {
  const [hourText, minuteText] = time.split(":");
  return date.toZonedDateTime({
    timeZone: timezone,
    plainTime: Temporal.PlainTime.from({
      hour: Number(hourText),
      minute: Number(minuteText),
    }),
  });
}

function explicitEndFor(
  date: Temporal.PlainDate,
  timing: Timing,
  startsAt: Temporal.ZonedDateTime,
  timezone: string,
): Temporal.ZonedDateTime | undefined {
  if (timing.end === undefined) {
    return undefined;
  }

  let endDate = date.add({ days: timing.dayOffset ?? 0 });
  let endsAt = atLocalTime(endDate, timing.end, timezone);

  if ((timing.dayOffset ?? 0) === 0 && Temporal.ZonedDateTime.compare(endsAt, startsAt) < 0) {
    endDate = endDate.add({ days: 1 });
    endsAt = atLocalTime(endDate, timing.end, timezone);
  }

  return endsAt;
}

export function resolveSchedule(
  trip: Pick<Trip, "timezone" | "days">,
): ResolvedScheduleEntry[] {
  const unbounded: UnboundedScheduleEntry[] = trip.days.flatMap((day) => {
    const date = Temporal.PlainDate.from(day.date);

    return day.nodes.flatMap((node) => {
      if (node.timing.start === undefined) {
        return [];
      }

      const startsAt = atLocalTime(date, node.timing.start, trip.timezone);
      return [
        {
          id: node.id,
          nodeId: node.id,
          dayId: day.id,
          node,
          day,
          startsAt,
          explicitEnd: explicitEndFor(date, node.timing, startsAt, trip.timezone),
        },
      ];
    });
  });

  unbounded.sort((left, right) => Temporal.ZonedDateTime.compare(left.startsAt, right.startsAt));

  return unbounded.map(({ explicitEnd, ...entry }, index) => ({
    ...entry,
    endsAt: explicitEnd ?? unbounded[index + 1]?.startsAt ?? entry.startsAt.add({ minutes: 120 }),
  }));
}

export function findLiveState(
  fullSchedule: readonly ResolvedScheduleEntry[],
  now: Temporal.ZonedDateTime,
  options: LiveStateOptions = {},
): LiveState {
  const ignoredNodeIds = options.ignoredNodeIds ?? new Set<string>();
  const visibleSchedule = fullSchedule.filter(({ nodeId }) => !ignoredNodeIds.has(nodeId));
  let currentId: string | null = null;

  for (const entry of visibleSchedule) {
    if (
      Temporal.ZonedDateTime.compare(entry.startsAt, now) <= 0 &&
      Temporal.ZonedDateTime.compare(now, entry.endsAt) < 0
    ) {
      currentId = entry.nodeId;
    }
  }

  const next = visibleSchedule.find(
    ({ startsAt }) => Temporal.ZonedDateTime.compare(startsAt, now) > 0,
  );

  return { currentId, nextId: next?.nodeId ?? null };
}
