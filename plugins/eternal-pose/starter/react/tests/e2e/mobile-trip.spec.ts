import { expect, test as base, type Locator, type Page } from "@playwright/test";
import type { CameraIntent } from "@laugh-tale-island/core";

interface E2EGeolocationControl {
  latestId(): number;
  success(id: number, latitude: number, longitude: number): void;
  error(id: number, code: number): void;
}

interface BrowserE2EGlobals {
  __e2eGeo: E2EGeolocationControl;
  __ETERNAL_POSE_E2E_NOW__?: string;
  __e2eNavigation?: string;
}

const test = base.extend<{ externalRequests: string[] }>({
  externalRequests: async ({ page }, provide) => {
    const requests: string[] = [];
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === "http://127.0.0.1:4173") {
        await route.continue();
        return;
      }
      if (["data:", "blob:", "about:"].includes(url.protocol)) {
        await route.continue();
        return;
      }
      requests.push(url.href);
      await route.abort("blockedbyclient");
    });
    await provide(requests);
  },
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.open = (url) => { (window as unknown as BrowserE2EGlobals).__e2eNavigation = String(url); return null; };
    let nextId = 0;
    const callbacks = new Map<
      number,
      {
        success: PositionCallback;
        error: PositionErrorCallback | null;
      }
    >();
    const active = new Set<number>();
    const geolocation: Geolocation = {
      getCurrentPosition: () => undefined,
      watchPosition: (success, error) => {
        nextId += 1;
        callbacks.set(nextId, { success, error: error ?? null });
        active.add(nextId);
        return nextId;
      },
      clearWatch: (id) => {
        active.delete(id);
      },
    };
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: geolocation,
    });
    (window as unknown as BrowserE2EGlobals).__e2eGeo = {
      latestId: () => nextId,
      success: (id, latitude, longitude) => {
        callbacks.get(id)?.success({
          coords: {
            accuracy: 4,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            latitude,
            longitude,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.now(),
          toJSON: () => ({}),
        });
      },
      error: (id, code) => {
        callbacks.get(id)?.error?.({
          code,
          message: code === 1 ? "denied" : "unavailable",
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
      },
    };
  });
});

test.afterEach(({ externalRequests }) => {
  expect(externalRequests).toEqual([]);
  expect(externalRequests.some((url) => /googleapis\.com|maps\.googleapis\.com|google\.com\/maps/.test(url))).toBe(false);
});

import { catalog, candidateDecision, dayButton, enterDay, mapSurface, openTrip, ownerButton, ownerRow, retryUnavailableRoute, setSheetSnap, sheetHandle, sheetSurface } from "./contract-driver";
import { locale } from "../../src/presentation/copy/catalog";

test("native shopping and reset controls keep one keyboard and enlarged-text vocabulary", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.locator(".oak-progress-reset > summary").click();
  const reset = page.locator(".oak-progress-reset .oak-native-select");
  const resetSelect = reset.locator("select");
  await resetSelect.focus();
  await expect(resetSelect).toHaveAccessibleName(catalog.persistence.resetDayScope);
  const appearance = async (control: typeof reset) => control.evaluate(element => {
    const select = element.querySelector("select")!;
    const style = getComputedStyle(select), wrapper = getComputedStyle(element), bounds = select.getBoundingClientRect();
    return { border: style.border, background: style.backgroundColor, outline: Number.parseFloat(wrapper.outlineWidth), height: bounds.height, right: bounds.right };
  });
  const resetStyle = await appearance(reset);
  expect(resetStyle.outline).toBeGreaterThanOrEqual(2);
  expect(resetStyle.height).toBeGreaterThanOrEqual(44);
  expect(resetStyle.right).toBeLessThanOrEqual(320);
  const optionCount = await resetSelect.locator("option").count();
  expect(optionCount).toBeGreaterThan(1);
  await resetSelect.selectOption({ index: optionCount - 1 });
  const chosenDay = await resetSelect.inputValue();
  await expect(resetSelect).toHaveValue("day-four");
  await expect(resetSelect.locator("option:checked")).toHaveText("2042-04-21 · Clifftop archive survey");
  const resetDay = page.getByRole("button", { name: catalog.persistence.resetDay, exact: true });
  await resetDay.click();
  await expect(page.getByRole("group", { name: catalog.persistence.confirmReset, exact: true })).toContainText("2042-04-21 · Clifftop archive survey");
  await page.getByRole("button", { name: catalog.persistence.cancelReset, exact: true }).click();
  await expect(resetDay).toBeFocused();
  await expect(resetSelect).toHaveValue(chosenDay);

  await enterDay(page);
  await ownerButton(page, "shopping-supplies").click();
  const shopping = ownerRow(page, "shopping-supplies").locator(".oak-native-select").first();
  const shoppingSelect = shopping.locator("select");
  await shoppingSelect.focus();
  const shoppingStyle = await appearance(shopping);
  expect(shoppingStyle.border).toBe(resetStyle.border);
  expect(shoppingStyle.background).toBe(resetStyle.background);
  expect(shoppingStyle.outline).toBeGreaterThanOrEqual(2);
  expect(shoppingStyle.height).toBeGreaterThanOrEqual(44);
  expect(shoppingStyle.right).toBeLessThanOrEqual(320);
  await shoppingSelect.selectOption("purchased");
  await page.reload(); await enterDay(page); await ownerButton(page, "shopping-supplies").click();
  await expect(ownerRow(page, "shopping-supplies").locator(".oak-native-select select").first()).toHaveValue("purchased");
});

