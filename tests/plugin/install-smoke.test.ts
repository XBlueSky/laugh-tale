import { createHash, randomUUID } from "node:crypto";
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const repoRoot = realpathSync(fileURLToPath(new URL("../..", import.meta.url)));

type FileIdentity = { dev: number; ino: number };
type OwnedTempRoot = {
  path: string;
  canonicalPath: string;
  parentCanonicalPath: string;
  parentIdentity: FileIdentity;
  rootIdentity: FileIdentity;
  markerPath: string;
  markerIdentity: FileIdentity;
  markerToken: string;
};

const temporaryRoots = new Map<string, OwnedTempRoot>();

type CommandResult = ReturnType<typeof spawnSync>;
const INHERITED_ENV_ALLOWLIST = [
  "PATH",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "TZ",
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "PATHEXT",
] as const;
const PLATFORM_CHILD_ENV_KEYS = process.platform === "darwin" ? ["__CF_USER_TEXT_ENCODING"] : [];

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function identity(path: string): FileIdentity {
  const stats = lstatSync(path);
  return { dev: stats.dev, ino: stats.ino };
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function createOwnedTempRoot(label: string): string {
  const parentCanonicalPath = realpathSync(tmpdir());
  const parentStats = lstatSync(parentCanonicalPath);
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
    throw new Error(`Refusing unsafe temporary parent: ${parentCanonicalPath}`);
  }
  const root = mkdtempSync(join(parentCanonicalPath, `laugh-tale-${label}-`));
  const rootStats = lstatSync(root);
  const canonicalPath = realpathSync(root);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink() || canonicalPath !== root) {
    throw new Error(`Refusing unsafe temporary root: ${root}`);
  }
  const markerPath = join(root, ".laugh-tale-test-owner");
  const markerToken = randomUUID();
  writeFileSync(markerPath, markerToken, { flag: "wx", mode: 0o600 });
  const markerStats = lstatSync(markerPath);
  if (!markerStats.isFile() || markerStats.isSymbolicLink()) {
    throw new Error(`Refusing unsafe ownership marker: ${markerPath}`);
  }
  temporaryRoots.set(root, {
    path: root,
    canonicalPath,
    parentCanonicalPath,
    parentIdentity: { dev: parentStats.dev, ino: parentStats.ino },
    rootIdentity: { dev: rootStats.dev, ino: rootStats.ino },
    markerPath,
    markerIdentity: { dev: markerStats.dev, ino: markerStats.ino },
    markerToken,
  });
  return root;
}

function cleanOwnedTempRoot(root: string): void {
  const owned = temporaryRoots.get(root);
  const refuse = (): never => {
    throw new Error(`Refusing to clean unowned test root: ${root}`);
  };
  if (!owned) return refuse();
  if (owned.path !== root) refuse();
  try {
    // Inspect the original directory entry before resolving any links.
    const rootStats = lstatSync(owned.path);
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink() || !sameIdentity(identity(owned.path), owned.rootIdentity)) refuse();

    const parentStats = lstatSync(owned.parentCanonicalPath);
    if (!parentStats.isDirectory() || parentStats.isSymbolicLink() || !sameIdentity(identity(owned.parentCanonicalPath), owned.parentIdentity)) refuse();

    const markerStats = lstatSync(owned.markerPath);
    if (
      !markerStats.isFile() ||
      markerStats.isSymbolicLink() ||
      !sameIdentity(identity(owned.markerPath), owned.markerIdentity) ||
      readFileSync(owned.markerPath, "utf8") !== owned.markerToken
    ) refuse();

    const canonicalPath = realpathSync(owned.path);
    const relativeToParent = relative(owned.parentCanonicalPath, canonicalPath);
    if (
      canonicalPath !== owned.canonicalPath ||
      !relativeToParent ||
      relativeToParent.startsWith(`..${sep}`) ||
      isAbsolute(relativeToParent)
    ) refuse();

    // Recheck identities immediately before recursive deletion.
    if (
      !sameIdentity(identity(owned.path), owned.rootIdentity) ||
      !sameIdentity(identity(owned.parentCanonicalPath), owned.parentIdentity) ||
      !sameIdentity(identity(owned.markerPath), owned.markerIdentity)
    ) refuse();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Refusing to clean")) throw error;
    refuse();
  }
  rmSync(owned.path, { recursive: true });
  temporaryRoots.delete(root);
}

function resolveExecutable(command: string, env: NodeJS.ProcessEnv): string | null {
  const pathValue = env.PATH ?? "";
  const pathExtensions = process.platform === "win32"
    ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];
  const hasPath = command.includes("/") || command.includes("\\");
  const roots = hasPath ? [""] : pathValue.split(delimiter).filter(Boolean);
  const suffixes = process.platform === "win32" && extname(command) ? [""] : pathExtensions;

  for (const root of roots) {
    for (const suffix of suffixes) {
      const candidate = hasPath ? `${command}${suffix}` : join(root, `${command}${suffix}`);
      try {
        accessSync(candidate, constants.X_OK);
        if (statSync(candidate).isFile()) return resolve(candidate);
      } catch {
        // Keep searching PATH without executing candidates.
      }
    }
  }
  return null;
}

