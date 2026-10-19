import {
  useId,
  useState,
  type ReactNode,
  type RefCallback,
} from "react";

import {
  type Booking,
  type EffectiveNode,
  type RouteEdge,
  type ShoppingStatus,
  type Timing,
  type TripNode,
} from "@laugh-tale-island/core";

import type {
  ExperienceActions,
  ExperienceBindings,
  ExperienceRouteViewModel,
  ExperienceViewModel,
} from "../../controllers/presentation-contract";

function timingLabel(timing: Timing): string {
  if (timing.certainty === "unknown" || timing.start === undefined) return "Time not set";
  return timing.certainty === "suggested" ? `About ${timing.start}` : timing.start;
}

function bookingSummary(booking: Booking | undefined): string | undefined {
  if (booking === undefined || booking.status === "none") return undefined;
  return booking.status === "confirmed" ? "Booking confirmed" : "Booking pending";
}

function semanticContent(node: TripNode, completedChecklistIds: ReadonlySet<string>, shoppingStatuses: Readonly<Record<string, ShoppingStatus>>, selectedCandidateId?: string): ReactNode {
  const booking = bookingSummary(node.booking);
  switch (node.kind) {
    case "transport": return <span data-semantic="transport"><b>{node.payload.mode}</b>{node.payload.plan === undefined ? null : <> · {node.payload.plan}</>}{booking === undefined ? null : <> · {booking}</>}</span>;
    case "transfer": return <span data-semantic="transfer"><b>{node.payload.mode}{node.payload.terminal === undefined ? "" : ` · ${node.payload.terminal}`}</b>{booking === undefined ? null : <> · {booking}</>}</span>;
    case "lodging": return <span data-semantic="lodging"><b>{node.payload.role === "base" ? "Stay base" : node.payload.role === "return" ? "Return / drop bags" : node.payload.role === "check-in" ? "Check in" : "Check out"}</b>{node.place?.name === undefined ? null : <> · {node.place.name}</>}</span>;
    case "dining": return <span data-semantic="dining" data-choice-state={selectedCandidateId === undefined ? "available" : "committed"}><b>{selectedCandidateId === undefined ? (node.payload.candidateGroupId === undefined ? "Planned meal" : "Compare meal options") : `Selected · ${node.place?.name ?? node.title}`}</b>{node.payload.cuisine === undefined ? null : <> · {node.payload.cuisine}</>}</span>;
    case "shopping": {
      const complete = node.payload.items.filter((item) => {
        const status = Object.hasOwn(shoppingStatuses, item.id) ? shoppingStatuses[item.id] : item.initialStatus ?? "pending";
        return status === "purchased" || status === "skipped";
      }).length;
      return <span data-semantic="shopping"><b>{node.place?.name ?? "Shopping stop"}</b> · {complete} / {node.payload.items.length} complete</span>;
    }
    case "sightseeing": return <span data-semantic="sightseeing"><b>{node.place?.name ?? node.payload.area ?? node.title}</b>{node.payload.area === undefined || node.place?.name === undefined ? null : <> · {node.payload.area}</>}</span>;
    case "experience": return <span data-semantic="experience"><b>{node.payload.durationMinutes === undefined ? "Experience" : `${node.payload.durationMinutes} min experience`}</b>{booking === undefined ? null : <> · {booking}</>}</span>;
    case "logistics": return <span data-semantic="logistics"><b>{completedChecklistIds.size >= node.payload.checklist.length && node.payload.checklist.length > 0 ? "Completed" : "In progress"}</b> · {node.payload.checklist.filter(({ id }) => completedChecklistIds.has(id)).length} / {node.payload.checklist.length} steps complete</span>;
    case "custom": {
      const enabled = Object.entries(node.payload.capabilities).filter(([, value]) => value).map(([key]) => key).join(", ");
      return <span data-semantic="custom"><b>{node.payload.customKind}</b>{enabled.length === 0 ? null : <> · {enabled} enabled</>}</span>;
    }
  }
}

function detailItems(node: TripNode) {
  if (node.kind === "logistics") return node.payload.checklist;
  if (node.kind === "lodging") return node.payload.checklist ?? [];
  return [];
}

function urgencyFor(effective: EffectiveNode, currentNodeId: string | null, nextNodeId: string | null): "current" | "next" | "future" | "completed" {
  if (effective.sourceNodeId === currentNodeId) return "current";
  if (effective.sourceNodeId === nextNodeId) return "next";
  return effective.completed ? "completed" : "future";
}

