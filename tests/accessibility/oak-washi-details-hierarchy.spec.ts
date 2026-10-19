import { writeFile } from "node:fs/promises";
import { test, expect, variants, openCase, settle } from "../fixtures/oak-washi/browser/checks.js";
import { catalog } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js";

const scratch = ".superpowers/sdd/2026-09-04-eternal-pose-v2-04-oak-washi";
type Page = import("@playwright/test").Page;
type Locator = import("@playwright/test").Locator;

test("equivalent reservation title keeps one owner heading and all distinct booking facts", async ({ page }) => {
  await page.goto("/?case=experience-default&variant=full-day&details=equivalent"); await settle(page);
  await page.evaluate(() => { window.oak!.probe.actions!.setSheetSnap("expanded"); window.oak!.probe.actions!.selectNode("node-experience"); }); await settle(page);
  const row = page.locator('[data-owner-id="node-experience"]');
  await expect(row.locator(".oak-row-title")).toHaveText("Synthetic workshop");
  await expect(row.locator(".oak-reservation h4")).toHaveCount(0);
  await expect(row.locator(".oak-booking-reference dd")).toHaveText(["SYNTHETIC-WORKSHOP", "SYNTHETIC-HOLD"]);
  await expect(row.locator(".oak-booking-link")).toHaveCount(2);
  expect(await page.evaluate(() => window.oak!.probe.experience!.model.reservations[0].title)).toBe(" Synthetic  workshop ");
});

async function workshop(page: Page, width: number, zoom = false) {
  const item = variants.find(item => item.visualCase.id === "experience-default" && item.variant.id === "full-day")!;
  await openCase(page, item.visualCase, item.variant);
  await page.setViewportSize({ width, height: 844 });
  if (zoom) await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
  await page.evaluate(() => { window.oak!.probe.actions!.setSheetSnap("expanded"); window.oak!.probe.actions!.selectNode("node-experience"); });
  await settle(page);
  const details = page.locator('[data-details-owner="node-experience"]');
  await expect(details).toBeVisible();
  return details;
}

async function withinScrollport(target: Locator) {
  await target.scrollIntoViewIfNeeded();
  return target.evaluate(element => {
    const r = element.getBoundingClientRect();
    const port = element.closest<HTMLElement>(".oak-sheet-scroll")!;
    const p = port.getBoundingClientRect();
    return { text: element.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
      clip: { left: Math.max(0, p.left + port.clientLeft), right: Math.min(innerWidth, p.left + port.clientLeft + port.clientWidth), top: Math.max(0, p.top + port.clientTop), bottom: Math.min(innerHeight, p.top + port.clientTop + port.clientHeight) } };
  });
}

async function capture(page: Page, details: Locator, phase: string, size: string) {
  const owner = page.locator('[data-owner-id="node-experience"]');
  const slices = [
    ["title-booking", owner.locator(".oak-row-title")],
    ["node-booking-link", details.locator(":scope > .oak-booking-facts .oak-booking-link")],
    ["reservation-heading", details.locator(":scope > .oak-reservation h4")],
    ["reservation-link", details.locator(":scope > .oak-reservation .oak-booking-link")],
    ["completion", details.locator(":scope > .oak-detail-actions .oak-completion-action")],
  ] as const;
  const proof = [];
  for (const [name, subject] of slices) {
    const box = await withinScrollport(subject);
    expect(box.top, `${name} visible at capture`).toBeGreaterThanOrEqual(box.clip.top - 1);
    expect(box.bottom, `${name} visible at capture`).toBeLessThanOrEqual(box.clip.bottom + 1);
    proof.push({ name, box });
    await page.screenshot({ path: `${scratch}/task-8-batch13-${phase}-${size}-${name}.png` });
  }
  await writeFile(`${scratch}/task-8-batch13-${phase}-${size}.json`, JSON.stringify(proof, null, 2));
}

