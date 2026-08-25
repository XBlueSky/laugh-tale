import { describe, expect, it } from "vitest";

import type { RouteEdge, TripDay, TripNode } from "./model";
import type { EffectiveNode } from "./resolve-itinerary";
import { buildRoutePresentations } from "./routes";

function node(id: string): TripNode {
  return {
    id,
    dayId: "day-1",
    kind: "sightseeing",
    title: id.toUpperCase(),
    timing: { certainty: "unknown" },
    optionality: "core",
    place: {
      name: `${id.toUpperCase()} place`,
      coordinates: { lat: 35, lng: 139 },
      certainty: "confirmed",
    },
    payload: {},
  };
}

const sourceDay: TripDay = {
  id: "day-1",
  date: "2026-08-23",
  title: "Routes day",
  nodes: [node("a"), node("b"), node("c")],
};

const sourceRoutes: RouteEdge[] = [
  {
    id: "walk-4m",
    dayId: "day-1",
    fromNodeId: "a",
    toNodeId: "b",
    mode: "walking",
    source: "manual",
    certainty: "suggested",
    durationMinutes: 4,
    navigation: { origin: "A place", destination: "B place" },
  },
  {
    id: "walk-7m",
    dayId: "day-1",
    fromNodeId: "b",
    toNodeId: "c",
    mode: "walking",
    source: "manual",
    certainty: "suggested",
    durationMinutes: 7,
    navigation: { origin: "B place", destination: "C place" },
  },
];

function effectiveNodes(ids: string[], day: TripDay = sourceDay): EffectiveNode[] {
  return ids.map((id) => ({
    node: day.nodes.find((candidate) => candidate.id === id)!,
    sourceNodeId: id,
    completed: false,
  }));
}

function edge(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  mode: RouteEdge["mode"],
): RouteEdge {
  return {
    id,
    dayId: "day-1",
    fromNodeId,
    toNodeId,
    mode,
    source: "provider",
    certainty: "suggested",
    durationMinutes: 8,
    summary: `Stale ${mode} summary`,
    navigation: {
      origin: `${fromNodeId.toUpperCase()} place`,
      destination: `${toNodeId.toUpperCase()} place`,
    },
  };
}

