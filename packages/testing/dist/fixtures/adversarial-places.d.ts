import type { OpeningHoursFacts, PlaceOpeningState } from "@laugh-tale-island/core";
export interface AdversarialPlaceFixture {
    readonly facts: OpeningHoursFacts | undefined;
    readonly instant: string;
    readonly timeZone: string;
    readonly expected: PlaceOpeningState;
}
export declare const adversarialPlaceFixtures: {
    knownOpen: {
        facts: {
            kind: "weekly";
            completeness: "complete" | "incomplete";
            periods: readonly import("@laugh-tale-island/core").OpeningPeriod[];
        };
        instant: string;
        timeZone: string;
        expected: {
            status: "open";
        };
    };
    knownClosed: {
        facts: {
            kind: "weekly";
            completeness: "complete" | "incomplete";
            periods: readonly import("@laugh-tale-island/core").OpeningPeriod[];
        };
        instant: string;
        timeZone: string;
        expected: {
            status: "closed";
        };
    };
    absentHours: {
        facts: undefined;
        instant: string;
        timeZone: string;
        expected: {
            status: "unknown";
            reason: "absent";
        };
    };
    incompleteHours: {
        facts: {
            kind: "weekly";
            completeness: "incomplete";
            periods: never[];
        };
        instant: string;
        timeZone: string;
        expected: {
            status: "unknown";
            reason: "incomplete";
        };
    };
    overnight: {
        facts: {
            kind: "weekly";
            completeness: "complete";
            periods: {
                open: {
                    day: 0;
                    hour: number;
                    minute: number;
                };
                close: {
                    day: 1;
                    hour: number;
                    minute: number;
                };
            }[];
        };
        instant: string;
        timeZone: string;
        expected: {
            status: "open";
        };
    };
    wrongTimezone: {
        facts: {
            kind: "weekly";
            completeness: "complete" | "incomplete";
            periods: readonly import("@laugh-tale-island/core").OpeningPeriod[];
        };
        instant: string;
        timeZone: string;
        expected: {
            status: "closed";
        };
    };
};
