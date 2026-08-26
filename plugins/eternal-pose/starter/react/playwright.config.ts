import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  projects: [
    {
      name: "mobile-320x568",
      use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 568 } },
    },
    {
      name: "mobile-390x844",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "mobile-430x932",
      use: { ...devices["Desktop Chrome"], viewport: { width: 430, height: 932 } },
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
