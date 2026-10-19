import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  "packages.md",
  "safety-and-deployment.md",
  "testing.md",
];

describe("Eternal Pose shared skill", () => {
  test("the documented review-hash invocation prints only the canonical hash", () => {
    const workflow = readFileSync(join(skillRoot, "references/workflow.md"), "utf8");
    const snippet = workflow.match(/node --input-type=module - "\$EP_PLUGIN" \/absolute\/private\/place-review\.json <<'NODE'\n([\s\S]*?)\nNODE/);
    expect(snippet).not.toBeNull();
    const directory = mkdtempSync(join(tmpdir(), "reference-review-hash-"));
    try {
      const review = join(directory, "review.json"); writeFileSync(review, '{ "b": 2, "a": 1 }\n');
      const result = spawnSync(process.execPath, ["--input-type=module", "-", join(repoRoot, "plugins/eternal-pose"), review], { input: snippet![1], encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe(createHash("sha256").update('{"a":1,"b":2}').digest("hex") + "\n");
      expect(result.stderr).toBe("");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  test("routes every mechanical v2 operation to its exact script and locale contract", () => {
    const routed = [body, ...expectedReferences.map(name => readFileSync(join(skillRoot, "references", name), "utf8"))].join("\n");
    for (const script of ["create-trip-project.mjs", "enrich-trip-project.mjs search", "enrich-trip-project.mjs accept", "validate-trip-project.mjs", "verify-trip-project.mjs", "upgrade-trip-project.mjs"]) expect(routed).toContain(script);
    for (const contract of ["ETERNAL_POSE_GOOGLE_PLACES_API_KEY", "VITE_GOOGLE_MAPS_API_KEY", "--setup-locale", "--copy-catalog", "trip.locale", "@laugh-tale-island/adapters", "@laugh-tale-island/testing"]) expect(routed).toContain(contract);
    expect(routed).not.toMatch(/quiet-wood|sticker-brutalist|native-minimal|field-atlas/i);
  });

  test("installs the generated project before installed-package operations", () => {
    const workflow = readFileSync(join(skillRoot, "references/workflow.md"), "utf8");
    const registry = workflow.split("<!-- registry-workflow -->")[1]?.split("<!-- /registry-workflow -->")[0] ?? "";
    expect([...registry.matchAll(/^\d+\. `([^`]+)`(.*)$/gm)].map(([, command, qualifier]) => command + qualifier)).toEqual([
      "create-trip-project.mjs", "npm ci", "enrich-trip-project.mjs search (optional)", "enrich-trip-project.mjs accept (optional, after review)", "validate-trip-project.mjs", "verify-trip-project.mjs",
    ]);
    expect(workflow).toContain("stage-starter-consumer.mjs");
    expect(workflow).toMatch(/prepublication[\s\S]*attested local tarballs/i);
    expect(workflow).toMatch(/Upgrade[\s\S]*npm ci[\s\S]*Validate[\s\S]*Verify/);
  });

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
