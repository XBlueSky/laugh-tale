import { defineConfig, devices } from "@playwright/test";

const recipeUnderTest = process.env.ETERNAL_POSE_RECIPE_UNDER_TEST?.trim() || undefined;
const e2eBrowser = process.env.ETERNAL_POSE_E2E_BROWSER?.trim() || "chromium";
if (!["chromium", "webkit"].includes(e2eBrowser)) throw new Error("ETERNAL_POSE_E2E_BROWSER must be chromium or webkit");
const desktopProfile = devices[e2eBrowser === "webkit" ? "Desktop Safari" : "Desktop Chrome"];

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: recipeUnderTest ? [] : ["**/presentation-contract.spec.ts"],
  metadata: { ...(recipeUnderTest ? { recipeUnderTest } : {}), e2eBrowser },
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  projects: [
    {
      name: "mobile-320x568",
      use: { ...desktopProfile, viewport: { width: 320, height: 568 } },
    },
    {
      name: "mobile-390x844",
      use: { ...desktopProfile, viewport: { width: 390, height: 844 } },
    },
    {
      name: "mobile-430x932",
      use: { ...desktopProfile, viewport: { width: 430, height: 932 } },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    env: {
      ...process.env,
      VITE_E2E_FAKE_PROVIDER: "true",
      VITE_GOOGLE_MAPS_API_KEY: "",
      VITE_GOOGLE_ROUTES_ENABLED: "false",
      VITE_GOOGLE_TRANSIT_ENABLED: "false",
    },
    reuseExistingServer: false,
  },
});
