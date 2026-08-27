/**
 * Storage boundary for one resolved trip-progress key. The progress schema,
 * parser, and reducer stay in the package root; a store only moves raw
 * strings so a site can substitute any persistence without changing the
 * reducer. `write` reports success so callers can surface a semantic
 * `memory-only` state instead of fabricating persistence.
 */
export interface ProgressStore {
  read(): string | null;
  write(value: string): boolean;
  subscribe(listener: (value: string | null) => void): () => void;
}

export interface ProgressStoreEvents {
  addEventListener(type: "storage", listener: (event: StorageEvent) => void): void;
  removeEventListener(type: "storage", listener: (event: StorageEvent) => void): void;
}

export interface LocalStorageProgressStoreOptions {
  storage?: Pick<Storage, "getItem" | "setItem"> | undefined;
  events?: ProgressStoreEvents | undefined;
}

function defaultStorage(): Pick<Storage, "getItem" | "setItem"> | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function defaultEvents(): ProgressStoreEvents | undefined {
  return typeof window === "undefined" ? undefined : window;
}

export function createLocalStorageProgressStore(
  key: string,
  options: LocalStorageProgressStoreOptions = {},
): ProgressStore {
  const storage = "storage" in options ? options.storage : defaultStorage();
  const events = "events" in options ? options.events : defaultEvents();

  return {
    read() {
      try {
        return storage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    write(value) {
      try {
        if (storage === undefined) return false;
        storage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    subscribe(listener) {
      if (events === undefined) return () => {};
      const handler = (event: StorageEvent): void => {
        if (event.key === key) listener(event.newValue);
      };
      events.addEventListener("storage", handler);
      return () => {
        events.removeEventListener("storage", handler);
      };
    },
  };
}
