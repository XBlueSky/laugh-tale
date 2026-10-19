import { ArrowRight } from "lucide-react";
import { preload } from "react-dom";
import type { HomeViewProps } from "@laugh-tale-island/react";
import { catalog, locale } from "../copy/catalog.js";
import { PersistenceNotice } from "../states/PersistenceNotice.js";
import { InlineProviderState } from "../states/InlineProviderState.js";
import { TripIdentity } from "./TripIdentity.js";
import { DayIndex, HomeProgress } from "./DayIndex.js";
import { LodgingSummary } from "./LodgingSummary.js";
import { PreTripTasks } from "./PreTripTasks.js";
import { ReservationSummary } from "./ReservationSummary.js";
import { ProgressReset } from "./ProgressReset.js";

export function OakWashiHome({ model, actions }: HomeViewProps) {
  preload(new URL("../assets/oak-washi-cartography.webp", import.meta.url).href, { as: "image", fetchPriority: "high" });
  const hasUtilities = model.lodging.length > 0 || model.tasks.some(task => task.scope === "pretrip") || model.reservations.length > 0;
  return <main className={`oak-washi oak-home oak-locale--${locale.startsWith("zh-Hant") ? "zh-hant" : "en"}`} lang={locale}>
    <div className="oak-home-content">
      <TripIdentity identity={model.identity} />
      <div className="oak-home-entry">
        {model.capabilities.openExperienceDayIds.includes(model.effectiveEntryDayId) && <button type="button" className="oak-control oak-home-primary" onClick={() => actions.openExperience(model.effectiveEntryDayId)}>{catalog.home.openExperience}<ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" /></button>}
        <HomeProgress progress={model.progress.trip} />
      </div>
      <PersistenceNotice state={model.persistence} />
      {(["map", "places", "routes"] as const).map(channel => {
        const state = model.providers[channel];
        if (state.status === "idle" || channel !== "map" && state.status === "unavailable" && state.reason === "missing-configuration") return null;
        return <InlineProviderState key={channel} channel={channel} state={state} />;
      })}
      <div className="oak-home-flow">
        <DayIndex model={model} actions={actions} />
        {hasUtilities && <div className="oak-home-utilities">
          <LodgingSummary lodging={model.lodging} days={model.days} />
          <PreTripTasks tasks={model.tasks} editableIds={model.capabilities.progress.completionIds} actions={actions} />
          <ReservationSummary reservations={model.reservations} actions={actions} />
        </div>}
      </div>
      <ProgressReset model={model} actions={actions} />
    </div>
  </main>;
}
