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
        {
          encoding: "utf8",
          killSignal: "SIGKILL",
          shell: false,
          timeout: 1_000,
          windowsHide: true,
        },
      ],
      [
        "taskkill.exe",
        ["/PID", "12345", "/T", "/F"],
        {
          encoding: "utf8",
          killSignal: "SIGKILL",
          shell: false,
          timeout: 1_000,
          windowsHide: true,
        },
      ],
    ]);
  });

  test("bounds taskkill itself and surfaces timeout diagnostics", () => {
    const timeoutError = Object.assign(new Error("taskkill timed out"), { code: "ETIMEDOUT" });

    expect(() =>
      signalProcessTree(12_345, "SIGKILL", {
        platform: "win32",
        taskkillTimeoutMs: 25,
        runTaskkill: (_command, _arguments, options) => {
          expect(options.timeout).toBe(25);
          expect(options.killSignal).toBe("SIGKILL");
          return { error: timeoutError, status: null, stderr: "partial taskkill diagnostics" };
        },
      }),
    ).toThrow(/taskkill timed out.*partial taskkill diagnostics/i);
  });

  test("models Windows /T as terminating the validated process tree", () => {
    const liveProcesses = new Set([12_345, 12_346]);

    signalProcessTree(12_345, "SIGKILL", {
      platform: "win32",
      runTaskkill: (_command, arguments_) => {
        expect(arguments_).toEqual(["/PID", "12345", "/T", "/F"]);
        liveProcesses.clear();
        return { status: 0, stderr: "" };
      },
    });

    expect(liveProcesses).toEqual(new Set());
    expect(() =>
      signalProcessTree(12_345, "SIGKILL", {
        platform: "win32",
        taskkillTimeoutMs: 0,
      }),
    ).toThrow(/valid positive taskkill timeout/i);
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