async function visibleInteractiveTargetFailures(page: Page): Promise<Array<{
  name: string;
  width: number;
  height: number;
}>> {
  return page.evaluate(() => {
    const selector = [
      "button",
      "a[href]",
      "input:not([type=hidden])",
      "select",
      "textarea",
      "summary",
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    const elements = [...new Set(document.querySelectorAll<HTMLElement>(selector))];
    return elements.flatMap((element) => {
      const input = element instanceof HTMLInputElement ? element : null;
      if (
        element.matches(":disabled") ||
        element.getAttribute("aria-disabled") === "true" ||
        element.closest("[inert]") !== null
      ) {
        return [];
      }
      const targets: HTMLElement[] =
        input !== null && ["checkbox", "radio"].includes(input.type)
          ? [element, ...Array.from(input.labels ?? [])]
          : [element];
      return targets.flatMap((target) => {
        if (target.closest("[inert], [hidden], [aria-hidden='true']") !== null) return [];
        const style = getComputedStyle(target);
        const rect = target.getBoundingClientRect();
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.visibility === "collapse" ||
          style.contentVisibility === "hidden" ||
          target.getClientRects().length === 0 ||
          rect.width === 0 ||
          rect.height === 0
        ) {
          return [];
        }
        // A native choice and its enclosing label form one clickable region.
        // Keep auditing every visible label, including undersized alternatives.
        if (target === input && targets.some(label => {
          if (label === input || !label.contains(input) || label.closest("[inert], [hidden], [aria-hidden='true']")) return false;
          const css = getComputedStyle(label), bounds = label.getBoundingClientRect();
          return css.display !== "none" && css.visibility === "visible" && bounds.width >= 44 && bounds.height >= 44
            && bounds.left <= rect.left && bounds.right >= rect.right && bounds.top <= rect.top && bounds.bottom >= rect.bottom;
        })) return [];
        return rect.width + 0.5 < 44 || rect.height + 0.5 < 44
          ? [{
              name: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 80) ?? element.tagName,
              width: rect.width,
              height: rect.height,
            }]
          : [];
      });
    });
  });
}

test("touch target audit catches offscreen and label-backed undersized controls", async ({ page }) => {
  await page.setContent(`
    <button aria-label="Offscreen small control" style="position:absolute;top:2000px;left:0;width:24px;height:24px;padding:0">O</button>
    <input id="small-choice" type="checkbox" aria-label="Label-backed small control" style="position:absolute;width:0;height:0;opacity:0">
    <label for="small-choice" style="display:block;width:24px;height:24px">L</label>
    <input id="visible-small-native" type="checkbox" aria-label="Visible native small control" style="display:block;width:24px;height:24px;margin:0">
    <label for="visible-small-native" hidden>Hidden first native label</label>
    <input id="second-label-choice" type="radio" aria-label="Visible second label control" style="position:absolute;width:0;height:0;opacity:0">
    <label for="second-label-choice" hidden>Hidden first choice label</label>
    <label for="second-label-choice" style="display:block;width:24px;height:24px">Visible second choice label</label>
    <label style="display:block;width:60px;height:44px"><input type="checkbox" aria-label="Covered native choice" style="width:20px;height:20px;margin:0">Safe</label>
    <div hidden>
      <input id="hidden-only" type="checkbox" aria-label="Hidden small control" style="width:24px;height:24px">
      <label for="hidden-only" style="display:block;width:24px;height:24px">Hidden small label</label>
    </div>
    <div inert>
      <input id="inert-only" type="radio" aria-label="Inert small control" style="width:24px;height:24px">
      <label for="inert-only" style="display:block;width:24px;height:24px">Inert small label</label>
    </div>
  `);

  const failures = await visibleInteractiveTargetFailures(page);
  expect(failures).toEqual(expect.arrayContaining([
    { name: "Offscreen small control", width: 24, height: 24 },
    { name: "Label-backed small control", width: 24, height: 24 },
    { name: "Visible native small control", width: 24, height: 24 },
    { name: "Visible second label control", width: 24, height: 24 },
  ]));
  expect(failures.map(({ name }) => name)).not.toEqual(expect.arrayContaining([
    "Hidden small control",
    "Inert small control",
    "Covered native choice",
  ]));
});


