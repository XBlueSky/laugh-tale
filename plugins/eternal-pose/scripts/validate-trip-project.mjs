import { spawnSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
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

async function createOwnedValidationDirectory() {
  const parentPath = await realpath(tmpdir());
  const parentStats = await lstat(parentPath);
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
    throw new Error("validation temp parent is unavailable");
  }
  const path = await mkdtemp(join(parentPath, "eternal-pose-validation-"));
  const stats = await lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink() || (await realpath(path)) !== path) {
    throw new Error("validation temp ownership could not be established");
  }
  return { path, parentPath, parentStats, stats };
}

async function cleanOwnedValidationDirectory(ownership) {
  const currentParentPath = await realpath(dirname(ownership.path));
  const currentParentStats = await lstat(currentParentPath);
  const currentStats = await lstat(ownership.path);
  if (
    currentParentPath !== ownership.parentPath ||
    !sameIdentity(currentParentStats, ownership.parentStats) ||
    !currentStats.isDirectory() ||
    currentStats.isSymbolicLink() ||
    !sameIdentity(currentStats, ownership.stats) ||
    (await realpath(ownership.path)) !== ownership.path ||
    basename(ownership.path).startsWith("eternal-pose-validation-") === false
  ) {
    throw new Error("validation temp ownership changed; cleanup refused");
  }
  await rm(ownership.path, { recursive: true, force: false });
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

function runProjectCommand(root, command, environment) {
  const executable = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(executable, command.arguments, {
    cwd: root,
    shell: false,
    stdio: "inherit",
    env: environment,
  });
  return result.status ?? 1;
}

async function readTripReadiness(ownership) {
  const entryPath = join(ownership.path, "output", "validation", "readiness.mjs");
  const module = await import(pathToFileURL(entryPath).href);
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

async function runValidation(root, mode) {
  const findings = await validateTripProject(root);
  if (findings.some(({ severity }) => severity === "error")) {
    return summarize(mode, findings);
  }

  let ownership;
  const commands = [];
  let failedCommand = null;
  try {
    ownership = await createOwnedValidationDirectory();
    await mkdir(join(ownership.path, "environment"));
    const environment = commandEnvironment(ownership);
    for (const command of COMMANDS) {
      const exitCode = runProjectCommand(root, command, environment);
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
      const hasTripContent = await readTripReadiness(ownership);
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
    findings.push(projectFinding(
      "project.validation-failure",
      ".",
      "Trip project validation could not complete its isolated checks.",
    ));
  } finally {
    if (ownership !== undefined) {
      try {
        await cleanOwnedValidationDirectory(ownership);
      } catch {
        findings.push(projectFinding(
          "project.validation-cleanup-failed",
          ".",
          "Owned validation output could not be cleaned safely.",
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
