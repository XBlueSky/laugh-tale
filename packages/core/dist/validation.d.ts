import type { Trip } from "./model.js";
export interface ValidationIssue {
    code: string;
    path: string;
    message: string;
}
export interface ValidationResult {
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
}
export declare function validateTrip(trip: Trip): ValidationResult;
export declare function assertValidTrip(trip: Trip): void;
