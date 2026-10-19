import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { validateRouteProviderResult, } from "@laugh-tale-island/core";
function cloneRequest(request) {
    const cloneEndpoint = (endpoint) => ({
        ...endpoint,
        identity: endpoint.identity.status === "resolved"
            ? {
                ...endpoint.identity,
                ...(endpoint.identity.coordinates === undefined ? {} : { coordinates: { ...endpoint.identity.coordinates } }),
                ...(endpoint.identity.providerReference === undefined ? {} : { providerReference: { ...endpoint.identity.providerReference } }),
            }
            : { ...endpoint.identity },
    });
    return {
        edge: {
            ...request.edge,
            ...(request.edge.navigation === undefined ? {} : { navigation: { ...request.edge.navigation } }),
        },
        origin: cloneEndpoint(request.origin),
        destination: cloneEndpoint(request.destination),
        ...(request.departureAt === undefined ? {} : { departureAt: request.departureAt }),
        ...(request.transitPreferences === undefined
            ? {}
            : {
                transitPreferences: {
                    ...(request.transitPreferences.allowedModes === undefined
                        ? {}
                        : { allowedModes: [...request.transitPreferences.allowedModes] }),
                },
            }),
    };
}
function signature(request) {
    const snapshot = cloneRequest(request);
    return JSON.stringify({
        edge: snapshot.edge,
        origin: snapshot.origin,
        destination: snapshot.destination,
        departureAt: snapshot.departureAt ?? null,
        transitPreferences: snapshot.transitPreferences?.allowedModes === undefined
            ? null
            : [...snapshot.transitPreferences.allowedModes].sort(),
    });
}
function snapshotRequests(requests) {
    const owners = new Map();
    for (const request of requests) {
        if (!owners.has(request.edge.id)) {
            const snapshot = cloneRequest(request);
            owners.set(snapshot.edge.id, { request: snapshot, signature: signature(snapshot) });
        }
    }
    const descriptors = [...owners.values()];
    return { key: JSON.stringify(descriptors.map(({ request, signature: value }) => [request.edge.id, value])), descriptors };
}
function cloneState(state) {
    if (state.status !== "ready")
        return { ...state };
    return {
        ...state,
        steps: [...state.steps],
        ...(state.geometry === undefined ? {} : { geometry: state.geometry.map((point) => ({ ...point })) }),
        ...(state.transit === undefined ? {} : { transit: { lines: state.transit.lines.map((line) => ({ ...line })) } }),
    };
}
function isMapResult(state) {
    return state.status === "ready" && state.geometry !== undefined;
}
function defaultAdapterErrorReason(error) {
    return error instanceof Error && error.message.trim().length > 0 ? error.message : "";
}
function recordsFrom(entries) {
    const states = Object.create(null);
    const mapResults = Object.create(null);
    for (const [routeId, entry] of entries) {
        const state = cloneState(entry.state);
        Object.defineProperty(states, routeId, { configurable: true, enumerable: true, value: state, writable: true });
        if (isMapResult(state)) {
            Object.defineProperty(mapResults, routeId, { configurable: true, enumerable: true, value: cloneState(state), writable: true });
        }
    }
    return { states, mapResults };
}
export function useRouteStates(requests, routeAdapterFactory, options = {}) {
    const snapshot = snapshotRequests(requests);
    const adapterErrorReasonRef = useRef(options.adapterErrorReason ?? defaultAdapterErrorReason);
    adapterErrorReasonRef.current = options.adapterErrorReason ?? defaultAdapterErrorReason;
    const [entries, setEntries] = useState(() => new Map(snapshot.descriptors.map((descriptor) => [
        descriptor.request.edge.id,
        { signature: descriptor.signature, state: { status: "idle" } },
    ])));
    const entriesRef = useRef(entries);
    const currentRequestsRef = useRef(new Map());
    const activeRef = useRef(new Map());
    const generationsRef = useRef(new Map());
    const mountedRef = useRef(false);
    const adapterRef = useRef(null);
    const factoryRef = useRef(routeAdapterFactory);
    const factoryFailureRef = useRef(undefined);
    factoryRef.current = routeAdapterFactory;
    const commitEntries = useCallback((next) => {
        entriesRef.current = next;
        if (mountedRef.current)
            setEntries(next);
    }, []);
    const getAdapter = useCallback(() => {
        if (adapterRef.current !== null)
            return adapterRef.current;
        const factory = factoryRef.current;
        if (factory === undefined)
            return null;
        try {
            adapterRef.current = factory();
            factoryFailureRef.current = undefined;
            return adapterRef.current;
        }
        catch (error) {
            factoryFailureRef.current = error;
            return null;
        }
    }, []);
    const startLoad = useCallback((descriptor) => {
        if (descriptor.request.edge.mode === "unknown")
            return false;
        const adapter = getAdapter();
        const routeId = descriptor.request.edge.id;
        if (adapter === null) {
            if (factoryRef.current === undefined)
                return false;
            const failed = new Map(entriesRef.current);
            failed.set(routeId, {
                signature: descriptor.signature,
                state: { status: "unavailable", reason: "network", retryable: true, diagnostic: adapterErrorReasonRef.current(factoryFailureRef.current) },
            });
            commitEntries(failed);
            return true;
        }
        activeRef.current.get(routeId)?.controller.abort();
        const generation = (generationsRef.current.get(routeId) ?? 0) + 1;
        generationsRef.current.set(routeId, generation);
        const controller = new AbortController();
        const active = { signature: descriptor.signature, generation, controller };
        activeRef.current.set(routeId, active);
        const loading = new Map(entriesRef.current);
        loading.set(routeId, { signature: descriptor.signature, state: { status: "loading" } });
        commitEntries(loading);
        void Promise.resolve()
            .then(() => adapter.load(cloneRequest(descriptor.request), controller.signal))
            .then((result) => validateRouteProviderResult(descriptor.request, result))
            .catch((error) => controller.signal.aborted
            ? { status: "unavailable", reason: "cancelled", retryable: false, diagnostic: "route-request-aborted" }
            : { status: "unavailable", reason: "network", retryable: true, diagnostic: adapterErrorReasonRef.current(error) })
            .then((result) => {
            const currentActive = activeRef.current.get(routeId);
            const currentRequest = currentRequestsRef.current.get(routeId);
            if (controller.signal.aborted || !mountedRef.current || currentActive !== active ||
                currentActive.generation !== generation || currentRequest?.signature !== descriptor.signature)
                return;
            activeRef.current.delete(routeId);
            const settled = new Map(entriesRef.current);
            settled.set(routeId, { signature: descriptor.signature, state: cloneState(result) });
            commitEntries(settled);
        });
        return true;
    }, [commitEntries, getAdapter]);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            for (const active of activeRef.current.values())
                active.controller.abort();
            activeRef.current.clear();
        };
    }, []);
    const synchronizeRequests = useEffectEvent(() => {
        const descriptors = snapshotRequests(requests).descriptors;
        const currentRequests = new Map(descriptors.map((descriptor) => [descriptor.request.edge.id, descriptor]));
        currentRequestsRef.current = currentRequests;
        for (const [routeId, active] of activeRef.current) {
            if (currentRequests.get(routeId)?.signature !== active.signature) {
                active.controller.abort();
                activeRef.current.delete(routeId);
            }
        }
        const retained = new Map();
        const pending = [];
        for (const descriptor of descriptors) {
            const routeId = descriptor.request.edge.id;
            const existing = entriesRef.current.get(routeId);
            const active = activeRef.current.get(routeId);
            if (existing?.signature === descriptor.signature) {
                retained.set(routeId, existing);
                if (active === undefined &&
                    (existing.state.status === "loading" ||
                        (existing.state.status === "idle" && factoryRef.current !== undefined && descriptor.request.edge.mode !== "unknown")))
                    pending.push(descriptor);
            }
            else if (descriptor.request.edge.mode === "unknown" || factoryRef.current === undefined) {
                retained.set(routeId, { signature: descriptor.signature, state: { status: "idle" } });
            }
            else {
                pending.push(descriptor);
            }
        }
        commitEntries(retained);
        for (const descriptor of pending)
            startLoad(descriptor);
    });
    useEffect(() => { synchronizeRequests(); }, [snapshot.key]);
    const retry = useCallback((routeId) => {
        const descriptor = currentRequestsRef.current.get(routeId);
        const state = entriesRef.current.get(routeId)?.state;
        if (descriptor === undefined || descriptor.request.edge.mode === "unknown" || state?.status === "unavailable" && !state.retryable)
            return false;
        return startLoad(descriptor);
    }, [startLoad]);
    const output = useMemo(() => recordsFrom(entries), [entries]);
    return { ...output, retry };
}
