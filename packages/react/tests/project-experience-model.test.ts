import { describe, expect, it } from "vitest";
import {
  createExperienceChoreographyState,
  emptyTripProgress,
  nodeCompletionKey,
  type Trip,
  type TripNode,
} from "@laugh-tale-island/core";
import { projectExperienceModel } from "../src/project-experience-model.js";
import { projectHomeModel } from "../src/project-home-model.js";

const node = (
  id: string,
  kind: TripNode["kind"],
  payload: unknown,
  extra: object = {},
): TripNode =>
  ({
    id,
    dayId: "one",
    title: id,
    kind,
    payload,
    timing: { certainty: "unknown" },
    optionality: "optional",
    ...extra,
  }) as TripNode;
const trip = (nodes: TripNode[]): Trip => ({
  id: "trip",
  title: "Trip",
  locale: "en",
  timezone: "Asia/Tokyo",
  startDate: "2040-06-12",
  endDate: "2040-06-12",
  days: [{ id: "one", date: "2040-06-12", title: "One", nodes }],
  routes: [],
  candidateGroups: [],
  tasks: [],
  reservations: [],
});
function project(
  authored: Trip,
  selected: string | null = null,
  progress = emptyTripProgress(),
) {
  const choreography = createExperienceChoreographyState({
    navigation: { surface: "experience", dayId: "one", ownerId: null },
    automaticOwnerId: selected,
  });
  return projectExperienceModel({
    trip: authored,
    progress,
    instant: "2040-06-12T01:30:00Z",
    choreography,
    persistenceStatus: "persistent",
  });
}

