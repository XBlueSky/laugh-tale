import { describe, expect, it } from "vitest";

import {
  buildDaySemanticProjection,
  buildRoutePresentations,
  formatCandidateOrdinal,
  timelineRoleForNode,
  type CandidateGroup,
  type EffectiveDay,
  type RouteEdge,
  type TripNode,
} from "@laugh-tale-island/core";

const dayId = "semantic-day";

function node(
  id: string,
  kind: TripNode["kind"],
  overrides: Partial<TripNode> = {},
): TripNode {
  const payload = kind === "lodging"
    ? { role: "base" as const }
    : kind === "transport"
      ? { mode: "walking" as const }
      : kind === "transfer"
        ? { mode: "rail" as const }
        : kind === "logistics"
          ? { checklist: [] }
          : kind === "shopping"
            ? { items: [] }
            : kind === "custom"
              ? {
                  customKind: "custom",
                  presentationRole: "task" as const,
                  capabilities: { completion: true },
                  data: {},
                }
              : {};
  return {
    id,
    dayId,
    kind,
    title: id,
    timing: { certainty: "suggested" },
    optionality: "core",
    payload,
    ...overrides,
  } as TripNode;
}

function located(id: string, kind: TripNode["kind"] = "sightseeing"): TripNode {
  return node(id, kind, {
    place: {
      name: id,
      certainty: "confirmed",
      identity: { status: "resolved", coordinates: { lat: 35, lng: 139 } },
    },
  });
}

function edge(id: string, fromNodeId: string, toNodeId: string): RouteEdge {
  return {
    id,
    dayId,
    fromNodeId,
    toNodeId,
    mode: "walking",
    source: "manual",
    certainty: "confirmed",
  };
}

describe("timelineRoleForNode", () => {
  it.each([
    ["dining", "primary"], ["shopping", "primary"], ["sightseeing", "primary"],
    ["experience", "primary"], ["lodging", "base"], ["transport", "journey"],
    ["transfer", "journey"], ["logistics", "task"],
  ] as const)("maps %s to %s", (kind, role) => {
    expect(timelineRoleForNode(node(kind, kind))).toBe(role);
  });

  it.each(["primary", "journey", "task"] as const)("uses custom %s exactly", (role) => {
    expect(timelineRoleForNode(node(`custom-${role}`, "custom", {
      payload: { customKind: "x", presentationRole: role, capabilities: { place: true }, data: {} },
    }))).toBe(role);
  });

  it("does not invent a role for unrecognized runtime kinds", () => {
    expect(timelineRoleForNode({ ...node("broken", "sightseeing"), kind: "unknown" } as unknown as TripNode)).toBeUndefined();
  });
});

