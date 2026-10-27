import { validateTrip, type Trip } from "@laugh-tale-island/core";

export interface DeterministicLocaleSetup {
  locale: string;
  timeZone: string;
  instant: string;
}

const DEFAULT_SETUP: DeterministicLocaleSetup = {
  locale: "en",
  timeZone: "UTC",
  instant: "2042-03-04T05:06:07.000Z",
};

const RFC_3339_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/;

function hasValidCalendarFields(match: RegExpMatchArray): boolean {
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  if (offsetHourText !== undefined && (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59)) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function validatedLocale(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError("locale must be a canonical language tag");
  let canonical: string | undefined;
  try {
    canonical = Intl.getCanonicalLocales(value)[0];
  } catch {
    throw new TypeError("locale must be a canonical language tag");
  }
  if (canonical !== value) throw new TypeError("locale must be canonical");
  return `${value}`;
}

function validatedTimeZone(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError("timeZone must be an IANA timezone");
  // Delegate the named-zone/Temporal contract to its owning public boundary.
  const trip: Trip = {
    id: "timezone-validation", title: "Timezone validation", locale: "en", timezone: value,
    startDate: "2000-01-01", endDate: "2000-01-01",
    days: [{ id: "day", date: "2000-01-01", title: "Day", nodes: [] }],
    routes: [], candidateGroups: [], reservations: [], tasks: [],
  };
  if (validateTrip(trip).errors.some(({ code }) => code === "INVALID_TIMEZONE")) {
    throw new TypeError("timeZone must be an IANA timezone");
  }
  return `${value}`;
}

function validatedInstant(value: unknown): string {
  const candidate = typeof value === "string" ? value : "";
  const match = candidate.match(RFC_3339_INSTANT);
  if (!match || !hasValidCalendarFields(match) || !Number.isFinite(Date.parse(candidate))) {
    throw new TypeError("instant must be an RFC 3339 instant");
  }
  return candidate;
}

export function createDeterministicLocaleSetup(
  input: Partial<DeterministicLocaleSetup> = {},
): DeterministicLocaleSetup {
  const locale = validatedLocale(input.locale ?? DEFAULT_SETUP.locale);
  const timeZone = validatedTimeZone(input.timeZone ?? DEFAULT_SETUP.timeZone);
  const instant = validatedInstant(input.instant ?? DEFAULT_SETUP.instant);
  return Object.freeze({ locale, timeZone, instant });
}
