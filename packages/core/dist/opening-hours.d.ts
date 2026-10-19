import type { BusinessStatus, OpeningHoursFacts, PlaceOpeningState } from "./place-runtime.js";
export declare function evaluateOpeningHours(facts: OpeningHoursFacts | undefined, instant: string, timeZone: string, businessStatus?: BusinessStatus): PlaceOpeningState;
