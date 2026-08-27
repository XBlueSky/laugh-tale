import type { CSSProperties } from "react";

import type { SheetSnap } from "@laugh-tale-island/core";

import type { ExperienceViewProps } from "../../controllers/presentation-contract";
import { AtlasCandidateDecision, AtlasShoppingDecision } from "../components/AtlasDecisions";
import { AtlasMapSurface } from "../components/AtlasMapSurface";
import { AtlasTimeline } from "../components/AtlasTimeline";
import { AtlasReservationPanel, AtlasTaskPanel } from "../components/AtlasUtilityPanels";
import "../styles/index.css";
import { fieldAtlasMapProfile } from "../theme-map-profile";

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

export function FieldAtlasExperience({
  model,
  actions,
  bindings,
}: ExperienceViewProps) {
  const headerClearance = model.header.clearance;
  const mapPaddingBottom =
    model.sheet.geometry[model.sheet.snap] + model.viewport.safeBottom + 16;
  const mapProviderBottom =
    model.sheet.geometry[model.sheet.snap] + model.viewport.safeBottom + 8;
  const completedIds = new Set(model.progress.completedIds);
  const shellStyle = {
    "--safe-area-top": `${model.viewport.safeTop}px`,
    "--safe-area-bottom": `${model.viewport.safeBottom}px`,
    "--header-clearance": `${headerClearance}px`,
    "--sheet-ceiling": `${model.sheet.geometry.ceiling}px`,
    "--map-padding-top": `${headerClearance}px`,
    "--map-padding-bottom": `${mapPaddingBottom}px`,
    "--map-provider-bottom": `${mapProviderBottom}px`,
    "--atlas-state-duration": model.motion === "reduced" ? "0ms" : "180ms",
    maxInlineSize: "100vw",
    overflowX: "hidden",
  } as CSSProperties;
  const sheetProps = bindings.sheet.getSheetProps();
  const handleProps = bindings.sheet.getHandleProps();
  const sheetExpanded = model.sheet.snap === "expanded";
  const sheetCollapsed = model.sheet.snap === "collapsed";
  const currentClock = clockLabel(model.clock.instant, model.clock.timezone);

  return (
    <>
      {model.persistence === "memory-only" ? (
        <p
          className="atlas-persistence"
          role="status"
          aria-label="旅行進度僅保留在此頁面"
          data-persistence-status="memory-only"
        >
          Progress is stored on this page only.
        </p>
      ) : null}
      <main
        className="trip-experience field-atlas-experience"
        data-testid="trip-experience"
        data-geometry-source="shared"
        data-header-expanded={model.header.expanded ? "true" : "false"}
        data-motion={model.motion}
        data-viewport-width={String(model.viewport.width)}
        data-map-chrome-layout="bounded"
        style={shellStyle}
      >
        <div className="safe-area-probe" aria-hidden="true" />
        <div className="atlas-responsive-layout">
          <AtlasMapSurface map={model.map} binding={bindings.map} retry={actions.retryMap} />

          <header
            className="day-header atlas-index atlas-day-index"
            aria-label="Trip controls"
            data-expanded={model.header.expanded ? "true" : "false"}
            data-motion-duration={model.motion === "reduced" ? "0ms" : "180ms"}
          >
          <div className="atlas-day-index__primary">
            <div>
              <span className="atlas-key">ACTIVE FIELD</span>
              <strong title={model.trip.title}>{model.trip.title}</strong>
              <span>
                <time aria-label={`${model.clock.timezone} time`}>{currentClock}</time>
                <small>{model.clock.timezone}</small>
              </span>
            </div>
            <div className="atlas-day-index__controls">
              <button type="button" aria-label="Return to lodging" data-touch-target="44" onClick={actions.returnToLodging}>BASE</button>
              <button type="button" aria-label="Return to the current itinerary item" data-touch-target="44" onClick={actions.returnToNow}>NOW</button>
              <button
                type="button"
                aria-label={model.header.expanded ? "Collapse date choices" : "Expand date choices"}
                aria-expanded={model.header.expanded}
                data-touch-target="44"
                onClick={() => actions.setHeaderExpanded(!model.header.expanded)}
              >
                {model.header.expanded ? "−" : "+"}
              </button>
            </div>
          </div>
          <nav
            className="atlas-index atlas-day-index__rail"
            aria-label="Trip dates"
            aria-hidden={model.header.expanded ? "false" : "true"}
            data-testid="date-rail"
            inert={!model.header.expanded}
          >
            {model.days.map((day, index) => (
              <button
                key={day.id}
                type="button"
                aria-label={`Day ${index + 1}: ${dayLabel(day.title, day.date)}`}
                aria-pressed={day.id === model.effectiveDay.day.id}
                data-current={day.id === model.effectiveDay.day.id ? "true" : "false"}
                data-touch-target="44"
                tabIndex={model.header.expanded ? 0 : -1}
                onClick={() => actions.selectDay(day.id)}
              >
                <span className="stop-number">{String(index + 1).padStart(2, "0")}</span>
                <span>{day.title}</span>
                <time dateTime={day.date}>{day.date.slice(5).replace("-", "/")}</time>
              </button>
            ))}
          </nav>
          </header>

          <div className="map-controls atlas-map-controls" role="toolbar" aria-label="Map controls">
          <button type="button" aria-label="回到旅行首頁" data-touch-target="44" onClick={actions.returnHome}>HOME</button>
          <AtlasReservationPanel reservations={model.trip.reservations} />
          <button
            type="button"
            aria-label={
              model.location.status === "active"
                ? "Recenter my location"
                : model.location.status === "requesting"
                  ? "Requesting location"
                  : "Use my location"
            }
            data-touch-target="44"
            disabled={model.location.status === "requesting"}
            onClick={model.location.status === "active" ? actions.recenterLocation : actions.startLocation}
          >
            LOC
          </button>
          {model.location.status === "active" ? (
            <button type="button" aria-label="Stop location sharing" data-touch-target="44" onClick={actions.stopLocation}>STOP</button>
          ) : null}
          <span className="atlas-map-controls__status" aria-live="polite">
            {locationLabel(model.location.status)}
          </span>
          </div>

          <section
            {...sheetProps}
            className="itinerary-sheet atlas-detail-surface"
            aria-label="Itinerary"
            style={{
              ...sheetProps.style,
              bottom: "var(--safe-area-bottom)",
              paddingBottom: 0,
            }}
          >
          <button
            type="button"
            className="atlas-detail-surface__handle"
            aria-label="Drag itinerary sheet"
            data-touch-target="44"
            {...handleProps}
          >
            <span aria-hidden="true" />
          </button>
          <div
            className="atlas-detail-surface__toolbar"
            role="toolbar"
            aria-label="Itinerary controls"
            data-compact={sheetCollapsed ? "true" : "false"}
          >
            <div className="atlas-detail-surface__heading">
              <span className="atlas-key">DAY {String(model.days.findIndex(({ id }) => id === model.effectiveDay.day.id) + 1).padStart(2, "0")}</span>
              <strong title={model.effectiveDay.day.title}>{model.effectiveDay.day.title}</strong>
              <span>{model.effectiveDay.nodes.length} {model.effectiveDay.nodes.length === 1 ? "stop" : "stops"}</span>
            </div>
            <button type="button" aria-label="Return to the current itinerary item" data-touch-target="44" onClick={actions.returnToNow}>NOW</button>
            <button
              type="button"
              aria-label={sheetExpanded ? "Collapse itinerary" : "Expand itinerary"}
              data-touch-target="44"
              onClick={() => actions.setSheetSnap(sheetExpanded ? "half" : "expanded")}
            >
              {sheetExpanded ? "−" : "+"}
            </button>
          </div>
          <nav className="atlas-sheet-index" aria-label="Itinerary sheet positions">
            {snaps.map((snap) => (
              <button
                key={snap}
                type="button"
                aria-label={`Set ${snap} itinerary`}
                aria-pressed={model.sheet.snap === snap}
                data-snap-target={snap}
                data-touch-target="44"
                onClick={() => actions.setSheetSnap(snap)}
              >
                {snap === "collapsed" ? "1" : snap === "half" ? "2" : "3"}
              </button>
            ))}
          </nav>

          {sheetCollapsed ? null : (
            <div className="atlas-detail-surface__scroll" data-scroll-region="itinerary">
              {model.candidate === null || bindings.candidate === null ? null : (
                <AtlasCandidateDecision
                  key={model.candidate.group.id}
                  model={model.candidate}
                  binding={bindings.candidate}
                  actions={actions}
                  candidateTitle={fieldAtlasMapProfile.candidateTitle}
                />
              )}
              {model.shopping === null ? null : (
                <AtlasShoppingDecision model={model.shopping} onChange={actions.setShoppingStatus} />
              )}
              {model.tasks.length === 0 ? null : (
                <AtlasTaskPanel
                  dayTitle={model.effectiveDay.day.title}
                  tasks={model.tasks}
                  completedIds={completedIds}
                  onCompletedChange={actions.setCompleted}
                />
              )}
              <AtlasTimeline model={model} actions={actions} bindings={bindings} />
            </div>
          )}
          </section>
        </div>
      </main>
    </>
  );
}
