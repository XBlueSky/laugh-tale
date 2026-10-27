import { act, cleanup, render, renderHook } from "@testing-library/react";
import { StrictMode, Suspense, startTransition, useLayoutEffect } from "react";
import { flushSync } from "react-dom";
import type { CameraIntent, MapLayoutSnapshot, ProviderUnavailableResult } from "@laugh-tale-island/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapAdapterV2 } from "@laugh-tale-island/core/browser";

import { useMapAdapterLifecycle, type MapAdapterLifecycleController, type UseMapAdapterLifecycleInput } from "../src/use-map-adapter-lifecycle.js";

class ControlledAdapter implements MapAdapterV2 {
  resolve!: () => void;
  reject!: (error: unknown) => void;
  readonly pending = new Promise<void>((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });
  readonly mount = vi.fn<MapAdapterV2["mount"]>(() => this.pending);
  readonly render = vi.fn<MapAdapterV2["render"]>();
  readonly setLayout = vi.fn<(layout: MapLayoutSnapshot | null) => void>();
  readonly setUserLocation = vi.fn<MapAdapterV2["setUserLocation"]>();
  readonly applyCameraIntent = vi.fn<MapAdapterV2["applyCameraIntent"]>();
  readonly getCameraSnapshot = vi.fn<MapAdapterV2["getCameraSnapshot"]>(() => ({ zoom: 13 }));
  readonly destroy = vi.fn<MapAdapterV2["destroy"]>();
  get events() { return this.mount.mock.calls[0][1].events; }
}

function fixture() {
  const adapters: ControlledAdapter[] = [];
  const createAdapter = vi.fn(() => {
    const adapter = new ControlledAdapter();
    adapters.push(adapter);
    return adapter;
  });
  const input = {
    createAdapter,
    mountConfig: {
      events: { onMarkerSelect: vi.fn(), onRouteSelect: vi.fn(), onUnavailable: vi.fn() },
      visualProfile: {
        id: "synthetic-profile",
        basemap: {
          mode: "neutral", density: "low", contrast: "soft", poi: "minimal",
          stationLabels: "hidden",
          palette: { geometry: "#eee", label: "#111", labelStroke: "#fff", water: "#ccc", park: "#ddd", road: "#bbb" },
        },
        routeStyle: () => null,
      },
      createMarkerContent: () => ({ element: document.createElement("div"), update: () => {}, dispose: () => {} }),
      createUserLocationContent: () => ({ element: document.createElement("div"), update: () => {}, dispose: () => {} }),
    },
    presentation: { markers: [], routes: [] },
    cameraIntent: null, layout: null, userLocation: null, development: false,
  } satisfies UseMapAdapterLifecycleInput;
  return { input, adapters, createAdapter };
}

function setup(input: UseMapAdapterLifecycleInput) {
  const hook = renderHook(useMapAdapterLifecycle, { initialProps: input });
  const host = document.createElement("div");
  act(() => { hook.result.current.mapRef(host); });
  return { ...hook, host };
}

async function ready(adapter: ControlledAdapter) {
  await act(async () => { adapter.resolve(); await adapter.pending; });
}

function LifecycleSurface({ input, suspended, onCommit, onSuspend, onAttach }: {
  input: UseMapAdapterLifecycleInput;
  suspended?: Promise<void>;
  onCommit?: (controller: MapAdapterLifecycleController) => void;
  onSuspend?: () => void;
  onAttach?: (element: HTMLDivElement | null) => void;
}) {
  const controller = useMapAdapterLifecycle(input);
  useLayoutEffect(() => { onCommit?.(controller); });
  if (suspended !== undefined) {
    onSuspend?.();
    // Exercise a real React suspended render after the lifecycle hook ran.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw suspended;
  }
  return <div data-testid="committed-map" ref={controller.mapRef}><div ref={onAttach} /></div>;
}

let frames: Map<number, FrameRequestCallback>;
beforeEach(() => {
  frames = new Map();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frames.delete(id)));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function flushFrames() {
  const callbacks = [...frames.values()];
  frames.clear();
  act(() => { for (const callback of callbacks) callback(16); });
}

