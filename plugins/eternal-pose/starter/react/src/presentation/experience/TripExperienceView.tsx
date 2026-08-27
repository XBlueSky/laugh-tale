import { House, LocateFixed, MapPin, Pause } from "lucide-react";
import type { CSSProperties } from "react";

import type { ExperienceViewProps } from "../../controllers/presentation-contract";
import { DayHeader } from "../DayHeader";
import { ItineraryTimeline } from "../ItineraryTimeline";
import { CandidateDecision } from "../decisions/CandidateDecision";
import { ShoppingStatusSelect } from "../decisions/ShoppingStatusSelect";
import { USER_LOCATION_LABELS } from "../labels";
import { ReservationPanel } from "../reservations/ReservationPanel";
import "../styles/base.css";
import "../styles/recipe.css";
import { TaskWidget } from "../tasks/TaskWidget";
import { ItineraryMapView } from "./ItineraryMapView";
import { ItinerarySheetView } from "./ItinerarySheetView";
import { themeMapProfile } from "../theme-map-profile";

function formatLocalClock(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(new Date(instant));
}

export function TripExperienceView({
  model,
  actions,
  bindings,
}: ExperienceViewProps) {
  const headerClearance =
    model.viewport.height -
    model.sheet.geometry.ceiling -
    model.viewport.safeBottom;
  const mapPaddingBottom =
    model.sheet.geometry[model.sheet.snap] + model.viewport.safeBottom + 16;
  const shellStyle = {
    "--safe-area-top": `${model.viewport.safeTop}px`,
    "--safe-area-bottom": `${model.viewport.safeBottom}px`,
    "--header-clearance": `${headerClearance}px`,
    "--sheet-ceiling": `${model.sheet.geometry.ceiling}px`,
    "--map-padding-top": `${headerClearance}px`,
    "--map-padding-bottom": `${mapPaddingBottom}px`,
    "--shell-motion-duration": model.motion === "reduced" ? "0ms" : "200ms",
    maxInlineSize: "100vw",
    overflowX: "hidden",
  } as CSSProperties;
  const completedProgressIds = new Set(model.progress.completedIds);
  const completedChecklistIds = new Set(
    model.progress.completedIds.flatMap((id) =>
      id.startsWith("checklist:")
        ? [id.slice("checklist:".length)]
        : [],
    ),
  );

  return (
    <>
      {model.persistence === "memory-only" ? (
        <p
          className="trip-progress-persistence"
          role="status"
          aria-label="旅行進度僅保留在此頁面"
          data-persistence-status="memory-only"
        >
          目前無法儲存進度，這次變更僅保留在此頁面。
        </p>
      ) : null}
      <main
        className="trip-experience"
        data-testid="trip-experience"
        data-geometry-source="shared"
        data-header-expanded={model.header.expanded ? "true" : "false"}
        data-motion={model.motion}
        data-viewport-width={String(model.viewport.width)}
        style={shellStyle}
      >
      <div className="safe-area-probe" aria-hidden="true" />
      <ItineraryMapView
        map={model.map}
        binding={bindings.map}
        retry={actions.retryMap}
      />

      <DayHeader
        tripTitle={model.trip.title}
        timezoneLabel={model.clock.timezone}
        clockLabel={formatLocalClock(model.clock.instant, model.clock.timezone)}
        days={model.days}
        selectedDayId={model.effectiveDay.day.id}
        expanded={model.header.expanded}
        reducedMotion={model.motion === "reduced"}
        onExpandedChange={actions.setHeaderExpanded}
        onDaySelect={actions.selectDay}
        onReturnToNow={actions.returnToNow}
        onReturnToLodging={actions.returnToLodging}
      />

      <div className="map-controls" role="toolbar" aria-label="Map controls">
        <button
          type="button"
          className="icon-control"
          aria-label="回到旅行首頁"
          data-touch-target="44"
          onClick={actions.returnHome}
        >
          <House aria-hidden="true" size={19} strokeWidth={1.8} />
        </button>
        <ReservationPanel reservations={model.trip.reservations} />
        <button
          type="button"
          className="map-controls__location icon-control"
          aria-label={
            model.location.status === "active"
              ? "Recenter my location"
              : model.location.status === "requesting"
                ? "Requesting location"
                : "Use my location"
          }
          data-touch-target="44"
          disabled={model.location.status === "requesting"}
          onClick={
            model.location.status === "active"
              ? actions.recenterLocation
              : actions.startLocation
          }
        >
          {model.location.status === "active" ? (
            <LocateFixed aria-hidden="true" size={19} strokeWidth={1.8} />
          ) : (
            <MapPin aria-hidden="true" size={19} strokeWidth={1.8} />
          )}
        </button>
        {model.location.status === "active" ? (
          <button
            type="button"
            className="icon-control"
            aria-label="Stop location sharing"
            data-touch-target="44"
            onClick={actions.stopLocation}
          >
            <Pause aria-hidden="true" size={18} strokeWidth={1.8} />
          </button>
        ) : null}
        <span className="map-controls__status" aria-live="polite">
          {USER_LOCATION_LABELS[model.location.status]}
        </span>
      </div>

      <ItinerarySheetView
        sheet={model.sheet}
        binding={bindings.sheet}
        dayTitle={model.effectiveDay.day.title}
        itineraryCount={model.effectiveDay.nodes.length}
        onSnapChange={actions.setSheetSnap}
        onReturnToNow={actions.returnToNow}
      >
        {model.candidate === null || bindings.candidate === null ? null : (
          <CandidateDecision
            model={model.candidate}
            binding={bindings.candidate}
            actions={actions}
            candidateTitle={themeMapProfile.candidateTitle}
          />
        )}

        {model.shopping === null ? null : (
          <section
            className="shopping-decision-panel"
            data-surface="shopping-progress"
            aria-label={`${model.shopping.node.title} 採買清單`}
          >
            <h3>{model.shopping.node.title}</h3>
            <ul className="shopping-decision-panel__items">
              {model.shopping.node.payload.items.map((item) => (
                <li key={`shopping-item:${item.id}`}>
                  <span>{item.title}</span>
                  <ShoppingStatusSelect
                    item={item}
                    status={model.shopping!.statuses[item.id] ?? "pending"}
                    onChange={(status) =>
                      actions.setShoppingStatus(item.id, status)
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {model.tasks.length === 0 ? null : (
          <TaskWidget
            dayTitle={model.effectiveDay.day.title}
            tasks={model.tasks}
            completedIds={completedProgressIds}
            onCompletedChange={actions.setCompleted}
          />
        )}

        <ItineraryTimeline
          nodes={model.effectiveDay.nodes}
          routes={model.routes}
          selection={model.selection}
          onNodeSelect={actions.selectNode}
          ownerBindings={bindings.owners}
          dayDate={model.effectiveDay.day.date}
          currentNodeId={model.live.currentNodeId}
          completedChecklistIds={completedChecklistIds}
          shoppingStatuses={model.progress.shoppingStatuses}
          onRouteSelect={(routeId) => actions.selectRoute(routeId, "list")}
          onRouteRetry={actions.retryRoute}
          reducedMotion={model.motion === "reduced"}
        />
      </ItinerarySheetView>
      </main>
    </>
  );
}
