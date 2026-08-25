import { readFile, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
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

function projectFinding(code, path, message) {
  return { severity: "error", code, path, message };
}

async function pathIsFile(rootDir, relativePath) {
  try {
    return (await lstat(join(rootDir, relativePath))).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function pathIsDirectory(rootDir, relativePath) {
  try {
    return (await lstat(join(rootDir, relativePath))).isDirectory();
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

function requestedRoot(arguments_) {
  if (arguments_.length === 0) return process.cwd();
  if (arguments_.length === 1 && !arguments_[0].startsWith("--")) return arguments_[0];
  if (arguments_.length === 2 && arguments_[0] === "--root") return arguments_[1];
  return null;
}

function summarize(findings) {
  return {
    counts: {
      errors: findings.filter((finding) => finding.severity === "error").length,
      warnings: findings.filter((finding) => finding.severity === "warning").length,
    },
    findings,
  };
}

function isMainModule() {
  return process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isMainModule()) {
  const rootDir = requestedRoot(process.argv.slice(2));
  if (rootDir === null) {
    const result = summarize([
      projectFinding(
        "project.invalid-arguments",
        ".",
        "Usage: node validate-trip-project.mjs [--root] /absolute/project/path",
      ),
    ]);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } else {
    try {
      const result = summarize(await validateTripProject(rootDir));
      console.log(JSON.stringify(result, null, 2));
      if (result.counts.errors > 0) process.exitCode = 1;
    } catch {
      const result = summarize([
        projectFinding("project.validation-failure", ".", "Trip project validation could not inspect the requested root."),
      ]);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = 1;
    }
  }
}
