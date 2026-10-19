export interface FakeClockSnapshot {
    instant: string;
    readCount: number;
}
export declare class FakeClock {
    readonly testOnly: true;
    private epochMilliseconds;
    private reads;
    constructor(initialInstant: string);
    readonly now: () => string;
    advanceMinutes(minutes: number): void;
    snapshot(): FakeClockSnapshot;
}
