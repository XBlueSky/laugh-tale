import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const nodeGlobals = {
  console: "readonly",
  process: "readonly",
  URL: "readonly",
};

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "tmp/**",
      "packages/*/dist/**",
      "packages/*/node_modules/**",
      ".cc-marketspec/dist/**",
      "plugins/eternal-pose/vendor/**",
      // The site is an Astro project; its build and cache output are bundles.
      "site/dist/**",
      "site/.astro/**",
      "site/node_modules/**",
      // The starter is an independent project with its own eslint setup;
      // its lint runs inside the staged starter check. ESLint 10 resolves the
      // nearest config per file, so linting it from here would load the
      // starter's own toolchain.
      "plugins/eternal-pose/starter/react/**",
    ],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: { globals: nodeGlobals },
  },
  {
    files: ["tests/**/*.ts", "vitest.config.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: nodeGlobals,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
