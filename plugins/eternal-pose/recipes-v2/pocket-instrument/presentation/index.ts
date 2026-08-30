import type { TripPresentation } from "../controllers/presentation-contract";

import { InstrumentStates } from "./components/InstrumentStates";
import { PocketInstrumentExperience } from "./experience/PocketInstrumentExperience";
import { PocketInstrumentHome } from "./home/PocketInstrumentHome";
import { pocketInstrumentMapProfile } from "./theme-map-profile";

export const presentation = {
  Home: PocketInstrumentHome,
  Experience: PocketInstrumentExperience,
  SetupRequired: InstrumentStates.SetupRequired,
  Loading: InstrumentStates.Loading,
  FatalError: InstrumentStates.FatalError,
  geometry: {
    header: { expanded: 116, collapsed: 72 },
    sheet: { collapsed: 124, minGap: 16 },
    desktopBreakpoint: 768,
    map: {
      mobileProviderClearance: 148,
      desktopRailInset: true,
    },
  },
  mapProfile: pocketInstrumentMapProfile,
} satisfies TripPresentation;
