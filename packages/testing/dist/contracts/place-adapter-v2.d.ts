import type { PlaceProviderResult, PlaceRequestV2 } from "@laugh-tale-island/core";
import type { PlaceAdapterV2 } from "@laugh-tale-island/core/browser";
export interface PlaceAdapterV2ContractControl {
    readonly providerStarts: number;
    readonly providerCompletions: number;
    resolveReady(providerCall: number, fixture: PlaceContractReadyCase): void;
    beginReadyWithHeldWork(providerCall: number, fixture: PlaceContractReadyCase): void;
    heldWorkReachedReleasePoint(providerCall: number): Promise<void>;
    releaseHeldWork(providerCall: number): void;
    resolveMalformed(providerCall: number): void;
    reject(providerCall: number): void;
    throwOnNextStart(): void;
    completed(providerCall: number): Promise<void>;
}
export type PlaceContractReadyCase = "primary" | "alternate" | "abandoned" | "replacement";
export interface PlaceAdapterV2ContractHarness {
    readonly adapter: PlaceAdapterV2;
    readonly control: PlaceAdapterV2ContractControl;
    expectedReady(fixture: PlaceContractReadyCase): PlaceProviderResult;
    request(resourceId?: string, semanticOwnerId?: string): PlaceRequestV2;
    unsupportedRequest(): PlaceRequestV2;
}
export declare function definePlaceAdapterV2Contract(label: string, createHarness: () => PlaceAdapterV2ContractHarness): void;
