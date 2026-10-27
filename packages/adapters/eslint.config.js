import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**"] },
  eslint.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      // Promise-returning test doubles intentionally have no asynchronous work.
      "@typescript-eslint/require-await": "off",
      // Adversarial runtime tests deliberately cast malformed and readonly values.
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
    },
  },
);
