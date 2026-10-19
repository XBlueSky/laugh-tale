import { test, expect, type Page } from "@playwright/test";
import { startMapLibreFixture } from "../fixtures/maplibre/server.mjs";
import { candidateDecision, catalog, ownerButton, setSheetSnap } from "../e2e/contract-driver";

let fixture: Awaited<ReturnType<typeof startMapLibreFixture>>;
test.beforeAll(async () => { fixture = await startMapLibreFixture({ built: false }); });
test.afterAll(async () => { await fixture.close(); });
test.beforeEach(async ({ context }) => {
  fixture.setTileResponse("ok");
  await context.route("**/*", route => {
    expect(new URL(route.request().url()).origin, "No paid provider or external tile request").toBe(new URL(fixture.url).origin);
    return route.continue();
  });
});
async function open(page: Page, unresolved = false) {
  await page.goto(`${fixture.url}/${unresolved ? "?unresolved=1" : ""}`);
  await page.getByRole("button", { name: catalog.home.openDay + " · " + catalog.experience.dayOfTrip.replace("{ordinal}", "1"), exact: true }).click();
  await expect(page.getByRole("link", { name: /OpenStreetMap contributors/ })).toBeVisible();
  await expect(page.locator(".oak-map-status [data-provider-state]")).toHaveCount(0);
  if (!unresolved) await expect(page.locator(".oak-marker").first()).toBeAttached();
}
async function legalGeometry(page: Page) {
  const legal = page.getByRole("note", { name: "Map attribution" });
  await expect(legal).toBeVisible();
  const rects = await legal.evaluate(element => {
    const box = (node: Element) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const visibleBox = (node: Element) => {
      const visible = box(node);
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const clip = box(parent);
        if (["auto", "scroll", "hidden", "clip"].includes(style.overflowX)) {
          visible.x = Math.max(visible.x, clip.x);
          visible.right = Math.min(visible.right, clip.right);
        }
        if (["auto", "scroll", "hidden", "clip"].includes(style.overflowY)) {
          visible.y = Math.max(visible.y, clip.y);
          visible.bottom = Math.min(visible.bottom, clip.bottom);
        }
      }
      return visible;
    };
    const note = box(element);
    const hit = document.elementFromPoint(note.x + note.width / 2, note.y + note.height / 2);
    return { legal: note, blockers: [...document.querySelectorAll(".oak-day-header, .oak-itinerary-sheet, .oak-map-controls")].map(visibleBox), hit: hit !== null && element.contains(hit), width: innerWidth, height: innerHeight };
  });
  expect(rects.legal.x).toBeGreaterThanOrEqual(0);
  expect(rects.legal.y).toBeGreaterThanOrEqual(0);
  expect(rects.legal.right).toBeLessThanOrEqual(rects.width);
  expect(rects.legal.bottom).toBeLessThanOrEqual(rects.height);
  expect(rects.hit, JSON.stringify(rects)).toBe(true);
  for (const blocker of rects.blockers) {
    const overlap = Math.min(rects.legal.right, blocker.right) - Math.max(rects.legal.x, blocker.x) > 1
      && Math.min(rects.legal.bottom, blocker.bottom) - Math.max(rects.legal.y, blocker.y) > 1;
    expect(overlap, JSON.stringify(rects)).toBe(false);
  }
  const link = legal.getByRole("link");
  await link.focus();
  await expect(link).toBeFocused();
}
test("no-coordinate credits survive all snaps, 200% text and resize", async ({ page }, info) => {
  await open(page, true);
  await expect(page.locator(".oak-marker")).toHaveCount(0);
  for (const snap of ["collapsed", "half", "expanded"] as const) {
    await setSheetSnap(page, snap);
    await expect(async () => { await legalGeometry(page); }).toPass({ timeout: 5000 });
  }
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  for (const snap of ["collapsed", "half", "expanded"] as const) {
    await setSheetSnap(page, snap);
    await expect(async () => { await legalGeometry(page); }).toPass({ timeout: 5000 });
  }
  await page.screenshot({ path: info.outputPath("credits-200-percent.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(async () => { await legalGeometry(page); }).toPass({ timeout: 5000 });
});
test("MapLibre sheet reaches the viewport bottom without covering its attribution", async ({ page }) => {
  await open(page, true);
  for (const snap of ["half", "expanded"] as const) {
    await setSheetSnap(page, snap);
    await expect.poll(() => page.locator(".oak-itinerary-sheet").evaluate(element =>
      Math.abs(element.getBoundingClientRect().bottom - window.innerHeight),
    )).toBeLessThan(1);
    await expect(async () => { await legalGeometry(page); }).toPass({ timeout: 5000 });
  }
});
test("half-sheet stays opaque and leaves attribution visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, true);
  await setSheetSnap(page, "half");
  const sheet = page.locator(".oak-itinerary-sheet");
  expect(await sheet.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  expect(await sheet.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 8)?.closest(".oak-itinerary-sheet") === element;
  })).toBe(true);
  await expect(page.getByRole("link", { name: /OpenStreetMap contributors/ })).toBeVisible();
  await legalGeometry(page);
  const note = page.locator(".oak-map-coverage-note");
  await expect(note).toBeVisible();
  const overlap = await note.evaluate(element => {
    const note = element.getBoundingClientRect();
    const legal = document.querySelector('[aria-label="Map attribution"]')!.getBoundingClientRect();
    return Math.min(note.right, legal.right) - Math.max(note.left, legal.left) > 1
      && Math.min(note.bottom, legal.bottom) - Math.max(note.top, legal.top) > 1;
  });
  expect(overlap, "Coverage copy must not cover legal map attribution").toBe(false);
});
test("tablet credits retain readable lines instead of shrinking into the side strip", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await open(page, true);
  for (const snap of ["collapsed", "half", "expanded"] as const) {
    await setSheetSnap(page, snap);
    await expect(async () => { await legalGeometry(page); }).toPass({ timeout: 5000 });
    await expect.poll(() => page.getByRole("note", { name: "Map attribution" }).evaluate(element => {
      const style = getComputedStyle(element);
      return (element.getBoundingClientRect().height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) / parseFloat(style.lineHeight);
    })).toBeLessThanOrEqual(2);
    if (snap === "expanded") {
      await expect.poll(() => page.locator(".oak-map-coverage-note").evaluate(element => {
        const note = element.getBoundingClientRect();
        const header = document.querySelector(".oak-day-header")!.getBoundingClientRect();
        return Math.min(note.right, header.right) - Math.max(note.left, header.left) > 1
          && Math.min(note.bottom, header.bottom) - Math.max(note.top, header.top) > 1;
      })).toBe(false);
    }
  }
});
test("real markers, candidate decisions and Home progress remain connected", async ({ page }) => {
  await open(page);
  await setSheetSnap(page, "expanded");
  await ownerButton(page, "shopping-supplies").click();
  await setSheetSnap(page, "collapsed");
  const marker = page.locator(".oak-marker").and(page.getByRole("button", { name: /Supply hall/ }));
  await expect(marker).toHaveAttribute("aria-pressed", "true");
  await marker.focus();
  await marker.press("Enter");
  await expect(page.locator(".oak-collapsed-summary")).toContainText("Supply hall");
  await expect(async () => {
    const placement = await marker.evaluate(element => {
      const intent = window.mapLibreFixture.intent;
      if (!intent || intent.kind !== "focus") return null;
      const anchor = element.parentElement!.getBoundingClientRect();
      const legal = document.querySelector('[aria-label="Map attribution"]')!.getBoundingClientRect().height;
      const region = intent.usableRegion;
      return { coordinate: intent.coordinate, x: anchor.x + anchor.width / 2, y: anchor.bottom,
        expectedX: region.x + region.width / 2, expectedY: region.y + (region.height - legal - 8) / 2 };
    });
    expect(placement).not.toBeNull();
    expect(placement!.coordinate).toEqual({ lat: 35.686, lng: 139.766 });
    expect(Math.abs(placement!.x - placement!.expectedX)).toBeLessThan(2);
    expect(Math.abs(placement!.y - placement!.expectedY)).toBeLessThan(2);
  }).toPass({ timeout: 5000 });
  await setSheetSnap(page, "expanded");
  await candidateDecision(page);
  await page.getByRole("button", { name: catalog.experience.home, exact: true }).click();
  const task = page.getByRole("checkbox", { name: "Refill water bottle", exact: true });
  await task.check();
  await page.reload();
  await expect(task).toBeChecked();
});
test("successful metadata with every real tile failing becomes visibly retryable", async ({ page }) => {
  fixture.setTileResponse("failed");
  const before = fixture.requests.failedTiles;
  await open(page, true);
  await expect.poll(() => fixture.requests.failedTiles).toBeGreaterThan(before);
  await expect(page.locator(".oak-map-status").getByRole("button", { name: catalog.provider.retry })).toBeVisible({ timeout: 20000 });
  await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(0);
  await expect(page.getByRole("region", { name: catalog.accessibleNames.itinerarySheet, exact: true })).toBeVisible();
});
test("all real tiles failing during a new animated viewport become retryable", async ({ page }) => {
  const initial = fixture.requests.successfulTiles;
  await open(page, true);
  await expect.poll(() => fixture.requests.successfulTiles).toBeGreaterThan(initial);
  fixture.setTileResponse("failed");
  const before = fixture.requests.failedTiles;
  await page.evaluate(() => window.mapLibreFixture.moveMap());
  await expect.poll(() => fixture.requests.failedTiles).toBeGreaterThan(before);
  await expect(page.locator(".oak-map-status").getByRole("button", { name: catalog.provider.retry })).toBeVisible({ timeout: 20000 });
});
test("mixed real tile success after movement stays usable beyond the failure grace period", async ({ page }) => {
  const initial = fixture.requests.successfulTiles;
  await open(page, true);
  await expect.poll(() => fixture.requests.successfulTiles).toBeGreaterThan(initial);
  fixture.setTileResponse("mixed");
  const failed = fixture.requests.failedTiles; const succeeded = fixture.requests.successfulTiles;
  await page.evaluate(() => window.mapLibreFixture.moveMap());
  await expect.poll(() => fixture.requests.failedTiles).toBeGreaterThan(failed);
  await expect.poll(() => fixture.requests.successfulTiles).toBeGreaterThan(succeeded);
  // Real elapsed time is deliberate: a late watchdog regression would otherwise pass immediately.
  await page.waitForTimeout(16000);
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".oak-map-status [data-provider-state]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /OpenStreetMap contributors/ })).toBeVisible();
});
test("metadata refusal is visible and retains itinerary", async ({ page }) => {
  await page.route("**/tilejson.json", route => route.fulfill({ status: 403, body: "synthetic refusal" }));
  await page.goto(fixture.url);
  await page.getByRole("button", { name: catalog.home.openDay + " · " + catalog.experience.dayOfTrip.replace("{ordinal}", "1"), exact: true }).click();
  await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(0);
  await expect(ownerButton(page, "shopping-supplies")).toBeAttached();
  await expect(page.locator(".oak-map-status [role=status]")).toContainText(catalog.provider.requestDenied);
});
test("explicit retry keeps progress and recreates a failed real map", async ({ page }) => {
  let failed = true;
  await page.route("**/tilejson.json", route => failed ? route.fulfill({ status: 503, body: "offline" }) : route.continue());
  await page.goto(fixture.url);
  await page.getByRole("checkbox", { name: "Refill water bottle", exact: true }).check();
  await page.getByRole("button", { name: catalog.home.openDay + " · " + catalog.experience.dayOfTrip.replace("{ordinal}", "1"), exact: true }).click();
  const retry = page.locator(".oak-map-status").getByRole("button", { name: catalog.provider.retry });
  await expect(retry).toBeVisible(); failed = false; await retry.click();
  await expect(page.getByRole("link", { name: /OpenStreetMap/ })).toBeVisible();
  await page.getByRole("button", { name: catalog.experience.home, exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Refill water bottle", exact: true })).toBeChecked();
});
test("unsupported WebGL retains the itinerary without provider fallback", async ({ page }) => {
  await page.addInitScript(() => {
    // Retained deliberately for Reflect.apply with each actual canvas as receiver.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { value: function(this: HTMLCanvasElement, id: string, ...args: unknown[]) {
      return id.includes("webgl") ? null : Reflect.apply(original, this, [id, ...args]) as unknown;
    } });
  });
  await page.goto(fixture.url);
  await page.getByRole("button", { name: catalog.home.openDay + " · " + catalog.experience.dayOfTrip.replace("{ordinal}", "1"), exact: true }).click();
  await expect(page.locator(".oak-map-status [role=status]")).toContainText(catalog.provider.unsupported);
  await expect(page.getByRole("region", { name: catalog.accessibleNames.itinerarySheet, exact: true })).toBeVisible();
});
test("invalid style fails visibly without waiting for a network timeout", async ({ page }) => {
  await page.goto(`${fixture.url}/?invalid-style=1`);
  await page.getByRole("button", { name: catalog.home.openDay + " · " + catalog.experience.dayOfTrip.replace("{ordinal}", "1"), exact: true }).click();
  await expect(page.locator(".oak-map-status [role=status]")).toContainText(catalog.provider.unsupported);
  await expect(page.locator(".oak-map-status").getByRole("button", { name: catalog.provider.retry })).toHaveCount(0);
});
test("real route symbols and solid lines select their semantic owner", async ({ page }) => {
  await open(page);
  await setSheetSnap(page, "collapsed");
  for (const mode of ["walking", "flight", "driving"] as const) {
    await page.evaluate(mode => window.mapLibreFixture.probeRoute(mode), mode);
    const target = await page.evaluate(() => {
      const region = window.mapLibreFixture.intent!.usableRegion;
      const legal = document.querySelector('[aria-label="Map attribution"]')!.getBoundingClientRect().height;
      return { x: region.x + region.width / 2, y: region.y + (region.height - legal - 8) / 2 };
    });
    // Workers upload GeoJSON asynchronously; hit-test a few pixels either side of the projected midpoint.
    await expect(async () => {
      for (let dx = -8; dx <= 8; dx += 2) {
        await page.mouse.click(target.x + dx, target.y);
        if (await page.evaluate(() => window.mapLibreFixture.routeSelection !== null)) break;
      }
      expect(await page.evaluate(() => window.mapLibreFixture.routeSelection)).toBe("route-start-shuttle");
    }).toPass({ timeout: 5000 });
    await expect(async () => { await legalGeometry(page); }).toPass({ timeout: 5000 });
  }
});
