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
      ".cc-marketspec/dist/**",
      "plugins/eternal-pose/vendor/**",
      "plugins/eternal-pose/starter/react/node_modules/**",
      "plugins/eternal-pose/starter/react/dist/**",
      "plugins/eternal-pose/starter/react/test-results/**",
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
