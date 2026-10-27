// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { FloatingDayHeader } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/experience/FloatingDayHeader.js";
import { ItineraryTimeline } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/timeline/ItineraryTimeline.js";
import { catalog } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js";
import { repeatsOwnerTitle, selectOwnerDisplay } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/details/select-owner-display.js";
import { CandidateDecision } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/details/CandidateDecision.js";
import { controls, model, node, route } from "../fixtures/oak-washi/row-cases.js";

afterEach(cleanup);

test.each([
  [" 合成紙品  商店 ", "合成紙品 商店", true],
  ["合成紙品 商店限定商品", "合成紙品 商店", false],
  ["Store", "store", false],
])("title equality preserves distinct authored text: %s", (title, ownerTitle, expected) => {
  expect(repeatsOwnerTitle(title, ownerTitle)).toBe(expected);
});

test("equivalent owner, single shopping item and reservation titles display once without losing authored facts", () => {
  const stop = node({ title: "合成紙品 商店", states: ["selected"], details: ["合成紙品 商店", "合成紙品 商店限定商品"], facts: { kind: "shopping", items: [{ id: "tea", title: " 合成紙品  商店 ", note: "保留購物清單", status: "pending" }] }, capabilities: { ...node().capabilities, shopping: true, booking: true } });
  const supplied = model({ timeline: [stop], reservations: [{ id: "hold", ownerId: stop.ownerId, title: " 合成紙品  商店 ", booking: { status: "confirmed", reference: "REF-81" } }] });
  const before = JSON.stringify(supplied);
  const view = render(<ItineraryTimeline {...controls()} model={supplied} />);
  expect(view.container.querySelectorAll(".oak-row-title, .oak-shopping-title, .oak-reservation h4")).toHaveLength(1);
  expect(view.getByRole("combobox", { name: "合成紙品 商店 · 狀態" })).not.toBeNull();
  expect(view.container.textContent).toContain("REF-81");
  expect(view.container.textContent).toContain("保留購物清單");
  expect(view.container.textContent).toContain("合成紙品 商店限定商品");
  expect(JSON.stringify(supplied)).toBe(before);
  view.rerender(<ItineraryTimeline {...controls()} model={model({ timeline: [{ ...stop, facts: { kind: "shopping", items: [
    { id: "tea", title: "合成紙品 商店", status: "pending" },
    { id: "cup", title: "限定杯子", status: "pending" },
  ] } }] })} />);
  expect([...view.container.querySelectorAll(".oak-shopping-title")].map(item => item.textContent)).toEqual(["合成紙品 商店", "限定杯子"]);
});

test("browse comparison exposes facts without preview or confirm actions", () => {
  const c = controls();
  const view = render(<CandidateDecision {...c} decision={{ groupId: "browse", parentOwnerId: "museum", mode: "browse", open: true, sessionId: 1,
    options: [{ id: "first", ordinal: "A", title: "候選地點", selected: false, draft: false, booking: { status: "pending", reference: "KEEP-1" } }],
    capabilities: { previewOptionIds: [], cancel: true, confirm: false, reopen: false } }} />);
  expect(view.queryByRole("button", { name: /預覽|確認/ })).toBeNull();
  expect(view.container.querySelector(".oak-candidate-option")?.tagName).toBe("DIV");
  expect(view.container.textContent).toContain("KEEP-1");
});

test("candidate comparison keeps an identical place title once while retaining certainty", () => {
  const c = controls();
  const view = render(<CandidateDecision actions={c.actions} bindings={c.bindings} decision={{
    groupId: "dinner", parentOwnerId: "evening", mode: "single", open: true, sessionId: 1,
    options: [{ id: "first", ordinal: "A", title: "合成餐館 海岸分店", selected: true, draft: true,
      place: { label: "合成餐館 海岸分店", certainty: "unverified", resolution: { status: "unresolved", reason: "not-reviewed" } } }],
    capabilities: { previewOptionIds: ["first"], cancel: true, confirm: true, reopen: false },
  }} />);
  const option = view.container.querySelector(".oak-candidate-option")!;
  expect(option.textContent?.split("合成餐館 海岸分店")).toHaveLength(2);
  expect(option.textContent).toContain(catalog.certainty.unverified);
  expect(option.textContent).toContain(catalog.facts.unverifiedLocation);
});

