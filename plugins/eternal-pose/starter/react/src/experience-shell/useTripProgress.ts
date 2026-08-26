import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ShoppingStatus, Trip } from "../trip-core/model";
import {
  collectDayProgressScope,
  emptyTripProgress,
  parseTripProgress,
  tripProgressReducer,
  type TripProgressV1,
} from "../trip-core/progress";

const STORAGE_PREFIX = "eternal-pose:trip-progress:v1:";

interface PersistedProgressState {
  progress: TripProgressV1;
  hydratedStorageKey: string | null;
}

export interface TripProgressController {
  progress: TripProgressV1;
  hydrated: boolean;
  selectCandidate: (groupId: string, candidateId: string) => void;
  setShoppingStatus: (itemId: string, status: ShoppingStatus) => void;
  setSkipped: (nodeId: string, skipped: boolean) => void;
  setCompleted: (id: string, completed: boolean) => void;
  resetDay: (dayId: string) => void;
}

export function tripProgressStorageKey(tripId: string): string {
  return `${STORAGE_PREFIX}${tripId}`;
}

export function useTripProgress(trip: Trip): TripProgressController {
  const storageKey = useMemo(() => tripProgressStorageKey(trip.id), [trip.id]);
  const tripRef = useRef(trip);
  const blockedStorageKeysRef = useRef(new Set<string>());
  const [state, setState] = useState<PersistedProgressState>(() => ({
    progress: emptyTripProgress(),
    hydratedStorageKey: null,
  }));

  useEffect(() => {
    tripRef.current = trip;
  }, [trip]);

  useEffect(() => {
    let active = true;
    let progress: TripProgressV1;
    try {
      progress = parseTripProgress(window.localStorage.getItem(storageKey));
      blockedStorageKeysRef.current.delete(storageKey);
    } catch {
      progress = emptyTripProgress();
      blockedStorageKeysRef.current.add(storageKey);
    }
    queueMicrotask(() => {
      if (active) {
        setState({ progress, hydratedStorageKey: storageKey });
      }
    });
    return () => {
      active = false;
    };
  }, [storageKey]);

  useEffect(() => {
    if (
      state.hydratedStorageKey !== storageKey ||
      blockedStorageKeysRef.current.has(storageKey)
    ) {
      return;
    }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state.progress));
    } catch {
      // Device progress remains usable in memory when storage is unavailable.
      blockedStorageKeysRef.current.add(storageKey);
    }
  }, [state, storageKey]);

  const dispatch = useCallback(
    (reduce: (current: TripProgressV1) => TripProgressV1): void => {
      setState((current) => {
        const progress = reduce(current.progress);
        return progress === current.progress ? current : { ...current, progress };
      });
    },
    [],
  );

  const selectCandidate = useCallback(
    (groupId: string, candidateId: string): void => {
      dispatch((current) =>
        tripProgressReducer(current, {
          type: "select-candidate",
          groupId,
          candidateId,
        }),
      );
    },
    [dispatch],
  );

  const setShoppingStatus = useCallback(
    (itemId: string, status: ShoppingStatus): void => {
      dispatch((current) =>
        tripProgressReducer(current, {
          type: "set-shopping-status",
          itemId,
          status,
        }),
      );
    },
    [dispatch],
  );

  const setSkipped = useCallback(
    (nodeId: string, skipped: boolean): void => {
      dispatch((current) =>
        tripProgressReducer(current, {
          type: "set-node-skipped",
          nodeId,
          skipped,
        }),
      );
    },
    [dispatch],
  );

  const setCompleted = useCallback(
    (id: string, completed: boolean): void => {
      dispatch((current) =>
        tripProgressReducer(current, {
          type: "set-completed",
          id,
          completed,
        }),
      );
    },
    [dispatch],
  );

  const resetDay = useCallback(
    (dayId: string): void => {
      dispatch((current) =>
        tripProgressReducer(current, {
          type: "reset-day",
          scope: collectDayProgressScope(tripRef.current, dayId),
        }),
      );
    },
    [dispatch],
  );

  return {
    progress: state.progress,
    hydrated: state.hydratedStorageKey === storageKey,
    selectCandidate,
    setShoppingStatus,
    setSkipped,
    setCompleted,
    resetDay,
  };
}
