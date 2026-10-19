import { defineConfig } from "vitest/config";

// These suites run `npm run build` / `npm pack` inside the real
// packages/* directories, so they must never overlap with each other or
// with tests that import the workspace packages from those dist folders.
const PACKAGE_BUILDING_TESTS = [
  "tests/packages/artifacts.test.ts",
  "tests/packages/clean-consumer.test.ts",
  "tests/scripts/stage-starter-consumer-concurrency.test.ts",
  "tests/scripts/stage-starter-consumer.test.ts",
];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          // Source-snapshot/installed-boundary suites contend on filesystem and
          // scanner work: two workers still timed out in the focused gate.
          // Trade file parallelism for reliability; in-test races are unchanged.
          maxWorkers: 1,
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: PACKAGE_BUILDING_TESTS,
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: "package-builders",
          environment: "node",
          include: PACKAGE_BUILDING_TESTS,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
