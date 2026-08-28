import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const childScript = join(
  repoRoot,
  "tests/scripts/fixtures/stage-starter-consumer-child.mjs",
);
const ownedPaths: string[] = [];
const activeChildren = new Set<ChildProcess>();
const { reclaimOrphanedStagingArtifacts } = (await import(
  pathToFileURL(join(repoRoot, "scripts/stage-starter-consumer.mjs")).href
)) as {
  reclaimOrphanedStagingArtifacts: (operations?: {
    artifactGraceMs?: number;
  }) => Promise<unknown>;
};

interface CommandEvent {
  at: number;
  command: string;
  commandArguments: string[];
  cwd: string;
  phase: "start" | "complete";
}

interface ChildResult {
  stagedRoot: string;
  tarballs: string[];
  check: "passed";
  commandEvents: CommandEvent[];
}

interface ChildOptions {
  env?: NodeJS.ProcessEnv;
  killGraceMs?: number;
  timeoutMs?: number;
}

function signalChild(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform !== "win32" && child.pid !== undefined) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

function waitForChildClose(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolveWait) => {
    const timer = setTimeout(() => {
      child.off("close", onClose);
      resolveWait(false);
    }, timeoutMs);
    const onClose = (): void => {
      clearTimeout(timer);
      resolveWait(true);
    };
    child.once("close", onClose);
  });
}

async function terminateChild(child: ChildProcess, killGraceMs = 1_000): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  signalChild(child, "SIGTERM");
  if (await waitForChildClose(child, killGraceMs)) return;
  signalChild(child, "SIGKILL");
  if (!(await waitForChildClose(child, killGraceMs))) {
    throw new Error(`child process ${child.pid ?? "unknown"} did not exit after SIGKILL`);
  }
}

function runStageChild(outDir: string, options: ChildOptions = {}): Promise<ChildResult> {
  return new Promise((resolveChild, rejectChild) => {
    const timeoutMs = options.timeoutMs ?? 210_000;
    const killGraceMs = options.killGraceMs ?? 2_000;
    const child = spawn(process.execPath, [childScript, outDir], {
      cwd: repoRoot,
      detached: process.platform !== "win32",
      env: { ...process.env, ...options.env },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeChildren.add(child);
    let stdout = "";
    let stderr = "";
    let promiseSettled = false;
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;
    let hardSettleTimer: NodeJS.Timeout | undefined;
    const diagnostic = (message: string): Error =>
      new Error(`${message}:\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`);
    const settle = (operation: () => void): void => {
      if (promiseSettled) return;
      promiseSettled = true;
      operation();
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      signalChild(child, "SIGTERM");
      killTimer = setTimeout(() => signalChild(child, "SIGKILL"), killGraceMs);
      hardSettleTimer = setTimeout(
        () =>
          settle(() =>
            rejectChild(diagnostic(`staging child timed out after ${timeoutMs}ms`)),
          ),
        killGraceMs * 2,
      );
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      settle(() => rejectChild(diagnostic(`staging child process error: ${error.message}`)));
    });
    child.on("close", (status) => {
      activeChildren.delete(child);
      clearTimeout(timeout);
      if (killTimer !== undefined) clearTimeout(killTimer);
      if (hardSettleTimer !== undefined) clearTimeout(hardSettleTimer);
      if (timedOut) {
        settle(() => rejectChild(diagnostic(`staging child timed out after ${timeoutMs}ms`)));
        return;
      }
      if (status !== 0) {
        settle(() => rejectChild(diagnostic(`staging child failed (${status})`)));
        return;
      }
      const resultLine = stdout
        .split("\n")
        .find((line) => line.startsWith("STAGE_CHILD_RESULT:"));
      if (resultLine === undefined) {
        settle(() => rejectChild(diagnostic("staging child returned no result")));
        return;
      }
      try {
        const result = JSON.parse(
          resultLine.slice("STAGE_CHILD_RESULT:".length),
        ) as ChildResult;
        settle(() => resolveChild(result));
      } catch (error) {
        settle(() =>
          rejectChild(
            diagnostic(
              `staging child returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
            ),
          ),
        );
      }
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

afterEach(async () => {
  const terminated = await Promise.allSettled(
    [...activeChildren].map((child) => terminateChild(child)),
  );
  await reclaimOrphanedStagingArtifacts({ artifactGraceMs: 0 });
  for (const path of ownedPaths.splice(0).reverse()) {
    rmSync(path, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
  await reclaimOrphanedStagingArtifacts({ artifactGraceMs: 0 });
  const terminationErrors = terminated.flatMap((result) =>
    result.status === "rejected" ? [result.reason as unknown] : [],
  );
  if (terminationErrors.length > 0) {
    throw new AggregateError(terminationErrors, "one or more staging children survived cleanup");
  }
});

interface CommandInterval {
  end: number;
  start: number;
}

function commandIntervals(
  result: ChildResult,
  predicate: (event: CommandEvent) => boolean,
): CommandInterval[] {
  const starts = new Map<string, number[]>();
  const intervals: CommandInterval[] = [];
  for (const event of result.commandEvents) {
    if (!predicate(event)) continue;
    const key = `${event.cwd}\0${event.command}\0${event.commandArguments.join("\0")}`;
    if (event.phase === "start") {
      const queued = starts.get(key) ?? [];
      queued.push(event.at);
      starts.set(key, queued);
      continue;
    }
    const start = starts.get(key)?.shift();
    if (start !== undefined) intervals.push({ start, end: event.at });
  }
  return intervals;
}

function intervalsOverlap(left: CommandInterval, right: CommandInterval): boolean {
  return Math.max(left.start, right.start) < Math.min(left.end, right.end);
}

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

    const sharedWorkspaceCommand = (event: CommandEvent): boolean =>
      event.command === "npm" &&
      (event.commandArguments.join(" ") === "run build" ||
        event.commandArguments[0] === "pack");
    const installCommand = (event: CommandEvent): boolean =>
      event.command === "npm" && event.commandArguments[0] === "install";
    const firstShared = commandIntervals(first, sharedWorkspaceCommand);
    const secondShared = commandIntervals(second, sharedWorkspaceCommand);
    const firstInstall = commandIntervals(first, installCommand);
    const secondInstall = commandIntervals(second, installCommand);
    expect(firstShared).toHaveLength(4);
    expect(secondShared).toHaveLength(4);
    expect(firstInstall).toHaveLength(1);
    expect(secondInstall).toHaveLength(1);
    for (const left of firstShared) {
      for (const right of secondShared) expect(intervalsOverlap(left, right)).toBe(false);
    }
    expect(
      firstInstall.some((install) =>
        secondShared.some((packaging) => intervalsOverlap(install, packaging)),
      ) ||
        secondInstall.some((install) =>
          firstShared.some((packaging) => intervalsOverlap(install, packaging)),
        ),
    ).toBe(true);

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

  test("times out, terminates, settles, and reports both output streams", async () => {
    const timeout = runStageChild(join(repoRoot, "tmp", "unused-hanging-child"), {
      env: { STAGE_CHILD_TEST_MODE: "hang" },
      killGraceMs: 50,
      timeoutMs: 1_000,
    });

    await expect(timeout).rejects.toThrow(
      /timed out after 1000ms[\s\S]*STAGE_CHILD_HANG_STDOUT[\s\S]*STAGE_CHILD_HANG_STDERR/,
    );
    expect(activeChildren.size).toBe(0);
  }, 3_000);
});
