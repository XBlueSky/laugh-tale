import { expect, type Locator, type Page } from "@playwright/test";

import {
  decodeMapPlaceOwnerId,
  nodeMapOwnerId,
} from "@laugh-tale-island/core";

interface E2EGeolocationControl {
  latestId(): number;
  success(id: number, latitude: number, longitude: number): void;
}

interface ContractBrowserGlobals {
  __e2eGeo: E2EGeolocationControl;
}

const action = (name: string): string => `[data-contract-action="${name}"]`;
const owner = (kind: string): string => `[data-contract-owner="${kind}"]`;
const surface = (name: string): string => `[data-contract-surface="${name}"]`;

async function locatorWithOwnerId(
  owners: Locator,
  ownerId: string,
): Promise<Locator> {
  await expect
    .poll(() => owners.evaluateAll(
      (elements, expectedId) =>
        elements.findIndex((element) => element.getAttribute("data-owner-id") === expectedId),
      ownerId,
    ))
    .toBeGreaterThanOrEqual(0);
  const index = await owners.evaluateAll(
    (elements, expectedId) =>
      elements.findIndex((element) => element.getAttribute("data-owner-id") === expectedId),
    ownerId,
  );
  return owners.nth(index);
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

async function openFirstDay(page: Page): Promise<void> {
  const reducedMotion = await page.evaluate(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  expect(reducedMotion).toBe(true);
  await page.goto("/");
  const home = page.locator(surface("home"));
  await expect(home).toBeVisible();
  await home.locator(action("enter-day")).first().click();
  await expect(page.locator(surface("experience"))).toBeVisible();
}

async function switchDays(page: Page): Promise<void> {
  const days = page.locator(owner("day"));
  await expect.poll(() => days.count()).toBeGreaterThan(1);
  await days.nth(1).click();
  await expect(days.nth(1)).toHaveAttribute("aria-pressed", "true");
  await days.first().click();
  await expect(days.first()).toHaveAttribute("aria-pressed", "true");
}

async function exerciseListMapFocus(page: Page): Promise<void> {
  const map = page.locator(surface("map"));
  const listOwners = page.locator(owner("node"));
  const firstListOwner = listOwners.first();
  const firstOwnerId = await firstListOwner.getAttribute("data-owner-id");
  expect(firstOwnerId).not.toBeNull();
  await firstListOwner.click();
  await expect(map).toHaveAttribute("data-e2e-focus-kind", "place");
  await expect(map).toHaveAttribute("data-e2e-focus-id", nodeMapOwnerId(firstOwnerId!));

  const mapOwners = map.locator("[data-map-owner]");
  await expect(mapOwners.first()).toBeVisible();
  const mapOwner = mapOwners.nth(Math.min(1, (await mapOwners.count()) - 1));
  const mapOwnerId = await mapOwner.getAttribute("data-map-owner");
  expect(mapOwnerId).not.toBeNull();
  const decodedOwner = decodeMapPlaceOwnerId(mapOwnerId!);
  if (decodedOwner?.kind !== "node") {
    throw new Error("presentation contract map owner must resolve to a node");
  }
  await mapOwner.click();
  const matchingListOwner = await locatorWithOwnerId(listOwners, decodedOwner.id);
  await expect(matchingListOwner).toHaveAttribute("aria-pressed", "true");
  await expect(matchingListOwner).toBeFocused();
}

async function retryUnavailableRoute(page: Page): Promise<void> {
  const unavailable = page.locator(`${owner("route")}[data-state="error"]`).first();
  await expect(unavailable).toBeVisible();
  const routeId = await unavailable.getAttribute("data-owner-id");
  expect(routeId).not.toBeNull();
  await unavailable.locator(action("retry-route")).click();
  const routeOwners = page.locator(owner("route"));
  const ready = await locatorWithOwnerId(routeOwners, routeId!);
  await expect(ready).toHaveAttribute("data-state", "ready");
}

async function selectSingleCandidateOwner(page: Page): Promise<Locator> {
  const nodes = page.locator(owner("node"));
  for (let index = 0; index < await nodes.count(); index += 1) {
    await nodes.nth(index).click();
    const decision = page.locator(`${surface("candidate")}[data-candidate-mode="single"]`);
    if (await decision.count()) return decision;
  }
  throw new Error("presentation contract requires a single-choice candidate owner");
}

async function exerciseCandidateDecision(page: Page): Promise<void> {
  const decision = await selectSingleCandidateOwner(page);
  const trigger = decision.locator(action("candidate-toggle"));
  await trigger.click();
  await expect(decision).toHaveAttribute("data-expanded", "true");
  const options = decision.locator(owner("candidate-option"));
  await expect.poll(() => options.count()).toBeGreaterThan(1);
  await options.nth(1).check();
  await expect(options.nth(1)).toBeChecked();
  await decision.locator(action("candidate-cancel")).click();
  await expect(decision).toHaveAttribute("data-expanded", "false");

  await trigger.click();
  await options.first().check();
  const committedOptionId = await options.first().getAttribute("data-owner-id");
  expect(committedOptionId).not.toBeNull();
  await decision.locator(action("candidate-commit")).click();
  await expect(decision).toHaveAttribute("data-expanded", "false");
  await expect(decision).toHaveAttribute("data-committed-owner-id", committedOptionId!);
}

async function exerciseLocation(page: Page): Promise<void> {
  const map = page.locator(surface("map"));
  await page.locator(action("location-start")).click();
  const watchId = await page.evaluate(
    () => (window as unknown as ContractBrowserGlobals).__e2eGeo.latestId(),
  );
  await page.evaluate(
    ({ id }) =>
      (window as unknown as ContractBrowserGlobals).__e2eGeo.success(id, 35.69, 139.77),
    { id: watchId },
  );
  await expect(page.locator('[data-contract-status="location"]')).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(map).toHaveAttribute(
    "data-e2e-user-location",
    JSON.stringify({ lat: 35.69, lng: 139.77 }),
  );

  await page.evaluate(
    ({ id }) =>
      (window as unknown as ContractBrowserGlobals).__e2eGeo.success(id, 35.691, 139.771),
    { id: watchId },
  );
  await expect(map).toHaveAttribute(
    "data-e2e-user-location",
    JSON.stringify({ lat: 35.691, lng: 139.771 }),
  );
  const focusCount = Number(await map.getAttribute("data-e2e-focus-count"));
  await page.locator(action("location-recenter")).click();
  await expect
    .poll(async () => Number(await map.getAttribute("data-e2e-focus-count")))
    .toBe(focusCount + 1);
  await page.locator(action("location-stop")).click();
  await expect(page.locator('[data-contract-status="location"]')).toHaveAttribute(
    "data-state",
    "idle",
  );
  await expect(map).toHaveAttribute("data-e2e-user-location", "null");
}

async function exerciseReservationDialog(page: Page): Promise<void> {
  const surfaceOwner = page.locator(surface("reservations"));
  await surfaceOwner.locator(action("open-reservations")).click();
  const dialog = page.locator('[data-contract-dialog="reservations"]');
  await expect(dialog).toBeVisible();
  const reveal = dialog.locator(action("reveal-reservation")).first();
  const reservationId = await reveal.getAttribute("data-owner-id");
  expect(reservationId).not.toBeNull();
  await reveal.click();
  const references = dialog.locator(owner("reservation-reference"));
  const reference = await locatorWithOwnerId(references, reservationId!);
  await expect(reference).toHaveAttribute("data-state", "revealed");
  await expect(reference).toBeVisible();
  await dialog.locator(action("close-reservations")).click();
  await expect(dialog).not.toBeVisible();
}

async function exerciseTaskDialog(page: Page): Promise<void> {
  const surfaceOwner = page.locator(surface("day-tasks"));
  await surfaceOwner.locator(action("open-tasks")).click();
  const dialog = page.locator('[data-contract-dialog="tasks"]');
  await expect(dialog).toBeVisible();
  const task = dialog.locator(owner("task")).first();
  const wasChecked = await task.isChecked();
  await task.click();
  if (wasChecked) await expect(task).not.toBeChecked();
  else await expect(task).toBeChecked();
  await dialog.locator(action("close-tasks")).click();
  await expect(dialog).not.toBeVisible();
}

async function exerciseSheetSnaps(page: Page): Promise<void> {
  const sheetSnapStressCycles = 5;
  const sheet = page.locator(surface("itinerary-sheet"));
  for (let cycle = 0; cycle < sheetSnapStressCycles; cycle += 1) {
    for (const snap of ["collapsed", "half", "expanded"] as const) {
      await page.locator(`[data-snap-target="${snap}"]`).click();
      await expect(sheet).toHaveAttribute("data-snap", snap);
    }
  }
}

export async function runPresentationContract(page: Page): Promise<void> {
  await openFirstDay(page);
  await retryUnavailableRoute(page);
  await switchDays(page);
  await exerciseListMapFocus(page);
  await exerciseCandidateDecision(page);
  await exerciseLocation(page);
  await exerciseReservationDialog(page);
  await exerciseTaskDialog(page);
  await exerciseSheetSnaps(page);
  await page.locator(action("return-home")).click();
  await expect(page.locator(surface("home"))).toBeVisible();
}
