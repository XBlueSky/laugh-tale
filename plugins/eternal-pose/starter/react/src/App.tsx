import { useState } from "react";

import { TripExperience } from "./experience-shell/TripExperience";
import type { MapAdapter, RouteAdapter } from "@laugh-tale/core/browser";
import { useTripProgress } from "./experience-shell/useTripProgress";
import { trip as configuredTrip } from "./trip-content/trip";
import type { Trip } from "@laugh-tale/core";
import { SetupRequired, type SetupIssue } from "./ui/SetupRequired";
import { TripHome } from "./ui/home/TripHome";

export interface AppProps {
  adapterFactory?: () => MapAdapter;
  routeAdapterFactory?: () => RouteAdapter;
  tripOverride?: Trip | null;
  clock?: () => string;
  setupIssue?: SetupIssue;
}

interface ReadyTripAppProps {
  trip: Trip;
  adapterFactory: () => MapAdapter;
  routeAdapterFactory?: () => RouteAdapter;
  clock?: () => string;
}

function ReadyTripApp({
  trip,
  adapterFactory,
  routeAdapterFactory,
  clock,
}: ReadyTripAppProps) {
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
        {...(routeAdapterFactory === undefined ? {} : { routeAdapterFactory })}
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

export function App({
  adapterFactory,
  routeAdapterFactory,
  tripOverride,
  clock,
  setupIssue,
}: AppProps = {}) {
  const trip = tripOverride === undefined ? configuredTrip : tripOverride;
  if (trip === null) {
    return <SetupRequired issue={{ kind: "trip-content" }} />;
  }
  if (setupIssue !== undefined) {
    return <SetupRequired issue={setupIssue} />;
  }
  if (adapterFactory === undefined) {
    return <SetupRequired issue={{ kind: "provider-key" }} />;
  }

  return (
    <ReadyTripApp
      key={trip.id}
      trip={trip}
      adapterFactory={adapterFactory}
      {...(routeAdapterFactory === undefined ? {} : { routeAdapterFactory })}
      {...(clock === undefined ? {} : { clock })}
    />
  );
}
