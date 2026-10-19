import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, test } from "vitest";

import { signalProcessTree } from "./fixtures/process-tree-termination.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const childScript = join(
  repoRoot,
  "tests/scripts/fixtures/stage-starter-consumer-child.mjs",
);
const ownedPaths: string[] = [];
const activeChildren = new Set<ChildProcess>();
const activeGrandchildren = new Set<number>();
const { reclaimOrphanedStagingArtifacts } = (await import(
  pathToFileURL(join(repoRoot, "scripts/stage-starter-consumer.mjs")).href
)) as {
  reclaimOrphanedStagingArtifacts: (operations?: {
    artifactGraceMs?: number;
  }) => Promise<unknown>;
};

test("a paused project file-set writer cannot publish a mixed Create snapshot", async () => {
  const { stageStarterConsumer } = await import(pathToFileURL(join(repoRoot, "scripts/stage-starter-consumer.mjs")).href) as {
    stageStarterConsumer: (request: { outDir: string; setupLocale: string; install: boolean }, operations: { beforeCandidateRename: (context: { candidate: string }) => Promise<void> }) => Promise<unknown>;
  };
  const { replaceProjectFiles } = await import(pathToFileURL(join(repoRoot, "plugins/eternal-pose/lib/atomic-publication.mjs")).href) as {
    replaceProjectFiles: (request: { projectDir: string; replacements: Map<string, Buffer>; allowedPaths: Set<string>; validate: () => Promise<void> }, operations: { beforeMutation: (context: { phase: string }) => Promise<void> }) => Promise<void>;
  };
  const outDir = join(repoRoot, "tmp/staged-oak-paused-writer");
  ownedPaths.push(outDir);
  let resume!: () => void;
  const held = new Promise<void>(resolve => { resume = resolve; });
  let writer: Promise<unknown> | undefined;
  let candidatePath = "";
  try {
    await expect(stageStarterConsumer({ outDir, setupLocale: "zh-Hant-TW", install: false }, {
      async beforeCandidateRename({ candidate }: { candidate: string }) {
        candidatePath = candidate;
        ownedPaths.push(dirname(candidate));
        let notify!: () => void;
        const paused = new Promise<void>(resolve => { notify = resolve; });
        const names = ["eternal-pose.json", "src/trip-content/place-resolutions.json"];
        writer = replaceProjectFiles({ projectDir: candidate, replacements: new Map(names.map(name => [name, readFileSync(join(candidate, name))])), allowedPaths: new Set(names), validate: async () => {} }, {
          async beforeMutation({ phase }: { phase: string }) { if (phase === "file-set-validate") { notify(); await held; } },
        });
        await paused;
      },
    })).rejects.toThrow(/transaction in progress/);
    expect(existsSync(outDir)).toBe(false);
    expect(existsSync(join(candidatePath, "eternal-pose.json"))).toBe(true);
  } finally {
    resume();
    await writer;
  }
}, 120_000);

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
  applicationCheck: "skipped";
  commandEvents: CommandEvent[];
}

interface ChildOptions {
  env?: NodeJS.ProcessEnv;
  killGraceMs?: number;
  timeoutMs?: number;
}

