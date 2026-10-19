import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/maplibre-e2e", workers: 1, timeout: 45_000,
  use: { browserName: "chromium", contextOptions: { reducedMotion: "reduce" }, screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [
    { name: "320", use: { viewport: { width: 320, height: 568 } } },
    { name: "390", use: { viewport: { width: 390, height: 844 } } },
    { name: "430", use: { viewport: { width: 430, height: 932 } } },
    { name: "1440", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "landscape", use: { viewport: { width: 844, height: 390 } } },
  ],
});
