import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../App";
import { candidateMapOwnerId, decodeMapPlaceOwnerId, nodeMapOwnerId } from "@laugh-tale-island/core";
import { tripProgressStorageKey } from "../../controllers/progress-storage";
import { FakeMapAdapter } from "../../providers/fake/FakeMapAdapter";
import type { Trip } from "@laugh-tale-island/core";
import { checklistCompletionKey, emptyTripProgress, taskCompletionKey, type TripProgressV1 } from "@laugh-tale-island/core";
import { TripHome } from "./TripHome";

function appTrip(): Trip {
  return {
    id: "home-trip",
    title: "Synthetic Island Escape",
    timezone: "Etc/UTC",
    startDate: "2040-06-12",
    endDate: "2040-06-13",
    days: [
      {
        id: "day-one",
        date: "2040-06-12",
        title: "Harbor day",
        summary: "Harbor map-first itinerary",
        nodes: [
          {
            id: "hotel",
            dayId: "day-one",
            kind: "lodging",
            title: "Harbor Hotel",
            timing: { certainty: "unknown" },
            optionality: "core",
            place: {
              name: "Harbor Hotel",
              coordinates: { lat: 25.03, lng: 121.51 },
              certainty: "confirmed",
            },
            payload: { role: "base" },
          },
          {
            id: "meal",
            dayId: "day-one",
            kind: "dining",
            title: "Lunch choices",
            timing: { start: "12:00", certainty: "suggested" },
            optionality: "candidate",
            payload: { candidateGroupId: "meal-options" },
          },
          {
            id: "shop",
            dayId: "day-one",
            kind: "shopping",
            title: "Supply shop",
            timing: { certainty: "unknown" },
            optionality: "core",
            place: {
              name: "Supply shop",
              coordinates: { lat: 25.06, lng: 121.54 },
              certainty: "confirmed",
            },
            payload: {
              items: [
                {
                  id: "camera",
                  title: "Travel camera",
                  initialStatus: "purchased",
                  priority: "must",
                },
                { id: "memory-card", title: "Memory card", priority: "nice" },
              ],
            },
          },
        ],
      },
      {
        id: "day-two",
        date: "2040-06-13",
        title: "Clifftop day",
        nodes: [
          {
            id: "clifftop",
            dayId: "day-two",
            kind: "sightseeing",
            title: "Clifftop walk",
            timing: { start: "10:00", certainty: "suggested" },
            optionality: "core",
            place: {
              name: "Clifftop walk",
              coordinates: { lat: 25.07, lng: 121.55 },
              certainty: "confirmed",
            },
            payload: {},
          },
        ],
      },
    ],
    routes: [],
    candidateGroups: [
      {
        id: "meal-options",
        parentNodeId: "meal",
        mode: "single",
        defaultOptionId: "meal-a",
        options: [
          {
            id: "meal-a",
            title: "A",
            place: {
              name: "Garden kitchen",
              coordinates: { lat: 25.04, lng: 121.52 },
              certainty: "candidate",
            },
          },
          {
            id: "meal-b",
            title: "B",
            place: {
              name: "Canal counter",
              coordinates: { lat: 25.05, lng: 121.53 },
              certainty: "candidate",
            },
          },
        ],
      },
    ],
    reservations: [
      {
        id: "confirmed-reservation",
        title: "Observatory admission",
        ownerId: "clifftop",
        booking: {
          status: "confirmed",
          reference: "PRIVATE-HOME-REF",
          url: "https://example.test/observatory",
        },
      },
      {
        id: "pending-reservation",
        title: "Meal request",
        ownerId: "meal-a",
        booking: { status: "pending" },
      },
      {
        id: "unbooked-reservation",
        title: "Harbor cruise",
        ownerId: "hotel",
        booking: { status: "none" },
      },
    ],
    tasks: [
      {
        id: "prepare-documents",
        title: "Prepare documents",
        scope: "pretrip",
        note: "Keep originals in the day bag.",
        children: [
          { id: "pack-passport", title: "Pack passport" },
          { id: "save-confirmations", title: "Save confirmations" },
        ],
      },
      {
        id: "download-map",
        title: "Download offline map",
        scope: "pretrip",
      },
      {
        id: "day-reminder",
        title: "Refill water bottle",
        scope: "day",
        dayId: "day-one",
        note: "Use the fountain beside the lobby.",
      },
    ],
  };
}

