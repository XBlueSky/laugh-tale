import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { RouteProviderResult, RouteRequestV2 } from "@laugh-tale-island/core";
import type { RouteAdapterV2 } from "@laugh-tale-island/core/browser";
import { useRouteStates } from "../src/use-route-states.js";

function route(id: string, fromNodeId = `${id}-from`, toNodeId = `${id}-to`, mode: RouteRequestV2["edge"]["mode"] = "walking"): RouteRequestV2 {
  return {
    edge: { id, dayId: "day-one", fromNodeId, toNodeId, mode, source: "manual", certainty: "suggested" },
    origin: { ownerId: fromNodeId, label: `From ${fromNodeId}`, identity: { status: "resolved", coordinates: { lat: 35, lng: 139 } } },
    destination: { ownerId: toNodeId, label: `To ${toNodeId}`, identity: { status: "resolved", coordinates: { lat: 35.01, lng: 139.01 } } },
    departureAt: "2040-01-01T09:00:00+09:00",
    transitPreferences: { allowedModes: ["bus", "rail"] },
  };
}

function ready(index = 0): Extract<RouteProviderResult, { status: "ready" }> {
  return { status: "ready", durationMinutes: 8 + index, distanceMeters: 2_000, geometry: [{ lat: 35 + index * 0.01, lng: 139 }, { lat: 35.01 + index * 0.01, lng: 139.01 }], steps: ["Walk", "Arrive"] };
}

interface PendingLoad { request: RouteRequestV2; signal: AbortSignal; resolve(result: RouteProviderResult): void; reject(error: unknown): void; }
class ControlledRouteAdapter implements RouteAdapterV2 {
  readonly loads: PendingLoad[] = [];
  load(request: RouteRequestV2, signal: AbortSignal): Promise<RouteProviderResult> {
    return new Promise((resolve, reject) => { this.loads.push({ request, signal, resolve, reject }); });
  }
}

