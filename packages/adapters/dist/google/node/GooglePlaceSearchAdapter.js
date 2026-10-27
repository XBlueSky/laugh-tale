import { failure, fetchFailure, httpFailure } from "../provider-failure.js";
import { normalizeProviderLocation } from "../provider-location.js";
const endpoint = "https://places.googleapis.com/v1/places:searchText";
export const GOOGLE_PLACES_SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.types";
function record(value) {
    if (typeof value !== "object" || value === null)
        return false;
    try {
        return !Array.isArray(value);
    }
    catch {
        return false;
    }
}
function get(value, key) {
    if (!record(value))
        return undefined;
    try {
        return Object.hasOwn(value, key) ? value[key] : undefined;
    }
    catch {
        return undefined;
    }
}
function hasOwn(value, key) {
    if (!record(value))
        return false;
    try {
        return Object.hasOwn(value, key);
    }
    catch {
        return false;
    }
}
function hasProperty(value, key) {
    if (!record(value))
        return false;
    try {
        return key in value;
    }
    catch {
        return false;
    }
}
function text(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
function abortSignal(value) {
    try {
        return value instanceof AbortSignal;
    }
    catch {
        return false;
    }
}
function isAborted(signal) {
    try {
        return signal.aborted;
    }
    catch {
        return true;
    }
}
function addAbortListener(signal, listener) {
    try {
        signal.addEventListener("abort", listener, { once: true });
        return true;
    }
    catch {
        return false;
    }
}
function removeAbortListener(signal, listener) {
    try {
        signal.removeEventListener("abort", listener);
    }
    catch {
        // A hostile signal must not prevent settlement.
    }
}
function validQuery(value) {
    if (!record(value) ||
        !hasOwn(value, "ownerId") ||
        !hasOwn(value, "text") ||
        !hasOwn(value, "locale") ||
        !hasOwn(value, "maxCandidates") ||
        get(value, "maxCandidates") !== 3) {
        return false;
    }
    if (!text(get(value, "ownerId")) || !text(get(value, "text")) || !text(get(value, "locale"))) {
        return false;
    }
    const regionCode = get(value, "regionCode");
    if (!hasOwn(value, "regionCode") && hasProperty(value, "regionCode"))
        return false;
    if (regionCode !== undefined && (typeof regionCode !== "string" || !/^[A-Z]{2}$/.test(regionCode))) {
        return false;
    }
    const bias = get(value, "locationBias");
    if (bias === undefined) {
        return hasOwn(value, "locationBias") || !hasProperty(value, "locationBias");
    }
    if (!hasOwn(value, "locationBias") || !record(bias))
        return false;
    const center = get(bias, "center");
    const lat = get(center, "lat");
    const lng = get(center, "lng");
    const radius = get(bias, "radiusMeters");
    return (hasOwn(bias, "center") &&
        hasOwn(bias, "radiusMeters") &&
        hasOwn(center, "lat") &&
        hasOwn(center, "lng") &&
        typeof lat === "number" &&
        Number.isFinite(lat) &&
        lat >= -90 &&
        lat <= 90 &&
        typeof lng === "number" &&
        Number.isFinite(lng) &&
        lng >= -180 &&
        lng <= 180 &&
        typeof radius === "number" &&
        Number.isFinite(radius) &&
        radius > 0 &&
        radius <= 50_000);
}
function raceCancellation(signal, work) {
    if (isAborted(signal))
        return Promise.resolve(failure("cancelled"));
    return new Promise((resolve) => {
        let settled = false;
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            removeAbortListener(signal, onAbort);
            resolve(result);
        };
        const onAbort = () => finish(failure("cancelled"));
        if (!addAbortListener(signal, onAbort)) {
            finish(failure("cancelled"));
            return;
        }
        if (isAborted(signal)) {
            onAbort();
            return;
        }
        let operation;
        try {
            operation = work();
        }
        catch (error) {
            finish(isAborted(signal) ? failure("cancelled") : fetchFailure(error));
            return;
        }
        void Promise.resolve(operation).then((result) => finish(isAborted(signal) ? failure("cancelled") : result), (error) => finish(isAborted(signal) ? failure("cancelled") : fetchFailure(error)));
    });
}
function categories(value) {
    try {
        if (!Array.isArray(value))
            return { valid: false };
        const normalized = [];
        for (let index = 0; index < value.length; index += 1) {
            if (!Object.hasOwn(value, index))
                return { valid: false };
            const category = value[index];
            if (typeof category !== "string")
                continue;
            const normalizedCategory = text(category);
            if (normalizedCategory)
                normalized.push(normalizedCategory);
        }
        return { valid: true, values: normalized };
    }
    catch {
        return { valid: false };
    }
}
function candidate(value) {
    if (!record(value) || !hasOwn(value, "id") || !hasOwn(value, "displayName"))
        return undefined;
    const id = text(get(value, "id"));
    const providerDisplayName = get(value, "displayName");
    if (!record(providerDisplayName) || !hasOwn(providerDisplayName, "text"))
        return undefined;
    const displayName = text(get(providerDisplayName, "text"));
    if (!id || !displayName)
        return undefined;
    let coordinates;
    if (hasOwn(value, "location")) {
        coordinates = normalizeProviderLocation(get(value, "location"));
        if (!coordinates)
            return undefined;
    }
    let formattedAddress;
    if (hasOwn(value, "formattedAddress")) {
        formattedAddress = text(get(value, "formattedAddress"));
        if (!formattedAddress)
            return undefined;
    }
    let normalizedCategories = [];
    if (hasOwn(value, "types")) {
        const result = categories(get(value, "types"));
        if (!result.valid)
            return undefined;
        normalizedCategories = result.values;
    }
    return {
        providerReference: { provider: "google", id },
        displayName,
        ...(coordinates ? { coordinates } : {}),
        ...(formattedAddress ? { formattedAddress } : {}),
        categories: normalizedCategories,
    };
}
function normalizePayload(payload) {
    if (!record(payload) || !hasOwn(payload, "places"))
        return failure("malformed-response");
    const places = get(payload, "places");
    if (!Array.isArray(places))
        return failure("malformed-response");
    if (places.length === 0)
        return failure("not-found");
    const candidates = [];
    for (let index = 0; index < places.length && candidates.length < 3; index += 1) {
        if (!Object.hasOwn(places, index))
            continue;
        const normalized = candidate(places[index]);
        if (normalized)
            candidates.push(normalized);
    }
    return candidates.length > 0
        ? { status: "ready", candidates }
        : failure("malformed-response");
}
function normalize(payload) {
    try {
        return normalizePayload(payload);
    }
    catch {
        return failure("malformed-response");
    }
}
export class GooglePlaceSearchAdapter {
    key;
    fetcher;
    constructor(options) {
        this.key = text(get(options, "apiKey")) ?? "";
        const suppliedFetch = get(options, "fetch");
        this.fetcher = hasOwn(options, "fetch") && typeof suppliedFetch === "function"
            ? suppliedFetch
            : undefined;
    }
    search(query, signal) {
        if (!abortSignal(signal) || isAborted(signal))
            return Promise.resolve(failure("cancelled"));
        if (!this.key || !this.fetcher)
            return Promise.resolve(failure("missing-configuration"));
        if (!validQuery(query))
            return Promise.resolve(failure("unsupported"));
        return raceCancellation(signal, () => this.perform(query, signal));
    }
    async perform(query, signal) {
        if (isAborted(signal))
            return failure("cancelled");
        try {
            const body = {
                textQuery: text(get(query, "text")),
                languageCode: text(get(query, "locale")),
                ...(get(query, "regionCode") ? { regionCode: get(query, "regionCode") } : {}),
                pageSize: 3,
                ...(get(query, "locationBias")
                    ? {
                        locationBias: {
                            circle: {
                                center: {
                                    latitude: get(get(get(query, "locationBias"), "center"), "lat"),
                                    longitude: get(get(get(query, "locationBias"), "center"), "lng"),
                                },
                                radius: get(get(query, "locationBias"), "radiusMeters"),
                            },
                        },
                    }
                    : {}),
            };
            const response = await this.fetcher(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": this.key,
                    "X-Goog-FieldMask": GOOGLE_PLACES_SEARCH_FIELD_MASK,
                },
                body: JSON.stringify(body),
                signal,
            });
            if (isAborted(signal))
                return failure("cancelled");
            if (!response || typeof response.ok !== "boolean" || typeof response.status !== "number") {
                return failure("malformed-response");
            }
            if (!response.ok)
                return httpFailure(response.status);
            if (typeof response.json !== "function")
                return failure("malformed-response");
            if (isAborted(signal))
                return failure("cancelled");
            let payload;
            try {
                payload = await response.json();
            }
            catch {
                return isAborted(signal) ? failure("cancelled") : failure("malformed-response");
            }
            if (isAborted(signal))
                return failure("cancelled");
            return normalize(payload);
        }
        catch (error) {
            return isAborted(signal) ? failure("cancelled") : fetchFailure(error);
        }
    }
}