describe("persistent map lifecycle", () => {
  it("delivers committed layout without geometry and suppresses equal snapshots", async () => {
    const { input, adapters } = fixture();
    const layout: MapLayoutSnapshot = {
      viewport: { width: 390, height: 844 }, occlusions: [],
      usableRegion: { x: 0, y: 80, width: 390, height: 300 },
      edgeInsets: { top: 80, right: 0, bottom: 464, left: 0 },
    };
    const hook = setup(input);
    hook.rerender({ ...input, layout });
    expect(adapters[0].setLayout).not.toHaveBeenCalled();
    await ready(adapters[0]);
    expect(adapters[0].setLayout).toHaveBeenCalledExactlyOnceWith(layout);
    expect(adapters[0].setLayout.mock.invocationCallOrder[0]).toBeLessThan(adapters[0].render.mock.invocationCallOrder[0]);
    hook.rerender({ ...input, layout: { ...layout } });
    expect(adapters[0].setLayout).toHaveBeenCalledTimes(1);
    hook.rerender({ ...input, layout: null });
    expect(adapters[0].setLayout).toHaveBeenLastCalledWith(null);
    expect(adapters[0].applyCameraIntent).not.toHaveBeenCalled();
    expect(adapters[0].mount).toHaveBeenCalledTimes(1);
  });
  it("contains a layout failure without rendering or reviving the released map", async () => {
    const { input, adapters } = fixture();
    const hook = setup(input);
    adapters[0].setLayout.mockImplementation(() => { throw new Error("layout failed"); });
    await ready(adapters[0]);
    expect(hook.result.current.status.kind).toBe("unavailable");
    expect(adapters[0].render).not.toHaveBeenCalled();
    expect(adapters[0].destroy).toHaveBeenCalledTimes(1);
    hook.unmount();
    expect(adapters[0].destroy).toHaveBeenCalledTimes(1);
  });
  it("supports older adapters with no optional layout method", async () => {
    const { input, adapters } = fixture();
    const hook = setup(input);
    Reflect.deleteProperty(adapters[0], "setLayout");
    await ready(adapters[0]);
    expect(hook.result.current.status.kind).toBe("ready");
    expect(adapters[0].render).toHaveBeenCalledOnce();
  });
  it.each([false, true])("settles an idle lifecycle with inline presentation factories and host=%s", (withHost) => {
    let renders = 0;
    const hook = renderHook(() => {
      if (++renders > 20) throw new Error("idle publication loop");
      const input = fixture().input;
      const { createAdapter: _factory, ...withoutFactory } = input;
      void _factory;
      return useMapAdapterLifecycle(withHost ? withoutFactory : input);
    });
    if (withHost) act(() => { hook.result.current.mapRef(document.createElement("div")); });
    expect(hook.result.current.status).toEqual({ kind: "idle" });
    expect(renders).toBeLessThan(20);
  });
  it.each(["factory", "mount", "render", "location", "camera", "snapshot", "event"] as const)("reports one original %s failure before publishing unavailable, containing reporter exceptions", async (phase) => {
    const { input, adapters } = fixture();
    const cause = new Error(`private ${phase}`);
    const failure = { status: "unavailable", reason: "request-denied", retryable: false, diagnostic: "private event" } as const;
    const onFailure = vi.fn(() => { throw new Error("hostile sink"); });
    const createAdapter = phase === "factory" ? () => { throw cause; } : input.createAdapter;
    const hook = setup({ ...input, createAdapter, onFailure });
    if (phase !== "factory") {
      const adapter = adapters[0];
      if (phase === "mount") await act(async () => { adapter.reject(cause); await adapter.pending.catch(() => {}); });
      else if (phase === "event") act(() => adapter.events.onUnavailable(failure));
      else {
        if (phase === "render") adapter.render.mockImplementation(() => { throw cause; });
        if (phase === "location") adapter.setUserLocation.mockImplementation(() => { throw cause; });
        await ready(adapter);
        if (phase === "camera") {
          adapter.applyCameraIntent.mockImplementation(() => { throw cause; });
          hook.rerender({ ...input, createAdapter, onFailure, cameraIntent: { kind: "focus", intentId: "focus", transition: "immediate", coordinate: { lat: 1, lng: 2 }, targetZoom: 15, viewport: { width: 300, height: 600 }, usableRegion: { x: 0, y: 0, width: 300, height: 600 }, edgeInsets: { top: 0, right: 0, bottom: 0, left: 0 } } as CameraIntent, layout: { occlusions: [], viewport: { width: 300, height: 600 }, usableRegion: { x: 0, y: 0, width: 300, height: 600 }, edgeInsets: { top: 0, right: 0, bottom: 0, left: 0 } } });
        }
        if (phase === "snapshot") {
          adapter.getCameraSnapshot.mockImplementation(() => { throw cause; });
          act(() => expect(hook.result.current.getCameraSnapshot()).toBeNull());
        }
      }
      act(() => adapter.events.onUnavailable(failure));
      expect(adapter.destroy).toHaveBeenCalledTimes(1);
    }
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0]).toEqual([phase === "event" ? failure : { status: "unavailable", reason: "network", retryable: true }, phase === "event" ? undefined : cause]);
    expect(hook.result.current.status.kind).toBe("unavailable");
  });
  it("waits for a host and renders the latest presentation only after mounting", async () => {
    const { input, adapters, createAdapter } = fixture();
    const { result, rerender } = renderHook(useMapAdapterLifecycle, { initialProps: input });
    expect(result.current.status).toEqual({ kind: "idle" });
    expect(createAdapter).not.toHaveBeenCalled();
    const host = document.createElement("div");
    act(() => { result.current.mapRef(host); });
    expect(createAdapter).toHaveBeenCalledOnce();
    expect(adapters[0].mount).toHaveBeenCalledWith(host, expect.objectContaining({ visualProfile: input.mountConfig.visualProfile }));
    expect(result.current.status).toEqual({ kind: "mounting", attempt: 0 });
    expect(adapters[0].render).not.toHaveBeenCalled();
    const presentation = { markers: [], routes: [] };
    rerender({ ...input, presentation });
    await ready(adapters[0]);
    expect(result.current.status).toEqual({ kind: "ready", attempt: 0 });
    expect(adapters[0].render).toHaveBeenCalledExactlyOnceWith(presentation);
    rerender(input);
    expect(adapters[0].render).toHaveBeenLastCalledWith(input.presentation);
    expect(adapters[0].mount).toHaveBeenCalledOnce();
    expect(createAdapter).toHaveBeenCalledOnce();
  });

  it("stays idle without a factory and mounts when one arrives", () => {
    const { input, createAdapter } = fixture();
    const { result, rerender } = setup({ ...input, createAdapter: undefined });
    expect(result.current.status).toEqual({ kind: "idle" });
    expect(createAdapter).not.toHaveBeenCalled();
    rerender(input);
    expect(createAdapter).toHaveBeenCalledOnce();
  });

  it("forwards selections to the latest events without remounting", async () => {
    const { input, adapters, createAdapter } = fixture();
    const { rerender, result } = setup(input);
    await ready(adapters[0]);
    const mapRef = result.current.mapRef;
    const events = fixture().input.mountConfig.events;
    rerender({ ...input, mountConfig: { ...input.mountConfig, events } });
    act(() => { adapters[0].events.onMarkerSelect("owner-a"); adapters[0].events.onRouteSelect("route-a"); });
    expect(events.onMarkerSelect).toHaveBeenCalledExactlyOnceWith("owner-a");
    expect(events.onRouteSelect).toHaveBeenCalledExactlyOnceWith("route-a");
    expect(input.mountConfig.events.onMarkerSelect).not.toHaveBeenCalled();
    expect(input.mountConfig.events.onRouteSelect).not.toHaveBeenCalled();
    expect(createAdapter).toHaveBeenCalledOnce();
    expect(result.current.mapRef).toBe(mapRef);
  });

  it.each(["visualProfile", "createMarkerContent", "createUserLocationContent"] as const)("replaces the adapter when %s changes", (key) => {
    const { input, adapters, createAdapter } = fixture();
    const { rerender, unmount } = setup(input);
    rerender({ ...input, mountConfig: { ...input.mountConfig, [key]: fixture().input.mountConfig[key] } });
    expect(createAdapter).toHaveBeenCalledTimes(2);
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
    unmount();
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
    expect(adapters[1].destroy).toHaveBeenCalledOnce();
  });

  it("replaces on host and factory changes and destroys pending mounts once", () => {
    const first = fixture();
    const second = fixture();
    const { result, rerender, unmount } = setup(first.input);
    act(() => { result.current.mapRef(document.createElement("div")); });
    expect(first.adapters[0].destroy).toHaveBeenCalledOnce();
    expect(first.createAdapter).toHaveBeenCalledTimes(2);
    rerender({ ...first.input, createAdapter: second.createAdapter });
    expect(first.adapters[1].destroy).toHaveBeenCalledOnce();
    expect(second.createAdapter).toHaveBeenCalledOnce();
    unmount();
    expect(second.adapters[0].destroy).toHaveBeenCalledOnce();
  });
});

