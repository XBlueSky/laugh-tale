import { failure, fetchFailure, httpFailure } from "./provider-failure.js";
import { normalizeProviderLocation } from "./provider-location.js";
const endpoint = "https://routes.googleapis.com/directions/v2:computeRoutes";
export const GOOGLE_ROUTES_FIELD_MASK = "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline," +
    "routes.legs.steps.navigationInstruction.instructions," +
    "routes.legs.steps.transitDetails.transitLine.name," +
    "routes.legs.steps.transitDetails.transitLine.shortName";
const googleModes = {
    walking: "WALK",
    driving: "DRIVE",
    transit: "TRANSIT",
};
const canonicalTransitModes = ["subway", "rail", "bus"];
const googleTransitModes = {
    subway: "SUBWAY",
    rail: "TRAIN",
    bus: "BUS",
};
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
function neutralCoordinates(value) {
    if (!record(value) || !hasOwn(value, "lat") || !hasOwn(value, "lng"))
        return undefined;
    if (hasOwn(value, "latitude") || hasOwn(value, "longitude"))
        return undefined;
    const lat = get(value, "lat");
    const lng = get(value, "lng");
    return typeof lat === "number" &&
        Number.isFinite(lat) &&
        lat >= -90 &&
        lat <= 90 &&
        typeof lng === "number" &&
        Number.isFinite(lng) &&
        lng >= -180 &&
        lng <= 180
        ? { lat, lng }
        : undefined;
}
function target(value) {
    if (!record(value) || !hasOwn(value, "identity"))
        return undefined;
    const identity = get(value, "identity");
    if (!record(identity) || get(identity, "status") !== "resolved")
        return undefined;
    if ((!hasOwn(identity, "providerReference") && hasProperty(identity, "providerReference")) ||
        (!hasOwn(identity, "coordinates") && hasProperty(identity, "coordinates"))) {
        return undefined;
    }
    const reference = get(identity, "providerReference");
    if (hasOwn(identity, "providerReference") && record(reference) && get(reference, "provider") === "google") {
        const id = text(get(reference, "id"));
        if (hasOwn(reference, "provider") && hasOwn(reference, "id") && id)
            return { placeId: id };
    }
    const coordinates = hasOwn(identity, "coordinates")
        ? neutralCoordinates(get(identity, "coordinates"))
        : undefined;
    return coordinates
        ? {
            location: {
                latLng: { latitude: coordinates.lat, longitude: coordinates.lng },
            },
        }
        : undefined;
}
function validEndpoint(value) {
    if (!record(value) ||
        !hasOwn(value, "ownerId") ||
        !hasOwn(value, "label") ||
        !hasOwn(value, "identity")) {
        return false;
    }
    try {
        return text(value.ownerId) !== undefined &&
            text(value.label) !== undefined &&
            value.identity !== undefined;
    }
    catch {
        return false;
    }
}
function targetKey(value) {
    return target(value) ?? { invalid: text(get(value, "label")) ?? null };
}
function validEdge(value) {
    if (!record(value))
        return false;
    const required = [
        "id",
        "dayId",
        "fromNodeId",
        "toNodeId",
        "source",
        "mode",
        "certainty",
    ];
    for (const field of required) {
        if (!hasOwn(value, field))
            return false;
    }
    return true;
}
function allowedTransitModes(request) {
    if (get(get(request, "edge"), "mode") !== "transit")
        return { valid: true, modes: [] };
    if (!hasOwn(request, "transitPreferences")) {
        return hasProperty(request, "transitPreferences")
            ? { valid: false, modes: [] }
            : { valid: true, modes: [] };
    }
    const preferences = get(request, "transitPreferences");
    if (!record(preferences))
        return { valid: false, modes: [] };
    if (!hasOwn(preferences, "allowedModes")) {
        return hasProperty(preferences, "allowedModes")
            ? { valid: false, modes: [] }
            : { valid: true, modes: [] };
    }
    const raw = get(preferences, "allowedModes");
    try {
        if (!Array.isArray(raw))
            return { valid: false, modes: [] };
        const providerModes = raw;
        if (Object.getPrototypeOf(providerModes) !== Array.prototype ||
            Object.hasOwn(providerModes, "every") ||
            Object.hasOwn(providerModes, "filter")) {
            return { valid: false, modes: [] };
        }
        const requested = new Set();
        for (let index = 0; index < providerModes.length; index += 1) {
            if (!Object.hasOwn(providerModes, index))
                return { valid: false, modes: [] };
            const mode = providerModes[index];
            if (mode === "subway" || mode === "rail" || mode === "bus")
                requested.add(mode);
            else
                return { valid: false, modes: [] };
        }
        const normalized = [];
        for (const mode of canonicalTransitModes) {
            if (requested.has(mode))
                normalized.push(googleTransitModes[mode]);
        }
        return { valid: true, modes: normalized };
    }
    catch {
        return { valid: false, modes: [] };
    }
}
function cacheAtom(value) {
    if (value === null)
        return null;
    switch (typeof value) {
        case "string":
        case "boolean":
            return value;
        case "number":
            return Number.isFinite(value) ? value : `number:${String(value)}`;
        case "bigint":
            return `bigint:${value.toString()}`;
        case "symbol":
            return `symbol:${value.description ?? ""}`;
        case "function":
            return "function";
        case "undefined":
            return "undefined";
        default:
            return "object";
    }
}
export function routeRequestCacheKey(request) {
    try {
        const edge = get(request, "edge");
        return JSON.stringify({
            edge: {
                id: cacheAtom(get(edge, "id")),
                dayId: cacheAtom(get(edge, "dayId")),
                from: cacheAtom(get(edge, "fromNodeId")),
                to: cacheAtom(get(edge, "toNodeId")),
                source: cacheAtom(get(edge, "source")),
                mode: cacheAtom(get(edge, "mode")),
            },
            origin: targetKey(get(request, "origin")),
            destination: targetKey(get(request, "destination")),
            departureAt: text(get(request, "departureAt")) ?? null,
            transit: allowedTransitModes(request).modes,
        });
    }
    catch {
        return '{"edge":{"id":"invalid"},"origin":{"invalid":null},"destination":{"invalid":null},"departureAt":null,"transit":[]}';
    }
}
function clone(result) {
    if (result.status === "unavailable")
        return { ...result };
    return {
        ...result,
        steps: [...result.steps],
        ...(result.geometry
            ? { geometry: result.geometry.map((point) => ({ ...point })) }
            : {}),
        ...(result.transit
            ? { transit: { lines: result.transit.lines.map((line) => ({ ...line })) } }
            : {}),
    };
}
function duration(value) {
    const match = typeof value === "string" ? /^(\d+(?:\.\d+)?)s$/.exec(value) : null;
    const seconds = match ? Number(match[1]) : Number.NaN;
    return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds / 60) : undefined;
}
function polyline(value) {
    if (typeof value !== "string" || value.length === 0)
        return undefined;
    const encoded = value;
    let index = 0;
    let lat = 0;
    let lng = 0;
    const points = [];
    function next() {
        let result = 0;
        let shift = 0;
        while (index < encoded.length) {
            const part = encoded.charCodeAt(index) - 63;
            index += 1;
            if (part < 0 || part > 63)
                throw new Error("invalid polyline");
            result |= (part & 31) << shift;
            if (part < 32)
                return result & 1 ? ~(result >> 1) : result >> 1;
            shift += 5;
        }
        throw new Error("truncated polyline");
    }
    try {
        while (index < encoded.length) {
            lat += next();
            lng += next();
            const point = normalizeProviderLocation({ lat: lat / 1e5, lng: lng / 1e5 });
            if (!point)
                return undefined;
            points.push(point);
        }
    }
    catch {
        return undefined;
    }
    return points.length >= 2 ? points : undefined;
}
function normalizePayload(payload) {
    if (!record(payload))
        return failure("malformed-response");
    const routes = get(payload, "routes");
    if (!Array.isArray(routes))
        return failure("malformed-response");
    const providerRoutes = routes;
    if (providerRoutes.length === 0)
        return failure("not-found");
    if (!Object.hasOwn(providerRoutes, 0))
        return failure("malformed-response");
    const route = providerRoutes[0];
    if (!record(route))
        return failure("malformed-response");
    const durationMinutes = duration(get(route, "duration"));
    if (durationMinutes === undefined)
        return failure("malformed-response");
    const steps = [];
    const lines = [];
    const knownLines = new Set();
    const legs = get(route, "legs");
    if (hasOwn(route, "legs")) {
        if (!Array.isArray(legs))
            return failure("malformed-response");
        const providerLegs = legs;
        for (let legIndex = 0; legIndex < providerLegs.length; legIndex += 1) {
            if (!Object.hasOwn(providerLegs, legIndex))
                return failure("malformed-response");
            const leg = providerLegs[legIndex];
            if (!record(leg))
                return failure("malformed-response");
            if (!hasOwn(leg, "steps"))
                continue;
            const legSteps = get(leg, "steps");
            if (!Array.isArray(legSteps))
                return failure("malformed-response");
            const providerSteps = legSteps;
            for (let stepIndex = 0; stepIndex < providerSteps.length; stepIndex += 1) {
                if (!Object.hasOwn(providerSteps, stepIndex))
                    return failure("malformed-response");
                const step = providerSteps[stepIndex];
                if (!record(step))
                    return failure("malformed-response");
                const instruction = text(get(get(step, "navigationInstruction"), "instructions"));
                if (instruction)
                    steps.push(instruction);
                const transitLine = get(get(step, "transitDetails"), "transitLine");
                const name = text(get(transitLine, "name"));
                const shortName = text(get(transitLine, "shortName"));
                if (!name && !shortName)
                    continue;
                const fact = {
                    ...(name ? { name } : {}),
                    ...(shortName ? { shortName } : {}),
                };
                const lineKey = `${name ?? ""}\u0000${shortName ?? ""}`;
                if (!knownLines.has(lineKey)) {
                    knownLines.add(lineKey);
                    lines.push(fact);
                }
            }
        }
    }
    let geometry;
    if (hasOwn(route, "polyline")) {
        const providerPolyline = get(route, "polyline");
        if (!record(providerPolyline) || !hasOwn(providerPolyline, "encodedPolyline")) {
            return failure("malformed-response");
        }
        geometry = polyline(get(providerPolyline, "encodedPolyline"));
        if (!geometry)
            return failure("malformed-response");
    }
    const rawDistance = get(route, "distanceMeters");
    const distanceMeters = typeof rawDistance === "number" && Number.isFinite(rawDistance) && rawDistance >= 0
        ? rawDistance
        : undefined;
    if (hasOwn(route, "distanceMeters") && distanceMeters === undefined)
        return failure("malformed-response");
    return {
        status: "ready",
        durationMinutes,
        steps,
        ...(distanceMeters === undefined ? {} : { distanceMeters }),
        ...(geometry ? { geometry } : {}),
        ...(lines.length > 0 ? { transit: { lines } } : {}),
    };
}
function normalize(payload) {
    try {
        return normalizePayload(payload);
    }
    catch {
        return failure("malformed-response");
    }
}
function optionsValue(options, key) {
    return get(options, key);
}
function defaultFetch() {
    return typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined;
}
export class GoogleRouteAdapter {
    apiKey;
    fetcher;
    transitEnabled;
    cache = new Map();
    inFlight = new Map();
    constructor(options) {
        this.apiKey = text(optionsValue(options, "apiKey")) ?? "";
        const suppliedFetch = optionsValue(options, "fetch");
        this.fetcher = hasOwn(options, "fetch")
            ? typeof suppliedFetch === "function"
                ? suppliedFetch
                : undefined
            : defaultFetch();
        this.transitEnabled = optionsValue(options, "transitEnabled") === true;
    }
    load(request, signal) {
        if (!abortSignal(signal) || isAborted(signal))
            return Promise.resolve(failure("cancelled"));
        if (!this.apiKey || !this.fetcher)
            return Promise.resolve(failure("missing-configuration"));
        const edge = get(request, "edge");
        if (!record(request) || !validEdge(edge))
            return Promise.resolve(failure("unsupported"));
        const mode = get(edge, "mode");
        const transitModes = allowedTransitModes(request);
        const origin = get(request, "origin");
        const destination = get(request, "destination");
        if (!hasOwn(request, "edge") ||
            !hasOwn(request, "origin") ||
            !hasOwn(request, "destination") ||
            !hasOwn(edge, "mode") ||
            (mode !== "walking" && mode !== "driving" && mode !== "transit") ||
            (mode === "transit" && !this.transitEnabled) ||
            !validEndpoint(origin) ||
            !validEndpoint(destination) ||
            !target(origin) ||
            !target(destination)) {
            return Promise.resolve(failure("unsupported"));
        }
        if (!transitModes.valid)
            return Promise.resolve(failure("malformed-response"));
        const key = routeRequestCacheKey(request);
        const cached = this.cache.get(key);
        if (cached)
            return Promise.resolve(clone(cached));
        const entry = this.inFlight.get(key) ?? this.start(key, request);
        return this.subscribe(key, entry, signal);
    }
    start(key, request) {
        const controller = new AbortController();
        const entry = {
            controller,
            subscribers: 0,
            promise: this.resolve(request, controller.signal).then((result) => {
                if (result.status === "ready" && !isAborted(controller.signal)) {
                    this.cache.set(key, clone(result));
                }
                return result;
            }).catch(() => failure("malformed-response")),
        };
        this.inFlight.set(key, entry);
        const cleanup = () => {
            if (this.inFlight.get(key) === entry)
                this.inFlight.delete(key);
        };
        void entry.promise.then(cleanup, cleanup);
        return entry;
    }
    subscribe(key, entry, signal) {
        entry.subscribers += 1;
        return new Promise((resolve) => {
            let done = false;
            const finish = (result, cancelled) => {
                if (done)
                    return;
                done = true;
                removeAbortListener(signal, onAbort);
                entry.subscribers -= 1;
                if (cancelled && entry.subscribers === 0) {
                    if (this.inFlight.get(key) === entry)
                        this.inFlight.delete(key);
                    entry.controller.abort();
                }
                resolve(clone(result));
            };
            const onAbort = () => finish(failure("cancelled"), true);
            if (!addAbortListener(signal, onAbort)) {
                finish(failure("cancelled"), true);
                return;
            }
            if (isAborted(signal))
                onAbort();
            void entry.promise.then((result) => finish(result, false), () => finish(isAborted(signal) ? failure("cancelled") : failure("malformed-response"), false));
        });
    }
    async resolve(request, signal) {
        const origin = target(get(request, "origin"));
        const destination = target(get(request, "destination"));
        const mode = get(get(request, "edge"), "mode");
        if (!origin || !destination || (mode !== "walking" && mode !== "driving" && mode !== "transit")) {
            return failure("unsupported");
        }
        const base = { origin, destination, travelMode: googleModes[mode] };
        const departureTime = text(get(request, "departureAt"));
        const allowed = allowedTransitModes(request);
        if (!allowed.valid)
            return failure("malformed-response");
        const attempts = [];
        if (mode === "transit") {
            attempts.push({
                ...base,
                ...(departureTime ? { departureTime } : {}),
                ...(allowed.modes.length > 0
                    ? { transitPreferences: { allowedTravelModes: allowed.modes } }
                    : {}),
            });
            if (allowed.modes.length > 0) {
                attempts.push({ ...base, ...(departureTime ? { departureTime } : {}) });
            }
            if (departureTime)
                attempts.push(base);
        }
        else {
            attempts.push(base);
        }
        let result = failure("not-found");
        for (const body of attempts) {
            if (isAborted(signal))
                return failure("cancelled");
            result = await this.fetch(body, signal);
            if (isAborted(signal))
                return failure("cancelled");
            if (result.status === "ready" || result.reason === "cancelled")
                return result;
        }
        return result;
    }
    async fetch(body, signal) {
        if (isAborted(signal))
            return failure("cancelled");
        try {
            const response = await this.fetcher(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": this.apiKey,
                    "X-Goog-FieldMask": GOOGLE_ROUTES_FIELD_MASK,
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
            if (isAborted(signal))
                return failure("cancelled");
            if (typeof response.json !== "function")
                return failure("malformed-response");
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
