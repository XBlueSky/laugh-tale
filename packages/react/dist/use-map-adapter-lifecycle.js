import { useCallback, useEffect, useInsertionEffect, useMemo, useRef, useState } from "react";
import { hasMaterialMapLayoutChange, reframeCameraIntent } from "@laugh-tale-island/core";
function runtimeFailure(error, development) {
    let diagnostic;
    if (development) {
        try {
            diagnostic = error instanceof Error ? error.message : String(error);
        }
        catch {
            diagnostic = "Map adapter mount failure";
        }
    }
    return { status: "unavailable", reason: "network", retryable: true, ...(diagnostic === undefined ? {} : { diagnostic }) };
}
function unavailableStatus(attempt, failure) {
    return {
        kind: "unavailable", attempt, reason: failure.reason, retryable: failure.retryable,
        ...(failure.diagnostic === undefined ? {} : { diagnostic: failure.diagnostic }),
    };
}
export function useMapAdapterLifecycle({ createAdapter, mountConfig, presentation, userLocation, development, cameraIntent, layout, onFailure, }) {
    const [host, setHost] = useState(null);
    const [attempt, setAttempt] = useState(0);
    const [status, setStatus] = useState({ kind: "idle" });
    const latestEvents = useRef(mountConfig.events);
    const latestPresentation = useRef(presentation);
    const latestLayout = useRef(layout);
    const deliveredLayout = useRef(undefined);
    const latestUserLocation = useRef(userLocation);
    const latestDevelopment = useRef(development);
    const latestFailure = useRef(onFailure);
    // Publish committed inputs before child refs/layout effects can invoke retained events.
    useInsertionEffect(() => {
        latestEvents.current = mountConfig.events;
        latestPresentation.current = presentation;
        latestLayout.current = layout;
        latestUserLocation.current = userLocation;
        latestDevelopment.current = development;
        latestFailure.current = onFailure;
    }, [mountConfig.events, presentation, layout, userLocation, development, onFailure]);
    const adapterRef = useRef(null);
    const readyRef = useRef(false);
    const generationRef = useRef(0);
    const retryRequestedRef = useRef(false);
    const lastAppliedCameraRef = useRef(null);
    const pendingReframeRef = useRef(null);
    const reframeIdRef = useRef(null);
    const failRef = useRef(null);
    const reportFailure = useCallback((failure, cause) => {
        try {
            latestFailure.current?.(failure, cause);
        }
        catch { /* Reporting cannot interrupt terminal cleanup. */ }
    }, []);
    const mapRef = useCallback((element) => setHost(element), []);
    const stableSelectionEvents = useMemo(() => ({
        onMarkerSelect: (id) => latestEvents.current.onMarkerSelect(id),
        onRouteSelect: (id) => latestEvents.current.onRouteSelect(id),
    }), []);
    const cancelPendingReframe = useCallback(() => {
        if (reframeIdRef.current !== null)
            cancelAnimationFrame(reframeIdRef.current);
        reframeIdRef.current = null;
        pendingReframeRef.current = null;
    }, []);
    const runReadyAdapterWork = useCallback((work) => {
        const adapter = adapterRef.current;
        if (!readyRef.current || adapter === null)
            return false;
        const generation = generationRef.current;
        const fail = failRef.current;
        try {
            work(adapter);
        }
        catch (error) {
            fail?.(runtimeFailure(error, latestDevelopment.current), error);
            return false;
        }
        // Adapter methods can synchronously emit failure or replace their owner.
        return generation === generationRef.current && readyRef.current && adapterRef.current === adapter;
    }, []);
    useEffect(() => {
        if (host === null || createAdapter === undefined) {
            setStatus((current) => current.kind === "idle" ? current : { kind: "idle" });
            return;
        }
        const generation = ++generationRef.current;
        cancelPendingReframe();
        lastAppliedCameraRef.current = null;
        deliveredLayout.current = undefined;
        let adapter;
        try {
            adapter = createAdapter();
        }
        catch (error) {
            retryRequestedRef.current = false;
            const failure = runtimeFailure(error, latestDevelopment.current);
            reportFailure(failure, error);
            setStatus(unavailableStatus(attempt, failure));
            return;
        }
        let released = false;
        let terminal = false;
        const active = () => generation === generationRef.current && !terminal && !released;
        const release = () => {
            if (released)
                return;
            released = true;
            try {
                adapter.destroy();
            }
            catch {
                // Cleanup is secondary: preserve the terminal result and any newer owner.
            }
        };
        const fail = (result, cause) => {
            if (!active())
                return;
            terminal = true;
            cancelPendingReframe();
            readyRef.current = false;
            adapterRef.current = null;
            failRef.current = null;
            retryRequestedRef.current = false;
            reportFailure(result, cause);
            setStatus(unavailableStatus(attempt, result));
            try {
                latestEvents.current.onUnavailable(result);
            }
            finally {
                release();
            }
        };
        adapterRef.current = adapter;
        failRef.current = fail;
        setStatus({ kind: "mounting", attempt });
        try {
            void adapter.mount(host, {
                visualProfile: mountConfig.visualProfile,
                createMarkerContent: mountConfig.createMarkerContent,
                createUserLocationContent: mountConfig.createUserLocationContent,
                events: { ...stableSelectionEvents, onUnavailable: fail },
            }).then(() => {
                if (!active())
                    return;
                readyRef.current = true;
                if (!runReadyAdapterWork((current) => current.setLayout?.(latestLayout.current)))
                    return;
                deliveredLayout.current = latestLayout.current;
                if (!runReadyAdapterWork((current) => current.render(latestPresentation.current)))
                    return;
                if (!runReadyAdapterWork((current) => current.setUserLocation(latestUserLocation.current)))
                    return;
                retryRequestedRef.current = false;
                setStatus({ kind: "ready", attempt });
            }).catch((error) => fail(runtimeFailure(error, latestDevelopment.current), error));
        }
        catch (error) {
            fail(runtimeFailure(error, latestDevelopment.current), error);
        }
        return () => {
            generationRef.current += 1;
            cancelPendingReframe();
            readyRef.current = false;
            adapterRef.current = null;
            failRef.current = null;
            release();
        };
    }, [attempt, host, createAdapter, mountConfig.visualProfile, mountConfig.createMarkerContent, mountConfig.createUserLocationContent, stableSelectionEvents, runReadyAdapterWork, cancelPendingReframe, reportFailure]);
    useEffect(() => {
        runReadyAdapterWork((adapter) => adapter.render(presentation));
    }, [presentation, runReadyAdapterWork]);
    useEffect(() => {
        runReadyAdapterWork((adapter) => adapter.setUserLocation(userLocation));
    }, [userLocation, runReadyAdapterWork]);
    useEffect(() => {
        if (deliveredLayout.current !== undefined && !hasMaterialMapLayoutChange(deliveredLayout.current, layout))
            return;
        if (runReadyAdapterWork((adapter) => adapter.setLayout?.(layout)))
            deliveredLayout.current = layout;
    }, [layout, status.kind, runReadyAdapterWork]);
    useEffect(() => {
        if (!readyRef.current || cameraIntent === null || layout === null) {
            cancelPendingReframe();
            return;
        }
        const last = lastAppliedCameraRef.current;
        if (last === null || last.intent.intentId !== cameraIntent.intentId) {
            cancelPendingReframe();
            if (!runReadyAdapterWork((adapter) => adapter.applyCameraIntent(cameraIntent)))
                return;
            lastAppliedCameraRef.current = { intent: cameraIntent, layout };
            return;
        }
        if (!hasMaterialMapLayoutChange(last.layout, layout)) {
            cancelPendingReframe();
            return;
        }
        pendingReframeRef.current = { intent: last.intent, layout };
        if (reframeIdRef.current !== null)
            return;
        const generation = generationRef.current;
        const frameId = requestAnimationFrame(() => {
            // A cancelled callback must not consume a newer generation's queued work.
            if (generation !== generationRef.current || reframeIdRef.current !== frameId)
                return;
            reframeIdRef.current = null;
            const pending = pendingReframeRef.current;
            pendingReframeRef.current = null;
            if (pending === null)
                return;
            const reframed = reframeCameraIntent(pending.intent, pending.layout);
            if (!runReadyAdapterWork((adapter) => adapter.applyCameraIntent(reframed)))
                return;
            lastAppliedCameraRef.current = { intent: reframed, layout: pending.layout };
        });
        reframeIdRef.current = frameId;
    }, [cameraIntent, layout, status.kind, runReadyAdapterWork, cancelPendingReframe]);
    const retry = useCallback(() => {
        if (status.kind !== "unavailable" || !status.retryable || retryRequestedRef.current)
            return;
        retryRequestedRef.current = true;
        cancelPendingReframe();
        setAttempt((current) => current + 1);
    }, [status, cancelPendingReframe]);
    const getCameraSnapshot = useCallback(() => {
        let snapshot = null;
        return runReadyAdapterWork((adapter) => { snapshot = adapter.getCameraSnapshot(); }) ? snapshot : null;
    }, [runReadyAdapterWork]);
    return { mapRef, status, retry, getCameraSnapshot };
}
