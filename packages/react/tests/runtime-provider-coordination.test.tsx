import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type {
  PlaceProviderResult,
  PlaceRequestV2,
  RouteProviderResult,
  RouteRequestV2,
} from "@laugh-tale-island/core";
import { useRuntimeProviders } from "../src/use-runtime-providers.js";

afterEach(cleanup);

const guardedRoute: RouteRequestV2 = {
  edge: { id: "edge", dayId: "one", fromNodeId: "a", toNodeId: "b", mode: "walking", source: "manual", certainty: "confirmed" },
  origin: { ownerId: "a", label: "A", identity: { status: "resolved", coordinates: { lat: 35, lng: 139 } } },
  destination: { ownerId: "b", label: "B", identity: { status: "resolved", coordinates: { lat: 35.001, lng: 139.001 } } },
};
const validRoute: RouteProviderResult = { status: "ready", durationMinutes: 10, distanceMeters: 200, steps: ["Walk"], geometry: [{ lat: 35, lng: 139 }, { lat: 35.001, lng: 139.001 }] };
it.each([
  { name: "endpoint mismatch", result: { ...validRoute, geometry: [{ lat: 0, lng: 0 }, { lat: 0.001, lng: 0.001 }] }, reason: "implausible-result", guard: "endpoint-gap" },
  { name: "point detour", result: { ...validRoute, geometry: [{ lat: 35, lng: 139 }, { lat: 40, lng: 140 }, { lat: 35.001, lng: 139.001 }] }, reason: "implausible-result", guard: "point-detour" },
  { name: "duration cap", result: { ...validRoute, durationMinutes: 721 }, reason: "implausible-result", guard: "duration-cap" },
  { name: "distance cap", result: { ...validRoute, distanceMeters: 100001 }, reason: "implausible-result", guard: "distance-cap" },
  { name: "speed cap", result: { ...validRoute, durationMinutes: 1, distanceMeters: 1000 }, reason: "implausible-result", guard: "speed-cap" },
  { name: "nonfinite scalar", result: { ...validRoute, durationMinutes: NaN }, reason: "malformed-response", guard: "scalar-or-steps" },
  { name: "missing steps", result: { status: "ready", durationMinutes: 10 }, reason: "malformed-response", guard: "scalar-or-steps" },
])("quarantines $name before route state publication", async ({ result, reason, guard }) => {
  const events: string[] = [];
  const runtime = { createRoutes: () => ({ load: () => Promise.resolve(result as RouteProviderResult) }) };
  const hook = renderHook(() => {
    const state = useRuntimeProviders({ dayId: "one", routeRequests: [guardedRoute], placeRequests: [], runtime, enabled: true, onDiagnostic: (event) => {
      expect(event).toMatchObject({ scope: "provider", channel: "route", phase: "request", ownerId: "edge", reason, diagnostic: `route-validation:${guard}` });
      events.push("diagnostic");
    } });
    if (state.routeStates.edge?.status === "unavailable") events.push("published");
    return state;
  });
  await waitFor(() => expect(hook.result.current.routeStates.edge).toEqual({ status: "unavailable", reason, retryable: false }));
  expect(events[0]).toBe("diagnostic");
  expect(events).toContain("published");
  expect(hook.result.current.providers.routes).toEqual({ status: "unavailable", reason, retryable: false });
});

