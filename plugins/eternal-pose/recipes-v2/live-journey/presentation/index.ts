import type { TripPresentation } from "../controllers/presentation-contract";

import { LiveStates } from "./components/LiveStates";
import { LiveJourneyExperience } from "./experience/LiveJourneyExperience";
import { LiveJourneyHome } from "./home/LiveJourneyHome";
import { liveJourneyMapProfile } from "./theme-map-profile";

export const presentation = {
  Home: LiveJourneyHome,
  Experience: LiveJourneyExperience,
  SetupRequired: LiveStates.SetupRequired,
  Loading: LiveStates.Loading,
  FatalError: LiveStates.FatalError,
  geometry: {
    header: { expanded: 132, collapsed: 96 },
    sheet: { collapsed: 136, minGap: 20 },
    desktopBreakpoint: 768,
    map: {
      mobileProviderClearance: 156,
      desktopRailInset: true,
    },
  },
  mapProfile: liveJourneyMapProfile,
} satisfies TripPresentation;
