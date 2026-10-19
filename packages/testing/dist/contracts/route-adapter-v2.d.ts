import type { RouteProviderResult, RouteRequestV2 } from "@laugh-tale-island/core";
import type { RouteAdapterV2 } from "@laugh-tale-island/core/browser";
export interface RouteAdapterV2ContractControl {
    readonly providerStarts: number;
    readonly providerCompletions: number;
    resolveReady(providerCall: number, fixture: RouteContractReadyCase): void;
    beginReadyWithHeldWork(providerCall: number, fixture: RouteContractReadyCase): void;
    heldWorkReachedReleasePoint(providerCall: number): Promise<void>;
    releaseHeldWork(providerCall: number): void;
    resolveMalformed(providerCall: number): void;
    reject(providerCall: number): void;
    throwOnNextStart(): void;
    completed(providerCall: number): Promise<void>;
}
export type RouteContractReadyCase = "primary" | "alternate" | "abandoned" | "replacement";
export interface RouteAdapterV2ContractHarness {
    readonly adapter: RouteAdapterV2;
    readonly control: RouteAdapterV2ContractControl;
    expectedReady(fixture: RouteContractReadyCase): RouteProviderResult;
    request(resourceId?: string, semanticOwnerId?: string): RouteRequestV2;
    unsupportedRequest(): RouteRequestV2;
}
export declare function defineRouteAdapterV2Contract(label: string, createHarness: () => RouteAdapterV2ContractHarness): void;
