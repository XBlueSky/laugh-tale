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
  persistenceStatus: ProgressPersistenceStatus;
  pendingWriteId: number | null;
}

export type ProgressPersistenceStatus = "persistent" | "memory-only";

export interface TripProgressController {
  progress: TripProgressV1;
  hydrated: boolean;
  persistenceStatus: ProgressPersistenceStatus;
  selectCandidate: (groupId: string, candidateId: string) => void;
  setShoppingStatus: (itemId: string, status: ShoppingStatus) => void;
  setSkipped: (nodeId: string, skipped: boolean) => void;
  setCompleted: (id: string, completed: boolean) => void;
  resetDay: (dayId: string) => void;
}

export function tripProgressStorageKey(tripId: string): string {
  return `${STORAGE_PREFIX}${tripId}`;
}

const PROGRESS_KEYS = new Set([
  "version",
  "selectedCandidateIds",
  "shoppingStatuses",
  "skippedNodeIds",
  "completedIds",
]);
const SHOPPING_STATUSES = new Set<ShoppingStatus>([
  "pending",
  "purchased",
  "unavailable",
  "skipped",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidStorageEventProgress(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  if (
    keys.length !== PROGRESS_KEYS.size ||
    keys.some((key) => !PROGRESS_KEYS.has(key)) ||
    value.version !== 1 ||
    !isRecord(value.selectedCandidateIds) ||
    !Object.entries(value.selectedCandidateIds).every(
      ([key, candidateId]) => isNonBlankString(key) && isNonBlankString(candidateId),
    ) ||
    !isRecord(value.shoppingStatuses) ||
    !Object.entries(value.shoppingStatuses).every(
      ([key, status]) =>
        isNonBlankString(key) &&
        typeof status === "string" &&
        SHOPPING_STATUSES.has(status as ShoppingStatus),
    ) ||
    !Array.isArray(value.skippedNodeIds) ||
    !value.skippedNodeIds.every(isNonBlankString) ||
    !Array.isArray(value.completedIds) ||
    !value.completedIds.every(isNonBlankString)
  ) {
    return false;
  }
  return true;
}

function parseStorageEventProgress(raw: string | null): TripProgressV1 | null {
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidStorageEventProgress(parsed) ? parseTripProgress(raw) : null;
  } catch {
    return null;
  }
}

export function useTripProgress(trip: Trip): TripProgressController {
  const storageKey = useMemo(() => tripProgressStorageKey(trip.id), [trip.id]);
  const tripRef = useRef(trip);
  const writeSequenceRef = useRef(0);
  const [state, setState] = useState<PersistedProgressState>(() => ({
    progress: emptyTripProgress(),
    hydratedStorageKey: null,
    persistenceStatus: "persistent",
    pendingWriteId: null,
  }));

  useEffect(() => {
    tripRef.current = trip;
  }, [trip]);

  useEffect(() => {
    let active = true;
    let progress: TripProgressV1;
    let persistenceStatus: ProgressPersistenceStatus = "persistent";
    try {
      progress = parseTripProgress(window.localStorage.getItem(storageKey));
    } catch {
      progress = emptyTripProgress();
      persistenceStatus = "memory-only";
    }
    queueMicrotask(() => {
      if (active) {
        setState({
          progress,
          hydratedStorageKey: storageKey,
          persistenceStatus,
          pendingWriteId: null,
        });
      }
    });
    return () => {
      active = false;
    };
  }, [storageKey]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent): void => {
      if (event.key !== storageKey) {
        return;
      }
      const progress = parseStorageEventProgress(event.newValue);
      if (progress === null) {
        return;
      }
      setState((current) =>
        current.hydratedStorageKey === storageKey
          ? { ...current, progress, pendingWriteId: null }
          : current,
      );
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [storageKey]);

  useEffect(() => {
    if (
      state.hydratedStorageKey !== storageKey ||
      state.persistenceStatus === "memory-only" ||
      state.pendingWriteId === null
    ) {
      return;
    }
    let active = true;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state.progress));
    } catch {
      queueMicrotask(() => {
        if (!active) {
          return;
        }
        setState((current) =>
          current.hydratedStorageKey === storageKey &&
          current.pendingWriteId === state.pendingWriteId
            ? { ...current, persistenceStatus: "memory-only" }
            : current,
        );
      });
    }
    return () => {
      active = false;
    };
  }, [state, storageKey]);

  const dispatch = useCallback(
    (reduce: (current: TripProgressV1) => TripProgressV1): void => {
      setState((current) => {
        const progress = reduce(current.progress);
        if (progress === current.progress) {
          return current;
        }
        writeSequenceRef.current += 1;
        return {
          ...current,
          progress,
          pendingWriteId: writeSequenceRef.current,
        };
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
    persistenceStatus: state.persistenceStatus,
    selectCandidate,
    setShoppingStatus,
    setSkipped,
    setCompleted,
    resetDay,
  };
}
