import { useCallback, useInsertionEffect, useLayoutEffect, useMemo, useRef, } from "react";
function createElementRegistry() {
    return {
        node: new Map(),
        route: new Map(),
        dialog: new Map(),
        "disclosure-trigger": new Map(),
    };
}
export function useOwnerFocusRegistry(ownershipKey, reducedMotion) {
    const elementsByOwnershipRef = useRef(new Map());
    const callbacksRef = useRef(new Map());
    const fallbackElementRef = useRef(null);
    const pendingRef = useRef(null);
    const activeRef = useRef(true);
    const committedPolicyRef = useRef({
        ownershipKey,
        reducedMotion,
    });
    const elementsFor = useCallback((key) => {
        const existing = elementsByOwnershipRef.current.get(key);
        if (existing !== undefined)
            return existing;
        const created = createElementRegistry();
        elementsByOwnershipRef.current.set(key, created);
        return created;
    }, []);
    const focusElement = useCallback((target, registered, expectedOwnershipKey, mode = "focus") => {
        const policy = committedPolicyRef.current;
        if (!activeRef.current
            || expectedOwnershipKey !== policy.ownershipKey
            || registered?.ownershipKey !== expectedOwnershipKey
            || !registered.element.isConnected) {
            return false;
        }
        if (target.slot === "node" || target.slot === "route" || mode === "reveal-and-focus") {
            registered.element.scrollIntoView?.({
                block: "nearest",
                behavior: policy.reducedMotion ? "auto" : "smooth",
            });
        }
        if (mode !== "reveal")
            registered.element.focus({ preventScroll: true });
        pendingRef.current = null;
        return true;
    }, []);
    useInsertionEffect(() => {
        const ownershipChanged = committedPolicyRef.current.ownershipKey !== ownershipKey;
        committedPolicyRef.current = { ownershipKey, reducedMotion };
        if (ownershipChanged) {
            for (const key of elementsByOwnershipRef.current.keys()) {
                if (key !== ownershipKey)
                    elementsByOwnershipRef.current.delete(key);
            }
            if (pendingRef.current?.ownershipKey !== ownershipKey) {
                pendingRef.current = null;
            }
        }
    }, [ownershipKey, reducedMotion]);
    useLayoutEffect(() => {
        activeRef.current = true;
        return () => {
            activeRef.current = false;
            pendingRef.current = null;
            elementsByOwnershipRef.current.clear();
            fallbackElementRef.current = null;
        };
    }, []);
    useLayoutEffect(() => {
        const pending = pendingRef.current;
        if (pending?.ownershipKey !== ownershipKey)
            return;
        focusElement(pending.target, elementsByOwnershipRef.current
            .get(ownershipKey)?.[pending.target.slot]
            .get(pending.target.ownerId), ownershipKey, pending.mode);
    }, [focusElement, ownershipKey, reducedMotion]);
    const refFor = useCallback((slot, ownerId) => {
        const callbackOwnershipKey = ownershipKey;
        const callbackKey = JSON.stringify([callbackOwnershipKey, slot, ownerId]);
        const cached = callbacksRef.current.get(callbackKey);
        if (cached !== undefined)
            return cached;
        let callbackElement = null;
        const callback = (element) => {
            if (element === null) {
                const elements = elementsByOwnershipRef.current.get(callbackOwnershipKey)?.[slot];
                const registered = elements?.get(ownerId);
                if (callbackElement !== null
                    && registered?.ownershipKey === callbackOwnershipKey
                    && registered.element === callbackElement) {
                    elements?.delete(ownerId);
                }
                callbackElement = null;
                return;
            }
            callbackElement = element;
            const elements = elementsFor(callbackOwnershipKey)[slot];
            const registered = { ownershipKey: callbackOwnershipKey, element };
            elements.set(ownerId, registered);
            const pending = pendingRef.current;
            if (pending?.ownershipKey === callbackOwnershipKey
                && pending.target.slot === slot
                && pending.target.ownerId === ownerId) {
                focusElement(pending.target, registered, callbackOwnershipKey, pending.mode);
            }
        };
        callbacksRef.current.set(callbackKey, callback);
        return callback;
    }, [elementsFor, focusElement, ownershipKey]);
    const nodeRef = useCallback((ownerId) => refFor("node", ownerId), [refFor]);
    const routeRef = useCallback((ownerId) => refFor("route", ownerId), [refFor]);
    const dialogRef = useCallback((ownerId) => refFor("dialog", ownerId), [refFor]);
    const disclosureTriggerRef = useCallback((ownerId) => refFor("disclosure-trigger", ownerId), [refFor]);
    const fallbackSurfaceRef = useCallback((element) => {
        fallbackElementRef.current = element;
    }, []);
    const request = useCallback((target, mode, nextOwnershipKey) => {
        if (!activeRef.current)
            return;
        const currentOwnershipKey = committedPolicyRef.current.ownershipKey;
        const requestedOwnershipKey = nextOwnershipKey ?? currentOwnershipKey;
        const registered = elementsByOwnershipRef.current
            .get(currentOwnershipKey)?.[target.slot]
            .get(target.ownerId);
        if (requestedOwnershipKey === currentOwnershipKey
            && focusElement(target, registered, requestedOwnershipKey, mode)) {
            return;
        }
        pendingRef.current = {
            target: { ...target },
            ownershipKey: requestedOwnershipKey,
            mode,
        };
    }, [focusElement]);
    const focus = useCallback((target, nextOwnershipKey) => {
        request(target, "focus", nextOwnershipKey);
    }, [request]);
    const reveal = useCallback((target, nextOwnershipKey) => {
        request(target, "reveal", nextOwnershipKey);
    }, [request]);
    const revealAndFocus = useCallback((target) => {
        request(target, "reveal-and-focus");
    }, [request]);
    const restoreTrigger = useCallback((ownerId, fallbackOwner) => {
        pendingRef.current = null;
        const currentOwnershipKey = committedPolicyRef.current.ownershipKey;
        const currentElements = elementsByOwnershipRef.current.get(currentOwnershipKey);
        const triggerTarget = {
            slot: "disclosure-trigger",
            ownerId,
        };
        if (focusElement(triggerTarget, currentElements?.["disclosure-trigger"].get(ownerId), currentOwnershipKey)) {
            return;
        }
        if (fallbackOwner !== undefined
            && focusElement(fallbackOwner, currentElements?.[fallbackOwner.slot].get(fallbackOwner.ownerId), currentOwnershipKey)) {
            return;
        }
        const fallback = fallbackElementRef.current;
        if (fallback?.isConnected)
            fallback.focus({ preventScroll: true });
    }, [focusElement]);
    const cancelPendingFocus = useCallback(() => {
        pendingRef.current = null;
    }, []);
    return useMemo(() => ({
        nodeRef,
        routeRef,
        dialogRef,
        disclosureTriggerRef,
        fallbackSurfaceRef,
        focus,
        reveal,
        revealAndFocus,
        restoreTrigger,
        cancelPendingFocus,
    }), [
        nodeRef,
        routeRef,
        dialogRef,
        disclosureTriggerRef,
        fallbackSurfaceRef,
        focus,
        reveal,
        revealAndFocus,
        restoreTrigger,
        cancelPendingFocus,
    ]);
}
