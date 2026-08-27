const PROGRESS_KEYS = [
    "version",
    "selectedCandidateIds",
    "shoppingStatuses",
    "skippedNodeIds",
    "completedIds",
];
const SHOPPING_STATUSES = new Set([
    "pending",
    "purchased",
    "unavailable",
    "skipped",
]);
export function nodeCompletionKey(nodeId) {
    return `node:${nodeId}`;
}
export function checklistCompletionKey(checklistId) {
    return `checklist:${checklistId}`;
}
export function taskCompletionKey(taskId) {
    return `task:${taskId}`;
}
export function emptyTripProgress() {
    return {
        version: 1,
        selectedCandidateIds: {},
        shoppingStatuses: {},
        skippedNodeIds: [],
        completedIds: [],
    };
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonBlankString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function hasExactProgressKeys(value) {
    const actual = Object.keys(value).sort();
    const expected = [...PROGRESS_KEYS].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function isStringRecord(value) {
    return (isRecord(value) &&
        Object.entries(value).every(([key, entry]) => isNonBlankString(key) && isNonBlankString(entry)));
}
function isShoppingStatus(value) {
    return typeof value === "string" && SHOPPING_STATUSES.has(value);
}
function isShoppingStatusRecord(value) {
    return (isRecord(value) &&
        Object.entries(value).every(([key, status]) => isNonBlankString(key) && isShoppingStatus(status)));
}
function isStringArray(value) {
    return Array.isArray(value) && value.every(isNonBlankString);
}
export function parseTripProgress(raw) {
    if (raw === null) {
        return emptyTripProgress();
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return emptyTripProgress();
    }
    if (!isRecord(parsed) ||
        !hasExactProgressKeys(parsed) ||
        parsed.version !== 1 ||
        !isStringRecord(parsed.selectedCandidateIds) ||
        !isShoppingStatusRecord(parsed.shoppingStatuses) ||
        !isStringArray(parsed.skippedNodeIds) ||
        !isStringArray(parsed.completedIds)) {
        return emptyTripProgress();
    }
    return {
        version: 1,
        selectedCandidateIds: { ...parsed.selectedCandidateIds },
        shoppingStatuses: { ...parsed.shoppingStatuses },
        skippedNodeIds: [...parsed.skippedNodeIds],
        completedIds: [...parsed.completedIds],
    };
}
function setMembership(values, id, included) {
    const currentlyIncluded = values.includes(id);
    if (currentlyIncluded === included) {
        return values;
    }
    return included ? [...values, id] : values.filter((value) => value !== id);
}
function removeRecordKeys(record, ids) {
    const removedIds = new Set(ids);
    if (!Object.keys(record).some((id) => removedIds.has(id))) {
        return record;
    }
    return Object.fromEntries(Object.entries(record).filter(([id]) => !removedIds.has(id)));
}
function removeMembers(values, ids) {
    const removedIds = new Set(ids);
    if (!values.some((id) => removedIds.has(id))) {
        return values;
    }
    return values.filter((id) => !removedIds.has(id));
}
export function tripProgressReducer(state, action) {
    switch (action.type) {
        case "select-candidate": {
            if (state.selectedCandidateIds[action.groupId] === action.candidateId) {
                return state;
            }
            return {
                ...state,
                selectedCandidateIds: {
                    ...state.selectedCandidateIds,
                    [action.groupId]: action.candidateId,
                },
            };
        }
        case "set-shopping-status": {
            if (state.shoppingStatuses[action.itemId] === action.status) {
                return state;
            }
            return {
                ...state,
                shoppingStatuses: { ...state.shoppingStatuses, [action.itemId]: action.status },
            };
        }
        case "set-node-skipped": {
            const skippedNodeIds = setMembership(state.skippedNodeIds, action.nodeId, action.skipped);
            return skippedNodeIds === state.skippedNodeIds ? state : { ...state, skippedNodeIds };
        }
        case "set-completed": {
            const completedIds = setMembership(state.completedIds, action.id, action.completed);
            return completedIds === state.completedIds ? state : { ...state, completedIds };
        }
        case "reset-day": {
            const selectedCandidateIds = removeRecordKeys(state.selectedCandidateIds, action.scope.candidateGroupIds);
            const shoppingStatuses = removeRecordKeys(state.shoppingStatuses, action.scope.shoppingItemIds);
            const skippedNodeIds = removeMembers(state.skippedNodeIds, action.scope.skippedNodeIds);
            const completedIds = removeMembers(state.completedIds, action.scope.completionIds);
            if (selectedCandidateIds === state.selectedCandidateIds &&
                shoppingStatuses === state.shoppingStatuses &&
                skippedNodeIds === state.skippedNodeIds &&
                completedIds === state.completedIds) {
                return state;
            }
            return {
                ...state,
                selectedCandidateIds,
                shoppingStatuses,
                skippedNodeIds,
                completedIds,
            };
        }
    }
}
export function collectDayProgressScope(trip, dayId) {
    const day = trip.days.find((candidate) => candidate.id === dayId);
    if (day === undefined) {
        return {
            candidateGroupIds: [],
            shoppingItemIds: [],
            skippedNodeIds: [],
            completionIds: [],
        };
    }
    const nodeIds = new Set(day.nodes.map((node) => node.id));
    const completionIds = [];
    const shoppingItemIds = [];
    const skippedNodeIds = [];
    for (const node of day.nodes) {
        completionIds.push(nodeCompletionKey(node.id));
        if (node.optionality === "optional") {
            skippedNodeIds.push(node.id);
        }
        if (node.kind === "shopping") {
            shoppingItemIds.push(...node.payload.items.map((item) => item.id));
        }
        if (node.kind === "lodging" || node.kind === "logistics") {
            completionIds.push(...(node.payload.checklist ?? []).map((item) => checklistCompletionKey(item.id)));
        }
    }
    for (const task of trip.tasks) {
        if (task.scope === "day" && task.dayId === dayId) {
            completionIds.push(taskCompletionKey(task.id), ...(task.children ?? []).map((child) => checklistCompletionKey(child.id)));
        }
    }
    return {
        candidateGroupIds: trip.candidateGroups
            .filter((group) => nodeIds.has(group.parentNodeId))
            .map((group) => group.id),
        shoppingItemIds,
        skippedNodeIds,
        completionIds,
    };
}
