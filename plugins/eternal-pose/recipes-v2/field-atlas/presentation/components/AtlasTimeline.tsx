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
  buildTimelineEntries,
  type Booking,
  type EffectiveNode,
  type RoutePresentation,
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
  if (timing.certainty === "unknown" || timing.start === undefined) {
    return "時間未定";
  }
  return timing.certainty === "suggested" ? `約 ${timing.start}` : timing.start;
}

function absoluteDate(date: string): string | undefined {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf())) return undefined;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function shiftedDate(date: string, days: number): string | undefined {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf())) return undefined;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function accessibleOwnerName(node: TripNode, date: string): string {
  const base = `${timingLabel(node.timing)} ${node.title}`;
  const startDateLabel = absoluteDate(date);
  const { start, end, certainty, dayOffset } = node.timing;
  const crossesMidnight =
    start !== undefined &&
    end !== undefined &&
    ((dayOffset ?? 0) > 0 || end < start);
  if (startDateLabel === undefined || (node.kind !== "experience" && !crossesMidnight)) {
    return base;
  }
  const parts = [base, startDateLabel, `${certainty} time`];
  if (crossesMidnight && end !== undefined) {
    const endDate = shiftedDate(date, (dayOffset ?? 0) > 0 ? (dayOffset ?? 0) : 1);
    const endLabel = endDate === undefined ? undefined : absoluteDate(endDate);
    if (endLabel !== undefined) parts.push(`ends ${endLabel} at ${end}`);
  }
  return parts.join(" · ");
}

function bookingSummary(booking: Booking | undefined): string | undefined {
  if (booking === undefined || booking.status === "none") return undefined;
  return booking.status === "confirmed" ? "Booking confirmed" : "Booking pending";
}

function arrivalSummary(booking: Booking | undefined): string | undefined {
  return booking?.arrivalBufferMinutes === undefined
    ? undefined
    : `Arrive ${booking.arrivalBufferMinutes} min early`;
}

function semanticContent(
  node: TripNode,
  state: {
    position: "first" | "middle" | "last" | "only";
    selectedCandidateId?: string;
    completed: boolean;
    completedChecklistIds: ReadonlySet<string>;
    shoppingStatuses: Readonly<Record<string, ShoppingStatus>>;
    date: string;
  },
): ReactNode {
  const booking = bookingSummary(node.booking);
  const arrival = arrivalSummary(node.booking);
  switch (node.kind) {
    case "transport":
      return (
        <span data-semantic="transport">
          <b>{node.payload.mode}</b>
          {node.payload.plan === undefined ? null : <> · {node.payload.plan}</>}
          {booking === undefined ? null : <> · {booking}</>}
          {arrival === undefined ? null : <> · {arrival}</>}
        </span>
      );
    case "transfer":
      return (
        <span data-semantic="transfer">
          <b>{node.payload.mode}{node.payload.terminal === undefined ? "" : ` · ${node.payload.terminal}`}</b>
          {booking === undefined ? null : <> · {booking}</>}
          {arrival === undefined ? null : <> · {arrival}</>}
        </span>
      );
    case "lodging": {
      const role =
        node.payload.role === "base"
          ? state.position === "only"
            ? "Day start & end · Stay base"
            : state.position === "first"
              ? "Day start · Stay base"
              : state.position === "last"
                ? "Day end · Stay base"
                : "Stay base"
          : node.payload.role === "check-in"
            ? "Check in"
            : node.payload.role === "check-out"
              ? "Check out"
              : "Rest / drop off bags";
      return (
        <span data-semantic="lodging">
          <b>{role}</b>{node.place?.name === undefined ? null : <> · {node.place.name}</>}
        </span>
      );
    }
    case "dining": {
      const choice =
        state.selectedCandidateId !== undefined
          ? `Selected · ${node.place?.name ?? node.title}`
          : node.payload.candidateGroupId !== undefined
            ? "Compare meal options"
            : `Planned · ${node.place?.name ?? node.title}`;
      return (
        <span data-semantic="dining" data-choice-state={state.selectedCandidateId === undefined ? "available" : "committed"}>
          <b>{choice}</b>{node.payload.cuisine === undefined ? null : <> · {node.payload.cuisine}</>}
        </span>
      );
    }
    case "shopping": {
      const completed = node.payload.items.filter((item) => {
        const status = Object.hasOwn(state.shoppingStatuses, item.id)
          ? state.shoppingStatuses[item.id]
          : item.initialStatus ?? "pending";
        return status === "purchased" || status === "skipped";
      }).length;
      return (
        <span data-semantic="shopping" data-shopping-terminal-count={completed}>
          <b>{node.place?.name ?? "Shopping stop"}</b> · {completed} / {node.payload.items.length} complete
          {node.payload.items.filter(({ priority }) => priority !== undefined).map((item) => (
            <span key={item.id}> · {item.priority === "must" ? "Must" : "Nice"} · {item.title}</span>
          ))}
        </span>
      );
    }
    case "sightseeing": {
      const placeAndArea =
        node.place?.name === undefined
          ? node.payload.area
          : node.payload.area === undefined
            ? node.place.name
            : `${node.place.name} · ${node.payload.area}`;
      return (
        <span data-semantic="sightseeing">
          <b>{placeAndArea}</b>{node.optionality === "optional" ? " · Optional stop" : null}
        </span>
      );
    }
    case "experience": {
      const dateLabel = absoluteDate(state.date);
      return (
        <span data-semantic="experience">
          {dateLabel === undefined ? null : <time dateTime={state.date}><b>{dateLabel}</b></time>}
          {node.payload.durationMinutes === undefined ? null : <> · {node.payload.durationMinutes} min</>}
          {booking === undefined ? null : <> · {booking}</>}
        </span>
      );
    }
    case "logistics": {
      const completed = node.payload.checklist.filter(({ id }) =>
        state.completedChecklistIds.has(id),
      ).length;
      return (
        <span data-semantic="logistics">
          <b>{state.completed ? "Completed" : "In progress"}</b> · {completed} / {node.payload.checklist.length} steps complete
          {node.payload.checklist.length === 1 ? <> · {node.payload.checklist[0]?.title}</> : null}
        </span>
      );
    }
    case "custom": {
      const capabilities = Object.entries(node.payload.capabilities)
        .filter(([, enabled]) => enabled)
        .map(([capability]) => `${capability[0]?.toUpperCase() ?? ""}${capability.slice(1)} enabled`);
      const fields = Object.keys(node.payload.data).length;
      return (
        <span data-semantic="custom">
          <b>{node.payload.customKind}</b>
          {capabilities.map((capability) => <span key={capability}> · {capability}</span>)}
          <span> · {fields} declared {fields === 1 ? "field" : "fields"}</span>
        </span>
      );
    }
  }
}