function LiveStop({ effective, index, urgency, selected, progress, controlRef, onSelect }: {
  effective: EffectiveNode;
  index: number;
  urgency: ReturnType<typeof urgencyFor>;
  selected: boolean;
  progress: ExperienceViewModel["progress"];
  controlRef: RefCallback<HTMLElement>;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId().replaceAll(":", "");
  const detailsId = `live-stop-details-${id}`;
  const descriptionId = `live-stop-description-${id}`;
  const items = detailItems(effective.node);
  const completedChecklistIds = new Set(progress.completedIds.flatMap((value) => value.startsWith("checklist:") ? [value.slice("checklist:".length)] : []));
  return (
    <article className="live-stop" data-kind={effective.node.kind} data-urgency={urgency} data-completed-history={urgency === "completed" ? "true" : "false"} data-selected={selected ? "true" : "false"}>
      <button ref={controlRef} type="button" className="live-stop__owner" aria-label={`${timingLabel(effective.node.timing)} ${effective.node.title}`} aria-describedby={descriptionId} aria-pressed={selected} aria-current={urgency === "current" ? "step" : undefined} data-contract-owner="node" data-owner-id={effective.sourceNodeId} data-kind={effective.node.kind} data-urgency={urgency} data-completed={effective.completed ? "true" : "false"} data-touch-target="44" onClick={onSelect}>
        <span className="live-stop__index">{String(index + 1).padStart(2, "0")}</span>
        <span className="live-stop__time">{timingLabel(effective.node.timing)}</span>
        <span className="live-stop__copy"><strong>{effective.node.title}</strong><span id={descriptionId}>{semanticContent(effective.node, completedChecklistIds, progress.shoppingStatuses, effective.selectedCandidateId)}</span></span>
        <span className="live-stop__status">{urgency === "current" ? "NOW" : urgency === "next" ? "NEXT" : urgency === "completed" ? "DONE" : "UPCOMING"}</span>
      </button>
      {items.length >= 2 ? <button type="button" className="live-stop__disclosure" aria-label={`${expanded ? "Hide" : "Show"} ${effective.node.title} details`} aria-controls={detailsId} aria-expanded={expanded} data-touch-target="44" onClick={() => setExpanded((value) => !value)}>{expanded ? "−" : "+"}</button> : null}
      {items.length >= 2 ? <ul id={detailsId} hidden={!expanded} className="live-stop__details">{items.map((item) => <li key={item.id} data-completed={completedChecklistIds.has(item.id) ? "true" : "false"}>{item.title}</li>)}</ul> : null}
    </article>
  );
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

function LiveRoute({ route, destinationTiming, reducedMotion, controlRef, onSelect, onRetry }: {
  route: ExperienceRouteViewModel;
  destinationTiming: Timing | undefined;
  reducedMotion: boolean;
  controlRef: RefCallback<HTMLElement>;
  onSelect: (routeId: string) => void;
  onRetry: (routeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId().replaceAll(":", "");
  const detailsId = `live-route-details-${id}`;
  const state = route.loadState;
  const ready = state?.status === "ready" ? state : undefined;
  const validReady = ready !== undefined && ready.path.length >= 2 && ready.path.every(({ lat, lng }) => Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180);
  const canDisclose = validReady && route.edge.mode === "transit" && ready.steps.length > 0;
  const summary = routeSummary(route.edge, ready?.durationMinutes);
  const navigationHref = safeNavigationHref(route.navigationHref, route.edge);
  const label = route.edge.mode === "walking" ? "Walk" : route.edge.mode === "transit" ? "Transit" : route.edge.mode === "flight" ? "Flight" : "Drive";
  const progress = state === undefined ? "static" : state.status === "ready" ? "ready" : state.status === "loading" ? "loading" : "unavailable";
  return (
    <section className="live-route" data-route-source={route.edge.source} data-route-certainty={route.edge.certainty} data-route-progress={progress}>
      {state?.status === "loading" ? <div ref={controlRef} role="status" className="live-route__owner" data-contract-owner="route" data-owner-id={route.edge.id} data-route-owner={route.edge.id} data-state="loading"><span className="live-kicker">{label}</span><span>Loading route details</span><button type="button" data-contract-action="retry-route" data-touch-target="44" aria-label={`Retry ${label} route`} onClick={() => onRetry(route.edge.id)}>Retry</button></div> : state?.status === "unavailable" ? <div ref={controlRef} role="status" className="live-route__owner" data-contract-owner="route" data-owner-id={route.edge.id} data-route-owner={route.edge.id} data-state="error" data-contract-state="route-error"><span className="live-kicker">{label}</span><span>{summary}</span><span>{state.reason.trim().length > 0 ? state.reason : "Route provider unavailable"}</span><button type="button" data-contract-action="retry-route" data-touch-target="44" aria-label={`Retry ${label} route`} onClick={() => onRetry(route.edge.id)}>Retry</button></div> : validReady ? <button ref={controlRef} type="button" className="live-route__owner" aria-label={canDisclose && expanded ? `Hide ${label} details` : `${label} ${summary}`} aria-pressed={route.selected} {...(canDisclose ? { "aria-controls": detailsId, "aria-expanded": expanded } : {})} data-contract-owner="route" data-owner-id={route.edge.id} data-route-owner={route.edge.id} data-route-id={route.edge.id} data-state="ready" data-selected={route.selected ? "true" : "false"} data-touch-target="44" onClick={() => { onSelect(route.edge.id); if (canDisclose) setExpanded((value) => !value); }}><span className="live-kicker">{label}</span><span>{canDisclose && expanded ? "Transit details" : summary}</span><span className="live-route__state">{route.selected ? "ACTIVE" : "READY"}</span></button> : <div ref={controlRef} className="live-route__owner" data-contract-owner="route" data-owner-id={route.edge.id} data-route-owner={route.edge.id} data-state="static"><span className="live-kicker">{label}</span><span>{summary}</span><span>Static facts</span></div>}
      {canDisclose ? <div id={detailsId} hidden={!expanded} className="live-route__details" data-motion-duration={reducedMotion ? "0ms" : "200ms"}><span>{destinationTiming === undefined ? "Arrival time not set" : `Arrive ${timingLabel(destinationTiming)}`}</span><ol>{ready.steps.map((step, index) => <li key={`${index}:${step}`}>{step}</li>)}</ol></div> : null}
      {navigationHref === undefined || route.edge.navigation === undefined ? null : <a href={navigationHref} target="_blank" rel="noreferrer noopener" data-touch-target="44" aria-label={`Open ${label} directions from ${route.edge.navigation.origin.trim()} to ${route.edge.navigation.destination.trim()}`}>Open directions</a>}
    </section>
  );
}

export function LiveTimeline({ model, actions, bindings }: { model: ExperienceViewModel; actions: ExperienceActions; bindings: ExperienceBindings }) {
  const routesByFrom = new Map<string, ExperienceRouteViewModel[]>();
  for (const route of model.routes) routesByFrom.set(route.edge.fromNodeId, [...(routesByFrom.get(route.edge.fromNodeId) ?? []), route]);
  const renderedRoutes = new Set<string>();
  const effectiveById = new Map(model.effectiveDay.nodes.map((node) => [node.sourceNodeId, node]));
  const routeElement = (route: ExperienceRouteViewModel) => {
    renderedRoutes.add(route.edge.id);
    return <li key={`route:${route.edge.id}`} className="live-timeline__route"><LiveRoute route={route} destinationTiming={effectiveById.get(route.edge.toNodeId)?.node.timing} reducedMotion={model.motion === "reduced"} controlRef={bindings.owners.routeRef(route.edge.id)} onSelect={(routeId) => actions.selectRoute(routeId, "list")} onRetry={actions.retryRoute} /></li>;
  };
  return (
    <ol className="live-timeline" aria-label="Journey timeline" data-contract-state="live-timeline" data-completed-history="present">
      {model.effectiveDay.nodes.flatMap((effective, index) => {
        const urgency = urgencyFor(effective, model.live.currentNodeId, model.live.nextNodeId);
        const node = <li key={`node:${effective.sourceNodeId}`}><LiveStop effective={effective} index={index} urgency={urgency} selected={model.selection.nodeId === effective.sourceNodeId} progress={model.progress} controlRef={bindings.owners.nodeRef(effective.sourceNodeId)} onSelect={() => actions.selectNode(effective.sourceNodeId)} /></li>;
        return [node, ...(routesByFrom.get(effective.sourceNodeId) ?? []).map(routeElement)];
      })}
      {model.routes.filter((route) => !renderedRoutes.has(route.edge.id)).map(routeElement)}
    </ol>
  );
}
