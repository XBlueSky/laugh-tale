import { describe, expect, it } from "vitest";

import { completeTrip } from "./fixtures/complete-trip.js";
import type { Trip } from "@laugh-tale/core";
import {
  collectDayProgressScope,
  checklistCompletionKey,
  emptyTripProgress,
  nodeCompletionKey,
  parseTripProgress,
  taskCompletionKey,
  tripProgressReducer,
  type TripProgressV1,
} from "@laugh-tale/core";

const validProgress: TripProgressV1 = {
  version: 1,
  selectedCandidateIds: { "group-1": "candidate-1" },
  shoppingStatuses: {
    "item-1": "pending",
    "item-2": "purchased",
    "item-3": "unavailable",
    "item-4": "skipped",
  },
  skippedNodeIds: ["optional-1"],
  completedIds: ["node-1"],
};

function progressJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...validProgress, ...overrides });
}

describe("parseTripProgress", () => {
  it("returns independent fresh values for absent, malformed, and wrong-version payloads", () => {
    const absent = parseTripProgress(null);
    const malformed = parseTripProgress("not-json");
    const wrongVersion = parseTripProgress(progressJson({ version: 2 }));

    expect(absent).toEqual(emptyTripProgress());
    expect(malformed).toEqual(emptyTripProgress());
    expect(wrongVersion).toEqual(emptyTripProgress());
    expect(absent).not.toBe(malformed);
    expect(absent.selectedCandidateIds).not.toBe(malformed.selectedCandidateIds);
    expect(absent.completedIds).not.toBe(malformed.completedIds);
  });

  it.each([
    ["a missing candidate collection", { selectedCandidateIds: undefined }],
    ["an array candidate collection", { selectedCandidateIds: [] }],
    ["a non-string candidate", { selectedCandidateIds: { "group-1": 3 } }],
    ["a blank candidate-group ID", { selectedCandidateIds: { "  ": "candidate-1" } }],
    ["a blank candidate ID", { selectedCandidateIds: { "group-1": "\n" } }],
    ["a missing shopping collection", { shoppingStatuses: undefined }],
    ["an array shopping collection", { shoppingStatuses: [] }],
    ["a blank shopping ID", { shoppingStatuses: { "\t": "pending" } }],
    ["an invalid shopping status", { shoppingStatuses: { "item-1": "sold-out" } }],
    ["a missing skipped collection", { skippedNodeIds: undefined }],
    ["a non-string skipped ID", { skippedNodeIds: ["optional-1", 4] }],
    ["a blank skipped ID", { skippedNodeIds: [""] }],
    ["a missing completion collection", { completedIds: undefined }],
    ["a non-string completion ID", { completedIds: [false] }],
    ["a blank completion ID", { completedIds: [" \r"] }],
    ["an extra top-level collection", { unexpected: {} }],
  ])("rejects the whole payload for %s", (_label, overrides) => {
    expect(parseTripProgress(progressJson(overrides))).toEqual(emptyTripProgress());
  });

  it("preserves every accepted nonblank string byte-for-byte", () => {
    const progress: TripProgressV1 = {
      version: 1,
      selectedCandidateIds: { " group-1 ": " candidate-1 " },
      shoppingStatuses: { " item-1 ": "pending" },
      skippedNodeIds: [" optional-1 "],
      completedIds: [" node-1 "],
    };

    expect(parseTripProgress(JSON.stringify(progress))).toEqual(progress);
  });
});

describe("tripProgressReducer", () => {
  it("updates every axis without mutating its frozen input", () => {
    const initial = Object.freeze({
      ...emptyTripProgress(),
      selectedCandidateIds: Object.freeze({}),
      shoppingStatuses: Object.freeze({}),
      skippedNodeIds: Object.freeze([]) as unknown as string[],
      completedIds: Object.freeze([]) as unknown as string[],
    });

    const selected = tripProgressReducer(initial, {
      type: "select-candidate",
      groupId: "group-1",
      candidateId: "candidate-1",
    });
    const shopped = tripProgressReducer(selected, {
      type: "set-shopping-status",
      itemId: "item-1",
      status: "unavailable",
    });
    const skipped = tripProgressReducer(shopped, {
      type: "set-node-skipped",
      nodeId: "optional-1",
      skipped: true,
    });
    const completed = tripProgressReducer(skipped, {
      type: "set-completed",
      id: nodeCompletionKey("node-1"),
      completed: true,
    });

    expect(completed).toEqual({
      version: 1,
      selectedCandidateIds: { "group-1": "candidate-1" },
      shoppingStatuses: { "item-1": "unavailable" },
      skippedNodeIds: ["optional-1"],
      completedIds: ["node:node-1"],
    });
    expect(initial).toEqual(emptyTripProgress());
  });

  it("returns the same state for repeated additions, assignments, and removals", () => {
    const skipped = tripProgressReducer(emptyTripProgress(), {
      type: "set-node-skipped",
      nodeId: "optional-1",
      skipped: true,
    });
    expect(
      tripProgressReducer(skipped, {
        type: "set-node-skipped",
        nodeId: "optional-1",
        skipped: true,
      }),
    ).toBe(skipped);

    const selected = tripProgressReducer(skipped, {
      type: "select-candidate",
      groupId: "group-1",
      candidateId: "candidate-1",
    });
    expect(
      tripProgressReducer(selected, {
        type: "select-candidate",
        groupId: "group-1",
        candidateId: "candidate-1",
      }),
    ).toBe(selected);

    const unskipped = tripProgressReducer(selected, {
      type: "set-node-skipped",
      nodeId: "optional-1",
      skipped: false,
    });
    expect(
      tripProgressReducer(unskipped, {
        type: "set-node-skipped",
        nodeId: "optional-1",
        skipped: false,
      }),
    ).toBe(unskipped);
  });
});

