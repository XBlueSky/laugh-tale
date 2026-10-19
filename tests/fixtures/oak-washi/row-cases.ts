import { vi } from "vitest";
import { evaluateOpeningHours, type OpeningHoursFacts } from "@laugh-tale-island/core";
import type { ExperienceBindings, TripActions } from "@laugh-tale-island/react";
export function controls() {
  const actions = { openExperience: vi.fn(), openReservation: vi.fn(), openHome: vi.fn(), selectDay: vi.fn(), selectNode: vi.fn(), selectRoute: vi.fn(), selectCandidate: vi.fn(), setSheetSnap: vi.fn(), stepSheet: vi.fn(), setHeaderExpanded: vi.fn(), settleHeaderTransition: vi.fn(), restoreAutomaticSelection: vi.fn(), returnToCurrent: vi.fn(), returnToLodging: vi.fn(), restoreFullDay: vi.fn(), retryProvider: vi.fn(), openNavigation: vi.fn(), beginLocation: vi.fn(), recenterLocation: vi.fn(), stopLocation: vi.fn(), previewCandidate: vi.fn(), cancelCandidate: vi.fn(), confirmCandidate: vi.fn(), reopenCandidate: vi.fn(), updateProgress: vi.fn(), resetProgress: vi.fn(), retrySetup: vi.fn(), retryFatal: vi.fn() } satisfies TripActions;
  const nodeElements = new Map<string, HTMLElement>(); const routeElements = new Map<string, HTMLElement>(); const triggers = new Map<string, HTMLElement>(); const dialogs = new Map<string, HTMLElement>();
  const register = (map: Map<string, HTMLElement>) => (id: string) => (element: HTMLElement | null) => { if (element) map.set(id, element); else map.delete(id); };
  const bindings = { owners: { nodeRef: register(nodeElements), routeRef: register(routeElements) }, focus: { dialogRef: register(dialogs), disclosureTriggerRef: register(triggers), restoreTrigger: vi.fn() } } satisfies Pick<ExperienceBindings, "owners" | "focus">;
  return { actions, bindings, nodeElements, routeElements, triggers, dialogs };
}

import type { ExperienceCapabilities, ExperienceModel, ExperiencePlaceModel, ExperienceRouteModel, TimelineEntryModel, TimelineNodeFactsModel, TimelineNodeModel } from "@laugh-tale-island/react";

export const node = (overrides: Partial<TimelineNodeModel> = {}): TimelineNodeModel => ({
  kind: "node", ownerId: "museum", nodeId: "museum-node", title: "City Museum", sourceKind: "sightseeing", role: "primary", markerMode: "numbered", ordinal: "7", displayIndex: 7,
  timing: { start: "09:30", end: "10:45", certainty: "fixed" }, states: [], incomingRouteIds: [], details: ["Use the east entrance"], facts: { kind: "sightseeing", area: "Riverside" },
  capabilities: { select: true, skip: true, complete: false, place: true, booking: false, shopping: false }, ...overrides,
});
export const capabilities: ExperienceCapabilities = {
  selectDayIds: [], selectNodeIds: ["museum-node"], selectRouteIds: ["edge"], restoreAutomaticSelection: false, returnToCurrent: false, returnToLodging: false, restoreFullDay: false, retryMap: false, retryRouteIds: ["edge"], retryPlaceOwnerIds: ["museum"], navigationOwnerIds: ["museum", "edge"], location: { begin: false, recenter: false, stop: false }, sheetSnaps: [],
  progress: { completionIds: ["pack-a", "pack-b", "whole"], skippableNodeIds: ["museum-node"], shoppingItemIds: ["tea", "cup", "book", "bag"], resetTrip: false, resetDayIds: [] },
};
export const route = (overrides: Partial<ExperienceRouteModel> = {}): ExperienceRouteModel => ({ routeId: "edge", dayId: "day", fromOwnerId: "origin", toOwnerId: "museum", mode: "walking", source: "provider", certainty: "confirmed", authored: {}, runtime: { status: "ready", durationMinutes: 12, distanceMeters: 800, steps: ["Leave north exit", "Cross the bridge"], transitLines: [{ name: "River Line", shortName: "R2" }] }, selected: false, selectionSource: null, navigationAvailable: true, ...overrides });
export const place = (overrides: Partial<ExperiencePlaceModel> = {}): ExperiencePlaceModel => ({ ownerId: "museum", place: { label: "Museum gate", certainty: "confirmed", resolution: { status: "resolved" } }, runtime: { status: "ready", formattedAddress: "12 River Road", opening: { status: "open" } }, navigationAvailable: true, ...overrides });
export type TimelineModel = Pick<ExperienceModel, "timeline" | "routes" | "places" | "candidates" | "capabilities" | "itinerary" | "reservations" | "tasks">;
export const model = (overrides: Partial<TimelineModel> = {}): TimelineModel => ({ timeline: [node()], routes: [], places: [place()], candidates: [], capabilities, itinerary: { primaryCount: 1, collapsedOwnerId: "museum", focusFallback: { slot: "node", ownerId: "museum" } }, reservations: [], tasks: [], ...overrides });

