import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { mkdir } from "node:fs/promises";
import { setTimeout } from "node:timers";
import { build, createServer, loadConfigFromFile, preview } from "vite";
import { encodeSyntheticTile, syntheticMetadata } from "./synthetic-tile.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixtureRoot = fileURLToPath(new URL("./", import.meta.url));

export async function startMapLibreFixture({ built }) {
  const requests = { tiles: 0, successfulTiles: 0, failedTiles: 0 };
  let tileResponse = "ok";
  const evidenceRoot = resolve(root, "node_modules/.cache", `maplibre-${built ? "built" : "dev"}-${randomUUID()}`);
  await mkdir(evidenceRoot, { recursive: true });
  const loaded = await loadConfigFromFile({ command: built ? "build" : "serve", mode: "test" }, resolve(root, "vite.config.ts"), root, undefined, undefined, "runner");
  const middleware = (request, response, next) => {
    const origin = `http://${request.headers.host}`;
    const url = new URL(request.url, origin);
    if (url.pathname === "/tilejson.json") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(syntheticMetadata(origin)));
    } else if (/^\/tiles\/\d+\/\d+\/\d+\.mvt$/.test(url.pathname)) {
      requests.tiles++;
      if (tileResponse === "failed" || (tileResponse === "mixed" && requests.tiles % 2 === 0)) {
        requests.failedTiles++;
        response.statusCode = 503;
        response.setHeader("Content-Type", "text/plain");
        setTimeout(() => response.end("Synthetic tile unavailable"), 40);
        return;
      }
      requests.successfulTiles++;
      response.setHeader("Content-Type", "application/vnd.mapbox-vector-tile");
      response.end(encodeSyntheticTile());
    } else next();
  };
  const headers = { "Content-Security-Policy": "worker-src 'self'; script-src 'self' 'unsafe-inline'; object-src 'none'" };
  const config = { ...loaded.config, configFile: false, envDir: evidenceRoot, root: fixtureRoot,
    cacheDir: resolve(evidenceRoot, "cache"),
    plugins: [...(loaded.config.plugins ?? []), { name: "synthetic-map-tiles", configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } }],
    server: { host: "127.0.0.1", port: 0, strictPort: true, headers },
    preview: { host: "127.0.0.1", port: 0, strictPort: true, headers },
    build: { ...loaded.config.build, outDir: resolve(evidenceRoot, "dist"), emptyOutDir: false, rollupOptions: { input: resolve(fixtureRoot, "index.html") } },
  };
  let server;
  if (built) { await build(config); server = await preview(config); }
  else { server = await createServer(config); await server.listen(); }
  const address = server.httpServer.address();
  if (!address || typeof address === "string") throw new Error("No fixture port");
  globalThis.console.log(`Local renderer fixture: http://127.0.0.1:${address.port} (${evidenceRoot})`);
  return { url: `http://127.0.0.1:${address.port}`, evidenceRoot, requests, setTileResponse: mode => { tileResponse = mode; }, close: () => server.close() };
}
