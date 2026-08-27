import type { TripPresentation } from "../controllers/presentation-contract";

import { AtlasStates } from "./components/AtlasStates";
import { FieldAtlasExperience } from "./experience/FieldAtlasExperience";
import { FieldAtlasHome } from "./home/FieldAtlasHome";
import { fieldAtlasMapProfile } from "./theme-map-profile";

export const presentation = {
  Home: FieldAtlasHome,
  Experience: FieldAtlasExperience,
  SetupRequired: AtlasStates.SetupRequired,
  Loading: AtlasStates.Loading,
  FatalError: AtlasStates.FatalError,
  geometry: {
    header: { expanded: 148, collapsed: 72 },
    sheet: { collapsed: 128, minGap: 24 },
    desktopBreakpoint: 768,
  },
  mapProfile: fieldAtlasMapProfile,
} satisfies TripPresentation;
