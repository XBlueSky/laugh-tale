import { writeFile } from "node:fs/promises";
import { test, expect, settle } from "../fixtures/oak-washi/browser/checks.js";
import { catalog } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js";
import type { BookingFactModel } from "@laugh-tale-island/react";

const root = ".superpowers/sdd/2026-09-04-eternal-pose-v2-04-oak-washi";
const url = "/?case=home&variant=zero-mobile";

test("final-wave reset confirmation wraps at 200 percent and supports keyboard cancellation and forced colors", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(url); await settle(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
  const summary = page.locator(".oak-progress-reset summary");
  await summary.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".oak-reset-selected-day")).toHaveCount(0);
  await expect(page.locator(".oak-progress-reset select option:checked")).toContainText("·");
  const resetDay = page.getByRole("button", { name: catalog.persistence.resetDay, exact: true });
  await resetDay.focus(); await page.keyboard.press("Enter");
  const confirmation = page.getByRole("group", { name: catalog.persistence.confirmReset });
  await expect(confirmation).toBeVisible();
  const cancel = confirmation.getByRole("button", { name: catalog.persistence.cancelReset });
  await cancel.focus();
  for (const forcedColors of ["none", "active"] as const) {
    await page.emulateMedia({ forcedColors });
    for (const control of [summary, resetDay, cancel, confirmation.getByRole("button", { name: catalog.persistence.confirmReset })]) {
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await confirmation.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); return [...range.getClientRects()].every(rect => rect.left >= 0 && rect.right <= innerWidth); })).toBe(true);
    await cancel.focus();
    expect(await cancel.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await page.screenshot({ path: `tmp/final-review-evidence/reset-320-200-${forcedColors}.png` });
  }
  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveCount(0); await expect(resetDay).toBeFocused();
  await page.keyboard.press("Enter");
  await confirmation.getByRole("button", { name: catalog.persistence.confirmReset }).click(); await settle(page);
  await expect(page.locator(".oak-progress-reset [role=status]")).toHaveText(catalog.persistence.resetDone);
});

test("lodging accessible names use the same localized dates as visible visits", async ({ page }) => {
  await page.goto(`${url}&content=unreviewed`); await settle(page);
  const records = page.locator("[data-home-lodging-owner]");
  await expect(records).toHaveCount(11);
  await expect(records.first()).toHaveAccessibleName("Synthetic base · 第 1 天 · 3/4");
  await expect(records.first().locator("time")).toHaveText("3/4");
  await expect(records.first().locator("time")).toHaveAttribute("datetime", "2042-03-04");
  await expect(records.last()).toHaveAccessibleName("Synthetic base · 第 11 天 · 3/14");
  await expect(records.last().locator("time")).toHaveText("3/14");
  await expect(records.last().locator("time")).toHaveAttribute("datetime", "2042-03-14");
});

