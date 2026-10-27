import { expect, test } from "@playwright/test";

const DAY_ENTER = /(?:Enter|進入) Day 1 · 8月20日/;
const NODE_COUNTS = [3, 23, 14, 29, 29, 2];

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (local || ["data:", "blob:", "about:"].includes(url.protocol)) {
      await route.continue();
      return;
    }
    await route.abort("blockedbyclient");
    throw new Error(`external request attempted: ${url.href}`);
  });
});

test("keeps the six-day Tokyo order without claiming a live time", async ({ page }) => {
  await page.goto("/?fixture=tokyo");
  await expect(page.getByTestId("trip-home")).toBeVisible();
  await expect(page.getByRole("heading", { name: "26東京偷尼生日" })).toBeVisible();

  await page.getByRole("button", { name: DAY_ENTER }).click();
  await expect(page.getByTestId("trip-experience")).toBeVisible();
  await expect(page.getByTestId("itinerary-map")).toHaveAttribute("data-e2e-map-surface", "true");

  // Node titles also appear inside route connectors ("→ destination"), so match the first occurrence.
  const itinerary = page.getByRole("region", { name: "Itinerary" });
  await expect(itinerary.getByText("成田國際機場第二航廈", { exact: true }).first()).toBeVisible();
  await expect(itinerary.getByText("海鮮居酒屋・墨之榮", { exact: true }).first()).toBeVisible();
  await expect(itinerary.getByRole("button", { name: /(?:Time not set|時間未定)/ })).toHaveCount(NODE_COUNTS[0]);
});

// baseline: row A7 / C1 — the quiet-wood presentation renders "Return to the current
// itinerary item" unconditionally (DayHeader and the sheet toolbar) even when the trip
// has no schedule at all, so the UI claims a current item exists. Recorded, not fixed.
test.fail("does not offer a return-to-current control when no node has a time", async ({ page }) => {
  await page.goto("/?fixture=tokyo");
  await page.getByRole("button", { name: DAY_ENTER }).click();
  await expect(page.getByTestId("trip-experience")).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to the current itinerary item" })).toHaveCount(0);
});

test("switches days and keeps exact per-day counts", async ({ page }) => {
  await page.goto("/?fixture=tokyo");
  await page.getByRole("button", { name: DAY_ENTER }).click();
  await expect(page.getByTestId("trip-experience")).toBeVisible();
  const itinerary = page.getByRole("region", { name: "Itinerary" });
  const dayTitles = ["8月21日", "8月22日", "8月23日", "8月24日", "8月25日"];
  for (const [offset, title] of dayTitles.entries()) {
    await page.getByRole("button", { name: new RegExp(`Day ${offset + 2}: ${title}`) }).click();
    await expect(itinerary.getByRole("button", { name: /(?:Time not set|時間未定)/ })).toHaveCount(
      NODE_COUNTS[offset + 1],
    );
  }
  await expect(itinerary.getByText("成田機場第二航廈", { exact: true }).first()).toBeVisible();
});

test("focuses a resolved place from the list on the persistent map", async ({ page }) => {
  await page.goto("/?fixture=tokyo");
  await page.getByRole("button", { name: DAY_ENTER }).click();
  await expect(page.getByTestId("trip-experience")).toBeVisible();
  const itinerary = page.getByRole("region", { name: "Itinerary" });
  await itinerary.getByRole("button", { name: /(?:Time not set|時間未定)/ }).first().click();
  await expect(page.getByTestId("itinerary-map")).toHaveAttribute("data-e2e-focus-kind", "place");
});
