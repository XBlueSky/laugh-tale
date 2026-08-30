import { useId, useState, type ReactNode, type RefCallback } from "react";

import { type Booking, type EffectiveNode, type RouteEdge, type Timing, type TripNode } from "@laugh-tale-island/core";

import { StatusLamp } from "./StatusLamp";
import type { ExperienceActions, ExperienceBindings, ExperienceRouteViewModel, ExperienceViewModel } from "../../controllers/presentation-contract";

function timingLabel(timing: Timing): string {
  if (timing.certainty === "unknown" || timing.start === undefined) return "Time not set";
  return timing.certainty === "suggested" ? `About ${timing.start}` : timing.start;
}

function bookingLabel(booking: Booking | undefined): string | undefined {
  if (booking === undefined || booking.status === "none") return undefined;
  return booking.status === "confirmed" ? "Booking confirmed" : "Booking pending";
}

function semanticContent(node: TripNode, progress: ExperienceViewModel["progress"]): ReactNode {
  const booking = bookingLabel(node.booking);
  switch (node.kind) {
    case "transport": return <span data-semantic="transport"><b>{node.payload.mode}</b>{node.payload.plan === undefined ? null : <> · {node.payload.plan}</>}{booking === undefined ? null : <> · {booking}</>}</span>;
    case "transfer": return <span data-semantic="transfer"><b>{node.payload.mode}{node.payload.terminal === undefined ? "" : ` · ${node.payload.terminal}`}</b>{booking === undefined ? null : <> · {booking}</>}</span>;
    case "lodging": return <span data-semantic="lodging"><b>{node.payload.role === "base" ? "Stay base" : node.payload.role === "return" ? "Return / drop bags" : node.payload.role === "check-in" ? "Check in" : "Check out"}</b>{node.place?.name === undefined ? null : <> · {node.place.name}</>}</span>;
    case "dining": return <span data-semantic="dining"><b>{node.payload.candidateGroupId === undefined ? "Planned meal" : "Compare meal options"}</b>{node.payload.cuisine === undefined ? null : <> · {node.payload.cuisine}</>}</span>;
    case "shopping": return <span data-semantic="shopping"><b>{node.place?.name ?? "Shopping stop"}</b> · {node.payload.items.filter((item) => ["purchased", "skipped"].includes(progress.shoppingStatuses[item.id] ?? item.initialStatus ?? "pending")).length} / {node.payload.items.length} complete</span>;
    case "sightseeing": return <span data-semantic="sightseeing"><b>{node.place?.name ?? node.payload.area ?? node.title}</b>{node.payload.area === undefined || node.place?.name === undefined ? null : <> · {node.payload.area}</>}</span>;
    case "experience": return <span data-semantic="experience"><b>{node.payload.durationMinutes === undefined ? "Experience" : `${node.payload.durationMinutes} min experience`}</b>{booking === undefined ? null : <> · {booking}</>}</span>;
    case "logistics": return <span data-semantic="logistics"><b>{node.payload.checklist.every(({ id }) => progress.completedIds.includes(`checklist:${id}`)) ? "Complete" : "In progress"}</b> · {node.payload.checklist.filter(({ id }) => progress.completedIds.includes(`checklist:${id}`)).length} / {node.payload.checklist.length} steps</span>;
    case "custom": return <span data-semantic="custom"><b>{node.payload.customKind}</b></span>;
  }
}

function detailItems(node: TripNode) {
  if (node.kind === "logistics") return node.payload.checklist;
  if (node.kind === "lodging") return node.payload.checklist ?? [];
  return [];
}

