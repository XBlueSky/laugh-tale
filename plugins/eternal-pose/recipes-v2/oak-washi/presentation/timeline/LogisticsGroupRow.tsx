import type { TimelineLogisticsGroupModel } from "@laugh-tale-island/react";
import { catalog } from "../copy/catalog.js";
import { TimelineEntry, type TimelineContext } from "./ItineraryTimeline.js";

const titles = { "timeline.logisticsGroup": catalog.timeline.logisticsGroup };
export function LogisticsGroupRow({ group, ...context }: TimelineContext & { group: TimelineLogisticsGroupModel }) {
  return <li className="oak-row oak-logistics-group" data-role="logistics-group" data-owner-id={group.ownerId}>
    <header><h3>{titles[group.titleKey]}</h3><span>{catalog.progress.completedOfTotal.replace("{completed}", String(group.progress.completed)).replace("{total}", String(group.progress.total))}</span></header>
    <ol>{group.children.map(child => <TimelineEntry key={child.ownerId} entry={child} {...context} />)}</ol>
  </li>;
}
