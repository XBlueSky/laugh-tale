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
  await page.getByRole("button", { name: /進入 Day 1 · Harbor field day/ }).click();
  await expect(page.getByTestId("trip-experience")).toBeVisible();
  await expect(page.getByTestId("itinerary-map")).toHaveAttribute("data-e2e-map-surface", "true");
  await expect(page.locator("[data-route-id]").first()).toBeVisible();
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
      if (element.matches(":disabled")) return [];
      const style = getComputedStyle(element);
      const ownRect = element.getBoundingClientRect();
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        ownRect.width === 0 ||
        ownRect.height === 0 ||
        ownRect.bottom <= 0 ||
        ownRect.top >= window.innerHeight ||
        ownRect.right <= 0 ||
        ownRect.left >= window.innerWidth
      ) {
        return [];
      }
      const input = element instanceof HTMLInputElement ? element : null;
      const target =
        input !== null && ["checkbox", "radio"].includes(input.type) && input.labels?.[0] !== undefined
          ? input.labels[0]
          : element;
      const rect = target.getBoundingClientRect();
      return rect.width + 0.5 < 44 || rect.height + 0.5 < 44
        ? [{
            name: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 80) ?? element.tagName,
            width: rect.width,
            height: rect.height,
          }]
        : [];
    });
  });
}

test("keeps the persistent map and interruptible three-snap sheet inside every mobile viewport", async ({ page }) => {
  await openTrip(page);
  const map = page.getByTestId("itinerary-map");
  const sheet = page.getByRole("region", { name: "Itinerary" });
  const handle = page.getByRole("button", { name: "Drag itinerary sheet" });

  await expect(map).toBeVisible();
  await expect(map.getByText("Deterministic test map · E2E only")).toBeVisible();
  await expect(sheet).toHaveAttribute("data-snap", "half");
  expect(await page.evaluate(() => ({
    document: document.documentElement.scrollWidth <= window.innerWidth,
    body: document.body.scrollWidth <= window.innerWidth,
  }))).toEqual({ document: true, body: true });

  const handleBox = await handle.boundingBox();
  expect(handleBox?.width).toBeGreaterThanOrEqual(44);
  expect(handleBox?.height).toBeGreaterThanOrEqual(44);
  await handle.press("Home");
  await expect(sheet).toHaveAttribute("data-snap", "collapsed");
  await handle.press("End");
  await expect(sheet).toHaveAttribute("data-snap", "expanded");

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
  await expect(page.getByRole("button", { name: /約 09:00 Lookout terrace/ })).toHaveAttribute(
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
  expect(padding.top).toBeGreaterThan(13);
  expect(padding.bottom).toBeGreaterThan(29);
  expect(padding.top).not.toBe(padding.bottom);

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
  await expect(page.getByRole("button", { name: /約 10:00 Garden kitchen/ })).toHaveAttribute(
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
  await expect(page.getByRole("button", { name: /約 10:00 Garden kitchen/ })).toHaveAttribute("aria-current", "step");

  const supplyMapMarker = map.getByRole("button", { name: "Map place Supply hall" });
  const supplyOwner = await supplyMapMarker.getAttribute("data-map-owner");
  await page.getByRole("button", { name: /時間未定 Supply hall/ }).click();
  await expect(map).toHaveAttribute("data-e2e-focus-kind", "place");
  await expect(map).toHaveAttribute("data-e2e-focus-id", supplyOwner!);
  await expect(supplyMapMarker).toHaveAttribute("data-map-tone", "selected");

  await map.getByRole("button", { name: "Map place Lookout terrace" }).dispatchEvent("click");
  await expect(page.getByRole("button", { name: /約 09:00 Lookout terrace/ })).toHaveAttribute("aria-pressed", "true");

  await dayTwo.click();
  await expect(dayTwo).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /09:00 Cove walk/ })).toBeVisible();
  await page.getByRole("button", { name: "Return to the current itinerary item" }).first().click();
  await expect(dayOne).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /約 10:00 Garden kitchen/ })).toHaveAttribute("aria-pressed", "true");

  const routeOwners = await page.locator("[data-route-owner]").evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-route-owner")),
  );
  expect(routeOwners).toHaveLength(10);
  expect(new Set(routeOwners).size).toBe(10);
  await expect(page.locator('[data-route-owner="route-start-shuttle"]')).toHaveAttribute("data-display", "compact");
  await expect(page.locator('[data-route-owner="route-ferry-lookout"]')).toHaveAttribute("data-display", "full");

  const transit = page.locator('[data-route-id="route-shuttle-ferry"]');
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

  const focusCountBeforeMapSelection = Number(await map.getAttribute("data-e2e-focus-count"));
  await map.getByRole("button", { name: "Map route route-ferry-lookout" }).dispatchEvent("click");
  await expect(map.getByRole("button", { name: "Map route route-ferry-lookout" })).toHaveAttribute("data-map-tone", "selected");
  const selectedListRoute = page.locator('[data-route-id="route-ferry-lookout"]');
  await expect(selectedListRoute).toHaveAttribute("aria-pressed", "true");
  await expect(selectedListRoute).toHaveAttribute("data-selected", "true");
  await expect(selectedListRoute).toBeFocused();
  const focusCountAfterMapSelection = Number(await map.getAttribute("data-e2e-focus-count"));
  expect(focusCountAfterMapSelection).toBe(focusCountBeforeMapSelection);
  await map.getByRole("button", { name: "Map route route-ferry-lookout" }).dispatchEvent("click");
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
  const compare = page.getByRole("button", { name: "比較 Lunch choice" });
  await compare.click();
  await expect(map.getByRole("button", { name: /Map place 5A · Garden kitchen/ })).toBeVisible();
  const canalMarker = map.getByRole("button", { name: /Map place 5B · Canal counter/ });
  await expect(canalMarker).toBeVisible();
  await canalMarker.dispatchEvent("click");
  await expect(page.getByRole("radio", { name: /5B · Canal counter/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /5B · Canal counter/ })).toBeFocused();
  await page.getByRole("button", { name: "確認選擇 Canal counter" }).click();
  await expect(page.getByText("已選 · Canal counter")).toBeVisible();
  await expect(map.getByRole("button", { name: /Map place 5A · Garden kitchen/ })).toHaveCount(0);
  await expect(map.getByRole("button", { name: /Map place 5B · Canal counter/ })).toHaveCount(0);

  await page.getByRole("button", { name: "重新比較 Lunch choice" }).click();
  await page.getByRole("radio", { name: /5A · Garden kitchen/ }).check();
  await page.getByRole("button", { name: "取消候選比較" }).click();
  await expect(page.getByText("已選 · Canal counter")).toBeVisible();

  await page.getByRole("button", { name: /約 09:00 Lookout terrace/ }).click();
  await page.getByRole("button", { name: "查看 Lookout terrace 候選" }).click();
  await expect(map.getByRole("button", { name: /Map place 4A · Fruit window/ })).toBeVisible();
  await expect(map.getByRole("button", { name: /Map place 4B · Steam bun cart/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /確認選擇/ })).toHaveCount(0);
});

