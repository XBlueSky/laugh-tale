import { describe, expect, it } from "vitest";

import type { RouteEdge, Trip } from "@laugh-tale-island/core";
import { emptyTripProgress, nodeCompletionKey } from "@laugh-tale-island/core";
import { resolveEffectiveItinerary } from "@laugh-tale-island/core";

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function tripFixture(): Trip {
  return {
    id: "trip-resolver",
    title: "Resolver trip",
    timezone: "Asia/Tokyo",
    startDate: "2026-08-23",
    endDate: "2026-08-23",
    days: [
      {
        id: "day-1",
        date: "2026-08-23",
        title: "Resolver day",
        nodes: [
          {
            id: "a",
            dayId: "day-1",
            kind: "dining",
            title: "Choose dinner",
            timing: { start: "18:00", certainty: "suggested" },
            optionality: "candidate",
            place: {
              name: "Parent venue",
              coordinates: { lat: 35.1, lng: 139.1 },
              certainty: "suggested",
            },
            booking: {
              status: "confirmed",
              reference: "PARENT",
              url: "https://example.com/parent",
            },
            payload: { candidateGroupId: "dinner-group" },
          },
          {
            id: "b",
            dayId: "day-1",
            kind: "sightseeing",
            title: "Optional middle stop",
            timing: { start: "19:00", certainty: "suggested" },
            optionality: "optional",
            place: {
              name: "Middle",
              coordinates: { lat: 35.2, lng: 139.2 },
              certainty: "candidate",
            },
            payload: {},
          },
          {
            id: "c",
            dayId: "day-1",
            kind: "logistics",
            title: "Collect bags",
            timing: { start: "20:00", certainty: "fixed" },
            optionality: "core",
            place: {
              name: "Locker",
              coordinates: { lat: 35.3, lng: 139.3 },
              certainty: "confirmed",
            },
            payload: { checklist: [{ id: "c-child", title: "Show receipt" }] },
          },
        ],
      },
    ],
    routes: [
      {
        id: "route-a-b",
        dayId: "day-1",
        fromNodeId: "a",
        toNodeId: "b",
        mode: "walking",
        source: "manual",
        certainty: "suggested",
        durationMinutes: 4,
        summary: "Four-minute walk",
        navigation: { origin: "Parent venue", destination: "Middle" },
      },
      {
        id: "route-b-c",
        dayId: "day-1",
        fromNodeId: "b",
        toNodeId: "c",
        mode: "transit",
        source: "provider",
        certainty: "confirmed",
        durationMinutes: 12,
        distanceMeters: 1800,
        summary: "Take a stale scheduled train",
        navigation: { origin: "Middle", destination: "Locker" },
      },
    ],
    candidateGroups: [
      {
        id: "dinner-group",
        parentNodeId: "a",
        mode: "single",
        options: [
          {
            id: "candidate-safe",
            title: "Selected counter",
            place: {
              name: "Selected counter",
              coordinates: { lat: 35.4, lng: 139.4 },
              provider: {
                name: "google",
                placeId: " safe-place-id ",
                secret: "must-not-leak",
              } as { name: "google"; placeId: string },
              certainty: "candidate",
              html: "<script>bad()</script>",
            } as Trip["days"][number]["nodes"][number]["place"],
            metadata: { html: "<img onerror=bad()>" },
          },
          {
            id: "candidate-booked",
            title: "Booked counter",
            booking: { status: "pending", reference: "OPTION" },
          },
        ],
      },
    ],
    reservations: [],
    tasks: [],
  };
}

