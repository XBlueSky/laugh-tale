import { test as base, expect, type Page } from "@playwright/test";
import { oakWashiVisualCases } from "../../../../packages/testing/src/fixtures/oak-washi-visual-cases.js";
import type { VisualCase, VisualVariant } from "../visual-trip.js";
import type { ExperienceModel } from "@laugh-tale-island/react";
import type { OakHarness } from "./OakWashiHarness.js";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

export default class NoSkippedTests implements Reporter {
  private skipped = 0;
  onTestEnd(_test: TestCase, result: TestResult) { if (result.status === "skipped") this.skipped++; }
  onEnd(): Promise<{ status: "failed" } | void> { return Promise.resolve(process.env.CI && this.skipped ? { status: "failed" } : undefined); }
}

export const test = base.extend<{ errors: string[] }>({
  errors: [async ({ page, browser }, use) => {
    expect(browser.version()).toBe("151.0.7922.34");
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`page: ${error.message}`));
    page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== "http://127.0.0.1:4176") { errors.push(`unexpected request: ${url.href}`); await route.abort(); }
      else await route.continue();
    });
    await use(errors);
    expect(errors, "no console/page errors or requests outside exact harness origin").toEqual([]);
  }, { auto: true }],
});
export { expect };
export const variants = oakWashiVisualCases.flatMap(visualCase => visualCase.variants.map(variant => ({ visualCase, variant, name: `${visualCase.id}-${variant.viewport.width}x${variant.viewport.height}-${variant.id}` })));
export async function settle(page: Page) {
  await page.waitForFunction(() => window.oak !== undefined);
  const requested = await page.evaluate(() => ++window.oak!.readiness.requested);
  await page.waitForFunction(requested => {
    const harness = window.oak;
    return harness?.ready && document.documentElement.dataset.oakReady === "true"
      && harness.readiness.observed >= requested
      && harness.readiness.observed === harness.readiness.requested
      && harness.readiness.revision === harness.probe.revision
      && harness.readiness.stableFrames >= 4;
  }, requested);
}
export async function experience(page: Page): Promise<ExperienceModel> {
  return page.evaluate(() => { const model = window.oak?.probe.experience?.model; if (!model) throw new Error("Expected real Experience model"); return model; });
}

// Only these named captures need an owner pose. This is screenshot composition,
// not evidence that public selection or camera actions auto-reveal list content.
export function captureOwner(visualCase: VisualCase, variant: VisualVariant) {
  if (["route-state-matrix", "camera-adversarial"].includes(visualCase.id) || (visualCase.id === "loading-owned" && variant.id === "route")) return { id: "route-walking", target: ".oak-route-selection" };
  if (visualCase.id === "opening-hours-matrix" || (visualCase.id === "loading-owned" && variant.id === "place")) return { id: "node-transfer", target: ".oak-place-details" };
  if (visualCase.id === "runtime-degraded" && variant.mode === "experience") return { id: "global-notice", target: ":scope > [role=status]" };
  return null;
}

export async function frameCaptureOwner(page: Page, visualCase: VisualCase, variant: VisualVariant) {
  const capture = captureOwner(visualCase, variant);
  if (!capture || capture.id === "global-notice") return;
  const before = await experience(page);
  const owner = page.locator(`.oak-row[data-owner-id="${capture.id}"]`);
  // Route rows fit this normal-text scrollport. For node details, frame the
  // actual place state rather than assuming the entire owner always fits.
  await (capture.id === "route-walking" || before.sheet.snap !== "expanded" ? owner : owner.locator(capture.target)).scrollIntoViewIfNeeded();
  await settle(page);
  const after = await experience(page);
  expect(after.owners, "native capture scrolling preserves semantic owners").toEqual(before.owners);
  expect(after.map.cameraIntent, "native capture scrolling preserves camera intent").toEqual(before.map.cameraIntent);
  expect(after.sheet.snap).toBe(before.sheet.snap);
}

