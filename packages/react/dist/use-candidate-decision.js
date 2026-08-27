import { useCallback, useEffect, useRef, useState, } from "react";
import { candidateMapOverrideFor, candidateSessionReducer, initialCandidateDraftId, isValidCandidatePreviewRequest, } from "@laugh-tale-island/core";
let candidateSessionSequence = 0;
function nextCandidateSessionId() {
    candidateSessionSequence += 1;
    return candidateSessionSequence;
}
/**
 * Candidate comparison ownership: committed choice stays with the caller's
 * progress store, draft preview and the comparison session live here, and
 * map overrides always carry the live session id so stale map interactions
 * cannot mutate a later session. Focus returns to the trigger when the
 * comparison closes.
 */
export function useCandidateDecision(options) {
    const { group, overrideGroup = group, committedOptionId, mapPreviewRequest, onMapOverrideChange, onConfirm, } = options;
    const triggerRef = useRef(null);
    const optionRefs = useRef(new Map());
    const lastFocusedPreviewKeyRef = useRef(null);
    const [state, setState] = useState(() => ({
        sessionId: null,
        draftOptionId: initialCandidateDraftId(group, committedOptionId),
    }));
    const [handledPreviewKey, setHandledPreviewKey] = useState(null);
    const open = state.sessionId !== null;
    const hasValidPreviewRequest = isValidCandidatePreviewRequest(group, state.sessionId, mapPreviewRequest);
    const requestedPreviewKey = hasValidPreviewRequest && mapPreviewRequest !== undefined
        ? `${state.sessionId}:${mapPreviewRequest.requestId}`
        : null;
    if (requestedPreviewKey !== null && requestedPreviewKey !== handledPreviewKey) {
        setHandledPreviewKey(requestedPreviewKey);
        if (mapPreviewRequest !== undefined &&
            group.mode === "single" &&
            mapPreviewRequest.optionId !== state.draftOptionId) {
            setState((current) => candidateSessionReducer(group, current, {
                type: "preview",
                optionId: mapPreviewRequest.optionId,
            }));
        }
    }
    useEffect(() => {
        onMapOverrideChange(candidateMapOverrideFor(overrideGroup, state));
    }, [onMapOverrideChange, overrideGroup, state]);
    useEffect(() => () => {
        onMapOverrideChange(null);
    }, [onMapOverrideChange]);
    const requestedOptionId = mapPreviewRequest?.optionId;
    useEffect(() => {
        if (requestedPreviewKey === null ||
            requestedPreviewKey !== handledPreviewKey ||
            requestedPreviewKey === lastFocusedPreviewKeyRef.current ||
            requestedOptionId === undefined) {
            return;
        }
        lastFocusedPreviewKeyRef.current = requestedPreviewKey;
        const optionControl = optionRefs.current.get(requestedOptionId);
        optionControl?.scrollIntoView?.({ block: "nearest" });
        optionControl?.focus();
    }, [handledPreviewKey, requestedOptionId, requestedPreviewKey]);
    const restoreTriggerFocus = useCallback(() => {
        queueMicrotask(() => triggerRef.current?.focus());
    }, []);
    const openComparison = useCallback(() => {
        setState((current) => candidateSessionReducer(group, current, {
            type: "open",
            sessionId: nextCandidateSessionId(),
            ...(committedOptionId === undefined ? {} : { committedOptionId }),
        }));
    }, [committedOptionId, group]);
    const closeComparison = useCallback(() => {
        setState((current) => candidateSessionReducer(group, current, {
            type: "close",
            ...(committedOptionId === undefined ? {} : { committedOptionId }),
        }));
        restoreTriggerFocus();
    }, [committedOptionId, group, restoreTriggerFocus]);
    const draftOptionId = state.draftOptionId;
    const confirmDraft = useCallback(() => {
        if (group.mode !== "single" || draftOptionId === undefined) {
            return;
        }
        const option = group.options.find(({ id }) => id === draftOptionId);
        if (option === undefined) {
            return;
        }
        onConfirm(option.id);
        setState((current) => candidateSessionReducer(group, current, {
            type: "close",
            committedOptionId: option.id,
        }));
        restoreTriggerFocus();
    }, [draftOptionId, group, onConfirm, restoreTriggerFocus]);
    const previewOption = useCallback((optionId) => {
        setState((current) => candidateSessionReducer(group, current, { type: "preview", optionId }));
    }, [group]);
    const setTrigger = useCallback((element) => {
        triggerRef.current = element;
    }, []);
    const getTriggerProps = useCallback(() => ({
        ref: setTrigger,
        onClick: open ? closeComparison : openComparison,
        "aria-expanded": open,
    }), [closeComparison, open, openComparison, setTrigger]);
    const registerOption = useCallback((optionId) => (element) => {
        if (element === null) {
            optionRefs.current.delete(optionId);
        }
        else {
            optionRefs.current.set(optionId, element);
        }
    }, []);
    return {
        open,
        sessionId: state.sessionId,
        draftOptionId: state.draftOptionId,
        openComparison,
        closeComparison,
        confirmDraft,
        previewOption,
        getTriggerProps,
        registerOption,
    };
}
