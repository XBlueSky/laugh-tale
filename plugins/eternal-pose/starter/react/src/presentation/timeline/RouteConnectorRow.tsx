import type { ExperienceRouteModel, TimelineRouteEntryModel } from "@laugh-tale-island/react";
import { catalog } from "../copy/catalog.js";
import { InlineProviderState } from "../states/InlineProviderState.js";
import { MotionDisclosure } from "../details/MotionDisclosure.js";
import type { TimelineContext } from "./ItineraryTimeline.js";
import { ownerStateAttributes, StatusRegion } from "./StatusRegion.js";

export function RouteFacts({ route, connector = false }: { route: ExperienceRouteModel; connector?: boolean }) {
  const facts = route.runtime.status === "ready" ? route.runtime : route.authored;
  const mode = <span className={connector ? "oak-route-mode" : undefined}>{catalog.routes[route.mode]}</span>;
  const source = <span>{catalog.routes[route.source]} · {catalog.certainty[route.certainty]}</span>;
  const duration = facts.durationMinutes !== undefined && <span className={connector ? "oak-route-duration" : undefined}>{catalog.routes.duration.replace("{duration}", String(facts.durationMinutes))}</span>;
  const distance = facts.distanceMeters !== undefined && <span className={connector ? "oak-route-distance" : undefined}>{catalog.routes.distance.replace("{distance}", catalog.facts.meters.replace("{distance}", String(facts.distanceMeters)))}</span>;
  const summary = route.runtime.status !== "ready" && route.authored.summary && <span>{route.authored.summary}</span>;
  const fallback = route.runtime.status !== "ready" && (route.authored.summary !== undefined || route.authored.durationMinutes !== undefined || route.authored.distanceMeters !== undefined) && <span>{catalog.routes.authoredFallback}</span>;
  return <span className="oak-route-facts" data-route-state={route.runtime.status}>
    {connector ? <><span className="oak-route-movement">{mode}{duration}{distance}</span>{summary && <span className="oak-route-summary">{summary}</span>}</> : <>{mode}{source}{duration}{distance}{summary}{fallback}</>}
  </span>;
}
export function RouteDetails({ route, model, actions }: TimelineContext & { route: ExperienceRouteModel }) {
  const canNavigate = route.navigationAvailable && model.capabilities.navigationOwnerIds.includes(route.routeId);
  const state = route.runtime.status === "unavailable" ? route.runtime : { status: route.runtime.status, retryable: false as const };
  return <div className="oak-owner-details oak-route-details" data-details-owner={route.routeId}>
    <p className="oak-route-evidence">{catalog.routes[route.source]} · {catalog.certainty[route.certainty]}{route.runtime.status !== "ready" && (route.authored.summary !== undefined || route.authored.durationMinutes !== undefined || route.authored.distanceMeters !== undefined) && <> · {catalog.routes.authoredFallback}</>}</p>
    <InlineProviderState channel="routes" state={state} onRetry={model.capabilities.retryRouteIds.includes(route.routeId) ? () => actions.retryProvider("route", route.routeId) : undefined} />
    {route.runtime.status === "ready" && <>
      <ul className="oak-transit-lines">{route.runtime.transitLines.map((line, index) => <li key={index}>{line.name} {line.shortName}</li>)}</ul>
      {route.runtime.steps.length > 0 && <><h3>{catalog.routes.steps}</h3><ol>{route.runtime.steps.map((step, index) => <li key={index}>{step}</li>)}</ol></>}
    </>}
    {canNavigate && <button type="button" className="oak-control" onClick={() => actions.openNavigation(route.routeId)}>{catalog.routes.external}</button>}
  </div>;
}
export function RouteConnectorRow({ entry, ...context }: TimelineContext & { entry: TimelineRouteEntryModel }) {
  const route = context.model.routes.find(route => route.routeId === entry.routeId);
  const contents = <>{route ? <RouteFacts route={route} connector /> : <span>{catalog.routes.noDetails}</span>}<StatusRegion states={entry.states} /></>;
  return <li className="oak-row oak-connector-row" data-role="connector" data-owner-id={entry.ownerId} {...ownerStateAttributes(entry.states)}>
    {context.model.capabilities.selectRouteIds.includes(entry.routeId) ? <button type="button" className="oak-route-selection" ref={context.bindings.owners.routeRef(entry.ownerId)} aria-pressed={route?.selected ?? entry.states.includes("selected")} onClick={() => context.actions.selectRoute(entry.routeId, "list")}>{contents}</button> : <div className="oak-route-selection">{contents}</div>}
    <MotionDisclosure open={!!route?.selected && context.showDetails !== false}>{route && <RouteDetails route={route} {...context} />}</MotionDisclosure>
  </li>;
}
