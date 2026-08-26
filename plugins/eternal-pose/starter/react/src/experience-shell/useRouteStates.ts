import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import type { RouteEdge } from "../trip-core/model";
import type {
  RouteAdapter,
  RouteResult,
} from "./provider-contracts";

export type RouteLoadState = RouteResult | { status: "loading" };

export interface RouteStates {
  states: Readonly<Record<string, RouteLoadState>>;
  mapResults: Readonly<Record<string, RouteResult>>;
  retry(routeId: string): boolean;
}

interface RouteDescriptor {
  edge: RouteEdge;
  signature: string;
}

interface StoredState {
  signature: string;
  state: RouteLoadState;
}

interface ActiveRequest {
  signature: string;
  generation: number;
  controller: AbortController;
}

function cloneEdge(edge: RouteEdge): RouteEdge {
  return {
    ...edge,
    ...(edge.navigation === undefined
      ? {}
      : { navigation: { ...edge.navigation } }),
  };
}

function edgeSignature(edge: RouteEdge): string {
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
    navigation:
      edge.navigation === undefined
        ? null
        : {
            origin: edge.navigation.origin,
            destination: edge.navigation.destination,
          },
  });
}

function snapshotRoutes(routes: readonly RouteEdge[]): {
  key: string;
  descriptors: readonly RouteDescriptor[];
} {
  const owners = new Map<string, RouteDescriptor>();
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

function cloneState(state: RouteLoadState): RouteLoadState {
  if (state.status === "loading" || state.status === "unavailable") {
    return { ...state };
  }
  return {
    ...state,
    path: state.path.map((point) => ({ ...point })),
    steps: [...state.steps],
  };
}

function validReadyGeometry(
  state: RouteLoadState,
): state is Extract<RouteResult, { status: "ready" }> {
  return (
    state.status === "ready" &&
    state.path.length >= 2 &&
    state.path.every(
      ({ lat, lng }) =>
        Number.isFinite(lat) &&
        lat >= -90 &&
        lat <= 90 &&
        Number.isFinite(lng) &&
        lng >= -180 &&
        lng <= 180,
    )
  );
}

function unavailableReason(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Route provider unavailable";
}

function recordsFrom(entries: ReadonlyMap<string, StoredState>): {
  states: Record<string, RouteLoadState>;
  mapResults: Record<string, RouteResult>;
} {
  const states = Object.create(null) as Record<string, RouteLoadState>;
  const mapResults = Object.create(null) as Record<string, RouteResult>;
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

export function useRouteStates(
  routes: readonly RouteEdge[],
  routeAdapterFactory?: () => RouteAdapter,
): RouteStates {
  const routeKey = snapshotRoutes(routes).key;
  const [adapter] = useState<RouteAdapter | null>(() =>
    routeAdapterFactory === undefined ? null : routeAdapterFactory(),
  );
  const [entries, setEntries] = useState<ReadonlyMap<string, StoredState>>(
    () => new Map(),
  );
  const entriesRef = useRef(entries);
  const currentRoutesRef = useRef(new Map<string, RouteDescriptor>());
  const activeRef = useRef(new Map<string, ActiveRequest>());
  const generationsRef = useRef(new Map<string, number>());
  const mountedRef = useRef(false);

  const commitEntries = useCallback(
    (next: ReadonlyMap<string, StoredState>): void => {
      entriesRef.current = next;
      if (mountedRef.current) {
        setEntries(next);
      }
    },
    [],
  );

  const startLoad = useCallback(
    (descriptor: RouteDescriptor): boolean => {
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
        .catch((error: unknown): RouteResult => ({
          status: "unavailable",
          reason: unavailableReason(error),
        }))
        .then((result) => {
          const currentActive = activeRef.current.get(routeId);
          const currentRoute = currentRoutesRef.current.get(routeId);
          if (
            controller.signal.aborted ||
            !mountedRef.current ||
            currentActive !== active ||
            currentActive.generation !== generation ||
            currentRoute?.signature !== descriptor.signature
          ) {
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
    },
    [adapter, commitEntries],
  );

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
    const currentRoutes = new Map(
      descriptors.map((descriptor) => [descriptor.edge.id, descriptor]),
    );
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

    const retained = new Map<string, StoredState>();
    const pending: RouteDescriptor[] = [];
    for (const descriptor of descriptors) {
      const existing = entriesRef.current.get(descriptor.edge.id);
      const active = activeRef.current.get(descriptor.edge.id);
      if (existing?.signature === descriptor.signature) {
        retained.set(descriptor.edge.id, existing);
        if (existing.state.status === "loading" && active === undefined) {
          pending.push(descriptor);
        }
      } else {
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

  const retry = useCallback(
    (routeId: string): boolean => {
      const descriptor = currentRoutesRef.current.get(routeId);
      return descriptor === undefined ? false : startLoad(descriptor);
    },
    [startLoad],
  );

  const output = useMemo(() => recordsFrom(entries), [entries]);
  return { ...output, retry };
}