describe("resolveEffectiveItinerary", () => {
  it("overlays a selected candidate defensively and falls back to the parent booking", () => {
    const mutableTrip = tripFixture();
    const snapshot = structuredClone(mutableTrip);
    const trip = deepFreeze(mutableTrip);
    const progress = {
      ...emptyTripProgress(),
      selectedCandidateIds: { "dinner-group": "candidate-safe" },
    };

    const effective = resolveEffectiveItinerary(trip, progress);
    const selected = effective.days[0]?.nodes[0];

    expect(selected).toMatchObject({
      sourceNodeId: "a",
      selectedCandidateId: "candidate-safe",
      completed: false,
      node: {
        id: "a",
        title: "Selected counter",
        place: {
          name: "Selected counter",
          coordinates: { lat: 35.4, lng: 139.4 },
          provider: { name: "google", placeId: " safe-place-id " },
          certainty: "candidate",
        },
        booking: {
          status: "confirmed",
          reference: "PARENT",
          url: "https://example.com/parent",
        },
      },
    });
    expect(selected?.node.place).not.toHaveProperty("html");
    expect(selected?.node.place?.provider).not.toHaveProperty("secret");
    expect(selected?.node).not.toHaveProperty("metadata");
    expect(trip).toEqual(snapshot);
  });

  it("rebuilds a direct owner when a candidate changes an endpoint place", () => {
    type RuntimeProviderEdge = RouteEdge & {
      providerPlan: string;
      departureTime: string;
      steps: string[];
      geometry: { encodedPolyline: string };
      preferences: { avoidTolls: boolean };
    };
    const trip = tripFixture();
    const staleEdge: RuntimeProviderEdge = {
      ...trip.routes[0],
      source: "provider",
      providerPlan: "Old venue plan",
      departureTime: "2026-08-23T18:00:00+09:00",
      steps: ["Walk from the old entrance"],
      geometry: { encodedPolyline: "stale" },
      preferences: { avoidTolls: true },
    };
    trip.routes[0] = staleEdge;

    const effective = resolveEffectiveItinerary(deepFreeze(trip), {
      ...emptyTripProgress(),
      selectedCandidateIds: { "dinner-group": "candidate-safe" },
    });
    const rebuilt = effective.routes.find(({ id }) => id === "route-a-b");

    expect(rebuilt).toMatchObject({
      id: "route-a-b",
      fromNodeId: "a",
      toNodeId: "b",
      mode: "walking",
      source: "recomposed",
      certainty: "unverified",
      navigation: { origin: "Selected counter", destination: "Middle" },
    });
    expect(rebuilt).not.toHaveProperty("durationMinutes");
    expect(rebuilt).not.toHaveProperty("distanceMeters");
    expect(rebuilt).not.toHaveProperty("summary");
    expect(rebuilt).not.toHaveProperty("providerPlan");
    expect(rebuilt).not.toHaveProperty("departureTime");
    expect(rebuilt).not.toHaveProperty("steps");
    expect(rebuilt).not.toHaveProperty("geometry");
    expect(rebuilt).not.toHaveProperty("preferences");
  });

  it("prefers an option booking over the parent booking", () => {
    const trip = deepFreeze(tripFixture());
    const effective = resolveEffectiveItinerary(trip, {
      ...emptyTripProgress(),
      selectedCandidateIds: { "dinner-group": "candidate-booked" },
    });

    expect(effective.days[0]?.nodes[0]?.node.booking).toEqual({
      status: "pending",
      reference: "OPTION",
    });
  });

  it("honors a dining node's explicit candidate-group binding amid multiple parent groups", () => {
    const trip = tripFixture();
    trip.candidateGroups.unshift({
      id: "wrong-first-group",
      parentNodeId: "a",
      mode: "single",
      defaultOptionId: "wrong-first-option",
      options: [{ id: "wrong-first-option", title: "Wrong first option" }],
    });

    const effective = resolveEffectiveItinerary(deepFreeze(trip), {
      ...emptyTripProgress(),
      selectedCandidateIds: { "dinner-group": "candidate-safe" },
    });

    expect(effective.days[0]?.nodes[0]).toMatchObject({
      selectedCandidateId: "candidate-safe",
      node: { title: "Selected counter" },
    });
  });

  it("does not follow an explicit candidate-group binding owned by another node", () => {
    const trip = tripFixture();
    const dining = trip.days[0]?.nodes[0];
    if (dining?.kind !== "dining") {
      throw new Error("fixture must begin with dining");
    }
    dining.payload.candidateGroupId = "foreign-group";
    trip.candidateGroups[0].defaultOptionId = "candidate-safe";
    trip.candidateGroups.push({
      id: "foreign-group",
      parentNodeId: "c",
      mode: "single",
      defaultOptionId: "foreign-option",
      options: [{ id: "foreign-option", title: "Foreign option" }],
    });

    const effective = resolveEffectiveItinerary(deepFreeze(trip), emptyTripProgress());

    expect(effective.days[0]?.nodes[0]).toMatchObject({
      node: { title: "Choose dinner" },
    });
    expect(effective.days[0]?.nodes[0]).not.toHaveProperty("selectedCandidateId");
  });

  it("does not guess when an unbound node has multiple parent candidate groups", () => {
    const trip = tripFixture();
    const dining = trip.days[0]?.nodes[0];
    if (dining?.kind !== "dining") {
      throw new Error("fixture must begin with dining");
    }
    delete dining.payload.candidateGroupId;
    trip.candidateGroups.push({
      id: "second-parent-group",
      parentNodeId: "a",
      mode: "single",
      defaultOptionId: "second-parent-option",
      options: [{ id: "second-parent-option", title: "Second parent option" }],
    });

    const effective = resolveEffectiveItinerary(deepFreeze(trip), {
      ...emptyTripProgress(),
      selectedCandidateIds: { "dinner-group": "candidate-safe" },
    });

    expect(effective.days[0]?.nodes[0]?.node.title).toBe("Choose dinner");
    expect(effective.days[0]?.nodes[0]).not.toHaveProperty("selectedCandidateId");
  });

  it("uses the sole parent candidate group when a node has no explicit binding", () => {
    const trip = tripFixture();
    const dining = trip.days[0]?.nodes[0];
    if (dining?.kind !== "dining") {
      throw new Error("fixture must begin with dining");
    }
    delete dining.payload.candidateGroupId;
    trip.candidateGroups[0].defaultOptionId = "candidate-safe";

    const effective = resolveEffectiveItinerary(deepFreeze(trip), emptyTripProgress());

    expect(effective.days[0]?.nodes[0]).toMatchObject({
      selectedCandidateId: "candidate-safe",
      node: { title: "Selected counter" },
    });
  });

  it("never commits or overlays a browse candidate group", () => {
    const trip = tripFixture();
    trip.candidateGroups[0].mode = "browse";

    const effective = resolveEffectiveItinerary(deepFreeze(trip), {
      ...emptyTripProgress(),
      selectedCandidateIds: { "dinner-group": "candidate-safe" },
    });

    expect(effective.days[0]?.nodes[0]?.node.title).toBe("Choose dinner");
    expect(effective.days[0]?.nodes[0]).not.toHaveProperty("selectedCandidateId");
  });

  it.each(["__proto__", "constructor", "toString"])(
    "does not read inherited progress for candidate group %s",
    (groupId) => {
      const trip = tripFixture();
      const group = trip.candidateGroups[0];
      const dining = trip.days[0]?.nodes[0];
      if (dining?.kind !== "dining") {
        throw new Error("fixture must begin with dining");
      }
      group.id = groupId;
      group.defaultOptionId = "candidate-safe";
      dining.payload.candidateGroupId = groupId;

      const effective = resolveEffectiveItinerary(deepFreeze(trip), emptyTripProgress());

      expect(effective.days[0]?.nodes[0]).toMatchObject({
        selectedCandidateId: "candidate-safe",
        node: { title: "Selected counter" },
      });

      const ownSelections = JSON.parse(
        `{${JSON.stringify(groupId)}:"candidate-booked"}`,
      ) as Record<string, string>;
      const selected = resolveEffectiveItinerary(deepFreeze(trip), {
        ...emptyTripProgress(),
        selectedCandidateIds: ownSelections,
      });
      expect(selected.days[0]?.nodes[0]).toMatchObject({
        selectedCandidateId: "candidate-booked",
        node: { title: "Booked counter" },
      });
    },
  );

  it("falls back from a stale stored selection to a valid group default", () => {
    const trip = tripFixture();
    trip.candidateGroups[0].defaultOptionId = "candidate-safe";

    const effective = resolveEffectiveItinerary(deepFreeze(trip), {
      ...emptyTripProgress(),
      selectedCandidateIds: { "dinner-group": "deleted-candidate" },
    });

    expect(effective.days[0]?.nodes[0]).toMatchObject({
      selectedCandidateId: "candidate-safe",
      node: { title: "Selected counter" },
    });
  });

  it("keeps completed logistics visible, removes skipped optionals, and recomposes routes", () => {
    const trip = deepFreeze(tripFixture());
    const effective = resolveEffectiveItinerary(trip, {
      ...emptyTripProgress(),
      skippedNodeIds: ["b", "c"],
      completedIds: [nodeCompletionKey("c")],
    });

    expect(effective.tripId).toBe("trip-resolver");
    expect(effective.days[0]?.nodes.map(({ sourceNodeId }) => sourceNodeId)).toEqual(["a", "c"]);
    expect(effective.days[0]?.nodes.find(({ sourceNodeId }) => sourceNodeId === "c")).toMatchObject({
      completed: true,
    });

    const recomposed = effective.routes[0];
    expect(recomposed).toMatchObject({
      id: "route:a--c",
      dayId: "day-1",
      fromNodeId: "a",
      toNodeId: "c",
      source: "recomposed",
      certainty: "unverified",
      navigation: { origin: "Parent venue", destination: "Locker" },
    });
    expect(recomposed).not.toHaveProperty("durationMinutes");
    expect(recomposed).not.toHaveProperty("distanceMeters");
    expect(recomposed).not.toHaveProperty("summary");
    expect(recomposed).not.toHaveProperty("providerPlan");
    expect(recomposed).not.toHaveProperty("departureTime");
    expect(recomposed).not.toHaveProperty("steps");
    expect(recomposed).not.toHaveProperty("preferences");
  });

  it("uses the node completion namespace instead of matching a bare colliding ID", () => {
    const trip = deepFreeze(tripFixture());
    const bare = resolveEffectiveItinerary(trip, {
      ...emptyTripProgress(),
      completedIds: ["c"],
    });
    const namespaced = resolveEffectiveItinerary(trip, {
      ...emptyTripProgress(),
      completedIds: [nodeCompletionKey("c")],
    });

    expect(bare.days[0]?.nodes.find(({ sourceNodeId }) => sourceNodeId === "c")?.completed).toBe(
      false,
    );
    expect(
      namespaced.days[0]?.nodes.find(({ sourceNodeId }) => sourceNodeId === "c")?.completed,
    ).toBe(true);
  });

  it("keeps distinct route owners from multiple days exactly once", () => {
    const trip = tripFixture();
    trip.endDate = "2026-08-24";
    trip.days.push({
      id: "day-2",
      date: "2026-08-24",
      title: "Second day",
      nodes: [
        {
          id: "d",
          dayId: "day-2",
          kind: "sightseeing",
          title: "D",
          timing: { start: "09:00", certainty: "suggested" },
          optionality: "core",
          payload: {},
        },
        {
          id: "e",
          dayId: "day-2",
          kind: "sightseeing",
          title: "E",
          timing: { start: "10:00", certainty: "suggested" },
          optionality: "core",
          payload: {},
        },
      ],
    });
    trip.routes.push({
      id: "route-d-e",
      dayId: "day-2",
      fromNodeId: "d",
      toNodeId: "e",
      mode: "walking",
      source: "manual",
      certainty: "suggested",
    });

    const effective = resolveEffectiveItinerary(deepFreeze(trip), emptyTripProgress());

    expect(effective.routes.map(({ id }) => id)).toEqual([
      "route-a-b",
      "route-b-c",
      "route-d-e",
    ]);
    expect(new Set(effective.routes.map(({ id }) => id)).size).toBe(effective.routes.length);
  });

  it("fails loudly in development when different days emit the same route owner ID", () => {
    const trip = tripFixture();
    trip.endDate = "2026-08-24";
    trip.days.push({
      id: "day-2",
      date: "2026-08-24",
      title: "Second day",
      nodes: [
        {
          id: "d",
          dayId: "day-2",
          kind: "sightseeing",
          title: "D",
          timing: { certainty: "unknown" },
          optionality: "core",
          payload: {},
        },
        {
          id: "e",
          dayId: "day-2",
          kind: "sightseeing",
          title: "E",
          timing: { certainty: "unknown" },
          optionality: "core",
          payload: {},
        },
      ],
    });
    trip.routes.push({
      id: "route-a-b",
      dayId: "day-2",
      fromNodeId: "d",
      toNodeId: "e",
      mode: "walking",
      source: "manual",
      certainty: "suggested",
    });

    expect(() =>
      resolveEffectiveItinerary(deepFreeze(trip), emptyTripProgress(), {
        onDuplicateRoute: "throw",
      }),
    ).toThrow(/duplicate route owner.*route-a-b/i);

    const resolved = resolveEffectiveItinerary(deepFreeze(trip), emptyTripProgress());
    const ownerIds = resolved.routes.map((route) => route.id);
    expect(new Set(ownerIds).size).toBe(ownerIds.length);
  });
});
