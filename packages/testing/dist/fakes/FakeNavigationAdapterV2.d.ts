import type { NavigationAdapterV2, NavigationRequestV2 } from "@laugh-tale-island/core/browser";
export declare class FakeNavigationAdapterV2 implements NavigationAdapterV2 {
    readonly testOnly: true;
    readonly calls: NavigationRequestV2[];
    readonly supportedPlaceProviders: readonly string[];
    result: boolean;
    constructor(result?: boolean, supportedPlaceProviders?: readonly string[]);
    open(request: NavigationRequestV2): boolean;
}
