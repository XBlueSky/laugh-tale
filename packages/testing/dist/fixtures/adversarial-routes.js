function deepFreeze(value, seen = new Set()) {
    if (typeof value !== "object" || value === null || seen.has(value))
        return value;
    seen.add(value);
    for (const key of Reflect.ownKeys(value))
        deepFreeze(value[key], seen);
    return Object.freeze(value);
}
function request(id, mode = "walking", destination = { lat: 10.01, lng: 20.01 }) {
    return {
        edge: { id, dayId: "day-route-fixtures", fromNodeId: "origin", toNodeId: "destination", mode, source: "provider", certainty: "suggested" },
        origin: { ownerId: "origin", label: "Synthetic origin", identity: { status: "resolved", coordinates: { lat: 10, lng: 20 } } },
        destination: { ownerId: "destination", label: "Synthetic destination", identity: { status: "resolved", coordinates: destination } },
    };
}
function ready(overrides = {}) {
    return { status: "ready", durationMinutes: 30, distanceMeters: 1_500, steps: ["Follow the synthetic route"], geometry: [{ lat: 10, lng: 20 }, { lat: 10.01, lng: 20.01 }], ...overrides };
}
const fixtures = {
    valid: { request: request("valid"), result: ready(), expected: { status: "ready" } },
    validFlight: { request: request("valid-flight", "flight", { lat: 11, lng: 21 }), result: ready({ durationMinutes: 90, distanceMeters: 160_000, geometry: [{ lat: 10, lng: 20 }, { lat: 11, lng: 21 }] }), expected: { status: "ready" } },
    malformedCoordinate: { request: request("malformed-coordinate"), result: ready({ geometry: [{ lat: Number.NaN, lng: 20 }, { lat: 10.01, lng: 20.01 }] }), expected: { status: "unavailable", reason: "malformed-response" } },
    onePoint: { request: request("one-point"), result: ready({ geometry: [{ lat: 10, lng: 20 }] }), expected: { status: "unavailable", reason: "malformed-response" } },
    endpointMismatch: { request: request("endpoint-mismatch"), result: ready({ geometry: [{ lat: 20, lng: 30 }, { lat: 10.01, lng: 20.01 }] }), expected: { status: "unavailable", reason: "implausible-result" } },
    remoteMiddlePoint: { request: request("remote-middle"), result: ready({ geometry: [{ lat: 10, lng: 20 }, { lat: 50, lng: 60 }, { lat: 10.01, lng: 20.01 }] }), expected: { status: "unavailable", reason: "implausible-result" } },
    implausibleDuration: { request: request("implausible-duration"), result: ready({ durationMinutes: 721 }), expected: { status: "unavailable", reason: "implausible-result" } },
    implausibleFlight: { request: request("implausible-flight", "flight", { lat: 11, lng: 21 }), result: ready({ durationMinutes: 2_881, distanceMeters: 160_000, geometry: [{ lat: 10, lng: 20 }, { lat: 11, lng: 21 }] }), expected: { status: "unavailable", reason: "implausible-result" } },
    unsupportedUnknown: { request: request("unsupported-unknown", "unknown"), result: ready(), expected: { status: "unavailable", reason: "unsupported" } },
};
export const adversarialRouteFixtures = deepFreeze(fixtures);