const layout: MapLayoutSnapshot = {
  viewport: { width: 500, height: 600 }, occlusions: [],
  usableRegion: { x: 0, y: 0, width: 500, height: 600 },
  edgeInsets: { top: 0, right: 0, bottom: 0, left: 0 },
};
const intent: CameraIntent = {
  kind: "focus", intentId: "action-a", transition: "animate",
  coordinate: { lat: 3, lng: 4 }, targetZoom: 17,
  viewport: layout.viewport, usableRegion: layout.usableRegion, edgeInsets: layout.edgeInsets,
};

describe("semantic camera execution", () => {
  it.each(["animate", "immediate"] as const)("applies each semantic ID once with supplied %s transition after render", async (transition) => {
    const { input, adapters } = fixture();
    const cameraIntent = { ...intent, transition };
    const props = { ...input, cameraIntent, layout };
    const { rerender } = setup(props);
    expect(adapters[0].applyCameraIntent).not.toHaveBeenCalled();
    await ready(adapters[0]);
    expect(adapters[0].applyCameraIntent).toHaveBeenCalledExactlyOnceWith(cameraIntent);
    expect(adapters[0].render.mock.invocationCallOrder[0]).toBeLessThan(adapters[0].applyCameraIntent.mock.invocationCallOrder[0]);
    rerender({ ...props, cameraIntent: { ...cameraIntent }, layout: { ...layout } });
    expect(adapters[0].applyCameraIntent).toHaveBeenCalledOnce();
    const next = { ...cameraIntent, intentId: "action-b" };
    rerender({ ...props, cameraIntent: next });
    expect(adapters[0].applyCameraIntent).toHaveBeenCalledTimes(2);
    expect(adapters[0].applyCameraIntent).toHaveBeenLastCalledWith(next);
    rerender({ ...props, cameraIntent: null });
    expect(adapters[0].applyCameraIntent).toHaveBeenCalledTimes(2);
  });

  it("contains camera throws once, stops later work, and retries into a fresh rendered camera", async () => {
    const { input, adapters } = fixture();
    const props = { ...input, cameraIntent: intent, layout };
    const { result, rerender } = setup(props);
    adapters[0].applyCameraIntent.mockImplementation(() => { throw new Error("camera failure"); });
    await ready(adapters[0]);
    expect(result.current.status).toEqual({ kind: "unavailable", attempt: 0, reason: "network", retryable: true });
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
    expect(input.mountConfig.events.onUnavailable).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "network", retryable: true });
    rerender({ ...props, cameraIntent: { ...intent, intentId: "action-b" }, presentation: { markers: [], routes: [] }, userLocation: { lat: 5, lng: 6 } });
    expect(adapters[0].applyCameraIntent).toHaveBeenCalledOnce();
    expect(adapters[0].render).toHaveBeenCalledOnce();
    expect(adapters[0].setUserLocation).toHaveBeenCalledOnce();
    act(() => result.current.retry());
    await ready(adapters[1]);
    expect(adapters[1].applyCameraIntent).toHaveBeenCalledOnce();
    expect(adapters[1].render.mock.invocationCallOrder[0]).toBeLessThan(adapters[1].applyCameraIntent.mock.invocationCallOrder[0]);
  });
});

