import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  root, plugins: [react(), { name: "oak-bundle-cost", generateBundle(_options, bundle) {
    const chunks = Object.values(bundle).filter(item => item.type === "chunk").map(chunk => ({ file: chunk.fileName, bytes: Buffer.byteLength(chunk.code), gzipBytes: gzipSync(chunk.code).byteLength, modules: Object.entries(chunk.modules).filter(([name]) => /lucide-react|react-dom.*server|create-oak-washi.*content/.test(name)).map(([name, module]) => ({ module: name.replace(fileURLToPath(new URL("../../../..", import.meta.url)), ""), renderedBytesBeforeMinification: module.renderedLength })) }));
    this.emitFile({ type: "asset", fileName: "bundle-cost.json", source: JSON.stringify({ note: "Actual final JavaScript byte/gzip sizes; module attribution is rendered bytes before chunk minification, not a causal incremental-size claim.", chunks }, null, 2) });
  } }], cacheDir: "../../../../tmp/playwright/oak-washi/vite-cache",
  server: { host: "127.0.0.1", port: 4176, strictPort: true, fs: { allow: [fileURLToPath(new URL("../../../..", import.meta.url))] }, hmr: false },
  build: { outDir: "../../../../tmp/playwright/oak-washi/bundle", emptyOutDir: false },
});
