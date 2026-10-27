import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement, StrictMode, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useUserLocation } from "../src/use-user-location.js";

afterEach(cleanup);

interface WatchCallbacks {
  success: PositionCallback;
  error?: PositionErrorCallback | null;
}

class ControlledGeolocation {
  readonly clearWatch = vi.fn<(watchId: number) => void>();
  readonly watchPosition = vi.fn(
    (
      success: PositionCallback,
      error?: PositionErrorCallback | null,
    ): number => {
      const id = this.nextId;
      this.nextId += 1;
      this.callbacks.set(id, { success, error });
      return id;
    },
  );

  private nextId = 11;
  private readonly callbacks = new Map<number, WatchCallbacks>();

  succeed(id: number, latitude: number, longitude: number): void {
    this.callbacks.get(id)?.success({
      coords: {
        latitude,
        longitude,
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: 1,
      toJSON: () => ({}),
    });
  }

  fail(id: number, code: number, message: string): void {
    this.callbacks.get(id)?.error?.({ code, message } as GeolocationPositionError);
  }
}

describe("useUserLocation", () => {
  it("returns coordinates and requests one semantic first-fix recenter, then explicit recenter", () => {
    const geo = new ControlledGeolocation();
    const recenter = vi.fn();
    const hook = renderHook(() => useUserLocation(recenter, geo as unknown as Geolocation));
    act(() => hook.result.current.start());
    expect(hook.result.current.status).toBe("requesting");
    act(() => geo.succeed(11, 35.68, 139.76));
    expect(hook.result.current.location).toEqual({ lat: 35.68, lng: 139.76 });
    expect(hook.result.current.status).toBe("active");
    expect(recenter).toHaveBeenCalledTimes(1);
    act(() => geo.succeed(11, 35.69, 139.77));
    expect(hook.result.current.location).toEqual({ lat: 35.69, lng: 139.77 });
    expect(recenter).toHaveBeenCalledTimes(1);
    act(() => hook.result.current.recenter());
    expect(recenter).toHaveBeenCalledTimes(2);
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
  });
  it("invalidates callbacks from stopped, restarted, and unmounted generations", () => {
    const geo = new ControlledGeolocation();
    const recenter = vi.fn();
    const hook = renderHook(() => useUserLocation(recenter, geo as unknown as Geolocation));
    act(() => hook.result.current.start());
    act(() => hook.result.current.start());
    expect(geo.clearWatch).toHaveBeenCalledWith(11);
    act(() => geo.succeed(11, 1, 2));
    expect(hook.result.current.location).toBeNull();
    act(() => geo.succeed(12, 3, 4));
    expect(hook.result.current.location).toEqual({ lat: 3, lng: 4 });
    act(() => hook.result.current.stop());
    expect(geo.clearWatch).toHaveBeenCalledWith(12);
    expect(hook.result.current.location).toBeNull();
    expect(hook.result.current.status).toBe("idle");
    act(() => geo.succeed(12, 5, 6));
    expect(hook.result.current.location).toBeNull();
    act(() => hook.result.current.start());
    hook.unmount();
    expect(geo.clearWatch).toHaveBeenCalledWith(13);
    act(() => geo.succeed(13, 7, 8));
    expect(recenter).toHaveBeenCalledTimes(1);
  });
  it("classifies denied and missing APIs without implicit watches", () => {
    const geo = new ControlledGeolocation();
    const hook = renderHook(() => useUserLocation(() => {}, geo as unknown as Geolocation));
    expect(geo.watchPosition).not.toHaveBeenCalled();
    act(() => hook.result.current.start());
    act(() => geo.fail(11, 1, "denied"));
    expect(hook.result.current.status).toBe("denied");
    expect(geo.clearWatch).toHaveBeenCalledWith(11);
    hook.unmount();
    const absent = renderHook(() => useUserLocation(() => {}, undefined));
    act(() => absent.result.current.start());
    expect(absent.result.current.status).toBe("unavailable");
  });
  it.each([[NaN, 1], [91, 1], [1, 181]])("rejects invalid fix %s/%s and invalidates its watch", (lat, lng) => {
    const geo = new ControlledGeolocation();
    const recenter = vi.fn();
    const hook = renderHook(() => useUserLocation(recenter, geo as unknown as Geolocation));
    act(() => hook.result.current.start());
    act(() => geo.succeed(11, lat, lng));
    expect(hook.result.current.status).toBe("unavailable");
    expect(hook.result.current.location).toBeNull();
    act(() => geo.succeed(11, 1, 2));
    expect(recenter).not.toHaveBeenCalled();
  });
  it("rejects stale callbacks across StrictMode cleanup and a new mount", () => {
    const geo = new ControlledGeolocation();
    const recenter = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);
    const first = renderHook(() => useUserLocation(recenter, geo as unknown as Geolocation), { wrapper });
    act(() => first.result.current.start());
    first.unmount();
    const second = renderHook(() => useUserLocation(recenter, geo as unknown as Geolocation), { wrapper });
    act(() => second.result.current.start());
    act(() => geo.succeed(11, 1, 2));
    expect(second.result.current.location).toBeNull();
    act(() => geo.succeed(12, 3, 4));
    expect(second.result.current.location).toEqual({ lat: 3, lng: 4 });
    expect(recenter).toHaveBeenCalledTimes(1);
    second.unmount();
    expect(geo.clearWatch.mock.calls).toEqual([[11], [12]]);
  });
});