let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function mountBaseStyles(): void {
  const style = document.createElement("style");
  style.dataset.task9TestStyle = "true";
  style.textContent = readFileSync("src/presentation/styles/base.css", "utf8");
  document.head.append(style);
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  originalShowModal = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    "showModal",
  );
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
      this.querySelector<HTMLElement>("button, input, select")?.focus();
    }),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    }),
  });
});

afterEach(() => {
  cleanup();
  document.querySelectorAll('style[data-task9-test-style="true"]').forEach((style) => style.remove());
  vi.restoreAllMocks();
  if (originalShowModal === undefined) {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  } else {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  }
  if (originalClose === undefined) {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  } else {
    Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  }
});

describe("TripHome", () => {
  it("stays deliberately small while showing identity, dates, pretrip progress, reservations, and one day action", async () => {
    mountBaseStyles();
    const user = userEvent.setup();
    const trip = appTrip();
    const progress: TripProgressV1 = {
      ...emptyTripProgress(),
      completedIds: [checklistCompletionKey("pack-passport")],
    };
    const onCompletedChange = vi.fn();
    const onEnterDay = vi.fn();
    render(
      <TripHome
        trip={trip}
        progress={progress}
        onCompletedChange={onCompletedChange}
        onEnterDay={onEnterDay}
      />,
    );

    expect(screen.getByRole("heading", { name: "Synthetic Island Escape" })).toBeVisible();
    const dates = screen.getAllByText(/2040\/06\/1[23]/);
    expect(dates).toHaveLength(2);
    expect(dates[0]?.closest("time")).toHaveAttribute("datetime", "2040-06-12");
    expect(dates[1]?.closest("time")).toHaveAttribute("datetime", "2040-06-13");
    expect(screen.getByText("1 / 4 旅前事項完成")).toBeVisible();
    expect(screen.getByText("1 已確認 · 1 待確認 · 1 未訂位")).toBeVisible();
    expect(screen.getByText("Keep originals in the day bag.")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /進入 Day/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "進入 Day 1 · Harbor day" })).toBeVisible();
    expect(screen.getByRole("button", { name: "進入 Day 2 · Clifftop day" })).toBeVisible();
    expect(screen.queryByText("Refill water bottle")).not.toBeInTheDocument();
    expect(screen.queryByText("Harbor Hotel")).not.toBeInTheDocument();
    expect(screen.queryByText("Lunch choices")).not.toBeInTheDocument();
    expect(screen.queryByText("Clifftop walk")).not.toBeInTheDocument();
    expect(screen.queryByText("PRIVATE-HOME-REF")).not.toBeInTheDocument();
    const home = screen.getByTestId("trip-home");
    const dayNavigation = screen.getByRole("navigation", { name: "進入每日行程" });
    const firstDayAction = screen.getByRole("button", { name: "進入 Day 1 · Harbor day" });
    expect(getComputedStyle(home).display).toBe("grid");
    expect(getComputedStyle(dayNavigation).display).toBe("grid");
    expect(getComputedStyle(firstDayAction).display).toBe("grid");

    const disclosure = screen.getByRole("button", { name: "顯示 Prepare documents 子項" });
    expect(screen.queryByRole("button", { name: /Download offline map 子項/ })).not.toBeInTheDocument();
    await user.click(disclosure);
    expect(screen.getByLabelText("Pack passport")).toBeChecked();
    await user.click(screen.getByLabelText("Download offline map"));
    expect(onCompletedChange).toHaveBeenCalledWith(
      taskCompletionKey("download-map"),
      true,
    );

    await user.click(screen.getByRole("button", { name: "進入 Day 2 · Clifftop day" }));
    expect(onEnterDay).toHaveBeenCalledWith("day-two");
  });
});

