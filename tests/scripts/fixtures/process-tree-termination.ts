import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from "node:child_process";

interface TaskkillResult {
  error?: Error;
  status: number | null;
  stderr?: string;
}

interface ProcessTreeOperations {
  kill?: (pid: number, signal: NodeJS.Signals) => void;
  platform?: NodeJS.Platform;
  taskkillTimeoutMs?: number;
  runTaskkill?: (
    command: string,
    arguments_: string[],
    options: SpawnSyncOptionsWithStringEncoding,
  ) => TaskkillResult;
}

function defaultTaskkill(
  command: string,
  arguments_: string[],
  options: SpawnSyncOptionsWithStringEncoding,
): TaskkillResult {
  return spawnSync(command, arguments_, options);
}

export function signalProcessTree(
  pid: number,
  signal: NodeJS.Signals,
  {
    kill = process.kill.bind(process),
    platform = process.platform,
    runTaskkill = defaultTaskkill,
    taskkillTimeoutMs = 1_000,
  }: ProcessTreeOperations = {},
): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error("process-tree termination requires a valid positive integer pid");
  }
  if (platform === "win32") {
    if (!Number.isSafeInteger(taskkillTimeoutMs) || taskkillTimeoutMs <= 0) {
      throw new Error("process-tree termination requires a valid positive taskkill timeout");
    }
    const arguments_ = ["/PID", String(pid), "/T"];
    if (signal === "SIGKILL") arguments_.push("/F");
    const result = runTaskkill("taskkill.exe", arguments_, {
      encoding: "utf8",
      killSignal: "SIGKILL",
      shell: false,
      timeout: taskkillTimeoutMs,
      windowsHide: true,
    });
    if (result.error !== undefined) {
      const code = (result.error as NodeJS.ErrnoException).code;
      const stderr = String(result.stderr ?? "").trim();
      throw new Error(
        `taskkill failed (${code === undefined ? "error" : code}: ${result.error.message})${stderr === "" ? "" : `: ${stderr}`}`,
        { cause: result.error },
      );
    }
    if (result.status !== 0) {
      throw new Error(
        `taskkill failed (${String(result.status)}): ${String(result.stderr ?? "").trim()}`,
      );
    }
    return;
  }

  try {
    kill(-pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}
