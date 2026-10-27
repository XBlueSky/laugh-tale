import { writeFile } from "node:fs/promises";
import { test, expect, variants, settle } from "../fixtures/oak-washi/browser/checks.js";
import { catalog } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js";

const scratch = ".superpowers/sdd/2026-09-04-eternal-pose-v2-04-oak-washi";

for (const [width, zoom] of [[320, false], [390, false], [320, true]] as const) test(`${width}px${zoom ? " at 200 percent" : ""} opening comparison reveals its heading and first choice automatically`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/?case=candidate-open&variant=draft&details=long"); await settle(page);
  if (zoom) await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
  if (zoom) { await page.getByRole("button", { name: "收合日期導覽", exact: true }).click(); await settle(page); }
  await page.evaluate(() => { window.oak!.probe.actions!.setSheetSnap("expanded"); window.oak!.probe.actions!.selectNode("node-dining"); }); await settle(page);
  const trigger = page.getByRole("button", { name: catalog.candidate.reopen, exact: true });
  await trigger.click(); await settle(page);
  const dialog = page.locator(".oak-candidate-dialog");
  await expect(dialog.locator("h4")).toBeInViewport({ ratio: 1 });
  await expect(dialog.locator(".oak-candidate-title").first()).toBeInViewport({ ratio: zoom ? 0.5 : 1 });
  const heading = await dialog.locator("h4").boundingBox();
  const port = await page.locator(".oak-sheet-scroll").boundingBox();
  expect(heading!.y).toBeGreaterThanOrEqual(port!.y + 1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const selected = dialog.locator('[aria-pressed="true"]');
  expect(await selected.evaluate(element => getComputedStyle(element).boxShadow)).toBe("none");
  expect(await selected.evaluate(element => getComputedStyle(element).borderLeftWidth)).toBe("1px");
  await page.keyboard.press("Escape"); await settle(page);
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("keyboard-opened comparison uses a visible top focus rule instead of a second card", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=candidate-open&variant=draft&details=long"); await settle(page);
  await page.evaluate(() => { window.oak!.probe.actions!.setSheetSnap("expanded"); window.oak!.probe.actions!.selectNode("node-dining"); }); await settle(page);
  const reopen = page.getByRole("button", { name: catalog.candidate.reopen, exact: true });
  await reopen.focus();
  await reopen.press("Enter"); await settle(page);
  const dialog = page.locator(".oak-candidate-dialog");
  await expect(dialog).toBeFocused();
  const focusedStyle = await dialog.evaluate(element => {
    const style = getComputedStyle(element);
    const probe = document.createElement("span");
    probe.style.color = "var(--oak-focus)";
    document.body.append(probe);
    const focusColor = getComputedStyle(probe).color;
    probe.remove();
    return { outline: style.outlineStyle, topRule: Number.parseFloat(style.borderTopWidth), ruleColor: style.borderTopColor, focusColor };
  });
  expect(focusedStyle.outline).toBe("none");
  expect(focusedStyle.topRule).toBeGreaterThanOrEqual(3);
  expect(focusedStyle.ruleColor).toBe(focusedStyle.focusColor);
  await expect(dialog.locator("h4")).toBeInViewport({ ratio: 1 });
  await page.emulateMedia({ forcedColors: "active" });
  const forced = await dialog.evaluate(element => {
    const probe = document.createElement("span");
    probe.style.color = "Highlight";
    document.body.append(probe);
    const highlight = getComputedStyle(probe).color;
    probe.remove();
    const style = getComputedStyle(element);
    return { outline: style.outlineStyle, topRule: Number.parseFloat(style.borderTopWidth), ruleColor: style.borderTopColor, highlight };
  });
  expect(forced.outline).toBe("none");
  expect(forced.topRule).toBeGreaterThanOrEqual(3);
  expect(forced.ruleColor).toBe(forced.highlight);
  await page.emulateMedia({ forcedColors: "none" });
  await page.keyboard.press("Tab");
  const firstChoice = dialog.locator("button.oak-candidate-option").first();
  await expect(firstChoice).toBeFocused();
  expect(await firstChoice.evaluate(element => Number.parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(3);
});

for (const action of [catalog.candidate.cancel, catalog.candidate.confirm] as const) test(`closing comparison with ${action} returns focus to a fully visible trigger`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=candidate-open&variant=draft&details=long"); await settle(page);
  await page.evaluate(() => { window.oak!.probe.actions!.setSheetSnap("expanded"); window.oak!.probe.actions!.selectNode("node-dining"); }); await settle(page);
  const trigger = page.getByRole("button", { name: catalog.candidate.reopen, exact: true });
  await trigger.click(); await settle(page);
  const dialog = page.locator(".oak-candidate-dialog");
  await dialog.locator("button.oak-candidate-option").last().click(); await settle(page);
  await dialog.getByRole("button", { name: action, exact: true }).click(); await settle(page);
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toBeInViewport({ ratio: 1 });
  const geometry = await trigger.evaluate(element => {
    const target = element.getBoundingClientRect();
    const port = element.closest(".oak-sheet-scroll")!.getBoundingClientRect();
    return { top: target.top, bottom: target.bottom, clipTop: port.top, clipBottom: port.bottom };
  });
  expect(geometry.top, JSON.stringify(geometry)).toBeGreaterThanOrEqual(geometry.clipTop);
  expect(geometry.bottom, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.clipBottom);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

for (const [width, height, scale] of [[320, 568, 2], [224, 844, 1]] as const) test(`${width}px at ${scale * 100} percent reveals comparison text in the active sheet body without collapsing dates`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  await page.goto("/?case=candidate-open&variant=draft&details=long"); await settle(page);
  await page.evaluate(scale => {
    document.documentElement.style.fontSize = `${16 * scale}px`;
    window.oak!.probe.actions!.setHeaderExpanded(true);
    window.oak!.probe.actions!.setSheetSnap("expanded");
    window.oak!.probe.actions!.selectNode("node-dining");
  }, scale); await settle(page);
  if (scale === 2) await expect(page.locator(".oak-experience")).toHaveAttribute("data-chrome-scroll", "true");
  else expect(await page.evaluate(() => matchMedia("(max-width: 14rem)").matches)).toBe(true);
  const trigger = page.getByRole("button", { name: catalog.candidate.reopen, exact: true });
  await trigger.click(); await settle(page);
  const dialog = page.locator(".oak-candidate-dialog");
  await expect(dialog.locator("h4")).toBeInViewport({ ratio: 1 });
  await expect(dialog.locator(".oak-candidate-title").first()).toBeInViewport({ ratio: 0.5 });
  const heading = await dialog.locator("h4").boundingBox();
  const port = await page.locator(".oak-sheet-body").boundingBox();
  expect(heading!.y).toBeGreaterThanOrEqual(port!.y + 1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.locator(".oak-sheet-body").evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.oak!.probe.experience!.model.header.expanded)).toBe(true);
  await page.keyboard.press("Escape"); await settle(page);
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("browse comparison retains choices without preview or confirmation buttons", async ({ page }) => {
  await page.goto("/?case=candidate-open&variant=draft&details=browse"); await settle(page);
  await page.evaluate(() => { window.oak!.probe.actions!.setSheetSnap("expanded"); window.oak!.probe.actions!.selectNode("node-dining"); }); await settle(page);
  await page.getByRole("button", { name: catalog.candidate.reopen, exact: true }).click(); await settle(page);
  const dialog = page.locator(".oak-candidate-dialog");
  await expect(dialog.locator(".oak-candidate-option")).toHaveCount(2);
  await expect(dialog.locator("button.oak-candidate-option")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: catalog.candidate.confirm, exact: true })).toHaveCount(0);
});

async function candidatePage(page: import("@playwright/test").Page, zoom: boolean) {
  const id = zoom ? "candidate-zoom-200" : "candidate-open";
  const item = variants.find(item => item.visualCase.id === id && item.variant.id === (zoom ? "comparison" : "draft"))!;
  await page.setViewportSize(item.variant.viewport);
  await page.goto(`/?case=${id}&variant=${item.variant.id}`); await settle(page);
  await page.getByRole("button", { name: "收合日期導覽", exact: true }).click(); await settle(page);
  await page.getByRole("button", { name: "展開行程", exact: true }).click(); await settle(page);
  await page.locator('[data-owner-id="node-dining"] .oak-row-selection').click(); await settle(page);
  await page.getByRole("button", { name: catalog.candidate.reopen, exact: true }).click(); await settle(page);
  const dialog = page.getByRole("dialog", { name: "比較候選項目" });
  await expect(dialog).toBeVisible();
  await dialog.locator(".oak-candidate-option").last().click(); await settle(page);
  await dialog.scrollIntoViewIfNeeded();
  await settle(page);
  return dialog;
}

test("candidate choices read as separate touch targets instead of one undifferentiated list", async ({ page }) => {
  const dialog = await candidatePage(page, false);
  const choices = await dialog.locator(".oak-candidate-option").evaluateAll(options => options.map(option => {
    const rect = option.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, radius: Number.parseFloat(getComputedStyle(option).borderRadius) };
  }));
  expect(choices).toHaveLength(2);
  expect(choices[1].top - choices[0].bottom).toBeGreaterThanOrEqual(8);
  expect(choices.every(choice => choice.radius >= 8)).toBe(true);
});

async function evidence(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>(".oak-candidate-dialog")!;
    const box = (element: Element) => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const style = (element: Element) => { const s = getComputedStyle(element); return { display: s.display, columns: s.gridTemplateColumns, borderLeft: s.borderLeftWidth, borderTop: s.borderTopWidth, background: s.backgroundColor, fontSize: s.fontSize, fontWeight: s.fontWeight, color: s.color }; };
    const options = [...dialog.querySelectorAll<HTMLElement>(".oak-candidate-option")].map(option => {
      const title = option.querySelector<HTMLElement>(".oak-candidate-title");
      const copy = option.querySelector<HTMLElement>(".oak-candidate-copy");
      const facts = [...option.querySelectorAll<HTMLElement>(".oak-candidate-fact")];
      const status = option.querySelector<HTMLElement>(".oak-candidate-status");
      return { tag: option.tagName, ariaPressed: option.getAttribute("aria-pressed"), text: option.textContent,
        box: box(option), style: style(option), title: title && { text: title.textContent, box: box(title), style: style(title) },
        copy: copy && { box: box(copy), style: style(copy) },
        facts: facts.map(fact => ({ text: fact.textContent, box: box(fact), style: style(fact) })),
        statuses: status ? [...status.children].map(child => child.textContent) : [] };
    });
    const port = document.querySelector<HTMLElement>(".oak-sheet-scroll")!;
    return { viewport: { width: innerWidth, height: innerHeight }, scrollWidth: document.documentElement.scrollWidth,
      dialog: { box: box(dialog), style: style(dialog) }, scroll: { top: port.scrollTop, height: port.clientHeight, scrollHeight: port.scrollHeight, box: box(port) },
      options, footer: box(dialog.querySelector(".oak-detail-actions")!),
      model: window.oak!.probe.experience!.model.candidates[0] };
  });
}

