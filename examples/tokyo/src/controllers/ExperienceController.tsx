import type { Trip } from "@laugh-tale-island/core";
import type {
  MapAdapter,
  NavigationAdapter,
  RouteAdapter,
} from "@laugh-tale-island/core/browser";
import type { TripProgressController } from "@laugh-tale-island/react";

import type { TripPresentation } from "./presentation-contract";
import { useTripExperienceController } from "./use-trip-experience-controller";

export interface ExperienceControllerProps {
  trip: Trip;
  adapterFactory: () => MapAdapter;
  routeAdapterFactory?: () => RouteAdapter;
  navigationAdapter?: NavigationAdapter;
  clock?: () => string;
  initialDayId?: string;
  progressController?: TripProgressController;
  onBackToHome?: () => void;
  presentation: TripPresentation;
}

export function ExperienceController({
  presentation,
  ...input
}: ExperienceControllerProps) {
  const { model, actions, bindings } = useTripExperienceController({
    ...input,
    presentation,
  });
  return (
    <presentation.Experience
      model={model}
      actions={actions}
      bindings={bindings}
    />
  );
}
