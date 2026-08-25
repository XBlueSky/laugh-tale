import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeMapAdapter } from "../providers/fake/FakeMapAdapter";
import type { Trip } from "../trip-core/model";
import {
  candidateMapOwnerId,
  nodeMapOwnerId,
  USER_LOCATION_OWNER_ID,
} from "./provider-contracts";
import { TripExperience } from "./TripExperience";

const baseCss = readFileSync(
  resolve(process.cwd(), "src/ui/styles/base.css"),
  "utf8",
);

afterEach(cleanup);

function createTrip(): Trip {
  return {
    id: "synthetic-mobile-trip",
    title: "Synthetic Tokyo day",
    timezone: "Asia/Tokyo",
    startDate: "2040-06-12",
    endDate: "2040-06-13",
    days: [
      {
        id: "day-one",
        date: "2040-06-12",
        title: "Harbor and museum",
        nodes: [
          {
            id: "hotel",
            dayId: "day-one",
            kind: "lodging",
            title: "Harbor Hotel",
            timing: { certainty: "unknown" },
            optionality: "core",
            place: {
              name: "Harbor Hotel",
              coordinates: { lat: 35.68, lng: 139.76 },
              certainty: "confirmed",
            },
            payload: { role: "base" },
          },
          {
            id: "museum",
            dayId: "day-one",
            kind: "sightseeing",
            title: "Museum",
            timing: { start: "09:00", end: "11:00", certainty: "fixed" },
            optionality: "core",
            place: {
              name: "Museum",
              coordinates: { lat: 35.69, lng: 139.77 },
              certainty: "confirmed",
            },
            payload: {},
          },
          {
            id: "dinner",
            dayId: "day-one",
            kind: "dining",
            title: "Dinner",
            timing: { start: "12:00", end: "13:00", certainty: "suggested" },
            optionality: "candidate",
            payload: { candidateGroupId: "dinner-options" },
          },
        ],
      },
      {
        id: "day-two",
        date: "2040-06-13",
        title: "Park day",
        nodes: [
          {
            id: "park",
            dayId: "day-two",
            kind: "sightseeing",
            title: "Park",
            timing: { start: "10:00", certainty: "suggested" },
            optionality: "core",
            place: {
              name: "Park",
              coordinates: { lat: 35.7, lng: 139.78 },
              certainty: "suggested",
            },
            payload: {},
          },
        ],
      },
    ],
    routes: [
      {
        id: "route-museum-dinner",
        dayId: "day-one",
        fromNodeId: "museum",
        toNodeId: "dinner",
        mode: "transit",
        source: "manual",
        certainty: "suggested",
        summary: "Train to dinner",
      },
    ],
    candidateGroups: [
      {
        id: "dinner-options",
        parentNodeId: "dinner",
        mode: "single",
        defaultOptionId: "dinner-a",
        options: [
          {
            id: "dinner-a",
            title: "Dinner A",
            place: {
              name: "Dinner A",
              coordinates: { lat: 35.71, lng: 139.79 },
              certainty: "candidate",
            },
          },
        ],
      },
    ],
    reservations: [],
    tasks: [],
  };
}