async function expectGeometry(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".oak-day-header")!.getBoundingClientRect();
    const sheet = document.querySelector<HTMLElement>(".oak-itinerary-sheet")!.getBoundingClientRect();
    const map = document.querySelector<HTMLElement>(".oak-map-content")!.getBoundingClientRect();
    return {
      fits: document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth,
      header: header.top >= 0 && header.left >= 0 && header.right <= innerWidth + 1,
      sheet: sheet.top >= 0 && sheet.bottom <= innerHeight + 1 && sheet.left >= 0 && sheet.right <= innerWidth + 1,
      map: map.width > 0 && map.height > 0,
    };
  })).toEqual({ fits: true, header: true, sheet: true, map: true });
}
async function expectDayRail(page: Page, count = 4): Promise<void> {
  const rail = page.getByRole("navigation", { name: catalog.accessibleNames.dayRail });
  await expect(rail.getByRole("button")).toHaveCount(count);
  const last = rail.getByRole("button").last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  for (const button of await rail.getByRole("button").all()) {
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
}

async function expectActionReachable(control: Locator): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeInViewport();
  await expect.poll(() => control.evaluate(element => {
    const rect = element.getBoundingClientRect();
    let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right), top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent), box = parent.getBoundingClientRect();
      if (["auto", "scroll", "hidden", "clip"].includes(css.overflowX)) { left = Math.max(left, box.left); right = Math.min(right, box.right); }
      if (["auto", "scroll", "hidden", "clip"].includes(css.overflowY)) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
    }
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    return right - left >= 43.5 && bottom - top >= 43.5 && element.contains(hit);
  })).toBe(true);
}

async function expectOakReflowReachability(page: Page): Promise<void> {
  await expectGeometry(page);
  await expect.poll(() => page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".oak-day-header")!;
    const sheet = document.querySelector<HTMLElement>(".oak-itinerary-sheet")!;
    const body = document.querySelector<HTMLElement>(".oak-sheet-body")!;
    const itinerary = getComputedStyle(body).overflowY === "auto" ? body : document.querySelector<HTMLElement>(".oak-sheet-scroll")!;
    const title = header.querySelector<HTMLElement>("h1")!;
    const heading = sheet.querySelector<HTMLElement>("h2")!;
    const contains = (owner: HTMLElement, child: HTMLElement) => {
      const a = owner.getBoundingClientRect(), b = child.getBoundingClientRect();
      return b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
    };
    return {
      titleReadable: title.clientWidth > 0 && title.clientHeight > 0 && contains(header, title) && !!title.getAttribute("aria-label"),
      headingReadable: heading.clientWidth > 0 && contains(sheet, heading) && heading.scrollWidth <= heading.clientWidth + 1 && heading.scrollHeight <= heading.clientHeight + 1,
      itineraryUsable: itinerary.clientHeight >= 44 && itinerary.clientWidth >= 44 && itinerary.scrollHeight > itinerary.clientHeight,
      itineraryContained: contains(sheet, itinerary),
      rowsPresent: itinerary.querySelectorAll("[data-owner-id]").length > 0,
    };
  })).toEqual({ titleReadable: true, headingReadable: true, itineraryUsable: true, itineraryContained: true, rowsPresent: true });
  expect(await visibleInteractiveTargetFailures(page)).toEqual([]);
  // Scroll every real header, sheet and map action into view, including final rows.
  // A rectangle alone does not prove the user can hit the action through overlays.
  const controls = page.locator(".oak-day-header button, .oak-itinerary-sheet button, .oak-map-controls button");
  for (const control of await controls.all()) {
    if (!await control.isVisible()) continue;
    await expectActionReachable(control);
  }
  for (const fact of await page.locator(".oak-sheet-scroll .oak-row-selection > span:not(.oak-visually-hidden)").all()) {
    if (!await fact.isVisible()) continue;
    await fact.scrollIntoViewIfNeeded();
    await expect(fact).toBeInViewport();
    expect(await fact.evaluate(element => {
      const r = element.getBoundingClientRect();
      return r.width > 0 && r.left >= 0 && r.right <= innerWidth && (element as HTMLElement).scrollWidth <= (element as HTMLElement).clientWidth + 1;
    })).toBe(true);
  }
  const finalOwner = ownerButton(page, "shopping-supplies");
  await finalOwner.focus();
  await expect(finalOwner).toBeFocused();
  await expectActionReachable(finalOwner);
  await finalOwner.click();
  await expect(finalOwner).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => {
    const map = document.querySelector<HTMLElement>(".oak-map-content")!;
    const mapRect = map.getBoundingClientRect();
    const attribution = map.querySelector<HTMLElement>("[data-e2e-provider-attribution]")!;
    const probe = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return {
        contained: rect.width > 0 && rect.height > 0 && rect.left >= Math.max(0, mapRect.left) && rect.right <= Math.min(innerWidth, mapRect.right) && rect.top >= Math.max(0, mapRect.top) && rect.bottom <= Math.min(innerHeight, mapRect.bottom),
        hit: element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)),
      };
    };
    return probe(attribution);
  })).toEqual({ contained: true, hit: true });
  await page.getByRole("button", { name: catalog.location.locate, exact: true }).click();
  const id = await page.evaluate(() => (window as unknown as BrowserE2EGlobals).__e2eGeo.latestId());
  expect(id).toBeGreaterThan(0);
  await page.evaluate(id => (window as unknown as BrowserE2EGlobals).__e2eGeo.success(id, 35.69, 139.77), id);
  await expect(mapSurface(page)).toHaveAttribute("data-e2e-user-location", JSON.stringify({ lat: 35.69, lng: 139.77 }));
  for (const control of await page.locator(".oak-map-controls button").all()) await expectActionReachable(control);
  const cameraCount = Number(await mapSurface(page).getAttribute("data-e2e-camera-request-count"));
  await page.getByRole("button", { name: catalog.location.recenter, exact: true }).click();
  await expect.poll(async () => Number(await mapSurface(page).getAttribute("data-e2e-camera-request-count"))).toBe(cameraCount + 1);
  await page.getByRole("button", { name: catalog.location.stop, exact: true }).click();
  await expect(mapSurface(page)).toHaveAttribute("data-e2e-user-location", "null");
}

