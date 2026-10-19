import { describe, expect, it } from "vitest";

import {
  buildMapPresentation,
  buildDaySemanticProjection,
  candidateMapOwnerId,
  decodeMapPlaceOwnerId,
  nodeMapOwnerId,
  USER_LOCATION_OWNER_ID,
  type CandidateGroup,
  type EffectiveDay,
  type EffectiveNode,
  type MapPresentationContext,
  type RouteEdge,
  type TripNode,
} from "@laugh-tale-island/core";

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
            certainty: "confirmed" as const,
            identity: { status: "resolved" as const, coordinates: options.coordinates },
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
    skipped: false,
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
        certainty: "candidate",
        identity: { status: "resolved", coordinates: { lat: 25.04, lng: 121.52 } },
      },
    },
    {
      id: "dinner-b",
      title: "Dinner B",
      place: {
        name: "Dinner B",
        certainty: "candidate",
        identity: { status: "resolved", coordinates: { lat: 25.05, lng: 121.53 } },
      },
    },
    {
      id: "dinner-unresolved",
      title: "Dinner Unresolved",
      place: {
        name: "Dinner Unresolved",
        certainty: "candidate",
        identity: { status: "unresolved", reason: "not-reviewed" },
      },
    },
  ],
};

const routeFreeContext: MapPresentationContext = {};
const pairedRouteContext: MapPresentationContext = {
  routes: [],
  routeResults: {},
};
// @ts-expect-error routeResults must be paired with routes.
const routeResultsOnlyContext: MapPresentationContext = { routeResults: {} };
// @ts-expect-error routes must be paired with routeResults.
const routesOnlyContext: MapPresentationContext = { routes: [] };
void [
  routeFreeContext,
  pairedRouteContext,
  routeResultsOnlyContext,
  routesOnlyContext,
];

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
  it("never emits malformed runtime route geometry", () => {
    const edge: RouteEdge = {
      id: "unsafe", dayId: "day-one", fromNodeId: "museum", toNodeId: "garden",
      mode: "walking", source: "provider", certainty: "suggested",
    };
    const sparse = new Array<{ lat: number; lng: number }>(2);
    sparse[0] = { lat: 25.01, lng: 121.51 };
    const malformed: unknown[] = [[], [{ lat: 25.01, lng: 121.51 }], [{ lat: Number.NaN, lng: 121.51 }, { lat: 25.02, lng: 121.5 }], [{ lat: 95, lng: 121.51 }, { lat: 25.02, lng: 121.5 }], sparse, "geometry"];
    for (const geometry of malformed) {
      expect(() => buildMapPresentation(fixtureDay(), {
        routes: [edge],
        routeResults: { unsafe: { status: "ready", durationMinutes: 1, steps: [], geometry } as unknown as import("@laugh-tale-island/core").RouteProviderResult },
      })).not.toThrow();
      expect(buildMapPresentation(fixtureDay(), {
        routes: [edge],
        routeResults: { unsafe: { status: "ready", durationMinutes: 1, steps: [], geometry } as unknown as import("@laugh-tale-island/core").RouteProviderResult },
      }).routes).toEqual([]);
    }
  });

  it.each([null, 42, "ready", []])("ignores a malformed direct route-result record: %p", (result) => {
    const edge: RouteEdge = {
      id: "unsafe-record", dayId: "day-one", fromNodeId: "museum", toNodeId: "garden",
      mode: "walking", source: "provider", certainty: "suggested",
    };
    const context = {
      routes: [edge],
      routeResults: { "unsafe-record": result },
    } as unknown as MapPresentationContext;
    expect(() => buildMapPresentation(fixtureDay(), context)).not.toThrow();
    expect(buildMapPresentation(fixtureDay(), context).routes).toEqual([]);
  });

  it("filters markerMode none semantic owners before marker descriptors could reach a factory", () => {
    const day = fixtureDay();
    const journey: TripNode = {
      id: "journey", dayId: "day-one", kind: "transport", title: "Train",
      timing: { certainty: "suggested" }, optionality: "core", payload: { mode: "transit" },
      place: { name: "Station", certainty: "suggested", identity: { status: "resolved", coordinates: { lat: 25.06, lng: 121.53 } } },
    };
    day.day.nodes.splice(1, 0, journey);
    day.nodes.splice(1, 0, effective(journey));
    const projection = buildDaySemanticProjection({
      day, routes: [], candidateGroups: [], currentNodeId: null, nextNodeId: null,
      viewingOwnerId: null, selectedOwnerId: null, supportedNavigationProviders: [],
    });
    expect(projection.entries.some((entry) => entry.kind === "node" && entry.markerMode === "none")).toBe(true);
    expect(projection.mapOwners).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ markerMode: "none" }),
    ]));
    expect(projection.mapOwners.map(owner => owner.ownerId)).toEqual(["museum", "garden", "hotel", "dinner"]);
    expect(projection.entries.filter(entry => entry.kind === "node").map(entry => entry.ownerId).slice(0, 3)).toEqual(["museum", "journey", "garden"]);
  });
  it("rejects malformed partial route contexts instead of dropping route data", () => {
    const partialContexts = [
      { routeResults: {} },
      {
        routes: [
          {
            id: "partial-route",
            dayId: "day-one",
            fromNodeId: "museum",
            toNodeId: "garden",
            mode: "walking",
            source: "manual",
            certainty: "confirmed",
          },
        ],
      },
    ];

    for (const partialContext of partialContexts) {
      expect(() =>
        buildMapPresentation(
          fixtureDay(),
          partialContext as unknown as MapPresentationContext,
        ),
      ).toThrow(/routes and routeResults must be provided together/i);
    }
  });

  it("keeps every locatable effective node and only the resolved candidate when collapsed", () => {
    const presentation = buildMapPresentation(fixtureDay(), {});

    expect(presentation.places).toEqual([
      {
        ownerId: nodeMapOwnerId("museum"),
        label: "Museum",
        coordinates: { lat: 25.01, lng: 121.51 },
        tone: "default",
      },
      {
        ownerId: nodeMapOwnerId("garden"),
        label: "Garden",
        coordinates: { lat: 25.02, lng: 121.5 },
        tone: "default",
      },
      {
        ownerId: nodeMapOwnerId("hotel"),
        label: "Hotel",
        coordinates: { lat: 25.03, lng: 121.49 },
        tone: "completed",
      },
      {
        ownerId: nodeMapOwnerId("dinner"),
        label: "Dinner A",
        coordinates: { lat: 25.04, lng: 121.52 },
        tone: "default",
      },
    ]);
    expect(
      presentation.places.some(
        ({ ownerId }) => ownerId === candidateMapOwnerId("dinner-b"),
      ),
    ).toBe(false);
    expect(presentation.places.filter(({ tone }) => tone === "candidate")).toHaveLength(0);
  });

  it("keeps skipped owners visible with their skipped semantic tone", () => {
    const day = fixtureDay();
    const garden = day.nodes.find(({ sourceNodeId }) => sourceNodeId === "garden");
    if (garden === undefined) throw new Error("fixture garden is missing");
    garden.skipped = true;

    expect(buildMapPresentation(day).places).toContainEqual({
      ownerId: nodeMapOwnerId("garden"),
      label: "Garden",
      coordinates: { lat: 25.02, lng: 121.5 },
      tone: "skipped",
    });
  });

  it("replaces the expanded parent with every locatable option and selects only the active draft", () => {
    const context: MapPresentationContext = {
      expandedCandidateGroup: candidateGroup,
      activeCandidateOptionId: "dinner-b",
      selectedNodeId: "dinner",
    };

    const presentation = buildMapPresentation(fixtureDay(), context);
    const dinnerPlaces = presentation.places.filter(
      ({ ownerId }) => decodeMapPlaceOwnerId(ownerId)?.kind === "candidate",
    );

    expect(dinnerPlaces).toEqual([
      {
        ownerId: candidateMapOwnerId("dinner-a"),
        label: "Dinner A",
        coordinates: { lat: 25.04, lng: 121.52 },
        tone: "candidate",
      },
      {
        ownerId: candidateMapOwnerId("dinner-b"),
        label: "Dinner B",
        coordinates: { lat: 25.05, lng: 121.53 },
        tone: "selected",
      },
    ]);
    expect(presentation.selectedPlaceOwnerId).toBe(
      candidateMapOwnerId("dinner-b"),
    );
  });

  it("expands browse groups on the main map without fabricating a selected option", () => {
    const browseGroup: CandidateGroup = { ...candidateGroup, mode: "browse" };

    const presentation = buildMapPresentation(fixtureDay(), {
      expandedCandidateGroup: browseGroup,
    });

    expect(
      presentation.places
        .flatMap(({ ownerId, tone }) => {
          const owner = decodeMapPlaceOwnerId(ownerId);
          return owner?.kind === "candidate" ? [{ id: owner.id, tone }] : [];
        }),
    ).toEqual([
      { id: "dinner-a", tone: "candidate" },
      { id: "dinner-b", tone: "candidate" },
    ]);
    expect(presentation.selectedPlaceOwnerId).toBeUndefined();
  });

  it("projects normalized route results without inventing failed terrestrial geometry", () => {
    const routes: RouteEdge[] = [
      {
        id: "walk-to-garden",
        dayId: "day-one",
        fromNodeId: "museum",
        toNodeId: "garden",
        mode: "walking",
        source: "provider",
        certainty: "suggested",
      },
      {
        id: "drive-to-hotel",
        dayId: "day-one",
        fromNodeId: "garden",
        toNodeId: "hotel",
        mode: "driving",
        source: "recomposed",
        certainty: "unverified",
      },
    ];
    const presentation = buildMapPresentation(fixtureDay(), {
      selectedNodeId: "museum",
      selectedRouteId: "walk-to-garden",
      routes,
      routeResults: {
        "walk-to-garden": {
          status: "ready",
          durationMinutes: 8,
          geometry: [
            { lat: 25.01, lng: 121.51 },
            { lat: 25.02, lng: 121.5 },
          ],
          steps: ["Walk north"],
        },
        "drive-to-hotel": { status: "unavailable", reason: "not-found", retryable: false },
      },
    });

    expect(presentation.selectedPlaceOwnerId).toBe(nodeMapOwnerId("museum"));
    expect(presentation.selectedRouteId).toBe("walk-to-garden");
    expect(
      presentation.places.find(
        ({ ownerId }) => ownerId === nodeMapOwnerId("museum"),
      )?.tone,
    ).toBe("selected");
    expect(presentation.routes).toEqual([
      {
        edgeId: "walk-to-garden",
        path: [
          { lat: 25.01, lng: 121.51 },
          { lat: 25.02, lng: 121.5 },
        ],
        tone: "selected",
        source: "provider",
        certainty: "suggested",
        mode: "walking",
      },
    ]);
  });

  it("encodes colliding node, candidate, route, and reserved user-location identities", () => {
    const sharedNode = placeNode("shared", {
      title: "Shared node",
      coordinates: { lat: 25.06, lng: 121.54 },
    });
    const reservedLookingNode = placeNode(USER_LOCATION_OWNER_ID, {
      title: "Reserved-looking node",
      coordinates: { lat: 25.07, lng: 121.55 },
    });
    const base = fixtureDay();
    const day: EffectiveDay = {
      day: {
        ...base.day,
        nodes: [sharedNode, reservedLookingNode, ...base.day.nodes],
      },
      nodes: [effective(sharedNode), effective(reservedLookingNode), ...base.nodes],
    };
    const collidingGroup: CandidateGroup = {
      ...candidateGroup,
      options: [
        {
          id: "shared",
          title: "Shared candidate",
          place: {
            name: "Shared candidate",
            certainty: "candidate",
            identity: { status: "resolved", coordinates: { lat: 25.08, lng: 121.56 } },
          },
        },
      ],
    };

    const presentation = buildMapPresentation(day, {
      expandedCandidateGroup: collidingGroup,
      activeCandidateOptionId: "shared",
      routes: [
        {
          id: "shared",
          dayId: "day-one",
          fromNodeId: "shared",
          toNodeId: "dinner",
          mode: "walking",
          source: "manual",
          certainty: "confirmed",
        },
      ],
      routeResults: {
        shared: {
          status: "ready",
          durationMinutes: 2,
          geometry: [
            { lat: 25.06, lng: 121.54 },
            { lat: 25.08, lng: 121.56 },
          ],
          steps: [],
        },
      },
      selectedRouteId: "shared",
    });

    const nodeOwner = nodeMapOwnerId("shared");
    const candidateOwner = candidateMapOwnerId("shared");
    const reservedLookingOwner = nodeMapOwnerId(USER_LOCATION_OWNER_ID);
    expect(nodeOwner).not.toBe(candidateOwner);
    expect(reservedLookingOwner).not.toBe(USER_LOCATION_OWNER_ID);
    expect(presentation.places).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ownerId: nodeOwner, tone: "default" }),
        expect.objectContaining({ ownerId: candidateOwner, tone: "selected" }),
        expect.objectContaining({ ownerId: reservedLookingOwner }),
      ]),
    );
    expect(presentation.selectedPlaceOwnerId).toBe(candidateOwner);
    expect(presentation.selectedRouteId).toBe("shared");
    expect(presentation.routes[0]).toMatchObject({
      edgeId: "shared",
      source: "manual",
      certainty: "confirmed",
      mode: "walking",
    });
    expect(decodeMapPlaceOwnerId(nodeOwner)).toEqual({ kind: "node", id: "shared" });
    expect(decodeMapPlaceOwnerId(candidateOwner)).toEqual({
      kind: "candidate",
      id: "shared",
    });
    expect(decodeMapPlaceOwnerId(reservedLookingOwner)).toEqual({
      kind: "node",
      id: USER_LOCATION_OWNER_ID,
    });
    expect(decodeMapPlaceOwnerId(USER_LOCATION_OWNER_ID)).toEqual({
      kind: "user-location",
    });
    expect(decodeMapPlaceOwnerId("shared")).toBeUndefined();
  });
});