function installMatchMedia(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("TripExperience", () => {
  beforeEach(() => {
    installMatchMedia(false);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 500 });
  });

  it("keeps map and list selection bidirectional without remounting across days", async () => {
    const user = userEvent.setup();
    const adapter = new FakeMapAdapter();
    render(
      <TripExperience
        trip={createTrip()}
        adapterFactory={() => adapter}
        clock={() => "2040-06-12T00:30:00Z"}
      />,
    );

    await waitFor(() => expect(adapter.mountCalls).toHaveLength(1));
    const mapCanvas = screen.getByTestId("itinerary-map");

    act(() => adapter.emitPlaceSelect(nodeMapOwnerId("museum")));
    expect(screen.getByRole("button", { name: /^09:00 Museum$/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    act(() => adapter.emitPlaceSelect(candidateMapOwnerId("dinner-a")));
    expect(screen.getByRole("button", { name: /^約 12:00 Dinner A$/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: /^09:00 Museum$/ }));
    expect(adapter.focusCalls.at(-1)).toEqual({
      kind: "place",
      id: nodeMapOwnerId("museum"),
    });

    act(() => adapter.emitRouteSelect("route-museum-dinner"));
    const route = screen.getByRole("button", { name: /Route from Museum to Dinner A/ });
    expect(route).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /^約 12:00 Dinner A$/ }));
    expect(route).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /Park day/ }));
    await waitFor(() =>
      expect(adapter.renderCalls.at(-1)?.places[0]?.label).toBe("Park"),
    );
    expect(screen.getByTestId("itinerary-map")).toBe(mapCanvas);
    expect(adapter.mountCalls).toHaveLength(1);
    expect(adapter.destroyCalls).toBe(0);
  });

  it("preserves manual provenance until return-to-now restores automatic advancement", async () => {
    const user = userEvent.setup();
    const adapter = new FakeMapAdapter();
    let now = "2040-06-12T00:30:00Z";
    const clock = () => now;
    const trip = createTrip();
    const { rerender } = render(
      <TripExperience trip={trip} adapterFactory={() => adapter} clock={clock} />,
    );

    const museum = await screen.findByRole("button", { name: /^09:00 Museum$/ });
    const dinner = screen.getByRole("button", { name: /^約 12:00 Dinner A$/ });
    expect(museum).toHaveAttribute("data-selection-source", "automatic");

    await user.click(dinner);
    expect(dinner).toHaveAttribute("data-selection-source", "manual");

    now = "2040-06-12T01:00:00Z";
    rerender(<TripExperience trip={trip} adapterFactory={() => adapter} clock={clock} />);
    expect(dinner).toHaveAttribute("aria-pressed", "true");

    await user.click(
      screen.getAllByRole("button", {
        name: "Return to the current itinerary item",
      })[0],
    );
    await waitFor(() => expect(museum).toHaveAttribute("aria-pressed", "true"));
    expect(museum).toHaveAttribute("data-selection-source", "automatic");

    now = "2040-06-12T03:30:00Z";
    rerender(<TripExperience trip={trip} adapterFactory={() => adapter} clock={clock} />);
    await waitFor(() => expect(dinner).toHaveAttribute("aria-pressed", "true"));
    expect(dinner).toHaveAttribute("data-selection-source", "automatic");
  });

  it("derives reversible header, sheet ceiling, and map padding from one root state", async () => {
    const user = userEvent.setup();
    const adapter = new FakeMapAdapter();
    render(
      <TripExperience
        trip={createTrip()}
        adapterFactory={() => adapter}
        clock={() => "2040-06-12T00:30:00Z"}
      />,
    );
    const root = screen.getByTestId("trip-experience");
    expect(screen.getByRole("toolbar", { name: "Map controls" })).toBeVisible();
    const expandedClearance = root.style.getPropertyValue("--header-clearance");
    expect(root).toHaveAttribute("data-geometry-source", "shared");
    expect(root).toHaveAttribute("data-viewport-width", "320");

    await user.click(screen.getByRole("button", { name: "Collapse date choices" }));
    const collapsedClearance = root.style.getPropertyValue("--header-clearance");
    const ceiling = root.style.getPropertyValue("--sheet-ceiling");
    const mapTop = root.style.getPropertyValue("--map-padding-top");
    expect(collapsedClearance).not.toBe(expandedClearance);
    expect(mapTop).toBe(collapsedClearance);
    expect(Number.parseFloat(ceiling)).toBe(
      500 - Number.parseFloat(collapsedClearance),
    );
    expect(screen.getByTestId("date-rail")).toHaveAttribute("inert");

    await user.click(screen.getByRole("button", { name: "Expand date choices" }));
    expect(root.style.getPropertyValue("--header-clearance")).toBe(expandedClearance);
    expect(root.style.getPropertyValue("--map-padding-top")).toBe(expandedClearance);

    const touchTargets = root.querySelectorAll('[data-touch-target="44"]');
    expect(touchTargets.length).toBeGreaterThan(4);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("data-touch-target", "44");
    }
    expect(root.style.maxInlineSize).toBe("100vw");
    expect(root.style.overflowX).toBe("hidden");
    expect(baseCss).toMatch(
      /\.trip-experience\s*\{[^}]*max-width:\s*100vw;[^}]*overflow:\s*hidden;/s,
    );
  });

  it("applies reduced-motion geometry synchronously", async () => {
    installMatchMedia(true);
    const user = userEvent.setup();
    render(
      <TripExperience
        trip={createTrip()}
        adapterFactory={() => new FakeMapAdapter()}
        clock={() => "2040-06-12T00:30:00Z"}
      />,
    );
    const root = screen.getByTestId("trip-experience");
    expect(root).toHaveAttribute("data-motion", "reduced");
    expect(root.style.getPropertyValue("--shell-motion-duration")).toBe("0ms");

    await user.click(screen.getByRole("button", { name: "Collapse date choices" }));
    expect(root).toHaveAttribute("data-header-expanded", "false");
    expect(root.style.getPropertyValue("--sheet-ceiling")).toBe(
      `${500 - Number.parseFloat(root.style.getPropertyValue("--header-clearance"))}px`,
    );
  });

  it("requests location only after a user action and never persists coordinates", async () => {
    let success: PositionCallback | undefined;
    const watchPosition = vi.fn((callback: PositionCallback) => {
      success = callback;
      return 41;
    });
    const clearWatch = vi.fn();
    const geolocation = {
      watchPosition,
      clearWatch,
      getCurrentPosition: vi.fn(),
    } as unknown as Geolocation;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: geolocation,
    });
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    const trip = createTrip();
    const tripBefore = JSON.stringify(trip);
    const adapter = new FakeMapAdapter();
    const user = userEvent.setup();
    render(
      <TripExperience
        trip={trip}
        adapterFactory={() => adapter}
        clock={() => "2040-06-12T00:30:00Z"}
      />,
    );

    expect(watchPosition).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Use my location" }));
    expect(watchPosition).toHaveBeenCalledTimes(1);
    act(() => {
      success?.({
        coords: {
          latitude: 35.6812,
          longitude: 139.7671,
          accuracy: 4,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: 1,
        toJSON: () => ({}),
      });
    });

    await waitFor(() =>
      expect(adapter.userLocationCalls).toContainEqual({
        lat: 35.6812,
        lng: 139.7671,
      }),
    );
    expect(adapter.focusCalls).toContainEqual({
      kind: "place",
      id: USER_LOCATION_OWNER_ID,
    });
    expect(storageWrite).not.toHaveBeenCalled();
    expect(JSON.stringify(trip)).toBe(tripBefore);
  });
});
