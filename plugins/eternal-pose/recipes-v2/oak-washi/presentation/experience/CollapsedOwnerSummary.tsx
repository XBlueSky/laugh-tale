import { Navigation, Route } from "lucide-react";
import type { TimelineEntryModel } from "@laugh-tale-island/react";
import { catalog } from "../copy/catalog.js";
import type { TimelineContext } from "../timeline/ItineraryTimeline.js";
import { NodeNavigation, NodeSelection } from "../timeline/PrimaryRow.js";
import { SemanticMark, TypeGlyph } from "../timeline/SemanticMark.js";
import { ownerStateAttributes, StatusRegion } from "../timeline/StatusRegion.js";

export function CollapsedOwnerSummary(context: TimelineContext) {
  const { model, actions, bindings } = context;
  const id = model.itinerary.collapsedOwnerId;
  if (id === null) return null;
  const entries = model.timeline.flatMap<TimelineEntryModel>(entry => entry.kind === "logistics-group" ? [entry, ...entry.children] : [entry]);
  const owner = entries.find(entry => entry.ownerId === id);
  if (owner?.kind === "node") {
    return <div className="oak-collapsed-summary" data-owner-id={id} {...ownerStateAttributes(owner.states)}>
      <SemanticMark node={owner} /><NodeSelection {...context} node={owner}><span className="oak-collapsed-meta">{owner.timing.certainty === "unknown" ? catalog.timing.unknown : owner.timing.start ?? catalog.timing.untimed}<TypeGlyph kind={owner.facts.kind} />{catalog.types[owner.facts.kind]}</span><span className="oak-collapsed-title">{owner.title}</span><StatusRegion states={owner.states} /></NodeSelection><NodeNavigation {...context} node={owner} />
    </div>;
  }
  const route = model.routes.find(route => route.routeId === (owner?.kind === "route" ? owner.routeId : id));
  if (!route) return null;
  const content = <><span className="oak-collapsed-meta">{catalog.roles.connector} · {catalog.routes[route.mode]}</span><span className="oak-collapsed-title">{route.authored.summary ?? catalog.routes[route.mode]}</span>{owner?.kind === "route" && <StatusRegion states={owner.states} />}</>;
  return <div className="oak-collapsed-summary" data-owner-id={id}><span className="oak-semantic-mark"><Route size={18} strokeWidth={1.75} aria-hidden="true" /></span>{model.capabilities.selectRouteIds.includes(route.routeId) ? <button type="button" className="oak-row-selection" ref={bindings.owners.routeRef(id)} aria-pressed={route.selected} onClick={() => actions.selectRoute(route.routeId, "list")}>{content}</button> : <div className="oak-row-selection">{content}</div>}{route.navigationAvailable && model.capabilities.navigationOwnerIds.includes(route.routeId) && <button type="button" className="oak-control" aria-label={catalog.navigation.open} onClick={() => actions.openNavigation(route.routeId)}><Navigation size={18} strokeWidth={1.75} aria-hidden="true" /></button>}</div>;
}