it.each(["__proto__", "constructor", "toString"])("retains own provider states and channel aggregation for %s", async (id) => {
  let resolveRoute!: (result: RouteProviderResult) => void;
  let resolvePlace!: (result: PlaceProviderResult) => void;
  const runtime = {
    createRoutes: () => ({ load: () => new Promise<RouteProviderResult>((resolve) => { resolveRoute = resolve; }) }),
    createPlaces: () => ({ load: () => new Promise<PlaceProviderResult>((resolve) => { resolvePlace = resolve; }) }),
  };
  const hook = renderHook(() => useRuntimeProviders({ dayId: "one", routeRequests: [{ ...guardedRoute, edge: { ...guardedRoute.edge, id } }], placeRequests: [{ ...request, ownerId: id }], runtime, enabled: true }));
  expect(Object.hasOwn(hook.result.current.routeStates, id)).toBe(true);
  expect(Object.hasOwn(hook.result.current.placeStates, id)).toBe(true);
  expect(hook.result.current.routeStates[id]).toEqual({ status: "loading" });
  expect(hook.result.current.providers.routes).toEqual({ status: "loading", retryable: false });
  expect(hook.result.current.providers.places).toEqual({ status: "loading", retryable: false });
  await act(async () => { resolveRoute(validRoute); resolvePlace({ status: "unavailable", reason: "network", retryable: true }); await Promise.resolve(); });
  expect(hook.result.current.routeStates[id]).toEqual(validRoute);
  expect(hook.result.current.providers.routes).toEqual({ status: "ready", retryable: false });
  expect(hook.result.current.placeStates[id]).toEqual({ status: "unavailable", reason: "network", retryable: true });
  expect(hook.result.current.providers.places).toEqual({ status: "unavailable", reason: "network", retryable: true });
});

it("ignores stale route completions and preserves cancelled results without diagnostics", async () => {
  const pending: Array<{ request: RouteRequestV2; signal: AbortSignal; resolve: (value: RouteProviderResult) => void }> = [];
  const onDiagnostic = vi.fn();
  const runtime = { createRoutes: () => ({ load: (request: RouteRequestV2, signal: AbortSignal) => new Promise<RouteProviderResult>((resolve) => { pending.push({ request, signal, resolve }); }) }) };
  const input = { dayId: "one", routeRequests: [guardedRoute], placeRequests: [], runtime, onDiagnostic, enabled: true };
  const hook = renderHook(useRuntimeProviders, { initialProps: input });
  hook.rerender({ ...input, routeRequests: [{ ...guardedRoute, destination: { ...guardedRoute.destination, identity: { status: "resolved", coordinates: { lat: 40, lng: 140 } } } }] });
  expect(pending[0].signal.aborted).toBe(true);
  await act(async () => { pending[0].resolve({ status: "ready" } as RouteProviderResult); await Promise.resolve(); });
  expect(hook.result.current.routeStates.edge).toEqual({ status: "loading" });
  expect(onDiagnostic).not.toHaveBeenCalled();
  await act(async () => { pending[1].resolve(validRoute); await Promise.resolve(); });
  expect(hook.result.current.routeStates.edge).toEqual({ status: "unavailable", reason: "implausible-result", retryable: false });
  expect(onDiagnostic).toHaveBeenCalledOnce();
  hook.rerender({ ...input, dayId: "two" });
  await act(async () => { pending[2].resolve({ status: "unavailable", reason: "cancelled", retryable: false }); await Promise.resolve(); });
  expect(hook.result.current.routeStates.edge).toEqual({ status: "unavailable", reason: "cancelled", retryable: false });
  expect(onDiagnostic).toHaveBeenCalledOnce();
  hook.unmount();
  expect(pending[2].signal.aborted).toBe(true);
});

it("validates the captured original request even if an adapter mutates its input", async () => {
  const original = structuredClone(guardedRoute);
  const runtime = { createRoutes: () => ({ load: (request: RouteRequestV2): Promise<RouteProviderResult> => {
    Object.assign(request.destination, { identity: { status: "resolved", coordinates: { lat: 40, lng: 140 } } });
    return Promise.resolve({ status: "ready", durationMinutes: 10, steps: [], geometry: [{ lat: 35, lng: 139 }, { lat: 40, lng: 140 }] });
  } }) };
  const hook = renderHook(() => useRuntimeProviders({ dayId: "one", routeRequests: [original], placeRequests: [], enabled: true, runtime }));
  await waitFor(() => expect(hook.result.current.routeStates.edge).toEqual({ status: "unavailable", reason: "implausible-result", retryable: false }));
  expect(original.destination.identity).toEqual({ status: "resolved", coordinates: { lat: 35.001, lng: 139.001 } });
});

