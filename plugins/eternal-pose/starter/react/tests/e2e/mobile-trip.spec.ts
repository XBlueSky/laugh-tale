import { expect, test as base, type Page } from "@playwright/test";

interface E2EGeolocationControl {
  latestId(): number;
  success(id: number, latitude: number, longitude: number): void;
  error(id: number, code: number): void;
}

interface BrowserE2EGlobals {
  __e2eGeo: E2EGeolocationControl;
  __ETERNAL_POSE_E2E_NOW__?: string;
}

const test = base.extend<{ externalRequests: string[] }>({
  externalRequests: async ({ page }, provide) => {
    const requests: string[] = [];
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (
        (url.protocol === "http:" || url.protocol === "https:") &&
        (url.hostname === "127.0.0.1" || url.hostname === "localhost")
      ) {
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

async function openTrip(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("trip-home")).toBeVisible();
  await page.getByRole("button", { name: /(?:Enter|進入) Day 1 · Harbor field day/ }).click();
  await expect(page.getByTestId("trip-experience")).toBeVisible();
  await expect(page.getByTestId("itinerary-map")).toHaveAttribute("data-e2e-map-surface", "true");
  await expect(page.locator("[data-route-id]").first()).toBeVisible();
}

async function expectContainedFieldAtlasChrome(page: Page): Promise<void> {
  const experience = page.getByTestId("trip-experience");
  if ((await experience.getAttribute("data-map-chrome-layout")) !== "bounded") return;

  await expect
    .poll(() =>
      page.evaluate(() => {
        const header = document.querySelector<HTMLElement>(".day-header")!;
        const primary = header.querySelector<HTMLElement>(".atlas-day-index__primary")!;
        const title = primary.querySelector<HTMLElement>("strong")!;
        const rail = header.querySelector<HTMLElement>(".atlas-day-index__rail")!;
        const toolbar = document.querySelector<HTMLElement>(
          ".atlas-detail-surface__toolbar",
        )!;
        const headerRect = header.getBoundingClientRect();
        const titleRect = title.getBoundingClientRect();
        const railRect = rail.getBoundingClientRect();
        const buttons = Array.from(rail.querySelectorAll<HTMLElement>("button"));
        const desktop = window.innerWidth >= 768;
        const contained = (owner: DOMRect, child: DOMRect) =>
          child.left >= owner.left - 1 &&
          child.right <= owner.right + 1 &&
          child.top >= owner.top - 1 &&
          child.bottom <= owner.bottom + 1;
        return {
          documentFits: document.documentElement.scrollWidth <= window.innerWidth,
          bodyFits: document.body.scrollWidth <= window.innerWidth,
          headerFits: header.scrollHeight <= header.clientHeight + 1,
          titleHasWidth: title.clientWidth > 0 && titleRect.width > 0,
          titleContained: contained(headerRect, titleRect),
          railContained: contained(headerRect, railRect),
          railFitsWidth: rail.scrollWidth <= rail.clientWidth + 1,
          railDirectionCorrect: desktop
            ? getComputedStyle(rail).display === "grid" &&
              buttons.every((button, index) =>
                index === 0 ||
                button.getBoundingClientRect().top >=
                  buttons[index - 1].getBoundingClientRect().bottom - 1,
              )
            : getComputedStyle(rail).display === "flex",
          mobileToolbarCompact: desktop || toolbar.getBoundingClientRect().height <= 72,
          controlsAre44: [
            ...primary.querySelectorAll<HTMLElement>("button"),
            ...toolbar.querySelectorAll<HTMLElement>("button"),
            ...buttons,
          ].every((button) => {
            const rect = button.getBoundingClientRect();
            return rect.width + 0.5 >= 44 && rect.height + 0.5 >= 44;
          }),
        };
      }),
    )
    .toEqual({
      documentFits: true,
      bodyFits: true,
      headerFits: true,
      titleHasWidth: true,
      titleContained: true,
      railContained: true,
      railFitsWidth: true,
      railDirectionCorrect: true,
      mobileToolbarCompact: true,
      controlsAre44: true,
    });
}

async function expectBoundedProviderChrome(page: Page): Promise<void> {
  const bounded = await page
    .getByTestId("trip-experience")
    .getAttribute("data-map-chrome-layout");
  if (bounded !== "bounded") return;
  await expect
    .poll(() =>
      page.evaluate(() => {
        const map = document.querySelector<HTMLElement>("[data-provider-canvas='bounded']")!;
        const header = document.querySelector<HTMLElement>(".day-header")!;
        const sheet = document.querySelector<HTMLElement>(".itinerary-sheet")!;
        const control = map.querySelector<HTMLElement>("[data-e2e-provider-control]")!;
        const attribution = map.querySelector<HTMLElement>("[data-e2e-provider-attribution]")!;
        const mapRect = map.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const sheetRect = sheet.getBoundingClientRect();
        const controlRect = control.getBoundingClientRect();
        const attributionRect = attribution.getBoundingClientRect();
        const controlHit = document
          .elementFromPoint(
            controlRect.left + controlRect.width / 2,
            controlRect.top + controlRect.height / 2,
          )
          ?.closest("[data-e2e-provider-control]");
        const separated = (first: DOMRect, second: DOMRect) =>
          first.right <= second.left + 1 ||
          first.left >= second.right - 1 ||
          first.bottom <= second.top + 1 ||
          first.top >= second.bottom - 1;
        const desktop = window.innerWidth >= 768;
        return {
          clearsHeader: desktop
            ? separated(mapRect, headerRect)
            : mapRect.top >= headerRect.bottom,
          clearsSheet: desktop
            ? separated(mapRect, sheetRect)
            : mapRect.bottom <= sheetRect.top - 7,
          controlContained:
            controlRect.left >= mapRect.left &&
            controlRect.right <= mapRect.right &&
            controlRect.top >= mapRect.top &&
            controlRect.bottom <= mapRect.bottom,
          attributionContained:
            attributionRect.left >= mapRect.left &&
            attributionRect.right <= mapRect.right &&
            attributionRect.top >= mapRect.top &&
            attributionRect.bottom <= mapRect.bottom,
          controlOperable: controlHit === control,
        };
      }),
    )
    .toEqual({
      clearsHeader: true,
      clearsSheet: true,
      controlContained: true,
      attributionContained: true,
      controlOperable: true,
    });
}

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

async function expectCompleteFieldAtlasReflow(page: Page): Promise<void> {
  const experience = page.getByTestId("trip-experience");
  if ((await experience.getAttribute("data-map-chrome-layout")) !== "bounded") return;

  const layout = experience.locator(".atlas-responsive-layout");
  await expect(layout).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const header = document.querySelector<HTMLElement>(".day-header")!;
        const sheet = document.querySelector<HTMLElement>(".itinerary-sheet")!;
        const layoutNode = document.querySelector<HTMLElement>(".atlas-responsive-layout")!;
        const map = document.querySelector<HTMLElement>("[data-provider-canvas='bounded']")!;
        const itinerary = document.querySelector<HTMLElement>("[data-scroll-region='itinerary']")!;
        const tripTitle = header.querySelector<HTMLElement>(".atlas-day-index__primary strong")!;
        const dayTitle = sheet.querySelector<HTMLElement>(".atlas-detail-surface__heading strong")!;
        const contains = (owner: HTMLElement, child: HTMLElement) => {
          const ownerRect = owner.getBoundingClientRect();
          const childRect = child.getBoundingClientRect();
          return (
            childRect.left >= ownerRect.left - 1 &&
            childRect.right <= ownerRect.right + 1 &&
            childRect.top >= ownerRect.top - 1 &&
            childRect.bottom <= ownerRect.bottom + 1
          );
        };
        const criticalControls = [
          ...header.querySelectorAll<HTMLElement>("button"),
          ...sheet.querySelectorAll<HTMLElement>("button"),
          ...document.querySelectorAll<HTMLElement>(".atlas-map-controls button"),
        ].filter((control) => control.getClientRects().length > 0);
        return {
          documentFits: document.documentElement.scrollWidth <= window.innerWidth,
          bodyFits: document.body.scrollWidth <= window.innerWidth,
          flowMode: getComputedStyle(layoutNode).display === "grid",
          verticalFlow: layoutNode.scrollHeight > layoutNode.clientHeight,
          headerFits: header.scrollHeight <= header.clientHeight + 1,
          sheetFits: sheet.scrollHeight <= sheet.clientHeight + 1,
          tripTitleFits:
            contains(header, tripTitle) &&
            tripTitle.scrollWidth <= tripTitle.clientWidth + 1 &&
            tripTitle.scrollHeight <= tripTitle.clientHeight + 1,
          dayTitleFits:
            contains(sheet, dayTitle) &&
            dayTitle.scrollWidth <= dayTitle.clientWidth + 1 &&
            dayTitle.scrollHeight <= dayTitle.clientHeight + 1,
          itineraryHasFlow:
            itinerary.clientHeight > 0 &&
            itinerary.scrollHeight > 0 &&
            itinerary.getBoundingClientRect().width > 0,
          mapHasCanvas:
            map.getBoundingClientRect().width > 0 &&
            map.getBoundingClientRect().height > 0,
          targetsAre44:
            criticalControls.length > 0 &&
            criticalControls.every((control) => {
              const rect = control.getBoundingClientRect();
              return rect.width + 0.5 >= 44 && rect.height + 0.5 >= 44;
            }),
        };
      }),
    )
    .toEqual({
      documentFits: true,
      bodyFits: true,
      flowMode: true,
      verticalFlow: true,
      headerFits: true,
      sheetFits: true,
      tripTitleFits: true,
      dayTitleFits: true,
      itineraryHasFlow: true,
      mapHasCanvas: true,
      targetsAre44: true,
    });

  const criticalControls = page.locator(
    ".day-header button, .itinerary-sheet button, .atlas-map-controls button",
  );
  for (let index = 0; index < (await criticalControls.count()); index += 1) {
    const control = criticalControls.nth(index);
    if (await control.isVisible()) {
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport();
    }
  }

  await page.getByTestId("itinerary-map").scrollIntoViewIfNeeded();
  await expectBoundedProviderChrome(page);
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
  ]));
});

