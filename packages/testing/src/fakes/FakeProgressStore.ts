import type { ProgressReadResult, ProgressStore } from "@laugh-tale-island/core/browser";

export interface FakeProgressStoreOptions {
  initialValue?: string | null;
  readAvailable?: boolean;
  writeAvailable?: boolean;
}

export class FakeProgressStore implements ProgressStore {
  readonly testOnly = true as const;
  readonly writes: string[] = [];
  readCount = 0;
  private value: string | null;
  private readAvailable: boolean;
  private writeAvailable: boolean;
  private readonly listeners = new Set<(value: string | null) => void>();

  constructor(options: FakeProgressStoreOptions = {}) {
    this.value = options.initialValue ?? null;
    this.readAvailable = options.readAvailable ?? true;
    this.writeAvailable = options.writeAvailable ?? true;
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  setReadAvailable(available: boolean): void {
    this.readAvailable = available;
  }

  setWriteAvailable(available: boolean): void {
    this.writeAvailable = available;
  }

  read(): ProgressReadResult {
    this.readCount += 1;
    return this.readAvailable
      ? { status: "ready", value: this.value }
      : { status: "unavailable" };
  }

  write(value: string): boolean {
    this.writes.push(`${value}`);
    if (!this.writeAvailable) return false;
    this.value = `${value}`;
    return true;
  }

  subscribe(listener: (value: string | null) => void): () => void {
    this.listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.listeners.delete(listener);
    };
  }

  emit(value: string | null): void {
    const snapshot = value === null ? null : `${value}`;
    for (const listener of [...this.listeners]) listener(snapshot);
  }
}
