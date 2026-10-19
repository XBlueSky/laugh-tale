const HOME_NAVIGATION = {
    surface: "home",
    dayId: null,
    ownerId: null,
};
function normalizeNavigation(next) {
    if (next.surface !== "experience" ||
        next.dayId === null ||
        next.dayId.trim().length === 0) {
        return { ...HOME_NAVIGATION };
    }
    return {
        surface: "experience",
        dayId: next.dayId,
        ownerId: next.ownerId === null || next.ownerId.trim().length === 0
            ? null
            : next.ownerId,
    };
}
export function createMemoryTripNavigationStore(initial) {
    let state = normalizeNavigation(initial ?? HOME_NAVIGATION);
    const listeners = new Set();
    return {
        read: () => ({ ...state }),
        write(next) {
            const normalized = normalizeNavigation(next);
            if (normalized.surface === state.surface &&
                normalized.dayId === state.dayId &&
                normalized.ownerId === state.ownerId) {
                return;
            }
            state = normalized;
            let failed = false;
            let firstError;
            for (const listener of [...listeners]) {
                try {
                    listener();
                }
                catch (error) {
                    if (!failed) {
                        failed = true;
                        firstError = error;
                    }
                }
            }
            if (failed)
                throw firstError;
        },
        subscribe(listener) {
            listeners.add(listener);
            let active = true;
            return () => {
                if (!active)
                    return;
                active = false;
                listeners.delete(listener);
            };
        },
    };
}
