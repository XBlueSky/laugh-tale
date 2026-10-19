import AxeBuilder from "@axe-core/playwright";
import { test, expect, variants, openCase, settle, captureOwner, assertCaptureOwner, frameCaptureOwner } from "../fixtures/oak-washi/browser/checks.js";

for (const { visualCase, variant, name } of variants.filter(({ visualCase, variant }) => captureOwner(visualCase, variant))) test(`capture owner ${name}`, async ({ page }, info) => {
  await openCase(page, visualCase, variant);
  if ((await page.evaluate(() => window.oak!.probe.experience!.model.sheet.snap)) !== "expanded" && captureOwner(visualCase, variant)?.id !== "global-notice") {
    await assertCaptureOwner(page, visualCase, variant);
    await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("expanded"));
    await settle(page);
    await frameCaptureOwner(page, visualCase, variant);
  }
  const initial = await assertCaptureOwner(page, visualCase, variant);
  await info.attach("capture-owner-initial", { body: JSON.stringify(initial, null, 2), contentType: "application/json" });
  if (variant.id === "retry") {
    await page.evaluate(() => window.oak!.probe.actions!.retryProvider("route", "route-walking")); await settle(page);
  }
  if (visualCase.id === "camera-adversarial") {
    await page.evaluate(() => window.oak!.probe.actions!.restoreFullDay()); await settle(page);
  }
  await frameCaptureOwner(page, visualCase, variant);
  const final = await assertCaptureOwner(page, visualCase, variant, variant.id === "retry");
  console.info(`CAPTURE_OWNER ${name} ${JSON.stringify(final)}`);
});

test("settle cannot reuse readiness from before a real header and sheet action", async ({ page }, info) => {
  const item = variants.find(item => item.visualCase.id === "experience-default")!;
  await openCase(page, item.visualCase, item.variant);
  await page.waitForFunction(() => window.oak?.ready === true);
  // Queue the real action and its wait back-to-back, so a client round trip
  // cannot accidentally give the old flag time to turn false first.
  const action = page.evaluate(() => {
    const harness = window.oak!;
    const value = { ready: harness.ready, revision: harness.probe.revision, request: harness.readiness.requested, height: document.querySelector(".oak-itinerary-sheet")!.getBoundingClientRect().height };
    harness.probe.actions!.setHeaderExpanded(true);
    harness.probe.actions!.setSheetSnap("expanded");
    return { ...value, readyImmediatelyAfterAction: harness.ready };
  });
  const [before] = await Promise.all([action, settle(page)]);
  expect(before.ready).toBe(true);
  expect(before.readyImmediatelyAfterAction).toBe(true);
  const after = await page.evaluate(() => ({ ready: window.oak!.ready, readiness: window.oak!.readiness, attribute: document.documentElement.dataset.oakReady, revision: window.oak!.probe.revision, expanded: window.oak!.probe.experience!.model.header.expanded, snap: window.oak!.probe.experience!.model.sheet.snap, height: document.querySelector(".oak-itinerary-sheet")!.getBoundingClientRect().height }));
  await info.attach("fresh-readiness-evidence", { body: JSON.stringify({ before, after }, null, 2), contentType: "application/json" });
  expect(after.ready, JSON.stringify({ before, after })).toBe(true);
  expect(after.attribute).toBe("true");
  expect(after.revision).toBeGreaterThan(before.revision);
  expect(after.readiness.requested).toBeGreaterThan(before.request);
  expect(after.readiness.observed).toBe(after.readiness.requested);
  expect(after.readiness.revision).toBe(after.revision);
  expect(after.readiness.stableFrames).toBeGreaterThanOrEqual(4);
  expect(after.expanded).toBe(true); expect(after.snap).toBe("expanded");
  expect(after.height).not.toBe(before.height);
});

