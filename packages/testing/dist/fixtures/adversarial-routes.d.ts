import type { RouteProviderResult, RouteRequestV2 } from "@laugh-tale-island/core";
export interface AdversarialRouteFixture {
    readonly request: RouteRequestV2;
    readonly result: RouteProviderResult;
    readonly expected: {
        readonly status: "ready";
    } | {
        readonly status: "unavailable";
        readonly reason: "malformed-response" | "implausible-result" | "unsupported";
    };
}
export declare const adversarialRouteFixtures: {
    valid: {
        request: RouteRequestV2;
        result: import("@laugh-tale-island/core").RouteProviderReadyResult;
        expected: {
            status: "ready";
        };
    };
    validFlight: {
        request: RouteRequestV2;
        result: import("@laugh-tale-island/core").RouteProviderReadyResult;
        expected: {
            status: "ready";
        };
    };
    malformedCoordinate: {
        request: RouteRequestV2;
        result: import("@laugh-tale-island/core").RouteProviderReadyResult;
        expected: {
            status: "unavailable";
            reason: "malformed-response";
        };
    };
    onePoint: {
        request: RouteRequestV2;
        result: import("@laugh-tale-island/core").RouteProviderReadyResult;
        expected: {
            status: "unavailable";
            reason: "malformed-response";
        };
    };
    endpointMismatch: {
        request: RouteRequestV2;
        result: import("@laugh-tale-island/core").RouteProviderReadyResult;
        expected: {
            status: "unavailable";
            reason: "implausible-result";
        };
    };
    remoteMiddlePoint: {
        request: RouteRequestV2;
        result: import("@laugh-tale-island/core").RouteProviderReadyResult;
        expected: {
            status: "unavailable";
            reason: "implausible-result";
        };
    };
    implausibleDuration: {
        request: RouteRequestV2;
        result: import("@laugh-tale-island/core").RouteProviderReadyResult;
        expected: {
            status: "unavailable";
            reason: "implausible-result";
        };
    };
    implausibleFlight: {
        request: RouteRequestV2;
        result: import("@laugh-tale-island/core").RouteProviderReadyResult;
        expected: {
            status: "unavailable";
            reason: "implausible-result";
        };
    };
    unsupportedUnknown: {
        request: RouteRequestV2;
        result: import("@laugh-tale-island/core").RouteProviderReadyResult;
        expected: {
            status: "unavailable";
            reason: "unsupported";
        };
    };
};