describe("frame-coalesced geometry", () => {
  const changedLayout: MapLayoutSnapshot = {
    viewport: { width: 510, height: 620 },
    occlusions: [{ x: 0, y: 0, width: 510, height: 20 }],
    usableRegion: { x: 0, y: 20, width: 510, height: 600 },
    edgeInsets: { top: 20, right: 0, bottom: 0, left: 0 },
  };
  const finalLayout: MapLayoutSnapshot = {
    viewport: { width: 520, height: 640 },
    occlusions: [{ x: 0, y: 0, width: 520, height: 30 }],
    usableRegion: { x: 0, y: 30, width: 520, height: 610 },
    edgeInsets: { top: 30, right: 0, bottom: 0, left: 0 },
  };

  it.each<CameraIntent>([
    intent,
    { ...intent, kind: "recenter-user", targetZoom: 16 },
    { kind: "fit", intentId: "fit-a", transition: "animate", points: [{ lat: 3, lng: 4 }], paths: [[{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }]], maximumZoom: 15, viewport: layout.viewport, usableRegion: layout.usableRegion, edgeInsets: layout.edgeInsets },
  ])("coalesces $kind with original payload and latest geometry into one immediate frame", async (cameraIntent) => {
    const { input, adapters } = fixture();
    const props = { ...input, cameraIntent, layout };
    const { rerender } = setup(props);
    await ready(adapters[0]);
    rerender({ ...props, layout: changedLayout });
    rerender({ ...props, layout: finalLayout });
    expect(frames.size).toBe(1);
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(adapters[0].applyCameraIntent).toHaveBeenCalledOnce();
    flushFrames();
    expect(adapters[0].applyCameraIntent).toHaveBeenCalledTimes(2);
    expect(adapters[0].applyCameraIntent).toHaveBeenLastCalledWith({
      ...cameraIntent, transition: "immediate",
      viewport: { width: 520, height: 640 },
      usableRegion: { x: 0, y: 30, width: 520, height: 610 },
      edgeInsets: { top: 30, right: 0, bottom: 0, left: 0 },
    });
    rerender({ ...props, layout: { ...finalLayout } });
    expect(frames.size).toBe(0);
  });

  it("ignores subpixel geometry but reframes material occlusions with unchanged usable region", async () => {
    const { input, adapters } = fixture();
    const props = { ...input, cameraIntent: intent, layout };
    const { rerender } = setup(props);
    await ready(adapters[0]);
    rerender({ ...props, layout: { ...layout, viewport: { width: 500.99, height: 600 } } });
    expect(frames.size).toBe(0);
    rerender({ ...props, layout: { ...layout, occlusions: [{ x: 0, y: 0, width: 2, height: 2 }] } });
    expect(frames.size).toBe(1);
    flushFrames();
    expect(adapters[0].applyCameraIntent).toHaveBeenLastCalledWith({ ...intent, transition: "immediate" });
  });

  it("cancels a queued reframe when a new semantic ID applies immediately", async () => {
    const { input, adapters } = fixture();
    const props = { ...input, cameraIntent: intent, layout };
    const { rerender } = setup(props);
    await ready(adapters[0]);
    rerender({ ...props, layout: changedLayout });
    const callback = [...frames.values()][0];
    const next = { ...intent, intentId: "action-b" };
    rerender({ ...props, cameraIntent: next, layout: changedLayout });
    expect(frames.size).toBe(0);
    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(adapters[0].applyCameraIntent).toHaveBeenLastCalledWith(next);
    act(() => callback(16));
    expect(adapters[0].applyCameraIntent).toHaveBeenCalledTimes(2);
  });

  it.each(["unmount", "host", "retry"] as const)("cancels queued geometry on %s and rejects a captured stale frame", async (action) => {
    const { input, adapters } = fixture();
    const props = { ...input, cameraIntent: intent, layout };
    const { result, rerender, unmount } = setup(props);
    await ready(adapters[0]);
    rerender({ ...props, layout: changedLayout });
    const callback = [...frames.values()][0];
    expect(frames.size).toBe(1);
    if (action === "unmount") unmount();
    else if (action === "host") act(() => { result.current.mapRef(document.createElement("div")); });
    else {
      act(() => adapters[0].events.onUnavailable({ status: "unavailable", reason: "network", retryable: true }));
      expect(frames.size).toBe(0);
      act(() => result.current.retry());
    }
    expect(frames.size).toBe(0);
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
    if (action !== "unmount") {
      await ready(adapters[1]);
      rerender({ ...props, layout: finalLayout });
      expect(frames.size).toBe(1);
    }
    act(() => callback(16));
    expect(adapters[0].applyCameraIntent).toHaveBeenCalledOnce();
    if (action !== "unmount") {
      expect(adapters[1].applyCameraIntent).toHaveBeenCalledOnce();
      expect(frames.size).toBe(1);
      flushFrames();
      expect(adapters[1].applyCameraIntent).toHaveBeenCalledTimes(2);
    }
  });

  it("contains deferred camera throws through the same terminal path", async () => {
    const { input, adapters } = fixture();
    const props = { ...input, cameraIntent: intent, layout };
    const { result, rerender } = setup(props);
    await ready(adapters[0]);
    adapters[0].applyCameraIntent.mockImplementation(() => { throw new Error("frame failure"); });
    rerender({ ...props, layout: changedLayout });
    expect(frames.size).toBe(1);
    flushFrames();
    expect(result.current.status).toEqual({ kind: "unavailable", attempt: 0, reason: "network", retryable: true });
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
    expect(input.mountConfig.events.onUnavailable).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "network", retryable: true });
  });

  it("does not apply obsolete queued geometry after the latest layout returns to its applied value", async () => {
    const { input, adapters } = fixture();
    const props = { ...input, cameraIntent: intent, layout };
    const { rerender } = setup(props);
    await ready(adapters[0]);
    rerender({ ...props, layout: changedLayout });
    expect(frames.size).toBe(1);
    rerender(props);
    flushFrames();
    expect(adapters[0].applyCameraIntent).toHaveBeenCalledOnce();
  });
});

const denied: ProviderUnavailableResult = { status: "unavailable", reason: "request-denied", retryable: false, diagnostic: "provider detail" };