describe("useRouteStates", () => {
  test("initializes every owner as idle and performs zero provider work without a factory", () => {
    const { result } = renderHook(() => useRouteStates([route("route-a")], undefined));
    expect(result.current.states["route-a"]).toEqual({ status: "idle" });
    expect(Object.keys(result.current.mapResults)).toEqual([]);
    expect(result.current.retry("route-a")).toBe(false);
  });

  test("loads each stable owner once and ignores equivalent rerendered request objects", async () => {
    const adapter = new ControlledRouteAdapter();
    const { result, rerender } = renderHook(({ routes }: { routes: RouteRequestV2[] }) => useRouteStates(routes, () => adapter), { initialProps: { routes: [route("route-a"), route("route-b")] } });
    await waitFor(() => expect(adapter.loads).toHaveLength(2));
    expect(result.current.states["route-a"]).toEqual({ status: "loading" });
    act(() => { adapter.loads[0]?.resolve(ready(0)); adapter.loads[1]?.resolve(ready(1)); });
    await waitFor(() => expect(result.current.states["route-b"]?.status).toBe("ready"));
    rerender({ routes: [route("route-a"), route("route-b")] });
    await Promise.resolve();
    expect(adapter.loads).toHaveLength(2);
    expect(result.current.mapResults["route-a"]?.status).toBe("ready");
  });

  test("aborts removed work and never lets a late result overwrite current owners", async () => {
    const adapter = new ControlledRouteAdapter();
    const { result, rerender } = renderHook(({ routes }: { routes: RouteRequestV2[] }) => useRouteStates(routes, () => adapter), { initialProps: { routes: [route("route-old")] } });
    await waitFor(() => expect(adapter.loads).toHaveLength(1));
    const oldLoad = adapter.loads[0];
    rerender({ routes: [route("route-current")] });
    await waitFor(() => expect(adapter.loads).toHaveLength(2));
    expect(oldLoad.signal.aborted).toBe(true);
    act(() => { oldLoad.resolve(ready(0)); adapter.loads[1]?.resolve(ready(1)); });
    await waitFor(() => expect(result.current.states["route-current"]?.status).toBe("ready"));
    expect(Object.hasOwn(result.current.states, "route-old")).toBe(false);
  });

  test("aborts a replaced request when its stable owner id stays the same", async () => {
    const adapter = new ControlledRouteAdapter();
    const { rerender } = renderHook(({ routes }: { routes: RouteRequestV2[] }) => useRouteStates(routes, () => adapter), { initialProps: { routes: [route("stable-owner", "old-from", "old-to")] } });
    await waitFor(() => expect(adapter.loads).toHaveLength(1));
    const replaced = adapter.loads[0];
    rerender({ routes: [route("stable-owner", "new-from", "new-to")] });
    await waitFor(() => expect(adapter.loads).toHaveLength(2));
    expect(replaced.signal.aborted).toBe(true);
    expect(adapter.loads[1]?.request.edge.fromNodeId).toBe("new-from");
  });

  test("includes endpoint identity, departure, and sorted transit preferences in request signatures", async () => {
    const adapter = new ControlledRouteAdapter();
    const initial = route("signature");
    const { rerender } = renderHook(({ routes }: { routes: RouteRequestV2[] }) => useRouteStates(routes, () => adapter), { initialProps: { routes: [initial] } });
    await waitFor(() => expect(adapter.loads).toHaveLength(1));
    rerender({ routes: [{ ...initial, destination: { ...initial.destination, identity: { status: "resolved", coordinates: { lat: 35.02, lng: 139.02 } } }, transitPreferences: { allowedModes: ["rail", "bus"] } }] });
    await waitFor(() => expect(adapter.loads).toHaveLength(2));
  });

  test("retries only the requested owner and invalidates its prior generation", async () => {
    const adapter = new ControlledRouteAdapter();
    const { result } = renderHook(() => useRouteStates([route("route-a"), route("route-b")], () => adapter));
    await waitFor(() => expect(adapter.loads).toHaveLength(2));
    act(() => { adapter.loads[0]?.resolve({ status: "unavailable", reason: "network", retryable: true }); adapter.loads[1]?.resolve(ready(1)); });
    await waitFor(() => expect(result.current.states["route-a"]?.status).toBe("unavailable"));
    let retried = false;
    act(() => { retried = result.current.retry("route-a"); });
    expect(retried).toBe(true);
    await waitFor(() => expect(adapter.loads).toHaveLength(3));
    expect(adapter.loads[2]?.request.edge.id).toBe("route-a");
    expect(result.current.states["route-b"]?.status).toBe("ready");
  });

  test("keeps unknown idle with zero work while offering flight to a neutral adapter", async () => {
    const adapter = new ControlledRouteAdapter();
    const { result } = renderHook(() => useRouteStates([route("unknown", undefined, undefined, "unknown"), route("flight", undefined, undefined, "flight")], () => adapter));
    await waitFor(() => expect(adapter.loads).toHaveLength(1));
    expect(adapter.loads[0]?.request.edge.mode).toBe("flight");
    expect(result.current.states.unknown).toEqual({ status: "idle" });
    act(() => adapter.loads[0]?.resolve(ready(1)));
    await waitFor(() => expect(result.current.states.flight?.status).toBe("ready"));
  });

  test("maps adapter rejection to typed retryable network diagnostics", async () => {
    const adapter = new ControlledRouteAdapter();
    const { result } = renderHook(() => useRouteStates([route("network")], () => adapter));
    await waitFor(() => expect(adapter.loads).toHaveLength(1));
    act(() => adapter.loads[0]?.reject(new Error("socket closed")));
    await waitFor(() => expect(result.current.states.network?.status).toBe("unavailable"));
    expect(result.current.states.network).toEqual({ status: "unavailable", reason: "network", retryable: true, diagnostic: "socket closed" });
  });

  test("quarantines an implausible ready result from states and mapResults", async () => {
    const adapter = new ControlledRouteAdapter();
    const { result } = renderHook(() => useRouteStates([route("unsafe")], () => adapter));
    await waitFor(() => expect(adapter.loads).toHaveLength(1));
    act(() => adapter.loads[0]?.resolve({ ...ready(), geometry: [{ lat: 0, lng: 0 }, { lat: 0.01, lng: 0.01 }] }));
    await waitFor(() => expect(result.current.states.unsafe?.status).toBe("unavailable"));
    expect(result.current.states.unsafe).toMatchObject({ reason: "implausible-result", retryable: false });
    expect(Object.hasOwn(result.current.mapResults, "unsafe")).toBe(false);
  });

  test("keeps valid ready route facts without geometry out of mapResults", async () => {
    const adapter = new ControlledRouteAdapter();
    const { result } = renderHook(() => useRouteStates([route("facts")], () => adapter));
    await waitFor(() => expect(adapter.loads).toHaveLength(1));
    act(() => adapter.loads[0]?.resolve({ ...ready(), geometry: undefined }));
    await waitFor(() => expect(result.current.states.facts?.status).toBe("ready"));
    expect(Object.hasOwn(result.current.mapResults, "facts")).toBe(false);
  });

  test("uses namespace-safe owners and keeps loading attached to its exact edge id", async () => {
    const adapter = new ControlledRouteAdapter();
    const { result } = renderHook(() => useRouteStates([route("__proto__"), route("constructor")], () => adapter));
    await waitFor(() => expect(adapter.loads).toHaveLength(2));
    expect(Object.hasOwn(result.current.states, "__proto__")).toBe(true);
    expect(result.current.states["__proto__"]).toEqual({ status: "loading" });
    expect(result.current.states.constructor).toEqual({ status: "loading" });
  });

  test("aborts every active request on unmount", async () => {
    const adapter = new ControlledRouteAdapter();
    const { unmount } = renderHook(() => useRouteStates([route("route-a"), route("route-b")], () => adapter));
    await waitFor(() => expect(adapter.loads).toHaveLength(2));
    unmount();
    expect(adapter.loads.every(({ signal }) => signal.aborted)).toBe(true);
  });

  test("suppresses a same-owner stale result after a replacement", async () => {
    const adapter = new ControlledRouteAdapter();
    const { result, rerender } = renderHook(({ routes }: { routes: RouteRequestV2[] }) => useRouteStates(routes, () => adapter), { initialProps: { routes: [route("same", "old", "to")] } });
    await waitFor(() => expect(adapter.loads).toHaveLength(1));
    const old = adapter.loads[0];
    rerender({ routes: [route("same", "new", "to")] });
    await waitFor(() => expect(adapter.loads).toHaveLength(2));
    act(() => { old.resolve(ready(0)); adapter.loads[1]?.resolve(ready(1)); });
    await waitFor(() => expect(result.current.states.same).toMatchObject({ status: "ready", durationMinutes: 9 }));
  });

  test("uses the first duplicate owner once", async () => {
    const adapter = new ControlledRouteAdapter();
    const first = route("duplicate", "first", "to");
    const { result } = renderHook(() => useRouteStates([first, route("duplicate", "second", "to")], () => adapter));
    await waitFor(() => expect(adapter.loads).toHaveLength(1));
    expect(adapter.loads[0]?.request.edge.fromNodeId).toBe("first");
    expect(Object.keys(result.current.states)).toEqual(["duplicate"]);
  });

  test("invalidates only on departure changes and treats reordered preferences as equivalent without mutation", async () => {
    const adapter = new ControlledRouteAdapter();
    const first = route("cache");
    const before = structuredClone(first);
    const { rerender } = renderHook(({ routes }: { routes: RouteRequestV2[] }) => useRouteStates(routes, () => adapter), { initialProps: { routes: [first] } });
    await waitFor(() => expect(adapter.loads).toHaveLength(1));
    rerender({ routes: [{ ...first, transitPreferences: { allowedModes: ["rail", "bus"] } }] });
    await Promise.resolve();
    expect(adapter.loads).toHaveLength(1);
    expect(first).toEqual(before);
    rerender({ routes: [{ ...first, departureAt: "2040-01-01T10:00:00+09:00" }] });
    await waitFor(() => expect(adapter.loads).toHaveLength(2));
  });

  test("contains a throwing factory and retries construction before loading", async () => {
    const adapter = new ControlledRouteAdapter();
    let attempts = 0;
    const factory = () => {
      attempts += 1;
      if (attempts === 1) throw new Error("factory unavailable");
      return adapter;
    };
    const { result } = renderHook(() => useRouteStates([route("factory")], factory, { adapterErrorReason: () => "factory diagnostic" }));
    await waitFor(() => expect(result.current.states.factory).toEqual({ status: "unavailable", reason: "network", retryable: true, diagnostic: "factory diagnostic" }));
    let retried = false;
    act(() => { retried = result.current.retry("factory"); });
    expect(retried).toBe(true);
    await waitFor(() => expect(adapter.loads).toHaveLength(1));
    act(() => adapter.loads[0]?.resolve(ready()));
    await waitFor(() => expect(result.current.states.factory?.status).toBe("ready"));
  });

  test("quarantines malformed nested transit returned through the adapter", async () => {
    const adapter = new ControlledRouteAdapter();
    const { result } = renderHook(() => useRouteStates([route("nested")], () => adapter));
    await waitFor(() => expect(adapter.loads).toHaveLength(1));
    act(() => adapter.loads[0]?.resolve({ ...ready(), transit: { lines: null } } as unknown as RouteProviderResult));
    await waitFor(() => expect(result.current.states.nested).toMatchObject({ status: "unavailable", reason: "malformed-response" }));
  });
});