test("keeps the persistent map and interruptible three-snap sheet inside every mobile viewport", async ({ page }) => {
  await openTrip(page);
  const map = page.getByTestId("itinerary-map");
  const sheet = page.getByRole("region", { name: "Itinerary" });
  const handle = page.getByRole("button", { name: "Drag itinerary sheet" });

  await expect(map).toBeVisible();
  await expect(map.getByText("Deterministic test map · E2E only")).toBeVisible();
  await expect(sheet).toHaveAttribute("data-snap", "half");
  await expectContainedFieldAtlasChrome(page);
  await expectBoundedProviderChrome(page);
  expect(await page.evaluate(() => ({
    document: document.documentElement.scrollWidth <= window.innerWidth,
    body: document.body.scrollWidth <= window.innerWidth,
  }))).toEqual({ document: true, body: true });

  const handleBox = await handle.boundingBox();
  expect(handleBox?.width).toBeGreaterThanOrEqual(44);
  expect(handleBox?.height).toBeGreaterThanOrEqual(44);
  await handle.press("Home");
  await expect(sheet).toHaveAttribute("data-snap", "collapsed");
  await expectBoundedProviderChrome(page);
  await handle.press("End");
  await expect(sheet).toHaveAttribute("data-snap", "expanded");
  await expectBoundedProviderChrome(page);

  await handle.hover();
  const dragBox = await handle.boundingBox();
  expect(dragBox).not.toBeNull();
  await page.mouse.move(dragBox!.x + dragBox!.width / 2, dragBox!.y + dragBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragBox!.x + dragBox!.width / 2, dragBox!.y + 240, { steps: 4 });
  await expect(sheet).toHaveAttribute("data-dragging", "true");
  expect(await sheet.evaluate((element) => (element as HTMLElement).style.transitionDuration)).toBe("0ms");
  await page.mouse.up();
  await expect(sheet).not.toHaveAttribute("data-snap", "expanded");

  const boundedFieldAtlas =
    (await page.getByTestId("trip-experience").getAttribute("data-map-chrome-layout")) ===
    "bounded";
  if (page.viewportSize()?.width === 320 && boundedFieldAtlas) {
    await page.getByRole("button", { name: "Set half itinerary" }).click();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
      window.dispatchEvent(new Event("resize"));
    });
    await expectCompleteFieldAtlasReflow(page);
    await page.evaluate(() => {
      document.documentElement.style.removeProperty("font-size");
      window.dispatchEvent(new Event("resize"));
    });

    await page.setViewportSize({ width: 160, height: 284 });
    await expectCompleteFieldAtlasReflow(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await expect(sheet).toHaveAttribute("data-snap", "half");
    await expectBoundedProviderChrome(page);
    await expectContainedFieldAtlasChrome(page);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await expectContainedFieldAtlasChrome(page);
    await expectBoundedProviderChrome(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await expectContainedFieldAtlasChrome(page);
  }

  const geometry = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".day-header")!.getBoundingClientRect();
    const sheetRect = document.querySelector<HTMLElement>(".itinerary-sheet")!.getBoundingClientRect();
    return {
      headerTop: header.top,
      sheetTop: sheetRect.top,
      sheetBottom: sheetRect.bottom,
      height: window.innerHeight,
    };
  });
  expect(geometry.headerTop).toBeGreaterThanOrEqual(0);
  expect(geometry.sheetTop).toBeGreaterThanOrEqual(0);
  expect(geometry.sheetBottom).toBeLessThanOrEqual(geometry.height + 1);
});

