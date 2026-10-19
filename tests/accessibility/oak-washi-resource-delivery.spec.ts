import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { settle } from "../fixtures/oak-washi/browser/checks.js";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:4176" ? route.continue() : route.abort());
});

test("Home discovers its owned cover as a high-priority preload before its first paint opportunity", async ({ page }) => {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector(".oak-home")) return;
      observer.disconnect();
      requestAnimationFrame(() => performance.mark("oak-home-first-paint-opportunity"));
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto("/?case=home&variant=zero-mobile"); await settle(page);
  const delivery = await page.evaluate(() => {
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const cover = resources.find(entry => entry.name.includes("oak-washi-cartography") && entry.name.includes(".webp"));
    const hints = [...document.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="image"]')].filter(link => link.href.includes("oak-washi-cartography"));
    return { cover: cover && { via: cover.initiatorType, start: cover.startTime }, firstPaint: performance.getEntriesByName("oak-home-first-paint-opportunity")[0]?.startTime, hints: hints.map(link => link.fetchPriority) };
  });
  expect(delivery.hints).toEqual(["high"]);
  expect(delivery.cover?.via).toBe("link");
  expect(delivery.cover!.start).toBeLessThanOrEqual(delivery.firstPaint);
});

test("selecting itinerary rows reuses the locale's accessible-date formatter", async ({ page }) => {
  await page.addInitScript(() => {
    const counter = window as unknown as { oakDateFormats: number };
    counter.oakDateFormats = 0;
    Intl.DateTimeFormat = new Proxy(Intl.DateTimeFormat, {
      construct(target, args) {
        const options = args[1] as Intl.DateTimeFormatOptions | undefined;
        if (options?.dateStyle === "full" && options.timeZone === "UTC") counter.oakDateFormats++;
        return Reflect.construct(target, args) as Intl.DateTimeFormat;
      },
    });
  });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  const before = await page.evaluate(() => (window as unknown as { oakDateFormats: number }).oakDateFormats);
  await page.evaluate(() => window.oak!.probe.actions!.selectNode("node-shopping")); await settle(page);
  await page.evaluate(() => window.oak!.probe.actions!.selectNode("node-sightseeing")); await settle(page);
  expect(await page.evaluate(() => (window as unknown as { oakDateFormats: number }).oakDateFormats)).toBe(before);
});

test("missing-content Setup does not preload another trip's cover", async ({ page }) => {
  await page.goto("/?case=setup-states&variant=missing-content"); await settle(page);
  expect(await page.evaluate(() => performance.getEntriesByType("resource").filter(entry => entry.name.includes("oak-washi-cartography")).length)).toBe(0);
  await expect(page.locator('link[rel="preload"][as="image"]')).toHaveCount(0);
});

test("Home-owned progress Loading discovers the cover before Home is rendered", async ({ page }) => {
  await page.goto("/?case=loading-owned&variant=startup"); await settle(page);
  await expect(page.locator(".oak-home")).toHaveCount(0);
  await expect(page.locator(".oak-loading")).toBeVisible();
  const hints = page.locator('link[rel="preload"][as="image"]');
  await expect(hints).toHaveCount(1);
  await expect(hints).toHaveAttribute("fetchpriority", "high");
  await expect(hints).toHaveAttribute("href", /oak-washi-cartography.*\.webp/);
});

test("ordinary Home requests manifested selective fonts, never the full archive", async ({ page }) => {
  const manifest = JSON.parse(readFileSync(new URL("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/assets/HUNINN-SUBSETS.json", import.meta.url), "utf8")) as { source: { bytes: number }; subsets: { file: string; bytes: number }[] };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=home&variant=zero-mobile"); await settle(page);
  const requests = await page.evaluate(() => performance.getEntriesByType("resource").map(entry => new URL(entry.name).pathname).filter(path => /huninn.*\.woff2$/.test(path)));
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.some(path => /\/huninn-regular\.woff2$/.test(path))).toBe(false);
  const selected = manifest.subsets.filter(subset => requests.some(path => path.endsWith(`/${subset.file}`)));
  expect(selected.length).toBe(new Set(requests).size);
  expect(selected.reduce((sum, subset) => sum + subset.bytes, 0)).toBeLessThan(manifest.source.bytes);
});

test("selective fonts retain original kerning and composed Latin shaping", async ({ page }) => {
  await page.goto("/?case=home&variant=zero-mobile"); await settle(page);
  const originalPath = new URL("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/assets/huninn-regular.woff2", import.meta.url).pathname;
  const widths = await page.evaluate(async path => {
    const original = new FontFace("Oak Original Proof", `url("/@fs${path}")`);
    document.fonts.add(await original.load());
    const samples = ["Tōkyō", "Tā Vā", "A\u0301 O\u0358\u0301 n\u030c", "V₫ To"];
    const result = [];
    for (const text of samples) {
      await document.fonts.load('64px "Oak Huninn"', text);
      const width = (family: string) => {
        const span = document.createElement("span");
        span.textContent = text;
        span.style.cssText = `font: 64px "${family}"; display: inline-block; white-space: pre; letter-spacing: 0; font-kerning: normal;`;
        document.body.append(span);
        const value = span.getBoundingClientRect().width;
        span.remove();
        return value;
      };
      result.push({ text, subset: width("Oak Huninn"), original: width("Oak Original Proof") });
    }
    return result;
  }, originalPath);
  for (const sample of widths) expect(Math.abs(sample.subset - sample.original), `${sample.text}: ${JSON.stringify(sample)}`).toBeLessThanOrEqual(0.02);
});

test("unchanged viewport measurements do not rewrite geometry styles", async ({ page }) => {
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  const mutations = await page.evaluate(async () => {
    const surface = document.querySelector<HTMLElement>(".oak-experience")!;
    const records: MutationRecord[] = [];
    const observer = new MutationObserver(batch => records.push(...batch));
    observer.observe(surface, { attributes: true, attributeFilter: ["style", "data-large-text", "data-chrome-scroll", "data-chrome-space"] });
    for (let count = 0; count < 3; count++) {
      window.dispatchEvent(new Event("resize"));
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    }
    observer.disconnect();
    return records.map(record => record.attributeName);
  });
  expect(mutations, "settled geometry should not invalidate style/layout again").toEqual([]);
});
