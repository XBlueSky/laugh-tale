import type { Coordinates, ResolvedPlaceIdentity, RouteEdge } from "./model.js";
import type { ProviderUnavailableResult } from "./provider-failure.js";
export interface RouteEndpointV2 {
    ownerId: string;
    label: string;
    identity: ResolvedPlaceIdentity;
}
export interface RouteRequestV2 {
    edge: RouteEdge;
    origin: RouteEndpointV2;
    destination: RouteEndpointV2;
    departureAt?: string;
    transitPreferences?: {
        allowedModes?: readonly ("subway" | "rail" | "bus")[];
    };
}
export interface TransitLineFact {
    name?: string;
    shortName?: string;
}
export interface RouteProviderReadyResult {
    status: "ready";
    durationMinutes: number;
    distanceMeters?: number;
    steps: readonly string[];
    geometry?: readonly Coordinates[];
    transit?: {
        lines: readonly TransitLineFact[];
    };
}
export type RouteProviderResult = RouteProviderReadyResult | ProviderUnavailableResult;
export type RouteRuntimeState = {
    status: "idle";
} | {
    status: "loading";
} | RouteProviderResult;
