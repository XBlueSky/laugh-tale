import type { ProviderFailureReason, ProviderUnavailableResult } from "@laugh-tale-island/core";
export declare function failure(reason: ProviderFailureReason, diagnostic?: string): ProviderUnavailableResult;
export declare function fetchFailure(error: unknown): ProviderUnavailableResult;
export declare function httpFailure(status: number): ProviderUnavailableResult;
