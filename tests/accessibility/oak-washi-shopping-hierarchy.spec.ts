import { writeFile } from "node:fs/promises";
import { test, expect, variants, openCase, settle } from "../fixtures/oak-washi/browser/checks.js";
import { catalog } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js";

const scratch = ".superpowers/sdd/2026-09-04-eternal-pose-v2-04-oak-washi";

test("one-item shopping title uses the owner heading and preserves native status control", async ({ page }) => {
  await page.goto("/?case=experience-default&variant=full-day&details=equivalent"); await settle(page);
  await page.evaluate(() => { window.oak!.probe.actions!.setSheetSnap("expanded"); window.oak!.probe.actions!.selectNode("node-shopping"); }); await settle(page);
  const row = page.locator('[data-owner-id="node-shopping"]');
  await expect(row.locator(".oak-row-title")).toHaveText("Blank field journal");
  await expect(row.locator(".oak-shopping-title")).toHaveCount(0);
  const select = row.getByRole("combobox", { name: `Blank field journal · ${catalog.facts.status}` });
  await select.scrollIntoViewIfNeeded();
  expect(await select.evaluate(element => element.tagName)).toBe("SELECT");
  expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(select.locator("option")).toHaveText([catalog.progress.pending, catalog.progress.purchased, catalog.progress.unavailable, catalog.progress.skipped]);
  await select.selectOption("purchased"); await settle(page);
  await expect(select).toHaveValue("purchased");
  const facts = await page.evaluate(() => { const entry = window.oak!.probe.experience!.model.timeline.find(item => item.kind === "node" && item.nodeId === "node-shopping"); return entry?.kind === "node" ? entry.facts : null; });
  expect(facts).toMatchObject({ kind: "shopping", items: [{ title: "Blank field journal", status: "purchased" }] });
});

async function shoppingPage(page: import("@playwright/test").Page, zoom: boolean) {
  const item = variants.find(item => item.visualCase.id === (zoom ? "experience-expanded-dense" : "experience-default") && item.variant.id === (zoom ? "dense-expanded-small" : "full-day"))!;
  await openCase(page, item.visualCase, item.variant);
  if (zoom) {
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    await settle(page);
  } else {
    await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("expanded"));
    await settle(page);
  }
  await page.locator('[data-owner-id="node-shopping"] .oak-row-selection').click();
  await settle(page);
  const row = page.locator('[data-shopping-id="shopping-journal"]');
  await row.locator("select").scrollIntoViewIfNeeded();
  await settle(page);
  return row;
}

async function evidence(row: import("@playwright/test").Locator) {
  return row.evaluate(element => {
    const title = element.querySelector<HTMLElement>(".oak-shopping-title");
    const priority = element.querySelector<HTMLElement>(".oak-shopping-priority");
    const select = element.querySelector<HTMLSelectElement>("select")!;
    const label = select.closest("label")!;
    const port = element.closest<HTMLElement>(".oak-sheet-scroll")!;
    const box = (node: Element) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const style = (node: Element) => { const s = getComputedStyle(node); return { display: s.display, flexDirection: s.flexDirection, gap: s.gap, fontSize: s.fontSize, fontWeight: s.fontWeight, color: s.color, overflowWrap: s.overflowWrap, borderRadius: s.borderRadius, borderWidth: s.borderTopWidth, paddingLeft: s.paddingLeft, height: s.minHeight, boxSizing: s.boxSizing, outlineWidth: s.outlineWidth, outlineStyle: s.outlineStyle }; };
    return { viewport: { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth }, row: { box: box(element), style: style(element) }, title: title && { text: title.textContent, box: box(title), style: style(title) }, priority: priority && { text: priority.textContent, box: box(priority), style: style(priority) }, label: { text: label.textContent, box: box(label), style: style(label) }, select: { value: select.value, options: [...select.options].map(option => [option.value, option.text]), box: box(select), style: style(select), name: select.getAttribute("aria-label") }, port: { box: box(port), scrollTop: port.scrollTop, scrollHeight: port.scrollHeight, clientHeight: port.clientHeight }, model: window.oak!.probe.experience!.model };
  });
}

