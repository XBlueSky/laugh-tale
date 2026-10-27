import { cloneTestValue } from "./FakeRouteAdapterV2.js";
export class FakeNavigationAdapterV2 {
    testOnly = true;
    calls = [];
    supportedPlaceProviders;
    result;
    constructor(result = true, supportedPlaceProviders = []) {
        this.result = result;
        this.supportedPlaceProviders = Object.freeze([...supportedPlaceProviders]);
    }
    open(request) {
        this.calls.push(cloneTestValue(request));
        return this.result;
    }
}