test("keeps the persistent map and interruptible three-snap sheet inside every mobile viewport", async ({ page }) => {
  await openTrip(page);
  const map = mapSurface(page), sheet = sheetSurface(page), handle = sheetHandle(page);
  await expect(map.getByText("Deterministic test map · E2E only")).toBeVisible();
  await expect(sheet).toHaveAttribute("data-sheet-snap", "half");
  await expectDayRail(page);
  await expectGeometry(page);
  const handleBox = await handle.boundingBox();
  expect(handleBox?.width).toBeGreaterThanOrEqual(44);
  expect(handleBox?.height).toBeGreaterThanOrEqual(44);
  await setSheetSnap(page, "collapsed");
  await expectGeometry(page);
  await setSheetSnap(page, "expanded");
  await expectGeometry(page);
  const drag = (await handle.boundingBox())!;
  await page.mouse.move(drag.x + 25, drag.y + 10);
  await page.mouse.down();
  await page.mouse.move(drag.x + 25, drag.y + 180, { steps: 4 });
  await expect(sheet).toHaveAttribute("data-dragging", "true");
  expect(await sheet.evaluate(element => (element as HTMLElement).style.transitionDuration)).toBe("0ms");
  await page.mouse.up();
  await expect(sheet).not.toHaveAttribute("data-sheet-snap", "expanded");
  // A second gesture interrupts an in-flight snap rather than queuing it.
  // Target the live moving band atomically, without a stale cross-command box.
  const second = await handle.evaluate(element => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "mouse", buttons: 1, clientX: rect.x + 25, clientY: rect.y + 10 }));
    return { x: rect.x + 25, y: rect.y + 10 };
  });
  await handle.dispatchEvent("pointermove", { pointerId: 1, clientX: second.x, clientY: second.y - 60 });
  await expect(sheet).toHaveAttribute("data-dragging", "true");
  await handle.dispatchEvent("pointerup", { pointerId: 1, clientX: second.x, clientY: second.y - 60 });
  await expect(sheet).toHaveAttribute("data-dragging", "false");
  await setSheetSnap(page, "half");
  if (page.viewportSize()?.width === 320) {
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; window.dispatchEvent(new Event("resize")); });
    await expectGeometry(page);
    await expectDayRail(page);
    await page.evaluate(() => { document.documentElement.style.removeProperty("font-size"); window.dispatchEvent(new Event("resize")); });
    await page.setViewportSize({ width: 160, height: 284 });
    await page.locator(".oak-upper-clearance").evaluate(element => { element.scrollTop = 0; });
    await expectGeometry(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expectGeometry(page);
    await expectDayRail(page);
    await page.setViewportSize({ width: 320, height: 568 });
  }
  await expectGeometry(page);
});

for (const [height, textScale] of [[300, 1], [260, 1], [300, 2]] as const) {
  test(`short landscape 956x${height} at ${textScale * 100} percent retains scroll reachability`, async ({ page }) => {
    await page.setViewportSize({ width: 956, height });
    await openTrip(page);
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; window.dispatchEvent(new Event("resize")); }, textScale);
    for (const snap of ["half", "expanded"] as const) {
      await setSheetSnap(page, snap);
      await expect(page.locator(".oak-experience")).toHaveAttribute("data-chrome-scroll", "true");
      const upper = page.locator(".oak-upper-clearance");
      const carriedScroll = await upper.evaluate(element => element.scrollTop);
      // The previous sweep deliberately reveals map actions in this scrollport.
      // Restore the initial pose for independent title/date checks; user scroll
      // persists across snap changes and is not a presentation failure.
      await upper.evaluate(element => { element.scrollTop = 0; });
      await page.locator(".oak-sheet-body").evaluate(element => { element.scrollTop = 0; });
      const title = page.locator(".oak-day-header h1");
      expect(await title.evaluate(element => {
        const port = element.closest(".oak-upper-clearance")!.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(element);
        return [...range.getClientRects()].every(line => line.left >= port.left && line.right <= port.right && line.top >= port.top && line.bottom <= port.bottom);
      })).toBe(true);
      console.log("LANDSCAPE_SWEEP_POSE", { height, textScale, snap, carriedScroll, restoredScroll: await upper.evaluate(element => element.scrollTop) });
      await expectOakReflowReachability(page);
    }
  });
}