test("proves asymmetric safe areas, clock advancement, route retry, and persistent map identity", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as BrowserE2EGlobals).__ETERNAL_POSE_E2E_NOW__ = "2042-04-18T08:50:00Z";
  });
  await openTrip(page);
  const experience = page.getByTestId("trip-experience");
  const map = page.getByTestId("itinerary-map");
  const mapHandle = await map.elementHandle();
  expect(mapHandle).not.toBeNull();
  const initialMountCount = Number(await map.getAttribute("data-e2e-mount-count"));
  expect(initialMountCount).toBeGreaterThan(0);
  await expect(page.getByLabel("Etc/UTC time")).toHaveText("08:50");
  await expect(page.getByRole("button", { name: /(?:About|約) 09:00 Lookout terrace/ })).toHaveAttribute(
    "data-selection-source",
    "automatic",
  );

  await page.addStyleTag({
    content: ".safe-area-probe { padding-top: 13px !important; padding-bottom: 29px !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await expect.poll(() => experience.evaluate((element) => ({
    top: element.style.getPropertyValue("--safe-area-top"),
    bottom: element.style.getPropertyValue("--safe-area-bottom"),
  }))).toEqual({ top: "13px", bottom: "29px" });
  const padding = JSON.parse((await map.getAttribute("data-e2e-padding"))!) as {
    top: number;
    bottom: number;
  };
  if ((await experience.getAttribute("data-map-chrome-layout")) === "bounded") {
    expect(padding).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
    await expectBoundedProviderChrome(page);
  } else {
    expect(padding.top).toBeGreaterThan(13);
    expect(padding.bottom).toBeGreaterThan(29);
    expect(padding.top).not.toBe(padding.bottom);
  }

  const unavailable = page.locator(
    '[data-route-owner="route-shopping-hotel"][data-state="error"]',
  );
  await expect(unavailable).toContainText("Synthetic first attempt unavailable");
  await unavailable.getByRole("button", { name: "Retry route" }).click();
  await expect(page.locator('[data-route-id="route-shopping-hotel"]')).toBeVisible();
  await expect(unavailable).toHaveCount(0);

  await page.evaluate(() => {
    (window as unknown as BrowserE2EGlobals).__ETERNAL_POSE_E2E_NOW__ = "2042-04-18T10:15:00Z";
  });
  await page.getByRole("button", { name: "Collapse date choices" }).click();
  await expect(page.getByLabel("Etc/UTC time")).toHaveText("10:15");
  await expect(page.getByRole("button", { name: /(?:About|約) 10:00 Garden kitchen/ })).toHaveAttribute(
    "aria-current",
    "step",
  );

  await page.getByRole("button", { name: "Expand date choices" }).click();
  await page.getByRole("button", { name: /Day 2: Cove closing day/ }).click();
  await page.getByRole("button", { name: "Return to the current itinerary item" }).first().click();
  expect(await mapHandle.evaluate((element) =>
    element.isConnected && element === document.querySelector('[data-testid="itinerary-map"]'),
  )).toBe(true);
  await expect(map).toHaveAttribute("data-e2e-mount-count", String(initialMountCount));
});

