import type { PlaceProviderResult, PlaceRequestV2 } from "@laugh-tale-island/core";
import type { PlaceAdapterV2 } from "@laugh-tale-island/core/browser";
export type FakePlaceResolverV2 = (request: PlaceRequestV2, attempt: number) => PlaceProviderResult | Promise<PlaceProviderResult>;
type PlaceFixtures = Readonly<Record<string, PlaceProviderResult>>;
export declare class FakePlaceAdapterV2 implements PlaceAdapterV2 {
    readonly testOnly: true;
    readonly calls: PlaceRequestV2[];
    readonly resolverInputs: PlaceRequestV2[];
    readonly attempts: number[];
    private readonly attemptsByKey;
    private source;
    constructor(source?: FakePlaceResolverV2 | PlaceFixtures);
    setResolver(source: FakePlaceResolverV2 | PlaceFixtures): void;
    load(request: PlaceRequestV2, signal: AbortSignal): Promise<PlaceProviderResult>;
    private settle;
}
export {};