for (const { viewport, expanded } of [
  { viewport: { width: 390, height: 844 }, expanded: false },
  { viewport: { width: 320, height: 568 }, expanded: false },
  { viewport: { width: 390, height: 844 }, expanded: true },
]) test(`return to already selected current owner reveals its control and start time at ${viewport.width} ${expanded ? "expanded" : "half"}`, async ({ page }, info) => {
  const item = variants.find(item => item.visualCase.id === "experience-default")!;
  await openCase(page, item.visualCase, item.variant);
  if (viewport.width !== 390) {
    await page.setViewportSize(viewport);
    await settle(page);
  }
  if (expanded) {
    await page.getByRole("button", { name: "展開行程", exact: true }).click();
    await settle(page);
  }
  const control = page.getByRole("button", { name: "返回目前行程", exact: true });
  const port = page.locator(".oak-sheet-scroll");
  const evidence = () => page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>(".oak-sheet-scroll")!;
    const selected = document.querySelector<HTMLElement>('[data-owner-id="node-sightseeing"] .oak-row-selection')!;
    const time = selected.querySelector<HTMLElement>(".oak-row-time")!;
    const text = time.firstChild!;
    const start = document.createRange(); start.setStart(text, 0); start.setEnd(text, 5);
    const rect = (element: Element | Range) => { const box = element.getBoundingClientRect(); return { top: box.top, bottom: box.bottom, left: box.left, right: box.right }; };
    const bounds = scroll.getBoundingClientRect();
    const model = window.oak!.probe.experience!.model;
    return {
      clip: { top: bounds.top + scroll.clientTop, bottom: bounds.top + scroll.clientTop + scroll.clientHeight },
      scrollTop: scroll.scrollTop,
      control: rect(selected), start: rect(start), startText: text.textContent?.slice(0, 5),
      selected: model.owners.selectedId, current: model.owners.currentId,
      pressed: selected.getAttribute("aria-pressed"), snap: model.sheet.snap,
      camera: model.map.cameraIntent, cameraIds: window.oak!.providers.map.cameras.map(camera => camera.intentId),
      mapMounted: window.oak!.providers.map.mounted,
      activeIsReturn: document.activeElement?.getAttribute("aria-label") === "返回目前行程",
    };
  });
  const initial = await evidence();
  expect(initial.selected).toBe("node-sightseeing");
  expect(initial.current).toBe("node-sightseeing");
  expect(initial.startText).toBe("14:00");
  expect(initial.pressed).toBe("true");
  expect(await control.count()).toBe(1);
  const map = await page.locator("[data-fake-map]").elementHandle();
  const point = await port.evaluate(element => { const box = element.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; });
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, -2000);
  await expect.poll(async () => (await evidence()).scrollTop).toBe(0);
  const away = await evidence();
  expect(away.start.top).toBeGreaterThan(away.clip.bottom);
  await control.click();
  await settle(page);
  const immediatelyAfter = await evidence();
  await info.attach("repeated-return-owner-geometry", { body: JSON.stringify({ initial, away, immediatelyAfter }, null, 2), contentType: "application/json" });
  await expect.poll(async () => {
    const current = await evidence();
    return current.control.top >= current.clip.top - 1 && current.control.bottom <= current.clip.bottom + 1
      && current.start.top >= current.clip.top - 1 && current.start.bottom <= current.clip.bottom + 1;
  }, { timeout: 5000 }).toBe(true);
  const returned = await evidence();
  await info.attach("repeated-return-owner-settled", { body: JSON.stringify(returned, null, 2), contentType: "application/json" });
  expect(returned.selected).toBe("node-sightseeing");
  expect(returned.current).toBe("node-sightseeing");
  expect(returned.pressed).toBe("true");
  expect(returned.startText).toBe("14:00");
  expect(returned.activeIsReturn).toBe(true);
  expect(returned.snap).toBe("half");
  expect(returned.camera?.kind).toBe("focus");
  expect(returned.camera?.intentId).not.toBe(initial.camera?.intentId);
  expect(new Set(returned.cameraIds.slice(initial.cameraIds.length))).toEqual(new Set([returned.camera?.intentId]));
  expect(returned.mapMounted).toBe(true);
  expect(await map?.evaluate(element => element === document.querySelector("[data-fake-map]"))).toBe(true);
  if (viewport.width === 390 && !expanded) {
    const screenshot = info.outputPath("repeated-return-current-owner.png");
    await page.screenshot({ path: screenshot });
    await info.attach("repeated-return-current-owner", { path: screenshot, contentType: "image/png" });
  }
});