test("owner display removes only exact repeated title, reservation and unresolved lines", () => {
  expect(selectOwnerDisplay({ title: "合成紙品", details: [" 合成紙品 ", catalog.facts.unverifiedLocation, "當日整理券", "10:00 入場", "訂單 REF-81", "合成紙品限定商品"], reservationTitles: ["當日整理券"], unresolved: true, unresolvedLabel: catalog.facts.unverifiedLocation }))
    .toEqual({ details: ["10:00 入場", "訂單 REF-81", "合成紙品限定商品"], showUnresolved: true });
  expect(selectOwnerDisplay({ title: "合成紙品", details: [catalog.facts.unverifiedLocation], reservationTitles: [], unresolved: false, unresolvedLabel: catalog.facts.unverifiedLocation }))
    .toEqual({ details: [catalog.facts.unverifiedLocation], showUnresolved: false });
});

test("day heading remains complete while route context and trip-local time stay available", () => {
  const c = controls();
  const longTitle = "合成港口 → 海岸步道 → 閱讀室 Meridian morning walk";
  const view = render(<FloatingDayHeader model={{
    trip: { title: "Synthetic Meridian journey" },
    day: { id: "day", title: longTitle, date: "2040-06-12", ordinal: 2, routeLabel: "HARBOR → COAST → READING ROOM" },
    days: [{ id: "day", date: "2040-06-12", title: longTitle, ordinal: 2 }],
    clock: { instant: "2040-06-12T10:00:00Z", timezone: "Etc/UTC" },
    header: { expanded: false, revision: 0, transition: null }, motion: "reduced",
    capabilities: { selectDayIds: ["day"] },
  }} actions={c.actions} />);
  const heading = view.getByRole("heading", { level: 1 });
  expect(heading.textContent).toBe(longTitle);
  expect(heading.getAttribute("aria-label")).toContain("Synthetic Meridian journey");
  expect(heading.getAttribute("title")).toContain("HARBOR → COAST → READING ROOM");
  expect(document.getElementById(heading.getAttribute("aria-describedby") ?? "")?.textContent).toBe("HARBOR → COAST → READING ROOM");
  expect(view.container.querySelector(".oak-header-route")).toBeNull();
  expect(view.getByText(catalog.experience.tripTime).classList.contains("oak-clock-place")).toBe(true);
});

test("timed primary row scans time before one title, while route provenance stays in selected details", () => {
  const stop = node({ title: "合成港口地下街", timing: { start: "08:00", certainty: "fixed" } });
  const edge = route({ source: "manual", certainty: "unverified", authored: { summary: "步行到下一站" }, runtime: { status: "idle" }, selected: true });
  const view = render(<ItineraryTimeline {...controls()} model={model({
    timeline: [stop, { kind: "route", role: "connector", ownerId: "edge", routeId: "edge", states: ["selected"] }],
    routes: [edge],
  })} />);
  const primary = view.container.querySelector('[data-owner-id="museum"] .oak-row-selection')!;
  expect(primary.querySelectorAll(".oak-row-title")).toHaveLength(1);
  expect(primary.querySelector(".oak-row-time")?.textContent).toBe("08:00");
  expect([...primary.children].findIndex(child => child.classList.contains("oak-row-time"))).toBeLessThan([...primary.children].findIndex(child => child.classList.contains("oak-row-title")));
  const connector = view.container.querySelector('[data-owner-id="edge"]')!;
  expect(connector.querySelector(".oak-route-selection")?.textContent).toContain("步行到下一站");
  expect(connector.querySelector(".oak-route-selection")?.textContent).not.toContain(catalog.certainty.unverified);
  expect(connector.querySelector(".oak-route-details")?.textContent).toContain(catalog.certainty.unverified);
});

test("selected shopping stop keeps its child title and authored note together", () => {
  const shopping = node({ states: ["selected"], facts: { kind: "shopping", items: [{ id: "tea", title: "合成補給站", note: "先找測試紙張，再比較範例冊子", status: "pending" }] }, capabilities: { ...node().capabilities, shopping: true } });
  const view = render(<ItineraryTimeline {...controls()} model={model({ timeline: [shopping] })} />);
  const child = view.container.querySelector('[data-shopping-id="tea"]')!;
  expect(child.textContent).toContain("合成補給站");
  expect(child.textContent).toContain("先找測試紙張，再比較範例冊子");
  expect(view.container.querySelector(".oak-row-selection")?.textContent).not.toContain("先找測試紙張");
});
