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

export type CandidateSessionEvent =
  | { type: "open"; sessionId: number; committedOptionId?: string }
  | { type: "preview"; optionId: string }
  | { type: "close"; committedOptionId?: string };

/**
 * The draft an opening or closing comparison starts from: the committed
 * option when it still exists, otherwise the group default, otherwise the
 * first option.
 */
export function initialCandidateDraftId(
  group: CandidateGroup,
  committedOptionId: string | undefined,
): string | undefined {
  if (group.options.some(({ id }) => id === committedOptionId)) {
    return committedOptionId;
  }
  if (group.options.some(({ id }) => id === group.defaultOptionId)) {
    return group.defaultOptionId;
  }
  return group.options[0]?.id;
}

export function candidateSessionReducer(
  group: CandidateGroup,
  state: CandidateSessionState,
  event: CandidateSessionEvent,
): CandidateSessionState {
  switch (event.type) {
    case "open":
      return {
        sessionId: event.sessionId,
        draftOptionId: initialCandidateDraftId(group, event.committedOptionId),
      };
    case "preview": {
      if (
        state.sessionId === null ||
        group.mode !== "single" ||
        !group.options.some(({ id }) => id === event.optionId)
      ) {
        return state;
      }
      return state.draftOptionId === event.optionId
        ? state
        : { ...state, draftOptionId: event.optionId };
    }
    case "close":
      return {
        sessionId: null,
        draftOptionId: initialCandidateDraftId(group, event.committedOptionId),
      };
  }
}

export function candidateMapOverrideFor(
  group: CandidateGroup,
  state: CandidateSessionState,
): CandidateMapOverride | null {
  if (state.sessionId === null) {
    return null;
  }
  return {
    group,
    sessionId: state.sessionId,
    ...(group.mode === "single" && state.draftOptionId !== undefined
      ? { activeOptionId: state.draftOptionId }
      : {}),
  };
}

export function isValidCandidatePreviewRequest(
  group: CandidateGroup,
  sessionId: number | null,
  request: CandidatePreviewRequest | undefined,
): boolean {
  return (
    request !== undefined &&
    sessionId !== null &&
    request.groupId === group.id &&
    request.sessionId === sessionId &&
    group.options.some(({ id }) => id === request.optionId)
  );
}
