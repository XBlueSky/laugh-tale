import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefCallback } from "react";
import { type SheetGeometry, type SheetSnap } from "@laugh-tale/core";
export interface UseItinerarySheetOptions {
    /** Controlled snap; the hook never stores its own. */
    snap: SheetSnap;
    geometry: SheetGeometry;
    onSnapChange: (snap: SheetSnap) => void;
    /** When true, transitions are always suppressed, not only while dragging. */
    reducedMotion?: boolean;
}
type SheetPointerEvent = ReactPointerEvent<HTMLElement>;
type SheetKeyboardEvent = ReactKeyboardEvent<HTMLElement>;
export interface SheetHandleProps {
    onPointerDown: (event: SheetPointerEvent) => void;
    onPointerMove: (event: SheetPointerEvent) => void;
    onPointerUp: (event: SheetPointerEvent) => void;
    onPointerCancel: (event: SheetPointerEvent) => void;
    onLostPointerCapture: (event: SheetPointerEvent) => void;
    onKeyDown: (event: SheetKeyboardEvent) => void;
    "aria-keyshortcuts": string;
}
export interface SheetProps {
    ref: RefCallback<HTMLElement>;
    style: CSSProperties;
    "data-dragging": "true" | "false";
    "data-snap": SheetSnap;
}
export interface ItinerarySheetController {
    snap: SheetSnap;
    dragging: boolean;
    /** Live target height in pixels: the drag frame while dragging, otherwise the snap height. */
    height: number;
    ceiling: number;
    setSnap: (snap: SheetSnap) => void;
    step: (direction: 1 | -1) => void;
    getSheetProps: () => SheetProps;
    getHandleProps: (userProps?: Partial<SheetHandleProps> & Record<string, unknown>) => SheetHandleProps & Record<string, unknown>;
}
/**
 * Interruptible bottom-sheet behavior for a controlled snap: pointer-captured
 * dragging measured from the rendered surface, velocity/distance snapping,
 * keyboard stepping, and drag-time transition suppression. Rendering,
 * wording, and styling stay with the consumer; a consumer handler that calls
 * `preventDefault()` suppresses the package behavior for that event.
 */
export declare function useItinerarySheet(options: UseItinerarySheetOptions): ItinerarySheetController;
export {};