for (const reflow of ["200 percent text", "160 CSS pixels"] as const) {
  test(`retains content, action reachability and provider chrome at ${reflow}`, async ({ page }) => {
    await openTrip(page);
    if (reflow === "200 percent text") {
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; window.dispatchEvent(new Event("resize")); });
    } else await page.setViewportSize({ width: 160, height: 284 });
    await expectOakReflowReachability(page);
  });
}

test("proves asymmetric safe areas, clock advancement, route retry, and persistent map identity", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => { (window as unknown as BrowserE2EGlobals).__ETERNAL_POSE_E2E_NOW__ = "2042-04-18T08:50:00Z"; });
  await openTrip(page);
  const map = mapSurface(page), original = await map.elementHandle();
  const mounts = await map.getAttribute("data-e2e-mount-count");
  await expect(page.getByLabel(catalog.experience.tripTime)).toHaveText("08:50");
  await expect(ownerRow(page, "sightseeing-lookout")).toHaveAttribute("data-next", "true");
  await expect(ownerButton(page, "sightseeing-lookout")).toHaveAttribute("aria-pressed", "true");
  await page.addStyleTag({ content: ".oak-experience { --oak-safe-area-top: 13px; --oak-safe-area-bottom: 29px; --oak-safe-area-left: 7px; --oak-safe-area-right: 19px; }" });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await expect.poll(async () => {
    const padding = JSON.parse((await map.getAttribute("data-e2e-edge-insets"))!) as { top: number; bottom: number };
    return padding.top > 13 && padding.bottom > 29 && padding.top !== padding.bottom;
  }).toBe(true);
  expect(await sheetSurface(page).evaluate(element => getComputedStyle(element).paddingBottom)).toBe("29px");
  await expectGeometry(page);
  await retryUnavailableRoute(page);
  await page.evaluate(() => { (window as unknown as BrowserE2EGlobals).__ETERNAL_POSE_E2E_NOW__ = "2042-04-18T10:15:00Z"; });
  await page.clock.runFor(60_000);
  await page.getByRole("button", { name: catalog.accessibleNames.collapseDayRail }).click();
  await expect(page.getByLabel(catalog.experience.tripTime)).toHaveText("10:15");
  await expect(ownerRow(page, "dining-lunch")).toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: catalog.accessibleNames.expandDayRail }).click();
  await dayButton(page, "Cove closing day").click();
  await page.getByRole("button", { name: catalog.navigation.returnToCurrent, exact: true }).click();
  expect(await original.evaluate(element => element.isConnected && element === document.querySelector(".oak-map-content"))).toBe(true);
  await expect(map).toHaveAttribute("data-e2e-mount-count", mounts!);
});

test("synchronizes dates, live current state, list places, map places, and independent route owners", async ({ page }) => {
  await openTrip(page);
  const map = mapSurface(page);
  await expect(dayButton(page, "Harbor field day")).toHaveAttribute("aria-current", "true");
  await expect(ownerRow(page, "dining-lunch")).toHaveAttribute("aria-current", "step");
  const supply = map.locator('[data-map-owner="shopping-supplies"]');
  await ownerButton(page, "shopping-supplies").click();
  await expect(map).toHaveAttribute("data-e2e-camera-kind", "focus");
  await expect.poll(async () => {
    const intent = JSON.parse((await map.getAttribute("data-e2e-camera-intent"))!) as CameraIntent;
    return intent.kind === "focus" ? JSON.stringify(intent.coordinate) : null;
  }).toBe(await supply.getAttribute("data-map-coordinate"));
  await expect(supply).toHaveAttribute("data-map-tone", "selected");
  await map.locator('[data-map-owner="sightseeing-lookout"]').dispatchEvent("click");
  await expect(ownerButton(page, "sightseeing-lookout")).toHaveAttribute("aria-pressed", "true");
  await dayButton(page, "Cove closing day").click();
  await expect(dayButton(page, "Cove closing day")).toHaveAttribute("aria-current", "true");
  await expect(ownerButton(page, "day-two-cove")).toBeVisible();
  await page.getByRole("button", { name: catalog.navigation.returnToCurrent, exact: true }).click();
  await expect(dayButton(page, "Harbor field day")).toHaveAttribute("aria-current", "true");
  await expect(ownerButton(page, "dining-lunch")).toHaveAttribute("aria-pressed", "true");
  const routeIds = await page.locator(".oak-connector-row").evaluateAll(elements => elements.map(element => element.getAttribute("data-owner-id")));
  expect(routeIds).toHaveLength(10);
  expect(new Set(routeIds).size).toBe(10);
  // Both short and long edges retain independent compact connector ownership.
  await expect(ownerRow(page, "route-start-shuttle")).toHaveAttribute("data-role", "connector");
  await expect(ownerRow(page, "route-ferry-lookout")).toHaveAttribute("data-role", "connector");
  const transit = ownerButton(page, "route-shuttle-ferry");
  const before = Number(await map.getAttribute("data-e2e-camera-request-count"));
  await transit.click();
  await expect(transit).toHaveAttribute("aria-pressed", "true");
  await expect(ownerRow(page, "route-shuttle-ferry").getByText("Board synthetic blue line")).toBeVisible();
  await expect(map).toHaveAttribute("data-e2e-camera-kind", "fit");
  const intent = JSON.parse((await map.getAttribute("data-e2e-camera-intent"))!) as CameraIntent;
  expect(intent.kind === "fit" ? JSON.stringify(intent.paths[0]) : null).toBe(await map.locator('[data-map-route="route-shuttle-ferry"]').getAttribute("data-map-geometry"));
  expect(Number(await map.getAttribute("data-e2e-camera-request-count"))).toBe(before + 1);
  const count = Number(await map.getAttribute("data-e2e-camera-request-count"));
  await map.locator('[data-map-route="route-ferry-lookout"]').dispatchEvent("click");
  const selected = ownerButton(page, "route-ferry-lookout");
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await expect(selected).toBeFocused();
  await expect(map.locator('[data-map-route="route-ferry-lookout"]')).toHaveAttribute("data-map-tone", "selected");
  await page.getByRole("button", { name: catalog.navigation.returnToLodging, exact: true }).focus();
  await map.locator('[data-map-route="route-ferry-lookout"]').dispatchEvent("click");
  await expect(selected).toBeFocused();
  expect(Number(await map.getAttribute("data-e2e-camera-request-count"))).toBe(count);
  await transit.click();
  await ownerRow(page, "route-shuttle-ferry").getByRole("button", { name: catalog.routes.external }).click();
  const href = new URL((await page.evaluate(() => (window as unknown as BrowserE2EGlobals).__e2eNavigation))!);
  expect(href.origin).toBe("https://www.google.com");
  expect(href.pathname).toBe("/maps/dir/");
  expect(href.searchParams.get("api")).toBe("1");
  expect(href.searchParams.get("travelmode")).toBe("transit");
});

