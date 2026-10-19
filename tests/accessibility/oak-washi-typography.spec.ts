import { test, expect, settle, fontEvidence } from "../fixtures/oak-washi/browser/checks.js";

test("Traditional Chinese Home renders with the local Huninn family", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/?case=home&variant=zero-mobile");
  await settle(page);
  const home = page.locator(".oak-home");
  await expect(home).toBeVisible();
  await expect.poll(() => home.evaluate(element => getComputedStyle(element).fontFamily)).toContain("Oak Huninn");
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Oak Huninn"'))).toBe(true);
  await fontEvidence(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Home supporting labels remain readable at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=home&variant=zero-mobile");
  await settle(page);
  for (const selector of [".oak-home-dates > span", ".oak-home-day-meta", ".oak-type-label", ".oak-copy-secondary"]) {
    const label = page.locator(selector).first();
    await expect(label, selector).toBeAttached();
    expect(await label.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize)), selector).toBeGreaterThanOrEqual(12);
  }
});

test("Home headline avoids an orphan glyph on narrow phones without shrinking at 390px", async ({ page }) => {
  for (const width of [348, 320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/?case=home&variant=zero-mobile");
    await settle(page);
    const title = page.locator(".oak-home h1");
    await title.evaluate(element => { element.textContent = "2042 東岸星圖漫遊紀事"; });
    const result = await title.evaluate(element => {
      const node = element.firstChild!;
      const lines = new Map<number, string>();
      for (let index = 0; index < node.textContent!.length; index++) {
        const range = document.createRange();
        range.setStart(node, index); range.setEnd(node, index + 1);
        const top = Math.round(range.getBoundingClientRect().top);
        lines.set(top, (lines.get(top) ?? "") + node.textContent![index]);
      }
      return {
        lines: [...lines.values()].map(line => line.trim()).filter(Boolean),
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        pageWidth: document.documentElement.scrollWidth,
      };
    });
    expect(result.lines.at(-1)?.length, `${width}px lines: ${result.lines.join(" / ")}`).toBeGreaterThanOrEqual(2);
    expect(result.pageWidth).toBe(width);
    if (width === 390) expect(result.fontSize).toBeCloseTo(41.6, 1);
    else expect(result.fontSize).toBeLessThanOrEqual(35);
  }
});

test("Experience time and itinerary metadata remain readable at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day");
  await settle(page);
  for (const selector of [".oak-header-day-context", ".oak-header-clock", ".oak-day-weekday", ".oak-sheet-heading h2 span", ".oak-row-time-end"]) {
    const label = page.locator(selector).first();
    await expect(label, selector).toBeAttached();
    expect(await label.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize)), selector).toBeGreaterThanOrEqual(12);
  }
});

test("Home headline does not jump when the local font replaces its fallback", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let releaseFont!: () => void;
  const fontGate = new Promise<void>(resolve => { releaseFont = resolve; });
  await page.route(/huninn-regular.*\.woff2/, async route => {
    await fontGate;
    await route.continue();
  });
  const fontRequest = page.waitForRequest(request => request.url().includes("huninn-regular"));
  await page.goto("/?case=home&variant=zero-mobile", { waitUntil: "domcontentloaded" });
  await page.locator(".oak-home h1").waitFor();
  await fontRequest;
  const before = await page.locator(".oak-home h1").evaluate(element => element.getBoundingClientRect().height);
  releaseFont();
  await page.evaluate(() => document.fonts.ready);
  const after = await page.locator(".oak-home h1").evaluate(element => element.getBoundingClientRect().height);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(16);
});

test("a mixed Chinese and Japanese headline wraps at 320px and 200% text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/?case=home&variant=zero-mobile");
  await settle(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
    document.querySelector<HTMLElement>(".oak-home h1")!.textContent = "合成群島旅行・海辺の長い散歩道與沿岸閱讀室巡禮";
  });
  const result = await page.locator(".oak-home h1").evaluate(element => {
    const box = element.getBoundingClientRect();
    return { viewport: innerWidth, page: document.documentElement.scrollWidth, left: box.left, right: box.right, height: box.height };
  });
  expect(result.page).toBe(result.viewport);
  expect(result.left).toBeGreaterThanOrEqual(0);
  expect(result.right).toBeLessThanOrEqual(result.viewport);
  expect(result.height).toBeGreaterThan(70);
});

