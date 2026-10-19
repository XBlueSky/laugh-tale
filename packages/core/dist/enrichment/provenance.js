import { Temporal } from "@js-temporal/polyfill";
import { clonePlaceSearchQuery } from "./place-search.js";
const CANONICAL_UTC_MILLISECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function requiredText(value, field) {
    const normalized = value.trim();
    if (normalized.length === 0)
        throw new Error(`${field} must be nonblank.`);
    return normalized;
}
function canonicalObservedAt(observedAt) {
    if (!CANONICAL_UTC_MILLISECOND.test(observedAt)) {
        throw new Error("observedAt must be an exact UTC-millisecond timestamp.");
    }
    const instant = Temporal.Instant.from(observedAt);
    if (instant.toString({ fractionalSecondDigits: 3 }) !== observedAt) {
        throw new Error("observedAt must be canonical.");
    }
    return observedAt;
}
export function createPlaceResolutionProvenance(input) {
    return {
        schemaVersion: 1,
        ownerId: requiredText(input.ownerId, "ownerId"),
        source: requiredText(input.source, "source"),
        query: clonePlaceSearchQuery(input.query),
        provider: requiredText(input.provider, "provider"),
        observedAt: canonicalObservedAt(input.observedAt),
    };
}
