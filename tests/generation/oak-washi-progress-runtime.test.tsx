// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { createMemoryTripNavigationStore, emptyTripProgress, type Trip } from "@laugh-tale-island/core";
import { TripController, type ExperienceModel, type ExperienceViewProps } from "@laugh-tale-island/react";
import { FakeProgressStore } from "../../packages/testing/src/fakes/FakeProgressStore.js";
import { presentation } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.js";
import { catalog } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js";
import { semanticMapTrip } from "../fixtures/oak-washi/map-content-cases.js";

afterEach(cleanup);
test.each(["temporarily-closed", "permanently-closed"] as const)("real place projection renders %s without contradicting weekly hours", async businessStatus => {
  const openingHours = { kind: "weekly", completeness: "complete", periods: [{ open: { day: 0, hour: 0, minute: 0 }, close: { day: 6, hour: 23, minute: 59 } }] } as const;
  const authored = structuredClone(semanticMapTrip);
  const first = authored.days[0].nodes[0];
  if (first.place?.identity.status !== "resolved") throw new Error("fixture must resolve");
  first.place.identity.providerReference = { provider: "google", id: "synthetic-place" };
  let model: ExperienceModel;
  const views = { ...presentation, Experience: (props: ExperienceViewProps) => { model = props.model; return <presentation.Experience {...props} />; } };
  const view = render(<TripController trip={authored} presentation={views} progressStore={new FakeProgressStore()} navigationStore={createMemoryTripNavigationStore({ surface: "experience", dayId: "one", ownerId: "before" })} clock={() => "2040-06-12T10:00:00Z"} runtime={{ createPlaces: () => ({ load: () => Promise.resolve({ status: "ready", facts: { openingHours, businessStatus } }) }) }} />);
  await waitFor(() => expect(view.container.querySelector('[data-place-owner="before"] [data-opening-state]')?.textContent).toBe(catalog.openingHours.closed));
  expect(view.container.querySelector('[data-place-owner="before"]')?.textContent).toContain(catalog.openingHours[businessStatus === "temporarily-closed" ? "temporarilyClosed" : "permanentlyClosed"]);
  expect(model!.places.find(place => place.ownerId === "before")?.runtime).toMatchObject({ businessStatus, openingHours, opening: { status: "closed" } });
});
const trip: Trip = { ...semanticMapTrip, endDate: "2040-06-13", days: [
  { ...semanticMapTrip.days[0], nodes: semanticMapTrip.days[0].nodes.map(node => ({ ...node, optionality: "optional" })) },
  { id: "two", title: "Second day", date: "2040-06-13", nodes: [] },
], tasks: [
  { id: "pack", title: "Pack documents", scope: "pretrip" },
  { id: "first", title: "First errand", scope: "day", dayId: "one" },
  { id: "second", title: "Second errand", scope: "day", dayId: "two" },
] };
const clock = () => "2040-06-12T10:00:00Z";

test("real Skip keeps a scoped Restore reachable after projection and reload without skipped geometry", async () => {
  const progressStore = new FakeProgressStore();
  const navigationStore = createMemoryTripNavigationStore({ surface: "experience", dayId: "one", ownerId: "before" });
  let model: ExperienceModel;
  const views = { ...presentation, Experience: (props: ExperienceViewProps) => { model = props.model; return <presentation.Experience {...props} />; } };
  const mount = () => render(<TripController trip={trip} presentation={views} progressStore={progressStore} navigationStore={navigationStore} clock={clock} />);
  let view = mount();
  await waitFor(() => expect(view.container.querySelector('[data-details-owner="before"]')).not.toBeNull());
  fireEvent.click(within(view.container.querySelector<HTMLElement>('[data-details-owner="before"]')!).getByRole("button", { name: catalog.progress.skip }));
  const row = () => within(view.container.querySelector<HTMLElement>('[data-owner-id="before"]')!);
  expect(row().getByRole("button", { name: `${catalog.progress.restore} · Before` })).toBeDefined();
  expect(model!.owners.selectedId).not.toBe("before");
  expect(model!.map.presentation.markers.some(marker => marker.ownerId === "before")).toBe(false);
  view.unmount(); view = mount();
  await waitFor(() => expect(row().getByRole("button", { name: `${catalog.progress.restore} · Before` })).toBeDefined());
  fireEvent.click(row().getByRole("button", { name: `${catalog.progress.restore} · Before` }));
  await waitFor(() => expect(model!.progress.skippedNodeIds).not.toContain("before"));
  expect(model!.map.presentation.markers.some(marker => marker.ownerId === "before")).toBe(true);
  view.unmount(); view = mount();
  await waitFor(() => expect(model!.progress.skippedNodeIds).toEqual([]));
  expect(row().queryByRole("button", { name: `${catalog.progress.restore} · Before` })).toBeNull();
});

test("Home reset cancellation, selected-day changes, day isolation and trip reset survive reload", async () => {
  const initial = { ...emptyTripProgress(), completedIds: ["task:pack", "task:first", "task:second"], skippedNodeIds: ["before"] };
  const progressStore = new FakeProgressStore({ initialValue: JSON.stringify(initial) });
  const mount = () => render(<TripController trip={trip} presentation={presentation} progressStore={progressStore} clock={clock} />);
  let view = mount();
  await view.findByRole("checkbox", { name: "Pack documents" });
  fireEvent.click(view.getByText("管理進度"));
  fireEvent.click(view.getByRole("button", { name: catalog.persistence.resetDay }));
  expect(view.getByRole("group", { name: catalog.persistence.confirmReset }).textContent).toContain("2040-06-12");
  fireEvent.click(view.getByRole("button", { name: catalog.persistence.cancelReset }));
  expect((view.getByRole("checkbox", { name: "First errand" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(view.getByRole("button", { name: catalog.persistence.resetDay }));
  fireEvent.change(view.getByRole("combobox", { name: catalog.persistence.resetDayScope }), { target: { value: "two" } });
  expect(view.queryByRole("group", { name: catalog.persistence.confirmReset })).toBeNull();
  fireEvent.click(view.getByRole("button", { name: catalog.persistence.resetDay }));
  expect(view.getByRole("group", { name: catalog.persistence.confirmReset }).textContent).toContain("2040-06-13");
  fireEvent.click(view.getByRole("button", { name: catalog.persistence.confirmReset }));
  expect((view.getByRole("checkbox", { name: "First errand" }) as HTMLInputElement).checked).toBe(true);
  expect((view.getByRole("checkbox", { name: "Second errand" }) as HTMLInputElement).checked).toBe(false);
  expect((view.getByRole("checkbox", { name: "Pack documents" }) as HTMLInputElement).checked).toBe(true);
  view.unmount(); view = mount();
  await view.findByRole("checkbox", { name: "Pack documents" });
  expect((view.getByRole("checkbox", { name: "Second errand" }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(view.getByText(catalog.persistence.manageProgress));
  fireEvent.click(view.getByRole("button", { name: catalog.persistence.resetTrip }));
  expect(view.getByRole("group", { name: catalog.persistence.confirmReset }).textContent).toContain(trip.title);
  fireEvent.click(view.getByRole("button", { name: catalog.persistence.confirmReset }));
  expect(view.getByRole("status").textContent).toContain(catalog.persistence.resetDone);
  view.unmount(); view = mount();
  await view.findByRole("checkbox", { name: "Pack documents" });
  for (const name of ["Pack documents", "First errand", "Second errand"]) expect((view.getByRole("checkbox", { name }) as HTMLInputElement).checked).toBe(false);
  expect(JSON.parse(progressStore.writes.at(-1)!)).toEqual(emptyTripProgress());
});
