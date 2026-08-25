import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const skillRoot = join(repoRoot, "plugins/eternal-pose/skills/eternal-pose");
const skillSource = readFileSync(join(skillRoot, "SKILL.md"), "utf8");
const frontmatterMatch = skillSource.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

if (!frontmatterMatch) throw new Error("SKILL.md must contain YAML frontmatter");

const frontmatter = parse(frontmatterMatch[1]) as { name?: string; description?: string };
const body = frontmatterMatch[2];
const expectedReferences = [
  "workflow.md",
  "semantic-model.md",
  "map-first-contract.md",
  "provider-boundaries.md",
  "design-recipes.md",
  "safety-and-deployment.md",
  "testing.md",
];

describe("Eternal Pose shared skill", () => {
  test("routes bilingual trip-site work through one portable control plane", () => {
    expect(frontmatter.name).toBe("eternal-pose");
    expect(frontmatter.description).toMatch(/行程.*網站|旅行.*地圖/);
    expect(frontmatter.description).toMatch(/map-first trip site|itinerary.*travel website/i);
    expect(body.split("\n").length).toBeLessThanOrEqual(500);
    expect(body).toContain("Create");
    expect(body).toContain("Update");
    expect(body).toContain("Audit");
    expect(body).toContain("Do not publish, push, or deploy without explicit approval");

    for (const reference of expectedReferences) {
      expect(body).toContain(`references/${reference}`);
      expect(existsSync(join(skillRoot, "references", reference))).toBe(true);
    }

    expect(body).not.toMatch(/\/Users\/|tokyoTrip|AIza/);
  });

  test.each([
    ["明天東京天氣如何？", "weather-only request"],
    ["Book me a flight to Tokyo next month.", "flight-booking request"],
  ])("does not turn %s into repository creation", (prompt, fixtureName) => {
    expect(prompt).not.toMatch(/做成.*網站|建立.*旅行.*地圖|build .*trip site|itinerary.*travel website/i);
    expect(body).toContain(fixtureName);
    expect(body).toContain("Do not scaffold a repository");
  });
});