test("compares dining and snack candidates together on the persistent map with draft and commit semantics", async ({ page }) => {
  await openTrip(page);
  const map = mapSurface(page), identity = await map.elementHandle();
  await ownerButton(page, "dining-lunch").click();
  await ownerRow(page, "dining-lunch").getByRole("button", { name: catalog.candidate.reopen }).click();
  const dialog = page.getByRole("dialog", { name: catalog.accessibleNames.candidateDialog });
  await expect(map.getByRole("button", { name: /Map place .*Garden kitchen/ })).toBeAttached();
  const canal = map.getByRole("button", { name: /Map place .*Canal counter/ });
  await canal.dispatchEvent("click");
  const option = dialog.getByRole("button", { name: /Canal counter/ });
  await expect(option).toHaveAttribute("aria-pressed", "true");
  await expect(option).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(option).toBeFocused();
  expect(await option.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
  expect(await visibleInteractiveTargetFailures(page)).toEqual([]);
  await dialog.getByRole("button", { name: catalog.candidate.cancel }).click();
  await candidateDecision(page);
  await expect(map.locator('[data-map-states~="candidate"]')).toHaveCount(0);
  await ownerButton(page, "sightseeing-lookout").click();
  await ownerRow(page, "sightseeing-lookout").getByRole("button", { name: catalog.candidate.reopen }).click();
  await expect(map.getByRole("button", { name: /Map place .*Fruit window/ })).toBeAttached();
  await expect(map.getByRole("button", { name: /Map place .*Steam bun cart/ })).toBeAttached();
  await expect(dialog.getByRole("button", { name: catalog.candidate.confirm })).toHaveCount(0);
  const browseOption = dialog.locator('[data-candidate-id="snack-bun"] .oak-candidate-option');
  await expect(dialog.getByRole("button", { name: /Steam bun cart/ })).toHaveCount(0);
  await expect(browseOption).not.toContainText(catalog.candidate.draft);
  await map.getByRole("button", { name: /Map place .*Steam bun cart/ }).dispatchEvent("click");
  await expect(browseOption).toBeFocused();
  expect(await visibleInteractiveTargetFailures(page)).toEqual([]);
  expect(await identity.evaluate(element => element.isConnected && element === document.querySelector(".oak-map-content"))).toBe(true);
});

test("renders all semantics, lodging roles, tasks, reservations, and trip-scoped progress reload and reset", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("checkbox", { name: "Prepare offline documents" }).check();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Prepare offline documents" })).toBeChecked();
  const tasks = page.getByRole("checkbox", { name: "Refill water bottle", exact: true });
  await tasks.check();
  await expect(page.getByText("Use the lobby fountain.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Refill water bottle", exact: true })).toBeChecked();
  const reservations = page.getByRole("region", { name: catalog.home.reservations });
  await expect(reservations.getByText("SYNTHETIC-SKY", { exact: true })).toBeVisible();
  await expect(reservations.getByText(catalog.booking.pending, { exact: true })).toBeVisible();
  await expect(reservations.getByText(catalog.booking.none, { exact: true })).toBeVisible();
  await enterDay(page);
  for (const id of ["lodging-start", "lodging-end"]) {
    await expect(ownerRow(page, id)).toHaveAttribute("data-role", "base");
    await ownerButton(page, id).click();
    await expect(ownerRow(page, id).getByText(catalog.facts.base, { exact: true })).toBeVisible();
  }
  await ownerButton(page, "shopping-supplies").click();
  const shoppingName = "Pocket notebook · " + catalog.facts.status;
  await page.getByRole("combobox", { name: shoppingName }).selectOption("purchased");
  await page.reload(); await enterDay(page);
  await ownerButton(page, "shopping-supplies").click();
  await expect(page.getByRole("combobox", { name: shoppingName })).toHaveValue("purchased");
  await ownerButton(page, "experience-observatory").click();
  await expect(ownerRow(page, "experience-observatory").getByText("SYNTHETIC-SKY", { exact: true }).first()).toBeVisible();
  await expect(ownerRow(page, "experience-observatory").getByRole("link", { name: catalog.booking.open }).first()).toHaveAttribute("href", "https://example.com/synthetic-sky");
  await ownerButton(page, "lodging-midday").click();
  await expect(ownerRow(page, "lodging-midday").getByText(catalog.facts.return, { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Drop off purchases" }).check();
  expect(await visibleInteractiveTargetFailures(page)).toEqual([]);
  await page.evaluate(() => localStorage.removeItem("eternal-pose:trip-progress:v1:trip-e2e-archipelago"));
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Prepare offline documents" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Refill water bottle", exact: true })).not.toBeChecked();
  await enterDay(page); await ownerButton(page, "shopping-supplies").click();
  await expect(page.getByRole("combobox", { name: shoppingName })).toHaveValue("pending");
});

