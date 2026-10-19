import { afterEach, expect, it, vi } from "vitest";
import { loadShortbreadSource, normalizeMapLibreOptions } from "../src/maplibre/options.js";

const layers = ["ocean", "water_polygons", "water_lines", "land", "buildings", "streets", "place_labels", "street_labels", "public_transport"];
const metadata = () => ({ tilejson: "3.0.0", tiles: ["https://tiles.example/shortbread_v1/{z}/{x}/{y}.mvt"], minzoom: 0, maxzoom: 14, vector_layers: layers.map(id => ({ id, fields: { kind: "String", name: "String", rail: "Boolean" } })), attribution: '<a href="https://untrusted.example">ignored</a>' });
const options = () => normalizeMapLibreOptions({ tileJSONUrl: "https://tiles.example/shortbread_v1/tilejson.json" });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("uses world overview without inventing a trip coordinate", () => {
  expect(normalizeMapLibreOptions({}).initialView).toEqual({ center: { lat: 0, lng: 0 }, zoom: 1 });
});
it.each(["http://example.org/x", "javascript:alert(1)", "https://user:secret@example.org/x", "https://example.org/x?key=secret", "https://example.org/x#style", "http://127.0.0.1/x"])("refuses unsafe endpoint %s", tileJSONUrl => {
  expect(() => normalizeMapLibreOptions({ tileJSONUrl })).toThrow();
});
it("requires explicit permission for loopback HTTP", () => {
  expect(normalizeMapLibreOptions({ tileJSONUrl: "http://127.0.0.1:4181/tilejson.json", allowLocalhostHTTP: true }).tileJSONUrl).toContain("127.0.0.1");
  expect(() => normalizeMapLibreOptions({ tileJSONUrl: "http://example.org/x", allowLocalhostHTTP: true })).toThrow();
});
it.each([NaN, Infinity, 91, -91])("refuses invalid initial latitude %s", lat => {
  expect(() => normalizeMapLibreOptions({ initialView: { center: { lat, lng: 0 }, zoom: 10 } })).toThrow();
});
it("ignores remote HTML and uses validated same-origin templates with normal caching", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(metadata())));
  vi.stubGlobal("fetch", fetcher);
  const source = await loadShortbreadSource(options(), new AbortController().signal);
  expect(source).toEqual({ tiles: ["https://tiles.example/shortbread_v1/{z}/{x}/{y}.mvt"], minzoom: 0, maxzoom: 14 });
  expect(fetcher).toHaveBeenCalledWith("https://tiles.example/shortbread_v1/tilejson.json", expect.objectContaining({ redirect: "error" }));
  expect(fetcher.mock.calls[0][1]).not.toHaveProperty("headers");
  expect(fetcher.mock.calls[0][1]).not.toHaveProperty("cache");
});
it.each([
  { tiles: ["https://other.example/{z}/{x}/{y}.mvt"] },
  { tiles: ["https://tiles.example/{z}/{x}/{y}/{secret}.mvt"] },
  { tiles: [] }, { minzoom: -1 }, { maxzoom: 23 }, { scheme: "tms" }, { vector_layers: [] },
])("rejects incompatible metadata %j", async changes => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...metadata(), ...changes }))));
  await expect(loadShortbreadSource(options(), new AbortController().signal)).rejects.toMatchObject({ failure: { reason: "unsupported", retryable: false } });
});
it.each([401, 403, 503])("classifies source HTTP %s without exposing its URL", async status => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status })));
  await expect(loadShortbreadSource(options(), new AbortController().signal)).rejects.toMatchObject({ failure: { reason: status === 503 ? "network" : "request-denied", retryable: status === 503 } });
});
it("bounds response bytes and cancels aborted initialization", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(262145))));
  await expect(loadShortbreadSource(options(), new AbortController().signal)).rejects.toMatchObject({ failure: { reason: "unsupported" } });
  const controller = new AbortController(); controller.abort();
  await expect(loadShortbreadSource(options(), controller.signal)).rejects.toMatchObject({ failure: { reason: "cancelled" } });
});
it("rejects a layer schema that can no longer label stations", async () => {
  const value = metadata();
  const station = value.vector_layers.find(layer => layer.id === "public_transport")!;
  Reflect.deleteProperty(station.fields, "name");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(value))));
  await expect(loadShortbreadSource(options(), new AbortController().signal)).rejects.toMatchObject({ failure: { reason: "unsupported" } });
});
it("terminates a stalled request within fifteen seconds", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  })));
  const check = expect(loadShortbreadSource(options(), new AbortController().signal)).rejects.toMatchObject({ failure: { reason: "network", retryable: true } });
  await vi.advanceTimersByTimeAsync(15000);
  await check;
});
