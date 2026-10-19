// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { createMemoryTripNavigationStore, type Trip } from "@laugh-tale-island/core";
import { createLocalStorageProgressStore } from "@laugh-tale-island/core/browser";
import { TripController, type HomeModel, type TripPresentationV2 } from "@laugh-tale-island/react";
import * as entry from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.js";
import { OakWashiHome } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/home/OakWashiHome.js";
import { catalog, locale } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js";
import { controls } from "../fixtures/oak-washi/row-cases.js";
import { semanticMapTrip } from "../fixtures/oak-washi/map-content-cases.js";

const ready = { status: "ready", retryable: false } as const;
function home(overrides: Partial<HomeModel> = {}): HomeModel {
  return {
    identity: { tripId: "trip", title: "Coastal notebook", startDate: "2040-06-12", endDate: "2040-06-25", locale: "zh-Hant-TW", timezone: "Asia/Taipei" },
    effectiveEntryDayId: "last",
    days: [{ id: "first", title: "Market lanes", date: "2040-06-12", ordinal: 3, effective: false, progress: { completed: 0, total: 4 } }, { id: "last", title: "Harbour crossing", date: "2040-06-25", ordinal: 19, effective: true, progress: { completed: 2, total: 8 } }],
    lodging: [], tasks: [], reservations: [], progress: { trip: { completed: 0, total: 12 }, days: [], selectedCandidates: [], shopping: [], skippedNodeIds: [], completedIds: [] }, persistence: { status: "persistent", writable: true }, providers: { map: ready, routes: ready, places: ready }, capabilities: { openExperienceDayIds: ["last"], progress: { completionIds: [], skippableNodeIds: [], shoppingItemIds: [], resetTrip: false, resetDayIds: [] } }, ...overrides,
  };
}
const completion = (completed: number, total: number) => catalog.progress.completedOfTotal.replace("{completed}", String(completed)).replace("{total}", String(total));
afterEach(cleanup);

test("keyless home keeps optional missing provider configuration in contextual details", () => {
  const missing = { status: "unavailable", reason: "missing-configuration", retryable: false } as const;
  const view = render(<OakWashiHome model={home({ providers: { map: ready, places: missing, routes: missing } })} actions={controls().actions} />);
  expect(view.container.querySelectorAll(".oak-inline-state")).toHaveLength(0);
  expect(view.getByRole("button", { name: catalog.home.openExperience })).toBeDefined();
  view.rerender(<OakWashiHome model={home({ providers: { map: { status: "unavailable", reason: "network", retryable: true }, places: missing, routes: missing } })} actions={controls().actions} />);
  expect(view.getByText(new RegExp(catalog.provider.network))).toBeDefined();
});

test("lodging accessible names use localized visit dates and preserve missing-day fallback", () => {
  const view = render(<OakWashiHome model={home({ lodging: [
    { ownerId: "localized", dayId: "last", title: "同名旅宿", role: "base", timing: { certainty: "unknown" } },
    { ownerId: "fallback", dayId: "missing-day", title: "同名旅宿", role: "return", timing: { certainty: "unknown" } },
  ] })} actions={controls().actions} />);
  const localized = view.getByRole("listitem", { name: "同名旅宿 · 第 19 天 · 6/25" });
  expect(localized.getAttribute("data-home-lodging-owner")).toBe("localized");
  expect(localized.querySelector("time")?.textContent).toBe("6/25");
  expect(localized.querySelector("time")?.getAttribute("datetime")).toBe("2040-06-25");
  const fallback = view.getByRole("listitem", { name: "同名旅宿 · missing-day" });
  expect(fallback.getAttribute("data-home-lodging-owner")).toBe("fallback");
  expect(fallback.querySelector(".oak-home-lodging-day")?.textContent).toBe("missing-day");
  expect(fallback.querySelector("time")).toBeNull();
});

