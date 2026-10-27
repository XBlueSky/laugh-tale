import { loadMapLibreRuntime } from "./runtime.js";
import { loadShortbreadSource, MapLibreFailure, normalizeMapLibreOptions } from "./options.js";
import { createShortbreadStyle } from "./style.js";
import { projectMapLibreCamera } from "./camera.js";
import { mountAttribution } from "./attribution.js";
import { MapLibreRoutes } from "./routes.js";
export class MapLibreMapAdapter {
    options;
    #map = null;
    #sdk = null;
    #config = null;
    #started = false;
    #destroyed = false;
    #failed = false;
    #ready = false;
    #abort = new AbortController();
    #cleanup = [];
    #markers = new Map();
    #location = null;
    #credit = null;
    #layout = null;
    #legalHeight = 0;
    #lastIntent = null;
    #routes = null;
    #frame = null;
    #legalTimer;
    #watchdog;
    #viewportHealthy = false;
    #moving = false;
    #viewportErrored = false;
    #sourceZooms = { minzoom: 0, maxzoom: 14 };
    #successfulTiles = new Map();
    constructor(options = {}) {
        this.options = options;
    }
    async mount(element, config) {
        if (this.#started || this.#destroyed)
            throw new MapLibreFailure("cancelled");
        this.#started = true;
        this.#config = config;
        let timeout;
        let cancel = () => { };
        try {
            const normalized = normalizeMapLibreOptions(this.options);
            const cancelled = new Promise((_resolve, reject) => {
                cancel = () => reject(new MapLibreFailure("cancelled"));
                this.#abort.signal.addEventListener("abort", cancel, { once: true });
                timeout = setTimeout(() => reject(new MapLibreFailure("network", true)), 15000);
            });
            const initialize = async () => {
                const [sdk, source] = await Promise.all([loadMapLibreRuntime(), loadShortbreadSource(normalized, this.#abort.signal)]);
                if (this.#destroyed || this.#failed)
                    throw new MapLibreFailure("cancelled");
                this.#sdk = sdk;
                this.#sourceZooms = { minzoom: source.minzoom, maxzoom: source.maxzoom };
                // Vendor CSS must never change the recipe-owned host's layout or typography.
                const surface = document.createElement("div");
                Object.assign(surface.style, { position: "absolute", inset: "0" });
                element.append(surface);
                this.#cleanup.push(() => surface.remove());
                try {
                    this.#map = new sdk.Map({ container: surface, style: createShortbreadStyle(config.visualProfile, source),
                        center: [normalized.initialView.center.lng, normalized.initialView.center.lat], zoom: normalized.initialView.zoom,
                        bearing: 0, pitch: 0, maxPitch: 0, attributionControl: false, dragRotate: false, pitchWithRotate: false,
                        touchPitch: false, renderWorldCopies: true });
                }
                catch {
                    throw new MapLibreFailure("unsupported");
                }
                const map = this.#map;
                map.touchZoomRotate.disableRotation();
                this.#listen("error", event => {
                    const detail = event;
                    if (detail.error?.status === 401 || detail.error?.status === 403)
                        this.#fail({ status: "unavailable", reason: "request-denied", retryable: false });
                    else if (detail.sourceId === "shortbread")
                        this.#sourceError();
                    else if (!detail.sourceId)
                        this.#fail({ status: "unavailable", reason: "unsupported", retryable: false });
                });
                this.#listen("sourcedata", data => {
                    if (data.sourceId !== "shortbread")
                        return;
                    // SDK 6 emits source 'content' before tiles. Only a tile completion proves content,
                    // including valid empty tiles; keep weak references so we never retain SDK tile data.
                    const tile = data.tile;
                    if (tile && typeof tile === "object" && tile.state === "loaded" && data.coord) {
                        const { z, x, y } = data.coord.canonical;
                        this.#successfulTiles.set(`${z}/${x}/${y}`, new WeakRef(tile));
                    }
                    this.#refreshSourceHealth();
                    if (this.#viewportErrored)
                        this.#sourceError();
                });
                this.#listen("movestart", () => { this.#moving = true; this.#viewportHealthy = false; this.#viewportErrored = false; this.#cancelWatchdog(); });
                this.#listen("moveend", () => { this.#moving = false; this.#refreshSourceHealth(); if (this.#viewportErrored)
                    this.#sourceError(); });
                this.#listen("move", () => this.#scheduleRoutes());
                this.#listen("click", event => {
                    if (!this.#ready || !this.#routes?.layerIds.length)
                        return;
                    const hit = map.queryRenderedFeatures(event.point, { layers: this.#routes.layerIds })[0];
                    const id = hit?.properties?.edgeId;
                    if (typeof id === "string")
                        config.events.onRouteSelect(id);
                });
                this.#listen("webglcontextlost", () => this.#fail({ status: "unavailable", reason: "unsupported", retryable: false }));
                await new Promise(resolve => this.#listen("style.load", () => resolve()));
                if (this.#destroyed || this.#failed)
                    throw new MapLibreFailure("cancelled");
                this.#routes = new MapLibreRoutes(map, config.visualProfile, () => this.#fail({ status: "unavailable", reason: "unsupported", retryable: false }));
                this.#credit = mountAttribution(surface, normalized.attribution, height => {
                    if (height === this.#legalHeight || this.#destroyed)
                        return;
                    this.#legalHeight = height;
                    this.#validateLegalAfterLayout();
                    if (this.#lastIntent)
                        this.applyCameraIntent({ ...this.#lastIntent, transition: "immediate" });
                });
                this.#ready = true;
            };
            await Promise.race([initialize(), cancelled]);
        }
        catch (error) {
            const failure = error instanceof MapLibreFailure ? error : new MapLibreFailure("network", true);
            if (!this.#destroyed)
                this.#fail(failure.failure);
            throw failure;
        }
        finally {
            clearTimeout(timeout);
            this.#abort.signal.removeEventListener("abort", cancel);
        }
    }
    #listen(type, listener) {
        const map = this.#map;
        map.on(type, listener);
        this.#cleanup.push(() => { map.off(type, listener); });
    }
    #fail(failure) {
        if (this.#destroyed || this.#failed)
            return;
        this.#failed = true;
        try {
            this.#config?.events.onUnavailable(failure);
        }
        finally {
            this.destroy();
        }
    }
    #cancelWatchdog() { clearTimeout(this.#watchdog); this.#watchdog = undefined; }
    #validateLegalAfterLayout() {
        clearTimeout(this.#legalTimer);
        // A short quiet period accommodates sheet transitions and successive font/layout measurements.
        this.#legalTimer = setTimeout(() => {
            this.#legalTimer = undefined;
            if (!this.#destroyed && this.#layout && this.#legalHeight + 16 > this.#layout.usableRegion.height) {
                this.#fail({ status: "unavailable", reason: "unsupported", retryable: false });
            }
        }, 250);
    }
    #sourceError() {
        this.#viewportErrored = true;
        this.#refreshSourceHealth();
        if (this.#viewportHealthy || this.#moving || this.#watchdog !== undefined)
            return;
        this.#watchdog = setTimeout(() => {
            this.#watchdog = undefined;
            this.#refreshSourceHealth();
            if (!this.#viewportHealthy && !this.#moving && !this.#destroyed)
                this.#fail({ status: "unavailable", reason: "network", retryable: true });
        }, 15000);
    }
    #refreshSourceHealth() {
        if (!this.#map || this.#destroyed)
            return;
        for (const [key, reference] of this.#successfulTiles) {
            const tile = reference.deref();
            if (!tile || tile.state === "unloaded" || tile.state === "errored")
                this.#successfulTiles.delete(key);
        }
        this.#viewportHealthy = this.#map.coveringTiles({ tileSize: 512, ...this.#sourceZooms }).some(({ canonical: { z, x, y } }) => {
            const state = this.#successfulTiles.get(`${z}/${x}/${y}`)?.deref()?.state;
            return state === "loaded" || state === "reloading" || state === "expired";
        });
        // Visible fallback/parent geometry also proves a partly working map while new tiles load.
        if (!this.#viewportHealthy)
            this.#viewportHealthy = this.#map.queryRenderedFeatures().some(feature => feature.source === "shortbread");
        if (this.#viewportHealthy)
            this.#cancelWatchdog();
    }
    #scheduleRoutes() {
        if (this.#frame !== null || !this.#ready)
            return;
        this.#frame = requestAnimationFrame(() => {
            this.#frame = null;
            try {
                this.#routes?.refresh();
            }
            catch {
                this.#fail({ status: "unavailable", reason: "unsupported", retryable: false });
            }
        });
    }
    setLayout(layout) {
        if (!this.#ready || this.#destroyed)
            return;
        this.#layout = layout;
        this.#map?.resize();
        this.#credit?.setLayout(layout);
        this.#validateLegalAfterLayout();
    }
    render(presentation) {
        if (!this.#ready || this.#destroyed || !this.#map || !this.#sdk || !this.#config)
            return;
        const ids = new Set(presentation.markers.map(marker => marker.ownerId));
        for (const [id, entry] of this.#markers)
            if (!ids.has(id)) {
                entry.release();
                this.#markers.delete(id);
            }
        for (const descriptor of presentation.markers) {
            if (!Number.isFinite(descriptor.coordinates.lat) || !Number.isFinite(descriptor.coordinates.lng))
                continue;
            const priority = descriptor.states.includes("selected") ? 4 : descriptor.markerMode === "numbered" ? descriptor.states.includes("candidate") ? 3 : 2 : 1;
            const existing = this.#markers.get(descriptor.ownerId);
            if (existing) {
                existing.handle.update(descriptor);
                existing.wrapper.style.zIndex = String(priority);
                existing.marker.setLngLat([descriptor.coordinates.lng, descriptor.coordinates.lat]);
                continue;
            }
            const handle = this.#config.createMarkerContent(descriptor);
            const wrapper = document.createElement("div");
            wrapper.append(handle.element);
            wrapper.style.zIndex = String(priority);
            const select = (event) => { event.stopPropagation(); if (!this.#destroyed)
                this.#config?.events.onMarkerSelect(descriptor.ownerId); };
            wrapper.addEventListener("click", select);
            const marker = new this.#sdk.Marker({ element: wrapper, anchor: "bottom" }).setLngLat([descriptor.coordinates.lng, descriptor.coordinates.lat]).addTo(this.#map);
            this.#markers.set(descriptor.ownerId, { marker, wrapper, handle, release: () => { wrapper.removeEventListener("click", select); marker.remove(); handle.dispose(); } });
        }
        try {
            this.#routes?.render(presentation.routes);
        }
        catch {
            this.#fail({ status: "unavailable", reason: "unsupported", retryable: false });
        }
    }
    applyCameraIntent(intent) {
        if (!this.#ready || this.#destroyed || !this.#map)
            return;
        this.#lastIntent = intent;
        const camera = projectMapLibreCamera(intent, this.#legalHeight);
        if (!camera)
            return;
        const options = { ...camera, bearing: 0, pitch: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 } };
        if (intent.transition === "immediate")
            this.#map.jumpTo(options);
        else
            this.#map.easeTo({ ...options, duration: 300, essential: false });
    }
    getCameraSnapshot() { return this.#ready && !this.#destroyed && this.#map ? { zoom: this.#map.getZoom() } : null; }
    setUserLocation(location) {
        if (!this.#ready || this.#destroyed || !this.#map || !this.#sdk || !this.#config)
            return;
        if (location === null) {
            this.#location?.marker.remove();
            this.#location?.handle.dispose();
            this.#location = null;
            return;
        }
        if (this.#location) {
            this.#location.marker.setLngLat([location.lng, location.lat]);
            this.#location.handle.update({ coordinates: location });
            return;
        }
        const handle = this.#config.createUserLocationContent({ coordinates: location });
        const wrapper = document.createElement("div");
        wrapper.append(handle.element);
        const marker = new this.#sdk.Marker({ element: wrapper, anchor: "center" }).setLngLat([location.lng, location.lat]).addTo(this.#map);
        this.#location = { marker, handle };
    }
    destroy() {
        if (this.#destroyed)
            return;
        this.#destroyed = true;
        this.#ready = false;
        this.#abort.abort();
        this.#cancelWatchdog();
        if (this.#frame !== null)
            cancelAnimationFrame(this.#frame);
        clearTimeout(this.#legalTimer);
        const cleanup = [...this.#cleanup, ...[...this.#markers.values()].map(entry => () => entry.release()),
            () => this.#location?.marker.remove(), () => this.#location?.handle.dispose(), () => this.#credit?.destroy(), () => this.#map?.remove()];
        for (const release of cleanup) {
            try {
                release();
            }
            catch { /* Continue releasing independently owned resources. */ }
        }
        this.#cleanup = [];
        this.#markers.clear();
        this.#successfulTiles.clear();
        this.#location = null;
        this.#credit = null;
        this.#map = null;
        this.#sdk = null;
        this.#routes = null;
    }
}
