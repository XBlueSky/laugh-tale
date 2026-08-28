import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const childScript = join(
  repoRoot,
  "tests/scripts/fixtures/stage-starter-consumer-child.mjs",
);
const ownedPaths: string[] = [];

interface ChildResult {
  stagedRoot: string;
  tarballs: string[];
  check: "passed";
}

function runStageChild(outDir: string): Promise<ChildResult> {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [childScript, outDir], {
      cwd: repoRoot,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectChild);
    child.on("close", (status) => {
      if (status !== 0) {
        rejectChild(new Error(`staging child failed (${status}):\n${stdout}\n${stderr}`));
        return;
      }
      const resultLine = stdout
        .split("\n")
        .find((line) => line.startsWith("STAGE_CHILD_RESULT:"));
      if (resultLine === undefined) {
        rejectChild(new Error(`staging child returned no result:\n${stdout}\n${stderr}`));
        return;
      }
      resolveChild(JSON.parse(resultLine.slice("STAGE_CHILD_RESULT:".length)) as ChildResult);
    });
  });
}

function tarEntries(tarball: string): Map<string, Buffer> {
  const archive = gunzipSync(readFileSync(tarball));
  const entries = new Map<string, Buffer>();
  for (let offset = 0; offset + 512 <= archive.length; ) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    const sizeText = header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim();
    const size = Number.parseInt(sizeText || "0", 8);
    const entryName = prefix === "" ? name : `${prefix}/${name}`;
    const contentOffset = offset + 512;
    entries.set(entryName, archive.subarray(contentOffset, contentOffset + size));
    offset = contentOffset + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function declaredDistExports(manifest: unknown): string[] {
  const paths: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      if (value.startsWith("./dist/")) paths.push(`package/${value.slice(2)}`);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) visit(child);
    }
  };
  visit((manifest as { exports?: unknown }).exports);
  return paths;
}

afterEach(() => {
  for (const path of ownedPaths.splice(0).reverse()) {
    rmSync(path, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});

describe("stage-starter-consumer cross-process packaging", () => {
  test("installs and checks two consumers while retaining distinct complete tarballs", async () => {
    const suffix = `${process.pid}-${Date.now()}`;
    const runRoot = join(repoRoot, "tmp", "staged-concurrent", suffix);
    const firstOutDir = join(repoRoot, "tmp", `staged-concurrent-a-${suffix}`);
    const secondOutDir = join(runRoot, "nested", "consumer-b");
    ownedPaths.push(firstOutDir, runRoot);

    const settled = await Promise.allSettled([
      runStageChild(firstOutDir),
      runStageChild(secondOutDir),
    ]);
    const failures = settled.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failures.length > 0) {
      const reasons: unknown[] = [];
      for (const failure of failures) reasons.push(failure.reason as unknown);
      throw new AggregateError(
        reasons,
        "one or more staging children failed",
      );
    }
    const [first, second] = settled.map(
      (result) => (result as PromiseFulfilledResult<ChildResult>).value,
    );
    expect(first.check).toBe("passed");
    expect(second.check).toBe("passed");
    expect(first.stagedRoot).toBe(firstOutDir);
    expect(second.stagedRoot).toBe(secondOutDir);

    const firstPackRoot = dirname(first.tarballs[0]);
    const secondPackRoot = dirname(second.tarballs[0]);
    ownedPaths.push(firstPackRoot, secondPackRoot);
    expect(firstPackRoot).not.toBe(secondPackRoot);

    for (const tarball of [...first.tarballs, ...second.tarballs]) {
      expect(existsSync(tarball)).toBe(true);
      const entries = tarEntries(tarball);
      const manifestEntry = entries.get("package/package.json");
      expect(manifestEntry, `${tarball} package.json`).toBeDefined();
      const manifest = JSON.parse(manifestEntry!.toString("utf8")) as unknown;
      const exports = declaredDistExports(manifest);
      expect(exports.length, `${tarball} declared dist exports`).toBeGreaterThan(0);
      for (const exportedPath of exports) {
        expect(entries.has(exportedPath), `${tarball} missing ${exportedPath}`).toBe(true);
      }
    }
  }, 240_000);
});
