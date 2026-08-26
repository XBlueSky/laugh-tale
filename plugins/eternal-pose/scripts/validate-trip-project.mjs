import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rmdir,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { pathToFileURL } from "node:url";

import { scanPublication } from "../lib/publication-scan.mjs";

const REQUIRED_FILES = [
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".env.example",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "docs/trip-experience-contract.md",
];
const REQUIRED_DIRECTORIES = [
  "src/trip-content",
  "src/trip-core",
  "src/experience-shell",
  "src/providers/google",
  "src/ui",
  "tests/e2e",
];
const REQUIRED_SCRIPTS = ["build", "lint", "test", "type-check"];
const RESULT_PREFIX = "ETERNAL_POSE_VALIDATION_RESULT ";
const COMMANDS = [
  { command: "npm test", arguments: ["test"] },
  { command: "npm run type-check", arguments: ["run", "type-check"] },
  { command: "npm run lint", arguments: ["run", "lint"] },
  { command: "npm run build", arguments: ["run", "build"] },
];
const DEFAULT_VALIDATION_OPERATIONS = {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rmdir,
  spawnSync,
  unlink,
  importModule: (url) => import(url),
};

function finding(severity, code, path, message) {
  return { severity, code, path, message };
}

function projectFinding(code, path, message) {
  return finding("error", code, path, message);
}