test("consecutive equal lodging titles share typography while every visit keeps its own day and facts", () => {
  const lodging: HomeModel["lodging"] = [
    { ownerId: "east", dayId: "last", title: "同名旅宿", role: "check-in", timing: { certainty: "unknown" }, place: { label: "East gate", certainty: "unverified", resolution: { status: "unresolved", reason: "not-reviewed" } }, booking: { status: "pending", reference: "EAST", arrivalBufferMinutes: 0, url: "https://example.invalid/east" } },
    { ownerId: "west", dayId: "first", title: "同名旅宿", role: "return", timing: { certainty: "fixed", start: "22:00", end: "23:00", dayOffset: 1 }, place: { label: "West gate", certainty: "confirmed", resolution: { status: "resolved" } }, booking: { status: "confirmed", reference: "WEST", url: "https://example.invalid/west" } },
    { ownerId: "other", dayId: "missing-day", title: "另一旅宿", role: "base", timing: { certainty: "unknown" } },
    { ownerId: "again", dayId: "last", title: "同名旅宿", role: "check-out", timing: { certainty: "unknown" } },
  ];
  const view = render(<OakWashiHome model={home({ lodging })} actions={controls().actions} />);
  const records = [...view.container.querySelectorAll<HTMLElement>("[data-home-lodging-owner]")];
  expect(records.map(row => row.dataset.homeLodgingOwner)).toEqual(["east", "west", "other", "again"]);
  expect(records.map(row => row.dataset.homeLodgingDay)).toEqual(["last", "first", "missing-day", "last"]);
  expect(records.map(row => row.querySelector("h3")?.textContent ?? null)).toEqual(["同名旅宿", null, "另一旅宿", "同名旅宿"]);
  expect(records.map(row => row.querySelector("time")?.getAttribute("datetime") ?? null)).toEqual(["2040-06-25", "2040-06-12", null, "2040-06-25"]);
  expect(records[0].textContent).toContain("第 19 天"); expect(records[1].textContent).toContain("第 3 天");
  expect(records[2].querySelector(".oak-home-lodging-day")?.textContent).toBe("missing-day");
  for (const [index, own, other] of [[0, "EAST", "WEST"], [1, "WEST", "EAST"]] as const) {
    expect(records[index].textContent).toContain(own); expect(records[index].textContent).not.toContain(other);
    expect(records[index].getAttribute("aria-label")).toContain("同名旅宿");
  }
  for (const text of ["East gate", catalog.timing.unknown, catalog.certainty.unverified, catalog.facts.unverifiedLocation, catalog.booking.pending, catalog.facts.arrivalBuffer.replace("{minutes}", "0"), "https://example.invalid/east"]) expect(records[0].textContent).toContain(text);
  for (const text of ["West gate", "22:00", "23:00", catalog.timing.fixed, `${catalog.timing.nextDay} 1`, catalog.certainty.confirmed, catalog.booking.confirmed, "https://example.invalid/west"]) expect(records[1].textContent).toContain(text);
  expect(records[1].textContent).not.toContain(catalog.facts.unverifiedLocation);
  expect(records.every(row => row.querySelector("a, button") === null)).toBe(true);
});

