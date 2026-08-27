function defaultStorage() {
    try {
        return typeof window === "undefined" ? undefined : window.localStorage;
    }
    catch {
        return undefined;
    }
}
function defaultEvents() {
    return typeof window === "undefined" ? undefined : window;
}
export function createLocalStorageProgressStore(key, options = {}) {
    const storage = "storage" in options ? options.storage : defaultStorage();
    const events = "events" in options ? options.events : defaultEvents();
    return {
        read() {
            if (storage === undefined) {
                return { status: "unavailable" };
            }
            try {
                return { status: "ready", value: storage.getItem(key) };
            }
            catch {
                return { status: "unavailable" };
            }
        },
        write(value) {
            try {
                if (storage === undefined)
                    return false;
                storage.setItem(key, value);
                return true;
            }
            catch {
                return false;
            }
        },
        subscribe(listener) {
            if (events === undefined)
                return () => { };
            const handler = (event) => {
                if (event.key === key)
                    listener(event.newValue);
            };
            events.addEventListener("storage", handler);
            return () => {
                events.removeEventListener("storage", handler);
            };
        },
    };
}