test("synchronizes dates, live current state, list places, map places, and independent route owners", async ({ page }) => {
  await openTrip(page);
  const map = page.getByTestId("itinerary-map");
  const dayOne = page.getByRole("button", { name: /Day 1: Harbor field day, Fri, Apr 18/ });
  const dayTwo = page.getByRole("button", { name: /Day 2: Cove closing day, Sat, Apr 19/ });
  await expect(dayOne).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /(?:About|約) 10:00 Garden kitchen/ })).toHaveAttribute("aria-current", "step");

  const supplyMapMarker = map.getByRole("button", { name: "Map place Supply hall" });
  const supplyOwner = await supplyMapMarker.getAttribute("data-map-owner");
  await page.getByRole("button", { name: /(?:Time not set|時間未定) Supply hall/ }).click();
  await expect(map).toHaveAttribute("data-e2e-focus-kind", "place");
  await expect(map).toHaveAttribute("data-e2e-focus-id", supplyOwner!);
  await expect(supplyMapMarker).toHaveAttribute("data-map-tone", "selected");

  await map.getByRole("button", { name: "Map place Lookout terrace" }).dispatchEvent("click");
  await expect(page.getByRole("button", { name: /(?:About|約) 09:00 Lookout terrace/ })).toHaveAttribute("aria-pressed", "true");

  await dayTwo.click();
  await expect(dayTwo).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /09:00 Cove walk/ })).toBeVisible();
  await page.getByRole("button", { name: "Return to the current itinerary item" }).first().click();
  await expect(dayOne).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /(?:About|約) 10:00 Garden kitchen/ })).toHaveAttribute("aria-pressed", "true");

  const routeOwners = await page.locator("[data-route-owner]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-route-owner")),
  );
  expect(routeOwners).toHaveLength(10);
  expect(new Set(routeOwners).size).toBe(10);
  await expect(page.locator('[data-route-owner="route-start-shuttle"]')).toHaveAttribute("data-display", "compact");
  await expect(page.locator('[data-route-owner="route-ferry-lookout"]')).toHaveAttribute("data-display", "full");

  const transit = page.locator('[data-route-id="route-shuttle-ferry"]');
  const focusCountBeforeListSelection = Number(await map.getAttribute("data-e2e-focus-count"));
  await transit.click();
  await expect(transit).toHaveAttribute("aria-expanded", "true");
  await expect(transit).toContainText("Transit details");
  await expect(transit).not.toContainText("transit · 18 min");
  const expandedTransitDetailsId = await transit.getAttribute("aria-controls");
  expect(expandedTransitDetailsId).not.toBeNull();
  await expect(
    page.locator(`#${expandedTransitDetailsId!}`).getByText("Board synthetic blue line"),
  ).toBeVisible();
  await expect(map).toHaveAttribute("data-e2e-focus-kind", "route");
  await expect(map).toHaveAttribute("data-e2e-focus-id", "route-shuttle-ferry");
  expect(Number(await map.getAttribute("data-e2e-focus-count"))).toBe(
    focusCountBeforeListSelection + 1,
  );

  const focusCountBeforeMapSelection = Number(await map.getAttribute("data-e2e-focus-count"));
  await map.getByRole("button", { name: "Map route route-ferry-lookout" }).dispatchEvent("click");
  await expect(map.getByRole("button", { name: "Map route route-ferry-lookout" })).toHaveAttribute("data-map-tone", "selected");
  const selectedListRoute = page.locator('[data-route-id="route-ferry-lookout"]');
  await expect(selectedListRoute).toHaveAttribute("aria-pressed", "true");
  await expect(selectedListRoute).toHaveAttribute("data-selected", "true");
  await expect(selectedListRoute).toBeFocused();
  const focusCountAfterMapSelection = Number(await map.getAttribute("data-e2e-focus-count"));
  expect(focusCountAfterMapSelection).toBe(focusCountBeforeMapSelection);
  await page.getByRole("button", { name: "Return to lodging" }).focus();
  await expect(page.getByRole("button", { name: "Return to lodging" })).toBeFocused();
  await map.getByRole("button", { name: "Map route route-ferry-lookout" }).dispatchEvent("click");
  await expect(selectedListRoute).toBeFocused();
  expect(Number(await map.getAttribute("data-e2e-focus-count"))).toBe(focusCountAfterMapSelection);

  const liveDirections = page.getByRole("link", { name: /Open live transit directions from Harbor shuttle stop to Ferry terminal/ });
  const href = new URL((await liveDirections.getAttribute("href"))!);
  expect(href.origin).toBe("https://www.google.com");
  expect(href.pathname).toBe("/maps/dir/");
  expect(href.searchParams.get("api")).toBe("1");
  expect(href.searchParams.get("travelmode")).toBe("transit");
});