describe("buildRoutePresentations", () => {
  it("collapses walks of at most five minutes without removing navigation or ownership", () => {
    const presentations = buildRoutePresentations(
      { ...sourceDay, routes: sourceRoutes },
      effectiveNodes(["a", "b", "c"]),
    );

    expect(presentations.find(({ edge }) => edge.id === "walk-4m")).toMatchObject({
      display: "compact",
      navigable: true,
    });
    expect(presentations.find(({ edge }) => edge.id === "walk-7m")).toMatchObject({
      display: "full",
      navigable: true,
    });
    expect(presentations.map(({ edge }) => edge.id)).toEqual(["walk-4m", "walk-7m"]);
    expect(new Set(presentations.map(({ edge }) => edge.id)).size).toBe(presentations.length);
  });

  it("emits one endpoint-correct estimated owner across a removed middle node", () => {
    const [presentation] = buildRoutePresentations(
      { ...sourceDay, routes: sourceRoutes },
      effectiveNodes(["a", "c"]),
    );

    expect(presentation).toMatchObject({
      edge: {
        id: "route:a--c",
        fromNodeId: "a",
        toNodeId: "c",
        mode: "walking",
        source: "recomposed",
        certainty: "unverified",
        navigation: { origin: "A place", destination: "C place" },
      },
      display: "full",
      navigable: true,
    });
    expect(presentation?.edge).not.toHaveProperty("durationMinutes");
    expect(presentation?.edge).not.toHaveProperty("summary");
  });

  it("does not claim navigation when neither the edge nor its endpoints can identify places", () => {
    const nodes = effectiveNodes(["a", "b"]).map((effective) => ({
      ...effective,
      node: { ...effective.node, place: undefined },
    }));
    const [presentation] = buildRoutePresentations(
      { ...sourceDay, routes: [{ ...sourceRoutes[0], navigation: undefined }] },
      nodes,
    );

    expect(presentation).toMatchObject({ navigable: false });
  });

  it("emits every owner on one adjacency in stable input order and ignores other days", () => {
    const alternate = {
      ...sourceRoutes[0],
      id: "walk-4m-alternate",
      source: "provider" as const,
    };
    const otherDay = {
      ...sourceRoutes[0],
      id: "other-day-edge",
      dayId: "day-2",
    };

    const presentations = buildRoutePresentations(
      {
        ...sourceDay,
        routes: [otherDay, alternate, sourceRoutes[0], sourceRoutes[1]],
      },
      effectiveNodes(["a", "b", "c"]),
    );

    expect(presentations.map(({ edge: route }) => route.id)).toEqual([
      "walk-4m-alternate",
      "walk-4m",
      "walk-7m",
    ]);
  });

  it("ignores walking access and egress around one substantive recomposed mode", () => {
    const day: TripDay = {
      ...sourceDay,
      nodes: [node("a"), node("b"), node("c"), node("d")],
    };
    const [presentation] = buildRoutePresentations(
      {
        ...day,
        routes: [
          edge("access", "a", "b", "walking"),
          edge("main-transit", "b", "c", "transit"),
          edge("egress", "c", "d", "walking"),
        ],
      },
      effectiveNodes(["a", "d"], day),
    );

    expect(presentation).toMatchObject({
      edge: {
        id: "route:a--d",
        mode: "transit",
        source: "recomposed",
        certainty: "unverified",
        navigation: { origin: "A place", destination: "D place" },
      },
      navigable: true,
    });
    expect(presentation?.edge).not.toHaveProperty("summary");
  });

  it("uses the first substantive mode and disables navigation for heterogeneous recomposition", () => {
    type RuntimeProviderEdge = RouteEdge & {
      providerPlan: string;
      departureTime: string;
      steps: string[];
      geometry: { encodedPolyline: string };
      preferences: { avoidTolls: boolean };
    };
    const day: TripDay = {
      ...sourceDay,
      nodes: [node("a"), node("b"), node("c"), node("d"), node("e")],
    };
    const staleTransit: RuntimeProviderEdge = {
      ...edge("main-transit", "b", "c", "transit"),
      providerPlan: "Old train plan",
      departureTime: "2026-08-23T10:00:00+09:00",
      steps: ["Old platform"],
      geometry: { encodedPolyline: "stale" },
      preferences: { avoidTolls: true },
    };
    const [presentation] = buildRoutePresentations(
      {
        ...day,
        routes: [
          edge("access", "a", "b", "walking"),
          staleTransit,
          edge("main-driving", "c", "d", "driving"),
          edge("egress", "d", "e", "walking"),
        ],
      },
      effectiveNodes(["a", "e"], day),
    );

    expect(presentation).toMatchObject({
      edge: {
        id: "route:a--e",
        mode: "transit",
        summary: "Mixed modes: transit → driving",
        source: "recomposed",
        certainty: "unverified",
      },
      navigable: false,
    });
    expect(presentation?.edge).not.toHaveProperty("navigation");
    expect(presentation?.edge).not.toHaveProperty("providerPlan");
    expect(presentation?.edge).not.toHaveProperty("departureTime");
    expect(presentation?.edge).not.toHaveProperty("steps");
    expect(presentation?.edge).not.toHaveProperty("geometry");
    expect(presentation?.edge).not.toHaveProperty("preferences");
  });

  it("fails loudly in development when two edges claim the same owner ID", () => {
    expect(() =>
      buildRoutePresentations(
        { ...sourceDay, routes: [...sourceRoutes, { ...sourceRoutes[1], fromNodeId: "a" }] },
        effectiveNodes(["a", "b", "c"]),
      ),
    ).toThrow(/duplicate route owner.*walk-7m/i);
  });
});
