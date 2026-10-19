import { normalizeGoogleMapStyle } from "./google-map-style.js";
import { projectImmediateCamera } from "./google-camera.js";
function validCoordinate(value) {
    if (typeof value !== "object" || value === null)
        return false;
    try {
        if (!Object.hasOwn(value, "lat") || !Object.hasOwn(value, "lng"))
            return false;
        const { lat, lng } = value;
        return typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
            typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180;
    }
    catch {
        return false;
    }
}
function cloneCoordinate(value) {
    return { lat: value.lat, lng: value.lng };
}
function markerPriority(descriptor) {
    if (descriptor.states.includes("selected"))
        return 4;
    if (descriptor.markerMode === "numbered")
        return descriptor.states.includes("candidate") ? 3 : 2;
    return 1;
}
function snapshotPresentation(presentation) {
    return {
        markers: presentation.markers.map((descriptor) => ({
            ...descriptor,
            coordinates: cloneCoordinate(descriptor.coordinates),
            states: [...descriptor.states],
        })),
        routes: presentation.routes.map((route) => ({
            ...route,
            geometry: route.geometry.map(cloneCoordinate),
        })),
    };
}
function boundsFor(coordinates) {
    if (coordinates.length === 0)
        return undefined;
    let north = -90;
    let south = 90;
    let east = -180;
    let west = 180;
    for (const coordinate of coordinates) {
        north = Math.max(north, coordinate.lat);
        south = Math.min(south, coordinate.lat);
        east = Math.max(east, coordinate.lng);
        west = Math.min(west, coordinate.lng);
    }
    return { north, south, east, west };
}
function nonblank(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function providerCleanupError(value) {
    try {
        if (value instanceof Error)
            return value;
    }
    catch {
        // Hostile thrown values are normalized below.
    }
    return new Error("Google Maps provider cleanup failed");
}
function validPaint(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const paint = value;
    return nonblank(paint.color) && typeof paint.opacity === "number" &&
        Number.isFinite(paint.opacity) && paint.opacity >= 0 && paint.opacity <= 1;
}
function validStroke(value) {
    if (!validPaint(value))
        return false;
    const width = value.width;
    return typeof width === "number" && Number.isFinite(width) && width > 0;
}
function routeOptions(runtime, map, route, style) {
    const path = [];
    for (const point of route.geometry) {
        if (!validCoordinate(point))
            return undefined;
        path.push(cloneCoordinate(point));
    }
    if (path.length < 2)
        return undefined;
    if (style.kind === "solid") {
        if (!validStroke(style.stroke) || (style.casing !== undefined && !validStroke(style.casing))) {
            return undefined;
        }
        const line = (stroke, clickable) => ({
            map,
            path,
            clickable,
            strokeColor: stroke.color,
            strokeOpacity: stroke.opacity,
            strokeWeight: stroke.width,
            icons: [],
        });
        return [
            ...(style.casing === undefined ? [] : [line(style.casing, false)]),
            line(style.stroke, true),
        ];
    }
    if (style.kind !== "symbol")
        return undefined;
    const symbol = style.symbol;
    if (typeof symbol.repeatPx !== "number" ||
        !Number.isFinite(symbol.repeatPx) ||
        symbol.repeatPx <= 0 ||
        typeof symbol.scale !== "number" ||
        !Number.isFinite(symbol.scale) ||
        symbol.scale <= 0) {
        return undefined;
    }
    if (symbol.shape === "circle") {
        if (!validPaint(symbol.fill) || (symbol.stroke !== undefined && !validStroke(symbol.stroke))) {
            return undefined;
        }
    }
    else if (symbol.shape !== "dash" ||
        !validStroke(symbol.stroke) ||
        (symbol.fill !== undefined && !validPaint(symbol.fill))) {
        return undefined;
    }
    const fill = symbol.fill;
    const stroke = symbol.stroke;
    const icon = {
        path: symbol.shape === "circle" ? runtime.SymbolPath.CIRCLE : "M 0,-1 0,1",
        scale: symbol.scale,
        ...(fill === undefined ? { fillOpacity: 0 } : { fillColor: fill.color, fillOpacity: fill.opacity }),
        ...(stroke === undefined
            ? { strokeOpacity: 0 }
            : {
                strokeColor: stroke.color,
                strokeOpacity: stroke.opacity,
                strokeWeight: stroke.width,
            }),
    };
    return [{
            map,
            path,
            clickable: true,
            strokeOpacity: 0,
            icons: [{ icon, offset: "0", repeat: `${symbol.repeatPx}px` }],
        }];
}
function basemapOptions(config) {
    const { basemap } = config.visualProfile;
    const densityVisibility = {
        low: "off",
        medium: "simplified",
        high: "on",
    }[basemap.density];
    const contrastGamma = { soft: 0.85, standard: 1, high: 1.15 }[basemap.contrast];
    const modeStyle = {
        neutral: { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "simplified" }] },
        topographic: { featureType: "landscape", elementType: "geometry", stylers: [{ visibility: "on" }] },
        flat: { featureType: "landscape", elementType: "geometry", stylers: [{ visibility: "simplified" }] },
        technical: { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "on" }] },
        coastal: { featureType: "water", elementType: "labels", stylers: [{ visibility: "on" }] },
        subdued: { featureType: "administrative", elementType: "labels", stylers: [{ visibility: "off" }] },
    };
    const palette = basemap.palette;
    return {
        center: { lat: 0, lng: 0 },
        zoom: 2,
        mapTypeId: basemap.mode === "topographic" ? "terrain" : "roadmap",
        styles: [
            { featureType: "all", elementType: "geometry", stylers: [{ color: palette.geometry }] },
            { featureType: "all", elementType: "labels.text.fill", stylers: [{ color: palette.label }] },
            { featureType: "all", elementType: "labels.text.stroke", stylers: [{ color: palette.labelStroke }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: palette.water }] },
            { featureType: "poi.park", elementType: "geometry", stylers: [{ color: palette.park }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: palette.road }] },
            { featureType: "poi", elementType: "labels", stylers: [{ visibility: basemap.poi === "minimal" ? "off" : "on" }] },
            { featureType: "transit.station", elementType: "labels", stylers: [{ visibility: basemap.stationLabels === "hidden" ? "off" : "on" }] },
            { featureType: "all", elementType: "labels.icon", stylers: [{ visibility: densityVisibility }] },
            { featureType: "all", elementType: "geometry", stylers: [{ gamma: contrastGamma }] },
            modeStyle[basemap.mode],
        ],
    };
}
export class GoogleMapAdapter {
    runtime;
    mapId;
    cloudStyleProfileId;
    map = null;
    config = null;
    pendingPresentation = null;
    userLocation = null;
    userRecord = null;
    markers = new Map();
    routes = new Map();
    mapListeners = [];
    cameraIdleListener = null;
    cameraOperation = 0;
    cameraIntent = null;
    renderOperation = 0;
    userOperation = 0;
    generation = 0;
    terminal = false;
    constructor(runtime, options) {
        this.runtime = runtime;
        const style = normalizeGoogleMapStyle(options);
        if (style === undefined)
            throw new TypeError("Google Map ID and cloud style profile must be a valid pair");
        this.mapId = style.mapId;
        this.cloudStyleProfileId = style.cloudStyleProfileId;
    }
    async mount(element, config) {
        const generation = ++this.generation;
        this.releaseMap();
        if (generation !== this.generation)
            return;
        if (this.mapId !== undefined && this.cloudStyleProfileId !== config.visualProfile.id) {
            throw new TypeError("Google cloud style profile must match the mounted visual profile");
        }
        this.config = config;
        this.terminal = false;
        await Promise.resolve();
        if (generation !== this.generation)
            return;
        const options = this.mapId === undefined
            ? { ...basemapOptions(config), renderingType: "RASTER" }
            : { center: { lat: 0, lng: 0 }, zoom: 2, mapId: this.mapId };
        const unsubscribe = this.runtime.subscribeFailures?.((failure) => {
            if (generation !== this.generation || this.terminal)
                return;
            this.terminal = true;
            this.cameraOperation += 1;
            this.cameraIntent = null;
            this.cancelCameraClamp();
            config.events.onUnavailable({ ...failure });
        });
        if (generation !== this.generation) {
            unsubscribe?.();
            return;
        }
        if (unsubscribe !== undefined)
            this.mapListeners.push({ remove: unsubscribe });
        if (this.terminal)
            return;
        let map;
        try {
            map = new this.runtime.Map(element, { ...options, disableDefaultUI: true });
        }
        catch (error) {
            if (generation === this.generation)
                this.releaseMap();
            throw error;
        }
        if (generation !== this.generation) {
            map.unbindAll();
            return;
        }
        this.map = map;
        if (this.terminal)
            return;
        if (this.userLocation !== null) {
            this.mountUserLocation(this.userLocation, generation, this.userOperation);
        }
        if (this.pendingPresentation !== null) {
            this.renderNow(this.pendingPresentation, generation, this.renderOperation);
        }
    }
    render(presentation) {
        const operation = ++this.renderOperation;
        const snapshot = snapshotPresentation(presentation);
        if (operation !== this.renderOperation)
            return;
        this.pendingPresentation = snapshot;
        if (this.map !== null && !this.terminal) {
            this.renderNow(this.pendingPresentation, this.generation, operation);
        }
    }
    applyCameraIntent(intent) {
        const operation = ++this.cameraOperation;
        this.cancelCameraClamp();
        if (operation !== this.cameraOperation)
            return;
        this.cameraIntent = intent;
        const generation = this.generation;
        const map = this.map;
        if (map === null || this.terminal)
            return;
        const isCurrent = () => operation === this.cameraOperation &&
            intent === this.cameraIntent &&
            generation === this.generation &&
            map === this.map &&
            !this.terminal;
        if (intent.transition === "immediate") {
            const snapshot = {
                ...intent,
                viewport: { ...intent.viewport },
                usableRegion: { ...intent.usableRegion },
                edgeInsets: { ...intent.edgeInsets },
                ...(intent.kind === "fit"
                    ? { points: intent.points.map((point) => ({ ...point })), paths: intent.paths.map((path) => path.map((point) => ({ ...point }))) }
                    : { coordinate: { ...intent.coordinate } }),
            };
            const apply = () => {
                if (!isCurrent())
                    return true;
                const projection = map.getProjection();
                if (!isCurrent())
                    return true;
                if (projection === undefined)
                    return false;
                const camera = projectImmediateCamera(this.runtime, projection, snapshot);
                if (camera !== undefined && isCurrent())
                    map.moveCamera(camera);
                return true;
            };
            if (apply() || !isCurrent())
                return;
            const holder = { consumed: false, running: false };
            const consume = () => {
                holder.consumed = true;
                if (this.cameraIdleListener !== holder.listener)
                    return;
                this.cameraIdleListener = null;
                try {
                    holder.listener?.remove();
                }
                catch {
                    // Ownership is consumed before provider cleanup can throw or reenter.
                }
            };
            const listener = map.addListener("projection_changed", () => {
                if (holder.consumed || holder.running || !isCurrent())
                    return;
                holder.running = true;
                try {
                    if (!apply())
                        return;
                }
                catch (error) {
                    const report = isCurrent();
                    if (report) {
                        this.terminal = true;
                        this.cameraOperation += 1;
                        this.cameraIntent = null;
                    }
                    consume();
                    if (!report || generation !== this.generation || map !== this.map)
                        return;
                    let diagnostic = "Google Maps deferred camera operation failed";
                    try {
                        const message = error instanceof Error ? error.message : error;
                        if (typeof message === "string" && message.trim())
                            diagnostic = message.trim();
                    }
                    catch {
                        // Hostile provider diagnostics cannot escape the failure boundary.
                    }
                    if (generation === this.generation && map === this.map) {
                        this.config?.events.onUnavailable({ status: "unavailable", reason: "network", retryable: true, diagnostic });
                    }
                    return;
                }
                finally {
                    holder.running = false;
                }
                consume();
            });
            holder.listener = listener;
            if (holder.consumed || !isCurrent()) {
                try {
                    listener.remove();
                }
                catch {
                    // Registration may return after readiness already consumed the work.
                }
            }
            else
                this.cameraIdleListener = listener;
            return;
        }
        if (intent.kind === "fit") {
            const coordinates = [];
            for (const point of intent.points) {
                if (!validCoordinate(point))
                    return;
                coordinates.push(cloneCoordinate(point));
            }
            for (const path of intent.paths) {
                for (const point of path) {
                    if (!validCoordinate(point))
                        return;
                    coordinates.push(cloneCoordinate(point));
                }
            }
            const bounds = boundsFor(coordinates);
            if (bounds === undefined || !Number.isFinite(intent.maximumZoom))
                return;
            const insets = { ...intent.edgeInsets };
            map.fitBounds(bounds, insets);
            if (!isCurrent())
                return;
            const holder = {
                fired: false,
                consumed: false,
            };
            const listener = map.addListener("idle", () => {
                holder.fired = true;
                if (holder.consumed || !isCurrent())
                    return;
                holder.consumed = true;
                if (this.cameraIdleListener === holder.listener)
                    this.cameraIdleListener = null;
                const completionOperation = ++this.cameraOperation;
                this.cameraIntent = null;
                const isCompletionCurrent = () => completionOperation === this.cameraOperation &&
                    generation === this.generation &&
                    map === this.map &&
                    !this.terminal;
                try {
                    holder.listener?.remove();
                }
                catch {
                    // A consumed provider listener must not strand the camera operation.
                }
                if (!isCompletionCurrent())
                    return;
                let zoom;
                try {
                    zoom = map.getZoom();
                }
                catch {
                    return;
                }
                if (!isCompletionCurrent())
                    return;
                if (typeof zoom === "number" && Number.isFinite(zoom) && zoom > intent.maximumZoom) {
                    map.setZoom(intent.maximumZoom);
                }
            });
            holder.listener = listener;
            if (holder.fired || !isCurrent()) {
                try {
                    listener.remove();
                }
                catch {
                    // The operation was already consumed or invalidated.
                }
            }
            else {
                this.cameraIdleListener = listener;
            }
            return;
        }
        if (!validCoordinate(intent.coordinate) || !Number.isFinite(intent.targetZoom))
            return;
        const coordinate = cloneCoordinate(intent.coordinate);
        map.panTo(coordinate);
        if (!isCurrent())
            return;
        map.setZoom(intent.targetZoom);
        if (!isCurrent())
            return;
        map.panBy((intent.edgeInsets.right - intent.edgeInsets.left) / 2, (intent.edgeInsets.bottom - intent.edgeInsets.top) / 2);
    }
    getCameraSnapshot() {
        if (this.map === null)
            return null;
        try {
            const zoom = this.map.getZoom();
            return typeof zoom === "number" && Number.isFinite(zoom) ? { zoom } : null;
        }
        catch {
            return null;
        }
    }
    setUserLocation(location) {
        const operation = ++this.userOperation;
        const normalized = location !== null && validCoordinate(location) ? cloneCoordinate(location) : null;
        if (operation !== this.userOperation)
            return;
        this.userLocation = normalized;
        if (normalized === null) {
            this.clearUserLocation();
            return;
        }
        if (this.map === null || this.config === null || this.terminal)
            return;
        if (this.userRecord === null) {
            this.mountUserLocation(normalized, this.generation, operation);
            return;
        }
        const generation = this.generation;
        const map = this.map;
        const record = this.userRecord;
        const descriptor = { coordinates: cloneCoordinate(normalized) };
        record.handle.update(descriptor);
        if (generation === this.generation &&
            operation === this.userOperation &&
            map === this.map &&
            record === this.userRecord &&
            !this.terminal) {
            record.placement.setPosition(normalized);
        }
    }
    destroy() {
        const generation = ++this.generation;
        this.renderOperation += 1;
        this.userOperation += 1;
        this.pendingPresentation = null;
        this.userLocation = null;
        try {
            this.releaseMap();
        }
        finally {
            if (generation === this.generation) {
                this.renderOperation += 1;
                this.userOperation += 1;
                this.pendingPresentation = null;
                this.userLocation = null;
                this.config = null;
                this.terminal = false;
            }
        }
    }
    renderNow(presentation, generation, operation) {
        const map = this.map;
        const config = this.config;
        if (map === null || config === null)
            return;
        const isCurrent = () => generation === this.generation &&
            operation === this.renderOperation &&
            map === this.map &&
            !this.terminal;
        if (!isCurrent())
            return;
        const seenMarkers = new Set();
        const activeMarkers = new Set();
        for (const descriptor of presentation.markers) {
            if (!nonblank(descriptor.ownerId) || seenMarkers.has(descriptor.ownerId))
                continue;
            seenMarkers.add(descriptor.ownerId);
            if (!validCoordinate(descriptor.coordinates))
                continue;
            activeMarkers.add(descriptor.ownerId);
            const existing = this.markers.get(descriptor.ownerId);
            if (existing !== undefined) {
                existing.handle.update(descriptor);
                if (!isCurrent() || this.markers.get(descriptor.ownerId) !== existing)
                    return;
                existing.placement.setPriority(markerPriority(descriptor));
                if (!isCurrent() || this.markers.get(descriptor.ownerId) !== existing)
                    return;
                existing.placement.setPosition(descriptor.coordinates);
                if (!isCurrent() || this.markers.get(descriptor.ownerId) !== existing)
                    return;
                continue;
            }
            const handle = config.createMarkerContent(descriptor);
            if (!isCurrent()) {
                handle.dispose();
                return;
            }
            let placement;
            try {
                placement = this.createPlacement(handle.element, descriptor.coordinates, generation, () => config.events.onMarkerSelect(descriptor.ownerId), markerPriority(descriptor));
            }
            catch (error) {
                handle.dispose();
                throw error;
            }
            const record = { handle, placement, active: true, disposed: false };
            if (!isCurrent()) {
                this.releaseMarker(record);
                return;
            }
            this.markers.set(descriptor.ownerId, record);
        }
        for (const [ownerId, record] of this.markers) {
            if (!activeMarkers.has(ownerId)) {
                if (this.markers.get(ownerId) === record)
                    this.markers.delete(ownerId);
                this.releaseMarker(record);
                if (!isCurrent())
                    return;
            }
        }
        const seenRoutes = new Set();
        const activeRoutes = new Set();
        for (const route of presentation.routes) {
            if (!nonblank(route.edgeId) || seenRoutes.has(route.edgeId))
                continue;
            seenRoutes.add(route.edgeId);
            const style = config.visualProfile.routeStyle(route);
            if (!isCurrent())
                return;
            if (style === null)
                continue;
            let options;
            try {
                options = routeOptions(this.runtime, map, route, style);
            }
            catch {
                options = undefined;
            }
            if (!isCurrent())
                return;
            if (options === undefined)
                continue;
            const existing = this.routes.get(route.edgeId);
            if (existing !== undefined &&
                existing.polylines.length === options.length &&
                existing.polylines.every((polyline) => typeof polyline.setOptions === "function")) {
                for (let index = 0; index < existing.polylines.length; index += 1) {
                    existing.polylines[index].setOptions?.(options[index]);
                    if (!isCurrent() || this.routes.get(route.edgeId) !== existing)
                        return;
                }
                activeRoutes.add(route.edgeId);
                continue;
            }
            if (existing !== undefined) {
                if (this.routes.get(route.edgeId) === existing)
                    this.routes.delete(route.edgeId);
                this.detachRoute(existing);
                if (!isCurrent())
                    return;
            }
            const record = { polylines: [], listeners: [], active: true };
            try {
                for (const value of options) {
                    record.polylines.push(new this.runtime.Polyline(value));
                    if (!isCurrent()) {
                        this.detachRoute(record);
                        return;
                    }
                }
                const primary = record.polylines.at(-1);
                if (primary !== undefined) {
                    record.listeners.push(primary.addListener("click", () => {
                        if (record.active &&
                            generation === this.generation &&
                            this.map === map &&
                            !this.terminal) {
                            config.events.onRouteSelect(route.edgeId);
                        }
                    }));
                    if (!isCurrent()) {
                        this.detachRoute(record);
                        return;
                    }
                }
            }
            catch (error) {
                this.detachRoute(record);
                throw error;
            }
            if (!isCurrent()) {
                this.detachRoute(record);
                return;
            }
            this.routes.set(route.edgeId, record);
            activeRoutes.add(route.edgeId);
        }
        for (const [edgeId, record] of this.routes) {
            if (!activeRoutes.has(edgeId)) {
                if (this.routes.get(edgeId) === record)
                    this.routes.delete(edgeId);
                this.detachRoute(record);
                if (!isCurrent())
                    return;
            }
        }
    }
    createPlacement(element, coordinates, generation, activate, priority = 0) {
        const map = this.map;
        const collision = (value) => value === 0
            ? this.runtime.CollisionBehavior.REQUIRED
            : value === 4 ? this.runtime.CollisionBehavior.REQUIRED_AND_HIDES_OPTIONAL
                : this.runtime.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY;
        if (this.mapId !== undefined) {
            const marker = new this.runtime.AdvancedMarkerElement({
                map,
                position: cloneCoordinate(coordinates),
                content: element,
                anchorLeft: "-50%",
                anchorTop: "-100%",
                zIndex: priority,
                collisionBehavior: collision(priority),
                ...(activate === undefined ? {} : { gmpClickable: true }),
            });
            let active = true;
            const listener = () => {
                if (active && generation === this.generation && this.map === map && !this.terminal) {
                    activate?.();
                }
            };
            try {
                if (activate !== undefined)
                    marker.addEventListener("gmp-click", listener);
            }
            catch (error) {
                active = false;
                try {
                    if (activate !== undefined)
                        marker.removeEventListener("gmp-click", listener);
                }
                catch {
                    // Registration may have partially attached before failing.
                }
                try {
                    marker.map = null;
                }
                catch {
                    // Preserve the setup failure after best-effort rollback.
                }
                throw error;
            }
            return {
                setPriority: (value) => {
                    if (active) {
                        marker.zIndex = value;
                        marker.collisionBehavior = collision(value);
                    }
                },
                setPosition: (position) => {
                    if (active)
                        marker.position = cloneCoordinate(position);
                },
                detach: () => {
                    if (!active)
                        return;
                    active = false;
                    try {
                        if (activate !== undefined)
                            marker.removeEventListener("gmp-click", listener);
                    }
                    finally {
                        marker.map = null;
                    }
                },
            };
        }
        const Base = this.runtime.OverlayView;
        // The provider owns only placement; visible content and its transforms remain recipe-owned.
        const wrapper = element.ownerDocument.createElement("div");
        wrapper.style.position = "absolute";
        wrapper.style.transform = "translate(-50%, -100%)";
        wrapper.style.zIndex = String(priority);
        const nativeControl = element.matches("button,input,select,textarea,a[href],summary");
        let active = true;
        const isCurrent = () => active && generation === this.generation && this.map === map && !this.terminal;
        class ContentOverlay extends Base {
            position = cloneCoordinate(coordinates);
            onClick = () => {
                if (isCurrent())
                    activate?.();
            };
            onKeyDown = (event) => {
                if (nativeControl || event.defaultPrevented || !isCurrent())
                    return;
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (!event.repeat)
                        this.onClick();
                }
            };
            onAdd() {
                wrapper.appendChild(element);
                this.getPanes()?.overlayMouseTarget.appendChild(wrapper);
                if (activate !== undefined) {
                    element.addEventListener("click", this.onClick);
                    element.addEventListener("keydown", this.onKeyDown);
                }
            }
            draw() {
                const pixel = this.getProjection()?.fromLatLngToDivPixel(this.position);
                if (pixel !== null && pixel !== undefined && Number.isFinite(pixel.x) && Number.isFinite(pixel.y)) {
                    wrapper.style.left = `${pixel.x}px`;
                    wrapper.style.top = `${pixel.y}px`;
                }
            }
            onRemove() {
                this.rollback();
            }
            rollback() {
                if (activate !== undefined) {
                    try {
                        element.removeEventListener("click", this.onClick);
                    }
                    catch {
                        // Continue removing the other listener and node.
                    }
                    try {
                        element.removeEventListener("keydown", this.onKeyDown);
                    }
                    catch {
                        // Continue removing the presentation-owned node.
                    }
                }
                try {
                    element.parentNode?.removeChild(element);
                    wrapper.parentNode?.removeChild(wrapper);
                }
                catch {
                    // Provider pane teardown may already have detached the presentation-owned node.
                }
            }
            move(position) {
                this.position = cloneCoordinate(position);
                this.draw();
            }
        }
        const overlay = new ContentOverlay();
        try {
            overlay.setMap(map);
        }
        catch (error) {
            active = false;
            try {
                overlay.setMap(null);
            }
            catch {
                // The provider may have failed while detaching a partial overlay.
            }
            overlay.rollback();
            throw error;
        }
        return {
            setPriority: (value) => { if (active)
                wrapper.style.zIndex = String(value); },
            setPosition: (position) => {
                if (active)
                    overlay.move(position);
            },
            detach: () => {
                if (!active)
                    return;
                active = false;
                try {
                    overlay.setMap(null);
                }
                finally {
                    overlay.rollback();
                }
            },
        };
    }
    mountUserLocation(location, generation, operation) {
        const config = this.config;
        const map = this.map;
        const isCurrent = () => config !== null &&
            map !== null &&
            generation === this.generation &&
            operation === this.userOperation &&
            map === this.map &&
            !this.terminal;
        if (!isCurrent() || config === null)
            return;
        const descriptor = { coordinates: cloneCoordinate(location) };
        const handle = config.createUserLocationContent(descriptor);
        if (!isCurrent()) {
            handle.dispose();
            return;
        }
        let placement;
        try {
            placement = this.createPlacement(handle.element, location, generation);
        }
        catch (error) {
            handle.dispose();
            throw error;
        }
        const record = {
            handle,
            placement,
            active: true,
            disposed: false,
        };
        if (!isCurrent()) {
            this.releaseUserLocation(record);
            return;
        }
        this.userRecord = record;
    }
    clearUserLocation() {
        const record = this.userRecord;
        this.userRecord = null;
        if (record !== null)
            this.releaseUserLocation(record);
    }
    clearMarkers() {
        const records = [...this.markers.values()];
        this.markers.clear();
        let failure;
        for (const record of records) {
            try {
                this.releaseMarker(record);
            }
            catch (error) {
                failure ??= error;
            }
        }
        if (failure !== undefined)
            throw providerCleanupError(failure);
    }
    clearRoutes() {
        const records = [...this.routes.values()];
        this.routes.clear();
        let failure;
        for (const record of records) {
            try {
                this.detachRoute(record);
            }
            catch (error) {
                failure ??= error;
            }
        }
        if (failure !== undefined)
            throw providerCleanupError(failure);
    }
    releaseMarker(record) {
        let failure;
        if (record.active) {
            record.active = false;
            try {
                record.placement.detach();
            }
            catch (error) {
                failure = error;
            }
        }
        if (!record.disposed) {
            record.disposed = true;
            try {
                record.handle.dispose();
            }
            catch (error) {
                failure ??= error;
            }
        }
        if (failure !== undefined)
            throw providerCleanupError(failure);
    }
    releaseUserLocation(record) {
        let failure;
        if (record.active) {
            record.active = false;
            try {
                record.placement.detach();
            }
            catch (error) {
                failure = error;
            }
        }
        if (!record.disposed) {
            record.disposed = true;
            try {
                record.handle.dispose();
            }
            catch (error) {
                failure ??= error;
            }
        }
        if (failure !== undefined)
            throw providerCleanupError(failure);
    }
    detachRoute(record) {
        if (!record.active)
            return;
        record.active = false;
        const listeners = record.listeners.splice(0);
        const polylines = record.polylines.splice(0);
        let failure;
        for (const listener of listeners) {
            try {
                listener.remove();
            }
            catch (error) {
                failure ??= error;
            }
        }
        for (const polyline of polylines) {
            try {
                polyline.setMap(null);
            }
            catch (error) {
                failure ??= error;
            }
        }
        if (failure !== undefined)
            throw providerCleanupError(failure);
    }
    releaseMap() {
        const map = this.map;
        this.map = null;
        this.renderOperation += 1;
        this.userOperation += 1;
        this.cameraOperation += 1;
        this.cameraIntent = null;
        this.cancelCameraClamp();
        const listeners = this.mapListeners.splice(0);
        let failure;
        for (const cleanup of [
            () => this.clearMarkers(),
            () => this.clearUserLocation(),
            () => this.clearRoutes(),
            ...listeners.map((listener) => () => listener.remove()),
            ...(map === null ? [] : [() => map.unbindAll()]),
        ]) {
            try {
                cleanup();
            }
            catch (error) {
                failure ??= error;
            }
        }
        if (failure !== undefined)
            throw providerCleanupError(failure);
    }
    cancelCameraClamp() {
        const listener = this.cameraIdleListener;
        this.cameraIdleListener = null;
        if (listener === null)
            return;
        try {
            listener.remove();
        }
        catch {
            // Provider cleanup is best-effort; ownership is already invalidated.
        }
    }
}
