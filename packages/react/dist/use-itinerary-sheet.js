import { useCallback, useEffect, useRef, useState, } from "react";
import { clampSheetHeight, nearestSheetSnap, resolveSheetGeometry, } from "@laugh-tale-island/core";
const SNAP_ORDER = ["collapsed", "half", "expanded"];
function snapHeight(snap, geometry) {
    return geometry[snap];
}
/**
 * Interruptible bottom-sheet behavior for a controlled snap: pointer-captured
 * dragging measured from the rendered surface, frame-coalesced position
 * snapping, keyboard stepping, and drag-time transition suppression.
 * Rendering, wording, and styling stay with the consumer; a consumer handler
 * that calls `preventDefault()` suppresses the package behavior for that event.
 */
export function useItinerarySheet(options) {
    const { snap, geometry, onSnapChange, reducedMotion = false } = options;
    const elementRef = useRef(null);
    const dragRef = useRef(null);
    const dragHeightRef = useRef(null);
    const dragFrameRef = useRef(null);
    const [dragFrame, setDragFrame] = useState(null);
    const dragging = geometry !== null && dragFrame !== null;
    const setElement = useCallback((element) => {
        elementRef.current = element;
    }, []);
    const beginDrag = useCallback((event) => {
        if (geometry === null)
            return;
        const target = event.target;
        if (dragRef.current !== null ||
            (target instanceof Element && target.closest("button") !== null)) {
            return;
        }
        const element = elementRef.current;
        const renderedHeight = element?.getBoundingClientRect().height ?? 0;
        const computedMaxHeight = Number.parseFloat(element === null || element === undefined
            ? ""
            : getComputedStyle(element).maxHeight);
        const sessionGeometry = resolveSheetGeometry({
            collapsedHeight: geometry.collapsed,
            halfHeight: geometry.half,
            expandedHeight: Number.isFinite(computedMaxHeight)
                ? computedMaxHeight
                : geometry.expanded,
        });
        const startHeight = clampSheetHeight(renderedHeight > 0 ? renderedHeight : snapHeight(snap, geometry), { min: sessionGeometry.collapsed, max: sessionGeometry.ceiling });
        dragRef.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            startHeight,
            geometry: sessionGeometry,
        };
        dragHeightRef.current = startHeight;
        setDragFrame({ height: startHeight, floor: sessionGeometry.collapsed, ceiling: sessionGeometry.ceiling });
        event.currentTarget.setPointerCapture?.(event.pointerId);
    }, [geometry, snap]);
    const scheduleDragHeight = useCallback((height) => {
        const geometry = dragRef.current?.geometry;
        if (geometry === undefined)
            return;
        dragHeightRef.current = height;
        if (dragFrameRef.current !== null) {
            return;
        }
        dragFrameRef.current = requestAnimationFrame(() => {
            dragFrameRef.current = null;
            setDragFrame({
                height: dragHeightRef.current ?? height,
                floor: dragRef.current?.geometry.collapsed ?? geometry.collapsed,
                ceiling: dragRef.current?.geometry.ceiling ?? geometry.ceiling,
            });
        });
    }, []);
    const moveDrag = useCallback((event) => {
        const sample = dragRef.current;
        if (sample === null || sample.pointerId !== event.pointerId) {
            return;
        }
        scheduleDragHeight(clampSheetHeight(sample.startHeight + sample.startY - event.clientY, {
            min: sample.geometry.collapsed,
            max: sample.geometry.ceiling,
        }));
    }, [scheduleDragHeight]);
    const settleDrag = useCallback((event, releaseCapture) => {
        const sample = dragRef.current;
        if (sample === null || sample.pointerId !== event.pointerId) {
            return;
        }
        const height = dragHeightRef.current ?? sample.startHeight;
        if (dragFrameRef.current !== null) {
            cancelAnimationFrame(dragFrameRef.current);
        }
        dragFrameRef.current = null;
        dragRef.current = null;
        dragHeightRef.current = null;
        setDragFrame(null);
        onSnapChange(nearestSheetSnap(height, sample.geometry));
        if (releaseCapture &&
            event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
        }
    }, [onSnapChange]);
    const finishDrag = useCallback((event) => {
        settleDrag(event, true);
    }, [settleDrag]);
    const losePointerCapture = useCallback((event) => {
        settleDrag(event, false);
    }, [settleDrag]);
    useEffect(() => {
        return () => {
            if (dragFrameRef.current !== null) {
                cancelAnimationFrame(dragFrameRef.current);
            }
            dragFrameRef.current = null;
            dragRef.current = null;
            dragHeightRef.current = null;
        };
    }, []);
    useEffect(() => {
        if (geometry !== null)
            return;
        if (dragFrameRef.current !== null) {
            cancelAnimationFrame(dragFrameRef.current);
        }
        dragFrameRef.current = null;
        dragRef.current = null;
        dragHeightRef.current = null;
        setDragFrame((current) => (current === null ? current : null));
    }, [geometry]);
    const setSnap = useCallback((next) => {
        if (geometry !== null)
            onSnapChange(next);
    }, [geometry, onSnapChange]);
    const step = useCallback((direction) => {
        if (geometry === null)
            return;
        const currentIndex = SNAP_ORDER.indexOf(snap);
        const nextSnap = SNAP_ORDER[Math.min(SNAP_ORDER.length - 1, Math.max(0, currentIndex + direction))];
        if (nextSnap !== undefined && nextSnap !== snap) {
            onSnapChange(nextSnap);
        }
    }, [geometry, onSnapChange, snap]);
    const moveWithKeyboard = useCallback((event) => {
        if (geometry === null)
            return;
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
    }, [geometry, onSnapChange, snap]);
    const height = geometry === null ? null : (dragFrame?.height ?? snapHeight(snap, geometry));
    const ceiling = geometry === null ? null : (dragFrame?.ceiling ?? geometry.ceiling);
    const floor = geometry === null ? null : (dragFrame?.floor ?? geometry.collapsed);
    const getSheetProps = useCallback(() => ({
        ref: setElement,
        style: height === null || ceiling === null
            ? {}
            : {
                height: `${height}px`,
                maxHeight: `${ceiling}px`,
                ...(dragging || reducedMotion
                    ? { transitionDuration: "0ms" }
                    : {}),
            },
        "data-dragging": dragging ? "true" : "false",
        "data-snap": snap,
    }), [ceiling, dragging, height, reducedMotion, setElement, snap]);
    const getHandleProps = useCallback((userProps = {}) => {
        if (geometry === null)
            return userProps;
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
            onPointerCancel: composePointer(onPointerCancel, finishDrag),
            onLostPointerCapture: composePointer(onLostPointerCapture, losePointerCapture),
            onKeyDown: (event) => {
                onKeyDown?.(event);
                if (!event.defaultPrevented) {
                    moveWithKeyboard(event);
                }
            },
            "aria-keyshortcuts": "ArrowUp ArrowDown Home End",
            "aria-valuenow": height,
            "aria-valuemin": floor,
            "aria-valuemax": ceiling,
        };
    }, [
        beginDrag,
        ceiling,
        finishDrag,
        floor,
        geometry,
        height,
        losePointerCapture,
        moveDrag,
        moveWithKeyboard,
    ]);
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
