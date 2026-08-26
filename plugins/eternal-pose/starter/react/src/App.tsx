import { useState } from "react";

import { TripExperience } from "./experience-shell/TripExperience";
import type { MapAdapter } from "./experience-shell/provider-contracts";
import { useTripProgress } from "./experience-shell/useTripProgress";
import { trip as configuredTrip } from "./trip-content/trip";
import type { Trip } from "./trip-core/model";
import { SetupRequired } from "./ui/SetupRequired";
import { TripHome } from "./ui/home/TripHome";

export interface AppProps {
  adapterFactory?: () => MapAdapter;
  tripOverride?: Trip | null;
  clock?: () => string;
}

interface ReadyTripAppProps {
  trip: Trip;
  adapterFactory: () => MapAdapter;
  clock?: () => string;
}

function ReadyTripApp({ trip, adapterFactory, clock }: ReadyTripAppProps) {
  const progressController = useTripProgress(trip);
  const [activeDayId, setActiveDayId] = useState<string | null>(null);

  if (activeDayId === null) {
    return (
      <TripHome
        trip={trip}
        progress={progressController.progress}
        onCompletedChange={progressController.setCompleted}
        onEnterDay={setActiveDayId}
      />
    );
  }

  return (
    <TripExperience
      trip={trip}
      adapterFactory={adapterFactory}
      initialDayId={activeDayId}
      progressController={progressController}
      onBackToHome={() => setActiveDayId(null)}
      {...(clock === undefined ? {} : { clock })}
    />
  );
}

export function App({ adapterFactory, tripOverride, clock }: AppProps = {}) {
  const trip = tripOverride === undefined ? configuredTrip : tripOverride;
  if (trip === null || adapterFactory === undefined) {
    return <SetupRequired />;
  }

  return (
    <ReadyTripApp
      trip={trip}
      adapterFactory={adapterFactory}
      {...(clock === undefined ? {} : { clock })}
    />
  );
}