describe("Experience DTO projection", () => {
  it("projects authored day route and shopping note without inventing defaults", () => {
    const authored = trip([node("shop", "shopping", { items: [{ id: "item", title: "Shop", note: "先領整理券" }] })]);
    Object.assign(authored.days[0], { routeLabel: "NIHONBASHI → TOKYO" });
    const home = projectHomeModel({ trip: authored, progress: emptyTripProgress(), instant: "2040-06-12T01:30:00Z", persistenceStatus: "persistent" });
    expect(home.days[0]).toMatchObject({ routeLabel: "NIHONBASHI → TOKYO" });
    const experience = project(authored).model;
    expect(experience.day).toMatchObject({ routeLabel: "NIHONBASHI → TOKYO" });
    const shop = experience.timeline.find(entry => entry.kind === "node" && entry.facts.kind === "shopping");
    if (shop?.kind !== "node" || shop.facts.kind !== "shopping") throw new Error("Missing shopping DTO");
    expect(shop.facts.items[0]).toMatchObject({ note: "先領整理券" });
    expect(project(trip([])).model.day).not.toHaveProperty("routeLabel");
  });
  it.each([
    [{ start: "23:30", end: "00:15", certainty: "fixed" }, "2040-06-13"],
    [{ start: "23:30", end: "00:15", dayOffset: 2, certainty: "suggested" }, "2040-06-14"],
    [{ start: "12:00", certainty: "suggested" }, undefined],
    [{ certainty: "unknown" }, undefined],
  ])("projects authored calendar dates without treating inferred ends as authored: %j", (timing, endDate) => {
    const entry = project(trip([node("time", "sightseeing", {}, { timing })])).model.timeline[0];
    if (entry.kind !== "node") throw new Error("missing timing owner");
    expect(entry.timing).toEqual({ ...timing, date: "2040-06-12", ...(endDate ? { endDate } : {}) });
  });
  it.each(["unknown", "flight", "rail", "bus"] as const)("preserves %s transfer facts without a fabricated terminal", mode => {
    const transfer: TripNode = { id: "transfer", dayId: "one", title: "Transfer", kind: "transfer", timing: { certainty: "unknown" }, optionality: "core", payload: { mode } };
    const entry = project(trip([transfer])).model.timeline[0];
    if (entry.kind !== "node") throw new Error("Missing transfer projection");
    const facts: import("../src/presentation-contract.js").TimelineNodeFactsModel = { kind: "transfer", mode };
    expect(entry.facts).toEqual(facts);
    expect(entry.facts).not.toHaveProperty("terminal");
  });
  it.each(["__proto__", "constructor", "toString"])("ignores inherited provider entries for unrequested owner %s", (id) => {
    const place = { name: "Coordinates only", certainty: "confirmed", identity: { status: "resolved", coordinates: { lat: 35, lng: 139 } } };
    const authored = trip([node(id, "sightseeing", {}, { place }), node("destination", "sightseeing", {}, { place })]);
    for (const mode of ["unknown", "flight"] as const) {
      authored.routes = [{ id, dayId: "one", fromNodeId: id, toNodeId: "destination", mode, source: "manual", certainty: "confirmed" }];
      const result = projectExperienceModel({ trip: authored, progress: emptyTripProgress(), instant: "2040-06-12T01:30:00Z", choreography: createExperienceChoreographyState({ navigation: { surface: "experience", dayId: "one", ownerId: null }, automaticOwnerId: null }), persistenceStatus: "persistent", placeStates: {}, routeStates: {} });
      expect(result.placeRequests).toEqual([]);
      expect(result.routeRequests).toEqual([]);
      expect(result.model.places.find((owner) => owner.ownerId === id)?.runtime).toEqual({ status: "idle" });
      expect(result.model.routes[0].runtime).toEqual({ status: "idle" });
      expect(result.model.map.presentation.routes).toEqual([]);
    }
  });
  it("keeps trip-current destination timezone/cross-midnight aware, allows completed current and excludes skipped or absent current", () => {
    const authored = trip([node("overnight", "experience", {}, { timing: { start: "23:30", end: "00:30", certainty: "fixed" } })]);
    authored.endDate = "2040-06-13";
    authored.days.push({ id: "two", date: "2040-06-13", title: "Tomorrow", nodes: [node("other", "sightseeing", {}, { dayId: "two" })] });
    const input = { trip: authored, instant: "2040-06-12T15:15:00Z", choreography: createExperienceChoreographyState({ navigation: { surface: "experience", dayId: "two", ownerId: null }, automaticOwnerId: null }), persistenceStatus: "persistent" as const };
    const run = (progress = emptyTripProgress(), instant = input.instant) => projectExperienceModel({ ...input, progress, instant });
    expect(run().targets.currentDestination).toEqual({ dayId: "one", ownerId: "overnight" });
    expect(run().model.owners.currentId).toBeNull();
    expect(run().model.capabilities.returnToCurrent).toBe(true);
    expect(run({ ...emptyTripProgress(), completedIds: [nodeCompletionKey("overnight")] }).targets.currentDestination).toEqual({ dayId: "one", ownerId: "overnight" });
    expect(run({ ...emptyTripProgress(), skippedNodeIds: ["overnight"] }).targets.currentDestination).toBeNull();
    expect(run(emptyTripProgress(), "2040-06-12T16:00:00Z").model.capabilities.returnToCurrent).toBe(false);
    authored.days[0].nodes = [];
    expect(run().targets.currentDestination).toBeNull();
  });
  it("joins only open matching validated candidate draft facts without mutating semantic states", () => {
    const place = { name: "Option", certainty: "confirmed" as const, identity: { status: "resolved" as const, coordinates: { lat: 10, lng: 20 } } };
    const authored = trip([node("meal", "dining", { candidateGroupId: "food" }, { place })]);
    const group = { id: "food", parentNodeId: "meal", mode: "single" as const, defaultOptionId: "a", options: [{ id: "a", title: "A", place }, { id: "b", title: "B", place }] };
    authored.candidateGroups = [group];
    const candidate = { groupId: "food", parentOwnerId: "meal", mode: "single" as const, open: true, sessionId: 1, draftOptionId: "b", options: group.options.map((option) => ({ id: option.id, title: option.title, ordinal: option.id, selected: option.id === "a", draft: option.id === "b" })), capabilities: { previewOptionIds: ["a", "b"], confirm: true, cancel: true, reopen: false } };
    const input = { trip: authored, progress: emptyTripProgress(), instant: "2040-06-12T01:30:00Z", choreography: createExperienceChoreographyState({ navigation: { surface: "experience", dayId: "one", ownerId: "meal" }, automaticOwnerId: "meal" }), persistenceStatus: "persistent" as const };
    const markers = (value = candidate) => projectExperienceModel({ ...input, activeCandidateGroup: group, candidates: [value] }).model.map.presentation.markers;
    const selected = (value = candidate) => markers(value).filter((marker) => marker.states.includes("selected")).map((marker) => marker.ownerId);
    expect(selected()).toEqual(["b"]);
    expect(selected({ ...candidate, open: false })).toEqual([]);
    expect(selected({ ...candidate, groupId: "foreign" })).toEqual([]);
    expect(selected({ ...candidate, parentOwnerId: "foreign" })).toEqual([]);
    expect(selected({ ...candidate, options: [{ ...candidate.options[1], id: "foreign" }] })).toEqual([]);
    const before = structuredClone(candidate);
    const first = markers();
    const second = markers();
    expect(first[0].states).not.toBe(second[0].states);
    expect(candidate).toEqual(before);
    expect(() => structuredClone(first)).not.toThrow();
    expect(projectExperienceModel({ ...input, candidates: [candidate] }).model.map.presentation.markers.find((marker) => marker.ownerId === "meal")?.states).toContain("selected");
  });
  it("keeps prototype-named shopping IDs primitive and accepts only own status overrides", () => {
    const ids = ["__proto__", "constructor", "toString"];
    const authored = trip([node("shop", "shopping", { items: ids.map((id, index) => ({ id, title: id, ...(index === 0 ? { initialStatus: "purchased" } : {}) })) })]);
    const statuses = (progress = emptyTripProgress()) => {
      const { model } = project(authored, null, progress);
      const shop = model.timeline.find((entry) => entry.kind === "node");
      if (shop?.kind !== "node" || shop.facts.kind !== "shopping") throw new Error("Missing shopping DTO");
      expect(() => structuredClone(model)).not.toThrow();
      return shop.facts.items.map((item) => item.status);
    };
    expect(statuses()).toEqual(["purchased", "pending", "pending"]);
    const inherited = Object.create(Object.fromEntries(ids.map((id) => [id, "skipped"]))) as ReturnType<typeof emptyTripProgress>["shoppingStatuses"];
    expect(statuses({ ...emptyTripProgress(), shoppingStatuses: inherited })).toEqual(["purchased", "pending", "pending"]);
    const own = Object.fromEntries(ids.map((id) => [id, "unavailable" as const]));
    expect(statuses({ ...emptyTripProgress(), shoppingStatuses: own })).toEqual(["unavailable", "unavailable", "unavailable"]);
  });

  it("projects detached booking facts for ordinary and grouped nodes with exact custom opt-in", () => {
    const booking = { status: "confirmed" as const, arrivalBufferMinutes: 20, reference: "Synthetic reference" };
    const authored = trip([
      node("rail", "transfer", { mode: "rail" }, { booking }),
      node("bags", "logistics", { checklist: [] }, { booking }),
      node("tickets", "logistics", { checklist: [] }),
      node("custom-in", "custom", { customKind: "notice", presentationRole: "task", capabilities: { booking: true }, data: {} }, { booking }),
      node("custom-out", "custom", { customKind: "notice", presentationRole: "task", capabilities: {}, data: {} }, { booking }),
    ]);
    const { model } = project(authored);
    const nodes = model.timeline.flatMap((entry) => entry.kind === "node" ? [entry] : entry.kind === "logistics-group" ? entry.children : []);
    expect(nodes.map((entry) => entry.booking)).toEqual([booking, booking, undefined, booking, undefined]);
    expect(nodes[0].booking).not.toBe(booking);
    expect(nodes[1].booking).not.toBe(nodes[0].booking);
    booking.arrivalBufferMinutes = 99;
    expect(nodes[0].booking?.arrivalBufferMinutes).toBe(20);
    expect(nodes[2]).not.toHaveProperty("booking");
    expect(nodes[4]).not.toHaveProperty("booking");
  });
  it("preserves non-contiguous authored day labels as detached primitive records", () => {
    const authored = trip([]);
    authored.endDate = "2040-06-15";
    authored.days.push({ id: "two", date: "2040-06-15", title: "Harbor evening", nodes: [] });
    const { model } = project(authored);
    expect(model.days).toEqual([
      { id: "one", date: "2040-06-12", title: "One", ordinal: 1 },
      { id: "two", date: "2040-06-15", title: "Harbor evening", ordinal: 2 },
    ]);
    authored.days[1].title = "Changed";
    expect(model.days[1].title).toBe("Harbor evening");
  });
  it("preserves every discriminated authored fact and ordered grouped children without payload aliases", () => {
    const authored = trip([
      node("ride", "transport", { mode: "transit", plan: "Blue line" }),
      node("flight", "transfer", { mode: "flight", terminal: "T2" }),
      node("hotel", "lodging", {
        role: "base",
        checklist: [{ id: "key", title: "Collect key" }],
      }),
      node("meal", "dining", { cuisine: "Soup", candidateGroupId: "food" }),
      node("shop", "shopping", {
        items: [
          { id: "a", title: "A", priority: "must" },
          { id: "b", title: "B", initialStatus: "unavailable" },
        ],
      }),
      node("museum", "sightseeing", { area: "Harbor" }),
      node("show", "experience", { durationMinutes: 90 }),
      node("custom", "custom", {
        customKind: "note",
        presentationRole: "task",
        capabilities: { completion: false },
        data: { count: 2, flag: true, label: "L" },
      }),
      node(
        "bags",
        "logistics",
        { checklist: [{ id: "bag", title: "Bag" }] },
        { details: ["Keep receipt"] },
      ),
      node("tickets", "logistics", {
        checklist: [{ id: "ticket", title: "Ticket" }],
      }),
    ]);
    const progress = {
      ...emptyTripProgress(),
      completedIds: ["checklist:key", "checklist:bag"],
      shoppingStatuses: { a: "purchased" as const },
    };
    const { model } = project(authored, null, progress);
    expect(model.timeline.map((entry) => entry.kind)).toEqual([
      "node",
      "node",
      "node",
      "node",
      "node",
      "node",
      "node",
      "node",
      "logistics-group",
    ]);
    const facts = model.timeline.flatMap((entry) =>
      entry.kind === "node"
        ? [entry.facts]
        : entry.kind === "logistics-group"
          ? entry.children.map((child) => child.facts)
          : [],
    );
    expect(facts).toEqual([
      { kind: "transport", mode: "transit", plan: "Blue line" },
      { kind: "transfer", mode: "flight", terminal: "T2" },
      {
        kind: "lodging",
        role: "base",
        checklist: [
          { id: "checklist:key", title: "Collect key", completed: true },
        ],
      },
      { kind: "dining", cuisine: "Soup", candidateGroupId: "food" },
      {
        kind: "shopping",
        items: [
          { id: "a", title: "A", priority: "must", status: "purchased" },
          { id: "b", title: "B", status: "unavailable" },
        ],
      },
      { kind: "sightseeing", area: "Harbor" },
      { kind: "experience", durationMinutes: 90 },
      {
        kind: "custom",
        customKind: "note",
        data: { count: 2, flag: true, label: "L" },
      },
      {
        kind: "logistics",
        checklist: [{ id: "checklist:bag", title: "Bag", completed: true }],
      },
      {
        kind: "logistics",
        checklist: [
          { id: "checklist:ticket", title: "Ticket", completed: false },
        ],
      },
    ]);
    expect(model.itinerary.primaryCount).toBe(4);
    const group = model.timeline.at(-1);
    expect(group).toMatchObject({
      titleKey: "timeline.logisticsGroup",
      childOwnerIds: ["bags", "tickets"],
      children: [
        { ownerId: "bags", details: ["Keep receipt"] },
        { ownerId: "tickets" },
      ],
    });
    expect(model.capabilities.progress.completionIds).not.toContain(
      "node:custom",
    );
    expect(facts[7]).not.toBe(authored.days[0].nodes[7].payload);
  });

  it("keeps current/next/selected/viewing independent and validates collapsed and lodging owners", () => {
    const authored = trip([
      node("checkout", "lodging", { role: "check-out" }),
      node("hotel", "lodging", { role: "base" }),
      node(
        "current",
        "sightseeing",
        {},
        { timing: { start: "09:00", end: "11:00", certainty: "fixed" } },
      ),
      node(
        "next",
        "dining",
        {},
        { timing: { start: "12:00", end: "13:00", certainty: "fixed" } },
      ),
    ]);
    const result = project(authored, "next");
    expect(result.model.owners).toEqual({
      currentId: "current",
      nextId: "next",
      viewingId: null,
      selectedId: "next",
    });
    expect(result.model.itinerary).toEqual({
      primaryCount: 2,
      collapsedOwnerId: "next",
      focusFallback: { slot: "node", ownerId: "next" },
    });
    expect(result.targets).toMatchObject({
      currentId: "current",
      lodgingId: "hotel",
    });
    expect(project(authored, "foreign").model.itinerary.collapsedOwnerId).toBe(
      "current",
    );
    expect(
      project(authored, "hotel", {
        ...emptyTripProgress(),
        skippedNodeIds: ["hotel"],
      }).targets.lodgingId,
    ).toBeNull();
  });

  it("retains unknown authored routes, sanitizes failures, and never invents navigation", () => {
    const authored = trip([
      node("a", "sightseeing", {}),
      node("b", "sightseeing", {}),
    ]);
    authored.routes = [
      {
        id: "edge",
        dayId: "one",
        fromNodeId: "a",
        toNodeId: "b",
        mode: "unknown",
        source: "manual",
        certainty: "unverified",
        summary: "Ask at station",
      },
    ];
    const result = project(authored, "edge");
    expect(result.model.routes[0]).toMatchObject({
      mode: "unknown",
      authored: { summary: "Ask at station" },
      navigationAvailable: false,
    });
    expect(result.model.itinerary.focusFallback).toEqual({
      slot: "route",
      ownerId: "edge",
    });
    expect(result.model.providers.map).toEqual({
      status: "unavailable",
      reason: "missing-configuration",
      retryable: false,
    });
  });

  it("omits absent facts, clones custom data, and counts unresolved primaries in authored order", () => {
    const authored = trip([
      node(
        "a",
        "sightseeing",
        {},
        {
          place: {
            name: "Unresolved",
            certainty: "unverified",
            identity: { status: "unresolved", reason: "not-reviewed" },
          },
        },
      ),
      node("b", "custom", {
        customKind: "activity",
        presentationRole: "primary",
        capabilities: { place: true, completion: true },
        data: { label: "Original" },
      }),
    ]);
    const { model } = project(authored);
    expect(model.itinerary.primaryCount).toBe(2);
    expect(model.timeline).toMatchObject([
      {
        role: "primary",
        displayIndex: 1,
        markerMode: "numbered",
        facts: { kind: "sightseeing" },
      },
      { role: "primary", displayIndex: 2, facts: { kind: "custom" } },
    ]);
    const first = model.timeline[0];
    expect(first.kind === "node" && first.facts).toEqual({
      kind: "sightseeing",
    });
    const custom = authored.days[0].nodes[1];
    if (custom.kind === "custom") custom.payload.data.label = "Changed";
    expect(model.timeline[1]).toMatchObject({
      facts: { data: { label: "Original" } },
    });
    expect(model.map.presentation.markers).toEqual([]);
    expect(model.places[0].navigationAvailable).toBe(false);
  });

  it("does not focus a different mapped owner when the selected destination is unresolved", () => {
    const authored = trip([
      node("missing", "sightseeing", {}, { place: { name: "Missing location", certainty: "unverified", identity: { status: "unresolved", reason: "not-reviewed" } } }),
      node("known", "sightseeing", {}, { place: { name: "Known location", certainty: "confirmed", identity: { status: "resolved", coordinates: { lat: 35.68, lng: 139.76 } } } }),
    ]);
    const { model } = project(authored, "missing");
    expect(model.owners.selectedId).toBe("missing");
    expect(model.map.presentation.markers.map(marker => marker.ownerId)).toEqual(["known"]);
    expect(model.map.cameraIntent).toBeNull();
    expect(model.capabilities.navigationOwnerIds).not.toContain("missing");
  });

  it("does not expose live sheet geometry or map layout leaves through imported mutable DTO types", () => {
    const geometry = { collapsed: 80, half: 150, expanded: 400, ceiling: 400 };
    const layout = {
      viewport: { width: 400, height: 800 },
      usableRegion: { x: 0, y: 0, width: 400, height: 800 },
      edgeInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    };
    const choreography = createExperienceChoreographyState({
      navigation: { surface: "experience", dayId: "one", ownerId: null },
      automaticOwnerId: null,
    });
    const result = projectExperienceModel({
      trip: trip([]),
      progress: emptyTripProgress(),
      instant: "2040-06-12T01:30:00Z",
      choreography,
      persistenceStatus: "persistent",
      sheet: { geometry, snap: "half", interactive: true },
      mapLayout: layout,
    });
    if (result.model.sheet.geometry !== null)
      result.model.sheet.geometry.expanded = 999;
    if (result.model.map.layout !== null)
      result.model.map.layout.viewport.width = 999;
    expect(geometry.expanded).toBe(400);
    expect(layout.viewport.width).toBe(400);
  });

  it("falls back through current, next and useful grouped children, then null with no useful owner", () => {
    const authored = trip([
      node("bags", "logistics", { checklist: [] }),
      node("tickets", "logistics", { checklist: [] }),
      node(
        "next",
        "sightseeing",
        {},
        { timing: { start: "12:00", end: "13:00", certainty: "fixed" } },
      ),
    ]);
    expect(project(authored, "foreign").model.itinerary.collapsedOwnerId).toBe(
      "next",
    );
    expect(
      project(authored, "foreign", {
        ...emptyTripProgress(),
        skippedNodeIds: ["next"],
      }).model.itinerary,
    ).toEqual({
      primaryCount: 1,
      collapsedOwnerId: "bags",
      focusFallback: { slot: "node", ownerId: "bags" },
    });
    const allSkipped = project(authored, "tickets", {
      ...emptyTripProgress(),
      skippedNodeIds: ["bags", "tickets", "next"],
    });
    expect(allSkipped.model.itinerary).toEqual({
      primaryCount: 1,
      collapsedOwnerId: null,
      focusFallback: null,
    });
    expect(allSkipped.model.capabilities.returnToCurrent).toBe(false);
  });

  it.each(["unknown", "flight", "walking", "driving", "transit"] as const)(
    "preserves explicit external %s navigation without inventing a mode or origin",
    (mode) => {
      const authored = trip([
        node("a", "sightseeing", {}),
        node("b", "sightseeing", {}),
      ]);
      authored.routes = [
        {
          id: "edge",
          dayId: "one",
          fromNodeId: "a",
          toNodeId: "b",
          mode,
          source: "manual",
          certainty: "confirmed",
          navigation: {
            origin: "Authored origin",
            destination: "Authored destination",
          },
        },
      ];
      expect(project(authored).navigationRequests.get("edge")).toEqual({
        kind: "authored-external",
        origin: "Authored origin",
        destination: "Authored destination",
        ...(["walking", "driving", "transit"].includes(mode)
          ? { travelMode: mode }
          : {}),
      });
      authored.routes[0].navigation = {
        origin: " ",
        destination: "Destination",
      };
      for (const entry of authored.days[0].nodes)
        entry.place = {
          name: entry.title,
          certainty: "confirmed",
          identity: { status: "resolved", coordinates: { lat: 35, lng: 139 } },
        };
      expect(project(authored).navigationRequests.has("edge")).toBe(false);
    },
  );
});
