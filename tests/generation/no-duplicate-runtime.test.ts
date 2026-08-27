import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const starter = join(repoRoot, "plugins/eternal-pose/starter/react");

describe("starter does not duplicate package runtime", () => {
  test.each([
    "src/trip-core",
    "src/experience-shell/provider-contracts.ts",
    "src/experience-shell/sheet-geometry.ts",
    "src/experience-shell/map-presentation.ts",
    "src/ui/timeline/build-timeline-entries.ts",
    "src/experience-shell/useTripSelection.ts",
    "src/experience-shell/useTripProgress.ts",
    "src/experience-shell/useRouteStates.ts",
    "src/experience-shell/useUserLocation.ts",
  ])("starter has no %s", (path) => {
    expect(existsSync(join(starter, path))).toBe(false);
  });
});