export const checklist = [{ id: "pack-a", title: "Keep passport ready", completed: false }, { id: "pack-b", title: "Download tickets", completed: true }];
export const factCases: readonly { name: string; facts: TimelineNodeFactsModel; text: readonly string[] }[] = [
  { name: "transport", facts: { kind: "transport", mode: "transit", plan: "Platform 4, express train" }, text: ["Platform 4, express train"] },
  { name: "transfer", facts: { kind: "transfer", mode: "flight", terminal: "Terminal C" }, text: ["Terminal C"] },
  { name: "lodging", facts: { kind: "lodging", role: "check-in", checklist }, text: ["Keep passport ready", "Download tickets"] },
  { name: "dining", facts: { kind: "dining", cuisine: "Coastal cuisine", candidateGroupId: "food-options" }, text: ["Coastal cuisine"] },
  { name: "shopping", facts: { kind: "shopping", items: [{ id: "tea", title: "Mountain tea", priority: "must", status: "pending" }, { id: "cup", title: "Porcelain cup", priority: "nice", status: "purchased" }, { id: "book", title: "Field guide", status: "unavailable" }, { id: "bag", title: "Canvas bag", status: "skipped" }] }, text: ["Mountain tea", "Porcelain cup", "Field guide", "Canvas bag"] },
  { name: "sightseeing", facts: { kind: "sightseeing", area: "Old harbour" }, text: ["Old harbour"] },
  { name: "experience", facts: { kind: "experience", durationMinutes: 75 }, text: ["75"] },
  { name: "logistics", facts: { kind: "logistics", checklist }, text: ["Keep passport ready", "Download tickets"] },
  { name: "custom", facts: { kind: "custom", customKind: "Sound walk", data: { guide: "<b>Listen closely</b>", count: 3, accessible: false } }, text: ["Sound walk", "guide", "<b>Listen closely</b>", "count", "3", "accessible"] },
];
export const roleCases: readonly { name: string; entry: TimelineEntryModel }[] = [
  { name: "primary", entry: node() },
  { name: "base", entry: node({ role: "base", facts: { kind: "lodging", role: "base", checklist: [] }, markerMode: "base" }) },
  { name: "journey", entry: node({ role: "journey", facts: { kind: "transfer", mode: "rail", terminal: "Central terminal" }, markerMode: "none" }) },
  { name: "connector", entry: { kind: "route", ownerId: "edge", routeId: "edge", role: "connector", states: [] } },
  { name: "task", entry: node({ role: "task", facts: { kind: "logistics", checklist }, markerMode: "none", completion: { id: "whole", title: "Prepare documents", completed: false } }) },
  { name: "logistics-group", entry: { kind: "logistics-group", ownerId: "group", role: "logistics-group", titleKey: "timeline.logisticsGroup", childOwnerIds: ["child-b", "child-a"], incomingRouteIds: [], children: [node({ ownerId: "child-b", nodeId: "b", title: "Collect tickets", role: "task", facts: { kind: "logistics", checklist } }), node({ ownerId: "child-a", nodeId: "a", title: "Leave luggage", role: "task", facts: { kind: "custom", customKind: "Storage", data: { locker: "Locker 51" } } })], progress: { completed: 1, total: 2 } } },
];
export const routeCases = [
  { name: "ready-walking", route: route() }, { name: "ready-transit", route: route({ mode: "transit" }) }, { name: "ready-driving", route: route({ mode: "driving" }) },
  { name: "flight", route: route({ mode: "flight", source: "manual", runtime: { status: "idle" }, authored: { durationMinutes: 110, summary: "Flight AB 12" } }) },
  { name: "unknown", route: route({ mode: "unknown", runtime: { status: "idle" } }) },
  { name: "loading", route: route({ runtime: { status: "loading" } }) },
  { name: "external", route: route({ runtime: { status: "unavailable", reason: "unsupported", retryable: false } }) },
  { name: "unavailable", route: route({ navigationAvailable: false, runtime: { status: "unavailable", reason: "network", retryable: false } }) },
  { name: "retry", route: route({ runtime: { status: "unavailable", reason: "network", retryable: true } }) },
  { name: "authored-fallback", route: route({ runtime: { status: "unavailable", reason: "network", retryable: false }, authored: { durationMinutes: 23, distanceMeters: 1450, summary: "Use the ferry if trains stop" } }) },
] as const;
// Evaluate only in fixture assembly, using the frozen public core evaluator.
const overnight: OpeningHoursFacts = { kind: "weekly", completeness: "complete", periods: [{ open: { day: 1, hour: 22, minute: 0 }, close: { day: 2, hour: 4, minute: 0 } }] };
const crossMidnight: OpeningHoursFacts = { kind: "weekly", completeness: "complete", periods: [{ open: { day: 6, hour: 23, minute: 0 }, close: { day: 0, hour: 3, minute: 0 } }] };
const saturdayMorning: OpeningHoursFacts = { kind: "weekly", completeness: "complete", periods: [{ open: { day: 6, hour: 6, minute: 0 }, close: { day: 6, hour: 9, minute: 0 } }] };
function evaluatedPlace(hours: OpeningHoursFacts | undefined, instant = "2026-09-07T23:00:00Z", timezone = "Etc/UTC") {
  return place({ runtime: { status: "ready", ...(hours ? { openingHours: hours } : {}), opening: evaluateOpeningHours(hours, instant, timezone) } });
}
export const openingCases: readonly { name: string; place: ExperiencePlaceModel; text: "open" | "closed" | "absent" | "incomplete" | "invalid" }[] = [
  { name: "known-open", place: evaluatedPlace({ kind: "always-open" }), text: "open" },
  { name: "known-closed", place: evaluatedPlace(overnight, "2026-09-07T12:00:00Z"), text: "closed" },
  { name: "absent", place: evaluatedPlace(undefined), text: "absent" },
  { name: "incomplete", place: evaluatedPlace({ kind: "weekly", completeness: "incomplete", periods: [] }), text: "incomplete" },
  { name: "overnight", place: evaluatedPlace(overnight), text: "open" },
  { name: "cross-midnight", place: evaluatedPlace(crossMidnight, "2026-09-13T01:00:00Z"), text: "open" },
  { name: "trip-timezone", place: evaluatedPlace(saturdayMorning, "2026-09-11T23:00:00Z", "Asia/Taipei"), text: "open" },
  { name: "same-instant-different-trip-timezone", place: evaluatedPlace(saturdayMorning, "2026-09-11T23:00:00Z", "Etc/UTC"), text: "closed" },
  { name: "invalid", place: evaluatedPlace({ kind: "weekly", completeness: "complete", periods: [] }), text: "invalid" },
];
