import type { CandidateGroup } from "./model.js";
/**
 * Map override describing an expanded candidate comparison on the main map.
 * The session id ties map-originated preview requests back to the list
 * session that opened the comparison, so stale interactions cannot mutate a
 * later session.
 */
export interface CandidateMapOverride {
    group: CandidateGroup;
    sessionId: number;
    activeOptionId?: string;
}
/** A map-originated request to preview one candidate option in the list. */
export interface CandidatePreviewRequest {
    groupId: string;
    sessionId: number;
    optionId: string;
    requestId: number;
}
export interface CandidateSessionState {
    /** `null` while the comparison is closed. */
    sessionId: number | null;
    draftOptionId: string | undefined;
}
export type CandidateSessionEvent = {
    type: "open";
    sessionId: number;
    committedOptionId?: string;
} | {
    type: "preview";
    optionId: string;
} | {
    type: "close";
    committedOptionId?: string;
};
/**
 * The draft an opening or closing comparison starts from: the committed
 * option when it still exists, otherwise the group default, otherwise the
 * first option.
 */
export declare function initialCandidateDraftId(group: CandidateGroup, committedOptionId: string | undefined): string | undefined;
export declare function candidateSessionReducer(group: CandidateGroup, state: CandidateSessionState, event: CandidateSessionEvent): CandidateSessionState;
export declare function candidateMapOverrideFor(group: CandidateGroup, state: CandidateSessionState): CandidateMapOverride | null;
export declare function isValidCandidatePreviewRequest(group: CandidateGroup, sessionId: number | null, request: CandidatePreviewRequest | undefined): boolean;
