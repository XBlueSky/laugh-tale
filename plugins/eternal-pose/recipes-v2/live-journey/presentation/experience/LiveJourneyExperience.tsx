/* The shared sheet/map/candidate bindings are controller prop-getters intended
 * to be invoked while the presentation renders; they are not mutable refs. */
/* eslint-disable react-hooks/refs */
import type { CSSProperties } from "react";

import type { SheetSnap } from "@laugh-tale-island/core";

import type { ExperienceViewProps } from "../../controllers/presentation-contract";
import { DisruptionPanel } from "../components/DisruptionPanel";
import { LiveCandidatePanel, LiveReservationPanel, LiveShoppingPanel, LiveTaskPanel } from "../components/LiveUtilityPanels";
import { LiveTimeline } from "../components/LiveTimeline";
import { NowNextBoard } from "../components/NowNextBoard";
import "../styles/index.css";
import { liveJourneyMapProfile } from "../theme-map-profile";

function localClockLabel(instant: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).format(new Date(instant));
  } catch {
    return instant;
  }
}

function locationLabel(status: ExperienceViewProps["model"]["location"]["status"]): string {
  switch (status) {
    case "idle": return "Location off";
    case "requesting": return "Requesting location";
    case "active": return "Location active";
    case "denied": return "Location permission denied";
    case "unavailable": return "Location unavailable";
  }
}

const snaps: readonly SheetSnap[] = ["collapsed", "half", "expanded"];