describe("committed lifecycle inputs", () => {
  it("retains committed marker and route handlers while a proposed render suspends and is abandoned", async () => {
    const { input, adapters, createAdapter } = fixture();
    const events = fixture().input.mountConfig.events;
    const proposed = { ...input, mountConfig: { ...input.mountConfig, events } };
    const pending = new Promise<void>(() => {});
    const onSuspend = vi.fn();
    const view = render(<Suspense fallback={null}><LifecycleSurface input={input} /></Suspense>);
    await ready(adapters[0]);
    const committedMap = view.getByTestId("committed-map");
    const retained = adapters[0].events;
    act(() => startTransition(() => view.rerender(
      <Suspense fallback={null}><LifecycleSurface input={proposed} suspended={pending} onSuspend={onSuspend} /></Suspense>,
    )));
    expect(onSuspend).toHaveBeenCalled();
    expect(view.getByTestId("committed-map")).toBe(committedMap);
    act(() => { retained.onMarkerSelect("owner-a"); retained.onRouteSelect("route-a"); });
    expect.soft(input.mountConfig.events.onMarkerSelect).toHaveBeenCalledExactlyOnceWith("owner-a");
    expect.soft(input.mountConfig.events.onRouteSelect).toHaveBeenCalledExactlyOnceWith("route-a");
    expect.soft(events.onMarkerSelect).not.toHaveBeenCalled();
    expect.soft(events.onRouteSelect).not.toHaveBeenCalled();
    view.rerender(<Suspense fallback={null}><LifecycleSurface input={input} /></Suspense>);
    act(() => { retained.onMarkerSelect("owner-c"); retained.onRouteSelect("route-c"); });
    expect(input.mountConfig.events.onMarkerSelect.mock.calls).toEqual([["owner-a"], ["owner-c"]]);
    expect(input.mountConfig.events.onRouteSelect.mock.calls).toEqual([["route-a"], ["route-c"]]);
    expect(createAdapter).toHaveBeenCalledOnce();
  });

  it("never initializes a pending mount with speculative presentation or location, even transiently", async () => {
    const { input, adapters, createAdapter } = fixture();
    const committed = { ...input, userLocation: { lat: 1, lng: 2 } };
    const proposed = { ...committed, presentation: { markers: [], routes: [] }, userLocation: { lat: 7, lng: 8 },
      layout: { viewport: { width: 300, height: 600 }, occlusions: [], usableRegion: { x: 0, y: 0, width: 300, height: 300 }, edgeInsets: { top: 0, right: 0, bottom: 300, left: 0 } } };
    const pending = new Promise<void>(() => {});
    const onSuspend = vi.fn();
    const view = render(<Suspense fallback={null}><LifecycleSurface input={committed} /></Suspense>);
    const committedMap = view.getByTestId("committed-map");
    act(() => startTransition(() => view.rerender(
      <Suspense fallback={null}><LifecycleSurface input={proposed} suspended={pending} onSuspend={onSuspend} /></Suspense>,
    )));
    expect(onSuspend).toHaveBeenCalled();
    expect(view.getByTestId("committed-map")).toBe(committedMap);
    await ready(adapters[0]);
    // Compare the complete call trace, including any speculative call later corrected by React.
    expect.soft(adapters[0].render.mock.calls.map(([value]) => value === committed.presentation)).toEqual([true]);
    expect.soft(adapters[0].setUserLocation.mock.calls).toEqual([[{ lat: 1, lng: 2 }]]);
    expect(adapters[0].setLayout.mock.calls).toEqual([[null]]);
    view.rerender(<Suspense fallback={null}><LifecycleSurface input={proposed} /></Suspense>);
    expect(adapters[0].render.mock.calls.map(([value]) => value === committed.presentation ? "committed" : value === proposed.presentation ? "proposed" : "unknown")).toEqual(["committed", "proposed"]);
    expect(adapters[0].setUserLocation.mock.calls).toEqual([[{ lat: 1, lng: 2 }], [{ lat: 7, lng: 8 }]]);
    expect(adapters[0].setLayout.mock.calls).toEqual([[null], [proposed.layout]]);
    expect(createAdapter).toHaveBeenCalledOnce();
    expect(adapters[0].mount).toHaveBeenCalledOnce();
  });

  it.each([false, true])("uses committed development=%s and unavailable handler when a pending mount rejects during Suspense", async (development) => {
    const { input, adapters } = fixture();
    const committed = { ...input, development };
    const events = fixture().input.mountConfig.events;
    const proposed = { ...committed, development: !development, mountConfig: { ...input.mountConfig, events } };
    const pending = new Promise<void>(() => {});
    const onSuspend = vi.fn();
    let controller: MapAdapterLifecycleController | undefined;
    const onCommit = (value: MapAdapterLifecycleController) => { controller = value; };
    const view = render(<Suspense fallback={null}><LifecycleSurface input={committed} onCommit={onCommit} /></Suspense>);
    act(() => startTransition(() => view.rerender(
      <Suspense fallback={null}><LifecycleSurface input={proposed} suspended={pending} onSuspend={onSuspend} onCommit={onCommit} /></Suspense>,
    )));
    expect(onSuspend).toHaveBeenCalled();
    await act(async () => { adapters[0].reject(new Error("committed failure")); await Promise.resolve(); });
    expect(controller?.status).toEqual({ kind: "unavailable", attempt: 0, reason: "network", retryable: true, ...(development ? { diagnostic: "committed failure" } : {}) });
    expect(input.mountConfig.events.onUnavailable).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "network", retryable: true, ...(development ? { diagnostic: "committed failure" } : {}) });
    expect(events.onUnavailable).not.toHaveBeenCalled();
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
  });

  it("publishes committed handlers before child attachment without replacing the adapter", async () => {
    const { input, adapters, createAdapter } = fixture();
    const view = render(<LifecycleSurface input={input} />);
    await ready(adapters[0]);
    const retained = adapters[0].events;
    const events = fixture().input.mountConfig.events;
    view.rerender(<LifecycleSurface
      input={{ ...input, mountConfig: { ...input.mountConfig, events } }}
      onAttach={(element) => {
        if (element !== null) { retained.onMarkerSelect("owner-b"); retained.onRouteSelect("route-b"); }
      }}
    />);
    expect(events.onMarkerSelect).toHaveBeenCalledExactlyOnceWith("owner-b");
    expect(events.onRouteSelect).toHaveBeenCalledExactlyOnceWith("route-b");
    expect(input.mountConfig.events.onMarkerSelect).not.toHaveBeenCalled();
    expect(input.mountConfig.events.onRouteSelect).not.toHaveBeenCalled();
    expect(createAdapter).toHaveBeenCalledOnce();
    // Compare callback identities without invoking either method unbound.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(adapters[0].events.onMarkerSelect).toBe(retained.onMarkerSelect);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(adapters[0].events.onRouteSelect).toBe(retained.onRouteSelect);
  });
});

