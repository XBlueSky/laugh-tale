import { useCallback, useEffect, useInsertionEffect, useRef, useState } from "react";
function browserGeolocation() {
    return typeof navigator === "undefined" ? undefined : navigator.geolocation;
}
function coordinatesFrom(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    return Number.isFinite(lat) &&
        lat >= -90 &&
        lat <= 90 &&
        Number.isFinite(lng) &&
        lng >= -180 &&
        lng <= 180
        ? { lat, lng }
        : undefined;
}
export function useUserLocation(onRecenter, geolocation = browserGeolocation()) {
    const recenterRef = useRef(onRecenter);
    const mountedRef = useRef(false);
    const generationRef = useRef(0);
    const watchRef = useRef(null);
    const latestLocationRef = useRef(null);
    const pendingFirstFocusRef = useRef(null);
    const [status, setStatus] = useState("idle");
    const [location, setLocation] = useState(null);
    useInsertionEffect(() => { recenterRef.current = onRecenter; }, [onRecenter]);
    const clearActiveWatch = useCallback(() => {
        const active = watchRef.current;
        if (active !== null) {
            active.geolocation.clearWatch(active.id);
            watchRef.current = null;
        }
    }, []);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            generationRef.current += 1;
            pendingFirstFocusRef.current = null;
            clearActiveWatch();
        };
    }, [clearActiveWatch]);
    useEffect(() => {
        if (location === null || !mountedRef.current) {
            return;
        }
        if (pendingFirstFocusRef.current === generationRef.current) {
            pendingFirstFocusRef.current = null;
            recenterRef.current();
        }
    }, [location]);
    const start = useCallback(() => {
        clearActiveWatch();
        const generation = generationRef.current + 1;
        generationRef.current = generation;
        pendingFirstFocusRef.current = generation;
        latestLocationRef.current = null;
        setLocation(null);
        if (geolocation === undefined) {
            pendingFirstFocusRef.current = null;
            setStatus("unavailable");
            return;
        }
        setStatus("requesting");
        const failGeneration = (nextStatus) => {
            if (!mountedRef.current || generationRef.current !== generation) {
                return;
            }
            const active = watchRef.current;
            if (active?.generation === generation) {
                active.geolocation.clearWatch(active.id);
                watchRef.current = null;
            }
            generationRef.current += 1;
            pendingFirstFocusRef.current = null;
            latestLocationRef.current = null;
            setLocation(null);
            setStatus(nextStatus);
        };
        try {
            const id = geolocation.watchPosition((position) => {
                if (!mountedRef.current || generationRef.current !== generation) {
                    return;
                }
                const nextLocation = coordinatesFrom(position);
                if (nextLocation === undefined) {
                    failGeneration("unavailable");
                    return;
                }
                latestLocationRef.current = nextLocation;
                setLocation(nextLocation);
                setStatus("active");
            }, (error) => {
                failGeneration(error.code === 1 ? "denied" : "unavailable");
            }, { enableHighAccuracy: true, maximumAge: 15_000, timeout: 15_000 });
            if (generationRef.current === generation) {
                watchRef.current = { id, generation, geolocation };
            }
            else {
                geolocation.clearWatch(id);
            }
        }
        catch {
            failGeneration("unavailable");
        }
    }, [clearActiveWatch, geolocation]);
    const recenter = useCallback(() => {
        if (latestLocationRef.current !== null) {
            recenterRef.current();
        }
    }, []);
    const stop = useCallback(() => {
        clearActiveWatch();
        generationRef.current += 1;
        pendingFirstFocusRef.current = null;
        latestLocationRef.current = null;
        setLocation(null);
        setStatus("idle");
    }, [clearActiveWatch]);
    return {
        status,
        location,
        start,
        recenter,
        stop,
    };
}
