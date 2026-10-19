import type { MarkerDescriptor } from "@laugh-tale-island/core/browser";
import type { Trip } from "@laugh-tale-island/core";

export const semanticMapTrip: Trip = {
  id: "map-trip", title: "Map trip", locale: "zh-Hant-TW", timezone: "Etc/UTC", startDate: "2040-06-12", endDate: "2040-06-12",
  days: [{ id: "one", title: "One", date: "2040-06-12", nodes: [
    { id: "before", dayId: "one", title: "Before", kind: "sightseeing", payload: {}, timing: { certainty: "unknown" }, optionality: "core", place: { name: "Before", certainty: "confirmed", identity: { status: "resolved", coordinates: { lat: 25, lng: 121 } } } },
    { id: "none-owner", dayId: "one", title: "Train", kind: "transport", payload: { mode: "transit" }, timing: { certainty: "unknown" }, optionality: "core", place: { name: "Station", certainty: "confirmed", identity: { status: "resolved", coordinates: { lat: 25.01, lng: 121.01 } } } },
    { id: "after", dayId: "one", title: "After", kind: "sightseeing", payload: {}, timing: { certainty: "unknown" }, optionality: "core", place: { name: "After", certainty: "confirmed", identity: { status: "resolved", coordinates: { lat: 25.02, lng: 121.02 } } } },
  ] }], routes: [], candidateGroups: [], tasks: [], reservations: [],
};

export const primaryMarker: MarkerDescriptor = {
  ownerId: "museum", label: "A long museum name — 展覽館與城市歷史的完整名稱",
  coordinates: { lat: 25, lng: 121 }, markerMode: "numbered",
  displayIndex: 2, ordinal: "2", sourceKind: "sightseeing", timing: "fixed", states: [],
};

export const baseMarker: MarkerDescriptor = {
  ...primaryMarker, ownerId: "base", markerMode: "base", sourceKind: "lodging", ordinal: undefined, displayIndex: undefined,
};

export const baseStateCases: readonly MarkerDescriptor[] = [
  { ...baseMarker, ownerId: "base-viewing", states: ["viewing"] },
  { ...baseMarker, ownerId: "base-completed", states: ["completed"] },
  { ...baseMarker, ownerId: "base-current-viewing-completed", states: ["current", "viewing", "completed"] },
  { ...baseMarker, ownerId: "base-next-selected-viewing-completed", states: ["next", "selected", "viewing", "completed"] },
  { ...baseMarker, ownerId: "base-candidate-viewing-completed", states: ["candidate", "viewing", "completed"] },
  { ...baseMarker, ownerId: "base-skipped-viewing-completed", states: ["skipped", "viewing", "completed"] },
];

export const mapContentCases: readonly MarkerDescriptor[] = [
  primaryMarker,
  { ...primaryMarker, ownerId: "candidate", ordinal: "2B", states: ["candidate", "selected", "skipped"] },
  { ...primaryMarker, ownerId: "current", states: ["current", "viewing", "completed"] },
  { ...primaryMarker, ownerId: "next", states: ["next", "selected", "unresolved"] },
  baseMarker,
  ...baseStateCases,
];

// @ts-expect-error Semantic none owners are excluded from the browser descriptor contract.
const omittedMarker: MarkerDescriptor = { ...primaryMarker, markerMode: "none" };
void omittedMarker;