it("routes exact route requests and retry diagnostics through the route channel", async () => {
  const routeRequest: RouteRequestV2 = {
    edge: {
      id: "edge",
      dayId: "one",
      fromNodeId: "a",
      toNodeId: "b",
      mode: "driving",
      source: "manual",
      certainty: "confirmed",
    },
    origin: {
      ownerId: "a",
      label: "A",
      identity: { status: "resolved", coordinates: { lat: 1, lng: 2 } },
    },
    destination: {
      ownerId: "b",
      label: "B",
      identity: { status: "resolved", coordinates: { lat: 3, lng: 4 } },
    },
  };
  let loads = 0;
  const load = vi.fn<
    (
      request: RouteRequestV2,
      signal: AbortSignal,
    ) => Promise<RouteProviderResult>
  >(() =>
    Promise.resolve(
      ++loads === 1
        ? {
            status: "unavailable",
            reason: "implausible-result",
            retryable: true,
            diagnostic: "private route",
          }
        : { status: "ready", durationMinutes: 12, steps: ["Continue"] },
    ),
  );
  const runtime = { createRoutes: () => ({ load }) };
  const onDiagnostic = vi.fn();
  const hook = renderHook(() =>
    useRuntimeProviders({
      dayId: "one",
      routeRequests: [routeRequest],
      placeRequests: [],
      runtime,
      onDiagnostic,
      enabled: true,
    }),
  );
  await waitFor(() =>
    expect(hook.result.current.routeStates.edge?.status).toBe("unavailable"),
  );
  expect(load.mock.calls[0][0]).toEqual(routeRequest);
  expect(onDiagnostic).toHaveBeenCalledExactlyOnceWith({
    scope: "provider",
    channel: "route",
    phase: "request",
    reason: "implausible-result",
    ownerId: "edge",
    diagnostic: "private route",
  });
  act(() => hook.result.current.retry("route", "edge"));
  expect(load.mock.calls[0][1].aborted).toBe(true);
  await waitFor(() =>
    expect(hook.result.current.routeStates.edge).toEqual({
      status: "ready",
      durationMinutes: 12,
      steps: ["Continue"],
    }),
  );
});
const request: PlaceRequestV2 = {
  ownerId: "museum",
  providerReference: { provider: "neutral", id: "museum" },
  locale: "en",
  timeZone: "Asia/Tokyo",
};
it("cancels owner/day generations, ignores stale results and diagnostics, and retries once with the same adapter", async () => {
  const calls: {
    signal: AbortSignal;
    resolve(value: PlaceProviderResult): void;
  }[] = [];
  const createPlaces = vi.fn(() => ({
    load: (_request: PlaceRequestV2, signal: AbortSignal) =>
      new Promise<PlaceProviderResult>((resolve) => {
        calls.push({ signal, resolve });
      }),
  }));
  const onDiagnostic = vi.fn();
  const input = {
    dayId: "one",
    routeRequests: [],
    placeRequests: [request],
    runtime: { createPlaces },
    onDiagnostic,
    enabled: true,
  };
  const hook = renderHook(useRuntimeProviders, { initialProps: input });
  await waitFor(() => expect(calls).toHaveLength(1));
  hook.rerender({
    ...input,
    dayId: "two",
    placeRequests: [{ ...request, ownerId: "next" }],
  });
  expect(calls[0].signal.aborted).toBe(true);
  await act(async () => {
    calls[0].resolve({
      status: "unavailable",
      reason: "request-denied",
      retryable: true,
      diagnostic: "stale",
    });
    await Promise.resolve();
  });
  expect(onDiagnostic).not.toHaveBeenCalled();
  await act(async () => {
    calls[1].resolve({
      status: "unavailable",
      reason: "network",
      retryable: true,
      diagnostic: "private",
    });
    await Promise.resolve();
  });
  expect(onDiagnostic).toHaveBeenCalledExactlyOnceWith({
    scope: "provider",
    channel: "place",
    phase: "request",
    ownerId: "next",
    reason: "network",
    diagnostic: "private",
  });
  expect(hook.result.current.placeStates.next).toEqual({
    status: "unavailable",
    reason: "network",
    retryable: true,
  });
  act(() => hook.result.current.retry("place", "next"));
  expect(calls[1].signal.aborted).toBe(true);
  expect(calls).toHaveLength(3);
  expect(createPlaces).toHaveBeenCalledTimes(1);
});

