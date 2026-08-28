import { expect, test as base } from "@playwright/test";

import {
  installContractGeolocation,
  runPresentationContract,
} from "./contract-driver";

const test = base.extend<{ externalRequests: string[] }>({
  externalRequests: async ({ page }, provide) => {
    const requests: string[] = [];
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (
        ["http:", "https:"].includes(url.protocol) &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
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
  await installContractGeolocation(page);
});

test.afterEach(({ externalRequests }) => {
  expect(externalRequests).toEqual([]);
});

test("shared presentation contract", async ({ page }, testInfo) => {
  testInfo.annotations.push({
    type: "recipe",
    description: String(testInfo.config.metadata.recipeUnderTest),
  });
  await runPresentationContract(page);
});
