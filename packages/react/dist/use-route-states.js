import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, } from "react";
function cloneEdge(edge) {
    return {
        ...edge,
        ...(edge.navigation === undefined
            ? {}
            : { navigation: { ...edge.navigation } }),
    };
}
function edgeSignature(edge) {
    return JSON.stringify({
        id: edge.id,
        dayId: edge.dayId,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        mode: edge.mode,
        source: edge.source,
        certainty: edge.certainty,
        durationMinutes: edge.durationMinutes ?? null,
        distanceMeters: edge.distanceMeters ?? null,
        summary: edge.summary ?? null,
        navigation: edge.navigation === undefined
            ? null
            : {
                origin: edge.navigation.origin,
                destination: edge.navigation.destination,
            },
    });
}
function snapshotRoutes(routes) {
    const owners = new Map();
    for (const edge of routes) {
        if (!owners.has(edge.id)) {
            const snapshot = cloneEdge(edge);
            owners.set(edge.id, {
                edge: snapshot,
                signature: edgeSignature(snapshot),
            });
        }
    }
    const descriptors = [...owners.values()];
    return {
        key: JSON.stringify(descriptors.map(({ edge, signature }) => [edge.id, signature])),
        descriptors,
    };
}
function cloneState(state) {
    if (state.status === "loading" || state.status === "unavailable") {
        return { ...state };
    }
    return {
        ...state,
        path: state.path.map((point) => ({ ...point })),
        steps: [...state.steps],
    };
}
function validReadyGeometry(state) {
    return (state.status === "ready" &&
        state.path.length >= 2 &&
        state.path.every(({ lat, lng }) => Number.isFinite(lat) &&
            lat >= -90 &&
            lat <= 90 &&
            Number.isFinite(lng) &&
            lng >= -180 &&
            lng <= 180));
}
function defaultAdapterErrorReason(error) {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    return "";
}
function recordsFrom(entries) {
    const states = Object.create(null);
    const mapResults = Object.create(null);
    for (const [routeId, entry] of entries) {
        const state = cloneState(entry.state);
        Object.defineProperty(states, routeId, {
            configurable: true,
            enumerable: true,
            value: state,
            writable: true,
        });
        if (validReadyGeometry(state)) {
            Object.defineProperty(mapResults, routeId, {
                configurable: true,
                enumerable: true,
                value: cloneState(state),
                writable: true,
            });
        }
    }
    return { states, mapResults };
}
export function useRouteStates(routes, routeAdapterFactory, options = {}) {
    const adapterErrorReasonRef = useRef(options.adapterErrorReason ?? defaultAdapterErrorReason);
    adapterErrorReasonRef.current = options.adapterErrorReason ?? defaultAdapterErrorReason;
    const routeKey = snapshotRoutes(routes).key;
    const [adapter] = useState(() => routeAdapterFactory === undefined ? null : routeAdapterFactory());
    const [entries, setEntries] = useState(() => new Map());
    const entriesRef = useRef(entries);
    const currentRoutesRef = useRef(new Map());
    const activeRef = useRef(new Map());
    const generationsRef = useRef(new Map());
    const mountedRef = useRef(false);
    const commitEntries = useCallback((next) => {
        entriesRef.current = next;
        if (mountedRef.current) {
            setEntries(next);
        }
    }, []);
    const startLoad = useCallback((descriptor) => {
        if (adapter === null) {
            return false;
        }
        const routeId = descriptor.edge.id;
        activeRef.current.get(routeId)?.controller.abort();
        const generation = (generationsRef.current.get(routeId) ?? 0) + 1;
        generationsRef.current.set(routeId, generation);
        const controller = new AbortController();
        const active = {
            signature: descriptor.signature,
            generation,
            controller,
        };
        activeRef.current.set(routeId, active);
        const loading = new Map(entriesRef.current);
        loading.set(routeId, {
            signature: descriptor.signature,
            state: { status: "loading" },
        });
        commitEntries(loading);
        void Promise.resolve()
            .then(() => adapter.load({ edge: cloneEdge(descriptor.edge) }, controller.signal))
            .catch((error) => ({
            status: "unavailable",
            reason: adapterErrorReasonRef.current(error),
        }))
            .then((result) => {
            const currentActive = activeRef.current.get(routeId);
            const currentRoute = currentRoutesRef.current.get(routeId);
            if (controller.signal.aborted ||
                !mountedRef.current ||
                currentActive !== active ||
                currentActive.generation !== generation ||
                currentRoute?.signature !== descriptor.signature) {
                return;
            }
            activeRef.current.delete(routeId);
            const settled = new Map(entriesRef.current);
            settled.set(routeId, {
                signature: descriptor.signature,
                state: cloneState(result),
            });
            commitEntries(settled);
        });
        return true;
    }, [adapter, commitEntries]);
    useEffect(() => {
        const activeRequests = activeRef.current;
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            for (const request of activeRequests.values()) {
                request.controller.abort();
            }
            activeRequests.clear();
        };
    }, []);
    const synchronizeRoutes = useEffectEvent(() => {
        const descriptors = snapshotRoutes(routes).descriptors;
        const currentRoutes = new Map(descriptors.map((descriptor) => [descriptor.edge.id, descriptor]));
        currentRoutesRef.current = currentRoutes;
        for (const [routeId, request] of activeRef.current) {
            if (currentRoutes.get(routeId)?.signature !== request.signature) {
                request.controller.abort();
                activeRef.current.delete(routeId);
            }
        }
        if (adapter === null) {
            if (entriesRef.current.size > 0) {
                commitEntries(new Map());
            }
            return;
        }
        const retained = new Map();
        const pending = [];
        for (const descriptor of descriptors) {
            const existing = entriesRef.current.get(descriptor.edge.id);
            const active = activeRef.current.get(descriptor.edge.id);
            if (existing?.signature === descriptor.signature) {
                retained.set(descriptor.edge.id, existing);
                if (existing.state.status === "loading" && active === undefined) {
                    pending.push(descriptor);
                }
            }
            else {
                pending.push(descriptor);
            }
        }
        commitEntries(retained);
        for (const descriptor of pending) {
            startLoad(descriptor);
        }
    });
    useEffect(() => {
        synchronizeRoutes();
    }, [routeKey]);
    const retry = useCallback((routeId) => {
        const descriptor = currentRoutesRef.current.get(routeId);
        return descriptor === undefined ? false : startLoad(descriptor);
    }, [startLoad]);
    const output = useMemo(() => recordsFrom(entries), [entries]);
    return { ...output, retry };
}