function disclosureItems(node: TripNode) {
  if (node.kind === "logistics") return node.payload.checklist;
  if (node.kind === "lodging") return node.payload.checklist ?? [];
  return [];
}

function AtlasStop({
  effective,
  index,
  position,
  selected,
  current,
  selectionSource,
  date,
  progress,
  controlRef,
  registerLocalOwner,
  onSelect,
}: {
  effective: EffectiveNode;
  index: number;
  position: "first" | "middle" | "last" | "only";
  selected: boolean;
  current: boolean;
  selectionSource?: "automatic" | "manual";
  date: string;
  progress: ExperienceViewModel["progress"];
  controlRef: RefCallback<HTMLElement>;
  registerLocalOwner: (nodeId: string, element: HTMLElement | null) => void;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId().replaceAll(":", "");
  const detailsId = `atlas-stop-details-${id}`;
  const descriptionId = `atlas-stop-description-${id}`;
  const items = disclosureItems(effective.node);
  const canDisclose = items.length >= 2;
  const completedChecklistIds = new Set(
    progress.completedIds.flatMap((value) =>
      value.startsWith("checklist:") ? [value.slice("checklist:".length)] : [],
    ),
  );
  const composedControlRef = useCallback(
    (element: HTMLElement | null) => {
      registerLocalOwner(effective.sourceNodeId, element);
      controlRef(element);
    },
    [controlRef, effective.sourceNodeId, registerLocalOwner],
  );

  return (
    <article
      className="atlas-stop"
      data-kind={effective.node.kind}
      data-current={current ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      data-completed={effective.completed ? "true" : "false"}
    >
      <button
        ref={composedControlRef}
        type="button"
        className="atlas-stop__owner"
        aria-label={accessibleOwnerName(effective.node, date)}
        aria-describedby={descriptionId}
        aria-pressed={selected}
        aria-current={current ? "step" : undefined}
        data-kind={effective.node.kind}
        data-completed={effective.completed ? "true" : "false"}
        data-selection-source={selected ? selectionSource : undefined}
        data-touch-target="44"
        onClick={onSelect}
      >
        <span className="stop-number">{String(index + 1).padStart(2, "0")}</span>
        <span className="atlas-stop__time">{timingLabel(effective.node.timing)}</span>
        <span className="atlas-stop__body">
          <strong>{effective.node.title}</strong>
          <span id={descriptionId}>
            {semanticContent(effective.node, {
              position,
              ...(effective.selectedCandidateId === undefined
                ? {}
                : { selectedCandidateId: effective.selectedCandidateId }),
              completed: effective.completed,
              completedChecklistIds,
              shoppingStatuses: progress.shoppingStatuses,
              date,
            })}
          </span>
        </span>
      </button>
      {canDisclose ? (
        <button
          type="button"
          className="atlas-stop__disclosure"
          aria-label={`${expanded ? "Hide" : "Show"} ${effective.node.title} details`}
          aria-controls={detailsId}
          aria-expanded={expanded}
          data-touch-target="44"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "−" : "+"}
        </button>
      ) : null}
      {canDisclose ? (
        <ul id={detailsId} className="atlas-stop__details" hidden={!expanded}>
          {items.map((item) => (
            <li key={item.id} data-completed={completedChecklistIds.has(item.id) ? "true" : "false"}>
              {item.title}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function routeSummary(route: RoutePresentation, readyMinutes: number | undefined): string {
  if (readyMinutes !== undefined && Number.isFinite(readyMinutes) && readyMinutes >= 0) {
    return `${route.edge.mode} · ${readyMinutes} min`;
  }
  if (route.edge.summary !== undefined) {
    return route.edge.certainty === "confirmed" || route.edge.summary.trimStart().startsWith("約 ")
      ? route.edge.summary
      : `約 ${route.edge.summary}`;
  }
  if (route.edge.durationMinutes !== undefined) {
    return `${route.edge.mode} · ${route.edge.certainty === "confirmed" ? "" : "約 "}${route.edge.durationMinutes} min`;
  }
  return route.edge.mode;
}

function safeNavigationHref(
  href: string | undefined,
  route: RoutePresentation,
): string | undefined {
  if (href === undefined || route.edge.navigation === undefined || route.edge.mode === "flight") {
    return undefined;
  }
  try {
    const url = new URL(href);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function AtlasRouteBand({
  route,
  model,
  destinationTiming,
  reducedMotion,
  controlRef,
  onSelect,
  onRetry,
}: {
  route: RoutePresentation;
  model: ExperienceRouteViewModel | undefined;
  destinationTiming: Timing | undefined;
  reducedMotion: boolean;
  controlRef: RefCallback<HTMLElement>;
  onSelect: (routeId: string) => void;
  onRetry: (routeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId().replaceAll(":", "");
  const detailsId = `atlas-route-details-${id}`;
  const state = model?.loadState;
  const ready = state?.status === "ready" ? state : undefined;
  const summary = routeSummary(route, ready?.durationMinutes);
  const validReady =
    ready !== undefined &&
    ready.path.length >= 2 &&
    ready.path.every(({ lat, lng }) =>
      Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180,
    );
  const canDisclose = validReady && route.edge.mode === "transit" && ready.steps.length > 0;
  const navigationHref = safeNavigationHref(model?.navigationHref, route);

  return (
    <section
      className="route-band-shell"
      data-route-certainty={route.edge.certainty}
      data-route-source={route.edge.source}
    >
      {state?.status === "loading" ? (
        <div
          ref={controlRef}
          className="route-band"
          role="status"
          aria-label="Loading route"
          data-route-owner={route.edge.id}
          data-state="loading"
          data-display={route.display}
        >
          <span className="atlas-key">ROUTE</span>
          <span>Loading route</span>
          <button
            type="button"
            aria-label="Retry route"
            data-touch-target="44"
            onClick={() => onRetry(route.edge.id)}
          >
            Retry
          </button>
        </div>
      ) : state?.status === "unavailable" ? (
        <div
          ref={controlRef}
          className="route-band"
          role="status"
          aria-label="Route unavailable"
          data-route-owner={route.edge.id}
          data-state="error"
          data-display={route.display}
        >
          <span className="atlas-key">ROUTE</span>
          <span>{summary}</span>
          <span className="route-band__error">
            {state.reason.trim().length > 0
              ? state.reason
              : "Route provider unavailable"}
          </span>
          <button
            type="button"
            aria-label="Retry route"
            data-touch-target="44"
            onClick={() => onRetry(route.edge.id)}
          >
            Retry
          </button>
        </div>
      ) : validReady ? (
        <button
          ref={controlRef}
          type="button"
          className="route-band"
          aria-label={expanded && canDisclose ? "Hide transit route details" : summary}
          aria-pressed={model?.selected ?? false}
          {...(canDisclose ? { "aria-controls": detailsId, "aria-expanded": expanded } : {})}
          data-route-id={route.edge.id}
          data-route-owner={route.edge.id}
          data-selected={model?.selected ? "true" : "false"}
          data-selection-source={model?.selectionSource ?? undefined}
          data-display={route.display}
          data-touch-target="44"
          onClick={() => {
            onSelect(route.edge.id);
            if (canDisclose) setExpanded((value) => !value);
          }}
        >
          <span className="atlas-key">{route.edge.mode.slice(0, 3).toUpperCase()}</span>
          <span>{expanded && canDisclose ? "Transit details" : summary}</span>
        </button>
      ) : (
        <div ref={controlRef} className="route-band" data-route-owner={route.edge.id} data-display={route.display}>
          <span className="atlas-key">{route.edge.mode.slice(0, 3).toUpperCase()}</span>
          <span>{summary}</span>
        </div>
      )}
      {canDisclose ? (
        <div
          id={detailsId}
          className="route-band__details"
          hidden={!expanded}
          aria-hidden={!expanded}
          data-motion-duration={reducedMotion ? "0ms" : "180ms"}
        >
          {destinationTiming === undefined ? null : <span>Arrive {timingLabel(destinationTiming)}</span>}
          <ol>{ready.steps.map((step, index) => <li key={`${index}:${step}`}>{step}</li>)}</ol>
        </div>
      ) : null}
      {navigationHref === undefined || route.edge.navigation === undefined ? null : (
        <a
          href={navigationHref}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`Open live ${route.edge.mode} directions from ${route.edge.navigation.origin.trim()} to ${route.edge.navigation.destination.trim()}`}
          data-touch-target="44"
        >
          Open directions
        </a>
      )}
    </section>
  );
}

export function AtlasTimeline({
  model,
  actions,
  bindings,
}: {
  model: ExperienceViewModel;
  actions: ExperienceActions;
  bindings: ExperienceBindings;
}) {
  const nodeElementsRef = useRef(new Map<string, HTMLElement>());
  const registerLocalOwner = useCallback(
    (nodeId: string, element: HTMLElement | null) => {
      if (element === null) nodeElementsRef.current.delete(nodeId);
      else nodeElementsRef.current.set(nodeId, element);
    },
    [],
  );
  useEffect(() => {
    if (model.selection.nodeId === null) return;
    nodeElementsRef.current
      .get(model.selection.nodeId)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [
    model.effectiveDay.day.id,
    model.selection.nodeId,
    model.selection.source,
    model.sheet.snap,
  ]);
  const routesById = new Map(model.routes.map((route) => [route.edge.id, route]));
  const effectiveById = new Map(
    model.effectiveDay.nodes.map((node) => [node.sourceNodeId, node]),
  );
  const nodeIndexById = new Map(
    model.effectiveDay.nodes.map((node, index) => [node.sourceNodeId, index]),
  );
  const entries = buildTimelineEntries(model.effectiveDay, {
    routes: model.routes.map(({ edge }) => edge),
  });

  const renderStop = (sourceNodeId: string) => {
    const effective = effectiveById.get(sourceNodeId);
    const index = nodeIndexById.get(sourceNodeId) ?? 0;
    if (effective === undefined) return null;
    const position =
      model.effectiveDay.nodes.length === 1
        ? "only"
        : index === 0
          ? "first"
          : index === model.effectiveDay.nodes.length - 1
            ? "last"
            : "middle";
    const selected = model.selection.nodeId === sourceNodeId;
    return (
      <AtlasStop
        effective={effective}
        index={index}
        position={position}
        selected={selected}
        current={model.live.currentNodeId === sourceNodeId}
        {...(selected ? { selectionSource: model.selection.source } : {})}
        date={model.effectiveDay.day.date}
        progress={model.progress}
        controlRef={bindings.owners.nodeRef(sourceNodeId)}
        registerLocalOwner={registerLocalOwner}
        onSelect={() => actions.selectNode(sourceNodeId)}
      />
    );
  };

  return (
    <ol className="atlas-timeline" aria-label="Day itinerary">
      {entries.map((entry) => {
        if (entry.kind === "route") {
          const destination = effectiveById.get(entry.route.edge.toNodeId);
          return (
            <li key={entry.id} className="atlas-timeline__route">
              <AtlasRouteBand
                route={entry.route}
                model={routesById.get(entry.id)}
                destinationTiming={destination?.node.timing}
                reducedMotion={model.motion === "reduced"}
                controlRef={bindings.owners.routeRef(entry.id)}
                onSelect={(routeId) => actions.selectRoute(routeId, "list")}
                onRetry={actions.retryRoute}
              />
            </li>
          );
        }
        if (entry.kind === "logistics-group") {
          return (
            <li key={entry.id} data-logistics-group={entry.id}>
              <section aria-label="Logistics steps">
                <ol>{entry.entries.map((child) => <li key={child.id}>{renderStop(child.id)}</li>)}</ol>
              </section>
            </li>
          );
        }
        return <li key={entry.id}>{renderStop(entry.id)}</li>;
      })}
    </ol>
  );
}
