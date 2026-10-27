// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { StrictMode } from "react";
import type { ExperienceBindings, ExperienceModel } from "@laugh-tale-island/react";
import { OakWashiExperience } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/experience/OakWashiExperience.js";
import { summarizeMapCoverage } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/map/map-coverage.js";
import { catalog } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js";
import { controls, model as timelineModel, node, place, roleCases, route } from "../fixtures/oak-washi/row-cases.js";
import { baseMarker, primaryMarker } from "../fixtures/oak-washi/map-content-cases.js";

const ready = { status: "ready", retryable: false } as const;
function experience(overrides: Partial<ExperienceModel> = {}): ExperienceModel {
  return { ...timelineModel(), trip: { id: "trip", title: "City journey", startDate: "2040-06-12", endDate: "2040-06-12", locale: "zh-Hant-TW", timezone: "Etc/UTC" }, day: { id: "day", title: "River day", date: "2040-06-12", ordinal: 1, orderedDayIds: ["day"] }, days: [{ id: "day", title: "River day", date: "2040-06-12", ordinal: 1 }], clock: { instant: "2040-06-12T10:25:00Z", timezone: "Asia/Taipei", clockPlaceLabel: "Authored harbour" }, owners: { currentId: null, nextId: null, viewingId: null, selectedId: null }, map: { presentation: { markers: [], routes: [] }, provider: ready, cameraIntent: null, layout: null }, sheet: { snap: "half", geometry: null, interactive: true }, header: { expanded: false, revision: 0, transition: null }, progress: { trip: { completed: 0, total: 1 }, days: [], selectedCandidates: [], shopping: [], skippedNodeIds: [], completedIds: [] }, location: { status: "idle", hasFix: false }, persistence: { status: "persistent", writable: true }, providers: { map: ready, places: ready, routes: ready }, motion: "reduced", ...overrides };
}
function shellControls() {
  const control = controls(); const surfaces = new Map<string, HTMLElement>();
  const surfaceRef = vi.fn(); const handleDown = vi.fn(); const measured = vi.fn();
  const refs = new Map<string, (element: HTMLElement | null) => void>();
  const bindings: ExperienceBindings = { ...control.bindings, layout: { mapViewportRef: vi.fn(), occlusionRef: id => { if (!refs.has(id)) refs.set(id, element => { if (element) surfaces.set(id, element); else surfaces.delete(id); }); return refs.get(id)!; } }, sheet: { getSurfaceProps: () => ({ ref: surfaceRef, "aria-describedby": "binding-description", style: { height: "388px" } }), getHandleProps: () => ({ onPointerDown: handleDown, "aria-keyshortcuts": "ArrowUp ArrowDown Home End" }), setMeasuredGeometry: measured } };
  return { ...control, bindings, surfaces, surfaceRef, handleDown, measured };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

test("shell preserves provider mount, actual sheet ref and drag props while composing semantic surfaces", () => {
  const c = shellControls(); const data = experience(); const view = render(<OakWashiExperience {...c} model={data} />);
  const sheet = view.getByRole("region", { name: catalog.accessibleNames.itinerarySheet });
  expect(c.surfaceRef.mock.calls.some(call => call[0] === sheet)).toBe(true);
  expect(sheet.getAttribute("aria-describedby")).toBe("binding-description"); expect(sheet.style.height).toBe("388px");
  expect([...c.surfaces.values()]).toContain(sheet);
  expect(view.getByRole("region", { name: catalog.accessibleNames.map }).classList.contains("oak-map-content")).toBe(true);
  expect(view.getByRole("heading", { name: /City journey.*River day/ })).toBeDefined();
  const dayHeading = view.container.querySelector(".oak-header-identity h1")!;
  expect(dayHeading.textContent).toBe("River day");
  expect(dayHeading.getAttribute("title")).toBe("City journey · River day");
  expect(dayHeading.getAttribute("aria-label")).toBe("City journey · River day");
  expect(view.container.querySelector("time")?.textContent).toBe("18:25");
  expect(view.getByText("Authored harbour")).toBeDefined();
  const heading = within(sheet).getByRole("heading"); expect(heading.textContent).toContain(catalog.experience.itinerary); expect(heading.textContent).toContain(catalog.experience.primaryCount.replace("{count}", "1")); expect(heading.textContent).not.toContain("River day");
  expect(heading.closest(".oak-itinerary-sheet")).toBe(sheet);
  expect(heading.parentElement?.parentElement?.querySelector(".oak-sheet-scroll")).not.toBeNull();
  fireEvent.pointerDown(sheet.querySelector(".oak-sheet-handle")!); expect(c.handleDown).toHaveBeenCalledTimes(1);
  expect(sheet.querySelector(".oak-timeline")).not.toBeNull();
  view.unmount(); expect(c.surfaceRef.mock.calls.at(-1)?.[0]).toBeNull(); expect(c.surfaces.size).toBe(0);
});
test("half-height itinerary scans rows before revealing selected details on activation", () => {
  const c = shellControls();
  const base = experience();
  const selected = node({ states: ["selected"] });
  const data = experience({
    timeline: [selected],
    capabilities: { ...base.capabilities, sheetSnaps: ["half", "expanded"] },
  });
  const view = render(<OakWashiExperience {...c} model={data} />);
  const row = view.container.querySelector('[data-owner-id="museum"]')!;
  expect(row.textContent).toContain("City Museum");
  expect(row.querySelector(".oak-owner-details")).toBeNull();
  fireEvent.click(row.querySelector(".oak-row-selection")!);
  expect(c.actions.selectNode).toHaveBeenCalledWith("museum-node");
  expect(c.actions.setSheetSnap).toHaveBeenCalledWith("expanded");
  view.rerender(<OakWashiExperience {...c} model={{ ...data, sheet: { ...data.sheet, snap: "expanded" } }} />);
  expect(view.container.querySelector('[data-details-owner="museum"]')?.textContent).toContain("Use the east entrance");
});
test("a selected logistics task exposes its essential checklist in the half sheet only", () => {
  const c = shellControls();
  const base = experience();
  const task = node({ ownerId: "departure-task", nodeId: "departure-task", role: "task", markerMode: "none", title: "Prepare departure", states: ["selected"], facts: { kind: "logistics", checklist: [{ id: "pack-a", title: "Pack tickets", completed: false }] } });
  const data = experience({ timeline: [task], capabilities: { ...base.capabilities, selectNodeIds: [task.nodeId] } });
  const view = render(<OakWashiExperience {...c} model={data} />);
  const row = view.container.querySelector('[data-owner-id="departure-task"]')!;
  expect(row.querySelector(".oak-owner-details")).toBeNull();
  expect(within(row as HTMLElement).getByRole("checkbox", { name: "Pack tickets" })).not.toBeNull();
  fireEvent.click(within(row as HTMLElement).getByRole("checkbox", { name: "Pack tickets" }));
  expect(c.actions.updateProgress).toHaveBeenCalledWith({ kind: "completion", id: "pack-a", completed: true });
  view.rerender(<OakWashiExperience {...c} model={{ ...data, sheet: { ...data.sheet, snap: "expanded" } }} />);
  expect(row.querySelector(".oak-half-task-checklist")).toBeNull();
  expect(row.querySelector(".oak-owner-details .oak-checklist")).not.toBeNull();
});
test("itinerary scroll returns to the start only when the selected day changes", () => {
  const c = shellControls();
  const first = experience();
  const view = render(<OakWashiExperience {...c} model={first} />);
  const scrollport = view.container.querySelector<HTMLElement>(".oak-sheet-scroll")!;
  const crowdedPort = view.container.querySelector<HTMLElement>(".oak-sheet-body")!;
  scrollport.scrollTop = 240;
  crowdedPort.scrollTop = 480;
  view.rerender(<OakWashiExperience {...c} model={{ ...first, owners: { ...first.owners, selectedId: "a" } }} />);
  expect(view.container.querySelector(".oak-sheet-scroll")).toBe(scrollport);
  expect(scrollport.scrollTop).toBe(240);
  expect(crowdedPort.scrollTop).toBe(480);
  view.rerender(<OakWashiExperience {...c} model={{ ...first, day: { ...first.day, id: "next-day", title: "Next day", ordinal: 2 } }} />);
  expect(view.container.querySelector(".oak-sheet-scroll")).toBe(scrollport);
  expect(scrollport.scrollTop).toBe(0);
  expect(crowdedPort.scrollTop).toBe(0);
});
test("an unresolved day explains why its ready map has no markers without replacing the map", () => {
  const unresolved = place({ place: { label: "Museum gate", certainty: "unverified", resolution: { status: "unresolved", reason: "not-reviewed" } } });
  const base = experience({ places: [unresolved] });
  const view = render(<OakWashiExperience {...shellControls()} model={base} />);
  expect(view.container.querySelector(".oak-experience")?.getAttribute("data-map-coverage")).toBe("none");
  const note = view.getByRole("note", { name: catalog.provider.map });
  expect(note.textContent).toBe("主要目的地 0／1 已標示；其餘位置仍待驗證，行程仍可照常閱讀。");
  expect(note.textContent).not.toContain(catalog.experience.primaryCount.replace("{count}", String(base.itinerary.primaryCount)));
  expect(view.getByRole("region", { name: catalog.accessibleNames.map })).toBeDefined();
  view.rerender(<OakWashiExperience {...shellControls()} model={{ ...base, places: [place()], map: { ...base.map, presentation: { ...base.map.presentation, markers: [primaryMarker] } } }} />);
  expect(view.container.querySelector(".oak-experience")?.getAttribute("data-map-coverage")).toBe("complete");
  expect(view.queryByRole("note", { name: catalog.provider.map })).toBeNull();
});
test("coverage counts only primary owners with their own markers", () => {
  const base = experience();
  const ownerIds = ["mapped-a", "mapped-b", "unresolved-stop", "mapped-d"];
  const timeline = ownerIds.map((ownerId, index) => node({ ownerId, nodeId: ownerId, title: `Stop ${index + 1}`, ordinal: String(index + 1), states: ownerId === "unresolved-stop" ? ["selected", "unresolved"] : [] }));
  const marker = (ownerId: string) => ({ ...primaryMarker, ownerId });
  const mapWith = (owners: readonly string[]): ExperienceModel["map"] => ({ ...base.map, presentation: { ...base.map.presentation, markers: owners.map(marker) } });
  const mixedModel = experience({ timeline: [...timeline, node({ ownerId: "base", nodeId: "base", role: "base", markerMode: "base" }), node({ ownerId: "task", nodeId: "task", role: "task", markerMode: "none" })], map: { ...base.map, presentation: { ...base.map.presentation, markers: [marker("mapped-a"), marker("mapped-b"), { ...baseMarker, ownerId: "unresolved-stop" }, marker("task"), { ...marker("mapped-d"), states: ["candidate"] }] } } });
  const unresolvedModel = experience({ timeline, map: mapWith([]), owners: { ...base.owners, selectedId: "unresolved-stop" } });
  const completeModel = experience({ timeline, map: mapWith(ownerIds) });
  expect(summarizeMapCoverage(mixedModel)).toEqual({ mapped: 2, total: 4, kind: "partial" });
  expect(summarizeMapCoverage(unresolvedModel)).toEqual({ mapped: 0, total: 4, kind: "none" });
  expect(summarizeMapCoverage(completeModel)).toEqual({ mapped: 4, total: 4, kind: "complete" });
  expect(summarizeMapCoverage(experience({ timeline: [], itinerary: { primaryCount: 0, collapsedOwnerId: null, focusFallback: null } }))).toEqual({ mapped: 0, total: 0, kind: "none" });
  expect(unresolvedModel.map.presentation.markers.map(item => item.ownerId)).not.toContain("unresolved-stop");
  expect(unresolvedModel.map.cameraIntent).toBeNull();
  const view = render(<OakWashiExperience {...shellControls()} model={mixedModel} />);
  expect(view.container.querySelector(".oak-experience")?.getAttribute("data-map-coverage")).toBe("partial");
  expect(view.getByRole("note", { name: catalog.provider.map }).textContent).toContain("2");
  view.rerender(<OakWashiExperience {...shellControls()} model={completeModel} />);
  expect(view.queryByRole("note", { name: catalog.provider.map })).toBeNull();
  view.rerender(<OakWashiExperience {...shellControls()} model={experience({ timeline: [], itinerary: { primaryCount: 0, collapsedOwnerId: null, focusFallback: null } })} />);
  expect(view.container.querySelector(".oak-experience")?.getAttribute("data-map-primary-count")).toBe("0");
  expect(view.queryByRole("note", { name: catalog.provider.map })).toBeNull();
});
test("an open comparison does not mislabel its mapped parent as unverified", () => {
  const base = experience();
  const parent = node({ ownerId: "dining-parent", nodeId: "dining-parent", title: "Mapped meal" });
  const candidate = { groupId: "meal", parentOwnerId: parent.ownerId, mode: "single" as const, open: true, sessionId: 1, options: [{ id: "meal-a", title: "Option A", ordinal: "1a", selected: false, draft: false }], capabilities: { previewOptionIds: ["meal-a"], cancel: true, confirm: false, reopen: true } };
  const closed = experience({ timeline: [parent], places: [place({ ownerId: parent.ownerId })], map: { ...base.map, presentation: { ...base.map.presentation, markers: [{ ...primaryMarker, ownerId: parent.ownerId }] } } });
  const comparing = experience({ ...closed, candidates: [candidate], map: { ...closed.map, presentation: { ...closed.map.presentation, markers: [{ ...primaryMarker, ownerId: "meal-a", states: ["candidate"] }] } } });
  expect(summarizeMapCoverage(closed)).toEqual({ mapped: 1, total: 1, kind: "complete" });
  expect(summarizeMapCoverage(comparing)).toEqual({ mapped: 1, total: 1, kind: "complete" });
});
test("day rail retains arbitrary authored day order, selected-item semantics and capability gates", () => {
  const c = shellControls(); const data = experience({ days: Array.from({ length: 13 }, (_, index) => ({ id: `d${index}`, title: `Day title ${index}`, date: "2040-06-12", ordinal: index + 1 })), header: { expanded: true, transition: null, revision: 0 } });
  const selectable = { ...data, day: { ...data.day, id: "d12" }, capabilities: { ...data.capabilities, selectDayIds: ["d12"], sheetSnaps: ["collapsed", "half", "expanded"] as const } };
  const view = render(<OakWashiExperience {...c} model={selectable} />); const rail = view.getByRole("navigation", { name: catalog.accessibleNames.dayRail });
  expect(within(rail).getAllByRole("button")).toHaveLength(13); fireEvent.click(within(rail).getByRole("button", { name: /Day title 12/ })); expect(c.actions.selectDay).toHaveBeenCalledWith("d12"); expect(within(rail).getByRole("button", { name: /Day title 0/ }).hasAttribute("disabled")).toBe(true);
  expect(within(rail).getByRole("button", { name: /Day title 12/ }).getAttribute("aria-current")).toBe("true");
  fireEvent.click(view.getByRole("button", { name: catalog.accessibleNames.collapseDayRail })); expect(c.actions.setHeaderExpanded).toHaveBeenCalledWith(false);
  view.rerender(<OakWashiExperience {...c} model={{ ...data, header: { ...data.header, expanded: false } }} />); expect(view.queryByRole("navigation")).toBeNull(); expect(view.container.querySelector(".oak-day-rail-content")?.hasAttribute("inert")).toBe(true);
  expect(view.container.querySelector(".oak-header-day-context")?.textContent).toContain("6/12");
  expect(view.container.querySelector(".oak-header-day-context")?.textContent).toContain(catalog.experience.dayOfTrip.replace("{ordinal}", "1"));
});
test.each(["2040-06-11", "2040-06-13"])("manually selected rail date %s is a current item, not the authoritative clock date", date => {
  const base = experience();
  const data = experience({ day: { ...base.day, id: "manual", date }, days: [{ id: "clock-day", title: "Clock day", date: "2040-06-12", ordinal: 1 }, { id: "manual", title: "Manually selected day", date, ordinal: 2 }], header: { expanded: true, transition: null, revision: 0 } });
  const view = render(<OakWashiExperience {...shellControls()} model={data} />);
  const rail = view.getByRole("navigation", { name: catalog.accessibleNames.dayRail });
  expect(within(rail).getByRole("button", { name: /Manually selected day/ }).getAttribute("aria-current")).toBe("true");
  expect(within(rail).getByRole("button", { name: /Clock day/ }).hasAttribute("aria-current")).toBe(false);
  expect(rail.querySelector('[aria-current="date"]')).toBeNull();
});
test.each([null, "missing"])("collapsed projection never substitutes another owner for %s", collapsedOwnerId => {
  const c = shellControls(); const data = experience({ sheet: { snap: "collapsed", geometry: null, interactive: true }, itinerary: { primaryCount: 99, collapsedOwnerId, focusFallback: null }, owners: { currentId: "museum", nextId: "museum", selectedId: "museum", viewingId: "museum" } });
  const view = render(<OakWashiExperience {...c} model={data} />); expect(view.queryByText("City Museum")).toBeNull(); expect(view.container.querySelector(".oak-timeline")).toBeNull(); expect(c.nodeElements.size).toBe(0);
});
test("collapsed summary finds group children and only registers its actionable compact owner", () => {
  const c = shellControls(); const group = roleCases.find(item => item.name === "logistics-group")!.entry;
  const data = experience({ timeline: [node(), group], sheet: { snap: "collapsed", geometry: null, interactive: true }, itinerary: { primaryCount: 1, collapsedOwnerId: "child-a", focusFallback: null } });
  const view = render(<OakWashiExperience {...c} model={{ ...data, capabilities: { ...data.capabilities, selectNodeIds: ["a"] } }} />); expect(view.queryByText("City Museum")).toBeNull(); expect(view.getAllByText("Leave luggage")).toHaveLength(1); expect(c.nodeElements.size).toBe(1); fireEvent.click(c.nodeElements.get("child-a")!); expect(c.actions.selectNode).toHaveBeenCalledWith("a");
});
test("collapsed route summary keeps supplied selection and navigation actions", () => {
  const c = shellControls(); const view = render(<OakWashiExperience {...c} model={experience({ routes: [route({ authored: { summary: "Across the river" } })], timeline: [{ kind: "route", role: "connector", ownerId: "edge", routeId: "edge", states: [] }], sheet: { snap: "collapsed", geometry: null, interactive: true }, itinerary: { primaryCount: 1, collapsedOwnerId: "edge", focusFallback: null } })} />);
  expect(view.getByText("Across the river")).toBeDefined(); fireEvent.click(c.routeElements.get("edge")!); expect(c.actions.selectRoute).toHaveBeenCalledWith("edge", "list"); fireEvent.click(view.getByRole("button", { name: catalog.navigation.open })); expect(c.actions.openNavigation).toHaveBeenCalledWith("edge");
});

test("every measured responsive change is published once, including visual viewport resize and scroll", () => {
  vi.useFakeTimers(); const c = shellControls(); let height = 844; let headerBottom = 140; let halfHeight = 388.24; let lane = 44; let collapsedHeight = 104;
  const viewport = new EventTarget(); vi.stubGlobal("visualViewport", viewport);
  const rect = (top: number, h: number) => new DOMRect(0, top, 390, h);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("oak-experience")) return rect(0, height);
    if (this.classList.contains("oak-upper-clearance")) return rect(12, headerBottom - 12);
    if (this.classList.contains("oak-geometry-collapsed")) return rect(0, collapsedHeight);
    if (this.classList.contains("oak-geometry-half")) return rect(0, halfHeight);
    if (this.classList.contains("oak-geometry-legal")) return rect(0, lane);
    return rect(0, 0);
  });
  const view = render(<OakWashiExperience {...c} model={experience()} />);
  expect(c.measured.mock.calls).toEqual([[{ collapsedHeight: 104, halfHeight: 388.24, expandedHeight: 536 }]]);
  act(() => { window.dispatchEvent(new Event("resize")); vi.advanceTimersByTime(20); }); expect(c.measured).toHaveBeenCalledTimes(1);
  height = 568; halfHeight = 272; headerBottom = 180;
  act(() => { viewport.dispatchEvent(new Event("resize")); vi.advanceTimersByTime(20); }); expect(c.measured.mock.calls.at(-1)).toEqual([{ collapsedHeight: 104, halfHeight: 272, expandedHeight: 300 }]);
  height = 620; lane = 78; collapsedHeight = 138;
  act(() => { viewport.dispatchEvent(new Event("scroll")); vi.advanceTimersByTime(20); }); expect(c.measured.mock.calls.at(-1)).toEqual([{ collapsedHeight: 138, halfHeight: 272, expandedHeight: 300 }]);
  view.unmount(); const count = c.measured.mock.calls.length;
  act(() => { viewport.dispatchEvent(new Event("resize")); window.dispatchEvent(new Event("resize")); vi.runAllTimers(); }); expect(c.measured).toHaveBeenCalledTimes(count);
  vi.unstubAllGlobals(); vi.useRealTimers();
});
test("reference CSS gives real geometry probes and viewport rails the approved responsive contract", () => {
  const style = document.createElement("style"); style.textContent = ["tokens", "layout", "components", "layers"].map(name => readFileSync(`${process.cwd()}/plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles/${name}.css`, "utf8")).join("\n"); document.head.append(style);
  const view = render(<OakWashiExperience {...shellControls()} model={experience({ header: { expanded: true, revision: 0, transition: null } })} />);
  const root = view.container.querySelector(".oak-experience")!; expect(getComputedStyle(root).position).toBe("fixed"); expect(getComputedStyle(root).height).toBe("100dvh"); expect(getComputedStyle(root).fontFamily).toBe("var(--oak-font-ui)");
  expect(getComputedStyle(view.container.querySelector(".oak-sheet-handle")!).minHeight).toBe("44px"); expect(getComputedStyle(view.container.querySelector(".oak-sheet-grip")!).width).toBe("36px"); expect(getComputedStyle(view.container.querySelector(".oak-sheet-heading")!).minHeight).toBe("52px");
  expect(getComputedStyle(view.container.querySelector(".oak-day-rail-motion")!).transitionDuration).toBe("0ms");
  const rules = [...style.sheet!.cssRules];
  const mobile = rules.find(rule => rule instanceof CSSStyleRule && rule.selectorText === ".oak-experience") as CSSStyleRule;
  expect(mobile.style.getPropertyValue("--oak-collapsed-height")).toBe("calc(104px + var(--oak-safe-area-bottom))"); expect(mobile.style.getPropertyValue("--oak-half-height").replaceAll(" ", "")).toBe("clamp(300px,46dvh,430px)");
  const desktop = rules.find(rule => rule instanceof CSSMediaRule && rule.conditionText === "(min-width: 45rem)") as CSSMediaRule; expect(desktop.cssText).toContain("32.5rem"); expect(desktop.cssText).toContain("42rem");
  const short = rules.find(rule => rule instanceof CSSMediaRule && rule.conditionText === "(max-height: 43.749rem)") as CSSMediaRule; expect(short.cssText.replaceAll(" ", "")).toContain("max(min(17rem,var(--oak-sheet-ceiling,100dvh)),43dvh)");
  style.remove();
});
test("short viewport reserves a scrollable chrome budget instead of sending an impossible expanded ceiling", () => {
  vi.useFakeTimers(); const c = shellControls(); let height = 568;
  const style = document.createElement("style"); style.textContent = readFileSync(`${process.cwd()}/plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles/layout.css`, "utf8"); document.head.append(style);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("oak-experience")) return new DOMRect(0, 0, 320, height);
    if (this.classList.contains("oak-upper-clearance")) return new DOMRect(12, 12, 296, 320);
    if (this.classList.contains("oak-map-status")) return new DOMRect(12, 344, 296, 120);
    if (this.classList.contains("oak-geometry-collapsed")) return new DOMRect(0, 0, 1, 138);
    if (this.classList.contains("oak-geometry-half")) return new DOMRect(0, 0, 1, 272);
    if (this.classList.contains("oak-geometry-legal")) return new DOMRect(0, 0, 1, 78);
    return new DOMRect();
  });
  const view = render(<StrictMode><OakWashiExperience {...c} model={experience({ map: { presentation: { markers: [], routes: [] }, provider: { status: "unavailable", retryable: true, reason: "network" }, cameraIntent: null, layout: null } })} /></StrictMode>);
  const root = view.container.querySelector<HTMLElement>(".oak-experience")!;
  expect(Number.parseFloat(root.style.getPropertyValue("--oak-chrome-budget"))).toBeGreaterThan(0);
  // Before resized chrome boxes are observed, no impossible geometry reaches core,
  // which deliberately keeps expanded >= collapsed.
  expect(c.measured.mock.calls.every(call => (call[0] as { expandedHeight: number }).expandedHeight >= 138)).toBe(true);
  const upper = root.querySelector<HTMLElement>(".oak-upper-clearance")!; const status = root.querySelector<HTMLElement>(".oak-map-status")!;
  expect(root.dataset.chromeScroll).toBe("true"); expect(upper.tabIndex).toBe(0); expect(status.tabIndex).toBe(0); expect(getComputedStyle(upper).overflowY).toBe("auto"); expect(getComputedStyle(status).overflowY).toBe("auto");
  expect(Number.parseFloat(root.style.getPropertyValue("--oak-upper-budget"))).toBeGreaterThanOrEqual(44);
  expect(Number.parseFloat(root.style.getPropertyValue("--oak-status-budget"))).toBeGreaterThanOrEqual(44);
  expect(c.surfaces.get("oak-upper-scrollport")).toBe(upper); expect(c.surfaces.has("oak-header")).toBe(false); expect(c.surfaces.has("oak-controls")).toBe(false); expect(c.surfaces.get("oak-provider-status")).toBe(status);
  expect(status.textContent).toContain(catalog.provider.network);
  height = 900; act(() => { window.dispatchEvent(new Event("resize")); vi.advanceTimersByTime(20); });
  expect(root.dataset.chromeScroll).toBe("false"); expect(root.style.getPropertyValue("--oak-upper-budget")).toBe(""); expect(upper.hasAttribute("tabindex")).toBe(false); expect(status.hasAttribute("tabindex")).toBe(false); expect(c.measured).toHaveBeenCalledTimes(1);
  expect(c.surfaces.has("oak-upper-scrollport")).toBe(false); expect(c.surfaces.get("oak-header")).toBe(root.querySelector(".oak-header-content")); expect(c.surfaces.get("oak-controls")).toBe(root.querySelector(".oak-controls-row"));
  act(() => { window.dispatchEvent(new Event("resize")); vi.advanceTimersByTime(20); }); expect(c.measured).toHaveBeenCalledTimes(1);
  style.remove(); vi.useRealTimers();
});
test("inner chrome growth and committed notice changes trigger measurement without a viewport resize and release observers", () => {
  vi.useFakeTimers(); const c = shellControls(); let naturalHeight = 140;
  const observed = new Set<Element>(); let resize: () => void = () => {};
  class Observer { constructor(callback: () => void) { resize = callback; } observe(element: Element) { observed.add(element); } unobserve(element: Element) { observed.delete(element); } disconnect() { observed.clear(); } }
  vi.stubGlobal("ResizeObserver", Observer);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("oak-experience")) return new DOMRect(0, 0, 390, 844);
    if (this.classList.contains("oak-upper-clearance")) return new DOMRect(0, 0, 366, this.parentElement?.dataset.chromeScroll === "true" ? 696 : naturalHeight);
    if (this.classList.contains("oak-header-content")) return new DOMRect(0, 0, 366, naturalHeight);
    if (this.classList.contains("oak-geometry-collapsed")) return new DOMRect(0, 0, 1, 104);
    if (this.classList.contains("oak-geometry-half")) return new DOMRect(0, 0, 1, 388);
    if (this.classList.contains("oak-geometry-legal")) return new DOMRect(0, 0, 1, 44);
    return new DOMRect();
  });
  const view = render(<OakWashiExperience {...c} model={experience()} />); const root = view.container.querySelector<HTMLElement>(".oak-experience")!;
  const upper = root.querySelector<HTMLElement>(".oak-upper-clearance")!; Object.defineProperty(upper, "scrollHeight", { configurable: true, get: () => naturalHeight });
  expect(observed.has(root.querySelector(".oak-header-content")!)).toBe(true);
  expect(c.measured.mock.calls.at(-1)).toEqual([{ collapsedHeight: 104, halfHeight: 388, expandedHeight: 536 }]);
  naturalHeight = 800; act(() => { resize(); vi.advanceTimersByTime(20); });
  expect(root.dataset.chromeScroll).toBe("true"); expect(c.measured.mock.calls.at(-1)).toEqual([{ collapsedHeight: 104, halfHeight: 388, expandedHeight: 104 }]);
  act(() => { resize(); vi.advanceTimersByTime(20); }); expect(c.measured).toHaveBeenCalledTimes(2);
  // Committed content can change while the upper scrollport remains bounded;
  // the commit measurement must run even without a new observer callback.
  naturalHeight = 900;
  const measureRead = vi.spyOn(upper, "getBoundingClientRect");
  view.rerender(<OakWashiExperience {...c} model={experience({ persistence: { status: "memory-only", writable: false }, location: { status: "denied", hasFix: false } })} />);
  act(() => { vi.advanceTimersByTime(20); });
  expect(measureRead).toHaveBeenCalled();
  expect(root.dataset.chromeScroll).toBe("true");
  expect(root.querySelector(".oak-global-notices")?.querySelectorAll('[role="status"]')).toHaveLength(2);
  expect(c.surfaces.get("oak-upper-scrollport")).toBe(upper);
  expect(c.surfaces.has("oak-header")).toBe(false);
  expect(c.measured).toHaveBeenCalledTimes(2);
  view.unmount(); expect(observed.size).toBe(0);
});
