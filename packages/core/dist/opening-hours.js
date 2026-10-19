import { Temporal } from "@js-temporal/polyfill";
const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
function minutesSinceSunday(value) {
    if (typeof value !== "object" || value === null)
        return undefined;
    const { day, hour, minute } = value;
    if (!Number.isInteger(day) ||
        !Number.isInteger(hour) ||
        !Number.isInteger(minute) ||
        day === undefined ||
        hour === undefined ||
        minute === undefined ||
        day < 0 ||
        day > 6 ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59) {
        return undefined;
    }
    return day * MINUTES_PER_DAY + hour * 60 + minute;
}
function normalizeWeeklyPeriods(periods) {
    const intervals = [];
    for (const period of periods) {
        if (typeof period !== "object" || period === null)
            return undefined;
        const { open: openValue, close: closeValue } = period;
        const open = minutesSinceSunday(openValue);
        const close = minutesSinceSunday(closeValue);
        if (open === undefined || close === undefined)
            return undefined;
        intervals.push({ open, end: close <= open ? close + MINUTES_PER_WEEK : close });
    }
    return intervals;
}
function evaluateWeeklyHours(facts, minuteOfWeek) {
    if (facts.completeness === "incomplete")
        return { status: "unknown", reason: "incomplete" };
    if (facts.completeness !== "complete" || !Array.isArray(facts.periods) || facts.periods.length === 0) {
        return { status: "unknown", reason: "invalid" };
    }
    const periods = facts.periods;
    const intervals = normalizeWeeklyPeriods(periods);
    if (intervals === undefined)
        return { status: "unknown", reason: "invalid" };
    for (const { open, end } of intervals) {
        for (const shift of [-MINUTES_PER_WEEK, 0, MINUTES_PER_WEEK]) {
            if (minuteOfWeek >= open + shift && minuteOfWeek < end + shift)
                return { status: "open" };
        }
    }
    return { status: "closed" };
}
export function evaluateOpeningHours(facts, instant, timeZone, businessStatus) {
    if (businessStatus === "temporarily-closed" || businessStatus === "permanently-closed")
        return { status: "closed" };
    if (facts === undefined)
        return { status: "unknown", reason: "absent" };
    try {
        const zoned = Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone);
        if (facts.kind === "always-open")
            return { status: "open" };
        if (facts.kind !== "weekly")
            return { status: "unknown", reason: "invalid" };
        const day = zoned.dayOfWeek % 7;
        return evaluateWeeklyHours(facts, day * MINUTES_PER_DAY + zoned.hour * 60 + zoned.minute);
    }
    catch {
        return { status: "unknown", reason: "invalid" };
    }
}
