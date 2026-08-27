/**
 * The draft an opening or closing comparison starts from: the committed
 * option when it still exists, otherwise the group default, otherwise the
 * first option.
 */
export function initialCandidateDraftId(group, committedOptionId) {
    if (group.options.some(({ id }) => id === committedOptionId)) {
        return committedOptionId;
    }
    if (group.options.some(({ id }) => id === group.defaultOptionId)) {
        return group.defaultOptionId;
    }
    return group.options[0]?.id;
}
export function candidateSessionReducer(group, state, event) {
    switch (event.type) {
        case "open":
            return {
                sessionId: event.sessionId,
                draftOptionId: initialCandidateDraftId(group, event.committedOptionId),
            };
        case "preview": {
            if (state.sessionId === null ||
                group.mode !== "single" ||
                !group.options.some(({ id }) => id === event.optionId)) {
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
export function candidateMapOverrideFor(group, state) {
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
export function isValidCandidatePreviewRequest(group, sessionId, request) {
    return (request !== undefined &&
        sessionId !== null &&
        request.groupId === group.id &&
        request.sessionId === sessionId &&
        group.options.some(({ id }) => id === request.optionId));
}
