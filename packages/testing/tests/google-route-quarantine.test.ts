import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { GoogleRouteAdapter } from "@laugh-tale-island/adapters/google";
import { createMemoryTripNavigationStore, type Trip } from "@laugh-tale-island/core";
import { useTripExperience, type TripExperienceController } from "@laugh-tale-island/react";
import { alternateTestPresentation } from "../src/alternate-presentation.js";
import { FakeProgressStore } from "../src/fakes/FakeProgressStore.js";

afterEach(() => vi.unstubAllGlobals());

it.each([-1, "500", Infinity])("quarantines Google distance %s through the real core/React map-result boundary", async (distanceMeters) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const trip: Trip = {
    id: "quarantine", title: "Route quarantine", locale: "en", timezone: "UTC",
    startDate: "2042-03-04", endDate: "2042-03-04",
    days: [{ id: "day", date: "2042-03-04", title: "Authored day", nodes: [
      { id: "a", dayId: "day", kind: "sightseeing", title: "A", timing: { certainty: "unknown" }, optionality: "core", payload: {},
        place: { name: "A", certainty: "confirmed", identity: { status: "resolved", coordinates: { lat: 0, lng: 0 } } } },
      { id: "b", dayId: "day", kind: "sightseeing", title: "B", timing: { certainty: "unknown" }, optionality: "core", payload: {},
        place: { name: "B", certainty: "confirmed", identity: { status: "resolved", coordinates: { lat: 0.001, lng: 0.001 } } } },
    ] }],
    routes: [{ id: "edge", dayId: "day", fromNodeId: "a", toNodeId: "b", mode: "walking", source: "manual", certainty: "confirmed", summary: "Authored walk" }],
    candidateGroups: [], reservations: [], tasks: [],
  };
  const before = structuredClone(trip);
  const adapter = new GoogleRouteAdapter({ apiKey: "fixture", fetch: () => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve({ routes: [{ duration: "120s", distanceMeters, polyline: { encodedPolyline: "??gEgE" } }] }),
  } as Response) });
  const input = {
    trip, navigationStore: createMemoryTripNavigationStore(), progressStore: new FakeProgressStore(),
    presentation: alternateTestPresentation, runtime: { createRoutes: () => adapter },
    clock: () => "2042-03-04T09:00:00Z",
  };
  let state: TripExperienceController | undefined;
  function Consumer(): null { state = useTripExperience(input); return null; }
  const root = createRoot(document.createElement("div"));
  try {
    await act(() => { root.render(createElement(Consumer)); return Promise.resolve(); });
    expect(state?.model.routes.find((route) => route.routeId === "edge")).toMatchObject({
      authored: { summary: "Authored walk" },
      runtime: { status: "unavailable", reason: "malformed-response", retryable: false },
    });
    expect(state?.model.map.presentation.routes).toEqual([]);
    expect(trip).toEqual(before);
  } finally {
    await act(() => Promise.resolve(root.unmount()));
  }
});