for (const { visualCase, variant, name } of variants) test(`axe ${name}`, async ({ page }, info) => {
  await openCase(page, visualCase, variant);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  if (result.violations.length || (visualCase.id === "candidate-open" && ["confirmed", "cancelled"].includes(variant.id))) {
    const evidence = await page.evaluate(() => {
      const selectors = ['[data-owner-id="node-dining"] .oak-row-action', '[aria-label="返回目前行程"]', '.oak-sheet-heading', '.oak-sheet-scroll', '.oak-itinerary-sheet', '.oak-upper-clearance'];
      const describe = (element: Element | null) => { if (!element) return null; const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return { tag: element.tagName, className: element.className, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, overflow: style.overflow, position: style.position }; };
      return { elements: Object.fromEntries(selectors.map(selector => [selector, describe(document.querySelector(selector))])), active: describe(document.activeElement), activeText: document.activeElement?.textContent, model: window.oak!.probe.experience?.model, animations: document.getAnimations().map(animation => animation.playState) };
    });
    await info.attach("axe-geometry-evidence", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
    if (result.violations.length) await page.screenshot({ path: `tmp/playwright/oak-washi/candidates/axe-failure-${name}.png` });
  }
  expect(result.violations).toEqual([]);
});

for (const action of ["取消", "確認"]) test(`candidate ${action} restores the disclosure trigger after public full-day restoration`, async ({ page }, info) => {
  const item = variants.find(item => item.visualCase.id === "candidate-open" && item.variant.id === "draft")!;
  await openCase(page, item.visualCase, item.variant);
  const trigger = page.getByRole("button", { name: "變更選擇", exact: true });
  const before = { connectedTriggerCount: await trigger.count(), open: await page.getByRole("dialog").count() };
  const marker = page.locator('.oak-marker[aria-label*="Synthetic meal B"]');
  await marker.focus(); await page.keyboard.press("Enter"); await settle(page);
  await expect(page.getByRole("dialog").locator('.oak-candidate-option[aria-pressed="true"]')).toBeFocused();
  const control = page.getByRole("dialog").getByRole("button", { name: action, exact: true });
  await control.focus(); await page.keyboard.press("Enter"); await settle(page);
  const evidence = await page.evaluate(() => ({ active: document.activeElement?.outerHTML, owner: document.activeElement?.closest("[data-owner-id]")?.getAttribute("data-owner-id"), selected: window.oak!.probe.experience!.model.owners.selectedId, candidate: window.oak!.probe.experience!.model.candidates[0], camera: window.oak!.probe.experience!.model.map.cameraIntent }));
  await info.attach("candidate-focus-evidence", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger, JSON.stringify({ before, activeOwner: evidence.owner, active: evidence.active?.slice(0, 180), selected: evidence.selected })).toBeFocused();
});

test("complete public keyboard journey and candidate focus restoration", async ({ page }) => {
  test.setTimeout(90_000);
  const home = variants.find(item => item.visualCase.id === "home")!;
  await openCase(page, home.visualCase, home.variant);
  const tabTo = async (target: import("@playwright/test").Locator) => {
    await expect(target).toHaveCount(1);
    for (let step = 0; step < 180; step++) {
      if (await target.evaluate(element => element === document.activeElement)) return;
      await page.keyboard.press("Tab");
    }
    throw new Error("Target was not reachable in the logical keyboard order");
  };
  const activate = async (target: import("@playwright/test").Locator) => { await tabTo(target); await page.keyboard.press("Enter"); await settle(page); };
  const press = async (name: string) => activate(page.getByRole("button", { name, exact: true }).first());
  await press("開啟行程");
  if (await page.getByRole("button", { name: "收合日期導覽", exact: true }).count()) await press("收合日期導覽");
  await press("展開日期導覽");
  await activate(page.getByRole("navigation").getByRole("button").nth(1));
  expect(await page.evaluate(() => window.oak!.probe.experience!.model.day.id)).toBe("day-synthetic-two");
  await activate(page.getByRole("navigation").getByRole("button").first());
  await activate(page.locator('[data-owner-id="node-sightseeing"] .oak-row-selection'));
  expect(await page.evaluate(() => window.oak!.probe.experience!.model.owners.selectedId)).toBe("node-sightseeing");
  await activate(page.locator('.oak-marker[aria-label*="Synthetic supply stop"]'));
  expect(await page.evaluate(() => window.oak!.probe.experience!.model.owners.selectedId)).toBe("node-shopping");
  if (await page.getByRole("button", { name: "展開行程", exact: true }).count()) await press("展開行程");
  await press("收合行程"); await press("展開行程");
  await activate(page.locator('[data-owner-id="node-dining"] .oak-row-selection'));
  const trigger = page.getByRole("button", { name: "變更選擇", exact: true }).first();
  await activate(trigger);
  const dialog = page.getByRole("dialog", { name: "比較候選項目" }); await expect(dialog).toBeVisible();
  await activate(dialog.getByRole("button", { name: /^預覽 ·/ }).last());
  await press("取消"); await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter"); await settle(page);
  await activate(dialog.getByRole("button", { name: /^預覽 ·/ }).last());
  await press("確認"); await expect(trigger).toBeFocused();
  await page.evaluate(() => window.oak!.providers.routes.setResolver(() => ({ status: "unavailable", reason: "network", retryable: true })));
  await activate(page.getByRole("navigation").getByRole("button").nth(1));
  await activate(page.getByRole("navigation").getByRole("button").first());
  await activate(page.locator('[data-owner-id="route-walking"] button').first());
  await expect(page.locator('[data-owner-id="route-walking"]')).toContainText("網路要求失敗");
  await activate(page.locator('[data-owner-id="node-sightseeing"] .oak-row-selection'));
  await activate(page.locator('[data-owner-id="node-sightseeing"] button[aria-label="開啟路線導航"]'));
  expect(await page.evaluate(() => window.oak!.providers.navigation.calls.length)).toBe(1);
});
