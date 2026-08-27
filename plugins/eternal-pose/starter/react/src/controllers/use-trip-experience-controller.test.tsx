import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useLayoutEffect, useState, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  candidateMapOwnerId,
  decodeMapPlaceOwnerId,
  nodeMapOwnerId,
  USER_LOCATION_OWNER_ID,
  type CandidateOption,
  type Trip,
} from "@laugh-tale-island/core";
import type {
  MapAdapter,
  MapEvents,
  NavigationAdapter,
  RouteAdapter,
} from "@laugh-tale-island/core/browser";

import { FakeMapAdapter } from "../providers/fake/FakeMapAdapter";
import { FakeRouteAdapter } from "../providers/fake/FakeRouteAdapter";
import type {
  ExperienceViewProps,
  MapVisualProfile,
  PresentationGeometry,
} from "./presentation-contract";
import {
  useTripExperienceController,
  type UseTripExperienceControllerInput,
} from "./use-trip-experience-controller";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const geometry: PresentationGeometry = {
  header: { expanded: 148, collapsed: 72 },
  sheet: { collapsed: 128, minGap: 24 },
  desktopBreakpoint: 768,
};

function candidateTitle(
  sequenceNumber: number,
  index: number,
  option: CandidateOption,
): string {
  return `${sequenceNumber}${String.fromCharCode(65 + index)} · ${option.title}`;
}

const mapProfile: MapVisualProfile = {
  id: "controller-test",
  basemap: {
    mode: "neutral",
    density: "low",
    contrast: "soft",
    poi: "minimal",
  },
  candidateTitle,
  marker: (place, index) => ({
    title: place.label,
    className: `marker-${index}`,
    label: place.label,
    parts: [{ className: "marker-label", text: place.label }],
    fallback: { fill: "#fff", stroke: "#000", text: String(index + 1) },
  }),
  userLocation: () => ({
    title: "location",
    className: "location",
    label: "location",
    parts: [],
    fallback: { fill: "#000", stroke: "#fff", text: "" },
  }),
  route: () => ({ stroke: "#000", opacity: 1, width: 2 }),
};

function createTrip(): Trip {
  return {
    id: "controller-trip",
    title: "Synthetic trip",
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
        navigation: {
          origin: "  Synthetic museum entrance ",
          destination: "\tSynthetic dinner hall  ",
        },
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
          {
            id: "dinner-b",
            title: "Dinner B",
            place: {
              name: "Dinner B",
              coordinates: { lat: 35.72, lng: 139.8 },
              certainty: "candidate",
            },
          },
        ],
      },
    ],
    reservations: [],
    tasks: [
      {
        id: "day-task",
        title: "Day task",
        scope: "day",
        dayId: "day-one",
      },
    ],
  };
}

class RetriableMapAdapter extends FakeMapAdapter {
  private attempts = 0;

  override mount(element: HTMLElement, events: MapEvents): Promise<void> {
    this.attempts += 1;
    void super.mount(element, events);
    return this.attempts === 1
      ? Promise.reject(new Error("synthetic map failure"))
      : Promise.resolve();
  }
}

type ControllerInput = Omit<
  UseTripExperienceControllerInput,
  "trip" | "adapterFactory" | "presentation" | "clock"
> & {
  trip?: Trip;
  adapter?: MapAdapter;
  presentation?: UseTripExperienceControllerInput["presentation"];
};

interface ControllerHarnessProps {
  input: ControllerInput;
  onValue: (value: ExperienceViewProps) => void;
  nodeOwnerId?: string;
  routeOwnerId?: string;
}

function mapRefFor(controller: ExperienceViewProps) {
  return controller.bindings.map.ref;
}

function nodeRefFor(controller: ExperienceViewProps, nodeId: string) {
  return controller.bindings.owners.nodeRef(nodeId);
}

function routeRefFor(controller: ExperienceViewProps, routeId: string) {
  return controller.bindings.owners.routeRef(routeId);
}

