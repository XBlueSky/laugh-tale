import { useCallback, useEffect, useRef, useState } from "react";
import { collectDayProgressScope, emptyTripProgress, parseTripProgress, tripProgressReducer, } from "@laugh-tale-island/core";
const PROGRESS_KEYS = new Set([
    "version",
    "selectedCandidateIds",
    "shoppingStatuses",
    "skippedNodeIds",
    "completedIds",
]);
const SHOPPING_STATUSES = new Set([
    "pending",
    "purchased",
    "unavailable",
    "skipped",
]);
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonBlankString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isValidExternalProgress(value) {
    if (!isRecord(value)) {
        return false;
    }
    const keys = Object.keys(value);
    if (keys.length !== PROGRESS_KEYS.size ||
        keys.some((key) => !PROGRESS_KEYS.has(key)) ||
        value.version !== 1 ||
        !isRecord(value.selectedCandidateIds) ||
        !Object.entries(value.selectedCandidateIds).every(([key, candidateId]) => isNonBlankString(key) && isNonBlankString(candidateId)) ||
        !isRecord(value.shoppingStatuses) ||
        !Object.entries(value.shoppingStatuses).every(([key, status]) => isNonBlankString(key) &&
            typeof status === "string" &&
            SHOPPING_STATUSES.has(status)) ||
        !Array.isArray(value.skippedNodeIds) ||
        !value.skippedNodeIds.every(isNonBlankString) ||
        !Array.isArray(value.completedIds) ||
        !value.completedIds.every(isNonBlankString)) {
        return false;
    }
    return true;
}
function parseExternalProgress(raw) {
    if (raw === null) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        return isValidExternalProgress(parsed) ? parseTripProgress(raw) : null;
    }
    catch {
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
export function useTripProgress(trip, store) {
    const tripRef = useRef(trip);
    const writeSequenceRef = useRef(0);
    const [state, setState] = useState(() => ({
        progress: emptyTripProgress(),
        hydratedStore: null,
        persistenceStatus: "persistent",
        pendingWriteId: null,
    }));
    useEffect(() => {
        tripRef.current = trip;
    }, [trip]);
    useEffect(() => {
        let active = true;
        const read = store.read();
        const progress = read.status === "ready" ? parseTripProgress(read.value) : emptyTripProgress();
        const persistenceStatus = read.status === "ready" ? "persistent" : "memory-only";
        queueMicrotask(() => {
            if (active) {
                setState({
                    progress,
                    hydratedStore: store,
                    persistenceStatus,
                    pendingWriteId: null,
                });
            }
        });
        return () => {
            active = false;
        };
    }, [store]);
    useEffect(() => {
        const unsubscribe = store.subscribe((value) => {
            const progress = parseExternalProgress(value);
            if (progress === null) {
                return;
            }
            setState((current) => current.hydratedStore === store
                ? { ...current, progress, pendingWriteId: null }
                : current);
        });
        return unsubscribe;
    }, [store]);
    useEffect(() => {
        if (state.hydratedStore !== store ||
            state.persistenceStatus === "memory-only" ||
            state.pendingWriteId === null) {
            return;
        }
        let active = true;
        if (!store.write(JSON.stringify(state.progress))) {
            queueMicrotask(() => {
                if (!active) {
                    return;
                }
                setState((current) => current.hydratedStore === store && current.pendingWriteId === state.pendingWriteId
                    ? { ...current, persistenceStatus: "memory-only" }
                    : current);
            });
        }
        return () => {
            active = false;
        };
    }, [state, store]);
    const dispatch = useCallback((reduce) => {
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
    }, []);
    const selectCandidate = useCallback((groupId, candidateId) => {
        dispatch((current) => tripProgressReducer(current, {
            type: "select-candidate",
            groupId,
            candidateId,
        }));
    }, [dispatch]);
    const setShoppingStatus = useCallback((itemId, status) => {
        dispatch((current) => tripProgressReducer(current, {
            type: "set-shopping-status",
            itemId,
            status,
        }));
    }, [dispatch]);
    const setSkipped = useCallback((nodeId, skipped) => {
        dispatch((current) => tripProgressReducer(current, {
            type: "set-node-skipped",
            nodeId,
            skipped,
        }));
    }, [dispatch]);
    const setCompleted = useCallback((id, completed) => {
        dispatch((current) => tripProgressReducer(current, {
            type: "set-completed",
            id,
            completed,
        }));
    }, [dispatch]);
    const resetDay = useCallback((dayId) => {
        dispatch((current) => tripProgressReducer(current, {
            type: "reset-day",
            scope: collectDayProgressScope(tripRef.current, dayId),
        }));
    }, [dispatch]);
    return {
        progress: state.progress,
        hydrated: state.hydratedStore === store,
        persistenceStatus: state.persistenceStatus,
        selectCandidate,
        setShoppingStatus,
        setSkipped,
        setCompleted,
        resetDay,
    };
}
