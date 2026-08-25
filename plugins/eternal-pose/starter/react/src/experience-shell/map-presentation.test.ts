import { globSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { CandidateGroup, TripNode } from "../trip-core/model";
import type { EffectiveDay, EffectiveNode } from "../trip-core/resolve-itinerary";
import { FakeMapAdapter } from "../providers/fake/FakeMapAdapter";
import { createGoogleMapsUrl } from "../providers/google/google-maps-url";
import {
  buildMapPresentation,
  type MapPresentationContext,
} from "./map-presentation";

function placeNode(
  id: string,
  options: {
    title?: string;
    optionality?: TripNode["optionality"];
    coordinates?: { lat: number; lng: number };
  } = {},
): TripNode {
  return {
    id,
    dayId: "day-one",
    kind: "sightseeing",
    title: options.title ?? id,
    timing: { certainty: "suggested" },
    optionality: options.optionality ?? "core",
    ...(options.coordinates === undefined
      ? {}
      : {
          place: {
            name: options.title ?? id,
            coordinates: options.coordinates,
            certainty: "confirmed" as const,
          },
        }),
    payload: {},
  };
}

function effective(node: TripNode, options: Partial<EffectiveNode> = {}): EffectiveNode {
  return {
    node,
    sourceNodeId: node.id,
    completed: false,
    ...options,
  };
}

const candidateGroup: CandidateGroup = {
  id: "dinner-group",
  parentNodeId: "dinner",
  mode: "single",
  options: [
    {
      id: "dinner-a",
      title: "Dinner A",
      place: {
        name: "Dinner A",
        coordinates: { lat: 25.04, lng: 121.52 },
        certainty: "candidate",
      },
    },
    {
      id: "dinner-b",
      title: "Dinner B",
      place: {
        name: "Dinner B",
        coordinates: { lat: 25.05, lng: 121.53 },
        certainty: "candidate",
      },
    },
    { id: "dinner-unresolved", title: "Dinner Unresolved" },
  ],
};

function fixtureDay(): EffectiveDay {
  const museum = placeNode("museum", {
    title: "Museum",
    coordinates: { lat: 25.01, lng: 121.51 },
  });
  const garden = placeNode("garden", {
    title: "Garden",
    optionality: "optional",
    coordinates: { lat: 25.02, lng: 121.5 },
  });
  const completed = placeNode("hotel", {
    title: "Hotel",
    coordinates: { lat: 25.03, lng: 121.49 },
  });
  const dinnerSource: TripNode = {
    id: "dinner",
    dayId: "day-one",
    kind: "dining",
    title: "Choose dinner",
    timing: { certainty: "suggested" },
    optionality: "candidate",
    payload: { candidateGroupId: "dinner-group" },
  };
  const dinnerResolved: TripNode = {
    ...dinnerSource,
    title: "Dinner A",
    place: candidateGroup.options[0]?.place,
  };
  const unresolved = placeNode("unresolved", { title: "Unresolved" });

  return {
    day: {
      id: "day-one",
      date: "2040-01-01",
      title: "Day one",
      nodes: [museum, garden, completed, dinnerSource, unresolved],
    },
    nodes: [
      effective(museum),
      effective(garden),
      effective(completed, { completed: true }),
      effective(dinnerResolved, { sourceNodeId: "dinner", selectedCandidateId: "dinner-a" }),
      effective(unresolved),
    ],
  };
}

describe("buildMapPresentation", () => {
  it("keeps every locatable effective node and only the resolved candidate when collapsed", () => {
    const presentation = buildMapPresentation(fixtureDay(), {});

    expect(presentation.places).toEqual([
      {
        ownerId: "museum",
        label: "Museum",
        coordinates: { lat: 25.01, lng: 121.51 },
        tone: "default",
      },
      {
        ownerId: "garden",
        label: "Garden",
        coordinates: { lat: 25.02, lng: 121.5 },
        tone: "default",
      },
      {
        ownerId: "hotel",
        label: "Hotel",
        coordinates: { lat: 25.03, lng: 121.49 },
        tone: "completed",
      },
      {
        ownerId: "dinner",
        label: "Dinner A",
        coordinates: { lat: 25.04, lng: 121.52 },
        tone: "default",
      },
    ]);
    expect(presentation.places.some(({ ownerId }) => ownerId === "dinner-b")).toBe(false);
    expect(presentation.places.filter(({ tone }) => tone === "candidate")).toHaveLength(0);
  });

  it("replaces the expanded parent with every locatable option and selects only the active draft", () => {
    const context: MapPresentationContext = {
      expandedCandidateGroup: candidateGroup,
      activeCandidateOptionId: "dinner-b",
      selectedNodeId: "dinner",
    };

    const presentation = buildMapPresentation(fixtureDay(), context);
    const dinnerPlaces = presentation.places.filter(({ ownerId }) => ownerId.startsWith("dinner"));

    expect(dinnerPlaces).toEqual([
      {
        ownerId: "dinner-a",
        label: "Dinner A",
        coordinates: { lat: 25.04, lng: 121.52 },
        tone: "candidate",
      },
      {
        ownerId: "dinner-b",
        label: "Dinner B",
        coordinates: { lat: 25.05, lng: 121.53 },
        tone: "selected",
      },
    ]);
    expect(presentation.selectedPlaceOwnerId).toBe("dinner-b");
  });

  it("expands browse groups on the main map without fabricating a selected option", () => {
    const browseGroup: CandidateGroup = { ...candidateGroup, mode: "browse" };

    const presentation = buildMapPresentation(fixtureDay(), {
      expandedCandidateGroup: browseGroup,
    });

    expect(
      presentation.places
        .filter(({ ownerId }) => ownerId.startsWith("dinner"))
        .map(({ ownerId, tone }) => ({ ownerId, tone })),
    ).toEqual([
      { ownerId: "dinner-a", tone: "candidate" },
      { ownerId: "dinner-b", tone: "candidate" },
    ]);
    expect(presentation.selectedPlaceOwnerId).toBeUndefined();
  });

  it("projects normalized route results without inventing failed terrestrial geometry", () => {
    const presentation = buildMapPresentation(fixtureDay(), {
      selectedNodeId: "museum",
      selectedRouteId: "walk-to-garden",
      routeResults: {
        "walk-to-garden": {
          status: "ready",
          durationMinutes: 8,
          path: [
            { lat: 25.01, lng: 121.51 },
            { lat: 25.02, lng: 121.5 },
          ],
          steps: ["Walk north"],
        },
        "drive-to-hotel": { status: "unavailable", reason: "No route" },
      },
    });

    expect(presentation.selectedPlaceOwnerId).toBe("museum");
    expect(presentation.selectedRouteId).toBe("walk-to-garden");
    expect(presentation.places.find(({ ownerId }) => ownerId === "museum")?.tone).toBe(
      "selected",
    );
    expect(presentation.routes).toEqual([
      {
        edgeId: "walk-to-garden",
        path: [
          { lat: 25.01, lng: 121.51 },
          { lat: 25.02, lng: 121.5 },
        ],
        tone: "selected",
      },
      { edgeId: "drive-to-hotel", path: [], tone: "unavailable" },
    ]);
  });
});

describe("provider-neutral boundaries", () => {
  it("keeps Google SDK names out of trip core", () => {
    for (const file of globSync("src/trip-core/**/*.ts")) {
      expect(readFileSync(file, "utf8")).not.toMatch(/google\.maps|@googlemaps/);
    }
  });

  it("builds an exact keyless Google Maps consumer URL", () => {
    expect(
      createGoogleMapsUrl({
        origin: "Hotel A",
        destination: "Museum B",
        travelMode: "transit",
      }),
    ).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=Hotel%20A&destination=Museum%20B&travelmode=transit",
    );
  });

  it("records fake-map calls and emits only while mounted", async () => {
    const fake = new FakeMapAdapter();
    const onPlaceSelect = vi.fn();
    const onRouteSelect = vi.fn();
    const element = document.createElement("div");

    await fake.mount(element, { onPlaceSelect, onRouteSelect });
    const presentation = buildMapPresentation(fixtureDay(), {});
    fake.render(presentation);
    fake.focus({ kind: "place", id: "museum" });
    fake.fit(["museum", "garden"]);
    fake.setPadding({ top: 10, right: 20, bottom: 30, left: 40 });
    fake.setUserLocation({ lat: 25, lng: 121 });
    fake.emitPlaceSelect("museum");
    fake.emitRouteSelect("walk-to-garden");

    expect(fake.mountCalls).toEqual([element]);
    expect(fake.renderCalls).toEqual([presentation]);
    expect(fake.focusCalls).toEqual([{ kind: "place", id: "museum" }]);
    expect(fake.fitCalls).toEqual([["museum", "garden"]]);
    expect(fake.paddingCalls).toEqual([{ top: 10, right: 20, bottom: 30, left: 40 }]);
    expect(fake.userLocationCalls).toEqual([{ lat: 25, lng: 121 }]);
    expect(onPlaceSelect).toHaveBeenCalledWith("museum");
    expect(onRouteSelect).toHaveBeenCalledWith("walk-to-garden");

    fake.destroy();
    fake.emitPlaceSelect("garden");
    expect(onPlaceSelect).toHaveBeenCalledTimes(1);
    expect(fake.destroyCalls).toBe(1);
  });
});
