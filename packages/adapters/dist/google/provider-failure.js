export function failure(reason, diagnostic) {
    return {
        status: "unavailable",
        reason,
        retryable: reason === "network",
        ...(diagnostic === undefined ? {} : { diagnostic }),
    };
}
export function fetchFailure(error) {
    try {
        if (typeof error === "object" &&
            error !== null &&
            error.name === "AbortError") {
            return failure("cancelled");
        }
        return failure("network", error instanceof Error
            ? error.message
            : typeof error === "string"
                ? error
                : undefined);
    }
    catch {
        return failure("network");
    }
}
export function httpFailure(status) {
    if (status === 401 || status === 403) {
        return failure("request-denied", `HTTP ${status}`);
    }
    if (status === 404)
        return failure("not-found", `HTTP ${status}`);
    if (status === 429 || status >= 500)
        return failure("network", `HTTP ${status}`);
    return failure("request-denied", `HTTP ${status}`);
}
