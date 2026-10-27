import type { ExperienceBindings, ExperienceModel, TimelineEntryModel, TimelineNodeModel, TripActions } from "@laugh-tale-island/react";
import { catalog, locale } from "../copy/catalog.js";
import { PrimaryRow } from "./PrimaryRow.js";
import { BaseRow } from "./BaseRow.js";
import { JourneyRow } from "./JourneyRow.js";
import { TaskRow } from "./TaskRow.js";
import { RouteConnectorRow } from "./RouteConnectorRow.js";
import { LogisticsGroupRow } from "./LogisticsGroupRow.js";

export interface TimelineContext {
  model: Pick<ExperienceModel, "timeline" | "routes" | "places" | "candidates" | "capabilities" | "itinerary" | "reservations" | "tasks">;
  actions: TripActions;
  bindings: Pick<ExperienceBindings, "owners" | "focus">;
  showDetails?: boolean;
}
export interface NodeRowProps extends TimelineContext { node: TimelineNodeModel }

export function TimelineEntry({ entry, ...context }: TimelineContext & { entry: TimelineEntryModel }) {
  switch (entry.kind) {
    case "route": return <RouteConnectorRow entry={entry} {...context} />;
    case "logistics-group": return <LogisticsGroupRow group={entry} {...context} />;
    case "node": {
      switch (entry.role) {
        case "primary": return <PrimaryRow node={entry} {...context} />;
        case "base": return <BaseRow node={entry} {...context} />;
        case "journey": return <JourneyRow node={entry} {...context} />;
        case "task": return <TaskRow node={entry} {...context} />;
        default: return unhandled(entry);
      }
    }
    default: return unhandled(entry);
  }
}
function unhandled(value: never): never { throw new Error(`Unhandled timeline role: ${String(value)}`); }

export function ItineraryTimeline(context: TimelineContext) {
  return <ol className={`oak-timeline oak-locale--${locale.startsWith("zh-Hant") ? "zh-hant" : "en"}`} lang={locale} aria-label={catalog.experience.itinerary}>
    {context.model.timeline.map(entry => <TimelineEntry key={entry.ownerId} entry={entry} {...context} />)}
  </ol>;
}
