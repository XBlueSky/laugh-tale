/* The shared sheet/map/candidate bindings are controller prop-getters intended
 * to be invoked while the presentation renders; they are not mutable refs. */
/* eslint-disable react-hooks/refs */
import type { CSSProperties } from "react";

import type { SheetSnap } from "@laugh-tale-island/core";

import type { ExperienceViewProps } from "../../controllers/presentation-contract";
import { ChannelStrip } from "../components/ChannelStrip";
import { InstrumentCandidatePanel, InstrumentReservationPanel, InstrumentShoppingPanel, InstrumentTaskPanel } from "../components/InstrumentPanels";
import { StatusLamp } from "../components/StatusLamp";
import "../styles/index.css";
import { pocketInstrumentMapProfile } from "../theme-map-profile";

function localClockLabel(instant: string, timezone: string): string {
  try { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).format(new Date(instant)); } catch { return instant; }
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

export function PocketInstrumentExperience({ model, actions, bindings }: ExperienceViewProps) {
  const providerBottom = model.sheet.geometry[model.sheet.snap] + model.viewport.safeBottom + 8;
  const shellStyle = {
    "--safe-area-top": `${model.viewport.safeTop}px`,
    "--safe-area-bottom": `${model.viewport.safeBottom}px`,
    "--instrument-header-clearance": `${model.header.clearance}px`,
    "--instrument-map-provider-bottom": `${providerBottom}px`,
    "--instrument-state-duration": model.motion === "reduced" ? "0ms" : "170ms",
    maxInlineSize: "100vw",
    overflowX: "hidden",
  } as CSSProperties;
  const sheetProps = bindings.sheet.getSheetProps();
  const handleProps = bindings.sheet.getHandleProps();
  const collapsed = model.sheet.snap === "collapsed";
  const expanded = model.sheet.snap === "expanded";
  const completedIds = new Set(model.progress.completedIds);

  return <>
    {model.persistence === "memory-only" ? <p className="instrument-persistence" role="status" aria-label="Trip progress is stored on this page only" data-persistence-status="memory-only" data-contract-state="memory-only">Progress is stored on this page only.</p> : null}
    <main className="pocket-instrument-experience" data-testid="trip-experience" data-contract-surface="experience" data-geometry-source="shared" data-header-expanded={model.header.expanded ? "true" : "false"} data-motion={model.motion} data-viewport-width={String(model.viewport.width)} data-map-chrome-layout="bounded" style={shellStyle}>
      <section className="instrument-map-display" data-map-status={model.map.status} data-contract-surface="map">
        <div className="instrument-fine-grid" aria-hidden="true" />
        <div ref={bindings.map.ref} className="itinerary-map instrument-map-canvas" data-testid="itinerary-map" data-map-canvas="persistent" data-provider-canvas="bounded" data-map-status={model.map.status} role="region" aria-label="Trip map display" />
        <aside className="instrument-map-legend" aria-label="Map display legend"><span><i data-legend="active" />Active</span><span><i data-legend="ready" />Ready</span><span><i data-legend="complete" />Complete</span></aside>
        {model.map.status === "error" ? <div className="instrument-map-error" role="alert" data-contract-state="map-error"><StatusLamp status="error" label="Map unavailable" detail="The itinerary remains available." /><button type="button" data-touch-target="44" onClick={actions.retryMap}>Retry map</button></div> : null}
      </section>

      <header className="instrument-panel-header" aria-label="Instrument controls" data-expanded={model.header.expanded ? "true" : "false"} data-motion-duration={model.motion === "reduced" ? "0ms" : "170ms"}>
        <div className="instrument-panel-header__main"><div><span className="instrument-kicker">DISPLAY / {model.trip.title}</span><strong title={model.trip.title}>{model.effectiveDay.day.title}</strong><span><time aria-label={`${model.clock.timezone} local time`}>{localClockLabel(model.clock.instant, model.clock.timezone)}</time> · {model.clock.timezone}</span></div><div className="instrument-panel-header__controls"><button type="button" aria-label="Return to lodging" data-touch-target="44" onClick={actions.returnToLodging}>BASE</button><button type="button" aria-label="Return to current itinerary item" data-touch-target="44" onClick={actions.returnToNow}>NOW</button><button type="button" aria-label={model.header.expanded ? "Collapse channels" : "Expand channels"} aria-expanded={model.header.expanded} data-touch-target="44" onClick={() => actions.setHeaderExpanded(!model.header.expanded)}>{model.header.expanded ? "−" : "+"}</button></div></div>
        <nav className="instrument-day-channels" aria-label="Trip channels" aria-hidden={model.header.expanded ? "false" : "true"} data-testid="date-rail" inert={!model.header.expanded}>{model.days.map((day, index) => <button key={day.id} type="button" aria-label={`Channel ${index + 1}: ${day.title}, ${day.date}`} aria-pressed={day.id === model.effectiveDay.day.id} data-contract-owner="day" data-owner-id={day.id} data-current={day.id === model.effectiveDay.day.id ? "true" : "false"} data-touch-target="44" tabIndex={model.header.expanded ? 0 : -1} onClick={() => actions.selectDay(day.id)}><span className="channel-number">{String(index + 1).padStart(2, "0")}</span><span>{day.title}</span><time dateTime={day.date}>{day.date.slice(5).replace("-", "/")}</time></button>)}</nav>
      </header>

      <div className="instrument-map-controls" role="toolbar" aria-label="Map controls"><button type="button" aria-label="Return to trip home" data-contract-action="return-home" data-touch-target="44" onClick={actions.returnHome}>HOME</button><InstrumentReservationPanel reservations={model.trip.reservations} /><button type="button" aria-label={model.location.status === "active" ? "Recenter my location" : model.location.status === "requesting" ? "Requesting location" : "Use my location"} data-contract-action={model.location.status === "active" ? "location-recenter" : "location-start"} data-touch-target="44" disabled={model.location.status === "requesting"} onClick={model.location.status === "active" ? actions.recenterLocation : actions.startLocation}>LOC</button>{model.location.status === "active" ? <button type="button" aria-label="Stop location sharing" data-contract-action="location-stop" data-touch-target="44" onClick={actions.stopLocation}>STOP</button> : null}<span className="instrument-map-controls__status" aria-live="polite" data-contract-status="location" data-state={model.location.status}>{locationLabel(model.location.status)}</span></div>

      <section {...sheetProps} className="instrument-sheet" aria-label="Channel strip" data-contract-surface="itinerary-sheet" style={{ ...sheetProps.style, bottom: "var(--safe-area-bottom)", paddingBottom: 0 }}>
        <button type="button" className="instrument-sheet__handle" aria-label="Drag channel strip" data-touch-target="44" {...handleProps}><span aria-hidden="true" /></button>
        <div className="instrument-sheet__toolbar" role="toolbar" aria-label="Channel strip controls"><div><span className="instrument-kicker">CHANNEL {String(model.days.findIndex(({ id }) => id === model.effectiveDay.day.id) + 1).padStart(2, "0")}</span><strong title={model.effectiveDay.day.title}>{model.effectiveDay.day.title}</strong><span>{model.effectiveDay.nodes.length} {model.effectiveDay.nodes.length === 1 ? "entry" : "entries"}</span></div><span className="instrument-sheet__clock">{localClockLabel(model.clock.instant, model.clock.timezone)}</span><button type="button" aria-label="Return to current itinerary item" data-touch-target="44" onClick={actions.returnToNow}>NOW</button><button type="button" aria-label={expanded ? "Collapse channel strip" : "Expand channel strip"} data-touch-target="44" onClick={() => actions.setSheetSnap(expanded ? "half" : "expanded")}>{expanded ? "−" : "+"}</button></div>
        <nav className="instrument-sheet__index" aria-label="Channel strip positions">{snaps.map((snap) => <button key={snap} type="button" aria-label={`Set ${snap} channel strip`} aria-pressed={model.sheet.snap === snap} data-snap-target={snap} data-touch-target="44" onClick={() => actions.setSheetSnap(snap)}>{snap === "collapsed" ? "1" : snap === "half" ? "2" : "3"}</button>)}</nav>
        {collapsed ? null : <div className="instrument-sheet__scroll" data-scroll-region="itinerary">{model.candidate === null || bindings.candidate === null ? null : <InstrumentCandidatePanel model={model.candidate} binding={bindings.candidate} actions={actions} candidateTitle={pocketInstrumentMapProfile.candidateTitle} />}{model.shopping === null ? null : <InstrumentShoppingPanel model={model.shopping} onChange={actions.setShoppingStatus} />}<InstrumentTaskPanel dayTitle={model.effectiveDay.day.title} tasks={model.tasks} completedIds={completedIds} onCompletedChange={actions.setCompleted} /><ChannelStrip model={model} actions={actions} bindings={bindings} /></div>}
      </section>
    </main>
  </>;
}
