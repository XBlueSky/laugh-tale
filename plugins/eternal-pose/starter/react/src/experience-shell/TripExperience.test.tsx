import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeMapAdapter } from "../providers/fake/FakeMapAdapter";
import { FakeRouteAdapter } from "../providers/fake/FakeRouteAdapter";
import type { Trip } from "@laugh-tale-island/core";
import { candidateMapOwnerId, nodeMapOwnerId, type MapFocusTarget, type MapPresentation, USER_LOCATION_OWNER_ID } from "@laugh-tale-island/core";
import { type MapEvents } from "@laugh-tale-island/core/browser";
import { TripExperience } from "./TripExperience";

const baseCss = readFileSync(
  resolve(process.cwd(), "src/ui/styles/base.css"),
  "utf8",
);
const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (originalScrollIntoView === undefined) {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  } else {
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScrollIntoView,
    );
  }
});

class DelayedFakeMapAdapter extends FakeMapAdapter {
  private resolvePendingMount: (() => void) | undefined;

  override mount(element: HTMLElement, events: MapEvents): Promise<void> {
    void super.mount(element, events);
    return new Promise<void>((resolveMount) => {
      this.resolvePendingMount = resolveMount;
    });
  }

  resolveMount(): void {
    this.resolvePendingMount?.();
  }
}

class RejectingFakeMapAdapter extends FakeMapAdapter {
  override mount(element: HTMLElement, events: MapEvents): Promise<void> {
    void super.mount(element, events);
    return Promise.reject(new Error("Synthetic unavailable map"));
  }
}

type CameraEvent =
  | { kind: "render"; ownerIds: string[] }
  | { kind: "fit"; ids: string[] }
  | { kind: "focus"; target: MapFocusTarget };

class OwnerAwareFakeMapAdapter extends FakeMapAdapter {
  readonly cameraEvents: CameraEvent[] = [];

  private renderedOwnerIds = new Set<string>();

  override render(presentation: MapPresentation): void {
    super.render(presentation);
    this.renderedOwnerIds = new Set([
      ...presentation.places.map(({ ownerId }) => ownerId),
      ...presentation.routes.flatMap(({ edgeId, path }) =>
        path.length > 0 ? [edgeId] : [],
      ),
    ]);
    this.cameraEvents.push({
      kind: "render",
      ownerIds: [...this.renderedOwnerIds],
    });
  }

  override focus(target: MapFocusTarget): void {
    if (!this.renderedOwnerIds.has(target.id)) {
      return;
    }
    super.focus(target);
    this.cameraEvents.push({ kind: "focus", target: { ...target } });
  }

  override fit(ids: string[]): void {
    super.fit(ids);
    this.cameraEvents.push({ kind: "fit", ids: [...ids] });
  }

  override destroy(): void {
    super.destroy();
    this.renderedOwnerIds.clear();
  }
}

class DelayedOwnerAwareMapAdapter extends OwnerAwareFakeMapAdapter {
  private resolvePendingMount: (() => void) | undefined;

  override mount(element: HTMLElement, events: MapEvents): Promise<void> {
    void super.mount(element, events);
    return new Promise<void>((resolveMount) => {
      this.resolvePendingMount = resolveMount;
    });
  }

  resolveMount(): void {
    this.resolvePendingMount?.();
  }
}

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

