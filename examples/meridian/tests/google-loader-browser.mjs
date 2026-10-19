import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { test } from "node:test";
import { chromium } from "@playwright/test";
import { build, createServer, loadConfigFromFile, preview } from "vite";

const starterRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureRoot = resolve(starterRoot, "tests/fixtures/google-loader");
const evidenceRoot = resolve(starterRoot, "node_modules/.cache", `google-loader-smoke-${randomUUID()}`);
globalThis.console.log(`Retained loader smoke artifacts: ${evidenceRoot}`);

for (const mode of ["development", "production"]) {
  test(`packaged default Google loader resolves lazily in Vite ${mode}`, async () => {
    const loaded = await loadConfigFromFile(
      { command: mode === "development" ? "serve" : "build", mode },
      resolve(starterRoot, "vite.config.ts"), starterRoot, undefined, undefined, "runner",
    );
    assert.ok(loaded, "The real starter Vite config must load");
    const config = {
      ...loaded.config,
      configFile: false,
      root: fixtureRoot,
      cacheDir: resolve(evidenceRoot, mode, "cache"),
      resolve: {
        ...loaded.config.resolve,
        alias: [{ find: /^@googlemaps\/js-api-loader$/, replacement: resolve(fixtureRoot, "sdk.js") }],
      },
      server: { host: "127.0.0.1", port: 0, strictPort: true },
      preview: { host: "127.0.0.1", port: 0, strictPort: true },
      build: {
        ...loaded.config.build,
        outDir: resolve(evidenceRoot, mode, "dist"),
        emptyOutDir: false,
        rollupOptions: {
          ...loaded.config.build?.rollupOptions,
          input: resolve(fixtureRoot, "index.html"),
        },
      },
    };
    let server;
    let browser;
    try {
      if (mode === "development") {
        server = await createServer(config);
        await server.listen();
      } else {
        await build(config);
        server = await preview(config);
      }
      const address = server.httpServer.address();
      assert.ok(address && typeof address !== "string");
      assert.notEqual(address.port, 4173);
      assert.notEqual(address.port, 4174);
      browser = await chromium.launch();
      const page = await browser.newPage();
      const externalRequests = [];
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.hostname !== "127.0.0.1" || url.port !== String(address.port)) {
          externalRequests.push(url.href);
          await route.abort();
        } else {
          await route.continue();
        }
      });
      await page.goto(`http://127.0.0.1:${address.port}/`);
      const result = page.getByLabel("Configuration result");
      assert.equal(await result.textContent(), "idle");
      assert.equal(await page.evaluate(() => globalThis.googleLoaderSmoke), undefined,
        "Importing the public Google subpath must not eagerly execute the SDK");
      await page.getByRole("button", { name: "Configure maps" }).click();
      await result.filter({ hasText: /"status":/ }).waitFor();
      assert.deepEqual(JSON.parse(await result.textContent()), {
        status: "ready", createMap: "function", adapter: "function",
      });
      await page.getByRole("button", { name: "Configure maps" }).click();
      assert.deepEqual(await page.evaluate(() => globalThis.googleLoaderSmoke), {
        evaluations: 1,
        options: [{ key: "set-at-runtime", v: "weekly" }],
        libraries: ["maps", "marker", "core"],
      });
      assert.deepEqual(externalRequests, [], "No external request is permitted");
      assert.deepEqual(pageErrors, []);
    } finally {
      await browser?.close();
      await server?.close();
    }
  });
}
