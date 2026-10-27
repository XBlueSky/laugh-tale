import { expect, test } from "@playwright/test";
import { startMapLibreFixture } from "../fixtures/maplibre/server.mjs";
import { catalog } from "../e2e/contract-driver";

test("production bundle loads its worker and vector tiles", async ({ page }) => {
  const fixture = await startMapLibreFixture({ built: true });
  const workerResponses: Array<{ status: number; contentType: string; url: string }> = [];
  const sdkRequests: string[] = [];
  page.on("request", request => {
    if (/\/maplibre-gl-(?!worker)[^/]+\.js$/.test(new URL(request.url()).pathname)) sdkRequests.push(request.url());
  });
  page.on("response", response => {
    if (response.url().includes("maplibre-gl-worker")) workerResponses.push({
      status: response.status(), contentType: response.headers()["content-type"] ?? "", url: response.url(),
    });
  });
  try {
    await page.goto(fixture.url);
    await page.getByRole("button", {
      name: catalog.home.openDay + " · " + catalog.experience.dayOfTrip.replace("{ordinal}", "1"), exact: true,
    }).waitFor();
    await page.waitForLoadState("networkidle");
    expect(sdkRequests, "Home must not download the map engine before a map is mounted").toEqual([]);
    await page.getByRole("button", {
      name: catalog.home.openDay + " · " + catalog.experience.dayOfTrip.replace("{ordinal}", "1"),
      exact: true,
    }).click();
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
    await expect.poll(() => fixture.requests.successfulTiles, { timeout: 20000 }).toBeGreaterThan(0);
    expect(sdkRequests).toHaveLength(1);
    expect(workerResponses).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 200, contentType: expect.stringMatching(/javascript/), url: expect.stringMatching(/maplibre-gl-worker-[^/]+\.js$/) }),
    ]));
  } finally {
    await fixture.close();
  }
});

test("a rejected production engine chunk retains the readable itinerary and typed retry state", async ({ page }) => {
  const fixture = await startMapLibreFixture({ built: true });
  let failedChunks = 0;
  await page.route("**/*", route => {
    if (/\/maplibre-gl-(?!worker)[^/]+\.js$/.test(new URL(route.request().url()).pathname)) {
      failedChunks += 1;
      return route.abort("failed");
    }
    return route.continue();
  });
  try {
    await page.goto(fixture.url);
    await page.getByRole("button", {
      name: catalog.home.openDay + " · " + catalog.experience.dayOfTrip.replace("{ordinal}", "1"), exact: true,
    }).click();
    await expect(page.locator(".oak-map-status").getByRole("button", { name: catalog.provider.retry, exact: true })).toBeVisible();
    await expect(page.locator(".oak-itinerary-sheet")).toBeVisible();
    await expect(page.locator(".oak-primary-row").first()).toBeVisible();
    expect(failedChunks).toBe(1);
    expect(fixture.requests.tiles).toBe(0);
    await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(0);
    await page.getByRole("button", { name: catalog.experience.home, exact: true }).click();
    await expect(page.locator(".oak-home")).toBeVisible();
  } finally {
    await fixture.close();
  }
});
