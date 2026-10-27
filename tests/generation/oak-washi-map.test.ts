// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { createMemoryTripNavigationStore } from "@laugh-tale-island/core";
import { useTripExperience } from "@laugh-tale-island/react";
import type { MapRoutePresentationV2 } from "@laugh-tale-island/core/browser";
import * as entry from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.js";
import { baseMarker, baseStateCases, mapContentCases, primaryMarker, semanticMapTrip } from "../fixtures/oak-washi/map-content-cases.js";

const styles = document.createElement("style");
styles.textContent = ["tokens", "components", "states", "accessibility"].map(name => readFileSync(`${process.cwd()}/plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles/${name}.css`, "utf8")).join("\n");
document.head.append(styles);
afterEach(() => { cleanup(); document.body.replaceChildren(); });

describe("Oak map language", () => {
  test("kind-only transfer marker stays neutral without inventing a travel mode", () => {
    const handle = entry.createOakWashiMarkerContent({ ...primaryMarker, sourceKind: "transfer" });
    expect(handle.element.querySelector("svg.lucide-circle-question-mark")).not.toBeNull();
    expect(handle.element.querySelector("svg.lucide-plane")).toBeNull();
    handle.dispose();
  });
  test("public runtime keeps semantic none owners in timeline and omits them before the Oak factory", () => {
    const input: Parameters<typeof useTripExperience>[0] = { trip: semanticMapTrip,
      navigationStore: createMemoryTripNavigationStore({ surface: "experience", dayId: "one", ownerId: null }),
      progressStore: { read: () => ({ status: "ready", value: null }), write: () => true, subscribe: () => () => {} },
      presentation: entry.oakWashiMapBindings, clock: () => "2040-06-12T10:00:00Z",
    };
    const { result } = renderHook(() => useTripExperience(input));
    expect(result.current.model.timeline).toEqual(expect.arrayContaining([expect.objectContaining({ ownerId: "none-owner", markerMode: "none" })]));
    expect(result.current.model.map.presentation.markers.map(marker => marker.ownerId)).toEqual(["before", "after"]);
    const factory = vi.fn(entry.createOakWashiMarkerContent);
    const handles = result.current.model.map.presentation.markers.map(factory);
    expect(factory.mock.calls.map(([marker]) => marker.ownerId)).toEqual(["before", "after"]);
    handles.forEach(handle => handle.dispose());
  });
  test("shared supplied-state renderers render reason and capability gated recovery", async () => {
    const { InlineProviderState } = await import("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/states/InlineProviderState.js");
    const { PersistenceNotice } = await import("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/states/PersistenceNotice.js");
    const { LocationState } = await import("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/states/LocationState.js");
    const retry = vi.fn();
    const view = render(createElement(InlineProviderState, { channel: "map", state: { status: "unavailable", reason: "network", retryable: true }, onRetry: retry }));
    expect(view.getByRole("status").textContent).toContain(entry.catalog.provider.network);
    fireEvent.click(view.getByRole("button", { name: entry.catalog.provider.retry })); expect(retry).toHaveBeenCalledTimes(1);
    view.rerender(createElement(InlineProviderState, { channel: "map", state: { status: "unavailable", reason: "unsupported", retryable: false }, onRetry: retry }));
    expect(view.queryByRole("button")).toBeNull();
    view.rerender(createElement(PersistenceNotice, { state: { status: "memory-only", writable: true } }));
    expect(view.getByRole("status").textContent).toBe(entry.catalog.persistence.memoryOnlyNotice);
    view.rerender(createElement(PersistenceNotice, { state: { status: "persistent", writable: true } }));
    expect(view.container.textContent).toBe("");
    view.rerender(createElement(LocationState, { state: { status: "active", hasFix: false } }));
    expect(view.getByRole("status").textContent).toBe(entry.catalog.location.waitingForFix);
    view.rerender(createElement(LocationState, { state: { status: "denied", hasFix: false } }));
    expect(view.getByRole("status").textContent).toBe(entry.catalog.location.denied);
  });
  test("map controls obey each capability and surface registers the actual viewport", async () => {
    const { OakWashiMapControls } = await import("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/map/OakWashiMapControls.js");
    const { OakWashiMapSurface } = await import("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/map/OakWashiMapSurface.js");
    const actions = { restoreFullDay: vi.fn(), beginLocation: vi.fn(), stopLocation: vi.fn(), recenterLocation: vi.fn() };
    const view = render(createElement(OakWashiMapControls, { capabilities: { restoreFullDay: true, location: { begin: true, stop: false, recenter: true } }, actions }));
    for (const [name, action] of [[entry.catalog.navigation.restoreFullDay, actions.restoreFullDay], [entry.catalog.location.locate, actions.beginLocation], [entry.catalog.location.recenter, actions.recenterLocation]] as const) { fireEvent.click(view.getByRole("button", { name })); expect(action).toHaveBeenCalledTimes(1); }
    expect(view.getAllByRole("button")).toHaveLength(3);
    view.rerender(createElement(OakWashiMapControls, { capabilities: { restoreFullDay: false, location: { begin: false, stop: true, recenter: false } }, actions }));
    fireEvent.click(view.getByRole("button", { name: entry.catalog.location.stop })); expect(actions.stopLocation).toHaveBeenCalledTimes(1);
    expect(view.getAllByRole("button")).toHaveLength(1);
    const viewportRef = vi.fn();
    view.rerender(createElement(OakWashiMapSurface, { provider: { status: "loading", retryable: false }, mapViewportRef: viewportRef }));
    expect(viewportRef).toHaveBeenCalledWith(view.getByRole("region", { name: entry.catalog.accessibleNames.map }));
    expect(view.getByRole("status").textContent).toContain(entry.catalog.provider.loading);
    expect(view.getByRole("region").contains(view.getByRole("status"))).toBe(false);
    view.unmount(); expect(viewportRef.mock.calls.at(-1)?.[0]).toBeNull();
  });
  test("exports the actual map bindings and approved neutral basemap", () => {
    expect(entry).toHaveProperty("oakWashiMapVisualProfile");
    const profile = entry.oakWashiMapVisualProfile;
    expect(profile.basemap).toEqual({ mode: "subdued", density: "low", contrast: "soft", poi: "minimal", stationLabels: "legible", palette: { geometry: "#EEE8DE", label: "#5E574F", labelStroke: "#F8F4ED", water: "#D9E2DF", park: "#E3E6D8", road: "#FAF7F1" } });
    expect(entry.oakWashiMapBindings).toEqual({ mapVisualProfile: profile, createMarkerContent: entry.createOakWashiMarkerContent, createUserLocationContent: entry.createOakWashiUserLocationContent });
  });
  test.each([false, true])("uses semantic route paint with selected=%s", selected => {
    expect(entry).toHaveProperty("oakWashiMapVisualProfile");
    const route = (mode: MapRoutePresentationV2["mode"]) => entry.oakWashiMapVisualProfile.routeStyle({ mode, selected, edgeId: "route", source: "provider", certainty: "confirmed", geometry: [{ lat: 1, lng: 2 }, { lat: 2, lng: 3 }] });
    for (const [mode, color] of [["transit", "#6F8F8C"], ["driving", "#57514C"]] as const) expect(route(mode)).toEqual({ kind: "solid", stroke: { color, width: selected ? 7 : 4, opacity: selected ? 1 : 0.42 } });
    expect(route("walking")).toEqual({ kind: "symbol", symbol: { shape: "circle", repeatPx: 12, scale: selected ? 3 : 2.2, fill: { color: "#B86F4B", opacity: selected ? 1 : 0.55 } } });
    expect(route("flight")).toEqual({ kind: "symbol", symbol: { shape: "dash", repeatPx: 14, scale: 1, stroke: { color: "#7F776F", width: selected ? 3 : 2, opacity: selected ? 0.9 : 0.5 } } });
    expect(route("unknown")).toBeNull();
  });
  test.each(mapContentCases)("preserves semantic states, accessible identity and geometry for $ownerId", descriptor => {
    expect(entry).toHaveProperty("createOakWashiMarkerContent");
    const handle = entry.createOakWashiMarkerContent(descriptor);
    document.body.append(handle.element);
    const element = handle.element;
    expect(element.tagName).toBe("BUTTON");
    expect(element.getAttribute("aria-label")).toContain(descriptor.label);
    expect(element.getAttribute("aria-label")).toContain(entry.catalog.types[descriptor.sourceKind as keyof typeof entry.catalog.types]);
    expect(element.getAttribute("aria-label")).toContain(entry.catalog.timing[descriptor.timing]);
    expect(element.getAttribute("aria-pressed")).toBe(String(descriptor.states.includes("selected")));
    for (const state of descriptor.states) {
      expect(element.dataset[state]).toBe("true");
      expect(element.getAttribute("aria-label")).toContain(entry.catalog.status[state]);
    }
    expect(getComputedStyle(element).width).toBe("44px");
    expect(getComputedStyle(element).height).toBe("44px");
    const drop = element.querySelector<HTMLElement>(".oak-marker-drop")!;
    expect(getComputedStyle(drop).width).toBe("32px");
    expect(getComputedStyle(drop).height).toBe("32px");
    expect(getComputedStyle(drop).transform).toContain("rotate(-45deg)");
    if (descriptor.markerMode === "base") {
      expect(element.querySelector(".oak-marker-ordinal")).toBeNull();
      expect(element.querySelector(".oak-marker-badge")).toBeNull();
      expect(element.querySelector("svg.lucide-bed-double")).not.toBeNull();
      expect(element.querySelector("svg")?.getAttribute("width")).toBe("16");
    } else {
      const ordinal = element.querySelector<HTMLElement>(".oak-marker-ordinal")!;
      expect(ordinal.textContent).toBe(descriptor.ordinal);
      expect(getComputedStyle(ordinal).transform).toBe("rotate(45deg)");
      const badge = element.querySelector<HTMLElement>(".oak-marker-badge")!;
      expect(getComputedStyle(badge).width).toBe("16px");
      expect(badge.querySelector("svg")?.getAttribute("width")).toBe("10");
    }
    element.focus(); expect(document.activeElement).toBe(element);
    handle.update({ ...primaryMarker, states: ["selected"] });
    expect(handle.element).toBe(element);
    expect(element.querySelector(".oak-marker-drop")).toBe(drop);
    expect(element.dataset.skipped).toBeUndefined();
    expect(element.getAttribute("aria-pressed")).toBe("true");
    expect(getComputedStyle(element).width).toBe("44px");
    handle.dispose(); handle.dispose();
    expect(element.isConnected).toBe(false); expect(element.childNodes).toHaveLength(0);
  });
  test.each(baseStateCases)("base state cues compose and clear in place for $ownerId", descriptor => {
    const handle = entry.createOakWashiMarkerContent(baseMarker);
    document.body.append(handle.element);
    const drop = handle.element.querySelector<HTMLElement>(".oak-marker-drop")!;
    const glyph = handle.element.querySelector<SVGElement>(".oak-marker-base-glyph")!;
    const initialOutline = getComputedStyle(glyph).outline;
    const initialRule = getComputedStyle(glyph).borderBottom;
    handle.update(descriptor);
    expect(handle.element.querySelector(".oak-marker-drop")).toBe(drop);
    expect(handle.element.querySelector(".oak-marker-base-glyph")).toBe(glyph);
    expect(handle.element.querySelector(".oak-marker-ordinal, .oak-marker-badge")).toBeNull();
    expect(glyph.getAttribute("width")).toBe("16");
    expect(glyph.getAttribute("height")).toBe("16");
    expect(getComputedStyle(handle.element).width).toBe("44px");
    expect(getComputedStyle(handle.element).height).toBe("44px");
    expect(getComputedStyle(drop).width).toBe("32px");
    expect(getComputedStyle(drop).height).toBe("32px");
    const glyphStyle = getComputedStyle(glyph);
    if (descriptor.states.includes("viewing")) {
      expect(glyphStyle.outline).toBe("1px solid currentcolor");
      expect(glyphStyle.outlineOffset).toBe("2px");
    } else expect(glyphStyle.outline).toBe(initialOutline);
    if (descriptor.states.includes("completed")) {
      expect(glyphStyle.borderBottomWidth).toBe("2px");
      expect(glyphStyle.borderBottomStyle).toBe("solid");
      expect(glyphStyle.transform).toBe("rotate(45deg) translateY(1px)");
    } else expect(glyphStyle.borderBottom).toBe(initialRule);
    const dropStyle = getComputedStyle(drop);
    if (descriptor.states.includes("current")) expect(dropStyle.outline).toBe("2px solid var(--oak-ink)");
    if (descriptor.states.includes("next")) expect(dropStyle.borderTopWidth).toBe("2px");
    if (descriptor.states.includes("selected")) expect(dropStyle.transform).toBe("rotate(-45deg) scale(1.12)");
    if (descriptor.states.includes("candidate")) expect(dropStyle.borderTopStyle).toBe("dotted");
    if (descriptor.states.includes("skipped")) expect(dropStyle.borderTopStyle).toBe("dashed");
    handle.update(baseMarker);
    expect(getComputedStyle(glyph).outline).toBe(initialOutline);
    expect(getComputedStyle(glyph).borderBottom).toBe(initialRule);
    expect(handle.element.dataset.viewing).toBeUndefined();
    expect(handle.element.dataset.completed).toBeUndefined();
    expect(handle.element.getAttribute("aria-pressed")).toBe("false");
    handle.dispose(); handle.dispose();
    expect(handle.element.isConnected).toBe(false);
    expect(handle.element.childNodes).toHaveLength(0);
  });
  test("keeps an inert location element through coordinate updates and removes owned content once", () => {
    expect(entry).toHaveProperty("createOakWashiUserLocationContent");
    const handle = entry.createOakWashiUserLocationContent({ coordinates: { lat: 25.031, lng: 121.563 } });
    const element = handle.element;
    document.body.append(element);
    const original = element.outerHTML;
    expect(element.getAttribute("aria-hidden")).toBe("true");
    expect(element.textContent).toBe(""); expect(element.tabIndex).toBe(-1);
    expect(getComputedStyle(element).width).toBe("40px"); expect(getComputedStyle(element).height).toBe("40px");
    expect(getComputedStyle(element).pointerEvents).toBe("none");
    expect(getComputedStyle(element.querySelector(".oak-location-halo")!).width).toBe("28px");
    expect(getComputedStyle(element.querySelector(".oak-location-core")!).width).toBe("14px");
    const core = getComputedStyle(element.querySelector(".oak-location-core")!);
    expect(core.backgroundColor).toBe("rgb(111, 143, 140)");
    expect(core.borderTopWidth).toBe("3px");
    expect(core.borderTopColor).toBe("rgb(255, 253, 249)");
    expect(core.outline).toBe("1px solid #352f2a");
    expect(getComputedStyle(element.querySelector(".oak-location-halo")!).backgroundColor).toBe("rgba(111, 143, 140, 0.2)");
    for (const coordinates of [{ lat: 26.231, lng: 122.453 }, { lat: -12.21, lng: -45.98 }]) {
      handle.update({ coordinates }); expect(handle.element).toBe(element); expect(element.outerHTML).toBe(original);
    }
    expect(original).not.toMatch(/25\.031|121\.563|google|animation|pulse/);
    handle.dispose(); handle.dispose(); expect(element.isConnected).toBe(false); expect(element.childNodes).toHaveLength(0);
  });
  test("candidate, skipped and selected marks keep distinct non-color cues", () => {
    const handles = [
      entry.createOakWashiMarkerContent({ ...primaryMarker, ordinal: "2B", states: ["candidate"] }),
      entry.createOakWashiMarkerContent({ ...primaryMarker, states: ["skipped"] }),
      entry.createOakWashiMarkerContent({ ...primaryMarker, states: ["selected"] }),
    ];
    for (const handle of handles) document.body.append(handle.element);
    const drops = handles.map(handle => getComputedStyle(handle.element.querySelector(".oak-marker-drop")!));
    expect(drops[0]?.borderTopStyle).toBe("dotted");
    expect(drops[1]?.borderTopStyle).toBe("dashed");
    expect(drops[2]?.transform).toBe("rotate(-45deg) scale(1.12)");
    expect(handles[0]?.element.textContent).toBe("2B");
    handles.forEach(handle => handle.dispose());
  });
  test("forced-colors rules retain system-color core, ring, outline and marker boundaries", () => {
    const media = [...styles.sheet!.cssRules].filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule && rule.conditionText === "(forced-colors: active)");
    expect(media.length).toBeGreaterThan(0);
    const rules = media.flatMap(block => [...block.cssRules]).filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule);
    const core = rules.find(rule => rule.selectorText === ".oak-location-core")!;
    expect(core.style.background.toLowerCase()).toBe("highlight");
    expect(core.style.borderColor.toLowerCase()).toBe("canvas");
    expect(core.style.outlineColor.toLowerCase()).toBe("canvastext");
    const marker = rules.find(rule => rule.selectorText.includes(".oak-marker-drop"))!;
    expect(marker.style.borderColor.toLowerCase()).toBe("canvastext");
    expect(marker.style.background.toLowerCase()).toBe("canvas");
  });
});
