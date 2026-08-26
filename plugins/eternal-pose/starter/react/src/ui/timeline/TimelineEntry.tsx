import { ChevronDown, ChevronUp } from "lucide-react";
import {
  useId,
  useState,
  type ComponentType,
  type ReactElement,
} from "react";

import type {
  Booking,
  ShoppingStatus,
  Timing,
  TripNode,
} from "../../trip-core/model";
import { formatTimingLabel } from "../../trip-core/time";

export interface TimelineNodeState {
  completed: boolean;
  current: boolean;
  dayDate?: string;
  position: "first" | "middle" | "last" | "only";
  selectedCandidateId?: string;
  completedChecklistIds: ReadonlySet<string>;
  shoppingStatuses: Readonly<Record<string, ShoppingStatus>>;
  selectionSource?: "automatic" | "manual";
}

export interface RendererProps {
  node: TripNode;
  state: TimelineNodeState;
  selected: boolean;
  onSelect: () => void;
}

export type RendererComponent = ComponentType<RendererProps>;

export interface TimelineEntryProps extends RendererProps {
  Renderer: RendererComponent;
}

export function TimingLabel({ timing }: { timing: Timing }): ReactElement {
  const label = formatTimingLabel(timing);
  return timing.start === undefined || timing.certainty === "unknown" ? (
    <span className="itinerary-row__time">{label}</span>
  ) : (
    <time className="itinerary-row__time" dateTime={timing.start}>
      {label}
    </time>
  );
}

export function bookingSummary(booking: Booking | undefined): string | undefined {
  if (booking === undefined || booking.status === "none") {
    return undefined;
  }
  const status = booking.status === "confirmed" ? "Booking confirmed" : "Booking pending";
  return booking.reference === undefined
    ? status
    : `${status} · Ref ${booking.reference}`;
}

export function arrivalSummary(booking: Booking | undefined): string | undefined {
  return booking?.arrivalBufferMinutes === undefined
    ? undefined
    : `Arrive ${booking.arrivalBufferMinutes} min early`;
}

function disclosureItems(node: TripNode) {
  if (node.kind === "logistics") {
    return node.payload.checklist;
  }
  if (node.kind === "lodging") {
    return node.payload.checklist ?? [];
  }
  return [];
}

export function TimelineEntry({
  node,
  state,
  selected,
  onSelect,
  Renderer,
}: TimelineEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const generatedId = useId().replaceAll(":", "");
  const descriptionId = `timeline-description-${generatedId}`;
  const detailsId = `timeline-details-${generatedId}`;
  const items = disclosureItems(node);
  const canDisclose = items.length >= 2;

  return (
    <article
      className="timeline-entry"
      data-kind={node.kind}
      data-completed={state.completed ? "true" : "false"}
      data-current={state.current ? "true" : "false"}
      style={
        canDisclose
          ? {
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 44px",
              alignItems: "center",
            }
          : undefined
      }
    >
      <button
        type="button"
        className="itinerary-row"
        aria-label={`${formatTimingLabel(node.timing)} ${node.title}`}
        aria-describedby={descriptionId}
        aria-pressed={selected}
        aria-current={state.current ? "step" : undefined}
        data-kind={node.kind}
        data-completed={state.completed ? "true" : "false"}
        data-selection-source={selected ? state.selectionSource : undefined}
        data-touch-target="44"
        onClick={onSelect}
      >
        <TimingLabel timing={node.timing} />
        <span className="itinerary-row__content" style={{ minWidth: 0 }}>
          <span className="itinerary-row__title">{node.title}</span>
          <br />
          <span id={descriptionId} className="semantic-entry">
            <Renderer
              node={node}
              state={state}
              selected={selected}
              onSelect={onSelect}
            />
          </span>
        </span>
      </button>

      {canDisclose ? (
        <button
          type="button"
          className="icon-control itinerary-row__disclosure"
          aria-label={`${expanded ? "Hide" : "Show"} ${node.title} details`}
          aria-controls={detailsId}
          aria-expanded={expanded}
          data-touch-target="44"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? (
            <ChevronUp aria-hidden="true" size={18} strokeWidth={1.8} />
          ) : (
            <ChevronDown aria-hidden="true" size={18} strokeWidth={1.8} />
          )}
        </button>
      ) : null}

      {canDisclose ? (
        <div
          id={detailsId}
          className="timeline-entry__details"
          hidden={!expanded}
          style={{ gridColumn: "1 / -1" }}
        >
          <ul style={{ margin: 0, padding: "var(--space-1) var(--space-4)" }}>
            {items.map((item) => {
              const completed = state.completedChecklistIds.has(item.id);
              return (
                <li key={item.id} data-completed={completed ? "true" : "false"}>
                  {item.title}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
