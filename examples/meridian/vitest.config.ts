import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  ...(process.env.ETERNAL_POSE_VALIDATION_CACHE_DIR === undefined ? {} : { cacheDir: process.env.ETERNAL_POSE_VALIDATION_CACHE_DIR }),
  ...(process.env.ETERNAL_POSE_VALIDATION_ENV_DIR === undefined ? {} : { envDir: process.env.ETERNAL_POSE_VALIDATION_ENV_DIR }),
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    server: { deps: { inline: ["@laugh-tale-island/react", "@laugh-tale-island/testing"] } },
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
    restoreMocks: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