describe("throwing provider destruction", () => {
  it.each(["mounting", "ready"] as const)("contains destroy after a typed failure while %s and retains the original result once", async (phase) => {
    const { input, adapters } = fixture();
    const { result, unmount } = setup(input);
    if (phase === "ready") await ready(adapters[0]);
    adapters[0].destroy.mockImplementation(() => {
      adapters[0].events.onUnavailable({ status: "unavailable", reason: "network", retryable: true });
      throw new Error("dispose failed");
    });
    expect(() => act(() => adapters[0].events.onUnavailable(denied))).not.toThrow();
    await ready(adapters[0]);
    expect(result.current.status).toEqual({ kind: "unavailable", attempt: 0, reason: "request-denied", retryable: false, diagnostic: "provider detail" });
    expect(input.mountConfig.events.onUnavailable).toHaveBeenCalledExactlyOnceWith(denied);
    expect(result.current.getCameraSnapshot()).toBeNull();
    expect(unmount).not.toThrow();
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
  });

  it.each(["render", "setUserLocation", "applyCameraIntent"] as const)("contains destroy after subsequent %s failure and permits a fresh retry", async (method) => {
    const { input, adapters } = fixture();
    const props = { ...input, development: true };
    const { result, rerender, unmount } = setup(props);
    await ready(adapters[0]);
    adapters[0][method].mockImplementation(() => { throw new Error("original ready failure"); });
    adapters[0].destroy.mockImplementation(() => { throw new Error("dispose failed"); });
    expect(() => rerender({ ...props, presentation: { markers: [], routes: [] }, userLocation: { lat: 1, lng: 2 }, cameraIntent: intent, layout })).not.toThrow();
    expect(result.current.status).toEqual({ kind: "unavailable", attempt: 0, reason: "network", retryable: true, diagnostic: "original ready failure" });
    expect(input.mountConfig.events.onUnavailable).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "network", retryable: true, diagnostic: "original ready failure" });
    act(() => result.current.retry());
    await ready(adapters[1]);
    expect(result.current.status).toEqual({ kind: "ready", attempt: 1 });
    expect(unmount).not.toThrow();
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
  });

  it("contains destroy in the rejected mount promise path without an unhandled rejection", async () => {
    const { input, adapters } = fixture();
    const { result, unmount } = setup({ ...input, development: true });
    adapters[0].destroy.mockImplementation(() => { throw new Error("dispose failed"); });
    await act(async () => { adapters[0].reject(new Error("original mount failure")); await Promise.resolve(); });
    expect(result.current.status).toEqual({ kind: "unavailable", attempt: 0, reason: "network", retryable: true, diagnostic: "original mount failure" });
    expect(input.mountConfig.events.onUnavailable).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "network", retryable: true, diagnostic: "original mount failure" });
    expect(unmount).not.toThrow();
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
  });

  it.each(["ready", "unavailable"] as const)("contains replacement cleanup and stale rejection without overriding the newer %s generation", async (state) => {
    const { input, adapters } = fixture();
    const { result, unmount } = setup(input);
    adapters[0].destroy.mockImplementation(() => {
      adapters[0].events.onUnavailable(denied);
      throw new Error("dispose failed");
    });
    expect(() => act(() => result.current.mapRef(document.createElement("div")))).not.toThrow();
    await ready(adapters[1]);
    if (state === "unavailable") act(() => adapters[1].events.onUnavailable(denied));
    const currentStatus = result.current.status;
    await act(async () => { adapters[0].reject(new Error("stale failure")); await Promise.resolve(); });
    expect(result.current.status).toBe(currentStatus);
    expect(currentStatus.kind).toBe(state);
    expect(adapters[0].render).not.toHaveBeenCalled();
    expect(input.mountConfig.events.onUnavailable).toHaveBeenCalledTimes(state === "unavailable" ? 1 : 0);
    expect(unmount).not.toThrow();
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
  });

  it.each(["resolve", "reject"] as const)("contains unmount cleanup and ignores a later %s", async (settle) => {
    const { input, adapters } = fixture();
    const { unmount } = setup(input);
    adapters[0].destroy.mockImplementation(() => { throw new Error("dispose failed"); });
    expect(unmount).not.toThrow();
    await act(async () => {
      adapters[0].events.onUnavailable(denied);
      if (settle === "resolve") adapters[0].resolve(); else adapters[0].reject(new Error("stale failure"));
      await Promise.resolve();
    });
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
    expect(adapters[0].render).not.toHaveBeenCalled();
    expect(input.mountConfig.events.onUnavailable).not.toHaveBeenCalled();
  });

  it.each(["ready", "unavailable"] as const)("preserves a reentrantly replaced %s owner when old terminal release throws", async (state) => {
    const { input, adapters } = fixture();
    const replacement = fixture();
    const props = { ...input, development: true };
    const { result, rerender } = setup(props);
    await ready(adapters[0]);
    input.mountConfig.events.onUnavailable.mockImplementation(() => {
      flushSync(() => rerender({
        ...props,
        createAdapter: state === "ready" ? replacement.createAdapter : () => { throw new Error("new owner failure"); },
      }));
    });
    adapters[0].destroy.mockImplementation(() => { throw new Error("old dispose failed"); });
    expect(() => act(() => adapters[0].events.onUnavailable(denied))).not.toThrow();
    if (state === "ready") await ready(replacement.adapters[0]);
    expect(result.current.status).toEqual(state === "ready"
      ? { kind: "ready", attempt: 0 }
      : { kind: "unavailable", attempt: 0, reason: "network", retryable: true, diagnostic: "new owner failure" });
    expect(input.mountConfig.events.onUnavailable).toHaveBeenCalledExactlyOnceWith(denied);
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
  });
});

