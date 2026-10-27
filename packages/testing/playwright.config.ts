import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
// Playwright sets FORCE_COLOR for its children. Avoid conflicting inherited
// NO_COLOR only in this task-owned runner/server process tree.
delete process.env.NO_COLOR;
if (process.env.CI && process.env.OAK_CAPTURE_CANDIDATES === "1") throw new Error("Candidate capture is not a CI regression gate; reviewed goldens are required");
export default defineConfig({
  testDir: `${root}/tests`,
  testMatch: ["visual/oak-washi.visual.spec.ts", "accessibility/oak-washi-a11y.spec.ts", "accessibility/oak-washi-style-contract.spec.ts", "accessibility/oak-washi-layout-rhythm.spec.ts", "accessibility/oak-washi-inline-controls.spec.ts", "accessibility/oak-washi-home-composition.spec.ts", "accessibility/oak-washi-candidate-hierarchy.spec.ts", "accessibility/oak-washi-shopping-hierarchy.spec.ts", "accessibility/oak-washi-details-hierarchy.spec.ts", "accessibility/oak-washi-typography.spec.ts", "accessibility/oak-washi-motion.spec.ts", "accessibility/oak-washi-resource-delivery.spec.ts", "accessibility/oak-washi-measurement.spec.ts"],
  // Resource delivery is a product regression gate, not a visual-capture side effect.
  fullyParallel: false, workers: 1, retries: 0, forbidOnly: !!process.env.CI,
  reporter: [["list"], [`${root}/tests/fixtures/oak-washi/browser/checks.ts`]],
  updateSnapshots: "none",
  timeout: 30_000,
  outputDir: `${root}/tmp/playwright/oak-washi/results`,
  snapshotPathTemplate: `${root}/docs/theme-reviews/oak-washi/goldens/{arg}{ext}`,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled", scale: "css" } },
  use: { baseURL: "http://127.0.0.1:4176", browserName: "chromium", deviceScaleFactor: 1, contextOptions: { reducedMotion: "reduce" }, locale: "en-US", timezoneId: "UTC", colorScheme: "light", serviceWorkers: "block", trace: "retain-on-failure" },
  webServer: { command: "npx vite --config tests/fixtures/oak-washi/browser/vite.config.ts", cwd: root, url: "http://127.0.0.1:4176", reuseExistingServer: false },
});
