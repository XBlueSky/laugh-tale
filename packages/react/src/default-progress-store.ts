import { useState } from "react";
import { createLocalStorageProgressStore, type ProgressStore } from "@laugh-tale-island/core/browser";

/** Called only inside the validated, Trip-ID-keyed owner. */
export function useDefaultProgressStore(tripId: string, injected?: ProgressStore): ProgressStore {
  const [fallback, setFallback] = useState(() => injected === undefined
    ? createLocalStorageProgressStore(`eternal-pose:trip-progress:v1:${tripId}`)
    : null);
  if (injected !== undefined) return injected;
  if (fallback !== null) return fallback;
  // Switching from injection to default creates a store owned by this keyed component.
  const store = createLocalStorageProgressStore(`eternal-pose:trip-progress:v1:${tripId}`);
  setFallback(store);
  return store;
}
