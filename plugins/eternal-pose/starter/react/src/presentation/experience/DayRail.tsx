import { useLayoutEffect, useRef } from "react";
import type { ExperienceModel, TripActions } from "@laugh-tale-island/react";
import { catalog, locale } from "../copy/catalog.js";

const calendar = { calendar: "gregory", timeZone: "UTC" } as const;
const weekdayFormat = new Intl.DateTimeFormat(locale, { ...calendar, weekday: "short" });
const monthDayFormat = new Intl.DateTimeFormat(locale, { ...calendar, month: "numeric", day: "numeric" });
const yearFormat = new Intl.DateTimeFormat(locale, { ...calendar, year: "numeric" });

function revealInRail(button: HTMLButtonElement): void {
  const rail = button.parentElement;
  if (!rail) return;
  const item = button.getBoundingClientRect();
  const viewport = rail.getBoundingClientRect();
  if (item.left < viewport.left + 4) rail.scrollLeft -= viewport.left + 4 - item.left;
  else if (item.right > viewport.right - 4) rail.scrollLeft += item.right - viewport.right + 4;
}

export function DayRail({ days, dayId, expanded = true, selectableIds, actions }: {
  days: ExperienceModel["days"];
  dayId: string;
  expanded?: boolean;
  selectableIds: readonly string[];
  actions: Pick<TripActions, "selectDay">;
}) {
  const railRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!expanded) return;
    const current = railRef.current?.querySelector<HTMLButtonElement>('.oak-day-choice[aria-current="true"]');
    if (current) revealInRail(current);
  }, [dayId, expanded]);

  return <nav ref={railRef} aria-label={catalog.accessibleNames.dayRail} className="oak-day-rail">
    {days.map(day => {
      // UTC is a neutral encoding of this authored calendar date, not a trip instant.
      const date = new Date(`${day.date}T00:00:00Z`);
      const weekday = weekdayFormat.format(date);
      const monthDay = monthDayFormat.format(date);
      const name = `${weekday} ${monthDay} · ${yearFormat.format(date)} · ${catalog.experience.dayOfTrip.replace("{ordinal}", String(day.ordinal))} · ${day.title}`;
      return <button key={day.id} type="button" className="oak-day-choice" aria-label={name} aria-current={day.id === dayId ? "true" : undefined} disabled={!selectableIds.includes(day.id)} onClick={() => actions.selectDay(day.id)} onFocus={event => revealInRail(event.currentTarget)}>
        <span className="oak-day-weekday">{weekday}</span><span className="oak-day-date">{monthDay}</span>
      </button>;
    })}
  </nav>;
}