for (const [width, scale] of [[320, 1], [390, 1], [430, 1], [320, 2]] as const) {
  test(`Home day and reservation facts keep one 8px rhythm at ${width} and ${scale * 100}% text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(url); await settle(page);
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scale);
    const sample = await page.evaluate(() => {
      const dayProgress = document.querySelector<HTMLElement>(".oak-home-day-copy > .oak-home-progress")!;
      const lodgingTitle = document.querySelector<HTMLElement>("[data-home-lodging-owner] h3")!;
      const reservationTitle = document.querySelector<HTMLElement>("[data-home-reservation-id] h3")!;
      const reservationStatus = document.querySelector<HTMLElement>("[data-home-reservation-id] .oak-home-booking-status")!;
      return {
        dayGap: Number.parseFloat(getComputedStyle(dayProgress).marginTop),
        lodgingGap: Number.parseFloat(getComputedStyle(lodgingTitle).marginBottom),
        reservationGap: Number.parseFloat(getComputedStyle(reservationTitle).marginBottom),
        status: reservationStatus.textContent,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(sample.dayGap).toBe(8 * scale);
    expect(sample.lodgingGap).toBe(8 * scale);
    expect(sample.reservationGap).toBe(8 * scale);
    expect(sample.status?.length).toBeGreaterThan(0);
    expect(sample.scrollWidth).toBe(width);
  });
}

for (const [width, height, scale] of [[390, 844, 1], [1024, 900, 1], [320, 568, 2]] as const) {
  test(`actual-content polish eleven distinct lodging visits ${width} at ${scale * 100}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`${url}&content=unreviewed`); await settle(page);
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scale);
    const records = page.locator("[data-home-lodging-owner]");
    await expect(records).toHaveCount(11);
    await records.first().evaluate(element => element.scrollIntoView({ block: "start" }));
    const phase = process.env.OAK_POLISH_PHASE ?? "after";
    await page.screenshot({ path: test.info().outputPath(`r110-${phase}-fixture-home-${width}.png`) });
    console.log("LODGING_POLISH", JSON.stringify({ phase, width, scale, records: await records.evaluateAll(elements => elements.map(element => ({ text: element.textContent, top: element.getBoundingClientRect().top, height: element.getBoundingClientRect().height }))) }));
    expect(await records.locator("h3").count()).toBe(1);
    for (let index = 0; index < 11; index++) {
      const record = records.nth(index);
      await expect(record).toHaveAttribute("data-home-lodging-owner", index === 0 ? "node-lodging" : `node-visit-${index}`);
      await expect(record.locator(".oak-home-lodging-day")).toContainText(`第 ${index + 1} 天`);
      await expect(record.locator(".oak-home-timing")).toHaveText(catalog.timing.unknown);
      await expect(record.locator(".oak-home-place")).toContainText(catalog.facts.unverifiedLocation);
      for (const text of await record.locator(".oak-home-timing, .oak-home-place, .oak-home-lodging-day").all()) {
        await text.evaluate(element => element.scrollIntoView({ block: "center" }));
        const lines = await text.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); return [...range.getClientRects()].map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })); });
        for (const line of lines) { expect(line.left).toBeGreaterThanOrEqual(0); expect(line.right).toBeLessThanOrEqual(width); expect(line.top).toBeGreaterThanOrEqual(0); expect(line.bottom).toBeLessThanOrEqual(height); }
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await expect(records.locator("a, button")).toHaveCount(0);
  });
}

async function openHome(page: import("@playwright/test").Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await settle(page);
  await expect(page.locator(".oak-home-flow")).toBeVisible();
}

async function geometry(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight }, scrollWidth: document.documentElement.scrollWidth,
      flow: box(".oak-home-flow"), days: box(".oak-home-days"), utilities: box(".oak-home-utilities"),
      firstDay: box(".oak-home-day-index > li:first-child"), secondDay: box(".oak-home-day-index > li:nth-child(2)"),
      firstDayAction: box(".oak-home-day-index > li:first-child .oak-control"), secondDayAction: box(".oak-home-day-index > li:nth-child(2) .oak-control"),
      firstDayHeading: box(".oak-home-day-index > li:first-child .oak-home-day-meta"), secondDayHeading: box(".oak-home-day-index > li:nth-child(2) .oak-home-day-meta"),
      order: [...document.querySelector(".oak-home-flow")!.children].map(child => child.classList.contains("oak-home-days") ? "days" : "utilities"),
    };
  });
}

async function capture(page: import("@playwright/test").Page, width: number, evidence: Awaited<ReturnType<typeof geometry>>) {
  const phase = process.env.OAK_HOME_CAPTURE_PHASE;
  if (phase !== "before" && phase !== "after") return;
  await page.screenshot({ path: `${root}/task-8-batch14-${phase}-${width}.png` });
  await writeFile(`${root}/task-8-batch14-${phase}-${width}.json`, JSON.stringify(evidence, null, 2));
}