test("compares dining and snack candidates together on the persistent map with draft and commit semantics", async ({ page }) => {
  await openTrip(page);
  const map = page.getByTestId("itinerary-map");
  const compare = page.getByRole("button", {
    name: /^(?:Compare Lunch choice(?: again)?|(?:重新)?比較 Lunch choice)$/,
  });
  await compare.click();
  await expect(map.getByRole("button", { name: /Map place 5A · Garden kitchen/ })).toBeVisible();
  const canalMarker = map.getByRole("button", { name: /Map place 5B · Canal counter/ });
  await expect(canalMarker).toBeVisible();
  await canalMarker.dispatchEvent("click");
  const canalRadio = page.getByRole("radio", { name: /5B · Canal counter/ });
  await expect(canalRadio).toBeChecked();
  await expect(canalRadio).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(canalRadio).toBeFocused();
  expect(await canalRadio.evaluate((element) => {
    const label = element.closest("label");
    return label === null ? "none" : getComputedStyle(label).outlineStyle;
  })).not.toBe("none");
  expect(await visibleInteractiveTargetFailures(page)).toEqual([]);
  await page.getByRole("button", { name: /^(?:Confirm Canal counter|確認選擇 Canal counter)$/ }).click();
  const candidateDecision = page.locator("[data-candidate-mode]");
  await expect(candidateDecision.getByText(/^(?:Selected|已選) · Canal counter$/)).toBeVisible();
  await expect(map.getByRole("button", { name: /Map place 5A · Garden kitchen/ })).toHaveCount(0);
  await expect(map.getByRole("button", { name: /Map place 5B · Canal counter/ })).toHaveCount(0);

  await page.getByRole("button", { name: /^(?:Compare Lunch choice again|重新比較 Lunch choice)$/ }).click();
  await page.getByRole("radio", { name: /5A · Garden kitchen/ }).check();
  await page.getByRole("button", { name: /^(?:Cancel candidate comparison|取消候選比較)$/ }).click();
  await expect(candidateDecision.getByText(/^(?:Selected|已選) · Canal counter$/)).toBeVisible();

  await page.getByRole("button", { name: /(?:About|約) 09:00 Lookout terrace/ }).click();
  await page.getByRole("button", { name: /^(?:View Lookout terrace candidates|查看 Lookout terrace 候選)$/ }).click();
  await expect(map.getByRole("button", { name: /Map place 4A · Fruit window/ })).toBeVisible();
  await expect(map.getByRole("button", { name: /Map place 4B · Steam bun cart/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /(?:Confirm candidate selection|確認選擇)/ })).toHaveCount(0);
  expect(await visibleInteractiveTargetFailures(page)).toEqual([]);
});

