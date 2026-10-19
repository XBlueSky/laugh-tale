import { describe, expect, it } from "vitest";
import { emptyTripProgress, type Trip } from "@laugh-tale-island/core";
import { projectHomeModel } from "../src/project-home-model.js";

const trip: Trip = {
  id: "journey", title: "Journey", locale: "en", timezone: "Asia/Taipei",
  startDate: "2040-06-12", endDate: "2040-06-14",
  days: [
    { id: "one", date: "2040-06-12", title: "One", nodes: [] },
    { id: "two", date: "2040-06-14", title: "Two", nodes: [] },
  ], routes: [], tasks: [], reservations: [], candidateGroups: [],
};

describe("projectHomeModel", () => {
  it.each([
    ["two", "2040-06-11T16:30:00Z", "two"],
    [null, "2040-06-11T16:30:00Z", "one"],
    ["unknown", "2040-06-13T00:00:00Z", "two"],
    [null, "2040-06-20T00:00:00Z", "two"],
  ])("selects manual/current/upcoming/final (%s, %s)", (manualDayId, instant, expected) => {
    const model = projectHomeModel({ trip, progress: emptyTripProgress(), persistenceStatus: "persistent", instant, manualDayId });
    expect(model.effectiveEntryDayId).toBe(expected);
    expect(model.days.filter((day) => day.effective).map((day) => day.id)).toEqual([expected]);
  });

  it("omits absent optional facts and strips provider diagnostics", () => {
    const model = projectHomeModel({ trip, progress: emptyTripProgress(), persistenceStatus: "memory-only", instant: "2040-06-12T00:00:00Z", providerBootstrap: { map: { status: "unavailable", reason: "loader-failed", retryable: true, diagnostic: "private detail" } } });
    expect(model.identity).not.toHaveProperty("destinationLabel");
    expect(model.identity).not.toHaveProperty("travelerLabel");
    expect(model.lodging).toEqual([]);
    expect(model.persistence).toEqual({ status: "memory-only", writable: false });
    expect(model.providers.map).toEqual({ status: "unavailable", reason: "loader-failed", retryable: true });
    expect(JSON.stringify(model)).not.toContain("private detail");
  });

  it("projects only declared facts even when input records carry private extras", () => {
    const booking = { status: "pending" as const, diagnostic: "private-booking" };
    const timing = { certainty: "unknown" as const, diagnostic: "private-timing" };
    const reservation = { id: "r", ownerId: "hotel", title: "Stay", booking, diagnostic: "private-reservation" };
    const authored: Trip = { ...trip, days: [{ ...trip.days[0], nodes: [{ id: "hotel", dayId: "one", title: "Stay", kind: "lodging", optionality: "core", timing, booking, payload: { role: "base" } }] }], reservations: [reservation] };
    const model = projectHomeModel({ trip: authored, progress: emptyTripProgress(), persistenceStatus: "persistent", instant: "2040-06-12T00:00:00Z" });
    expect(model.reservations).toEqual([{ id: "r", ownerId: "hotel", title: "Stay", booking: { status: "pending" }, destination: { dayId: "one", nodeId: "hotel" } }]);
    expect(model.lodging[0].timing).toEqual({ certainty: "unknown" });
    expect(model.lodging[0].booking).toEqual({ status: "pending" });
  });

  it("resolves candidate reservations to their parent itinerary owner and leaves broken links inert", () => {
    const parent = { id: "meal", dayId: "one", title: "Meal", kind: "dining" as const, optionality: "core" as const, timing: { certainty: "unknown" as const }, payload: { candidateGroupId: "choice" } };
    const authored: Trip = { ...trip, days: [{ ...trip.days[0], nodes: [parent] }], candidateGroups: [{ id: "choice", parentNodeId: "meal", mode: "browse", options: [{ id: "cafe", title: "Cafe" }] }], reservations: [
      { id: "candidate", ownerId: "cafe", title: "Cafe request", booking: { status: "pending" } },
      { id: "broken", ownerId: "missing", title: "Unavailable owner", booking: { status: "none" } },
    ] };
    const model = projectHomeModel({ trip: authored, progress: emptyTripProgress(), persistenceStatus: "persistent", instant: "2040-06-12T00:00:00Z" });
    expect(model.reservations[0].destination).toEqual({ dayId: "one", nodeId: "meal" });
    expect(model.reservations[1].destination).toBeUndefined();
  });

  it("projects authored facts and core completion scopes without sharing mutable records", () => {
    const authored: Trip = { ...trip, destinationLabel: "Coast", travelerLabel: "Friends", days: [{ ...trip.days[0], nodes: [{ id: "hotel", dayId: "one", kind: "lodging", title: "Stay", optionality: "optional", timing: { certainty: "fixed", start: "18:00" }, payload: { role: "check-in", checklist: [{ id: "key", title: "Key" }] }, booking: { status: "confirmed", reference: "ref" }, place: { name: "Inn", certainty: "confirmed", identity: { status: "unresolved", reason: "not-reviewed" } } }] }], tasks: [{ id: "pack", title: "Pack", scope: "pretrip", children: [{ id: "bag", title: "Bag" }] }], reservations: [{ id: "booking", ownerId: "hotel", title: "Stay", booking: { status: "pending" } }] };
    const progress = { ...emptyTripProgress(), completedIds: ["node:hotel", "checklist:bag"], selectedCandidateIds: { choice: "option" }, shoppingStatuses: { souvenir: "purchased" as const }, skippedNodeIds: ["hotel"] };
    const model = projectHomeModel({ trip: authored, progress, persistenceStatus: "persistent", instant: "2040-06-12T00:00:00Z" });
    expect(model.progress.trip).toEqual({ completed: 2, total: 4 });
    expect(model.progress.days).toEqual([{ dayId: "one", completed: 1, total: 2 }]);
    expect(model.capabilities.progress.completionIds).toEqual(["node:hotel", "checklist:key", "task:pack", "checklist:bag"]);
    expect(model.tasks[0]).toEqual({ id: "task:pack", title: "Pack", scope: "pretrip", completed: false, children: [{ id: "checklist:bag", title: "Bag", completed: true }] });
    expect(model.lodging[0]).toMatchObject({ ownerId: "hotel", role: "check-in", place: { label: "Inn", resolution: { status: "unresolved", reason: "not-reviewed" } } });
    expect(model.lodging[0].booking).not.toBe(authored.days[0].nodes[0].booking);
    expect(model.reservations[0].booking).not.toBe(authored.reservations[0].booking);
    expect(model.progress.completedIds).not.toBe(progress.completedIds);
  });
});
