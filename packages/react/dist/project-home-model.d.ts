import { type Booking, type Timing, type Trip, type TripProgressV1 } from "@laugh-tale-island/core";
import type { HomeModel, ProviderBootstrapState } from "./presentation-contract.js";
import type { ProgressPersistenceStatus } from "./use-trip-progress.js";
interface HomeProjectionInput {
    trip: Trip;
    progress: TripProgressV1;
    persistenceStatus: ProgressPersistenceStatus;
    instant: string;
    manualDayId?: string | null;
    providerBootstrap?: ProviderBootstrapState;
}
export declare function bookingFact(booking: Booking): {
    arrivalBufferMinutes?: number | undefined;
    url?: string | undefined;
    reference?: string | undefined;
    status: "none" | "pending" | "confirmed";
};
export declare function timingFact(timing: Timing): {
    dayOffset?: number | undefined;
    end?: string | undefined;
    start?: string | undefined;
    certainty: import("@laugh-tale-island/core").TimingCertainty;
};
export declare function projectHomeModel({ trip, progress, persistenceStatus, instant, manualDayId, providerBootstrap, }: HomeProjectionInput): HomeModel;
export {};