test("a mixed-script itinerary stop keeps every glyph inside the 320px sheet at 200% text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/?case=experience-default&variant=full-day");
  await settle(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
    window.oak!.probe.actions!.setSheetSnap("expanded");
    window.oak!.probe.actions!.selectNode("node-sightseeing");
  });
  await settle(page);
  const title = page.locator('[data-owner-id="node-sightseeing"] .oak-row-title').first();
  await expect(title).toBeVisible();
  await title.evaluate(element => { element.textContent = "合成群島・海辺の長い散歩道與沿岸閱讀室巡禮・港で夕暮れの待ち合わせ"; });
  const result = await title.evaluate(element => {
    const text = element.firstChild!;
    const row = element.closest(".oak-row-selection")!.getBoundingClientRect();
    const sheet = element.closest(".oak-sheet-scroll")!.getBoundingClientRect();
    const glyphs = Array.from({ length: text.textContent!.length }, (_, index) => {
      const range = document.createRange();
      range.setStart(text, index); range.setEnd(text, index + 1);
      const box = range.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top };
    });
    return {
      viewport: innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      lines: new Set(glyphs.map(glyph => Math.round(glyph.top))).size,
      fits: glyphs.every(glyph => glyph.left >= Math.max(0, row.left, sheet.left) - 1 && glyph.right <= Math.min(innerWidth, row.right, sheet.right) + 1),
    };
  });
  expect(result.pageWidth).toBe(result.viewport);
  expect(result.lines).toBeGreaterThan(1);
  expect(result.fits).toBe(true);
});

test("the Home day selector keeps its target and focus outline at 200% text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/?case=home&variant=zero-mobile");
  await settle(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
  const reset = page.locator(".oak-progress-reset");
  await reset.locator("summary").click();
  const select = reset.locator("select");
  await expect(select).toBeVisible();
  await select.focus();
  const result = await select.evaluate(element => {
    const box = element.getBoundingClientRect();
    const focus = getComputedStyle(element.parentElement!);
    return { height: box.height, left: box.left, right: box.right, page: document.documentElement.scrollWidth, viewport: innerWidth, outlineWidth: focus.outlineWidth };
  });
  expect(result.height).toBeGreaterThanOrEqual(44);
  expect(result.left).toBeGreaterThanOrEqual(0);
  expect(result.right).toBeLessThanOrEqual(result.viewport);
  expect(result.page).toBe(result.viewport);
  expect(Number.parseFloat(result.outlineWidth)).toBeGreaterThanOrEqual(2);
});

test("a failed local font request leaves a usable 320px fallback", async ({ page, errors }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const intercepted = new Set<string>();
  const failed = new Set<string>();
  page.on("requestfailed", request => {
    if (intercepted.has(request.url()) && request.failure()?.errorText === "net::ERR_FAILED") failed.add(request.url());
  });
  await page.route(/huninn-regular.*\.woff2/, async route => {
    intercepted.add(route.request().url());
    await route.abort();
  });
  await page.goto("/?case=home&variant=zero-mobile");
  const home = page.locator(".oak-home");
  await expect(home).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(intercepted.size).toBeGreaterThan(0);
  expect([...failed].sort()).toEqual([...intercepted].sort());
  const result = await home.evaluate(element => {
    const heading = element.querySelector("h1")!.getBoundingClientRect();
    const firstDay = element.querySelector(".oak-home-day-open")!.getBoundingClientRect();
    return { page: document.documentElement.scrollWidth, viewport: innerWidth, headingRight: heading.right, dayLeft: firstDay.left, dayRight: firstDay.right };
  });
  expect(result.page).toBe(result.viewport);
  expect(result.headingRight).toBeLessThanOrEqual(result.viewport);
  expect(result.dayLeft).toBeGreaterThanOrEqual(0);
  expect(result.dayRight).toBeLessThanOrEqual(result.viewport);
  expect(errors).toEqual([...failed].map(() => "console: Failed to load resource: net::ERR_FAILED"));
  errors.length = 0; // The fixture still rejects any other console or page error.
});
