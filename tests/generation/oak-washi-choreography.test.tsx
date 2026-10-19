// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createMemoryTripNavigationStore } from "@laugh-tale-island/core";
import { createLocalStorageProgressStore, type MapAdapterV2 } from "@laugh-tale-island/core/browser";
import { useTripExperience } from "@laugh-tale-island/react";
import { OakWashiExperience, oakWashiMapBindings } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.js";
import { catalog } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js";
import { semanticMapTrip } from "../fixtures/oak-washi/map-content-cases.js";
import { FloatingDayHeader } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/experience/FloatingDayHeader.js";
import { controls } from "../fixtures/oak-washi/row-cases.js";
import { readFileSync } from "node:fs";
import type { OakWashiCopy } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/schema.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.doUnmock("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js"); });
test.each(["en", "zh-Hant"])("header gives the selected day visible priority and retains full authored identity in %s", async locale => {
  const copy = JSON.parse(readFileSync(`${process.cwd()}/plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/${locale}.json`, "utf8")) as OakWashiCopy;
  vi.resetModules();
  vi.doMock("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js", () => ({ catalog: copy, locale }));
  const { FloatingDayHeader: LocalizedHeader } = await import("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/experience/FloatingDayHeader.js");
  const c = controls();
  const model = { trip: { title: "A very long authored journey across the coast" }, day: { id: "day", title: "River day", date: "2040-06-12", ordinal: 1 }, days: [], clock: { instant: "2040-06-12T10:00:00Z", timezone: "Etc/UTC" }, capabilities: { selectDayIds: [] }, header: { expanded: false, revision: 1, transition: null }, motion: "reduced" as const };
  const view = render(<LocalizedHeader model={model} actions={c.actions} />);
  const heading = view.getByRole("heading", { level: 1 });
  expect(heading.textContent?.startsWith("River day")).toBe(true);
  expect(heading.getAttribute("title")).toBe(`${model.trip.title} · River day`);
  expect(view.getByRole("heading", { name: `${model.trip.title} · River day` })).toBe(heading);
  fireEvent.click(view.getByRole("button", { name: copy.experience.home })); expect(c.actions.openHome).toHaveBeenCalledOnce();
  fireEvent.click(view.getByRole("button", { name: copy.accessibleNames.expandDayRail })); expect(c.actions.setHeaderExpanded).toHaveBeenCalledWith(true);
});
test("reversing a header transition cancels old settlement and finishes the exact replacement ID", () => {
  vi.useFakeTimers(); const c = controls();
  const style = document.createElement("style"); style.textContent = ".oak-day-header { --oak-motion-expand: 220ms; --oak-motion-collapse: 160ms; }"; document.head.append(style);
  const model = { trip: { title: "Journey" }, day: { id: "day", title: "River day", date: "2040-06-12", ordinal: 1 }, days: [], clock: { instant: "2040-06-12T10:00:00Z", timezone: "Etc/UTC" }, capabilities: { selectDayIds: [] }, header: { expanded: true, revision: 1, transition: { id: 1, phase: "expanding" as const } }, motion: "full" as const };
  const view = render(<FloatingDayHeader model={model} actions={c.actions} />);
  act(() => { vi.advanceTimersByTime(100); });
  view.rerender(<FloatingDayHeader model={{ ...model, header: { expanded: false, revision: 2, transition: { id: 2, phase: "collapsing" } } }} actions={c.actions} />);
  act(() => { vi.advanceTimersByTime(80); });
  view.rerender(<FloatingDayHeader model={{ ...model, header: { expanded: false, revision: 2, transition: { id: 2, phase: "collapsing" } } }} actions={{ ...c.actions }} />);
  act(() => { vi.advanceTimersByTime(40); }); expect(c.actions.settleHeaderTransition).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(40); }); expect(c.actions.settleHeaderTransition.mock.calls).toEqual([[2]]);
  style.remove();
});
test("fresh same-ID model projections do not postpone the active header completion", () => {
  vi.useFakeTimers(); const c = controls();
  const style = document.createElement("style"); style.textContent = ".oak-day-header { --oak-motion-expand: 220ms; --oak-motion-collapse: 160ms; }"; document.head.append(style);
  const project = () => ({ trip: { title: "Journey" }, day: { id: "day", title: "River day", date: "2040-06-12", ordinal: 1 }, days: [], clock: { instant: "2040-06-12T10:00:00Z", timezone: "Etc/UTC" }, capabilities: { selectDayIds: [] }, header: { expanded: true, revision: 7, transition: { id: 7, phase: "expanding" as const } }, motion: "full" as const });
  const view = render(<FloatingDayHeader model={project()} actions={c.actions} />);
  for (let frame = 0; frame < 4; frame += 1) {
    act(() => { vi.advanceTimersByTime(50); });
    view.rerender(<FloatingDayHeader model={project()} actions={{ ...c.actions }} />);
  }
  act(() => { vi.advanceTimersByTime(19); }); expect(c.actions.settleHeaderTransition).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(1); }); expect(c.actions.settleHeaderTransition.mock.calls).toEqual([[7]]);
  view.rerender(<FloatingDayHeader model={project()} actions={{ ...c.actions }} />);
  act(() => { vi.advanceTimersByTime(220); }); expect(c.actions.settleHeaderTransition.mock.calls).toEqual([[7]]);
  style.remove();
});
test("reduced motion settles the exact semantic transition without an animation event", () => {
  const c = controls(); render(<FloatingDayHeader model={{ trip: { title: "Journey" }, day: { id: "day", title: "River day", date: "2040-06-12", ordinal: 1 }, days: [], clock: { instant: "2040-06-12T10:00:00Z", timezone: "Etc/UTC" }, capabilities: { selectDayIds: [] }, header: { expanded: true, revision: 8, transition: { id: 8, phase: "expanding" } }, motion: "reduced" }} actions={c.actions} />);
  expect(c.actions.settleHeaderTransition.mock.calls).toEqual([[8]]);
});
test("real committed action facade settles reduced-motion collapse and expansion", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)", media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true }));
  const navigationStore = createMemoryTripNavigationStore({ surface: "experience", dayId: "one", ownerId: "before" });
  const progressStore = createLocalStorageProgressStore("header-settlement", { storage: { getItem: () => null, setItem() {} }, events: undefined });
  let controller: ReturnType<typeof useTripExperience> | undefined;
  function Live() { controller = useTripExperience({ trip: semanticMapTrip, presentation: oakWashiMapBindings, navigationStore, progressStore, clock: () => "2040-06-12T10:00:00Z" }); return <OakWashiExperience {...controller} />; }
  const view = render(<Live />);
  await waitFor(() => expect(controller?.model.motion).toBe("reduced"));
  for (const [name, expanded, revision] of [[catalog.accessibleNames.collapseDayRail, false, 1], [catalog.accessibleNames.expandDayRail, true, 2]] as const) {
    fireEvent.click(view.getByRole("button", { name }));
    await waitFor(() => expect(controller?.model.header).toMatchObject({ expanded, revision, transition: null }));
    expect(view.getByRole("banner").getAttribute("data-transition-phase")).toBe("settled");
  }
  vi.unstubAllGlobals();
});
test("a later transition can reuse an ID after the previous semantic transition cleared", () => {
  const c = controls(); const model = { trip: { title: "Journey" }, day: { id: "day", title: "River day", date: "2040-06-12", ordinal: 1 }, days: [], clock: { instant: "2040-06-12T10:00:00Z", timezone: "Etc/UTC" }, capabilities: { selectDayIds: [] }, header: { expanded: true, revision: 1, transition: { id: 1, phase: "expanding" as const } }, motion: "reduced" as const };
  const view = render(<FloatingDayHeader model={model} actions={c.actions} />);
  view.rerender(<FloatingDayHeader model={{ ...model, header: { ...model.header, transition: null } }} actions={c.actions} />);
  view.rerender(<FloatingDayHeader model={model} actions={c.actions} />);
  expect(c.actions.settleHeaderTransition.mock.calls).toEqual([[1], [1]]);
});
test("public runtime drags from the rendered sheet during snap, owns settlement and survives provider remount", async () => {
  const storage = new Map<string, string>();
  const adapter: MapAdapterV2 = { mount: vi.fn(() => Promise.resolve()), render: vi.fn(), applyCameraIntent: vi.fn(), getCameraSnapshot: () => null, setUserLocation: vi.fn(), destroy: vi.fn() };
  const createMap = () => adapter;
  const input: Parameters<typeof useTripExperience>[0] = { trip: semanticMapTrip, presentation: oakWashiMapBindings, navigationStore: createMemoryTripNavigationStore({ surface: "experience", dayId: "one", ownerId: "before" }), progressStore: createLocalStorageProgressStore("shell", { storage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); } }, events: undefined }), clock: () => "2040-06-12T10:00:00Z", runtime: { createMap } };
  let controller: ReturnType<typeof useTripExperience> | undefined;
  function Live({ factory = createMap }: { factory?: () => MapAdapterV2 }) { controller = useTripExperience({ ...input, runtime: { createMap: factory } }); return <OakWashiExperience {...controller} />; }
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const height = this.classList.contains("oak-experience") || this.classList.contains("oak-map-content") ? 844 : this.classList.contains("oak-upper-clearance") ? 140 : this.classList.contains("oak-geometry-collapsed") ? 104 : this.classList.contains("oak-geometry-half") ? 388 : this.classList.contains("oak-geometry-legal") ? 44 : this.classList.contains("oak-itinerary-sheet") ? 250 : 0;
    return new DOMRect(0, 0, 390, height);
  });
  const view = render(<Live />); await act(async () => {}); await waitFor(() => expect(controller?.model.sheet.geometry?.half).toBe(388));
  const sheet = view.getByRole("region", { name: catalog.accessibleNames.itinerarySheet });
  const separator = view.getByRole("separator", { name: catalog.accessibleNames.itinerarySheet });
  expect(separator.getAttribute("aria-orientation")).toBe("horizontal");
  expect(separator.getAttribute("aria-controls")).toBe(sheet.id);
  expect(separator.querySelector("button")).toBeNull();
  act(() => controller!.actions.setSheetSnap("expanded")); expect(sheet.style.height).toBe("536px");
  fireEvent.pointerDown(view.getByRole("button", { name: catalog.accessibleNames.collapseSheet })); expect(sheet.getAttribute("data-dragging")).toBe("false");
  const band = sheet.querySelector(".oak-sheet-handle")!;
  const pointer = (type: string, y: number) => { const event = new MouseEvent(type, { bubbles: true, clientY: y }); Object.defineProperty(event, "pointerId", { value: 1 }); fireEvent(band, event); };
  pointer("pointerdown", 600); expect(sheet.getAttribute("data-dragging")).toBe("true"); expect(sheet.style.height).toBe("250px"); expect(sheet.style.transitionDuration).toBe("0ms");
  pointer("pointermove", 570); await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); }); expect(sheet.style.height).toBe("280px");
  pointer("pointerup", 570); expect(sheet.getAttribute("data-dragging")).toBe("false"); expect(controller?.model.sheet.snap).toBe("half"); expect(sheet.style.height).toBe("388px");
  const mapHost = view.getByRole("region", { name: catalog.accessibleNames.map });
  const replacement: MapAdapterV2 = { ...adapter, mount: vi.fn(() => Promise.resolve()), destroy: vi.fn() };
  view.rerender(<Live factory={() => replacement} />); await act(async () => {});
  expect(view.getByRole("region", { name: catalog.accessibleNames.map })).toBe(mapHost); expect(view.getByRole("region", { name: catalog.accessibleNames.itinerarySheet })).toBe(sheet); expect(controller?.model.sheet.snap).toBe("half");
  expect(sheet.compareDocumentPosition(mapHost) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
});
