import { test, expect, variants, openCase, commonGeometry, settle } from "../fixtures/oak-washi/browser/checks.js";
import { writeFile } from "node:fs/promises";
import type { TestInfo } from "@playwright/test";

for (const [width, height] of [[224, 844], [320, 300]] as const) {
  test(`shared-body reading stays anchored when preceding heading grows at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
    await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("expanded")); await settle(page);
    const body = page.locator(".oak-sheet-body");
    expect(await body.evaluate(element => getComputedStyle(element).overflowY)).toBe("auto");
    const title = page.locator('[data-owner-id="node-logistics"] .oak-row-title');
    await title.evaluate(element => element.scrollIntoView({ block: "center" })); await settle(page);
    const heading = page.locator(".oak-sheet-heading");
    const headingHeight = await heading.evaluate(element => element.getBoundingClientRect().height);
    expect(await body.evaluate(element => element.scrollTop)).toBeGreaterThan(headingHeight);
    await expect(title).toBeInViewport();
    const before = await title.evaluate(element => element.getBoundingClientRect().top);
    // A late font/reflow can increase preceding chrome after reading begins.
    // The shared body, unlike the independent timeline port, keeps its native
    // anchor so the same authored title remains at the same reading position.
    await heading.evaluate((element, height) => { (element as HTMLElement).style.minHeight = `${height + 64}px`; }, headingHeight);
    await settle(page);
    await expect.poll(async () => Math.abs(await title.evaluate(element => element.getBoundingClientRect().top) - before)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

// Catch clipped state copy/actions, lost capability gates, and notices covering
// the live itinerary or legal map target at narrow/enlarged-text viewports.
for (const width of [320, 390]) for (const enlarged of [false, true]) {
  test(`degraded loading setup fatal surfaces reflow at ${width} ${enlarged ? "200 percent forced colors" : "normal"}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ forcedColors: enlarged ? "active" : "none" });
    for (const state of [
      { url: "loading-owned&variant=startup", selector: '[data-state="loading"]', role: "status" as const, buttons: 0 },
      { url: "setup-states&variant=missing-content", selector: '[data-state="setup-required"]', role: null, buttons: 0 },
      { url: "runtime-degraded&variant=fatal", selector: '[data-state="fatal-error"]', role: "alert" as const, buttons: 1 },
    ]) {
      await page.goto(`/?case=${state.url}`); await settle(page);
      if (enlarged) { await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; }); await settle(page); }
      const surface = page.locator(state.selector);
      await expect(surface.getByRole("heading", { level: 1 })).toBeVisible();
      if (state.role) await expect(surface.getByRole(state.role)).toBeVisible();
      await expect(surface.getByRole("button")).toHaveCount(state.buttons);
      const geometry = await surface.evaluate(element => {
        const range = document.createRange(); range.selectNodeContents(element);
        return { viewport: innerWidth, overflow: document.documentElement.scrollWidth, text: [...range.getClientRects()].map(r => ({ left: r.left, right: r.right })), targets: [...element.querySelectorAll("button")].map(button => { const r = button.getBoundingClientRect(); return { width: r.width, height: r.height }; }) };
      });
      expect(geometry.overflow).toBe(geometry.viewport);
      expect(geometry.text.every(r => r.left >= -1 && r.right <= width + 1)).toBe(true);
      expect(geometry.targets.every(r => r.width >= 44 && r.height >= 44)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${state.selector.match(/"([^"]+)"/)![1]}.png`) });
      if (state.buttons) {
        const action = surface.getByRole("button"); await action.focus();
        expect(await action.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
        await page.keyboard.press("Enter"); await settle(page);
        await expect(page.locator(".oak-home")).toBeVisible();
      }
    }
  });

  test(`degraded provider retry preserves itinerary and attribution at ${width} ${enlarged ? "200 percent forced colors" : "normal"}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ forcedColors: enlarged ? "active" : "none" });
    for (const retryable of [false, true]) {
      await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
      if (enlarged) { await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; }); await settle(page); }
      await page.evaluate(retryable => window.oak!.providers.map.fake.fail({ status: "unavailable", reason: "network", retryable }), retryable); await settle(page);
      const status = page.locator('.oak-map-status [data-provider-state="unavailable"]');
      await expect(status.getByRole("status")).toContainText("網路要求失敗");
      await expect(status.getByRole("button")).toHaveCount(retryable ? 1 : 0);
      for (const snap of ["collapsed", "half", "expanded"] as const) {
        await page.evaluate(snap => window.oak!.probe.actions!.setSheetSnap(snap), snap); await settle(page);
        await expect(page.locator(".oak-itinerary-sheet")).toBeVisible();
        // A failed adapter is disposed with its legal control. Attribution is
        // checked below after retry remounts the real adapter placement host.
        await expect(page.locator("[data-fake-legal]")).toHaveCount(0);
        if (snap !== "collapsed") {
          const row = page.locator('.oak-primary-row .oak-row-title').first();
          await row.scrollIntoViewIfNeeded(); await expect(row).toBeInViewport();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        await status.scrollIntoViewIfNeeded();
        const host = page.locator(".oak-map-status");
        const clearance = await host.evaluate(element => ({
          bottom: element.getBoundingClientRect().bottom,
          sheetTop: document.querySelector(".oak-itinerary-sheet")!.getBoundingClientRect().top,
        }));
        expect(clearance.bottom, `${width}px ${snap}: status host must not cover the itinerary`).toBeLessThanOrEqual(clearance.sheetTop + 1);
        const message = status.getByRole("status");
        const lineCount = await message.evaluate(element => {
          const range = document.createRange(); range.selectNodeContents(element);
          return range.getClientRects().length;
        });
        expect(lineCount).toBeGreaterThan(0);
        for (let line = 0; line < lineCount; line++) {
          const lineFits = () => message.evaluate((element, index) => {
            const port = element.closest<HTMLElement>(".oak-map-status")!;
            const bounds = port.getBoundingClientRect();
            const range = document.createRange(); range.selectNodeContents(element);
            const r = range.getClientRects()[index];
            const left = Math.max(0, bounds.left + port.clientLeft);
            const right = Math.min(innerWidth, bounds.left + port.clientLeft + port.clientWidth);
            const top = Math.max(0, bounds.top + port.clientTop);
            const bottom = Math.min(innerHeight, bounds.top + port.clientTop + port.clientHeight);
            return { horizontal: r.left >= left - 1 && r.right <= right + 1, vertical: r.top >= top - 1 && r.bottom <= bottom + 1 };
          }, line);
          expect((await lineFits()).horizontal, `${width}px ${snap}: status line ${line + 1} must fit its scrollport width`).toBe(true);
          if (!(await lineFits()).vertical) {
            await expect(host).toHaveAttribute("tabindex", "0");
            await host.focus(); await page.keyboard.press("Home"); await settle(page);
            for (let step = 0; step < 60 && !(await lineFits()).vertical; step++) {
              await page.keyboard.press("ArrowDown"); await settle(page);
            }
          }
          expect((await lineFits()).vertical, `${width}px ${snap}: status line ${line + 1} must be fully reachable by keyboard scrolling`).toBe(true);
        }
        const overlap = await status.evaluate(element => {
          const a = element.getBoundingClientRect();
          return [...document.querySelectorAll(".oak-map-controls button, [data-fake-legal]")].some(target => { const b = target.getBoundingClientRect(); return Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top); });
        });
        expect(overlap).toBe(false);
      }
      await page.screenshot({ path: info.outputPath(`map-unavailable-${retryable}.png`) });
      if (retryable) {
        const retry = status.getByRole("button"); await retry.scrollIntoViewIfNeeded();
        const box = await retry.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
        await retry.click(); await settle(page);
        await expect(status).toHaveCount(0);
        expect(await page.evaluate(() => window.oak!.probe.experience!.model.map.provider.status)).toBe("ready");
        for (const snap of ["collapsed", "half", "expanded"] as const) {
          await page.evaluate(snap => window.oak!.probe.actions!.setSheetSnap(snap), snap); await settle(page);
          const legal = page.getByRole("button", { name: "Synthetic map attribution", exact: true });
          await expect(legal).toHaveCount(1);
          await legal.click(); await expect(legal).toHaveAttribute("data-activated", "true");
        }
      }
    }
  });
}

test("native shopping and reset selects share a readable focused control", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  await page.evaluate(() => { window.oak!.probe.actions!.selectNode("node-shopping"); window.oak!.probe.actions!.setSheetSnap("expanded"); }); await settle(page);
  const shopping = page.locator('.oak-primary-row[data-owner-id="node-shopping"] .oak-native-select').first();
  const shoppingSelect = shopping.locator("select");
  await shoppingSelect.scrollIntoViewIfNeeded();
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" }); await settle(page);
  const inspect = async (selector: typeof shopping) => selector.evaluate(element => {
    const select = element.querySelector("select")!;
    const style = getComputedStyle(select), wrapper = getComputedStyle(element), bounds = select.getBoundingClientRect();
    return { border: style.border, background: style.backgroundColor, height: bounds.height, right: bounds.right, viewport: window.innerWidth, outline: Number.parseFloat(style.outlineWidth), wrapperOutline: wrapper.outlineStyle };
  });
  await shoppingSelect.focus();
  const shoppingStyle = await inspect(shopping);
  expect(shoppingStyle.height).toBeGreaterThanOrEqual(44);
  expect(shoppingStyle.right).toBeLessThanOrEqual(shoppingStyle.viewport);
  expect(shoppingStyle.outline).toBeGreaterThanOrEqual(2);
  expect(shoppingStyle.wrapperOutline).toBe("none");
  await expect(shoppingSelect).toHaveAccessibleName(/狀態/);
  await shoppingSelect.press("ArrowDown");
  await expect(shoppingSelect).toBeFocused();

  await page.goto("/?case=home&variant=zero-mobile"); await settle(page);
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" }); await settle(page);
  await page.locator(".oak-progress-reset > summary").click();
  const reset = page.locator(".oak-progress-reset .oak-native-select");
  const resetSelect = reset.locator("select");
  await resetSelect.focus();
  const resetStyle = await inspect(reset);
  expect(resetStyle.border).toBe(shoppingStyle.border);
  expect(resetStyle.background).toBe(shoppingStyle.background);
  expect(resetStyle.height).toBeGreaterThanOrEqual(44);
  expect(resetStyle.right).toBeLessThanOrEqual(resetStyle.viewport);
  expect(resetStyle.outline).toBeGreaterThanOrEqual(2);
  expect(resetStyle.wrapperOutline).toBe("none");
  await expect(resetSelect).toHaveAccessibleName(/重設/);
  await expect(page.locator(".oak-reset-selected-day")).toHaveCount(0);
  await expect(page.locator(".oak-progress-reset select option:checked")).toContainText("·");
  await page.emulateMedia({ forcedColors: "active" });
  expect(await resetSelect.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
});

const closeout = ".superpowers/sdd/2026-09-04-eternal-pose-v2-05-generator-flagship";
test("zero primary map coverage names its denominator even with a resolved lodging pin", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day&content=lodging-only"); await settle(page);
  await expect(page.locator('.oak-experience[data-map-coverage="none"]')).toBeVisible();
  await expect(page.locator('.oak-marker[data-marker-mode="base"]')).toHaveCount(1);
  await expect(page.locator('.oak-marker[data-marker-mode="numbered"]')).toHaveCount(0);
  await expect(page.locator(".oak-map-coverage-note")).toContainText("主要目的地 0／1 已標示");
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1024, height: 900 }, { width: 956, height: 300 }]) {
    await page.setViewportSize(viewport); await settle(page);
    for (const snap of ["collapsed", "half", "expanded"] as const) {
      await page.evaluate(snap => window.oak!.probe.actions!.setSheetSnap(snap), snap); await settle(page);
      if (viewport.height === 300 && snap !== "collapsed") await page.locator(".oak-map-coverage-note").scrollIntoViewIfNeeded();
      const placement = await page.locator(".oak-map-coverage-note").evaluate(element => {
        const note = element.getBoundingClientRect();
        const sheet = document.querySelector(".oak-itinerary-sheet")!.getBoundingClientRect();
        const visibleBox = (element: Element) => {
          const rect = element.getBoundingClientRect();
          const visible = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent), clip = parent.getBoundingClientRect();
            if (/^(auto|scroll|hidden|clip)$/.test(style.overflowX)) { visible.left = Math.max(visible.left, clip.left); visible.right = Math.min(visible.right, clip.right); }
            if (/^(auto|scroll|hidden|clip)$/.test(style.overflowY)) { visible.top = Math.max(visible.top, clip.top); visible.bottom = Math.min(visible.bottom, clip.bottom); }
          }
          return visible;
        };
        const blockers = [...document.querySelectorAll(".oak-day-header, .oak-map-controls, [aria-label='Synthetic map attribution']")].map(visibleBox);
        const overlaps = (left: Pick<DOMRect, "left" | "right" | "top" | "bottom">, right: Pick<DOMRect, "left" | "right" | "top" | "bottom">) => Math.min(left.right, right.right) - Math.max(left.left, right.left) > 1 && Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 1;
        return { insideSheet: note.top >= sheet.top - 1 && note.bottom <= sheet.bottom + 1, aboveSheet: note.bottom <= sheet.top + 1, noteTop: note.top, noteBottom: note.bottom, sheetTop: sheet.top, sheetBottom: sheet.bottom, overlaps: blockers.some(blocker => overlaps(note, blocker)), width: innerWidth, noteRight: note.right };
      });
      expect(placement.insideSheet || placement.aboveSheet, `${viewport.width}x${viewport.height} ${snap}: ${JSON.stringify(placement)}`).toBe(true);
      expect(placement.overlaps, `${viewport.width}x${viewport.height} ${snap}`).toBe(false);
      expect(placement.noteRight).toBeLessThanOrEqual(placement.width + 1);
      await expect(page.getByRole("button", { name: "Synthetic map attribution" })).toBeVisible();
    }
  }
});
test("half-sheet keeps the unresolved place fact without a duplicate status chip", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  const unresolved = page.locator('.oak-primary-row[data-owner-id="node-unresolved"]');
  await expect(unresolved).toHaveAttribute("data-unresolved", "true");
  await expect(unresolved).not.toHaveAttribute("data-selected", "true");
  await expect(unresolved.locator('.oak-unresolved-facts .oak-row-location')).toContainText("地點尚未驗證");
  await expect(unresolved.locator('.oak-row-status > [data-state="unresolved"]')).toHaveCount(0);
  await unresolved.locator(".oak-row-selection").click(); await settle(page);
  await expect(page.locator(".oak-itinerary-sheet")).toHaveAttribute("data-sheet-snap", "expanded");
  await expect(unresolved.locator('.oak-row-selection')).toHaveAttribute("aria-pressed", "true");
  await expect(unresolved.locator('.oak-unresolved-facts .oak-row-location')).toContainText("地點尚未驗證");
});
test("selected unresolved half-sheet explains absent map pin and navigation once at large text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  await page.evaluate(() => { window.oak!.probe.actions!.selectNode("node-unresolved"); window.oak!.probe.actions!.setSheetSnap("half"); }); await settle(page);
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" }); await settle(page);
  const row = page.locator('.oak-primary-row[data-owner-id="node-unresolved"]');
  const location = row.locator(".oak-row-location");
  await location.scrollIntoViewIfNeeded();
  await expect(location).toBeVisible();
  await expect(location).toContainText("地點尚未驗證，暫無地圖標記與導航");
  expect((await row.textContent())?.match(/地點尚未驗證/g)).toHaveLength(1);
  await expect(row.locator(".oak-row-action")).toHaveCount(0);
});
test("zero and partial map coverage remain truthful without consuming the half-sheet scan", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  const sheet = page.locator(".oak-itinerary-sheet");
  await expect(page.locator('.oak-experience[data-map-coverage="partial"]')).toBeVisible();
  const partial = sheet.getByRole("note", { name: "地圖" });
  await expect(partial).toBeVisible();
  await expect(partial).toContainText("主要目的地 4／5 已標示");
  expect(await partial.evaluate(element => element.getBoundingClientRect().bottom <= element.closest(".oak-itinerary-sheet")!.getBoundingClientRect().top)).toBe(true);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/?case=experience-default&variant=full-day&content=unreviewed"); await settle(page);
  await expect(page.locator('.oak-experience[data-map-coverage="none"]')).toBeVisible();
  await expect(page.locator(".oak-marker")).toHaveCount(0);
  const none = page.locator(".oak-map-coverage-note");
  await expect(none).toBeVisible();
  await expect(none).toContainText("行程仍可照常閱讀");
  expect(await none.evaluate(element => {
    const note = element.getBoundingClientRect(), sheet = element.closest(".oak-itinerary-sheet")!.getBoundingClientRect();
    return note.top >= sheet.top && note.bottom <= sheet.bottom;
  })).toBe(true);
  await expect(page.getByRole("button", { name: "Synthetic map attribution" })).toBeVisible();
  await page.setViewportSize({ width: 956, height: 300 }); await settle(page);
  const landscapeNote = page.locator(".oak-map-coverage-note");
  expect(await landscapeNote.evaluate(element => element.closest(".oak-sheet-body") !== null)).toBe(true);
  await landscapeNote.scrollIntoViewIfNeeded();
  expect(await landscapeNote.evaluate(element => {
    const note = element.getBoundingClientRect(), port = element.closest(".oak-sheet-body")!.getBoundingClientRect();
    return note.top >= port.top && note.bottom <= port.bottom && port.height >= 44;
  })).toBe(true);
});
test("sparse map coverage gives the mobile itinerary more first-glance room without hiding the map", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day&content=unreviewed"); await settle(page);
  const sparse = page.locator(".oak-experience");
  await expect(sparse).toHaveAttribute("data-map-density", "sparse");
  const geometry = await sparse.evaluate(element => {
    const sheet = element.querySelector<HTMLElement>(".oak-itinerary-sheet")!.getBoundingClientRect();
    const header = element.querySelector<HTMLElement>(".oak-upper-clearance")!.getBoundingClientRect();
    return { sheetHeight: sheet.height, mapBand: sheet.top - header.bottom };
  });
  expect(geometry.sheetHeight).toBeGreaterThanOrEqual(440);
  expect(geometry.mapBand).toBeGreaterThanOrEqual(100);
  await expect(page.getByRole("button", { name: "Synthetic map attribution" })).toBeVisible();

  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  await expect(page.locator(".oak-experience")).toHaveAttribute("data-map-density", "mapped");
  expect(await page.locator(".oak-itinerary-sheet").evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(440);
});
test("candidate comparison keeps the resolved parent in the map coverage count", async ({ page }) => {
  const item = variants.find(item => item.visualCase.id === "candidate-open" && item.variant.id === "open")!;
  await openCase(page, item.visualCase, item.variant);
  await expect(page.getByRole("dialog", { name: "比較候選項目" })).toBeVisible();
  expect(await page.evaluate(() => {
    const model = window.oak!.probe.experience!.model;
    const parent = model.candidates.find(candidate => candidate.groupId === "candidate-meal")!.parentOwnerId;
    return model.places.find(place => place.ownerId === parent)?.place.resolution.status;
  })).toBe("resolved");
  await expect(page.locator(".oak-map-coverage-note")).toContainText("4／5");
});
test("mobile half-sheet presents a compact scan before opening details", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  const sheet = page.locator(".oak-itinerary-sheet");
  await expect(sheet).toHaveAttribute("data-sheet-snap", "half");
  const selected = sheet.locator('.oak-primary-row[data-selected="true"]').first();
  await expect(selected).toBeVisible();
  await expect(selected.locator(".oak-owner-details")).toHaveCount(0);
  const before = await selected.boundingBox();
  expect(before!.height).toBeLessThanOrEqual(112);
  await selected.locator(".oak-row-selection").click(); await settle(page);
  await expect(sheet).toHaveAttribute("data-sheet-snap", "expanded");
  await expect(selected.locator(".oak-owner-details")).toBeVisible();
});
test("selected logistics checklist remains operable in a narrow half sheet", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  await page.evaluate(() => { window.oak!.probe.actions!.selectNode("node-logistics"); window.oak!.probe.actions!.setSheetSnap("half"); }); await settle(page);
  const row = page.locator('.oak-task-row[data-owner-id="node-logistics"]');
  await expect(row).toHaveAttribute("data-selected", "true");
  const checklist = row.locator(".oak-half-task-checklist");
  await expect(checklist).toBeAttached();
  await expect(row.locator(".oak-owner-details")).toHaveCount(0);
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" }); await settle(page);
  const checkbox = checklist.getByRole("checkbox", { name: "Collect neutral test parcel" });
  const halfRhythm = await page.evaluate(() => {
    const primary = document.querySelector(".oak-primary-summary")!;
    const selection = primary.querySelector(".oak-row-selection")!;
    const task = document.querySelector('.oak-task-row[data-owner-id="node-logistics"]')!;
    return { primaryInset: getComputedStyle(primary).paddingTop, rowGap: getComputedStyle(selection).rowGap, taskInset: getComputedStyle(task).paddingTop };
  });
  expect(halfRhythm).toEqual({ primaryInset: "16px", rowGap: "8px", taskInset: "16px" });
  expect(await checkbox.locator("xpath=parent::label").evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await checkbox.scrollIntoViewIfNeeded();
  expect(await checkbox.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const port = element.closest(".oak-sheet-scroll")!.getBoundingClientRect();
    return rect.width >= 20 && rect.height >= 20 && rect.left >= port.left && rect.right <= port.right && rect.top >= port.top && rect.bottom <= port.bottom;
  })).toBe(true);
  await checkbox.check();
  await expect(checkbox).toBeChecked();
});
test("selected task lead and metadata stay compact without clipping on narrow phones", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  await page.evaluate(() => { window.oak!.probe.actions!.selectNode("node-logistics"); window.oak!.probe.actions!.setSheetSnap("expanded"); }); await settle(page);
  const row = page.locator('.oak-task-row[data-owner-id="node-logistics"]');
  await expect(row.locator(".oak-task-heading, .oak-row-context")).toHaveCount(0);
  await expect(row.locator(".oak-task-lead .oak-row-title")).toBeVisible();
  await expect(row.locator(".oak-task-meta")).toContainText("建議時間");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await settle(page);
    const geometry = await row.evaluate(element => {
      const lead = element.querySelector(".oak-task-lead")!.getBoundingClientRect();
      const meta = element.querySelector(".oak-task-meta")!.getBoundingClientRect();
      const sheet = element.closest(".oak-sheet-scroll")!.getBoundingClientRect();
      return { lead: lead.toJSON(), meta: meta.toJSON(), sheet: sheet.toJSON(), viewport: innerWidth };
    });
    expect(geometry.lead.right).toBeLessThanOrEqual(geometry.sheet.right + 1);
    expect(geometry.meta.right).toBeLessThanOrEqual(geometry.sheet.right + 1);
    expect(geometry.lead.left).toBeGreaterThanOrEqual(geometry.sheet.left - 1);
    expect(geometry.meta.top - geometry.lead.bottom).toBeLessThanOrEqual(8);
  }
});
test("selected logistics authored notes align with the task lead without clipping", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.goto("/?case=experience-default&variant=full-day&details=task"); await settle(page);
    await page.evaluate(() => { window.oak!.probe.actions!.selectNode("node-logistics"); window.oak!.probe.actions!.setSheetSnap("expanded"); }); await settle(page);
    const row = page.locator('.oak-task-row[data-owner-id="node-logistics"]');
    await expect(row.locator(".oak-authored-details li")).toHaveCount(2);
    const geometry = await row.evaluate(element => ({
      lead: element.querySelector(".oak-task-lead")!.getBoundingClientRect().left,
      note: element.querySelector(".oak-authored-details li")!.getBoundingClientRect().left,
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(Math.abs(geometry.lead - geometry.note), `${width}px task note column`).toBeLessThanOrEqual(1);
    expect(geometry.document).toBeLessThanOrEqual(geometry.viewport);
  }
});
async function closeoutEvidence(page: import("@playwright/test").Page, name: string, value: unknown) {
  const phase = process.env.OAK_CLOSEOUT_PHASE;
  if (phase !== "before" && phase !== "after") return;
  const round = process.env.OAK_CLOSEOUT_ROUND === "round1" ? "round1-" : "";
  await page.screenshot({ path: `${closeout}/canonical-${round}${phase}-${name}.png` });
  await writeFile(`${closeout}/canonical-${round}${phase}-${name}.json`, JSON.stringify(value, null, 2));
}

test("closeout incoming node route facts keep distinct readable bounds", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=selection-truth&variant=selected-unresolved"); await settle(page);
  await page.getByRole("button", { name: "展開行程", exact: true }).click(); await settle(page);
  const row = page.locator('.oak-row[data-owner-id="node-logistics"]');
  await row.locator(".oak-row-selection").click(); await settle(page);
  const facts = row.locator(".oak-row-location .oak-route-facts");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(width => { document.documentElement.style.fontSize = width === 320 ? "32px" : "16px"; }, width); await settle(page);
    await facts.scrollIntoViewIfNeeded(); await settle(page);
    const sample = await facts.evaluate(element => ({ display: getComputedStyle(element).display, gap: getComputedStyle(element).columnGap, facts: [...element.children].map(child => { const r = child.getBoundingClientRect(); return { text: child.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }) }));
    await closeoutEvidence(page, `incoming-${width}`, sample);
    expect.soft(sample.display).toBe("flex");
    expect.soft(sample.facts.map(fact => fact.text)).toEqual(["開車", "旅程原有路線 · 建議"]);
    const [a, b] = sample.facts;
    expect.soft(b.top >= a.bottom || b.left - a.right >= 12).toBe(true);
    for (const fact of await facts.locator(":scope > span").all()) {
      await fact.scrollIntoViewIfNeeded();
      const fits = await fact.evaluate(element => { const r = element.getBoundingClientRect(), p = element.closest(".oak-sheet-scroll")!.getBoundingClientRect(); const roundingTolerance = 1; return r.left >= p.left - roundingTolerance && r.right <= p.right + roundingTolerance && r.top >= p.top - roundingTolerance && r.bottom <= p.bottom + roundingTolerance; });
      expect.soft(fits).toBe(true);
    }
  }
});

test("closeout simultaneous map and global notices retain compact chrome and truthful recovery", async ({ page }) => {
  test.setTimeout(120_000);
  const tabTo = async (target: import("@playwright/test").Locator) => {
    const visited: string[] = [];
    for (let step = 0; step < 60; step++) {
      await page.keyboard.press("Tab");
      visited.push(await page.evaluate(() => { const active = document.activeElement!; return `${active.tagName}.${active.className}`; }));
      if (await target.evaluate(element => element === document.activeElement)) { await settle(page); return visited; }
    }
    throw new Error(`Target not reached by 60 native Tabs: ${visited.join(" → ")}`);
  };
  const item = variants.find(item => item.visualCase.id === "runtime-degraded" && item.variant.id === "memory-only")!;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=runtime-degraded&variant=memory-only"); await settle(page);
  await page.evaluate(() => window.oak!.providers.map.fake.fail({ status: "unavailable", reason: "network", retryable: true })); await settle(page);
  for (const [width, scale, height] of [[390, 1, 844], [320, 1, 844], [320, 2, 844], [320, 2, 568]] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(scale => {
      document.documentElement.style.fontSize = `${16 * scale}px`;
      for (const [side, value] of Object.entries({ top: 20, right: 13, bottom: 34, left: 7 })) document.documentElement.style.setProperty(`--oak-safe-area-${side}`, `${value}px`);
    }, scale); await settle(page);
    const global = page.locator(".oak-global-notices"), map = page.locator(".oak-map-status");
    await expect(global).toContainText("關閉此頁面後，變更將會遺失。");
    await expect(map.locator("[role=status]")).toContainText("網路");
    const sample = await page.evaluate(() => [".oak-global-notices", ".oak-map-status"].map(selector => { const el = document.querySelector(selector)!, r = el.getBoundingClientRect(), s = getComputedStyle(el); return { selector, left: r.left, right: r.right, top: r.top, bottom: r.bottom, radius: s.borderRadius, border: s.borderTopWidth, background: s.backgroundColor }; }));
    await closeoutEvidence(page, `notices-${width}-${scale}${height === 568 ? "-short" : ""}`, sample);
    for (const notice of sample) { expect.soft(notice.radius).toBe("16px"); expect.soft(notice.border).toBe("1px"); }
    const keyboardEvidence = [];
    for (const notice of [global, map]) {
      const host = notice === global ? page.locator(".oak-upper-clearance") : map;
      const short = height === 568;
      const traversal = short ? await tabTo(host) : [];
      if (short) { await expect(host).toHaveAttribute("tabindex", "0"); await expect(host).toBeFocused(); await page.keyboard.press("Home"); await settle(page); }
      else await notice.scrollIntoViewIfNeeded();
      expect(await notice.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); return [...range.getClientRects()].every(r => r.left >= 0 && r.right <= innerWidth); })).toBe(true);
      const status = notice.locator("[role=status]");
      if (!short) { await status.scrollIntoViewIfNeeded(); await settle(page); }
      const lineCount = await status.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); return range.getClientRects().length; });
      for (let line = 0; line < lineCount; line++) {
        const lineFits = () => status.evaluate((element, line) => { const range = document.createRange(); range.selectNodeContents(element); const r = range.getClientRects()[line], p = element.closest(".oak-upper-clearance, .oak-map-status")!.getBoundingClientRect(); return r.top >= p.top && r.bottom <= p.bottom && r.left >= p.left && r.right <= p.right && r.top >= 0 && r.bottom <= innerHeight; }, line);
        if (!await lineFits()) {
          if (!short) await tabTo(host);
          await page.keyboard.press("Home"); await settle(page);
          for (let step = 0; step < 60 && !await lineFits(); step++) await page.keyboard.press("ArrowDown");
        }
        expect(await lineFits(), `status line ${line + 1} is completely reachable at ${width} × ${height}, ${scale * 100}% in ${notice === global ? "global" : "map"}; ${JSON.stringify(await status.evaluate((element, line) => { const p = element.closest(".oak-upper-clearance, .oak-map-status")!.getBoundingClientRect(), r = element.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(element); return { host: p.toJSON(), status: r.toJSON(), line: range.getClientRects()[line]?.toJSON(), scrollTop: element.closest<HTMLElement>(".oak-upper-clearance, .oak-map-status")!.scrollTop }; }, line))}`).toBe(true);
      }
      keyboardEvidence.push({ host: notice === global ? "upper" : "map-status", traversal, lineCount });
      if (short) await closeoutEvidence(page, `notice-native-tab-${notice === global ? "upper" : "map"}`, keyboardEvidence);
    }
    const retry = map.getByRole("button", { name: "重試", exact: true });
    await tabTo(retry); await expect(retry).toBeFocused();
    const r = await retry.boundingBox(); expect(r!.width).toBeGreaterThanOrEqual(44); expect(r!.height).toBeGreaterThanOrEqual(44);
    if (height === 568) await closeoutEvidence(page, "notice-native-tab-retry", await retry.evaluate(element => { const r = element.getBoundingClientRect(), host = element.closest<HTMLElement>(".oak-map-status")!, p = host.getBoundingClientRect(); return { retry: { top: r.top, bottom: r.bottom, height: r.height, left: r.left, right: r.right }, host: { top: p.top, bottom: p.bottom, height: p.height, clientHeight: host.clientHeight, clientTop: host.clientTop, scrollTop: host.scrollTop, scrollHeight: host.scrollHeight } }; }));
    await expect(retry).toBeInViewport({ ratio: 1 });
    const retryFocus = await retry.evaluate(element => { const r = element.getBoundingClientRect(), host = element.closest(".oak-map-status")!, p = host.getBoundingClientRect(), css = getComputedStyle(element), border = getComputedStyle(host); const outset = Number.parseFloat(css.outlineWidth) + Number.parseFloat(css.outlineOffset); return { fits: r.top - outset >= p.top + Number.parseFloat(border.borderTopWidth) && r.bottom + outset <= p.bottom - Number.parseFloat(border.borderBottomWidth) && r.left - outset >= p.left + Number.parseFloat(border.borderLeftWidth) && r.right + outset <= p.right - Number.parseFloat(border.borderRightWidth), control: r.toJSON(), host: p.toJSON(), outset, scrollTop: (host as HTMLElement).scrollTop }; });
    expect(retryFocus.fits, JSON.stringify(retryFocus)).toBe(true);
    expect(await retry.evaluate(element => getComputedStyle(element).outlineWidth)).toBe("3px");
    await commonGeometry(page, { ...item.variant, viewport: { width, height }, scenario: { ...item.variant.scenario, textScale: scale, safeArea: [20, 13, 34, 7] } });
  }
  await page.emulateMedia({ forcedColors: "active" });
  const retry = page.locator(".oak-map-status button"); await expect(retry).toBeFocused();
  expect(await retry.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
  await page.keyboard.press("Enter"); await settle(page);
  await expect(page.locator(".oak-global-notices")).toContainText("關閉此頁面後，變更將會遺失。");
  const legal = page.locator("[data-fake-legal]");
  await expect(legal).toBeAttached();
  await legal.focus(); await expect(legal).toBeFocused();
  await expect(legal).toBeInViewport({ ratio: 1 });
  await page.keyboard.press("Enter"); await expect(legal).toHaveAttribute("data-activated", "true");
});

test("closeout runtime persistence failure remains visible beside unavailable map", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  await expect(page.locator(".oak-global-notices")).toHaveCount(0);
  expect(await page.locator(".oak-map-status").evaluate(element => element.getBoundingClientRect().height)).toBe(0);
  await page.evaluate(() => { window.oak!.providers.progress.setWriteAvailable(false); window.oak!.providers.map.fake.fail({ status: "unavailable", reason: "network", retryable: true }); });
  await page.getByRole("button", { name: "展開行程", exact: true }).click(); await settle(page);
  const row = page.locator('[data-owner-id="node-experience"]');
  await row.locator(".oak-row-selection").click(); await settle(page);
  await row.getByRole("button", { name: "標示為完成", exact: true }).click(); await settle(page);
  await expect(page.locator(".oak-global-notices [role=status]")).toHaveText("關閉此頁面後，變更將會遺失。");
  expect(await page.evaluate(() => window.oak!.probe.experience!.model.persistence.status)).toBe("memory-only");
  await expect(page.locator(".oak-map-status [role=status]")).toContainText("網路要求失敗");
  await page.getByRole("button", { name: "收合行程", exact: true }).click(); await settle(page);
  await expect(page.locator(".oak-global-notices [role=status]")).toBeInViewport({ ratio: 1 });
});

test("connector keeps movement readable without repeating provenance", async ({ page }, info) => {
  const evidence = [];
  for (const width of [366, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/?case=route-state-matrix&variant=transit"); await settle(page);
    const row = page.locator('[data-owner-id="route-walking"]');
    await row.scrollIntoViewIfNeeded(); await settle(page);
    await page.screenshot({ path: info.outputPath(`connector-${width}.png`) });
    evidence.push(await row.evaluate(element => {
      const facts = element.querySelector<HTMLElement>(".oak-route-facts")!;
      const children = [...facts.querySelectorAll<HTMLElement>(":scope > span")];
      const rect = (node: HTMLElement) => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; };
      return { width: innerWidth, row: rect(element as HTMLElement), rule: getComputedStyle(element).borderBottomWidth, selectionHeight: element.querySelector<HTMLElement>(".oak-route-selection")!.getBoundingClientRect().height,
        children: children.map(node => ({ text: node.textContent, ...rect(node), weight: getComputedStyle(node).fontWeight, parts: [...node.children].map(part => ({ text: part.textContent, weight: getComputedStyle(part).fontWeight })) })), text: facts.textContent };
    }));
  }
  await retainNoticeEvidence(info, "connector-before-after", evidence);
  for (const sample of evidence) {
    expect(sample.children[0].text).toBe("大眾運輸12 分鐘距離 1500 公尺");
    expect(sample.children).toHaveLength(1);
    expect(sample.text).not.toContain("服務提供者路線 · 建議");
    expect(sample.children[0].parts).toEqual([{ text: "大眾運輸", weight: "720" }, { text: "12 分鐘", weight: "720" }, { text: "距離 1500 公尺", weight: "400" }]);
    expect(sample.row.height).toBeGreaterThanOrEqual(44);
    expect(sample.selectionHeight).toBeGreaterThanOrEqual(44);
    expect(sample.rule).toBe("0px");
  }
});

test("connector facts reflow at narrow and enlarged text sizes with visible focus and state", async ({ page }, info) => {
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/?case=route-state-matrix&variant=authored-fallback"); await settle(page);
    const row = page.locator('[data-owner-id="route-walking"]');
    const facts = row.locator(".oak-route-facts");
    await expect(facts).not.toContainText("使用旅程原有路線資訊");
    await expect(facts.locator(".oak-route-provenance")).toHaveCount(0);
    expect(await row.locator(".oak-route-selection > :last-child").getAttribute("data-scan")).toBe("status");
    const selection = row.locator(".oak-route-selection");
    await selection.click(); await settle(page);
    await expect(selection).toHaveAttribute("aria-pressed", "true");
    await expect(selection).toHaveAttribute("aria-pressed", "true");
    await expect(row.locator('.oak-row-status > [data-state="selected"]')).toHaveCount(0);
    await expect(row.locator(".oak-route-evidence")).toContainText("旅程原有路線 · 建議");
    await expect(row.locator(".oak-route-evidence")).toContainText("使用旅程原有路線資訊");
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; }); await settle(page);
    await row.scrollIntoViewIfNeeded(); await settle(page);
    const evidence = await row.evaluate(element => {
      const selection = element.querySelector<HTMLElement>(".oak-route-selection")!;
      const box = selection.getBoundingClientRect();
      const parts = [...element.querySelectorAll<HTMLElement>(".oak-route-facts span span")].map(part => {
        const range = document.createRange(); range.selectNodeContents(part);
        return { text: part.textContent, fits: [...range.getClientRects()].every(rect => rect.left >= box.left - 1 && rect.right <= box.right + 1 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1) };
      });
      return { width: innerWidth, parts, selection: { width: box.width, height: box.height }, scroll: element.scrollWidth, client: element.clientWidth };
    });
    await retainNoticeEvidence(info, `connector-zoom-${width}`, evidence);
    expect(evidence.parts.map(part => part.text)).toEqual(["步行", "12 分鐘"]);
    expect(evidence.parts.every(part => part.fits)).toBe(true);
    expect(evidence.selection.height).toBeGreaterThanOrEqual(44);
    expect(evidence.scroll).toBeLessThanOrEqual(evidence.client);
    await page.emulateMedia({ forcedColors: "active" });
    await selection.focus();
    await expect(selection).toBeFocused();
    const focus = await selection.evaluate(element => { const style = getComputedStyle(element); return { width: style.outlineWidth, style: style.outlineStyle }; });
    expect(focus).toEqual({ width: "3px", style: "double" });
  }
});

test("full day connector keeps its place between primary destinations", async ({ page }, info) => {
  await page.setViewportSize({ width: 366, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("expanded")); await settle(page);
  const current = page.locator('.oak-primary-row[data-owner-id="node-sightseeing"]');
  await current.locator(".oak-primary-summary").scrollIntoViewIfNeeded(); await settle(page);
  const port = page.locator(".oak-sheet-scroll");
  const point = await port.evaluate(element => { const r = element.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(point.x, point.y); await page.mouse.wheel(0, -100); await settle(page);
  await page.screenshot({ path: info.outputPath("full-day-366.png") });
  const order = await page.locator(".oak-timeline > .oak-row").evaluateAll(elements => elements.map(element => ({ owner: element.getAttribute("data-owner-id"), role: element.getAttribute("data-role") })));
  await retainNoticeEvidence(info, "full-day-row-order", order);
  expect(order.some((item, index) => item.role === "connector" && index > 0 && index < order.length - 1 && order[index + 1].role === "primary")).toBe(true);
});

test("header controls are integrated while day identity and 44px targets remain readable", async ({ page }) => {
  await page.setViewportSize({ width: 366, height: 814 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  const model = await page.evaluate(() => ({ day: window.oak!.probe.experience!.model.day.title, trip: window.oak!.probe.experience!.model.trip.title }));
  const heading = page.locator(".oak-header-identity h1");
  expect.soft((await heading.textContent())?.startsWith(model.day)).toBe(true);
  await expect(heading).toHaveAttribute("title", `${model.trip} · ${model.day}`);
  await expect(heading).toHaveAccessibleName(`${model.trip} · ${model.day}`);
  expect(await heading.evaluate(element => {
    const box = element.getBoundingClientRect(), identity = element.closest(".oak-header-identity")!.getBoundingClientRect(), style = getComputedStyle(element);
    return box.width > 0 && box.left >= identity.left && box.right <= identity.right
      && style.whiteSpace === "normal" && style.webkitLineClamp === "none"
      && element.scrollHeight <= element.clientHeight + 1;
  })).toBe(true);
  for (const control of await page.locator(".oak-header-line > .oak-control").all()) {
    const styles = await control.evaluate(element => { const s = getComputedStyle(element), r = element.getBoundingClientRect(); return { background: s.backgroundColor, border: s.borderTopColor, width: r.width, height: r.height, name: element.getAttribute("aria-label") }; });
    expect.soft(styles.background).toBe("rgba(0, 0, 0, 0)"); expect.soft(styles.border).toBe("rgba(0, 0, 0, 0)");
    expect(styles.width).toBeGreaterThanOrEqual(44); expect(styles.height).toBeGreaterThanOrEqual(44); expect(styles.name).toBeTruthy();
    await control.focus(); expect(await control.evaluate(element => getComputedStyle(element).outlineWidth)).toBe("3px");
    await control.hover(); expect(await control.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(242, 237, 228)");
    await page.mouse.move(0, 0);
  }
  await page.emulateMedia({ forcedColors: "active" });
  for (const control of await page.locator(".oak-header-line > .oak-control").all()) {
    await control.focus();
    const styles = await control.evaluate(element => { const s = getComputedStyle(element); return { border: s.borderTopStyle, color: s.borderTopColor, outline: s.outlineStyle, width: s.outlineWidth }; });
    expect(styles.border).toBe("solid"); expect(styles.color).not.toBe("rgba(0, 0, 0, 0)"); expect(styles.outline).toBe("solid"); expect(styles.width).toBe("3px");
  }
});

test("whole page chrome keeps compact identity, dark dates, circular map controls and editorial selection rule", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  const phase = process.env.OAK_BATCH12_PHASE;
  const evidenceRoot = ".superpowers/sdd/2026-09-04-eternal-pose-v2-04-oak-washi";
  const port = page.locator(".oak-sheet-scroll");
  await port.evaluate(element => { element.scrollTop = 0; }); await settle(page);
  if (phase === "before" || phase === "after") await page.screenshot({ path: `${evidenceRoot}/oak-batch12-${phase}-full-day-390.png` });
  const heading = page.locator(".oak-header-identity h1");
  const title = await page.evaluate(() => ({ trip: window.oak!.probe.experience!.model.trip.title, day: window.oak!.probe.experience!.model.day.title }));
  const geometry = await page.evaluate(() => {
    const box = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const style = (selector: string) => { const s = getComputedStyle(document.querySelector(selector)!); return { background: s.backgroundColor, color: s.color, shadow: s.boxShadow, borderRadius: s.borderRadius, paddingBlock: s.paddingBlock, paddingInline: s.paddingInline }; };
    return { header: box(".oak-day-header"), heading: box(".oak-header-identity h1"), clock: box(".oak-header-clock"), rail: box(".oak-day-rail"), date: box(".oak-day-choice[aria-current]"), control: box(".oak-map-controls > .oak-control"), headerStyle: style(".oak-day-header"), dateStyle: style(".oak-day-choice[aria-current]"), controlStyle: style(".oak-map-controls > .oak-control"), pageWidth: document.documentElement.scrollWidth };
  });
  await page.getByRole("button", { name: "展開行程", exact: true }).click(); await settle(page);
  await port.evaluate(element => { element.scrollTop = 0; }); await settle(page);
  const selected = page.locator('.oak-primary-row[data-owner-id="node-sightseeing"] .oak-row-selection');
  await selected.click(); await settle(page);
  await selected.scrollIntoViewIfNeeded(); await settle(page);
  const framing = await selected.evaluate(element => {
    const clip = element.closest(".oak-sheet-scroll")!.getBoundingClientRect();
    const visible = (selector: string) => {
      const r = element.closest(".oak-primary-row")!.querySelector(selector)!.getBoundingClientRect();
      return r.right > clip.left && r.left < clip.right && r.bottom > clip.top && r.top < clip.bottom;
    };
    return { summary: visible(".oak-primary-summary"), title: visible(".oak-row-title"), status: visible(".oak-row-status") };
  });
  expect(framing).toEqual({ summary: true, title: true, status: true });
  if (phase === "before" || phase === "after") await page.screenshot({ path: `${evidenceRoot}/oak-batch12-${phase}-selected-primary-390.png` });
  const summary = page.locator('.oak-primary-row[data-owner-id="node-sightseeing"] .oak-primary-summary');
  const selectedStyle = await summary.evaluate(element => { const s = getComputedStyle(element); return { background: s.backgroundColor, shadow: s.boxShadow }; });
  expect(await heading.textContent()).toBe(title.day);
  await expect(heading).toHaveAccessibleName(`${title.trip} · ${title.day}`);
  await expect(heading).toHaveAttribute("title", `${title.trip} · ${title.day}`);
  expect(geometry.clock.y).toBeGreaterThanOrEqual(geometry.heading.bottom);
  expect(geometry.clock.bottom).toBeLessThanOrEqual(geometry.header.bottom);
  expect(geometry.header.height).toBeLessThanOrEqual(150);
  expect(geometry.date.height).toBeGreaterThanOrEqual(44);
  expect(geometry.dateStyle.background).toBe("rgb(53, 47, 42)");
  expect(geometry.dateStyle.color).toBe("rgb(255, 253, 249)");
  expect(geometry.control.width).toBe(44); expect(geometry.control.height).toBe(44);
  expect(geometry.controlStyle.borderRadius).toBe("50%");
  expect(geometry.pageWidth).toBe(390);
  expect(selectedStyle.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(selectedStyle.shadow).toContain("1px 0px 0px 0px inset");
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.oak-primary-row[data-owner-id="node-sightseeing"] .oak-row-status > [data-state="selected"]')).toHaveCount(0);
});

test("long authored clock place wraps without clipping time or controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  await page.locator(".oak-clock-place").evaluate(element => { element.textContent = "Extended authored harbour district and waterfront transfer point"; });
  for (const [width, scale] of [[390, 1], [390, 2], [320, 2]] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scale);
    await settle(page);
    const visible = await page.locator(".oak-day-header").evaluate(element => {
      const header = element.getBoundingClientRect();
      const clock = element.querySelector(".oak-header-clock")!.getBoundingClientRect();
      const time = element.querySelector("time")!.getBoundingClientRect();
      const place = element.querySelector<HTMLElement>(".oak-clock-place")!;
      const placeBox = place.getBoundingClientRect();
      const heading = element.querySelector("h1")!.getBoundingClientRect();
      const textFits = (selector: string) => {
        const node = element.querySelector(selector)!; const range = document.createRange(); range.selectNodeContents(node);
        return [...range.getClientRects()].every(r => r.left >= clock.left - 1 && r.right <= clock.right + 1 && r.top >= clock.top - 1 && r.bottom <= clock.bottom + 1);
      };
      const controls = [...element.querySelectorAll(".oak-header-line > .oak-control")].map(control => control.getBoundingClientRect());
      return { header: { left: header.left, right: header.right, bottom: header.bottom }, clock: { left: clock.left, right: clock.right, bottom: clock.bottom }, headingWidth: heading.width, time: { left: time.left, right: time.right, textFits: textFits("time") }, place: { displayed: getComputedStyle(place).display !== "none", scroll: place.scrollWidth, client: place.clientWidth, bottom: placeBox.bottom, textFits: textFits(".oak-clock-place") }, controls: controls.map(r => ({ left: r.left, right: r.right, width: r.width, height: r.height })), pageWidth: document.documentElement.scrollWidth };
    });
    expect(visible.time.left).toBeGreaterThanOrEqual(visible.header.left);
    expect(visible.time.right).toBeLessThanOrEqual(visible.header.right);
    expect(visible.time.textFits).toBe(true);
    expect(visible.headingWidth).toBeGreaterThan(0);
    expect(visible.clock.right).toBeLessThanOrEqual(visible.controls[1].left);
    expect(visible.clock.bottom).toBeLessThanOrEqual(visible.header.bottom);
    if (visible.place.displayed) { expect(visible.place.scroll).toBeLessThanOrEqual(visible.place.client); expect(visible.place.textFits).toBe(true); expect(visible.place.bottom).toBeLessThanOrEqual(visible.header.bottom); }
    expect(visible.controls.every(r => r.width >= 44 && r.height >= 44 && r.left >= visible.header.left && r.right <= visible.header.right)).toBe(true);
    expect(visible.pageWidth).toBe(width);
  }
});

test("summary selection preserves unresolved skipped and completed noncolor cues", async ({ page }) => {
  const item = variants.find(item => item.visualCase.id === "selection-truth" && item.variant.id === "selected-unresolved")!;
  await openCase(page, item.visualCase, item.variant);
  for (const forcedColors of ["none", "active"] as const) {
    await page.emulateMedia({ forcedColors });
    for (const [owner, state] of [["node-unresolved", "unresolved"], ["node-shopping", "skipped"], ["node-experience", "completed"]]) {
      const row = page.locator(`.oak-primary-row[data-owner-id="${owner}"]`);
      await expect(row).toHaveAttribute(`data-${state}`, "true");
      if (state === "unresolved") { await expect(row).toHaveAttribute("data-selected", "true"); await expect(row.locator('.oak-row-selection')).toHaveAttribute("aria-pressed", "true"); }
      const cue = await row.evaluate(element => { const s = getComputedStyle(element); return { outline: s.outlineStyle, border: s.borderBottomStyle, decoration: s.textDecorationLine }; });
      if (state === "unresolved") {
        expect(cue.outline).toBe("none");
        const text = row.locator('.oak-unresolved-facts .oak-row-location');
        await expect(text).toContainText("地點尚未驗證");
        expect(await text.evaluate(element => ({ line: getComputedStyle(element).textDecorationLine, style: getComputedStyle(element).textDecorationStyle }))).toEqual({ line: "underline", style: "dotted" });
      } else if (state === "completed") {
        expect(cue.decoration).toBe("none");
        expect(await row.locator(".oak-row-title").evaluate(element => getComputedStyle(element).textDecorationLine)).toBe("line-through");
        expect(await row.locator(".oak-row-location").evaluate(element => getComputedStyle(element).textDecorationLine)).not.toContain("line-through");
        await expect(row.locator('[data-state="completed"]')).toHaveText("已完成");
      } else expect(cue.border).toBe("dashed");
    }
  }
});

test("selected unresolved and skipped owners use one readable visual grammar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("expanded")); await settle(page);
  const style = async (selector: string) => page.locator(selector).evaluate(element => {
    const s = getComputedStyle(element);
    return { shadow: s.boxShadow, outline: s.outlineStyle, borderLeft: s.borderLeftWidth, background: s.backgroundColor };
  });
  for (const [owner, role, summary] of [
    ["node-sightseeing", "primary", ".oak-primary-summary"],
    ["node-transport", "journey", ".oak-support-summary"],
    ["node-lodging", "base", ".oak-support-summary"],
    ["node-logistics", "task", ".oak-support-summary"],
  ] as const) {
    await page.evaluate(id => window.oak!.probe.actions!.selectNode(id), owner); await settle(page);
    const row = `.oak-row[data-role="${role}"][data-owner-id="${owner}"]`;
    await expect(page.locator(row)).toHaveAttribute("data-selected", "true");
    const selected = await style(`${row} > ${summary}`);
    expect(selected.shadow, `${role} selection`).toContain("1px 0px 0px 0px inset");
    expect(selected.shadow, `${role} selection`).not.toContain("3px 0px 0px 0px inset");
    expect(selected.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(selected.outline).toBe("none");
    expect(Number.parseFloat(selected.borderLeft)).toBeLessThanOrEqual(1);
    expect((await style(row)).outline).toBe("none");
  }
  await page.evaluate(() => window.oak!.probe.actions!.selectRoute("route-walking", "list")); await settle(page);
  const connector = '.oak-connector-row[data-owner-id="route-walking"][data-selected="true"]';
  const connectorStyle = await style(`${connector} > .oak-route-selection`);
  expect(connectorStyle.shadow).toContain("1px 0px 0px 0px inset");
  expect(connectorStyle.outline).toBe("none");
  expect(Number.parseFloat(connectorStyle.borderLeft)).toBeLessThanOrEqual(1);

  await page.goto("/?case=experience-default&variant=full-day&content=unreviewed"); await settle(page);
  await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("expanded")); await settle(page);
  for (const [owner, role] of [["node-unresolved", "primary"], ["node-transport", "journey"], ["node-lodging", "base"], ["node-logistics", "task"]] as const) {
    await page.evaluate(id => window.oak!.probe.actions!.selectNode(id), owner); await settle(page);
    const row = `.oak-row[data-role="${role}"][data-owner-id="${owner}"][data-unresolved="true"]`;
    expect((await style(row)).outline, `${role} unresolved row`).toBe("none");
    const cue = page.locator(`${row} ${role === "task" ? ".oak-row-location" : ".oak-unresolved-facts .oak-row-location"}`);
    await expect(cue).toContainText("地點尚未驗證");
    expect(await cue.evaluate(element => getComputedStyle(element).textDecorationStyle)).toBe("dotted");
  }

  const truth = variants.find(item => item.visualCase.id === "selection-truth" && item.variant.id === "selected-unresolved")!;
  await openCase(page, truth.visualCase, truth.variant);
  const skipped = page.locator('.oak-primary-row[data-owner-id="node-shopping"][data-skipped="true"]');
  await expect(skipped).toBeVisible();
  expect(await skipped.evaluate(element => getComputedStyle(element).borderBottomStyle)).toBe("dashed");
  await page.emulateMedia({ forcedColors: "active" });
  const unresolved = page.locator('.oak-primary-row[data-owner-id="node-unresolved"][data-selected="true"]');
  expect((await style('.oak-primary-row[data-owner-id="node-unresolved"] > .oak-primary-summary')).outline).toBe("double");
  expect((await style('.oak-primary-row[data-owner-id="node-unresolved"]')).outline).toBe("none");
  await expect(unresolved.locator(".oak-unresolved-facts .oak-row-location")).toContainText("地點尚未驗證");
  expect(await skipped.evaluate(element => getComputedStyle(element).borderBottomStyle)).toBe("dashed");

  await page.emulateMedia({ forcedColors: "none" });
  const candidate = variants.find(item => item.visualCase.id === "candidate-open" && item.variant.id === "draft")!;
  await openCase(page, candidate.visualCase, candidate.variant);
  const chosen = page.locator('.oak-candidate-option[aria-pressed="true"]');
  await expect(chosen).toBeVisible();
  const chosenStyle = await chosen.evaluate(element => { const s = getComputedStyle(element); return { shadow: s.boxShadow, outline: s.outlineStyle, borderLeft: s.borderLeftWidth, borderColor: s.borderLeftColor, background: s.backgroundColor, text: element.textContent }; });
  const persistedStyle = await page.locator('.oak-candidate-decision li[data-selected="true"] > .oak-candidate-option').evaluate(element => { const s = getComputedStyle(element); return { borderColor: s.borderLeftColor, background: s.backgroundColor }; });
  expect(chosenStyle.shadow).toBe("none");
  expect(chosenStyle.borderColor).toBe(persistedStyle.borderColor);
  expect(chosenStyle.background).toBe(persistedStyle.background);
  expect(chosenStyle.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(chosenStyle.outline).toBe("none");
  expect(Number.parseFloat(chosenStyle.borderLeft)).toBe(1);
  expect(chosenStyle.text).toContain("預覽中");
});

test("current and forced-colors selected owners keep separate noncolor cues", async ({ page }) => {
  const item = variants.find(item => item.visualCase.id === "accessibility-media" && item.variant.scenario.media === "forced-colors")!;
  await openCase(page, item.visualCase, item.variant);
  await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("expanded")); await settle(page);
  const computed = async (selector: string) => page.locator(selector).evaluate(element => {
    const s = getComputedStyle(element);
    return { shadow: s.boxShadow, outline: s.outlineStyle, borderLeft: s.borderLeftWidth, text: element.textContent };
  });
  const current = '.oak-primary-row[data-owner-id="node-sightseeing"][data-current="true"][data-selected="true"]';
  await expect(page.locator(current)).toHaveAttribute("aria-current", "step");
  await expect(page.locator(`${current} .oak-row-status [data-state="current"]`)).toContainText("目前");
  expect(await page.locator(`${current} .oak-row-status [data-state="current"]`).evaluate(element => getComputedStyle(element).textDecorationLine)).toBe("underline");
  expect((await computed(`${current} > .oak-primary-summary`)).outline).toBe("double");
  expect((await computed(current)).outline).toBe("none");

  for (const [owner, role] of [["node-transport", "journey"], ["node-lodging", "base"], ["node-logistics", "task"]] as const) {
    await page.evaluate(id => window.oak!.probe.actions!.selectNode(id), owner); await settle(page);
    const row = `.oak-row[data-role="${role}"][data-owner-id="${owner}"][data-selected="true"]`;
    await expect(page.locator(`${row} .oak-row-selection`)).toHaveAttribute("aria-pressed", "true");
    const summary = await computed(`${row} > .oak-support-summary`);
    expect(summary.outline, role).toBe("double");
    expect(Number.parseFloat(summary.borderLeft)).toBeLessThanOrEqual(1);
    expect(summary.text?.trim().length).toBeGreaterThan(0);
    expect((await computed(row)).outline).toBe("none");
  }

  await page.evaluate(() => window.oak!.probe.actions!.selectRoute("route-walking", "list")); await settle(page);
  const connector = '.oak-connector-row[data-owner-id="route-walking"][data-selected="true"]';
  await expect(page.locator(`${connector} > .oak-route-selection`)).toHaveAttribute("aria-pressed", "true");
  const route = await computed(`${connector} > .oak-route-selection`);
  expect(route.outline).toBe("double");
  expect(Number.parseFloat(route.borderLeft)).toBeLessThanOrEqual(1);
  expect(route.text).toContain("步行");
  expect((await computed(connector)).outline).toBe("none");

  const candidate = variants.find(entry => entry.visualCase.id === "candidate-open" && entry.variant.id === "draft")!;
  await openCase(page, candidate.visualCase, candidate.variant);
  await page.emulateMedia({ forcedColors: "active" });
  const option = page.locator('.oak-candidate-option[aria-pressed="true"]');
  await expect(option).toBeVisible();
  const choice = await computed('.oak-candidate-option[aria-pressed="true"]');
  expect(choice.outline).toBe("double");
  expect(Number.parseFloat(choice.borderLeft)).toBeLessThanOrEqual(1);
  expect(choice.text).toContain("預覽中");
  const persisted = page.locator('.oak-candidate-decision li[data-selected="true"]');
  await expect(persisted).toHaveCount(1);
  const persistedStyle = await computed('.oak-candidate-decision li[data-selected="true"]');
  expect(persistedStyle.outline).toBe("double");
  expect(persistedStyle.text).toContain("已選候選項目");
});

for (const [width, height, scale] of [[390, 844, 1], [1024, 900, 1], [320, 568, 2]] as const) {
  test(`actual-content polish unresolved scan and keyboard reachability ${width} at ${scale * 100}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto("/?case=selection-truth&variant=selected-unresolved"); await settle(page);
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; window.oak!.probe.actions!.setSheetSnap("expanded"); }, scale); await settle(page);
    const row = page.locator('.oak-primary-row[data-owner-id="node-unresolved"]');
    const selection = row.locator(".oak-row-selection");
    await selection.click(); await settle(page);
    await selection.scrollIntoViewIfNeeded();
    const geometry = await row.evaluate(element => {
      const rect = (target: Element) => { const r = target.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
      return { row: rect(element), selection: rect(element.querySelector(".oak-row-selection")!), location: rect(element.querySelector(".oak-row-location")!), text: element.textContent, outline: getComputedStyle(element).outlineStyle, viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth };
    });
    const phase = process.env.OAK_POLISH_PHASE ?? "after";
    await page.screenshot({ path: `/private/tmp/r110-${phase}-mixed-${width}.png` });
    console.log("ACTUAL_CONTENT_POLISH", JSON.stringify({ phase, width, scale, ...geometry }));
    await writeFile(info.outputPath("geometry.json"), JSON.stringify(geometry, null, 2));
    expect.soft(geometry.outline).toBe("none");
    expect(geometry.scrollWidth).toBe(width);
    for (const selector of [".oak-row-time", ".oak-row-title", ".oak-row-context", ".oak-row-location"]) {
      const text = row.locator(selector);
      await text.evaluate(element => element.scrollIntoView({ block: "center" }));
      const lines = await text.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); return [...range.getClientRects()].map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })); });
      for (const line of lines) { expect(line.left).toBeGreaterThanOrEqual(0); expect(line.right).toBeLessThanOrEqual(width); }
      const reachable = await text.evaluate(element => {
        const body = document.querySelector<HTMLElement>(".oak-sheet-body")!;
        const port = getComputedStyle(body).overflowY === "auto" ? body : document.querySelector<HTMLElement>(".oak-sheet-scroll")!;
        const clip = port.getBoundingClientRect(), top = Math.max(0, clip.top + port.clientTop), bottom = Math.min(innerHeight, clip.top + port.clientTop + port.clientHeight);
        const range = document.createRange(); range.selectNodeContents(element);
        return [...range.getClientRects()].map((_, index) => {
          let line = range.getClientRects()[index];
          if (line.top < top || line.bottom > bottom) port.scrollTop += line.top - top - 2;
          line = range.getClientRects()[index];
          return line.top >= top && line.bottom <= bottom;
        });
      });
      expect(reachable.every(Boolean), `${selector} complete text can be scrolled into the actual sheet viewport`).toBe(true);
    }
    for (const forcedColors of ["none", "active"] as const) {
      await page.emulateMedia({ forcedColors });
      await selection.focus(); await expect(selection).toBeFocused();
      expect(await selection.evaluate(element => getComputedStyle(element).outlineWidth)).toBe("3px");
      const cue = row.locator('.oak-unresolved-facts .oak-row-location');
      expect.soft(await cue.evaluate(element => getComputedStyle(element).textDecorationStyle)).toBe("dotted");
      expect(await row.locator(".oak-owner-details").evaluate(element => ({ transparent: getComputedStyle(element).backgroundColor.endsWith(", 0)"), outline: getComputedStyle(element).outlineStyle }))).toEqual({ transparent: true, outline: "none" });
    }
    await page.emulateMedia({ forcedColors: "none" });
    await page.locator('[data-owner-id="node-sightseeing"] .oak-row-selection').click(); await settle(page);
    await expect(selection).toHaveAttribute("aria-pressed", "false");
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/private/tmp/r110-${phase}-unselected-${width}.png` });
    await expect(row.locator('.oak-unresolved-facts .oak-row-location')).toBeVisible();
  });
}

test("actual-content polish unresolved node roles keep visible cues and focus outside details", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day&content=unreviewed"); await settle(page);
  await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("expanded")); await settle(page);
  for (const [owner, role] of [["node-unresolved", "primary"], ["node-lodging", "base"], ["node-transport", "journey"], ["node-logistics", "task"]]) {
    const row = page.locator(`.oak-${role}-row[data-owner-id="${owner}"]`), selection = row.locator(".oak-row-selection");
    for (const forcedColors of ["none", "active"] as const) {
      await page.emulateMedia({ forcedColors });
      await selection.click(); await settle(page);
      await selection.focus(); await expect(selection).toBeFocused();
      await expect(row).toHaveAttribute("data-unresolved", "true");
      await expect(selection).toHaveAttribute("aria-pressed", "true");
      const cue = row.locator(role === "task" ? '.oak-row-location' : '.oak-unresolved-facts .oak-row-location');
      await cue.scrollIntoViewIfNeeded(); await expect(cue).toContainText("地點尚未驗證");
      expect(await cue.evaluate(element => ({ line: getComputedStyle(element).textDecorationLine, style: getComputedStyle(element).textDecorationStyle }))).toEqual({ line: "underline", style: "dotted" });
      expect(await row.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("none");
      expect(await selection.evaluate(element => getComputedStyle(element).outlineWidth)).toBe("3px");
      const details = row.locator(".oak-owner-details");
      expect(await details.evaluate(element => ({ transparent: getComputedStyle(element).backgroundColor.endsWith(", 0)"), shadow: getComputedStyle(element).boxShadow, outline: getComputedStyle(element).outlineStyle }))).toEqual({ transparent: true, shadow: "none", outline: "none" });
      await page.keyboard.press("Tab");
      const controls = details.locator("button, input"); await expect(controls.first()).toBeFocused();
      for (let index = 1; index < await controls.count(); index++) { await page.keyboard.press("Tab"); await expect(controls.nth(index)).toBeFocused(); }
      const action = controls.last();
      await action.scrollIntoViewIfNeeded();
      const bounds = await action.boundingBox(); expect(bounds!.width).toBeGreaterThanOrEqual(44); expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
  }
});

test("long CJK primary facts reflow within their owner at 200 percent without shrinking actions", async ({ page }, info) => {
  const item = variants.find(item => item.visualCase.id === "candidate-zoom-200")!;
  await openCase(page, item.visualCase, item.variant);
  const evidence = await page.locator(".oak-primary-summary").evaluateAll(elements => elements.map(element => {
    const selection = element.querySelector<HTMLElement>(".oak-row-selection")!, box = selection.getBoundingClientRect();
    const slots = [...selection.querySelectorAll<HTMLElement>("[data-scan], .oak-row-time-end, .oak-row-time-certainty")].map(slot => {
      const walker = document.createTreeWalker(slot, NodeFilter.SHOW_TEXT);
      const bounds: DOMRect[] = [];
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        let hidden = false;
        for (let parent = text.parentElement; parent; parent = parent === slot ? null : parent.parentElement) {
          const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
          if (style.display === "none" || style.visibility === "hidden" || (style.clip !== "auto" && rect.width <= 1 && rect.height <= 1)) { hidden = true; break; }
        }
        if (!hidden) { const range = document.createRange(); range.selectNodeContents(text); bounds.push(...range.getClientRects()); }
      }
      return { text: slot.textContent, fits: bounds.every(r => r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom) };
    });
    const action = element.querySelector(".oak-row-action")?.getBoundingClientRect();
    return { slots, action: action ? { width: action.width, height: action.height } : null, width: box.width, height: box.height };
  }));
  await retainNoticeEvidence(info, "primary-long-CJK", evidence);
  expect(evidence.length).toBeGreaterThan(5);
  for (const row of evidence) {
    expect(row.slots.some(slot => slot.text?.startsWith("合成"))).toBe(true);
    for (const slot of row.slots) expect(slot.fits, slot.text ?? "empty status").toBe(true);
    expect(row.width).toBeGreaterThanOrEqual(44); expect(row.height).toBeGreaterThanOrEqual(44);
    if (row.action) { expect(row.action.width).toBeGreaterThanOrEqual(44); expect(row.action.height).toBeGreaterThanOrEqual(44); }
  }
});

for (const width of [320, 366, 390, 430]) test(`primary summary keeps a compact scan line and confines selection at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("expanded")); await settle(page);
  const current = page.locator('.oak-primary-row[data-owner-id="node-sightseeing"]');
  await current.locator(".oak-primary-summary").scrollIntoViewIfNeeded(); await settle(page);
  const port = page.locator(".oak-sheet-scroll");
  const point = await port.evaluate(element => { const r = element.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(point.x, point.y); await page.mouse.wheel(0, -100); await settle(page);
  await page.screenshot({ path: info.outputPath(`primary-${width}.png`) });
  const rows = await page.locator(".oak-primary-row").evaluateAll(elements => elements.map(element => {
    const rect = (selector: string) => { const r = element.querySelector(selector)?.getBoundingClientRect(); return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } : null; };
    const style = (target: Element) => { const s = getComputedStyle(target); return { background: s.backgroundColor, shadow: s.boxShadow, outline: s.outlineStyle }; };
    const summary = element.querySelector(".oak-primary-summary")!;
    const timing = element.querySelector(".oak-row-time-end");
    const range = document.createRange(); if (timing) range.selectNodeContents(timing);
    const details = element.querySelector(".oak-owner-details");
    return { owner: element.getAttribute("data-owner-id"), selected: element.getAttribute("data-selected") === "true", summary: rect(".oak-primary-summary")!, mark: rect(".oak-semantic-mark")!, time: rect(".oak-row-time")!, title: rect(".oak-row-title")!, action: rect(".oak-row-action"), end: rect(".oak-row-time-end"), endLines: timing ? range.getClientRects().length : 0, rowStyle: style(element), summaryStyle: style(summary), detailsStyle: details ? style(details) : null };
  }));
  await retainNoticeEvidence(info, "primary-geometry", rows);
  for (const row of rows) {
    expect.soft(row.title.width, row.owner!).toBeGreaterThanOrEqual(120);
    if (Math.abs(row.title.left - row.time.left) <= 1) expect.soft(row.title.top, row.owner!).toBeGreaterThanOrEqual(row.time.bottom - 1);
    else { expect.soft(Math.abs(row.title.top - row.time.top), row.owner!).toBeLessThanOrEqual(3); expect.soft(row.time.right, row.owner!).toBeLessThanOrEqual(row.title.left); }
    if (row.action) { expect.soft(row.action.top, row.owner!).toBeLessThanOrEqual(row.title.top + 3); expect.soft(row.action.left, row.owner!).toBeGreaterThanOrEqual(row.title.right); }
    if (row.end) { expect.soft(row.end.width, row.owner!).toBeGreaterThan(52); expect.soft(row.endLines, row.owner!).toBe(1); }
    if (row.selected) {
      expect.soft(row.rowStyle.background).toBe("rgba(0, 0, 0, 0)"); expect.soft(row.rowStyle.shadow).toBe("none");
      expect.soft(row.summaryStyle.background).not.toBe("rgba(0, 0, 0, 0)"); expect.soft(row.summaryStyle.shadow).toContain("1px 0px 0px 0px inset");
      expect(row.detailsStyle).toEqual({ background: "rgba(0, 0, 0, 0)", shadow: "none", outline: "none" });
    }
  }
});