describe("App home/day progress integration", () => {
  it("gates progress-bound surfaces until the exact trip key hydrates, including key switches", async () => {
    const alpha = appTrip();
    const beta = structuredClone(alpha);
    beta.id = "home-trip-beta";
    beta.title = "Second Synthetic Escape";
    window.localStorage.setItem(
      tripProgressStorageKey(alpha.id),
      JSON.stringify({
        ...emptyTripProgress(),
        completedIds: [taskCompletionKey("download-map")],
      } satisfies TripProgressV1),
    );
    const adapterFactory = () => new FakeMapAdapter();
    const { rerender } = render(
      <App
        tripOverride={alpha}
        adapterFactory={adapterFactory}
        clock={() => "2040-06-12T11:30:00Z"}
      />,
    );

    expect(screen.queryByTestId("trip-home")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "正在讀取旅行進度" })).toBeVisible();
    expect(await screen.findByTestId("trip-home")).toBeVisible();
    expect(screen.getByLabelText("Download offline map")).toBeChecked();

    rerender(
      <App
        tripOverride={beta}
        adapterFactory={adapterFactory}
        clock={() => "2040-06-12T11:30:00Z"}
      />,
    );
    expect(screen.queryByTestId("trip-home")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "正在讀取旅行進度" })).toBeVisible();
    expect(await screen.findByTestId("trip-home")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Second Synthetic Escape" })).toBeVisible();
    expect(screen.getByLabelText("Download offline map")).not.toBeChecked();
  });

  it.each(["read", "write"] as const)(
    "keeps %s failures usable in memory and surfaces a quiet persistence hint",
    async (failureMode) => {
      if (failureMode === "read") {
        vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
          throw new DOMException("read blocked", "SecurityError");
        });
      } else {
        vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
          throw new DOMException("write blocked", "QuotaExceededError");
        });
      }
      const user = userEvent.setup();
      render(
        <App
          tripOverride={appTrip()}
          adapterFactory={() => new FakeMapAdapter()}
          clock={() => "2040-06-12T11:30:00Z"}
        />,
      );

      expect(await screen.findByTestId("trip-home")).toBeVisible();
      await user.click(screen.getByLabelText("Download offline map"));
      expect(screen.getByLabelText("Download offline map")).toBeChecked();
      expect(
        await screen.findByRole("status", { name: "旅行進度僅保留在此頁面" }),
      ).toBeVisible();
    },
  );

  it("keeps candidate numbers tied to authored day order when earlier optional stops are skipped", async () => {
    const user = userEvent.setup();
    const trip = appTrip();
    const firstNode = trip.days[0]?.nodes[0];
    if (firstNode === undefined) {
      throw new Error("Candidate numbering fixture needs a first node");
    }
    firstNode.optionality = "optional";
    window.localStorage.setItem(
      tripProgressStorageKey(trip.id),
      JSON.stringify({
        ...emptyTripProgress(),
        skippedNodeIds: [firstNode.id],
      } satisfies TripProgressV1),
    );

    render(
      <App
        tripOverride={trip}
        adapterFactory={() => new FakeMapAdapter()}
        clock={() => "2040-06-12T11:30:00Z"}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "進入 Day 1 · Harbor day" }));
    await user.click(await screen.findByRole("button", { name: "重新比較 Lunch choices" }));

    expect(screen.getByRole("radio", { name: "2A · A" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "2B · B" })).not.toBeChecked();
  });

  it("mounts the persistent map-first day, keeps pretrip out of it, and preserves day tasks across back navigation", async () => {
    const user = userEvent.setup();
    const trip = appTrip();
    const adapter = new FakeMapAdapter();
    render(
      <App
        tripOverride={trip}
        adapterFactory={() => adapter}
        clock={() => "2040-06-12T11:30:00Z"}
      />,
    );

    expect(await screen.findByTestId("trip-home")).toBeVisible();
    await user.click(await screen.findByRole("button", { name: "進入 Day 1 · Harbor day" }));
    expect(await screen.findByTestId("trip-experience")).toBeVisible();
    await waitFor(() => expect(adapter.mountCalls).toHaveLength(1));
    expect(screen.queryByText("Prepare documents")).not.toBeInTheDocument();
    expect(screen.getByText("3 stops")).toBeVisible();
    expect(adapter.renderCalls.at(-1)?.places.map(({ label }) => label)).toEqual([
      "Harbor Hotel",
      "A",
      "Supply shop",
    ]);

    const taskTrigger = screen.getByRole("button", { name: "開啟 Harbor day 當日事項" });
    expect(taskTrigger.closest(".itinerary-timeline")).toBeNull();
    await user.click(taskTrigger);
    const taskDialog = screen.getByRole("dialog", { name: "Harbor day 當日事項" });
    await user.click(within(taskDialog).getByLabelText("Refill water bottle"));
    await user.click(within(taskDialog).getByRole("button", { name: "關閉當日事項" }));

    await user.click(screen.getByRole("button", { name: "回到旅行首頁" }));
    expect(screen.getByTestId("trip-home")).toBeVisible();
    await user.click(await screen.findByRole("button", { name: "進入 Day 1 · Harbor day" }));
    await user.click(screen.getByRole("button", { name: "開啟 Harbor day 當日事項" }));
    expect(
      within(screen.getByRole("dialog", { name: "Harbor day 當日事項" })).getByLabelText(
        "Refill water bottle",
      ),
    ).toBeChecked();
    await waitFor(() => {
      const persisted = window.localStorage.getItem(tripProgressStorageKey(trip.id));
      expect(persisted).not.toBeNull();
      expect((JSON.parse(persisted ?? "null") as TripProgressV1).completedIds).toContain(
        taskCompletionKey("day-reminder"),
      );
    });
  });

  it("drives candidate preview and shopping status through the existing full map without nested controls", async () => {
    const user = userEvent.setup();
    const trip = appTrip();
    const adapter = new FakeMapAdapter();
    render(
      <App
        tripOverride={trip}
        adapterFactory={() => adapter}
        clock={() => "2040-06-12T11:30:00Z"}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "進入 Day 1 · Harbor day" }));
    await waitFor(() => expect(adapter.renderCalls.length).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: "約 12:00 A" }));
    await user.click(screen.getByRole("button", { name: "重新比較 Lunch choices" }));
    expect(screen.getAllByRole("region", { name: "Trip map" })).toHaveLength(1);
    await waitFor(() =>
      expect(adapter.renderCalls.at(-1)?.places.map(({ ownerId }) => ownerId)).toEqual([
        nodeMapOwnerId("hotel"),
        nodeMapOwnerId("shop"),
        candidateMapOwnerId("meal-a"),
        candidateMapOwnerId("meal-b"),
      ]),
    );
    act(() => adapter.emitPlaceSelect(candidateMapOwnerId("meal-b")));
    const radioB = await screen.findByRole("radio", { name: "2B · B" });
    expect(radioB).toBeChecked();
    await user.click(screen.getByRole("button", { name: "確認選擇 B" }));
    await waitFor(() =>
      expect(adapter.renderCalls.at(-1)?.places.map(({ ownerId }) => ownerId)).toEqual([
        nodeMapOwnerId("hotel"),
        nodeMapOwnerId("meal"),
        nodeMapOwnerId("shop"),
      ]),
    );

    await user.click(screen.getByRole("button", { name: "時間未定 Supply shop" }));
    const camera = screen.getByRole("combobox", { name: "Travel camera 採買狀態" });
    const memoryCard = screen.getByRole("combobox", { name: "Memory card 採買狀態" });
    expect(camera).toHaveValue("purchased");
    expect(memoryCard).toHaveValue("pending");
    await user.selectOptions(memoryCard, "skipped");
    expect(screen.getByText("2 / 2 complete")).toBeVisible();
    expect(document.querySelectorAll("button button, button select, select button")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "回到旅行首頁" }));
    await user.click(screen.getByRole("button", { name: "進入 Day 1 · Harbor day" }));
    await user.click(screen.getByRole("button", { name: "時間未定 Supply shop" }));
    expect(screen.getByRole("combobox", { name: "Memory card 採買狀態" })).toHaveValue(
      "skipped",
    );
  });

  it("discards stale candidate preview intent when leaving and reopening the same decision", async () => {
    const user = userEvent.setup();
    const adapter = new FakeMapAdapter();
    render(
      <App
        tripOverride={appTrip()}
        adapterFactory={() => adapter}
        clock={() => "2040-06-12T11:30:00Z"}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "進入 Day 1 · Harbor day" }));
    await user.click(screen.getByRole("button", { name: "約 12:00 A" }));
    await user.click(screen.getByRole("button", { name: "重新比較 Lunch choices" }));
    act(() => adapter.emitPlaceSelect(candidateMapOwnerId("meal-b")));
    await waitFor(() => expect(screen.getByRole("radio", { name: "2B · B" })).toBeChecked());

    await user.click(screen.getByRole("button", { name: "時間未定 Supply shop" }));
    expect(screen.queryByRole("group", { name: "Lunch choices" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "約 12:00 A" }));
    const reopen = screen.getByRole("button", { name: "重新比較 Lunch choices" });
    const fitsBeforeReopen = adapter.fitCalls.length;
    const focusBeforeReopen = adapter.focusCalls.length;
    await user.click(reopen);

    const radioA = screen.getByRole("radio", { name: "2A · A" });
    const radioB = screen.getByRole("radio", { name: "2B · B" });
    expect(radioA).toBeChecked();
    expect(radioB).not.toBeChecked();
    expect(reopen).toHaveFocus();
    await waitFor(() => expect(adapter.fitCalls).toHaveLength(fitsBeforeReopen + 1));
    expect(adapter.focusCalls).toHaveLength(focusBeforeReopen);
    expect(adapter.renderCalls.at(-1)?.selectedPlaceOwnerId).toBe(
      candidateMapOwnerId("meal-a"),
    );
    expect(
      adapter.renderCalls.at(-1)?.places
        .filter(({ ownerId }) => decodeMapPlaceOwnerId(ownerId)?.kind === "candidate")
        .map(({ ownerId, tone }) => ({ ownerId, tone })),
    ).toEqual([
      { ownerId: candidateMapOwnerId("meal-a"), tone: "selected" },
      { ownerId: candidateMapOwnerId("meal-b"), tone: "candidate" },
    ]);
  });

  it("keeps candidate comparison inside the existing camera and route-owner boundaries without provider fetches", async () => {
    const user = userEvent.setup();
    const trip = appTrip();
    trip.routes = [
      {
        id: "hotel--meal",
        dayId: "day-one",
        fromNodeId: "hotel",
        toNodeId: "meal",
        mode: "walking",
        source: "manual",
        certainty: "suggested",
        durationMinutes: 8,
        navigation: { origin: "Harbor Hotel", destination: "Lunch" },
      },
      {
        id: "meal--shop",
        dayId: "day-one",
        fromNodeId: "meal",
        toNodeId: "shop",
        mode: "walking",
        source: "manual",
        certainty: "suggested",
        durationMinutes: 6,
        navigation: { origin: "Lunch", destination: "Supply shop" },
      },
    ];
    const adapter = new FakeMapAdapter();
    const adapterFactory = vi.fn(() => adapter);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(
      <App
        tripOverride={trip}
        adapterFactory={adapterFactory}
        clock={() => "2040-06-12T11:30:00Z"}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "進入 Day 1 · Harbor day" }));
    await waitFor(() => expect(adapter.mountCalls).toHaveLength(1));
    expect(adapterFactory).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      [...document.querySelectorAll<HTMLElement>("[data-route-owner]")].map(
        (element) => element.dataset.routeOwner,
      ),
    ).toEqual(["hotel--meal", "meal--shop"]);

    const fitsBeforeComparison = adapter.fitCalls.length;
    await user.click(screen.getByRole("button", { name: "重新比較 Lunch choices" }));
    await waitFor(() =>
      expect(adapter.fitCalls.length).toBeGreaterThan(fitsBeforeComparison),
    );
    expect(adapter.fitCalls.at(-1)).toEqual([
      nodeMapOwnerId("hotel"),
      nodeMapOwnerId("shop"),
      candidateMapOwnerId("meal-a"),
      candidateMapOwnerId("meal-b"),
    ]);

    const fitsAfterExpansion = adapter.fitCalls.length;
    act(() => adapter.emitPlaceSelect(candidateMapOwnerId("meal-b")));
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "2B · B" })).toBeChecked(),
    );
    expect(adapter.fitCalls).toHaveLength(fitsAfterExpansion);
    await user.click(screen.getByRole("button", { name: "確認選擇 B" }));
    await waitFor(() =>
      expect(adapter.fitCalls.length).toBeGreaterThan(fitsAfterExpansion),
    );
    expect(adapter.fitCalls.at(-1)).toEqual([
      nodeMapOwnerId("hotel"),
      nodeMapOwnerId("meal"),
      nodeMapOwnerId("shop"),
    ]);
    expect(
      [...document.querySelectorAll<HTMLElement>("[data-route-owner]")].map(
        (element) => element.dataset.routeOwner,
      ),
    ).toEqual(["hotel--meal", "meal--shop"]);
    expect(adapterFactory).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
