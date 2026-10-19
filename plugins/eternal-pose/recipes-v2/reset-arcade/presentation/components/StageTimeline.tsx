import {
  useCallback,
  useEffect,
  useId,
  useRef,
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

function semanticContent(
  node: TripNode,
  state: {
    completed: boolean;
    completedChecklistIds: ReadonlySet<string>;
    shoppingStatuses: Readonly<Record<string, ShoppingStatus>>;
    selectedCandidateId?: string;
  },
): ReactNode {
  const booking = bookingSummary(node.booking);
  switch (node.kind) {
    case "transport":
      return <span data-semantic="transport"><b>{node.payload.mode}</b>{node.payload.plan === undefined ? null : <> · {node.payload.plan}</>}{booking === undefined ? null : <> · {booking}</>}</span>;
    case "transfer":
      return <span data-semantic="transfer"><b>{node.payload.mode}{node.payload.terminal === undefined ? "" : ` · ${node.payload.terminal}`}</b>{booking === undefined ? null : <> · {booking}</>}</span>;
    case "lodging":
      return <span data-semantic="lodging"><b>{node.payload.role === "base" ? "Stay base" : node.payload.role === "return" ? "Return / drop bags" : node.payload.role === "check-in" ? "Check in" : "Check out"}</b>{node.place?.name === undefined ? null : <> · {node.place.name}</>}</span>;
    case "dining":
      return <span data-semantic="dining" data-choice-state={state.selectedCandidateId === undefined ? "available" : "committed"}><b>{state.selectedCandidateId === undefined ? (node.payload.candidateGroupId === undefined ? "Planned meal" : "Compare meal options") : `Selected · ${node.place?.name ?? node.title}`}</b>{node.payload.cuisine === undefined ? null : <> · {node.payload.cuisine}</>}</span>;
    case "shopping": {
      const completed = node.payload.items.filter((item) => {
        const status = Object.hasOwn(state.shoppingStatuses, item.id) ? state.shoppingStatuses[item.id] : item.initialStatus ?? "pending";
        return status === "purchased" || status === "skipped";
      }).length;
      return <span data-semantic="shopping" data-shopping-terminal-count={completed}><b>{node.place?.name ?? "Shopping stop"}</b> · {completed} / {node.payload.items.length} complete</span>;
    }
    case "sightseeing":
      return <span data-semantic="sightseeing"><b>{node.place?.name ?? node.payload.area ?? node.title}</b>{node.payload.area === undefined || node.place?.name === undefined ? null : <> · {node.payload.area}</>}</span>;
    case "experience":
      return <span data-semantic="experience"><b>{node.payload.durationMinutes === undefined ? "Experience" : `${node.payload.durationMinutes} min experience`}</b>{booking === undefined ? null : <> · {booking}</>}</span>;
    case "logistics": {
      const completed = node.payload.checklist.filter(({ id }) => state.completedChecklistIds.has(id)).length;
      return <span data-semantic="logistics"><b>{state.completed ? "Completed" : "In progress"}</b> · {completed} / {node.payload.checklist.length} steps complete</span>;
    }
    case "custom": {
      const enabled = Object.entries(node.payload.capabilities).filter(([, value]) => value).map(([key]) => key).join(", ");
      return <span data-semantic="custom"><b>{node.payload.customKind}</b>{enabled.length === 0 ? null : <> · {enabled} enabled</>}</span>;
    }
  }
}

function disclosureItems(node: TripNode) {
  if (node.kind === "logistics") return node.payload.checklist;
  if (node.kind === "lodging") return node.payload.checklist ?? [];
  return [];
}

function ArcadeStop({
  effective,
  index,
  selected,
  current,
  progress,
  controlRef,
  registerLocalOwner,
  onSelect,
}: {
  effective: EffectiveNode;
  index: number;
  selected: boolean;
  current: boolean;
  progress: ExperienceViewModel["progress"];
  controlRef: RefCallback<HTMLElement>;
  registerLocalOwner: (nodeId: string, element: HTMLElement | null) => void;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId().replaceAll(":", "");
  const detailsId = `arcade-stop-details-${id}`;
  const descriptionId = `arcade-stop-description-${id}`;
  const items = disclosureItems(effective.node);
  const canDisclose = items.length >= 2;
  const completedChecklistIds = new Set(
    progress.completedIds.flatMap((value) => value.startsWith("checklist:") ? [value.slice("checklist:".length)] : []),
  );
  const composedControlRef = useCallback((element: HTMLElement | null) => {
    registerLocalOwner(effective.sourceNodeId, element);
    controlRef(element);
  }, [controlRef, effective.sourceNodeId, registerLocalOwner]);

  return (
    <article className="arcade-stop" data-kind={effective.node.kind} data-current={current ? "true" : "false"} data-selected={selected ? "true" : "false"} data-completed={effective.completed ? "true" : "false"} data-map-token={String(index + 1).padStart(2, "0")}>
      <button
        ref={composedControlRef}
        type="button"
        className="arcade-stop__owner pressed-state"
        aria-label={`${timingLabel(effective.node.timing)} ${effective.node.title}`}
        aria-describedby={descriptionId}
        aria-pressed={selected}
        aria-current={current ? "step" : undefined}
        data-contract-owner="node"
        data-owner-id={effective.sourceNodeId}
        data-kind={effective.node.kind}
        data-completed={effective.completed ? "true" : "false"}
        data-touch-target="44"
        onClick={onSelect}
      >
        <span className="mission-number">{String(index + 1).padStart(2, "0")}</span>
        <span className="arcade-stop__time">{timingLabel(effective.node.timing)}</span>
        <span className="arcade-stop__body">
          <strong>{effective.node.title}</strong>
          <span id={descriptionId}>{semanticContent(effective.node, { completed: effective.completed, completedChecklistIds, shoppingStatuses: progress.shoppingStatuses, ...(effective.selectedCandidateId === undefined ? {} : { selectedCandidateId: effective.selectedCandidateId }) })}</span>
        </span>
      </button>
      {canDisclose ? (
        <button type="button" className="arcade-stop__disclosure" aria-label={`${expanded ? "Hide" : "Show"} ${effective.node.title} details`} aria-controls={detailsId} aria-expanded={expanded} data-touch-target="44" onClick={() => setExpanded((value) => !value)}>{expanded ? "−" : "+"}</button>
      ) : null}
      {canDisclose ? (
        <ul id={detailsId} className="arcade-stop__details" hidden={!expanded}>
          {items.map((item) => <li key={item.id} data-completed={completedChecklistIds.has(item.id) ? "true" : "false"}>{item.title}</li>)}
        </ul>
      ) : null}
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
  try {
    const url = new URL(href);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function ArcadeRouteBand({
  route,
  destinationTiming,
  reducedMotion,
  controlRef,
  onSelect,
  onRetry,
}: {
  route: ExperienceRouteViewModel;
  destinationTiming: Timing | undefined;
  reducedMotion: boolean;
  controlRef: RefCallback<HTMLElement>;
  onSelect: (routeId: string) => void;
  onRetry: (routeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId().replaceAll(":", "");
  const detailsId = `arcade-route-details-${id}`;
  const state = route.loadState;
  const ready = state?.status === "ready" ? state : undefined;
  const validReady = ready !== undefined && ready.path.length >= 2 && ready.path.every(({ lat, lng }) => Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180);
  const canDisclose = validReady && route.edge.mode === "transit" && ready.steps.length > 0;
  const summary = routeSummary(route.edge, ready?.durationMinutes);
  const navigationHref = safeNavigationHref(route.navigationHref, route.edge);
  const label = route.edge.mode === "walking" ? "WALK" : route.edge.mode === "transit" ? "RIDE" : route.edge.mode === "flight" ? "FLY" : "MOVE";

  return (
    <section className="arcade-route-shell" data-route-certainty={route.edge.certainty} data-route-source={route.edge.source}>
      {state?.status === "loading" ? (
        <div ref={controlRef} className="arcade-route-band" role="status" aria-label="Loading route" data-contract-owner="route" data-owner-id={route.edge.id} data-route-owner={route.edge.id} data-state="loading">
          <span className="arcade-key">{label}</span><span>Loading route</span><button type="button" aria-label="Retry route" data-contract-action="retry-route" data-touch-target="44" onClick={() => onRetry(route.edge.id)}>Retry</button>
        </div>
      ) : state?.status === "unavailable" ? (
        <div ref={controlRef} className="arcade-route-band" role="status" aria-label="Route unavailable" data-contract-owner="route" data-owner-id={route.edge.id} data-route-owner={route.edge.id} data-state="error" data-contract-state="route-error">
          <span className="arcade-key">{label}</span><span>{summary}</span><span className="arcade-route-band__error">{state.reason.trim().length > 0 ? state.reason : "Route provider unavailable"}</span><button type="button" aria-label="Retry route" data-contract-action="retry-route" data-touch-target="44" onClick={() => onRetry(route.edge.id)}>Retry</button>
        </div>
      ) : validReady ? (
        <button ref={controlRef} type="button" className="arcade-route-band" aria-label={expanded && canDisclose ? "Hide transit route details" : summary} aria-pressed={route.selected} {...(canDisclose ? { "aria-controls": detailsId, "aria-expanded": expanded } : {})} data-contract-owner="route" data-owner-id={route.edge.id} data-route-id={route.edge.id} data-route-owner={route.edge.id} data-selected={route.selected ? "true" : "false"} data-selection-source={route.selectionSource ?? undefined} data-state="ready" data-touch-target="44" onClick={() => { onSelect(route.edge.id); if (canDisclose) setExpanded((value) => !value); }}>
          <span className="arcade-key">{label}</span><span>{expanded && canDisclose ? "Transit details" : summary}</span><span aria-hidden="true">{route.selected ? "●" : "○"}</span>
        </button>
      ) : (
        <div ref={controlRef} className="arcade-route-band" data-contract-owner="route" data-owner-id={route.edge.id} data-route-owner={route.edge.id} data-state="static"><span className="arcade-key">{label}</span><span>{summary}</span></div>
      )}
      {canDisclose ? (
        <div id={detailsId} className="arcade-route-details" hidden={!expanded} aria-hidden={!expanded} data-motion-duration={reducedMotion ? "0ms" : "180ms"}>
          {destinationTiming === undefined ? null : <span>Arrive {timingLabel(destinationTiming)}</span>}
          <ol>{ready.steps.map((step, index) => <li key={`${index}:${step}`}>{step}</li>)}</ol>
        </div>
      ) : null}
      {navigationHref === undefined || route.edge.navigation === undefined ? null : <a href={navigationHref} target="_blank" rel="noreferrer noopener" aria-label={`Open ${route.edge.mode} directions from ${route.edge.navigation.origin.trim()} to ${route.edge.navigation.destination.trim()}`} data-touch-target="44">Open directions</a>}
    </section>
  );
}

export function StageTimeline({ model, actions, bindings }: { model: ExperienceViewModel; actions: ExperienceActions; bindings: ExperienceBindings }) {
  const nodeElementsRef = useRef(new Map<string, HTMLElement>());
  const registerLocalOwner = useCallback((nodeId: string, element: HTMLElement | null) => {
    if (element === null) nodeElementsRef.current.delete(nodeId);
    else nodeElementsRef.current.set(nodeId, element);
  }, []);

  useEffect(() => {
    if (model.selection.nodeId === null) return;
    nodeElementsRef.current.get(model.selection.nodeId)?.scrollIntoView?.({ block: "nearest" });
  }, [model.effectiveDay.day.id, model.selection.nodeId, model.selection.source, model.sheet.snap]);

  const routesByFrom = new Map<string, ExperienceRouteViewModel[]>();
  for (const route of model.routes) {
    const existing = routesByFrom.get(route.edge.fromNodeId) ?? [];
    existing.push(route);
    routesByFrom.set(route.edge.fromNodeId, existing);
  }
  const renderedRoutes = new Set<string>();
  const effectiveById = new Map(model.effectiveDay.nodes.map((node) => [node.sourceNodeId, node]));
  const routeElement = (route: ExperienceRouteViewModel) => {
    renderedRoutes.add(route.edge.id);
    const destination = effectiveById.get(route.edge.toNodeId);
    return (
      <li key={`route:${route.edge.id}`} className="arcade-timeline__route">
        <ArcadeRouteBand route={route} destinationTiming={destination?.node.timing} reducedMotion={model.motion === "reduced"} controlRef={bindings.owners.routeRef(route.edge.id)} onSelect={(routeId) => actions.selectRoute(routeId, "list")} onRetry={actions.retryRoute} />
      </li>
    );
  };

  return (
    <ol className="stage-list arcade-timeline" aria-label="Day itinerary" data-contract-state="stage-list">
      {model.effectiveDay.nodes.flatMap((effective, index) => {
        const node = (
          <li key={`node:${effective.sourceNodeId}`}>
            <ArcadeStop effective={effective} index={index} selected={model.selection.nodeId === effective.sourceNodeId} current={model.live.currentNodeId === effective.sourceNodeId} progress={model.progress} controlRef={bindings.owners.nodeRef(effective.sourceNodeId)} registerLocalOwner={registerLocalOwner} onSelect={() => actions.selectNode(effective.sourceNodeId)} />
          </li>
        );
        return [node, ...(routesByFrom.get(effective.sourceNodeId) ?? []).map(routeElement)];
      })}
      {model.routes.filter((route) => !renderedRoutes.has(route.edge.id)).map(routeElement)}
    </ol>
  );
}
