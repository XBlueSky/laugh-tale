import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const validationOutDir = process.env.ETERNAL_POSE_VALIDATION_OUT_DIR;
const validationCacheDir = process.env.ETERNAL_POSE_VALIDATION_CACHE_DIR;
const validationEnvDir = process.env.ETERNAL_POSE_VALIDATION_ENV_DIR;

export default defineConfig({
  plugins: [react()],
  ...(validationCacheDir === undefined ? {} : { cacheDir: validationCacheDir }),
  ...(validationEnvDir === undefined ? {} : { envDir: validationEnvDir }),
  build: {
    outDir: validationOutDir ?? "dist",
    emptyOutDir: true,
    rollupOptions: {
      preserveEntrySignatures: "strict",
      input: {
        app: resolve(import.meta.dirname, "index.html"),
        "validation/readiness": resolve(
          import.meta.dirname,
          "src/trip-content/validation-entry.ts",
        ),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "validation/readiness"
            ? "validation/readiness.mjs"
            : "assets/[name]-[hash].js",
      },
    },
  },
});
