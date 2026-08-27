import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { completeTrip } from "../../trip-content/fixtures/complete-trip";
import type { TripNode } from "@laugh-tale/core";
import type { TimelineNodeState } from "../timeline/TimelineEntry";
import { TimelineEntry } from "../timeline/TimelineEntry";
import {
  rendererFor,
  rendererRegistry,
} from "./CustomEntry";

afterEach(cleanup);

function state(overrides: Partial<TimelineNodeState> = {}): TimelineNodeState {
  return {
    completed: false,
    current: false,
    dayDate: "2040-06-12",
    position: "middle",
    completedChecklistIds: new Set<string>(),
    shoppingStatuses: {},
    ...overrides,
  };
}

function renderNode(node: TripNode, stateOverrides: Partial<TimelineNodeState> = {}) {
  const Renderer = rendererFor(node);
  return render(
    <TimelineEntry
      node={node}
      state={state(stateOverrides)}
      selected={false}
      onSelect={() => undefined}
      Renderer={Renderer}
    />,
  );
}

function fixture<K extends TripNode["kind"]>(
  kind: K,
): Extract<TripNode, { kind: K }> {
  const node = completeTrip.days[0]?.nodes.find(
    (candidate): candidate is Extract<TripNode, { kind: K }> =>
      candidate.kind === kind,
  );
  if (node === undefined) {
    throw new Error(`Missing ${kind} fixture`);
  }
  return node;
}

