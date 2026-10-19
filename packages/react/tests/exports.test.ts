import { describe, expect, it } from "vitest";

describe("package entry points", () => {
  it("exposes exactly the two v2 runtime composition entry points", async () => {
    const root = await import("@laugh-tale-island/react");
    expect(Object.keys(root).sort()).toEqual(["TripController", "useTripExperience"]);
    expect(root).not.toHaveProperty("useItinerarySheet");
    expect(root).not.toHaveProperty("useVisibleMapLayout");
    expect(root).not.toHaveProperty("useMapAdapterLifecycle");
    expect(root).not.toHaveProperty("useMinuteClock");
    expect(root).not.toHaveProperty("useOwnerFocusRegistry");
  });
});
