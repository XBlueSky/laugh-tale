import { useCallback, useEffect, useRef, useId, type RefCallback } from "react";
import type { ExperienceModel, TripActions } from "@laugh-tale-island/react";
import { ChevronDown, House } from "lucide-react";
import { catalog, locale } from "../copy/catalog.js";
import { DayRail } from "./DayRail.js";

interface HeaderModel {
  trip: Pick<ExperienceModel["trip"], "title">;
  day: Pick<ExperienceModel["day"], "id" | "title" | "date" | "ordinal" | "routeLabel">;
  days: ExperienceModel["days"];
  clock: ExperienceModel["clock"];
  header: ExperienceModel["header"];
  motion: ExperienceModel["motion"];
  capabilities: Pick<ExperienceModel["capabilities"], "selectDayIds">;
}
export function FloatingDayHeader({ model, actions, headerRef }: {
  model: HeaderModel;
  actions: Pick<TripActions, "openHome" | "selectDay" | "setHeaderExpanded" | "settleHeaderTransition">;
  headerRef?: RefCallback<HTMLElement>;
}) {
  const element = useRef<HTMLElement | null>(null);
  const composedRef = useCallback((node: HTMLElement | null) => { element.current = node; headerRef?.(node); }, [headerRef]);
  const railId = useId();
  const routeContextId = useId();
  const transition = model.header.transition;
  const transitionId = transition?.id;
  const transitionPhase = transition?.phase;
  // The public action facade supplies a stable, context-free callback.
  const settleHeaderTransition = actions.settleHeaderTransition;
  const settled = useRef<number | null>(null);
  // Run after the controller's layout phase attaches its committed action facade.
  useEffect(() => {
    if (transitionId === undefined || transitionPhase === undefined) { settled.current = null; return; }
    if (settled.current === transitionId) return;
    let live = true;
    const finish = () => {
      if (!live) return;
      settled.current = transitionId;
      settleHeaderTransition(transitionId);
    };
    const style = element.current && getComputedStyle(element.current);
    const duration = model.motion === "reduced" ? 0 : Number.parseFloat(style?.getPropertyValue(transitionPhase === "expanding" ? "--oak-motion-expand" : "--oak-motion-collapse") ?? "") || 0;
    if (duration === 0) { finish(); return () => { live = false; }; }
    const timer = window.setTimeout(finish, duration);
    return () => { live = false; window.clearTimeout(timer); };
  }, [transitionId, transitionPhase, model.motion, settleHeaderTransition]);
  const time = new Intl.DateTimeFormat(locale, { timeZone: model.clock.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(model.clock.instant));
  const selectedDate = new Intl.DateTimeFormat(locale, { calendar: "gregory", timeZone: "UTC", weekday: "short", month: "numeric", day: "numeric" }).format(new Date(`${model.day.date}T00:00:00Z`));
  const headingLabel = `${model.trip.title} · ${model.day.title}`;
  const headingTitle = model.day.routeLabel ? `${headingLabel} · ${model.day.routeLabel}` : headingLabel;
  const clockLabel = model.clock.clockPlaceLabel ?? catalog.experience.tripTime;
  return <header className="oak-day-header" aria-label={catalog.accessibleNames.header} data-header-expanded={model.header.expanded} data-transition-id={transition?.id} data-transition-phase={transition?.phase ?? "settled"} ref={composedRef}>
    <div className="oak-header-line">
      <button type="button" className="oak-control" aria-label={catalog.experience.home} onClick={() => actions.openHome()}><House size={18} strokeWidth={1.75} aria-hidden="true" /></button>
      <div className="oak-header-identity"><div className="oak-header-title-block"><h1 title={headingTitle} aria-label={headingLabel} aria-describedby={model.day.routeLabel ? routeContextId : undefined}>{model.day.title}</h1>{model.day.routeLabel && <span id={routeContextId} className="oak-visually-hidden">{model.day.routeLabel}</span>}<span className="oak-header-day-context" aria-label={`${model.day.date} · ${catalog.experience.dayOfTrip.replace("{ordinal}", String(model.day.ordinal))}`}>{selectedDate} · {catalog.experience.dayOfTrip.replace("{ordinal}", String(model.day.ordinal))}</span></div><span className="oak-header-clock"><time dateTime={model.clock.instant} aria-label={catalog.experience.tripTime}>{time}</time><span className="oak-clock-place">{clockLabel}</span></span></div>
      <button type="button" className="oak-control" aria-expanded={model.header.expanded} aria-controls={railId} aria-label={model.header.expanded ? catalog.accessibleNames.collapseDayRail : catalog.accessibleNames.expandDayRail} onClick={() => actions.setHeaderExpanded(!model.header.expanded)}><ChevronDown className="oak-disclosure-arrow" size={18} strokeWidth={1.75} aria-hidden="true" /></button>
    </div>
    <div className="oak-day-rail-motion"><div className="oak-day-rail-content" id={railId} inert={!model.header.expanded} aria-hidden={!model.header.expanded}><DayRail days={model.days} dayId={model.day.id} expanded={model.header.expanded} selectableIds={model.capabilities.selectDayIds} actions={actions} /></div></div>
  </header>;
}