export async function assertCaptureOwner(page: Page, visualCase: VisualCase, variant: VisualVariant, retried = false) {
  const capture = captureOwner(visualCase, variant);
  if (!capture) return null;
  const owner = page.locator(capture.id === "global-notice" ? ".oak-global-notices" : `.oak-row[data-owner-id="${capture.id}"]`);
  if (capture.id !== "global-notice" && (await experience(page)).sheet.snap !== "expanded") {
    await expect(owner.locator(capture.id === "route-walking" ? ".oak-route-details" : capture.target), "half-sheet keeps secondary details out of the scan view").toHaveCount(0);
    const selection = owner.locator(capture.id === "route-walking" ? ".oak-route-selection" : ".oak-row-selection");
    await expect(selection).toBeVisible();
    await expect(selection).toHaveAttribute("aria-pressed", "true");
    return [{ text: await selection.textContent(), compact: true }];
  }
  const state = variant.id;
  const targets = [owner.locator(capture.target)];
  if (capture.id === "route-walking") {
    targets.unshift(owner);
    const ready = retried || ["walking", "transit", "driving"].includes(state);
    const mode = ({ transit: "大眾運輸", driving: "開車", flight: "航班", unknown: "未指定移動方式" } as Record<string, string>)[state] ?? "步行";
    await expect(owner.locator(".oak-route-facts").getByText(mode, { exact: true })).toHaveCount(1);
    await expect(owner.locator(".oak-route-facts")).toHaveAttribute("data-route-state", ready ? "ready" : ["flight", "unknown"].includes(state) ? "idle" : state === "loading" || state === "route" ? "loading" : "unavailable");
    await expect(owner.locator(".oak-route-selection")).toHaveAttribute("aria-pressed", "true");
    if (ready) {
      targets.push(owner.getByText("12 分鐘", { exact: true }), owner.getByText("Follow the synthetic path", { exact: true }));
      if (state === "transit") targets.push(owner.getByText("Synthetic line S1", { exact: true }));
    } else {
      if (["flight", "unknown"].includes(state)) {
        await expect(owner.locator("[data-provider-state]")).toHaveCount(0);
        await expect(owner.locator(".oak-route-details .oak-route-evidence")).toBeVisible();
        await expect(owner.getByText("路線 · 尚未開始", { exact: true })).toHaveCount(0);
        if (state === "unknown") targets.push(owner.getByText("未指定移動方式", { exact: true }));
      } else {
        const text = state === "loading" || state === "route" ? "路線 · 載入中" : ["implausible-duration", "remote-point"].includes(state) ? "路線 · 無法使用 · 服務提供者傳回不合理的結果" : "路線 · 無法使用 · 網路要求失敗";
        targets.push(owner.getByText(text, { exact: true }));
      }
      if (state === "authored-fallback") {
        targets.push(owner.getByText("12 分鐘", { exact: true }), owner.locator(".oak-route-evidence"));
        await expect(owner.locator(".oak-route-evidence")).toContainText("使用旅程原有路線資訊");
      }
      if (state === "external") targets.push(owner.getByRole("button", { name: "開啟外部導航", exact: true }));
      if (state === "retry") targets.push(owner.getByRole("button", { name: "重試", exact: true }));
    }
  } else if (capture.id === "node-transfer") {
    const expected = ({ "known-open": "目前營業", "known-closed": "目前休息", absent: "未提供營業時間", incomplete: "營業時間不完整", overnight: "目前營業", "cross-midnight": "目前營業", "trip-timezone": "目前休息", place: "地點 · 載入中" } as Record<string, string>)[state];
    targets.push(owner.getByText(expected, { exact: true }));
  } else {
    const expected = ({ "memory-only": "關閉此頁面後，變更將會遺失。", "location-denied": "定位權限遭拒", "location-unavailable": "無法取得位置" } as Record<string, string>)[state];
    await expect(targets[0]).toHaveText(expected);
  }
  const evidence = [];
  for (const target of targets) {
    await expect(target).toBeVisible();
    const geometry = await target.evaluate(element => {
      const port = element.closest(".oak-sheet-scroll, .oak-upper-clearance") as HTMLElement;
      const owner = element.closest(".oak-row[data-owner-id], .oak-global-notices") ?? port;
      const box = (element: Element) => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      const p = port.getBoundingClientRect();
      return { text: element.textContent, target: box(element), owner: box(owner), clip: { left: Math.max(0, p.left + port.clientLeft), top: Math.max(0, p.top + port.clientTop), right: Math.min(innerWidth, p.left + port.clientLeft + port.clientWidth), bottom: Math.min(innerHeight, p.top + port.clientTop + port.clientHeight) } };
    });
    const message = `${visualCase.id}/${state}: actual state target must fit its scrollport ${JSON.stringify(geometry)}`;
    // Subpixel rounding can leave less than one CSS pixel at a scrollport edge
    // after native scrollIntoViewIfNeeded. Larger clipping still fails.
    expect(geometry.target.top, message).toBeGreaterThanOrEqual(geometry.clip.top - 1);
    expect(geometry.target.bottom, message).toBeLessThanOrEqual(geometry.clip.bottom + 1);
    expect(geometry.target.left, message).toBeGreaterThanOrEqual(geometry.clip.left - 1);
    expect(geometry.target.right, message).toBeLessThanOrEqual(geometry.clip.right + 1);
    expect(geometry.owner.bottom, message).toBeGreaterThan(geometry.clip.top);
    expect(geometry.owner.top, message).toBeLessThan(geometry.clip.bottom);
    evidence.push(geometry);
  }
  return evidence;
}
export async function openCase(page: Page, visualCase: VisualCase, variant: VisualVariant) {
  await page.setViewportSize(variant.viewport);
  await page.emulateMedia({ forcedColors: variant.scenario.media === "forced-colors" ? "active" : "none", reducedMotion: "reduce", colorScheme: "light" });
  await page.goto(`/?case=${visualCase.id}&variant=${variant.id}`);
  await settle(page);
  if (variant.mode === "experience") {
    await page.evaluate(({ visualCase, variant }) => {
      const harness = window.oak!; const actions = harness.probe.actions!;
      actions.setSheetSnap(variant.scenario.sheet); actions.setHeaderExpanded(variant.scenario.header);
      const state = variant.scenario.state;
      if (["candidate-open", "candidate-zoom-200"].includes(visualCase.id)) { actions.setSheetSnap("expanded"); actions.selectNode("node-dining"); actions.reopenCandidate("candidate-meal"); }
      if (visualCase.id === "selection-truth") {
        actions.updateProgress({ kind: "node-skipped", nodeId: "node-shopping", skipped: true });
        actions.updateProgress({ kind: "shopping-status", itemId: "shopping-journal", status: "purchased" });
        actions.updateProgress({ kind: "completion", id: "node:node-experience", completed: true });
        actions.selectNode(state === "selected-unresolved" ? "node-unresolved" : "node-sightseeing");
      }
      if (["route-state-matrix", "camera-adversarial"].includes(visualCase.id) || (visualCase.id === "loading-owned" && state === "route")) actions.selectRoute("route-walking", "list");
      if (visualCase.id === "opening-hours-matrix" || (visualCase.id === "loading-owned" && state === "place")) actions.selectNode("node-transfer");
      if (visualCase.id === "map-error" || state === "selected-error") harness.providers.map.fake.fail({ status: "unavailable", reason: "network", retryable: true });
      if (state === "selected-error" || state === "forced-colors") actions.selectNode("node-sightseeing");
      if (state.startsWith("location-") || visualCase.id === "marker-backends") actions.beginLocation();
    }, { visualCase, variant });
    await settle(page);
    if (visualCase.id === "candidate-open" && variant.id !== "open") {
      await page.evaluate(() => window.oak!.probe.actions!.previewCandidate("candidate-meal", "candidate-meal-b"));
      await settle(page);
      if (variant.id === "confirmed" || variant.id === "cancelled") {
        await page.evaluate(confirmed => { const actions = window.oak!.probe.actions!; if (confirmed) actions.confirmCandidate("candidate-meal"); else actions.cancelCandidate("candidate-meal"); }, variant.id === "confirmed");
        await settle(page);
      }
    }
    if (variant.id === "keyboard-focus") { await page.keyboard.press("Tab"); }
    await frameCaptureOwner(page, visualCase, variant);
  }
  await expect(page.locator("html")).toHaveAttribute("data-oak-ready", "true");
  expect(await page.evaluate(() => document.fonts.check("16px system-ui"))).toBe(true);
  const duplicates = await page.locator("[id]").evaluateAll(elements => elements.map(element => element.id).filter((id, index, all) => all.indexOf(id) !== index));
  expect(duplicates).toEqual([]);
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
}

