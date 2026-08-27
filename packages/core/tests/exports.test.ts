import { describe, expect, it } from "vitest";

describe("package entry points", () => {
  it("exposes the root entry without browser globals", async () => {
    const root = await import("@laugh-tale-island/core");
    expect(typeof root.validateTrip).toBe("function");
    expect(typeof root.resolveSheetGeometry).toBe("function");
    expect(typeof root.buildMapPresentation).toBe("function");
    expect(typeof root.buildTimelineEntries).toBe("function");
    expect(root.USER_LOCATION_OWNER_ID).toContain("map-place-owner:");
  });

  it("exposes the browser subpath", async () => {
    const browser = await import("@laugh-tale-island/core/browser");
    expect(browser).toBeDefined();
  });
});
