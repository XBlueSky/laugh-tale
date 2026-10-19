import { useCallback, useEffect, useRef, useState } from "react";

import type { ShoppingStatus, Trip, TripProgressV1 } from "@laugh-tale-island/core";
import {
  collectDayProgressScope,
  emptyTripProgress,
  parseTripProgress,
  tripProgressReducer,
} from "@laugh-tale-island/core";
import type { ProgressStore } from "@laugh-tale-island/core/browser";
import { controllerStateOperation } from "./normalize-controller-error.js";

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
  resetTrip: () => void;
}

interface PersistedProgressState {
  progress: TripProgressV1;
  hydratedStore: ProgressStore | null;
  hydratedTripId: string | null;
  persistenceStatus: ProgressPersistenceStatus;
  pendingWriteId: number | null;
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

function isValidExternalProgress(value: unknown): boolean {
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

function parseExternalProgress(raw: string | null): TripProgressV1 | null {
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidExternalProgress(parsed) ? parseTripProgress(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Trip-scoped progress bound to one injected {@link ProgressStore}. The
 * store owns key resolution and persistence; this hook owns strict
 * hydration (no store access during the first render), pending-write
 * sequencing, cross-tab subscription, and the semantic `memory-only`
 * downgrade when a write is refused.
 */
export function useTripProgress(trip: Trip, store: ProgressStore): TripProgressController {
  const tripId = trip.id;
  const [unhydratedProgress] = useState(emptyTripProgress);
  const tripRef = useRef(trip);
  const writeSequenceRef = useRef(0);
  const [state, setState] = useState<PersistedProgressState>(() => ({
    progress: emptyTripProgress(),
    hydratedStore: null,
    hydratedTripId: null,
    persistenceStatus: "persistent",
    pendingWriteId: null,
  }));

  useEffect(() => {
    tripRef.current = trip;
  }, [trip]);

  useEffect(() => {
    let active = true;
    const read = controllerStateOperation(() => store.read());
    const progress =
      read.status === "ready" ? parseTripProgress(read.value) : emptyTripProgress();
    const persistenceStatus: ProgressPersistenceStatus =
      read.status === "ready" ? "persistent" : "memory-only";
    queueMicrotask(() => {
      if (active) {
        setState({
          progress,
          hydratedStore: store,
          hydratedTripId: tripId,
          persistenceStatus,
          pendingWriteId: null,
        });
      }
    });
    return () => {
      active = false;
    };
  }, [store, tripId]);

  useEffect(() => {
    let active = true;
    const unsubscribe = controllerStateOperation(() => store.subscribe((value) => {
      if (!active) return;
      const progress = parseExternalProgress(value);
      if (progress === null) {
        return;
      }
      setState((current) =>
        current.hydratedStore === store && current.hydratedTripId === tripId
          ? { ...current, progress, pendingWriteId: null }
          : current,
      );
    }));
    return () => {
      active = false;
      controllerStateOperation(() => unsubscribe());
    };
  }, [store, tripId]);

  useEffect(() => {
    if (
      state.hydratedStore !== store ||
      state.hydratedTripId !== tripId ||
      state.persistenceStatus === "memory-only" ||
      state.pendingWriteId === null
    ) {
      return;
    }
    let active = true;
    if (!controllerStateOperation(() => store.write(JSON.stringify(state.progress)))) {
      queueMicrotask(() => {
        if (!active) {
          return;
        }
        setState((current) =>
          current.hydratedStore === store && current.hydratedTripId === tripId && current.pendingWriteId === state.pendingWriteId
            ? { ...current, persistenceStatus: "memory-only" }
            : current,
        );
      });
    }
    return () => {
      active = false;
    };
  }, [state, store, tripId]);

  const dispatch = useCallback(
    (reduce: (current: TripProgressV1) => TripProgressV1): void => {
      setState((current) => {
        if (current.hydratedStore !== store || current.hydratedTripId !== tripId) return current;
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
    [store, tripId],
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

  const resetTrip = useCallback((): void => {
    dispatch(() => emptyTripProgress());
  }, [dispatch]);

  return {
    progress: state.hydratedStore === store && state.hydratedTripId === tripId ? state.progress : unhydratedProgress,
    hydrated: state.hydratedStore === store && state.hydratedTripId === tripId,
    persistenceStatus: state.persistenceStatus,
    selectCandidate,
    setShoppingStatus,
    setSkipped,
    setCompleted,
    resetDay,
    resetTrip,
  };
}
