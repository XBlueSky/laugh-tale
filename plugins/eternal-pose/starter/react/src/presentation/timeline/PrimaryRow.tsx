import { Navigation } from "lucide-react";
import type { ReactNode } from "react";
import { catalog, locale } from "../copy/catalog.js";
import { OwnerDetails } from "../details/OwnerDetails.js";
import { MotionDisclosure } from "../details/MotionDisclosure.js";
import type { NodeRowProps } from "./ItineraryTimeline.js";
import { SemanticMark, TypeGlyph } from "./SemanticMark.js";
import { ownerStateAttributes, StatusRegion } from "./StatusRegion.js";
import { RouteFacts } from "./RouteConnectorRow.js";

// The recipe's materialized locale is immutable; reuse ICU data across rows
// and owner-selection renders without changing their accessible date copy.
const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" });
const formatDate = (date: string) => dateFormat.format(new Date(`${date}T00:00:00Z`));

export function NodeContent({ node, model }: NodeRowProps) {
  const timing = node.timing;
  return <>
    <span className="oak-row-time" data-scan="time">
      {timing.certainty === "unknown" ? catalog.timing.unknown : timing.start ?? catalog.timing.untimed}
      {timing.dayOffset !== undefined && timing.dayOffset !== 0 && <span>{catalog.timing.nextDay} {timing.dayOffset}</span>}
    </span>
    <span className="oak-row-title" data-scan="title">{node.title}</span>
    <span className="oak-support-meta">
      {timing.certainty !== "unknown" && <span className="oak-support-timing" data-scan="timing">
        {timing.end && <span className="oak-row-time-end">{catalog.timing.end.replace("{time}", timing.end)}</span>}
        <span className="oak-row-time-certainty">{catalog.timing[timing.certainty]}</span>
      </span>}
      <NodeFacts node={node} model={model} />
    </span>
  </>;
}
export function UnresolvedLocation() {
  const label = catalog.facts.unverifiedLocation;
  const consequence = catalog.facts.unverifiedLocationConsequence;
  if (!consequence.startsWith(label)) return <span>{consequence}</span>;
  return <span>{label}<span className="oak-location-consequence">{consequence.slice(label.length)}</span></span>;
}
function NodeFacts({ node, model }: Pick<NodeRowProps, "node" | "model">) {
  const place = node.capabilities.place ? model.places.find(place => place.ownerId === node.ownerId) : undefined;
  const unresolved = node.states.includes("unresolved") || place?.place.resolution.status === "unresolved";
  const facts = <>
    <span className="oak-row-context" data-scan="context"><TypeGlyph kind={node.facts.kind} />{catalog.types[node.facts.kind]}</span>
    <span className="oak-row-location" data-scan="location">{place ? <>{place.place.label !== node.title && `${place.place.label} · `}{!unresolved && catalog.certainty[place.place.certainty]}</> : node.incomingRouteIds.map(routeId => {
      const route = model.routes.find(route => route.routeId === routeId);
      return route ? <RouteFacts key={routeId} route={route} /> : null;
    })}{unresolved && <UnresolvedLocation />}</span>
  </>;
  return <>
    {unresolved ? <span className="oak-unresolved-facts">{facts}</span> : facts}
    <StatusRegion states={node.states} />
  </>;
}
function PrimaryContent({ node, model }: NodeRowProps) {
  const timing = node.timing;
  return <>
    <span className="oak-row-time" data-scan="time">
      {timing.certainty === "unknown" ? catalog.timing.unknown : timing.start ?? catalog.timing.untimed}
      {timing.dayOffset !== undefined && timing.dayOffset !== 0 && <span>{catalog.timing.nextDay} {timing.dayOffset}</span>}
    </span>
    <span className="oak-row-title" data-scan="title">{node.title}</span>
    <span className="oak-primary-meta">
      {timing.certainty !== "unknown" && <span className="oak-primary-timing">
        {timing.end && <span className="oak-row-time-end">{catalog.timing.end.replace("{time}", timing.end)}</span>}
        <span className="oak-row-time-certainty">{catalog.timing[timing.certainty]}</span>
      </span>}
      <NodeFacts node={node} model={model} />
    </span>
  </>;
}
export function NodeSelection(props: NodeRowProps & { children?: ReactNode }) {
  const { node, model, actions, bindings, children } = props;
  const content = <>{children ?? <NodeContent {...props} />}{node.timing.date && <span className="oak-visually-hidden"> · {formatDate(node.timing.date)}{node.timing.endDate && node.timing.end && <> · {catalog.timing.end.replace("{time}", `${formatDate(node.timing.endDate)} ${node.timing.end}`)}</>}</span>}</>;
  return node.capabilities.select && model.capabilities.selectNodeIds.includes(node.nodeId)
    ? <button className="oak-row-selection" type="button" ref={bindings.owners.nodeRef(node.ownerId)} aria-pressed={node.states.includes("selected")} onClick={() => actions.selectNode(node.nodeId)}>{content}</button>
    : <div className="oak-row-selection">{content}</div>;
}
export function NodeNavigation({ node, model, actions }: NodeRowProps) {
  const place = node.capabilities.place ? model.places.find(place => place.ownerId === node.ownerId) : undefined;
  if (!place?.navigationAvailable || place.place.resolution.status !== "resolved" || node.states.includes("unresolved") || !model.capabilities.navigationOwnerIds.includes(node.ownerId)) return null;
  return <button type="button" className="oak-control oak-row-action" aria-label={catalog.navigation.open} onClick={() => actions.openNavigation(node.ownerId)}><Navigation size={18} strokeWidth={1.75} aria-hidden="true" /></button>;
}
export function SelectedNodeDetails(props: NodeRowProps) {
  const { node, model, actions } = props;
  const open = props.showDetails !== false && node.states.includes("selected");
  const restore = !open && node.states.includes("skipped") && node.capabilities.skip && model.capabilities.progress.skippableNodeIds.includes(node.nodeId);
  return <>
    <MotionDisclosure open={open}><OwnerDetails {...props} /></MotionDisclosure>
    {restore && <div className="oak-restore-action"><button type="button" className="oak-control" aria-label={`${catalog.progress.restore} · ${node.title}`} onClick={() => actions.updateProgress({ kind: "node-skipped", nodeId: node.nodeId, skipped: false })}>{catalog.progress.restore}</button></div>}
  </>;
}
export function PrimaryRow(props: NodeRowProps) {
  return <li className="oak-row oak-primary-row" data-role="primary" data-owner-id={props.node.ownerId} {...ownerStateAttributes(props.node.states)}>
    <div className="oak-primary-summary"><SemanticMark node={props.node} /><NodeSelection {...props}><PrimaryContent {...props} /></NodeSelection><NodeNavigation {...props} /></div>
    <SelectedNodeDetails {...props} />
  </li>;
}
