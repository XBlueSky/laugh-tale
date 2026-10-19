import type { ProviderReference } from "./model.js";
import type { ProviderUnavailableResult } from "./provider-failure.js";
export interface PlaceRequestV2 {
    ownerId: string;
    providerReference: ProviderReference;
    locale: string;
    timeZone: string;
}
export type BusinessStatus = "operational" | "temporarily-closed" | "permanently-closed" | "unknown";
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface WeeklyClockTime {
    day: WeekdayIndex;
    hour: number;
    minute: number;
}
export interface OpeningPeriod {
    open: WeeklyClockTime;
    close?: WeeklyClockTime;
}
export type OpeningHoursFacts = {
    kind: "always-open";
} | {
    kind: "weekly";
    completeness: "complete" | "incomplete";
    periods: readonly OpeningPeriod[];
};
export interface PlaceRuntimeFacts {
    formattedAddress?: string;
    businessStatus?: BusinessStatus;
    openingHours?: OpeningHoursFacts;
}
export type PlaceProviderResult = {
    status: "ready";
    facts: PlaceRuntimeFacts;
} | ProviderUnavailableResult;
export type PlaceRuntimeState = {
    status: "idle";
} | {
    status: "loading";
} | PlaceProviderResult;
export type PlaceOpeningState = {
    status: "open";
} | {
    status: "closed";
} | {
    status: "unknown";
    reason: "absent" | "incomplete" | "invalid";
};