async function retainNoticeEvidence(info: TestInfo, name: string, evidence: unknown) {
  const path = info.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(evidence, null, 2));
  await info.attach(name, { path, contentType: "application/json" });
}

test("supporting rows scan across time and title with compact inline navigation", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  await page.getByRole("button", { name: "展開行程", exact: true }).click(); await settle(page);
  const phase = process.env.OAK_BATCH11_PHASE;
  const evidence = [];
  for (const role of ["journey", "base", "task"] as const) {
    const row = page.locator(`.oak-${role}-row`).first();
    await expect(row).toHaveCount(1);
    await row.locator(".oak-row-selection").scrollIntoViewIfNeeded(); await settle(page);
    if (phase === "before" || phase === "after") await page.screenshot({ path: `.superpowers/sdd/2026-09-04-eternal-pose-v2-04-oak-washi/oak-batch11-${phase}-${role}-390.png` });
    evidence.push(await row.evaluate(element => {
      const rect = (selector: string) => { const r = element.querySelector(selector)?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom } : null; };
      const selected = element.getAttribute("data-selected") === "true";
      const summary = element.querySelector<HTMLElement>(".oak-support-summary");
      const style = (target: Element | null) => target ? { background: getComputedStyle(target).backgroundColor, shadow: getComputedStyle(target).boxShadow } : null;
      const r = element.getBoundingClientRect();
      return { role: element.getAttribute("data-role"), owner: element.getAttribute("data-owner-id"), selected, row: { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }, summary: rect(".oak-support-summary"), time: rect(".oak-row-time"), title: rect(".oak-row-title"), timing: rect(".oak-support-timing"), navigation: rect(".oak-row-action"), mark: rect(".oak-semantic-mark"), selection: rect(".oak-row-selection"), details: rect(".oak-owner-details"), rowStyle: style(element), summaryStyle: style(summary), detailsStyle: style(element.querySelector(".oak-owner-details")), text: element.textContent };
    }));
  }
  if (phase === "before" || phase === "after") await writeFile(`.superpowers/sdd/2026-09-04-eternal-pose-v2-04-oak-washi/oak-batch11-${phase}-390.json`, JSON.stringify(evidence, null, 2));
  for (const row of evidence) {
    expect(Math.abs(row.time!.y - row.title!.y), row.role!).toBeLessThanOrEqual(3);
    if (row.navigation) {
      expect(row.navigation.x, row.role!).toBeGreaterThanOrEqual(row.title!.right - 1);
      expect(row.navigation.y, row.role!).toBeLessThanOrEqual(row.title!.y + 3);
      expect(row.navigation.width, row.role!).toBeGreaterThanOrEqual(44);
      expect(row.navigation.height, row.role!).toBeGreaterThanOrEqual(44);
    }
    expect(row.summary, row.role!).not.toBeNull();
    expect(row.timing!.y, row.role!).toBeGreaterThanOrEqual(row.title!.bottom - 1);
  }
});