test("renders all semantics, lodging roles, tasks, dialogs, and trip-scoped progress reload and reset", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("trip-home")).toBeVisible();
  const pretrip = page.getByRole("checkbox", { name: "Prepare offline documents" });
  await pretrip.check();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Prepare offline documents" })).toBeChecked();
  await page.getByRole("button", { name: /(?:Enter|進入) Day 1 · Harbor field day/ }).click();
  await expect(page.getByTestId("trip-experience")).toBeVisible();

  for (const semantic of ["transport", "transfer", "lodging", "dining", "shopping", "sightseeing", "experience", "logistics", "custom"]) {
    await expect(page.locator(`[data-semantic="${semantic}"]`).first()).toBeAttached();
  }
  await expect(page.getByText("Day start · Stay base")).toBeAttached();
  await expect(page.getByText("Rest / drop off bags")).toBeAttached();
  await expect(page.getByText("Day end · Stay base")).toBeAttached();
  await expect(page.getByText("Friday, 18 April 2042")).toBeAttached();

  await page.getByRole("button", { name: /(?:Time not set|時間未定) Supply hall/ }).click();
  const shopping = page.getByRole("combobox", { name: /^(?:Pocket notebook shopping status|Pocket notebook 採買狀態)$/ });
  await shopping.selectOption("purchased");
  await expect(shopping).toHaveValue("purchased");
  await page.reload();
  await page.getByRole("button", { name: /(?:Enter|進入) Day 1 · Harbor field day/ }).click();
  await page.getByRole("button", { name: /(?:Time not set|時間未定) Supply hall/ }).click();
  await expect(page.getByRole("combobox", { name: /^(?:Pocket notebook shopping status|Pocket notebook 採買狀態)$/ })).toHaveValue("purchased");

  const taskTrigger = page.getByRole("button", { name: /^(?:Open tasks for Harbor field day|開啟 Harbor field day 當日事項)$/ });
  await taskTrigger.click();
  const taskDialog = page.getByRole("dialog", { name: /^(?:Tasks for Harbor field day|Harbor field day 當日事項)$/ });
  await expect(taskDialog).toBeVisible();
  expect(await taskDialog.evaluate((element) =>
    element instanceof HTMLDialogElement && element.open,
  )).toBe(true);
  await expect(page.getByText("Use the lobby fountain.")).toBeVisible();
  expect(await visibleInteractiveTargetFailures(page)).toEqual([]);
  await page.getByRole("button", { name: /^(?:Close day tasks|關閉當日事項)$/ }).click();
  await expect(taskTrigger).toBeFocused();

  const reservationTrigger = page.getByRole("button", { name: /^(?:Open reservation information|開啟訂位資訊)$/ });
  await reservationTrigger.click();
  const reservationDialog = page.getByRole("dialog", { name: /^(?:Reservation information|訂位資訊)$/ });
  await expect(reservationDialog).toBeVisible();
  expect(await reservationDialog.evaluate((element) =>
    element instanceof HTMLDialogElement && element.open,
  )).toBe(true);
  await expect(page.getByText("SYNTHETIC-SKY")).toHaveCount(0);
  expect(await visibleInteractiveTargetFailures(page)).toEqual([]);
  await page.getByRole("button", { name: /^(?:Show Sky room admission reservation code|顯示 Sky room admission 訂位代碼)$/ }).click();
  await expect(page.getByText("SYNTHETIC-SKY")).toBeVisible();
  await page.getByRole("button", { name: /^(?:Close reservation information|關閉訂位資訊)$/ }).click();
  await expect(reservationTrigger).toBeFocused();

  expect(await visibleInteractiveTargetFailures(page)).toEqual([]);

  await page.evaluate(() => {
    localStorage.removeItem("eternal-pose:trip-progress:v1:trip-e2e-archipelago");
  });
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Prepare offline documents" })).not.toBeChecked();
  await page.getByRole("button", { name: /(?:Enter|進入) Day 1 · Harbor field day/ }).click();
  await page.getByRole("button", { name: /(?:Time not set|時間未定) Supply hall/ }).click();
  await expect(page.getByRole("combobox", { name: /^(?:Pocket notebook shopping status|Pocket notebook 採買狀態)$/ })).toHaveValue("pending");
});