function signalChild(
  child: ChildProcess,
  signal: NodeJS.Signals,
  { includeExitedRoot = false }: { includeExitedRoot?: boolean } = {},
): void {
  if (!includeExitedRoot && (child.exitCode !== null || child.signalCode !== null)) return;
  if (child.pid === undefined) throw new Error("cannot terminate a child without a pid");
  signalProcessTree(child.pid, signal);
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
    const terminationErrors: string[] = [];
    let killTimer: NodeJS.Timeout | undefined;
    let hardSettleTimer: NodeJS.Timeout | undefined;
    const diagnostic = (message: string): Error =>
      new Error(
        `${message}:\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}${
          terminationErrors.length === 0
            ? ""
            : `\n--- termination errors ---\n${terminationErrors.join("\n")}`
        }`,
      );
    const settle = (operation: () => void): void => {
      if (promiseSettled) return;
      promiseSettled = true;
      operation();
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        signalChild(child, "SIGTERM");
      } catch (error) {
        terminationErrors.push(error instanceof Error ? error.message : String(error));
      }
      killTimer = setTimeout(() => {
        try {
          signalChild(child, "SIGKILL", { includeExitedRoot: true });
        } catch (error) {
          terminationErrors.push(error instanceof Error ? error.message : String(error));
        }
      }, killGraceMs);
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
      for (const match of stdout.matchAll(/STAGE_CHILD_GRANDCHILD_PID:(\d+)/g)) {
        activeGrandchildren.add(Number(match[1]));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      activeChildren.delete(child);
      clearTimeout(timeout);
      if (killTimer !== undefined) clearTimeout(killTimer);
      if (hardSettleTimer !== undefined) clearTimeout(hardSettleTimer);
      settle(() => rejectChild(diagnostic(`staging child process error: ${error.message}`)));
    });
    child.on("close", (status) => {
      activeChildren.delete(child);
      clearTimeout(timeout);
      if (timedOut) {
        return;
      }
      if (killTimer !== undefined) clearTimeout(killTimer);
      if (hardSettleTimer !== undefined) clearTimeout(hardSettleTimer);
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

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function waitForProcessExit(pid: number, timeoutMs = 1_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (!processIsAlive(pid)) return true;
    await wait(20);
  }
  return !processIsAlive(pid);
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
  for (const pid of activeGrandchildren) {
    if (processIsAlive(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
      await waitForProcessExit(pid);
    }
  }
  activeGrandchildren.clear();
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
  test("installs two consumers with globally serialized package commands and distinct complete tarballs", async () => {
    const suffix = `${process.pid}-${Date.now()}`;
    const runRoot = join(repoRoot, "tmp", "staged-concurrent", suffix);
    const firstOutDir = join(repoRoot, "tmp", `staged-concurrent-a-${suffix}`);
    const secondOutDir = join(runRoot, "nested", "consumer-b");
    ownedPaths.push(firstOutDir, runRoot);

    const settled = await Promise.allSettled([
      runStageChild(firstOutDir, { env: { STAGE_CHILD_SKIP_APP_CHECK: "1" } }),
      runStageChild(secondOutDir, { env: { STAGE_CHILD_SKIP_APP_CHECK: "1" } }),
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
    expect(first.applicationCheck).toBe("skipped");
    expect(second.applicationCheck).toBe("skipped");
    expect(first).not.toHaveProperty("check");
    expect(second).not.toHaveProperty("check");
    expect(first.stagedRoot).toBe(firstOutDir);
    expect(second.stagedRoot).toBe(secondOutDir);

    const sharedWorkspaceCommand = (event: CommandEvent): boolean =>
      event.command === "npm" &&
      ((event.commandArguments.length === 3 &&
        event.commandArguments[0] === "run" &&
        event.commandArguments[1] === "build" &&
        event.commandArguments[2] === "--ignore-scripts") ||
        event.commandArguments[0] === "pack");
    const installCommand = (event: CommandEvent): boolean =>
      event.command === "npm" && event.commandArguments[0] === "install";
    const firstShared = commandIntervals(first, sharedWorkspaceCommand);
    const secondShared = commandIntervals(second, sharedWorkspaceCommand);
    const firstInstall = commandIntervals(first, installCommand);
    const secondInstall = commandIntervals(second, installCommand);
    expect(firstShared).toHaveLength(8);
    expect(secondShared).toHaveLength(8);
    expect(first.commandEvents.filter(sharedWorkspaceCommand)).toHaveLength(16);
    expect(second.commandEvents.filter(sharedWorkspaceCommand)).toHaveLength(16);
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
    expect(first.tarballs).toHaveLength(4);
    expect(second.tarballs).toHaveLength(4);
    expect(new Set([...first.tarballs, ...second.tarballs]).size).toBe(8);
    const expectedBasenames = ["core", "react", "adapters", "testing"].map(
      (name) => `laugh-tale-island-${name}-2.0.0.tgz`,
    );
    expect(first.tarballs.map((tarball) => tarball.split("/").at(-1))).toEqual(
      expectedBasenames,
    );
    expect(second.tarballs.map((tarball) => tarball.split("/").at(-1))).toEqual(
      expectedBasenames,
    );

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

    let failure: unknown;
    try {
      await timeout;
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    const diagnostic = (failure as Error).message;
    expect(diagnostic).toMatch(
      /timed out after 1000ms[\s\S]*STAGE_CHILD_HANG_STDOUT[\s\S]*STAGE_CHILD_HANG_STDERR/,
    );
    expect(diagnostic).toContain("STAGE_CHILD_GRANDCHILD_STDOUT");
    expect(diagnostic).toContain("STAGE_CHILD_GRANDCHILD_STDERR");
    if (process.platform !== "win32") {
      expect(diagnostic).toContain("STAGE_CHILD_GRANDCHILD_IGNORED_TERM");
    }
    const grandchildPid = Number(
      /STAGE_CHILD_GRANDCHILD_PID:(\d+)/.exec(diagnostic)?.[1],
    );
    expect(Number.isSafeInteger(grandchildPid)).toBe(true);
    try {
      expect(await waitForProcessExit(grandchildPid, 250)).toBe(true);
      activeGrandchildren.delete(grandchildPid);
      expect(activeChildren.size).toBe(0);
    } finally {
      if (processIsAlive(grandchildPid)) process.kill(grandchildPid, "SIGKILL");
      await waitForProcessExit(grandchildPid);
      activeGrandchildren.delete(grandchildPid);
    }
  }, 3_000);
});