async function pathIsFile(rootDir, relativePath) {
  try {
    const stats = await lstat(join(rootDir, relativePath));
    return stats.isFile() && !stats.isSymbolicLink();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function pathIsDirectory(rootDir, relativePath) {
  try {
    const stats = await lstat(join(rootDir, relativePath));
    return stats.isDirectory() && !stats.isSymbolicLink();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function validateTripProject(rootDir) {
  const resolvedRoot = resolve(rootDir);
  const findings = await scanPublication(resolvedRoot);

  for (const relativePath of REQUIRED_FILES) {
    if (!(await pathIsFile(resolvedRoot, relativePath))) {
      findings.push(projectFinding("project.missing-file", relativePath, `Required generated-project file is missing at "${relativePath}".`));
    }
  }

  for (const relativePath of REQUIRED_DIRECTORIES) {
    if (!(await pathIsDirectory(resolvedRoot, relativePath))) {
      findings.push(
        projectFinding(
          "project.missing-directory",
          relativePath,
          `Required generated-project directory is missing at "${relativePath}".`,
        ),
      );
    }
  }

  if (await pathIsFile(resolvedRoot, "package.json")) {
    let packageJson;
    try {
      packageJson = JSON.parse(await readFile(join(resolvedRoot, "package.json"), "utf8"));
    } catch {
      findings.push(projectFinding("project.invalid-package-json", "package.json", "Generated project package.json is not valid JSON."));
    }
    if (packageJson !== undefined && !isPlainObject(packageJson)) {
      findings.push(
        projectFinding("project.invalid-package-shape", "package.json", "Generated project package.json must contain a JSON object."),
      );
    } else if (packageJson !== undefined && !isPlainObject(packageJson.scripts)) {
      findings.push(
        projectFinding(
          "project.invalid-scripts",
          "package.json",
          "Generated project package.json scripts must contain a JSON object.",
        ),
      );
    } else if (packageJson !== undefined) {
      for (const script of REQUIRED_SCRIPTS) {
        if (typeof packageJson.scripts[script] !== "string" || packageJson.scripts[script].trim() === "") {
          findings.push(
            projectFinding("project.missing-script", "package.json", `Required generated-project script "${script}" is missing.`),
          );
        }
      }
    }
  }

  return findings.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code));
}

function parseArguments(arguments_) {
  let root = null;
  let mode = null;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--mode") {
      const value = arguments_[index + 1];
      if (mode !== null || value === undefined || value.startsWith("--")) return null;
      mode = value;
      index += 1;
      continue;
    }
    if (argument === "--root") {
      const value = arguments_[index + 1];
      if (root !== null || value === undefined || value.startsWith("--")) return null;
      root = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--") || root !== null) return null;
    root = argument;
  }
  if (root === null || mode === null || !isAbsolute(root) || !["local", "deploy"].includes(mode)) {
    return null;
  }
  return { root: resolve(root), mode };
}

function summarize(mode, findings, commands = [], failedCommand = null) {
  const sortedFindings = [...findings].sort(
    (left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code),
  );
  return {
    mode,
    counts: {
      errors: sortedFindings.filter(({ severity }) => severity === "error").length,
      warnings: sortedFindings.filter(({ severity }) => severity === "warning").length,
    },
    findings: sortedFindings,
    commands,
    failedCommand,
  };
}

function invalidArgumentsResult() {
  return summarize(null, [
    projectFinding(
      "project.invalid-arguments",
      ".",
      "Usage: node validate-trip-project.mjs /absolute/project/path --mode local|deploy",
    ),
  ]);
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function normalizeError(error) {
  return error instanceof Error ? error : new Error("validation temp operation failed");
}

async function captureValidationParent(operations) {
  const path = await operations.realpath(tmpdir());
  const stats = await operations.lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("validation temp parent is unavailable");
  }
  return { path, stats };
}

async function assertValidationRootIdentity(ownership, operations) {
  if (ownership.stats === null) {
    throw new Error("validation temp ownership is uncertain");
  }
  try {
    const parentPath = await operations.realpath(dirname(ownership.path));
    const parentStats = await operations.lstat(parentPath);
    const beforeStats = await operations.lstat(ownership.path);
    const canonicalPath = await operations.realpath(ownership.path);
    const afterStats = await operations.lstat(ownership.path);
    if (
      parentPath !== ownership.parent.path ||
      !sameIdentity(parentStats, ownership.parent.stats) ||
      canonicalPath !== ownership.path ||
      basename(ownership.path).startsWith("eternal-pose-validation-") === false ||
      !beforeStats.isDirectory() ||
      beforeStats.isSymbolicLink() ||
      !afterStats.isDirectory() ||
      afterStats.isSymbolicLink() ||
      !sameIdentity(beforeStats, afterStats) ||
      !sameIdentity(afterStats, ownership.stats)
    ) {
      throw new Error("validation temp ownership changed");
    }
  } catch {
    throw new Error("validation temp ownership changed");
  }
}

async function assertValidationOwnership(ownership, operations) {
  await assertValidationRootIdentity(ownership, operations);
  if (ownership.marker.stats === null) {
    throw new Error("validation temp ownership is uncertain");
  }
  try {
    const stats = await operations.lstat(ownership.marker.path);
    const contents = await operations.readFile(ownership.marker.path, "utf8");
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      !sameIdentity(stats, ownership.marker.stats) ||
      contents !== ownership.marker.token
    ) {
      throw new Error("validation temp ownership changed");
    }
  } catch {
    throw new Error("validation temp ownership changed");
  }
}

async function verifyValidationEntry(entry, operations) {
  const stats = await operations.lstat(entry.path);
  const expectedType = entry.type === "directory" ? stats.isDirectory() : stats.isFile();
  if (!expectedType || stats.isSymbolicLink() || !sameIdentity(stats, entry.stats)) {
    throw new Error("validation temp entry ownership changed");
  }
}

async function assertValidationParentChain(ownership, destinationPath, operations) {
  await assertValidationOwnership(ownership, operations);
  const relativeParent = relative(ownership.path, dirname(destinationPath));
  if (relativeParent === ".." || relativeParent.startsWith(`..${sep}`) || isAbsolute(relativeParent)) {
    throw new Error("validation temp ownership changed");
  }
  let currentPath = ownership.path;
  for (const part of relativeParent.split(sep).filter(Boolean)) {
    currentPath = join(currentPath, part);
    const entry = ownership.entries.find(
      (candidate) => !candidate.removed && candidate.type === "directory" && candidate.path === currentPath,
    );
    if (entry === undefined) throw new Error("validation temp ownership changed");
    await verifyValidationEntry(entry, operations);
  }
}

