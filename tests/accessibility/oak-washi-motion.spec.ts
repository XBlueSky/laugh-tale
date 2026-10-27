import { test, expect } from "@playwright/test";
import { settle } from "../fixtures/oak-washi/browser/checks.js";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:4176" ? route.continue() : route.abort());
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?case=experience-default&variant=full-day");
  await settle(page);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
  test(`selection feedback interpolates without blocking the next selection at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport); await settle(page);
    const samples = await page.evaluate(async () => {
      const row = document.querySelector('.oak-row[data-owner-id="node-shopping"]')!;
      const summary = row.querySelector<HTMLElement>(".oak-primary-summary")!;
      const color = () => getComputedStyle(summary).backgroundColor;
      const before = color();
      window.oak!.probe.actions!.selectNode("node-shopping");
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      const changing = summary.getAnimations().some(animation => animation.playState === "running");
      const intermediate = color();
      await new Promise(resolve => setTimeout(resolve, 230));
      const after = color();
      window.oak!.probe.actions!.selectNode("node-sightseeing");
      window.oak!.probe.actions!.selectNode("node-shopping");
      await new Promise(requestAnimationFrame);
      return { before, intermediate, after, changing, selected: window.oak!.probe.experience!.model.owners.selectedId };
    });
    expect(samples.changing, "selection has a real, running visual transition").toBe(true);
    expect(samples.intermediate).not.toBe(samples.after);
    expect(samples.before).not.toBe(samples.after);
    expect(samples.selected).toBe("node-shopping");
  });

  test(`detail reversal retires hidden actions and keeps the latest owner at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.evaluate(() => { window.oak!.probe.actions!.setSheetSnap("expanded"); window.oak!.probe.actions!.selectNode("node-shopping"); });
    await settle(page);
    const old = page.locator('.oak-row[data-owner-id="node-shopping"] .oak-detail-motion');
    await expect(old).toHaveAttribute("data-open", "true");
    // Observe and reverse in one browser task: protocol round trips can outlast
    // the real 180ms exit, especially in WebKit under concurrent QA load.
    const exit = await page.evaluate(async () => {
      window.oak!.probe.actions!.selectNode("node-sightseeing");
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      const surface = document.querySelector('.oak-row[data-owner-id="node-shopping"] .oak-detail-motion')!;
      const observed = { inert: surface.hasAttribute("inert"), hidden: surface.getAttribute("aria-hidden"), running: surface.getAnimations().some(animation => animation.playState === "running") };
      window.oak!.probe.actions!.selectNode("node-shopping");
      return observed;
    });
    expect(exit).toEqual({ inert: true, hidden: "true", running: true });
    await settle(page);
    await expect(old).toHaveAttribute("data-open", "true");
    await expect(old).not.toHaveAttribute("inert", "");
    await expect(old.locator(".oak-owner-details")).toBeVisible();
    await page.evaluate(() => window.oak!.probe.actions!.selectNode("node-sightseeing"));
    await settle(page);
    await expect(old.locator(".oak-owner-details")).toHaveCount(0);
    expect(await old.evaluate(element => element.getBoundingClientRect().height)).toBe(0);
    expect(await page.evaluate(() => window.oak!.probe.experience!.model.owners.selectedId)).toBe("node-sightseeing");
  });
}

test("header and sheet disclosure arrows rotate rather than replacing SVG nodes", async ({ page }) => {
  const header = page.locator('.oak-day-header button[aria-expanded]');
  const initial = await header.locator("svg").evaluate(element => { element.setAttribute("data-motion-proof", "same-node"); return getComputedStyle(element).transform; });
  await header.click();
  await settle(page);
  await expect(header.locator("svg")).toHaveAttribute("data-motion-proof", "same-node");
  expect(await header.locator("svg").evaluate(element => getComputedStyle(element).transform)).not.toBe(initial);
  expect(await header.locator("svg").evaluate(element => getComputedStyle(element).transitionDuration)).toBe(await page.locator(".oak-day-rail-motion").evaluate(element => getComputedStyle(element).transitionDuration));
  const sheet = page.locator(".oak-sheet-toggle");
  await sheet.locator("svg").evaluate(element => element.setAttribute("data-motion-proof", "same-node"));
  await sheet.click(); await settle(page);
  await expect(sheet.locator("svg")).toHaveAttribute("data-motion-proof", "same-node");
});