test("Home reservations jump to the owned itinerary entry", async ({ page }) => {
  await page.goto("/");
  const reservation = page.locator('[data-home-reservation-id="reservation-sky"]');
  await reservation.getByRole("button", { name: /開啟當日行程/ }).click();
  await expect(page.locator('[data-owner-id="experience-observatory"]')).toHaveAttribute("data-selected", "true");
  await page.getByRole("button", { name: catalog.experience.home }).click();
  const candidate = page.locator('[data-home-reservation-id="reservation-lunch"]');
  await candidate.getByRole("button", { name: /開啟當日行程/ }).click();
  await expect(page.locator('[data-owner-id="dining-lunch"]')).toHaveAttribute("data-selected", "true");
});

test("expanded itinerary retains a usable map band and only its legal bottom lane", async ({ page }) => {
  await page.goto("/");
  await enterDay(page);
  await setSheetSnap(page, "expanded");
  await expect.poll(() => page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>(".oak-itinerary-sheet")!.getBoundingClientRect();
    const upper = document.querySelector<HTMLElement>(".oak-upper-clearance")!.getBoundingClientRect();
    const legal = document.querySelector<HTMLElement>(".oak-geometry-legal")!.getBoundingClientRect();
    return { bottom: Math.round(innerHeight - sheet.bottom), legal: Math.round(legal.height), mapBand: Math.round(sheet.top - upper.bottom), sheetHeight: Math.round(sheet.height) };
  })).toMatchObject({ bottom: 44, legal: 44 });
  await expect.poll(() => page.locator(".oak-itinerary-sheet").evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(296);
  const geometry = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>(".oak-itinerary-sheet")!.getBoundingClientRect();
    const upper = document.querySelector<HTMLElement>(".oak-upper-clearance")!.getBoundingClientRect();
    return { mapBand: sheet.top - upper.bottom, sheetHeight: sheet.height };
  });
  expect(geometry.mapBand).toBeGreaterThanOrEqual((page.viewportSize()?.width ?? 0) >= 390 ? 100 : 0);
  expect(geometry.sheetHeight).toBeGreaterThanOrEqual(296);
});

test("keeps every semantic renderer visible and exposes absolute cross-midnight owner names", async ({ page }) => {
  await openTrip(page);
  const absolute = (date: string) => new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }).format(new Date(date + "T00:00:00Z"));
  await expect(ownerButton(page, "experience-observatory")).toHaveAccessibleName(new RegExp(absolute("2042-04-18")));
  await expect(ownerButton(page, "lodging-end")).toHaveAccessibleName(new RegExp(absolute("2042-04-18")));
  await expect(ownerButton(page, "lodging-end")).toHaveAccessibleName(new RegExp(absolute("2042-04-19")));
  await expect(ownerButton(page, "lodging-end")).toHaveAccessibleName(/00:15/);
  await setSheetSnap(page, "expanded");
  const facts = [
    ["transport-shuttle", "Board the blue local shuttle"], ["transfer-ferry", "Pier One"],
    ["lodging-start", catalog.facts.base], ["dining-lunch", "Harbor plates"],
    ["shopping-supplies", "Pocket notebook"], ["sightseeing-lookout", "North quay"],
    ["experience-observatory", catalog.routes.duration.replace("{duration}", "60")],
    ["logistics-locker", "Show locker slip"], ["custom-field-notes", "field-notes"],
  ];
  for (const [id, fact] of facts) {
    await ownerButton(page, id).click();
    await expect(ownerButton(page, id)).toHaveAttribute("aria-pressed", "true");
    await expect(ownerRow(page, id)).toContainText(fact);
    await expect(ownerRow(page, id).locator("[data-details-owner]").first()).toBeVisible();
  }
  expect(await visibleInteractiveTargetFailures(page)).toEqual([]);
});

