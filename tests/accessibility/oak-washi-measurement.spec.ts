import { test, expect } from "@playwright/test";
import { settle } from "../fixtures/oak-washi/browser/checks.js";

test("a settled resize measures the upper rail at most once per layout phase", async ({ page, browser, browserName }) => {
  expect(["chromium", "webkit"]).toContain(browserName);
  expect(browser.version()).toBe(browserName === "webkit" ? "26.5" : "151.0.7922.34");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(`page: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  await page.route("**/*", route => {
    if (new URL(route.request().url()).origin === "http://127.0.0.1:4176") return route.continue();
    errors.push(`external request: ${route.request().url()}`);
    return route.abort();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);

  const passes = await page.evaluate(async () => {
    const surface = document.querySelector<HTMLElement>(".oak-experience")!;
    const upper = surface.querySelector<HTMLElement>(".oak-upper-clearance")!;
    // The wrapper preserves the original DOM receiver with apply below.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = Element.prototype.getBoundingClientRect;
    const reads: number[] = [];
    Element.prototype.getBoundingClientRect = function (...args) {
      if (this === surface) reads.push(0);
      else if (this === upper && reads.length) reads[reads.length - 1]++;
      return original.apply(this, args);
    };
    try {
      window.dispatchEvent(new Event("resize"));
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
    return reads;
  });

  expect(passes.length, "resize must run the real geometry measurement").toBeGreaterThan(0);
  expect(passes, "each pass needs one upper box before allocation and one after allocation").toEqual(passes.map(() => 2));
  expect(errors).toEqual([]);
});
