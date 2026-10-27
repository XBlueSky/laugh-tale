import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import {
  validateRouteProviderResult,
  type RouteProviderResult,
  type RouteRequestV2,
  type RouteRuntimeState,
} from "@laugh-tale-island/core";
import type { RouteAdapterV2 } from "@laugh-tale-island/core/browser";

export type RouteLoadState = RouteRuntimeState;

export interface RouteStates {
  states: Readonly<Record<string, RouteLoadState>>;
  mapResults: Readonly<Record<string, Extract<RouteProviderResult, { status: "ready" }>>>;
  retry(routeId: string): boolean;
}

export interface UseRouteStatesOptions {
  /** Converts adapter failures to non-display diagnostic data. */
  adapterErrorReason?: (error: unknown) => string;
}

interface RouteDescriptor { request: RouteRequestV2; signature: string; }
interface StoredState { signature: string; state: RouteLoadState; }
interface ActiveRequest { signature: string; generation: number; controller: AbortController; }

function cloneRequest(request: RouteRequestV2): RouteRequestV2 {
  const cloneEndpoint = (endpoint: RouteRequestV2["origin"]): RouteRequestV2["origin"] => ({
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

function signature(request: RouteRequestV2): string {
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

function snapshotRequests(requests: readonly RouteRequestV2[]): { key: string; descriptors: readonly RouteDescriptor[] } {
  const owners = new Map<string, RouteDescriptor>();
  for (const request of requests) {
    if (!owners.has(request.edge.id)) {
      const snapshot = cloneRequest(request);
      owners.set(snapshot.edge.id, { request: snapshot, signature: signature(snapshot) });
    }
  }
  const descriptors = [...owners.values()];
  return { key: JSON.stringify(descriptors.map(({ request, signature: value }) => [request.edge.id, value])), descriptors };
}

function cloneState(state: RouteLoadState): RouteLoadState {
  if (state.status !== "ready") return { ...state };
  return {
    ...state,
    steps: [...state.steps],
    ...(state.geometry === undefined ? {} : { geometry: state.geometry.map((point) => ({ ...point })) }),
    ...(state.transit === undefined ? {} : { transit: { lines: state.transit.lines.map((line) => ({ ...line })) } }),
  };
}

function isMapResult(state: RouteLoadState): state is Extract<RouteProviderResult, { status: "ready" }> {
  return state.status === "ready" && state.geometry !== undefined;
}

function defaultAdapterErrorReason(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : "";
}

function recordsFrom(entries: ReadonlyMap<string, StoredState>): {
  states: Record<string, RouteLoadState>;
  mapResults: Record<string, Extract<RouteProviderResult, { status: "ready" }>>;
} {
  const states = Object.create(null) as Record<string, RouteLoadState>;
  const mapResults = Object.create(null) as Record<string, Extract<RouteProviderResult, { status: "ready" }>>;
  for (const [routeId, entry] of entries) {
    const state = cloneState(entry.state);
    Object.defineProperty(states, routeId, { configurable: true, enumerable: true, value: state, writable: true });
    if (isMapResult(state)) {
      Object.defineProperty(mapResults, routeId, { configurable: true, enumerable: true, value: cloneState(state), writable: true });
    }
  }
  return { states, mapResults };
}

export function useRouteStates(
  requests: readonly RouteRequestV2[],
  routeAdapterFactory?: () => RouteAdapterV2,
  options: UseRouteStatesOptions = {},
): RouteStates {
  const snapshot = snapshotRequests(requests);
  const adapterErrorReasonRef = useRef(options.adapterErrorReason ?? defaultAdapterErrorReason);
  adapterErrorReasonRef.current = options.adapterErrorReason ?? defaultAdapterErrorReason;
  const [entries, setEntries] = useState<ReadonlyMap<string, StoredState>>(() => new Map(
    snapshot.descriptors.map((descriptor) => [
      descriptor.request.edge.id,
      { signature: descriptor.signature, state: { status: "idle" } },
    ]),
  ));
  const entriesRef = useRef(entries);
  const currentRequestsRef = useRef(new Map<string, RouteDescriptor>());
  const activeRef = useRef(new Map<string, ActiveRequest>());
  const generationsRef = useRef(new Map<string, number>());
  const mountedRef = useRef(false);
  const adapterRef = useRef<RouteAdapterV2 | null>(null);
  const factoryRef = useRef(routeAdapterFactory);
  const factoryFailureRef = useRef<unknown>(undefined);
  factoryRef.current = routeAdapterFactory;

  const commitEntries = useCallback((next: ReadonlyMap<string, StoredState>): void => {
    entriesRef.current = next;
    if (mountedRef.current) setEntries(next);
  }, []);

  const getAdapter = useCallback((): RouteAdapterV2 | null => {
    if (adapterRef.current !== null) return adapterRef.current;
    const factory = factoryRef.current;
    if (factory === undefined) return null;
    try {
      adapterRef.current = factory();
      factoryFailureRef.current = undefined;
      return adapterRef.current;
    } catch (error: unknown) {
      factoryFailureRef.current = error;
      return null;
    }
  }, []);

  const startLoad = useCallback((descriptor: RouteDescriptor): boolean => {
    if (descriptor.request.edge.mode === "unknown") return false;
    const adapter = getAdapter();
    const routeId = descriptor.request.edge.id;
    if (adapter === null) {
      if (factoryRef.current === undefined) return false;
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
    const active: ActiveRequest = { signature: descriptor.signature, generation, controller };
    activeRef.current.set(routeId, active);
    const loading = new Map(entriesRef.current);
    loading.set(routeId, { signature: descriptor.signature, state: { status: "loading" } });
    commitEntries(loading);

    void Promise.resolve()
      .then(() => adapter.load(cloneRequest(descriptor.request), controller.signal))
      .then((result): RouteProviderResult => validateRouteProviderResult(descriptor.request, result))
      .catch((error: unknown): RouteProviderResult => controller.signal.aborted
        ? { status: "unavailable", reason: "cancelled", retryable: false, diagnostic: "route-request-aborted" }
        : { status: "unavailable", reason: "network", retryable: true, diagnostic: adapterErrorReasonRef.current(error) })
      .then((result) => {
        const currentActive = activeRef.current.get(routeId);
        const currentRequest = currentRequestsRef.current.get(routeId);
        if (
          controller.signal.aborted || !mountedRef.current || currentActive !== active ||
          currentActive.generation !== generation || currentRequest?.signature !== descriptor.signature
        ) return;
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
      for (const active of activeRef.current.values()) active.controller.abort();
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
    const retained = new Map<string, StoredState>();
    const pending: RouteDescriptor[] = [];
    for (const descriptor of descriptors) {
      const routeId = descriptor.request.edge.id;
      const existing = entriesRef.current.get(routeId);
      const active = activeRef.current.get(routeId);
      if (existing?.signature === descriptor.signature) {
        retained.set(routeId, existing);
        if (
          active === undefined &&
          (existing.state.status === "loading" ||
            (existing.state.status === "idle" && factoryRef.current !== undefined && descriptor.request.edge.mode !== "unknown"))
        ) pending.push(descriptor);
      } else if (descriptor.request.edge.mode === "unknown" || factoryRef.current === undefined) {
        retained.set(routeId, { signature: descriptor.signature, state: { status: "idle" } });
      } else {
        pending.push(descriptor);
      }
    }
    commitEntries(retained);
    for (const descriptor of pending) startLoad(descriptor);
  });

  useEffect(() => { synchronizeRequests(); }, [snapshot.key]);

  const retry = useCallback((routeId: string): boolean => {
    const descriptor = currentRequestsRef.current.get(routeId);
    const state = entriesRef.current.get(routeId)?.state;
    if (descriptor === undefined || descriptor.request.edge.mode === "unknown" || state?.status === "unavailable" && !state.retryable) return false;
    return startLoad(descriptor);
  }, [startLoad]);

  const output = useMemo(() => recordsFrom(entries), [entries]);
  return { ...output, retry };
}
