import { subscribeGoogleRuntimeFailures } from "./google-runtime-failures.js";
import { GoogleMapAdapter } from "./google-map-adapter.js";
import { normalizeGoogleMapStyle } from "./google-map-style.js";
const differentKey = "Google Maps is already configured for a different key";
const differentMapId = "Google Maps is already configured for a different map ID";
const differentEnvironment = "Google Maps is already configured for a different environment";
function diagnostic(error) {
    try {
        if (error instanceof Error) {
            const message = error.message;
            if (typeof message === "string") {
                const normalized = message.trim();
                if (normalized.length > 0)
                    return normalized;
            }
        }
    }
    catch {
        // Hostile thrown values must still normalize to a typed loader failure.
    }
    try {
        if (typeof error === "string") {
            const normalized = error.trim();
            if (normalized.length > 0)
                return normalized;
        }
    }
    catch {
        // Fall through to the stable diagnostic without coercing hostile values.
    }
    return "Google Maps failed to load";
}
function unavailable(reason) {
    return {
        status: "unavailable",
        reason: "loader-failed",
        retryable: true,
        diagnostic: reason,
    };
}
function record(value) {
    return typeof value === "object" && value !== null;
}
function member(value, name) {
    if (!record(value))
        return undefined;
    try {
        return Object.hasOwn(value, name) ? value[name] : undefined;
    }
    catch {
        return undefined;
    }
}
function runtimeFrom(maps, marker, core) {
    const Map = member(maps, "Map");
    const OverlayView = member(maps, "OverlayView");
    const Polyline = member(maps, "Polyline");
    const SymbolPath = member(core, "SymbolPath");
    const Circle = member(SymbolPath, "CIRCLE");
    const Point = member(core, "Point");
    const AdvancedMarkerElement = member(marker, "AdvancedMarkerElement");
    const collision = member(marker, "CollisionBehavior");
    const CollisionBehavior = {
        REQUIRED: member(collision, "REQUIRED"),
        REQUIRED_AND_HIDES_OPTIONAL: member(collision, "REQUIRED_AND_HIDES_OPTIONAL"),
        OPTIONAL_AND_HIDES_LOWER_PRIORITY: member(collision, "OPTIONAL_AND_HIDES_LOWER_PRIORITY"),
    };
    if (typeof Map !== "function" || typeof Point !== "function" ||
        typeof OverlayView !== "function" ||
        typeof Polyline !== "function" ||
        typeof AdvancedMarkerElement !== "function" ||
        !record(SymbolPath) ||
        Circle === undefined || Object.values(CollisionBehavior).some((value) => value === undefined)) {
        throw new Error("Google Maps runtime is invalid");
    }
    return {
        Point,
        Map,
        OverlayView,
        Polyline,
        SymbolPath: { CIRCLE: Circle },
        AdvancedMarkerElement,
        CollisionBehavior,
    };
}
function normalizeInput(input) {
    if (!record(input))
        return { valid: false };
    try {
        const rawApiKey = Object.hasOwn(input, "apiKey") ? input.apiKey : undefined;
        if (!Object.hasOwn(input, "development") || typeof input.development !== "boolean") {
            return { valid: false };
        }
        const apiKey = typeof rawApiKey === "string" ? rawApiKey.trim() : "";
        return {
            valid: true,
            apiKey,
            style: normalizeGoogleMapStyle(input),
            development: input.development,
        };
    }
    catch {
        return { valid: false };
    }
}
async function loadDefaultModule() {
    const loaded = await import("@googlemaps/js-api-loader");
    if (!record(loaded) ||
        typeof loaded.setOptions !== "function" ||
        typeof loaded.importLibrary !== "function") {
        throw new Error("Google Maps loader module is invalid");
    }
    return loaded;
}
const defaultBindings = {
    setOptions: async (options) => (await loadDefaultModule()).setOptions(options),
    importLibrary: async (name) => (await loadDefaultModule()).importLibrary(name),
};
export function createGoogleMapsLoader(bindings = defaultBindings) {
    let configuredKey;
    let optionsConfigured = false;
    let loadedRuntime;
    let inFlight;
    return {
        load(rawApiKey) {
            const apiKey = typeof rawApiKey === "string" ? rawApiKey.trim() : "";
            if (apiKey.length === 0)
                return Promise.reject(new Error("Google Maps API key is missing"));
            if (configuredKey !== undefined && configuredKey !== apiKey) {
                return Promise.reject(new Error(differentKey));
            }
            if (loadedRuntime !== undefined)
                return Promise.resolve(loadedRuntime);
            if (inFlight !== undefined)
                return inFlight;
            let configured;
            if (!optionsConfigured) {
                try {
                    configured = bindings.setOptions({ key: apiKey, v: "weekly" });
                    configuredKey ??= apiKey;
                }
                catch (error) {
                    return Promise.reject(new Error(diagnostic(error)));
                }
            }
            else {
                configured = undefined;
            }
            const attempt = Promise.resolve(configured).then(async () => {
                optionsConfigured = true;
                const [maps, marker, core] = await Promise.all([
                    bindings.importLibrary("maps"),
                    bindings.importLibrary("marker"),
                    bindings.importLibrary("core"),
                ]);
                return {
                    ...runtimeFrom(maps, marker, core),
                    subscribeFailures: bindings.subscribeFailures === undefined
                        ? subscribeGoogleRuntimeFailures
                        : (listener) => bindings.subscribeFailures(listener),
                };
            });
            inFlight = attempt;
            void attempt.then((runtime) => {
                loadedRuntime = runtime;
                if (inFlight === attempt)
                    inFlight = undefined;
            }, () => {
                if (inFlight === attempt)
                    inFlight = undefined;
            });
            return attempt;
        },
    };
}
const defaultDependencies = {
    createLoader: createGoogleMapsLoader,
    createAdapter: (runtime, options) => new GoogleMapAdapter(runtime, options),
};
export function createGoogleMapsConfigurator(dependencies) {
    let configured;
    let loader;
    let runtime;
    let inFlight;
    let ready;
    return (input) => {
        const normalized = normalizeInput(input);
        if (!normalized.valid)
            return Promise.resolve(unavailable("Google Maps configuration is invalid"));
        const { apiKey, style, development } = normalized;
        if (apiKey.length === 0)
            return Promise.resolve({ status: "missing-configuration" });
        if (style === undefined)
            return Promise.resolve(unavailable("Google Map ID and cloud style profile must be a valid pair"));
        const { mapId, cloudStyleProfileId } = style;
        if (configured !== undefined && configured.apiKey !== apiKey) {
            return Promise.resolve(unavailable(differentKey));
        }
        if (configured !== undefined && configured.mapId !== mapId) {
            return Promise.resolve(unavailable(differentMapId));
        }
        if (configured !== undefined && configured.cloudStyleProfileId !== cloudStyleProfileId) {
            return Promise.resolve(unavailable("Google Maps is already configured for a different cloud style profile"));
        }
        if (configured !== undefined && configured.development !== development) {
            return Promise.resolve(unavailable(differentEnvironment));
        }
        if (ready !== undefined)
            return Promise.resolve(ready);
        if (inFlight !== undefined)
            return inFlight;
        configured ??= {
            apiKey,
            ...style,
            development,
        };
        try {
            loader ??= dependencies.createLoader();
        }
        catch (error) {
            return Promise.resolve(unavailable(diagnostic(error)));
        }
        const attempt = Promise.resolve()
            .then(() => loader.load(apiKey))
            .then((loaded) => {
            runtime = loaded;
            const options = {
                development: configured.development,
                ...(configured.mapId === undefined ? {} : { mapId: configured.mapId }),
                ...(configured.cloudStyleProfileId === undefined ? {} : { cloudStyleProfileId: configured.cloudStyleProfileId }),
            };
            const state = {
                status: "ready",
                createMap: () => dependencies.createAdapter(runtime, options),
            };
            ready = state;
            return state;
        })
            .catch((error) => unavailable(diagnostic(error)));
        inFlight = attempt;
        void attempt.then(() => {
            if (inFlight === attempt)
                inFlight = undefined;
        });
        return attempt;
    };
}
const defaultConfigurator = createGoogleMapsConfigurator(defaultDependencies);
export function configureGoogleMaps(input, dependencies = {}) {
    if (dependencies.createLoader === undefined && dependencies.createAdapter === undefined) {
        return defaultConfigurator(input);
    }
    return createGoogleMapsConfigurator({
        createLoader: () => (dependencies.createLoader ?? defaultDependencies.createLoader)(),
        createAdapter: (runtime, options) => (dependencies.createAdapter ?? defaultDependencies.createAdapter)(runtime, options),
    })(input);
}
