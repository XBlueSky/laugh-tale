import { describe, expect, it } from "vitest";

import type { RouteEdge, Trip, TripNode } from "@laugh-tale-island/core";
import { emptyTripProgress } from "@laugh-tale-island/core";
import {
  resolveEffectiveItinerary,
  type EffectiveTrip,
} from "@laugh-tale-island/core";
import {
  buildTimelineEntries,
  type LogisticsGroupEntry,
  type RouteEntry,
} from "@laugh-tale-island/core";

const DAY_ID = "day-2040-06-12";

function sightseeing(id: string, title: string): TripNode {
  return {
    id,
    dayId: DAY_ID,
    kind: "sightseeing",
    title,
    timing: { certainty: "unknown" },
    optionality: "core",
    place: {
      name: title,
      coordinates: { lat: 35.7, lng: 139.7 },
      certainty: "confirmed",
    },
    payload: {},
  };
}

function logistics(id: string, title: string): TripNode {
  return {
    id,
    dayId: DAY_ID,
    kind: "logistics",
    title,
    timing: { certainty: "unknown" },
    optionality: "core",
    payload: { checklist: [{ id: `${id}-step`, title: `${title} step` }] },
  };
}

function route(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  overrides: Partial<RouteEdge> = {},
): RouteEdge {
  return {
    id,
    dayId: DAY_ID,
    fromNodeId,
    toNodeId,
    mode: "walking",
    source: "manual",
    certainty: "suggested",
    navigation: { origin: fromNodeId, destination: toNodeId },
    ...overrides,
  };
}

function effectiveTrip(nodes: TripNode[], routes: RouteEdge[]): EffectiveTrip {
  const trip: Trip = {
    id: "timeline-structure-trip",
    title: "Timeline structure",
    timezone: "Asia/Tokyo",
    startDate: "2040-06-12",
    endDate: "2040-06-12",
    days: [
      {
        id: DAY_ID,
        date: "2040-06-12",
        title: "Timeline day",
        nodes,
      },
    ],
    routes,
    candidateGroups: [],
    reservations: [],
    tasks: [],
  };
  return resolveEffectiveItinerary(trip, emptyTripProgress());
}

describe("buildTimelineEntries", () => {
  it("places every independently owned route between its endpoint nodes", () => {
    const trip = effectiveTrip(
      [
        {
          id: "hotel",
          dayId: DAY_ID,
          kind: "lodging",
          title: "Hotel",
          timing: { certainty: "unknown" },
          optionality: "core",
          payload: { role: "base" },
        },
        sightseeing("museum", "Museum"),
        {
          id: "dinner",
          dayId: DAY_ID,
          kind: "dining",
          title: "Dinner",
          timing: { start: "18:00", certainty: "suggested" },
          optionality: "core",
          payload: {},
        },
      ],
      [
        route("hotel--museum", "hotel", "museum"),
        route("museum--dinner", "museum", "dinner", { mode: "transit" }),
      ],
    );
    const day = trip.days[0];
    expect(day).toBeDefined();

    expect(buildTimelineEntries(day, trip).map((entry) => `${entry.kind}:${entry.id}`))
      .toEqual([
        "node:hotel",
        "route:hotel--museum",
        "node:museum",
        "route:museum--dinner",
        "node:dinner",
      ]);
  });

  it("keeps four-minute walks as compact route owners and seven-minute walks full", () => {
    const trip = effectiveTrip(
      [
        sightseeing("station", "Station"),
        sightseeing("gate", "Gate"),
        sightseeing("garden", "Garden"),
      ],
      [
        route("walk-four", "station", "gate", { durationMinutes: 4 }),
        route("walk-seven", "gate", "garden", { durationMinutes: 7 }),
      ],
    );
    const entries = buildTimelineEntries(trip.days[0], trip);
    const fourMinute = entries.find((entry): entry is RouteEntry => entry.id === "walk-four");
    const sevenMinute = entries.find((entry): entry is RouteEntry => entry.id === "walk-seven");

    expect(fourMinute).toMatchObject({ kind: "route", route: { display: "compact" } });
    expect(sevenMinute).toMatchObject({ kind: "route", route: { display: "full" } });
    expect(entries.find((entry) => entry.id === "station")).not.toHaveProperty("route");
    expect(entries.find((entry) => entry.id === "gate")).not.toHaveProperty("route");
  });

  it("keeps a long-distance transfer as a node while its ground access remains edges", () => {
    const transfer: TripNode = {
      id: "flight",
      dayId: DAY_ID,
      kind: "transfer",
      title: "Flight to Tokyo",
      timing: { start: "14:10", certainty: "fixed" },
      optionality: "core",
      booking: { status: "confirmed", reference: "FLIGHT-REF" },
      payload: { mode: "flight", terminal: "Terminal 2" },
    };
    const trip = effectiveTrip(
      [sightseeing("hotel", "Hotel"), transfer, sightseeing("arrival", "Arrival hall")],
      [
        route("hotel--flight", "hotel", "flight", { mode: "transit" }),
        route("flight--arrival", "flight", "arrival", { mode: "walking" }),
      ],
    );

    expect(
      buildTimelineEntries(trip.days[0], trip).map((entry) => `${entry.kind}:${entry.id}`),
    ).toEqual([
      "node:hotel",
      "route:hotel--flight",
      "node:flight",
      "route:flight--arrival",
      "node:arrival",
    ]);
  });

  it("groups only uninterrupted logistics runs of at least two and retains full child entries", () => {
    const nodes = [
      logistics("immigration", "Immigration"),
      logistics("bags", "Collect bags"),
      sightseeing("lobby", "Arrival lobby"),
      logistics("ticket", "Collect rail ticket"),
      logistics("platform", "Find platform"),
      logistics("board", "Board train"),
    ];
    const trip = effectiveTrip(nodes, [
      route("ticket--platform", "ticket", "platform", { durationMinutes: 2 }),
    ]);
    const sourceTrip = trip;
    sourceTrip.days[0].nodes[1] = {
      ...sourceTrip.days[0].nodes[1],
      completed: true,
    };

    const entries = buildTimelineEntries(sourceTrip.days[0], sourceTrip);
    const firstGroup = entries[0] as LogisticsGroupEntry;

    expect(entries.map((entry) => `${entry.kind}:${entry.id}`)).toEqual([
      "logistics-group:logistics:immigration--bags",
      "node:lobby",
      "node:ticket",
      "route:ticket--platform",
      "logistics-group:logistics:platform--board",
    ]);
    expect(firstGroup.entries).toEqual([
      { kind: "node", id: "immigration", node: nodes[0] },
      { kind: "node", id: "bags", node: nodes[1] },
    ]);
    expect(firstGroup.entries[0]).not.toBe(firstGroup.entries[1]);
  });

  it("emits every effective route owner exactly once in all-day order", () => {
    const trip = effectiveTrip(
      [sightseeing("a", "A"), sightseeing("b", "B"), sightseeing("c", "C")],
      [
        route("a--b-primary", "a", "b", { mode: "transit" }),
        route("a--b-alternate", "a", "b", { mode: "walking" }),
        route("b--c", "b", "c", { mode: "driving" }),
      ],
    );
    const routeIds = buildTimelineEntries(trip.days[0], trip)
      .filter((entry): entry is RouteEntry => entry.kind === "route")
      .map(({ id }) => id);

    expect(routeIds).toEqual(["a--b-primary", "a--b-alternate", "b--c"]);
    expect(new Set(routeIds).size).toBe(routeIds.length);
  });
});
