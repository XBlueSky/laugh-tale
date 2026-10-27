import assert from "node:assert/strict";
import { test } from "node:test";
import { URL } from "node:url";
import { chromium, expect } from "@playwright/test";
import { startMapLibreFixture } from "./fixtures/maplibre/server.mjs";
import { encodeSyntheticTile, inspectSyntheticTile } from "./fixtures/maplibre/synthetic-tile.mjs";

test("synthetic MVT round-trips all locally authored layers", () => {
  const layers = inspectSyntheticTile(encodeSyntheticTile());
  assert.equal(layers.length, 9);
  assert.ok(layers.every(layer => layer.features > 0));
  assert.ok(layers.some(layer => layer.name === "public_transport"));
});

for (const built of [false, true]) {
  test(`real MapLibre draws local tiles, fonts and worker (${built ? "built" : "dev"})`, async () => {
    const fixture = await startMapLibreFixture({ built });
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const unexpected = [];
      await context.route("**/*", route => {
        if (new URL(route.request().url()).origin === new URL(fixture.url).origin) return route.continue();
        unexpected.push(route.request().url());
        return route.abort();
      });
      const page = await context.newPage();
      const errors = [];
      const requests = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => requests.push(request.url()));
      await page.goto(`${fixture.url}/?unresolved=1`);
      await page.getByRole("button", { name: /Open day|開啟當日行程/ }).first().click();
      await page.getByRole("link", { name: /OpenStreetMap contributors/ }).waitFor();
      await page.locator("canvas.maplibregl-canvas").waitFor();
      await expect.poll(() => fixture.requests.tiles).toBeGreaterThan(0);
      // Allow symbol placement and the worker's tile upload to settle, then retain visual evidence.
      await page.waitForTimeout(1200);
      const canvas = page.locator("canvas.maplibregl-canvas");
      const png = await canvas.screenshot({ path: `${fixture.evidenceRoot}/canvas.png` });
      assert.ok(png.byteLength > 9000, "A flat empty basemap is not renderer success");
      assert.ok(requests.some(url => /worker/.test(url)), "The local real worker must execute");
      assert.deepEqual(unexpected, []);
      assert.deepEqual(errors, []);
      globalThis.console.log(`Inspect CJK/Latin label evidence: ${fixture.evidenceRoot}/canvas.png`);
    } finally { await browser.close(); await fixture.close(); }
  });
}
