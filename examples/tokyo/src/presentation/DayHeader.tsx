import {
  BedDouble,
  ChevronDown,
  ChevronUp,
  Clock3,
  LocateFixed,
} from "lucide-react";

import type { TripDay } from "@laugh-tale-island/core";

export interface DayHeaderProps {
  tripTitle: string;
  timezoneLabel: string;
  clockLabel: string;
  days: readonly TripDay[];
  selectedDayId: string;
  expanded: boolean;
  reducedMotion: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onDaySelect: (dayId: string) => void;
  onReturnToNow: () => void;
  onReturnToLodging: () => void;
}

function dateLabel(day: TripDay): string {
  const date = new Date(`${day.date}T00:00:00Z`);
  const formatted = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
  return `${day.title}, ${formatted}`;
}

export function DayHeader({
  tripTitle,
  timezoneLabel,
  clockLabel,
  days,
  selectedDayId,
  expanded,
  reducedMotion,
  onExpandedChange,
  onDaySelect,
  onReturnToNow,
  onReturnToLodging,
}: DayHeaderProps) {
  return (
    <header
      className="day-header"
      aria-label="Trip controls"
      data-expanded={expanded ? "true" : "false"}
      data-controls-alignment="centered"
      data-motion-duration={reducedMotion ? "0ms" : "200ms"}
    >
      <div className="day-header__primary">
        <div className="day-header__identity">
          <strong title={tripTitle}>{tripTitle}</strong>
          <span className="day-header__clock" aria-label={`${timezoneLabel} time`}>
            <Clock3 aria-hidden="true" size={16} strokeWidth={1.8} />
            <time>{clockLabel}</time>
          </span>
        </div>

        <div className="day-header__controls">
          <button
            type="button"
            className="icon-control"
            aria-label="Return to lodging"
            data-touch-target="44"
            onClick={onReturnToLodging}
          >
            <BedDouble aria-hidden="true" size={19} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="icon-control"
            aria-label="Return to the current itinerary item"
            data-touch-target="44"
            onClick={onReturnToNow}
          >
            <LocateFixed aria-hidden="true" size={19} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="icon-control"
            aria-label={expanded ? "Collapse date choices" : "Expand date choices"}
            aria-expanded={expanded}
            data-touch-target="44"
            onClick={() => onExpandedChange(!expanded)}
          >
            {expanded ? (
              <ChevronUp aria-hidden="true" size={19} strokeWidth={1.8} />
            ) : (
              <ChevronDown aria-hidden="true" size={19} strokeWidth={1.8} />
            )}
          </button>
        </div>
      </div>

      <nav
        className="day-header__date-rail"
        aria-label="Trip dates"
        aria-hidden={expanded ? "false" : "true"}
        data-testid="date-rail"
        inert={!expanded}
      >
        {days.map((day, index) => (
          <button
            key={day.id}
            type="button"
            className="day-header__date"
            aria-label={`Day ${index + 1}: ${dateLabel(day)}`}
            aria-pressed={day.id === selectedDayId}
            data-touch-target="44"
            tabIndex={expanded ? 0 : -1}
            onClick={() => onDaySelect(day.id)}
          >
            <span>Day {index + 1}</span>
            <small>{day.date.slice(5).replace("-", "/")}</small>
          </button>
        ))}
      </nav>
    </header>
  );
}
