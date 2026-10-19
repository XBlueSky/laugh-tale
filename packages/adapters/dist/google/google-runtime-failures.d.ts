import type { ProviderUnavailableResult } from "@laugh-tale-island/core";
type Subscriber = (failure: ProviderUnavailableResult) => void;
/** Google documents gm_authFailure; it does not document a Map "error" event. */
export declare function subscribeGoogleRuntimeFailures(subscriber: Subscriber): () => void;
export {};
