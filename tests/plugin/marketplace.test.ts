import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const catalogPath = join(repoRoot, ".cc-marketspec/catalog.yaml");
const entryPath = join(repoRoot, ".cc-marketspec/entries/plugin-eternal-pose.yaml");
const generatedManifestPath = join(repoRoot, ".cc-marketspec/dist/manifest.json");

type JsonRecord = Record<string, unknown>;

function readJson(relativePath: string): JsonRecord {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as JsonRecord;
}

function digestIfPresent(path: string): string | null {
  return existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : null;
}

function runNpmScript(script: string): string {
  const result = spawnSync("npm", ["run", script], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });

  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  return `${result.stdout}\n${result.stderr}`;
}

describe.sequential("Laugh Tale marketplace presentation", () => {
  test("joins one authored entry to the native Eternal Pose identity", () => {
    expect(existsSync(catalogPath)).toBe(true);
    expect(existsSync(entryPath)).toBe(true);

    const catalog = parse(readFileSync(catalogPath, "utf8")) as {
      schemaVersion?: string;
      lang?: string;
      groups?: Array<{ id?: string; label?: string }>;
    };
    const entry = parse(readFileSync(entryPath, "utf8")) as {
      group?: string;
      tagline?: string;
      intro?: string;
      skills?: Array<{ name?: string; trigger?: string; examples?: string[] }>;
    };
    const claudeMarketplace = readJson(".claude-plugin/marketplace.json") as {
      name?: string;
      plugins?: Array<{ name?: string; version?: string; source?: string; category?: string }>;
    };
    const claudePlugin = readJson("plugins/eternal-pose/.claude-plugin/plugin.json");
    const codexPlugin = readJson("plugins/eternal-pose/.codex-plugin/plugin.json") as {
      name?: string;
      version?: string;
      interface?: { category?: string; capabilities?: string[] };
    };

    expect(catalog).toMatchObject({
      schemaVersion: "1.1",
      lang: "en",
      groups: [{ id: "trip-sites", label: "Trip Sites" }],
    });
    expect(entry.group).toBe("trip-sites");
    expect(entry.skills).toHaveLength(1);
    expect(entry.skills?.[0]?.name).toBe("eternal-pose");
    expect(entry.skills?.[0]?.trigger).toMatch(/itinerary|trip site|travel website/i);
    expect(entry.skills?.[0]?.examples?.some((example) => /map-first/i.test(example))).toBe(true);
    expect(entry.tagline).toMatch(/map-first|trip site/i);
    expect(entry.intro).toMatch(/create|update|audit/i);

    expect(claudeMarketplace).toMatchObject({
      name: "laugh-tale",
      plugins: [
        {
          name: "eternal-pose",
          version: "0.1.0",
          source: "./plugins/eternal-pose",
          category: "Developer Tools",
        },
      ],
    });
    expect(claudePlugin).toMatchObject({ name: "eternal-pose", version: "0.1.0" });
    expect(codexPlugin).toMatchObject({
      name: "eternal-pose",
      version: "0.1.0",
      interface: {
        category: "Developer Tools",
        capabilities: ["Interactive", "Read", "Write"],
      },
    });
  });

  test("pins the local schema and keeps generated output source-control free", () => {
    const packageJson = readJson("package.json") as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const entrySource = readFileSync(entryPath, "utf8");
    const ignoreSource = readFileSync(join(repoRoot, ".gitignore"), "utf8");

    expect(packageJson.devDependencies?.["@xbluesky/cc-marketspec"]).toBe("1.0.0");
    expect(packageJson.dependencies?.["@xbluesky/cc-marketspec"]).toBeUndefined();
    expect(entrySource).toContain(
      "# yaml-language-server: $schema=../../node_modules/@xbluesky/cc-marketspec/schemas/entry.schema.json",
    );
    expect(ignoreSource.split("\n")).toContain(".cc-marketspec/dist/");
  });

  test("checks read-only and builds one ignored consumer manifest on demand", () => {
    const beforeCheck = digestIfPresent(generatedManifestPath);
    runNpmScript("check:marketplace");
    expect(digestIfPresent(generatedManifestPath)).toBe(beforeCheck);

    if (existsSync(generatedManifestPath)) unlinkSync(generatedManifestPath);
    runNpmScript("build:marketplace");
    const manifest = JSON.parse(readFileSync(generatedManifestPath, "utf8")) as {
      schemaVersion?: string;
      marketplace?: { name?: string };
      plugins?: Array<{
        id?: string;
        version?: string;
        category?: string;
        group?: string;
        skills?: Array<{ name?: string; trigger?: string }>;
      }>;
    };
    expect(manifest.schemaVersion).toBe("1.1");
    expect(manifest.marketplace?.name).toBe("laugh-tale");
    expect(manifest.plugins).toHaveLength(1);
    expect(manifest.plugins?.[0]).toMatchObject({
      id: "eternal-pose",
      version: "0.1.0",
      category: "Developer Tools",
      group: "trip-sites",
    });
    expect(manifest.plugins?.[0]?.skills).toHaveLength(1);
    expect(manifest.plugins?.[0]?.skills?.[0]?.name).toBe("eternal-pose");
    expect(typeof manifest.plugins?.[0]?.skills?.[0]?.trigger).toBe("string");

    const ignored = spawnSync("git", ["check-ignore", "-q", ".cc-marketspec/dist/manifest.json"], {
      cwd: repoRoot,
      shell: false,
    });
    const tracked = spawnSync("git", ["ls-files", "--error-unmatch", ".cc-marketspec/dist/manifest.json"], {
      cwd: repoRoot,
      shell: false,
    });
    expect(ignored.status).toBe(0);
    expect(tracked.status).not.toBe(0);
  });
});