test("keeps every semantic renderer visible and exposes absolute cross-midnight owner names", async ({ page }) => {
  await openTrip(page);
  await page.getByRole("button", { name: "Expand itinerary" }).click();
  const rendererExpectations = new Map([
    ["transport", "Board the blue local shuttle"],
    ["transfer", "Pier One"],
    ["lodging", "Stay base"],
    ["dining", "Selected · Garden kitchen"],
    ["shopping", "Pocket notebook"],
    ["sightseeing", "North quay"],
    ["experience", "Friday, 18 April 2042"],
    ["logistics", "0 / 2 steps complete"],
    ["custom", "field-notes"],
  ]);
  for (const [semantic, text] of rendererExpectations) {
    const renderer = page.locator(`[data-semantic="${semantic}"]`).first();
    await renderer.scrollIntoViewIfNeeded();
    await expect(renderer).toBeVisible();
    await expect(renderer).toContainText(text);
  }

  const logisticsDisclosure = page.getByRole("button", {
    name: "Show Locker pickup details",
  });
  await logisticsDisclosure.scrollIntoViewIfNeeded();
  await logisticsDisclosure.click();
  await expect(page.getByText("Show locker slip")).toBeVisible();
  const customOwner = page.getByRole("button", { name: /(?:Time not set|時間未定) Exchange field notes/ });
  await customOwner.scrollIntoViewIfNeeded();
  await customOwner.click();
  await expect(customOwner).toHaveAttribute("aria-pressed", "true");

  await expect(page.getByRole("button", {
    name: /14:00 Sky room session · Friday, 18 April 2042 · fixed time/,
  })).toBeAttached();
  await expect(page.getByRole("button", {
    name: /(?:About|約) 23:30 Harbor House night return · Friday, 18 April 2042 · suggested time · ends Saturday, 19 April 2042 at 00:15/,
  })).toBeAttached();
  expect(await visibleInteractiveTargetFailures(page)).toEqual([]);
});

