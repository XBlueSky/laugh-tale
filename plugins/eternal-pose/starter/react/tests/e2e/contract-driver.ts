import { expect, type Page } from "@playwright/test";
import type { CameraIntent } from "@laugh-tale-island/core";
import { catalog } from "../../src/presentation/copy/catalog";
export { catalog };
interface E2EGeolocationControl { latestId(): number; success(id: number, latitude: number, longitude: number): void }
interface ContractBrowserGlobals { __e2eGeo: E2EGeolocationControl }
export const mapSurface = (page: Page) => page.getByRole("region", { name: catalog.accessibleNames.map, exact: true });
export const sheetSurface = (page: Page) => page.getByRole("region", { name: catalog.accessibleNames.itinerarySheet, exact: true });
export const sheetHandle = (page: Page) => page.getByRole("separator", { name: catalog.accessibleNames.itinerarySheet });
export const ownerRow = (page: Page, id: string) => page.locator('.oak-timeline [data-owner-id="' + id + '"]');
export const ownerButton = (page: Page, id: string) => ownerRow(page, id).locator(".oak-row-selection, .oak-route-selection").first();
export const dayButton = (page: Page, title: string) => page.getByRole("navigation", { name: catalog.accessibleNames.dayRail }).getByRole("button", { name: new RegExp(title) });
export async function enterDay(page: Page, ordinal = 1): Promise<void> {
  await page.getByRole("button", { name: catalog.home.openDay + " · " + catalog.experience.dayOfTrip.replace("{ordinal}", String(ordinal)), exact: true }).click();
  await expect(mapSurface(page)).toHaveAttribute("data-e2e-map-surface", "true");
}
export async function openTrip(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Synthetic Archipelago Field Trip" })).toBeVisible();
  await enterDay(page);
  await expect(mapSurface(page).locator("[data-map-route]").first()).toBeAttached();
}
export async function setSheetSnap(page: Page, snap: "collapsed" | "half" | "expanded"): Promise<void> {
  await sheetHandle(page).focus();
  await sheetHandle(page).press(snap === "expanded" ? "End" : "Home");
  if (snap === "half") await sheetHandle(page).press("ArrowUp");
  await expect(sheetSurface(page)).toHaveAttribute("data-sheet-snap", snap);
}
export async function retryUnavailableRoute(page: Page): Promise<void> {
  const row = ownerRow(page, "route-shopping-hotel");
  await expect(row.locator("[data-route-state]")).toHaveAttribute("data-route-state", "unavailable");
  await ownerButton(page, "route-shopping-hotel").click();
  await row.getByRole("button", { name: catalog.provider.retry, exact: true }).click();
  await expect(row.locator("[data-route-state]")).toHaveAttribute("data-route-state", "ready");
}
export async function candidateDecision(page: Page): Promise<void> {
  await ownerButton(page, "dining-lunch").click();
  const reopen = ownerRow(page, "dining-lunch").getByRole("button", { name: catalog.candidate.reopen, exact: true });
  await reopen.click();
  const dialog = page.getByRole("dialog", { name: catalog.accessibleNames.candidateDialog });
  const canal = dialog.getByRole("button", { name: /Canal counter/ });
  await canal.click();
  await expect(canal).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: catalog.candidate.cancel, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(reopen).toBeFocused();
  await expect(ownerButton(page, "dining-lunch")).toContainText("Garden kitchen");
  await reopen.click();
  await dialog.getByRole("button", { name: /Canal counter/ }).click();
  await dialog.getByRole("button", { name: catalog.candidate.confirm, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(ownerButton(page, "dining-lunch")).toContainText("Canal counter");
  await reopen.click();
  await dialog.getByRole("button", { name: /Garden kitchen/ }).click();
  await dialog.getByRole("button", { name: catalog.candidate.cancel, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(ownerButton(page, "dining-lunch")).toContainText("Canal counter");
  await expect(reopen).toBeFocused();
}
export async function installContractGeolocation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let nextId = 0;
    const callbacks = new Map<number, PositionCallback>();
    const geolocation: Geolocation = {
      getCurrentPosition: () => undefined,
      watchPosition: (success) => {
        nextId += 1;
        callbacks.set(nextId, success);
        return nextId;
      },
      clearWatch: () => undefined,
    };
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: geolocation,
    });
    (window as unknown as ContractBrowserGlobals).__e2eGeo = {
      latestId: () => nextId,
      success: (id, latitude, longitude) => {
        callbacks.get(id)?.({
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
    };
  });
}


export async function runPresentationContract(page: Page): Promise<void> {
  await openTrip(page);
  await retryUnavailableRoute(page);
  await dayButton(page, "Cove closing day").click();
  await expect(dayButton(page, "Cove closing day")).toHaveAttribute("aria-current", "true");
  await dayButton(page, "Harbor field day").click();
  await expect(dayButton(page, "Harbor field day")).toHaveAttribute("aria-current", "true");
  const map = mapSurface(page);
  await ownerButton(page, "shopping-supplies").click();
  const marker = map.locator('[data-map-owner="shopping-supplies"]');
  await expect(map).toHaveAttribute("data-e2e-camera-kind", "focus");
  const intent = JSON.parse((await map.getAttribute("data-e2e-camera-intent"))!) as CameraIntent;
  expect(intent.kind === "focus" ? JSON.stringify(intent.coordinate) : null).toBe(await marker.getAttribute("data-map-coordinate"));
  await map.locator('[data-map-owner="sightseeing-lookout"]').dispatchEvent("click");
  await expect(ownerButton(page, "sightseeing-lookout")).toHaveAttribute("aria-pressed", "true");
  await expect(ownerButton(page, "sightseeing-lookout")).toBeFocused();
  await candidateDecision(page);
  await page.getByRole("button", { name: catalog.location.locate, exact: true }).click();
  const id = await page.evaluate(() => (window as unknown as ContractBrowserGlobals).__e2eGeo.latestId());
  await page.evaluate(id => (window as unknown as ContractBrowserGlobals).__e2eGeo.success(id, 35.69, 139.77), id);
  await expect(map).toHaveAttribute("data-e2e-user-location", JSON.stringify({ lat: 35.69, lng: 139.77 }));
  await page.evaluate(id => (window as unknown as ContractBrowserGlobals).__e2eGeo.success(id, 35.691, 139.771), id);
  await expect(map).toHaveAttribute("data-e2e-user-location", JSON.stringify({ lat: 35.691, lng: 139.771 }));
  const count = Number(await map.getAttribute("data-e2e-camera-request-count"));
  await page.getByRole("button", { name: catalog.location.recenter, exact: true }).click();
  await expect.poll(async () => Number(await map.getAttribute("data-e2e-camera-request-count"))).toBe(count + 1);
  await page.getByRole("button", { name: catalog.location.stop, exact: true }).click();
  await expect(map).toHaveAttribute("data-e2e-user-location", "null");
  for (let cycle = 0; cycle < 5; cycle++) for (const snap of ["collapsed", "half", "expanded"] as const) await setSheetSnap(page, snap);
  await page.getByRole("button", { name: catalog.experience.home, exact: true }).click();
  const reservations = page.getByRole("region", { name: catalog.home.reservations });
  await expect(reservations.getByText("SYNTHETIC-SKY", { exact: true })).toBeVisible();
  const task = page.getByRole("checkbox", { name: "Refill water bottle", exact: true });
  const checked = await task.isChecked();
  await task.setChecked(!checked);
  await expect(task).toBeChecked({ checked: !checked });
  await expect(page.getByRole("heading", { name: "Synthetic Archipelago Field Trip" })).toBeVisible();
}
