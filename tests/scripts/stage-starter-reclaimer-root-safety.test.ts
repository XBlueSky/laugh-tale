import type * as FsPromises from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const repositoryTmpRoot = resolve(repoRoot, "tmp");
const scriptUrl = pathToFileURL(
  resolve(repoRoot, "scripts/stage-starter-consumer.mjs"),
).href;

afterEach(() => {
  vi.doUnmock("node:fs/promises");
  vi.resetModules();
});

describe("staging artifact reclaimer root safety", () => {
  test("rejects a symlinked repository tmp root before scanning or removing entries", async () => {
    let rootWasScanned = false;
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof FsPromises>();
      return {
        ...actual,
        lstat: async (...arguments_: Parameters<typeof actual.lstat>) => {
          const stat = await actual.lstat(...arguments_);
          if (resolve(String(arguments_[0])) !== repositoryTmpRoot) return stat;
          return {
            isDirectory: () => stat.isDirectory(),
            isSymbolicLink: () => true,
          };
        },
        readdir: async (...arguments_: Parameters<typeof actual.readdir>) => {
          if (resolve(String(arguments_[0])) === repositoryTmpRoot) {
            rootWasScanned = true;
            throw new Error("unsafe tmp root was scanned");
          }
          const result: unknown = await actual.readdir(...arguments_);
          return result;
        },
      };
    });

    const { reclaimOrphanedStagingArtifacts } = (await import(
      `${scriptUrl}?root-safety=${Date.now()}`
    )) as {
      reclaimOrphanedStagingArtifacts: () => Promise<unknown>;
    };

    await expect(reclaimOrphanedStagingArtifacts()).rejects.toThrow(
      /tmp root.*real directory/i,
    );
    expect(rootWasScanned).toBe(false);
  });
});
