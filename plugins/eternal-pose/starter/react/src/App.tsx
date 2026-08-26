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

  if (!progressController.hydrated) {
    return (
      <main
        className="trip-progress-loading"
        role="status"
        aria-label="正在讀取旅行進度"
      >
        正在讀取旅行進度
      </main>
    );
  }

  const persistenceHint =
    progressController.persistenceStatus === "memory-only" ? (
      <p
        className="trip-progress-persistence"
        role="status"
        aria-label="旅行進度僅保留在此頁面"
        data-persistence-status="memory-only"
      >
        目前無法儲存進度，這次變更僅保留在此頁面。
      </p>
    ) : null;

  const surface =
    activeDayId === null ? (
      <TripHome
        trip={trip}
        progress={progressController.progress}
        onCompletedChange={progressController.setCompleted}
        onEnterDay={setActiveDayId}
      />
    ) : (
      <TripExperience
        trip={trip}
        adapterFactory={adapterFactory}
        initialDayId={activeDayId}
        progressController={progressController}
        onBackToHome={() => setActiveDayId(null)}
        {...(clock === undefined ? {} : { clock })}
      />
    );

  return (
    <>
      {persistenceHint}
      {surface}
    </>
  );
}

export function App({ adapterFactory, tripOverride, clock }: AppProps = {}) {
  const trip = tripOverride === undefined ? configuredTrip : tripOverride;
  if (trip === null || adapterFactory === undefined) {
    return <SetupRequired />;
  }

  return (
    <ReadyTripApp
      key={trip.id}
      trip={trip}
      adapterFactory={adapterFactory}
      {...(clock === undefined ? {} : { clock })}
    />
  );
}