function ChannelEntry({ effective, index, current, selected, progress, controlRef, onSelect }: { effective: EffectiveNode; index: number; current: boolean; selected: boolean; progress: ExperienceViewModel["progress"]; controlRef: RefCallback<HTMLElement>; onSelect: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId().replaceAll(":", "");
  const detailsId = `instrument-details-${id}`;
  const items = detailItems(effective.node);
  const status = effective.completed ? "complete" : current ? "active" : "ready";
  return <article className="channel-entry" data-kind={effective.node.kind} data-current={current ? "true" : "false"} data-completed={effective.completed ? "true" : "false"} data-status-lamp={status} data-status-text={current ? "Current channel" : effective.completed ? "Completed channel" : "Upcoming channel"}>
    <button ref={controlRef} type="button" className="channel-entry__owner" aria-label={`${timingLabel(effective.node.timing)} ${effective.node.title}`} aria-current={current ? "step" : undefined} aria-pressed={selected} data-contract-owner="node" data-owner-id={effective.sourceNodeId} data-kind={effective.node.kind} data-current={current ? "true" : "false"} data-completed={effective.completed ? "true" : "false"} data-touch-target="44" onClick={onSelect}>
      <span className="channel-entry__index">{String(index + 1).padStart(2, "0")}</span>
      <span className="channel-entry__time">{timingLabel(effective.node.timing)}</span>
      <span className="channel-entry__copy"><strong>{effective.node.title}</strong><span>{semanticContent(effective.node, progress)}</span></span>
      <StatusLamp status={status} label={current ? "Now" : effective.completed ? "Done" : "Ready"} />
    </button>
    {items.length >= 2 ? <button type="button" className="channel-entry__details-button" aria-label={`${expanded ? "Hide" : "Show"} ${effective.node.title} details`} aria-controls={detailsId} aria-expanded={expanded} data-touch-target="44" onClick={() => setExpanded((value) => !value)}>{expanded ? "−" : "+"}</button> : null}
    {items.length >= 2 ? <ul id={detailsId} hidden={!expanded} className="channel-entry__details">{items.map((item) => <li key={item.id}>{item.title}</li>)}</ul> : null}
  </article>;
}

function routeSummary(edge: RouteEdge, readyMinutes: number | undefined): string {
  if (readyMinutes !== undefined && Number.isFinite(readyMinutes) && readyMinutes >= 0) return `${edge.mode} · ${readyMinutes} min`;
  if (edge.summary !== undefined) return edge.certainty === "confirmed" || edge.summary.trimStart().startsWith("About ") ? edge.summary : `About ${edge.summary}`;
  if (edge.durationMinutes !== undefined) return `${edge.mode} · ${edge.certainty === "confirmed" ? "" : "About "}${edge.durationMinutes} min`;
  return edge.mode;
}

function safeNavigationHref(href: string | undefined, edge: RouteEdge): string | undefined {
  if (href === undefined || edge.navigation === undefined || edge.mode === "flight") return undefined;
  try { const url = new URL(href); return url.protocol === "https:" ? url.href : undefined; } catch { return undefined; }
}

function ChannelRoute({ route, destinationTiming, controlRef, onSelect, onRetry }: { route: ExperienceRouteViewModel; destinationTiming: Timing | undefined; controlRef: RefCallback<HTMLElement>; onSelect: (id: string) => void; onRetry: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId().replaceAll(":", "");
  const detailsId = `instrument-route-details-${id}`;
  const state = route.loadState;
  const ready = state?.status === "ready" ? state : undefined;
  const validReady = ready !== undefined && ready.path.length >= 2 && ready.path.every(({ lat, lng }) => Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180);
  const transitDetails = validReady && route.edge.mode === "transit" && ready.steps.length > 0;
  const summary = routeSummary(route.edge, ready?.durationMinutes);
  const navHref = safeNavigationHref(route.navigationHref, route.edge);
  const label = route.edge.mode === "walking" ? "WALK" : route.edge.mode === "transit" ? "RIDE" : route.edge.mode === "flight" ? "FLY" : "MOVE";
  return <section className="channel-route" data-route-source={route.edge.source} data-route-certainty={route.edge.certainty} data-route-progress={state === undefined ? "static" : state.status === "ready" ? "ready" : state.status === "loading" ? "loading" : "unavailable"}>
    {state?.status === "loading" ? <div ref={controlRef} className="channel-route__owner" role="status" data-contract-owner="route" data-owner-id={route.edge.id} data-route-owner={route.edge.id} data-state="loading"><span className="instrument-kicker">{label}</span><span>Loading route</span><button type="button" data-contract-action="retry-route" data-touch-target="44" onClick={() => onRetry(route.edge.id)}>Retry</button></div> : state?.status === "unavailable" ? <div ref={controlRef} className="channel-route__owner" role="status" data-contract-owner="route" data-owner-id={route.edge.id} data-route-owner={route.edge.id} data-state="error" data-contract-state="route-error"><span className="instrument-kicker">{label}</span><span>{summary}</span><span>{state.reason.trim().length > 0 ? state.reason : "Route unavailable"}</span><button type="button" data-contract-action="retry-route" data-touch-target="44" onClick={() => onRetry(route.edge.id)}>Retry</button></div> : validReady ? <button ref={controlRef} type="button" className="channel-route__owner" aria-label={transitDetails && expanded ? `Hide ${label} details` : `${label} ${summary}`} aria-pressed={route.selected} {...(transitDetails ? { "aria-controls": detailsId, "aria-expanded": expanded } : {})} data-contract-owner="route" data-owner-id={route.edge.id} data-route-owner={route.edge.id} data-state="ready" data-selected={route.selected ? "true" : "false"} data-touch-target="44" onClick={() => { onSelect(route.edge.id); if (transitDetails) setExpanded((value) => !value); }}><span className="instrument-kicker">{label}</span><span>{transitDetails && expanded ? "Transit details" : summary}</span><StatusLamp status={route.selected ? "active" : "ready"} label={route.selected ? "Active" : "Ready"} /></button> : <div ref={controlRef} className="channel-route__owner" data-contract-owner="route" data-owner-id={route.edge.id} data-route-owner={route.edge.id} data-state="static"><span className="instrument-kicker">{label}</span><span>{summary}</span><span>Static facts</span></div>}
    {transitDetails ? <div id={detailsId} hidden={!expanded} className="channel-route__details">{destinationTiming === undefined ? null : <span>Arrive {timingLabel(destinationTiming)}</span>}<ol>{ready.steps.map((step, index) => <li key={`${index}:${step}`}>{step}</li>)}</ol></div> : null}
    {navHref === undefined || route.edge.navigation === undefined ? null : <a href={navHref} target="_blank" rel="noreferrer noopener" data-touch-target="44" aria-label={`Open ${label} directions from ${route.edge.navigation.origin.trim()} to ${route.edge.navigation.destination.trim()}`}>Open directions</a>}
  </section>;
}

export function ChannelStrip({ model, actions, bindings }: { model: ExperienceViewModel; actions: ExperienceActions; bindings: ExperienceBindings }) {
  const routesByFrom = new Map<string, ExperienceRouteViewModel[]>();
  for (const route of model.routes) routesByFrom.set(route.edge.fromNodeId, [...(routesByFrom.get(route.edge.fromNodeId) ?? []), route]);
  const renderedRoutes = new Set<string>();
  const effectiveById = new Map(model.effectiveDay.nodes.map((node) => [node.sourceNodeId, node]));
  const routeElement = (route: ExperienceRouteViewModel) => { renderedRoutes.add(route.edge.id); return <li key={`route:${route.edge.id}`} className="channel-strip__route"><ChannelRoute route={route} destinationTiming={effectiveById.get(route.edge.toNodeId)?.node.timing} controlRef={bindings.owners.routeRef(route.edge.id)} onSelect={(routeId) => actions.selectRoute(routeId, "list")} onRetry={actions.retryRoute} /></li>; };
  return <ol className="channel-strip" aria-label="Itinerary channel strip" data-contract-state="channel-strip">{model.effectiveDay.nodes.flatMap((effective, index) => { const node = <li key={`node:${effective.sourceNodeId}`}><ChannelEntry effective={effective} index={index} current={model.live.currentNodeId === effective.sourceNodeId} selected={model.selection.nodeId === effective.sourceNodeId} progress={model.progress} controlRef={bindings.owners.nodeRef(effective.sourceNodeId)} onSelect={() => actions.selectNode(effective.sourceNodeId)} /></li>; return [node, ...(routesByFrom.get(effective.sourceNodeId) ?? []).map(routeElement)]; })}{model.routes.filter((route) => !renderedRoutes.has(route.edge.id)).map(routeElement)}</ol>;
}
