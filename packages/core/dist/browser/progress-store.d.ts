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
export declare function createLocalStorageProgressStore(key: string, options?: LocalStorageProgressStoreOptions): ProgressStore;
