import { describe, expect, it } from "vitest";

import type { Trip } from "./model";
import { emptyTripProgress } from "./progress";
import { resolveEffectiveItinerary } from "./resolve-itinerary";

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

  it("keeps completed logistics visible, removes skipped optionals, and recomposes routes", () => {
    const trip = deepFreeze(tripFixture());
    const effective = resolveEffectiveItinerary(trip, {
      ...emptyTripProgress(),
      skippedNodeIds: ["b", "c"],
      completedIds: ["c"],
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
});
