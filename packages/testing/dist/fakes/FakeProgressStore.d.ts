import type { ProgressReadResult, ProgressStore } from "@laugh-tale-island/core/browser";
export interface FakeProgressStoreOptions {
    initialValue?: string | null;
    readAvailable?: boolean;
    writeAvailable?: boolean;
}
export declare class FakeProgressStore implements ProgressStore {
    readonly testOnly: true;
    readonly writes: string[];
    readCount: number;
    private value;
    private readAvailable;
    private writeAvailable;
    private readonly listeners;
    constructor(options?: FakeProgressStoreOptions);
    get listenerCount(): number;
    setReadAvailable(available: boolean): void;
    setWriteAvailable(available: boolean): void;
    read(): ProgressReadResult;
    write(value: string): boolean;
    subscribe(listener: (value: string | null) => void): () => void;
    emit(value: string | null): void;
}
