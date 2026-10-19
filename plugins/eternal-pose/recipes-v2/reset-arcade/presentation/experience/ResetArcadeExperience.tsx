/* The shared sheet/map/candidate bindings are controller prop-getters intended
 * to be invoked while the presentation renders; they are not mutable refs. */
/* eslint-disable react-hooks/refs */
import type { CSSProperties } from "react";

import type { SheetSnap } from "@laugh-tale-island/core";

import type { ExperienceViewProps } from "../../controllers/presentation-contract";
import {
  ArcadeCandidatePanel,
  ArcadeReservationPanel,
  ArcadeShoppingPanel,
  ArcadeTaskPanel,
} from "../components/ArcadePanels";
import { StageTimeline } from "../components/StageTimeline";
import "../styles/index.css";
import { resetArcadeMapProfile } from "../theme-map-profile";

function clockLabel(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(new Date(instant));
}

function dayLabel(title: string, date: string): string {
  const formatted = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
  return `${title}, ${formatted}`;
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

export function ResetArcadeExperience({ model, actions, bindings }: ExperienceViewProps) {
  const mapPaddingBottom = model.sheet.geometry[model.sheet.snap] + model.viewport.safeBottom + 16;
  const mapProviderBottom = model.sheet.geometry[model.sheet.snap] + model.viewport.safeBottom + 8;
  const shellStyle = {
    "--safe-area-top": `${model.viewport.safeTop}px`,
    "--safe-area-bottom": `${model.viewport.safeBottom}px`,
    "--header-clearance": `${model.header.clearance}px`,
    "--sheet-ceiling": `${model.sheet.geometry.ceiling}px`,
    "--map-padding-top": `${model.header.clearance}px`,
    "--map-padding-bottom": `${mapPaddingBottom}px`,
    "--map-provider-bottom": `${mapProviderBottom}px`,
    "--arcade-state-duration": model.motion === "reduced" ? "0ms" : "180ms",
    maxInlineSize: "100vw",
    overflowX: "hidden",
  } as CSSProperties;
  const sheetProps = bindings.sheet.getSheetProps();
  const handleProps = bindings.sheet.getHandleProps();
  const sheetExpanded = model.sheet.snap === "expanded";
  const sheetCollapsed = model.sheet.snap === "collapsed";
  const currentClock = clockLabel(model.clock.instant, model.clock.timezone);
  const completedIds = new Set(model.progress.completedIds);
  const candidateBinding = bindings.candidate;
  const ownerBindings = bindings.owners;

  return (
    <>
      {model.persistence === "memory-only" ? (
        <p className="arcade-persistence" role="status" aria-label="Trip progress is stored on this page only" data-persistence-status="memory-only" data-contract-state="memory-only">
          Progress is stored on this page only.
        </p>
      ) : null}
      <main
        className="trip-experience reset-arcade-experience"
        data-testid="trip-experience"
        data-contract-surface="experience"
        data-geometry-source="shared"
        data-header-expanded={model.header.expanded ? "true" : "false"}
        data-motion={model.motion}
        data-viewport-width={String(model.viewport.width)}
        data-map-chrome-layout="bounded"
        style={shellStyle}
      >
        <div className="arcade-safe-area-probe" aria-hidden="true" />
        <div className="arcade-responsive-layout">
          <section className="arcade-map-surface" data-map-status={model.map.status} data-contract-surface="map">
            <div className="arcade-board-grid" aria-hidden="true" />
            <div
              ref={bindings.map.ref}
              className="itinerary-map arcade-map-canvas"
              data-testid="itinerary-map"
              data-map-canvas="persistent"
              data-provider-canvas="bounded"
              data-map-status={model.map.status}
              role="region"
              aria-label="Trip map"
            />
            <aside className="arcade-legend" aria-label="Map legend">
              <span><i data-legend-shape="current" />Current</span>
              <span><i data-legend-shape="selected" />Selected</span>
              <span><i data-legend-shape="uncertain" />Uncertain route</span>
            </aside>
            {model.map.status === "error" ? (
              <div className="arcade-map-error" role="alert" data-contract-state="map-error">
                <strong>Map unavailable</strong>
                <span>The itinerary remains available.</span>
                <button type="button" data-touch-target="44" onClick={actions.retryMap}>Retry map</button>
              </div>
            ) : null}
          </section>

          <header
            className="arcade-day-header"
            aria-label="Trip controls"
            data-expanded={model.header.expanded ? "true" : "false"}
            data-motion-duration={model.motion === "reduced" ? "0ms" : "180ms"}
          >
            <div className="arcade-day-header__primary">
              <div>
                <span className="arcade-key">MISSION ACTIVE</span>
                <strong title={model.trip.title}>{model.trip.title}</strong>
                <span><time aria-label={`${model.clock.timezone} time`}>{currentClock}</time><small>{model.clock.timezone}</small></span>
              </div>
              <div className="arcade-day-header__controls">
                <button type="button" aria-label="Return to lodging" data-touch-target="44" onClick={actions.returnToLodging}>BASE</button>
                <button type="button" aria-label="Return to the current itinerary item" data-touch-target="44" onClick={actions.returnToNow}>NOW</button>
                <button type="button" aria-label={model.header.expanded ? "Collapse mission choices" : "Expand mission choices"} aria-expanded={model.header.expanded} data-touch-target="44" onClick={() => actions.setHeaderExpanded(!model.header.expanded)}>{model.header.expanded ? "−" : "+"}</button>
              </div>
            </div>
            <nav className="arcade-day-header__rail" aria-label="Trip dates" aria-hidden={model.header.expanded ? "false" : "true"} data-testid="date-rail" inert={!model.header.expanded}>
              {model.days.map((day, index) => (
                <button key={day.id} type="button" aria-label={`Day ${index + 1}: ${dayLabel(day.title, day.date)}`} aria-pressed={day.id === model.effectiveDay.day.id} data-contract-owner="day" data-owner-id={day.id} data-current={day.id === model.effectiveDay.day.id ? "true" : "false"} data-touch-target="44" tabIndex={model.header.expanded ? 0 : -1} onClick={() => actions.selectDay(day.id)}>
                  <span className="mission-number">{String(index + 1).padStart(2, "0")}</span>
                  <span>{day.title}</span>
                  <time dateTime={day.date}>{day.date.slice(5).replace("-", "/")}</time>
                </button>
              ))}
            </nav>
          </header>

          <div className="arcade-map-controls" role="toolbar" aria-label="Map controls">
            <button type="button" aria-label="Return to trip home" data-contract-action="return-home" data-touch-target="44" onClick={actions.returnHome}>HOME</button>
            <ArcadeReservationPanel reservations={model.trip.reservations} />
            <button type="button" aria-label={model.location.status === "active" ? "Recenter my location" : model.location.status === "requesting" ? "Requesting location" : "Use my location"} data-contract-action={model.location.status === "active" ? "location-recenter" : "location-start"} data-touch-target="44" disabled={model.location.status === "requesting"} onClick={model.location.status === "active" ? actions.recenterLocation : actions.startLocation}>LOC</button>
            {model.location.status === "active" ? <button type="button" aria-label="Stop location sharing" data-contract-action="location-stop" data-touch-target="44" onClick={actions.stopLocation}>STOP</button> : null}
            <span className="arcade-map-controls__status" aria-live="polite" data-contract-status="location" data-state={model.location.status}>{locationLabel(model.location.status)}</span>
          </div>

          <section
            {...sheetProps}
            className="arcade-sheet"
            aria-label="Itinerary"
            data-contract-surface="itinerary-sheet"
            style={{ ...sheetProps.style, bottom: "var(--safe-area-bottom)", paddingBottom: 0 }}
          >
            <button type="button" className="arcade-sheet__handle" aria-label="Drag itinerary sheet" data-touch-target="44" {...handleProps}><span aria-hidden="true" /></button>
            <div className="arcade-sheet__toolbar" role="toolbar" aria-label="Itinerary controls" data-compact={sheetCollapsed ? "true" : "false"}>
              <div className="arcade-sheet__heading">
                <span className="arcade-key">MISSION {String(model.days.findIndex(({ id }) => id === model.effectiveDay.day.id) + 1).padStart(2, "0")}</span>
                <strong title={model.effectiveDay.day.title}>{model.effectiveDay.day.title}</strong>
                <span>{model.effectiveDay.nodes.length} {model.effectiveDay.nodes.length === 1 ? "stop" : "stops"}</span>
              </div>
              <button type="button" aria-label="Return to the current itinerary item" data-touch-target="44" onClick={actions.returnToNow}>NOW</button>
              <button type="button" aria-label={sheetExpanded ? "Collapse itinerary" : "Expand itinerary"} data-touch-target="44" onClick={() => actions.setSheetSnap(sheetExpanded ? "half" : "expanded")}>{sheetExpanded ? "−" : "+"}</button>
            </div>
            <nav className="arcade-sheet-index" aria-label="Itinerary sheet positions">
              {snaps.map((snap) => <button key={snap} type="button" aria-label={`Set ${snap} itinerary`} aria-pressed={model.sheet.snap === snap} data-snap-target={snap} data-touch-target="44" onClick={() => actions.setSheetSnap(snap)}>{snap === "collapsed" ? "1" : snap === "half" ? "2" : "3"}</button>)}
            </nav>

            {sheetCollapsed ? null : (
              <div className="arcade-sheet__scroll" data-scroll-region="itinerary">
                {model.candidate === null || candidateBinding === null ? null : <ArcadeCandidatePanel model={model.candidate} binding={candidateBinding} actions={actions} candidateTitle={resetArcadeMapProfile.candidateTitle} />}
                {model.shopping === null ? null : <ArcadeShoppingPanel model={model.shopping} onChange={actions.setShoppingStatus} />}
                <ArcadeTaskPanel dayTitle={model.effectiveDay.day.title} tasks={model.tasks} completedIds={completedIds} onCompletedChange={actions.setCompleted} />
                <StageTimeline model={model} actions={actions} bindings={{ ...bindings, owners: ownerBindings }} />
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