for (const [width, zoom] of [[390, false], [320, false], [320, true]] as const) test(`${width}px${zoom ? " at 200 percent" : ""} owner booking and actions remain reachable`, async ({ page }) => {
  const details = await workshop(page, width, zoom);
  const size = zoom ? "320-200" : String(width);
  const phase = process.env.OAK_DETAILS_HIERARCHY_PHASE;
  if (phase === "before" || phase === "after") await capture(page, details, phase, size);
  const model = await page.evaluate(() => window.oak!.probe.experience!.model);
  const node = model.timeline.find(entry => entry.kind === "node" && entry.nodeId === "node-experience");
  expect(node?.kind).toBe("node"); if (node?.kind !== "node") throw new Error("Workshop node missing");
  const reservation = model.reservations.find(item => item.ownerId === node.ownerId)!;
  const direct = details.locator(":scope > .oak-booking-facts");
  const attached = details.locator(":scope > .oak-reservation");
  await expect(direct.locator(".oak-booking-status")).toHaveText(catalog.booking[node.booking!.status]);
  await expect(direct.locator(".oak-booking-reference dt")).toHaveText(catalog.booking.reference);
  await expect(direct.locator(".oak-booking-reference dd")).toHaveText(node.booking!.reference!);
  await expect(attached.locator("h4")).toHaveText(reservation.title);
  await expect(attached.locator(".oak-booking-status")).toHaveText(catalog.booking[reservation.booking.status]);
  await expect(attached.locator(".oak-booking-reference dd")).toHaveText(reservation.booking.reference!);
  await expect(attached.locator(".oak-booking-buffer")).toHaveText(catalog.facts.arrivalBuffer.replace("{minutes}", String(reservation.booking.arrivalBufferMinutes)));
  const links = details.locator(".oak-booking-link");
  await expect(links).toHaveCount(2);
  expect(await links.evaluateAll(elements => elements.map(element => element.getAttribute("href")))).toEqual([node.booking!.url, reservation.booking.url]);
  for (const link of [links.nth(0), links.nth(1)]) {
    await expect(link).toHaveAttribute("target", "_blank"); await expect(link).toHaveAttribute("rel", "noreferrer");
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  const footer = details.locator(":scope > .oak-detail-actions:not(:empty)");
  const complete = footer.getByRole("button", { name: catalog.progress.markComplete });
  expect((await complete.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await footer.evaluate(element => getComputedStyle(element).borderTopWidth)).toBe("1px");
  expect(await attached.evaluate(element => getComputedStyle(element).borderTopWidth)).toBe("1px");
  expect(await direct.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(width === 390 ? 2 : 1);
  const targets = [details.locator(".oak-detail-fact").first(), direct.locator(".oak-booking-status"), direct.locator(".oak-booking-reference"), direct.locator(".oak-booking-link"), attached.locator("h4"), attached.locator(".oak-booking-status"), attached.locator(".oak-booking-reference"), attached.locator(".oak-booking-buffer"), attached.locator(".oak-booking-link"), complete];
  for (const target of targets) {
    const box = await withinScrollport(target);
    expect(box.left, box.text ?? "target").toBeGreaterThanOrEqual(box.clip.left - 1);
    expect(box.right, box.text ?? "target").toBeLessThanOrEqual(box.clip.right + 1);
    expect(box.top, box.text ?? "target").toBeGreaterThanOrEqual(box.clip.top - 1);
    expect(box.bottom, box.text ?? "target").toBeLessThanOrEqual(box.clip.bottom + 1);
  }
  await complete.focus(); await expect(complete).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab"); await expect(complete).toBeFocused();
  await links.nth(1).focus(); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab"); await expect(links.nth(1)).toBeFocused();
  await page.emulateMedia({ forcedColors: "active" });
  await page.keyboard.press("Tab"); await expect(complete).toBeFocused();
  expect(await complete.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
  await page.keyboard.press("Shift+Tab"); await expect(links.nth(1)).toBeFocused();
  expect(await links.nth(1).evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
  await page.emulateMedia({ forcedColors: "none" });
  await complete.click(); await settle(page);
  expect(await page.evaluate(() => { const entry = window.oak!.probe.experience!.model.timeline.find(entry => entry.kind === "node" && entry.nodeId === "node-experience"); return entry?.kind === "node" ? entry.completion?.completed : null; })).toBe(true);
  const undo = details.getByRole("button", { name: catalog.progress.markIncomplete });
  await expect(undo).toBeVisible(); await undo.click(); await settle(page);
  expect(await page.evaluate(() => { const entry = window.oak!.probe.experience!.model.timeline.find(entry => entry.kind === "node" && entry.nodeId === "node-experience"); return entry?.kind === "node" ? entry.completion?.completed : null; })).toBe(false);
});
