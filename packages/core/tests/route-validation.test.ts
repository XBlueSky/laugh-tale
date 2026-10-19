import { describe, expect, it } from "vitest";

import {
  ROUTE_VALIDATION_POLICY_V2,
  validateRouteProviderResult,
  type RouteProviderResult,
  type RouteRequestV2,
  type RouteValidationPolicyV2,
} from "@laugh-tale-island/core";

function request(mode: RouteRequestV2["edge"]["mode"] = "walking"): RouteRequestV2 {
  return {
    edge: {
      id: "walk",
      dayId: "day-one",
      fromNodeId: "from",
      toNodeId: "to",
      mode,
      source: "provider",
      certainty: "suggested",
    },
    origin: {
      ownerId: "from",
      label: "From",
      identity: { status: "resolved", coordinates: { lat: 35.6812, lng: 139.7671 } },
    },
    destination: {
      ownerId: "to",
      label: "To",
      identity: { status: "resolved", coordinates: { lat: 35.6895, lng: 139.6917 } },
    },
  };
}

function ready(overrides: Partial<Extract<RouteProviderResult, { status: "ready" }>> = {}): Extract<RouteProviderResult, { status: "ready" }> {
  return {
    status: "ready",
    durationMinutes: 30,
    distanceMeters: 7_300,
    steps: ["Walk", "Arrive"],
    geometry: [
      { lat: 35.6812, lng: 139.7671 },
      { lat: 35.6895, lng: 139.6917 },
    ],
    ...overrides,
  };
}

function expectUnavailable(
  value: RouteProviderResult,
  reason: "malformed-response" | "implausible-result" | "unsupported",
): void {
  expect(value).toMatchObject({ status: "unavailable", reason, retryable: false });
  expect(value.status === "unavailable" ? value.diagnostic : undefined).toEqual(expect.any(String));
}

