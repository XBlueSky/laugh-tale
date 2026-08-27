import { Temporal } from "@js-temporal/polyfill";
const EXACT_LOCAL_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
function assertResolvableTiming(node) {
    for (const [field, value] of [
        ["start", node.timing.start],
        ["end", node.timing.end],
    ]) {
        if (value !== undefined && !EXACT_LOCAL_TIME.test(value)) {
            throw new Error(`Node ${node.id} ${field} must use exact HH:mm form.`);
        }
    }
    const { dayOffset } = node.timing;
    if (dayOffset !== undefined && (!Number.isInteger(dayOffset) || dayOffset < 0)) {
        throw new Error(`Node ${node.id} dayOffset must be a non-negative integer.`);
    }
}
function atLocalTime(date, time, timezone) {
    const [hourText, minuteText] = time.split(":");
    return date.toZonedDateTime({
        timeZone: timezone,
        plainTime: Temporal.PlainTime.from({
            hour: Number(hourText),
            minute: Number(minuteText),
        }),
    });
}
function explicitEndFor(date, timing, startsAt, timezone) {
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
export function resolveSchedule(trip) {
    const unbounded = trip.days.flatMap((day) => {
        const date = Temporal.PlainDate.from(day.date);
        return day.nodes.flatMap((node) => {
            assertResolvableTiming(node);
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
    for (let index = 1; index < unbounded.length; index += 1) {
        const previous = unbounded[index - 1];
        const current = unbounded[index];
        if (previous !== undefined &&
            current !== undefined &&
            Temporal.ZonedDateTime.compare(previous.startsAt, current.startsAt) === 0) {
            throw new Error(`Duplicate schedule start for nodes ${previous.nodeId} and ${current.nodeId}. ` +
                "Represent simultaneous alternatives as a candidate group.");
        }
    }
    return unbounded.map(({ explicitEnd, ...entry }, index) => ({
        ...entry,
        endsAt: explicitEnd ?? unbounded[index + 1]?.startsAt ?? entry.startsAt.add({ minutes: 120 }),
    }));
}
export function findLiveState(fullSchedule, now, options = {}) {
    const ignoredNodeIds = options.ignoredNodeIds ?? new Set();
    const visibleSchedule = fullSchedule.filter(({ nodeId }) => !ignoredNodeIds.has(nodeId));
    let currentId = null;
    for (const entry of visibleSchedule) {
        if (Temporal.ZonedDateTime.compare(entry.startsAt, now) <= 0 &&
            Temporal.ZonedDateTime.compare(now, entry.endsAt) < 0) {
            currentId = entry.nodeId;
        }
    }
    const next = visibleSchedule.find(({ startsAt }) => Temporal.ZonedDateTime.compare(startsAt, now) > 0);
    return { currentId, nextId: next?.nodeId ?? null };
}
