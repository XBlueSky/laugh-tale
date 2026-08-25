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

function effectiveNodes(ids: string[]): EffectiveNode[] {
  return ids.map((id) => ({
    node: sourceDay.nodes.find((candidate) => candidate.id === id)!,
    sourceNodeId: id,
    completed: false,
  }));
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

  it("fails loudly in development when two edges claim the same owner ID", () => {
    expect(() =>
      buildRoutePresentations(
        { ...sourceDay, routes: [...sourceRoutes, { ...sourceRoutes[1], fromNodeId: "a" }] },
        effectiveNodes(["a", "b", "c"]),
      ),
    ).toThrow(/duplicate route owner.*walk-7m/i);
  });
});
