import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Trip } from "../trip-core/model";
import {
  checklistCompletionKey,
  emptyTripProgress,
  nodeCompletionKey,
  taskCompletionKey,
  type TripProgressV1,
} from "../trip-core/progress";
import {
  tripProgressStorageKey,
  useTripProgress,
  type TripProgressController,
} from "./useTripProgress";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
  });
});

function twoDayTrip(id = "trip-alpha"): Trip {
  return {
    id,
    title: "Synthetic progress trip",
    timezone: "Etc/UTC",
    startDate: "2040-06-12",
    endDate: "2040-06-13",
    days: [
      {
        id: "day-one",
        date: "2040-06-12",
        title: "Day one",
        nodes: [
          {
            id: "optional-one",
            dayId: "day-one",
            kind: "shopping",
            title: "First shop",
            timing: { certainty: "unknown" },
            optionality: "optional",
            payload: {
              items: [{ id: "item-one", title: "First item" }],
            },
          },
          {
            id: "logistics-one",
            dayId: "day-one",
            kind: "logistics",
            title: "First logistics",
            timing: { certainty: "unknown" },
            optionality: "core",
            payload: {
              checklist: [{ id: "check-one", title: "First check" }],
            },
          },
        ],
      },
      {
        id: "day-two",
        date: "2040-06-13",
        title: "Day two",
        nodes: [
          {
            id: "dining-two",
            dayId: "day-two",
            kind: "dining",
            title: "Second meal",
            timing: { certainty: "unknown" },
            optionality: "candidate",
            payload: { candidateGroupId: "group-two" },
          },
          {
            id: "shopping-two",
            dayId: "day-two",
            kind: "shopping",
            title: "Second shop",
            timing: { certainty: "unknown" },
            optionality: "core",
            payload: {
              items: [{ id: "item-two", title: "Second item" }],
            },
          },
        ],
      },
    ],
    routes: [],
    candidateGroups: [
      {
        id: "group-two",
        parentNodeId: "dining-two",
        mode: "single",
        defaultOptionId: "meal-two-a",
        options: [{ id: "meal-two-a", title: "Meal two A" }],
      },
    ],
    reservations: [],
    tasks: [
      { id: "task-one", title: "First task", scope: "day", dayId: "day-one" },
      { id: "task-two", title: "Second task", scope: "day", dayId: "day-two" },
    ],
  };
}

interface HarnessProps {
  trip: Trip;
  onController?: (controller: TripProgressController) => void;
}

function Harness({ trip, onController }: HarnessProps) {
  const controller = useTripProgress(trip);

  useEffect(() => {
    onController?.(controller);
  }, [controller, onController]);

  return (
    <div>
      <output aria-label="hydrated">{controller.hydrated ? "yes" : "no"}</output>
      <output aria-label="persistence status">{controller.persistenceStatus}</output>
      <output aria-label="progress">{JSON.stringify(controller.progress)}</output>
      <button
        type="button"
        onClick={() => controller.selectCandidate("group-two", "meal-two-b")}
      >
        choose meal B
      </button>
      <button
        type="button"
        onClick={() => controller.setShoppingStatus("item-one", "purchased")}
      >
        purchase first item
      </button>
      <button
        type="button"
        onClick={() => controller.setSkipped("optional-one", true)}
      >
        skip first stop
      </button>
      <button
        type="button"
        onClick={() => controller.setCompleted(taskCompletionKey("task-one"), true)}
      >
        complete first task
      </button>
      <button type="button" onClick={() => controller.resetDay("day-one")}>
        reset first day
      </button>
    </div>
  );
}

function readProgress(): TripProgressV1 {
  return JSON.parse(screen.getByLabelText("progress").textContent ?? "null") as TripProgressV1;
}

function dispatchStorage(key: string, newValue: string | null): void {
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
  });
}

