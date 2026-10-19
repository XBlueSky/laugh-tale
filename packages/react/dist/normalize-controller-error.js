export class ControllerStateFailure extends Error {
    cause;
    constructor(cause) {
        super("controller-state-failure", { cause });
        this.cause = cause;
    }
}
export function controllerStateOperation(operation) {
    try {
        return operation();
    }
    catch (cause) {
        throw cause instanceof ControllerStateFailure ? cause : new ControllerStateFailure(cause);
    }
}
export function normalizeControllerError(category, retry, home) {
    return {
        category, copyKey: `fatal.${category}`,
        retained: { home, itinerary: false, externalNavigation: false },
        capabilities: { retry, openHome: home },
    };
}
