import type { Trip } from "@laugh-tale-island/core";
import type {
  MapAdapter,
  NavigationAdapter,
  RouteAdapter,
} from "@laugh-tale-island/core/browser";

import { AppController } from "../controllers/AppController";
import type {
  SetupIssue,
  TripPresentation,
} from "../controllers/presentation-contract";
import { presentation as defaultPresentation } from "../presentation";
import { trip as configuredTrip } from "../trip-content/trip";
import { PresentationErrorBoundary } from "./PresentationErrorBoundary";

export interface AppProps {
  adapterFactory?: () => MapAdapter;
  routeAdapterFactory?: () => RouteAdapter;
  navigationAdapter?: NavigationAdapter;
  tripOverride?: Trip | null;
  clock?: () => string;
  setupIssue?: SetupIssue;
  presentation?: TripPresentation;
}

export function App({
  adapterFactory,
  routeAdapterFactory,
  navigationAdapter,
  tripOverride,
  clock,
  setupIssue,
  presentation = defaultPresentation,
}: AppProps = {}) {
  const trip = tripOverride === undefined ? configuredTrip : tripOverride;
  const SetupRequired = presentation.SetupRequired;
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
    <PresentationErrorBoundary FatalError={presentation.FatalError}>
      <AppController
        key={trip.id}
        trip={trip}
        adapterFactory={adapterFactory}
        {...(routeAdapterFactory === undefined ? {} : { routeAdapterFactory })}
        {...(navigationAdapter === undefined ? {} : { navigationAdapter })}
        {...(clock === undefined ? {} : { clock })}
        presentation={presentation}
      />
    </PresentationErrorBoundary>
  );
}