describe("semantic renderer registry", () => {
  it("provides every built-in renderer and one custom fallback", () => {
    expect(Object.keys(rendererRegistry)).toEqual([
      "transport",
      "transfer",
      "lodging",
      "dining",
      "shopping",
      "sightseeing",
      "experience",
      "logistics",
      "custom",
    ]);
    expect(rendererFor(fixture("custom"))).toBe(rendererRegistry.custom);
  });

  it("renders transport mode, certainty-safe time, plan, and arrival context", () => {
    const node = {
      ...fixture("transport"),
      booking: { status: "pending" as const, arrivalBufferMinutes: 10 },
    };
    renderNode(node);

    expect(screen.getByText("約 08:00").closest("time")).toHaveAttribute(
      "datetime",
      "08:00",
    );
    expect(screen.getByText("transit")).toBeVisible();
    expect(screen.getByText("Use the local shuttle.")).toBeVisible();
    expect(screen.getByText(/Arrive 10 min early/)).toBeVisible();
    expect(screen.getByText(/Booking pending/)).toBeVisible();
  });

  it("renders long-distance transfer mode, terminal, confirmed booking, and arrival buffer", () => {
    renderNode(fixture("transfer"));

    const row = screen.getByRole("button", { name: "08:30 Inter-island transfer" });
    expect(screen.getByText("08:30").closest("time")).toHaveAttribute(
      "datetime",
      "08:30",
    );
    expect(screen.getByText("rail · Test Terminal")).toBeVisible();
    expect(screen.getByText(/Booking confirmed/)).toBeVisible();
    expect(screen.getByText(/Arrive 30 min early/)).toBeVisible();
    expect(screen.queryByText(/SYNTHETIC-TRANSFER/)).not.toBeInTheDocument();
    expect(row).not.toHaveAccessibleDescription(/SYNTHETIC-TRANSFER/);
  });

  it.each([
    ["first", "Day start · Stay base"],
    ["last", "Day end · Stay base"],
    ["middle", "Stay base"],
    ["only", "Day start & end · Stay base"],
  ] as const)("renders %s-position base lodging behavior", (position, label) => {
    const node: TripNode = {
      ...fixture("lodging"),
      payload: { role: "base" },
    };
    renderNode(node, { position });
    expect(screen.getByText(label)).toBeVisible();
  });

  it.each([
    ["check-in", "Check in"],
    ["check-out", "Check out"],
    ["return", "Rest / drop off bags"],
  ] as const)("renders an explicit %s lodging stop", (role, label) => {
    const node: TripNode = {
      ...fixture("lodging"),
      payload: { role },
    };
    renderNode(node);
    expect(screen.getByText(label)).toBeVisible();
  });

  it("renders only the committed dining place or a collapsed candidate summary", () => {
    const candidate = fixture("dining");
    const { rerender } = renderNode(candidate);
    expect(screen.getByText("Compare meal options")).toBeVisible();
    expect(screen.queryByText("Garden kitchen")).not.toBeInTheDocument();
    expect(screen.queryByText("Canal counter")).not.toBeInTheDocument();

    const selected: TripNode = {
      ...candidate,
      title: "Garden kitchen",
      place: { name: "Synthetic Garden Kitchen", certainty: "candidate" },
    };
    const Renderer = rendererFor(selected);
    rerender(
      <TimelineEntry
        node={selected}
        state={state({ selectedCandidateId: "candidate-lunch-a" })}
        selected={false}
        onSelect={() => undefined}
        Renderer={Renderer}
      />,
    );
    expect(screen.getByText("Selected · Synthetic Garden Kitchen")).toBeVisible();
    expect(screen.queryByText("Compare meal options")).not.toBeInTheDocument();
  });

  it("renders store, item completion summary, and must-buy priority", () => {
    const node: TripNode = {
      ...fixture("shopping"),
      payload: {
        items: [
          { id: "camera", title: "Insta360", priority: "must" },
          {
            id: "card",
            title: "Memory card",
            priority: "nice",
            initialStatus: "purchased",
          },
        ],
      },
    };
    renderNode(node, { shoppingStatuses: { camera: "purchased" } });

    expect(screen.getByText("Synthetic Supply Hall")).toBeVisible();
    expect(screen.getByText("2 / 2 complete")).toBeVisible();
    expect(screen.getByText("Must · Insta360")).toBeVisible();
    expect(screen.getByText("Nice · Memory card")).toBeVisible();
  });

  it("uses only own shopping status entries while preserving special item IDs", () => {
    const node: TripNode = {
      ...fixture("shopping"),
      payload: {
        items: ["__proto__", "constructor", "toString"].map((id) => ({
          id,
          title: `Item ${id}`,
        })),
      },
    };
    const inheritedStatuses = Object.create({
      ["__proto__"]: "purchased",
      ["constructor"]: "purchased",
      ["toString"]: "purchased",
    }) as Record<string, "purchased">;
    const { rerender } = renderNode(node, {
      shoppingStatuses: inheritedStatuses,
    });
    expect(screen.getByText("0 / 3 complete")).toBeVisible();

    const ownStatuses = Object.create(null) as Record<string, "purchased">;
    for (const id of ["__proto__", "constructor", "toString"]) {
      Object.defineProperty(ownStatuses, id, {
        enumerable: true,
        value: "purchased",
      });
    }
    const Renderer = rendererFor(node);
    rerender(
      <TimelineEntry
        node={node}
        state={state({ shoppingStatuses: ownStatuses })}
        selected={false}
        onSelect={() => undefined}
        Renderer={Renderer}
      />,
    );
    expect(screen.getByText("3 / 3 complete")).toBeVisible();
  });

  it("renders sightseeing place, area, and optional state without disclosure", () => {
    const node: TripNode = { ...fixture("sightseeing"), optionality: "optional" };
    const { container } = renderNode(node);

    expect(screen.getByText("Synthetic Clifftop · North ridge")).toBeVisible();
    expect(screen.getByText("Optional stop")).toBeVisible();
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[aria-expanded]")).toBeNull();
  });

  it("renders experience with an absolute date, raw time, booking state, and duration", () => {
    renderNode(fixture("experience"));

    const absolute = screen.getByText(/Tuesday, 12 June 2040/).closest("time");
    expect(absolute).toHaveAttribute("datetime", "2040-06-12");
    expect(screen.getByText("15:30").closest("time")).toHaveAttribute(
      "datetime",
      "15:30",
    );
    expect(screen.getByText("60 min")).toBeVisible();
    expect(screen.getByText(/Booking confirmed/)).toBeVisible();
    expect(screen.queryByText(/SYNTHETIC-EXPERIENCE/)).not.toBeInTheDocument();
  });

  it("renders root and nested logistics completion without hiding completed work", () => {
    const node: TripNode = {
      ...fixture("logistics"),
      payload: {
        checklist: [
          { id: "receipt", title: "Show receipt" },
          { id: "bags", title: "Collect bags" },
        ],
      },
    };
    renderNode(node, {
      completed: true,
      completedChecklistIds: new Set(["receipt"]),
    });

    expect(screen.getByText("Completed")).toBeVisible();
    expect(screen.getByText("1 / 2 steps complete")).toBeVisible();
  });

  it("renders safe custom content from its declaration rather than dumping arbitrary data", () => {
    const custom = fixture("custom");
    const unsafeValue = "do-not-render-private-value";
    const node: TripNode = {
      ...custom,
      payload: {
        ...custom.payload,
        data: { ...custom.payload.data, privateNote: unsafeValue },
      },
    };
    renderNode(node);

    expect(screen.getByText("field-note-exchange")).toBeVisible();
    expect(screen.getByText("Completion enabled")).toBeVisible();
    expect(screen.getByText("3 declared fields")).toBeVisible();
    expect(screen.queryByText(unsafeValue)).not.toBeInTheDocument();
  });

  it("keeps each renderer body free of nested interactive controls", () => {
    for (const node of completeTrip.days[0]?.nodes ?? []) {
      const { container, unmount } = renderNode(node);
      const body = container.querySelector("[data-semantic]");
      expect(body).not.toBeNull();
      expect(within(body as HTMLElement).queryAllByRole("button")).toHaveLength(0);
      expect(within(body as HTMLElement).queryAllByRole("link")).toHaveLength(0);
      unmount();
    }
  });
});