test("collapsing the previous detail keeps the newly selected control in the reading viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { window.oak!.probe.actions!.setSheetSnap("expanded"); window.oak!.probe.actions!.selectNode("node-shopping"); });
  await settle(page);
  const next = page.locator('.oak-row[data-owner-id="node-sightseeing"] .oak-row-selection');
  await next.evaluate(element => {
    const port = element.closest(".oak-sheet-scroll")!;
    port.scrollTop += element.getBoundingClientRect().top - port.getBoundingClientRect().top - 30;
  });
  await next.click(); await settle(page);
  const frame = await next.evaluate(element => {
    const target = element.getBoundingClientRect(), port = element.closest(".oak-sheet-scroll")!.getBoundingClientRect();
    return { top: target.top - port.top, bottom: port.bottom - target.bottom };
  });
  expect(frame.top, "an upstream exit must not hide the newly selected control behind the heading").toBeGreaterThanOrEqual(0);
  expect(frame.bottom).toBeGreaterThanOrEqual(0);
});

test("manual wheel reading interrupts positioning during a previous detail's exit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { window.oak!.probe.actions!.setSheetSnap("expanded"); window.oak!.probe.actions!.selectNode("node-shopping"); });
  await settle(page);
  const next = page.locator('.oak-row[data-owner-id="node-sightseeing"] .oak-row-selection');
  await next.evaluate(element => {
    const port = element.closest(".oak-sheet-scroll")!;
    port.scrollTop += element.getBoundingClientRect().top - port.getBoundingClientRect().top - 30;
  });
  const port = page.locator(".oak-sheet-scroll");
  const input = await page.evaluate(async () => {
    window.oak!.probe.actions!.selectNode("node-sightseeing");
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    const surface = document.querySelector('.oak-row[data-owner-id="node-shopping"] .oak-detail-motion')!;
    const readingPort = document.querySelector(".oak-sheet-scroll")!;
    const running = surface.getAnimations().some(animation => animation.playState === "running");
    // Dispatch wheel intent and its scroll displacement in the same animation
    // frame; native wheel/keyboard scrolling belongs to the generated site's
    // mobile experience contract, not this synthetic event-dispatch check.
    readingPort.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 240 }));
    readingPort.scrollTop += 240;
    return { running, reading: readingPort.scrollTop };
  });
  expect(input.running).toBe(true);
  await settle(page);
  const final = await port.evaluate(element => ({ scroll: element.scrollTop, max: element.scrollHeight - element.clientHeight }));
  expect(final.scroll).toBeGreaterThanOrEqual(Math.min(input.reading, final.max) - 1);
});

test("reduced motion reveals immediately and never leaves stale detail actions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await settle(page);
  await page.evaluate(() => { window.oak!.probe.actions!.setSheetSnap("expanded"); window.oak!.probe.actions!.selectNode("node-shopping"); });
  await settle(page);
  await page.evaluate(() => window.oak!.probe.actions!.selectNode("node-sightseeing"));
  await settle(page);
  await expect(page.locator('.oak-row[data-owner-id="node-shopping"] .oak-owner-details')).toHaveCount(0);
  await expect(page.locator('.oak-row[data-owner-id="node-sightseeing"] .oak-owner-details')).toBeVisible();
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
});

test("native progress disclosure fades in without turning its date select into a custom menu", async ({ page }) => {
  await page.evaluate(() => window.oak!.probe.actions!.openHome()); await settle(page);
  const summary = page.locator(".oak-progress-reset > summary");
  await summary.click();
  const body = page.locator(".oak-progress-reset-content");
  expect(await body.evaluate(element => element.getAnimations().some(animation => animation.playState === "running"))).toBe(true);
  await expect(body.locator("select")).toHaveCount(1);
  await summary.click();
  await expect(body).not.toBeVisible();
});

for (const action of ["取消", "確認"]) test(`detail feedback never overrides the visible candidate trigger after ${action}`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=candidate-open&variant=draft&details=long"); await settle(page);
  await page.evaluate(() => { window.oak!.probe.actions!.setSheetSnap("expanded"); window.oak!.probe.actions!.selectNode("node-dining"); }); await settle(page);
  const trigger = page.getByRole("button", { name: "變更選擇", exact: true });
  await trigger.click(); await settle(page);
  const dialog = page.locator(".oak-candidate-dialog");
  await dialog.locator("button.oak-candidate-option").last().click(); await settle(page);
  await dialog.getByRole("button", { name: action, exact: true }).click(); await settle(page);
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  const geometry = await trigger.evaluate(element => {
    const target = element.getBoundingClientRect(), port = element.closest(".oak-sheet-scroll")!.getBoundingClientRect();
    return { top: target.top - port.top, bottom: port.bottom - target.bottom };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(0); expect(geometry.bottom).toBeGreaterThanOrEqual(0);
});