describe("validateRouteProviderResult", () => {
  it("clones and retains a valid Tokyo-scale walking path", () => {
    const result = ready();
    const validated = validateRouteProviderResult(request(), result);

    expect(validated).toEqual(result);
    expect(validated).not.toBe(result);
    if (validated.status === "ready") {
      expect(validated.geometry).not.toBe(result.geometry);
      expect(validated.geometry?.[0]).not.toBe(result.geometry?.[0]);
    }
  });

  it("retains ready non-geometry duration, distance, steps, and transit facts", () => {
    const result = ready({
      geometry: undefined,
      transit: { lines: [{ name: "Ginza", shortName: "G" }] },
    });

    expect(validateRouteProviderResult(request("transit"), result)).toEqual(result);
  });

  it("retains settled unavailable facts while defensively cloning", () => {
    const result: RouteProviderResult = {
      status: "unavailable",
      reason: "network",
      retryable: true,
      diagnostic: "provider timed out",
    };
    const validated = validateRouteProviderResult(request(), result);

    expect(validated).toEqual(result);
    expect(validated).not.toBe(result);
  });

  it.each([
    ["NaN coordinate", ready({ geometry: [{ lat: Number.NaN, lng: 139 }, { lat: 35, lng: 139 }] })],
    ["infinite coordinate", ready({ geometry: [{ lat: Infinity, lng: 139 }, { lat: 35, lng: 139 }] })],
    ["out-of-world coordinate", ready({ geometry: [{ lat: 95, lng: 139 }, { lat: 35, lng: 139 }] })],
    ["one-point path", ready({ geometry: [{ lat: 35, lng: 139 }] })],
    ["negative duration", ready({ durationMinutes: -1 })],
    ["negative distance", ready({ distanceMeters: -1 })],
    ["non-string step", ready({ steps: ["Walk", 42] as unknown as readonly string[] })],
  ])("quarantines malformed %s", (_name, result) => {
    expectUnavailable(validateRouteProviderResult(request(), result), "malformed-response");
  });

  it("rejects first and final geometry points beyond the endpoint gap", () => {
    const policy = { ...ROUTE_VALIDATION_POLICY_V2, maxEndpointGapMeters: 10 };
    expectUnavailable(
      validateRouteProviderResult(request(), ready({ geometry: [{ lat: 35.7, lng: 139.8 }, { lat: 35.6895, lng: 139.6917 }] }), policy),
      "implausible-result",
    );
    expectUnavailable(
      validateRouteProviderResult(request(), ready({ geometry: [{ lat: 35.6812, lng: 139.7671 }, { lat: 35.7, lng: 139.8 }] }), policy),
      "implausible-result",
    );
  });

  it("rejects a decoded middle point outside the point-detour corridor", () => {
    const policy = { ...ROUTE_VALIDATION_POLICY_V2, maxPointDetourRatio: 1, pointDetourSlackMeters: 0 };
    expectUnavailable(
      validateRouteProviderResult(request(), ready({
        geometry: [
          { lat: 35.6812, lng: 139.7671 },
          { lat: 35.55, lng: 139.55 },
          { lat: 35.6895, lng: 139.6917 },
        ],
      }), policy),
      "implausible-result",
    );
  });

  it("applies the exact exported walking thresholds", () => {
    expect(ROUTE_VALIDATION_POLICY_V2.maxDurationMinutes.walking).toBe(720);
    expect(ROUTE_VALIDATION_POLICY_V2.maxDistanceMeters.walking).toBe(100_000);
    expectUnavailable(validateRouteProviderResult(request(), ready({ durationMinutes: 172_703 })), "implausible-result");
    expectUnavailable(validateRouteProviderResult(request(), ready({ distanceMeters: 100_001 })), "implausible-result");
    expectUnavailable(validateRouteProviderResult(request(), ready({ distanceMeters: 10_000, durationMinutes: 1 })), "implausible-result");
  });

  it("quarantines ready unknown-mode geometry before presentation", () => {
    expectUnavailable(validateRouteProviderResult(request("unknown"), ready()), "unsupported");
  });

  it("retains plausible flights but applies explicit flight caps", () => {
    const flight = request("flight");
    const plausible = ready({ durationMinutes: 60, distanceMeters: 35_000 });
    expect(validateRouteProviderResult(flight, plausible)).toEqual(plausible);
    expectUnavailable(
      validateRouteProviderResult(flight, ready({ durationMinutes: ROUTE_VALIDATION_POLICY_V2.maxDurationMinutes.flight + 1 })),
      "implausible-result",
    );
  });

  it("never mutates the request or provider result", () => {
    const sourceRequest = request();
    const sourceResult = ready();
    const requestBefore = structuredClone(sourceRequest);
    const resultBefore = structuredClone(sourceResult);

    validateRouteProviderResult(sourceRequest, sourceResult);

    expect(sourceRequest).toEqual(requestBefore);
    expect(sourceResult).toEqual(resultBefore);
  });

  it("fails closed for non-array and sparse provider collections and invalid transit facts", () => {
    const sparseSteps = new Array<string>(2);
    sparseSteps[0] = "Walk";
    const sparseGeometry = new Array<{ lat: number; lng: number }>(2);
    sparseGeometry[0] = { lat: 35.6812, lng: 139.7671 };
    const malformed: unknown[] = [
      { ...ready(), steps: "Walk" },
      { ...ready(), steps: sparseSteps },
      { ...ready(), geometry: "line" },
      { ...ready(), geometry: sparseGeometry },
      { ...ready(), transit: { lines: null } },
      { ...ready(), transit: { lines: [{ name: 12 }] } },
      { ...ready(), transit: null },
    ];
    for (const result of malformed) {
      expect(() => validateRouteProviderResult(request(), result as RouteProviderResult)).not.toThrow();
      expectUnavailable(validateRouteProviderResult(request(), result as RouteProviderResult), "malformed-response");
    }
  });

  it("clones accepted nested transit facts", () => {
    const result = ready({ transit: { lines: [{ name: "Line", shortName: "L" }] } });
    const validated = validateRouteProviderResult(request(), result);
    expect(validated).toEqual(result);
    if (validated.status === "ready") {
      expect(validated.transit).not.toBe(result.transit);
      expect(validated.transit?.lines[0]).not.toBe(result.transit?.lines[0]);
    }
  });

  it("uses the complete exact default policy and permits values at every cap", () => {
    expect(ROUTE_VALIDATION_POLICY_V2).toEqual({
      maxEndpointGapMeters: 2_000, maxPointDetourRatio: 8, pointDetourSlackMeters: 10_000,
      maxDurationMinutes: { walking: 720, transit: 1_440, driving: 1_440, flight: 2_880 },
      maxDistanceMeters: { walking: 100_000, transit: 2_000_000, driving: 2_000_000, flight: 22_000_000 },
      maxSpeedMetersPerSecond: { walking: 5, transit: 120, driving: 100, flight: 400 },
    });
    expect(validateRouteProviderResult(request(), ready({ durationMinutes: 720, distanceMeters: 100_000 }))).toMatchObject({ status: "ready" });
  });

  it("normalizes malformed injected policy values without disabling guards", () => {
    const poisoned = {
      ...ROUTE_VALIDATION_POLICY_V2,
      maxEndpointGapMeters: Number.NaN,
      maxDurationMinutes: { ...ROUTE_VALIDATION_POLICY_V2.maxDurationMinutes, walking: Number.NaN },
      maxDistanceMeters: { ...ROUTE_VALIDATION_POLICY_V2.maxDistanceMeters, walking: undefined },
      maxSpeedMetersPerSecond: { ...ROUTE_VALIDATION_POLICY_V2.maxSpeedMetersPerSecond, walking: Number.NaN },
    } as unknown as RouteValidationPolicyV2;
    expectUnavailable(validateRouteProviderResult(request(), ready({ durationMinutes: 721 }), poisoned), "implausible-result");
    const small = { ...ROUTE_VALIDATION_POLICY_V2, maxEndpointGapMeters: 1 };
    expectUnavailable(validateRouteProviderResult(request(), ready({ geometry: [{ lat: 35.7, lng: 139.8 }, { lat: 35.6895, lng: 139.6917 }] }), small), "implausible-result");
  });

  it("treats runtime modes outside the explicit switch as unsupported", () => {
    const malformedRequest = request();
    (malformedRequest.edge as { mode: string }).mode = "constructor";
    expectUnavailable(validateRouteProviderResult(malformedRequest, ready()), "unsupported");
  });

  it("fails closed for near-antipodal rounding and a remote endpoint", () => {
    const polar = request();
    polar.origin.identity = { status: "resolved", coordinates: { lat: 0, lng: 0 } };
    polar.destination.identity = { status: "resolved", coordinates: { lat: 0, lng: 179.99999999999997 } };
    expectUnavailable(validateRouteProviderResult(polar, ready({ geometry: [{ lat: 0, lng: 0 }, { lat: 20, lng: 160 }] })), "implausible-result");
  });

  it("applies all flight geometry, endpoint, corridor, distance, and speed guards", () => {
    const flight = request("flight");
    const invalids: Array<Extract<RouteProviderResult, { status: "ready" }>> = [
      ready({ geometry: [{ lat: 35, lng: 139 }] }),
      ready({ geometry: [{ lat: 0, lng: 0 }, { lat: 35.6895, lng: 139.6917 }] }),
      ready({ geometry: [{ lat: 35.6812, lng: 139.7671 }, { lat: -30, lng: 0 }, { lat: 35.6895, lng: 139.6917 }] }),
      ready({ distanceMeters: 22_000_001, durationMinutes: 2_880 }),
      ready({ distanceMeters: 1_000_000, durationMinutes: 1 }),
    ];
    for (const result of invalids) expectUnavailable(validateRouteProviderResult(flight, result), result.geometry?.length === 1 ? "malformed-response" : "implausible-result");
    expect(validateRouteProviderResult(flight, ready({ durationMinutes: 180, distanceMeters: 120_000 }))).toMatchObject({ status: "ready" });
  });
});
