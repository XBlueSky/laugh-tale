import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FakeMapAdapter } from "../providers/fake/FakeMapAdapter";
import { nodeMapOwnerId, type MapPresentation } from "@laugh-tale/core";
import { type MapEvents } from "@laugh-tale/core/browser";
import { ItineraryMap } from "./ItineraryMap";

afterEach(cleanup);

function presentation(label: string, ownerId = label.toLowerCase()): MapPresentation {
  return {
    places: [
      {
        ownerId: nodeMapOwnerId(ownerId),
        label,
        coordinates: { lat: 25, lng: 121 },
        tone: "default",
      },
    ],
    routes: [],
  };
}

class DelayedFakeMapAdapter extends FakeMapAdapter {
  private resolvePendingMount: (() => void) | undefined;

  override mount(element: HTMLElement, events: MapEvents): Promise<void> {
    void super.mount(element, events);
    return new Promise<void>((resolve) => {
      this.resolvePendingMount = resolve;
    });
  }

  resolveMount(): void {
    this.resolvePendingMount?.();
  }
}

class FlakyFakeMapAdapter extends FakeMapAdapter {
  private attempt = 0;

  override mount(element: HTMLElement, events: MapEvents): Promise<void> {
    this.attempt += 1;
    void super.mount(element, events);
    return this.attempt === 1
      ? Promise.reject(new Error("Synthetic map failure"))
      : Promise.resolve();
  }
}

describe("ItineraryMap", () => {
  it("keeps one full-viewport map mounted and applies the latest day after readiness", async () => {
    const adapter = new DelayedFakeMapAdapter();
    const onReady = vi.fn();
    const onPlaceSelect = vi.fn();
    const onRouteSelect = vi.fn();
    const { rerender } = render(
      <ItineraryMap
        adapter={adapter}
        presentation={presentation("Museum")}
        padding={{ top: 80, right: 16, bottom: 220, left: 16 }}
        onPlaceSelect={onPlaceSelect}
        onRouteSelect={onRouteSelect}
        onReady={onReady}
      />,
    );
    const canvas = screen.getByRole("region", { name: "Trip map" });
    expect(canvas).toHaveAttribute("data-map-canvas", "persistent");
    expect(adapter.mountCalls).toEqual([canvas]);

    rerender(
      <ItineraryMap
        adapter={adapter}
        presentation={presentation("Dinner")}
        padding={{ top: 76, right: 16, bottom: 128, left: 16 }}
        onPlaceSelect={onPlaceSelect}
        onRouteSelect={onRouteSelect}
        onReady={onReady}
      />,
    );
    expect(screen.getByRole("region", { name: "Trip map" })).toBe(canvas);
    expect(adapter.mountCalls).toHaveLength(1);
    expect(adapter.renderCalls).toHaveLength(0);

    await act(async () => {
      adapter.resolveMount();
      await Promise.resolve();
    });

    await waitFor(() => expect(adapter.renderCalls).toHaveLength(1));
    expect(adapter.renderCalls[0]?.places[0]?.label).toBe("Dinner");
    expect(adapter.paddingCalls.at(-1)).toEqual({
      top: 76,
      right: 16,
      bottom: 128,
      left: 16,
    });
    expect(onReady).toHaveBeenCalledWith(adapter);

    adapter.emitPlaceSelect(nodeMapOwnerId("dinner"));
    adapter.emitRouteSelect("route-dinner");
    expect(onPlaceSelect).toHaveBeenCalledWith(nodeMapOwnerId("dinner"));
    expect(onRouteSelect).toHaveBeenCalledWith("route-dinner");
  });

  it("invalidates a late mount completion after unmount", async () => {
    const adapter = new DelayedFakeMapAdapter();
    const onReady = vi.fn();
    const { unmount } = render(
      <ItineraryMap
        adapter={adapter}
        presentation={presentation("Museum")}
        padding={{ top: 80, right: 16, bottom: 220, left: 16 }}
        onPlaceSelect={vi.fn()}
        onRouteSelect={vi.fn()}
        onReady={onReady}
      />,
    );

    unmount();
    await act(async () => {
      adapter.resolveMount();
      await Promise.resolve();
    });

    expect(adapter.destroyCalls).toBe(1);
    expect(adapter.renderCalls).toHaveLength(0);
    expect(onReady).not.toHaveBeenCalled();
  });

  it("keeps a readable live degraded state and retries without replacing the canvas", async () => {
    const user = userEvent.setup();
    const adapter = new FlakyFakeMapAdapter();
    const onReady = vi.fn();
    render(
      <ItineraryMap
        adapter={adapter}
        presentation={presentation("Museum")}
        padding={{ top: 80, right: 16, bottom: 220, left: 16 }}
        onPlaceSelect={vi.fn()}
        onRouteSelect={vi.fn()}
        onReady={onReady}
      />,
    );

    const canvas = screen.getByRole("region", { name: "Trip map" });
    const failure = await screen.findByRole("alert");
    expect(failure).toHaveTextContent(/Map unavailable/i);
    expect(failure).toHaveTextContent(/itinerary remains available/i);
    expect(canvas).toHaveAttribute("data-map-status", "error");
    expect(adapter.destroyCalls).toBe(1);

    const retry = screen.getByRole("button", { name: "Retry map" });
    expect(retry).toHaveAttribute("data-touch-target", "44");
    await user.click(retry);

    await waitFor(() => expect(canvas).toHaveAttribute("data-map-status", "ready"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Trip map" })).toBe(canvas);
    expect(adapter.mountCalls).toEqual([canvas, canvas]);
    expect(adapter.destroyCalls).toBe(1);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("survives StrictMode mount-cleanup-remount with one live canvas lifecycle", async () => {
    const adapter = new FakeMapAdapter();
    const onReady = vi.fn();
    const { unmount } = render(
      <StrictMode>
        <ItineraryMap
          adapter={adapter}
          presentation={presentation("Museum")}
          padding={{ top: 80, right: 16, bottom: 220, left: 16 }}
          onPlaceSelect={vi.fn()}
          onRouteSelect={vi.fn()}
          onReady={onReady}
        />
      </StrictMode>,
    );

    const canvas = screen.getByRole("region", { name: "Trip map" });
    await waitFor(() => expect(canvas).toHaveAttribute("data-map-status", "ready"));
    expect(adapter.mountCalls).toEqual([canvas, canvas]);
    expect(adapter.destroyCalls).toBe(1);
    expect(adapter.renderCalls).toHaveLength(1);
    expect(onReady).toHaveBeenCalledTimes(1);

    unmount();
    expect(adapter.destroyCalls).toBe(2);
  });
});
