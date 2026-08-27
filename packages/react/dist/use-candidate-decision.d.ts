import { type RefCallback } from "react";
import { type CandidateGroup, type CandidateMapOverride, type CandidatePreviewRequest } from "@laugh-tale-island/core";
export interface UseCandidateDecisionOptions {
    group: CandidateGroup;
    /**
     * The group carried by emitted map overrides. Defaults to `group`; a
     * consumer that renders decorated option titles passes the decorated
     * group here so the map matches the list.
     */
    overrideGroup?: CandidateGroup;
    committedOptionId?: string;
    /** A map-originated request to preview one option in the list. */
    mapPreviewRequest?: CandidatePreviewRequest;
    onMapOverrideChange: (override: CandidateMapOverride | null) => void;
    /** Called with the confirmed option id before the comparison closes. */
    onConfirm: (optionId: string) => void;
}
export interface CandidateTriggerProps {
    ref: RefCallback<HTMLElement>;
    onClick: () => void;
    "aria-expanded": boolean;
}
export interface CandidateDecisionController {
    open: boolean;
    sessionId: number | null;
    draftOptionId: string | undefined;
    openComparison: () => void;
    /** Cancels: closes, resets the draft from committed, restores trigger focus. */
    closeComparison: () => void;
    /** Single-mode: confirms the draft via `onConfirm`, closes, restores trigger focus. */
    confirmDraft: () => void;
    /** Single-mode draft preview from the list. */
    previewOption: (optionId: string) => void;
    getTriggerProps: () => CandidateTriggerProps;
    /** Registers an option element for map-initiated preview focus. */
    registerOption: (optionId: string) => RefCallback<HTMLElement>;
}
/**
 * Optional candidate comparison ownership. All hooks remain mounted while a
 * selected node gains, changes, or loses a candidate group. Group changes
 * start closed from the new committed option and invalidate prior sessions,
 * preview requests, focus targets, and map overrides.
 */
export declare function useOptionalCandidateDecision(options: UseCandidateDecisionOptions | null): CandidateDecisionController | null;
/**
 * Candidate comparison ownership: committed choice stays with the caller's
 * progress store, draft preview and the comparison session live here, and
 * map overrides always carry the live session id so stale map interactions
 * cannot mutate a later session. Focus returns to the trigger when the
 * comparison closes.
 */
export declare function useCandidateDecision(options: UseCandidateDecisionOptions): CandidateDecisionController;