test("renders all semantics, lodging roles, tasks, dialogs, and trip-scoped progress reload and reset", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("trip-home")).toBeVisible();
  const pretrip = page.getByRole("checkbox", { name: "Prepare offline documents" });
  await pretrip.check();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Prepare offline documents" })).toBeChecked();
  await page.getByRole("button", { name: /進入 Day 1 · Harbor field day/ }).click();
  await expect(page.getByTestId("trip-experience")).toBeVisible();

  for (const semantic of ["transport", "transfer", "lodging", "dining", "shopping", "sightseeing", "experience", "logistics", "custom"]) {
    await expect(page.locator(`[data-semantic="${semantic}"]`).first()).toBeAttached();
  }
  await expect(page.getByText("Day start · Stay base")).toBeAttached();
  await expect(page.getByText("Rest / drop off bags")).toBeAttached();
  await expect(page.getByText("Day end · Stay base")).toBeAttached();
  await expect(page.getByText("Friday, 18 April 2042")).toBeAttached();

  await page.getByRole("button", { name: /時間未定 Supply hall/ }).click();
  const shopping = page.getByRole("combobox", { name: "Pocket notebook 採買狀態" });
  await shopping.selectOption("purchased");
  await expect(shopping).toHaveValue("purchased");
  await page.reload();
  await page.getByRole("button", { name: /進入 Day 1 · Harbor field day/ }).click();
  await page.getByRole("button", { name: /時間未定 Supply hall/ }).click();
  await expect(page.getByRole("combobox", { name: "Pocket notebook 採買狀態" })).toHaveValue("purchased");

  const taskTrigger = page.getByRole("button", { name: "開啟 Harbor field day 當日事項" });
  await taskTrigger.click();
  const taskDialog = page.getByRole("dialog", { name: "Harbor field day 當日事項" });
  await expect(taskDialog).toBeVisible();
  expect(await taskDialog.evaluate((element) =>
    element instanceof HTMLDialogElement && element.open,
  )).toBe(true);
  await expect(page.getByText("Use the lobby fountain.")).toBeVisible();
  await page.getByRole("button", { name: "關閉當日事項" }).click();
  await expect(taskTrigger).toBeFocused();

  const reservationTrigger = page.getByRole("button", { name: "開啟訂位資訊" });
  await reservationTrigger.click();
  const reservationDialog = page.getByRole("dialog", { name: "訂位資訊" });
  await expect(reservationDialog).toBeVisible();
  expect(await reservationDialog.evaluate((element) =>
    element instanceof HTMLDialogElement && element.open,
  )).toBe(true);
  await expect(page.getByText("SYNTHETIC-SKY")).toHaveCount(0);
  await page.getByRole("button", { name: "顯示 Sky room admission 訂位代碼" }).click();
  await expect(page.getByText("SYNTHETIC-SKY")).toBeVisible();
  await page.getByRole("button", { name: "關閉訂位資訊" }).click();
  await expect(reservationTrigger).toBeFocused();

  expect(await visibleInteractiveTargetFailures(page)).toEqual([]);

  await page.evaluate(() => {
    localStorage.removeItem("eternal-pose:trip-progress:v1:trip-e2e-archipelago");
  });
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Prepare offline documents" })).not.toBeChecked();
  await page.getByRole("button", { name: /進入 Day 1 · Harbor field day/ }).click();
  await page.getByRole("button", { name: /時間未定 Supply hall/ }).click();
  await expect(page.getByRole("combobox", { name: "Pocket notebook 採買狀態" })).toHaveValue("pending");
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
  const customOwner = page.getByRole("button", { name: /時間未定 Exchange field notes/ });
  await customOwner.scrollIntoViewIfNeeded();
  await customOwner.click();
  await expect(customOwner).toHaveAttribute("aria-pressed", "true");

  await expect(page.getByRole("button", {
    name: /14:00 Sky room session · Friday, 18 April 2042 · fixed time/,
  })).toBeAttached();
  await expect(page.getByRole("button", {
    name: /約 23:30 Harbor House night return · Friday, 18 April 2042 · suggested time · ends Saturday, 19 April 2042 at 00:15/,
  })).toBeAttached();
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

  await expect(page.getByRole("button", { name: /約 07:00 Morning harbor shuttle/ })).toBeAttached();
  await expect(page.getByRole("button", { name: /時間未定 Supply hall/ })).toBeAttached();
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
