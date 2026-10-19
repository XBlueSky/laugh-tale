// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, within, waitFor } from "@testing-library/react";
import { ItineraryTimeline } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/timeline/ItineraryTimeline.js";
import { catalog } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js";
import { TypeGlyph } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/timeline/SemanticMark.js";
import { capabilities, controls, factCases, model, node, openingCases, roleCases, route, routeCases } from "../fixtures/oak-washi/row-cases.js";

afterEach(cleanup);
describe("exhaustive rendered Oak row cases", () => {
  test("a kind-only transfer type glyph stays neutral", () => {
    const view = render(<TypeGlyph kind="transfer" />);
    expect(view.container.querySelector("svg.lucide-circle-question-mark")).not.toBeNull();
    expect(view.container.querySelector("svg.lucide-plane")).toBeNull();
  });
  test("preserves overnight offset strength and unknown timing semantics", () => {
    const overnight = node({ ownerId: "overnight", nodeId: "overnight", timing: { start: "23:00", end: "01:00", certainty: "fixed", dayOffset: 1 } });
    const unknown = node({ ownerId: "unknown", nodeId: "unknown", timing: { start: "13:00", certainty: "unknown" } });
    const view = render(<ItineraryTimeline {...controls()} model={model({ timeline: [overnight, unknown], capabilities: { ...capabilities, selectNodeIds: ["overnight", "unknown"] } })} />);
    const overnightTiming = view.container.querySelector('[data-owner-id="overnight"] .oak-row-time')!;
    expect(overnightTiming.textContent).toBe(`23:00${catalog.timing.nextDay} 1`);
    expect([...overnightTiming.childNodes].map(child => child.textContent)).toEqual(["23:00", `${catalog.timing.nextDay} 1`]);
    const overnightSelection = overnightTiming.closest(".oak-row-selection")!;
    expect(overnightSelection.querySelector(".oak-row-time-end")?.textContent).toBe(catalog.timing.end.replace("{time}", "01:00"));
    expect(overnightSelection.querySelector(".oak-row-time-certainty")?.textContent).toBe(catalog.timing.fixed);
    expect(overnightTiming.lastElementChild?.className).toBe("");
    const unknownTiming = view.container.querySelector('[data-owner-id="unknown"] .oak-row-time')!;
    expect(unknownTiming.textContent).toBe(catalog.timing.unknown);
    expect(unknownTiming.children).toHaveLength(0);
  });

  test("primary scan keeps time and title distinct from one secondary facts group", () => {
    const selected = node({ states: ["selected"], incomingRouteIds: ["edge"] });
    const view = render(<ItineraryTimeline {...controls()} model={model({ timeline: [selected], routes: [route()] })} showDetails={false} />);
    const summary = view.container.querySelector(".oak-primary-summary")!;
    expect(summary.querySelector('[data-scan="time"]')?.textContent).toContain("09:30");
    expect(summary.querySelector('[data-scan="title"]')?.textContent).toBe("City Museum");
    const secondary = summary.querySelector(".oak-primary-meta")!;
    expect(secondary).not.toBeNull();
    expect(secondary.querySelector('[data-scan="context"]')?.textContent).toContain(catalog.types.sightseeing);
    expect(secondary.querySelector('[data-scan="status"]')).not.toBeNull();
    expect(summary.querySelectorAll(".oak-primary-meta")).toHaveLength(1);
  });

  test.each([
    { mode: "bus" as const, glyph: "bus" },
    { mode: "rail" as const, glyph: "train-front" },
    { mode: "flight" as const, glyph: "plane" },
    { mode: "unknown" as const, glyph: "circle-question-mark" },
  ])("journey $mode mark does not imply a different travel mode", ({ mode, glyph }) => {
    const view = render(<ItineraryTimeline {...controls()} model={model({ timeline: [node({ role: "journey", facts: { kind: "transfer", mode }, markerMode: "none" })] })} />);
    expect(view.container.querySelector(`.oak-semantic-mark svg.lucide-${glyph}`)).not.toBeNull();
    expect(view.container.querySelector(".oak-semantic-mark svg.lucide-footprints")).toBeNull();
  });
  test("a custom journey has a neutral semantic mark without an inferred travel mode", () => {
    const view = render(<ItineraryTimeline {...controls()} model={model({ timeline: [node({ role: "journey", facts: { kind: "custom", customKind: "Unspecified passage", data: {} }, markerMode: "none" })] })} />);
    expect(view.container.querySelector(".oak-semantic-mark svg.lucide-circle-question-mark")).not.toBeNull();
  });
  test("unknown transfer details retain absence of terminal and use localized unknown movement", () => {
    const view = render(<ItineraryTimeline {...controls()} model={model({ timeline: [node({ role: "journey", states: ["selected"], facts: { kind: "transfer", mode: "unknown" }, markerMode: "none" })] })} />);
    const details = view.container.querySelector("[data-details-owner]")!;
    expect(details.textContent).toContain(catalog.routes.unknown);
    expect(details.textContent).not.toContain(catalog.routes.flight);
    expect(details.textContent).not.toContain(catalog.facts.terminal);
    expect(details.textContent).not.toContain("T2");
  });
  test.each(roleCases)("renders the physical $name role", ({ name, entry }) => {
    const control = controls();
    const view = render(<ItineraryTimeline {...control} model={model({ timeline: [entry], routes: [route()], capabilities: { ...capabilities, selectNodeIds: ["museum-node", "a", "b"] } })} />);
    const row = view.container.querySelector(`[data-owner-id="${entry.ownerId}"]`)!;
    expect(row.getAttribute("data-role")).toBe(name);
    expect(view.container.querySelectorAll(".oak-row-ordinal")).toHaveLength(name === "primary" ? 1 : 0);
    if (name === "base") expect(row.querySelector("svg.lucide-bed-double")).not.toBeNull();
    if (entry.kind === "node") expect(within(row as HTMLElement).getAllByText(entry.title)).toHaveLength(1);
    if (name === "logistics-group") {
      expect(row.textContent).toContain(catalog.timeline.logisticsGroup);
      expect(row.textContent).not.toContain("timeline.logisticsGroup");
      expect([...row.querySelectorAll("[data-owner-id]")].map(child => child.getAttribute("data-owner-id"))).toEqual(["child-b", "child-a"]);
      expect(view.container.querySelectorAll('[data-owner-id="child-b"]')).toHaveLength(1);
      fireEvent.click(within(row as HTMLElement).getByRole("button", { name: /Collect tickets/ })); expect(control.actions.selectNode).toHaveBeenCalledWith("b");
      fireEvent.click(within(row as HTMLElement).getByRole("button", { name: /Leave luggage/ })); expect(control.actions.selectNode).toHaveBeenCalledWith("a");
    }
  });
  test.each(factCases)("preserves all authored $name facts under their selected owner", async ({ facts, text }) => {
    const control = controls(); const selected = node({ states: ["selected"], facts, sourceKind: "intentionally-not-the-facts-kind", capabilities: { ...node().capabilities, shopping: true, complete: true } });
    const view = render(<ItineraryTimeline {...control} model={model({ timeline: [selected] })} />);
    const details = view.container.querySelector('[data-details-owner="museum"]')!;
    for (const value of text) expect(details.textContent).toContain(value);
    expect(details.textContent).not.toContain("[object Object]"); expect(details.querySelector("b")).toBeNull();
    if (facts.kind === "lodging" || facts.kind === "logistics") {
      const rows = [...details.querySelectorAll("[data-checklist-id]")]; expect(rows.map(row => row.textContent)).toEqual([expect.stringContaining("Keep passport ready"), expect.stringContaining("Download tickets")]);
      expect(rows.map(row => row.querySelector("input")?.checked)).toEqual([false, true]);
      fireEvent.click(rows[0].querySelector("input")!); expect(control.actions.updateProgress).toHaveBeenCalledWith({ kind: "completion", id: "pack-a", completed: true });
    }
    if (facts.kind === "shopping") {
      const rows = [...details.querySelectorAll("[data-shopping-id]")]; expect(rows.map(row => row.getAttribute("data-status"))).toEqual(["pending", "purchased", "unavailable", "skipped"]);
      expect(rows[0].textContent).toContain(catalog.facts.must); expect(rows[1].textContent).toContain(catalog.facts.nice);
      fireEvent.change(rows[0].querySelector("select")!, { target: { value: "purchased" } }); expect(control.actions.updateProgress).toHaveBeenCalledWith({ kind: "shopping-status", itemId: "tea", status: "purchased" });
    }
    if (facts.kind === "custom") expect(details.textContent).toContain(catalog.facts.false);
    view.rerender(<ItineraryTimeline {...control} model={model({ timeline: [selected], capabilities: { ...capabilities, progress: { ...capabilities.progress, completionIds: [], shoppingItemIds: [] } } })} />);
    expect(view.container.querySelector("[data-details-owner] input, [data-details-owner] select")).toBeNull();
    for (const value of text) expect(view.container.querySelector("[data-details-owner]")?.textContent).toContain(value);
    view.rerender(<ItineraryTimeline {...control} model={model({ timeline: [{ ...selected, states: [] }] })} />);
    await waitFor(() => expect(view.container.querySelector("[data-details-owner]")).toBeNull());
  });
  test("shopping progress counts purchased items without treating skipped or unavailable as bought", () => {
    const control = controls();
    const shopping = node({ states: ["selected"], facts: { kind: "shopping", items: [
      { id: "tea", title: "Tea", status: "pending" },
      { id: "cup", title: "Cup", status: "purchased" },
      { id: "book", title: "Book", status: "unavailable" },
      { id: "bag", title: "Bag", status: "skipped" },
    ] }, capabilities: { ...node().capabilities, shopping: true } });
    const view = render(<ItineraryTimeline {...control} model={model({ timeline: [shopping] })} />);
    expect(view.getByText("已購買 1／4")).not.toBeNull();
    view.rerender(<ItineraryTimeline {...control} model={model({ timeline: [{ ...shopping, facts: { kind: "shopping", items: [
      { id: "tea", title: "Tea", status: "purchased" },
      { id: "cup", title: "Cup", status: "purchased" },
      { id: "book", title: "Book", status: "unavailable" },
      { id: "bag", title: "Bag", status: "skipped" },
    ] } }] })} />);
    expect(view.getByText("已購買 2／4")).not.toBeNull();
  });
  test.each(routeCases)("renders authoritative $name route state on its edge", ({ route: edge }) => {
    const control = controls(); const view = render(<ItineraryTimeline {...control} model={model({ timeline: [{ kind: "route", ownerId: "edge", routeId: "edge", role: "connector", states: ["selected"] }, node()], routes: [{ ...edge, selected: true }] })} />);
    const row = view.container.querySelector('[data-owner-id="edge"]')!;
    expect(row.textContent).toContain(catalog.routes[edge.mode]); expect(row.querySelector("[data-route-state]")?.getAttribute("data-route-state")).toBe(edge.runtime.status);
    expect(row.querySelector("svg path[data-geometry], polyline, canvas")).toBeNull();
    if (edge.runtime.status === "ready") { expect(row.textContent).toContain("12"); expect(row.textContent).toContain("800"); expect(row.textContent).toContain("Leave north exit"); expect(row.textContent).toContain("Cross the bridge"); expect(row.textContent).toContain("River Line"); expect(row.textContent).toContain("R2"); }
    if (edge.runtime.status === "ready") expect(within(row as HTMLElement).getByRole("heading", { name: catalog.routes.steps, level: 3 })).not.toBeNull();
    if (edge.authored.summary) { expect(row.textContent).toContain(edge.authored.summary); expect(row.textContent).toContain(String(edge.authored.durationMinutes)); }
    const nav = within(row as HTMLElement).queryByRole("button", { name: catalog.routes.external });
    expect(Boolean(nav)).toBe(edge.navigationAvailable); if (nav) { fireEvent.click(nav); expect(control.actions.openNavigation).toHaveBeenCalledWith("edge"); }
    const retry = within(row as HTMLElement).queryByRole("button", { name: catalog.provider.retry });
    expect(Boolean(retry)).toBe(edge.runtime.status === "unavailable" && edge.runtime.retryable); if (retry) { fireEvent.click(retry); expect(control.actions.retryProvider).toHaveBeenCalledWith("route", "edge"); }
    expect(view.container.querySelector('[data-owner-id="museum"]')?.textContent).not.toContain(catalog.provider.network);
  });
  test.each(openingCases)("consumes supplied opening state for $name", ({ place, text }) => {
    const view = render(<ItineraryTimeline {...controls()} model={model({ timeline: [node({ states: ["selected"] })], places: [place] })} />);
    const opening = view.container.querySelector("[data-opening-state]")!;
    expect(opening.textContent).toContain(catalog.openingHours[text]);
    if (text !== "open") expect(opening.textContent).not.toContain(catalog.openingHours.open);
  });
});
