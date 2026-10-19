import { useEffect, useMemo, useReducer } from "react";
import { createMemoryTripNavigationStore } from "@laugh-tale-island/core";
import type { TripDiagnosticEvent } from "@laugh-tale-island/react";
import { oakWashiVisualCases } from "../../../../packages/testing/src/fixtures/oak-washi-visual-cases.js";
import { renderOakWashiCase } from "../../../../packages/testing/src/visual/render-oak-washi-case.js";
import { visualTrip } from "../visual-trip.js";
import { providerStates } from "../provider-states.js";
import { testPresentation, type PresentationProbe } from "../test-presentation.js";

function input() {
  const query = new URLSearchParams(location.search);
  if (query.getAll("case").length !== 1 || query.getAll("variant").length !== 1) throw new Error("Exactly one case and variant are required");
  const cases = oakWashiVisualCases.filter(item => item.id === query.get("case"));
  if (cases.length !== 1) throw new Error("Unknown or duplicate case");
  const variants = cases[0].variants.filter(item => item.id === query.get("variant"));
  if (variants.length !== 1) throw new Error("Unknown or duplicate variant");
  const days = query.get("days");
  if (query.getAll("days").length > 1 || (days !== null && days !== "long-rail")) throw new Error("Unknown or duplicate day scenario");
  const timing = query.get("timing");
  if (query.getAll("timing").length > 1 || (timing !== null && timing !== "overnight")) throw new Error("Unknown or duplicate timing scenario");
  const content = query.get("content");
  if (query.getAll("content").length > 1 || (content !== null && content !== "unreviewed" && content !== "lodging-only")) throw new Error("Unknown or duplicate content scenario");
  const details = query.get("details");
  if (query.getAll("details").length > 1 || (details !== null && details !== "equivalent" && details !== "long" && details !== "browse" && details !== "task")) throw new Error("Unknown or duplicate details scenario");
  return { visualCase: cases[0], variant: variants[0], detailsScenario: details, longDayRail: days === "long-rail", overnightTiming: timing === "overnight", unreviewedContent: content === "unreviewed", lodgingOnlyContent: content === "lodging-only" };
}
export function OakWashiHarness() {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const harness = useMemo(() => {
    const selected = input(); const { visualCase, variant } = selected;
    const providers = providerStates(visualCase, variant);
    const probe: PresentationProbe = { surface: "pending", experience: null, home: null, actions: null, revision: 0, held: variant.mode === "loading" || variant.mode === "fatal" ? variant.mode : null };
    const trip = visualTrip(visualCase, variant, { detailsScenario: selected.detailsScenario, longDayRail: selected.longDayRail, overnightTiming: selected.overnightTiming, unreviewedContent: selected.unreviewedContent, lodgingOnlyContent: selected.lodgingOnlyContent });
    const navigation = createMemoryTripNavigationStore({ surface: variant.mode === "experience" ? "experience" : "home", dayId: trip.days[0].id, ownerId: null });
    const presentation = testPresentation(probe);
    return { diagnostics: [] as TripDiagnosticEvent[], ...selected, providers, probe, trip, navigation, presentation, ready: false, readiness: { requested: 0, observed: 0, revision: 0, stableFrames: 0 }, sourceConsumption: "explicit-neutral-testing-source-modules", isolatedPresentationState: probe.held, releaseHeld: () => { probe.held = null; refresh(); }, snapshot: () => ({ surface: probe.surface, model: probe.experience?.model ?? probe.home?.model, cameras: providers.map.cameras, mapPresentation: providers.map.renders.at(-1), routeCalls: providers.routes.calls, placeCalls: providers.places.calls, navigationCalls: providers.navigation.calls, fonts: { system: document.fonts.check("16px system-ui"), ready: document.fonts.status }, focusedOwner: (document.activeElement?.closest("[data-owner-id]") as HTMLElement | null)?.dataset.ownerId ?? null }) };
  }, []);
  useEffect(() => {
    window.oak = harness;
    const { variant } = harness;
    const root = document.documentElement;
    root.style.fontSize = `${16 * variant.scenario.textScale}px`;
    const sides = ["top", "right", "bottom", "left"];
    sides.forEach((side, index) => root.style.setProperty(`--oak-safe-area-${side}`, `${variant.scenario.safeArea[index]}px`));
    if (variant.scenario.media === "grayscale") root.style.filter = "grayscale(1)";
    const state = variant.scenario.state;
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { watchPosition(success: PositionCallback, failure: PositionErrorCallback) {
      queueMicrotask(() => {
        if (state === "location-denied" || state === "location-unavailable") failure({ code: state === "location-denied" ? 1 : 2, message: "Synthetic location outcome", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
        else success({ coords: { latitude: 10.015, longitude: 20.015, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) }, timestamp: 0, toJSON: () => ({}) });
      }); return 1;
    }, clearWatch() {}, getCurrentPosition() {} } });
    let stopped = false;
    let frame = 0;
    let previous = "";
    let stable = 0;
    const ready = () => {
      if (stopped) return;
      const sheet = document.querySelector(".oak-itinerary-sheet")?.getBoundingClientRect();
      // A new consumer wait invalidates the sampled key; even an already-ready
      // surface must earn four fresh stable frames for that request.
      const next = JSON.stringify([harness.readiness.requested, harness.probe.revision, sheet?.height, sheet?.top, document.fonts.status]);
      stable = next === previous ? stable + 1 : 0; previous = next;
      harness.readiness.observed = harness.readiness.requested;
      harness.readiness.revision = harness.probe.revision;
      harness.readiness.stableFrames = stable;
      harness.ready = stable >= 4 && harness.probe.surface !== "pending" && document.fonts.status === "loaded" && (harness.probe.surface !== "experience" || harness.probe.experience?.model.sheet.geometry !== null);
      document.documentElement.dataset.oakReady = String(harness.ready);
      frame = requestAnimationFrame(ready);
    };
    frame = requestAnimationFrame(ready);
    return () => { stopped = true; cancelAnimationFrame(frame); delete window.oak; };
  }, [harness]);
  return renderOakWashiCase(harness.visualCase, harness.variant, harness.presentation, harness.providers.runtime, {
    trip: harness.variant.mode === "setup" ? null : harness.trip,
    navigationStore: harness.navigation, progressStore: harness.providers.progress, clock: harness.providers.clock.now,
    providerBootstrap: harness.providers.bootstrap,
    onDiagnostic: event => { harness.diagnostics.push(event); },
    recovery: { retryFatal: harness.releaseHeld },
  });
}
export interface OakHarness {
    diagnostics: TripDiagnosticEvent[];
    visualCase: ReturnType<typeof input>["visualCase"];
    variant: ReturnType<typeof input>["variant"];
    providers: ReturnType<typeof providerStates>;
    probe: PresentationProbe;
    ready: boolean;
    readiness: { requested: number; observed: number; revision: number; stableFrames: number };
    releaseHeld(): void;
    snapshot(): unknown;
}
declare global { interface Window { oak?: OakHarness } }
