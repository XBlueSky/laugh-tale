import { describe, expect, it, vi } from "vitest";
import type {
  PlaceIdentity,
  PlaceProviderResult,
  PlaceRuntimeState,
  ProviderFailureReason,
  ProviderUnavailableResult,
} from "@laugh-tale-island/core";

const providerFailureReasons: readonly ProviderFailureReason[] = [
  "missing-configuration",
  "loader-failed",
  "request-denied",
  "not-found",
  "malformed-response",
  "implausible-result",
  "network",
  "cancelled",
  "unsupported",
];

describe("provider result contracts", () => {
  it("keeps the nine stable failure reasons separate from diagnostics", () => {
    const unavailable: ProviderUnavailableResult = {
      status: "unavailable",
      reason: "request-denied",
      retryable: false,
      diagnostic: "HTTP 403: project is not authorized",
    };

    expect(providerFailureReasons).toHaveLength(9);
    expect(unavailable).toEqual({
      status: "unavailable",
      reason: "request-denied",
      retryable: false,
      diagnostic: "HTTP 403: project is not authorized",
    });
  });

  it("models runtime states without changing authored place identity", () => {
    const identity: PlaceIdentity = {
      status: "unresolved",
      reason: "not-reviewed",
    };
    const states: readonly PlaceRuntimeState[] = [
      { status: "idle" },
      { status: "loading" },
      {
        status: "ready",
        facts: { formattedAddress: "1 Harbor Road", businessStatus: "operational" },
      },
      { status: "unavailable", reason: "network", retryable: true },
    ];
    const result: PlaceProviderResult = states[2] as PlaceProviderResult;

    expect(states.map((state) => state.status)).toEqual([
      "idle",
      "loading",
      "ready",
      "unavailable",
    ]);
    expect(result).toEqual({
      status: "ready",
      facts: { formattedAddress: "1 Harbor Road", businessStatus: "operational" },
    });
    expect(identity).toEqual({ status: "unresolved", reason: "not-reviewed" });
  });

  it("imports the root entry without browser globals or network access", async () => {
    const names = ["window", "document", "HTMLElement", "fetch"] as const;
    const descriptors = new Map(
      names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
    );

    try {
      for (const name of names) Reflect.deleteProperty(globalThis, name);
      vi.stubGlobal("fetch", () => {
        throw new Error("network access is forbidden during core import");
      });

      const root = await import("@laugh-tale-island/core");
      expect(typeof root.evaluateOpeningHours).toBe("function");
    } finally {
      vi.unstubAllGlobals();
      for (const name of names) {
        const descriptor = descriptors.get(name);
        if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
        else Object.defineProperty(globalThis, name, descriptor);
      }
    }
  });
});
