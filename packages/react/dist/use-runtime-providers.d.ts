import type { PlaceProviderResult, PlaceRequestV2, ProviderUnavailableResult, RouteProviderResult, RouteRequestV2 } from "@laugh-tale-island/core";
import type { ProviderBootstrapState, ProviderChannelStateModel, TripDiagnosticSink, TripRuntimeAdapters } from "./presentation-contract.js";
type Channel = "map" | "route" | "place";
type BootstrapLedger = Map<Channel, string>;
/** Controller-owned lifetime, with at most one current attempt per channel. */
export declare const BootstrapDiagnosticContext: import("react").Context<BootstrapLedger | null>;
export declare function sanitizeProviderFailure(result: ProviderUnavailableResult): ProviderUnavailableResult;
export declare function reportProviderFailure(sink: TripDiagnosticSink | undefined, channel: Channel, phase: "bootstrap" | "request" | "runtime", failure: ProviderUnavailableResult, ownerId?: string, cause?: unknown): void;
export declare function useBootstrapProviders(runtime: TripRuntimeAdapters | undefined, bootstrap: ProviderBootstrapState | undefined, sink: TripDiagnosticSink | undefined): {
    published: ProviderBootstrapState;
    pending: {
        map: boolean;
        routes: boolean;
        places: boolean;
    };
};
type RequestState<Result> = Result | {
    status: "idle" | "loading";
};
interface RuntimeProviderInput {
    dayId: string;
    routeRequests: readonly RouteRequestV2[];
    placeRequests: readonly PlaceRequestV2[];
    runtime?: TripRuntimeAdapters;
    providerBootstrap?: ProviderBootstrapState;
    onDiagnostic?: TripDiagnosticSink;
    enabled: boolean;
}
export declare function useRuntimeProviders(input: RuntimeProviderInput): {
    bootstrap: {
        published: ProviderBootstrapState;
        pending: {
            map: boolean;
            routes: boolean;
            places: boolean;
        };
    };
    routeStates: Record<string, RequestState<RouteProviderResult>>;
    placeStates: Record<string, RequestState<PlaceProviderResult>>;
    retryRouteIds: string[];
    retryPlaceOwnerIds: string[];
    providers: {
        routes: ProviderChannelStateModel;
        places: ProviderChannelStateModel;
    };
    retry: (kind: "route" | "place", id: string) => void;
};
export {};