describe("buildDaySemanticProjection", () => {
  it("shows a non-flight journey pin when an otherwise mappable day has no primary or base pin", () => {
    const rail = located("rail", "transfer");
    const flight = located("flight", "transfer");
    if (flight.kind !== "transfer") throw new Error("missing transfer fixture");
    flight.payload = { mode: "flight" };
    const nodes = [rail, flight];
    const day: EffectiveDay = {
      day: { id: dayId, date: "2040-06-12", title: "Return day", nodes },
      nodes: nodes.map(node => ({ node, sourceNodeId: node.id, completed: false, skipped: false })),
    };
    const projection = buildDaySemanticProjection({
      day, routes: [], candidateGroups: [], currentNodeId: null, nextNodeId: null,
      viewingOwnerId: null, selectedOwnerId: null, supportedNavigationProviders: [],
    });
    expect(projection.mapOwners.map(owner => owner.ownerId)).toEqual(["rail"]);
    expect(projection.entries.find(entry => entry.kind === "node" && entry.ownerId === "rail")).toMatchObject({ markerMode: "base" });
  });
  it("keeps owner identity while grouping only absent-edge logistics and preserves semantic/map parity", () => {
    const nodes = [
      located("hotel", "lodging"), located("museum"), node("train", "transport"),
      node("unresolved", "sightseeing", { place: { name: "unresolved", certainty: "unverified", identity: { status: "unresolved", reason: "not-reviewed" } } }),
      node("log|one", "logistics"), node("log|two", "logistics"), node("log-three", "logistics"),
      node("break-one", "logistics"), node("break-two", "logistics"), located("dinner", "dining"),
    ];
    const candidateGroups: CandidateGroup[] = [{
      id: "dinner-options", parentNodeId: "dinner", mode: "browse",
      options: Array.from({ length: 28 }, (_, index) => ({
        id: `candidate-${index + 1}`,
        title: `Candidate ${index + 1}`,
        place: { name: `Candidate ${index + 1}`, certainty: "candidate", identity: { status: "resolved", coordinates: { lat: 35 + index / 100, lng: 139 } } },
      })),
    }];
    const day: EffectiveDay = {
      day: { id: dayId, date: "2040-06-12", title: "Semantic day", nodes },
      nodes: nodes.map((node) => ({ node, sourceNodeId: node.id, completed: node.id === "museum", skipped: node.id === "train" })),
    };
    const projection = buildDaySemanticProjection({
      day,
      routes: [edge("to-log", "unresolved", "log|one"), edge("split", "log-three", "break-one"), edge("to-dinner", "break-two", "dinner")],
      candidateGroups,
      currentNodeId: "museum", nextNodeId: "unresolved", viewingOwnerId: "candidate-1", selectedOwnerId: "dinner",
      supportedNavigationProviders: [],
    });

    expect(projection.entries.map(({ kind, ownerId }) => `${kind}:${ownerId}`)).toEqual([
      "node:hotel", "node:museum", "node:train", "node:unresolved", "route:to-log",
      'logistics-group:logistics-group:["log|one","log|two","log-three"]', "route:split",
      'logistics-group:logistics-group:["break-one","break-two"]', "route:to-dinner", "node:dinner",
    ]);
    const firstGroup = projection.entries.find((entry) => entry.kind === "logistics-group" && entry.childOwnerIds[0] === "log|one");
    if (firstGroup?.kind !== "logistics-group") throw new Error("first logistics group is missing");
    expect(firstGroup).toMatchObject({
      childOwnerIds: ["log|one", "log|two", "log-three"], incomingRouteIds: ["to-log"],
    });
    expect(firstGroup.children.map((child) => child.ownerId)).toEqual(["log|one", "log|two", "log-three"]);
    expect(firstGroup.children[0]?.incomingRouteIds).toEqual(["to-log"]);

    const entriesByOwner = new Map(projection.entries.filter((entry) => entry.kind === "node").map((entry) => [entry.ownerId, entry]));
    expect(entriesByOwner.get("hotel")).toMatchObject({ role: "base", markerMode: "base" });
    expect(entriesByOwner.get("museum")).toMatchObject({ displayIndex: 1, ordinal: "1", states: ["current", "completed"] });
    expect(entriesByOwner.get("train")).toMatchObject({ role: "journey", markerMode: "none", states: ["skipped"] });
    expect(entriesByOwner.get("unresolved")).toMatchObject({ displayIndex: 2, ordinal: "2", states: ["next", "unresolved"] });
    expect(entriesByOwner.get("dinner")).toMatchObject({ displayIndex: 3, ordinal: "3", states: ["selected"] });
    expect(entriesByOwner.get("hotel")).not.toHaveProperty("displayIndex");
    expect(entriesByOwner.get("unresolved")).toMatchObject({ navigationTarget: null });
    expect(projection.mapOwners.map(({ ownerId }) => ownerId)).not.toContain("unresolved");

    expect(projection.candidates.map(({ ordinal }) => ordinal)).toEqual([
      "3a", "3b", "3c", "3d", "3e", "3f", "3g", "3h", "3i", "3j", "3k", "3l", "3m", "3n", "3o", "3p", "3q", "3r", "3s", "3t", "3u", "3v", "3w", "3x", "3y", "3z", "3aa", "3ab",
    ]);
    expect(projection.candidates[0]).toMatchObject({ ownerId: "candidate-1", parentOwnerId: "dinner", states: ["viewing", "candidate"] });
    expect(projection.candidates[0]).not.toHaveProperty("displayIndex");

    for (const owner of [...entriesByOwner.values(), ...projection.candidates]) {
      if (owner.role !== "primary" && owner.role !== "base") continue;
      const mapped = projection.mapOwners.find((candidate) => candidate.ownerId === owner.ownerId);
      if (owner.navigationTarget?.kind !== "coordinates") continue;
      expect(mapped).toMatchObject({
        ownerId: owner.ownerId, sourceKind: owner.sourceKind, states: owner.states,
      });
      if ("displayIndex" in owner) {
        expect(mapped).toMatchObject({ displayIndex: owner.displayIndex, ordinal: owner.ordinal });
      } else {
        expect(mapped).not.toHaveProperty("displayIndex");
        if ("ordinal" in owner) {
          expect(mapped).toMatchObject({ ordinal: owner.ordinal });
        } else {
          expect(mapped).not.toHaveProperty("ordinal");
        }
      }
    }
  });

  it("formats spreadsheet-style candidate suffixes", () => {
    expect(formatCandidateOrdinal(1, 0)).toBe("1a");
    expect(formatCandidateOrdinal(1, 25)).toBe("1z");
    expect(formatCandidateOrdinal(1, 26)).toBe("1aa");
    expect(formatCandidateOrdinal(1, 701)).toBe("1zz");
  });

  it("preserves every grouped child route and splits on a reverse adjacent edge", () => {
    const nodes = [node("one", "logistics"), node("two", "logistics"), node("three", "logistics"), located("outside")];
    const day: EffectiveDay = {
      day: { id: dayId, date: "2040-06-12", title: "Routes", nodes },
      nodes: nodes.map((node) => ({ node, sourceNodeId: node.id, completed: false, skipped: false })),
    };
    const projection = buildDaySemanticProjection({
      day,
      routes: [edge("first-branch", "one", "outside"), edge("second-branch", "two", "outside"), edge("reverse-adjacent", "three", "two")],
      candidateGroups: [], currentNodeId: null, nextNodeId: null, viewingOwnerId: null, selectedOwnerId: null,
      supportedNavigationProviders: [],
    });

    expect(projection.entries.map(({ kind, ownerId }) => `${kind}:${ownerId}`)).toEqual([
      'logistics-group:logistics-group:["one","two"]',
      "route:first-branch",
      "route:second-branch",
      "node:three",
      "route:reverse-adjacent",
      "node:outside",
    ]);
  });

  it.each([
    { mode: "walking", provider: "foreign", coordinates: false, supported: ["google"], external: false, want: false },
    { mode: "walking", provider: "google", coordinates: false, supported: [], external: false, want: false },
    { mode: "walking", provider: "google", coordinates: false, supported: ["google"], external: false, want: true },
    { mode: "walking", provider: "foreign", coordinates: true, supported: ["google"], external: false, want: true },
    { mode: "flight", provider: "foreign", coordinates: false, supported: [], external: true, want: true },
    { mode: "unknown", provider: "foreign", coordinates: false, supported: [], external: true, want: true },
    { mode: "flight", provider: "google", coordinates: true, supported: ["google"], external: false, want: false },
    { mode: "unknown", provider: "google", coordinates: true, supported: ["google"], external: false, want: false },
  ] as const)("derives route capability independently from typed targets and genuine external data: %#", ({ mode, provider, coordinates, supported, external, want }) => {
    const nodes = [located("a"), located("b")];
    for (const value of nodes) value.place!.identity = {
      status: "resolved", providerReference: { provider, id: value.id },
      ...(coordinates ? { coordinates: { lat: 35, lng: 139 } } : {}),
    };
    const day: EffectiveDay = {
      day: { id: dayId, date: "2040-06-12", title: "Navigability", nodes },
      nodes: nodes.map((node) => ({ node, sourceNodeId: node.id, completed: false, skipped: false })),
    };
    const routes = [{ ...edge("route", "a", "b"), mode, ...(external ? { navigation: { origin: "Authored A", destination: "Authored B" } } : {}) }];
    const projection = buildDaySemanticProjection({
      day, routes, candidateGroups: [], currentNodeId: null, nextNodeId: null, viewingOwnerId: null, selectedOwnerId: null,
      supportedNavigationProviders: supported,
    });
    const semanticNavigability = projection.entries
      .filter((entry) => entry.kind === "route")
      .map((entry) => entry.route.navigable);
    const routeNavigability = buildRoutePresentations(
      { ...day.day, routes },
      day.nodes,
      { supportedNavigationProviders: supported },
    ).map(({ navigable }) => navigable);

    expect.soft(semanticNavigability).toEqual([want]);
    expect(routeNavigability).toEqual([want]);
  });

  it("orders simultaneous facts canonically and omits ordinal fields from non-primary entries", () => {
    const nodes = [
      node("primary", "sightseeing", {
        place: { name: "primary", certainty: "unverified", identity: { status: "unresolved", reason: "not-reviewed" } },
      }),
      node("journey", "transport"),
      node("task", "logistics"),
      node("group-one", "logistics"),
      node("group-two", "logistics"),
    ];
    const day: EffectiveDay = {
      day: { id: dayId, date: "2040-06-12", title: "States", nodes },
      nodes: nodes.map((node) => ({ node, sourceNodeId: node.id, completed: node.id === "primary", skipped: node.id === "primary" })),
    };
    const projection = buildDaySemanticProjection({
      day,
      routes: [edge("connector", "task", "group-one")],
      candidateGroups: [{
        id: "primary-options", parentNodeId: "primary", mode: "browse",
        options: [{
          id: "unresolved-candidate", title: "Unresolved candidate",
          place: { name: "Unresolved candidate", certainty: "candidate", identity: { status: "unresolved", reason: "not-reviewed" } },
        }],
      }],
      currentNodeId: "primary", nextNodeId: "primary", viewingOwnerId: "primary", selectedOwnerId: "primary",
      supportedNavigationProviders: [],
    });
    const primary = projection.entries.find((entry) => entry.kind === "node" && entry.ownerId === "primary");
    expect(primary).toMatchObject({
      states: ["current", "next", "viewing", "selected", "completed", "skipped", "unresolved"],
    });
    const journey = projection.entries.find((entry) => entry.kind === "node" && entry.ownerId === "journey");
    const task = projection.entries.find((entry) => entry.kind === "node" && entry.ownerId === "task");
    const group = projection.entries.find((entry) => entry.kind === "logistics-group");
    const connector = projection.entries.find((entry) => entry.kind === "route" && entry.ownerId === "connector");
    if (
      journey?.kind !== "node" || journey.ownerId !== "journey" || journey.role !== "journey" ||
      task?.kind !== "node" || task.ownerId !== "task" || task.role !== "task" ||
      connector?.kind !== "route" || connector.ownerId !== "connector" || connector.role !== "connector" ||
      group?.kind !== "logistics-group"
    ) {
      throw new Error("Expected journey, task, connector, and logistics-group entries.");
    }
    expect(group).toMatchObject({
      kind: "logistics-group",
      ownerId: 'logistics-group:["group-one","group-two"]',
      role: "logistics-group",
      childOwnerIds: ["group-one", "group-two"],
    });
    for (const entry of [journey, task, group, connector]) {
      expect(entry).not.toHaveProperty("displayIndex");
      expect(entry).not.toHaveProperty("ordinal");
    }
    expect(projection.candidates).toMatchObject([{ states: ["candidate", "unresolved"] }]);
  });
});
