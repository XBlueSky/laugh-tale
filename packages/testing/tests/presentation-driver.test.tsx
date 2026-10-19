import { act } from "react";
import {
  createMemoryTripNavigationStore,
  type Trip,
} from "@laugh-tale-island/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HomeViewProps,
  TripActions,
  TripPresentationV2,
} from "@laugh-tale-island/react";

import { alternateTestPresentation } from "../src/alternate-presentation.js";
import { FakeMapAdapterV2 } from "../src/fakes/FakeMapAdapterV2.js";
import { FakeNavigationAdapterV2 } from "../src/fakes/FakeNavigationAdapterV2.js";
import { FakeProgressStore } from "../src/fakes/FakeProgressStore.js";
import { syntheticTripV2 } from "../src/fixtures/synthetic-trip-v2.js";
import {
  createPresentationDriver,
  renderTripContract as renderContract,
  type PresentationDriver,
} from "../src/presentation-driver.js";

const drivers: PresentationDriver[] = [];
let geolocationDescriptor: PropertyDescriptor | undefined;
function renderTripContract(input: Parameters<typeof renderContract>[0]) {
  const driver = renderContract(input);
  drivers.push(driver);
  return driver;
}

function groupedFixture(): Trip {
  const day = syntheticTripV2.days[0];
  const logisticsIndex = day.nodes.findIndex(
    (node) => node.id === "node-logistics",
  );
  const logistics = day.nodes[logisticsIndex];
  if (logistics?.kind !== "logistics")
    throw new Error("Synthetic test fixture logistics node is missing");
  const nodes = day.nodes.map((node) =>
    node.kind === "lodging"
      ? { ...node, payload: { ...node.payload, role: "base" as const } }
      : node,
  );
  return {
    ...syntheticTripV2,
    days: [
      {
        ...day,
        nodes: [
          ...nodes.slice(0, logisticsIndex + 1),
          {
            ...logistics,
            id: "node-logistics-secondary",
            title: "Secondary synthetic logistics check",
            timing: { ...logistics.timing, start: "17:05" },
            optionality: "optional",
            payload: {
              checklist: [
                {
                  id: "check-logistics-secondary",
                  title: "Record the secondary neutral parcel",
                },
              ],
            },
          },
          ...nodes.slice(logisticsIndex + 1),
        ],
      },
    ],
  };
}

beforeEach(() => {
  geolocationDescriptor = Object.getOwnPropertyDescriptor(navigator, "geolocation");
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  const errors: unknown[] = [];
  try {
    for (const driver of drivers.splice(0)) {
      try { driver.dispose(); } catch (error) { errors.push(error); }
    }
  } finally {
    if (geolocationDescriptor === undefined) Reflect.deleteProperty(navigator, "geolocation");
    else Object.defineProperty(navigator, "geolocation", geolocationDescriptor);
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    document.body.replaceChildren();
  }
  if (errors.length > 0) throw new AggregateError(errors, "Presentation driver cleanup failed");
});

