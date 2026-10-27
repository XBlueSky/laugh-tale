import type { FatalErrorModel } from "./presentation-contract.js";
export declare class ControllerStateFailure extends Error {
    readonly cause: unknown;
    constructor(cause: unknown);
}
export declare function controllerStateOperation<T>(operation: () => T): T;
export declare function normalizeControllerError(category: FatalErrorModel["category"], retry: boolean, home: boolean): FatalErrorModel;
