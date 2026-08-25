import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FakeMapAdapter } from "../providers/fake/FakeMapAdapter";
import {
  nodeMapOwnerId,
  type MapEvents,
  type MapPresentation,
} from "./provider-contracts";
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
});
