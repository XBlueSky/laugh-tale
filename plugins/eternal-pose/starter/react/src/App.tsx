import { trip } from "./trip-content/trip";
import { SetupRequired } from "./ui/SetupRequired";

export function App() {
  return trip === null ? <SetupRequired /> : null;
}
