import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = process.cwd();

describe("package boundaries", () => {
  it("scans a non-empty source tree", () => {
    expect(globSync(join(packageRoot, "src/**/*.ts*")).length).toBeGreaterThan(0);
  });

  it("keeps CSS, icons, and Google out of all package sources", () => {
    for (const file of globSync(join(packageRoot, "src/**/*.ts*"))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/\.css"|lucide|@googlemaps|google\.maps/);
    }
  });

  it("keeps visible display strings out of all package sources", () => {
    for (const file of globSync(join(packageRoot, "src/**/*.ts*"))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/[一-鿿]/);
      expect(source, file).not.toMatch(
        /"(Location off|Requesting location|Location active|Location permission denied|Location unavailable|Route provider unavailable|Retry|stops?")/,
      );
    }
  });
});
