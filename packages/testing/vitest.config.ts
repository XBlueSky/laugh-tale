import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@laugh-tale-island\/core\/browser$/, replacement: new URL("../core/src/browser/index.ts", import.meta.url).pathname },
      { find: /^@laugh-tale-island\/core\/enrichment$/, replacement: new URL("../core/src/enrichment/index.ts", import.meta.url).pathname },
      { find: /^@laugh-tale-island\/core$/, replacement: new URL("../core/src/index.ts", import.meta.url).pathname },
      { find: /^@laugh-tale-island\/react$/, replacement: new URL("../react/src/index.ts", import.meta.url).pathname },
      { find: /^@laugh-tale-island\/adapters\/google\/node$/, replacement: new URL("../adapters/src/google/node/index.ts", import.meta.url).pathname },
      { find: /^@laugh-tale-island\/adapters\/google$/, replacement: new URL("../adapters/src/google/index.ts", import.meta.url).pathname },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
