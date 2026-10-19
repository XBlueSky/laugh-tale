// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { createMemoryTripNavigationStore } from "@laugh-tale-island/core";
import type { HomeViewProps } from "@laugh-tale-island/react";
import { FakeClock, FakeMapAdapterV2, FakeNavigationAdapterV2, FakePlaceAdapterV2, FakeProgressStore, FakeRouteAdapterV2, renderTripContract } from "@laugh-tale-island/testing";
import { syntheticTripV2 } from "@laugh-tale-island/testing";
import { presentation, catalog } from "../presentation";
import { setupContractDOM } from "./generated-contract-setup";

const disposers: Array<() => void> = [];
beforeEach(() => setupContractDOM());
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.head.querySelectorAll("[data-contract-style]").forEach(node => node.remove()); });
function mount(trip = syntheticTripV2) {
 const map = new FakeMapAdapterV2(), navigation = new FakeNavigationAdapterV2(), progress = new FakeProgressStore();
 const navigationStore = createMemoryTripNavigationStore();
 const driver = renderTripContract({ trip, presentation, progressStore: progress, navigationStore,
  clock: new FakeClock("2042-03-04T08:00:00Z").now,
  runtime: { createMap: () => map, createPlaces: () => new FakePlaceAdapterV2(), createRoutes: () => new FakeRouteAdapterV2(), navigation } });
 disposers.push(() => driver.dispose());
 return { driver, map, navigation, progress, navigationStore };
}
test("Home opens Experience, coordinates list/map selection and restores Home", async () => {
 const state = mount(); await state.driver.settle();
 expect(screen.getByRole("heading", { name: syntheticTripV2.title })).toBeTruthy();
 fireEvent.click(screen.getByRole("button", { name: catalog.home.openExperience }));
 await state.driver.settle();
 expect(state.navigationStore.read().surface).toBe("experience");
 expect(screen.getByRole("region", { name: catalog.accessibleNames.map })).toBeTruthy();
 expect(state.map.mountCalls).toHaveLength(1);
 act(() => state.map.emitMarkerSelect("node-sightseeing")); await state.driver.settle();
 expect(state.navigationStore.read().ownerId).toBe("node-sightseeing");
 fireEvent.click(screen.getByRole("button", { name: catalog.experience.home })); await state.driver.settle();
 expect(state.navigationStore.read().surface).toBe("home");
 expect(state.map.destroyCount).toBeGreaterThan(0);
 expect(state.map.markerDisposalCount).toBeGreaterThan(0);
});
test("progress, navigation, candidate comparison and keyboard sheet controls remain available", async () => {
 const state = mount();
 act(() => state.navigationStore.write({ surface: "experience", dayId: "day-synthetic", ownerId: null }));
 await state.driver.settle();
 const sheet = screen.getByRole("region", { name: catalog.accessibleNames.itinerarySheet });
 expect(screen.queryByRole("button", { name: catalog.progress.markComplete })).toBeNull();
 const handle = sheet.querySelector<HTMLElement>(".oak-sheet-handle")!;
 handle.focus(); fireEvent.keyDown(handle, { key: "ArrowUp" }); await state.driver.settle();
 expect(sheet.getAttribute("data-sheet-snap")).toBe("expanded");
 expect(document.activeElement).toBe(handle);
 const completion = screen.getAllByRole("button", { name: catalog.progress.markComplete })[0];
 fireEvent.click(completion); await state.driver.settle();
 expect(state.progress.writes.length).toBeGreaterThan(0);
 const owner=document.querySelector<HTMLButtonElement>('[data-owner-id="node-dining"] .oak-row-selection');
 expect(owner).not.toBeNull();fireEvent.click(owner!);await state.driver.settle();
 const reopen = screen.getByRole("button", { name: catalog.candidate.reopen });
 fireEvent.click(reopen); await state.driver.settle();
 const candidate = document.querySelector<HTMLButtonElement>(".oak-candidate-option");
 expect(candidate).not.toBeNull();
 fireEvent.click(candidate!); await state.driver.settle();
 expect(screen.getByRole("dialog", { name: catalog.accessibleNames.candidateDialog })).toBeTruthy();
 const candidateId=candidate!.closest("[data-candidate-id]")!.getAttribute("data-candidate-id")!;
 fireEvent.click(screen.getByRole("button", { name: catalog.candidate.confirm })); await state.driver.settle();
 expect(screen.queryByRole("dialog")).toBeNull();
 expect(state.progress.writes.at(-1)).toContain(candidateId);
 fireEvent.click(screen.getByRole("button", { name: catalog.candidate.reopen })); await state.driver.settle();
 const cancel = screen.getByRole("button", { name: catalog.candidate.cancel });
 fireEvent.click(cancel); await state.driver.settle();
 expect(screen.queryByRole("dialog")).toBeNull();
 expect(document.activeElement).not.toBe(document.body);
 const navigate = screen.getAllByRole("button", { name: catalog.navigation.open }).find(button => !button.hasAttribute("disabled"));
 expect(navigate).toBeTruthy(); fireEvent.click(navigate!);
 expect(state.navigation.calls.length).toBeGreaterThan(0);
});
test("null content renders Setup through the local presentation", async () => {
 const driver = renderTripContract({ trip: null, presentation, progressStore: new FakeProgressStore() });
 disposers.push(() => driver.dispose()); await driver.settle();
 expect(document.querySelector('[data-state="setup-required"]')).not.toBeNull();
});
test("Loading uses the local surface and Fatal catches a public clock failure", async () => {
 const loading = renderTripContract({ trip: syntheticTripV2, presentation: { ...presentation, Home: (props: HomeViewProps) => <presentation.Loading actions={props.actions} model={{ operation: "progress", owner: { kind: "surface", id: "home" } }} /> }, progressStore: new FakeProgressStore() });
 await loading.settle(); expect(document.querySelector('[data-state="loading"]')).not.toBeNull(); loading.dispose();
 vi.spyOn(console, "error").mockImplementation(() => {});
 const fatal = renderTripContract({ trip: syntheticTripV2, presentation, progressStore: new FakeProgressStore(), clock: () => { throw new Error("Synthetic clock failure"); } });
 disposers.push(() => fatal.dispose()); await fatal.settle();
 expect(document.querySelector('[data-state="fatal-error"]')).not.toBeNull();
});
