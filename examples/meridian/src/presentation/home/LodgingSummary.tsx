import type { HomeDaySummary, HomeLodgingFact } from "@laugh-tale-island/react";
import { catalog, locale } from "../copy/catalog.js";
import { HomeBookingFacts } from "./ReservationSummary.js";

const roles = { base: catalog.facts.base, "check-in": catalog.facts.checkIn, "check-out": catalog.facts.checkOut, return: catalog.facts.return };

export function LodgingSummary({ lodging, days }: { lodging: readonly HomeLodgingFact[]; days: readonly HomeDaySummary[] }) {
  if (lodging.length === 0) return null;
  const dateFormat = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", timeZone: "UTC" });
  return <section className="oak-home-section" aria-label={catalog.home.lodging}>
    <h2>{catalog.home.lodging}</h2>
    <ul className="oak-home-facts-list oak-home-lodging-list">{lodging.map((fact, index) => {
      const day = days.find(day => day.id === fact.dayId);
      const dayLabel = day ? catalog.experience.dayOfTrip.replace("{ordinal}", String(day.ordinal)) : fact.dayId;
      const dateLabel = day ? dateFormat.format(new Date(`${day.date}T00:00:00Z`)) : undefined;
      // Equal adjacent titles share only typography; each authored visit retains
      // its own owner, day, timing, location and booking facts in source order.
      const continuesTitle = index > 0 && lodging[index - 1].title === fact.title;
      return <li key={fact.ownerId} data-home-lodging-owner={fact.ownerId} data-home-lodging-day={fact.dayId} data-continues-title={continuesTitle ? "true" : undefined} aria-label={`${fact.title} · ${dayLabel}${day ? ` · ${dateLabel}` : ""}`}>
      {!continuesTitle && <h3>{fact.title}</h3>}
      <div className="oak-home-lodging-heading"><div className="oak-home-lodging-day"><span>{dayLabel}</span>{day && <time dateTime={day.date}>{dateLabel}</time>}</div><span>{roles[fact.role]}</span></div>
      <div className="oak-home-lodging-meta"><p className="oak-home-timing">
        {fact.timing.start !== undefined && <span>{catalog.timing.start.replace("{time}", fact.timing.start)}</span>}
        {fact.timing.end !== undefined && <span>{catalog.timing.end.replace("{time}", fact.timing.end)}</span>}
        <span>{catalog.timing[fact.timing.certainty]}</span>
        {fact.timing.dayOffset !== undefined && fact.timing.dayOffset !== 0 && <span>{catalog.timing.nextDay} {fact.timing.dayOffset}</span>}
      </p>
      {fact.place && <p className="oak-home-place">
        {fact.place.label !== fact.title && <span>{fact.place.label}</span>}
        <span>{catalog.certainty[fact.place.certainty]}</span>
        {fact.place.resolution.status === "unresolved" && <span>{catalog.facts.unverifiedLocation}</span>}
      </p>}</div>
      {fact.booking && <HomeBookingFacts booking={fact.booking} />}
    </li>; })}</ul>
  </section>;
}
