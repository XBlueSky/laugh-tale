import { writeFile } from "node:fs/promises";
import { test, expect, settle } from "../fixtures/oak-washi/browser/checks.js";

const caseUrl = "/?case=experience-default&variant=full-day";
const clear = "rgba(0, 0, 0, 0)";

test("final-wave map retry owns exactly one keyboard-operable attribution control", async ({ page }) => {
  await page.goto(caseUrl); await settle(page);
  const attribution = page.getByRole("button", { name: "Synthetic map attribution", exact: true });
  await expect(attribution).toHaveCount(1);
  await page.evaluate(() => window.oak!.providers.map.fake.fail({ status: "unavailable", reason: "network", retryable: true })); await settle(page);
  await page.locator(".oak-map-status").getByRole("button", { name: "重試", exact: true }).click(); await settle(page);
  await expect(attribution).toHaveCount(1);
  await attribution.focus(); await page.keyboard.press("Enter");
  await expect(attribution).toHaveAttribute("data-activated", "true");
});

test("final-wave Restore stays operable on a skipped row at narrow enlarged text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(caseUrl); await settle(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; window.oak!.probe.actions!.setSheetSnap("expanded"); }); await settle(page);
  const id = await page.evaluate(() => window.oak!.probe.experience!.model.capabilities.progress.skippableNodeIds[0]);
  await page.evaluate(id => window.oak!.probe.actions!.selectNode(id), id); await settle(page);
  const row = page.locator(`.oak-row[data-owner-id="${id}"]`);
  await row.getByRole("button", { name: "略過", exact: true }).click(); await settle(page);
  const restore = row.getByRole("button", { name: /^還原 · / });
  await restore.scrollIntoViewIfNeeded();
  for (let step = 0; step < 80 && !await restore.evaluate(element => element === document.activeElement); step++) await page.keyboard.press("Tab");
  await expect(restore).toBeFocused();
  const sample = await restore.evaluate(element => { const r = element.getBoundingClientRect(); const s = getComputedStyle(element); let opacity = 1; for (let parent: Element | null = element; parent; parent = parent.parentElement) opacity *= Number(getComputedStyle(parent).opacity); return { width: r.width, height: r.height, left: r.left, right: r.right, opacity, outline: s.outlineStyle }; });
  expect(sample.width).toBeGreaterThanOrEqual(44); expect(sample.height).toBeGreaterThanOrEqual(44); expect(sample.opacity).toBe(1); expect(sample.outline).not.toBe("none"); expect(sample.left).toBeGreaterThanOrEqual(0); expect(sample.right).toBeLessThanOrEqual(320);
  await page.screenshot({ path: "tmp/final-review-evidence/restore-320-200.png" });
  await page.keyboard.press("Enter"); await settle(page);
  expect(await page.evaluate(id => window.oak!.probe.experience!.model.progress.skippedNodeIds.includes(id), id)).toBe(false);
});

async function evidence(control: import("@playwright/test").Locator) {
  return control.evaluate(element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const icon = element.querySelector("svg")?.getBoundingClientRect();
    return {
      fill: style.backgroundColor, border: style.borderTopColor,
      borderWidth: style.borderTopWidth, radius: style.borderRadius,
      outline: style.outlineStyle, outlineWidth: style.outlineWidth,
      ink: style.color, enabled: !(element as HTMLButtonElement).disabled,
      name: element.getAttribute("aria-label"), width: rect.width, height: rect.height,
      icon: icon ? { width: icon.width, height: icon.height, stroke: element.querySelector("svg")?.getAttribute("stroke-width") } : null,
    };
  });
}

function expectTarget(sample: Awaited<ReturnType<typeof evidence>>) {
  expect(sample.width).toBeGreaterThanOrEqual(44);
  expect(sample.height).toBeGreaterThanOrEqual(44);
  expect(sample.borderWidth).toBe("1px");
  expect(sample.icon).toEqual({ width: 18, height: 18, stroke: "1.75" });
  expect(sample.name).toBeTruthy();
  expect(sample.enabled).toBe(true);
}

