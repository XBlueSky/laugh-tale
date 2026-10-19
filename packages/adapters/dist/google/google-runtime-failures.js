const subscribers = new Set();
let installed;
let previous;
let notifying = false;
const host = globalThis;
/** Google documents gm_authFailure; it does not document a Map "error" event. */
export function subscribeGoogleRuntimeFailures(subscriber) {
    if (installed === undefined || host.gm_authFailure !== installed) {
        previous = Object.getOwnPropertyDescriptor(host, "gm_authFailure");
        const priorCallback = host.gm_authFailure;
        let forwarding = false;
        const wrapper = () => {
            // Only a cycle through this wrapper is recursion; older wrappers still
            // need to forward their predecessors during the shared dispatch.
            if (forwarding)
                return;
            forwarding = true;
            const dispatch = !notifying;
            notifying = true;
            try {
                for (const listener of dispatch ? [...subscribers] : []) {
                    try {
                        listener({ status: "unavailable", reason: "request-denied", retryable: false, diagnostic: "Google Maps authentication failed" });
                    }
                    catch {
                        // One consumer must not suppress the other mounted consumers.
                    }
                }
                if (typeof priorCallback === "function")
                    priorCallback();
            }
            finally {
                forwarding = false;
                if (dispatch)
                    notifying = false;
            }
        };
        host.gm_authFailure = wrapper;
        installed = wrapper;
    }
    subscribers.add(subscriber);
    let active = true;
    return () => {
        if (!active)
            return;
        active = false;
        subscribers.delete(subscriber);
        if (subscribers.size !== 0)
            return;
        if (host.gm_authFailure === installed) {
            if (previous === undefined)
                delete host.gm_authFailure;
            else
                Object.defineProperty(host, "gm_authFailure", previous);
        }
        installed = undefined;
        previous = undefined;
    };
}
