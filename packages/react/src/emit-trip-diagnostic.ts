import type { TripDiagnosticEvent, TripDiagnosticSink } from "./presentation-contract.js";

export function emitTripDiagnostic(sink: TripDiagnosticSink | undefined, event: TripDiagnosticEvent): void {
  try { sink?.(event); } catch { /* A diagnostic consumer cannot change controller behavior. */ }
}
