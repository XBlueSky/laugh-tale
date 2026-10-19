import { createContext, useCallback, useContext, useEffect, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState, } from "react";
import { validateRouteProviderResult } from "@laugh-tale-island/core";
import { emitTripDiagnostic } from "./emit-trip-diagnostic.js";
import { ControllerStateFailure } from "./normalize-controller-error.js";
/** Controller-owned lifetime, with at most one current attempt per channel. */
export const BootstrapDiagnosticContext = createContext(null);
export function sanitizeProviderFailure(result) {
    return {
        status: "unavailable",
        reason: result.reason,
        retryable: result.retryable,
    };
}
export function reportProviderFailure(sink, channel, phase, failure, ownerId, cause) {
    emitTripDiagnostic(sink, {
        scope: "provider",
        channel,
        phase,
        reason: failure.reason,
        ...(ownerId === undefined ? {} : { ownerId }),
        ...(failure.diagnostic === undefined
            ? {}
            : { diagnostic: failure.diagnostic }),
        ...(cause === undefined ? {} : { cause }),
    });
}
export function useBootstrapProviders(runtime, bootstrap, sink) {
    const inherited = useContext(BootstrapDiagnosticContext);
    const [local] = useState(() => new Map());
    const ledger = inherited ?? local;
    const [acknowledged, acknowledge] = useState(() => new Map(ledger));
    const latestSink = useRef(sink);
    useInsertionEffect(() => {
        latestSink.current = sink;
    }, [sink]);
    const { map, routes, places } = bootstrap ?? {};
    if ((map !== undefined && runtime?.createMap !== undefined) ||
        (routes !== undefined && runtime?.createRoutes !== undefined) ||
        (places !== undefined && runtime?.createPlaces !== undefined))
        throw new ControllerStateFailure(new Error("contradictory-provider-bootstrap"));
    const attempts = [
        ["map", map?.status === "loading" ? undefined : map],
        ["route", routes],
        ["place", places],
    ];
    const keys = new Map();
    for (const [channel, failure] of attempts) {
        if (failure !== undefined)
            keys.set(channel, JSON.stringify([failure.reason, failure.retryable, failure.diagnostic]));
    }
    // Only committed semantic attempts report; acknowledgement publishes afterwards.
    // At most one key per channel is retained, including across surface switches.
    useLayoutEffect(() => {
        for (const [channel, failure] of attempts) {
            if (failure === undefined)
                ledger.delete(channel);
            else if (ledger.get(channel) !== keys.get(channel)) {
                ledger.set(channel, keys.get(channel));
                reportProviderFailure(latestSink.current, channel, "bootstrap", failure);
            }
        }
        if (attempts.some(([channel]) => acknowledged.get(channel) !== keys.get(channel))) {
            acknowledge(keys);
        }
    });
    const pending = {
        map: map?.status === "unavailable" && acknowledged.get("map") !== keys.get("map"),
        routes: routes !== undefined && acknowledged.get("route") !== keys.get("route"),
        places: places !== undefined && acknowledged.get("place") !== keys.get("place"),
    };
    const published = {
        ...(map === undefined || pending.map ? {} : { map }),
        ...(routes === undefined || pending.routes ? {} : { routes }),
        ...(places === undefined || pending.places ? {} : { places }),
    };
    return { published, pending };
}
const missing = {
    status: "unavailable",
    reason: "missing-configuration",
    retryable: false,
};
const rejected = {
    status: "unavailable",
    reason: "network",
    retryable: true,
};
function useProviderRequests(channel, factory, requests, ownerFor, dayId, enabled, bootstrap, bootstrapPending, sink, validate) {
    const adapter = useRef(null);
    const records = useRef(new Map());
    const factoryFailure = useRef(null);
    const latestSink = useRef(sink);
    const [, refresh] = useState(0);
    const [factoryAttempt, retryFactory] = useState(0);
    useInsertionEffect(() => {
        latestSink.current = sink;
    }, [sink]);
    const cancel = useCallback(() => {
        for (const record of records.current.values())
            record.abort.abort();
        records.current.clear();
    }, []);
    useEffect(() => {
        factoryFailure.current = null;
        if (factory === undefined || !enabled)
            return;
        try {
            adapter.current = factory();
        }
        catch (cause) {
            reportProviderFailure(latestSink.current, channel, "runtime", rejected, undefined, cause);
            factoryFailure.current = rejected;
        }
        refresh((revision) => revision + 1);
        return () => {
            cancel();
            adapter.current = null;
        };
    }, [factory, enabled, cancel, channel, factoryAttempt]);
    // Inspect committed request identity: unchanged owners keep their independent request.
    useEffect(() => {
        if (!enabled || adapter.current === null)
            return;
        const desired = new Map(requests.map((request) => [
            ownerFor(request),
            { request, key: JSON.stringify([dayId, request]) },
        ]));
        let changed = false;
        for (const [id, record] of records.current) {
            if (desired.get(id)?.key !== record.key) {
                record.abort.abort();
                records.current.delete(id);
                changed = true;
            }
        }
        for (const [id, { request, key }] of desired) {
            if (records.current.has(id))
                continue;
            const record = {
                key,
                abort: new AbortController(),
                state: { status: "loading" },
            };
            records.current.set(id, record);
            changed = true;
            const active = () => !record.abort.signal.aborted && records.current.get(id) === record;
            let originalRequest = request;
            const complete = (result, cause) => {
                if (!active())
                    return;
                if (validate !== undefined)
                    result = validate(originalRequest, result);
                if (result.status === "unavailable" && result.reason !== "cancelled")
                    reportProviderFailure(latestSink.current, channel, "request", result, id, cause);
                record.state = (result.status === "unavailable"
                    ? sanitizeProviderFailure(result)
                    : result);
                refresh((revision) => revision + 1);
            };
            try {
                // Keep quarantine anchored to the committed request, independent of adapter mutation.
                originalRequest = validate === undefined ? request : structuredClone(request);
                const adapterRequest = validate === undefined ? request : structuredClone(originalRequest);
                void adapter.current.load(adapterRequest, record.abort.signal).then((result) => complete(result), (cause) => complete(rejected, cause));
            }
            catch (cause) {
                complete(rejected, cause);
            }
        }
        if (changed)
            refresh((revision) => revision + 1);
    });
    const retry = useCallback((id) => {
        if (factoryFailure.current?.retryable) {
            factoryFailure.current = null;
            retryFactory((attempt) => attempt + 1);
            return;
        }
        const record = records.current.get(id);
        if (record?.state.status !== "unavailable" || !record.state.retryable)
            return;
        record.abort.abort();
        records.current.delete(id);
        refresh((revision) => revision + 1);
    }, []);
    const states = Object.create(null);
    const retryableIds = [];
    for (const request of requests) {
        const id = ownerFor(request);
        const record = records.current.get(id);
        const current = record?.key === JSON.stringify([dayId, request])
            ? record.state
            : undefined;
        if (enabled &&
            factory !== undefined &&
            (factoryFailure.current?.retryable === true ||
                (current?.status === "unavailable" && current.retryable)))
            retryableIds.push(id);
        states[id] = bootstrapPending
            ? { status: "idle" }
            : (current ??
                (bootstrap === undefined && factory !== undefined
                    ? (factoryFailure.current ?? { status: enabled ? "loading" : "idle" })
                    : sanitizeProviderFailure(bootstrap ?? missing)));
    }
    const values = Object.values(states);
    const unavailable = values.find((state) => state.status === "unavailable");
    const status = bootstrapPending
        ? { status: "idle", retryable: false }
        : bootstrap !== undefined || factory === undefined
            ? sanitizeProviderFailure(bootstrap ?? missing)
            : unavailable?.status === "unavailable"
                ? sanitizeProviderFailure(unavailable)
                : {
                    status: values.some((state) => state.status === "loading")
                        ? "loading"
                        : values.length > 0
                            ? "ready"
                            : "idle",
                    retryable: false,
                };
    return { states, retry, status, retryableIds };
}
const routeOwner = (request) => request.edge.id;
const placeOwner = (request) => request.ownerId;
export function useRuntimeProviders(input) {
    const bootstrap = useBootstrapProviders(input.runtime, input.providerBootstrap, input.onDiagnostic);
    // Factory identity is the lifecycle key; the invoked function remains bound to its receiver.
    const createRoutes = useMemo(() => input.runtime?.createRoutes?.bind(input.runtime), 
    // eslint-disable-next-line @typescript-eslint/unbound-method
    [input.runtime?.createRoutes]);
    const createPlaces = useMemo(() => input.runtime?.createPlaces?.bind(input.runtime), 
    // eslint-disable-next-line @typescript-eslint/unbound-method
    [input.runtime?.createPlaces]);
    const routes = useProviderRequests("route", createRoutes, input.routeRequests, routeOwner, input.dayId, input.enabled, bootstrap.published.routes, bootstrap.pending.routes, input.onDiagnostic, validateRouteProviderResult);
    const places = useProviderRequests("place", createPlaces, input.placeRequests, placeOwner, input.dayId, input.enabled, bootstrap.published.places, bootstrap.pending.places, input.onDiagnostic);
    return {
        bootstrap,
        routeStates: routes.states,
        placeStates: places.states,
        retryRouteIds: routes.retryableIds,
        retryPlaceOwnerIds: places.retryableIds,
        providers: { routes: routes.status, places: places.status },
        retry: (kind, id) => (kind === "route" ? routes : places).retry(id),
    };
}