describe("generation-owned failure and ready work", () => {
  it.each([false, true])("contains rejection with development=%s and retry creates one fresh attempt", async (development) => {
    const { input, adapters, createAdapter } = fixture();
    const { result, rerender, unmount } = setup({ ...input, development });
    act(() => result.current.retry());
    expect(createAdapter).toHaveBeenCalledOnce();
    await act(async () => { adapters[0].reject(new Error("offline")); await Promise.resolve(); });
    expect(result.current.status).toEqual({ kind: "unavailable", attempt: 0, reason: "network", retryable: true, ...(development ? { diagnostic: "offline" } : {}) });
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
    act(() => { result.current.retry(); result.current.retry(); });
    expect(createAdapter).toHaveBeenCalledTimes(2);
    expect(result.current.status).toEqual({ kind: "mounting", attempt: 1 });
    await ready(adapters[1]);
    act(() => result.current.retry());
    rerender({ ...input, development });
    expect(createAdapter).toHaveBeenCalledTimes(2);
    expect(result.current.status).toEqual({ kind: "ready", attempt: 1 });
    unmount();
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
  });

  it.each(["factory", "mount"] as const)("contains synchronous %s throws and hostile diagnostics", (source) => {
    const { input, adapters, createAdapter } = fixture();
    const error = { toString() { throw new Error("hostile"); } };
    const factory = () => {
      // Deliberately exercise JavaScript's non-Error rejection contract.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      if (source === "factory") throw error;
      const adapter = createAdapter();
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      adapter.mount.mockImplementation(() => { throw error; });
      return adapter;
    };
    const { result } = setup({ ...input, development: true, createAdapter: factory });
    expect(result.current.status).toEqual({ kind: "unavailable", attempt: 0, reason: "network", retryable: true, diagnostic: "Map adapter mount failure" });
    if (source === "mount") expect(adapters[0].destroy).toHaveBeenCalledOnce();
  });

  it("reads the latest development value when a pending mount rejects", async () => {
    const { input, adapters } = fixture();
    const { result, rerender } = setup(input);
    rerender({ ...input, development: true });
    await act(async () => { adapters[0].reject("offline"); await Promise.resolve(); });
    expect(result.current.status).toMatchObject({ diagnostic: "offline" });
  });

  it("applies latest location after readiness, delegates snapshots, and updates without remount", async () => {
    const { input, adapters, createAdapter } = fixture();
    const { result, rerender } = setup(input);
    expect(result.current.getCameraSnapshot()).toBeNull();
    expect(adapters[0].getCameraSnapshot).not.toHaveBeenCalled();
    const userLocation = { lat: 3, lng: 4 };
    rerender({ ...input, userLocation });
    expect(adapters[0].setUserLocation).not.toHaveBeenCalled();
    await ready(adapters[0]);
    expect(adapters[0].setUserLocation).toHaveBeenCalledExactlyOnceWith(userLocation);
    expect(result.current.getCameraSnapshot()).toEqual({ zoom: 13 });
    rerender({ ...input, userLocation: { lat: 5, lng: 6 } });
    rerender(input);
    expect(adapters[0].setUserLocation.mock.calls).toEqual([[userLocation], [{ lat: 5, lng: 6 }], [null]]);
    expect(createAdapter).toHaveBeenCalledOnce();
  });

  it.each(["mounting", "ready"] as const)("makes typed failures terminal during %s, forwarding only once to the latest consumer", async (phase) => {
    const { input, adapters, createAdapter } = fixture();
    const { result, rerender, unmount } = setup(input);
    if (phase === "ready") await ready(adapters[0]);
    const events = fixture().input.mountConfig.events;
    rerender({ ...input, mountConfig: { ...input.mountConfig, events } });
    act(() => { adapters[0].events.onUnavailable(denied); adapters[0].events.onUnavailable(denied); });
    await ready(adapters[0]);
    expect(result.current.status).toEqual({ kind: "unavailable", attempt: 0, reason: "request-denied", retryable: false, diagnostic: "provider detail" });
    expect(events.onUnavailable).toHaveBeenCalledExactlyOnceWith(denied);
    expect(input.mountConfig.events.onUnavailable).not.toHaveBeenCalled();
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
    expect(result.current.getCameraSnapshot()).toBeNull();
    act(() => result.current.retry());
    expect(createAdapter).toHaveBeenCalledOnce();
    const renders = adapters[0].render.mock.calls.length;
    const locations = adapters[0].setUserLocation.mock.calls.length;
    rerender({ ...input, presentation: { markers: [], routes: [] }, userLocation: { lat: 1, lng: 2 } });
    expect(adapters[0].render).toHaveBeenCalledTimes(renders);
    expect(adapters[0].setUserLocation).toHaveBeenCalledTimes(locations);
    unmount();
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
  });

  it.each(["render", "setUserLocation"] as const)("contains initial %s throws and stops subsequent initialization", async (method) => {
    const { input, adapters } = fixture();
    const { result } = setup({ ...input, development: true });
    adapters[0][method].mockImplementation(() => { throw new Error("ready failure"); });
    await ready(adapters[0]);
    expect(result.current.status).toEqual({ kind: "unavailable", attempt: 0, reason: "network", retryable: true, diagnostic: "ready failure" });
    expect(input.mountConfig.events.onUnavailable).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "network", retryable: true, diagnostic: "ready failure" });
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
    if (method === "render") expect(adapters[0].setUserLocation).not.toHaveBeenCalled();
  });

  it.each(["render", "setUserLocation"] as const)("contains subsequent %s throws and permits fresh retry", async (method) => {
    const { input, adapters } = fixture();
    const { result, rerender } = setup(input);
    await ready(adapters[0]);
    adapters[0][method].mockImplementation(() => { throw new Error("ready failure"); });
    rerender({ ...input, presentation: { markers: [], routes: [] }, userLocation: { lat: 1, lng: 2 } });
    expect(result.current.status).toEqual({ kind: "unavailable", attempt: 0, reason: "network", retryable: true });
    expect(input.mountConfig.events.onUnavailable).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: "network", retryable: true });
    act(() => result.current.retry());
    await ready(adapters[1]);
    expect(result.current.status).toEqual({ kind: "ready", attempt: 1 });
  });

  it("invalidates readiness before a terminal consumer reenters and ignores destroy-time failure", async () => {
    const { input, adapters } = fixture();
    const { result } = setup(input);
    await ready(adapters[0]);
    const unavailable = vi.mocked(input.mountConfig.events.onUnavailable);
    unavailable.mockImplementation(() => {
      expect(result.current.getCameraSnapshot()).toBeNull();
      adapters[0].events.onUnavailable(denied);
    });
    adapters[0].destroy.mockImplementation(() => adapters[0].events.onUnavailable(denied));
    act(() => adapters[0].events.onUnavailable(denied));
    expect(unavailable).toHaveBeenCalledOnce();
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
  });

  it.each([false, true])("does not resume initialization after render emits a typed failure (late throw=%s)", async (lateThrow) => {
    const { input, adapters } = fixture();
    const { result } = setup(input);
    adapters[0].render.mockImplementation(() => {
      adapters[0].events.onUnavailable(denied);
      if (lateThrow) throw new Error("later throw");
    });
    await ready(adapters[0]);
    expect(result.current.status).toMatchObject({ reason: "request-denied", retryable: false });
    expect(input.mountConfig.events.onUnavailable).toHaveBeenCalledExactlyOnceWith(denied);
    expect(adapters[0].setUserLocation).not.toHaveBeenCalled();
  });

  it("does not let an old ready-work throw replace a newer unavailable generation", async () => {
    const { input, adapters } = fixture();
    const props = { ...input, development: true };
    const { result, rerender } = setup(props);
    adapters[0].render.mockImplementation(() => {
      flushSync(() => rerender({ ...props, createAdapter: () => { throw new Error("new generation failure"); } }));
      throw new Error("old generation failure");
    });
    await ready(adapters[0]);
    expect(result.current.status).toEqual({ kind: "unavailable", attempt: 0, reason: "network", retryable: true, diagnostic: "new generation failure" });
    expect(input.mountConfig.events.onUnavailable).not.toHaveBeenCalled();
    expect(adapters[0].destroy).toHaveBeenCalledOnce();
    expect(adapters[0].setUserLocation).not.toHaveBeenCalled();
  });

  it.each(["resolve", "reject"] as const)("ignores stale %s and unavailable after replacement", async (settle) => {
    const { input, adapters } = fixture();
    const { result } = setup(input);
    act(() => { result.current.mapRef(document.createElement("div")); });
    await ready(adapters[1]);
    await act(async () => {
      adapters[0].events.onUnavailable(denied);
      if (settle === "resolve") adapters[0].resolve(); else adapters[0].reject(new Error("late"));
      await Promise.resolve();
    });
    expect(result.current.status).toEqual({ kind: "ready", attempt: 0 });
    expect(adapters[0].render).not.toHaveBeenCalled();
    expect(input.mountConfig.events.onUnavailable).not.toHaveBeenCalled();
    act(() => adapters[1].events.onUnavailable(denied));
    act(() => adapters[0].events.onUnavailable({ status: "unavailable", reason: "network", retryable: true }));
    expect(result.current.status).toMatchObject({ reason: "request-denied", retryable: false });
  });

  it("destroys every Strict Mode attempt once and ignores resolution after unmount", async () => {
    const { input, adapters } = fixture();
    function Probe() {
      const controller = useMapAdapterLifecycle(input);
      return <div ref={controller.mapRef} />;
    }
    const { unmount } = render(<StrictMode><Probe /></StrictMode>);
    expect(adapters.length).toBeGreaterThan(0);
    unmount();
    await act(async () => {
      for (const adapter of adapters) { adapter.resolve(); await adapter.pending; adapter.events.onUnavailable(denied); }
    });
    for (const adapter of adapters) {
      expect(adapter.destroy).toHaveBeenCalledOnce();
      expect(adapter.render).not.toHaveBeenCalled();
      expect(adapter.setUserLocation).not.toHaveBeenCalled();
      expect(adapter.setLayout).not.toHaveBeenCalled();
    }
    expect(input.mountConfig.events.onUnavailable).not.toHaveBeenCalled();
  });
});
