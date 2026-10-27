import { catalog } from "../copy/catalog.js";
import { Checklist } from "../details/OwnerDetails.js";
import type { NodeRowProps } from "./ItineraryTimeline.js";
import { NodeSelection, SelectedNodeDetails, UnresolvedLocation } from "./PrimaryRow.js";
import { RouteFacts } from "./RouteConnectorRow.js";
import { ownerStateAttributes, StatusRegion } from "./StatusRegion.js";

function TaskContent({ node, model }: NodeRowProps) {
  const place = node.capabilities.place ? model.places.find(place => place.ownerId === node.ownerId) : undefined;
  const unresolved = node.states.includes("unresolved") || place?.place.resolution.status === "unresolved";
  const timing = node.timing;
  return <>
    <span className="oak-task-lead">
      <span className="oak-row-time" data-scan="time">{timing.certainty === "unknown" ? catalog.timing.unknown : timing.start ?? catalog.timing.untimed}{timing.dayOffset !== undefined && timing.dayOffset !== 0 && <span>{catalog.timing.nextDay} {timing.dayOffset}</span>}</span>
      <span className="oak-row-title" data-scan="title">{node.title}</span>
    </span>
    <span className="oak-task-meta">
      {timing.certainty !== "unknown" && <span className="oak-support-timing" data-scan="timing">{timing.end && <span className="oak-row-time-end">{catalog.timing.end.replace("{time}", timing.end)}</span>}<span className="oak-row-time-certainty">{catalog.timing[timing.certainty]}</span></span>}
      {node.completion && <span className="oak-task-progress">{node.completion.completed ? catalog.progress.complete : catalog.progress.pending}</span>}
      {node.facts.kind !== "logistics" && <span className="oak-row-context" data-scan="context">{catalog.types[node.facts.kind]}</span>}
      <span className="oak-row-location" data-scan="location">{place ? <>{place.place.label !== node.title && `${place.place.label} · `}{!unresolved && (place.place.certainty === "unverified" ? catalog.facts.unverifiedLocation : catalog.certainty[place.place.certainty])}</> : node.incomingRouteIds.map(routeId => {
        const route = model.routes.find(route => route.routeId === routeId);
        return route ? <RouteFacts route={route} key={routeId} /> : null;
      })}{unresolved && <UnresolvedLocation />}</span>
      <StatusRegion states={node.states} />
    </span>
  </>;
}

export function TaskRow(props: NodeRowProps) {
  const halfChecklist = props.showDetails === false && props.node.states.includes("selected") && props.node.facts.kind === "logistics"
    ? props.node.facts.checklist : null;
  return <li className="oak-row oak-task-row" data-role="task" data-owner-id={props.node.ownerId} {...ownerStateAttributes(props.node.states)}>
    <div className="oak-support-summary"><NodeSelection {...props}><TaskContent {...props} /></NodeSelection></div>
    {halfChecklist && halfChecklist.length > 0 && <div className="oak-half-task-checklist"><Checklist items={halfChecklist} editableIds={props.model.capabilities.progress.completionIds} actions={props.actions} /></div>}
    <SelectedNodeDetails {...props} />
  </li>;
}
