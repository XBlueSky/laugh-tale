export function emitTripDiagnostic(sink, event) {
    try {
        sink?.(event);
    }
    catch { /* A diagnostic consumer cannot change controller behavior. */ }
}
