import type { TripPresentation } from "../controllers/presentation-contract";

import { ArcadeStates } from "./components/ArcadeStates";
import { ResetArcadeExperience } from "./experience/ResetArcadeExperience";
import { ResetArcadeHome } from "./home/ResetArcadeHome";
import { resetArcadeMapProfile } from "./theme-map-profile";

export const presentation = {
  Home: ResetArcadeHome,
  Experience: ResetArcadeExperience,
  SetupRequired: ArcadeStates.SetupRequired,
  Loading: ArcadeStates.Loading,
  FatalError: ArcadeStates.FatalError,
  geometry: {
    header: { expanded: 112, collapsed: 64 },
    sheet: { collapsed: 120, minGap: 20 },
    desktopBreakpoint: 768,
    map: {
      mobileProviderClearance: 144,
      desktopRailInset: true,
    },
  },
  mapProfile: resetArcadeMapProfile,
} satisfies TripPresentation;
