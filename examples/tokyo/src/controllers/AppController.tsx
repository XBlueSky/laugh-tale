import { useMemo, useState } from "react";

import type { Trip } from "@laugh-tale-island/core";
import {
  createLocalStorageProgressStore,
  type MapAdapter,
  type NavigationAdapter,
  type RouteAdapter,
} from "@laugh-tale-island/core/browser";
import { useTripProgress } from "@laugh-tale-island/react";

import type { TripPresentation } from "./presentation-contract";
import { tripProgressStorageKey } from "./progress-storage";
import { useHomeController } from "./use-home-controller";
import { ExperienceController } from "./ExperienceController";

export interface AppControllerProps {
  trip: Trip;
  adapterFactory: () => MapAdapter;
  routeAdapterFactory?: () => RouteAdapter;
  navigationAdapter?: NavigationAdapter;
  clock?: () => string;
  presentation: TripPresentation;
}

interface HomeControllerProps {
  trip: Trip;
  progressController: ReturnType<typeof useTripProgress>;
  enterDay: (dayId: string) => void;
  presentation: TripPresentation;
}

function HomeController({
  trip,
  progressController,
  enterDay,
  presentation,
}: HomeControllerProps) {
  const props = useHomeController(trip, progressController, enterDay);
  return <presentation.Home {...props} />;
}

export function AppController({
  trip,
  adapterFactory,
  routeAdapterFactory,
  navigationAdapter,
  clock,
  presentation,
}: AppControllerProps) {
  const progressStore = useMemo(
    () => createLocalStorageProgressStore(tripProgressStorageKey(trip.id)),
    [trip.id],
  );
  const progressController = useTripProgress(trip, progressStore);
  const [activeDayId, setActiveDayId] = useState<string | null>(null);

  if (!progressController.hydrated) {
    return <presentation.Loading kind="progress" />;
  }
  if (activeDayId === null) {
    return (
      <HomeController
        trip={trip}
        progressController={progressController}
        enterDay={setActiveDayId}
        presentation={presentation}
      />
    );
  }
  return (
    <ExperienceController
      trip={trip}
      adapterFactory={adapterFactory}
      {...(routeAdapterFactory === undefined ? {} : { routeAdapterFactory })}
      {...(navigationAdapter === undefined ? {} : { navigationAdapter })}
      {...(clock === undefined ? {} : { clock })}
      initialDayId={activeDayId}
      progressController={progressController}
      onBackToHome={() => setActiveDayId(null)}
      presentation={presentation}
    />
  );
}
