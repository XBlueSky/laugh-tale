import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TripNode } from "../../trip-core/model";
import type { EffectiveNode } from "../../trip-core/resolve-itinerary";
import { rendererFor } from "../renderers/CustomEntry";
import { ItineraryTimeline } from "../ItineraryTimeline";
import {
  TimelineEntry,
  type TimelineNodeState,
} from "./TimelineEntry";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function sightseeing(overrides: Partial<TripNode> = {}): TripNode {
  return {
    id: "museum",
    dayId: "day-1",
    kind: "sightseeing",
    title: "Museum",
    timing: { start: "09:00", certainty: "suggested" },
    optionality: "core",
    place: { name: "Museum", certainty: "confirmed" },
    payload: { area: "Ueno" },
    ...overrides,
  } as TripNode;
}

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

describe("TimelineEntry", () => {
  it("keeps raw time semantics and selection state without a decorative chevron", () => {
    const node = sightseeing();
    const { container } = render(
      <TimelineEntry
        node={node}
        state={state({ current: true })}
        selected
        onSelect={() => undefined}
        Renderer={rendererFor(node)}
      />,
    );

    expect(screen.getByRole("button", { name: "約 09:00 Museum" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "約 09:00 Museum" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByText("約 09:00").closest("time")).toHaveAttribute(
      "datetime",
      "09:00",
    );
    expect(container.firstElementChild).toHaveAttribute("data-current", "true");
    expect(screen.queryByRole("button", { name: /details/i })).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("does not add disclosure semantics to a single-step logistics row", () => {
    const node: TripNode = {
      id: "bags",
      dayId: "day-1",
      kind: "logistics",
      title: "Collect bags",
      timing: { certainty: "unknown" },
      optionality: "core",
      payload: { checklist: [{ id: "receipt", title: "Show receipt" }] },
    };
    render(
      <TimelineEntry
        node={node}
        state={state()}
        selected={false}
        onSelect={() => undefined}
        Renderer={rendererFor(node)}
      />,
    );

    expect(screen.getByRole("button", { name: "時間未定 Collect bags" })).not.toHaveAttribute(
      "aria-expanded",
    );
    expect(screen.getByText("Show receipt")).toBeVisible();
    expect(screen.queryByRole("button", { name: /details/i })).not.toBeInTheDocument();
  });

  it("gives a real, non-nested disclosure target only to nested checklist content", async () => {
    const user = userEvent.setup();
    const node: TripNode = {
      id: "airport-steps",
      dayId: "day-1",
      kind: "logistics",
      title: "Airport steps",
      timing: { start: "10:00", certainty: "fixed" },
      optionality: "core",
      payload: {
        checklist: [
          { id: "check-in", title: "Check in" },
          { id: "security", title: "Pass security" },
        ],
      },
    };
    const { container } = render(
      <TimelineEntry
        node={node}
        state={state({ completedChecklistIds: new Set(["check-in"]) })}
        selected={false}
        onSelect={() => undefined}
        Renderer={rendererFor(node)}
      />,
    );
    const disclosure = screen.getByRole("button", { name: "Show Airport steps details" });
    const targetId = disclosure.getAttribute("aria-controls");

    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(targetId).toBeTruthy();
    expect(document.getElementById(targetId!)).toBeInTheDocument();
    expect(document.getElementById(targetId!)).toHaveAttribute("hidden");

    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(targetId!)).not.toHaveAttribute("hidden");
    expect(screen.getByText("Check in")).toHaveAttribute("data-completed", "true");
    expect(container.querySelectorAll("button button, button a, a button")).toHaveLength(0);
  });
});

describe("ItineraryTimeline semantic integration", () => {
  it("keeps node, route, group, and child React sibling identities namespaced", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const nodes: EffectiveNode[] = [
      {
        sourceNodeId: "shared-owner",
        completed: false,
        node: sightseeing({ id: "shared-owner", title: "Shared node" }),
      },
      {
        sourceNodeId: "destination",
        completed: false,
        node: sightseeing({ id: "destination", title: "Destination" }),
      },
      {
        sourceNodeId: "step-a",
        completed: false,
        node: {
          id: "step-a",
          dayId: "day-1",
          kind: "logistics",
          title: "Step A",
          timing: { certainty: "unknown" },
          optionality: "core",
          payload: { checklist: [{ id: "a-check", title: "Check A" }] },
        },
      },
      {
        sourceNodeId: "step-b",
        completed: false,
        node: {
          id: "step-b",
          dayId: "day-1",
          kind: "logistics",
          title: "Step B",
          timing: { certainty: "unknown" },
          optionality: "core",
          payload: { checklist: [{ id: "b-check", title: "Check B" }] },
        },
      },
      {
        sourceNodeId: "logistics:step-a--step-b",
        completed: false,
        node: sightseeing({
          id: "logistics:step-a--step-b",
          title: "Group-ID node",
        }),
      },
    ];
    const { container } = render(
      <ItineraryTimeline
        nodes={nodes}
        routes={[{
          id: "shared-owner",
          dayId: "day-1",
          fromNodeId: "shared-owner",
          toNodeId: "destination",
          mode: "walking",
          source: "manual",
          certainty: "confirmed",
          summary: "Walk to destination",
        }]}
        selection={{ nodeId: null, source: "automatic" }}
        onNodeSelect={() => undefined}
      />,
    );

    expect(container.querySelector('[data-route-owner="shared-owner"]')).not.toBeNull();
    expect(container.querySelector(
      '[data-logistics-group="logistics:step-a--step-b"]',
    )).not.toBeNull();
    expect(screen.getByRole("button", { name: "約 09:00 Group-ID node" })).toBeVisible();
    expect(screen.getByRole("button", { name: "約 09:00 Shared node" })).toBeVisible();
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(
      /same key|unique "key"/i,
    );
  });

  it("ignores inherited route state while accepting own special route IDs", () => {
    const ready = {
      status: "ready" as const,
      durationMinutes: 4,
      path: [
        { lat: 35.7, lng: 139.7 },
        { lat: 35.71, lng: 139.71 },
      ],
      steps: ["Walk to destination"],
    };
    const specialIds = ["__proto__", "constructor", "toString"];
    const inheritedStates = Object.create(
      Object.fromEntries(specialIds.map((id) => [id, ready])),
    ) as Record<string, typeof ready>;
    const nodes: EffectiveNode[] = [
      { sourceNodeId: "a", completed: false, node: sightseeing({ id: "a", title: "A" }) },
      { sourceNodeId: "b", completed: false, node: sightseeing({ id: "b", title: "B" }) },
    ];
    const routes = specialIds.map((id) => ({
      id,
      dayId: "day-1",
      fromNodeId: "a",
      toNodeId: "b",
      mode: "walking" as const,
      source: "manual" as const,
      certainty: "confirmed" as const,
      summary: `Walk to B via ${id}`,
    }));
    const { container, rerender } = render(
      <ItineraryTimeline
        nodes={nodes}
        routes={routes}
        routeStates={inheritedStates}
        selection={{ nodeId: null, source: "automatic" }}
        onNodeSelect={() => undefined}
        onRouteSelect={() => undefined}
      />,
    );

    for (const id of specialIds) {
      expect(container.querySelector(`[data-route-id="${id}"]`)).toBeNull();
    }

    const ownStates = Object.create(null) as Record<string, typeof ready>;
    for (const id of specialIds) {
      Object.defineProperty(ownStates, id, {
        enumerable: true,
        value: ready,
      });
    }
    rerender(
      <ItineraryTimeline
        nodes={nodes}
        routes={routes}
        routeStates={ownStates}
        selection={{ nodeId: null, source: "automatic" }}
        onNodeSelect={() => undefined}
        onRouteSelect={() => undefined}
      />,
    );
    for (const id of specialIds) {
      expect(container.querySelectorAll(`[data-route-id="${id}"]`)).toHaveLength(1);
    }
  });

  it("derives navigation for prototype-named route IDs without object coercion", () => {
    const nodes: EffectiveNode[] = [
      { sourceNodeId: "origin", completed: false, node: sightseeing({ id: "origin", title: "Origin" }) },
      { sourceNodeId: "destination", completed: false, node: sightseeing({ id: "destination", title: "Destination" }) },
    ];
    const routes = ["__proto__", "constructor", "toString"].map((id) => ({
      id,
      dayId: "day-1",
      fromNodeId: "origin",
      toNodeId: "destination",
      mode: "transit" as const,
      source: "manual" as const,
      certainty: "confirmed" as const,
      summary: `Route ${id}`,
      navigation: { origin: "Origin", destination: "Destination" },
    }));
    render(
      <ItineraryTimeline
        nodes={nodes}
        routes={routes}
        navigationAdapter={{
          directions: ({ travelMode }) =>
            `https://directions.example.test/?mode=${travelMode}`,
        }}
        selection={{ nodeId: null, source: "automatic" }}
        onNodeSelect={() => undefined}
      />,
    );

    const links = screen.getAllByRole("link", {
      name: "Open live transit directions from Origin to Destination",
    });
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link).toHaveAttribute(
        "href",
        "https://directions.example.test/?mode=transit",
      );
      expect(link.getAttribute("href")).not.toContain("[object Object]");
    }
  });

  it("rejects unsafe NavigationAdapter output", () => {
    const nodes: EffectiveNode[] = [
      { sourceNodeId: "origin", completed: false, node: sightseeing({ id: "origin", title: "Origin" }) },
      { sourceNodeId: "destination", completed: false, node: sightseeing({ id: "destination", title: "Destination" }) },
    ];
    render(
      <ItineraryTimeline
        nodes={nodes}
        routes={[{
          id: "unsafe-route",
          dayId: "day-1",
          fromNodeId: "origin",
          toNodeId: "destination",
          mode: "walking",
          source: "manual",
          certainty: "confirmed",
          navigation: { origin: "Origin", destination: "Destination" },
        }]}
        navigationAdapter={{ directions: () => "javascript:alert(1)" }}
        selection={{ nodeId: null, source: "automatic" }}
        onNodeSelect={() => undefined}
      />,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("retains selected, current, and completed state for children inside a logistics group", () => {
    const logisticsNodes: EffectiveNode[] = [
      {
        sourceNodeId: "immigration",
        completed: false,
        node: {
          id: "immigration",
          dayId: "day-1",
          kind: "logistics",
          title: "Immigration",
          timing: { start: "08:00", certainty: "fixed" },
          optionality: "core",
          payload: { checklist: [{ id: "passport", title: "Show passport" }] },
        },
      },
      {
        sourceNodeId: "bags",
        completed: true,
        node: {
          id: "bags",
          dayId: "day-1",
          kind: "logistics",
          title: "Collect bags",
          timing: { start: "08:20", certainty: "suggested" },
          optionality: "core",
          payload: { checklist: [{ id: "carousel", title: "Find carousel" }] },
        },
      },
    ];
    const { container } = render(
      <ItineraryTimeline
        nodes={logisticsNodes}
        routes={[]}
        selection={{ nodeId: "bags", source: "automatic" }}
        currentNodeId="bags"
        onNodeSelect={() => undefined}
      />,
    );

    const group = container.querySelector('[data-logistics-group="logistics:immigration--bags"]');
    expect(group).not.toBeNull();
    const immigration = screen.getByRole("button", { name: "08:00 Immigration" });
    const bags = screen.getByRole("button", { name: "約 08:20 Collect bags" });
    expect(immigration.closest("[data-completed]")).toHaveAttribute(
      "data-completed",
      "false",
    );
    expect(bags).toHaveAttribute("aria-pressed", "true");
    expect(bags.closest("[data-current]")).toHaveAttribute("data-current", "true");
    expect(bags.closest("[data-completed]")).toHaveAttribute("data-completed", "true");
  });

  it("renders each interactive route owner exactly once and keeps controls unnested", () => {
    const onRouteSelect = vi.fn();
    const nodes: EffectiveNode[] = [
      { sourceNodeId: "a", completed: false, node: sightseeing({ id: "a", title: "A" }) },
      { sourceNodeId: "b", completed: false, node: sightseeing({ id: "b", title: "B" }) },
      { sourceNodeId: "c", completed: false, node: sightseeing({ id: "c", title: "C" }) },
    ];
    const routes = [
      {
        id: "a--b",
        dayId: "day-1",
        fromNodeId: "a",
        toNodeId: "b",
        mode: "walking" as const,
        source: "manual" as const,
        certainty: "suggested" as const,
        durationMinutes: 4,
        navigation: { origin: "A", destination: "B" },
      },
      {
        id: "b--c",
        dayId: "day-1",
        fromNodeId: "b",
        toNodeId: "c",
        mode: "transit" as const,
        source: "provider" as const,
        certainty: "suggested" as const,
        navigation: { origin: "B", destination: "C" },
      },
    ];
    const { container } = render(
      <ItineraryTimeline
        nodes={nodes}
        routes={routes}
        routeStates={{
          "a--b": {
            status: "ready",
            durationMinutes: 4,
            path: [
              { lat: 35.7, lng: 139.7 },
              { lat: 35.71, lng: 139.71 },
            ],
            steps: ["Walk to B"],
          },
          "b--c": {
            status: "ready",
            durationMinutes: 12,
            path: [
              { lat: 35.71, lng: 139.71 },
              { lat: 35.72, lng: 139.72 },
            ],
            steps: ["Board the train"],
          },
        }}
        selection={{ nodeId: "a", source: "manual" }}
        onNodeSelect={() => undefined}
        onRouteSelect={onRouteSelect}
      />,
    );

    for (const id of ["a--b", "b--c"]) {
      expect(container.querySelectorAll(`[data-route-id="${id}"]`)).toHaveLength(1);
      expect(container.querySelectorAll(`[data-route-owner="${id}"]`)).toHaveLength(1);
    }
    expect(container.querySelectorAll("button button, button a, a button")).toHaveLength(0);
    fireEvent.click(container.querySelector('[data-route-id="a--b"]')!);
    expect(onRouteSelect).toHaveBeenCalledWith("a--b");
    expect(within(container).getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
  });

  it("does not fabricate an absolute date when the timeline was not given one", () => {
    const experience: EffectiveNode = {
      sourceNodeId: "experience",
      completed: false,
      node: {
        id: "experience",
        dayId: "day-2099-99-99",
        kind: "experience",
        title: "Booked experience",
        timing: { start: "14:00", certainty: "fixed" },
        optionality: "core",
        booking: { status: "confirmed" },
        payload: { durationMinutes: 60 },
      },
    };
    render(
      <ItineraryTimeline
        nodes={[experience]}
        routes={[]}
        selection={{ nodeId: "experience", source: "automatic" }}
        onNodeSelect={() => undefined}
      />,
    );

    expect(screen.getByText("14:00").closest("time")).toHaveAttribute(
      "datetime",
      "14:00",
    );
    expect(screen.queryByText(/1970/)).not.toBeInTheDocument();
  });

  it("does not call an automatic next-item fallback current without an explicit live owner", () => {
    const next: EffectiveNode = {
      sourceNodeId: "next",
      completed: false,
      node: sightseeing({ id: "next", title: "Next stop" }),
    };
    render(
      <ItineraryTimeline
        nodes={[next]}
        routes={[]}
        selection={{ nodeId: "next", source: "automatic" }}
        onNodeSelect={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "約 09:00 Next stop" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
