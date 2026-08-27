import { describe, expect, it } from "vitest";

describe("package entry points", () => {
  it("exposes the root entry", async () => {
    const root = await import("@laugh-tale/core");
    expect(root.CORE_PACKAGE_NAME).toBe("@laugh-tale/core");
  });
});
