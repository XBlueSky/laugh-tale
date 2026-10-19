import type { Trip } from "@laugh-tale-island/core";

function deepFreeze<T>(value: T, seen = new Set<unknown>()): T {
  if ((typeof value !== "object" && typeof value !== "function") || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  return Object.freeze(value);
}

const trip: Trip = {
  id: "trip-synthetic-v2",
  title: "Synthetic Meridian Journey",
  locale: "en",
  timezone: "UTC",
  startDate: "2042-03-04",
  endDate: "2042-03-04",
  destinationLabel: "Neutral Test Archipelago",
  travelerLabel: "Synthetic traveler",
  clockPlaceLabel: "UTC",
  days: [{
    id: "day-synthetic",
    date: "2042-03-04",
    title: "Synthetic contract day",
    summary: "Provider-neutral facts for deterministic tests.",
    nodes: [
      {
        id: "node-transport", dayId: "day-synthetic", kind: "transport", title: "Synthetic shuttle",
        timing: { start: "08:00", end: "08:20", certainty: "suggested" }, optionality: "core",
        place: { name: "Coordinate Gate", certainty: "confirmed", identity: { status: "resolved", coordinates: { lat: 10, lng: 20 } } },
        payload: { mode: "transit", plan: "Board the neutral shuttle." },
      },
      {
        id: "node-transfer", dayId: "day-synthetic", kind: "transfer", title: "Synthetic air transfer",
        timing: { start: "08:30", end: "09:30", certainty: "fixed" }, optionality: "core",
        place: { name: "Provider Gate", certainty: "suggested", identity: { status: "resolved", providerReference: { provider: "synthetic", id: "provider-gate-alpha" } } },
        booking: { status: "confirmed", reference: "SYNTHETIC-BOOKING", url: "https://example.invalid/synthetic-booking", arrivalBufferMinutes: 20 },
        payload: { mode: "flight", terminal: "Neutral Terminal" },
      },
      {
        id: "node-lodging", dayId: "day-synthetic", kind: "lodging", title: "Synthetic base",
        timing: { start: "10:00", certainty: "suggested" }, optionality: "core",
        place: { name: "Synthetic Base", certainty: "confirmed", identity: { status: "resolved", coordinates: { lat: 10.01, lng: 20.01 } } },
        payload: { role: "check-in", checklist: [{ id: "check-lodging", title: "Confirm synthetic access token" }] },
      },
      {
        id: "node-dining", dayId: "day-synthetic", kind: "dining", title: "Choose a synthetic meal",
        timing: { start: "12:00", certainty: "suggested" }, optionality: "candidate",
        place: { name: "Unreviewed Meal Hall", certainty: "unverified", identity: { status: "unresolved", reason: "not-reviewed" } },
        payload: { cuisine: "Test cuisine", candidateGroupId: "candidate-meal" },
      },
      {
        id: "node-shopping", dayId: "day-synthetic", kind: "shopping", title: "Synthetic supply stop",
        timing: { start: "13:00", certainty: "unknown" }, optionality: "optional",
        place: { name: "Supply Annex", certainty: "candidate", identity: { status: "resolved", coordinates: { lat: 10.02, lng: 20.02 } } },
        payload: { items: [{ id: "shopping-journal", title: "Blank field journal", priority: "nice", initialStatus: "pending" }] },
      },
      {
        id: "node-sightseeing", dayId: "day-synthetic", kind: "sightseeing", title: "Synthetic overlook",
        timing: { start: "14:00", end: "15:00", certainty: "suggested" }, optionality: "core",
        place: { name: "Neutral Overlook", certainty: "suggested", identity: { status: "resolved", coordinates: { lat: 10.03, lng: 20.03 } } },
        payload: { area: "Test ridge" },
      },
      {
        id: "node-experience", dayId: "day-synthetic", kind: "experience", title: "Synthetic workshop",
        timing: { start: "15:30", end: "16:30", certainty: "fixed" }, optionality: "core",
        place: { name: "Workshop Annex", certainty: "confirmed", identity: { status: "resolved", coordinates: { lat: 10.04, lng: 20.04 } } },
        booking: { status: "confirmed", reference: "SYNTHETIC-WORKSHOP", url: "https://example.invalid/synthetic-workshop" },
        payload: { durationMinutes: 60 },
      },
      {
        id: "node-logistics", dayId: "day-synthetic", kind: "logistics", title: "Synthetic logistics check",
        timing: { start: "17:00", certainty: "suggested" }, optionality: "core",
        payload: { checklist: [{ id: "check-logistics", title: "Collect neutral test parcel" }] },
      },
      {
        id: "node-custom", dayId: "day-synthetic", kind: "custom", title: "Synthetic field note",
        timing: { start: "18:00", certainty: "unknown" }, optionality: "optional",
        payload: { customKind: "field-note", presentationRole: "task", capabilities: { completion: true }, data: { synthetic: true, revision: 2 } },
      },
    ],
  }],
  routes: [
    { id: "route-walking", dayId: "day-synthetic", fromNodeId: "node-transport", toNodeId: "node-transfer", mode: "walking", source: "manual", certainty: "suggested", durationMinutes: 5 },
    { id: "route-flight", dayId: "day-synthetic", fromNodeId: "node-transfer", toNodeId: "node-lodging", mode: "flight", source: "provider", certainty: "confirmed", durationMinutes: 60 },
    { id: "route-transit", dayId: "day-synthetic", fromNodeId: "node-lodging", toNodeId: "node-dining", mode: "transit", source: "provider", certainty: "suggested" },
    { id: "route-driving", dayId: "day-synthetic", fromNodeId: "node-dining", toNodeId: "node-shopping", mode: "driving", source: "recomposed", certainty: "unverified" },
    { id: "route-walking-two", dayId: "day-synthetic", fromNodeId: "node-shopping", toNodeId: "node-sightseeing", mode: "walking", source: "manual", certainty: "candidate" },
    { id: "route-transit-two", dayId: "day-synthetic", fromNodeId: "node-sightseeing", toNodeId: "node-experience", mode: "transit", source: "provider", certainty: "suggested" },
    { id: "route-driving-two", dayId: "day-synthetic", fromNodeId: "node-experience", toNodeId: "node-logistics", mode: "driving", source: "manual", certainty: "suggested" },
    { id: "route-unknown", dayId: "day-synthetic", fromNodeId: "node-logistics", toNodeId: "node-custom", mode: "unknown", source: "manual", certainty: "unverified", navigation: { origin: "Synthetic logistics", destination: "Synthetic field note" } },
  ],
  candidateGroups: [{
    id: "candidate-meal", parentNodeId: "node-dining", mode: "single", defaultOptionId: "candidate-meal-a",
    options: [
      { id: "candidate-meal-a", title: "Synthetic meal A", place: { name: "Candidate Annex A", certainty: "candidate", identity: { status: "resolved", coordinates: { lat: 10.05, lng: 20.05 } } }, booking: { status: "pending" } },
      { id: "candidate-meal-b", title: "Synthetic meal B", place: { name: "Candidate Annex B", certainty: "candidate", identity: { status: "resolved", providerReference: { provider: "synthetic", id: "candidate-annex-b" } } }, booking: { status: "none" } },
    ],
  }],
  reservations: [{
    id: "reservation-synthetic", title: "Synthetic workshop hold", ownerId: "node-experience",
    booking: { status: "confirmed", reference: "SYNTHETIC-HOLD", url: "https://example.invalid/synthetic-hold", arrivalBufferMinutes: 10 },
  }],
  tasks: [
    { id: "task-pretrip", title: "Prepare synthetic credentials", scope: "pretrip" },
    { id: "task-day", title: "Complete day contract", scope: "day", dayId: "day-synthetic", children: [{ id: "task-child", title: "Record deterministic outcome" }, { id: "task-child-review", title: "Review deterministic outcome" }] },
  ],
};

export const syntheticTripV2: Trip = deepFreeze(trip);
