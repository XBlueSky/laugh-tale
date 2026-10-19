import { cloneTestValue } from "./FakeRouteAdapterV2.js";
function snapshotConfig(config) {
    const routeStyle = config.visualProfile.routeStyle.bind(config.visualProfile);
    return {
        events: { ...config.events },
        visualProfile: {
            id: config.visualProfile.id,
            basemap: cloneTestValue(config.visualProfile.basemap),
            routeStyle: (route) => routeStyle(route),
        },
        createMarkerContent: config.createMarkerContent,
        createUserLocationContent: config.createUserLocationContent,
    };
}
function failureDiagnostic(error) {
    try {
        if (error instanceof Error && typeof error.message === "string" && error.message.trim())
            return error.message.trim();
    }
    catch {
        // A hostile thrown value falls through to a stable diagnostic.
    }
    return "Synthetic presentation factory failed";
}
function cleanupFailure(error) {
    try {
        if (error instanceof Error)
            return error;
    }
    catch {
        // A hostile thrown value is normalized below.
    }
    return new Error("Synthetic map cleanup failed", { cause: error });
}
export class FakeMapAdapterV2 {
    testOnly = true;
    mountCalls = [];
    renderCalls = [];
    cameraIntentCalls = [];
    userLocationCalls = [];
    markerFactoryCalls = [];
    markerElements = [];
    markerPositionCalls = [];
    userLocationFactoryCalls = [];
    userLocationElements = [];
    userLocationPositionCalls = [];
    destroyCount = 0;
    cameraSnapshotReadCount = 0;
    markerDisposalCount = 0;
    userLocationDisposalCount = 0;
    cameraSnapshot;
    config = null;
    mounted = false;
    pendingPresentation = null;
    userLocation = null;
    markers = new Map();
    userRecord = null;
    lifecycleGeneration = 0;
    renderOperation = 0;
    userLocationOperation = 0;
    constructor(options = {}) {
        this.cameraSnapshot = options.cameraSnapshot === undefined
            ? null
            : options.cameraSnapshot === null
                ? null
                : cloneTestValue(options.cameraSnapshot);
    }
    mount(element, config) {
        const generation = ++this.lifecycleGeneration;
        const cleanupError = this.releaseMount();
        if (this.lifecycleGeneration !== generation) {
            return cleanupError === undefined ? Promise.resolve() : Promise.reject(cleanupFailure(cleanupError));
        }
        const snapshot = snapshotConfig(config);
        this.mountCalls.push({ element, config: snapshot });
        this.config = snapshot;
        this.mounted = true;
        if (this.pendingPresentation !== null) {
            const operation = ++this.renderOperation;
            this.renderCurrent(this.pendingPresentation, generation, operation);
        }
        if (this.userLocation !== null) {
            const operation = ++this.userLocationOperation;
            this.createUserLocation(this.userLocation, generation, operation);
        }
        return cleanupError === undefined ? Promise.resolve() : Promise.reject(cleanupFailure(cleanupError));
    }
    render(presentation) {
        const snapshot = cloneTestValue(presentation);
        this.renderCalls.push(cloneTestValue(snapshot));
        this.pendingPresentation = snapshot;
        const operation = ++this.renderOperation;
        if (this.mounted)
            this.renderCurrent(snapshot, this.lifecycleGeneration, operation);
    }
    applyCameraIntent(intent) {
        this.cameraIntentCalls.push(cloneTestValue(intent));
    }
    getCameraSnapshot() {
        this.cameraSnapshotReadCount += 1;
        return this.cameraSnapshot === null ? null : cloneTestValue(this.cameraSnapshot);
    }
    setCameraSnapshot(snapshot) {
        this.cameraSnapshot = snapshot === null ? null : cloneTestValue(snapshot);
    }
    setUserLocation(location) {
        const snapshot = location === null ? null : cloneTestValue(location);
        this.userLocationCalls.push(snapshot === null ? null : cloneTestValue(snapshot));
        this.userLocation = snapshot;
        const operation = ++this.userLocationOperation;
        if (snapshot === null) {
            this.releaseUserLocation();
            return;
        }
        if (!this.mounted || this.config === null)
            return;
        if (this.userRecord === null) {
            this.createUserLocation(snapshot, this.lifecycleGeneration, operation);
            return;
        }
        const descriptor = { coordinates: cloneTestValue(snapshot) };
        const record = this.userRecord;
        record.handle.update(cloneTestValue(descriptor));
        if (!this.ownsUserLocation(this.lifecycleGeneration, operation, record))
            return;
        this.userLocationPositionCalls.push(cloneTestValue(snapshot));
    }
    destroy() {
        this.destroyCount += 1;
        this.lifecycleGeneration += 1;
        this.renderOperation += 1;
        this.userLocationOperation += 1;
        this.pendingPresentation = null;
        this.userLocation = null;
        const cleanupError = this.releaseMount();
        if (cleanupError !== undefined)
            throw cleanupFailure(cleanupError);
    }
    emitMarkerSelect(ownerId) {
        if (this.mounted)
            this.config?.events.onMarkerSelect(`${ownerId}`);
    }
    emitRouteSelect(routeId) {
        if (this.mounted)
            this.config?.events.onRouteSelect(`${routeId}`);
    }
    emitUnavailable(result) {
        if (this.mounted)
            this.config?.events.onUnavailable(cloneTestValue(result));
    }
    reportFailure(error) {
        this.emitUnavailable({ status: "unavailable", reason: "network", retryable: true, diagnostic: failureDiagnostic(error) });
    }
    ownsRender(config, generation, operation) {
        return this.mounted && this.config === config && this.lifecycleGeneration === generation && this.renderOperation === operation;
    }
    ownsUserLocation(generation, operation, record) {
        return this.mounted
            && this.lifecycleGeneration === generation
            && this.userLocationOperation === operation
            && (record === undefined || this.userRecord === record);
    }
    renderCurrent(presentation, generation, operation) {
        const config = this.config;
        if (config === null)
            return;
        const active = new Set();
        for (const descriptor of presentation.markers) {
            if (!this.ownsRender(config, generation, operation))
                return;
            if (active.has(descriptor.ownerId))
                continue;
            active.add(descriptor.ownerId);
            const snapshot = cloneTestValue(descriptor);
            const current = this.markers.get(snapshot.ownerId);
            if (current !== undefined) {
                current.handle.update(cloneTestValue(snapshot));
                if (!this.ownsRender(config, generation, operation) || this.markers.get(snapshot.ownerId) !== current)
                    return;
                this.markerPositionCalls.push(cloneTestValue(snapshot.coordinates));
                continue;
            }
            this.markerFactoryCalls.push(cloneTestValue(snapshot));
            let handle;
            try {
                handle = config.createMarkerContent(cloneTestValue(snapshot));
            }
            catch (error) {
                if (this.ownsRender(config, generation, operation))
                    this.reportFailure(error);
                continue;
            }
            this.markerElements.push(handle.element);
            if (!this.ownsRender(config, generation, operation) || this.markers.has(snapshot.ownerId)) {
                this.releaseMarker({ handle, disposed: false });
                return;
            }
            this.markerPositionCalls.push(cloneTestValue(snapshot.coordinates));
            this.markers.set(snapshot.ownerId, { handle, disposed: false });
        }
        if (!this.ownsRender(config, generation, operation))
            return;
        const removed = [];
        for (const [ownerId, record] of this.markers) {
            if (active.has(ownerId))
                continue;
            this.markers.delete(ownerId);
            removed.push(record);
        }
        let firstError;
        let failed = false;
        for (const record of removed) {
            try {
                this.releaseMarker(record);
            }
            catch (error) {
                if (!failed)
                    firstError = error;
                failed = true;
            }
        }
        if (failed)
            throw cleanupFailure(firstError);
    }
    createUserLocation(location, generation, operation) {
        const config = this.config;
        if (config === null || this.userRecord !== null)
            return;
        const descriptor = { coordinates: cloneTestValue(location) };
        this.userLocationFactoryCalls.push(cloneTestValue(descriptor));
        let handle;
        try {
            handle = config.createUserLocationContent(cloneTestValue(descriptor));
        }
        catch (error) {
            if (this.ownsUserLocation(generation, operation))
                this.reportFailure(error);
            return;
        }
        this.userLocationElements.push(handle.element);
        if (!this.ownsUserLocation(generation, operation) || this.userRecord !== null) {
            this.releaseUserLocationRecord({ handle, disposed: false });
            return;
        }
        this.userLocationPositionCalls.push(cloneTestValue(location));
        this.userRecord = { handle, disposed: false };
    }
    releaseMarker(record) {
        if (record.disposed)
            return;
        record.disposed = true;
        this.markerDisposalCount += 1;
        record.handle.dispose();
    }
    releaseUserLocationRecord(record) {
        if (record.disposed)
            return;
        record.disposed = true;
        this.userLocationDisposalCount += 1;
        record.handle.dispose();
    }
    releaseUserLocation() {
        const record = this.userRecord;
        this.userRecord = null;
        if (record !== null)
            this.releaseUserLocationRecord(record);
    }
    releaseMount() {
        this.mounted = false;
        this.config = null;
        const records = [...this.markers.values()];
        this.markers.clear();
        const userRecord = this.userRecord;
        this.userRecord = null;
        let firstError;
        let failed = false;
        for (const record of records) {
            try {
                this.releaseMarker(record);
            }
            catch (error) {
                if (!failed)
                    firstError = error;
                failed = true;
            }
        }
        if (userRecord !== null) {
            try {
                this.releaseUserLocationRecord(userRecord);
            }
            catch (error) {
                if (!failed)
                    firstError = error;
                failed = true;
            }
        }
        return failed ? firstError : undefined;
    }
}