async function acquireValidationDirectory(acquisition, operations) {
  const parent = await captureValidationParent(operations);
  const createdPath = resolve(await operations.mkdtemp(join(parent.path, "eternal-pose-validation-")));
  const path = join(parent.path, basename(createdPath));
  const ownership = {
    path,
    parent,
    stats: null,
    marker: {
      path: join(path, `.laugh-tale-incomplete-${randomUUID()}`),
      token: randomUUID(),
      stats: null,
    },
    protectedEntries: [],
    entries: [],
    tainted: { path, type: "root" },
  };
  acquisition.ownership = ownership;
  if (createdPath !== path) throw new Error("validation temp ownership changed");

  const beforeStats = await operations.lstat(path);
  const canonicalPath = await operations.realpath(path);
  const afterStats = await operations.lstat(path);
  if (
    canonicalPath !== path ||
    !beforeStats.isDirectory() ||
    beforeStats.isSymbolicLink() ||
    !afterStats.isDirectory() ||
    afterStats.isSymbolicLink() ||
    !sameIdentity(beforeStats, afterStats)
  ) {
    throw new Error("validation temp ownership changed");
  }
  ownership.stats = afterStats;
  ownership.tainted = null;

  await assertValidationRootIdentity(ownership, operations);
  ownership.tainted = { path: ownership.marker.path, type: "marker" };
  const handle = await operations.open(ownership.marker.path, "wx", 0o600);
  let primaryError;
  try {
    const handleStats = await handle.stat();
    const pathStats = await operations.lstat(ownership.marker.path);
    if (
      !handleStats.isFile() ||
      !pathStats.isFile() ||
      pathStats.isSymbolicLink() ||
      !sameIdentity(handleStats, pathStats)
    ) {
      throw new Error("validation temp ownership changed");
    }
    ownership.marker.stats = pathStats;
    await handle.writeFile(ownership.marker.token);
    ownership.tainted = null;
  } catch (error) {
    primaryError = normalizeError(error);
  }
  try {
    await handle.close();
  } catch (error) {
    primaryError ??= normalizeError(error);
  }
  if (primaryError !== undefined) throw primaryError;
  await assertValidationOwnership(ownership, operations);
  return ownership;
}

async function createValidationDirectoryEntry(ownership, name, operations) {
  const path = join(ownership.path, name);
  await assertValidationParentChain(ownership, path, operations);
  if (ownership.tainted !== null) throw new Error("validation temp ownership is uncertain");
  ownership.tainted = { path, type: "directory" };
  await operations.mkdir(path);
  const stats = await operations.lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("validation temp ownership changed");
  }
  const entry = { path, type: "directory", stats, removed: false };
  ownership.entries.push(entry);
  ownership.protectedEntries.push(entry);
  ownership.tainted = null;
}

async function captureValidationInventory(ownership, operations) {
  if (ownership.tainted !== null) throw new Error("validation temp ownership is uncertain");
  await assertValidationOwnership(ownership, operations);
  for (const entry of ownership.protectedEntries) await verifyValidationEntry(entry, operations);
  const captured = [];

  async function walk(directory) {
    const namesBefore = (await operations.readdir(directory)).sort();
    for (const name of namesBefore) {
      const path = join(directory, name);
      if (path === ownership.marker.path) {
        if (directory !== ownership.path) throw new Error("validation temp inventory changed");
        continue;
      }
      const beforeStats = await operations.lstat(path);
      const type = beforeStats.isDirectory() ? "directory" : beforeStats.isFile() ? "file" : null;
      if (type === null || beforeStats.isSymbolicLink()) {
        throw new Error("validation temp inventory changed");
      }
      captured.push({ path, type, stats: beforeStats, removed: false });
      if (type === "directory") await walk(path);
      const afterStats = await operations.lstat(path);
      if (!sameIdentity(beforeStats, afterStats)) throw new Error("validation temp inventory changed");
    }
    const namesAfter = (await operations.readdir(directory)).sort();
    if (JSON.stringify(namesAfter) !== JSON.stringify(namesBefore)) {
      throw new Error("validation temp inventory changed");
    }
  }

  await walk(ownership.path);
  ownership.entries = captured;
  await verifyValidationInventory(ownership, operations);
}

