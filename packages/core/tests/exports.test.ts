import { describe, expect, it } from "vitest";
import type { MapRoutePresentation } from "@laugh-tale-island/core";

const semanticRoute: MapRoutePresentation = {
  edgeId: "route-a-b",
  path: [
    { lat: 25, lng: 121 },
    { lat: 25.1, lng: 121.1 },
  ],
  tone: "default",
  source: "manual",
  certainty: "confirmed",
  mode: "walking",
};

describe("package entry points", () => {
  it("exposes the root entry without browser globals", async () => {
    const root = await import("@laugh-tale-island/core");
    expect(typeof root.validateTrip).toBe("function");
    expect(typeof root.resolveSheetGeometry).toBe("function");
    expect(typeof root.buildMapPresentation).toBe("function");
    expect(typeof root.buildTimelineEntries).toBe("function");
    expect(root.USER_LOCATION_OWNER_ID).toContain("map-place-owner:");
    expect(semanticRoute).toMatchObject({
      edgeId: "route-a-b",
      source: "manual",
      certainty: "confirmed",
      mode: "walking",
    });
  });

  it("exposes the browser subpath", async () => {
    const browser = await import("@laugh-tale-island/core/browser");
    expect(browser).toBeDefined();
  });
});
