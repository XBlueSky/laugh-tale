import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from "node:child_process";

interface TaskkillResult {
  error?: Error;
  status: number | null;
  stderr?: string;
}

interface ProcessTreeOperations {
  kill?: (pid: number, signal: NodeJS.Signals) => void;
  platform?: NodeJS.Platform;
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
  }: ProcessTreeOperations = {},
): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error("process-tree termination requires a valid positive integer pid");
  }

  if (platform === "win32") {
    const arguments_ = ["/PID", String(pid), "/T"];
    if (signal === "SIGKILL") arguments_.push("/F");
    const result = runTaskkill("taskkill.exe", arguments_, {
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    if (result.error !== undefined) throw result.error;
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