async function capture(page: import("@playwright/test").Page, size: string, sample: Awaited<ReturnType<typeof evidence>>) {
  const phase = process.env.OAK_SHOPPING_HIERARCHY_PHASE;
  if (phase !== "before" && phase !== "after") return;
  await page.screenshot({ path: `${scratch}/task-8-batch9-${phase}-${size}.png` });
  await writeFile(`${scratch}/task-8-batch9-${phase}-${size}.json`, JSON.stringify(sample, null, 2));
}

for (const zoom of [false, true]) test(`${zoom ? "320px at 200 percent" : "390px"} shopping facts and native select fit the sheet`, async ({ page }) => {
  const row = await shoppingPage(page, zoom);
  const sample = await evidence(row);
  await capture(page, zoom ? "320-200" : "390", sample);
  if (zoom && process.env.OAK_SHOPPING_HIERARCHY_PHASE === "after") {
    await row.locator(":scope > :first-child").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${scratch}/task-8-batch9-after-320-200-title.png` });
  }
  expect(sample.viewport.documentWidth).toBe(sample.viewport.width);
  expect(sample.title).not.toBeNull();
  expect(sample.title!.text).toBe("Blank field journal");
  expect(sample.priority!.text).toBe(`${catalog.facts.priority}: ${catalog.facts.nice}`);
  expect(sample.row.style.flexDirection).toBe("column");
  expect(sample.title!.box.bottom).toBeLessThanOrEqual(sample.priority!.box.top);
  expect(Number.parseInt(sample.title!.style.fontWeight)).toBeGreaterThan(Number.parseInt(sample.priority!.style.fontWeight));
  expect(sample.title!.style.overflowWrap).toBe("anywhere");
  expect(sample.label.style.display).toBe("flex");
  expect(sample.select.name).toBe(`Blank field journal · ${catalog.facts.status}`);
  expect(sample.select.options).toEqual([["pending", catalog.progress.pending], ["purchased", catalog.progress.purchased], ["unavailable", catalog.progress.unavailable], ["skipped", catalog.progress.skipped]]);
  expect(sample.select.box.height).toBeGreaterThanOrEqual(44);
  expect(Number.parseFloat(sample.select.style.borderRadius)).toBeGreaterThan(0);
  expect(Number.parseFloat(sample.select.style.paddingLeft)).toBeGreaterThan(0);
  expect(sample.select.style.boxSizing).toBe("border-box");
  for (const target of [row.locator(".oak-shopping-title"), row.locator(".oak-shopping-priority"), row.locator("select")]) {
    await target.scrollIntoViewIfNeeded();
    const check = await target.evaluate(element => {
      const r = element.getBoundingClientRect(); const port = element.closest(".oak-sheet-scroll")!; const p = port.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, clip: { left: Math.max(0, p.left + port.clientLeft), right: Math.min(innerWidth, p.left + port.clientLeft + port.clientWidth), top: Math.max(0, p.top + port.clientTop), bottom: Math.min(innerHeight, p.top + port.clientTop + port.clientHeight) } };
    });
    expect(check.left).toBeGreaterThanOrEqual(check.clip.left - 1); expect(check.right).toBeLessThanOrEqual(check.clip.right + 1);
    expect(check.top).toBeGreaterThanOrEqual(check.clip.top - 1); expect(check.bottom).toBeLessThanOrEqual(check.clip.bottom + 1);
  }
  const select = row.locator("select");
  for (const status of ["purchased", "unavailable", "skipped", "pending"] as const) {
    await select.selectOption(status); await settle(page);
    await expect(select).toHaveValue(status);
    expect(await page.evaluate(() => {
      const entry = window.oak!.probe.experience!.model.timeline.find(entry => entry.kind === "node" && entry.nodeId === "node-shopping");
      return entry?.kind === "node" ? entry.facts : null;
    })).toMatchObject({ kind: "shopping", items: [expect.objectContaining({ id: "shopping-journal", status })] });
  }
  await select.focus(); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
  await expect(select).toBeFocused();
  expect((await evidence(row)).select.style.outlineWidth).toBe("3px");
  await page.emulateMedia({ forcedColors: "active" });
  const forced = await evidence(row);
  expect(forced.select.style.borderWidth).not.toBe("0px");
  expect(forced.select.style.outlineWidth).toBe("3px");
});
