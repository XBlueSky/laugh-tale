import type { TripDiagnosticEvent, TripDiagnosticSink } from "./presentation-contract.js";
export declare function emitTripDiagnostic(sink: TripDiagnosticSink | undefined, event: TripDiagnosticEvent): void;