describe("useTripProgress", () => {
  it("hydrates one atomic state in StrictMode without echoing or writing an empty schema", async () => {
    const trip = twoDayTrip();
    const seeded: TripProgressV1 = {
      version: 1,
      selectedCandidateIds: { "group-two": "meal-two-a" },
      shoppingStatuses: { "item-one": "purchased" },
      skippedNodeIds: ["optional-one"],
      completedIds: [taskCompletionKey("task-one")],
    };
    const key = tripProgressStorageKey(trip.id);
    window.localStorage.setItem(key, JSON.stringify(seeded));
    const write = vi.spyOn(window.localStorage, "setItem");

    render(
      <StrictMode>
        <Harness trip={trip} />
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByLabelText("hydrated")).toHaveTextContent("yes"));
    expect(readProgress()).toEqual(seeded);
    expect(screen.getByLabelText("persistence status")).toHaveTextContent("persistent");
    await act(async () => Promise.resolve());
    expect(write).not.toHaveBeenCalled();
  });

  it("isolates exact trip keys and never writes the previous trip into the next key", async () => {
    const alpha = twoDayTrip("trip-alpha");
    const beta = twoDayTrip("trip-beta");
    const alphaProgress: TripProgressV1 = {
      ...emptyTripProgress(),
      shoppingStatuses: { "item-one": "purchased" },
    };
    const betaProgress: TripProgressV1 = {
      ...emptyTripProgress(),
      shoppingStatuses: { "item-two": "unavailable" },
    };
    const alphaKey = tripProgressStorageKey(alpha.id);
    const betaKey = tripProgressStorageKey(beta.id);
    window.localStorage.setItem(alphaKey, JSON.stringify(alphaProgress));
    window.localStorage.setItem(betaKey, JSON.stringify(betaProgress));
    const write = vi.spyOn(window.localStorage, "setItem");
    const { rerender } = render(<Harness trip={alpha} />);
    await waitFor(() => expect(readProgress()).toEqual(alphaProgress));

    rerender(<Harness trip={beta} />);
    await waitFor(() => expect(readProgress()).toEqual(betaProgress));

    const betaWrites = write.mock.calls
      .filter(([writtenKey]) => writtenKey === betaKey)
      .map(([, payload]) => payload);
    expect(betaWrites).not.toContain(JSON.stringify(alphaProgress));
    expect(window.localStorage.getItem(alphaKey)).toBe(JSON.stringify(alphaProgress));
    expect(window.localStorage.getItem(betaKey)).toBe(JSON.stringify(betaProgress));
  });

  it("keeps memory actions operational when storage reads fail", async () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("read blocked", "SecurityError");
    });
    const write = vi.spyOn(window.localStorage, "setItem");
    const user = userEvent.setup();
    render(<Harness trip={twoDayTrip()} />);
    await waitFor(() => expect(screen.getByLabelText("hydrated")).toHaveTextContent("yes"));
    expect(screen.getByLabelText("persistence status")).toHaveTextContent("memory-only");
    expect(write).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "purchase first item" }));
    expect(readProgress().shoppingStatuses).toEqual({ "item-one": "purchased" });
    expect(write).not.toHaveBeenCalled();
  });

  it("keeps memory actions operational when storage writes fail", async () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("write blocked", "QuotaExceededError");
    });
    const user = userEvent.setup();
    render(<Harness trip={twoDayTrip()} />);
    await waitFor(() => expect(screen.getByLabelText("hydrated")).toHaveTextContent("yes"));

    await user.click(screen.getByRole("button", { name: "skip first stop" }));
    expect(readProgress().skippedNodeIds).toEqual(["optional-one"]);
    await waitFor(() =>
      expect(screen.getByLabelText("persistence status")).toHaveTextContent("memory-only"),
    );
  });

  it("adopts valid exact-key storage events without echoing and ignores malformed or wrong-key events", async () => {
    const trip = twoDayTrip();
    const key = tripProgressStorageKey(trip.id);
    const external: TripProgressV1 = {
      ...emptyTripProgress(),
      shoppingStatuses: { "item-one": "purchased" },
      completedIds: [taskCompletionKey("task-one")],
    };
    const write = vi.spyOn(window.localStorage, "setItem");
    render(<Harness trip={trip} />);
    await waitFor(() => expect(screen.getByLabelText("hydrated")).toHaveTextContent("yes"));
    write.mockClear();

    dispatchStorage("eternal-pose:trip-progress:v1:wrong-trip", JSON.stringify(external));
    dispatchStorage(key, "{malformed");
    dispatchStorage(key, JSON.stringify({ version: 1 }));
    dispatchStorage(key, null);
    expect(readProgress()).toEqual(emptyTripProgress());

    dispatchStorage(key, JSON.stringify(external));
    expect(readProgress()).toEqual(external);
    await act(async () => Promise.resolve());
    expect(write).not.toHaveBeenCalled();
  });

  it("lets a second active controller retain fields synchronized from the first controller", async () => {
    const trip = twoDayTrip();
    const key = tripProgressStorageKey(trip.id);
    const user = userEvent.setup();
    const write = vi.spyOn(window.localStorage, "setItem");
    render(
      <>
        <section aria-label="first controller">
          <Harness trip={trip} />
        </section>
        <section aria-label="second controller">
          <Harness trip={trip} />
        </section>
      </>,
    );
    const first = screen.getByRole("region", { name: "first controller" });
    const second = screen.getByRole("region", { name: "second controller" });
    await waitFor(() =>
      expect(within(first).getByLabelText("hydrated")).toHaveTextContent("yes"),
    );
    await waitFor(() =>
      expect(within(second).getByLabelText("hydrated")).toHaveTextContent("yes"),
    );

    await user.click(within(first).getByRole("button", { name: "purchase first item" }));
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem(key) ?? "null")).toMatchObject({
        shoppingStatuses: { "item-one": "purchased" },
      }),
    );
    const firstPayload = window.localStorage.getItem(key);
    write.mockClear();
    dispatchStorage(key, firstPayload);
    expect(
      JSON.parse(within(second).getByLabelText("progress").textContent ?? "null"),
    ).toMatchObject({ shoppingStatuses: { "item-one": "purchased" } });
    expect(write).not.toHaveBeenCalled();

    await user.click(within(second).getByRole("button", { name: "complete first task" }));
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem(key) ?? "null")).toEqual({
        ...emptyTripProgress(),
        shoppingStatuses: { "item-one": "purchased" },
        completedIds: [taskCompletionKey("task-one")],
      }),
    );
  });

  it("keeps every action callback stable across progress updates and equivalent trip objects", async () => {
    const controllers: TripProgressController[] = [];
    const capture = (controller: TripProgressController): void => {
      controllers.push(controller);
    };
    const trip = twoDayTrip();
    const user = userEvent.setup();
    const { rerender } = render(<Harness trip={trip} onController={capture} />);
    await waitFor(() => expect(screen.getByLabelText("hydrated")).toHaveTextContent("yes"));
    const first = controllers.at(-1);
    expect(first).toBeDefined();

    await user.click(screen.getByRole("button", { name: "complete first task" }));
    rerender(<Harness trip={structuredClone(trip)} onController={capture} />);
    await waitFor(() => expect(controllers.length).toBeGreaterThan(1));
    const latest = controllers.at(-1);

    for (const callback of [
      "selectCandidate",
      "setShoppingStatus",
      "setSkipped",
      "setCompleted",
      "resetDay",
    ] as const) {
      expect(latest?.[callback]).toBe(first?.[callback]);
    }
  });

  it("derives reset scope from full trip content and preserves every other-day value", async () => {
    const trip = twoDayTrip();
    const seeded: TripProgressV1 = {
      version: 1,
      selectedCandidateIds: { "group-two": "meal-two-a" },
      shoppingStatuses: {
        "item-one": "purchased",
        "item-two": "unavailable",
      },
      skippedNodeIds: ["optional-one"],
      completedIds: [
        nodeCompletionKey("logistics-one"),
        checklistCompletionKey("check-one"),
        taskCompletionKey("task-one"),
        taskCompletionKey("task-two"),
      ],
    };
    window.localStorage.setItem(tripProgressStorageKey(trip.id), JSON.stringify(seeded));
    const user = userEvent.setup();
    render(<Harness trip={trip} />);
    await waitFor(() => expect(readProgress()).toEqual(seeded));

    await user.click(screen.getByRole("button", { name: "reset first day" }));
    expect(readProgress()).toEqual({
      version: 1,
      selectedCandidateIds: { "group-two": "meal-two-a" },
      shoppingStatuses: { "item-two": "unavailable" },
      skippedNodeIds: [],
      completedIds: [taskCompletionKey("task-two")],
    });
  });

  it("hydrates and resets prototype-shaped IDs under StrictMode without inherited lookup", async () => {
    const trip = twoDayTrip("prototype-trip");
    const dayOne = trip.days[0];
    const shopping = dayOne?.nodes.find(({ kind }) => kind === "shopping");
    const candidateNode = trip.days[1]?.nodes.find(({ kind }) => kind === "dining");
    if (dayOne === undefined || shopping?.kind !== "shopping" || candidateNode === undefined) {
      throw new Error("Prototype progress fixture is incomplete");
    }
    shopping.payload.items[0] = { id: "constructor", title: "Prototype item" };
    candidateNode.id = "toString";
    trip.candidateGroups[0] = {
      id: "__proto__",
      parentNodeId: "toString",
      mode: "single",
      defaultOptionId: "candidate-prototype",
      options: [{ id: "candidate-prototype", title: "Prototype candidate" }],
    };
    dayOne.nodes.push(candidateNode);
    trip.days[1].nodes = trip.days[1].nodes.filter(({ id }) => id !== "toString");
    const selectedCandidateIds = Object.fromEntries([
      ["__proto__", "candidate-prototype"],
      ["other-group", "keep-candidate"],
    ]);
    const shoppingStatuses = Object.fromEntries([
      ["constructor", "purchased"],
      ["other-item", "unavailable"],
    ]) as TripProgressV1["shoppingStatuses"];
    window.localStorage.setItem(
      tripProgressStorageKey(trip.id),
      JSON.stringify({
        ...emptyTripProgress(),
        selectedCandidateIds,
        shoppingStatuses,
      } satisfies TripProgressV1),
    );
    const user = userEvent.setup();
    render(
      <StrictMode>
        <Harness trip={trip} />
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByLabelText("hydrated")).toHaveTextContent("yes"));
    expect(Object.hasOwn(readProgress().selectedCandidateIds, "__proto__")).toBe(true);
    expect(Object.hasOwn(readProgress().shoppingStatuses, "constructor")).toBe(true);

    await user.click(screen.getByRole("button", { name: "reset first day" }));
    expect(readProgress()).toMatchObject({
      selectedCandidateIds: { "other-group": "keep-candidate" },
      shoppingStatuses: { "other-item": "unavailable" },
    });
    expect(Object.hasOwn(readProgress().selectedCandidateIds, "__proto__")).toBe(false);
    expect(Object.hasOwn(readProgress().shoppingStatuses, "constructor")).toBe(false);
  });
});