export async function commonGeometry(page: Page, variant: VisualVariant) {
  const geometry = await page.evaluate(() => {
    const rect = (selector: string) => { const element = document.querySelector<HTMLElement>(selector); if (!element) return null; const value = element.getBoundingClientRect(); return { top: value.top, left: value.left, right: value.right, bottom: value.bottom, width: value.width, height: value.height }; };
    return { pageWidth: document.documentElement.scrollWidth, pageHeight: document.documentElement.scrollHeight, viewportWidth: innerWidth, viewportHeight: innerHeight, map: rect("[data-fake-map]"), legal: rect("[data-fake-legal]"), sheet: rect(".oak-itinerary-sheet"), upper: rect(".oak-upper-clearance"), header: rect(".oak-header-content"), controls: rect(".oak-controls-row"), crowded: document.querySelector<HTMLElement>(".oak-experience")?.dataset.chromeScroll === "true", status: rect(".oak-map-status"), collapsed: rect(".oak-geometry-collapsed"), half: rect(".oak-geometry-half"), gap: Number.parseFloat(getComputedStyle(document.querySelector(".oak-experience") ?? document.documentElement).getPropertyValue("--oak-clearance-gap")) };
  });
  expect(geometry.pageWidth).toBe(variant.viewport.width);
  if (variant.mode !== "experience") return;
  expect(geometry.pageHeight).toBe(variant.viewport.height);
  expect(geometry.sheet).not.toBeNull();
  const model = await experience(page);
  expect(model.sheet.snap).toBe(variant.scenario.sheet === "half" && ["open", "draft", "confirmed", "cancelled"].includes(variant.id) ? "expanded" : variant.scenario.sheet);
  expect(geometry.sheet!.bottom).toBeCloseTo(variant.viewport.height - Math.max(44, 44 * variant.scenario.textScale) - variant.scenario.safeArea[2], 1);
  expect(geometry.sheet!.width).toBeCloseTo(Math.min(variant.viewport.width, variant.viewport.width >= 720 ? 672 * variant.scenario.textScale : variant.viewport.width), 1);
  expect(geometry.sheet!.left).toBeGreaterThanOrEqual(0);
  expect(geometry.sheet!.right).toBeLessThanOrEqual(variant.viewport.width);
  expect(geometry.sheet!.top).toBeGreaterThanOrEqual(geometry.upper!.bottom - 1);
  if (geometry.status?.height) expect(geometry.sheet!.top).toBeGreaterThanOrEqual(geometry.status.bottom - 1);
  if (geometry.map) expect(geometry.map).toEqual({ top: 0, left: 0, right: variant.viewport.width, bottom: variant.viewport.height, width: variant.viewport.width, height: variant.viewport.height });
  if (geometry.legal) expect(geometry.sheet!.bottom).toBeLessThanOrEqual(geometry.legal.top);
  expect(model.sheet.geometry).not.toBeNull();
  const snap = model.sheet.geometry!;
  expect(geometry.sheet!.height).toBeCloseTo(snap[model.sheet.snap], 0);
  expect(model.map.layout?.viewport.width).toBe(variant.viewport.width);
  const layout = model.map.layout!;
  expect(layout.viewport.height).toBe(variant.viewport.height);
  const region = layout.usableRegion;
  expect(region.x).toBeGreaterThanOrEqual(0); expect(region.y).toBeGreaterThanOrEqual(0);
  expect(region.width).toBeGreaterThan(0); expect(region.height).toBeGreaterThan(0);
  expect(region.x + region.width).toBeLessThanOrEqual(variant.viewport.width);
  expect(region.y + region.height).toBeLessThanOrEqual(variant.viewport.height);
  const occlusions = [geometry.sheet, geometry.status, ...(geometry.crowded ? [geometry.upper] : [geometry.header, geometry.controls])];
  for (const occlusion of occlusions) {
    if (!occlusion || occlusion.height === 0) continue;
    const overlapWidth = Math.min(region.x + region.width, occlusion.right) - Math.max(region.x, occlusion.left);
    const overlapHeight = Math.min(region.y + region.height, occlusion.bottom) - Math.max(region.y, occlusion.top);
    expect(overlapWidth <= 0.01 || overlapHeight <= 0.01, "camera usable region excludes each measured occlusion").toBe(true);
  }
  if (model.map.cameraIntent) {
    expect(model.map.cameraIntent.viewport).toEqual(layout.viewport);
    expect(model.map.cameraIntent.usableRegion).toEqual(region);
    expect(model.map.cameraIntent.transition).toBe("immediate");
  }
}
export async function probe(page: Page) { return page.evaluate(() => (window.oak as OakHarness).snapshot()); }

export async function fontEvidence(page: Page) {
  await page.locator(".oak-washi h1, .oak-washi h2, .oak-washi p, .oak-washi span").evaluateAll(elements => {
    const target = elements.find(element => element.getClientRects().length > 0 && Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && /[\u3400-\u9fff]/.test(node.textContent ?? "")));
    if (!target) throw new Error("No authored CJK text exists for actual-font inspection");
    target.setAttribute("data-font-probe", "true");
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-font-probe=true]" });
  const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
  await cdp.detach();
  expect(fonts.some(font => font.postScriptName === "Huninn-Regular" && font.glyphCount > 0 && font.isCustomFont), `Real CJK glyphs must render from the bundled Huninn font: ${JSON.stringify(fonts)}`).toBe(true);
  expect(fonts.every(font => !font.isCustomFont || font.postScriptName === "Huninn-Regular")).toBe(true);
  return fonts;
}