async function verifyValidationInventory(ownership, operations) {
  if (ownership.tainted !== null) throw new Error("validation temp ownership is uncertain");
  await assertValidationOwnership(ownership, operations);
  const expected = new Map(
    ownership.entries.filter((entry) => !entry.removed).map((entry) => [entry.path, entry]),
  );
  const seen = new Set();

  async function walk(directory) {
    for (const name of await operations.readdir(directory)) {
      const path = join(directory, name);
      if (path === ownership.marker.path) continue;
      const entry = expected.get(path);
      if (entry === undefined) throw new Error("validation temp inventory changed");
      await verifyValidationEntry(entry, operations);
      seen.add(path);
      if (entry.type === "directory") await walk(path);
    }
  }

  await walk(ownership.path);
  if (seen.size !== expected.size) throw new Error("validation temp inventory changed");
}

async function runBeforeTempMutation(operations, phase, path, validationDir) {
  await operations.beforeTempMutation?.({ phase, path, validationDir });
}

async function cleanOwnedValidationDirectory(ownership, operations) {
  try {
    await verifyValidationInventory(ownership, operations);
    for (const entry of [...ownership.entries].reverse()) {
      if (entry.removed) continue;
      await runBeforeTempMutation(operations, "validation-cleanup", entry.path, ownership.path);
      await assertValidationParentChain(ownership, entry.path, operations);
      await verifyValidationEntry(entry, operations);
      if (entry.type === "directory") await operations.rmdir(entry.path);
      else await operations.unlink(entry.path);
      entry.removed = true;
    }
    await verifyValidationInventory(ownership, operations);
    await runBeforeTempMutation(operations, "validation-cleanup", ownership.marker.path, ownership.path);
    await assertValidationOwnership(ownership, operations);
    await operations.unlink(ownership.marker.path);
    await runBeforeTempMutation(operations, "validation-cleanup", ownership.path, ownership.path);
    await assertValidationRootIdentity(ownership, operations);
    await operations.rmdir(ownership.path);
    return [];
  } catch (error) {
    return [normalizeError(error)];
  }
}

function commandEnvironment(ownership) {
  const environment = { ...process.env };
  delete environment.VITE_GOOGLE_MAPS_API_KEY;
  delete environment.VITE_E2E_FAKE_PROVIDER;
  environment.ETERNAL_POSE_VALIDATION_OUT_DIR = join(ownership.path, "output");
  environment.ETERNAL_POSE_VALIDATION_CACHE_DIR = join(ownership.path, "cache");
  environment.ETERNAL_POSE_VALIDATION_ENV_DIR = join(ownership.path, "environment");
  return environment;
}

async function runProjectCommand(root, command, environment, ownership, operations) {
  await verifyValidationInventory(ownership, operations);
  const executable = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = operations.spawnSync(executable, command.arguments, {
    cwd: root,
    shell: false,
    stdio: "inherit",
    env: environment,
  });
  await captureValidationInventory(ownership, operations);
  return result.status ?? 1;
}