for (const width of [366, 390]) test(`inline controls rest quietly in a framed full day at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(caseUrl); await settle(page);
  await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("expanded")); await settle(page);
  const selected = page.locator('.oak-primary-row[data-owner-id="node-sightseeing"]');
  const adjacent = page.locator('.oak-primary-row[data-owner-id="node-shopping"]');
  await expect(selected).toHaveAttribute("data-selected", "true");
  await expect(adjacent).not.toHaveAttribute("data-selected", "true");
  await selected.locator(".oak-primary-summary").scrollIntoViewIfNeeded(); await settle(page);
  const port = page.locator(".oak-sheet-scroll");
  const point = await port.evaluate(element => { const r = element.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(point.x, point.y); await page.mouse.wheel(0, -100); await settle(page);
  const current = selected.locator(".oak-row-action");
  const next = adjacent.locator(".oak-row-action");
  const returnCurrent = page.locator('.oak-sheet-actions > .oak-control[aria-label="返回目前行程"]');
  const visibility = await page.evaluate(() => {
    const port = document.querySelector(".oak-sheet-scroll")!.getBoundingClientRect();
    return ["node-sightseeing", "node-shopping"].map(id => {
      const row = document.querySelector(`.oak-primary-row[data-owner-id="${id}"]`)!;
      const box = row.getBoundingClientRect();
      const action = row.querySelector(".oak-row-action")!.getBoundingClientRect();
      return { id, visibleHeight: Math.max(0, Math.min(box.bottom, port.bottom) - Math.max(box.top, port.top)), actionInsideClip: action.top >= port.top && action.bottom <= port.bottom && action.left >= port.left && action.right <= port.right, selected: row.getAttribute("data-selected"), top: box.top, bottom: box.bottom };
    });
  });
  const phase = process.env.OAK_INLINE_CAPTURE_PHASE;
  if (phase === "before" || phase === "after") {
    const root = ".superpowers/sdd/2026-09-04-eternal-pose-v2-04-oak-washi";
    await page.screenshot({ path: `${root}/task-8-batch6-${phase}-${width}.png` });
    await writeFile(`${root}/task-8-batch6-${phase}-${width}.json`, JSON.stringify({ width, visibility, selected: await evidence(current), adjacent: await evidence(next), returnCurrent: await evidence(returnCurrent), model: await page.evaluate(() => ({ selected: window.oak!.probe.experience!.model.owners.selectedId, current: window.oak!.probe.experience!.model.owners.currentId, snap: window.oak!.probe.experience!.model.sheet.snap })) }, null, 2));
  }
  expect(visibility.every(row => row.visibleHeight > 0), JSON.stringify(visibility)).toBe(true);
  for (const control of [current, next, returnCurrent]) {
    await expect(control).toHaveCount(1);
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport({ ratio: 1 });
    const sample = await evidence(control);
    expectTarget(sample);
    expect(sample.fill).toBe(clear);
    expect(sample.border).toBe(clear);
  }
});

test("inline vocabulary preserves actions, capability gates, and opaque siblings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(caseUrl); await settle(page);
  const model = await page.evaluate(() => window.oak!.probe.experience!.model);
  expect(model.capabilities.navigationOwnerIds).toContain("node-sightseeing");
  expect(model.capabilities.navigationOwnerIds).toContain("node-shopping");
  const current = page.locator('.oak-primary-row[data-owner-id="node-sightseeing"] .oak-row-action');
  await expect(current).toHaveAccessibleName("開啟路線導航");
  await current.click(); await settle(page);
  expect(await page.evaluate(() => window.oak!.providers.navigation.calls)).toEqual([{ kind: "place", destination: { kind: "coordinates", label: "Neutral Overlook", coordinates: { lat: 10.03, lng: 20.03 } } }]);
  const map = await evidence(page.locator(".oak-map-controls > .oak-control").first());
  expect(map.fill).not.toBe(clear); expect(map.border).not.toBe(clear);
  await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("expanded")); await settle(page);
  const detail = await evidence(page.locator('.oak-owner-details[data-details-owner="node-sightseeing"] .oak-control').first());
  expect(detail.fill).not.toBe(clear); expect(detail.border).not.toBe(clear);
  await page.goto("/?case=selection-truth&variant=selected-unresolved"); await settle(page);
  const unresolved = page.locator('.oak-primary-row[data-owner-id="node-unresolved"]');
  await expect(unresolved).toHaveAttribute("data-unresolved", "true");
  expect(await page.evaluate(() => window.oak!.probe.experience!.model.capabilities.navigationOwnerIds.includes("node-unresolved"))).toBe(false);
  await expect(unresolved.locator(".oak-row-action")).toHaveCount(0);
  await page.goto("/?case=experience-collapsed-current&variant=current-next"); await settle(page);
  await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("collapsed")); await settle(page);
  const collapsed = page.locator(".oak-collapsed-summary .oak-row-action");
  await expect(collapsed).toHaveCount(1);
  expect((await evidence(collapsed)).fill).toBe(clear);
  await page.goto("/?case=home&variant=zero-mobile"); await settle(page);
  const home = await evidence(page.locator(".oak-home-entry .oak-control").first());
  expect(home.fill).not.toBe(clear); expect(home.border).not.toBe(clear);
  await page.goto("/?case=candidate-open&variant=open"); await settle(page);
  await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("expanded")); await settle(page);
  await page.evaluate(() => window.oak!.probe.actions!.selectNode("node-dining")); await settle(page);
  await page.evaluate(() => window.oak!.probe.actions!.reopenCandidate("candidate-meal")); await settle(page);
  await expect(page.getByRole("dialog", { name: "比較候選項目" })).toBeVisible();
  const candidate = await evidence(page.locator(".oak-candidate-dialog .oak-control").first());
  expect(candidate.fill).not.toBe(clear); expect(candidate.border).not.toBe(clear);
  await page.goto("/?case=route-state-matrix&variant=retry"); await settle(page);
  await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("expanded")); await settle(page);
  await page.evaluate(() => window.oak!.probe.actions!.selectRoute("route-walking", "list")); await settle(page);
  const retry = await evidence(page.locator('[data-owner-id="route-walking"] .oak-inline-state .oak-control'));
  expect(retry.fill).not.toBe(clear); expect(retry.border).not.toBe(clear);
});

test("inline hover, keyboard focus, press, and forced colors remain perceivable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(caseUrl); await settle(page);
  const row = page.locator('.oak-primary-row[data-owner-id="node-sightseeing"] .oak-row-action');
  const sheet = page.locator('.oak-sheet-actions > .oak-control[aria-label="返回目前行程"]');
  for (const control of [row, sheet]) {
    await control.hover();
    expect((await evidence(control)).fill).toBe("rgb(242, 237, 228)");
    await page.mouse.down();
    expect((await evidence(control)).fill).toBe("rgb(242, 227, 217)");
    await page.mouse.up();
    await page.mouse.move(0, 0);
    await page.keyboard.press("Tab"); await control.focus();
    await expect(control).toBeFocused();
    const focused = await evidence(control);
    expect(focused.outline).toBe("solid"); expect(focused.outlineWidth).toBe("3px");
    expect(focused.fill).toBe("rgb(242, 237, 228)");
  }
  await page.emulateMedia({ forcedColors: "active" });
  for (const control of [row, sheet]) {
    await page.keyboard.press("Tab"); await control.focus();
    const sample = await evidence(control);
    expect(sample.border).not.toBe(clear);
    expect(sample.fill).not.toBe(clear);
    expect(sample.outlineWidth).toBe("3px");
    expectTarget(sample);
  }
});

for (const width of [320, 430, 1024]) test(`inline targets survive ${width}px and enlarged text`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(caseUrl); await settle(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; window.oak!.probe.actions!.setSheetSnap("expanded"); }); await settle(page);
  for (const control of [page.locator('.oak-primary-row[data-owner-id="node-sightseeing"] .oak-row-action'), page.locator(".oak-sheet-actions > .oak-control").first()]) {
    const sample = await evidence(control);
    expectTarget(sample); expect(sample.fill).toBe(clear); expect(sample.border).toBe(clear);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
});