function ControllerHarness({
  input,
  onValue,
  nodeOwnerId,
  routeOwnerId,
}: ControllerHarnessProps): ReactElement {
  const [defaultTrip] = useState(createTrip);
  const controller = useTripExperienceController({
    ...input,
    trip: input.trip ?? defaultTrip,
    adapterFactory: () => input.adapter ?? new FakeMapAdapter(),
    presentation: input.presentation ?? { geometry, mapProfile },
    clock: () => "2040-06-12T00:30:00Z",
  });
  useLayoutEffect(() => onValue(controller), [controller, onValue]);

  return (
    <>
      <div ref={mapRefFor(controller)} />
      {nodeOwnerId === undefined ? null : (
        <button ref={nodeRefFor(controller, nodeOwnerId)}>
          node owner
        </button>
      )}
      {routeOwnerId === undefined ? null : (
        <button ref={routeRefFor(controller, routeOwnerId)}>
          route owner
        </button>
      )}
    </>
  );
}

function setup(
  input: ControllerInput = {},
  owners: { nodeOwnerId?: string; routeOwnerId?: string } = {},
) {
  let current: ExperienceViewProps | undefined;
  const onValue = (value: ExperienceViewProps): void => {
    current = value;
  };
  const view = render(
    <ControllerHarness input={input} onValue={onValue} {...owners} />,
  );
  return {
    ...view,
    current: (): ExperienceViewProps => {
      if (current === undefined) throw new Error("controller did not render");
      return current;
    },
    rerenderInput(next: ControllerInput): void {
      view.rerender(
        <ControllerHarness input={next} onValue={onValue} {...owners} />,
      );
    },
    rerenderOwners(nextOwners: {
      nodeOwnerId?: string;
      routeOwnerId?: string;
    }): void {
      view.rerender(
        <ControllerHarness input={input} onValue={onValue} {...nextOwners} />,
      );
    },
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

describe("useTripExperienceController", () => {
  beforeEach(() => {
    installMatchMedia(false);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 500 });
  });

  it("derives the authoritative day, live state, route navigation, and stable contract groups", async () => {
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
    const navigationAdapter: NavigationAdapter = {
      directions: ({ origin, destination, travelMode }) =>
        `https://example.test/${origin}/${destination}/${travelMode}`,
    };
    const view = setup({ trip, navigationAdapter });

    await waitFor(() => expect(view.current().model.map.status).toBe("ready"));
    expect(Object.keys(view.current()).sort()).toEqual(["actions", "bindings", "model"]);
    expect(view.current().model.effectiveDay.day.id).toBe("day-one");
    expect(view.current().model.live).toEqual({
      currentNodeId: "museum",
      nextNodeId: "dinner",
    });
    expect(view.current().model.selection).toEqual({
      nodeId: "museum",
      source: "automatic",
    });
    expect(view.current().model.routes[0]?.navigationHref).toBe(
      "https://example.test/Synthetic museum entrance/Synthetic dinner hall/transit",
    );
    expect(view.current().model.header).toEqual({ expanded: true });
  });

  it("keeps one map mounted while list/map selection and day changes stay bidirectional", async () => {
    const adapter = new FakeMapAdapter();
    const view = setup({ adapter }, { nodeOwnerId: "museum" });
    await waitFor(() => expect(adapter.mountCalls).toHaveLength(1));
    await waitFor(() => expect(adapter.fitCalls).toHaveLength(1));

    act(() => adapter.emitPlaceSelect(nodeMapOwnerId("museum")));
    expect(view.current().model.selection.nodeId).toBe("museum");
    expect(document.activeElement).toHaveTextContent("node owner");

    act(() => view.current().actions.selectNode("dinner"));
    expect(view.current().model.selection).toEqual({
      nodeId: "dinner",
      source: "manual",
    });
    expect(adapter.focusCalls.at(-1)).toEqual({
      kind: "place",
      id: nodeMapOwnerId("dinner"),
    });

    act(() => view.current().actions.selectDay("day-two"));
    await waitFor(() =>
      expect(view.current().model.effectiveDay.day.id).toBe("day-two"),
    );
    expect(adapter.renderCalls.at(-1)?.places.map(({ label }) => label)).toEqual([
      "Park",
    ]);
    expect(adapter.mountCalls).toHaveLength(1);
    expect(adapter.destroyCalls).toBe(0);
  });

  it("keeps route ownership independent, restores map-originated focus, and retries failures", async () => {
    let loads = 0;
    const routeAdapter = new FakeRouteAdapter(() => {
      loads += 1;
      return loads === 1
        ? { status: "unavailable" as const, reason: "synthetic unavailable" }
        : {
            status: "ready" as const,
            durationMinutes: 14,
            path: [
              { lat: 35.69, lng: 139.77 },
              { lat: 35.71, lng: 139.79 },
            ],
            steps: ["Board", "Exit"],
          };
    });
    const adapter = new FakeMapAdapter();
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const view = setup(
      { adapter, routeAdapterFactory: () => routeAdapter },
      { routeOwnerId: "route-museum-dinner" },
    );
    await waitFor(() =>
      expect(view.current().model.routes[0]?.loadState?.status).toBe("unavailable"),
    );

    act(() => view.current().actions.retryRoute("route-museum-dinner"));
    await waitFor(() =>
      expect(view.current().model.routes[0]?.loadState?.status).toBe("ready"),
    );
    act(() => view.current().actions.selectRoute("route-museum-dinner", "list"));
    expect(adapter.focusCalls.at(-1)).toEqual({
      kind: "route",
      id: "route-museum-dinner",
    });

    act(() => adapter.emitRouteSelect("route-museum-dinner"));
    expect(view.current().model.routes[0]).toMatchObject({
      selected: true,
      selectionSource: "map",
    });
    expect(document.activeElement).toHaveTextContent("route owner");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("preserves a blank semantic reason from a non-Error route rejection", async () => {
    const routeAdapter: RouteAdapter = {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the regression is specifically for non-Error provider failures.
      load: () => Promise.reject({ code: "synthetic-provider-failure" }),
    };
    const view = setup({ routeAdapterFactory: () => routeAdapter });

    await waitFor(() =>
      expect(view.current().model.routes[0]?.loadState).toEqual({
        status: "unavailable",
        reason: "",
      }),
    );
  });

  it("cancels deferred route focus when a day change invalidates its selection", async () => {
    const adapter = new FakeMapAdapter();
    const view = setup({ adapter });
    const unrelated = document.createElement("button");
    unrelated.textContent = "unrelated focus owner";
    document.body.append(unrelated);
    await waitFor(() => expect(view.current().model.map.status).toBe("ready"));

    act(() => adapter.emitRouteSelect("route-museum-dinner"));
    expect(view.current().model.routes[0]).toMatchObject({
      selected: true,
      selectionSource: "map",
    });
    unrelated.focus();
    act(() => view.current().actions.selectDay("day-two"));
    expect(view.current().model.routes).toHaveLength(0);

    view.rerenderOwners({ routeOwnerId: "route-museum-dinner" });
    expect(document.activeElement).toBe(unrelated);
    unrelated.remove();
  });

  it("owns optional candidate preview, decorated map labels, confirmation, and cleanup", async () => {
    const adapter = new FakeMapAdapter();
    const view = setup({ adapter });
    await waitFor(() => expect(view.current().model.map.status).toBe("ready"));
    act(() => view.current().actions.selectNode("dinner"));
    expect(view.current().model.candidate?.group.id).toBe("dinner-options");

    act(() => view.current().actions.openCandidate());
    expect(view.current().model.candidate).toMatchObject({
      open: true,
      draftOptionId: "dinner-a",
    });
    await waitFor(() =>
      expect(
        adapter.renderCalls.at(-1)?.places
          .filter(
            ({ ownerId }) =>
              decodeMapPlaceOwnerId(ownerId)?.kind === "candidate",
          )
          .map(({ label }) => label),
      ).toEqual(["3A · Dinner A", "3B · Dinner B"]),
    );

    act(() => adapter.emitPlaceSelect(candidateMapOwnerId("dinner-b")));
    expect(view.current().model.candidate?.draftOptionId).toBe("dinner-b");
    act(() => view.current().actions.confirmCandidate());
    expect(view.current().model.progress.selectedCandidateIds).toEqual({
      "dinner-options": "dinner-b",
    });
    expect(view.current().model.candidate?.open).toBe(false);

    act(() => view.current().actions.selectDay("day-two"));
    expect(view.current().model.candidate).toBeNull();
    expect(
      adapter.renderCalls.at(-1)?.places.some(({ ownerId }) =>
        decodeMapPlaceOwnerId(ownerId)?.kind === "candidate",
      ),
    ).toBe(false);
  });

  it("updates progress and preserves manual selection until return-to-now", async () => {
    const adapter = new FakeMapAdapter();
    const view = setup({ adapter });
    await waitFor(() => expect(view.current().model.map.status).toBe("ready"));

    act(() => view.current().actions.selectNode("hotel"));
    expect(view.current().model.selection.source).toBe("manual");
    act(() => view.current().actions.setCompleted("node:museum", true));
    expect(view.current().model.progress.completedIds).toContain("node:museum");
    expect(view.current().model.selection.nodeId).toBe("hotel");

    act(() => view.current().actions.returnToNow());
    expect(view.current().model.selection.source).toBe("automatic");
    expect(view.current().model.selection.nodeId).toBe("dinner");
  });

  it("derives safe-area sheet geometry and updates map padding for header/profile geometry changes without remounting", async () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      paddingTop: "0px",
      paddingBottom: "34px",
    } as CSSStyleDeclaration);
    const adapter = new FakeMapAdapter();
    const view = setup({ adapter });
    await waitFor(() => expect(view.current().model.viewport.safeBottom).toBe(34));
    expect(view.current().model.sheet.geometry.ceiling).toBe(318);

    act(() => view.current().actions.setHeaderExpanded(false));
    expect(view.current().model.header.expanded).toBe(false);
    expect(view.current().model.sheet.geometry.ceiling).toBe(394);
    await waitFor(() => expect(adapter.paddingCalls.at(-1)?.top).toBe(72));

    const changedGeometry = {
      ...geometry,
      header: { expanded: 120, collapsed: 60 },
      sheet: { collapsed: 110, minGap: 20 },
    };
    view.rerenderInput({
      adapter,
      presentation: { geometry: changedGeometry, mapProfile },
    });
    await waitFor(() => expect(adapter.paddingCalls.at(-1)?.top).toBe(60));
    expect(view.current().model.sheet.geometry.collapsed).toBe(110);
    expect(adapter.mountCalls).toHaveLength(1);
  });

  it("rejects negative or non-finite presentation geometry", () => {
    const invalid = {
      ...geometry,
      header: { expanded: Number.NaN, collapsed: -1 },
    };
    expect(() =>
      setup({ presentation: { geometry: invalid, mapProfile } }),
    ).toThrow(/presentation geometry/i);
  });

  it("reflects reduced motion and keeps all three sheet snaps controlled by semantic actions", () => {
    installMatchMedia(true);
    const view = setup();
    expect(view.current().model.motion).toBe("reduced");
    for (const snap of ["collapsed", "expanded", "half"] as const) {
      act(() => view.current().actions.setSheetSnap(snap));
      expect(view.current().model.sheet.snap).toBe(snap);
      expect(view.current().bindings.sheet.getSheetProps()).toHaveProperty(
        "data-snap",
        snap,
      );
    }
  });

  it("requests location only after an action and supports recenter and stop", async () => {
    let succeed: PositionCallback | undefined;
    const clearWatch = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: vi.fn((callback: PositionCallback) => {
          succeed = callback;
          return 41;
        }),
        clearWatch,
      },
    });
    const adapter = new FakeMapAdapter();
    const view = setup({ adapter });
    await waitFor(() => expect(view.current().model.map.status).toBe("ready"));
    expect(adapter.userLocationCalls).toHaveLength(0);
    expect(view.current().model.location.status).toBe("idle");

    act(() => view.current().actions.startLocation());
    expect(view.current().model.location.status).toBe("requesting");
    act(() =>
      succeed?.({
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
      }),
    );
    await waitFor(() =>
      expect(adapter.userLocationCalls.at(-1)).toEqual({
        lat: 35.6812,
        lng: 139.7671,
      }),
    );
    expect(view.current().model.location.status).toBe("active");
    expect(adapter.focusCalls.at(-1)).toEqual({
      kind: "place",
      id: USER_LOCATION_OWNER_ID,
    });

    act(() => view.current().actions.recenterLocation());
    expect(adapter.focusCalls.at(-1)).toEqual({
      kind: "place",
      id: USER_LOCATION_OWNER_ID,
    });
    act(() => view.current().actions.stopLocation());
    expect(view.current().model.location.status).toBe("idle");
    expect(adapter.userLocationCalls.at(-1)).toBeNull();
    expect(clearWatch).toHaveBeenCalledWith(41);
  });

  it("reports map failure and retries the same persistent adapter", async () => {
    const adapter = new RetriableMapAdapter();
    const view = setup({ adapter });
    await waitFor(() => expect(view.current().model.map.status).toBe("error"));
    act(() => view.current().actions.retryMap());
    await waitFor(() => expect(view.current().model.map.status).toBe("ready"));
    expect(adapter.mountCalls).toHaveLength(2);
  });
});
