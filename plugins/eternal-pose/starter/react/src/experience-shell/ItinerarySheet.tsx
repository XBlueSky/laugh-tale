import {
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  LoaderCircle,
  LocateFixed,
  RotateCcw,
} from "lucide-react";
import { type ReactNode } from "react";

import type { SheetGeometry, SheetSnap } from "@laugh-tale-island/core";
import { useItinerarySheet } from "@laugh-tale-island/react";

export interface ItineraryRouteStatus {
  state: "loading" | "error";
  label: string;
  onRetry?: () => void;
}

export interface ItinerarySheetProps {
  snap: SheetSnap;
  geometry: SheetGeometry;
  dayTitle: string;
  itineraryCount: number;
  onSnapChange: (snap: SheetSnap) => void;
  onReturnToNow: () => void;
  routeStatus?: ItineraryRouteStatus;
  children: ReactNode;
}

export function ItinerarySheet({
  snap,
  geometry,
  dayTitle,
  itineraryCount,
  onSnapChange,
  onReturnToNow,
  routeStatus,
  children,
}: ItinerarySheetProps) {
  const sheet = useItinerarySheet({ snap, geometry, onSnapChange });
  const sheetProps = sheet.getSheetProps();
  const expanded = snap === "expanded";
  const collapsed = snap === "collapsed";

  return (
    <section
      {...sheetProps}
      className="itinerary-sheet"
      aria-label="Itinerary"
      style={{
        ...sheetProps.style,
        bottom: "var(--safe-area-bottom)",
        paddingBottom: "0px",
      }}
    >
      <button
        type="button"
        className="itinerary-sheet__drag-handle"
        aria-label="Drag itinerary sheet"
        data-touch-target="44"
        {...sheet.getHandleProps()}
      >
        <GripHorizontal aria-hidden="true" size={22} strokeWidth={1.8} />
      </button>

      <div
        className="itinerary-sheet__toolbar"
        role="toolbar"
        aria-label="Itinerary controls"
        data-compact={collapsed ? "true" : "false"}
      >
        <div className="itinerary-sheet__heading">
          <strong data-ellipsis="true" title={dayTitle}>
            {dayTitle}
          </strong>
          <span data-secondary="true">
            {itineraryCount} {itineraryCount === 1 ? "stop" : "stops"}
          </span>
        </div>
        <button
          type="button"
          className="icon-control"
          aria-label="Return to the current itinerary item"
          data-icon-control="true"
          data-touch-target="44"
          onClick={onReturnToNow}
        >
          <LocateFixed aria-hidden="true" size={20} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="icon-control"
          aria-label={expanded ? "Collapse itinerary" : "Expand itinerary"}
          data-icon-control="true"
          data-touch-target="44"
          onClick={() => sheet.setSnap(expanded ? "half" : "expanded")}
        >
          {expanded ? (
            <ChevronDown aria-hidden="true" size={20} strokeWidth={1.8} />
          ) : (
            <ChevronUp aria-hidden="true" size={20} strokeWidth={1.8} />
          )}
        </button>
      </div>

      {routeStatus === undefined || collapsed ? null : (
        <div
          className="route-status"
          role="status"
          data-layout="centered-baseline"
          data-state={routeStatus.state}
        >
          {routeStatus.state === "loading" ? (
            <LoaderCircle aria-hidden="true" size={17} strokeWidth={1.8} />
          ) : (
            <RotateCcw aria-hidden="true" size={17} strokeWidth={1.8} />
          )}
          <span>{routeStatus.label}</span>
          {routeStatus.state === "error" && routeStatus.onRetry !== undefined ? (
            <button
              type="button"
              aria-label="Retry route"
              data-touch-target="44"
              onClick={routeStatus.onRetry}
            >
              Retry
            </button>
          ) : null}
        </div>
      )}

      {collapsed ? null : (
        <div className="itinerary-sheet__scroll" data-scroll-region="itinerary">
          {children}
        </div>
      )}
    </section>
  );
}
