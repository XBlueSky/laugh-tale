import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, StrictMode, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FakeMapAdapter } from "../providers/fake/FakeMapAdapter";
import { USER_LOCATION_OWNER_ID } from "./provider-contracts";
import { useUserLocation } from "./useUserLocation";

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
  it("waits for a late map adapter, focuses once, then only moves the marker", async () => {
    const geolocation = new ControlledGeolocation();
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    const initialProps: { adapter: FakeMapAdapter | null } = { adapter: null };
    const { result, rerender } = renderHook(
      ({ adapter }: { adapter: FakeMapAdapter | null }) =>
        useUserLocation(adapter, geolocation as unknown as Geolocation),
      { initialProps },
    );

    expect(result.current.status).toBe("idle");
    act(() => result.current.start());
    expect(result.current.status).toBe("requesting");
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1);

    act(() => geolocation.succeed(11, 35.6812, 139.7671));
    expect(result.current.status).toBe("active");

    const adapter = new FakeMapAdapter();
    rerender({ adapter });
    await waitFor(() => expect(adapter.userLocationCalls).toHaveLength(1));
    expect(adapter.userLocationCalls).toEqual([{ lat: 35.6812, lng: 139.7671 }]);
    expect(adapter.focusCalls).toEqual([
      { kind: "place", id: USER_LOCATION_OWNER_ID },
    ]);

    act(() => geolocation.succeed(11, 35.682, 139.768));
    await waitFor(() => expect(adapter.userLocationCalls).toHaveLength(2));
    expect(adapter.focusCalls).toHaveLength(1);

    act(() => result.current.recenter());
    expect(adapter.focusCalls).toHaveLength(2);
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1);
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it("invalidates callbacks from stopped, retried, and unmounted generations", async () => {
    const geolocation = new ControlledGeolocation();
    const adapter = new FakeMapAdapter();
    const { result, unmount } = renderHook(() =>
      useUserLocation(adapter, geolocation as unknown as Geolocation),
    );

    act(() => result.current.start());
    act(() => result.current.start());
    expect(geolocation.clearWatch).toHaveBeenNthCalledWith(1, 11);
    expect(result.current.status).toBe("requesting");

    act(() => geolocation.succeed(11, 1, 2));
    expect(adapter.userLocationCalls).toHaveLength(0);
    expect(result.current.status).toBe("requesting");

    act(() => geolocation.succeed(12, 3, 4));
    await waitFor(() => expect(adapter.userLocationCalls).toEqual([{ lat: 3, lng: 4 }]));
    expect(adapter.focusCalls).toEqual([
      { kind: "place", id: USER_LOCATION_OWNER_ID },
    ]);

    act(() => result.current.stop());
    expect(geolocation.clearWatch).toHaveBeenNthCalledWith(2, 12);
    expect(adapter.userLocationCalls.at(-1)).toBeNull();
    expect(result.current.status).toBe("idle");

    act(() => geolocation.succeed(12, 5, 6));
    expect(adapter.userLocationCalls).toHaveLength(2);

    act(() => result.current.start());
    unmount();
    expect(geolocation.clearWatch).toHaveBeenNthCalledWith(3, 13);
    act(() => geolocation.succeed(13, 7, 8));
    expect(adapter.userLocationCalls).toHaveLength(2);
    expect(adapter.focusCalls).toHaveLength(1);
  });

  it("surfaces permission denial and provider unavailability without implicit requests", () => {
    const geolocation = new ControlledGeolocation();
    const adapter = new FakeMapAdapter();
    const denied = renderHook(() =>
      useUserLocation(adapter, geolocation as unknown as Geolocation),
    );

    expect(geolocation.watchPosition).not.toHaveBeenCalled();
    act(() => denied.result.current.start());
    act(() => geolocation.fail(11, 1, "Permission denied"));
    expect(denied.result.current.status).toBe("denied");
    expect(denied.result.current.label).toMatch(/denied/i);
    expect(geolocation.clearWatch).toHaveBeenCalledWith(11);
    denied.unmount();

    const unavailable = renderHook(() => useUserLocation(adapter, undefined));
    act(() => unavailable.result.current.start());
    expect(unavailable.result.current.status).toBe("unavailable");
    expect(unavailable.result.current.label).toMatch(/unavailable/i);
  });

  it("guards stale GPS callbacks across StrictMode cleanup and a fresh remount", async () => {
    const geolocation = new ControlledGeolocation();
    const adapter = new FakeMapAdapter();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children);
    const first = renderHook(
      () => useUserLocation(adapter, geolocation as unknown as Geolocation),
      { wrapper },
    );

    act(() => first.result.current.start());
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1);
    first.unmount();
    expect(geolocation.clearWatch).toHaveBeenCalledWith(11);

    const second = renderHook(
      () => useUserLocation(adapter, geolocation as unknown as Geolocation),
      { wrapper },
    );
    act(() => second.result.current.start());
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(2);

    act(() => geolocation.succeed(11, 10, 20));
    expect(adapter.userLocationCalls).toHaveLength(0);
    act(() => geolocation.succeed(12, 35.68, 139.76));

    await waitFor(() =>
      expect(adapter.userLocationCalls).toEqual([{ lat: 35.68, lng: 139.76 }]),
    );
    expect(adapter.focusCalls).toEqual([
      { kind: "place", id: USER_LOCATION_OWNER_ID },
    ]);
    second.unmount();
    expect(geolocation.clearWatch).toHaveBeenCalledWith(12);
  });
});