describe("day-scoped reset", () => {
  it("collects candidate groups, every shopping item, optionals, roots, nested IDs, and day tasks", () => {
    const trip = structuredClone(completeTrip);
    const dayTask = trip.tasks.find((task) => task.id === "task-day-water");
    if (dayTask === undefined) {
      throw new Error("complete fixture must include the day task");
    }
    dayTask.children = [
      { id: "task-day-child-a", title: "First" },
      { id: "task-day-child-b", title: "Second" },
    ];
    const shopping = trip.days[0]?.nodes.find((node) => node.kind === "shopping");
    if (shopping?.kind !== "shopping") {
      throw new Error("complete fixture must include shopping");
    }
    shopping.payload.items.push({ id: "shopping-item-second", title: "Second item" });

    expect(collectDayProgressScope(trip, "day-2040-06-12")).toEqual({
      candidateGroupIds: ["candidate-group-lunch"],
      shoppingItemIds: ["shopping-item-journal", "shopping-item-second"],
      skippedNodeIds: ["node-shopping", "node-custom"],
      completionIds: [
        "node:node-transport",
        "node:node-transfer",
        "node:node-lodging",
        "checklist:checklist-lodging-document",
        "node:node-dining",
        "node:node-shopping",
        "node:node-sightseeing",
        "node:node-experience",
        "node:node-logistics",
        "checklist:checklist-logistics-receipt",
        "node:node-custom",
        "task:task-day-water",
        "checklist:task-day-child-a",
        "checklist:task-day-child-b",
      ],
    });
  });

  it("removes exactly one day's scope while preserving other-day progress", () => {
    const scope = collectDayProgressScope(completeTrip, "day-2040-06-12");
    const initial: TripProgressV1 = {
      version: 1,
      selectedCandidateIds: {
        "candidate-group-lunch": "candidate-lunch-a",
        "other-group": "other-candidate",
      },
      shoppingStatuses: {
        "shopping-item-journal": "purchased",
        "other-item": "unavailable",
      },
      skippedNodeIds: ["node-shopping", "other-optional"],
      completedIds: [
        nodeCompletionKey("node-logistics"),
        checklistCompletionKey("checklist-logistics-receipt"),
        taskCompletionKey("other-task"),
      ],
    };
    const snapshot = structuredClone(initial);

    expect(tripProgressReducer(initial, { type: "reset-day", scope })).toEqual({
      version: 1,
      selectedCandidateIds: { "other-group": "other-candidate" },
      shoppingStatuses: { "other-item": "unavailable" },
      skippedNodeIds: ["other-optional"],
      completedIds: ["task:other-task"],
    });
    expect(initial).toEqual(snapshot);
  });

  it("returns empty scope for an unknown day", () => {
    expect(collectDayProgressScope({ ...completeTrip } satisfies Trip, "missing-day")).toEqual({
      candidateGroupIds: [],
      shoppingItemIds: [],
      skippedNodeIds: [],
      completionIds: [],
    });
  });

  it("does not reset a same-text completion owned by another namespace and day", () => {
    const trip: Trip = {
      id: "collision-trip",
      title: "Collision trip",
      timezone: "Asia/Tokyo",
      startDate: "2026-08-23",
      endDate: "2026-08-24",
      days: [
        {
          id: "day-1",
          date: "2026-08-23",
          title: "First day",
          nodes: [
            {
              id: "shared",
              dayId: "day-1",
              kind: "logistics",
              title: "First-day logistics",
              timing: { certainty: "unknown" },
              optionality: "core",
              payload: { checklist: [{ id: "shared", title: "Shared checklist" }] },
            },
          ],
        },
        { id: "day-2", date: "2026-08-24", title: "Second day", nodes: [] },
      ],
      routes: [],
      candidateGroups: [],
      reservations: [],
      tasks: [
        { id: "shared", title: "Second-day task", scope: "day", dayId: "day-2" },
      ],
    };
    const initial: TripProgressV1 = {
      ...emptyTripProgress(),
      completedIds: [
        nodeCompletionKey("shared"),
        checklistCompletionKey("shared"),
        taskCompletionKey("shared"),
      ],
    };

    expect(
      tripProgressReducer(initial, {
        type: "reset-day",
        scope: collectDayProgressScope(trip, "day-1"),
      }).completedIds,
    ).toEqual(["task:shared"]);
  });
});
