import { describe, expect, it, vi } from "vitest";

import {
  createMemoryTripNavigationStore,
  type TripNavigationState,
  type TripNavigationStore,
} from "../src/index.js";

const HOME: TripNavigationState = {
  surface: "home",
  dayId: null,
  ownerId: null,
};

function experience(dayId: string | null, ownerId: string | null = null): TripNavigationState {
  return { surface: "experience", dayId, ownerId };
}

describe("createMemoryTripNavigationStore", () => {
  it("starts at the exact neutral home state", () => {
    const store = createMemoryTripNavigationStore();

    expect(store.read()).toEqual(HOME);
  });

  it("normalizes home writes and empty experience days to home", () => {
    const store = createMemoryTripNavigationStore(experience("day-a", "owner-a"));

    store.write({ surface: "home", dayId: "authored-day", ownerId: "authored-owner" });
    expect(store.read()).toEqual(HOME);

    store.write(experience(null, "owner-b"));
    expect(store.read()).toEqual(HOME);
    store.write(experience("", "owner-c"));
    expect(store.read()).toEqual(HOME);
    store.write(experience("   ", "owner-d"));
    expect(store.read()).toEqual(HOME);
  });

  it("retains non-empty authored IDs byte-for-byte while normalizing an empty owner", () => {
    const store = createMemoryTripNavigationStore();
    const next = experience("  authored-day/01  ", "  authored-owner/01  ");

    store.write(next);

    expect(store.read()).toEqual(next);
    expect(store.read()).not.toBe(next);

    store.write(experience("authored-day", ""));
    expect(store.read()).toEqual(experience("authored-day"));
    store.write(experience("authored-day", "   "));
    expect(store.read()).toEqual(experience("authored-day"));
  });

  it("returns cloned reads and stores a cloned normalized value", () => {
    const store = createMemoryTripNavigationStore();
    const first = store.read();
    const second = store.read();

    expect(first).not.toBe(second);
    store.write(experience("day-a", "owner-a"));
    const written = store.read();
    store.write(written);

    expect(store.read()).toEqual(experience("day-a", "owner-a"));
    expect(store.read()).not.toBe(written);
  });

  it("notifies each active listener once for a changed normalized state", () => {
    const store = createMemoryTripNavigationStore();
    const first = vi.fn();
    const second = vi.fn();
    store.subscribe(first);
    store.subscribe(second);

    store.write(experience("day-a"));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("does not notify for an equivalent normalized write", () => {
    const store = createMemoryTripNavigationStore(experience("day-a"));
    const listener = vi.fn();
    store.subscribe(listener);

    store.write(experience("day-a", ""));
    store.write({ surface: "home", dayId: "ignored", ownerId: "ignored" });
    store.write(HOME);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("makes unsubscribe idempotent", () => {
    const store = createMemoryTripNavigationStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    unsubscribe();
    store.write(experience("day-a"));

    expect(listener).not.toHaveBeenCalled();
  });

  it("completes a listener snapshot when one listener unsubscribes itself", () => {
    const store = createMemoryTripNavigationStore();
    const events: string[] = [];
    let unsubscribeSelf: () => void = () => {};
    const self = () => {
      events.push("self");
      unsubscribeSelf();
    };
    unsubscribeSelf = store.subscribe(self);
    store.subscribe(() => events.push("other"));

    store.write(experience("day-a"));
    store.write(experience("day-b"));

    expect(events).toEqual(["self", "other", "other"]);
  });

  it("defers a listener added during notification until the next write", () => {
    const store = createMemoryTripNavigationStore();
    const events: string[] = [];
    let added = false;
    const late = () => events.push("late");
    store.subscribe(() => {
      events.push("first");
      if (!added) {
        added = true;
        store.subscribe(late);
      }
    });

    store.write(experience("day-a"));
    expect(events).toEqual(["first"]);
    store.write(experience("day-b"));
    expect(events).toEqual(["first", "first", "late"]);
  });

  it("stores the new state and rethrows the first listener error after the snapshot", () => {
    const store: TripNavigationStore = createMemoryTripNavigationStore();
    const events: string[] = [];
    const firstError = new Error("first listener failure");
    const secondError = new Error("second listener failure");
    store.subscribe(() => {
      events.push("first");
      throw firstError;
    });
    store.subscribe(() => {
      events.push("second");
      throw secondError;
    });
    store.subscribe(() => events.push("third"));

    expect(() => store.write(experience("day-a"))).toThrow(firstError);
    expect(events).toEqual(["first", "second", "third"]);
    expect(store.read()).toEqual(experience("day-a"));
  });
});
