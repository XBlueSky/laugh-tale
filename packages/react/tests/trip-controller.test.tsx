import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryTripNavigationStore, emptyTripProgress, parseTripProgress, type Trip } from "@laugh-tale-island/core";
import type { ProgressStore } from "@laugh-tale-island/core/browser";
import { TripController } from "../src/trip-controller.js";
import type { ExperienceViewProps, HomeViewProps, LoadingViewProps, SetupRequiredViewProps, FatalErrorViewProps, TripPresentationV2, TripActions, TripDiagnosticSink } from "../src/presentation-contract.js";

beforeEach(() => {
  const entries = new Map<string, string>();
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
  } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
const trip: Trip = { id: "journey", title: "Journey", locale: "en", timezone: "Etc/UTC", startDate: "2040-06-12", endDate: "2040-06-13", days: [ { id: "one", title: "One", date: "2040-06-12", nodes: [] }, { id: "two", title: "Two", date: "2040-06-13", nodes: [] } ], routes: [], reservations: [], candidateGroups: [], tasks: [{ id: "pack", title: "Pack", scope: "pretrip" }] };
const clock = () => "2040-06-12T00:00:00Z";
function memoryStore(): ProgressStore {
  let value: string | null = null;
  return { read: () => ({ status: "ready", value }), write(next) { value = next; return true; }, subscribe: () => () => {} };
}

describe.each(["article", "aside"] as const)("TripController with %s presentation", (Tag) => {
  let home: HomeViewProps;
  let loading: LoadingViewProps;
  let setup: SetupRequiredViewProps;
  let fatal: FatalErrorViewProps;
  let experience: ExperienceViewProps;
  function presentation(): TripPresentationV2 {
    return {
      Home(props) { home = props; return <Tag aria-label="home">{props.model.identity.title}</Tag>; },
      Loading(props) { loading = props; return <Tag aria-label="loading" />; },
      SetupRequired(props) { setup = props; return <Tag aria-label="setup" />; },
      FatalError(props) { fatal = props; return <Tag aria-label="fatal" />; },
      Experience: (props) => { experience = props; return <Tag aria-label="experience" />; },
      mapVisualProfile: { id: "test", basemap: { mode: "neutral", density: "low", contrast: "soft", poi: "minimal", stationLabels: "hidden", palette: { geometry: "gray", label: "black", labelStroke: "white", water: "blue", park: "green", road: "gray" } }, routeStyle: () => null },
      createMarkerContent: () => { throw new Error("not used in Home"); },
      createUserLocationContent: () => { throw new Error("not used in Home"); },
    };
  }
  async function hydrated() { await waitFor(() => expect(screen.queryByLabelText("loading")).toBeNull()); }

  it("keeps navigation and progress through pending bootstrap and callback-backed retry", async () => {
    const views = presentation();
    const store = memoryStore();
    const navigationStore = createMemoryTripNavigationStore();
    const retryMapBootstrap = vi.fn();
    const runtime = { retryMapBootstrap };
    const diagnostic = vi.fn<TripDiagnosticSink>();
    const common = { trip, presentation: views, progressStore: store, navigationStore, clock, runtime, onDiagnostic: diagnostic };
    const view = render(<TripController {...common} providerBootstrap={{ map: { status: "loading", retryable: false } }} />);
    await hydrated();
    expect(home.model.providers.map).toEqual({ status: "loading", retryable: false });
    expect(diagnostic).not.toHaveBeenCalled();
    const actions = home.actions;
    act(() => actions.updateProgress({ kind: "completion", id: "task:pack", completed: true }));
    act(() => actions.openExperience("two"));
    expect(experience.model.providers.map).toEqual({ status: "loading", retryable: false });
    expect(experience.model.day.id).toBe("two");
    expect(experience.model.capabilities.retryMap).toBe(false);
    view.rerender(<TripController {...common} providerBootstrap={{ map: { status: "unavailable", reason: "loader-failed", retryable: true } }} />);
    expect(experience.model.capabilities.retryMap).toBe(true);
    act(() => experience.actions.retryProvider("map"));
    expect(retryMapBootstrap).toHaveBeenCalledTimes(1);
    view.rerender(<TripController {...common} providerBootstrap={{ map: { status: "loading", retryable: false } }} />);
    expect(experience.model.capabilities.retryMap).toBe(false);
    expect(experience.actions).toBe(actions);
    act(() => actions.openHome());
    expect(home.actions).toBe(actions);
    expect(home.model.progress.completedIds).toContain("task:pack");
    expect(diagnostic.mock.calls.every(([event]) => event.scope === "provider" && event.reason === "loader-failed")).toBe(true);
    view.rerender(<TripController {...common} runtime={{}} providerBootstrap={{ map: { status: "unavailable", reason: "loader-failed", retryable: true } }} />);
    act(() => actions.openExperience("two"));
    expect(experience.model.capabilities.retryMap).toBe(false);
  });

  it("selects the current authored day for an initial Experience without an explicit day", async () => {
    const authored: Trip = {
      ...trip,
      days: trip.days.map((day) => ({
        ...day,
        nodes: [
          {
            id: `node-${day.id}`,
            dayId: day.id,
            title: day.title,
            kind: "sightseeing",
            payload: {},
            optionality: "core",
            timing: { start: "09:00", end: "11:00", certainty: "fixed" },
          },
        ],
      })),
    };
    const navigationStore = {
      read: () => ({
        surface: "experience" as const,
        dayId: null,
        ownerId: null,
      }),
      write: vi.fn(),
      subscribe: () => () => {},
    };
    render(
      <TripController
        trip={authored}
        navigationStore={navigationStore}
        presentation={presentation()}
        progressStore={memoryStore()}
        clock={() => "2040-06-13T10:00:00Z"}
      />,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("experience")).toBeDefined(),
    );
    expect(experience.model.day.id).toBe("two");
    expect(experience.model.owners.currentId).toBe("node-two");
    expect(experience.model.owners.selectedId).toBe("node-two");
  });

  it("diagnoses bootstrap replacement before a hydrated Experience observes it", async () => {
    const events: string[] = [];
    const views = presentation();
    const Original = views.Experience;
    views.Experience = (props) => {
      if (props.model.providers.map.status === "unavailable")
        events.push(`view:${props.model.providers.map.reason}`);
      return <Original {...props} />;
    };
    const input = {
      trip,
      presentation: views,
      progressStore: memoryStore(),
      clock,
      navigationStore: createMemoryTripNavigationStore({
        surface: "experience",
        dayId: "one",
        ownerId: null,
      }),
      onDiagnostic: (
        event: import("../src/presentation-contract.js").TripDiagnosticEvent,
      ) => {
        if (event.scope === "provider")
          events.push(`diagnostic:${event.reason}`);
      },
    };
    const view = render(<TripController {...input} />);
    await hydrated();
    events.length = 0;
    view.rerender(
      <TripController
        {...input}
        providerBootstrap={{
          map: { status: "unavailable", reason: "network", retryable: true },
        }}
      />,
    );
    expect(events.indexOf("diagnostic:network")).toBeLessThan(
      events.indexOf("view:network"),
    );
    expect(screen.queryByLabelText("loading")).toBeNull();
  });

  it("renders actual Experience props with one progress subscription and stable actions across surfaces", async () => {
    let active = 0;
    let peak = 0;
    const store = memoryStore();
    store.subscribe = () => { active += 1; peak = Math.max(peak, active); return () => { active -= 1; }; };
    const view = render(<TripController trip={trip} presentation={presentation()} progressStore={store} clock={clock} />);
    await hydrated();
    const actions = home.actions;
    act(() => actions.openExperience("two"));
    await waitFor(() => expect(screen.getByLabelText("experience")).toBeDefined());
    expect(experience.actions).toBe(actions);
    expect(Object.keys(experience).sort()).toEqual(["actions", "bindings", "model"]);
    expect(experience.model.day.id).toBe("two");
    act(() => actions.setHeaderExpanded(false));
    expect(experience.model.header).toEqual({ expanded: false, revision: 1, transition: { id: 1, phase: "collapsing" } });
    act(() => actions.openHome());
    await hydrated();
    expect(home.actions).toBe(actions);
    expect(active).toBe(1);
    expect(peak).toBe(1);
    view.unmount();
    expect(active).toBe(0);
    act(() => actions.openExperience());
    expect(screen.queryByLabelText("experience")).toBeNull();
  });

  it.each(["read-refusal", "write-refusal"] as const)("retains every memory-only progress fact across surface round trips after %s", async (mode) => {
    const authored: Trip = {
      ...trip,
      days: [{ ...trip.days[0], nodes: [
        { id: "shop", dayId: "one", title: "Shop", kind: "shopping", payload: { items: [{ id: "gift", title: "Gift" }] }, optionality: "optional", timing: { certainty: "unknown" } },
        { id: "meal", dayId: "one", title: "Meal", kind: "dining", payload: { candidateGroupId: "food" }, optionality: "candidate", timing: { certainty: "unknown" } },
      ] }, trip.days[1]],
      tasks: [...trip.tasks, { id: "day-task", title: "Day task", scope: "day", dayId: "one" }],
      candidateGroups: [{ id: "food", parentNodeId: "meal", mode: "single", defaultOptionId: "a", options: [{ id: "a", title: "A" }, { id: "b", title: "B" }] }],
    };
    let subscriptions = 0;
    const read = vi.fn<ProgressStore["read"]>(() => mode === "read-refusal" ? { status: "unavailable" } : { status: "ready", value: null });
    const write = vi.fn(() => false);
    const store: ProgressStore = { read, write, subscribe: () => { subscriptions++; return () => { subscriptions--; }; } };
    const view = render(<TripController trip={authored} presentation={presentation()} progressStore={store} clock={clock} />);
    await hydrated();
    const actions = home.actions;
    await act(async () => {
      actions.updateProgress({ kind: "completion", id: "task:pack", completed: true });
      actions.updateProgress({ kind: "node-skipped", nodeId: "shop", skipped: true });
      actions.updateProgress({ kind: "shopping-status", itemId: "gift", status: "purchased" });
      await Promise.resolve();
    });
    act(() => actions.openExperience("one"));
    await hydrated();
    expect(experience.model.progress.completedIds).toEqual(["task:pack"]);
    expect(experience.model.progress.skippedNodeIds).toEqual(["shop"]);
    expect(experience.model.progress.shopping).toEqual([{ itemId: "gift", status: "purchased" }]);
    expect(experience.model.persistence).toEqual({ status: "memory-only", writable: false });
    act(() => {
      actions.updateProgress({ kind: "completion", id: "task:day-task", completed: true });
      actions.updateProgress({ kind: "completion", id: "node:meal", completed: true });
      actions.reopenCandidate("food");
    });
    act(() => actions.previewCandidate("food", "b"));
    act(() => actions.confirmCandidate("food"));
    act(() => actions.openHome());
    await hydrated();
    expect(home.actions).toBe(actions);
    expect(home.model.progress.completedIds).toEqual(["task:pack", "task:day-task", "node:meal"]);
    expect(home.model.progress.selectedCandidates).toEqual([{ groupId: "food", optionId: "b" }]);
    expect(home.model.persistence).toEqual({ status: "memory-only", writable: false });
    act(() => actions.openExperience("one"));
    await hydrated();
    expect(experience.model.candidates[0].options.find((option) => option.id === "b")?.selected).toBe(true);
    act(() => actions.resetProgress("day", "one"));
    act(() => actions.openHome());
    await hydrated();
    expect(home.model.progress.completedIds).toEqual(["task:pack"]);
    expect(home.model.progress.skippedNodeIds).toEqual([]);
    expect(home.model.progress.shopping).toEqual([]);
    expect(home.model.progress.selectedCandidates).toEqual([]);
    act(() => actions.resetProgress("trip"));
    act(() => actions.openExperience("one"));
    await hydrated();
    expect(experience.model.progress.completedIds).toEqual([]);
    expect(experience.model.persistence).toEqual({ status: "memory-only", writable: false });
    expect(read).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(mode === "read-refusal" ? 0 : 1);
    expect(subscriptions).toBe(1);
    view.unmount();
    expect(subscriptions).toBe(0);
  });

  it("deduplicates bootstrap diagnostics across surface and sink changes while preserving replacement attempts", async () => {
    const failure = { status: "unavailable", reason: "loader-failed", retryable: true, diagnostic: "private loader" } as const;
    const first = vi.fn();
    const second = vi.fn();
    const views = presentation();
    const store = memoryStore();
    const initial = { trip, presentation: views, progressStore: store, clock, providerBootstrap: { map: failure }, onDiagnostic: first };
    const view = render(<TripController {...initial} />);
    await hydrated();
    expect(first).toHaveBeenCalledExactlyOnceWith({ scope: "provider", channel: "map", phase: "bootstrap", reason: "loader-failed", diagnostic: "private loader" });
    act(() => home.actions.openExperience());
    await hydrated();
    expect(experience.model.providers.map).toEqual({ status: "unavailable", reason: "loader-failed", retryable: true });
    expect(first).toHaveBeenCalledTimes(1);
    view.rerender(<TripController {...initial} onDiagnostic={second} />);
    expect(second).not.toHaveBeenCalled();
    view.rerender(<TripController {...initial} onDiagnostic={second} providerBootstrap={{ map: { ...failure } }} />);
    expect(second).not.toHaveBeenCalled();
    view.rerender(<TripController {...initial} onDiagnostic={second} providerBootstrap={{ map: { ...failure, diagnostic: "replacement attempt" } }} />);
    expect(second).toHaveBeenCalledTimes(1);
    act(() => experience.actions.openHome());
    await hydrated();
    expect(second).toHaveBeenCalledTimes(1);
    view.rerender(<TripController {...initial} onDiagnostic={second} providerBootstrap={{}} />);
    view.rerender(<TripController {...initial} onDiagnostic={second} />);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("invalidates Experience readiness on store replacement and retains one clock timer across surfaces", async () => {
    vi.useFakeTimers();
    const views = presentation();
    const navigationStore = createMemoryTripNavigationStore({ surface: "experience", dayId: "one", ownerId: null });
    const store = memoryStore();
    const view = render(<TripController trip={trip} presentation={views} progressStore={store} navigationStore={navigationStore} clock={clock} />);
    await act(async () => { await Promise.resolve(); });
    const actions = experience.actions;
    act(() => { vi.advanceTimersByTime(20); });
    const timers = vi.getTimerCount();
    const replacement = memoryStore();
    replacement.write(JSON.stringify({ ...emptyTripProgress(), completedIds: ["task:pack"] }));
    view.rerender(<TripController trip={trip} presentation={views} progressStore={replacement} navigationStore={navigationStore} clock={clock} />);
    expect(screen.queryByLabelText("experience")).toBeNull();
    expect(screen.getByLabelText("loading")).toBeDefined();
    await act(async () => { await Promise.resolve(); });
    expect(experience.model.progress.completedIds).toEqual(["task:pack"]);
    expect(experience.actions).toBe(actions);
    act(() => actions.openHome());
    await act(async () => { await Promise.resolve(); });
    expect(vi.getTimerCount()).toBe(timers);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("rejects contradictory factory/bootstrap state before constructing any runtime", async () => {
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { if (!args.some((arg) => String(arg).includes("controller-state-failure"))) throw new Error("Unexpected React report"); });
    const createMap = vi.fn(() => { throw new Error("must not construct"); });
    const diagnostic = vi.fn();
    render(<TripController trip={trip} presentation={presentation()} clock={clock} runtime={{ createMap }} providerBootstrap={{ map: { status: "unavailable", reason: "loader-failed", retryable: true } }} onDiagnostic={diagnostic} />);
    await waitFor(() => expect(screen.getByLabelText("fatal")).toBeDefined());
    expect(fatal.model.category).toBe("state");
    expect(createMap).not.toHaveBeenCalled();
    expect(diagnostic).toHaveBeenCalledTimes(1);
    expect(diagnostic.mock.calls[0][0]).toMatchObject({ scope: "controller", phase: "state", category: "state" });
  });

  it("revokes failed Experience actions and reports the original state cause once", async () => {
    const cause = new Error("private experience write");
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { if (!args.some((arg) => String(arg).includes("controller-state-failure"))) throw new Error("Unexpected React report"); });
    const base = createMemoryTripNavigationStore({ surface: "experience", dayId: "one", ownerId: null });
    const navigationStore = { ...base, write: () => { throw cause; } };
    const diagnostic = vi.fn();
    render(<TripController trip={trip} presentation={presentation()} navigationStore={navigationStore} progressStore={memoryStore()} clock={clock} onDiagnostic={diagnostic} />);
    await hydrated();
    const actions = experience.actions;
    act(() => actions.openHome());
    expect(screen.getByLabelText("fatal")).toBeDefined();
    expect(fatal.actions).toBe(actions);
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith({ scope: "controller", phase: "state", category: "state", cause });
    act(() => actions.updateProgress({ kind: "completion", id: "task:pack", completed: true }));
    expect(base.read().surface).toBe("experience");
  });

  it("uses the injected store, clears owners, rejects invalid days, and retains one facade", async () => {
    const store = createMemoryTripNavigationStore({ surface: "experience", dayId: "two", ownerId: "old" });
    render(<TripController trip={trip} presentation={presentation()} navigationStore={store} progressStore={memoryStore()} clock={clock} />);
    const actions = loading.actions;
    await hydrated();
    expect(screen.queryByLabelText("home")).toBeNull();
    act(() => actions.openHome());
    expect(store.read()).toEqual({ surface: "home", dayId: null, ownerId: null });
    await hydrated();
    expect(home.actions).toBe(actions);
    act(() => actions.openExperience("invalid"));
    expect(store.read().surface).toBe("home");
    act(() => actions.openExperience("two"));
    expect(store.read()).toEqual({ surface: "experience", dayId: "two", ownerId: null });
    expect(screen.queryByLabelText("home")).toBeNull();
    act(() => store.write({ surface: "home", dayId: null, ownerId: null }));
    await hydrated();
    expect(screen.getByLabelText("home")).toBeDefined();
    act(() => actions.openExperience());
    expect(store.read().dayId).toBe("one");
  });

  it("opens a Home reservation on its exact day and itinerary owner", async () => {
    const node = { id: "museum", dayId: "two", title: "Museum", kind: "sightseeing" as const, optionality: "core" as const, timing: { certainty: "unknown" as const }, payload: {} };
    const authored: Trip = { ...trip, days: [trip.days[0], { ...trip.days[1], nodes: [node] }], reservations: [{ id: "ticket", ownerId: "museum", title: "Ticket", booking: { status: "confirmed" } }] };
    const store = createMemoryTripNavigationStore();
    render(<TripController trip={authored} presentation={presentation()} navigationStore={store} progressStore={memoryStore()} clock={clock} />);
    await hydrated();
    expect(home.model.reservations[0].destination).toEqual({ dayId: "two", nodeId: "museum" });
    act(() => home.actions.openReservation("unknown"));
    expect(store.read()).toEqual({ surface: "home", dayId: null, ownerId: null });
    act(() => home.actions.openReservation("ticket"));
    expect(store.read()).toEqual({ surface: "experience", dayId: "two", ownerId: "museum" });
    expect(experience.model.day.id).toBe("two");
    expect(experience.model.owners.selectedId).toBe("museum");
  });

  it("loads progress then applies guarded progress actions through the injected store", async () => {
    const store = memoryStore();
    render(<TripController trip={trip} presentation={presentation()} progressStore={store} clock={clock} />);
    expect(loading.model).toEqual({ operation: "progress", owner: { kind: "surface", id: "home" } });
    const actions = loading.actions;
    await hydrated();
    expect(home.actions).toBe(actions);
    act(() => actions.updateProgress({ kind: "completion", id: "unknown", completed: true }));
    expect(home.model.progress.completedIds).toEqual([]);
    act(() => actions.updateProgress({ kind: "completion", id: "task:pack", completed: true }));
    expect(home.model.tasks[0].completed).toBe(true);
    expect(store.read()).toEqual({ status: "ready", value: JSON.stringify({ ...emptyTripProgress(), completedIds: ["task:pack"] }) });
    act(() => actions.resetProgress("trip"));
    expect(home.model.tasks[0].completed).toBe(false);
  });

  it.each(["home", "experience"] as const)(
    "guards every progress delegate through the real %s surface",
    async (surface) => {
      const authored: Trip = {
        ...trip,
        days: [
          {
            ...trip.days[0],
            nodes: [
              {
                id: "shop",
                dayId: "one",
                title: "Shop",
                kind: "shopping",
                payload: { items: [{ id: "gift", title: "Gift" }] },
                optionality: "optional",
                timing: { certainty: "unknown" },
              },
            ],
          },
          trip.days[1],
        ],
      };
      const store = memoryStore();
      render(
        <TripController
          trip={authored}
          presentation={presentation()}
          progressStore={store}
          navigationStore={createMemoryTripNavigationStore({
            surface,
            dayId: "one",
            ownerId: null,
          })}
          clock={clock}
        />,
      );
      const actions = loading.actions;
      act(() =>
        actions.updateProgress({
          kind: "completion",
          id: "task:pack",
          completed: true,
        }),
      );
      await hydrated();
      const current = () =>
        surface === "home" ? home.model.progress : experience.model.progress;
      expect(current().completedIds).toEqual([]);
      act(() => {
        actions.updateProgress({
          kind: "completion",
          id: "foreign",
          completed: true,
        });
        actions.updateProgress({
          kind: "node-skipped",
          nodeId: "foreign",
          skipped: true,
        });
        actions.updateProgress({
          kind: "shopping-status",
          itemId: "foreign",
          status: "purchased",
        });
        actions.updateProgress({
          kind: "completion",
          id: "task:pack",
          completed: true,
        });
        actions.updateProgress({
          kind: "node-skipped",
          nodeId: "shop",
          skipped: true,
        });
        actions.updateProgress({
          kind: "shopping-status",
          itemId: "gift",
          status: "purchased",
        });
      });
      expect(current().completedIds).toEqual(["task:pack"]);
      expect(current().skippedNodeIds).toEqual(["shop"]);
      expect(current().shopping).toEqual([
        { itemId: "gift", status: "purchased" },
      ]);
      act(() => actions.resetProgress("day", "foreign"));
      expect(current().skippedNodeIds).toEqual(["shop"]);
      act(() => actions.resetProgress("day", "one"));
      expect(current().skippedNodeIds).toEqual([]);
      expect(current().shopping).toEqual([]);
      expect(current().completedIds).toEqual(["task:pack"]);
      act(() => actions.resetProgress("trip"));
      expect(current().completedIds).toEqual([]);
    },
  );

  it("advertises and accepts only completion-capable custom owners", async () => {
    const nodes = [false, true, undefined].map((completion, index) => ({
      id: `custom-${index}`, dayId: "one", title: "Custom", kind: "custom" as const,
      optionality: "core" as const, timing: { certainty: "unknown" as const },
      payload: { customKind: "note", presentationRole: "primary" as const, capabilities: completion === undefined ? { place: true } : { place: true, completion }, data: {} },
    }));
    const authored = { ...trip, days: [{ ...trip.days[0], nodes }, trip.days[1]] };
    const store = memoryStore();
    store.write(JSON.stringify({ ...emptyTripProgress(), completedIds: ["node:custom-0", "node:custom-2"] }));
    render(<TripController trip={authored} presentation={presentation()} progressStore={store} clock={clock} />);
    await hydrated();
    expect(home.model.capabilities.progress.completionIds).toEqual(["node:custom-1", "task:pack"]);
    expect(home.model.progress.trip).toEqual({ completed: 0, total: 2 });
    expect(home.model.progress.days).toEqual([{ dayId: "one", completed: 0, total: 1 }, { dayId: "two", completed: 0, total: 0 }]);
    act(() => {
      home.actions.updateProgress({ kind: "completion", id: "node:custom-0", completed: false });
      home.actions.updateProgress({ kind: "completion", id: "node:custom-2", completed: false });
      home.actions.updateProgress({ kind: "completion", id: "node:custom-1", completed: true });
    });
    expect(home.model.progress.completedIds).toEqual(["node:custom-0", "node:custom-2", "node:custom-1"]);
    expect(home.model.progress.trip).toEqual({ completed: 1, total: 2 });
    act(() => home.actions.resetProgress("day", "one"));
    expect(home.model.progress.completedIds).toEqual([]);
  });

  it("isolates default persistence by exact Trip ID and preserves the facade", async () => {
    const views = presentation();
    const { rerender } = render(<TripController trip={trip} presentation={views} clock={clock} />);
    await hydrated();
    const actions = home.actions;
    act(() => actions.updateProgress({ kind: "completion", id: "task:pack", completed: true }));
    expect(parseTripProgress(window.localStorage.getItem("eternal-pose:trip-progress:v1:journey")).completedIds).toEqual(["task:pack"]);
    rerender(<TripController trip={{ ...trip, id: "next" }} presentation={views} clock={clock} />);
    expect(screen.getByLabelText("loading")).toBeDefined();
    await hydrated();
    expect(home.model.progress.completedIds).toEqual([]);
    expect(home.actions).toBe(actions);
    rerender(<TripController trip={trip} presentation={views} clock={clock} />);
    await hydrated();
    expect(home.model.progress.completedIds).toEqual(["task:pack"]);
  });

  it("degrades throwing browser storage to memory-only", async () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => { throw new Error("storage denied"); });
    render(<TripController trip={trip} presentation={presentation()} clock={clock} />);
    await hydrated();
    expect(home.model.persistence).toEqual({ status: "memory-only", writable: false });
  });

  it("never touches default storage when a store is injected", async () => {
    const getStorage = vi.fn(() => { throw new Error("unexpected default access"); });
    Object.defineProperty(window, "localStorage", { configurable: true, get: getStorage });
    render(<TripController trip={trip} presentation={presentation()} progressStore={memoryStore()} clock={clock} />);
    await hydrated();
    expect(home.model.persistence).toEqual({ status: "persistent", writable: true });
    expect(getStorage).not.toHaveBeenCalled();
  });

  it("contains an inaccessible browser storage getter", async () => {
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => { throw new Error("denied"); } });
    render(<TripController trip={trip} presentation={presentation()} clock={clock} />);
    await hydrated();
    expect(home.model.persistence).toEqual({ status: "memory-only", writable: false });
  });

  it("revokes old content delegates on Setup and keeps recovery handlers current", async () => {
    const views = presentation();
    const store = memoryStore();
    const navigationStore = createMemoryTripNavigationStore();
    const retry = vi.fn();
    const { rerender } = render(<TripController trip={trip} presentation={views} navigationStore={navigationStore} progressStore={store} clock={clock} />);
    await hydrated();
    const actions = home.actions;
    rerender(<TripController trip={null} presentation={views} recovery={{ retrySetup: retry }} />);
    expect(setup.actions).toBe(actions);
    act(() => {
      actions.openExperience("one");
      actions.updateProgress({ kind: "completion", id: "task:pack", completed: true });
      actions.retrySetup();
    });
    expect(navigationStore.read().surface).toBe("home");
    expect(store.read()).toEqual({ status: "ready", value: null });
    expect(retry).toHaveBeenCalledTimes(1);
    rerender(<TripController trip={null} presentation={views} />);
    expect(setup.model.capabilities.retry).toBe(false);
    act(() => actions.retrySetup());
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it.each(["read", "write", "subscribe", "unsubscribe"] as const)("classifies throwing progress %s as state and revokes content actions", async (operation) => {
    const cause = new Error(`private ${operation} failure`);
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      if (!args.some((arg) => String(arg).includes(cause.message) || String(arg).includes("controller-state-failure"))) throw new Error("Unexpected React report");
    });
    const baseStore = memoryStore();
    const store: ProgressStore = {
      read: () => { if (operation === "read") throw cause; return baseStore.read(); },
      write: (value) => { if (operation === "write") throw cause; return baseStore.write(value); },
      subscribe: () => { if (operation === "subscribe") throw cause; return () => { if (operation === "unsubscribe") throw cause; }; },
    };
    const diagnostic = vi.fn();
    const views = presentation();
    const navigationStore = createMemoryTripNavigationStore();
    const { rerender } = render(<TripController trip={trip} presentation={views} navigationStore={navigationStore} progressStore={store} clock={clock} onDiagnostic={diagnostic} />);
    if (operation === "write" || operation === "unsubscribe") {
      await hydrated();
      if (operation === "write") act(() => home.actions.updateProgress({ kind: "completion", id: "task:pack", completed: true }));
      else rerender(<TripController trip={null} presentation={views} onDiagnostic={diagnostic} />);
    }
    await waitFor(() => expect(screen.getByLabelText("fatal")).toBeDefined());
    expect(diagnostic).toHaveBeenCalledWith({ scope: "controller", phase: "state", category: "state", cause });
    expect(fatal.model.capabilities.retry).toBe(false);
    act(() => { fatal.actions.openExperience("two"); fatal.actions.retryFatal(); });
    expect(navigationStore.read().surface).toBe("home");
    expect(JSON.stringify(fatal.model)).not.toContain(cause.message);
  });

  it("contains navigation action writes and a throwing diagnostic sink, then permits explicit fatal recovery", async () => {
    const cause = new Error("private navigation write");
    const baseStore = createMemoryTripNavigationStore();
    let broken = true;
    const navigationStore = { ...baseStore, write: (next: Parameters<typeof baseStore.write>[0]) => { if (broken) throw cause; baseStore.write(next); } };
    const events: unknown[] = [];
    const retryFatal = () => { broken = false; };
    render(<TripController trip={trip} presentation={presentation()} navigationStore={navigationStore} clock={clock} recovery={{ retryFatal }} onDiagnostic={(event) => { events.push(event); throw new Error("hostile sink"); }} />);
    await hydrated();
    const actions = home.actions;
    act(() => actions.openExperience("two"));
    expect(screen.getByLabelText("fatal")).toBeDefined();
    expect(events).toEqual([{ scope: "controller", phase: "state", category: "state", cause }]);
    expect(fatal.actions).toBe(actions);
    act(() => actions.updateProgress({ kind: "completion", id: "task:pack", completed: true }));
    expect(window.localStorage.getItem("eternal-pose:trip-progress:v1:journey")).toBeNull();
    act(() => actions.retryFatal());
    await hydrated();
    expect(screen.getByLabelText("home")).toBeDefined();
    expect(home.actions).toBe(actions);
    act(() => actions.openExperience("two"));
    expect(baseStore.read()).toEqual({ surface: "experience", dayId: "two", ownerId: null });
  });

  it.each(["read", "subscribe", "unsubscribe"] as const)("classifies throwing navigation %s as state", async (operation) => {
    const cause = new Error(`private navigation ${operation}`);
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      if (!args.some((arg) => String(arg).includes(cause.message) || String(arg).includes("controller-state-failure"))) throw new Error("Unexpected React report");
    });
    const store = createMemoryTripNavigationStore();
    const navigationStore = {
      read: () => { if (operation === "read") throw cause; return store.read(); },
      write: (next: Parameters<typeof store.write>[0]) => store.write(next),
      subscribe: (listener: () => void) => {
        if (operation === "subscribe") throw cause;
        const unsubscribe = store.subscribe(listener);
        return () => { unsubscribe(); if (operation === "unsubscribe") throw cause; };
      },
    };
    const diagnostic = vi.fn();
    const views = presentation();
    const { rerender } = render(<TripController trip={trip} presentation={views} navigationStore={navigationStore} clock={clock} onDiagnostic={diagnostic} />);
    if (operation === "unsubscribe") {
      await hydrated();
      rerender(<TripController trip={null} presentation={views} onDiagnostic={diagnostic} />);
    }
    await waitFor(() => expect(screen.getByLabelText("fatal")).toBeDefined());
    expect(diagnostic).toHaveBeenCalledWith({ scope: "controller", phase: "state", category: "state", cause });
    expect(fatal.model.category).toBe("state");
  });

  it("routes a later clock tick failure through the state diagnostic boundary", async () => {
    vi.useFakeTimers();
    const cause = new Error("private later clock failure");
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      if (!args.some((arg) => String(arg).includes(cause.message) || String(arg).includes("controller-state-failure"))) throw new Error("Unexpected React report");
    });
    let broken = false;
    const diagnostic = vi.fn();
    try {
      render(<TripController trip={trip} presentation={presentation()} clock={() => { if (broken) throw cause; return clock(); }} onDiagnostic={diagnostic} />);
      await act(async () => { await Promise.resolve(); vi.runAllTicks(); });
      expect(screen.getByLabelText("home")).toBeDefined();
      broken = true;
      act(() => { vi.advanceTimersByTime(60_000); });
      expect(screen.getByLabelText("fatal")).toBeDefined();
      expect(diagnostic).toHaveBeenCalledWith({ scope: "controller", phase: "state", category: "state", cause });
    } finally { vi.useRealTimers(); }
  });

  it.each(["missing-configuration", "loader-failed"] as const)("keeps valid content on Home with sanitized %s notice", async (reason) => {
    render(<TripController trip={trip} presentation={presentation()} clock={clock} providerBootstrap={{ map: { status: "unavailable", reason, retryable: false, diagnostic: "secret" } }} />);
    await hydrated();
    expect(home.model.providers.map).toEqual({ status: "unavailable", reason, retryable: false });
    expect(screen.queryByLabelText("setup")).toBeNull();
  });

  it("selects Setup before adapter startup and pairs retry capability with committed handlers", () => {
    const createMap = vi.fn(() => { throw new Error("must not start"); });
    const views = presentation();
    const retry = vi.fn();
    const { rerender } = render(<TripController trip={null} presentation={views} runtime={{ createMap }} />);
    const actions = setup.actions;
    expect(setup.model).toEqual({ issues: [{ kind: "missing-trip", copyKey: "setup.missingTrip" }], capabilities: { retry: false } });
    act(() => actions.retrySetup());
    rerender(<TripController trip={null} presentation={views} recovery={{ retrySetup: retry }} />);
    expect(setup.actions).toBe(actions);
    expect(setup.model.capabilities.retry).toBe(true);
    act(() => actions.retrySetup());
    expect(retry).toHaveBeenCalledTimes(1);
    expect(createMap).not.toHaveBeenCalled();
  });

  it("reports invalid content before the sanitized Setup model and contains hostile sinks", () => {
    const events: unknown[] = [];
    const views = presentation();
    const Setup = views.SetupRequired;
    views.SetupRequired = (props) => { expect(events.length).toBeGreaterThan(0); return <Setup {...props} />; };
    render(<TripController trip={{ ...trip, timezone: "private-invalid-zone" }} presentation={views} onDiagnostic={(event) => { events.push(event); throw new Error("hostile sink"); }} />);
    expect(events[0]).toMatchObject({ scope: "controller", phase: "validation", category: "state" });
    expect(setup.model.issues[0]).toMatchObject({ kind: "invalid-trip", copyKey: "setup.invalidTrip" });
    expect(JSON.stringify(setup.model)).not.toContain("private-invalid-zone");
  });

  it.each(["state", "render"] as const)("normalizes %s failures before Fatal and pairs retry", async (phase) => {
    const cause = new Error("private controller detail");
    const report = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      if (!args.some((arg) => arg === cause || String(arg).includes("private controller detail") || String(arg).includes("controller-state-failure"))) throw new Error("Unexpected React error report");
    });
    const events: unknown[] = [];
    const views = presentation();
    if (phase === "render") views.Home = () => { throw cause; };
    let actions: TripActions | undefined;
    const Loading = views.Loading;
    views.Loading = (props) => { actions = props.actions; return <Loading {...props} />; };
    const Fatal = views.FatalError;
    views.FatalError = (props) => { expect(events.length).toBeGreaterThan(0); return <Fatal {...props} />; };
    const retry = vi.fn();
    render(<TripController trip={trip} presentation={views} clock={phase === "state" ? () => { throw cause; } : clock} recovery={{ retryFatal: retry }} onDiagnostic={(event) => { events.push(event); }} />);
    await waitFor(() => expect(screen.getByLabelText("fatal")).toBeDefined());
    expect(events[0]).toEqual({ scope: "controller", phase, category: phase, cause });
    expect(fatal.model.category).toBe(phase);
    expect(JSON.stringify(fatal.model)).not.toContain(cause.message);
    if (actions) expect(fatal.actions).toBe(actions);
    act(() => fatal.actions.retryFatal());
    expect(retry).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalled();
  });
});
