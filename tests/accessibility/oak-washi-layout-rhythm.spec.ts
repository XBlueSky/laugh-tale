import { test, expect, settle } from "../fixtures/oak-washi/browser/checks.js";

test("mobile travel cover gives the first authored day room in the opening viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=home&variant=zero-mobile"); await settle(page);
  const layout = await page.evaluate(() => {
    const cover = document.querySelector(".oak-home-identity")!.getBoundingClientRect();
    const day = document.querySelector(".oak-home-day-index > li:first-child")!.getBoundingClientRect();
    const action = document.querySelector(".oak-home-day-index > li:first-child .oak-home-day-open")!.getBoundingClientRect();
    return { coverHeight: cover.height, dayTop: day.top, actionBottom: action.bottom, scrollWidth: document.documentElement.scrollWidth };
  });
  expect(layout.coverHeight).toBeLessThanOrEqual(320);
  expect(layout.dayTop).toBeLessThan(570);
  expect(layout.actionBottom).toBeLessThan(844);
  expect(layout.scrollWidth).toBe(390);
});

test("Home begins the day index one spacing step below its heading", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=home&variant=zero-mobile"); await settle(page);
  const gap = await page.evaluate(() => {
    const heading = document.querySelector(".oak-home-days > h2")!.getBoundingClientRect();
    const firstDay = document.querySelector(".oak-home-day-index > li:first-child .oak-home-day-meta")!.getBoundingClientRect();
    return firstDay.top - heading.bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(15);
  expect(gap).toBeLessThanOrEqual(17);
});

test("desktop Home gives the two columns one shared starting rule", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/?case=home&variant=zero-mobile"); await settle(page);
  const geometry = await page.evaluate(() => {
    const flow = document.querySelector(".oak-home-flow")!;
    const days = document.querySelector(".oak-home-days")!;
    const firstUtility = document.querySelector(".oak-home-utilities > .oak-home-section:first-child")!;
    return {
      flowTop: flow.getBoundingClientRect().top,
      daysTop: days.getBoundingClientRect().top,
      utilityTop: firstUtility.getBoundingClientRect().top,
      utilityRule: getComputedStyle(firstUtility).borderTopWidth,
    };
  });
  expect(geometry.daysTop - geometry.flowTop).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.utilityTop - geometry.daysTop)).toBeLessThanOrEqual(1);
  expect(geometry.utilityRule).toBe("0px");
});

test("sheet heading and timeline rules share the visible scroll width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  const stableGutter = await page.addStyleTag({ content: ".oak-sheet-scroll { scrollbar-gutter: stable; }" }); await settle(page);
  const geometry = await page.evaluate(() => {
    const heading = document.querySelector(".oak-sheet-heading")!.getBoundingClientRect();
    const row = document.querySelector(".oak-sheet-scroll .oak-row")!.getBoundingClientRect();
    const scroll = document.querySelector<HTMLElement>(".oak-sheet-scroll")!;
    return { left: Math.abs(heading.left - row.left), right: Math.abs(heading.right - row.right), scrollable: scroll.scrollHeight > scroll.clientHeight, gutter: scroll.offsetWidth - scroll.clientWidth };
  });
  expect(geometry.scrollable).toBe(true);
  expect(geometry.gutter).toBeGreaterThanOrEqual(10);
  expect(geometry.left).toBeLessThanOrEqual(1);
  expect(geometry.right).toBeLessThanOrEqual(1);
  await stableGutter.evaluate(style => (style as Element).remove());
  await expect.poll(() => page.evaluate(() => {
    const heading = document.querySelector(".oak-sheet-heading")!.getBoundingClientRect();
    const row = document.querySelector(".oak-sheet-scroll .oak-row")!.getBoundingClientRect();
    const scroll = document.querySelector<HTMLElement>(".oak-sheet-scroll")!;
    return { gutter: scroll.offsetWidth - scroll.clientWidth, right: Math.abs(heading.right - row.right) };
  })).toEqual({ gutter: 0, right: 0 });
});

test("journey rows and detail groups draw only one consistent divider", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
  await page.evaluate(() => { window.oak!.probe.actions!.selectNode("node-experience"); window.oak!.probe.actions!.setSheetSnap("expanded"); }); await settle(page);
  const rules = await page.evaluate(() => {
    const journey = document.querySelector(".oak-journey-row")!;
    const details = document.querySelector('.oak-row[data-owner-id="node-experience"] .oak-owner-details')!;
    const groups = [...details.querySelectorAll(".oak-booking-direct, .oak-reservation, .oak-detail-actions:not(:empty)")];
    return {
      journeyTop: getComputedStyle(journey).borderTopWidth,
      journeyBottom: getComputedStyle(journey).borderBottomWidth,
      journeyInset: getComputedStyle(journey).paddingTop,
      groups: groups.map(group => {
        const style = getComputedStyle(group);
        return { className: group.className, margin: style.marginTop, padding: style.paddingTop, rule: style.borderTopWidth };
      }),
    };
  });
  expect(rules.journeyTop).toBe("0px");
  expect(rules.journeyBottom).toBe("1px");
  expect(rules.journeyInset).toBe("12px");
  expect(rules.groups.length).toBeGreaterThanOrEqual(2);
  for (const group of rules.groups) {
    expect(group.margin, group.className).toBe("16px");
    expect(group.padding, group.className).toBe("12px");
    expect(group.rule, group.className).toBe("1px");
  }
});

