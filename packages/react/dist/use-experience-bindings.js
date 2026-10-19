import { useCallback, useEffect, useMemo, useRef, useState, } from "react";
import { resolveFitCameraIntent, resolveFocusCameraIntent, resolveRecenterUserCameraIntent, resolveSheetGeometry, } from "@laugh-tale-island/core";
import { useMapAdapterLifecycle, } from "./use-map-adapter-lifecycle.js";
import { useOwnerFocusRegistry, } from "./use-owner-focus-registry.js";
import { useItinerarySheet, } from "./use-itinerary-sheet.js";
import { useVisibleMapLayout, } from "./use-visible-map-layout.js";
import { sanitizeProviderFailure } from "./use-runtime-providers.js";
function sameCameraIntent(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}
export function useExperienceBindings(input) {
    const layout = useVisibleMapLayout();
    const focus = useOwnerFocusRegistry(input.ownershipKey, layout.reducedMotion);
    const [measured, setMeasured] = useState(null);
    const setMeasuredGeometry = useCallback((next) => setMeasured({ ...next }), []);
    const geometry = useMemo(() => (measured === null ? null : resolveSheetGeometry(measured)), [measured]);
    const sheet = useItinerarySheet({
        snap: input.sheetSnap,
        geometry,
        onSnapChange: (snap) => input.onSnapChange(snap),
        reducedMotion: layout.reducedMotion,
    });
    const [cameraIntent, setCameraIntent] = useState(null);
    const [mapUnavailable, setMapUnavailable] = useState(null);
    const previousFactory = useRef(input.createAdapter);
    useEffect(() => {
        if (previousFactory.current === input.createAdapter)
            return;
        previousFactory.current = input.createAdapter;
        setMapUnavailable(null);
    }, [input.createAdapter]);
    const onUnavailable = useCallback((failure) => {
        setMapUnavailable(sanitizeProviderFailure(failure));
    }, []);
    const lifecycle = useMapAdapterLifecycle({
        ...(input.createAdapter === undefined
            ? {}
            : { createAdapter: input.createAdapter }),
        mountConfig: {
            visualProfile: input.visualProfile,
            createMarkerContent: input.createMarkerContent,
            createUserLocationContent: input.createUserLocationContent,
            events: {
                onMarkerSelect: (ownerId) => input.onMarkerSelect(ownerId),
                onRouteSelect: (routeId) => input.onRouteSelect(routeId),
                onUnavailable,
            },
        },
        presentation: input.presentation,
        cameraIntent,
        layout: layout.layout,
        userLocation: input.userLocation,
        development: input.development,
        ...(input.onFailure === undefined
            ? {}
            : {
                onFailure: (failure, cause) => input.onFailure?.(failure, cause),
            }),
    });
    const geometryKey = JSON.stringify([
        input.presentation,
        input.userLocation,
    ]);
    useEffect(() => {
        const request = input.cameraRequest;
        if (request === null ||
            request.dayId !== input.dayId ||
            layout.layout === null) {
            setCameraIntent((current) => (current === null ? current : null));
            return;
        }
        const context = {
            intentId: request.intentId,
            layout: layout.layout,
            reducedMotion: layout.reducedMotion,
        };
        const buildDayFitGeometry = (dayId) => dayId !== input.dayId
            ? null
            : {
                points: input.presentation.markers.map((marker) => marker.coordinates),
                paths: input.presentation.routes
                    .filter((route) => route.mode !== "flight")
                    .map((route) => route.geometry),
            };
        let next;
        switch (request.kind) {
            case "fit-day": {
                const dayGeometry = buildDayFitGeometry(request.dayId);
                next =
                    dayGeometry === null
                        ? null
                        : resolveFitCameraIntent(context, dayGeometry);
                break;
            }
            case "fit-candidate": {
                const group = input.candidateGroups.find((candidate) => candidate.id === request.groupId);
                if (group === undefined) {
                    next = null;
                    break;
                }
                const ownerIds = new Set(group.options.map((option) => option.id));
                next = resolveFitCameraIntent(context, {
                    points: input.presentation.markers
                        .filter((marker) => ownerIds.has(marker.ownerId))
                        .map((marker) => marker.coordinates),
                    paths: [],
                });
                break;
            }
            case "focus-owner": {
                const marker = input.presentation.markers.find((entry) => entry.ownerId === request.ownerId);
                next =
                    marker === undefined
                        ? null
                        : resolveFocusCameraIntent(context, marker.coordinates, lifecycle.getCameraSnapshot());
                break;
            }
            case "focus-route": {
                const route = input.presentation.routes.find((entry) => entry.edgeId === request.routeId &&
                    (entry.mode !== "flight" || entry.selected));
                next =
                    route === undefined
                        ? null
                        : resolveFitCameraIntent(context, {
                            points: [],
                            paths: [route.geometry],
                        });
                break;
            }
            case "recenter-user":
                next =
                    input.userLocation === null
                        ? null
                        : resolveRecenterUserCameraIntent(context, input.userLocation);
                break;
            default: {
                const exhaustive = request;
                next = exhaustive;
            }
        }
        setCameraIntent((current) => sameCameraIntent(current, next) ? current : next);
    }, [
        input.cameraRequest,
        input.dayId,
        input.candidateGroups,
        layout.layout,
        layout.reducedMotion,
        lifecycle.status.kind,
        // The lifecycle callback is explicitly context-free and stable.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        lifecycle.getCameraSnapshot,
        geometryKey,
    ]);
    const mapViewportRef = useCallback((element) => {
        layout.mapViewportRef(element);
        lifecycle.mapRef(element);
        focus.fallbackSurfaceRef(element);
    }, [layout.mapViewportRef, lifecycle.mapRef, focus.fallbackSurfaceRef]);
    const getSurfaceProps = useCallback(() => sheet.getSheetProps(), [sheet.getSheetProps]);
    const getHandleProps = useCallback(() => (geometry === null ? {} : sheet.getHandleProps()), [geometry, sheet.getHandleProps]);
    const restoreTrigger = useCallback((ownerId, fallback) => focus.restoreTrigger(ownerId, fallback), 
    // eslint-disable-next-line @typescript-eslint/unbound-method
    [focus.restoreTrigger]);
    const occlusionRef = useCallback((ownerId) => layout.occlusionRef(ownerId), 
    // eslint-disable-next-line @typescript-eslint/unbound-method
    [layout.occlusionRef]);
    const nodeRef = useCallback((ownerId) => focus.nodeRef(ownerId), 
    // eslint-disable-next-line @typescript-eslint/unbound-method
    [focus.nodeRef]);
    const routeRef = useCallback((ownerId) => focus.routeRef(ownerId), 
    // eslint-disable-next-line @typescript-eslint/unbound-method
    [focus.routeRef]);
    const dialogRef = useCallback((ownerId) => focus.dialogRef(ownerId), 
    // eslint-disable-next-line @typescript-eslint/unbound-method
    [focus.dialogRef]);
    const disclosureTriggerRef = useCallback((ownerId) => focus.disclosureTriggerRef(ownerId), 
    // eslint-disable-next-line @typescript-eslint/unbound-method
    [focus.disclosureTriggerRef]);
    const bindings = useMemo(() => ({
        layout: {
            mapViewportRef,
            occlusionRef,
        },
        sheet: {
            getSurfaceProps,
            getHandleProps,
            setMeasuredGeometry,
        },
        owners: {
            nodeRef,
            routeRef,
        },
        focus: {
            dialogRef,
            disclosureTriggerRef,
            restoreTrigger,
        },
    }), [
        mapViewportRef,
        occlusionRef,
        getSurfaceProps,
        getHandleProps,
        setMeasuredGeometry,
        nodeRef,
        routeRef,
        dialogRef,
        disclosureTriggerRef,
        restoreTrigger,
    ]);
    const clearMapUnavailable = useCallback(() => setMapUnavailable(null), []);
    return {
        bindings,
        geometry,
        cameraIntent,
        mapUnavailable,
        clearMapUnavailable,
        layout,
        lifecycle,
        sheet,
        focus,
    };
}
