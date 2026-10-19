import { act, render, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { vi } from "vitest";
import type { Trip } from "@laugh-tale-island/core";
import { TripController, type ExperienceBindings, type ExperienceModel, type ExperienceViewProps, type HomeModel, type HomeViewProps, type TripActions, type TripControllerProps } from "@laugh-tale-island/react";
import { FakeProgressStore, syntheticTripV2 } from "@laugh-tale-island/testing";
import { presentation } from "../src/presentation";
const { mapVisualProfile: themeMapProfile, createMarkerContent, createUserLocationContent } = presentation;

// Test DTOs come from the public controller, never a second projection.
export async function presentationModels(trip: Trip = syntheticTripV2, overrides: Partial<TripControllerProps> = {}): Promise<{ home: HomeModel; experience: ExperienceModel }> {
  let home: HomeViewProps | undefined;
  let experience: ExperienceViewProps | undefined;
  function Home(props: HomeViewProps) { useLayoutEffect(() => { home = props; }); return null; }
  function Experience(props: ExperienceViewProps) { useLayoutEffect(() => { experience = props; }); return null; }
  const empty = () => null;
  const view = render(<TripController trip={trip} clock={() => `${trip.startDate}T12:00:00Z`} progressStore={new FakeProgressStore()} {...overrides} presentation={{ Home, Experience, SetupRequired: empty, Loading: empty, FatalError: empty, mapVisualProfile: themeMapProfile, createMarkerContent, createUserLocationContent }} />);
  try {
    await waitFor(() => { if (home === undefined) throw new Error("Synthetic controller did not reach Home after hydration"); });
    if (home === undefined) throw new Error("Synthetic controller did not reach Home");
    const homeModel = structuredClone(home.model);
    const currentHome = home;
    await act(async () => { currentHome.actions.openExperience(trip.days[0].id); await Promise.resolve(); });
    if (experience === undefined) throw new Error("Synthetic controller did not reach Experience");
    return { home: homeModel, experience: structuredClone(experience.model) };
  } finally { view.unmount(); }
}

export function testActions() {
  return {
    openExperience: vi.fn(), openReservation: vi.fn(), openHome: vi.fn(), selectDay: vi.fn(), selectNode: vi.fn(), selectRoute: vi.fn(), selectCandidate: vi.fn(), setSheetSnap: vi.fn(), stepSheet: vi.fn(), setHeaderExpanded: vi.fn(), settleHeaderTransition: vi.fn(), restoreAutomaticSelection: vi.fn(), returnToCurrent: vi.fn(), returnToLodging: vi.fn(), restoreFullDay: vi.fn(), retryProvider: vi.fn(), openNavigation: vi.fn(), beginLocation: vi.fn(), recenterLocation: vi.fn(), stopLocation: vi.fn(), previewCandidate: vi.fn(), cancelCandidate: vi.fn(), confirmCandidate: vi.fn(), reopenCandidate: vi.fn(), updateProgress: vi.fn(), resetProgress: vi.fn(), retrySetup: vi.fn(), retryFatal: vi.fn(),
  } satisfies TripActions;
}

export function testBindings() {
  return {
    layout: { mapViewportRef: vi.fn(), occlusionRef: () => vi.fn() },
    owners: { nodeRef: () => vi.fn(), routeRef: () => vi.fn() },
    focus: { dialogRef: () => vi.fn(), disclosureTriggerRef: () => vi.fn(), restoreTrigger: vi.fn() },
    sheet: { getSurfaceProps: () => ({ ref: vi.fn() }), getHandleProps: () => ({}), setMeasuredGeometry: vi.fn() },
  } satisfies ExperienceBindings;
}
