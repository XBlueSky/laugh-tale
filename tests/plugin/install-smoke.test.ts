import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const repoRoot = realpathSync(fileURLToPath(new URL("../..", import.meta.url)));
const temporaryRoots = new Map<string, string>();

type CommandResult = ReturnType<typeof spawnSync>;

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function createOwnedTempRoot(label: string): string {
  const root = mkdtempSync(join(tmpdir(), `laugh-tale-${label}-`));
  const marker = randomUUID();
  writeFileSync(join(root, ".laugh-tale-test-owner"), marker, { flag: "wx", mode: 0o600 });
  temporaryRoots.set(root, marker);
  return root;
}

function cleanOwnedTempRoot(root: string): void {
  const resolvedRoot = realpathSync(root);
  const expectedMarker = temporaryRoots.get(root);
  const relativeToTemp = relative(realpathSync(tmpdir()), resolvedRoot);
  if (
    !relativeToTemp ||
    relativeToTemp.startsWith(`..${sep}`) ||
    isAbsolute(relativeToTemp) ||
    lstatSync(resolvedRoot).isSymbolicLink() ||
    !statSync(join(resolvedRoot, ".laugh-tale-test-owner")).isFile() ||
    readFileSync(join(resolvedRoot, ".laugh-tale-test-owner"), "utf8") !== expectedMarker
  ) {
    throw new Error(`Refusing to clean unowned test root: ${resolvedRoot}`);
  }
  rmSync(resolvedRoot, { recursive: true });
}

function commandAvailable(command: string): boolean {
  const result = spawnSync(command, ["--version"], { encoding: "utf8", shell: false });
  return result.status === 0;
}

function run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
    shell: false,
    timeout: 90_000,
  });
  expect(result.status, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(0);
  return result;
}

function resolvePluginRoot(marketplacePath: string, platform: "claude" | "codex"): string {
  const marketplace = readJson(marketplacePath) as {
    plugins?: Array<{
      name?: string;
      source?: string | { source?: string; path?: string };
    }>;
  };
  const matches = (marketplace.plugins ?? []).filter((plugin) => plugin.name === "eternal-pose");
  expect(matches).toHaveLength(1);

  const source = platform === "claude" ? matches[0]?.source : (matches[0]?.source as { path?: string } | undefined)?.path;
  expect(typeof source).toBe("string");
  const pluginRoot = realpathSync(resolve(repoRoot, source as string));
  expect(relative(repoRoot, pluginRoot)).toBe(join("plugins", "eternal-pose"));
  return pluginRoot;
}

function findFiles(root: string, basename: string): string[] {
  const found: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name === basename) found.push(path);
    }
  };
  visit(root);
  return found;
}

function eternalPoseItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(eternalPoseItems);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const own =
    record.name === "eternal-pose" ||
    record.id === "eternal-pose" ||
    record.id === "eternal-pose@laugh-tale" ||
    record.plugin === "eternal-pose" ||
    record.pluginId === "eternal-pose" ||
    record.selector === "eternal-pose@laugh-tale"
      ? [value]
      : [];
  return [...own, ...Object.values(record).flatMap(eternalPoseItems)];
}

function parseJsonOutput(result: CommandResult): unknown {
  const stdout = String(result.stdout).trim();
  const start = Math.min(...[stdout.indexOf("["), stdout.indexOf("{")].filter((index) => index >= 0));
  if (!Number.isFinite(start)) throw new Error(`Expected JSON output, received: ${stdout}`);
  return JSON.parse(stdout.slice(start));
}

afterEach(() => {
  for (const root of temporaryRoots.keys()) {
    if (existsSync(root)) cleanOwnedTempRoot(root);
    temporaryRoots.delete(root);
  }
});

describe("dual-marketplace installation smoke", () => {
  test("portable resolver discovers the same shared skill exactly once", () => {
    const claudeRoot = resolvePluginRoot(join(repoRoot, ".claude-plugin/marketplace.json"), "claude");
    const codexRoot = resolvePluginRoot(join(repoRoot, ".agents/plugins/marketplace.json"), "codex");
    const claudeSkills = findFiles(join(claudeRoot, "skills"), "SKILL.md");
    const codexSkills = findFiles(join(codexRoot, "skills"), "SKILL.md");

    expect(claudeSkills).toHaveLength(1);
    expect(codexSkills).toHaveLength(1);
    expect(sha256(claudeSkills[0])).toBe(sha256(codexSkills[0]));
  });

  test.skipIf(!commandAvailable("claude"))(
    "Claude Code installs one isolated Eternal Pose skill",
    () => {
      const root = createOwnedTempRoot("claude-install");
      const configRoot = join(root, "config");
      const cacheRoot = join(root, "cache");
      mkdirSync(configRoot, { mode: 0o700 });
      mkdirSync(cacheRoot, { mode: 0o700 });
      expect(configRoot.startsWith(`${root}${sep}`)).toBe(true);
      expect(cacheRoot.startsWith(`${root}${sep}`)).toBe(true);

      const env = {
        ...process.env,
        CLAUDE_CONFIG_DIR: configRoot,
        CLAUDE_CODE_PLUGIN_CACHE_DIR: cacheRoot,
      };
      run("claude", ["plugin", "marketplace", "add", repoRoot, "--scope", "user"], { env });
      run("claude", ["plugin", "install", "eternal-pose@laugh-tale", "--scope", "user", "--yes"], { env });
      const listing = parseJsonOutput(run("claude", ["plugin", "list", "--json"], { env }));
      expect(eternalPoseItems(listing)).toHaveLength(1);

      const installedSkills = findFiles(root, "SKILL.md").filter((path) =>
        path.endsWith(join("skills", "eternal-pose", "SKILL.md")),
      );
      expect(installedSkills.length).toBeGreaterThan(0);
      expect(new Set(installedSkills.map(sha256))).toEqual(
        new Set([sha256(join(repoRoot, "plugins/eternal-pose/skills/eternal-pose/SKILL.md"))]),
      );
    },
    30_000,
  );

  test.skipIf(!commandAvailable("codex"))(
    "Codex installs one isolated Eternal Pose skill",
    () => {
      const root = createOwnedTempRoot("codex-install");
      const configRoot = join(root, "codex-home");
      mkdirSync(configRoot, { mode: 0o700 });
      expect(configRoot.startsWith(`${root}${sep}`)).toBe(true);

      const env = { ...process.env, CODEX_HOME: configRoot };
      run("codex", ["plugin", "marketplace", "add", repoRoot, "--json"], { env });
      run("codex", ["plugin", "add", "eternal-pose@laugh-tale", "--json"], { env });
      const listing = parseJsonOutput(run("codex", ["plugin", "list", "--json"], { env }));
      expect(eternalPoseItems(listing)).toHaveLength(1);

      const installedSkills = findFiles(root, "SKILL.md").filter((path) =>
        path.endsWith(join("skills", "eternal-pose", "SKILL.md")),
      );
      expect(installedSkills.length).toBeGreaterThan(0);
      expect(new Set(installedSkills.map(sha256))).toEqual(
        new Set([sha256(join(repoRoot, "plugins/eternal-pose/skills/eternal-pose/SKILL.md"))]),
      );
    },
    30_000,
  );
});
