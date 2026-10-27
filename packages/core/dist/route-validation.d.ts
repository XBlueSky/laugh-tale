import type { RouteProviderResult, RouteRequestV2 } from "./route-runtime.js";
export interface RouteValidationPolicyV2 {
    maxEndpointGapMeters: number;
    maxPointDetourRatio: number;
    pointDetourSlackMeters: number;
    maxDurationMinutes: Readonly<Record<"walking" | "transit" | "driving" | "flight", number>>;
    maxDistanceMeters: Readonly<Record<"walking" | "transit" | "driving" | "flight", number>>;
    maxSpeedMetersPerSecond: Readonly<Record<"walking" | "transit" | "driving" | "flight", number>>;
}
export declare const ROUTE_VALIDATION_POLICY_V2: RouteValidationPolicyV2;
export declare function validateRouteProviderResult(request: RouteRequestV2, result: RouteProviderResult, policy?: RouteValidationPolicyV2): RouteProviderResult;