test("mobile Home shows the first authored day action before utilities in the initial viewport", async ({ page }) => {
  await openHome(page, 390, 844);
  const sample = await geometry(page);
  await capture(page, 390, sample);
  expect(sample.order).toEqual(["days", "utilities"]);
  expect(sample.firstDayAction.top).toBeCloseTo(sample.firstDayHeading.top, 0);
  expect(sample.secondDayAction.top).toBeCloseTo(sample.secondDayHeading.top, 0);
  expect(sample.firstDayAction.width).toBe(44);
  expect(sample.firstDayAction.height).toBe(44);
  expect(sample.firstDayAction.left).toBeGreaterThan(sample.firstDayHeading.left);
  expect(sample.firstDayAction.right).toBeLessThanOrEqual(390);
  expect(sample.secondDay.top).toBeGreaterThanOrEqual(sample.firstDay.bottom);
  expect(sample.firstDayAction.bottom).toBeLessThanOrEqual(844);
  expect(sample.days.top).toBeLessThan(sample.utilities.top);
  const model = await page.evaluate(() => window.oak!.probe.home!.model);
  const dayRows = page.locator("[data-home-day-id]");
  expect(await dayRows.evaluateAll(rows => rows.map(row => row.getAttribute("data-home-day-id")))).toEqual(model.days.map(day => day.id));
  expect(await page.locator("[data-home-lodging-owner]").count()).toBe(model.lodging.length);
  expect(await page.locator("[data-home-reservation-id]").count()).toBe(model.reservations.length);
  expect(await page.locator('.oak-home-utilities [data-home-task-id]').count()).toBe(model.tasks.filter(task => task.scope === "pretrip").length);
  expect(await page.locator('.oak-home-days [data-home-task-id]').count()).toBe(model.tasks.filter(task => task.scope === "day").length);
  expect(await page.locator('.oak-home-days [data-checklist-id]').count()).toBe(model.tasks.filter(task => task.scope === "day").flatMap(task => task.children).length);
  for (const selector of ["[data-home-day-id]", "[data-home-lodging-owner]", ".oak-home-utilities [data-home-task-id]", "[data-home-reservation-id]"]) {
    const records = page.locator(selector);
    for (let index = 0; index < await records.count(); index++) {
      const record = records.nth(index); await record.scrollIntoViewIfNeeded();
      const box = await record.boundingBox();
      expect(box, `${selector} ${index} remains mounted`).not.toBeNull();
      expect(box!.y, `${selector} ${index} intersects the viewport after native scroll`).toBeLessThan(844);
      expect(box!.y + box!.height, `${selector} ${index} intersects the viewport after native scroll`).toBeGreaterThan(0);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
  }
  const controls = page.locator(".oak-home-flow button, .oak-home-flow input");
  const owners = await controls.evaluateAll(elements => elements.map(element => element.closest(".oak-home-days") ? "days" : "utilities"));
  expect(owners[0]).toBe("days"); expect(owners.at(-1)).toBe("utilities");
  await controls.first().focus();
  for (let index = 0; index < owners.length; index++) {
    await expect(controls.nth(index), `Tab ${index} follows the same day-first DOM order`).toBeFocused();
    if (index + 1 < owners.length) await page.keyboard.press("Tab");
  }
});

test("day action opens its supplied day and Home return preserves the task controls", async ({ page }) => {
  await openHome(page, 390, 844);
  const model = await page.evaluate(() => window.oak!.probe.home!.model);
  const day = model.days.find(item => model.capabilities.openExperienceDayIds.includes(item.id))!;
  const action = page.locator(`[data-home-day-id="${day.id}"] .oak-home-day-open`);
  await action.click(); await settle(page);
  expect(await page.evaluate(() => window.oak!.probe.experience?.model.day.id)).toBe(day.id);
  await page.getByRole("button", { name: "旅程首頁" }).click(); await settle(page);
  expect(await page.evaluate(() => window.oak!.probe.surface)).toBe("home");
  expect(await page.locator('.oak-home-days [data-home-task-id]').count()).toBe(model.tasks.filter(task => task.scope === "day").length);
  const task = page.locator('.oak-home-days [data-home-task-id] input[type="checkbox"]').first();
  await task.check(); await settle(page); await expect(task).toBeChecked();
});

test("desktop Home gives the authored day list the wide left column", async ({ page }) => {
  await openHome(page, 1024, 900);
  const sample = await geometry(page);
  await capture(page, 1024, sample);
  expect(sample.order).toEqual(["days", "utilities"]);
  expect(sample.days.left).toBeLessThan(sample.utilities.left);
  expect(sample.days.width).toBeGreaterThan(sample.utilities.width);
  expect(sample.utilities.width).toBeGreaterThanOrEqual(240);
  expect(sample.utilities.width).toBeLessThanOrEqual(320);
  expect(sample.days.right).toBeLessThan(sample.utilities.left);
});

test("narrow Home at 200 percent text keeps both columns in natural flow without horizontal clipping", async ({ page }) => {
  await openHome(page, 320, 568);
  await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
  await settle(page);
  const sample = await geometry(page);
  expect(sample.scrollWidth).toBe(320);
  expect(sample.days.left).toBeGreaterThanOrEqual(0);
  expect(sample.days.right).toBeLessThanOrEqual(320);
  expect(sample.utilities.left).toBeGreaterThanOrEqual(0);
  expect(sample.utilities.right).toBeLessThanOrEqual(320);
  expect(sample.days.bottom).toBeLessThanOrEqual(sample.utilities.top);
  expect(await page.locator(".oak-home-day-heading").first().evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(1);
  for (const selector of [".oak-home-day-index > li:first-child .oak-control", ".oak-home-utilities section:last-child"]) {
    const element = page.locator(selector); await element.scrollIntoViewIfNeeded();
    const box = await element.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThan(568);
    expect(box!.y + box!.height).toBeGreaterThan(0);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
});

test("narrow layout-only long day copy keeps text, action, and utility within the viewport", async ({ page }) => {
  await openHome(page, 320, 568);
  const longTitle = "海港與街巷的完整旅途名稱".repeat(12);
  const longSummary = "AnUnbrokenAuthoredSummary".repeat(12);
  await page.evaluate(({ longTitle, longSummary }) => {
    document.querySelector(".oak-home-day-index h3")!.textContent = longTitle;
    const summary = document.querySelector(".oak-home-day-index > li:first-child .oak-home-day-copy > p:not(.oak-home-progress)");
    if (!summary) throw new Error("Expected authored summary");
    summary.textContent = longSummary;
  }, { longTitle, longSummary });
  for (const scale of [16, 32]) {
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${scale}px`; }, scale);
    expect(await page.locator(".oak-home-day-heading").first().evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(1);
    for (const selector of [".oak-home-day-index h3", ".oak-home-day-index > li:first-child .oak-home-day-copy > p:not(.oak-home-progress)", ".oak-home-day-open", ".oak-home-day-utility"]) {
      const target = page.locator(selector).first(); await target.scrollIntoViewIfNeeded();
      const rect = await target.evaluate(element => {
        const value = element.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(element);
        return { left: value.left, right: value.right, top: value.top, bottom: value.bottom,
          text: [...range.getClientRects()].map(line => ({ left: line.left, right: line.right, top: line.top, bottom: line.bottom })) };
      });
      expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(320);
      expect(rect.top).toBeLessThan(568); expect(rect.bottom).toBeGreaterThan(0);
      for (const line of rect.text) { expect(line.left).toBeGreaterThanOrEqual(0); expect(line.right).toBeLessThanOrEqual(320); }
      if (selector.includes("h3") || selector.includes("p:not")) {
        for (const end of ["first", "last"] as const) {
          const line = await target.evaluate((element, end) => {
            const range = document.createRange(); range.selectNodeContents(element);
            const lines = [...range.getClientRects()];
            const original = end === "first" ? lines[0] : lines.at(-1)!;
            window.scrollBy(0, original.top - 100);
            const scrolled = [...range.getClientRects()];
            const current = end === "first" ? scrolled[0] : scrolled.at(-1)!;
            return { left: current.left, right: current.right, top: current.top, bottom: current.bottom };
          }, end);
          expect(line.left).toBeGreaterThanOrEqual(0); expect(line.right).toBeLessThanOrEqual(320);
          expect(line.top).toBeGreaterThanOrEqual(0); expect(line.bottom).toBeLessThanOrEqual(568);
        }
      }
      if (process.env.OAK_HOME_CAPTURE_PHASE === "after" && scale === 32 && [".oak-home-day-index h3", ".oak-home-day-open", ".oak-home-day-utility"].includes(selector)) {
        const subject = selector.includes("h3") ? "title" : selector.includes("open") ? "action" : "utility";
        await page.screenshot({ path: `${root}/task-8-batch14-after-320-200-${subject}.png` });
        await writeFile(`${root}/task-8-batch14-after-320-200-${subject}.json`, JSON.stringify(rect, null, 2));
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }
});

test("forced colors keeps an icon-only day button boundary", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await openHome(page, 390, 844);
  const action = page.locator(".oak-home-day-open").first();
  const border = await action.evaluate(element => getComputedStyle(element).borderTopColor);
  expect(border).not.toBe("transparent");
  await action.focus(); await expect(action).toBeFocused();
});

test("Home utility records expose authored facts and owned reservation navigation", async ({ page }) => {
  await openHome(page, 390, 844);
  const model = await page.evaluate(() => window.oak!.probe.home!.model);
  expect(await page.locator("[data-home-lodging-owner]").count()).toBe(model.lodging.length);
  expect(await page.locator("[data-home-reservation-id]").count()).toBe(model.reservations.length);
  for (const fact of model.lodging) {
    const record = page.locator(`[data-home-lodging-owner="${fact.ownerId}"]`);
    await expect(record.locator("h3")).toHaveText(fact.title);
    await expect(record.locator(".oak-home-lodging-heading > span")).toHaveText(catalog.facts[fact.role === "check-in" ? "checkIn" : fact.role === "check-out" ? "checkOut" : fact.role]);
    await expect(record.locator(".oak-home-timing")).toContainText(catalog.timing[fact.timing.certainty]);
    if (fact.timing.start !== undefined) await expect(record.locator(".oak-home-timing")).toContainText(fact.timing.start);
    if (fact.timing.end !== undefined) await expect(record.locator(".oak-home-timing")).toContainText(fact.timing.end);
    if (fact.timing.dayOffset !== undefined && fact.timing.dayOffset !== 0) await expect(record.locator(".oak-home-timing")).toContainText(`${catalog.timing.nextDay} ${fact.timing.dayOffset}`);
    if (fact.place) {
      await expect(record.locator(".oak-home-place")).toContainText(catalog.certainty[fact.place.certainty]);
      if (fact.place.label !== fact.title) await expect(record.locator(".oak-home-place")).toContainText(fact.place.label);
      if (fact.place.resolution.status === "unresolved") await expect(record.locator(".oak-home-place")).toContainText(catalog.facts.unverifiedLocation);
    }
    if (fact.booking) await expectBooking(record, fact.booking);
    else await expect(record.locator(".oak-home-booking")).toHaveCount(0);
  }
  for (const fact of model.reservations) {
    const record = page.locator(`[data-home-reservation-id="${fact.id}"]`);
    await expect(record.locator("h3")).toHaveText(fact.title);
    await expectBooking(record, fact.booking);
    await expect(record.locator(".oak-home-reservation-open")).toHaveCount(fact.destination ? 1 : 0);
    if (fact.destination) await expect(record.locator(".oak-home-reservation-open")).toHaveAccessibleName(`${catalog.home.openDay} · ${fact.title}`);
  }
  await expect(page.locator(".oak-home-booking a, .oak-home-booking button")).toHaveCount(0);
  await expect(page.locator(".oak-home-flow button, .oak-home-flow input")).toHaveCount(model.days.filter(day => model.capabilities.openExperienceDayIds.includes(day.id)).length + model.tasks.length + model.tasks.flatMap(task => task.children).length + model.reservations.filter(reservation => reservation.destination).length);
});

async function expectBooking(record: import("@playwright/test").Locator, booking: BookingFactModel) {
  await expect(record.locator(".oak-home-booking-status")).toHaveText(catalog.booking[booking.status]);
  if (booking.reference !== undefined) {
    await expect(record.locator(".oak-home-booking-reference dt")).toHaveText(catalog.booking.reference);
    await expect(record.locator(".oak-home-booking-reference dd")).toHaveText(booking.reference);
  } else await expect(record.locator(".oak-home-booking-reference")).toHaveCount(0);
  if (booking.arrivalBufferMinutes !== undefined) await expect(record.locator(".oak-home-booking-buffer")).toHaveText(catalog.facts.arrivalBuffer.replace("{minutes}", String(booking.arrivalBufferMinutes)));
  else await expect(record.locator(".oak-home-booking-buffer")).toHaveCount(0);
  if (booking.url !== undefined) await expect(record.locator(".oak-home-booking-url")).toHaveText(booking.url);
  else await expect(record.locator(".oak-home-booking-url")).toHaveCount(0);
  await expect(record.locator(".oak-home-booking a, .oak-home-booking button")).toHaveCount(0);
}

test("Home utility facts stay horizontally bounded and visible after scrolling at mobile, sidebar, and enlarged text sizes", async ({ page }) => {
  const phase = process.env.OAK_HOME_UTILITY_CAPTURE_PHASE;
  for (const { width, height, scale, subjects } of [
    { width: 390, height: 844, scale: 16, subjects: { lodging: "[data-home-lodging-owner] h3", reservation: "[data-home-reservation-id] h3" } },
    { width: 1024, height: 900, scale: 16, subjects: { lodging: "[data-home-lodging-owner] h3", reservation: "[data-home-reservation-id] h3" } },
    { width: 320, height: 568, scale: 32, subjects: { title: "[data-home-lodging-owner] h3", reference: "[data-home-reservation-id] .oak-home-booking-reference dd", url: "[data-home-reservation-id] .oak-home-booking-url" } },
  ]) {
    await openHome(page, width, height);
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${scale}px`; }, scale);
    await settle(page);
    const specimen = page.locator("[data-home-lodging-owner], [data-home-reservation-id]");
    for (let index = 0; index < await specimen.count(); index++) {
      const record = specimen.nth(index);
      for (const selector of ["h3", ".oak-home-booking-status", ".oak-home-booking-reference dd", ".oak-home-booking-buffer", ".oak-home-booking-url", ".oak-home-timing", ".oak-home-place"]) {
        const target = record.locator(selector);
        if (await target.count() === 0) continue;
        await target.scrollIntoViewIfNeeded();
        const bounds = await target.evaluate(element => {
          const box = element.getBoundingClientRect();
          const range = document.createRange(); range.selectNodeContents(element);
          return { left: box.left, right: box.right, lines: [...range.getClientRects()].map(rect => ({ left: rect.left, right: rect.right })) };
        });
        expect(bounds.left).toBeGreaterThanOrEqual(-0.5);
        expect(bounds.right).toBeLessThanOrEqual(width + 0.5);
        for (const line of bounds.lines) { expect(line.left).toBeGreaterThanOrEqual(-0.5); expect(line.right).toBeLessThanOrEqual(width + 0.5); }
        if (["h3", ".oak-home-booking-reference dd", ".oak-home-booking-url"].includes(selector)) {
          for (const end of ["first", "last"] as const) {
            const line = await target.evaluate((element, end) => {
              const range = document.createRange(); range.selectNodeContents(element);
              const rects = [...range.getClientRects()];
              const chosen = end === "first" ? rects[0] : rects.at(-1);
              if (!chosen) return null;
              window.scrollBy(0, chosen.top - 100);
              const moved = [...range.getClientRects()];
              const rect = end === "first" ? moved[0] : moved.at(-1)!;
              return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
            }, end);
            if (line) { expect(line.left).toBeGreaterThanOrEqual(-0.5); expect(line.right).toBeLessThanOrEqual(width + 0.5); expect(line.top).toBeGreaterThanOrEqual(0); expect(line.bottom).toBeLessThanOrEqual(height); }
          }
        }
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (phase === "before" || phase === "after") {
      for (const [subject, selector] of Object.entries(subjects)) {
        const effectiveSelector = phase === "before" && width === 320 && subject === "reference" ? "[data-home-reservation-id] .oak-home-booking > p:nth-child(2)" : phase === "before" && width === 320 && subject === "url" ? "[data-home-reservation-id] .oak-home-booking > p:last-child" : selector;
        const target = page.locator(effectiveSelector).first();
        if (await target.count() === 0) continue;
        await target.scrollIntoViewIfNeeded();
        const box = await target.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(height);
        await page.screenshot({ path: `${root}/task-8-batch15-${phase}-${width}-${subject}.png` });
        await writeFile(`${root}/task-8-batch15-${phase}-${width}-${subject}.json`, JSON.stringify({ subject, selector: effectiveSelector, viewport: { width, height, scale }, box, scrollY: await page.evaluate(() => scrollY) }, null, 2));
      }
    }
  }
});

test("utility typography keeps titles and booking truth primary with readable twelve pixel facts", async ({ page }) => {
  await openHome(page, 390, 844);
  const metrics = await page.evaluate(() => {
    const style = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const css = getComputedStyle(element);
      return { size: css.fontSize, weight: css.fontWeight, color: css.color, marginTop: css.marginTop, textDecoration: css.textDecorationLine };
    };
    return { title: style("[data-home-lodging-owner] h3"), role: style(".oak-home-lodging-heading > span"), timing: style(".oak-home-timing"), reservationTitle: style("[data-home-reservation-id] h3"), status: style(".oak-home-booking-status"), referenceLabel: style(".oak-home-booking-reference dt"), referenceValue: style(".oak-home-booking-reference dd"), buffer: style(".oak-home-booking-buffer"), url: style(".oak-home-booking-url") };
  });
  expect(metrics.title.size).toBe("16px"); expect(metrics.title.weight).toBe("720");
  expect(metrics.reservationTitle.size).toBe("14px"); expect(metrics.reservationTitle.weight).toBe("780");
  expect(metrics.role.size).toBe("12px"); expect(metrics.role.weight).toBe("720");
  expect(metrics.timing.size).toBe("12px");
  expect(metrics.status.size).toBe("12px"); expect(metrics.status.weight).toBe("720"); expect(metrics.status.color).toBe(metrics.title.color);
  expect(metrics.referenceLabel.color).toBe(metrics.role.color);
  expect(metrics.referenceValue.color).toBe(metrics.title.color);
  expect(metrics.buffer.size).toBe("12px"); expect(metrics.url.size).toBe("12px");
  expect(metrics.url.color).toBe(metrics.referenceLabel.color); expect(metrics.url.marginTop).toBe("4px"); expect(metrics.url.textDecoration).toBe("none");
});

test("DOM-only long utility facts wrap in the 240 pixel sidebar and at 200 percent text", async ({ page }) => {
  for (const [width, height, scale] of [[1024, 900, 16], [320, 568, 32]]) {
    await openHome(page, width, height);
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${scale}px`; }, scale);
    await page.evaluate(() => {
      document.querySelector("[data-home-lodging-owner] h3")!.textContent = "合成旅宿沿岸入口與複合式建物名稱".repeat(10);
      document.querySelector("[data-home-reservation-id] .oak-home-booking-reference dd")!.textContent = "UNBROKENREFERENCE".repeat(14);
      document.querySelector("[data-home-reservation-id] .oak-home-booking-url")!.textContent = "https://example.invalid/" + "unbrokenURLsegment".repeat(20);
    });
    for (const selector of ["[data-home-lodging-owner] h3", "[data-home-reservation-id] .oak-home-booking-reference dd", "[data-home-reservation-id] .oak-home-booking-url"]) {
      const target = page.locator(selector); await target.scrollIntoViewIfNeeded();
      const lines = await target.evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); return [...range.getClientRects()].map(rect => ({ left: rect.left, right: rect.right })); });
      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) { expect(line.left).toBeGreaterThanOrEqual(-0.5); expect(line.right).toBeLessThanOrEqual(width + 0.5); }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test("forced colors keeps reservation facts readable without a link or action affordance", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await openHome(page, 390, 844);
  for (const selector of [".oak-home-booking-status", ".oak-home-booking-reference dt", ".oak-home-booking-reference dd", ".oak-home-booking-buffer", ".oak-home-booking-url"]) {
    const target = page.locator(selector).first(); await expect(target).toBeVisible();
    const css = await target.evaluate(element => ({ color: getComputedStyle(element).color, decoration: getComputedStyle(element).textDecorationLine, cursor: getComputedStyle(element).cursor }));
    expect(css.color).not.toBe("rgba(0, 0, 0, 0)");
    expect(css.decoration).toBe("none");
    expect(css.cursor).not.toBe("pointer");
  }
  await expect(page.locator(".oak-home-booking a, .oak-home-booking button")).toHaveCount(0);
});
