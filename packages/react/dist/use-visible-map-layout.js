import { useCallback, useEffect, useRef, useState, } from "react";
import { hasMaterialMapLayoutChange, resolveMapLayout, } from "@laugh-tale-island/core";
const ZERO_VIEWPORT = { width: 0, height: 0 };
const ZERO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
function finitePositive(value, fallback) {
    if (Number.isFinite(value) && value > 0)
        return value;
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}
function readBrowserViewport() {
    const visualViewport = window.visualViewport;
    return {
        width: finitePositive(visualViewport?.width ?? Number.NaN, window.innerWidth),
        height: finitePositive(visualViewport?.height ?? Number.NaN, window.innerHeight),
    };
}
function cssPixels(value) {
    const pixels = Number.parseFloat(value);
    return Number.isFinite(pixels) && pixels >= 0 ? pixels : 0;
}
function readSafeArea(probe) {
    const style = getComputedStyle(probe);
    return {
        top: cssPixels(style.paddingTop),
        right: cssPixels(style.paddingRight),
        bottom: cssPixels(style.paddingBottom),
        left: cssPixels(style.paddingLeft),
    };
}
function sameViewport(previous, next) {
    return previous.width === next.width && previous.height === next.height;
}
function sameInsets(previous, next) {
    return previous.top === next.top
        && previous.right === next.right
        && previous.bottom === next.bottom
        && previous.left === next.left;
}
export function useVisibleMapLayout() {
    const mapElementRef = useRef(null);
    const occlusionElementsRef = useRef(new Map());
    const occlusionCallbacksRef = useRef(new Map());
    const observerRef = useRef(null);
    const safeAreaProbeRef = useRef(null);
    const frameRef = useRef(null);
    const [layoutState, setLayoutState] = useState({ layout: null, revision: 0 });
    const [viewport, setViewport] = useState(ZERO_VIEWPORT);
    const [safeArea, setSafeArea] = useState(ZERO_INSETS);
    const [reducedMotion, setReducedMotion] = useState(false);
    const publishLayout = useCallback((next) => {
        setLayoutState((current) => hasMaterialMapLayoutChange(current.layout, next)
            ? { layout: next, revision: current.revision + 1 }
            : current);
    }, []);
    const scheduleMeasurement = useCallback(() => {
        if (frameRef.current !== null)
            return;
        frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null;
            const nextViewport = readBrowserViewport();
            setViewport((current) => sameViewport(current, nextViewport) ? current : nextViewport);
            const probe = safeAreaProbeRef.current;
            if (probe !== null) {
                const nextSafeArea = readSafeArea(probe);
                setSafeArea((current) => sameInsets(current, nextSafeArea) ? current : nextSafeArea);
            }
            const map = mapElementRef.current;
            if (map === null || !map.isConnected) {
                publishLayout(null);
                return;
            }
            const mapRect = map.getBoundingClientRect();
            const occlusions = [...occlusionElementsRef.current.values()]
                .filter((element) => element.isConnected)
                .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                    x: rect.left - mapRect.left,
                    y: rect.top - mapRect.top,
                    width: rect.width,
                    height: rect.height,
                };
            });
            publishLayout(resolveMapLayout({ width: mapRect.width, height: mapRect.height }, occlusions));
        });
    }, [publishLayout]);
    const mapViewportRef = useCallback((element) => {
        const previous = mapElementRef.current;
        if (previous === element)
            return;
        if (previous !== null)
            observerRef.current?.unobserve(previous);
        mapElementRef.current = element;
        if (element !== null)
            observerRef.current?.observe(element);
        scheduleMeasurement();
    }, [scheduleMeasurement]);
    const occlusionRef = useCallback((id) => {
        const existing = occlusionCallbacksRef.current.get(id);
        if (existing !== undefined)
            return existing;
        const callback = (element) => {
            const previous = occlusionElementsRef.current.get(id);
            if (previous === element)
                return;
            if (previous !== undefined)
                observerRef.current?.unobserve(previous);
            if (element === null) {
                occlusionElementsRef.current.delete(id);
            }
            else {
                occlusionElementsRef.current.set(id, element);
                observerRef.current?.observe(element);
            }
            scheduleMeasurement();
        };
        occlusionCallbacksRef.current.set(id, callback);
        return callback;
    }, [scheduleMeasurement]);
    useEffect(() => {
        const probe = document.createElement("div");
        probe.setAttribute("aria-hidden", "true");
        Object.assign(probe.style, {
            position: "fixed",
            inset: "0 auto auto 0",
            width: "0",
            height: "0",
            overflow: "hidden",
            visibility: "hidden",
            pointerEvents: "none",
            paddingTop: "env(safe-area-inset-top)",
            paddingRight: "env(safe-area-inset-right)",
            paddingBottom: "env(safe-area-inset-bottom)",
            paddingLeft: "env(safe-area-inset-left)",
        });
        document.body.append(probe);
        safeAreaProbeRef.current = probe;
        const observer = typeof ResizeObserver === "function"
            ? new ResizeObserver(scheduleMeasurement)
            : null;
        observerRef.current = observer;
        if (mapElementRef.current !== null)
            observer?.observe(mapElementRef.current);
        for (const element of occlusionElementsRef.current.values()) {
            observer?.observe(element);
        }
        const visualViewport = window.visualViewport;
        window.addEventListener("resize", scheduleMeasurement);
        visualViewport?.addEventListener("resize", scheduleMeasurement);
        visualViewport?.addEventListener("scroll", scheduleMeasurement);
        scheduleMeasurement();
        return () => {
            observer?.disconnect();
            if (observerRef.current === observer)
                observerRef.current = null;
            window.removeEventListener("resize", scheduleMeasurement);
            visualViewport?.removeEventListener("resize", scheduleMeasurement);
            visualViewport?.removeEventListener("scroll", scheduleMeasurement);
            if (frameRef.current !== null)
                cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
            probe.remove();
            if (safeAreaProbeRef.current === probe)
                safeAreaProbeRef.current = null;
        };
    }, [scheduleMeasurement]);
    useEffect(() => {
        if (typeof window.matchMedia !== "function")
            return;
        const query = window.matchMedia("(prefers-reduced-motion: reduce)");
        const update = () => setReducedMotion(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);
    return {
        ...layoutState,
        viewport,
        safeArea,
        reducedMotion,
        mapViewportRef,
        occlusionRef,
    };
}
