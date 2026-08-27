import { useCallback, useRef, useState, } from "react";
import { clampSheetHeight, nearestSheetSnap, } from "@laugh-tale-island/core";
const SNAP_ORDER = ["collapsed", "half", "expanded"];
function snapHeight(snap, geometry) {
    return geometry[snap];
}
/**
 * Interruptible bottom-sheet behavior for a controlled snap: pointer-captured
 * dragging measured from the rendered surface, velocity/distance snapping,
 * keyboard stepping, and drag-time transition suppression. Rendering,
 * wording, and styling stay with the consumer; a consumer handler that calls
 * `preventDefault()` suppresses the package behavior for that event.
 */
export function useItinerarySheet(options) {
    const { snap, geometry, onSnapChange, reducedMotion = false } = options;
    const elementRef = useRef(null);
    const dragRef = useRef(null);
    const [dragFrame, setDragFrame] = useState(null);
    const dragging = dragFrame !== null;
    const setElement = useCallback((element) => {
        elementRef.current = element;
    }, []);
    const beginDrag = useCallback((event) => {
        const renderedHeight = elementRef.current?.getBoundingClientRect().height ?? 0;
        const startHeight = clampSheetHeight(renderedHeight > 0 ? renderedHeight : snapHeight(snap, geometry), { min: geometry.collapsed, max: geometry.ceiling });
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
    }, [geometry, snap]);
    const moveDrag = useCallback((event) => {
        const sample = dragRef.current;
        if (sample === null || sample.pointerId !== event.pointerId) {
            return;
        }
        const height = clampSheetHeight(sample.startHeight + sample.startY - event.clientY, {
            min: sample.geometry.collapsed,
            max: sample.geometry.ceiling,
        });
        sample.lastY = event.clientY;
        sample.lastTime = event.timeStamp;
        setDragFrame({ height, ceiling: sample.geometry.ceiling });
    }, []);
    const finishDrag = useCallback((event) => {
        const sample = dragRef.current;
        if (sample === null || sample.pointerId !== event.pointerId) {
            return;
        }
        const height = clampSheetHeight(sample.startHeight + sample.startY - event.clientY, {
            min: sample.geometry.collapsed,
            max: sample.geometry.ceiling,
        });
        const elapsed = event.timeStamp - sample.lastTime;
        const velocityY = elapsed > 0 ? (event.clientY - sample.lastY) / elapsed : 0;
        dragRef.current = null;
        setDragFrame(null);
        onSnapChange(nearestSheetSnap(height, sample.geometry, velocityY));
        if (event.currentTarget.hasPointerCapture?.(event.pointerId) !== false) {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
        }
    }, [onSnapChange]);
    const cancelDrag = useCallback((event) => {
        const sample = dragRef.current;
        if (sample === null || sample.pointerId !== event.pointerId) {
            return;
        }
        dragRef.current = null;
        setDragFrame(null);
    }, []);
    const setSnap = useCallback((next) => {
        onSnapChange(next);
    }, [onSnapChange]);
    const step = useCallback((direction) => {
        const currentIndex = SNAP_ORDER.indexOf(snap);
        const nextSnap = SNAP_ORDER[Math.min(SNAP_ORDER.length - 1, Math.max(0, currentIndex + direction))];
        if (nextSnap !== undefined && nextSnap !== snap) {
            onSnapChange(nextSnap);
        }
    }, [onSnapChange, snap]);
    const moveWithKeyboard = useCallback((event) => {
        const currentIndex = SNAP_ORDER.indexOf(snap);
        const nextSnap = event.key === "ArrowUp"
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
    }, [onSnapChange, snap]);
    const height = dragFrame?.height ?? snapHeight(snap, geometry);
    const ceiling = dragFrame?.ceiling ?? geometry.ceiling;
    const getSheetProps = useCallback(() => ({
        ref: setElement,
        style: {
            height: `${height}px`,
            maxHeight: `${ceiling}px`,
            ...(dragging || reducedMotion ? { transitionDuration: "0ms" } : {}),
        },
        "data-dragging": dragging ? "true" : "false",
        "data-snap": snap,
    }), [ceiling, dragging, height, reducedMotion, setElement, snap]);
    const getHandleProps = useCallback((userProps = {}) => {
        const composePointer = (user, own) => {
            return (event) => {
                user?.(event);
                if (!event.defaultPrevented) {
                    own(event);
                }
            };
        };
        const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture, onKeyDown, ...rest } = userProps;
        return {
            ...rest,
            onPointerDown: composePointer(onPointerDown, beginDrag),
            onPointerMove: composePointer(onPointerMove, moveDrag),
            onPointerUp: composePointer(onPointerUp, finishDrag),
            onPointerCancel: composePointer(onPointerCancel, cancelDrag),
            onLostPointerCapture: composePointer(onLostPointerCapture, cancelDrag),
            onKeyDown: (event) => {
                onKeyDown?.(event);
                if (!event.defaultPrevented) {
                    moveWithKeyboard(event);
                }
            },
            "aria-keyshortcuts": "ArrowUp ArrowDown Home End",
        };
    }, [beginDrag, cancelDrag, finishDrag, moveDrag, moveWithKeyboard]);
    return {
        snap,
        dragging,
        height,
        ceiling,
        setSnap,
        step,
        getSheetProps,
        getHandleProps,
    };
}