describe("public presentation driver with the alternate test fixture", () => {
  it("drags from the rendered sheet height and settles interrupted capture", async () => {
    const driver = renderTripContract({ trip: groupedFixture(), presentation: alternateTestPresentation, progressStore: new FakeProgressStore(), navigationStore: createMemoryTripNavigationStore({ surface: "experience", dayId: "day-synthetic", ownerId: null }), clock: () => "2042-03-04T08:10:00.000Z" });
    await driver.settle();
    const sheet = driver.get("sheet");
    const handle = sheet.querySelector<HTMLElement>("[aria-keyshortcuts]");
    if (handle === null) throw new Error("Missing bound drag handle");
    vi.spyOn(sheet, "getBoundingClientRect").mockReturnValue({ x: 0, y: 550, top: 550, left: 0, right: 400, bottom: 800, width: 400, height: 250, toJSON: () => ({}) });
    const pointer = (type: string, clientY: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, { pointerId: { value: 7 }, clientY: { value: clientY } });
      act(() => { handle.dispatchEvent(event); });
    };
    pointer("pointerdown", 550);
    expect(sheet.dataset.dragging).toBe("true");
    expect(sheet.style.height).toBe("250px");
    pointer("pointermove", 450);
    pointer("lostpointercapture", 450);
    expect(sheet.dataset.dragging).toBe("false");
    expect(driver.value("sheet")).toBe("expanded");
    pointer("pointerdown", 550);
    expect(sheet.style.height).toBe("250px");
    pointer("pointercancel", 550);
    expect(driver.value("sheet")).toBe("half");
  });

  it("moves actual focus to map-selected node, route and candidate option controls", async () => {
    const map = new FakeMapAdapterV2();
    const driver = renderTripContract({ trip: groupedFixture(), presentation: alternateTestPresentation, progressStore: new FakeProgressStore(), navigationStore: createMemoryTripNavigationStore({ surface: "experience", dayId: "day-synthetic", ownerId: null }), clock: () => "2042-03-04T08:10:00.000Z", runtime: { createMap: () => map } });
    await driver.settle();
    act(() => { map.emitMarkerSelect("node-sightseeing"); });
    await driver.settle();
    expect(document.activeElement).toBe(driver.get("timeline-node", "node-sightseeing").querySelector('[data-contract-action="select-owner"]'));
    act(() => { map.emitRouteSelect("route-walking"); });
    await driver.settle();
    expect(document.activeElement).toBe(driver.get("timeline-route", "route-walking").querySelector('[data-contract-action="select-route"]'));
    driver.activate("reopen-candidate", "candidate-meal");
    act(() => { map.emitMarkerSelect("candidate-meal-b"); });
    await driver.settle();
    expect(document.activeElement).toBe(driver.get("candidate-option", "candidate-meal-b").querySelector('[data-contract-action="preview-candidate"]'));
  });
  it("omits day, route, and sheet actions withheld by capabilities", async () => {
    let homeActions: TripActions | undefined;
    let experienceActions: TripActions | undefined;
    let withholdSheetInteraction = true;
    const Home = alternateTestPresentation.Home;
    const Experience = alternateTestPresentation.Experience;
    const restrictedPresentation: TripPresentationV2 = {
      ...alternateTestPresentation,
      Home(props: HomeViewProps) {
        homeActions = props.actions;
        return (
          <Home
            {...props}
            model={{
              ...props.model,
              capabilities: {
                ...props.model.capabilities,
                openExperienceDayIds: [],
              },
            }}
          />
        );
      },
      Experience(props) {
        experienceActions = props.actions;
        return (
          <Experience
            {...props}
            model={{
              ...props.model,
              sheet: {
                ...props.model.sheet,
                interactive: withholdSheetInteraction
                  ? false
                  : props.model.sheet.interactive,
              },
              capabilities: {
                ...props.model.capabilities,
                selectRouteIds: [],
                sheetSnaps: withholdSheetInteraction
                  ? props.model.capabilities.sheetSnaps
                  : [props.model.sheet.snap],
              },
            }}
          />
        );
      },
    };
    const driver = renderTripContract({
      trip: groupedFixture(),
      presentation: restrictedPresentation,
      navigationStore: createMemoryTripNavigationStore(),
      progressStore: new FakeProgressStore(),
      clock: () => "2042-03-04T08:10:00.000Z",
      runtime: { createMap: () => new FakeMapAdapterV2() },
    });

    await driver.settle();
    expect(driver.ownerIds("day-choice")).toEqual([]);
    act(() => homeActions?.openExperience("day-synthetic"));
    await driver.settle();
    expect(driver.ownerIds("timeline-route")).toContain("route-walking");
    expect(() => driver.activate("select-route", "route-walking")).toThrow(
      "No test fixture contract action select-route for owner route-walking",
    );
    expect(() => driver.activate("step-sheet-expand")).toThrow(
      "No test fixture contract action step-sheet-expand",
    );
    expect(() => driver.activate("step-sheet-collapse")).toThrow(
      "No test fixture contract action step-sheet-collapse",
    );
    expect(
      driver
        .get("sheet")
        .querySelector("[aria-keyshortcuts]"),
    ).toBeNull();

    withholdSheetInteraction = false;
    act(() => experienceActions?.selectNode("node-sightseeing"));
    await driver.settle();
    expect(
      driver
        .get("sheet")
        .querySelector("[aria-keyshortcuts]"),
    ).toBeNull();
    expect(() => driver.activate("step-sheet-expand")).toThrow(
      "No test fixture contract action step-sheet-expand",
    );
    expect(() => driver.activate("step-sheet-collapse")).toThrow(
      "No test fixture contract action step-sheet-collapse",
    );
    driver.dispose();
  });

  it("requires an adjacent advertised snap for each sheet step", async () => {
    let experienceActions: TripActions | undefined;
    let projection: "sparse" | "adjacent" = "sparse";
    const Experience = alternateTestPresentation.Experience;
    const restrictedPresentation: TripPresentationV2 = {
      ...alternateTestPresentation,
      Experience(props) {
        experienceActions = props.actions;
        return (
          <Experience
            {...props}
            model={{
              ...props.model,
              sheet:
                projection === "sparse"
                  ? {
                      ...props.model.sheet,
                      snap: "collapsed",
                      interactive: true,
                    }
                  : props.model.sheet,
              capabilities: {
                ...props.model.capabilities,
                sheetSnaps:
                  projection === "sparse"
                    ? ["collapsed", "expanded"]
                    : ["half", "expanded"],
              },
            }}
          />
        );
      },
    };
    const driver = renderTripContract({
      trip: groupedFixture(),
      presentation: restrictedPresentation,
      navigationStore: createMemoryTripNavigationStore(),
      progressStore: new FakeProgressStore(),
      clock: () => "2042-03-04T08:10:00.000Z",
      runtime: { createMap: () => new FakeMapAdapterV2() },
    });

    await driver.settle();
    driver.activate("open-day", "day-synthetic");
    await driver.settle();
    expect(driver.value("sheet")).toBe("collapsed");
    expect(() => driver.activate("step-sheet-expand")).toThrow(
      "No test fixture contract action step-sheet-expand",
    );
    expect(
      driver
        .get("sheet")
        .querySelector("[aria-keyshortcuts]"),
    ).toBeNull();

    projection = "adjacent";
    act(() => experienceActions?.selectNode("node-sightseeing"));
    await driver.settle();
    expect(driver.value("sheet")).toBe("half");
    expect(
      driver
        .get("sheet")
        .querySelector("[aria-keyshortcuts]"),
    ).toBeNull();
    expect(() => driver.activate("step-sheet-collapse")).toThrow(
      "No test fixture contract action step-sheet-collapse",
    );
    driver.activate("step-sheet-expand");
    expect(driver.value("sheet")).toBe("expanded");
    driver.dispose();
  });

  it("drives the complete semantic seam without Oak composition or provider internals", async () => {
    let locationSuccess: PositionCallback | undefined;
    const clearWatch = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition(callback: PositionCallback) {
          locationSuccess = callback;
          return 41;
        },
        clearWatch,
      },
    });

    const maps: FakeMapAdapterV2[] = [];
    const navigation = new FakeNavigationAdapterV2(true, ["synthetic"]);
    const detached = createPresentationDriver(document.createElement("div"));
    drivers.push(detached);
    expect(detached.query("home")).toBeNull();

    const driver = renderTripContract({
      trip: groupedFixture(),
      presentation: alternateTestPresentation,
      navigationStore: createMemoryTripNavigationStore(),
      progressStore: new FakeProgressStore(),
      clock: () => "2042-03-04T08:10:00.000Z",
      runtime: {
        createMap() {
          const adapter = new FakeMapAdapterV2();
          maps.push(adapter);
          return adapter;
        },
        navigation,
      },
    });

    await driver.settle();
    expect(driver.ownerIds("day-choice")).toEqual(["day-synthetic"]);
    expect(driver.all("map")).toHaveLength(0);

    driver.activate("open-day", "day-synthetic");
    await driver.settle();

    const itinerary = driver.get("itinerary");
    const map = driver.get("map");
    expect(
      itinerary.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(driver.ownerIds("logistics-child")).toEqual([
      "node-logistics",
      "node-logistics-secondary",
    ]);

    driver.activate("select-owner", "node-logistics-secondary");
    expect(
      driver.states("logistics-child", "node-logistics-secondary"),
    ).toContain("selected");
    driver.activate("select-owner", "node-sightseeing");
    driver.activate("open-navigation", "node-sightseeing");
    expect(navigation.calls).toHaveLength(1);
    expect(navigation.calls[0]).toMatchObject({ kind: "place" });

    driver.activate("update-completion", "node:node-transport");
    driver.activate("restore-automatic");
    expect(driver.selectedOwnerId()).toBe("node-transfer");
    driver.activate("return-current");
    expect(driver.selectedOwnerId()).toBe("node-transport");
    driver.activate("return-lodging");
    expect(driver.selectedOwnerId()).toBe("node-lodging");

    expect(driver.value("sheet")).toBe("half");
    expect(
      driver
        .get("sheet")
        .querySelector("[aria-keyshortcuts]"),
    ).not.toBeNull();
    driver.activate("step-sheet-expand");
    expect(driver.value("sheet")).toBe("expanded");
    driver.activate("step-sheet-collapse");
    expect(driver.value("sheet")).toBe("half");

    driver.activate("reopen-candidate", "candidate-meal");
    driver.activate("preview-candidate", "candidate-meal-b");
    driver.activate("confirm-candidate", "candidate-meal");
    expect(driver.value("candidate-option", "candidate-meal-b")).toBe(
      "selected",
    );

    driver.activate("update-skipped", "node-logistics-secondary");
    driver.activate("update-shopping", "shopping-journal");
    expect(driver.value("progress-skipped", "node-logistics-secondary")).toBe(
      "true",
    );
    expect(driver.value("progress-shopping", "shopping-journal")).toBe(
      "purchased",
    );

    expect(maps).toHaveLength(1);
    expect(maps[0]?.mountCalls).toHaveLength(1);
    act(() => {
      maps[0]?.emitUnavailable({
        status: "unavailable",
        reason: "network",
        retryable: true,
      });
    });
    driver.activate("retry-map");
    await driver.settle();
    expect(maps).toHaveLength(2);
    expect(maps[0]?.destroyCount).toBe(1);
    expect(maps[1]?.mountCalls).toHaveLength(1);

    const markerIndex = maps[1]?.markerFactoryCalls.findIndex(
      ({ ownerId }) => ownerId === "node-sightseeing",
    );
    expect(markerIndex).toBeGreaterThanOrEqual(0);
    const marker = maps[1]?.markerElements[markerIndex ?? -1];
    expect(marker?.dataset.testFixtureShape).toBe("rectangle");
    expect(marker?.textContent).toContain("Test fixture itinerary marker");
    const markerRevision = Number(marker?.dataset.testFixtureRevision);
    driver.activate("select-owner", "node-experience");
    expect(Number(marker?.dataset.testFixtureRevision)).toBeGreaterThan(
      markerRevision,
    );

    driver.activate("begin-location");
    act(() => {
      locationSuccess?.({
        coords: { latitude: 35.5, longitude: 139.5 },
      } as GeolocationPosition);
    });
    await driver.settle();
    const location = maps[1]?.userLocationElements[0];
    expect(location?.dataset.testFixtureShape).toBe("crosshair");
    expect(location?.textContent).toContain("Test fixture user crosshair");
    const locationRevision = Number(location?.dataset.testFixtureRevision);
    act(() => {
      locationSuccess?.({
        coords: { latitude: 35.6, longitude: 139.6 },
      } as GeolocationPosition);
    });
    expect(Number(location?.dataset.testFixtureRevision)).toBeGreaterThan(
      locationRevision,
    );
    driver.activate("stop-location");
    expect(maps[1]?.userLocationDisposalCount).toBe(1);
    expect(clearWatch).toHaveBeenCalledExactlyOnceWith(41);

    const createdMarkers = maps[1]?.markerFactoryCalls.length ?? 0;
    driver.dispose();
    expect(maps[1]?.markerDisposalCount).toBe(createdMarkers);
    expect(maps[1]?.destroyCount).toBe(1);
  });
});
