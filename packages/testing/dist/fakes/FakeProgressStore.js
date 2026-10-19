export class FakeProgressStore {
    testOnly = true;
    writes = [];
    readCount = 0;
    value;
    readAvailable;
    writeAvailable;
    listeners = new Set();
    constructor(options = {}) {
        this.value = options.initialValue ?? null;
        this.readAvailable = options.readAvailable ?? true;
        this.writeAvailable = options.writeAvailable ?? true;
    }
    get listenerCount() {
        return this.listeners.size;
    }
    setReadAvailable(available) {
        this.readAvailable = available;
    }
    setWriteAvailable(available) {
        this.writeAvailable = available;
    }
    read() {
        this.readCount += 1;
        return this.readAvailable
            ? { status: "ready", value: this.value }
            : { status: "unavailable" };
    }
    write(value) {
        this.writes.push(`${value}`);
        if (!this.writeAvailable)
            return false;
        this.value = `${value}`;
        return true;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        let active = true;
        return () => {
            if (!active)
                return;
            active = false;
            this.listeners.delete(listener);
        };
    }
    emit(value) {
        const snapshot = value === null ? null : `${value}`;
        for (const listener of [...this.listeners])
            listener(snapshot);
    }
}