test("timeline row roles keep one scan column without clipping at mobile and large text", async ({ page }) => {
  for (const [width, scale] of [[390, 1], [320, 2]] as const) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 568 });
    await page.goto("/?case=experience-default&variant=full-day"); await settle(page);
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scale); await settle(page);
    for (const snap of ["half", "expanded"] as const) {
      await page.evaluate(snap => window.oak!.probe.actions!.setSheetSnap(snap), snap); await settle(page);
      const geometry = await page.evaluate(() => {
        const owners = ["node-shopping", "node-transport", "node-lodging", "node-logistics"];
        const rect = (element: Element) => element.getBoundingClientRect();
        const rows = owners.map(owner => {
          const row = document.querySelector<HTMLElement>(`.oak-row[data-owner-id="${owner}"]`)!;
          const time = rect(row.querySelector(".oak-row-time")!);
          const title = rect(row.querySelector(".oak-row-title")!);
          const metadata = row.querySelector(".oak-primary-meta, .oak-support-meta, .oak-task-meta, .oak-row-context")!;
          const secondary = rect(metadata);
          const secondaryLeft = secondary.left + Number.parseFloat(getComputedStyle(metadata).paddingLeft || "0");
          const rowBounds = rect(row);
          const visibleMetadata = [...row.querySelectorAll<HTMLElement>("[data-scan]")].filter(element => {
            const style = getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
          }).map(element => {
            const range = document.createRange(); range.selectNodeContents(element);
            const bounds = [...range.getClientRects()];
            return { scan: element.dataset.scan, text: element.textContent?.trim(), fits: bounds.every(box => box.left >= rowBounds.left - 1 && box.right <= rowBounds.right + 1 && box.top >= rowBounds.top - 1 && box.bottom <= rowBounds.bottom + 1 && box.right <= innerWidth + 1) };
          }).filter(item => item.text);
          return { owner, timeLeft: time.left, timeRight: time.right, timeTop: time.top, titleLeft: title.left, titleTop: title.top, titleRight: title.right, secondaryLeft, rowRight: rowBounds.right, titleFont: Number.parseFloat(getComputedStyle(row.querySelector(".oak-row-title")!).fontSize), secondaryFont: Number.parseFloat(getComputedStyle(metadata).fontSize), visibleMetadata };
        });
        const connector = document.querySelector<HTMLElement>(".oak-connector-row")!;
        return { rows, connectorOrdinal: connector.querySelector(".oak-row-ordinal") !== null, pageWidth: document.documentElement.scrollWidth };
      });
      const baseline = geometry.rows[0].titleLeft;
      const timeBaseline = geometry.rows[0].timeLeft;
      for (const row of geometry.rows) {
        expect(Math.abs(row.timeLeft - timeBaseline), `${width}px ${snap} ${row.owner} time column`).toBeLessThanOrEqual(1);
        expect(Math.abs(row.titleLeft - baseline), `${width}px ${snap} ${row.owner} title column`).toBeLessThanOrEqual(1);
        if (width === 390) {
          expect(row.timeRight, `${snap} ${row.owner} time/title separation`).toBeLessThanOrEqual(row.titleLeft + 1);
          expect(Math.abs(row.timeTop - row.titleTop), `${snap} ${row.owner} time/title line`).toBeLessThanOrEqual(3);
        } else expect(row.titleTop, `${snap} ${row.owner} stacked title`).toBeGreaterThanOrEqual(row.timeTop);
        expect(Math.abs(row.secondaryLeft - row.titleLeft), `${width}px ${snap} ${row.owner} metadata column`).toBeLessThanOrEqual(1);
        expect(row.titleRight, `${width}px ${snap} ${row.owner} clipping`).toBeLessThanOrEqual(row.rowRight + 1);
        expect(row.titleFont).toBeGreaterThanOrEqual(14 * scale);
        expect(row.secondaryFont).toBeGreaterThanOrEqual(12 * scale);
        expect(row.visibleMetadata.every(item => item.fits), `${width}px ${snap} ${row.owner} metadata clipping`).toBe(true);
        const metadataKeys = row.visibleMetadata.map(item => `${item.scan}:${item.text}`);
        expect(new Set(metadataKeys).size, `${width}px ${snap} ${row.owner} metadata duplication`).toBe(metadataKeys.length);
      }
      expect(geometry.connectorOrdinal).toBe(false);
      expect(geometry.pageWidth).toBe(width);
    }
  }
});