export function LiveJourneyExperience({ model, actions, bindings }: ExperienceViewProps) {
  const mapProviderBottom = model.sheet.geometry[model.sheet.snap] + model.viewport.safeBottom + 8;
  const shellStyle = {
    "--safe-area-top": `${model.viewport.safeTop}px`,
    "--safe-area-bottom": `${model.viewport.safeBottom}px`,
    "--live-header-clearance": `${model.header.clearance}px`,
    "--live-sheet-ceiling": `${model.sheet.geometry.ceiling}px`,
    "--live-map-provider-bottom": `${mapProviderBottom}px`,
    "--live-state-duration": model.motion === "reduced" ? "0ms" : "200ms",
    maxInlineSize: "100vw",
    overflowX: "hidden",
  } as CSSProperties;
  const sheetProps = bindings.sheet.getSheetProps();
  const handleProps = bindings.sheet.getHandleProps();
  const sheetCollapsed = model.sheet.snap === "collapsed";
  const sheetExpanded = model.sheet.snap === "expanded";
  const candidateBinding = bindings.candidate;
  const completedIds = new Set(model.progress.completedIds);

  return (
    <>
      {model.persistence === "memory-only" ? <p className="live-persistence" role="status" aria-label="Trip progress is stored on this page only" data-persistence-status="memory-only" data-contract-state="memory-only">Progress is stored on this page only.</p> : null}
      <main className="live-journey-experience" data-testid="trip-experience" data-contract-surface="experience" data-geometry-source="shared" data-header-expanded={model.header.expanded ? "true" : "false"} data-motion={model.motion} data-viewport-width={String(model.viewport.width)} data-map-chrome-layout="bounded" style={shellStyle}>
        <div className="live-responsive-layout">
          <section className="live-map-surface" data-map-status={model.map.status} data-contract-surface="map">
            <div className="live-map-grid" aria-hidden="true" />
            <div ref={bindings.map.ref} className="itinerary-map live-map-canvas" data-testid="itinerary-map" data-map-canvas="persistent" data-provider-canvas="bounded" data-map-status={model.map.status} role="region" aria-label="Trip map" />
            <aside className="live-map-legend" aria-label="Map legend">
              <span><i data-legend-shape="current" />Current</span>
              <span><i data-legend-shape="next" />Next</span>
              <span><i data-legend-shape="history" />Completed history</span>
            </aside>
            {model.map.status === "error" ? <div className="live-map-error" role="alert" data-contract-state="map-error"><strong>Map unavailable</strong><span>The journey board remains available.</span><button type="button" data-touch-target="44" onClick={actions.retryMap}>Retry map</button></div> : null}
          </section>

          <header className="live-header" aria-label="Journey controls" data-expanded={model.header.expanded ? "true" : "false"} data-motion-duration={model.motion === "reduced" ? "0ms" : "200ms"}>
            <div className="live-header__topline">
              <div><span className="live-kicker">JOURNEY ACTIVE</span><strong title={model.trip.title}>{model.trip.title}</strong><span className="live-header__clock"><time aria-label={`${model.clock.timezone} local time`}>{localClockLabel(model.clock.instant, model.clock.timezone)}</time><small>{model.clock.timezone}</small></span></div>
              <div className="live-header__controls"><button type="button" aria-label="Return to lodging" data-touch-target="44" onClick={actions.returnToLodging}>BASE</button><button type="button" aria-label="Return to the current itinerary item" data-touch-target="44" onClick={actions.returnToNow}>NOW</button><button type="button" aria-label={model.header.expanded ? "Collapse journey dates" : "Expand journey dates"} aria-expanded={model.header.expanded} data-touch-target="44" onClick={() => actions.setHeaderExpanded(!model.header.expanded)}>{model.header.expanded ? "−" : "+"}</button></div>
            </div>
            <NowNextBoard model={model} />
            <nav className="live-header__rail" aria-label="Trip dates" aria-hidden={model.header.expanded ? "false" : "true"} data-testid="date-rail" inert={!model.header.expanded}>
              {model.days.map((day, index) => <button key={day.id} type="button" aria-label={`Day ${index + 1}: ${day.title}, ${day.date}`} aria-pressed={day.id === model.effectiveDay.day.id} data-contract-owner="day" data-owner-id={day.id} data-current={day.id === model.effectiveDay.day.id ? "true" : "false"} data-touch-target="44" tabIndex={model.header.expanded ? 0 : -1} onClick={() => actions.selectDay(day.id)}><span className="live-day-index">{String(index + 1).padStart(2, "0")}</span><span>{day.title}</span><time dateTime={day.date}>{day.date.slice(5).replace("-", "/")}</time></button>)}
            </nav>
          </header>

          <div className="live-map-controls" role="toolbar" aria-label="Map controls"><button type="button" aria-label="Return to trip home" data-contract-action="return-home" data-touch-target="44" onClick={actions.returnHome}>HOME</button><LiveReservationPanel reservations={model.trip.reservations} /><button type="button" aria-label={model.location.status === "active" ? "Recenter my location" : model.location.status === "requesting" ? "Requesting location" : "Use my location"} data-contract-action={model.location.status === "active" ? "location-recenter" : "location-start"} data-touch-target="44" disabled={model.location.status === "requesting"} onClick={model.location.status === "active" ? actions.recenterLocation : actions.startLocation}>LOC</button>{model.location.status === "active" ? <button type="button" aria-label="Stop location sharing" data-contract-action="location-stop" data-touch-target="44" onClick={actions.stopLocation}>STOP</button> : null}<span className="live-map-controls__status" aria-live="polite" data-contract-status="location" data-state={model.location.status}>{locationLabel(model.location.status)}</span></div>

          <section {...sheetProps} className="live-sheet" aria-label="Journey itinerary" data-contract-surface="itinerary-sheet" style={{ ...sheetProps.style, bottom: "var(--safe-area-bottom)", paddingBottom: 0 }}>
            <button type="button" className="live-sheet__handle" aria-label="Drag journey sheet" data-touch-target="44" {...handleProps}><span aria-hidden="true" /></button>
            <div className="live-sheet__toolbar" role="toolbar" aria-label="Journey controls"><div><span className="live-kicker">DAY {String(model.days.findIndex(({ id }) => id === model.effectiveDay.day.id) + 1).padStart(2, "0")}</span><strong title={model.effectiveDay.day.title}>{model.effectiveDay.day.title}</strong><span>{model.effectiveDay.nodes.length} {model.effectiveDay.nodes.length === 1 ? "stop" : "stops"}</span></div><span className="live-sheet__local-time">{localClockLabel(model.clock.instant, model.clock.timezone)}</span><button type="button" aria-label="Return to the current itinerary item" data-touch-target="44" onClick={actions.returnToNow}>NOW</button><button type="button" aria-label={sheetExpanded ? "Collapse journey" : "Expand journey"} data-touch-target="44" onClick={() => actions.setSheetSnap(sheetExpanded ? "half" : "expanded")}>{sheetExpanded ? "−" : "+"}</button></div>
            <nav className="live-sheet__index" aria-label="Journey sheet positions">{snaps.map((snap) => <button key={snap} type="button" aria-label={`Set ${snap} journey`} aria-pressed={model.sheet.snap === snap} data-snap-target={snap} data-touch-target="44" onClick={() => actions.setSheetSnap(snap)}>{snap === "collapsed" ? "1" : snap === "half" ? "2" : "3"}</button>)}</nav>
            {sheetCollapsed ? null : <div className="live-sheet__scroll" data-scroll-region="itinerary">{candidateBinding === null || model.candidate === null ? null : <LiveCandidatePanel model={model.candidate} binding={candidateBinding} actions={actions} candidateTitle={liveJourneyMapProfile.candidateTitle} />}{model.shopping === null ? null : <LiveShoppingPanel model={model.shopping} onChange={actions.setShoppingStatus} />}<LiveTaskPanel dayTitle={model.effectiveDay.day.title} tasks={model.tasks} completedIds={completedIds} onCompletedChange={actions.setCompleted} /><DisruptionPanel routes={model.routes} onRetry={actions.retryRoute} /><LiveTimeline model={model} actions={actions} bindings={bindings} /></div>}
          </section>
        </div>
      </main>
    </>
  );
}