async function capture(page: import("@playwright/test").Page, size: string, sample: Awaited<ReturnType<typeof evidence>>) {
  const phase = process.env.OAK_CANDIDATE_HIERARCHY_PHASE;
  if (phase !== "before" && phase !== "after") return;
  await page.screenshot({ path: `${scratch}/task-8-batch8-${phase}-${size}.png` });
  await writeFile(`${scratch}/task-8-batch8-${phase}-${size}.json`, JSON.stringify(sample, null, 2));
}

test("390px candidate comparison has titled fact lines without an enclosing card", async ({ page }) => {
  const dialog = await candidatePage(page, false);
  const sample = await evidence(page);
  await capture(page, "390", sample);
  expect(sample.options).toHaveLength(2);
  expect(sample.dialog.style.borderLeft).toBe("0px");
  expect(sample.dialog.style.borderTop).toBe("1px");
  expect(sample.dialog.style.background).toBe("rgba(0, 0, 0, 0)");
  for (const [index, supplied] of sample.model.options.entries()) {
    const visible = sample.options[index];
    expect(visible.text).toContain(supplied.ordinal);
    expect(visible.text).toContain(supplied.title);
    if (supplied.place) expect(visible.text).toContain(supplied.place.label);
    if (supplied.place) {
      expect(visible.text).toContain(catalog.certainty[supplied.place.certainty]);
      expect(visible.text?.includes(catalog.facts.unverifiedLocation)).toBe(supplied.place.resolution.status === "unresolved");
    }
    if (supplied.booking) expect(visible.text).toContain(catalog.booking[supplied.booking.status]);
    if (supplied.booking?.reference) expect(visible.text).toContain(supplied.booking.reference);
    expect(visible.ariaPressed).toBe(String(supplied.draft));
  }
  for (const option of sample.options) {
    expect(option.style.display).toBe("grid");
    expect(option.box.height).toBeGreaterThanOrEqual(44);
    expect(option.title).not.toBeNull(); expect(option.copy).not.toBeNull();
    expect(Number.parseFloat(option.title!.style.fontSize)).toBeGreaterThan(Number.parseFloat(option.facts[0].style.fontSize));
    expect(Number.parseInt(option.title!.style.fontWeight)).toBeGreaterThan(Number.parseInt(option.facts[0].style.fontWeight));
    expect(option.facts).toHaveLength(2);
    for (const fact of option.facts) {
      expect(fact.box.left).toBeCloseTo(option.title!.box.left, 0);
      expect(fact.box.top).toBeGreaterThanOrEqual(option.title!.box.bottom);
      expect(fact.box.right).toBeLessThanOrEqual(option.box.right);
    }
  }
  expect(sample.options[0].statuses).toContain(catalog.candidate.selected);
  expect(sample.options[1].statuses).toContain(catalog.candidate.draft);
  await expect(dialog.getByRole("button", { name: "取消" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "確認" })).toBeVisible();
  await page.emulateMedia({ forcedColors: "active" });
  await dialog.focus();
  await page.keyboard.press("Tab");
  const first = dialog.locator('.oak-candidate-option[aria-pressed="false"]');
  await expect(first).toBeFocused();
  expect(await first.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
  const draft = dialog.locator('.oak-candidate-option[aria-pressed="true"]');
  expect(await draft.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("double");
  await first.click(); await settle(page);
  await expect(dialog.locator(".oak-candidate-option").first()).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "取消", exact: true }).click(); await settle(page);
  await page.getByRole("button", { name: catalog.candidate.reopen, exact: true }).click(); await settle(page);
  await dialog.locator(".oak-candidate-option").last().click(); await settle(page);
  await dialog.getByRole("button", { name: "確認", exact: true }).click(); await settle(page);
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.oak!.probe.experience!.model.candidates[0].options[1].selected)).toBe(true);
});

