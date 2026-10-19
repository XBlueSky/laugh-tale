import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@laugh-tale-island/adapters/google/node": new URL("./src/google/node/index.ts", import.meta.url).pathname } },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