async function readTripReadiness(ownership, operations) {
  await verifyValidationInventory(ownership, operations);
  const entryPath = join(ownership.path, "output", "validation", "readiness.mjs");
  const entry = ownership.entries.find(
    (candidate) => !candidate.removed && candidate.path === entryPath && candidate.type === "file",
  );
  if (entry === undefined) throw new Error("built readiness entry is not owned");
  await verifyValidationEntry(entry, operations);
  const module = await operations.importModule(pathToFileURL(entryPath).href);
  await captureValidationInventory(ownership, operations);
  const readiness = module.tripContentReadiness;
  if (
    !isPlainObject(readiness) ||
    typeof readiness.hasTripContent !== "boolean" ||
    Object.keys(readiness).length !== 1
  ) {
    throw new Error("built readiness entry has an invalid shape");
  }
  return readiness.hasTripContent;
}

export async function runValidation(root, mode, testOperations = {}) {
  const operations = { ...DEFAULT_VALIDATION_OPERATIONS, ...testOperations };
  const findings = await validateTripProject(root);
  if (findings.some(({ severity }) => severity === "error")) {
    return summarize(mode, findings);
  }

  const acquisition = { ownership: null };
  let ownership;
  const commands = [];
  let failedCommand = null;
  let phase = "ownership";
  try {
    ownership = await acquireValidationDirectory(acquisition, operations);
    phase = "validation";
    for (const name of ["output", "cache", "environment"]) {
      await createValidationDirectoryEntry(ownership, name, operations);
    }
    await captureValidationInventory(ownership, operations);
    const environment = commandEnvironment(ownership);
    for (const command of COMMANDS) {
      const exitCode = await runProjectCommand(root, command, environment, ownership, operations);
      const commandResult = { command: command.command, exitCode };
      commands.push(commandResult);
      if (exitCode !== 0) {
        failedCommand = commandResult;
        findings.push(projectFinding(
          "project.command-failed",
          "package.json",
          `Generated-project command failed: ${command.command} (exit ${exitCode}).`,
        ));
        break;
      }
    }

    if (failedCommand === null) {
      const hasTripContent = await readTripReadiness(ownership, operations);
      const hasGoogleKey = (process.env.VITE_GOOGLE_MAPS_API_KEY?.trim().length ?? 0) > 0;
      const severity = mode === "deploy" ? "error" : "warning";
      if (!hasTripContent) {
        findings.push(finding(
          severity,
          "trip-content.missing",
          "src/trip-content/trip.ts",
          "Generated trip content is not configured.",
        ));
      }
      if (!hasGoogleKey) {
        findings.push(finding(
          severity,
          "provider.google-key.missing",
          ".env.local",
          "Google Maps provider configuration is missing.",
        ));
      }
    }
  } catch {
    ownership = acquisition.ownership;
    findings.push(projectFinding(
      phase === "ownership" ? "project.validation-ownership-failed" : "project.validation-failure",
      ".",
      phase === "ownership"
        ? "Validation temp ownership could not be established safely."
        : "Trip project validation could not complete its isolated checks.",
    ));
  } finally {
    if (ownership !== undefined && ownership !== null) {
      const cleanupErrors = await cleanOwnedValidationDirectory(ownership, operations);
      if (cleanupErrors.length > 0) {
        findings.push(projectFinding(
          "project.validation-cleanup-failed",
          ".",
          "Owned validation output could not be cleaned safely because its identity or inventory changed.",
        ));
      }
    }
  }
  return summarize(mode, findings, commands, failedCommand);
}

function isMainModule() {
  return process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isMainModule()) {
  const request = parseArguments(process.argv.slice(2));
  let result;
  if (request === null) {
    result = invalidArgumentsResult();
  } else {
    try {
      result = await runValidation(request.root, request.mode);
    } catch {
      result = summarize(request.mode, [
        projectFinding(
          "project.validation-failure",
          ".",
          "Trip project validation could not inspect the requested root.",
        ),
      ]);
    }
  }
  console.log(`${RESULT_PREFIX}${JSON.stringify(result)}`);
  if (result.counts.errors > 0) process.exitCode = 1;
}
