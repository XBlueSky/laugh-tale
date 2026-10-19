import type { NavigationAdapterV2, NavigationRequestV2 } from "@laugh-tale-island/core/browser";
import { cloneTestValue } from "./FakeRouteAdapterV2.js";

export class FakeNavigationAdapterV2 implements NavigationAdapterV2 {
  readonly testOnly = true as const;
  readonly calls: NavigationRequestV2[] = [];
  readonly supportedPlaceProviders: readonly string[];
  result: boolean;

  constructor(result = true, supportedPlaceProviders: readonly string[] = []) {
    this.result = result;
    this.supportedPlaceProviders = Object.freeze([...supportedPlaceProviders]);
  }

  open(request: NavigationRequestV2): boolean {
    this.calls.push(cloneTestValue(request));
    return this.result;
  }
}
