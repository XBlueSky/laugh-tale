import { createElement, useLayoutEffect } from "react";
import type { ExperienceViewProps, HomeViewProps, TripActions, TripPresentationV2 } from "@laugh-tale-island/react";
import { presentation, documentMetadataCopy } from "../../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.js";
import "../../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles/index.css";

export { documentMetadataCopy };
export interface PresentationProbe {
  surface: string;
  experience: ExperienceViewProps | null;
  home: HomeViewProps | null;
  actions: TripActions | null;
  revision: number;
  held: "loading" | "fatal" | null;
}
export function testPresentation(probe: PresentationProbe): TripPresentationV2 {
  function Experience(props: ExperienceViewProps) {
    useLayoutEffect(() => { probe.surface = "experience"; probe.experience = props; probe.actions = props.actions; probe.revision++; });
    return createElement(presentation.Experience, props);
  }
  function Home(props: HomeViewProps) {
    useLayoutEffect(() => { probe.surface = probe.held ?? "home"; probe.home = props; probe.actions = props.actions; probe.revision++; });
    if (probe.held === "loading") return createElement(presentation.Loading, { model: { operation: "progress", owner: { kind: "surface", id: "home" } }, actions: props.actions });
    if (probe.held === "fatal") return createElement(presentation.FatalError, { model: { category: "state", copyKey: "fatal.state", retained: { home: false, itinerary: false, externalNavigation: false }, capabilities: { retry: true, openHome: false } }, actions: props.actions });
    return createElement(presentation.Home, props);
  }
  return { ...presentation, Experience, Home, SetupRequired: props => {
    useLayoutEffect(() => { probe.surface = "setup"; probe.actions = props.actions; probe.revision++; });
    return createElement(presentation.SetupRequired, props);
  } };
}