test("320px at 200 percent keeps long titles, facts and actions reachable by sheet scroll", async ({ page }) => {
  const dialog = await candidatePage(page, true);
  const sample = await evidence(page);
  await capture(page, "320-200", sample);
  expect(sample.scrollWidth).toBe(320);
  for (const option of sample.options) {
    expect(option.title?.text).toContain("合成候選地點");
    expect(option.box.left).toBeGreaterThanOrEqual(0);
    expect(option.box.right).toBeLessThanOrEqual(320);
    expect(option.title!.box.right).toBeLessThanOrEqual(option.box.right);
    expect(option.facts).toHaveLength(2);
  }
  const scroll = page.locator(".oak-sheet-scroll");
  const intersects = async (target: import("@playwright/test").Locator) => {
    await target.scrollIntoViewIfNeeded();
    await settle(page);
    const rect = await target.boundingBox();
    const clip = await scroll.boundingBox();
    expect(rect).not.toBeNull(); expect(clip).not.toBeNull();
    expect(rect!.y).toBeGreaterThanOrEqual(clip!.y - 1);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(clip!.y + clip!.height + 1);
    expect(rect!.y).toBeGreaterThanOrEqual(-1);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(568 + 1);
    expect(rect!.x).toBeGreaterThanOrEqual(clip!.x);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(clip!.x + clip!.width);
  };
  for (const title of await dialog.locator(".oak-candidate-title").all()) await intersects(title);
  for (const name of ["取消", "確認"]) {
    const action = dialog.getByRole("button", { name, exact: true });
    await intersects(action);
    const rect = await action.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.y).toBeLessThan(568); expect(rect!.y + rect!.height).toBeGreaterThan(0);
    expect(rect!.x).toBeGreaterThanOrEqual(0); expect(rect!.x + rect!.width).toBeLessThanOrEqual(320);
  }
  await dialog.getByRole("button", { name: "確認", exact: true }).click();
  await settle(page);
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: catalog.candidate.reopen, exact: true }).click();
  await settle(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await settle(page);
  await expect(dialog).toHaveCount(0);
});
