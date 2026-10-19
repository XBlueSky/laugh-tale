export const requiredLayers = ["ocean", "water_polygons", "water_lines", "land", "buildings", "streets", "place_labels", "street_labels", "public_transport"];
export class MapLibreFailure extends Error {
    failure;
    constructor(reason, retryable = false) {
        super(`Map unavailable: ${reason}`);
        this.failure = { status: "unavailable", reason, retryable };
    }
}
function unsupported() { throw new MapLibreFailure("unsupported"); }
function safeURL(value, local) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        return unsupported();
    }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(local && loopback && url.protocol === "http:")))
        return unsupported();
    return url;
}
export function normalizeMapLibreOptions(input = {}) {
    const allowLocalhostHTTP = input.allowLocalhostHTTP === true;
    const tileJSONUrl = safeURL(input.tileJSONUrl ?? "https://vector.openstreetmap.org/shortbread_v1/tilejson.json", allowLocalhostHTTP).href;
    const initialView = input.initialView ?? { center: { lat: 0, lng: 0 }, zoom: 1 };
    const { lat, lng } = initialView.center;
    if (![lat, lng, initialView.zoom].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || initialView.zoom < 0 || initialView.zoom > 22)
        return unsupported();
    const attribution = [{ text: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" }];
    for (const entry of input.additionalAttribution ?? []) {
        if (!entry.text.trim() || entry.text.length > 256)
            return unsupported();
        attribution.push({ text: entry.text, url: safeURL(entry.url, false).href });
    }
    return { tileJSONUrl, allowLocalhostHTTP, initialView: { center: { lat, lng }, zoom: initialView.zoom }, attribution };
}
function object(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
export async function loadShortbreadSource(options, signal) {
    if (signal.aborted)
        throw new MapLibreFailure("cancelled");
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 15000);
    try {
        const response = await fetch(options.tileJSONUrl, { signal: controller.signal, redirect: "error" });
        if (!response.ok)
            throw new MapLibreFailure(response.status === 401 || response.status === 403 ? "request-denied" : "network", response.status !== 401 && response.status !== 403);
        const reader = response.body?.getReader();
        if (!reader)
            return unsupported();
        let size = 0;
        let json = "";
        const decoder = new TextDecoder();
        try {
            while (true) {
                const chunk = await reader.read();
                if (chunk.done)
                    break;
                size += chunk.value.byteLength;
                if (size > 262144)
                    return unsupported();
                json += decoder.decode(chunk.value, { stream: true });
            }
            json += decoder.decode();
        }
        finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
        }
        let value;
        try {
            value = JSON.parse(json);
        }
        catch {
            return unsupported();
        }
        if (!object(value) || (value.scheme !== undefined && value.scheme !== "xyz") || !Array.isArray(value.tiles) || value.tiles.length < 1 || value.tiles.length > 4
            || !Array.isArray(value.vector_layers) || !requiredLayers.every(id => value.vector_layers instanceof Array && value.vector_layers.some((layer) => object(layer) && layer.id === id)))
            return unsupported();
        const minzoom = value.minzoom, maxzoom = value.maxzoom;
        for (const [id, fields] of [["land", ["kind"]], ["streets", ["kind", "rail"]], ["place_labels", ["name"]], ["street_labels", ["name"]], ["public_transport", ["kind", "name"]]]) {
            const layer = value.vector_layers.find((item) => object(item) && item.id === id);
            if (!object(layer) || !object(layer.fields) || !fields.every(field => object(layer.fields) && Object.hasOwn(layer.fields, field)))
                return unsupported();
        }
        if (typeof minzoom !== "number" || typeof maxzoom !== "number" || !Number.isInteger(minzoom) || !Number.isInteger(maxzoom) || minzoom < 0 || maxzoom > 22 || minzoom > maxzoom)
            return unsupported();
        const tiles = value.tiles.map((template) => {
            if (typeof template !== "string" || !["{z}", "{x}", "{y}"].every(token => template.split(token).length === 2) || /[{}]/.test(template.replace(/\{[zxy]\}/g, "")))
                return unsupported();
            if (safeURL(template, options.allowLocalhostHTTP).origin !== new URL(options.tileJSONUrl).origin)
                return unsupported();
            return template;
        });
        if (signal.aborted)
            throw new MapLibreFailure("cancelled");
        return { tiles, minzoom, maxzoom };
    }
    catch (error) {
        if (signal.aborted)
            throw new MapLibreFailure("cancelled");
        if (error instanceof MapLibreFailure)
            throw error;
        throw new MapLibreFailure("network", true);
    }
    finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
    }
}
