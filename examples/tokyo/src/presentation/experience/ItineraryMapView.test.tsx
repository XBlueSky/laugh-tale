import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MapPresentation } from "@laugh-tale-island/core";

import { ItineraryMapView } from "./ItineraryMapView";

afterEach(cleanup);

const presentation: MapPresentation = { places: [], routes: [] };

describe("ItineraryMapView", () => {
  it("renders one persistent map owner and attaches the controller binding", () => {
    const ref = vi.fn();
    const { rerender } = render(
      <ItineraryMapView
        map={{ presentation, status: "mounting" }}
        binding={{ ref }}
        retry={vi.fn()}
      />,
    );
    const map = screen.getByRole("region", { name: "Trip map" });
    expect(map).toHaveAttribute("data-map-canvas", "persistent");
    expect(map).toHaveAttribute("data-map-status", "mounting");
    expect(ref).toHaveBeenCalledWith(map);

    rerender(
      <ItineraryMapView
        map={{ presentation, status: "ready" }}
        binding={{ ref }}
        retry={vi.fn()}
      />,
    );
    expect(screen.getByRole("region", { name: "Trip map" })).toBe(map);
    expect(map).toHaveAttribute("data-map-status", "ready");
  });

  it("keeps the map region available while exposing semantic retry on failure", () => {
    const retry = vi.fn();
    render(
      <ItineraryMapView
        map={{ presentation, status: "error" }}
        binding={{ ref: () => undefined }}
        retry={retry}
      />,
    );

    expect(screen.getByRole("region", { name: "Trip map" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Map unavailable. The itinerary remains available.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry map" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
