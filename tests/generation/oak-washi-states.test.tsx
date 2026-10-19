// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { createMemoryTripNavigationStore, type Trip } from "@laugh-tale-island/core";
import { TripController, useTripExperience, type HomeModel } from "@laugh-tale-island/react";
import type { OakWashiCopy } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/schema.js";
import { capabilities, controls, model, node, place, route } from "../fixtures/oak-washi/row-cases.js";
import { semanticMapTrip } from "../fixtures/oak-washi/map-content-cases.js";

const catalogModule = "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js";
const copyRoot = `${process.cwd()}/plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy`;
const en = JSON.parse(readFileSync(`${copyRoot}/en.json`, "utf8")) as OakWashiCopy;
const zhHant = JSON.parse(readFileSync(`${copyRoot}/zh-Hant.json`, "utf8")) as OakWashiCopy;

const localeCases = [
  { locale: "en", catalog: en, foreign: zhHant, retained: ["Trip overview remains available.", "Your itinerary remains available.", "External directions remain available."] },
  { locale: "zh-Hant-TW", catalog: zhHant, foreign: en, retained: ["仍可使用旅程總覽。", "仍可使用行程內容。", "仍可使用外部導航。"] },
] as const;
const progressStore = {
  read: () => ({ status: "ready", value: null } as const),
  write: () => true,
  subscribe: () => () => {},
};

async function loadStateModules(testCase: (typeof localeCases)[number]) {
  vi.resetModules();
  vi.spyOn(window.navigator, "language", "get").mockReturnValue(testCase.locale.startsWith("en") ? "zh-Hant-TW" : "en-US");
  vi.doMock(catalogModule, () => ({ catalog: testCase.catalog, locale: testCase.locale }));
  // Finish queued unmock/mock work before parallel imports consume the catalog.
  const materialized = await import("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js");
  expect(materialized.locale).toBe(testCase.locale);
  expect(materialized.catalog).toBe(testCase.catalog);
  const [entry, provider, location, persistence, owner, connector, timeline] = await Promise.all([
    import("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.js"),
    import("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/states/InlineProviderState.js"),
    import("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/states/LocationState.js"),
    import("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/states/PersistenceNotice.js"),
    import("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/details/OwnerDetails.js"),
    import("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/timeline/RouteConnectorRow.js"),
    import("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/timeline/ItineraryTimeline.js"),
  ]);
  return {
    entry,
    presentation: entry.presentation,
    InlineProviderState: provider.InlineProviderState,
    LocationState: location.LocationState,
    PersistenceNotice: persistence.PersistenceNotice,
    OwnerDetails: owner.OwnerDetails,
    RouteConnectorRow: connector.RouteConnectorRow,
    ItineraryTimeline: timeline.ItineraryTimeline,
  };
}

afterEach(() => {
  cleanup();
  vi.doUnmock(catalogModule);
  vi.restoreAllMocks();
});

