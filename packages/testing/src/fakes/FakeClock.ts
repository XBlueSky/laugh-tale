export interface FakeClockSnapshot {
  instant: string;
  readCount: number;
}

const RFC_3339_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?Z$/;

function validCalendarFields(match: RegExpMatchArray): boolean {
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function parseInstant(value: string): number {
  const match = typeof value === "string" ? value.match(RFC_3339_INSTANT) : null;
  if (!match || !validCalendarFields(match)) throw new TypeError("initialInstant must be an RFC 3339 UTC instant");
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) throw new TypeError("initialInstant must be a valid RFC 3339 UTC instant");
  return epoch;
}

export class FakeClock {
  readonly testOnly = true as const;
  private epochMilliseconds: number;
  private reads = 0;

  constructor(initialInstant: string) {
    this.epochMilliseconds = parseInstant(initialInstant);
  }

  readonly now = (): string => {
    this.reads += 1;
    return new Date(this.epochMilliseconds).toISOString();
  };

  advanceMinutes(minutes: number): void {
    if (!Number.isFinite(minutes) || !Number.isInteger(minutes)) throw new TypeError("minutes must be a finite integer");
    const next = this.epochMilliseconds + minutes * 60_000;
    if (!Number.isFinite(next)) throw new RangeError("advanced instant is outside the supported range");
    try {
      new Date(next).toISOString();
    } catch {
      throw new RangeError("advanced instant is outside the supported range");
    }
    this.epochMilliseconds = next;
  }

  snapshot(): FakeClockSnapshot {
    return { instant: new Date(this.epochMilliseconds).toISOString(), readCount: this.reads };
  }
}
