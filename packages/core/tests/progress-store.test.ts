import { describe, expect, it, vi } from "vitest";

import {
  createLocalStorageProgressStore,
  type ProgressStore,
} from "@laugh-tale/core/browser";

type StorageStub = Pick<Storage, "getItem" | "setItem">;

function workingStorage(
  initial: Record<string, string> = {},
): StorageStub & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

function eventTarget() {
  const listeners = new Set<(event: StorageEvent) => void>();
  return {
    addEventListener: (_type: "storage", listener: (event: StorageEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: "storage", listener: (event: StorageEvent) => void) => {
      listeners.delete(listener);
    },
    emit(key: string | null, newValue: string | null) {
      for (const listener of listeners) listener({ key, newValue } as StorageEvent);
    },
  };
}

describe("createLocalStorageProgressStore", () => {
  it("reads and writes exactly its own key", () => {
    const storage = workingStorage({ other: "x" });
    const store: ProgressStore = createLocalStorageProgressStore("trip:one", { storage });
    expect(store.read()).toBeNull();
    expect(store.write("payload")).toBe(true);
    expect(storage.data["trip:one"]).toBe("payload");
    expect(storage.data.other).toBe("x");
    expect(store.read()).toBe("payload");
  });

  it("returns null/false instead of throwing when storage fails", () => {
    const store = createLocalStorageProgressStore("trip:one", {
      storage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
      },
    });
    expect(store.read()).toBeNull();
    expect(store.write("payload")).toBe(false);
  });

  it("notifies subscribers only for its exact key and stops after unsubscribe", () => {
    const events = eventTarget();
    const store = createLocalStorageProgressStore("trip:one", {
      storage: workingStorage(),
      events,
    });
    const seen: Array<string | null> = [];
    const unsubscribe = store.subscribe((value) => seen.push(value));
    events.emit("trip:one", "fresh");
    events.emit("trip:two", "other");
    events.emit(null, null);
    events.emit("trip:one", null);
    unsubscribe();
    events.emit("trip:one", "late");
    expect(seen).toEqual(["fresh", null]);
  });

  it("operates memory-silently when no storage or events exist", () => {
    const store = createLocalStorageProgressStore("trip:one", {
      storage: undefined,
      events: undefined,
    });
    expect(store.read()).toBeNull();
    expect(store.write("payload")).toBe(false);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });
});
