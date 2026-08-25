import { TripExperience } from "./experience-shell/TripExperience";
import type { MapAdapter } from "./experience-shell/provider-contracts";
import { trip } from "./trip-content/trip";
import { SetupRequired } from "./ui/SetupRequired";

export interface AppProps {
  adapterFactory?: () => MapAdapter;
}

export function App({ adapterFactory }: AppProps = {}) {
  if (trip === null || adapterFactory === undefined) {
    return <SetupRequired />;
  }

  return <TripExperience trip={trip} adapterFactory={adapterFactory} />;
}
