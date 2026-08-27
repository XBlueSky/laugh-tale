import { describe, expect, it } from "vitest";

describe("package entry points", () => {
  it("exposes the hooks entry", async () => {
    const root = await import("@laugh-tale/react");
    expect(root).toBeDefined();
  });
});