function createIsolatedCliEnvironment(root: string, sourceEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of INHERITED_ENV_ALLOWLIST) {
    if (sourceEnv[key] !== undefined) env[key] = sourceEnv[key];
  }

  const home = join(root, "home");
  const temp = join(root, "tmp");
  const forcedDirectories = {
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(root, "xdg", "config"),
    XDG_CACHE_HOME: join(root, "xdg", "cache"),
    XDG_DATA_HOME: join(root, "xdg", "data"),
    XDG_STATE_HOME: join(root, "xdg", "state"),
    TMPDIR: temp,
    TMP: temp,
    TEMP: temp,
    CODEX_HOME: join(root, "codex-home"),
    CLAUDE_CONFIG_DIR: join(root, "claude-config"),
    CLAUDE_CODE_PLUGIN_CACHE_DIR: join(root, "claude-plugin-cache"),
  } satisfies Record<string, string>;
  for (const directory of new Set(Object.values(forcedDirectories))) {
    const relativePath = relative(root, directory);
    if (!relativePath || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      throw new Error(`Refusing to create CLI state outside owned root: ${directory}`);
    }
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  return Object.assign(env, forcedDirectories);
}

function run(command: string, args: string[], options: { cwd?: string; env: NodeJS.ProcessEnv }): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env,
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
  test("resolves an executable from PATH without running it", () => {
    const root = createOwnedTempRoot("resolver");
    const binRoot = join(root, "bin");
    const invocationMarker = join(root, "invoked");
    const executable = join(binRoot, "fake-cli");
    mkdirSync(binRoot, { mode: 0o700 });
    writeFileSync(executable, `#!/bin/sh\nprintf invoked > "${invocationMarker}"\n`, { mode: 0o700 });
    chmodSync(executable, 0o700);

    expect(resolveExecutable("fake-cli", { PATH: binRoot })).toBe(executable);
    expect(existsSync(invocationMarker)).toBe(false);
  });

  test("passes only allowlisted values and owned paths to child processes", () => {
    const root = createOwnedTempRoot("environment");
    const helper = join(root, "capture-environment.mjs");
    const output = join(root, "captured-environment.json");
    writeFileSync(
      helper,
      'import { writeFileSync } from "node:fs";\nwriteFileSync(process.argv[2], JSON.stringify(process.env));\n',
      { mode: 0o600 },
    );
    const env = createIsolatedCliEnvironment(root, {
      PATH: "/safe/bin",
      LANG: "en_US.UTF-8",
      SENTINEL_API_KEY: "must-not-escape",
      ANTHROPIC_API_KEY: "must-not-escape",
      OPENAI_API_KEY: "must-not-escape",
      NPM_TOKEN: "must-not-escape",
      ARBITRARY_PARENT_VALUE: "must-not-escape",
    });

    const result = spawnSync(process.execPath, [helper, output], { encoding: "utf8", env, shell: false });
    expect(result.status, result.stderr).toBe(0);
    const captured = readJson(output) as Record<string, string>;
    const expectedEnvironmentKeys = [
        "PATH",
        "LANG",
        "HOME",
        "USERPROFILE",
        "XDG_CONFIG_HOME",
        "XDG_CACHE_HOME",
        "XDG_DATA_HOME",
        "XDG_STATE_HOME",
        "TMPDIR",
        "TMP",
        "TEMP",
        "CODEX_HOME",
        "CLAUDE_CONFIG_DIR",
        "CLAUDE_CODE_PLUGIN_CACHE_DIR",
      ];
    expect(Object.keys(env).sort()).toEqual([...expectedEnvironmentKeys].sort());
    expect(Object.keys(captured).sort()).toEqual([...expectedEnvironmentKeys, ...PLATFORM_CHILD_ENV_KEYS].sort());
    expect(captured.PATH).toBe("/safe/bin");
    expect(captured.LANG).toBe("en_US.UTF-8");
    for (const forbidden of [
      "SENTINEL_API_KEY",
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "NPM_TOKEN",
      "ARBITRARY_PARENT_VALUE",
    ]) {
      expect(captured).not.toHaveProperty(forbidden);
    }
    for (const key of [
      "HOME",
      "USERPROFILE",
      "XDG_CONFIG_HOME",
      "XDG_CACHE_HOME",
      "XDG_DATA_HOME",
      "XDG_STATE_HOME",
      "TMPDIR",
      "TMP",
      "TEMP",
      "CODEX_HOME",
      "CLAUDE_CONFIG_DIR",
      "CLAUDE_CODE_PLUGIN_CACHE_DIR",
    ]) {
      expect(relative(root, captured[key])).not.toMatch(/^\.\.(?:$|[\\/])/);
      expect(isAbsolute(captured[key])).toBe(true);
    }
  });

  test("refuses cleanup when the ownership marker identity is replaced", () => {
    const root = createOwnedTempRoot("marker-replacement");
    const marker = join(root, ".laugh-tale-test-owner");
    const originalMarker = join(root, ".laugh-tale-test-owner.original");
    const decoy = join(root, "must-survive");
    const token = readFileSync(marker, "utf8");
    writeFileSync(decoy, "decoy");
    renameSync(marker, originalMarker);
    writeFileSync(marker, token, { flag: "wx", mode: 0o600 });

    expect(() => cleanOwnedTempRoot(root)).toThrow(/Refusing to clean/);
    expect(readFileSync(decoy, "utf8")).toBe("decoy");

    unlinkSync(marker);
    renameSync(originalMarker, marker);
  });

  test("refuses cleanup when the original root path becomes a symlink", () => {
    const root = createOwnedTempRoot("root-symlink");
    const decoyRoot = createOwnedTempRoot("root-symlink-decoy");
    const displacedRoot = `${root}-original`;
    const decoyMarker = join(decoyRoot, ".laugh-tale-test-owner");
    const victimToken = readFileSync(join(root, ".laugh-tale-test-owner"), "utf8");
    const decoyToken = readFileSync(decoyMarker, "utf8");
    const decoy = join(decoyRoot, "must-survive");
    writeFileSync(decoy, "decoy");
    renameSync(root, displacedRoot);
    symlinkSync(decoyRoot, root, "dir");
    writeFileSync(decoyMarker, victimToken);

    try {
      expect(() => cleanOwnedTempRoot(root)).toThrow(/Refusing to clean/);
      expect(readFileSync(decoy, "utf8")).toBe("decoy");
    } finally {
      if (existsSync(root) && lstatSync(root).isSymbolicLink()) unlinkSync(root);
      if (existsSync(displacedRoot)) renameSync(displacedRoot, root);
      if (existsSync(decoyMarker)) writeFileSync(decoyMarker, decoyToken);
    }
  });

  test("refuses cleanup when the root directory identity is replaced", () => {
    const root = createOwnedTempRoot("root-replacement");
    const displacedRoot = `${root}-original`;
    const token = readFileSync(join(root, ".laugh-tale-test-owner"), "utf8");
    const decoy = join(root, "must-survive");
    renameSync(root, displacedRoot);
    mkdirSync(root, { mode: 0o700 });
    writeFileSync(join(root, ".laugh-tale-test-owner"), token, { mode: 0o600 });
    writeFileSync(decoy, "decoy");

    try {
      expect(() => cleanOwnedTempRoot(root)).toThrow(/Refusing to clean/);
      expect(readFileSync(decoy, "utf8")).toBe("decoy");
    } finally {
      if (existsSync(root)) rmSync(root, { recursive: true });
      if (existsSync(displacedRoot)) renameSync(displacedRoot, root);
    }
  });

  test("portable resolver discovers the same shared skill exactly once", () => {
    const claudeRoot = resolvePluginRoot(join(repoRoot, ".claude-plugin/marketplace.json"), "claude");
    const codexRoot = resolvePluginRoot(join(repoRoot, ".agents/plugins/marketplace.json"), "codex");
    const claudeSkills = findFiles(join(claudeRoot, "skills"), "SKILL.md");
    const codexSkills = findFiles(join(codexRoot, "skills"), "SKILL.md");

    expect(claudeSkills).toHaveLength(1);
    expect(codexSkills).toHaveLength(1);
    expect(sha256(claudeSkills[0])).toBe(sha256(codexSkills[0]));
  });

  const claudeExecutable = resolveExecutable("claude", process.env);
  const codexExecutable = resolveExecutable("codex", process.env);

  test.skipIf(claudeExecutable === null)(
    "Claude Code installs one isolated Eternal Pose skill",
    () => {
      const root = createOwnedTempRoot("claude-install");
      const env = createIsolatedCliEnvironment(root, process.env);
      run(claudeExecutable!, ["plugin", "marketplace", "add", repoRoot, "--scope", "user"], { env });
      run(claudeExecutable!, ["plugin", "install", "eternal-pose@laugh-tale", "--scope", "user", "--yes"], { env });
      const listing = parseJsonOutput(run(claudeExecutable!, ["plugin", "list", "--json"], { env }));
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

  test.skipIf(codexExecutable === null)(
    "Codex installs one isolated Eternal Pose skill",
    () => {
      const root = createOwnedTempRoot("codex-install");
      const env = createIsolatedCliEnvironment(root, process.env);
      run(codexExecutable!, ["plugin", "marketplace", "add", repoRoot, "--json"], { env });
      run(codexExecutable!, ["plugin", "add", "eternal-pose@laugh-tale", "--json"], { env });
      const listing = parseJsonOutput(run(codexExecutable!, ["plugin", "list", "--json"], { env }));
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
