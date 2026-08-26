import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const validatorModuleUrl = pathToFileURL(join(repoRoot, "scripts/validate-plugin-contracts.mjs")).href;
const temporaryRoots: string[] = [];

type PluginValidator = (repoRoot: URL) => Promise<string[]>;

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8")) as Record<string, unknown>;
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function collectResolvedUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectResolvedUrls);
  if (!value || typeof value !== "object") return [];

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    if (key === "resolved" && typeof nestedValue === "string") return [nestedValue];
    return collectResolvedUrls(nestedValue);
  });
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createValidFixture(): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "eternal-pose-validator-"));
  temporaryRoots.push(fixtureRoot);
  const files = [
    "LICENSE",
    "NOTICE.md",
    ".claude-plugin/marketplace.json",
    ".agents/plugins/marketplace.json",
    "plugins/eternal-pose/.claude-plugin/plugin.json",
    "plugins/eternal-pose/.codex-plugin/plugin.json",
    "plugins/eternal-pose/skills/eternal-pose/SKILL.md",
  ];
  for (const relativePath of files) {
    const target = join(fixtureRoot, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(repoRoot, relativePath), target);
  }
  return fixtureRoot;
}

async function validateFixture(fixtureRoot: string): Promise<string[]> {
  const module = (await import(validatorModuleUrl)) as { validatePluginContracts: PluginValidator };
  return module.validatePluginContracts(pathToFileURL(`${fixtureRoot}/`));
}

afterEach(() => {
  for (const fixtureRoot of temporaryRoots.splice(0)) rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("plugin contract validator", () => {
  test("accepts an untouched valid fixture", async () => {
    await expect(validateFixture(createValidFixture())).resolves.toEqual([]);
  });

  test("rejects a Codex marketplace entry outside Developer Tools", async () => {
    const fixtureRoot = createValidFixture();
    const marketplace = readJson(".agents/plugins/marketplace.json") as {
      plugins?: Array<Record<string, unknown>>;
    };
    expect(marketplace.plugins?.[0]).toBeDefined();
    marketplace.plugins![0].category = "Travel";
    writeJson(fixtureRoot, ".agents/plugins/marketplace.json", marketplace);

    const errors = await validateFixture(fixtureRoot);
    expect(errors).toContain("Codex marketplace category must be Developer Tools");
  });

  test.each(["commands", "agents", "hooks", "apps", "mcpServers", "mcp"])("rejects prohibited %s manifest declarations", async (component) => {
    const fixtureRoot = createValidFixture();
    const manifest = readJson("plugins/eternal-pose/.codex-plugin/plugin.json");
    manifest[component] = `./${component}/`;
    writeJson(fixtureRoot, "plugins/eternal-pose/.codex-plugin/plugin.json", manifest);

    const errors = await validateFixture(fixtureRoot);
    expect(errors).not.toEqual([]);
    expect(errors.join("\n")).toMatch(new RegExp(escapeForRegExp(component), "i"));
  });

  test.each(["commands", "agents", "hooks", "apps", "mcp", ".mcp.json", ".app.json", "hooks.json"])("rejects prohibited %s filesystem components", async (component) => {
    const fixtureRoot = createValidFixture();
    const target = join(fixtureRoot, "plugins/eternal-pose", component);
    if (component.includes(".")) writeFileSync(target, "{}\n");
    else mkdirSync(target, { recursive: true });

    const errors = await validateFixture(fixtureRoot);
    expect(errors).not.toEqual([]);
    expect(errors.join("\n")).toMatch(new RegExp(escapeForRegExp(component), "i"));
  });

  test("uses only public npm registry resolved URLs in the committed lockfile", () => {
    const lockfile = readJson("package-lock.json");
    const resolvedUrls = collectResolvedUrls(lockfile);
    const hosts = resolvedUrls.map((url) => new URL(url).host);

    expect(hosts).not.toContain("npm.synology.inc");
    expect(new Set(hosts)).toEqual(new Set(["registry.npmjs.org"]));
  });
});
