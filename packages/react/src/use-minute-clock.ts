import { useEffect, useState } from "react";
import { ControllerStateFailure } from "./normalize-controller-error.js";

export type MinuteClockSource = () => string;

const systemClock: MinuteClockSource = () => new Date().toISOString();

type ClockReading = { status: "ready"; value: string } | { status: "failed"; cause: unknown };

function readClock(clock: MinuteClockSource): ClockReading {
  try { return { status: "ready", value: clock() }; }
  catch (cause) { return { status: "failed", cause }; }
}

export function useMinuteClock(
  clock: MinuteClockSource = systemClock,
): string {
  const [reading, setReading] = useState(() => readClock(clock));

  useEffect(() => {
    let timeoutId: number | null = null;
    const publishReading = (): void => {
      const next = readClock(clock);
      setReading((current) => {
        if (current.status === "ready" && next.status === "ready" && current.value === next.value) return current;
        if (current.status === "failed" && next.status === "failed" && current.cause === next.cause) return current;
        return next;
      });
    };
    publishReading();

    const schedule = (): void => {
      const delay = 60_000 - (Date.now() % 60_000);
      timeoutId = window.setTimeout(() => {
        publishReading();
        schedule();
      }, delay);
    };

    schedule();

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [clock]);

  if (reading.status === "failed") {
    throw reading.cause instanceof ControllerStateFailure
      ? reading.cause
      : new ControllerStateFailure(reading.cause);
  }
  return reading.value;
}
