import { cloneTestValue } from "./FakeRouteAdapterV2.js";
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
function cancelled() {
    return { status: "unavailable", reason: "cancelled", retryable: false };
}
function network(error) {
    return { status: "unavailable", reason: "network", retryable: true, diagnostic: diagnostic(error) };
}
function requestKey(request) {
    try {
        return typeof request.providerReference.id === "string" ? request.providerReference.id : "";
    }
    catch {
        return "";
    }
}
export class FakePlaceAdapterV2 {
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
            return Promise.resolve(network(error));
        }
        if (!(signal instanceof AbortSignal) || signal.aborted)
            return Promise.resolve(cancelled());
        const key = requestKey(callSnapshot);
        const ownerKey = typeof callSnapshot.ownerId === "string" ? callSnapshot.ownerId : "";
        const attempt = (this.attemptsByKey.get(ownerKey) ?? 0) + 1;
        this.attemptsByKey.set(ownerKey, attempt);
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
                outcome = Promise.resolve(network(error));
                return this.settle(outcome, signal);
            }
            outcome = typeof then === "function"
                ? Promise.resolve(value).then(cloneTestValue, network)
                : Promise.resolve(cloneTestValue(value));
        }
        catch (error) {
            outcome = Promise.resolve(network(error));
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
            const onAbort = () => finish(cancelled());
            signal.addEventListener("abort", onAbort, { once: true });
            if (signal.aborted)
                onAbort();
            void outcome.then(finish, (error) => finish(network(error)));
        });
    }
}