for (const width of [160, 390]) test(`support selection and navigation remain usable at ${width} CSS pixels`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  await page.getByRole("button", { name: "展開行程", exact: true }).click(); await settle(page);
  for (const role of ["journey", "base", "task"] as const) {
    const row = page.locator(`.oak-${role}-row`).first();
    const selection = row.locator(".oak-row-selection");
    await selection.scrollIntoViewIfNeeded(); await settle(page);
    const dimensions = await row.evaluate(element => {
      const summary = element.querySelector<HTMLElement>(".oak-support-summary")!;
      const selection = element.querySelector<HTMLElement>(".oak-row-selection")!;
      const action = element.querySelector<HTMLElement>(".oak-row-action");
      const rect = (target: HTMLElement) => { const box = target.getBoundingClientRect(); return { width: box.width, height: box.height, left: box.left, right: box.right }; };
      return { summary: rect(summary), selection: rect(selection), action: action ? rect(action) : null, scrollWidth: summary.scrollWidth, clientWidth: summary.clientWidth, documentWidth: document.documentElement.scrollWidth };
    });
    expect(dimensions.documentWidth, `${role}: document`).toBe(width);
    expect(dimensions.scrollWidth, `${role}: summary`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    expect(dimensions.selection.width, `${role}: selection width`).toBeGreaterThanOrEqual(44);
    expect(dimensions.selection.height, `${role}: selection height`).toBeGreaterThanOrEqual(44);
    await selection.click(); await settle(page);
    await expect(selection).toHaveAttribute("aria-pressed", "true");
    const action = row.locator(".oak-row-action");
    if (role === "task") { await expect(action).toHaveCount(0); continue; }
    expect(dimensions.action?.width, `${role}: navigation width`).toBeGreaterThanOrEqual(44);
    expect(dimensions.action?.height, `${role}: navigation height`).toBeGreaterThanOrEqual(44);
    const before = await page.evaluate(() => window.oak!.providers.navigation.calls.length);
    await action.click(); await settle(page);
    expect(await page.evaluate(() => window.oak!.providers.navigation.calls.length), `${role}: navigation`).toBe(before + 1);
  }
});