describe.each(localeCases)("$locale deterministic degraded-state materialization", testCase => {
  test("Experience retains one global notice instance through sheet collapse and omits persistent/idle noise", async () => {
    const { presentation, entry } = await loadStateModules(testCase);
    const navigationStore = createMemoryTripNavigationStore({ surface: "experience", dayId: "one", ownerId: null });
    const { result } = renderHook(() => useTripExperience({ trip: semanticMapTrip, navigationStore, progressStore, presentation: entry.oakWashiMapBindings, clock: () => "2040-06-12T10:00:00Z" }));
    const base = result.current;
    const data = { ...base.model, persistence: { status: "memory-only", writable: false } as const, location: { status: "denied", hasFix: false } as const };
    const view = render(createElement(presentation.Experience, { ...base, model: data }));
    const memory = view.getByText(testCase.catalog.persistence.memoryOnlyNotice);
    const location = view.getByText(testCase.catalog.location.denied);
    for (const snap of ["collapsed", "expanded", "half"] as const) {
      view.rerender(createElement(presentation.Experience, { ...base, model: { ...data, sheet: { ...data.sheet, snap } } }));
      expect(view.getAllByText(testCase.catalog.persistence.memoryOnlyNotice)).toEqual([memory]);
      expect(view.getAllByText(testCase.catalog.location.denied)).toEqual([location]);
      expect(memory.closest(".oak-itinerary-sheet")).toBeNull();
      expect(location.closest(".oak-itinerary-sheet")).toBeNull();
      expect(memory.getAttribute("role")).toBe("status");
      expect(location.getAttribute("role")).toBe("status");
      expect(view.container.textContent).not.toContain(testCase.foreign.persistence.memoryOnlyNotice);
      expect(view.container.textContent).not.toContain(testCase.foreign.location.denied);
    }
    for (const state of [{ status: "unavailable", hasFix: false, key: "unavailable" }, { status: "active", hasFix: false, key: "waitingForFix" }, { status: "active", hasFix: true, key: "active" }] as const) {
      view.rerender(createElement(presentation.Experience, { ...base, model: { ...data, location: state } }));
      expect(view.getAllByText(testCase.catalog.location[state.key])).toEqual([location]);
    }
    view.rerender(createElement(presentation.Experience, { ...base, model: { ...data, persistence: { status: "persistent", writable: true }, location: { status: "idle", hasFix: false } } }));
    expect(view.queryByText(testCase.catalog.persistence.memoryOnlyNotice)).toBeNull();
    expect(view.queryByText(testCase.catalog.location.idle)).toBeNull();
    expect(view.container.querySelector(".oak-global-notices")).toBeNull();
  });

  test.each(["map", "places", "routes"] as const)("Home omits only idle %s notices and preserves supplied states and reading order", async channel => {
    const { presentation } = await loadStateModules(testCase);
    const idle = { status: "idle", retryable: false } as const;
    const model: HomeModel = {
      identity: { tripId: "home", title: "Authored journey", startDate: "2040-06-12", endDate: "2040-06-12", timezone: "UTC", locale: testCase.locale },
      effectiveEntryDayId: "one",
      days: [{ id: "one", date: "2040-06-12", title: "Authored day", ordinal: 1, effective: true, progress: { completed: 0, total: 1 } }],
      lodging: [], reservations: [], tasks: [{ id: "prepare", title: "Authored preparation", scope: "pretrip", completed: false, children: [] }],
      progress: { trip: { completed: 0, total: 1 }, days: [], selectedCandidates: [], shopping: [], skippedNodeIds: [], completedIds: [] },
      persistence: { status: "memory-only", writable: false }, providers: { map: idle, places: idle, routes: idle },
      capabilities: { openExperienceDayIds: ["one"], progress: { completionIds: ["prepare"], skippableNodeIds: [], shoppingItemIds: [], resetTrip: false, resetDayIds: [] } },
    };
    const c = controls();
    const view = render(createElement(presentation.Home, { model, actions: c.actions }));
    expect(view.container.querySelectorAll("[data-provider-state]")).toHaveLength(0);
    for (const state of [{ status: "loading", retryable: false }, { status: "unavailable", reason: "network", retryable: true }, { status: "ready", retryable: false }, idle] as const) {
      view.rerender(createElement(presentation.Home, { model: { ...model, providers: { ...model.providers, [channel]: state } }, actions: c.actions }));
      const notices = view.container.querySelectorAll("[data-provider-state]");
      expect(notices).toHaveLength(state.status === "loading" || state.status === "unavailable" ? 1 : 0);
      if (notices.length) {
        expect(notices[0].textContent).toContain(`${testCase.catalog.provider[channel]} · ${testCase.catalog.provider[state.status]}`);
        expect(notices[0].textContent).not.toContain(testCase.foreign.provider[channel]);
        if (state.status === "unavailable") expect(notices[0].textContent).toContain(testCase.catalog.provider.network);
      }
      expect(view.getByText(testCase.catalog.persistence.memoryOnlyNotice)).toBeDefined();
      expect(view.queryByRole("button", { name: testCase.catalog.provider.retry })).toBeNull();
      const ordered = [...view.container.querySelectorAll("h1, .oak-home-entry, [data-provider-state], .oak-home-utilities, .oak-home-days")];
      expect(ordered[0].tagName).toBe("H1");
      expect(ordered[1].className).toBe("oak-home-entry");
      expect(ordered.at(-2)?.classList.contains("oak-home-days")).toBe(true);
      expect(ordered.at(-1)?.className).toBe("oak-home-utilities");
      const notice = view.getByText(testCase.catalog.persistence.memoryOnlyNotice);
      expect(view.container.querySelector(".oak-home-entry")!.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(notice.compareDocumentPosition(view.container.querySelector(".oak-home-utilities")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(view.container.querySelector('[aria-current="true"]')?.textContent).toContain(testCase.catalog.status.selected);
    }
    fireEvent.click(view.getByRole("button", { name: testCase.catalog.home.openExperience }));
    expect(c.actions.openExperience).toHaveBeenCalledExactlyOnceWith("one");
    fireEvent.click(view.getByRole("checkbox", { name: "Authored preparation" }));
    expect(c.actions.updateProgress).toHaveBeenCalledExactlyOnceWith({ kind: "completion", id: "prepare", completed: true });
  });

  test("assembles five concrete views and preserves all three Oak map binding identities", async () => {
    const { entry, presentation } = await loadStateModules(testCase);
    expect(entry.OakWashiSetupRequired).toBeTypeOf("function");
    expect(entry.OakWashiLoading).toBeTypeOf("function");
    expect(entry.OakWashiFatalError).toBeTypeOf("function");
    expect(presentation.Home).toBe(entry.OakWashiHome);
    expect(presentation.Experience).toBe(entry.OakWashiExperience);
    expect(presentation.SetupRequired).toBe(entry.OakWashiSetupRequired);
    expect(presentation.Loading).toBe(entry.OakWashiLoading);
    expect(presentation.FatalError).toBe(entry.OakWashiFatalError);
    expect(presentation.mapVisualProfile).toBe(entry.oakWashiMapVisualProfile);
    expect(presentation.createMarkerContent).toBe(entry.createOakWashiMarkerContent);
    expect(presentation.createUserLocationContent).toBe(entry.createOakWashiUserLocationContent);
  });

  test("renders typed setup issues and only the supplied retry capability", async () => {
    const { presentation } = await loadStateModules(testCase);
    const c = controls();
    const view = render(createElement(presentation.SetupRequired, {
      model: { issues: [
        { kind: "missing-trip", copyKey: "setup.missingTrip" },
        { kind: "invalid-trip", copyKey: "setup.invalidTrip", paths: ["days.0.date", "routes.2.mode"] },
      ], capabilities: { retry: false } },
      actions: c.actions,
    }));
    expect(view.getByRole("heading", { name: testCase.catalog.setup.title })).toBeDefined();
    expect(view.getByText(testCase.catalog.setup.missingTrip)).toBeDefined();
    expect(view.getByText(testCase.catalog.setup.invalidTrip)).toBeDefined();
    expect(view.getByText("days.0.date")).toBeDefined();
    expect(view.getByText("routes.2.mode")).toBeDefined();
    expect(view.container.textContent).not.toContain(testCase.foreign.setup.title);
    expect(view.container.textContent).not.toMatch(/Tokyo|Taipei|Planned|walking/);
    expect(view.queryByRole("button")).toBeNull();
    view.rerender(createElement(presentation.SetupRequired, {
      model: { issues: [{ kind: "missing-trip", copyKey: "setup.missingTrip" }], capabilities: { retry: true } },
      actions: c.actions,
    }));
    fireEvent.click(view.getByRole("button", { name: testCase.catalog.setup.retry }));
    expect(c.actions.retrySetup).toHaveBeenCalledTimes(1);
  });

  test("renders surface and owner loading as stable, action-free skeletons", async () => {
    const { presentation } = await loadStateModules(testCase);
    const view = render(createElement(presentation.Loading, {
      model: { operation: "progress", owner: { kind: "surface", id: "home" } }, actions: controls().actions,
    }));
    const home = view.getByRole("main");
    expect(home.getAttribute("aria-busy")).toBe("true");
    expect(home.getAttribute("data-loading-owner")).toBe("surface:home");
    expect(home.querySelector("[data-loading-shape='home']")).not.toBeNull();
    expect(view.getByRole("status").textContent).toContain(testCase.catalog.loading.progress);
    expect(view.queryByRole("button")).toBeNull();
    view.rerender(createElement(presentation.Loading, {
      model: { operation: "routes", owner: { kind: "owner", id: "route-edge-a" } }, actions: controls().actions,
    }));
    const owner = view.getByRole("main");
    expect(owner.getAttribute("data-loading-owner")).toBe("owner:route-edge-a");
    expect(owner.querySelector("[data-loading-shape='owner']")).not.toBeNull();
    expect(view.getByRole("status").textContent).toContain(testCase.catalog.loading.routes);
    expect(view.container.textContent).not.toContain(testCase.foreign.loading.routes);
    expect(view.container.querySelector("[data-spinner]")).toBeNull();
  });

  test.each(["render", "state", "provider"] as const)("localizes fatal %s and gates Home/retry independently", async category => {
    const { presentation } = await loadStateModules(testCase);
    const c = controls();
    const copyKey = `fatal.${category}` as const;
    const view = render(createElement(presentation.FatalError, {
      model: { category, copyKey, retained: { home: true, itinerary: true, externalNavigation: true }, capabilities: { retry: false, openHome: false } },
      actions: c.actions,
    }));
    expect(view.getByRole("heading", { name: testCase.catalog.fatal.title })).toBeDefined();
    expect(view.getByText(testCase.catalog.fatal[category])).toBeDefined();
    expect(view.getAllByRole("listitem").map(item => item.textContent)).toEqual(testCase.retained);
    expect(view.queryByRole("button")).toBeNull();
    expect(view.container.textContent).not.toContain(testCase.foreign.fatal[category]);
    view.rerender(createElement(presentation.FatalError, {
      model: { category, copyKey, retained: { home: true, itinerary: false, externalNavigation: false }, capabilities: { retry: true, openHome: true } },
      actions: c.actions,
    }));
    fireEvent.click(view.getByRole("button", { name: testCase.catalog.fatal.openHome }));
    fireEvent.click(view.getByRole("button", { name: testCase.catalog.fatal.retry }));
    expect(c.actions.openHome).toHaveBeenCalledTimes(1);
    expect(c.actions.retryFatal).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).not.toMatch(/diagnostic|stack|exception/i);
  });

  test("public controller reserves Setup for missing/invalid Trip and retains valid Home under provider failure", async () => {
    const { presentation } = await loadStateModules(testCase);
    const missing = render(createElement(TripController, { trip: null, presentation }));
    expect(await missing.findByText(testCase.catalog.setup.missingTrip)).toBeDefined();
    expect(missing.queryByText(testCase.catalog.provider.missingConfiguration)).toBeNull();
    missing.unmount();
    const invalid = render(createElement(TripController, { trip: { ...semanticMapTrip, days: [] }, presentation }));
    expect(await invalid.findByText(testCase.catalog.setup.invalidTrip)).toBeDefined();
    expect(invalid.getByText("days")).toBeDefined();
    invalid.unmount();
    const retained = render(createElement(TripController, {
      trip: semanticMapTrip, presentation, progressStore,
      providerBootstrap: { map: { status: "unavailable", reason: "missing-configuration", retryable: false } },
      clock: () => "2040-06-12T10:00:00Z",
    }));
    expect(await retained.findByRole("heading", { level: 1, name: semanticMapTrip.title })).toBeDefined();
    expect(retained.getByText(new RegExp(testCase.catalog.provider.missingConfiguration))).toBeDefined();
    expect(retained.queryByText(testCase.catalog.setup.title)).toBeNull();
    expect(retained.container.textContent).not.toMatch(/Tokyo|Taipei|Planned|walking/);
  });

  test("inline provider states map typed reasons and never invent a retry action", async () => {
    const { InlineProviderState } = await loadStateModules(testCase);
    const c = controls();
    const view = render(<InlineProviderState channel="map" state={{ status: "unavailable", reason: "loader-failed", retryable: true }} />);
    expect(view.getByRole("status").textContent).toContain(testCase.catalog.provider.loaderFailed);
    expect(view.container.textContent).not.toContain(testCase.foreign.provider.loaderFailed);
    expect(view.queryByRole("button")).toBeNull();
    view.rerender(<InlineProviderState channel="routes" state={{ status: "unavailable", reason: "implausible-result", retryable: true }} onRetry={() => { c.actions.retryProvider("route", "edge"); }} />);
    expect(view.getByRole("status").textContent).toContain(testCase.catalog.provider.implausibleResult);
    fireEvent.click(view.getByRole("button", { name: testCase.catalog.provider.retry }));
    expect(c.actions.retryProvider).toHaveBeenCalledExactlyOnceWith("route", "edge");
    view.rerender(<InlineProviderState channel="places" state={{ status: "unavailable", reason: "malformed-response", retryable: false }} onRetry={() => { c.actions.retryProvider("place", "museum"); }} />);
    expect(view.getByRole("status").textContent).toContain(testCase.catalog.provider.malformedResponse);
    expect(view.container.textContent).not.toContain(testCase.foreign.provider.malformedResponse);
    expect(view.queryByRole("button")).toBeNull();
    view.rerender(<InlineProviderState channel="map" state={{ status: "ready", retryable: false }} />);
    expect(view.container.childElementCount).toBe(0);
  });

  test.each(["map", "routes", "places"] as const)("%s provider omits idle and ready notices but retains loading and failures", async channel => {
    const { InlineProviderState } = await loadStateModules(testCase);
    const c = controls();
    const view = render(<InlineProviderState channel={channel} state={{ status: "idle", retryable: false }} />);
    expect(view.container.childElementCount).toBe(0);
    view.rerender(<InlineProviderState channel={channel} state={{ status: "ready", retryable: false }} />);
    expect(view.container.childElementCount).toBe(0);
    view.rerender(<InlineProviderState channel={channel} state={{ status: "loading", retryable: false }} />);
    expect(view.getByRole("status").textContent).toBe(`${testCase.catalog.provider[channel]} · ${testCase.catalog.provider.loading}`);
    view.rerender(<InlineProviderState channel={channel} state={{ status: "unavailable", reason: "network", retryable: true }} onRetry={() => { c.actions.retryProvider(channel === "map" ? "map" : channel === "routes" ? "route" : "place", "edge"); }} />);
    expect(view.getByRole("status").textContent).toContain(testCase.catalog.provider.network);
    fireEvent.click(view.getByRole("button", { name: testCase.catalog.provider.retry }));
    expect(c.actions.retryProvider).toHaveBeenCalledTimes(1);
  });

  test.each([false, true])("idle route retains authored facts and reveals provenance only when selected=%s", async selected => {
    const { RouteConnectorRow } = await loadStateModules(testCase);
    const c = controls();
    const authored = route({ selected, mode: "flight", source: "manual", certainty: "suggested", authored: { durationMinutes: 110, summary: "Flight AB 12" }, runtime: { status: "idle" }, navigationAvailable: false });
    const data = model({ routes: [authored], timeline: [{ kind: "route", role: "connector", ownerId: "edge", routeId: "edge", states: selected ? ["selected"] : [] }] });
    const view = render(<ul><RouteConnectorRow entry={data.timeline[0] as Extract<(typeof data.timeline)[number], { kind: "route" }>} model={data} actions={c.actions} bindings={c.bindings} /></ul>);
    const facts = view.container.querySelector(".oak-route-facts")!;
    expect(facts.getAttribute("data-route-state")).toBe("idle");
    for (const fact of [testCase.catalog.routes.flight, "110", "Flight AB 12"]) expect(facts.textContent).toContain(fact);
    expect(facts.textContent).not.toContain(testCase.catalog.certainty.suggested);
    const details = view.container.querySelector(".oak-route-details");
    expect(details === null).toBe(!selected);
    if (selected) for (const fact of [testCase.catalog.routes.manual, testCase.catalog.certainty.suggested, testCase.catalog.routes.authoredFallback]) expect(details?.textContent).toContain(fact);
    expect(view.container.querySelector("[data-provider-state]")).toBeNull();
    expect(view.queryByRole("button", { name: testCase.catalog.routes.external })).toBeNull();
  });

  test("selected idle route preserves permitted external navigation only", async () => {
    const { RouteConnectorRow } = await loadStateModules(testCase);
    const c = controls();
    const authored = route({ selected: true, mode: "unknown", runtime: { status: "idle" }, navigationAvailable: true });
    const data = model({ routes: [authored], timeline: [{ kind: "route", role: "connector", ownerId: "edge", routeId: "edge", states: ["selected"] }] });
    const renderRow = (navigationOwnerIds: readonly string[]) => <ul><RouteConnectorRow entry={data.timeline[0] as Extract<(typeof data.timeline)[number], { kind: "route" }>} model={{ ...data, capabilities: { ...data.capabilities, navigationOwnerIds } }} actions={c.actions} bindings={c.bindings} /></ul>;
    const view = render(renderRow([]));
    expect(view.container.querySelector(".oak-route-details")).not.toBeNull();
    expect(view.queryByRole("button", { name: testCase.catalog.routes.external })).toBeNull();
    expect(view.getByText(testCase.catalog.routes.unknown)).toBeDefined();
    view.rerender(renderRow(["edge"]));
    expect(view.container.querySelector(".oak-route-details")).not.toBeNull();
    expect(view.container.querySelector("[data-provider-state]")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: testCase.catalog.routes.external }));
    expect(c.actions.openNavigation).toHaveBeenCalledExactlyOnceWith("edge");
  });

  test.each([
    { status: "denied", hasFix: false, copyKey: "denied" },
    { status: "unavailable", hasFix: false, copyKey: "unavailable" },
    { status: "active", hasFix: false, copyKey: "waitingForFix" },
    { status: "active", hasFix: true, copyKey: "active" },
  ] as const)("location $status/$hasFix stays a nonblocking inline fact", async state => {
    const { LocationState } = await loadStateModules(testCase);
    const view = render(<div data-map-list="retained"><LocationState state={state} /><p>Authored itinerary</p></div>);
    expect(view.getByRole("status").textContent).toContain(testCase.catalog.location[state.copyKey]);
    expect(view.container.textContent).not.toContain(testCase.foreign.location[state.copyKey]);
    expect(view.getByText("Authored itinerary")).toBeDefined();
    expect(view.queryByRole("button")).toBeNull();
  });

  test("memory-only persistence is truthful without disabling supported session progress", async () => {
    const { PersistenceNotice } = await loadStateModules(testCase);
    const view = render(<div><PersistenceNotice state={{ status: "memory-only", writable: false }} /><button type="button">Supported session action</button></div>);
    expect(view.getByRole("status").textContent).toContain(testCase.catalog.persistence.memoryOnlyNotice);
    expect(view.container.textContent).not.toContain(testCase.foreign.persistence.memoryOnlyNotice);
    expect((view.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
    view.rerender(<PersistenceNotice state={{ status: "persistent", writable: true }} />);
    expect(view.container.childElementCount).toBe(0);
  });

  test("owner route failure retains authored mode/summary and only owner capabilities grant retry/navigation", async () => {
    const { RouteConnectorRow } = await loadStateModules(testCase);
    const c = controls();
    const authored = route({
      selected: true, mode: "unknown", authored: { durationMinutes: 23, summary: "Use the ferry if trains stop" },
      runtime: { status: "unavailable", reason: "implausible-result", retryable: true }, navigationAvailable: true,
    });
    const data = model({ routes: [authored], timeline: [{ kind: "route", role: "connector", ownerId: "edge", routeId: "edge", states: ["selected"] }] });
    const view = render(<ul><RouteConnectorRow entry={data.timeline[0] as Extract<(typeof data.timeline)[number], { kind: "route" }>} model={data} actions={c.actions} bindings={c.bindings} /></ul>);
    expect(view.getByText(testCase.catalog.routes.unknown)).toBeDefined();
    expect(view.getByText("Use the ferry if trains stop")).toBeDefined();
    expect(view.container.querySelector(".oak-route-evidence")?.textContent).toContain(testCase.catalog.routes.authoredFallback);
    expect(view.container.textContent).not.toContain(testCase.foreign.routes.unknown);
    fireEvent.click(view.getByRole("button", { name: testCase.catalog.provider.retry }));
    fireEvent.click(view.getByRole("button", { name: testCase.catalog.routes.external }));
    expect(c.actions.retryProvider).toHaveBeenCalledExactlyOnceWith("route", "edge");
    expect(c.actions.openNavigation).toHaveBeenCalledExactlyOnceWith("edge");
    expect(view.container.textContent).not.toContain(testCase.catalog.routes.walking);
  });

  test("unresolved and loading places keep their owner and distinguish absent from uncertain hours", async () => {
    const { OwnerDetails } = await loadStateModules(testCase);
    const c = controls();
    const selected = node({ states: ["selected", "unresolved"] });
    const unresolved = place({ place: { label: "Unverified gate", certainty: "unverified", resolution: { status: "unresolved", reason: "not-reviewed" } }, navigationAvailable: false });
    const loading = place({ runtime: { status: "loading" }, navigationAvailable: false });
    const data = model({ timeline: [selected], places: [unresolved] });
    const view = render(<OwnerDetails node={selected} model={data} actions={c.actions} bindings={c.bindings} />);
    expect(view.getByRole("region").getAttribute("data-details-owner")).toBe("museum");
    expect(view.queryByRole("button", { name: testCase.catalog.navigation.open })).toBeNull();
    view.rerender(<OwnerDetails node={{ ...selected, states: ["selected"] }} model={{ ...data, places: [loading] }} actions={c.actions} bindings={c.bindings} />);
    expect(view.getByRole("status").textContent).toContain(testCase.catalog.provider.loading);
    expect(view.container.textContent).not.toContain(testCase.foreign.provider.loading);
    expect(view.queryByRole("button", { name: testCase.catalog.provider.retry })).toBeNull();
    for (const reason of ["absent", "incomplete"] as const) {
      const unknown = place({ runtime: { status: "ready", opening: { status: "unknown", reason } } });
      view.rerender(<OwnerDetails node={{ ...selected, states: ["selected"] }} model={{ ...data, places: [unknown], capabilities: { ...capabilities, retryPlaceOwnerIds: [] } }} actions={c.actions} bindings={c.bindings} />);
      expect(view.getByText(testCase.catalog.openingHours[reason])).toBeDefined();
      expect(view.container.textContent).not.toContain(testCase.foreign.openingHours[reason]);
      expect(view.container.textContent).not.toMatch(/Planned|currently open/i);
    }
  });

  test.each(["loader-failed", "network"] as const)("valid Experience remains mounted beside $reason map state", async reason => {
    const { presentation } = await loadStateModules(testCase);
    const navigation = createMemoryTripNavigationStore({ surface: "experience", dayId: "one", ownerId: null });
    const view = render(<TripController trip={semanticMapTrip} presentation={presentation} navigationStore={navigation} progressStore={progressStore} providerBootstrap={{ map: { status: "unavailable", reason, retryable: false } }} clock={() => "2040-06-12T10:00:00Z"} />);
    await waitFor(() => expect(view.container.querySelector(".oak-experience")).not.toBeNull());
    expect(view.getByRole("region", { name: testCase.catalog.accessibleNames.map })).toBeDefined();
    expect(view.getByText(new RegExp(testCase.catalog.provider[reason === "loader-failed" ? "loaderFailed" : "network"]))).toBeDefined();
    expect(within(view.getByRole("region", { name: testCase.catalog.accessibleNames.itinerarySheet })).getByText("Before")).toBeDefined();
    expect(view.queryByText(testCase.catalog.setup.title)).toBeNull();
  });

  test("public runtime keeps an unresolved owner in row order with ordinal but omits its precise marker and navigation", async () => {
    const { entry, ItineraryTimeline } = await loadStateModules(testCase);
    const day = semanticMapTrip.days[0];
    const unresolvedTrip: Trip = {
      ...semanticMapTrip,
      days: [{
        ...day,
        nodes: day.nodes.map(item => item.id === "before" ? {
          ...item,
          place: { ...item.place!, identity: { status: "unresolved", reason: "not-reviewed" } },
        } : item),
      }],
    };
    const input: Parameters<typeof useTripExperience>[0] = {
      trip: unresolvedTrip,
      navigationStore: createMemoryTripNavigationStore({ surface: "experience", dayId: "one", ownerId: "before" }),
      progressStore,
      presentation: entry.oakWashiMapBindings,
      clock: () => "2040-06-12T10:00:00Z",
    };
    const { result } = renderHook(() => useTripExperience(input));
    const timelineOwners = result.current.model.timeline.map(item => item.ownerId);
    const unresolvedRow = result.current.model.timeline[0];
    expect(timelineOwners).toEqual(["before", "none-owner", "after"]);
    expect(unresolvedRow.kind).toBe("node");
    if (unresolvedRow.kind !== "node") throw new Error("Expected unresolved place to retain its node row");
    expect(unresolvedRow).toMatchObject({ ownerId: "before", ordinal: "1", displayIndex: 1, markerMode: "numbered" });
    expect(unresolvedRow.states).toContain("unresolved");
    expect(result.current.model.map.presentation.markers.map(marker => marker.ownerId)).toEqual(["after"]);
    expect(result.current.model.capabilities.navigationOwnerIds).not.toContain("before");
    const view = render(<ItineraryTimeline model={result.current.model} actions={result.current.actions} bindings={result.current.bindings} />);
    const rows = [...view.container.querySelectorAll<HTMLElement>(".oak-timeline > [data-owner-id]")];
    expect(rows.map(row => row.dataset.ownerId)).toEqual(timelineOwners);
    expect(rows[0].textContent).toContain("1");
    expect(within(rows[0]).queryByRole("button", { name: testCase.catalog.navigation.open })).toBeNull();
    expect(view.container.textContent).not.toContain(testCase.foreign.facts.unverifiedLocation);
  });
});
