import { MapLibreFailure } from "./options.js";
export function createRouteFeatures(routes) {
    return { type: "FeatureCollection", features: routes.filter(route => route.geometry.length >= 2 && route.geometry.every(point => Number.isFinite(point.lat) && Number.isFinite(point.lng))).map(route => ({
            type: "Feature", properties: { edgeId: route.edgeId, selected: route.selected, mode: route.mode }, geometry: { type: "LineString", coordinates: route.geometry.map(point => [point.lng, point.lat]) },
        })) };
}
export function sampleRouteSymbols(points, spacing) {
    if (!Number.isFinite(spacing) || spacing <= 0)
        throw new MapLibreFailure("unsupported");
    const samples = [];
    let remaining = 0;
    for (let index = 1; index < points.length; index++) {
        const a = points[index - 1], b = points[index];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (!Number.isFinite(length))
            throw new MapLibreFailure("unsupported");
        if (length === 0)
            continue;
        const dx = (b.x - a.x) / length, dy = (b.y - a.y) / length;
        for (; remaining < length; remaining += spacing) {
            if (samples.length >= 10000)
                throw new MapLibreFailure("unsupported");
            samples.push({ x: a.x + remaining * dx, y: a.y + remaining * dy, dx, dy });
        }
        remaining -= length;
    }
    return samples;
}
export class MapLibreRoutes {
    map;
    profile;
    onFailure;
    #layers = [];
    #sources = [];
    #updates = [];
    #generation = 0;
    constructor(map, profile, onFailure) {
        this.map = map;
        this.profile = profile;
        this.onFailure = onFailure;
    }
    get layerIds() { return this.#layers; }
    clear() {
        this.#generation++;
        this.#updates = [];
        for (const id of this.#layers.reverse())
            if (this.map.getLayer(id))
                this.map.removeLayer(id);
        for (const id of this.#sources)
            if (this.map.getSource(id))
                this.map.removeSource(id);
        this.#layers = [];
        this.#sources = [];
    }
    refresh() { for (const update of this.#updates)
        update(); }
    render(routes) {
        this.clear();
        routes.forEach((route, index) => {
            const style = this.profile.routeStyle(route);
            const geometry = createRouteFeatures([route]);
            if (style === null || geometry.features.length === 0)
                return;
            const sourceId = `ep-route-${index}`;
            this.map.addSource(sourceId, { type: "geojson", data: geometry });
            this.#sources.push(sourceId);
            const add = (layer) => { this.map.addLayer(layer); this.#layers.push(layer.id); };
            if (style.kind === "solid") {
                if (style.casing)
                    add({ id: `${sourceId}-casing`, source: sourceId, type: "line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": style.casing.color, "line-width": style.casing.width, "line-opacity": style.casing.opacity } });
                add({ id: sourceId, source: sourceId, type: "line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": style.stroke.color, "line-width": style.stroke.width, "line-opacity": style.stroke.opacity } });
            }
            else {
                const symbol = style.symbol;
                const update = () => {
                    const projected = route.geometry.map(point => this.map.project([point.lng, point.lat]));
                    const samples = sampleRouteSymbols(projected, symbol.repeatPx);
                    const at = (x, y) => { const ll = this.map.unproject([x, y]); return [ll.lng, ll.lat]; };
                    const features = samples.map(point => ({ type: "Feature", properties: { edgeId: route.edgeId }, geometry: symbol.shape === "circle"
                            ? { type: "Point", coordinates: at(point.x, point.y) }
                            : { type: "LineString", coordinates: [at(point.x - point.dx * symbol.scale * 2, point.y - point.dy * symbol.scale * 2), at(point.x + point.dx * symbol.scale * 2, point.y + point.dy * symbol.scale * 2)] } }));
                    const generation = this.#generation;
                    void this.map.getSource(sourceId).setData({ type: "FeatureCollection", features }).catch(() => { if (generation === this.#generation)
                        this.onFailure(); });
                };
                this.#updates.push(update);
                update();
                if (symbol.shape === "circle")
                    add({ id: sourceId, source: sourceId, type: "circle", paint: { "circle-radius": symbol.scale, "circle-color": symbol.fill.color, "circle-opacity": symbol.fill.opacity, "circle-stroke-width": symbol.stroke?.width ?? 0, "circle-stroke-color": symbol.stroke?.color ?? symbol.fill.color, "circle-stroke-opacity": symbol.stroke?.opacity ?? 0 } });
                else
                    add({ id: sourceId, source: sourceId, type: "line", paint: { "line-color": symbol.stroke.color, "line-width": symbol.stroke.width, "line-opacity": symbol.stroke.opacity } });
            }
        });
    }
}
