import { describe, expect, test, vi } from "vitest";

import { signalProcessTree } from "./fixtures/process-tree-termination.js";

describe("staging child process-tree termination", () => {
  test("uses bounded Windows tree termination without shell interpolation", () => {
    const runTaskkill = vi.fn(() => ({ status: 0, stderr: "" }));

    signalProcessTree(12_345, "SIGTERM", { platform: "win32", runTaskkill });
    signalProcessTree(12_345, "SIGKILL", { platform: "win32", runTaskkill });

    expect(runTaskkill.mock.calls).toEqual([
      [
        "taskkill.exe",
        ["/PID", "12345", "/T"],
        { encoding: "utf8", shell: false, windowsHide: true },
      ],
      [
        "taskkill.exe",
        ["/PID", "12345", "/T", "/F"],
        { encoding: "utf8", shell: false, windowsHide: true },
      ],
    ]);
  });

  test("signals the entire POSIX process group and rejects invalid process ids", () => {
    const kill = vi.fn();

    signalProcessTree(12_345, "SIGTERM", { platform: "darwin", kill });

    expect(kill).toHaveBeenCalledWith(-12_345, "SIGTERM");
    expect(() =>
      signalProcessTree(Number.NaN, "SIGKILL", { platform: "darwin", kill }),
    ).toThrow(/valid positive integer/i);
  });

  test("surfaces arbitrary taskkill failures with diagnostics", () => {
    expect(() =>
      signalProcessTree(12_345, "SIGKILL", {
        platform: "win32",
        runTaskkill: () => ({ status: 5, stderr: "access denied" }),
      }),
    ).toThrow(/taskkill.*5.*access denied/i);
  });
});
