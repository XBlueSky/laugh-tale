import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as Record<string, unknown>;
}

describe("Eternal Pose distribution manifests", () => {
  test("share the normalized plugin identity without unsupported components", () => {
    const claudePlugin = readJson("plugins/eternal-pose/.claude-plugin/plugin.json");
    const codexPlugin = readJson("plugins/eternal-pose/.codex-plugin/plugin.json");
    const claudeMarketplace = readJson(".claude-plugin/marketplace.json") as {
      plugins?: Array<{ source?: string }>;
    };
    const codexMarketplace = readJson(".agents/plugins/marketplace.json") as {
      plugins?: Array<{
        name?: string;
        source?: { source?: string; path?: string };
        policy?: Record<string, unknown>;
      }>;
    };

    expect(claudePlugin).toMatchObject({
      name: "eternal-pose",
      version: "0.1.0",
      license: "MIT",
    });
    expect(codexPlugin).toMatchObject({
      name: "eternal-pose",
      version: "0.1.0",
      skills: "./skills/",
    });
    expect(codexMarketplace.plugins).toEqual([
      expect.objectContaining({
        name: "eternal-pose",
        source: { source: "local", path: "./plugins/eternal-pose" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      }),
    ]);
    expect("products" in (codexMarketplace.plugins?.[0]?.policy ?? {})).toBe(false);
    expect(existsSync(join(repoRoot, "plugins/eternal-pose/commands"))).toBe(false);

    expect(claudeMarketplace.plugins?.[0]?.source).toBe("./plugins/eternal-pose");
    expect(codexMarketplace.plugins?.[0]?.source?.path).toBe("./plugins/eternal-pose");

    for (const manifest of [claudePlugin, codexPlugin]) {
      const serialized = JSON.stringify(manifest).toLowerCase();
      expect(manifest).not.toHaveProperty("repository");
      expect(manifest).not.toHaveProperty("homepage");
      expect(serialized).not.toMatch(/icon|placeholder|mcp|hook|app/);
    }
  });
});
