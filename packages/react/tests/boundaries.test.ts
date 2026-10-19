import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = process.cwd();
const forbiddenPresentationPolicy = [
  /104px/,
  /46dvh/,
  /43\.75rem/,
  /220ms/,
  /160ms/,
  /cubic-bezier\(0\.22, 1, 0\.36, 1\)/,
  /Tokyo|東京|35\.6812|139\.7671/,
];

describe("package boundaries", () => {
  it("rejects exact retired controller identifiers without rejecting TripExperienceController", () => {
    for (const file of globSync(join(packageRoot, "src/**/*.ts*"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /\b(?:AppController|ExperienceController|TripPresentation|useTripExperienceController)\b/,
      );
    }
  });

  it("scans a non-empty source tree", () => {
    expect(globSync(join(packageRoot, "src/**/*.ts*")).length).toBeGreaterThan(0);
  });

  it("keeps CSS, icons, and Google out of all package sources", () => {
    for (const file of globSync(join(packageRoot, "src/**/*.ts*"))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/\.css\b|lucide|@googlemaps|google\.maps|recipes-v2|starter\/react/);
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

  it("keeps recipe-owned presentation policy out of all package sources", () => {
    for (const file of globSync(join(packageRoot, "src/**/*.ts*"))) {
      const source = readFileSync(file, "utf8");
      for (const pattern of forbiddenPresentationPolicy) {
        expect(source, `${file}: ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
