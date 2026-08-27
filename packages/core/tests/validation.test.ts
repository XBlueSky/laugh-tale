import { describe, expect, it } from "vitest";

import { completeTrip } from "./fixtures/complete-trip.js";
import type { Trip } from "@laugh-tale-island/core";
import { assertValidTrip, validateTrip } from "@laugh-tale-island/core";

const cloneTrip = (): Trip => structuredClone(completeTrip);

describe("validateTrip", () => {
  it("accepts a complete provider-neutral trip", () => {
    expect(validateTrip(completeTrip)).toEqual({ errors: [], warnings: [] });
  });

  it("covers all built-in node kinds and one explicit custom kind", () => {
    expect(
      new Set(completeTrip.days.flatMap((day) => day.nodes.map((node) => node.kind))),
    ).toEqual(
      new Set([
        "transport",
        "transfer",
        "lodging",
        "dining",
        "shopping",
        "sightseeing",
        "experience",
        "logistics",
        "custom",
      ]),
    );
  });

  it("uses unique persistent IDs throughout the complete fixture", () => {
    const ids = [
      completeTrip.id,
      ...completeTrip.days.flatMap((day) => [
        day.id,
        ...day.nodes.flatMap((node) => {
          const childIds =
            node.kind === "shopping"
              ? node.payload.items.map((item) => item.id)
              : node.kind === "lodging" || node.kind === "logistics"
                ? (node.payload.checklist ?? []).map((item) => item.id)
                : [];
          return [node.id, ...childIds];
        }),
      ]),
      ...completeTrip.routes.map((route) => route.id),
      ...completeTrip.candidateGroups.flatMap((group) => [
        group.id,
        ...group.options.map((option) => option.id),
      ]),
      ...completeTrip.reservations.map((reservation) => reservation.id),
      ...completeTrip.tasks.flatMap((task) => [
        task.id,
        ...(task.children ?? []).map((child) => child.id),
      ]),
    ];

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves every route endpoint to a node on the route day", () => {
    const nodesByDay = new Map(
      completeTrip.days.map((day) => [day.id, new Set(day.nodes.map((node) => node.id))]),
    );

    for (const route of completeTrip.routes) {
      expect(nodesByDay.get(route.dayId)?.has(route.fromNodeId)).toBe(true);
      expect(nodesByDay.get(route.dayId)?.has(route.toNodeId)).toBe(true);
    }
  });

  const invalidCases: Array<{
    name: string;
    mutate: (trip: Trip) => void;
    issue: { code: string; path: string };
  }> = [
    {
      name: "blank node ID",
      mutate: (trip) => {
        trip.days[0].nodes[0].id = "  ";
      },
      issue: { code: "BLANK_ID", path: "days[0].nodes[0].id" },
    },
    {
      name: "globally duplicate node ID",
      mutate: (trip) => {
        const duplicateNode = structuredClone(trip.days[0].nodes[0]);
        duplicateNode.dayId = "day-2040-06-13";
        trip.endDate = "2040-06-13";
        trip.days.push({
          id: "day-2040-06-13",
          date: "2040-06-13",
          title: "Second synthetic day",
          nodes: [duplicateNode],
        });
      },
      issue: { code: "DUPLICATE_ID", path: "days[1].nodes[0].id" },
    },
    {
      name: "globally duplicate candidate option ID",
      mutate: (trip) => {
        trip.candidateGroups.push({
          id: "candidate-group-second",
          parentNodeId: "node-shopping",
          mode: "browse",
          options: [structuredClone(trip.candidateGroups[0].options[0])],
        });
      },
      issue: {
        code: "DUPLICATE_ID",
        path: "candidateGroups[1].options[0].id",
      },
    },
    {
      name: "missing route start endpoint",
      mutate: (trip) => {
        trip.routes[0].fromNodeId = "node-missing";
      },
      issue: {
        code: "UNKNOWN_ROUTE_ENDPOINT",
        path: "routes[0].fromNodeId",
      },
    },
    {
      name: "missing route end endpoint",
      mutate: (trip) => {
        trip.routes[0].toNodeId = "node-missing";
      },
      issue: {
        code: "UNKNOWN_ROUTE_ENDPOINT",
        path: "routes[0].toNodeId",
      },
    },
    {
      name: "latitude outside its range",
      mutate: (trip) => {
        trip.days[0].nodes[0].place!.coordinates!.lat = 90.1;
      },
      issue: {
        code: "INVALID_COORDINATE",
        path: "days[0].nodes[0].place.coordinates.lat",
      },
    },
    {
      name: "non-finite longitude",
      mutate: (trip) => {
        trip.days[0].nodes[0].place!.coordinates!.lng = Number.NaN;
      },
      issue: {
        code: "INVALID_COORDINATE",
        path: "days[0].nodes[0].place.coordinates.lng",
      },
    },
    {
      name: "blank provider Place ID",
      mutate: (trip) => {
        trip.days[0].nodes[0].place!.provider = { name: "google", placeId: "  " };
      },
      issue: {
        code: "BLANK_PROVIDER_PLACE_ID",
        path: "days[0].nodes[0].place.provider.placeId",
      },
    },
    {
      name: "unsafe node booking URL",
      mutate: (trip) => {
        trip.days[0].nodes[6].booking!.url = "http://example.com/unsafe";
      },
      issue: {
        code: "UNSAFE_BOOKING_URL",
        path: "days[0].nodes[6].booking.url",
      },
    },
    {
      name: "unsafe candidate booking URL",
      mutate: (trip) => {
        trip.candidateGroups[0].options[0].booking!.url = "javascript:alert(1)";
      },
      issue: {
        code: "UNSAFE_BOOKING_URL",
        path: "candidateGroups[0].options[0].booking.url",
      },
    },
    {
      name: "unsafe reservation booking URL",
      mutate: (trip) => {
        trip.reservations[0].booking.url = "ftp://example.com/booking";
      },
      issue: {
        code: "UNSAFE_BOOKING_URL",
        path: "reservations[0].booking.url",
      },
    },
    {
      name: "fractional arrival buffer",
      mutate: (trip) => {
        trip.days[0].nodes[6].booking!.arrivalBufferMinutes = 2.5;
      },
      issue: {
        code: "INVALID_ARRIVAL_BUFFER",
        path: "days[0].nodes[6].booking.arrivalBufferMinutes",
      },
    },
    {
      name: "negative arrival buffer",
      mutate: (trip) => {
        trip.reservations[0].booking.arrivalBufferMinutes = -1;
      },
      issue: {
        code: "INVALID_ARRIVAL_BUFFER",
        path: "reservations[0].booking.arrivalBufferMinutes",
      },
    },
    {
      name: "malformed trip date",
      mutate: (trip) => {
        trip.startDate = "2040-02-30";
      },
      issue: { code: "INVALID_DATE", path: "startDate" },
    },
    {
      name: "malformed day date",
      mutate: (trip) => {
        trip.days[0].date = "June 12";
      },
      issue: { code: "INVALID_DATE", path: "days[0].date" },
    },
    {
      name: "malformed start time",
      mutate: (trip) => {
        trip.days[0].nodes[0].timing.start = "24:00";
      },
      issue: { code: "INVALID_TIME", path: "days[0].nodes[0].timing.start" },
    },
    {
      name: "malformed end time",
      mutate: (trip) => {
        trip.days[0].nodes[0].timing.end = "8:20";
      },
      issue: { code: "INVALID_TIME", path: "days[0].nodes[0].timing.end" },
    },
    {
      name: "candidate node without a group",
      mutate: (trip) => {
        const dining = trip.days[0].nodes[3];
        if (dining.kind === "dining") {
          delete dining.payload.candidateGroupId;
        }
        trip.candidateGroups = [];
      },
      issue: {
        code: "CANDIDATE_GROUP_REQUIRED",
        path: "days[0].nodes[3].optionality",
      },
    },
    {
      name: "default option on a browse group",
      mutate: (trip) => {
        trip.candidateGroups[0].mode = "browse";
      },
      issue: {
        code: "BROWSE_DEFAULT_FORBIDDEN",
        path: "candidateGroups[0].defaultOptionId",
      },
    },
    {
      name: "single group default outside its options",
      mutate: (trip) => {
        trip.candidateGroups[0].defaultOptionId = "candidate-missing";
      },
      issue: {
        code: "UNKNOWN_DEFAULT_OPTION",
        path: "candidateGroups[0].defaultOptionId",
      },
    },
    {
      name: "custom node without a declared capability",
      mutate: (trip) => {
        const custom = trip.days[0].nodes[8];
        if (custom.kind === "custom") {
          custom.payload.capabilities = {};
        }
      },
      issue: {
        code: "CUSTOM_CAPABILITIES_REQUIRED",
        path: "days[0].nodes[8].payload.capabilities",
      },
    },
    {
      name: "task with exactly one nested child",
      mutate: (trip) => {
        trip.tasks[0].children = [{ id: "only-child", title: "Only child" }];
      },
      issue: { code: "SINGLE_CHILD_TASK", path: "tasks[0].children" },
    },
    {
      name: "reservation owner outside node and candidate namespaces",
      mutate: (trip) => {
        trip.reservations[0].ownerId = "owner-missing";
      },
      issue: {
        code: "UNKNOWN_RESERVATION_OWNER",
        path: "reservations[0].ownerId",
      },
    },
  ];

  it.each(invalidCases)("rejects $name", ({ mutate, issue }) => {
    const trip = cloneTrip();
    mutate(trip);

    expect(validateTrip(trip).errors).toContainEqual(expect.objectContaining(issue));
  });

  it("preserves valid nonblank IDs byte-for-byte", () => {
    const trip = cloneTrip();
    trip.id = "  trip-complete  ";

    expect(validateTrip(trip)).toEqual({ errors: [], warnings: [] });
    expect(trip.id).toBe("  trip-complete  ");
  });

  it("warns when a place is unresolved without treating it as invalid", () => {
    const trip = cloneTrip();
    trip.days[0].nodes[0].place = {
      name: "Unresolved synthetic stop",
      certainty: "unverified",
    };

    expect(validateTrip(trip)).toEqual({
      errors: [],
      warnings: [
        {
          code: "UNRESOLVED_PLACE",
          path: "days[0].nodes[0].place",
          message: "Place has neither coordinates nor a provider Place ID.",
        },
      ],
    });
  });

  it("warns when a fixed experience lacks a confirmed booking", () => {
    const trip = cloneTrip();
    trip.days[0].nodes[6].booking = { status: "pending" };

    expect(validateTrip(trip)).toEqual({
      errors: [],
      warnings: [
        {
          code: "FIXED_EXPERIENCE_WITHOUT_CONFIRMED_BOOKING",
          path: "days[0].nodes[6].booking",
          message: "A fixed experience should have a confirmed booking.",
        },
      ],
    });
  });
});

describe("assertValidTrip", () => {
  it("returns normally for a valid trip", () => {
    expect(() => assertValidTrip(completeTrip)).not.toThrow();
  });

  it("throws when validation reports an error", () => {
    const trip = cloneTrip();
    trip.days[0].nodes[0].id = "";

    expect(() => assertValidTrip(trip)).toThrow(/BLANK_ID.*days\[0\]\.nodes\[0\]\.id/);
  });
});