for (const width of [320, 366, 430]) test(`supporting rows keep two scan columns and reachable actions at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  await page.getByRole("button", { name: "展開行程", exact: true }).click(); await settle(page);
  for (const role of ["journey", "base", "task"] as const) {
    const row = page.locator(`.oak-${role}-row`).first();
    if (width === 320) {
      await row.locator(".oak-row-selection").scrollIntoViewIfNeeded(); await settle(page);
      await page.screenshot({ path: `.superpowers/sdd/2026-09-04-eternal-pose-v2-04-oak-washi/oak-batch11-after-${role}-320.png` });
    }
    const sample = await row.evaluate(element => {
      const box = (selector: string) => { const r = element.querySelector(selector)?.getBoundingClientRect(); return r ? { left: r.left, top: r.top, right: r.right, width: r.width, height: r.height } : null; };
      return { time: box(".oak-row-time"), title: box(".oak-row-title"), action: box(".oak-row-action"), summary: box(".oak-support-summary"), selection: box(".oak-row-selection"), documentWidth: document.documentElement.scrollWidth };
    });
    expect(sample.documentWidth, role).toBe(width);
    if (Math.abs(sample.title!.left - sample.time!.left) <= 1) expect(sample.title!.top, role).toBeGreaterThanOrEqual(sample.time!.top - 1);
    else { expect(Math.abs(sample.time!.top - sample.title!.top), role).toBeLessThanOrEqual(3); expect(sample.time!.right, role).toBeLessThanOrEqual(sample.title!.left + 1); }
    expect(sample.title!.width, role).toBeGreaterThanOrEqual(100);
    expect(sample.selection!.height, role).toBeGreaterThanOrEqual(44);
    if (sample.action) {
      expect(sample.action.left, role).toBeGreaterThanOrEqual(sample.title!.right - 1);
      expect(sample.action.top, role).toBeLessThanOrEqual(sample.title!.top + 3);
      expect(sample.action.width, role).toBeGreaterThanOrEqual(44);
      expect(sample.action.height, role).toBeGreaterThanOrEqual(44);
    }
  }
});

test("support selection keeps details outside its fill and invokes supplied navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  await page.getByRole("button", { name: "展開行程", exact: true }).click(); await settle(page);
  for (const role of ["journey", "base", "task"] as const) {
    const row = page.locator(`.oak-${role}-row`).first();
    const ownerId = await row.getAttribute("data-owner-id");
    await row.locator(".oak-row-selection").click(); await settle(page);
    await expect(row).toHaveAttribute("data-selected", "true");
    await expect(row.locator(".oak-row-selection")).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => window.oak!.probe.experience!.model.owners.selectedId)).toBe(ownerId);
    await row.locator(".oak-support-summary").scrollIntoViewIfNeeded(); await settle(page);
    await page.screenshot({ path: `.superpowers/sdd/2026-09-04-eternal-pose-v2-04-oak-washi/oak-batch11-after-selected-${role}-390.png` });
    const styles = await row.evaluate(element => {
      const summary = element.querySelector(".oak-support-summary")!;
      const details = element.querySelector(".oak-owner-details");
      const style = (target: Element) => ({ background: getComputedStyle(target).backgroundColor, shadow: getComputedStyle(target).boxShadow });
      return { row: style(element), summary: style(summary), details: details ? style(details) : null, owned: details?.closest(".oak-row") === element && !summary.contains(details) };
    });
    expect(styles.row).toEqual({ background: "rgba(0, 0, 0, 0)", shadow: "none" });
    expect(styles.summary.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(styles.summary.shadow).toContain("1px 0px 0px 0px inset");
    expect(styles.details?.background).toBe("rgba(0, 0, 0, 0)");
    expect(styles.owned).toBe(true);
    if (role !== "task") {
      const navigation = row.locator(".oak-row-action");
      const before = await page.evaluate(() => window.oak!.providers.navigation.calls.length);
      await navigation.click(); await settle(page);
      const calls = await page.evaluate(() => window.oak!.providers.navigation.calls);
      expect(calls).toHaveLength(before + 1);
      expect(calls.at(-1)?.kind).toBe("place");
    } else await expect(row.locator(".oak-semantic-mark, .oak-row-action")).toHaveCount(0);
    await page.emulateMedia({ forcedColors: "active" });
    const outline = await row.locator(".oak-support-summary").evaluate(element => ({ style: getComputedStyle(element).outlineStyle, width: getComputedStyle(element).outlineWidth }));
    expect(outline).toEqual({ style: "double", width: "3px" });
    await page.emulateMedia({ forcedColors: "none" });
  }
});

test("supporting text and controls remain individually reachable at 200 percent on 320px", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  await page.getByRole("button", { name: "展開行程", exact: true }).click(); await settle(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; }); await settle(page);
  const evidence = [];
  for (const role of ["journey", "base", "task"] as const) {
    const row = page.locator(`.oak-${role}-row`).first();
    const ownerId = await row.getAttribute("data-owner-id");
    await row.locator(".oak-row-selection").click(); await settle(page);
    expect(await page.evaluate(() => window.oak!.probe.experience!.model.owners.selectedId)).toBe(ownerId);
    await row.locator(".oak-row-title").scrollIntoViewIfNeeded(); await settle(page);
    await page.screenshot({ path: `.superpowers/sdd/2026-09-04-eternal-pose-v2-04-oak-washi/oak-batch11-after-zoom-${role}-320.png` });
    const targets = row.locator(".oak-semantic-mark, .oak-journey-heading > span:last-child, .oak-base-anchor > span:last-child, .oak-row-selection [data-scan], .oak-task-progress, .oak-row-action");
    for (const target of await targets.all()) {
      if (!await target.isVisible()) continue;
      await target.scrollIntoViewIfNeeded(); await settle(page);
      const sample = await target.evaluate(element => {
        const port = element.closest<HTMLElement>(".oak-sheet-scroll")!;
        const clip = port.getBoundingClientRect(), box = element.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(element);
        const isAction = element.classList.contains("oak-row-action"), isMark = element.classList.contains("oak-semantic-mark");
        const kind = element.getAttribute("data-scan") ?? (isAction ? "action" : isMark ? "mark" : "heading");
        return { kind, isAction, isMark, text: element.textContent, width: box.width, height: box.height,
          fitsClip: box.left >= clip.left - 1 && box.right <= clip.right + 1 && box.top >= clip.top - 1 && box.bottom <= clip.bottom + 1,
          textFits: [...range.getClientRects()].every(r => r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1),
          pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
      });
      evidence.push({ role, ...sample });
      expect(sample.pageWidth, `${role} ${sample.kind}`).toBe(sample.viewportWidth);
      expect(sample.fitsClip, `${role} ${sample.kind}`).toBe(true);
      expect(sample.textFits, `${role} ${sample.kind}`).toBe(true);
      if (!sample.isAction && !sample.isMark) expect(sample.text?.trim().length, `${role} ${sample.kind}`).toBeGreaterThan(0);
      if (sample.isAction) { expect(sample.width).toBeGreaterThanOrEqual(44); expect(sample.height).toBeGreaterThanOrEqual(44); }
      if (sample.isMark) expect(sample.width).toBe(40);
    }
  }
  await writeFile(".superpowers/sdd/2026-09-04-eternal-pose-v2-04-oak-washi/oak-batch11-after-zoom-320.json", JSON.stringify(evidence, null, 2));
});

test("default full day keeps selected shopping facts while idle place chrome stays quiet", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  await page.getByRole("button", { name: "展開行程", exact: true }).click(); await settle(page);
  const shopping = page.locator('.oak-primary-row[data-owner-id="node-shopping"]');
  await shopping.locator(".oak-row-selection").click(); await settle(page);
  await shopping.scrollIntoViewIfNeeded(); await settle(page);
  await page.screenshot({ path: info.outputPath("quiet-idle-shopping-390.png") });
  const evidence = await shopping.evaluate(element => {
    const model = window.oak!.probe.experience!.model;
    const place = model.places.find(item => item.ownerId === "node-shopping");
    const list = element.querySelector<HTMLElement>(".oak-shopping-progress")!;
    const actions = element.querySelector<HTMLElement>(".oak-owner-details > .oak-detail-actions")!;
    return { placeStatus: place?.runtime.status, selectedId: model.owners.selectedId, rowHeight: element.getBoundingClientRect().height, detailHeight: element.querySelector(".oak-owner-details")?.getBoundingClientRect().height, actionGap: actions.getBoundingClientRect().top - list.getBoundingClientRect().bottom, text: element.textContent };
  });
  await retainNoticeEvidence(info, "quiet-idle-shopping-390", evidence);
  expect(evidence.placeStatus).toBe("idle");
  expect(evidence.selectedId).toBe("node-shopping");
  await expect(shopping.locator(".oak-shopping-progress")).toBeAttached();
  await expect(shopping.locator("[data-provider-state]")).toHaveCount(0);
  await expect(shopping.getByText("地點 · 尚未開始", { exact: true })).toHaveCount(0);
  expect(evidence.actionGap).toBeGreaterThanOrEqual(8);
});

for (const state of ["flight", "unknown"] as const) test(`selected idle ${state} route keeps authored facts and reachable selection`, async ({ page }, info) => {
  const item = variants.find(candidate => candidate.visualCase.id === "route-state-matrix" && candidate.variant.id === state)!;
  await page.setViewportSize(item.variant.viewport);
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce", colorScheme: "light" });
  await page.goto(`/?case=${item.visualCase.id}&variant=${item.variant.id}`); await settle(page);
  const row = page.locator('.oak-connector-row[data-owner-id="route-walking"]');
  await row.locator(".oak-route-selection").click(); await settle(page);
  await row.scrollIntoViewIfNeeded(); await settle(page);
  await page.screenshot({ path: info.outputPath(`quiet-idle-${state}-390.png`) });
  const facts = row.locator(".oak-route-facts");
  const model = await page.evaluate(() => window.oak!.probe.experience!.model);
  const route = model.routes.find(route => route.routeId === "route-walking")!;
  const initialHeight = await row.evaluate(element => element.getBoundingClientRect().height);
  await retainNoticeEvidence(info, `quiet-idle-${state}-390`, { status: route.runtime.status, selected: route.selected, mode: route.mode, certainty: route.certainty, authored: route.authored, rowHeight: initialHeight });
  expect(route.runtime.status).toBe("idle");
  expect(route.selected).toBe(true);
  await expect(facts).toHaveAttribute("data-route-state", "idle");
  await expect(facts).toContainText(state === "flight" ? "航班" : "未指定移動方式");
  await expect(facts).not.toContainText("建議");
  await expect(row.locator(".oak-route-details")).toContainText("建議");
  await expect(row.locator("[data-provider-state]")).toHaveCount(0);
  await expect(row.getByText("路線 · 尚未開始", { exact: true })).toHaveCount(0);
  await expect(row.locator(".oak-route-selection")).toHaveAttribute("aria-pressed", "true");
  if (state === "unknown") {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; }); await settle(page);
    await row.scrollIntoViewIfNeeded(); await settle(page);
    const geometry = await row.evaluate(element => {
      const port = element.closest<HTMLElement>(".oak-sheet-scroll")!;
      const p = port.getBoundingClientRect(), r = element.getBoundingClientRect();
      const selection = element.querySelector<HTMLElement>(".oak-route-selection")!;
      const s = selection.getBoundingClientRect();
      return { pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, rowHeight: r.height, controlHeight: s.height, fits: r.top >= p.top + port.clientTop - 1 && r.bottom <= p.top + port.clientTop + port.clientHeight + 1 && s.left >= p.left - 1 && s.right <= p.right + 1 };
    });
    await retainNoticeEvidence(info, "quiet-idle-unknown-320-zoom", geometry);
    expect(geometry.pageWidth).toBe(geometry.viewportWidth);
    expect(geometry.controlHeight).toBeGreaterThanOrEqual(44);
    expect(geometry.fits).toBe(true);
    for (const text of ["未指定移動方式", "服務提供者路線 · 建議"]) {
      const fact = text === "未指定移動方式" ? facts.getByText(text, { exact: true }) : row.locator(".oak-route-evidence");
      await expect(fact).toHaveText(text);
      await fact.scrollIntoViewIfNeeded();
      expect(await fact.evaluate(element => { const r = element.getBoundingClientRect(), p = element.closest(".oak-sheet-scroll")!.getBoundingClientRect(); return r.left >= p.left && r.right <= p.right && r.top >= p.top && r.bottom <= p.bottom; })).toBe(true);
    }
    await expect(row.locator(".oak-route-selection")).toBeVisible();
  }
});

for (const state of ["memory-only", "location-denied", "location-unavailable"]) for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) test(`global notice ${state} remains available through itinerary interaction at ${viewport.width}`, async ({ page }, info) => {
  const item = variants.find(item => item.visualCase.id === "runtime-degraded" && item.variant.id === state)!;
  await page.setViewportSize(viewport);
  await page.goto(`/?case=runtime-degraded&variant=${state}`);
  await settle(page);
  if (state.startsWith("location-")) { await page.evaluate(() => window.oak!.probe.actions!.beginLocation()); await settle(page); }
  const text = ({ "memory-only": "關閉此頁面後，變更將會遺失。", "location-denied": "定位權限遭拒", "location-unavailable": "無法取得位置" } as Record<string, string>)[state];
  const notice = page.getByRole("status").filter({ hasText: text });
  await expect(notice).toHaveCount(1);
  const evidence = async (phase: string) => {
    const bounds = await notice.evaluate(element => {
      const r = element.getBoundingClientRect();
      const port = element.closest(".oak-upper-clearance")!;
      const p = port.getBoundingClientRect();
      const model = window.oak!.probe.experience!.model;
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, clipTop: Math.max(0, p.top + port.clientTop), clipBottom: Math.min(innerHeight, p.top + port.clientTop + port.clientHeight), clipLeft: p.left + port.clientLeft, clipRight: p.left + port.clientLeft + port.clientWidth, snap: model.sheet.snap, header: model.header.expanded, location: model.location, persistence: model.persistence, provider: model.map.provider.status };
    });
    await retainNoticeEvidence(info, `notice-${phase}`, bounds);
    expect(bounds.top).toBeGreaterThanOrEqual(bounds.clipTop);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.clipBottom);
    expect(bounds.left).toBeGreaterThanOrEqual(Math.max(0, bounds.clipLeft)); expect(bounds.right).toBeLessThanOrEqual(Math.min(viewport.width, bounds.clipRight));
    expect(bounds.provider).toBe("ready");
    if (state === "memory-only") expect(bounds.persistence.status).toBe("memory-only");
    else expect(bounds.location.status).toBe(state.replace("location-", ""));
    await commonGeometry(page, { ...item.variant, viewport, scenario: { ...item.variant.scenario, sheet: bounds.snap, header: bounds.header } });
  };
  await evidence("initial-unframed");
  const original = await notice.elementHandle();
  const port = page.locator('.oak-experience[data-chrome-scroll="true"] .oak-sheet-body, .oak-experience:not([data-chrome-scroll="true"]) .oak-sheet-scroll');
  await port.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const point = await port.evaluate(element => { const r = element.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const before = await port.evaluate(element => element.scrollTop);
  expect(before).toBeGreaterThan(0);
  await page.mouse.move(point.x, point.y); await page.mouse.wheel(0, -2000);
  await expect.poll(() => port.evaluate(element => element.scrollTop)).toBeLessThan(before);
  await evidence("list-wheel");
  const returnButton = page.getByRole("button", { name: "返回目前行程", exact: true });
  await returnButton.click(); await settle(page);
  await expect(returnButton).toBeFocused();
  await evidence("return-current");
  for (const snap of ["collapsed", "expanded", "half"] as const) {
    for (const expanded of [false, true]) {
      await page.evaluate(({ snap, expanded }) => { window.oak!.probe.actions!.setSheetSnap(snap); window.oak!.probe.actions!.setHeaderExpanded(expanded); }, { snap, expanded });
      await settle(page); await evidence(`${snap}-header-${expanded}`);
      expect(await original.evaluate(element => element.isConnected)).toBe(true);
      await expect(notice).toHaveCount(1);
    }
  }
  const targets = await page.locator(".oak-upper-clearance button, .oak-sheet-handle button").evaluateAll(elements => elements.filter(element => !element.closest("[inert]")).map(element => { const r = element.getBoundingClientRect(); return { width: r.width, height: r.height }; }));
  expect(targets.every(r => r.width >= 44 && r.height >= 44)).toBe(true);
});

for (const state of ["memory-only", "location-denied", "location-unavailable"]) test(`global notice ${state} remains keyboard discoverable with crowded chrome and 200 percent text`, async ({ page }, info) => {
  const item = variants.find(item => item.visualCase.id === "runtime-degraded" && item.variant.id === state)!;
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto(`/?case=runtime-degraded&variant=${state}`); await settle(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
    for (const [side, value] of Object.entries({ top: 20, right: 13, bottom: 34, left: 7 })) document.documentElement.style.setProperty(`--oak-safe-area-${side}`, `${value}px`);
    window.oak!.probe.actions!.setHeaderExpanded(true);
    window.oak!.probe.actions!.setSheetSnap("expanded");
  });
  await settle(page);
  if (state.startsWith("location-")) { await page.evaluate(() => window.oak!.probe.actions!.beginLocation()); await settle(page); }
  const upper = page.locator(".oak-upper-clearance");
  const pressUpperKey = async (key: string) => {
    await page.keyboard.press(key);
    // Harness readiness tracks sheet geometry, not native keyboard scrolling.
    // Observe the real upper port until its position settles; do not jump it.
    const motion = await upper.evaluate(element => new Promise<{ initial: number; final: number; frames: number }>((resolve, reject) => {
      const initial = element.scrollTop;
      let previous = initial, stable = 0, frames = 0;
      const deadline = performance.now() + 2000;
      const frame = () => {
        frames += 1;
        const current = element.scrollTop;
        stable = current === previous ? stable + 1 : 0;
        previous = current;
        if (stable >= 4) resolve({ initial, final: current, frames });
        else if (performance.now() > deadline) reject(new Error("Native upper scroll did not settle"));
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }));
    if (motion.initial !== motion.final) await retainNoticeEvidence(info, `native-upper-key-${key}`, motion);
    await settle(page);
  };
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 320, height: 400 }]) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ forcedColors: viewport.height === 400 ? "active" : "none" }); await settle(page);
    const crowded = await page.locator(".oak-experience").getAttribute("data-chrome-scroll") === "true";
    if (viewport.height === 400) expect(crowded).toBe(true);
    if (crowded) {
      await expect(upper).toHaveAttribute("tabindex", "0");
      await upper.focus(); await pressUpperKey("End");
      await expect.poll(() => upper.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    }
    const notice = page.locator(".oak-global-notices > [role=status]");
    const fits = () => notice.evaluate(element => {
      const r = element.getBoundingClientRect(); const upper = element.closest(".oak-upper-clearance")!; const p = upper.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(element);
      const text = [...range.getClientRects()].map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }));
      const clip = { left: p.left + upper.clientLeft, right: p.left + upper.clientLeft + upper.clientWidth, top: p.top + upper.clientTop, bottom: p.top + upper.clientTop + upper.clientHeight };
      return { text, clip, top: r.top, bottom: r.bottom, firstFits: text.length > 0 && text[0].left >= clip.left && text[0].right <= clip.right && text[0].top >= clip.top && text[0].bottom <= clip.bottom, lastFits: text.length > 0 && text.at(-1)!.left >= clip.left && text.at(-1)!.right <= clip.right && text.at(-1)!.top >= clip.top && text.at(-1)!.bottom <= clip.bottom };
    });
    if (crowded) {
      await upper.focus(); await pressUpperKey("Home");
      for (let step = 0; step < 80 && !(await fits()).firstFits; step++) await pressUpperKey("ArrowDown");
    }
    await expect.poll(async () => (await fits()).firstFits).toBe(true);
    if (crowded) {
      await pressUpperKey("End");
      for (let step = 0; step < 80 && !(await fits()).lastFits; step++) await pressUpperKey("ArrowUp");
      await expect.poll(async () => (await fits()).lastFits).toBe(true);
    }
    await retainNoticeEvidence(info, `notice-${viewport.width}x${viewport.height}`, { crowded, geometry: await fits() });
    await commonGeometry(page, { ...item.variant, viewport, scenario: { ...item.variant.scenario, sheet: "expanded", header: true, textScale: 2, safeArea: [20, 13, 34, 7] } });
    const legal = page.locator("[data-fake-legal]"); await legal.focus(); await page.keyboard.press("Enter"); await expect(legal).toHaveAttribute("data-activated", "true");
  }
});

test("persistent storage and idle location reserve no global-notice space", async ({ page }) => {
  const item = variants.find(item => item.visualCase.id === "experience-default")!;
  await openCase(page, item.visualCase, item.variant);
  await expect(page.locator(".oak-global-notices")).toHaveCount(0);
  const geometry = await page.locator(".oak-header-content").evaluate(element => {
    const wrapper = element.getBoundingClientRect(); const header = element.firstElementChild!.getBoundingClientRect();
    return { wrapper: { top: wrapper.top, bottom: wrapper.bottom, height: wrapper.height }, header: { top: header.top, bottom: header.bottom, height: header.height } };
  });
  expect(geometry.wrapper).toEqual(geometry.header);
});

test("Home selected day keeps text, alignment, targets and keyboard focus in normal and forced colors", async ({ page }) => {
  for (const item of variants.filter(item => item.variant.mode === "home")) {
    await openCase(page, item.visualCase, item.variant);
    for (const forcedColors of ["none", "active"] as const) {
      await page.emulateMedia({ forcedColors });
      const selected = page.locator('.oak-home-day-index > li[aria-current="true"]');
      await expect(selected).toContainText("已選取");
      const geometry = await selected.evaluate(element => {
        const css = getComputedStyle(element);
        const list = element.parentElement!.getBoundingClientRect();
        const heading = element.querySelector("h3")!.getBoundingClientRect();
        const button = element.querySelector("button")!.getBoundingClientRect();
        return { border: css.borderInlineStartWidth, padding: css.paddingInlineStart, headingLeft: heading.left, listLeft: list.left, width: button.width, height: button.height };
      });
      expect(geometry.border).toBe("0px"); expect(Number.parseFloat(geometry.padding)).toBeGreaterThanOrEqual(48);
      expect(geometry.headingLeft).toBeGreaterThan(geometry.listLeft);
      expect(geometry.width).toBeGreaterThanOrEqual(44); expect(geometry.height).toBeGreaterThanOrEqual(44);
      const button = selected.getByRole("button");
      await button.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
      await expect(button).toBeFocused();
      expect(await button.evaluate(element => { const css = getComputedStyle(element); return { style: css.outlineStyle, width: css.outlineWidth }; })).toEqual({ style: "solid", width: "3px" });
      console.log("Home selection geometry", item.name, forcedColors, geometry);
    }
  }
});

for (const overnight of [false, true]) for (const width of [320, 390, 430]) test(`timing numeric tokens stay on one line within their owner at ${width}px and 200 percent text${overnight ? " overnight" : ""}`, async ({ page }) => {
  const item = variants.find(item => item.visualCase.id === "accessibility-media" && item.variant.id === "text-reflow")!;
  if (overnight) {
    await page.goto("/?case=accessibility-media&variant=text-reflow&timing=overnight");
    await settle(page);
    await page.evaluate(() => { window.oak!.probe.actions!.selectNode("node-sightseeing"); window.oak!.probe.actions!.setSheetSnap("expanded"); });
  } else {
    await openCase(page, item.visualCase, item.variant);
    await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("expanded"));
  }
  await page.setViewportSize({ width, height: 932 });
  await settle(page);
  const timing = page.locator('[data-owner-id="node-sightseeing"] .oak-row-time');
  await timing.scrollIntoViewIfNeeded();
  const selection = page.locator('[data-owner-id="node-sightseeing"] .oak-row-selection');
  await expect(selection.locator(".oak-row-time-certainty")).toHaveText("建議時間");
  if (overnight) {
    await expect(timing).toContainText("隔日 1");
    const projected = await page.evaluate(() => window.oak!.probe.experience!.model.timeline.flatMap(entry => entry.kind === "node" ? [entry] : entry.kind === "logistics-group" ? entry.children : []).find(node => node.ownerId === "node-sightseeing")?.timing);
    expect(projected).toEqual({ start: "23:30", end: "01:15", dayOffset: 1, certainty: "suggested", date: "2042-03-04", endDate: "2042-03-05" });
  }
  const accessibleDates = overnight
    ? "· 2042年3月4日 星期二 · 結束於 2042年3月5日 星期三 01:15"
    : "· 2042年3月4日 星期二 · 結束於 2042年3月4日 星期二 15:00";
  await expect(selection.locator(":scope > .oak-visually-hidden")).toHaveText(accessibleDates);
  await expect(selection).toHaveAccessibleName(new RegExp(accessibleDates + "$"));
  const evidence = await selection.evaluate(element => {
    const owner = element.getBoundingClientRect();
    const timing = element.querySelector(".oak-row-time")!;
    const slot = timing.getBoundingClientRect();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const tokens = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      // The exact accessible date suffix is asserted above. It intentionally
      // has no visible token geometry; all other text keeps the original audit.
      if (node.parentElement?.closest(".oak-visually-hidden")) continue;
      for (const match of node.textContent!.matchAll(/\d{2}:\d{2}/g)) {
        const range = document.createRange(); range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
        const rects = [...range.getClientRects()].map(rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }));
        const bounds = node.parentElement!.getBoundingClientRect();
        tokens.push({ text: match[0], rects, fits: rects.every(rect => rect.left >= owner.left && rect.right <= owner.right && rect.top >= owner.top && rect.bottom <= owner.bottom && rect.left >= bounds.left && rect.right <= bounds.right) });
      }
    }
    const phrases = [...element.querySelectorAll(".oak-row-time-end, .oak-row-time-certainty"), ...timing.children].map(child => {
      const range = document.createRange(); range.selectNodeContents(child);
      const rects = [...range.getClientRects()];
      const bounds = child.getBoundingClientRect();
      return { text: child.textContent, size: getComputedStyle(child).fontSize, fits: rects.length > 0 && rects.every(rect => rect.left >= bounds.left && rect.right <= bounds.right && rect.top >= owner.top && rect.bottom <= owner.bottom) };
    });
    return { tokens, phrases, width: slot.width, owner: { left: owner.left, right: owner.right }, startSize: getComputedStyle(timing).fontSize, pageWidth: document.documentElement.scrollWidth, viewport: innerWidth };
  });
  console.log("Timing token geometry", width, { overnight }, JSON.stringify(evidence));
  expect(evidence.tokens.map(token => token.text)).toEqual(overnight ? ["23:30", "01:15"] : ["14:00", "15:00"]);
  for (const token of evidence.tokens) { expect(token.rects, token.text).toHaveLength(1); expect(token.fits, token.text).toBe(true); }
  expect(evidence.phrases.map(phrase => phrase.text)).toEqual(overnight ? ["結束於 01:15", "建議時間", "隔日 1"] : ["結束於 15:00", "建議時間"]);
  for (const phrase of evidence.phrases) expect(phrase.fits, phrase.text ?? "timing phrase").toBe(true);
  expect(evidence.phrases.slice(0, 2).map(phrase => phrase.size)).toEqual(["24px", "24px"]);
  expect(evidence.startSize).toBe("28px");
  if (width > 320) expect(evidence.width).toBe(104);
  expect(evidence.pageWidth).toBe(evidence.viewport);
});

for (const { visualCase, variant, name } of variants) test(`style ${name}`, async ({ page }) => {
  await openCase(page, visualCase, variant);
  await commonGeometry(page, variant);
  const tokens = await page.locator(".oak-washi").evaluate(element => {
    const style = getComputedStyle(element);
    return Object.fromEntries(["canvas", "surface", "ink", "accent", "focus", "layer-header", "layer-sheet", "layer-modal"].map(name => [name, style.getPropertyValue(`--oak-${name}`).trim()]));
  });
  expect(tokens).toEqual({ canvas: "#f6f2ea", surface: "#fbf9f5", ink: "#352f2a", accent: "#b86f4b", focus: "#8f5036", "layer-header": "50", "layer-sheet": "60", "layer-modal": "70" });
  if (variant.scenario.media === "forced-colors") {
    expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
    const selected = page.locator('.oak-row-selection[aria-pressed="true"]').first();
    await expect(selected).toBeAttached();
    expect(await selected.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("double");
    expect(await selected.textContent()).not.toBe("");
  }
  const targets = await page.locator("button, a[href], input, select").evaluateAll(elements => elements.filter(element => !element.closest("[inert],[hidden]") && getComputedStyle(element).visibility !== "hidden" && element.getBoundingClientRect().height > 0).map(element => {
    const target = element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type) ? element.labels?.[0] ?? element : element;
    const rect = target.getBoundingClientRect();
    return { text: target.getAttribute("aria-label") ?? target.textContent, width: rect.width, height: rect.height };
  }));
  expect(targets.filter(target => target.width < 43.99 || target.height < 43.99), "Every visible target must be at least 44x44").toEqual([]);
  const checkbox = page.locator('input[type="checkbox"]:visible').first();
  if (await checkbox.count()) {
    const before = await checkbox.isChecked();
    const label = checkbox.locator("xpath=ancestor::label");
    await label.scrollIntoViewIfNeeded();
    const box = await label.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width - 3, box!.y + 3);
    await expect(checkbox).toBeChecked({ checked: !before });
  }
  if (variant.scenario.media !== "forced-colors") {
    const contrast = await page.evaluate(() => {
      const rgb = (text: string): number[] => {
        const values = (text.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        return text.startsWith("color(srgb ") ? values.map(value => value * 255) : values;
      };
      const lum = (values: number[]) => values.map(value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      return Array.from(document.querySelectorAll<HTMLElement>("body *")).filter(element => element.childNodes.length && Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) && element.getBoundingClientRect().height > 0 && !element.closest("[inert],[aria-hidden=true]")).map(element => {
        const css = getComputedStyle(element); let parent: Element | null = element; let background = "rgb(246, 242, 234)";
        while (parent) { const value = getComputedStyle(parent).backgroundColor; if (value !== "rgba(0, 0, 0, 0)" && value !== "transparent") { background = value; break; } parent = parent.parentElement; }
        const a = lum(rgb(css.color)), b = lum(rgb(background));
        return { text: element.textContent?.slice(0, 65), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), required: Number.parseFloat(css.fontSize) >= 24 || (Number.parseFloat(css.fontSize) >= 18.66 && Number.parseFloat(css.fontWeight) >= 700) ? 3 : 4.5 };
      });
    });
    expect(contrast.filter(item => item.ratio < item.required)).toEqual([]);
  }
  for (const hidden of await page.locator("[inert]").all()) expect(await hidden.evaluate(element => element.querySelector(":focus") !== null)).toBe(false);
  const first = page.locator("button:visible").first();
  if (await first.count()) {
    await first.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
    await expect(first).toBeFocused();
    const outline = await page.evaluate(() => { const style = getComputedStyle(document.activeElement!); return { width: style.outlineWidth, style: style.outlineStyle }; });
    expect(outline.style).not.toBe("none"); expect(Number.parseFloat(outline.width)).toBeGreaterThanOrEqual(2);
    if (variant.mode === "fatal") { await page.keyboard.press("Enter"); await settle(page); await expect(page.locator(".oak-home")).toBeVisible(); }
  }
});

test("current and selected cues stay independent without decorating ordinary row text", async ({ page }) => {
  const cases = [
    variants.find(item => item.visualCase.id === "experience-default"),
    variants.find(item => item.visualCase.id === "selection-truth" && item.variant.scenario.media === "grayscale"),
    variants.find(item => item.visualCase.id === "accessibility-media" && item.variant.scenario.media === "forced-colors"),
  ];
  for (const item of cases) {
    expect(item).toBeDefined();
    await openCase(page, item!.visualCase, item!.variant);
    await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("expanded")); await settle(page);
    const row = page.locator('.oak-primary-row[data-owner-id="node-sightseeing"][data-current="true"][data-selected="true"]');
    await expect(row).toHaveAttribute("aria-current", "step");
    await expect(row.locator(".oak-row-selection")).toHaveAttribute("aria-pressed", "true");
    const current = row.locator('.oak-row-status > [data-state="current"]');
    await expect(current).toHaveCount(1);
    const styles = await row.evaluate(element => {
      const style = (selector?: string) => getComputedStyle(selector ? element.querySelector(selector)! : element);
      return {
        row: { decoration: style().textDecorationLine, weight: style().fontWeight },
        time: { decoration: style(".oak-row-time").textDecorationLine, weight: style(".oak-row-time").fontWeight },
        title: { decoration: style(".oak-row-title").textDecorationLine, weight: style(".oak-row-title").fontWeight },
        details: { decoration: style(".oak-owner-details").textDecorationLine, weight: style(".oak-owner-details").fontWeight },
        current: { decoration: style('.oak-row-status > [data-state="current"]').textDecorationLine, weight: style('.oak-row-status > [data-state="current"]').fontWeight },
      };
    });
    expect(styles).toEqual({
      row: { decoration: "none", weight: "400" },
      time: { decoration: "none", weight: "720" },
      title: { decoration: "none", weight: "700" },
      details: { decoration: "none", weight: "400" },
      current: { decoration: "underline", weight: "500" },
    });
    const marker = page.locator('.oak-marker[data-current="true"][data-selected="true"][aria-pressed="true"][aria-label*="Synthetic overlook"]');
    await expect(marker).toHaveCount(1);
    expect(await marker.locator(".oak-marker-drop").evaluate(element => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: style.outlineWidth };
    })).toEqual({ style: "solid", width: "2px" });
    if (item!.variant.scenario.media === "forced-colors") {
      expect(await row.locator(".oak-primary-summary").evaluate(element => getComputedStyle(element).outlineStyle)).toBe("double");
      expect(await row.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("none");
    } else {
      expect(await row.locator(".oak-primary-summary").evaluate(element => getComputedStyle(element).boxShadow)).not.toBe("none");
      expect(await row.evaluate(element => getComputedStyle(element).boxShadow)).toBe("none");
    }
  }
});

test("timing keeps the start primary and every secondary phrase readable across media and reflow", async ({ page }) => {
  const cases = [
    variants.find(item => item.visualCase.id === "experience-default"),
    variants.find(item => item.visualCase.id === "accessibility-media" && item.variant.scenario.media === "forced-colors"),
    variants.find(item => item.visualCase.id === "accessibility-media" && item.variant.id === "text-reflow"),
  ];
  for (const item of cases) {
    expect(item).toBeDefined();
    await openCase(page, item!.visualCase, item!.variant);
    await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("expanded")); await settle(page);
    if (item!.variant.id === "text-reflow") {
      await page.setViewportSize({ width: 320, height: 568 });
      await settle(page);
    }
    const row = page.locator('[data-owner-id="node-sightseeing"]');
    const timing = row.locator(".oak-row-time");
    await timing.scrollIntoViewIfNeeded();
    if (item!.variant.scenario.textScale === 1) expect((await timing.boundingBox())!.width).toBe(52);
    await expect(timing).toContainText("14:00");
    const phrases = row.locator(".oak-row-time-end, .oak-row-time-certainty");
    await expect(phrases).toHaveCount(2);
    await expect(phrases.nth(0)).toHaveText("結束於 15:00");
    await expect(phrases.nth(1)).toHaveText("建議時間");
    const evidence = await timing.evaluate(element => {
      const style = (target: Element) => getComputedStyle(target);
      const owner = element.closest(".oak-row-selection")!;
      const children = [...owner.querySelectorAll(".oak-row-time-end, .oak-row-time-certainty")];
      const selection = owner.getBoundingClientRect();
      return {
        content: [element.textContent, ...children.map(child => child.textContent)],
        start: { size: Number.parseFloat(style(element).fontSize), weight: style(element).fontWeight },
        secondary: children.map(child => ({ size: Number.parseFloat(style(child).fontSize), weight: style(child).fontWeight })),
        fits: children.every(child => {
          const rect = child.getBoundingClientRect();
          const html = child as HTMLElement;
          return rect.left >= selection.left - 0.01 && rect.right <= selection.right + 0.01 && html.scrollWidth <= html.clientWidth && html.scrollHeight <= html.clientHeight;
        }),
        pageWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
      };
    });
    expect(evidence.content).toEqual(["14:00", "結束於 15:00", "建議時間"]);
    expect(evidence.secondary).toHaveLength(2);
    for (const phrase of evidence.secondary) {
      expect(phrase.size).toBeLessThan(evidence.start.size);
      expect(Number.parseInt(phrase.weight, 10)).toBeLessThan(Number.parseInt(evidence.start.weight, 10));
    }
    expect(evidence.start.weight).toBe("720");
    expect(evidence.secondary).toEqual([
      { size: item!.variant.scenario.textScale === 2 ? 24 : 12, weight: "400" },
      { size: item!.variant.scenario.textScale === 2 ? 24 : 12, weight: "400" },
    ]);
    expect(evidence.fits).toBe(true);
    expect(evidence.pageWidth).toBe(evidence.viewportWidth);

    const unknown = page.locator('[data-owner-id="node-shopping"] .oak-row-time');
    await unknown.scrollIntoViewIfNeeded();
    await expect(unknown).toHaveText("時間不明");
    await expect(unknown.locator(":scope > span")).toHaveCount(0);
  }
});

test("authored date rail stays compact, readable and keyboard operable through measured header changes", async ({ page }) => {
  const item = variants.find(item => item.visualCase.id === "experience-expanded-dense" && item.variant.id === "dense-half")!;
  await openCase(page, item.visualCase, item.variant);
  const rail = page.getByRole("navigation", { name: "旅程日期" });
  const buttons = page.locator(".oak-day-choice");
  for (const [width, height, scale] of [[390, 844, 1], [320, 568, 1], [320, 568, 2]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scale);
    await settle(page);
    if (scale === 1) for (const button of await buttons.all()) expect((await button.boundingBox())!.width).toBeLessThan(100);
    // Full long CJK title stays in the accessible name and header, not in the tile.
    await expect(buttons.nth(0)).toHaveAccessibleName("週二 3/4 · 2042年 · 第 1 天 · 合成群島第一日：沿岸步道與工藝展示空間的完整行程");
    await expect(buttons.nth(1)).toHaveAccessibleName("週三 3/5 · 2042年 · 第 2 天 · Second synthetic day");
    const cells = await buttons.evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect();
      return {
        width: box.width, height: box.height,
        text: [...element.children].map(child => child.textContent),
        styles: [...element.children].map(child => { const css = getComputedStyle(child); return { size: Number.parseFloat(css.fontSize), weight: css.fontWeight, lineHeight: Number.parseFloat(css.lineHeight) }; }),
        fits: [...element.children].every(child => {
          const rect = child.getBoundingClientRect(); const html = child as HTMLElement;
          return rect.left >= box.left && rect.right <= box.right && rect.top >= box.top && rect.bottom <= box.bottom && html.scrollWidth <= html.clientWidth && html.scrollHeight <= html.clientHeight;
        }),
      };
    }));
    expect(cells.map(cell => cell.text)).toEqual([["週二", "3/4"], ["週三", "3/5"]]);
    for (const cell of cells) {
      expect(cell.width).toBeGreaterThanOrEqual(44); expect(cell.height).toBeGreaterThanOrEqual(44);
      expect(cell.fits).toBe(true);
      expect(cell.styles).toEqual([{ size: 12 * scale, weight: "720", lineHeight: 16.8 * scale }, { size: 14 * scale, weight: "780", lineHeight: 19.6 * scale }]);
    }
    await commonGeometry(page, { ...item.variant, viewport: { width, height }, scenario: { ...item.variant.scenario, textScale: scale as 1 | 2 } });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "16px"; });
  await page.emulateMedia({ forcedColors: "active" });
  await settle(page);
  const selected = buttons.nth(0);
  expect(await selected.evaluate(element => { const style = getComputedStyle(element); return { style: style.outlineStyle, width: style.outlineWidth, selected: style.outlineStyle !== getComputedStyle(element.nextElementSibling!).outlineStyle }; })).toEqual({ style: "solid", width: "2px", selected: true });
  await selected.focus();
  expect(await selected.evaluate(element => getComputedStyle(element).outlineOffset)).toBe("-3px");
  await page.keyboard.press("Tab"); await expect(buttons.nth(1)).toBeFocused();
  await page.keyboard.press("Enter"); await settle(page);
  await expect(buttons.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(buttons.nth(0)).not.toHaveAttribute("aria-current");
  await expect(page.locator(".oak-header-identity h1")).toContainText("Second synthetic day");
  expect(await page.evaluate(() => window.oak!.probe.experience!.model.day.id)).toBe("day-synthetic-two");
  const expanded = await page.locator(".oak-day-header").boundingBox();
  const expandedCeiling = await page.evaluate(() => window.oak!.probe.experience!.model.sheet.geometry!.expanded);
  const toggle = page.getByRole("button", { name: "收合日期導覽" });
  await toggle.focus(); await page.keyboard.press("Enter"); await settle(page);
  await expect(rail).toHaveCount(0);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest(".oak-day-rail") !== null)).toBe(false);
  const collapsed = await page.locator(".oak-day-header").boundingBox();
  const collapsedCeiling = await page.evaluate(() => window.oak!.probe.experience!.model.sheet.geometry!.expanded);
  expect(collapsed!.height).toBeLessThan(expanded!.height);
  expect(Math.abs((collapsedCeiling - expandedCeiling) - (expanded!.height - collapsed!.height))).toBeLessThan(1);
  await commonGeometry(page, { ...item.variant, viewport: { width: 390, height: 844 }, scenario: { ...item.variant.scenario, header: false } });
});

test("changing dates starts the itinerary at its beginning while return-to-current reveals its owner", async ({ page }) => {
  const item = variants.find(item => item.visualCase.id === "experience-expanded-dense" && item.variant.id === "dense-half")!;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?case=experience-expanded-dense&variant=dense-half&days=long-rail");
  await settle(page);
  await page.evaluate(() => { window.oak!.probe.actions!.setSheetSnap("expanded"); window.oak!.probe.actions!.setHeaderExpanded(true); window.oak!.probe.actions!.selectNode("node-sightseeing"); });
  await settle(page);
  const port = page.locator(".oak-sheet-scroll");
  expect(await port.evaluate(element => getComputedStyle(element).overflowY)).toBe("auto");
  const scrolled = await port.evaluate(element => {
    element.scrollTop = Math.min(900, element.scrollHeight - element.clientHeight - 100);
    return element.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(0);
  await page.locator(".oak-day-choice").first().click();
  await settle(page);
  expect(await port.evaluate(element => element.scrollTop)).toBe(scrolled);
  await page.locator(".oak-day-choice").nth(1).click();
  await settle(page);
  await expect(page.locator(".oak-day-choice").nth(1)).toHaveAttribute("aria-current", "true");
  expect(await page.evaluate(() => window.oak!.probe.experience!.model.owners.selectedId)).not.toBe("node-sightseeing");
  expect(await port.evaluate(element => element.scrollTop)).toBe(0);
  expect(await port.evaluate(element => element.scrollHeight > element.clientHeight + 900)).toBe(true);
  expect(await page.locator(".oak-sheet-scroll .oak-row").first().evaluate(element => {
    const rect = element.getBoundingClientRect();
    const clip = element.closest(".oak-sheet-scroll")!.getBoundingClientRect();
    return rect.top >= clip.top && rect.top < clip.bottom;
  })).toBe(true);
  await page.evaluate(() => window.oak!.probe.actions!.returnToCurrent());
  await settle(page);
  await expect(page.locator(".oak-day-choice").first()).toHaveAttribute("aria-current", "true");
  const current = await page.evaluate(() => window.oak!.probe.experience!.model.owners.currentId);
  expect(current).not.toBeNull();
  const owner = page.locator(`[data-owner-id="${current}"]`).first();
  await expect(owner).toBeVisible();
  expect(await owner.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const clip = element.closest(".oak-sheet-scroll")!.getBoundingClientRect();
    return rect.top < clip.bottom && rect.bottom > clip.top;
  })).toBe(true);
});

test("changing dates resets the crowded body scroll and reveals the new first row", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?case=experience-expanded-dense&variant=dense-half&days=long-rail");
  await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; window.oak!.probe.actions!.setSheetSnap("expanded"); window.oak!.probe.actions!.setHeaderExpanded(true); });
  await settle(page);
  const port = page.locator(".oak-sheet-body");
  expect(await port.evaluate(element => getComputedStyle(element).overflowY)).toBe("auto");
  await port.evaluate(element => { element.scrollTop = 900; });
  const scrolled = await port.evaluate(element => element.scrollTop);
  expect(scrolled).toBeGreaterThan(0);
  await page.locator(".oak-day-choice").first().click(); await settle(page);
  expect(await port.evaluate(element => element.scrollTop)).toBe(scrolled);
  await page.locator(".oak-day-choice").nth(1).click(); await settle(page);
  await expect(page.locator(".oak-day-choice").nth(1)).toHaveAttribute("aria-current", "true");
  const geometry = await page.locator(".oak-primary-row").first().evaluate(row => {
    const first = row.getBoundingClientRect(); const body = row.closest<HTMLElement>(".oak-sheet-body")!; const clip = body.getBoundingClientRect();
    const title = row.querySelector(".oak-row-title")!.getBoundingClientRect(); const time = row.querySelector(".oak-row-time")!.getBoundingClientRect();
    return { scrollTop: body.scrollTop, firstBottom: first.bottom, titleTop: title.top, timeTop: time.top, timeBottom: time.bottom, clipTop: clip.top, clipBottom: clip.bottom };
  });
  expect(geometry.scrollTop).toBeLessThan(scrolled);
  expect(geometry.firstBottom).toBeGreaterThan(geometry.clipTop);
  expect(geometry.timeTop).toBeGreaterThanOrEqual(geometry.clipTop);
  expect(geometry.timeBottom).toBeLessThanOrEqual(geometry.clipBottom);
  expect(geometry.titleTop).toBeGreaterThanOrEqual(geometry.clipTop);
  expect(geometry.titleTop).toBeLessThan(geometry.clipBottom);
});

test("mobile and 200 percent text keep the primary title and actions inside the itinerary", async ({ page }, info) => {
  for (const [width, height, scale] of [[320, 568, 1], [390, 844, 1], [430, 932, 1], [320, 568, 2]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/?case=experience-expanded-dense&variant=dense-expanded-small");
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scale);
    await settle(page);
    if (process.env.OAK_FIDELITY_CAPTURE === "1") await page.screenshot({ path: info.outputPath(`mobile-${width}x${height}-${scale}x.png`) });
    const metrics = await page.locator(".oak-primary-row").first().evaluate(row => {
      const title = row.querySelector<HTMLElement>(".oak-row-title")!;
      const action = row.querySelector<HTMLElement>(".oak-row-action")!;
      const body = row.closest<HTMLElement>(".oak-sheet-body")!;
      const inner = row.closest<HTMLElement>(".oak-sheet-scroll")!;
      const port = getComputedStyle(body).overflowY === "auto" ? body : inner;
      const titleBox = title.getBoundingClientRect();
      const portBox = port.getBoundingClientRect();
      const actionBox = action.getBoundingClientRect();
      return {
        titleSize: Number.parseFloat(getComputedStyle(title).fontSize),
        titleFits: titleBox.left >= portBox.left && titleBox.right <= portBox.right,
        actionFits: actionBox.left >= portBox.left && actionBox.right <= portBox.right,
        actionWidth: actionBox.width,
        pageWidth: document.documentElement.scrollWidth,
      };
    });
    expect(metrics.titleSize).toBeGreaterThanOrEqual(16 * scale);
    expect(metrics.titleFits).toBe(true);
    expect(metrics.actionFits).toBe(true);
    expect(metrics.actionWidth).toBeGreaterThanOrEqual(44);
    expect(metrics.pageWidth).toBe(width);
  }
});

test("crowded 200 percent chrome still leaves a usable itinerary sheet", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/?case=experience-expanded-dense&variant=dense-expanded-small");
  await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
  await settle(page);
  const geometry = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>(".oak-experience")!;
    const upper = root.querySelector<HTMLElement>(".oak-upper-clearance")!;
    const sheet = root.querySelector<HTMLElement>(".oak-itinerary-sheet")!;
    const model = window.oak!.probe.experience!.model;
    return { chromeScroll: root.dataset.chromeScroll, expanded: model.sheet.geometry?.expanded, snap: model.sheet.snap, upperHeight: upper.getBoundingClientRect().height, upperBudget: root.style.getPropertyValue("--oak-upper-budget"), sheetHeight: sheet.getBoundingClientRect().height, chromeBudget: root.style.getPropertyValue("--oak-chrome-budget") };
  });
  expect(geometry.expanded, JSON.stringify(geometry)).toBeGreaterThanOrEqual(260);
  expect(geometry.sheetHeight, JSON.stringify(geometry)).toBeGreaterThanOrEqual(260);
});

test("thirteen authored dates overflow only the rail and remain keyboard reachable at 200 percent text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/?case=accessibility-media&variant=text-reflow&days=long-rail");
  await settle(page);
  await page.evaluate(() => window.oak!.probe.actions!.setHeaderExpanded(true));
  await settle(page);
  const rail = page.locator(".oak-day-rail");
  const buttons = rail.getByRole("button");
  await expect(buttons).toHaveCount(13);
  expect(await rail.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await buttons.first().focus();
  await expect(buttons.first()).toBeInViewport({ ratio: 1 });
  for (let index = 1; index < 13; index++) await page.keyboard.press("Tab");
  await settle(page);
  await expect(buttons.last()).toBeFocused();
  await expect(buttons.last()).toHaveAccessibleName("週日 3/16 · 2042年 · 第 13 天 · Extended synthetic day 2042-03-16: complete authored title for the coastal gallery journey");
  const evidence = await buttons.last().evaluate(element => {
    const rail = element.parentElement!;
    const outer = rail.getBoundingClientRect(), cell = element.getBoundingClientRect();
    const css = getComputedStyle(element);
    const focusOutset = Number.parseFloat(css.outlineWidth) + Number.parseFloat(css.outlineOffset);
    return {
      scroll: rail.scrollLeft,
      scrollWidth: rail.scrollWidth, clientWidth: rail.clientWidth, padding: getComputedStyle(rail).padding,
      cellWidth: cell.width,
      cell: { left: cell.left, right: cell.right }, rail: { left: outer.left, right: outer.right },
      horizontalFocusVisible: cell.left - focusOutset >= outer.left && cell.right + focusOutset <= outer.right,
      labelClearOfFocus: [...element.children].every(child => { const r = child.getBoundingClientRect(); return r.left >= cell.left + 3 && r.right <= cell.right - 3 && r.top >= cell.top + 3 && r.bottom <= cell.bottom - 3; }),
      usableWidth: Math.min(cell.right, outer.right) - Math.max(cell.left, outer.left),
      usableHeight: Math.min(cell.bottom, outer.bottom) - Math.max(cell.top, outer.top),
      textVisible: [...element.children].every(child => {
        const html = child as HTMLElement, text = child.getBoundingClientRect();
        return html.scrollWidth <= html.clientWidth && html.scrollHeight <= html.clientHeight && text.left >= outer.left && text.right <= outer.right && text.top >= outer.top && text.bottom <= outer.bottom;
      }),
      focus: { style: css.outlineStyle, width: css.outlineWidth, verticalClearance: cell.top - focusOutset >= outer.top && cell.bottom + focusOutset <= outer.bottom },
      pageWidth: document.documentElement.scrollWidth, viewport: innerWidth,
    };
  });
  await closeoutEvidence(page, "rail-320-200", evidence);
  expect.soft(evidence.usableWidth).toBe(evidence.cellWidth);
  expect.soft(evidence.horizontalFocusVisible).toBe(true);
  expect(evidence.labelClearOfFocus).toBe(true);
  expect(evidence.scroll).toBeGreaterThan(0);
  expect(evidence.usableWidth).toBeGreaterThanOrEqual(44); expect(evidence.usableHeight).toBeGreaterThanOrEqual(44);
  expect(evidence.textVisible).toBe(true);
  expect(evidence.focus).toEqual({ style: "solid", width: "3px", verticalClearance: true });
  expect(evidence.pageWidth).toBe(evidence.viewport);
  await page.keyboard.press("Enter"); await settle(page);
  await expect(buttons.last()).toHaveAttribute("aria-current", "true");
  await expect(buttons.last()).toBeFocused();
  expect(await page.evaluate(() => window.oak!.probe.experience!.model.day.id)).toBe("day-long-rail-2042-03-16");
  await expect(page.locator(".oak-header-identity h1")).toContainText("Extended synthetic day 2042-03-16");
  for (const media of ["none", "active"] as const) {
    await page.emulateMedia({ forcedColors: media });
    for (const direction of ["Shift+Tab", "Tab"]) {
    await page.keyboard.press(direction); await settle(page);
    const focus = await page.locator(".oak-day-choice:focus").evaluate(element => {
      const r = element.getBoundingClientRect(), p = element.parentElement!.getBoundingClientRect(), s = getComputedStyle(element);
      let painted = element;
      while (getComputedStyle(painted).backgroundColor === "rgba(0, 0, 0, 0)" && painted.parentElement) painted = painted.parentElement;
      const background = getComputedStyle(painted).backgroundColor;
      const luminance = (channels: number[]) => channels.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      const foreground = s.outlineColor.match(/[\d.]+/g)!.map(Number), backdrop = background.match(/[\d.]+/g)!.slice(0, 3).map(Number), alpha = foreground[3] ?? 1;
      const light = luminance(foreground.slice(0, 3).map((value, index) => value * alpha + backdrop[index] * (1 - alpha))), dark = luminance(backdrop);
      return { selected: element.hasAttribute("aria-current"), style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset, color: s.outlineColor, background, contrast: (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05), borderFits: r.left >= p.left && r.right <= p.right };
    });
    await closeoutEvidence(page, `date-focus-${media}-${focus.selected ? "selected" : "unselected"}`, focus);
    expect(focus.style).toBe("solid"); expect(focus.width).toBe("3px"); expect(focus.offset).toBe("-3px"); expect(focus.borderFits).toBe(true); expect(focus.color).not.toBe("rgba(0, 0, 0, 0)");
    if (media === "none") expect(focus.contrast).toBeGreaterThanOrEqual(3);
    }
  }
});

test("resize, 200 percent text and asymmetric safe areas retain measured chrome, legal clearance and bounded camera", async ({ page }) => {
  const item = variants.find(item => item.visualCase.id === "experience-expanded-dense" && item.variant.viewport.width === 320)!;
  await openCase(page, item.visualCase, item.variant);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.fontSize = "32px";
    for (const [side, value] of Object.entries({ top: 20, right: 13, bottom: 34, left: 7 })) root.style.setProperty(`--oak-safe-area-${side}`, `${value}px`);
    window.oak!.probe.actions!.setHeaderExpanded(true);
    window.oak!.probe.actions!.setSheetSnap("expanded");
  });
  await settle(page);
  await commonGeometry(page, { ...item.variant, viewport: { width: 320, height: 568 }, scenario: { ...item.variant.scenario, sheet: "expanded", textScale: 2, header: true, safeArea: [20, 13, 34, 7] } });
  await expect(page.locator(".oak-experience")).toHaveAttribute("data-chrome-scroll", "true");
  // Compact date cells now fit at 568px. A shorter real viewport retains
  // coverage of the measured crowded-chrome branch without inflated content.
  await page.setViewportSize({ width: 320, height: 400 }); await settle(page);
  await commonGeometry(page, { ...item.variant, viewport: { width: 320, height: 400 }, scenario: { ...item.variant.scenario, sheet: "expanded", textScale: 2, header: true, safeArea: [20, 13, 34, 7] } });
  await expect(page.locator(".oak-experience")).toHaveAttribute("data-chrome-scroll", "true");
  const heading = page.locator(".oak-sheet-heading");
  const scroller = page.locator(".oak-sheet-body");
  const headingBox = await heading.boundingBox(); const scrollBox = await scroller.boundingBox();
  expect(headingBox!.height).toBeGreaterThanOrEqual(52);
  expect(headingBox!.y).toBe(scrollBox!.y);
  expect((await page.locator(".oak-sheet-body .oak-map-coverage-note").boundingBox())!.y).toBeGreaterThanOrEqual(headingBox!.y + headingBox!.height);
  expect(await heading.evaluate(element => element.closest(".oak-itinerary-sheet") !== null)).toBe(true);
  await scroller.evaluate(element => { element.scrollTop = 80; });
  expect(await scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect((await heading.boundingBox())!.y).toBeLessThan(headingBox!.y);
  const upper = page.locator(".oak-upper-clearance");
  await upper.focus(); await page.keyboard.press("End");
  await expect.poll(() => upper.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  const state = await page.evaluate(() => ({ top: document.querySelector(".oak-upper-clearance")!.scrollTop, model: window.oak!.probe.experience!.model, camera: window.oak!.providers.map.cameras.at(-1) }));
  expect(state.top).toBeGreaterThan(0);
  expect(state.model.map.layout?.viewport).toMatchObject({ width: 320, height: 400 });
  expect(JSON.stringify(state.camera)).not.toContain('"lat":50');
  const legal = page.locator("[data-fake-legal]");
  await legal.focus(); await page.keyboard.press("Enter");
  await expect(legal).toHaveAttribute("data-activated", "true");
  await page.setViewportSize({ width: 1024, height: 900 }); await settle(page);
  expect(await page.locator(".oak-itinerary-sheet").evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(1024);
});

for (const [width, height, scale, shared] of [[956, 300, 1, true], [956, 260, 1, true], [956, 300, 2, true], [390, 844, 1, false], [844, 390, 1, false]] as const) {
  test(`landscape scroll reachability ${width}x${height} at ${scale * 100} percent`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scale); await settle(page);
    const evidence = [];
    for (const snap of ["half", "expanded"] as const) {
      await page.evaluate(snap => window.oak!.probe.actions!.setSheetSnap(snap), snap); await settle(page);
      const crowded = await page.locator(".oak-experience").getAttribute("data-chrome-scroll") === "true";
      const port = page.locator(shared || crowded ? ".oak-sheet-body" : ".oak-sheet-scroll");
      await port.evaluate(element => { element.scrollTop = 0; });
      expect(await port.evaluate(element => element.clientHeight)).toBeGreaterThanOrEqual(44);
      expect(await port.evaluate(element => getComputedStyle(element).overflowY)).toBe("auto");
      const heading = page.locator(".oak-sheet-heading");
      const headingBefore = (await heading.boundingBox())!.y;
      await port.evaluate(element => { element.scrollTop = 120; });
      expect(await port.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      const headingAfter = (await heading.boundingBox())!.y;
      if (shared || crowded) expect(headingAfter).toBeLessThan(headingBefore);
      else expect(headingAfter).toBe(headingBefore);
      const row = page.locator('[data-owner-id="node-sightseeing"]');
      const selection = row.locator(".oak-row-selection");
      for (const text of await row.locator(".oak-row-title, .oak-row-time, .oak-row-time-end, .oak-row-time-certainty").all()) {
        // A time cell spans the entire row grid; reveal its text from the top,
        // rather than centering the much taller grid cell in a short scrollport.
        await text.evaluate(element => element.scrollIntoView({ block: "start" }));
        const textEvidence = await text.evaluate(element => {
          const body = document.querySelector<HTMLElement>(".oak-sheet-body")!;
          const port = getComputedStyle(body).overflowY === "auto" ? body : document.querySelector<HTMLElement>(".oak-sheet-scroll")!;
          const clip = port.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(element);
          return { className: element.getAttribute("class"), clip: clip.toJSON() as DOMRect, lines: [...range.getClientRects()].map(line => line.toJSON() as DOMRect), visible: [...range.getClientRects()].every(line => line.width > 0 && line.height > 0 && line.left >= clip.left && line.right <= clip.right && line.top >= clip.top && line.bottom <= clip.bottom) };
        });
        expect(textEvidence.visible, JSON.stringify(textEvidence)).toBe(true);
      }
      await selection.focus(); await page.keyboard.press("Tab");
      const action = row.locator(".oak-row-action");
      await expect(action).toBeFocused();
      const nativeFocusExposure = await action.evaluate(element => {
        const r = element.getBoundingClientRect(), body = document.querySelector<HTMLElement>(".oak-sheet-body")!;
        const port = getComputedStyle(body).overflowY === "auto" ? body : document.querySelector<HTMLElement>(".oak-sheet-scroll")!;
        const p = port.getBoundingClientRect();
        return Math.min(r.bottom, p.bottom) - Math.max(r.top, p.top);
      });
      expect(nativeFocusExposure).toBeGreaterThan(0);
      await action.evaluate(element => element.scrollIntoView({ block: "center" }));
      const actionEvidence = await action.evaluate(element => {
        const r = element.getBoundingClientRect();
        const body = document.querySelector<HTMLElement>(".oak-sheet-body")!;
        const port = getComputedStyle(body).overflowY === "auto" ? body : document.querySelector<HTMLElement>(".oak-sheet-scroll")!;
        const p = port.getBoundingClientRect();
        return { width: r.width, height: r.height, exposedWidth: Math.min(r.right, p.right) - Math.max(r.left, p.left), exposedHeight: Math.min(r.bottom, p.bottom) - Math.max(r.top, p.top), hit: element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)), portHeight: port.clientHeight };
      });
      expect(actionEvidence.width).toBeGreaterThanOrEqual(44); expect(actionEvidence.height).toBeGreaterThanOrEqual(44);
      expect(actionEvidence.exposedWidth).toBeGreaterThanOrEqual(43.5); expect(actionEvidence.exposedHeight).toBeGreaterThanOrEqual(43.5); expect(actionEvidence.hit).toBe(true);
      const before = await page.evaluate(() => window.oak!.providers.navigation.calls.length);
      await page.keyboard.press("Enter"); await settle(page);
      expect(await page.evaluate(() => window.oak!.providers.navigation.calls.length)).toBe(before + 1);
      const legal = page.locator("[data-fake-legal]");
      await legal.focus(); await page.keyboard.press("Enter"); await expect(legal).toHaveAttribute("data-activated", "true");
      expect(await legal.evaluate(element => { const r = element.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
      evidence.push({ snap, headingBefore, headingAfter, nativeFocusExposure, ...actionEvidence });
      await page.screenshot({ path: info.outputPath(`${snap}.png`) });
    }
    console.log("LANDSCAPE_REACHABILITY", JSON.stringify({ width, height, scale, shared, evidence }));
  });
}

test("factory DOM remains identical through both backends, selection, location updates and disposal", async ({ page }) => {
  const cases = variants.filter(item => item.visualCase.id === "marker-backends");
  const markup: string[][] = [];
  for (const item of cases) {
    await openCase(page, item.visualCase, item.variant);
    const result = await page.evaluate(() => {
      const map = window.oak!.providers.map;
      const elements = map.markers.map(handle => handle.element);
      const location = map.locations[0].element;
      const before = [...elements.map(element => element.outerHTML), location.outerHTML];
      const identity = elements.every(element => map.fake.placements.includes(element)) && map.fake.placements.includes(location);
      map.setUserLocation({ lat: 10.016, lng: 20.016 });
      const sameLocation = map.locations.length === 1 && map.locations[0].element === location;
      map.setUserLocation(null);
      const locationDisposed = map.locationDisposals;
      return { before, identity, sameLocation, locationDisposed };
    });
    expect(result.identity).toBe(true); expect(result.sameLocation).toBe(true); expect(result.locationDisposed).toBe(1);
    markup.push(result.before);
    await page.locator('.oak-marker[aria-label*="Synthetic overlook"]').focus(); await page.keyboard.press("Enter"); await settle(page);
    expect(await page.evaluate(() => window.oak!.probe.experience!.model.owners.selectedId)).toBe("node-sightseeing");
    const cleanup = await page.evaluate(() => { const map = window.oak!.providers.map; const count = map.markers.length; map.destroy(); map.destroy(); return { count, disposed: map.markerDisposals, empty: map.markers.every(handle => handle.element.childNodes.length === 0) }; });
    expect(cleanup.disposed).toBe(cleanup.count); expect(cleanup.empty).toBe(true);
  }
  expect(markup[0]).toEqual(markup[1]);
});
