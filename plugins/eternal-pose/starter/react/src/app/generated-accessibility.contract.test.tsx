// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { createMemoryTripNavigationStore } from "@laugh-tale-island/core";
import { adversarialRouteFixtures, createPresentationDriver, FakeMapAdapterV2, FakeNavigationAdapterV2, FakePlaceAdapterV2, FakeProgressStore, FakeRouteAdapterV2, oakWashiVisualCases, renderOakWashiCase, syntheticTripV2 } from "@laugh-tale-island/testing";
import { presentation, catalog } from "../presentation";
import { setupContractDOM } from "./generated-contract-setup";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.head.querySelectorAll("[data-contract-style]").forEach(node => node.remove()); });
test.each(oakWashiVisualCases.map(item => [item.id, item] as const))("generated accessibility: %s", async (id, visualCase) => {
 const variant = id === "experience-expanded-dense" ? visualCase.variants[1] : visualCase.variants[0];
 setupContractDOM(variant.viewport.width, variant.viewport.height);
 const navigationStore = createMemoryTripNavigationStore({ surface: variant.mode === "home" || variant.mode === "loading" || variant.mode === "fatal" ? "home" : "experience", dayId: "day-synthetic", ownerId: id === "selection-truth" ? "node-sightseeing" : null });
 const map = new FakeMapAdapterV2();
 const places = new FakePlaceAdapterV2(() => ({ status: "ready", facts: { openingHours: { kind: "always-open" } } }));
 const routes = new FakeRouteAdapterV2(() => id === "camera-adversarial" ? adversarialRouteFixtures.implausibleDuration.result : { status: "ready", durationMinutes: 30, steps: ["Synthetic route instruction"] });
 const runtime = { createMap: () => map, createPlaces: () => places, createRoutes: () => routes, navigation: new FakeNavigationAdapterV2() };
 const local = variant.mode === "loading" ? { ...presentation, Home: (props: Parameters<typeof presentation.Home>[0]) => <presentation.Loading actions={props.actions} model={{ operation: "progress", owner: { kind: "surface", id: "home" } }} /> } : presentation;
 if(variant.mode === "fatal") vi.spyOn(console, "error").mockImplementation(() => {});
 const view = render(renderOakWashiCase(visualCase, variant, local, runtime, {
  trip: variant.mode === "setup" ? null : syntheticTripV2,
  navigationStore,
  progressStore: new FakeProgressStore({ writeAvailable: id !== "runtime-degraded" }),
  clock: () => { if(variant.mode === "fatal") throw new Error("Synthetic fatal clock"); return "2042-03-04T08:00:00Z"; },
 }));
 const driver = createPresentationDriver(view.container); await driver.settle();
 if(id === "experience-default") expect(view.container.querySelectorAll(".oak-row").length).toBeGreaterThan(5);
 if(id === "selection-truth") {
  expect(navigationStore.read().ownerId).toBe("node-sightseeing");
  expect(view.container.querySelector('[data-owner-id="node-sightseeing"] [aria-pressed="true"]')).not.toBeNull();
 }
 if(id === "opening-hours-matrix") {
  const owner=view.container.querySelector<HTMLButtonElement>('[data-owner-id="node-transfer"] .oak-row-selection');
  expect(owner).not.toBeNull();fireEvent.click(owner!);await driver.settle();
  expect(view.container.querySelector('[data-opening-state="open"]')).not.toBeNull();
 }
 if(id === "route-state-matrix" || id === "camera-adversarial") {
  const route=view.container.querySelector<HTMLButtonElement>(".oak-route-selection");
  expect(route).not.toBeNull();fireEvent.click(route!);await driver.settle();
  expect(view.container.querySelector('.oak-route-selection[aria-pressed="true"]')).not.toBeNull();
  if(id === "camera-adversarial") expect(map.renderCalls.every(frame => frame.routes.every(route => route.geometry?.every(point => Number.isFinite(point.lat) && Number.isFinite(point.lng)) ?? true))).toBe(true);
 }
 if(id === "marker-backends") { expect(map.markerFactoryCalls.length).toBeGreaterThan(0);expect(map.markerElements.every(element => element.getAttribute("aria-label"))).toBe(true); }
 if(id.startsWith("candidate-")) {
  const owner=view.container.querySelector<HTMLButtonElement>('[data-owner-id="node-dining"] .oak-row-selection');
  expect(owner).not.toBeNull();fireEvent.click(owner!);await driver.settle();
  fireEvent.click(screen.getByRole("button", { name: catalog.candidate.reopen })); await driver.settle();
  const candidate = view.container.querySelector<HTMLButtonElement>(".oak-candidate-option");
  expect(candidate).not.toBeNull(); fireEvent.click(candidate!); await driver.settle();
  expect(screen.getByRole("dialog", { name: catalog.accessibleNames.candidateDialog })).toBeTruthy();
  if(id === "candidate-zoom-200") view.container.style.fontSize="200%";
 }
 if(variant.scenario.header) {
  const expand=screen.queryByRole("button", { name: catalog.accessibleNames.expandDayRail });
  if(expand)fireEvent.click(expand); await driver.settle();
  expect(screen.getByRole("navigation", { name: catalog.accessibleNames.dayRail })).toBeTruthy();
 }
 const handle=view.container.querySelector<HTMLElement>(".oak-sheet-handle");
 if(handle && variant.scenario.sheet!=="half") {
  handle.focus(); fireEvent.keyDown(handle,{key:variant.scenario.sheet==="collapsed"?"Home":"End"}); await driver.settle();
  expect(view.container.querySelector("[data-sheet-snap]")?.getAttribute("data-sheet-snap")).toBe(variant.scenario.sheet);
 }
 if(id==="map-error") { act(()=>map.emitUnavailable({status:"unavailable",reason:"network",retryable:true}));await driver.settle();expect(view.container.textContent).toContain(catalog.provider.unavailable); }
 if(id==="accessibility-media" && handle) {handle.focus();expect(document.activeElement).toBe(handle);}
 if(variant.mode==="loading" || variant.mode==="fatal" || variant.mode==="setup")expect(view.container.querySelector('[data-state="'+({loading:"loading",fatal:"fatal-error",setup:"setup-required"}[variant.mode])+'"]')).not.toBeNull();
 if(variant.mode==="experience")expect(screen.getByRole("region",{name:catalog.accessibleNames.map})).toBeTruthy();
 for(const element of view.container.querySelectorAll<HTMLElement>("[aria-controls],[aria-labelledby],[aria-describedby]")) {
  for(const attr of ["aria-controls","aria-labelledby","aria-describedby"])for(const target of (element.getAttribute(attr)??"").split(/\s+/).filter(Boolean))expect(document.getElementById(target),target).not.toBeNull();
 }
 const landmarks=[...view.container.querySelectorAll<HTMLElement>('main,nav,section[aria-label],[role="region"],[role="dialog"]')].map(node=>(node.getAttribute("role")??node.tagName)+":"+(node.getAttribute("aria-label")??node.getAttribute("aria-labelledby")??""));
 expect(new Set(landmarks).size).toBe(landmarks.length);
 const controls=view.container.querySelectorAll<HTMLElement>("button:not(:disabled)");
 for(const control of controls) {
  const computed=getComputedStyle(control);
  expect(parseFloat(computed.minHeight),control.outerHTML).toBeGreaterThanOrEqual(44);
  expect(parseFloat(computed.minWidth),control.outerHTML).toBeGreaterThanOrEqual(44);
  expect(control.textContent?.trim() || control.getAttribute("aria-label")).toBeTruthy();
 }
 // jsdom has no layout/canvas; axe's other rules remain enabled.
 const result=await axe.run(view.container,{rules:{"color-contrast":{enabled:false}}});
 expect(result.violations.map(item=>({id:item.id,nodes:item.nodes.map(node=>node.target)})), JSON.stringify(result.violations.map(item=>({id:item.id,nodes:item.nodes.map(node=>node.target)})))).toEqual([]);
},15000);
