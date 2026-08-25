import {
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  LoaderCircle,
  LocateFixed,
  RotateCcw,
} from "lucide-react";
import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import {
  clampSheetHeight,
  nearestSheetSnap,
  type SheetGeometry,
  type SheetSnap,
} from "./sheet-geometry";

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

interface DragSample {
  pointerId: number;
  startY: number;
  startHeight: number;
  geometry: SheetGeometry;
  lastY: number;
  lastTime: number;
}

interface DragFrame {
  height: number;
  ceiling: number;
}

function snapHeight(snap: SheetSnap, geometry: SheetGeometry): number {
  return geometry[snap];
}

const SNAP_ORDER: readonly SheetSnap[] = ["collapsed", "half", "expanded"];

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
  const sheetRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragSample | null>(null);
  const [dragFrame, setDragFrame] = useState<DragFrame | null>(null);
  const dragging = dragFrame !== null;

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const renderedHeight = sheetRef.current?.getBoundingClientRect().height ?? 0;
    const startHeight = clampSheetHeight(
      renderedHeight > 0 ? renderedHeight : snapHeight(snap, geometry),
      { min: geometry.collapsed, max: geometry.ceiling },
    );
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight,
      geometry: { ...geometry },
      lastY: event.clientY,
      lastTime: event.timeStamp,
    };
    setDragFrame({ height: startHeight, ceiling: geometry.ceiling });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const sample = dragRef.current;
    if (sample === null || sample.pointerId !== event.pointerId) {
      return;
    }
    const height = clampSheetHeight(
      sample.startHeight + sample.startY - event.clientY,
      { min: sample.geometry.collapsed, max: sample.geometry.ceiling },
    );
    sample.lastY = event.clientY;
    sample.lastTime = event.timeStamp;
    setDragFrame({ height, ceiling: sample.geometry.ceiling });
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const sample = dragRef.current;
    if (sample === null || sample.pointerId !== event.pointerId) {
      return;
    }
    const height = clampSheetHeight(
      sample.startHeight + sample.startY - event.clientY,
      { min: sample.geometry.collapsed, max: sample.geometry.ceiling },
    );
    const elapsed = event.timeStamp - sample.lastTime;
    const velocityY = elapsed > 0 ? (event.clientY - sample.lastY) / elapsed : 0;
    dragRef.current = null;
    setDragFrame(null);
    onSnapChange(nearestSheetSnap(height, sample.geometry, velocityY));
    if (
      event.currentTarget.hasPointerCapture?.(event.pointerId) !== false
    ) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const sample = dragRef.current;
    if (sample === null || sample.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    setDragFrame(null);
  };

  const moveWithKeyboard = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ): void => {
    const currentIndex = SNAP_ORDER.indexOf(snap);
    const nextSnap =
      event.key === "ArrowUp"
        ? SNAP_ORDER[Math.min(currentIndex + 1, SNAP_ORDER.length - 1)]
        : event.key === "ArrowDown"
          ? SNAP_ORDER[Math.max(currentIndex - 1, 0)]
          : event.key === "Home"
            ? "collapsed"
            : event.key === "End"
              ? "expanded"
              : undefined;
    if (nextSnap === undefined || nextSnap === snap) {
      return;
    }
    event.preventDefault();
    onSnapChange(nextSnap);
  };

  const targetHeight = dragFrame?.height ?? snapHeight(snap, geometry);
  const targetCeiling = dragFrame?.ceiling ?? geometry.ceiling;
  const expanded = snap === "expanded";
  const collapsed = snap === "collapsed";

  return (
    <section
      ref={sheetRef}
      className="itinerary-sheet"
      aria-label="Itinerary"
      data-dragging={dragging ? "true" : "false"}
      data-snap={snap}
      style={{
        bottom: "var(--safe-area-bottom)",
        height: `${targetHeight}px`,
        maxHeight: `${targetCeiling}px`,
        paddingBottom: "0px",
        transitionDuration: dragging ? "0ms" : undefined,
      }}
    >
      <button
        type="button"
        className="itinerary-sheet__drag-handle"
        aria-label="Drag itinerary sheet"
        aria-keyshortcuts="ArrowUp ArrowDown Home End"
        data-touch-target="44"
        onKeyDown={moveWithKeyboard}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
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
          onClick={() => onSnapChange(expanded ? "half" : "expanded")}
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