test("handles location success, denied retry, stale callbacks, and explicit recenter without camera chasing", async ({ page }) => {
  await openTrip(page);
  const map = mapSurface(page);
  const locate = () => page.getByRole("button", { name: catalog.location.locate, exact: true }).click();
  await locate();
  const first = await page.evaluate(() => (window as unknown as BrowserE2EGlobals).__e2eGeo.latestId());
  await page.evaluate(id => (window as unknown as BrowserE2EGlobals).__e2eGeo.success(id, 35.69, 139.77), first);
  await expect(page.getByText(catalog.location.active, { exact: true })).toBeVisible();
  await expect(map).toHaveAttribute("data-e2e-user-location", JSON.stringify({ lat: 35.69, lng: 139.77 }));
  await expect.poll(async () => {
    const intent = JSON.parse((await map.getAttribute("data-e2e-camera-intent"))!) as CameraIntent;
    return intent.kind === "recenter-user" ? intent.coordinate : null;
  }).toEqual({ lat: 35.69, lng: 139.77 });
  const count = Number(await map.getAttribute("data-e2e-camera-request-count"));
  await page.evaluate(id => (window as unknown as BrowserE2EGlobals).__e2eGeo.success(id, 35.691, 139.771), first);
  await expect(map).toHaveAttribute("data-e2e-user-location", JSON.stringify({ lat: 35.691, lng: 139.771 }));
  expect(Number(await map.getAttribute("data-e2e-camera-request-count"))).toBe(count);
  await page.getByRole("button", { name: catalog.location.recenter }).click();
  await expect.poll(async () => Number(await map.getAttribute("data-e2e-camera-request-count"))).toBe(count + 1);
  const recentered = JSON.parse((await map.getAttribute("data-e2e-camera-intent"))!) as CameraIntent;
  expect(recentered.kind === "recenter-user" ? recentered.coordinate : null).toEqual({ lat: 35.691, lng: 139.771 });
  await page.getByRole("button", { name: catalog.location.stop }).click();
  await page.evaluate(id => (window as unknown as BrowserE2EGlobals).__e2eGeo.success(id, 1, 1), first);
  await expect(map).toHaveAttribute("data-e2e-user-location", "null");
  await expect(page.getByRole("button", { name: catalog.location.locate, exact: true })).toBeVisible();
  await locate();
  const denied = await page.evaluate(() => (window as unknown as BrowserE2EGlobals).__e2eGeo.latestId());
  await page.evaluate(id => (window as unknown as BrowserE2EGlobals).__e2eGeo.error(id, 1), denied);
  await expect(page.getByText(catalog.location.denied, { exact: true })).toBeVisible();
  await locate();
  const retry = await page.evaluate(() => (window as unknown as BrowserE2EGlobals).__e2eGeo.latestId());
  expect(retry).toBeGreaterThan(denied);
  await page.evaluate(id => (window as unknown as BrowserE2EGlobals).__e2eGeo.success(id, 35.7, 139.78), retry);
  await expect(page.getByText(catalog.location.active, { exact: true })).toBeVisible();
});

test("preserves keyboard names, forced-color selection, and reduced-motion behavior", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openTrip(page);
  await expect(page.locator(".oak-experience")).toHaveAttribute("data-motion", "reduced");
  const day = dayButton(page, "Harbor field day");
  await expect(day).toHaveAttribute("aria-current", "true");
  const style = await day.evaluate(element => { const css = getComputedStyle(element); return { border: css.borderStyle, color: css.color, background: css.backgroundColor }; });
  expect(style.border).not.toBe("none");
  expect(style.color).not.toBe(style.background);
  await expect(ownerButton(page, "transport-shuttle")).toHaveAccessibleName(/07:00/);
  await expect(ownerButton(page, "shopping-supplies")).toHaveAccessibleName(new RegExp(catalog.timing.unknown));
  const route = ownerButton(page, "route-shuttle-ferry");
  await route.focus(); await route.press("Enter");
  await expect(route).toHaveAttribute("aria-pressed", "true");
  await expect(ownerRow(page, "route-shuttle-ferry").getByText("Board synthetic blue line")).toBeVisible();
  await page.getByRole("button", { name: catalog.accessibleNames.collapseDayRail }).click();
  await expect(page.locator(".oak-day-header")).toHaveAttribute("data-transition-phase", "settled");
  expect(await page.locator(".oak-day-rail-motion").evaluate(element => getComputedStyle(element).transitionDuration)).toMatch(/^(0s|0.001s)(, (0s|0.001s))*$/);
  await setSheetSnap(page, "collapsed"); await setSheetSnap(page, "expanded");
});
