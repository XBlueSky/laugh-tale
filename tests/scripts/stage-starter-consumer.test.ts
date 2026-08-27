import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const script = join(repoRoot, "scripts/stage-starter-consumer.mjs");
const coreVersion = (
  JSON.parse(readFileSync(join(repoRoot, "packages/core/package.json"), "utf8")) as {
    version: string;
  }
).version;
const { stageStarterConsumer } = (await import(pathToFileURL(script).href)) as {
  stageStarterConsumer: (options?: {
    install?: boolean;
    outDir?: string;
  }) => Promise<{ stagedRoot: string; tarballs: string[] }>;
};

describe("stage-starter-consumer", () => {
  test("stages the starter with tarball-file dependencies and no node_modules copy", async () => {
    const outDir = join(repoRoot, "tmp/staged-starter-test");
    const { stagedRoot, tarballs } = await stageStarterConsumer({ install: false, outDir });

    expect(stagedRoot).toBe(outDir);
    expect(tarballs.length).toBeGreaterThanOrEqual(1);
    for (const tarball of tarballs) expect(existsSync(tarball)).toBe(true);

    const manifest = JSON.parse(readFileSync(join(stagedRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    const escapedVersion = coreVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(manifest.dependencies["@laugh-tale-island/core"]).toMatch(
      new RegExp(`^file:.*laugh-tale-island-core-${escapedVersion}\\.tgz$`),
    );
    expect(existsSync(join(stagedRoot, "src/App.tsx"))).toBe(true);
    expect(existsSync(join(stagedRoot, "package-lock.json"))).toBe(false);
    expect(existsSync(join(stagedRoot, "node_modules"))).toBe(false);
    expect(existsSync(join(stagedRoot, "dist"))).toBe(false);

    rmSync(outDir, { recursive: true, force: true });
  }, 120_000);
});
