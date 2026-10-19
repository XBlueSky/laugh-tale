import type { NavigationAdapterV2, NavigationRequestV2 } from "@laugh-tale-island/core/browser";
export interface GoogleNavigationAdapterOptions {
    openExternal?: (url: string) => void;
}
export declare function createGoogleMapsUrl(request: NavigationRequestV2): string | null;
export declare class GoogleNavigationAdapter implements NavigationAdapterV2 {
    readonly supportedPlaceProviders: readonly ["google"];
    private readonly openExternal;
    constructor(options?: GoogleNavigationAdapterOptions);
    open(request: NavigationRequestV2): boolean;
}