test.each(["manual", "current", "upcoming", "final"])("%s supplied entry is authoritative even when another day is marked effective", scenario => {
  const c = controls(); const data = home({ effectiveEntryDayId: scenario, days: [{ ...home().days[0], id: scenario }, home().days[1]], capabilities: { ...home().capabilities, openExperienceDayIds: [scenario] } });
  const view = render(<OakWashiHome model={data} actions={c.actions} />);
  fireEvent.click(view.getByRole("button", { name: catalog.home.openExperience }));
  expect(c.actions.openExperience).toHaveBeenCalledExactlyOnceWith(scenario);
  expect(view.getAllByText("Harbour crossing")).toHaveLength(1);
  expect(view.getAllByText("Market lanes")).toHaveLength(1);
  expect(entry.OakWashiHome).toBe(OakWashiHome);
});
test("trip identity leads the editorial reading order, absent optional sections reserve no elements", () => {
  const view = render(<OakWashiHome model={home()} actions={controls().actions} />);
  expect(view.getAllByRole("heading").map(heading => heading.textContent)).toEqual(["Coastal notebook", catalog.home.days, "Market lanes", "Harbour crossing"]);
  expect(view.container.querySelector("main")?.getAttribute("lang")).toBe(locale);
  const identity = view.container.querySelector("header")!;
  expect([...identity.querySelectorAll("time")].map(time => time.textContent)).toEqual(["2040-06-12", "2040-06-25"]);
  for (const label of [catalog.home.destination, catalog.home.travelers, catalog.home.lodging, catalog.home.tasks, catalog.home.reservations, "Taipei"]) expect(view.queryByText(label)).toBeNull();
  expect(view.container.querySelector(".oak-home-utilities")).toBeNull();
  expect(view.container.querySelector(".oak-home-flow")?.firstElementChild).toBe(view.container.querySelector(".oak-home-days"));
  expect(view.getByText(completion(0, 12))).toBeDefined();
});
test.each([{ completed: 0, total: 0 }, { completed: 7, total: 12 }])("trip progress uses the supplied $completed / $total without task-based recalculation", trip => {
  const view = render(<OakWashiHome model={home({ progress: { ...home().progress, trip } })} actions={controls().actions} />);
  expect(view.getByText(completion(trip.completed, trip.total))).toBeDefined();
});
test("every supplied day and ordinal stays in authored order with independent capability and effective flags", () => {
  const c = controls(); const days = Array.from({ length: 17 }, (_, index) => ({ id: `day-${17 - index}`, title: `Authored ${index}`, date: "2040-06-12", ordinal: 50 - index, effective: index === 4, summary: index === 5 ? "Keep the afternoon open" : undefined, progress: { completed: index, total: 22 } }));
  const data = home({ days, capabilities: { ...home().capabilities, openExperienceDayIds: ["day-12"] } });
  const view = render(<OakWashiHome model={data} actions={c.actions} />);
  const list = within(view.getByRole("region", { name: catalog.home.days }));
  const rows = [...view.container.querySelectorAll("[data-home-day-id]")];
  expect(rows.map(row => row.getAttribute("data-home-day-id"))).toEqual(days.map(day => day.id));
  expect(rows[4].getAttribute("aria-current")).toBe("true"); expect(rows[0].getAttribute("aria-current")).toBeNull();
  expect(rows[0].textContent).toContain(catalog.experience.dayOfTrip.replace("{ordinal}", "50"));
  expect(rows[5].textContent).toContain(completion(5, 22)); expect(rows[5].textContent).toContain("Keep the afternoon open");
  expect(list.getAllByRole("button")).toHaveLength(1); fireEvent.click(list.getByRole("button")); expect(c.actions.openExperience).toHaveBeenCalledWith("day-12");
  expect(view.queryByRole("button", { name: catalog.home.openExperience })).toBeNull();
});
test("day copy and available action share a heading without moving authored tasks", () => {
  const c = controls();
  const data = home({
    days: [{ ...home().days[0], summary: "A deliberately complete day summary" }, home().days[1]],
    tasks: [{ id: "first-task", title: "Bring the paper tickets", scope: "day", dayId: "first", completed: false, children: [] }],
    capabilities: { ...home().capabilities, openExperienceDayIds: ["first"], progress: { ...home().capabilities.progress, completionIds: ["first-task"] } },
  });
  const view = render(<OakWashiHome model={data} actions={c.actions} />);
  const first = view.container.querySelector('[data-home-day-id="first"]')!;
  const heading = first.querySelector(".oak-home-day-heading")!;
  const copy = heading.querySelector(".oak-home-day-copy")!;
  expect([...copy.children].map(child => child.tagName)).toEqual(["DIV", "H3", "P", "P"]);
  expect(copy.querySelector("time")?.getAttribute("datetime")).toBe("2040-06-12");
  expect(copy.textContent).toContain("A deliberately complete day summary");
  expect(copy.textContent).toContain(completion(0, 4));
  const action = within(first as HTMLElement).getByRole("button", { name: `${catalog.home.openDay} · ${catalog.experience.dayOfTrip.replace("{ordinal}", "3")}` });
  expect(action.parentElement).toBe(heading);
  expect(action.classList.contains("oak-home-day-open")).toBe(true);
  expect(action.getAttribute("title")).toBe(action.getAttribute("aria-label"));
  expect(action.textContent).toBe("");
  expect(action.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  expect(action.querySelector("svg")?.getAttribute("width")).toBe("18");
  expect(action.querySelector("svg")?.getAttribute("stroke-width")).toBe("1.75");
  expect(first.querySelector(".oak-home-day-utility")?.previousElementSibling).toBe(heading);
  fireEvent.click(action); expect(c.actions.openExperience).toHaveBeenCalledExactlyOnceWith("first");
  fireEvent.click(within(first as HTMLElement).getByRole("checkbox", { name: "Bring the paper tickets" }));
  expect(c.actions.updateProgress).toHaveBeenCalledExactlyOnceWith({ kind: "completion", id: "first-task", completed: true });
});
test("day without open capability has copy only and retains effective metadata", () => {
  const view = render(<OakWashiHome model={home()} actions={controls().actions} />);
  const first = view.container.querySelector('[data-home-day-id="first"]')!;
  expect(first.querySelector(".oak-home-day-heading")?.children).toHaveLength(1);
  expect(first.querySelector(".oak-home-day-open")).toBeNull();
  const last = view.container.querySelector('[data-home-day-id="last"]')!;
  expect(last.getAttribute("aria-current")).toBe("true");
  expect(last.querySelector(".oak-home-day-meta")?.textContent).toContain(catalog.status.selected);
  expect(last.querySelector("time")?.getAttribute("datetime")).toBe("2040-06-25");
});
test.each([
  { scenario: "manual past day", date: "2040-06-11" },
  { scenario: "upcoming day", date: "2040-06-13" },
  { scenario: "final day after the trip", date: "2040-06-25" },
])("Home marks a supplied $scenario as the effective item without claiming it is today", ({ date }) => {
  const data = home({ days: [home().days[0], { ...home().days[1], date }] });
  const view = render(<OakWashiHome model={data} actions={controls().actions} />);
  expect(view.container.querySelector('[data-home-day-id="last"]')?.getAttribute("aria-current")).toBe("true");
  expect(view.container.querySelector('[data-home-day-id="first"]')?.hasAttribute("aria-current")).toBe(false);
  expect(view.container.querySelector('[aria-current="date"]')).toBeNull();
});
test("task scopes preserve every title, note, ordered child and exact completion ID once without an itinerary join", () => {
  const c = controls(); const data = home({ tasks: [
    { id: "before", title: "Standalone collision", scope: "day", dayId: "last", note: "For the harbour day only", completed: true, children: [{ id: "literal-child-b", title: "Child B", completed: true }, { id: "literal-child-a", title: "Child A", completed: false }] },
    { id: "literal-pretrip", title: "Prepare documents", scope: "pretrip", note: "<b>Keep original wording</b>", completed: false, children: [] },
    { id: "other-day", title: "First day errand", scope: "day", dayId: "first", completed: false, children: [] },
  ], persistence: { status: "memory-only", writable: false }, capabilities: { ...home().capabilities, progress: { ...home().capabilities.progress, completionIds: ["before", "literal-child-b", "literal-child-a", "literal-pretrip"] } } });
  const view = render(<OakWashiHome model={data} actions={c.actions} />);
  const pretrip = view.getByRole("region", { name: catalog.home.tasks });
  expect(within(pretrip).getByText("Prepare documents")).toBeDefined(); expect(pretrip.textContent).not.toContain("Standalone collision");
  const last = view.container.querySelector('[data-home-day-id="last"]')!;
  expect(last.textContent).toContain("Standalone collision"); expect(last.textContent).not.toContain("First day errand");
  const task = last.querySelector('[data-home-task-id="before"]')!;
  expect([...task.querySelectorAll("[data-checklist-id]")].map(child => child.textContent)).toEqual([`Child B${catalog.progress.complete}`, `Child A${catalog.progress.pending}`]);
  for (const title of ["Standalone collision", "For the harbour day only", "Child B", "Child A", "Prepare documents", "<b>Keep original wording</b>", "First day errand"]) expect(view.getAllByText(title)).toHaveLength(1);
  expect(view.container.querySelector("b")).toBeNull(); expect(view.getByText(catalog.persistence.memoryOnlyNotice)).toBeDefined();
  expect((view.getByRole("checkbox", { name: "Standalone collision" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(view.getByRole("checkbox", { name: "Standalone collision" }));
  fireEvent.click(view.getByRole("checkbox", { name: "Child A" }));
  fireEvent.click(view.getByRole("checkbox", { name: "Prepare documents" }));
  expect(c.actions.updateProgress.mock.calls).toEqual([[{ kind: "completion", id: "before", completed: false }], [{ kind: "completion", id: "literal-child-a", completed: true }], [{ kind: "completion", id: "literal-pretrip", completed: true }]]);
  view.rerender(<OakWashiHome model={{ ...data, capabilities: { ...data.capabilities, progress: { ...data.capabilities.progress, completionIds: [] } } }} actions={c.actions} />);
  expect(view.queryAllByRole("checkbox")).toHaveLength(0); expect(view.getAllByText("Child B")).toHaveLength(1); expect(last.textContent).toContain(catalog.progress.complete);
});
test("lodging and reservations retain supplied facts once per record with no unauthorized booking or retry action", () => {
  const data = home({ identity: { ...home().identity, destinationLabel: "Authored coastline", travelerLabel: "Family of three" }, lodging: [{ ownerId: "inn", dayId: "last", title: "Harbour Inn", role: "check-in", timing: { certainty: "suggested", start: "15:00", end: "18:00", dayOffset: 1 }, place: { label: "East entrance", certainty: "unverified", resolution: { status: "unresolved", reason: "not-reviewed" } }, booking: { status: "confirmed", reference: "STAY-1", url: "https://example.test/stay", arrivalBufferMinutes: 15 } }], reservations: [{ id: "ticket", ownerId: "before", title: "Ferry ticket", booking: { status: "pending", reference: "TICKET-2", url: "https://example.test/ticket" } }], providers: { map: { status: "unavailable", reason: "network", retryable: true }, routes: ready, places: ready } });
  const view = render(<OakWashiHome model={data} actions={controls().actions} />);
  for (const text of ["Authored coastline", "Family of three", "Harbour Inn", "East entrance", "Ferry ticket", "https://example.test/stay", "https://example.test/ticket"]) expect(view.getAllByText(text)).toHaveLength(1);
  const lodging = view.getByRole("region", { name: catalog.home.lodging });
  for (const text of [catalog.facts.checkIn, "15:00", "18:00", catalog.timing.suggested, catalog.timing.nextDay, catalog.certainty.unverified, catalog.facts.unverifiedLocation, catalog.booking.confirmed, "STAY-1", catalog.facts.arrivalBuffer.replace("{minutes}", "15")]) expect(lodging.textContent).toContain(text);
  const reservations = view.getByRole("region", { name: catalog.home.reservations }); expect(reservations.textContent).toContain(catalog.booking.pending); expect(reservations.textContent).toContain("TICKET-2");
  expect(view.queryAllByRole("link")).toHaveLength(0); expect(view.queryByRole("button", { name: catalog.provider.retry })).toBeNull(); expect(view.queryByRole("button", { name: catalog.booking.open })).toBeNull();
  expect(view.getByText(new RegExp(catalog.provider.network))).toBeDefined();
  expect(view.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent)).toEqual([catalog.home.days, catalog.home.lodging, catalog.home.reservations]);
  expect([...view.container.querySelector(".oak-home-flow")!.children].map(child => child.classList.contains("oak-home-days") ? "days" : "utilities")).toEqual(["days", "utilities"]);
});
test("a resolvable reservation has one direct itinerary action without inventing an external booking action", () => {
  const c = controls();
  const data = home({ reservations: [
    { id: "ticket", ownerId: "museum", title: "Museum ticket", booking: { status: "confirmed" }, destination: { dayId: "last", nodeId: "museum" } },
    { id: "orphan", ownerId: "missing", title: "Unlinked note", booking: { status: "pending" } },
  ] });
  const view = render(<OakWashiHome model={data} actions={c.actions} />);
  const linked = view.container.querySelector<HTMLElement>('[data-home-reservation-id="ticket"]')!;
  const unlinked = view.container.querySelector<HTMLElement>('[data-home-reservation-id="orphan"]')!;
  fireEvent.click(within(linked).getByRole("button", { name: `${catalog.home.openDay} · Museum ticket` }));
  expect(c.actions.openReservation).toHaveBeenCalledExactlyOnceWith("ticket");
  expect(unlinked.querySelector("button, a")).toBeNull();
});
test("progress date picker remains native and gets the same deliberate closed-control treatment", () => {
  const data = home({ capabilities: { ...home().capabilities, progress: { ...home().capabilities.progress, resetTrip: true, resetDayIds: ["first", "last"] } } });
  const view = render(<OakWashiHome model={data} actions={controls().actions} />);
  fireEvent.click(view.getByText(catalog.persistence.manageProgress));
  const select = view.getByRole("combobox", { name: catalog.persistence.resetDayScope });
  expect(select.closest(".oak-native-select")).not.toBeNull();
  expect([...select.querySelectorAll("option")].map(option => option.value)).toEqual(["first", "last"]);
  expect(view.container.querySelector(".oak-reset-selected-day")).toBeNull();
  expect((select as HTMLSelectElement).selectedOptions[0].textContent).toBe(`${data.days[1].date} · ${data.days[1].title}`);
  fireEvent.change(select, { target: { value: "first" } });
  expect((select as HTMLSelectElement).selectedOptions[0].textContent).toBe(`${data.days[0].date} · ${data.days[0].title}`);
});
test("reset cancellation keeps progress and confirmation sends only the selected day", () => {
  const c = controls();
  const data = home({ capabilities: { ...home().capabilities, progress: { ...home().capabilities.progress, resetTrip: true, resetDayIds: ["first", "last"] } } });
  const view = render(<OakWashiHome model={data} actions={c.actions} />);
  fireEvent.click(view.getByText(catalog.persistence.manageProgress));
  const select = view.getByRole("combobox", { name: catalog.persistence.resetDayScope });
  fireEvent.change(select, { target: { value: "first" } });
  fireEvent.click(view.getByRole("button", { name: catalog.persistence.resetDay }));
  expect(view.getByRole("group", { name: catalog.persistence.confirmReset }).textContent).toContain("Market lanes");
  fireEvent.click(view.getByRole("button", { name: catalog.persistence.cancelReset }));
  expect(c.actions.resetProgress).not.toHaveBeenCalled();
  expect(view.getByText(completion(0, 12))).toBeDefined();
  fireEvent.click(view.getByRole("button", { name: catalog.persistence.resetDay }));
  fireEvent.click(view.getByRole("group", { name: catalog.persistence.confirmReset }).querySelectorAll("button")[1]);
  expect(c.actions.resetProgress).toHaveBeenCalledExactlyOnceWith("day", "first");
  expect(view.getByText(completion(2, 8))).toBeDefined();
});
test("lodging groups its authored role and complete timing/place facts without duplicating an equal place label", () => {
  const view = render(<OakWashiHome model={home({ lodging: [
    { ownerId: "same", dayId: "last", title: "同名旅宿", role: "check-out", timing: { start: "07:00", end: "08:00", certainty: "suggested", dayOffset: -1 }, place: { label: "同名旅宿", certainty: "unverified", resolution: { status: "unresolved", reason: "not-reviewed" } } },
    { ownerId: "different", dayId: "first", title: "Coastal lodge", role: "base", timing: { certainty: "unknown" }, place: { label: "West gate", certainty: "confirmed", resolution: { status: "unresolved", reason: "not-reviewed" } } },
  ] })} actions={controls().actions} />);
  const rows = [...view.container.querySelectorAll("[data-home-lodging-owner]")];
  expect(rows.map(row => row.getAttribute("data-home-lodging-owner"))).toEqual(["same", "different"]);
  expect(rows[0].querySelector("h3")?.textContent).toBe("同名旅宿");
  expect(rows[0].querySelector(".oak-home-lodging-day")?.textContent).toBe("第 19 天6/25");
  expect(rows[0].querySelector(".oak-home-lodging-heading > span")?.textContent).toBe(catalog.facts.checkOut);
  expect(rows[0].querySelector(".oak-home-lodging-meta")?.textContent).toContain("07:00");
  expect(rows[0].querySelector(".oak-home-lodging-meta")?.textContent).toContain("08:00");
  expect(rows[0].querySelector(".oak-home-lodging-meta")?.textContent).toContain(`${catalog.timing.nextDay} -1`);
  expect(rows[0].querySelector(".oak-home-place")?.textContent).toBe(`${catalog.certainty.unverified}${catalog.facts.unverifiedLocation}`);
  expect(rows[1].querySelector(".oak-home-place")?.textContent).toBe(`West gate${catalog.certainty.confirmed}${catalog.facts.unverifiedLocation}`);
  expect(rows[0].querySelector(".oak-home-booking")).toBeNull();
});
test("booking status and semantic reference retain zero, empty, and unsafe authored values as read only text", () => {
  const view = render(<OakWashiHome model={home({ reservations: [
    { id: "first", ownerId: "first", title: "First hold", booking: { status: "pending", reference: "", arrivalBufferMinutes: 0, url: "javascript:alert(1)" } },
    { id: "second", ownerId: "last", title: "Second hold", booking: { status: "confirmed", reference: "REF-2", url: "" } },
  ] })} actions={controls().actions} />);
  const rows = [...view.container.querySelectorAll("[data-home-reservation-id]")];
  expect(rows.map(row => row.getAttribute("data-home-reservation-id"))).toEqual(["first", "second"]);
  expect(rows[0].querySelector(".oak-home-booking-status")?.textContent).toBe(catalog.booking.pending);
  const reference = rows[0].querySelector("dl.oak-home-booking-reference")!;
  expect([...reference.children].map(child => [child.tagName, child.textContent])).toEqual([["DT", catalog.booking.reference], ["DD", ""]]);
  expect(rows[0].querySelector(".oak-home-booking-buffer")?.textContent).toBe(catalog.facts.arrivalBuffer.replace("{minutes}", "0"));
  expect(rows[0].querySelector(".oak-home-booking-url.oak-copy-secondary")?.textContent).toBe("javascript:alert(1)");
  expect(rows[1].querySelector(".oak-home-booking-reference dd")?.textContent).toBe("REF-2");
  expect(rows[1].querySelector(".oak-home-booking-url")?.textContent).toBe("");
  for (const row of rows) { expect(row.querySelector("a, button")).toBeNull(); expect(row.querySelector(".oak-home-booking")?.children).toHaveLength(row === rows[0] ? 4 : 3); }
});
test("long Latin and CJK authored content stays text and Home reflows through a natural DOM split", () => {
  const title = "AnUnbrokenAuthoredTripTitle".repeat(14) + "城市海港與街巷的完整旅途名稱".repeat(14);
  const style = document.createElement("style"); style.textContent = ["tokens", "layout", "components"].map(name => readFileSync(`plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles/${name}.css`, "utf8")).join("\n"); document.head.append(style);
  const view = render(<OakWashiHome model={home({ identity: { ...home().identity, title } })} actions={controls().actions} />);
  expect(view.getByRole("heading", { level: 1 }).textContent).toBe(title);
  const root = view.container.querySelector(".oak-home")!;
  expect(getComputedStyle(root).fontFamily).toBe("var(--oak-font-ui)"); expect(getComputedStyle(root).overflowWrap).toBe("anywhere");
  expect(getComputedStyle(view.getByRole("heading", { level: 1 })).whiteSpace).not.toBe("nowrap");
  expect(getComputedStyle(view.getByRole("button", { name: catalog.home.openExperience })).minHeight).toBe("44px");
  const media = [...style.sheet!.cssRules].filter(rule => rule instanceof CSSMediaRule).map(rule => rule.cssText).join("\n");
  expect(media).toContain(".oak-home-flow"); expect(media).toContain("minmax(0, 1fr)");
  expect(getComputedStyle(root.querySelector(".oak-home-days")!).order).not.toMatch(/[1-9]/);
  style.remove();
});

const presentation: TripPresentationV2 = { ...entry.oakWashiMapBindings, Home: OakWashiHome, Experience: ({ model }) => <p>{model.day.id}</p>, Loading: ({ model }) => <p>{model.operation}</p>, SetupRequired: ({ model }) => <p>{model.issues.map(issue => issue.kind).join(",")}</p>, FatalError: ({ model }) => <p>{model.category}</p> };
test("public TripController rejects no days before Home is rendered", () => {
  const view = render(<TripController trip={{ ...semanticMapTrip, days: [] }} presentation={presentation} />);
  expect(view.getByText("invalid-trip")).toBeDefined(); expect(view.queryByRole("main")).toBeNull();
});
test("public hydrated Home keeps session task progress and opens the effective entry through real actions", async () => {
  const trip: Trip = { ...semanticMapTrip, tasks: [{ id: "before", scope: "day", dayId: "one", title: "Standalone real task", children: [{ id: "download", title: "Download real ticket" }, { id: "passport", title: "Bring passport" }] }] };
  const navigationStore = createMemoryTripNavigationStore();
  const progressStore = createLocalStorageProgressStore("home-public", { storage: { getItem: () => { throw new Error("Unavailable storage"); }, setItem: () => { throw new Error("Unavailable storage"); } }, events: undefined });
  const view = render(<TripController trip={trip} presentation={presentation} navigationStore={navigationStore} progressStore={progressStore} clock={() => "2040-06-12T10:00:00Z"} />);
  const task = await view.findByRole("checkbox", { name: "Standalone real task" });
  expect(view.getByText(catalog.persistence.memoryOnlyNotice)).toBeDefined();
  fireEvent.click(task); await waitFor(() => expect((view.getByRole("checkbox", { name: "Standalone real task" }) as HTMLInputElement).checked).toBe(true));
  fireEvent.click(view.getByRole("checkbox", { name: "Download real ticket" })); await waitFor(() => expect((view.getByRole("checkbox", { name: "Download real ticket" }) as HTMLInputElement).checked).toBe(true));
  fireEvent.click(view.getByRole("button", { name: catalog.home.openExperience }));
  await waitFor(() => expect(navigationStore.read()).toMatchObject({ surface: "experience", dayId: "one" }));
});
