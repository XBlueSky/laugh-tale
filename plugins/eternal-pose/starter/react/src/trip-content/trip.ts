import input from "./trip-input.json";
import ledger from "./place-resolutions.json";
import { materializeTrip, type TripProjectInputV2, type PlaceResolutionLedgerV1 } from "./materialize-trip.js";

export const trip = materializeTrip(input as TripProjectInputV2, ledger as PlaceResolutionLedgerV1);
