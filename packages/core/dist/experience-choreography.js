function requestCamera(state, kind, dayId, targetId, create) {
    const cameraRevision = state.cameraRevision + 1;
    const intentId = JSON.stringify([
        "camera",
        cameraRevision,
        kind,
        dayId,
        targetId,
    ]);
    return {
        ...state,
        cameraRevision,
        cameraRequest: create(intentId),
    };
}
function validOwner(ownerId) {
    return ownerId !== null && ownerId.trim().length > 0 ? ownerId : null;
}
export function createExperienceChoreographyState(input) {
    const validDay = input.navigation.surface === "experience" &&
        input.navigation.dayId !== null &&
        input.navigation.dayId.trim().length > 0;
    const navigation = validDay
        ? {
            surface: "experience",
            dayId: input.navigation.dayId,
            ownerId: validOwner(input.automaticOwnerId),
        }
        : { surface: "home", dayId: null, ownerId: null };
    const state = {
        navigation,
        selectionSource: "automatic",
        sheetSnap: "half",
        headerExpanded: true,
        headerRevision: 0,
        headerTransition: null,
        cameraRequest: null,
        cameraRevision: 0,
        focusReturnOwnerId: null,
    };
    const dayId = navigation.dayId;
    if (dayId === null)
        return state;
    return requestCamera(state, "fit-day", dayId, dayId, (intentId) => ({
        kind: "fit-day",
        dayId,
        intentId,
    }));
}
export function reduceExperienceChoreography(state, event) {
    switch (event.type) {
        case "select-day": {
            if (event.dayId.trim().length === 0)
                return state;
            const selected = {
                ...state,
                navigation: {
                    surface: "experience",
                    dayId: event.dayId,
                    ownerId: validOwner(event.automaticOwnerId),
                },
                selectionSource: "automatic",
                sheetSnap: "half",
                focusReturnOwnerId: null,
            };
            return requestCamera(selected, "fit-day", event.dayId, event.dayId, (intentId) => ({
                kind: "fit-day",
                dayId: event.dayId,
                intentId,
            }));
        }
        case "automatic-owner-changed": {
            if (state.selectionSource !== "automatic" ||
                state.navigation.dayId !== event.dayId) {
                return state;
            }
            const ownerId = validOwner(event.ownerId);
            if (state.navigation.ownerId === ownerId)
                return state;
            return {
                ...state,
                navigation: {
                    surface: "experience",
                    dayId: event.dayId,
                    ownerId,
                },
            };
        }
        case "select-node": {
            if (state.navigation.dayId !== event.dayId ||
                event.nodeId.trim().length === 0) {
                return state;
            }
            const selected = {
                ...state,
                navigation: {
                    surface: "experience",
                    dayId: event.dayId,
                    ownerId: event.nodeId,
                },
                selectionSource: event.source,
                focusReturnOwnerId: event.source === "map" ? event.nodeId : null,
            };
            return requestCamera(selected, "focus-owner", event.dayId, event.nodeId, (intentId) => ({
                kind: "focus-owner",
                dayId: event.dayId,
                ownerId: event.nodeId,
                intentId,
            }));
        }
        case "select-route": {
            if (state.navigation.dayId !== event.dayId ||
                event.routeId.trim().length === 0) {
                return state;
            }
            const selected = {
                ...state,
                navigation: {
                    surface: "experience",
                    dayId: event.dayId,
                    ownerId: event.routeId,
                },
                selectionSource: event.source,
                focusReturnOwnerId: event.source === "map" ? event.routeId : null,
            };
            if (event.source === "map")
                return selected;
            return requestCamera(selected, "focus-route", event.dayId, event.routeId, (intentId) => ({
                kind: "focus-route",
                dayId: event.dayId,
                routeId: event.routeId,
                intentId,
            }));
        }
        case "restore-automatic": {
            if (state.navigation.dayId !== event.dayId ||
                event.ownerId.trim().length === 0) {
                return state;
            }
            const selected = {
                ...state,
                navigation: {
                    surface: "experience",
                    dayId: event.dayId,
                    ownerId: event.ownerId,
                },
                selectionSource: "automatic",
                sheetSnap: "half",
                focusReturnOwnerId: null,
            };
            return requestCamera(selected, "focus-owner", event.dayId, event.ownerId, (intentId) => ({
                kind: "focus-owner",
                dayId: event.dayId,
                ownerId: event.ownerId,
                intentId,
            }));
        }
        case "return-to-current":
        case "return-to-lodging": {
            if (state.navigation.dayId !== event.dayId ||
                event.ownerId.trim().length === 0) {
                return state;
            }
            const selected = {
                ...state,
                navigation: {
                    surface: "experience",
                    dayId: event.dayId,
                    ownerId: event.ownerId,
                },
                selectionSource: event.type === "return-to-current" ? "automatic" : "control",
                sheetSnap: "half",
                focusReturnOwnerId: null,
            };
            return requestCamera(selected, "focus-owner", event.dayId, event.ownerId, (intentId) => ({
                kind: "focus-owner",
                dayId: event.dayId,
                ownerId: event.ownerId,
                intentId,
            }));
        }
        case "restore-full-day":
            if (state.navigation.dayId !== event.dayId)
                return state;
            return requestCamera(state, "fit-day", event.dayId, event.dayId, (intentId) => ({
                kind: "fit-day",
                dayId: event.dayId,
                intentId,
            }));
        case "fit-candidate":
            if (state.navigation.dayId !== event.dayId ||
                event.groupId.trim().length === 0) {
                return state;
            }
            return requestCamera(state, "fit-candidate", event.dayId, event.groupId, (intentId) => ({
                kind: "fit-candidate",
                dayId: event.dayId,
                groupId: event.groupId,
                intentId,
            }));
        case "recenter-user":
            if (state.navigation.dayId !== event.dayId)
                return state;
            return requestCamera(state, "recenter-user", event.dayId, "user", (intentId) => ({
                kind: "recenter-user",
                dayId: event.dayId,
                intentId,
            }));
        case "set-sheet-snap":
            return state.sheetSnap === event.snap
                ? state
                : { ...state, sheetSnap: event.snap };
        case "set-header-expanded": {
            if (event.expanded === state.headerExpanded)
                return state;
            const headerRevision = state.headerRevision + 1;
            return {
                ...state,
                headerExpanded: event.expanded,
                headerRevision,
                headerTransition: {
                    id: headerRevision,
                    phase: event.expanded ? "expanding" : "collapsing",
                },
            };
        }
        case "settle-header-transition":
            return state.headerTransition?.id === event.transitionId
                ? { ...state, headerTransition: null }
                : state;
        case "focus-returned":
            return state.focusReturnOwnerId === event.ownerId
                ? { ...state, focusReturnOwnerId: null }
                : state;
        case "open-home":
            return {
                ...state,
                navigation: { surface: "home", dayId: null, ownerId: null },
                cameraRequest: null,
                focusReturnOwnerId: null,
            };
        default:
            return state;
    }
}
