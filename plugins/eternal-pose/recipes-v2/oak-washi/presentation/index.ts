import "./styles/index.css";
import { catalog, locale } from "./copy/catalog.js";
import type { TripPresentationV2 } from "@laugh-tale-island/react";
import { oakWashiMapVisualProfile } from "./map/oak-washi-map-profile.js";
import { createOakWashiMarkerContent } from "./map/create-oak-washi-marker-content.js";
import { createOakWashiUserLocationContent } from "./map/create-oak-washi-user-location-content.js";
import { OakWashiExperience } from "./experience/OakWashiExperience.js";
import { OakWashiHome } from "./home/OakWashiHome.js";
import { OakWashiSetupRequired } from "./states/OakWashiSetupRequired.js";
import { OakWashiLoading } from "./states/OakWashiLoading.js";
import { OakWashiFatalError } from "./states/OakWashiFatalError.js";

export { catalog, locale };

export const documentMetadataCopy = catalog.metadata;

export { OakWashiExperience, OakWashiHome, OakWashiSetupRequired, OakWashiLoading, OakWashiFatalError };

export { oakWashiMapVisualProfile, createOakWashiMarkerContent, createOakWashiUserLocationContent };

export const oakWashiMapBindings = {
  mapVisualProfile: oakWashiMapVisualProfile,
  createMarkerContent: createOakWashiMarkerContent,
  createUserLocationContent: createOakWashiUserLocationContent,
} satisfies Pick<TripPresentationV2, "mapVisualProfile" | "createMarkerContent" | "createUserLocationContent">;

export const presentation = {
  Home: OakWashiHome,
  Experience: OakWashiExperience,
  SetupRequired: OakWashiSetupRequired,
  Loading: OakWashiLoading,
  FatalError: OakWashiFatalError,
  ...oakWashiMapBindings,
} satisfies TripPresentationV2;
