// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { createMemoryTripNavigationStore, type Trip } from "@laugh-tale-island/core";
import { createLocalStorageProgressStore, type MapAdapterV2, type MapMountConfig } from "@laugh-tale-island/core/browser";
import { useTripExperience } from "@laugh-tale-island/react";
import { oakWashiMapBindings } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.js";
import { semanticMapTrip } from "../fixtures/oak-washi/map-content-cases.js";
import { ItineraryTimeline } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/timeline/ItineraryTimeline.js";
import { catalog } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js";
import { ShoppingProgress } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/details/ShoppingProgress.js";
import { capabilities, factCases, model, node, place, roleCases, route, routeCases } from "../fixtures/oak-washi/row-cases.js";
import { controls } from "../fixtures/oak-washi/row-cases.js";

afterEach(() => { cleanup(); vi.doUnmock("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js"); });
test.each(["en-GB", "zh-Hant-TW"])("absolute date names follow the materialized %s locale and keep unknown-time facts", async locale => {
  vi.resetModules();
  vi.doMock("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js", () => ({ catalog, locale }));
  const { NodeSelection } = await import("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/timeline/PrimaryRow.js");
  const entry = node({ timing: { certainty: "unknown", date: "2042-04-18" } });
  const view = render(<NodeSelection {...controls()} node={entry} model={model({ timeline: [entry] })} />);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }).format(new Date("2042-04-18T00:00:00Z"));
  expect(view.getByRole("button", { name: new RegExp(date) })).toBe(view.getByRole("button", { name: new RegExp(catalog.timing.unknown) }));
  expect(view.getByRole("button").textContent).not.toContain("00:00");
});
test("owner names retain semantic context and localized absolute dates including authored overnight end", () => {
  const view = render(<ItineraryTimeline {...controls()} model={model({ timeline: [node({ timing: { start: "23:30", end: "00:15", certainty: "suggested", date: "2042-04-18", endDate: "2042-04-19" } })] })} />);
  const owner = view.container.querySelector(".oak-row-selection")!;
  for (const name of [/2042年4月18日 星期五/, /2042年4月19日 星期六/, /City Museum/, new RegExp(catalog.types.sightseeing), /00:15/]) expect(view.getByRole("button", { name })).toBe(owner);
});
test("shopping facts keep a distinct title, optional priority, native status control and read-only status", () => {
  const shopping = factCases.find(row => row.name === "shopping")!.facts;
  if (shopping.kind !== "shopping") throw new Error("shopping fixture");
  const items = shopping.items.map((item, index) => index === 0 ? { ...item, title: "合成長名稱：沿岸工藝展示空間與閱讀室的購物清單項目" } : item);
  const control = controls();
  const style = document.createElement("style");
  style.textContent = ["tokens", "components"].map(name => readFileSync(`${process.cwd()}/plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles/${name}.css`, "utf8")).join("\n");
  document.head.append(style);
  try {
    const view = render(<ShoppingProgress items={items} editableIds={items.map(item => item.id)} actions={control.actions} />);
    const rows = [...view.container.querySelectorAll<HTMLElement>("[data-shopping-id]")];
    expect(rows.map(row => row.dataset.status)).toEqual(["pending", "purchased", "unavailable", "skipped"]);
    for (const [index, row] of rows.entries()) {
      const copy = row.querySelector<HTMLElement>(".oak-shopping-copy")!;
      expect(copy).not.toBeNull();
      const title = copy.querySelector<HTMLElement>(".oak-shopping-title")!;
      const priority = copy.querySelector<HTMLElement>(".oak-shopping-priority");
      const select = within(row).getByRole("combobox", { name: `${items[index].title} · ${catalog.facts.status}` });
      expect(title.textContent).toBe(items[index].title);
      expect(priority?.textContent ?? null).toBe(items[index].priority ? `${catalog.facts.priority}: ${catalog.facts[items[index].priority]}` : null);
      expect([...select.querySelectorAll("option")].map(option => [option.value, option.textContent])).toEqual([
        ["pending", catalog.progress.pending], ["purchased", catalog.progress.purchased], ["unavailable", catalog.progress.unavailable], ["skipped", catalog.progress.skipped],
      ]);
      expect(getComputedStyle(row).flexDirection).toBe("column");
      expect(getComputedStyle(copy).display).toBe("grid");
      expect(getComputedStyle(title).fontWeight).toBe("720");
      expect(getComputedStyle(select).minHeight).toBe("44px");
      expect(select.closest(".oak-native-select")).not.toBeNull();
      expect(getComputedStyle(select).appearance).toBe("none");
    }
    expect(getComputedStyle(rows[0].querySelector(".oak-shopping-title")!).overflowWrap).toBe("anywhere");
    fireEvent.change(rows[0].querySelector("select")!, { target: { value: "purchased" } });
    expect(control.actions.updateProgress).toHaveBeenCalledWith({ kind: "shopping-status", itemId: "tea", status: "purchased" });
    view.rerender(<ShoppingProgress items={items} editableIds={[]} actions={control.actions} />);
    expect(view.container.querySelectorAll("select")).toHaveLength(0);
    expect([...view.container.querySelectorAll(".oak-shopping-readonly")].map(item => item.textContent)).toEqual(items.map(item => catalog.progress[item.status]));
  } finally { style.remove(); }
});
test("primary scan order, independent status and unresolved stable ordinal", () => {
  const control = controls(); const states = ["current", "next", "viewing", "completed", "skipped", "candidate", "unresolved", "selected"] as const;
  const view = render(<ItineraryTimeline {...control} model={model({ timeline: [node({ states, ordinal: "7B", timing: { certainty: "unknown" } })], places: [place({ navigationAvailable: true, place: { label: "Unverified stop", certainty: "unverified", resolution: { status: "unresolved", reason: "not-reviewed" } } })] })} />);
  const row = view.container.querySelector('[data-owner-id="museum"]')!;
  expect([...row.querySelectorAll("[data-scan]")].map(slot => slot.getAttribute("data-scan"))).toEqual(["time", "title", "context", "location", "status"]);
  expect(view.getAllByText("City Museum")).toHaveLength(1); expect(row.querySelector(".oak-row-ordinal")?.textContent).toBe("7B");
  const status = row.querySelector('[data-scan="status"]')!; expect(status.getAttribute("role")).toBe("status");
  for (const state of states) expect(row.getAttribute(`data-${state}`)).toBe("true");
  expect(status.textContent).toBe(catalog.status.skipped);
  expect(row.textContent).not.toContain(catalog.status.selected);
  expect(row.textContent).not.toContain(catalog.status.viewing);
  expect(row.textContent).not.toContain(catalog.status.unresolved);
  expect(row.textContent?.match(/未驗證/g)).toHaveLength(1);
  expect(row.getAttribute("aria-current")).toBe("step"); expect(row.textContent).toContain(catalog.timing.unknown); expect(row.textContent).toContain(catalog.facts.unverifiedLocation);
  expect(view.queryByRole("button", { name: catalog.navigation.open })).toBeNull();
  const owner = control.nodeElements.get("museum")!; expect(owner.tagName).toBe("BUTTON"); owner.focus(); expect(document.activeElement).toBe(owner); fireEvent.click(owner); expect(control.actions.selectNode).toHaveBeenCalledWith("museum-node");
  expect(owner.getAttribute("aria-pressed")).toBe("true");
});
test("selected unresolved owner states the map consequence once without losing distinct booking or provider failure", () => {
  const selected = node({ states: ["selected", "unresolved"], details: ["City Museum", "Museum ticket", catalog.facts.unverifiedLocation, "Arrive by 09:30", "City Museum annex note"] });
  const unresolved = place({ place: { label: "Unverified stop", certainty: "unverified", resolution: { status: "unresolved", reason: "not-reviewed" } }, runtime: { status: "unavailable", reason: "network", retryable: true }, navigationAvailable: false });
  const view = render(<ItineraryTimeline {...controls()} model={model({ timeline: [selected], places: [unresolved], reservations: [{ id: "ticket", ownerId: "museum", title: "Museum ticket", booking: { status: "pending", reference: "RES-81" } }] })} />);
  const row = view.container.querySelector<HTMLElement>('[data-owner-id="museum"]')!;
  const details = row.querySelector<HTMLElement>(".oak-owner-details")!;
  expect([...details.querySelectorAll(".oak-authored-details li")].map(line => line.textContent)).toEqual(["Arrive by 09:30", "City Museum annex note"]);
  expect(row.textContent?.match(/地點尚未驗證/g)).toHaveLength(1);
  expect(row.querySelector(".oak-row-location")?.textContent).toContain("地圖");
  expect(row.querySelector(".oak-row-location")?.textContent).toContain("導航");
  expect(row.querySelector(".oak-row-action")).toBeNull();
  expect(details.textContent).toContain("RES-81");
  expect(details.textContent).toContain(catalog.booking.pending);
  expect(details.textContent).toContain(catalog.provider.network);
});
test("selected logistics task keeps its lead, verification, notes and completion in one readable hierarchy", () => {
  const entry = node({
    role: "task", title: "Airport check-in", states: ["selected"],
    timing: { start: "11:00", certainty: "suggested" },
    details: ["Complete check-in and security.", "Before departure"],
    facts: { kind: "logistics", checklist: [] },
    completion: { id: "whole", title: "Airport check-in", completed: false },
    capabilities: { select: true, skip: false, complete: true, place: true, booking: false, shopping: false },
  });
  const view = render(<ItineraryTimeline {...controls()} model={model({
    timeline: [entry], places: [place({ place: { label: "Airport check-in", certainty: "unverified", resolution: { status: "resolved" } } })],
  })} />);
  const row = view.container.querySelector<HTMLElement>(".oak-task-row")!;
  expect(row.querySelector(".oak-task-heading")).toBeNull();
  expect(row.querySelector(".oak-task-lead")?.textContent).toBe("11:00Airport check-in");
  expect(row.querySelector(".oak-task-meta")?.textContent).toContain(catalog.facts.unverifiedLocation);
  expect(row.querySelector(".oak-task-meta")?.textContent).toContain(catalog.progress.pending);
  expect(row.querySelector(".oak-row-context")).toBeNull();
  expect([...row.querySelectorAll(".oak-authored-details li")].map(item => item.textContent)).toEqual(["Complete check-in and security.", "Before departure"]);
  expect(row.querySelector(".oak-checklist")).toBeNull();
  expect(within(row).getByRole("button", { name: catalog.progress.markComplete })).not.toBeNull();
});
test("task place evidence retains a distinct terminal label and unresolved warning without a place", () => {
  const entry = node({ role: "task", title: "Airport check-in", states: ["selected"], facts: { kind: "logistics", checklist: [] } });
  const view = render(<ItineraryTimeline {...controls()} model={model({
    timeline: [entry], places: [place({ place: { label: "Terminal 2 counter", certainty: "unverified", resolution: { status: "resolved" } } })],
  })} />);
  const row = view.container.querySelector<HTMLElement>(".oak-task-row")!;
  expect(row.querySelector(".oak-row-location")?.textContent).toBe(`Terminal 2 counter · ${catalog.facts.unverifiedLocation}`);
  view.rerender(<ItineraryTimeline {...controls()} model={model({ timeline: [{ ...entry, states: ["selected", "unresolved"] }], places: [] })} />);
  expect(row.querySelector(".oak-row-location")?.textContent).toBe(catalog.facts.unverifiedLocationConsequence);
});
test("connectors stay ordered immediately before destinations and register route controls", () => {
  const control = controls(); const view = render(<ItineraryTimeline {...control} model={model({ timeline: [node({ ownerId: "origin", title: "Origin" }), { kind: "route", ownerId: "edge", routeId: "edge", role: "connector", states: [] }, node()], routes: [route()] })} />);
  expect([...view.container.querySelectorAll(".oak-timeline > [data-owner-id]")].map(row => row.getAttribute("data-owner-id"))).toEqual(["origin", "edge", "museum"]);
  const edge = control.routeElements.get("edge")!; expect(edge.tagName).toBe("BUTTON"); fireEvent.click(edge); expect(control.actions.selectRoute).toHaveBeenCalledWith("edge", "list");
});
test.each(routeCases)("connector %s keeps movement and authored summary visible with provenance in details", ({ route: edge }) => {
  const control = controls();
  const entry = { kind: "route" as const, ownerId: "edge", routeId: "edge", role: "connector" as const, states: ["selected" as const] };
  const view = render(<ItineraryTimeline {...control} model={model({ timeline: [entry], routes: [{ ...edge, selected: true }] })} />);
  const row = view.container.querySelector('[data-owner-id="edge"]')!;
  const facts = row.querySelector(".oak-route-facts")!;
  const movement = facts.querySelector(".oak-route-movement")!;
  const summary = facts.querySelector(".oak-route-summary");
  expect([...facts.children]).toEqual(summary ? [movement, summary] : [movement]);
  expect(movement.firstElementChild?.textContent).toBe(catalog.routes[edge.mode]);
  expect(facts.textContent).not.toContain(`${catalog.routes[edge.source]} · ${catalog.certainty[edge.certainty]}`);
  expect(row.querySelector(".oak-route-evidence")?.textContent).toContain(`${catalog.routes[edge.source]} · ${catalog.certainty[edge.certainty]}`);
  const factsSource = edge.runtime.status === "ready" ? edge.runtime : edge.authored;
  expect(movement.textContent).toContain(factsSource.durationMinutes === undefined ? catalog.routes[edge.mode] : catalog.routes.duration.replace("{duration}", String(factsSource.durationMinutes)));
  if (factsSource.durationMinutes === undefined) expect(movement.querySelector(".oak-route-duration")).toBeNull();
  if (factsSource.distanceMeters === undefined) expect(movement.querySelector(".oak-route-distance")).toBeNull();
  if (edge.runtime.status !== "ready" && edge.authored.summary) expect(summary?.textContent).toContain(edge.authored.summary);
  if (edge.runtime.status !== "ready" && edge.authored.summary) expect(row.querySelector(".oak-route-evidence")?.textContent).toContain(catalog.routes.authoredFallback);
  expect(row.querySelector(".oak-row-status")).not.toBeNull();
  expect(row.querySelector(".oak-route-selection")?.getAttribute("aria-pressed")).toBe("true");
  expect(control.routeElements.get("edge")).toBe(row.querySelector(".oak-route-selection"));
});
test("incoming route facts in a primary keep the shared default order and layout", () => {
  const view = render(<ItineraryTimeline {...controls()} model={model({ timeline: [node({ incomingRouteIds: ["edge"] })], places: [], routes: [route({ mode: "transit" })] })} />);
  const facts = view.container.querySelector('[data-scan="location"] .oak-route-facts')!;
  expect([...facts.children].map(item => item.textContent)).toEqual([catalog.routes.transit, `${catalog.routes.provider} · ${catalog.certainty.confirmed}`, "12 分鐘", "距離 800 公尺"]);
  expect(facts.querySelector(".oak-route-movement, .oak-route-provenance")).toBeNull();
});
test("candidate preview and close use owned runtime actions and supplied suffixes", () => {
  const control = controls(); const decision = { groupId: "food", parentOwnerId: "museum", mode: "single" as const, open: true, sessionId: 4, options: [{ id: "option-b", title: "Harbour cafe", ordinal: "7B", selected: false, draft: true }], capabilities: { previewOptionIds: ["option-b"], cancel: true, confirm: true, reopen: true } };
  const data = model({ timeline: [node({ states: ["selected"], capabilities: { ...node().capabilities, candidateGroupId: "food" } })], candidates: [decision] });
  const view = render(<ItineraryTimeline {...control} model={data} />); const dialog = view.getByRole("dialog", { name: catalog.accessibleNames.candidateDialog });
  expect(control.dialogs.get("food")).toBe(dialog); expect(control.dialogs.get("option-b")).toBe(within(dialog).getByRole("button", { name: /Harbour cafe/ })); expect(dialog.textContent).toContain("7B"); expect(dialog.textContent).toContain(catalog.candidate.draft);
  fireEvent.click(within(dialog).getByRole("button", { name: /Harbour cafe/ })); expect(control.actions.previewCandidate).toHaveBeenCalledWith("food", "option-b");
  fireEvent.click(within(dialog).getByRole("button", { name: catalog.candidate.cancel })); expect(control.actions.cancelCandidate).toHaveBeenCalledWith("food");
  fireEvent.click(within(dialog).getByRole("button", { name: catalog.candidate.confirm })); expect(control.actions.confirmCandidate).toHaveBeenCalledWith("food"); expect(control.bindings.focus.restoreTrigger).not.toHaveBeenCalled();
  view.rerender(<ItineraryTimeline {...control} model={{ ...data, candidates: [{ ...decision, open: false }] }} />);
  expect(view.queryByRole("dialog")).toBeNull(); const trigger = view.getByRole("button", { name: catalog.candidate.reopen }); expect(control.triggers.get("food")).toBe(trigger); fireEvent.click(trigger); expect(control.actions.reopenCandidate).toHaveBeenCalledWith("food");
  view.rerender(<ItineraryTimeline {...control} model={{ ...data, candidates: [{ ...decision, capabilities: { previewOptionIds: [], cancel: false, confirm: false, reopen: false } }] }} />); expect(within(view.getByRole("dialog")).queryAllByRole("button")).toHaveLength(0);
});
test("candidate comparison groups every supplied fact under its title while keeping selected and draft distinct", () => {
  const decision = { groupId: "food", parentOwnerId: "museum", mode: "single" as const, open: true, sessionId: 5,
    options: [{ id: "option-b", title: "Harbour cafe", ordinal: "7B", selected: true, draft: true,
      place: { label: "Harbour annex", certainty: "unverified" as const, resolution: { status: "unresolved" as const, reason: "not-reviewed" as const } },
      booking: { status: "pending" as const, reference: "REF-7B" } }],
    capabilities: { previewOptionIds: ["option-b"], cancel: true, confirm: true, reopen: true } };
  const control = controls();
  const data = model({ timeline: [node({ states: ["selected"], capabilities: { ...node().capabilities, candidateGroupId: "food" } })], candidates: [decision] });
  const view = render(<ItineraryTimeline {...control} model={data} />);
  const dialog = view.getByRole("dialog", { name: catalog.accessibleNames.candidateDialog });
  const option = within(dialog).getByRole("button", { name: /Harbour cafe/ });
  expect(option.closest("[data-candidate-id]")?.getAttribute("data-selected")).toBe("true");
  expect(option.closest("[data-candidate-id]")?.getAttribute("data-draft")).toBe("true");
  const copy = option.querySelector(".oak-candidate-copy");
  expect(option.firstElementChild?.textContent).toBe("7B");
  expect(copy).not.toBeNull();
  if (!copy) throw new Error("Missing candidate copy");
  expect([...copy.children].map(child => child.textContent)).toEqual([
    "Harbour cafe",
    `Harbour annex · ${catalog.certainty.unverified} · ${catalog.facts.unverifiedLocation}`,
    `${catalog.booking.pending} · ${catalog.booking.reference}: REF-7B`,
    `${catalog.candidate.selected}${catalog.candidate.draft}`,
  ]);
  expect([...copy.lastElementChild!.children].map(child => child.textContent)).toEqual([catalog.candidate.selected, catalog.candidate.draft]);
  expect(option.getAttribute("aria-pressed")).toBe("true");
  view.rerender(<ItineraryTimeline {...control} model={{ ...data, candidates: [{ ...decision, capabilities: { previewOptionIds: [], cancel: false, confirm: false, reopen: false } }] }} />);
  const inert = view.getByRole("dialog").querySelector(".oak-candidate-option")!;
  expect(inert.tagName).toBe("DIV"); expect(inert.textContent).toContain("REF-7B");
  expect(inert.getAttribute("tabindex")).toBe("-1"); expect(control.dialogs.get("option-b")).toBe(inert);
  expect(within(view.getByRole("dialog")).queryAllByRole("button")).toHaveLength(0);
});
test("real public runtime opens, previews, cancels, confirms and restores the remounted disclosure focus", async () => {
  const trip: Trip = { ...semanticMapTrip, days: [{ ...semanticMapTrip.days[0], nodes: [{ ...semanticMapTrip.days[0].nodes[0], kind: "dining", payload: { cuisine: "Local", candidateGroupId: "food" } }] }], candidateGroups: [{ id: "food", parentNodeId: "before", mode: "single", options: [{ id: "cafe-a", title: "Garden cafe" }, { id: "cafe-b", title: "Harbour cafe" }] }] };
  const storage = new Map<string, string>();
  let mapConfig: MapMountConfig | undefined;
  const adapter: MapAdapterV2 = { mount: (_element, config) => { mapConfig = config; return Promise.resolve(); }, render: () => {}, applyCameraIntent: () => {}, getCameraSnapshot: () => null, setUserLocation: () => {}, destroy: () => {} };
  const input: Parameters<typeof useTripExperience>[0] = { trip, presentation: oakWashiMapBindings, navigationStore: createMemoryTripNavigationStore({ surface: "experience", dayId: "one", ownerId: "before" }), progressStore: createLocalStorageProgressStore("row-case", { storage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); } }, events: undefined }), clock: () => "2040-06-12T10:00:00Z" };
  input.runtime = { createMap: () => adapter };
  function RuntimeTimeline() { const controller = useTripExperience(input); return <><div ref={controller.bindings.layout.mapViewportRef} /><ItineraryTimeline {...controller} /></>; }
  const view = render(<RuntimeTimeline />);
  await act(async () => {});
  await waitFor(() => expect(mapConfig).toBeDefined());
  const owner = view.getByRole("button", { name: /Before/ }); fireEvent.click(owner);
  fireEvent.click(view.getByRole("button", { name: catalog.candidate.reopen }));
  expect(document.activeElement).toBe(view.getByRole("dialog"));
  fireEvent.click(view.getByRole("button", { name: /預覽.*Harbour cafe/ }));
  act(() => mapConfig!.events.onMarkerSelect("cafe-a"));
  expect(document.activeElement).toBe(view.getByRole("button", { name: /Garden cafe/ }));
  act(() => mapConfig!.events.onMarkerSelect("cafe-b"));
  expect(document.activeElement).toBe(view.getByRole("button", { name: /Harbour cafe/ }));
  expect(within(view.getByRole("dialog")).getByRole("button", { name: /Harbour cafe/ }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(view.getByRole("button", { name: catalog.candidate.cancel })); expect(view.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(view.getByRole("button", { name: catalog.candidate.reopen }));
  fireEvent.click(view.getByRole("button", { name: catalog.candidate.reopen })); fireEvent.click(view.getByRole("button", { name: /Harbour cafe/ }));
  fireEvent.click(view.getByRole("button", { name: catalog.candidate.confirm })); expect(view.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(view.getByRole("button", { name: catalog.candidate.reopen }));
  fireEvent.click(view.getByRole("button", { name: catalog.candidate.reopen })); expect(view.getByRole("dialog").textContent).toContain(catalog.candidate.selected);
});
test("owned completion, skip/restore, shopping and place retry execute only supplied capabilities", () => {
  const control = controls(); const item = node({ states: ["selected"], completion: { id: "whole", title: "Whole task", completed: false }, capabilities: { ...node().capabilities, complete: true } });
  const data = model({ timeline: [item], places: [place({ runtime: { status: "unavailable", reason: "network", retryable: true } })] });
  const view = render(<ItineraryTimeline {...control} model={data} />);
  fireEvent.click(view.getByRole("button", { name: catalog.progress.markComplete })); expect(control.actions.updateProgress).toHaveBeenCalledWith({ kind: "completion", id: "whole", completed: true });
  fireEvent.click(view.getByRole("button", { name: catalog.progress.skip })); expect(control.actions.updateProgress).toHaveBeenCalledWith({ kind: "node-skipped", nodeId: "museum-node", skipped: true });
  fireEvent.click(view.getByRole("button", { name: catalog.provider.retry })); expect(control.actions.retryProvider).toHaveBeenCalledWith("place", "museum");
  view.rerender(<ItineraryTimeline {...control} model={{ ...data, timeline: [{ ...item, states: ["selected", "skipped"], completion: { ...item.completion!, completed: true } }] }} />);
  fireEvent.click(view.getByRole("button", { name: catalog.progress.markIncomplete })); expect(control.actions.updateProgress).toHaveBeenCalledWith({ kind: "completion", id: "whole", completed: false });
  fireEvent.click(view.getByRole("button", { name: catalog.progress.restore })); expect(control.actions.updateProgress).toHaveBeenCalledWith({ kind: "node-skipped", nodeId: "museum-node", skipped: false });
});
test.each(["pretrip", "day"] as const)("an unrelated %s task ID collision cannot inject facts or controls into a node owner", scope => {
  const control = controls();
  const selected = node({
    role: "task", markerMode: "none", states: ["selected"],
    facts: { kind: "logistics", checklist: [{ id: "own-check", title: "Keep this node's ticket", completed: false }] },
    completion: { id: "own-completion", title: "Finish this node", completed: false },
    capabilities: { ...node().capabilities, complete: true },
  });
  const view = render(<ItineraryTimeline {...control} model={model({
    timeline: [selected],
    tasks: [{ id: selected.nodeId, title: "Unrelated utility task", note: "Private preparation note", scope, ...(scope === "day" ? { dayId: "day" } : {}), completed: false, children: [{ id: "foreign-check", title: "Unrelated utility checklist", completed: false }] }],
    capabilities: { ...capabilities, progress: { ...capabilities.progress, completionIds: ["own-check", "own-completion", "foreign-check"] } },
  })} />);
  const details = view.container.querySelector('[data-details-owner="museum"]')!;
  expect(details.textContent).not.toContain("Unrelated utility task");
  expect(details.textContent).not.toContain("Private preparation note");
  expect(within(details as HTMLElement).queryByRole("checkbox", { name: "Unrelated utility checklist" })).toBeNull();
  const ownCheck = within(details as HTMLElement).getByRole("checkbox", { name: "Keep this node's ticket" });
  expect(within(details as HTMLElement).getAllByRole("checkbox")).toHaveLength(1);
  fireEvent.click(ownCheck);
  fireEvent.click(within(details as HTMLElement).getByRole("button", { name: catalog.progress.markComplete }));
  expect(control.actions.updateProgress.mock.calls).toEqual([
    [{ kind: "completion", id: "own-check", completed: true }],
    [{ kind: "completion", id: "own-completion", completed: true }],
  ]);
});
test("capability absence removes actions without dropping authored facts and booking", () => {
  const control = controls(); const selected = node({ states: ["selected"], booking: { status: "confirmed", reference: "RES-81", url: "https://example.com/booking", arrivalBufferMinutes: 15 }, capabilities: { select: false, skip: false, complete: false, place: true, booking: false, shopping: false } });
  const view = render(<ItineraryTimeline {...control} model={model({ timeline: [selected], capabilities: { ...capabilities, navigationOwnerIds: [], selectNodeIds: [], retryPlaceOwnerIds: [], progress: { ...capabilities.progress, completionIds: [], shoppingItemIds: [], skippableNodeIds: [] } }, places: [place({ runtime: { status: "unavailable", reason: "network", retryable: true } })] })} />);
  expect(view.queryAllByRole("button")).toHaveLength(0); expect(view.queryByRole("link")).toBeNull(); expect(view.container.textContent).toContain("RES-81"); expect(view.container.textContent).toContain("15");
});
test("route capability removal retains facts while removing navigation and retry", () => {
  const view = render(<ItineraryTimeline {...controls()} model={model({ timeline: [{ kind: "route", role: "connector", ownerId: "edge", routeId: "edge", states: ["selected"] }], routes: [route({ selected: true, runtime: { status: "unavailable", reason: "network", retryable: true }, authored: { summary: "Keep this ferry note" } })], capabilities: { ...capabilities, selectRouteIds: [], retryRouteIds: [], navigationOwnerIds: [] } })} />);
  expect(view.queryAllByRole("button")).toHaveLength(0); expect(view.container.textContent).toContain("Keep this ferry note"); expect(view.container.textContent).toContain(catalog.provider.network);
});
test("unselected unavailable routes keep authored movement without repeating provider setup errors in the scan", () => {
  const view = render(<ItineraryTimeline {...controls()} model={model({
    timeline: [{ kind: "route", role: "connector", ownerId: "edge", routeId: "edge", states: [] }],
    routes: [route({ selected: false, runtime: { status: "unavailable", reason: "missing-configuration", retryable: false }, authored: { summary: "沿途散步" } })],
  })} />);
  const row = view.container.querySelector('[data-owner-id="edge"]')!;
  expect(row.textContent).toContain("沿途散步");
  expect(row.textContent).not.toContain(catalog.provider.missingConfiguration);
  expect(row.querySelector(".oak-inline-state")).toBeNull();
});
test("booking links and reservation facts remain in their selected owner", () => {
  const selected = node({ states: ["selected"], capabilities: { ...node().capabilities, booking: true }, booking: { status: "pending", reference: "BOOK-1", url: "https://example.com/book", arrivalBufferMinutes: 0 } });
  const view = render(<ItineraryTimeline {...controls()} model={model({ timeline: [selected, node({ ownerId: "other", title: "Other stop" })], reservations: [{ id: "reservation", title: "Entry ticket", ownerId: "museum", booking: { status: "confirmed", reference: "TICKET-2", arrivalBufferMinutes: 20 } }] })} />);
  const details = view.container.querySelector('[data-details-owner="museum"]')!;
  expect(within(details as HTMLElement).getByRole("link", { name: catalog.booking.open }).getAttribute("href")).toBe("https://example.com/book");
  expect(details.textContent).toContain("BOOK-1"); expect(details.textContent).toContain("Entry ticket"); expect(details.textContent).toContain("TICKET-2"); expect(details.textContent).toContain("20"); expect(view.container.querySelector('[data-owner-id="other"]')?.textContent).not.toContain("TICKET-2");
  view.rerender(<ItineraryTimeline {...controls()} model={model({ timeline: [{ ...selected, booking: { status: "confirmed", url: "javascript:alert(1)" } }] })} />); expect(view.queryByRole("link")).toBeNull();
});
test("identical direct and named reservation bookings are shown once", () => {
  const booking = { status: "confirmed" as const, reference: "SAME", url: "https://example.com/booking" };
  const selected = node({ states: ["selected"], booking, capabilities: { ...node().capabilities, booking: true } });
  const view = render(<ItineraryTimeline {...controls()} model={model({ timeline: [selected], reservations: [{ id: "same", ownerId: "museum", title: "Museum ticket", booking }] })} />);
  const details = view.container.querySelector<HTMLElement>('[data-details-owner="museum"]')!;
  expect(details.querySelectorAll(".oak-booking-facts")).toHaveLength(1);
  expect(details.querySelector(".oak-reservation h4")?.textContent).toBe("Museum ticket");
  expect(details.querySelectorAll(".oak-booking-link")).toHaveLength(1);
});
test("owner booking groups supplied facts and keeps direct and attached actions distinct", () => {
  const control = controls();
  const selected = node({ states: ["selected"], facts: { kind: "experience", durationMinutes: 60 },
    booking: { status: "confirmed", reference: "LONG-REFERENCE-123", arrivalBufferMinutes: 0, url: "https://example.com/direct" },
    completion: { id: "whole", title: "Workshop", completed: false },
    capabilities: { ...node().capabilities, booking: true, complete: true },
  });
  const reservation = { id: "hold", ownerId: "museum", title: "Workshop hold", booking: { status: "pending" as const, reference: "HOLD-7", arrivalBufferMinutes: 10, url: "https://example.com/hold" } };
  const data = model({ timeline: [selected], reservations: [reservation] });
  const view = render(<ItineraryTimeline {...control} model={data} />);
  const details = view.container.querySelector<HTMLElement>('[data-details-owner="museum"]')!;
  const direct = details.querySelector<HTMLElement>(":scope > .oak-booking-facts")!;
  const attached = details.querySelector<HTMLElement>(".oak-reservation")!;
  expect(direct).not.toBeNull(); expect(attached).not.toBeNull();
  expect(direct.querySelector(".oak-booking-copy")?.children).toHaveLength(3);
  const reference = direct.querySelector(".oak-booking-reference")!;
  expect(reference.querySelector("dt")?.textContent).toBe(catalog.booking.reference);
  expect(reference.querySelector("dd")?.textContent).toBe("LONG-REFERENCE-123");
  expect(direct.textContent).toContain(catalog.facts.arrivalBuffer.replace("{minutes}", "0"));
  expect(attached.querySelector("h4")?.textContent).toBe("Workshop hold");
  expect(attached.querySelector(".oak-booking-reference dd")?.textContent).toBe("HOLD-7");
  expect(attached.textContent).toContain(catalog.facts.arrivalBuffer.replace("{minutes}", "10"));
  expect([...details.querySelectorAll(".oak-booking-link")].map(link => link.getAttribute("href"))).toEqual(["https://example.com/direct", "https://example.com/hold"]);
  for (const link of details.querySelectorAll(".oak-booking-link")) {
    expect(link.getAttribute("target")).toBe("_blank"); expect(link.getAttribute("rel")).toBe("noreferrer");
    expect(link.querySelector("svg[aria-hidden=true]")).not.toBeNull();
  }
  const complete = within(details).getByRole("button", { name: catalog.progress.markComplete });
  expect(complete.classList.contains("oak-completion-action")).toBe(true);
  expect(complete.querySelector("svg[aria-hidden=true]")).not.toBeNull();
  fireEvent.click(complete); expect(control.actions.updateProgress).toHaveBeenCalledWith({ kind: "completion", id: "whole", completed: true });
  view.rerender(<ItineraryTimeline {...control} model={{ ...data, timeline: [{ ...selected, completion: { ...selected.completion!, completed: true } }] }} />);
  const undo = within(view.container.querySelector<HTMLElement>('[data-details-owner="museum"]')!).getByRole("button", { name: catalog.progress.markIncomplete });
  expect(undo.querySelector("svg[aria-hidden=true]")).not.toBeNull();
  fireEvent.click(undo); expect(control.actions.updateProgress).toHaveBeenCalledWith({ kind: "completion", id: "whole", completed: false });
});
test("unsafe or non-actionable booking retains facts without external controls or an empty footer rule", () => {
  const selected = node({ states: ["selected"], booking: { status: "pending", reference: "KEEP-THIS", url: "javascript:alert(1)", arrivalBufferMinutes: 0 },
    capabilities: { ...node().capabilities, booking: true, skip: false }, });
  const data = model({ timeline: [selected], reservations: [{ id: "hold", ownerId: "museum", title: "Private hold", booking: { status: "confirmed", reference: "KEEP-THAT", url: "https://example.com/hold" } }] });
  const view = render(<ItineraryTimeline {...controls()} model={data} />);
  const details = view.container.querySelector<HTMLElement>('[data-details-owner="museum"]')!;
  expect(details.querySelectorAll(".oak-booking-link")).toHaveLength(1);
  expect(details.textContent).toContain("KEEP-THIS"); expect(details.textContent).toContain("KEEP-THAT");
  view.rerender(<ItineraryTimeline {...controls()} model={{ ...data, timeline: [{ ...selected, capabilities: { ...selected.capabilities, booking: false } }] }} />);
  const gated = view.container.querySelector<HTMLElement>('[data-details-owner="museum"]')!;
  expect(gated.querySelectorAll(".oak-booking-link")).toHaveLength(0);
  expect(gated.querySelector(":scope > .oak-detail-actions:empty")).not.toBeNull();
  expect(gated.textContent).toContain("KEEP-THIS"); expect(gated.textContent).toContain("KEEP-THAT");
});
test("place loading is owned and disappears on selection change", async () => {
  const control = controls(); const data = model({ timeline: [node({ states: ["selected"] }), node({ ownerId: "other", title: "Other stop" })], places: [place({ runtime: { status: "loading" } })] });
  const view = render(<ItineraryTimeline {...control} model={data} />);
  expect(view.container.querySelector('[data-details-owner="museum"] [data-provider-state="loading"]')).not.toBeNull(); expect(view.container.querySelector('[data-owner-id="other"] [data-provider-state]')).toBeNull();
  view.rerender(<ItineraryTimeline {...control} model={{ ...data, timeline: data.timeline.map(entry => entry.kind === "node" ? { ...entry, states: [] } : entry) }} />); await waitFor(() => expect(view.container.querySelector("[data-provider-state]")).toBeNull());
});
test("a primary without a place shows supplied incoming route facts in its scan slot", () => {
  const view = render(<ItineraryTimeline {...controls()} model={model({ timeline: [node({ incomingRouteIds: ["edge"] })], places: [], routes: [route({ mode: "transit" })] })} />);
  const location = view.container.querySelector('[data-scan="location"]')!;
  expect(location.textContent).toContain(catalog.routes.transit); expect(location.textContent).toContain("12");
});
test("identical place/title wording appears once without dropping location certainty or distinct labels", () => {
  const control = controls(); const data = model({ timeline: [node({ title: "Same museum" })], places: [place({ place: { label: "Same museum", certainty: "unverified", resolution: { status: "unresolved", reason: "not-reviewed" } } })] });
  const view = render(<ItineraryTimeline {...control} model={data} />);
  expect(view.container.textContent?.match(/Same museum/g)).toHaveLength(1);
  const slot = view.container.querySelector('[data-scan="location"]')!; expect(slot.textContent).toBe(catalog.facts.unverifiedLocationConsequence);
  view.rerender(<ItineraryTimeline {...control} model={{ ...data, places: [place({ place: { label: "East museum gate", certainty: "confirmed", resolution: { status: "resolved" } } })] }} />);
  expect(view.container.textContent?.match(/Same museum/g)).toHaveLength(1); expect(view.container.textContent).toContain("East museum gate");
});
test("journey navigation remains available when explicitly supplied", () => {
  const control = controls(); const view = render(<ItineraryTimeline {...control} model={model({ timeline: [node({ role: "journey", markerMode: "none", facts: { kind: "transfer", mode: "flight", terminal: "Terminal C" } })] })} />);
  fireEvent.click(view.getByRole("button", { name: catalog.navigation.open })); expect(control.actions.openNavigation).toHaveBeenCalledWith("museum");
  expect(view.container.querySelector(".oak-row-ordinal")).toBeNull();
});
test.each(["journey", "base", "task"] as const)("%s support summary keeps time, title and secondary timing in scan order", role => {
  const control = controls();
  const item = node({ role, markerMode: role === "base" ? "base" : "none", title: "沿岸工藝展示空間與閱讀室的長名稱", timing: { start: "09:30", end: "10:45", dayOffset: 1, certainty: "suggested" }, states: ["selected"], facts: role === "base" ? { kind: "lodging", role: "base", checklist: [] } : role === "task" ? { kind: "logistics", checklist: [] } : { kind: "transfer", mode: "rail", terminal: "Central terminal" } });
  const view = render(<ItineraryTimeline {...control} model={model({ timeline: [item] })} />);
  const row = view.container.querySelector(`.oak-${role}-row`)!;
  const summary = row.querySelector(".oak-support-summary")!;
  expect(summary).not.toBeNull();
  const selection = summary.querySelector(".oak-row-selection")!;
  expect([...selection.querySelectorAll("[data-scan]")].map(slot => slot.getAttribute("data-scan"))).toEqual(role === "task" ? ["time", "title", "timing", "location", "status"] : ["time", "title", "timing", "context", "location", "status"]);
  expect(selection.querySelector(".oak-row-time")?.textContent).toBe(`09:30${catalog.timing.nextDay} 1`);
  expect(selection.querySelector(".oak-support-timing")?.textContent).toBe(`${catalog.timing.end.replace("{time}", "10:45")}${catalog.timing.suggested}`);
  expect(selection.querySelector(".oak-row-title")?.textContent).toBe(item.title);
  expect(row.querySelectorAll(".oak-row-title")).toHaveLength(1);
  if (role === "task") {
    expect(row.getAttribute("data-role")).toBe("task");
    expect(row.querySelector(".oak-task-heading, .oak-row-context")).toBeNull();
  } else {
    expect(row.querySelector(`.oak-${role === "base" ? "base-anchor" : `${role}-heading`}`)?.textContent).toContain(catalog.roles[role]);
    expect(selection.querySelector(".oak-row-context")?.textContent).toContain(catalog.types[item.facts.kind]);
  }
  expect(selection.querySelector(".oak-row-status")?.textContent).toBe("");
  expect(selection.getAttribute("aria-pressed")).toBe("true");
  const details = row.querySelector(".oak-owner-details")!;
  expect(details.closest(".oak-row")).toBe(row);
  expect(summary.contains(details)).toBe(false);
  expect(control.nodeElements.get(item.ownerId)).toBe(selection);
  fireEvent.click(selection); expect(control.actions.selectNode).toHaveBeenCalledWith(item.nodeId);
  if (role === "task") expect(row.querySelector(".oak-semantic-mark, .oak-row-action")).toBeNull();
  else expect(row.querySelector(".oak-semantic-mark")).not.toBeNull();
});
test.each(["journey", "base", "task"] as const)("%s support facts remain when selection and navigation capabilities are absent", role => {
  const item = node({ role, markerMode: role === "base" ? "base" : "none", capabilities: { ...node().capabilities, select: false }, facts: role === "base" ? { kind: "lodging", role: "base", checklist: [] } : role === "task" ? { kind: "logistics", checklist: [] } : { kind: "transfer", mode: "rail", terminal: "Central terminal" } });
  const control = controls();
  const view = render(<ItineraryTimeline {...control} model={model({ timeline: [item], capabilities: { ...capabilities, selectNodeIds: [], navigationOwnerIds: [] } })} />);
  const row = view.container.querySelector(`.oak-${role}-row`)!;
  expect(row.querySelector(".oak-row-selection")?.tagName).toBe("DIV");
  expect(row.querySelector(".oak-row-action")).toBeNull();
  expect(row.querySelector(".oak-row-title")?.textContent).toBe(item.title);
  if (role === "task") expect(row.getAttribute("data-role")).toBe("task");
  else expect(row.querySelector(".oak-row-context")?.textContent).toContain(catalog.types[item.facts.kind]);
  expect(control.nodeElements.size).toBe(0);
});
test("unknown supporting time remains unknown without an invented end or certainty", () => {
  const view = render(<ItineraryTimeline {...controls()} model={model({ timeline: [node({ role: "journey", markerMode: "none", timing: { certainty: "unknown" } })] })} />);
  const row = view.container.querySelector(".oak-journey-row")!;
  expect(row.querySelector(".oak-row-time")?.textContent).toBe(catalog.timing.unknown);
  expect(row.querySelector(".oak-support-timing")).toBeNull();
});
test("logistics group passes each selected child's own facts to owned details", () => {
  const group = roleCases.find(row => row.name === "logistics-group")!.entry;
  if (group.kind !== "logistics-group") throw new Error("fixture");
  const view = render(<ItineraryTimeline {...controls()} model={model({ timeline: [{ ...group, children: group.children.map(child => ({ ...child, states: ["selected"] })) }] })} />);
  expect(view.container.querySelector('[data-details-owner="child-b"]')?.textContent).toContain("Keep passport ready"); expect(view.container.querySelector('[data-details-owner="child-a"]')?.textContent).toContain("Locker 51");
});
test("primary reference geometry consumes existing typography and leaves room for reflow", () => {
  const style = document.createElement("style"); style.textContent = ["tokens", "components", "layout", "states", "accessibility"].map(name => readFileSync(`${process.cwd()}/plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles/${name}.css`, "utf8")).join("\n"); document.head.append(style);
  const view = render(<ItineraryTimeline {...controls()} model={model()} />);
  expect(getComputedStyle(view.container.querySelector(".oak-primary-row")!).minHeight).toBe("76px"); expect(getComputedStyle(view.container.querySelector(".oak-semantic-mark")!).width).toBe("40px"); expect(getComputedStyle(view.container.querySelector(".oak-row-time")!).width).toBe("52px"); expect(getComputedStyle(view.container.querySelector(".oak-timeline")!).fontFamily).toBe("var(--oak-font-ui)"); style.remove();
});
