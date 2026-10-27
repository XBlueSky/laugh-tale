import type { Trip } from "@laugh-tale-island/core";

import { trip } from "../../../src/trip-content/trip";
import { createE2EMapAdapter, createE2ERouteAdapter, e2eClock } from "./e2e-trip";

if (trip === null) {
  throw new Error("Tokyo trip content is missing");
}

export const tokyoE2ETrip: Trip = trip;
export { createE2EMapAdapter, createE2ERouteAdapter, e2eClock };
