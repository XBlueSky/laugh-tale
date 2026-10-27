function deepFreeze(value, seen = new Set()) {
    if (typeof value !== "object" || value === null || seen.has(value))
        return value;
    seen.add(value);
    for (const key of Reflect.ownKeys(value))
        deepFreeze(value[key], seen);
    return Object.freeze(value);
}
const sundayHours = { kind: "weekly", completeness: "complete", periods: [{ open: { day: 0, hour: 9, minute: 0 }, close: { day: 0, hour: 17, minute: 0 } }] };
const fixtures = {
    knownOpen: { facts: sundayHours, instant: "2042-03-02T10:00:00.000Z", timeZone: "UTC", expected: { status: "open" } },
    knownClosed: { facts: sundayHours, instant: "2042-03-02T18:00:00.000Z", timeZone: "UTC", expected: { status: "closed" } },
    absentHours: { facts: undefined, instant: "2042-03-02T10:00:00.000Z", timeZone: "UTC", expected: { status: "unknown", reason: "absent" } },
    incompleteHours: { facts: { kind: "weekly", completeness: "incomplete", periods: [] }, instant: "2042-03-02T10:00:00.000Z", timeZone: "UTC", expected: { status: "unknown", reason: "incomplete" } },
    overnight: { facts: { kind: "weekly", completeness: "complete", periods: [{ open: { day: 0, hour: 22, minute: 0 }, close: { day: 1, hour: 2, minute: 0 } }] }, instant: "2042-03-03T01:00:00.000Z", timeZone: "UTC", expected: { status: "open" } },
    wrongTimezone: { facts: sundayHours, instant: "2042-03-02T10:00:00.000Z", timeZone: "America/New_York", expected: { status: "closed" } },
};
export const adversarialPlaceFixtures = deepFreeze(fixtures);
