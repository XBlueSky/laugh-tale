import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { RouteEdge } from "@laugh-tale/core";
import type { RouteRequest, RouteResult } from "@laugh-tale/core";
import type { RouteAdapter } from "@laugh-tale/core/browser";
import { useRouteStates } from "@laugh-tale/react";

function route(id: string, fromNodeId = `${id}-from`, toNodeId = `${id}-to`): RouteEdge {
  return {
    id,
    dayId: "day-one",
    fromNodeId,
    toNodeId,
    mode: "walking",
    source: "manual",
    certainty: "suggested",
  };
}

function ready(index = 0): RouteResult {
  return {
    status: "ready",
    durationMinutes: 8 + index,
    path: [
      { lat: 35 + index * 0.01, lng: 139 },
      { lat: 35.001 + index * 0.01, lng: 139.001 },
    ],
    steps: ["Walk", "Arrive"],
  };
}

interface PendingLoad {
  request: RouteRequest;
  signal: AbortSignal;
  resolve: (result: RouteResult) => void;
}

class ControlledRouteAdapter implements RouteAdapter {
  readonly loads: PendingLoad[] = [];

  load(request: RouteRequest, signal: AbortSignal): Promise<RouteResult> {
    return new Promise((resolve) => {
      this.loads.push({ request, signal, resolve });
    });
  }
}

describe("useRouteStates", () => {
  test("keeps authored route context static and performs zero provider work without a factory", () => {
    let factoryCalls = 0;
    const { result } = renderHook(() =>
      useRouteStates([route("route-a")], undefined),
    );

    expect(factoryCalls).toBe(0);
    expect(Object.keys(result.current.states)).toEqual([]);
    expect(Object.keys(result.current.mapResults)).toEqual([]);
    expect(result.current.retry("route-a")).toBe(false);
    factoryCalls += 0;
  });

  test("loads each stable owner once and ignores equivalent rerendered edge objects", async () => {
    const adapter = new ControlledRouteAdapter();
    const factory = () => adapter;
    const { result, rerender } = renderHook(
      ({ routes }: { routes: RouteEdge[] }) => useRouteStates(routes, factory),
      { initialProps: { routes: [route("route-a"), route("route-b")] } },
    );

    await waitFor(() => expect(adapter.loads).toHaveLength(2));
    expect(result.current.states["route-a"]).toEqual({ status: "loading" });
    act(() => {
      adapter.loads[0].resolve(ready(0));
      adapter.loads[1].resolve(ready(1));
    });
    await waitFor(() => expect(result.current.states["route-b"]?.status).toBe("ready"));

    rerender({ routes: [{ ...route("route-a") }, { ...route("route-b") }] });
    await Promise.resolve();
    expect(adapter.loads).toHaveLength(2);
    expect(result.current.mapResults["route-a"]?.status).toBe("ready");
  });

  test("aborts removed-day work and never lets a late result overwrite current owners", async () => {
    const adapter = new ControlledRouteAdapter();
    const factory = () => adapter;
    const { result, rerender } = renderHook(
      ({ routes }: { routes: RouteEdge[] }) => useRouteStates(routes, factory),
      { initialProps: { routes: [route("route-old")] } },
    );
    await waitFor(() => expect(adapter.loads).toHaveLength(1));
    const oldLoad = adapter.loads[0];

    rerender({ routes: [route("route-current")] });
    await waitFor(() => expect(adapter.loads).toHaveLength(2));
    expect(oldLoad.signal.aborted).toBe(true);
    act(() => oldLoad.resolve(ready(0)));
    act(() => adapter.loads[1].resolve(ready(1)));
    await waitFor(() => expect(result.current.states["route-current"]?.status).toBe("ready"));

    expect(Object.hasOwn(result.current.states, "route-old")).toBe(false);
    expect(Object.hasOwn(result.current.mapResults, "route-old")).toBe(false);
  });

  test("aborts a replaced effective edge even when its owner id stays the same", async () => {
    const adapter = new ControlledRouteAdapter();
    const { result, rerender } = renderHook(
      ({ routes }: { routes: RouteEdge[] }) => useRouteStates(routes, () => adapter),
      { initialProps: { routes: [route("stable-owner", "old-from", "old-to")] } },
    );
    await waitFor(() => expect(adapter.loads).toHaveLength(1));
    const replacedLoad = adapter.loads[0];

    rerender({ routes: [route("stable-owner", "new-from", "new-to")] });
    await waitFor(() => expect(adapter.loads).toHaveLength(2));
    expect(replacedLoad.signal.aborted).toBe(true);
    act(() => replacedLoad.resolve(ready(0)));
    act(() => adapter.loads[1].resolve(ready(2)));
    await waitFor(() =>
      expect(result.current.states["stable-owner"]).toEqual(ready(2)),
    );

    expect(adapter.loads[1].request.edge.fromNodeId).toBe("new-from");
  });

  test("retries only the requested owner and invalidates the prior generation", async () => {
    const adapter = new ControlledRouteAdapter();
    const { result } = renderHook(() =>
      useRouteStates([route("route-a"), route("route-b")], () => adapter),
    );
    await waitFor(() => expect(adapter.loads).toHaveLength(2));
    act(() => {
      adapter.loads[0].resolve({ status: "unavailable", reason: "temporary" });
      adapter.loads[1].resolve(ready(1));
    });
    await waitFor(() => expect(result.current.states["route-a"]?.status).toBe("unavailable"));

    let retried = false;
    act(() => {
      retried = result.current.retry("route-a");
    });
    expect(retried).toBe(true);
    await waitFor(() => expect(adapter.loads).toHaveLength(3));
    expect(adapter.loads[2].request.edge.id).toBe("route-a");
    expect(result.current.states["route-a"]).toEqual({ status: "loading" });
    expect(result.current.states["route-b"]?.status).toBe("ready");
    act(() => adapter.loads[2].resolve(ready(2)));
    await waitFor(() => expect(result.current.states["route-a"]?.status).toBe("ready"));
  });

  test("uses namespace-safe owners and excludes malformed ready geometry from map results", async () => {
    const adapter = new ControlledRouteAdapter();
    const { result } = renderHook(() =>
      useRouteStates([route("__proto__"), route("constructor")], () => adapter),
    );
    await waitFor(() => expect(adapter.loads).toHaveLength(2));
    act(() => {
      adapter.loads[0].resolve({
        status: "ready",
        durationMinutes: 3,
        path: [{ lat: 35, lng: 139 }],
        steps: ["Invalid single point"],
      });
      adapter.loads[1].resolve(ready(1));
    });
    await waitFor(() => expect(result.current.states["constructor"]?.status).toBe("ready"));

    expect(Object.hasOwn(result.current.states, "__proto__")).toBe(true);
    expect(result.current.states["__proto__"]?.status).toBe("ready");
    expect(Object.hasOwn(result.current.mapResults, "__proto__")).toBe(false);
    expect(result.current.mapResults["constructor"]?.status).toBe("ready");
  });

  test("aborts every active request on unmount", async () => {
    const adapter = new ControlledRouteAdapter();
    const { unmount } = renderHook(() =>
      useRouteStates([route("route-a"), route("route-b")], () => adapter),
    );
    await waitFor(() => expect(adapter.loads).toHaveLength(2));

    unmount();

    expect(adapter.loads.every(({ signal }) => signal.aborted)).toBe(true);
  });
});
