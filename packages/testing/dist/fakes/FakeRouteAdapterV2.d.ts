import type { RouteProviderResult, RouteRequestV2 } from "@laugh-tale-island/core";
import type { RouteAdapterV2 } from "@laugh-tale-island/core/browser";
export type FakeRouteResolverV2 = (request: RouteRequestV2, attempt: number) => RouteProviderResult | Promise<RouteProviderResult>;
type RouteFixtures = Readonly<Record<string, RouteProviderResult>>;
export declare function cloneTestValue<T>(value: T): T;
export declare function cancelledResult(): RouteProviderResult;
export declare class FakeRouteAdapterV2 implements RouteAdapterV2 {
    readonly testOnly: true;
    readonly calls: RouteRequestV2[];
    readonly resolverInputs: RouteRequestV2[];
    readonly attempts: number[];
    private readonly attemptsByKey;
    private source;
    constructor(source?: FakeRouteResolverV2 | RouteFixtures);
    setResolver(source: FakeRouteResolverV2 | RouteFixtures): void;
    load(request: RouteRequestV2, signal: AbortSignal): Promise<RouteProviderResult>;
    private settle;
}
export {};
