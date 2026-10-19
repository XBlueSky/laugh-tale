import { useMemo, useSyncExternalStore } from "react";
import { controllerStateOperation } from "./normalize-controller-error.js";
/** The controller owns its one fallback store; this hook only subscribes. */
export function useTripNavigation(store) {
    const subscription = useMemo(() => {
        let cached;
        return {
            subscribe: (listener) => {
                const unsubscribe = controllerStateOperation(() => store.subscribe(listener));
                return () => controllerStateOperation(() => unsubscribe());
            },
            getSnapshot: () => {
                const next = controllerStateOperation(() => store.read());
                if (!cached || cached.surface !== next.surface || cached.dayId !== next.dayId || cached.ownerId !== next.ownerId) {
                    cached = next;
                }
                return cached;
            },
        };
    }, [store]);
    const state = useSyncExternalStore(subscription.subscribe, subscription.getSnapshot, subscription.getSnapshot);
    return { state, store };
}
