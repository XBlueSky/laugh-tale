import { describe, expect, it } from "vitest";

import {
  buildMapPresentation,
  candidateMapOwnerId,
  decodeMapPlaceOwnerId,
  nodeMapOwnerId,
  USER_LOCATION_OWNER_ID,
  type CandidateGroup,
  type EffectiveDay,
  type EffectiveNode,
  type MapPresentationContext,
  type TripNode,
} from "@laugh-tale/core";

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
      },
      { edgeId: "drive-to-hotel", path: [], tone: "unavailable" },
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
            coordinates: { lat: 25.08, lng: 121.56 },
            certainty: "candidate",
          },
        },
      ],
    };

    const presentation = buildMapPresentation(day, {
      expandedCandidateGroup: collidingGroup,
      activeCandidateOptionId: "shared",
      routeResults: {
        shared: {
          status: "ready",
          durationMinutes: 2,
          path: [
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
    expect(presentation.routes[0]?.edgeId).toBe("shared");
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