test("handles location success, denied retry, stale callbacks, and explicit recenter without camera chasing", async ({ page }) => {
  await openTrip(page);
  const map = page.getByTestId("itinerary-map");
  await page.getByRole("button", { name: "Use my location" }).click();
  const firstWatch = await page.evaluate(() => (window as unknown as BrowserE2EGlobals).__e2eGeo.latestId());
  await page.evaluate(({ id }) => {
    (window as unknown as BrowserE2EGlobals).__e2eGeo.success(id, 35.69, 139.77);
  }, { id: firstWatch });
  await expect(page.getByText("Location active")).toBeVisible();
  await expect(map).toHaveAttribute("data-e2e-user-location", JSON.stringify({ lat: 35.69, lng: 139.77 }));
  const firstFocusCount = Number(await map.getAttribute("data-e2e-focus-count"));

  await page.evaluate(({ id }) => {
    (window as unknown as BrowserE2EGlobals).__e2eGeo.success(id, 35.691, 139.771);
  }, { id: firstWatch });
  await expect(map).toHaveAttribute("data-e2e-user-location", JSON.stringify({ lat: 35.691, lng: 139.771 }));
  expect(Number(await map.getAttribute("data-e2e-focus-count"))).toBe(firstFocusCount);
  await page.getByRole("button", { name: "Recenter my location" }).click();
  expect(Number(await map.getAttribute("data-e2e-focus-count"))).toBe(firstFocusCount + 1);

  await page.getByRole("button", { name: "Stop location sharing" }).click();
  await page.evaluate(({ id }) => {
    (window as unknown as BrowserE2EGlobals).__e2eGeo.success(id, 1, 1);
  }, { id: firstWatch });
  await expect(page.getByText("Location off")).toBeVisible();
  await expect(map).toHaveAttribute("data-e2e-user-location", "null");

  await page.getByRole("button", { name: "Use my location" }).click();
  const deniedWatch = await page.evaluate(() => (window as unknown as BrowserE2EGlobals).__e2eGeo.latestId());
  await page.evaluate(({ id }) => {
    (window as unknown as BrowserE2EGlobals).__e2eGeo.error(id, 1);
  }, { id: deniedWatch });
  await expect(page.getByText("Location permission denied")).toBeVisible();
  await page.getByRole("button", { name: "Use my location" }).click();
  const retryWatch = await page.evaluate(() => (window as unknown as BrowserE2EGlobals).__e2eGeo.latestId());
  expect(retryWatch).toBeGreaterThan(deniedWatch);
  await page.evaluate(({ id }) => {
    (window as unknown as BrowserE2EGlobals).__e2eGeo.success(id, 35.7, 139.78);
  }, { id: retryWatch });
  await expect(page.getByText("Location active")).toBeVisible();
});

test("preserves keyboard names, forced-color selection, and reduced-motion behavior", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openTrip(page);
  const experience = page.getByTestId("trip-experience");
  await expect(experience).toHaveAttribute("data-motion", "reduced");
  const selectedDate = page.getByRole("button", { name: /Day 1: Harbor field day, Fri, Apr 18/ });
  await expect(selectedDate).toHaveAttribute("aria-pressed", "true");
  const selectedStyle = await selectedDate.evaluate((element) => {
    const style = getComputedStyle(element);
    return { borderStyle: style.borderStyle, color: style.color, background: style.backgroundColor };
  });
  expect(selectedStyle.borderStyle).not.toBe("none");
  expect(selectedStyle.color).not.toBe(selectedStyle.background);

  await expect(page.getByRole("button", { name: /(?:About|約) 07:00 Morning harbor shuttle/ })).toBeAttached();
  await expect(page.getByRole("button", { name: /(?:Time not set|時間未定) Supply hall/ })).toBeAttached();
  await expect(page.getByText("Friday, 18 April 2042")).toBeAttached();
  const transit = page.locator('[data-route-id="route-shuttle-ferry"]');
  await transit.focus();
  await transit.press("Enter");
  await expect(transit).toHaveAttribute("aria-expanded", "true");
  const transitDetailsId = await transit.getAttribute("aria-controls");
  expect(transitDetailsId).not.toBeNull();
  await expect(page.locator(`#${transitDetailsId!}`)).toHaveAttribute("data-motion-duration", "0ms");

  const handle = page.getByRole("button", { name: "Drag itinerary sheet" });
  await handle.press("Home");
  await expect(page.getByRole("region", { name: "Itinerary" })).toHaveAttribute("data-snap", "collapsed");
  await handle.press("End");
  await expect(page.getByRole("region", { name: "Itinerary" })).toHaveAttribute("data-snap", "expanded");
});