function createTripWithRouteNavigation(origin: string, destination: string): Trip {
  const trip = createTrip();
  trip.days[0].nodes[2] = {
    id: "dinner",
    dayId: "day-one",
    kind: "dining",
    title: "Dinner hall",
    timing: { start: "12:00", end: "13:00", certainty: "suggested" },
    optionality: "core",
    place: {
      name: "Dinner hall",
      coordinates: { lat: 35.71, lng: 139.79 },
      certainty: "confirmed",
    },
    payload: {},
  };
  trip.candidateGroups = [];
  trip.routes[0] = {
    ...trip.routes[0],
    navigation: { origin, destination },
  };
  return trip;
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

  it("passes the authoritative day date and live current owner into the timeline", () => {
    const trip = createTrip();
    trip.days[0] = {
      ...trip.days[0],
      id: "day-2099-99-99",
      nodes: [{
        id: "timed-exhibit",
        dayId: "day-2099-99-99",
        kind: "experience",
        title: "Timed exhibit",
        timing: { start: "09:00", end: "11:00", certainty: "fixed" },
        optionality: "core",
        booking: { status: "confirmed", reference: "PRIVATE-REF" },
        payload: { durationMinutes: 120 },
      }],
    };
    trip.routes = [];
    trip.candidateGroups = [];

    render(
      <TripExperience
        trip={trip}
        adapterFactory={() => new FakeMapAdapter()}
        clock={() => "2040-06-12T00:30:00Z"}
      />,
    );

    const current = screen.getByRole("button", {
      name: "09:00 Timed exhibit · Tuesday, 12 June 2040 · fixed time",
    });
    expect(current).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Tuesday, 12 June 2040").closest("time")).toHaveAttribute(
      "datetime",
      "2040-06-12",
    );
    expect(screen.queryByText(/2099/)).not.toBeInTheDocument();
    expect(screen.queryByText(/PRIVATE-REF/)).not.toBeInTheDocument();
  });

  it("trims explicit endpoints for keyless Google consumer navigation", () => {
    const trip = createTripWithRouteNavigation(
      "  Synthetic museum entrance ",
      "\tSynthetic dinner hall  ",
    );

    render(
      <TripExperience
        trip={trip}
        adapterFactory={() => new FakeMapAdapter()}
        clock={() => "2040-06-12T00:30:00Z"}
      />,
    );

    const link = screen.getByRole("link", {
      name: "Open live transit directions from Synthetic museum entrance to Synthetic dinner hall",
    });
    expect(link).toHaveAttribute(
      "aria-label",
      "Open live transit directions from Synthetic museum entrance to Synthetic dinner hall",
    );
    expect(link).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&origin=Synthetic%20museum%20entrance&destination=Synthetic%20dinner%20hall&travelmode=transit",
    );
  });

  it.each([
    { endpoint: "empty origin", origin: "", destination: "Synthetic dinner hall" },
    { endpoint: "whitespace destination", origin: "Synthetic museum entrance", destination: " \t " },
  ])("omits production navigation for $endpoint", ({ origin, destination }) => {
    render(
      <TripExperience
        trip={createTripWithRouteNavigation(origin, destination)}
        adapterFactory={() => new FakeMapAdapter()}
        clock={() => "2040-06-12T00:30:00Z"}
      />,
    );

    expect(screen.queryByRole("link", { name: /Open live transit directions/ }))
      .not.toBeInTheDocument();
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
    await waitFor(() =>
      expect(adapter.fitCalls).toEqual([
        [
          nodeMapOwnerId("hotel"),
          nodeMapOwnerId("museum"),
          nodeMapOwnerId("dinner"),
        ],
      ]),
    );
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
    const route = screen.getByText("transit").closest(".route-connector");
    expect(route).not.toBeNull();
    expect(route).not.toHaveAttribute("role", "button");
    expect(
      screen.queryByRole("button", { name: /Route from Museum to Dinner A/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^約 12:00 Dinner A$/ }));
    expect(adapter.fitCalls).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /Park day/ }));
    await waitFor(() =>
      expect(adapter.renderCalls.at(-1)?.places[0]?.label).toBe("Park"),
    );
    expect(adapter.fitCalls).toEqual([
      [
        nodeMapOwnerId("hotel"),
        nodeMapOwnerId("museum"),
        nodeMapOwnerId("dinner"),
      ],
      [nodeMapOwnerId("park")],
    ]);
    expect(screen.getByTestId("itinerary-map")).toBe(mapCanvas);
    expect(adapter.mountCalls).toHaveLength(1);
    expect(adapter.destroyCalls).toBe(0);
  });

  it("honors only the latest displayed-day camera intent when the adapter becomes ready late", async () => {
    const adapter = new DelayedFakeMapAdapter();
    render(
      <TripExperience
        trip={createTrip()}
        adapterFactory={() => adapter}
        clock={() => "2040-06-12T00:30:00Z"}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Park day/ }));
    expect(adapter.fitCalls).toHaveLength(0);

    await act(async () => {
      adapter.resolveMount();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(adapter.fitCalls).toEqual([[nodeMapOwnerId("park")]]),
    );
    expect(adapter.renderCalls.at(-1)?.places.map(({ label }) => label)).toEqual([
      "Park",
    ]);

    fireEvent.click(screen.getByRole("button", { name: /^約 10:00 Park$/ }));
    expect(adapter.fitCalls).toHaveLength(1);
  });

  it("keeps the itinerary readable and selectable while the map is unavailable", async () => {
    render(
      <TripExperience
        trip={createTrip()}
        adapterFactory={() => new RejectingFakeMapAdapter()}
        clock={() => "2040-06-12T00:30:00Z"}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/Map unavailable/i);
    const museum = screen.getByRole("button", { name: /^09:00 Museum$/ });
    const dinner = screen.getByRole("button", { name: /^約 12:00 Dinner A$/ });
    expect(museum).toBeVisible();
    fireEvent.click(dinner);
    expect(dinner).toHaveAttribute("aria-pressed", "true");
    expect(dinner).toHaveAttribute("data-selection-source", "manual");
  });

  it("lets explicit map and current actions synchronize the authoritative day", async () => {
    const adapter = new FakeMapAdapter();
    render(
      <TripExperience
        trip={createTrip()}
        adapterFactory={() => adapter}
        clock={() => "2040-06-12T00:30:00Z"}
      />,
    );
    await waitFor(() => expect(adapter.fitCalls).toHaveLength(1));

    act(() => adapter.emitPlaceSelect(nodeMapOwnerId("park")));
    expect(screen.getByRole("button", { name: /Park day/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /^約 10:00 Park$/ })).toHaveAttribute(
      "data-selection-source",
      "manual",
    );
    await waitFor(() =>
      expect(adapter.fitCalls.at(-1)).toEqual([nodeMapOwnerId("park")]),
    );

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Return to the current itinerary item",
      })[0],
    );
    expect(screen.getByRole("button", { name: /Harbor and museum/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /^09:00 Museum$/ })).toHaveAttribute(
      "data-selection-source",
      "automatic",
    );
    await waitFor(() => expect(adapter.fitCalls).toHaveLength(3));
  });

  it("replays cross-day return-to-now after render and fit with exact focus last", async () => {
    const adapter = new OwnerAwareFakeMapAdapter();
    const trip = createTrip();
    let now = "2040-06-12T00:30:00Z";
    const clock = () => now;
    const experience = () => (
      <StrictMode>
        <TripExperience trip={trip} adapterFactory={() => adapter} clock={clock} />
      </StrictMode>
    );
    const { rerender } = render(experience());

    await waitFor(() => expect(adapter.fitCalls).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: /Park day/ }));
    await waitFor(() =>
      expect(adapter.renderCalls.at(-1)?.places.map(({ ownerId }) => ownerId)).toEqual([
        nodeMapOwnerId("park"),
      ]),
    );
    adapter.cameraEvents.splice(0);

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Return to the current itinerary item",
      })[0],
    );

    const museumTarget = {
      kind: "place" as const,
      id: nodeMapOwnerId("museum"),
    };
    await waitFor(() => expect(adapter.focusCalls).toEqual([museumTarget]));
    const targetDayRender = adapter.cameraEvents.findIndex(
      (event) =>
        event.kind === "render" && event.ownerIds.includes(nodeMapOwnerId("museum")),
    );
    const targetDayFit = adapter.cameraEvents.findIndex(
      (event) =>
        event.kind === "fit" && event.ids.includes(nodeMapOwnerId("museum")),
    );
    const exactFocus = adapter.cameraEvents.findIndex(
      (event) => event.kind === "focus" && event.target.id === museumTarget.id,
    );
    expect(targetDayRender).toBeGreaterThanOrEqual(0);
    expect(targetDayFit).toBeGreaterThan(targetDayRender);
    expect(exactFocus).toBeGreaterThan(targetDayFit);
    expect(adapter.cameraEvents.at(-1)).toEqual({
      kind: "focus",
      target: museumTarget,
    });

    now = "2040-06-12T00:31:00Z";
    rerender(experience());
    await waitFor(() =>
      expect(screen.getByLabelText("Asia/Tokyo time")).toHaveTextContent("09:31"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Collapse date choices" }));
    expect(adapter.focusCalls).toEqual([museumTarget]);
  });

  it("replays cross-day lodging focus only after its owning day is rendered", async () => {
    const adapter = new OwnerAwareFakeMapAdapter();
    render(
      <TripExperience
        trip={createTrip()}
        adapterFactory={() => adapter}
        clock={() => "2040-06-12T00:30:00Z"}
      />,
    );

    await waitFor(() => expect(adapter.fitCalls).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: /Park day/ }));
    await waitFor(() =>
      expect(adapter.renderCalls.at(-1)?.places.map(({ ownerId }) => ownerId)).toEqual([
        nodeMapOwnerId("park"),
      ]),
    );
    adapter.cameraEvents.splice(0);

    fireEvent.click(screen.getByRole("button", { name: "Return to lodging" }));

    const hotelTarget = {
      kind: "place" as const,
      id: nodeMapOwnerId("hotel"),
    };
    await waitFor(() => expect(adapter.focusCalls).toEqual([hotelTarget]));
    const targetDayRender = adapter.cameraEvents.findIndex(
      (event) =>
        event.kind === "render" && event.ownerIds.includes(nodeMapOwnerId("hotel")),
    );
    const targetDayFit = adapter.cameraEvents.findIndex(
      (event) => event.kind === "fit" && event.ids.includes(nodeMapOwnerId("hotel")),
    );
    const exactFocus = adapter.cameraEvents.findIndex(
      (event) => event.kind === "focus" && event.target.id === hotelTarget.id,
    );
    expect(targetDayRender).toBeGreaterThanOrEqual(0);
    expect(targetDayFit).toBeGreaterThan(targetDayRender);
    expect(exactFocus).toBeGreaterThan(targetDayFit);
    expect(adapter.cameraEvents.at(-1)).toEqual({
      kind: "focus",
      target: hotelTarget,
    });
  });

  it("keeps same-day selection focus immediate without replaying it after render", async () => {
    const adapter = new OwnerAwareFakeMapAdapter();
    render(
      <TripExperience
        trip={createTrip()}
        adapterFactory={() => adapter}
        clock={() => "2040-06-12T00:30:00Z"}
      />,
    );

    await waitFor(() => expect(adapter.fitCalls).toHaveLength(1));
    const renderCount = adapter.renderCalls.length;
    fireEvent.click(screen.getByRole("button", { name: /^約 12:00 Dinner A$/ }));

    const dinnerTarget = {
      kind: "place" as const,
      id: nodeMapOwnerId("dinner"),
    };
    expect(adapter.focusCalls).toEqual([dinnerTarget]);
    await waitFor(() => expect(adapter.renderCalls.length).toBeGreaterThan(renderCount));
    expect(adapter.focusCalls).toEqual([dinnerTarget]);
  });

  it("honors only the latest exact focus when the adapter becomes ready late", async () => {
    const adapter = new DelayedOwnerAwareMapAdapter();
    render(
      <TripExperience
        trip={createTrip()}
        adapterFactory={() => adapter}
        clock={() => "2040-06-12T00:30:00Z"}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Park day/ }));
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Return to the current itinerary item",
      })[0],
    );
    fireEvent.click(screen.getByRole("button", { name: "Return to lodging" }));
    expect(adapter.focusCalls).toHaveLength(0);

    await act(async () => {
      adapter.resolveMount();
      await Promise.resolve();
    });

    const hotelTarget = {
      kind: "place" as const,
      id: nodeMapOwnerId("hotel"),
    };
    await waitFor(() => expect(adapter.focusCalls).toEqual([hotelTarget]));
    expect(adapter.fitCalls).toEqual([
      [
        nodeMapOwnerId("hotel"),
        nodeMapOwnerId("museum"),
        nodeMapOwnerId("dinner"),
      ],
    ]);
    expect(adapter.cameraEvents.at(-1)).toEqual({
      kind: "focus",
      target: hotelTarget,
    });
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

  it("ticks Tokyo time at the minute boundary while automatic selection advances", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2040-06-12T01:59:30Z"));
    const adapter = new FakeMapAdapter();
    const { unmount } = render(
      <TripExperience trip={createTrip()} adapterFactory={() => adapter} />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("itinerary-map")).toHaveAttribute(
      "data-map-status",
      "ready",
    );
    expect(adapter.fitCalls).toHaveLength(1);

    const museum = screen.getByRole("button", { name: /^09:00 Museum$/ });
    const hotel = screen.getByRole("button", { name: /^時間未定 Harbor Hotel$/ });
    const dinner = screen.getByRole("button", { name: /^約 12:00 Dinner A$/ });
    expect(screen.getByLabelText("Asia/Tokyo time")).toHaveTextContent("10:59");
    expect(museum).toHaveAttribute("data-selection-source", "automatic");

    fireEvent.click(hotel);
    expect(hotel).toHaveAttribute("data-selection-source", "manual");

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(screen.getByLabelText("Asia/Tokyo time")).toHaveTextContent("11:00");
    expect(hotel).toHaveAttribute("aria-pressed", "true");
    expect(hotel).toHaveAttribute("data-selection-source", "manual");
    expect(adapter.fitCalls).toHaveLength(1);

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Return to the current itinerary item",
      })[0],
    );
    expect(dinner).toHaveAttribute("aria-pressed", "true");
    expect(dinner).toHaveAttribute("data-selection-source", "automatic");
    expect(adapter.fitCalls).toHaveLength(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps an explicitly displayed empty day open and resolves lodging from that day first", async () => {
    const trip = createTrip();
    trip.days[1].nodes.push({
      id: "park-hotel",
      dayId: "day-two",
      kind: "lodging",
      title: "Park Hotel",
      timing: { certainty: "unknown" },
      optionality: "core",
      place: {
        name: "Park Hotel",
        coordinates: { lat: 35.701, lng: 139.781 },
        certainty: "confirmed",
      },
      payload: { role: "base" },
    });
    trip.days.push({
      id: "day-empty",
      date: "2040-06-14",
      title: "Empty pause",
      nodes: [],
    });
    trip.endDate = "2040-06-14";
    const adapter = new FakeMapAdapter();
    render(
      <TripExperience
        trip={trip}
        adapterFactory={() => adapter}
        clock={() => "2040-06-12T00:30:00Z"}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Empty pause/ }));
    const sheet = screen.getByRole("region", { name: "Itinerary" });
    expect(within(sheet).getByText("Empty pause")).toBeVisible();
    expect(within(sheet).getByText("0 stops")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^09:00 Museum$/ })).not.toBeInTheDocument();
    await waitFor(() => expect(adapter.renderCalls.at(-1)?.places).toEqual([]));

    fireEvent.click(screen.getByRole("button", { name: "Return to lodging" }));
    expect(adapter.focusCalls.at(-1)).toEqual({
      kind: "place",
      id: nodeMapOwnerId("park-hotel"),
    });
    expect(screen.getByRole("button", { name: /Park day/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("prefers lodging owned by the displayed day", async () => {
    const trip = createTrip();
    trip.days[1].nodes.push({
      id: "park-hotel",
      dayId: "day-two",
      kind: "lodging",
      title: "Park Hotel",
      timing: { certainty: "unknown" },
      optionality: "core",
      place: {
        name: "Park Hotel",
        coordinates: { lat: 35.701, lng: 139.781 },
        certainty: "confirmed",
      },
      payload: { role: "return" },
    });
    const adapter = new FakeMapAdapter();
    render(
      <TripExperience
        trip={trip}
        adapterFactory={() => adapter}
        clock={() => "2040-06-12T00:30:00Z"}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Park day/ }));
    fireEvent.click(screen.getByRole("button", { name: "Return to lodging" }));
    await waitFor(() =>
      expect(adapter.focusCalls.at(-1)).toEqual({
        kind: "place",
        id: nodeMapOwnerId("park-hotel"),
      }),
    );
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

  it("subtracts a 34px bottom safe-area inset exactly once from the sheet ceiling", async () => {
    const originalGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudoElement) => {
      const computed = originalGetComputedStyle(element, pseudoElement);
      if (element.classList.contains("safe-area-probe")) {
        return {
          ...computed,
          paddingTop: "0px",
          paddingBottom: "34px",
        };
      }
      return computed;
    });

    render(
      <TripExperience
        trip={createTrip()}
        adapterFactory={() => new FakeMapAdapter()}
        clock={() => "2040-06-12T00:30:00Z"}
      />,
    );

    const root = screen.getByTestId("trip-experience");
    const sheet = screen.getByRole("region", { name: "Itinerary" });
    await waitFor(() =>
      expect(root.style.getPropertyValue("--safe-area-bottom")).toBe("34px"),
    );
    expect(root.style.getPropertyValue("--sheet-ceiling")).toBe("318px");
    expect(root.style.getPropertyValue("--map-padding-bottom")).toBe("219px");
    expect(sheet).toHaveStyle({ maxHeight: "318px" });
  });

  it("declares edge-to-edge safe-area support in the starter viewport contract", () => {
    const document = new DOMParser().parseFromString(indexHtml, "text/html");
    const viewport = document.querySelector('meta[name="viewport"]');
    const directives = new Set(
      (viewport?.getAttribute("content") ?? "")
        .split(",")
        .map((directive) => directive.trim()),
    );

    expect(directives).toContain("width=device-width");
    expect(directives).toContain("initial-scale=1.0");
    expect(directives).toContain("viewport-fit=cover");
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
    expect(adapter.fitCalls).toHaveLength(1);
    act(() => {
      success?.({
        coords: {
          latitude: 35.682,
          longitude: 139.768,
          accuracy: 4,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: 2,
        toJSON: () => ({}),
      });
    });
    await waitFor(() => expect(adapter.userLocationCalls).toHaveLength(2));
    expect(adapter.fitCalls).toHaveLength(1);
    expect(storageWrite).not.toHaveBeenCalled();
    expect(JSON.stringify(trip)).toBe(tripBefore);
  });

  it("loads current-day routes and gives list and map one independent route owner", async () => {
    const mapAdapter = new FakeMapAdapter();
    const routeAdapter = new FakeRouteAdapter({
      "route-museum-dinner": {
        status: "ready",
        durationMinutes: 14,
        path: [
          { lat: 35.69, lng: 139.77 },
          { lat: 35.7, lng: 139.78 },
        ],
        steps: ["Board synthetic line", "Exit at dinner"],
      },
    });
    const routeAdapterFactory = vi.fn(() => routeAdapter);
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const user = userEvent.setup();

    render(
      <TripExperience
        trip={createTrip()}
        adapterFactory={() => mapAdapter}
        routeAdapterFactory={routeAdapterFactory}
        clock={() => "2040-06-12T00:30:00Z"}
      />,
    );

    const routeControl = await screen.findByRole("button", {
      name: "transit · 14 min",
    });
    expect(routeAdapterFactory).toHaveBeenCalledTimes(1);
    expect(routeAdapter.loadCalls.map(({ edge }) => edge.id)).toEqual([
      "route-museum-dinner",
    ]);
    await waitFor(() =>
      expect(mapAdapter.renderCalls.at(-1)?.routes).toEqual([
        expect.objectContaining({ edgeId: "route-museum-dinner" }),
      ]),
    );

    const focusCountBeforeListSelection = mapAdapter.focusCalls.length;
    await user.click(routeControl);
    expect(mapAdapter.focusCalls).toHaveLength(focusCountBeforeListSelection + 1);
    expect(mapAdapter.focusCalls.at(-1)).toEqual({
      kind: "route",
      id: "route-museum-dinner",
    });
    expect(routeControl).toHaveAttribute("aria-pressed", "true");
    expect(routeControl).toHaveAttribute("data-selected", "true");
    await waitFor(() =>
      expect(mapAdapter.renderCalls.at(-1)?.selectedRouteId).toBe(
        "route-museum-dinner",
      ),
    );

    screen.getByRole("button", { name: /Park day/ }).focus();
    const focusCountBeforeMapSelection = mapAdapter.focusCalls.length;
    act(() => mapAdapter.emitRouteSelect("route-museum-dinner"));
    await waitFor(() => expect(routeControl).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(routeControl).toHaveAttribute("aria-pressed", "true");
    expect(routeControl).toHaveAttribute("data-selected", "true");
    expect(mapAdapter.focusCalls).toHaveLength(focusCountBeforeMapSelection);

    const scrollCountAfterFirstMapSelection = scrollIntoView.mock.calls.length;
    screen.getByRole("button", { name: /Park day/ }).focus();
    act(() => mapAdapter.emitRouteSelect("route-museum-dinner"));
    await waitFor(() => expect(routeControl).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledTimes(scrollCountAfterFirstMapSelection + 1);
    expect(mapAdapter.focusCalls).toHaveLength(focusCountBeforeMapSelection);
  });
});
