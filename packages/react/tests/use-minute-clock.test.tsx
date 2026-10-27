import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useMinuteClock,
  type MinuteClockSource,
} from "../src/use-minute-clock.js";

const START_TIME = new Date("2026-04-05T12:34:45.250Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START_TIME);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useMinuteClock", () => {
  it("reads synchronously and reschedules from each wall-minute boundary", () => {
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const observedValues: string[] = [];
    let firstRead = true;
    let minute = 34;
    const clock = vi.fn(() => {
      if (firstRead) {
        firstRead = false;
        return "synchronous-clock-read";
      }
      return `2026-04-05T12:${minute}:00.000Z`;
    });

    const { result } = renderHook(() => {
      const value = useMinuteClock(clock);
      observedValues.push(value);
      return value;
    });

    expect(observedValues[0]).toBe("synchronous-clock-read");
    expect(result.current).toBe("2026-04-05T12:34:00.000Z");
    expect(setTimeoutSpy.mock.calls.at(-1)?.[1]).toBe(14_750);
    expect(setIntervalSpy).not.toHaveBeenCalled();

    minute = 35;
    act(() => {
      vi.advanceTimersByTime(14_750);
    });

    expect(result.current).toBe("2026-04-05T12:35:00.000Z");
    expect(setTimeoutSpy.mock.calls.at(-1)?.[1]).toBe(60_000);

    minute = 36;
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current).toBe("2026-04-05T12:36:00.000Z");
    expect(setTimeoutSpy.mock.calls.at(-1)?.[1]).toBe(60_000);
  });

  it("replaces the active timeout and emitted value when the source changes", () => {
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const firstClock = vi.fn(() => "2026-04-05T12:34:00.000Z");
    const secondClock = vi.fn(() => "2040-11-12T08:09:00.000Z");
    const { result, rerender } = renderHook(
      ({ clock }: { clock: MinuteClockSource }) => useMinuteClock(clock),
      { initialProps: { clock: firstClock } },
    );
    const firstCallCount = firstClock.mock.calls.length;

    rerender({ clock: secondClock });

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(result.current).toBe("2040-11-12T08:09:00.000Z");

    act(() => {
      vi.advanceTimersByTime(14_750);
    });

    expect(firstClock).toHaveBeenCalledTimes(firstCallCount);
    expect(secondClock).toHaveBeenCalledTimes(2);
  });

  it("clears its active timeout on unmount", () => {
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const { unmount } = renderHook(() =>
      useMinuteClock(() => "2026-04-05T12:34:00.000Z"),
    );

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it("uses a valid ISO instant as its timezone-neutral default source", () => {
    const { result } = renderHook(() => useMinuteClock());

    expect(result.current).toBe(START_TIME.toISOString());
    expect(Number.isNaN(Date.parse(result.current))).toBe(false);
    expect(result.current).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
