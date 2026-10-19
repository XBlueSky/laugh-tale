export const ROUTE_VALIDATION_POLICY_V2 = {
    maxEndpointGapMeters: 2_000, maxPointDetourRatio: 8, pointDetourSlackMeters: 10_000,
    maxDurationMinutes: { walking: 720, transit: 1_440, driving: 1_440, flight: 2_880 },
    maxDistanceMeters: { walking: 100_000, transit: 2_000_000, driving: 2_000_000, flight: 22_000_000 },
    maxSpeedMetersPerSecond: { walking: 5, transit: 120, driving: 100, flight: 400 },
};
function record(value) { return typeof value === "object" && value !== null; }
function denseArray(value, guard) {
    if (!Array.isArray(value))
        return false;
    for (let index = 0; index < value.length; index += 1)
        if (!Object.hasOwn(value, index) || !guard(value[index]))
            return false;
    return true;
}
function validCoordinates(value) {
    if (!record(value))
        return false;
    return Number.isFinite(value.lat) && typeof value.lat === "number" && value.lat >= -90 && value.lat <= 90 &&
        Number.isFinite(value.lng) && typeof value.lng === "number" && value.lng >= -180 && value.lng <= 180;
}
function lineFact(value) {
    return record(value) && (value.name === undefined || typeof value.name === "string") &&
        (value.shortName === undefined || typeof value.shortName === "string");
}
function knownMode(mode) {
    switch (mode) {
        case "walking":
        case "transit":
        case "driving":
        case "flight": return true;
        default: return false;
    }
}
function unavailable(reason, guard) {
    return { status: "unavailable", reason, retryable: false, diagnostic: `route-validation:${guard}` };
}
function finiteThreshold(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
function table(policy, key, mode) {
    const candidate = record(policy) && record(policy[key]) ? policy[key][mode] : undefined;
    return finiteThreshold(candidate, ROUTE_VALIDATION_POLICY_V2[key][mode]);
}
function policyValue(policy, key) {
    return finiteThreshold(record(policy) ? policy[key] : undefined, ROUTE_VALIDATION_POLICY_V2[key]);
}
function haversineMeters(a, b) {
    const radians = Math.PI / 180;
    const dLat = (b.lat - a.lat) * radians;
    const dLng = (b.lng - a.lng) * radians;
    const sineLat = Math.sin(dLat / 2);
    const sineLng = Math.sin(dLng / 2);
    const raw = sineLat * sineLat + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * sineLng * sineLng;
    const arc = Math.min(1, Math.max(0, raw));
    const distance = 6_371_000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
    return Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY;
}
function endpoint(request, name) {
    const identity = request[name].identity;
    return identity.status === "resolved" && validCoordinates(identity.coordinates) ? identity.coordinates : undefined;
}
export function validateRouteProviderResult(request, result, policy = ROUTE_VALIDATION_POLICY_V2) {
    const raw = result;
    if (!record(raw))
        return unavailable("malformed-response", "result-shape");
    if (raw.status === "unavailable")
        return { ...raw };
    if (raw.status !== "ready")
        return unavailable("malformed-response", "status");
    if (!knownMode(request.edge.mode))
        return unavailable("unsupported", "unknown-mode");
    if (typeof raw.durationMinutes !== "number" || !Number.isFinite(raw.durationMinutes) || raw.durationMinutes < 0 ||
        (raw.distanceMeters !== undefined && (typeof raw.distanceMeters !== "number" || !Number.isFinite(raw.distanceMeters) || raw.distanceMeters < 0)) ||
        !denseArray(raw.steps, (value) => typeof value === "string"))
        return unavailable("malformed-response", "scalar-or-steps");
    let geometry;
    if (raw.geometry !== undefined) {
        if (!denseArray(raw.geometry, validCoordinates) || raw.geometry.length < 2)
            return unavailable("malformed-response", "geometry-shape");
        geometry = raw.geometry;
    }
    let lines;
    if (raw.transit !== undefined) {
        if (!record(raw.transit) || !denseArray(raw.transit.lines, lineFact))
            return unavailable("malformed-response", "transit-shape");
        lines = raw.transit.lines;
    }
    if (geometry !== undefined) {
        const origin = endpoint(request, "origin");
        const destination = endpoint(request, "destination");
        const first = geometry[0];
        const last = geometry[geometry.length - 1];
        if ((origin !== undefined && haversineMeters(origin, first) > policyValue(policy, "maxEndpointGapMeters")) ||
            (destination !== undefined && haversineMeters(destination, last) > policyValue(policy, "maxEndpointGapMeters")))
            return unavailable("implausible-result", "endpoint-gap");
        if (origin !== undefined && destination !== undefined) {
            const maximum = haversineMeters(origin, destination) * policyValue(policy, "maxPointDetourRatio") + policyValue(policy, "pointDetourSlackMeters");
            if (!Number.isFinite(maximum) || geometry.some((point) => {
                const detour = haversineMeters(origin, point) + haversineMeters(point, destination);
                return !Number.isFinite(detour) || detour > maximum;
            }))
                return unavailable("implausible-result", "point-detour");
        }
    }
    if (raw.durationMinutes > table(policy, "maxDurationMinutes", request.edge.mode))
        return unavailable("implausible-result", "duration-cap");
    if (raw.distanceMeters !== undefined && raw.distanceMeters > table(policy, "maxDistanceMeters", request.edge.mode))
        return unavailable("implausible-result", "distance-cap");
    if (raw.distanceMeters !== undefined) {
        const speed = raw.distanceMeters / (raw.durationMinutes * 60);
        if (!Number.isFinite(speed) || speed > table(policy, "maxSpeedMetersPerSecond", request.edge.mode))
            return unavailable("implausible-result", "speed-cap");
    }
    return {
        status: "ready", durationMinutes: raw.durationMinutes, ...(raw.distanceMeters === undefined ? {} : { distanceMeters: raw.distanceMeters }),
        steps: [...raw.steps], ...(geometry === undefined ? {} : { geometry: geometry.map((point) => ({ ...point })) }),
        ...(lines === undefined ? {} : { transit: { lines: lines.map((line) => ({ ...line })) } }),
    };
}
