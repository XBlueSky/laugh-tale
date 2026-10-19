export function cloneTestValue(value) {
    return structuredClone(value);
}
function snapshotFixtures(fixtures) {
    const snapshot = Object.create(null);
    for (const key of Object.keys(fixtures))
        snapshot[key] = cloneTestValue(fixtures[key]);
    return snapshot;
}
function snapshotSource(source) {
    return typeof source === "function" ? source : snapshotFixtures(source);
}
function diagnostic(error) {
    try {
        if (error instanceof Error && typeof error.message === "string" && error.message.trim())
            return error.message.trim();
    }
    catch {
        // A hostile thrown value falls through to the deterministic diagnostic.
    }
    return "Synthetic resolver failed";
}
export function cancelledResult() {
    return { status: "unavailable", reason: "cancelled", retryable: false };
}
function networkResult(error) {
    return { status: "unavailable", reason: "network", retryable: true, diagnostic: diagnostic(error) };
}
function requestKey(request) {
    try {
        return typeof request.edge.id === "string" ? request.edge.id : "";
    }
    catch {
        return "";
    }
}
export class FakeRouteAdapterV2 {
    testOnly = true;
    calls = [];
    resolverInputs = [];
    attempts = [];
    attemptsByKey = new Map();
    source;
    constructor(source = Object.freeze({})) {
        this.source = snapshotSource(source);
    }
    setResolver(source) {
        this.source = snapshotSource(source);
    }
    load(request, signal) {
        let callSnapshot;
        try {
            callSnapshot = cloneTestValue(request);
            this.calls.push(callSnapshot);
        }
        catch (error) {
            return Promise.resolve(networkResult(error));
        }
        if (!(signal instanceof AbortSignal) || signal.aborted)
            return Promise.resolve(cancelledResult());
        const key = requestKey(callSnapshot);
        const attempt = (this.attemptsByKey.get(key) ?? 0) + 1;
        this.attemptsByKey.set(key, attempt);
        this.attempts.push(attempt);
        const resolverInput = cloneTestValue(callSnapshot);
        this.resolverInputs.push(cloneTestValue(resolverInput));
        let outcome;
        try {
            const value = typeof this.source === "function"
                ? this.source(resolverInput, attempt)
                : Object.hasOwn(this.source, key)
                    ? cloneTestValue(this.source[key])
                    : { status: "unavailable", reason: "not-found", retryable: false };
            let then;
            try {
                then = value !== null && (typeof value === "object" || typeof value === "function")
                    ? value.then
                    : undefined;
            }
            catch (error) {
                outcome = Promise.resolve(networkResult(error));
                return this.settle(outcome, signal);
            }
            outcome = typeof then === "function"
                ? Promise.resolve(value).then(cloneTestValue, networkResult)
                : Promise.resolve(cloneTestValue(value));
        }
        catch (error) {
            outcome = Promise.resolve(networkResult(error));
        }
        return this.settle(outcome, signal);
    }
    settle(outcome, signal) {
        return new Promise((resolve) => {
            let settled = false;
            const finish = (value) => {
                if (settled)
                    return;
                settled = true;
                signal.removeEventListener("abort", onAbort);
                resolve(cloneTestValue(value));
            };
            const onAbort = () => finish(cancelledResult());
            signal.addEventListener("abort", onAbort, { once: true });
            if (signal.aborted)
                onAbort();
            void outcome.then(finish, (error) => finish(networkResult(error)));
        });
    }
}
