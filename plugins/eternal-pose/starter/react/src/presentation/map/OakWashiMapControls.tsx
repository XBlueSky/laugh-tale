import type { ExperienceCapabilities, TripActions } from "@laugh-tale-island/react";
import { Expand, LocateFixed, Navigation, Square } from "lucide-react";
import { catalog, locale } from "../copy/catalog.js";

export interface OakWashiMapControlsProps {
  capabilities: Pick<ExperienceCapabilities, "restoreFullDay" | "location">;
  actions: Pick<TripActions, "restoreFullDay" | "beginLocation" | "stopLocation" | "recenterLocation">;
}

export function OakWashiMapControls({ capabilities, actions }: OakWashiMapControlsProps) {
  return <div className={`oak-map-controls oak-locale--${locale.startsWith("zh-Hant") ? "zh-hant" : "en"}`} lang={locale}>
    {capabilities.restoreFullDay && <button type="button" className="oak-control" aria-label={catalog.navigation.restoreFullDay} onClick={actions.restoreFullDay}><Expand size={18} strokeWidth={1.75} aria-hidden="true" /></button>}
    {capabilities.location.begin && <button type="button" className="oak-control" aria-label={catalog.location.locate} onClick={actions.beginLocation}><Navigation size={18} strokeWidth={1.75} aria-hidden="true" /></button>}
    {capabilities.location.stop && <button type="button" className="oak-control" aria-label={catalog.location.stop} onClick={actions.stopLocation}><Square size={18} strokeWidth={1.75} aria-hidden="true" /></button>}
    {capabilities.location.recenter && <button type="button" className="oak-control" aria-label={catalog.location.recenter} onClick={actions.recenterLocation}><LocateFixed size={18} strokeWidth={1.75} aria-hidden="true" /></button>}
  </div>;
}