it("reports original request rejection through a hostile sink without poisoning the provider state", async () => {
  const cause = new Error("private request");
  const onDiagnostic = vi.fn(() => {
    throw new Error("sink");
  });
  const runtime = {
    createPlaces: () => ({ load: () => Promise.reject(cause) }),
  };
  const hook = renderHook(() =>
    useRuntimeProviders({
      dayId: "one",
      routeRequests: [],
      placeRequests: [request],
      runtime,
      onDiagnostic,
      enabled: true,
    }),
  );
  await waitFor(() =>
    expect(hook.result.current.placeStates.museum?.status).toBe("unavailable"),
  );
  expect(onDiagnostic).toHaveBeenCalledExactlyOnceWith({
    scope: "provider",
    channel: "place",
    phase: "request",
    ownerId: "museum",
    reason: "network",
    cause,
  });
});

it("suppresses diagnostics from explicit cancelled results and aborts changed owner requests", async () => {
  const signals: AbortSignal[] = [];
  const runtime = {
    createPlaces: () => ({
      load: (
        _request: PlaceRequestV2,
        signal: AbortSignal,
      ): Promise<PlaceProviderResult> => {
        signals.push(signal);
        return Promise.resolve({
          status: "unavailable",
          reason: "cancelled",
          retryable: false,
          diagnostic: "cancelled generation",
        });
      },
    }),
  };
  const onDiagnostic = vi.fn();
  const input = {
    dayId: "one",
    routeRequests: [],
    placeRequests: [request],
    runtime,
    onDiagnostic,
    enabled: true,
  };
  const hook = renderHook(useRuntimeProviders, { initialProps: input });
  await waitFor(() =>
    expect(hook.result.current.placeStates.museum?.status).toBe("unavailable"),
  );
  expect(onDiagnostic).not.toHaveBeenCalled();
  hook.rerender({
    ...input,
    placeRequests: [
      {
        ...request,
        providerReference: { provider: "neutral", id: "replacement" },
      },
    ],
  });
  expect(signals[0].aborted).toBe(true);
  hook.unmount();
  expect(signals[1].aborted).toBe(true);
});

it("contains factory construction failures and retries the declared unavailable owner", async () => {
  const cause = new Error("private factory");
  const createPlaces = vi.fn(() => {
    if (createPlaces.mock.calls.length === 1) throw cause;
    return {
      load: (): Promise<PlaceProviderResult> =>
        Promise.resolve({ status: "ready", facts: {} }),
    };
  });
  const onDiagnostic = vi.fn();
  const hook = renderHook(() =>
    useRuntimeProviders({
      dayId: "one",
      routeRequests: [],
      placeRequests: [request],
      runtime: { createPlaces },
      onDiagnostic,
      enabled: true,
    }),
  );
  await waitFor(() =>
    expect(hook.result.current.placeStates.museum?.status).toBe("unavailable"),
  );
  expect(onDiagnostic).toHaveBeenCalledExactlyOnceWith({
    scope: "provider",
    channel: "place",
    phase: "runtime",
    reason: "network",
    cause,
  });
  act(() => hook.result.current.retry("place", "museum"));
  await waitFor(() =>
    expect(hook.result.current.placeStates.museum?.status).toBe("ready"),
  );
  expect(createPlaces).toHaveBeenCalledTimes(2);
});
