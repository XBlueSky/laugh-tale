import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, realpath, rmdir, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateTargetDirectory } from "../lib/path-safety.mjs";

const OMITTED_NAMES = new Set([
  ".DS_Store",
  ".cache",
  ".git",
  ".next",
  ".parcel-cache",
  ".turbo",
  ".vite",
  "Thumbs.db",
  "build",
  "cache",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "playwright-report",
  "test-results",
]);

const DEFAULT_OPERATIONS = { cp, lstat, mkdir, readFile, readdir, realpath, rmdir, unlink, writeFile };

function isWithin(parent, candidate) {
  const relativePath = relative(parent, candidate);
  return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath));
}

function overlaps(left, right) {
  return isWithin(left, right) || isWithin(right, left);
}

function shouldCopyStarterEntry(starterDir, sourcePath) {
  const relativePath = relative(starterDir, sourcePath);
  if (relativePath === "") return true;
  return !relativePath.split(sep).some((part) => OMITTED_NAMES.has(part));
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function canonicalDirectory(path, label, operations) {
  const resolvedPath = resolve(path);
  const stats = await operations.lstat(resolvedPath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link`);
  }
  const canonicalPath = await operations.realpath(resolvedPath);
  if (canonicalPath !== resolvedPath) throw new Error(`${label} must not be a symbolic link`);
  return canonicalPath;
}

async function canonicalRecipeFile(path, recipeRoot, operations) {
  const resolvedPath = resolve(path);
  const stats = await operations.lstat(resolvedPath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error("recipe must be a regular non-symbolic-link file");
  }
  const canonicalPath = await operations.realpath(resolvedPath);
  if (!isWithin(recipeRoot, canonicalPath)) throw new Error("recipe path escapes the plugin recipe directory");
  return canonicalPath;
}

function normalizeError(error) {
  return error instanceof Error ? error : new Error("trip project operation failed");
}

function combinedError(errors) {
  const normalized = errors.map(normalizeError);
  if (normalized.length === 1) return normalized[0];
  return new AggregateError(normalized, normalized.map((error) => error.message).join("; "));
}

async function missing(path, operations) {
  try {
    await operations.lstat(path);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

async function captureParent(path, operations) {
  const canonicalPath = await operations.realpath(dirname(path));
  const stats = await operations.lstat(canonicalPath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("target parent must be an existing non-symbolic-link directory");
  }
  return { path: canonicalPath, stats };
}

async function createMarker(directory, operations) {
  const token = randomUUID();
  const markerPath = join(directory, `.laugh-tale-incomplete-${randomUUID()}`);
  await operations.writeFile(markerPath, token, { encoding: "utf8", flag: "wx", mode: 0o600 });
  const stats = await operations.lstat(markerPath);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("ownership marker must be a regular file");
  return { path: markerPath, stats, token };
}

async function assertOwnedDirectoryIdentity(ownership, operations) {
  let parentPath;
  let parentStats;
  let directoryStats;
  try {
    parentPath = await operations.realpath(dirname(ownership.path));
    parentStats = await operations.lstat(parentPath);
    directoryStats = await operations.lstat(ownership.path);
  } catch {
    throw new Error(`${ownership.label} ownership changed`);
  }

  if (
    parentPath !== ownership.parent.path ||
    !sameIdentity(parentStats, ownership.parent.stats) ||
    !directoryStats.isDirectory() ||
    directoryStats.isSymbolicLink() ||
    !sameIdentity(directoryStats, ownership.stats)
  ) {
    throw new Error(`${ownership.label} ownership changed`);
  }
}

async function assertOwnedDirectory(ownership, operations) {
  await assertOwnedDirectoryIdentity(ownership, operations);
  let markerStats;
  let markerContents;
  try {
    markerStats = await operations.lstat(ownership.marker.path);
    markerContents = await operations.readFile(ownership.marker.path, "utf8");
  } catch {
    throw new Error(`${ownership.label} ownership changed`);
  }

  if (
    !markerStats.isFile() ||
    markerStats.isSymbolicLink() ||
    !sameIdentity(markerStats, ownership.marker.stats) ||
    markerContents !== ownership.marker.token
  ) {
    throw new Error(`${ownership.label} ownership changed`);
  }
}

async function createOwnedDirectory(path, label, operations) {
  const parent = await captureParent(path, operations);
  const canonicalPath = join(parent.path, basename(path));
  await operations.mkdir(canonicalPath);
  const stats = await operations.lstat(canonicalPath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`${label} ownership changed`);
  const marker = await createMarker(canonicalPath, operations);
  return { label, path: canonicalPath, parent, stats, marker, entries: [] };
}

async function adoptEmptyDirectory(path, label, operations) {
  const parent = await captureParent(path, operations);
  const canonicalPath = join(parent.path, basename(path));
  const stats = await operations.lstat(canonicalPath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`${label} ownership changed`);
  const entriesBefore = await operations.readdir(canonicalPath);
  if (entriesBefore.length > 0) throw new Error("target directory must be missing or empty");
  const marker = await createMarker(canonicalPath, operations);
  return { label, path: canonicalPath, parent, stats, marker, entries: [] };
}

async function assertAdoptedDirectoryStillEmpty(ownership, operations) {
  await assertOwnedDirectory(ownership, operations);
  const entriesAfter = await operations.readdir(ownership.path);
  if (entriesAfter.length !== 1 || entriesAfter[0] !== basename(ownership.marker.path)) {
    throw new Error("target directory must be missing or empty");
  }
}

async function runBeforeMutation(operations, phase, path, stageDir, targetDir) {
  await operations.beforeMutation?.({ phase, path, stageDir, targetDir });
}

async function recordCreatedEntry(ownership, path, type, operations) {
  const stats = await operations.lstat(path);
  const expectedType = type === "directory" ? stats.isDirectory() : stats.isFile();
  if (!expectedType || stats.isSymbolicLink()) throw new Error(`created ${type} identity changed`);
  ownership.entries.push({ path, type, stats });
}

async function copyFileIntoOwnedDirectory(sourcePath, destinationPath, ownership, context, operations) {
  await runBeforeMutation(operations, context.phase, destinationPath, context.stageDir, context.targetDir);
  await assertOwnedDirectory(ownership, operations);
  if (!(await missing(destinationPath, operations))) throw new Error("destination entry already exists");
  try {
    await operations.cp(sourcePath, destinationPath, { recursive: true, errorOnExist: true, force: false });
  } catch (error) {
    if (!(await missing(destinationPath, operations))) {
      await recordCreatedEntry(ownership, destinationPath, "file", operations);
    }
    throw error;
  }
  await recordCreatedEntry(ownership, destinationPath, "file", operations);
}

async function copyTreeIntoOwnedDirectory(sourceRoot, ownership, context, operations, relativeDirectory = "") {
  const sourceDirectory = join(sourceRoot, relativeDirectory);
  const entries = (await operations.readdir(sourceDirectory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  for (const entry of entries) {
    const relativePath = join(relativeDirectory, entry.name);
    const sourcePath = join(sourceRoot, relativePath);
    if (!shouldCopyStarterEntry(sourceRoot, sourcePath) || entry.name.startsWith(".laugh-tale-incomplete-")) continue;
    const sourceStats = await operations.lstat(sourcePath);
    if (sourceStats.isSymbolicLink()) throw new Error(`source tree must not contain symbolic links: ${relativePath}`);
    const destinationPath = join(ownership.path, relativePath);
    if (sourceStats.isDirectory()) {
      await runBeforeMutation(operations, context.phase, destinationPath, context.stageDir, context.targetDir);
      await assertOwnedDirectory(ownership, operations);
      await operations.mkdir(destinationPath);
      await recordCreatedEntry(ownership, destinationPath, "directory", operations);
      await copyTreeIntoOwnedDirectory(sourceRoot, ownership, context, operations, relativePath);
    } else if (sourceStats.isFile()) {
      if (relativePath === join("src", "ui", "styles", "recipe.css") && context.phase === "stage-copy") continue;
      await copyFileIntoOwnedDirectory(sourcePath, destinationPath, ownership, context, operations);
    } else {
      throw new Error(`source tree entry must be a regular file or directory: ${relativePath}`);
    }
  }
}

async function ensureOwnedDirectoryPath(ownership, relativeDirectory, context, operations) {
  let currentRelativePath = "";
  for (const part of relativeDirectory.split(sep).filter(Boolean)) {
    currentRelativePath = join(currentRelativePath, part);
    const destinationPath = join(ownership.path, currentRelativePath);
    if (!(await missing(destinationPath, operations))) continue;
    await runBeforeMutation(operations, context.phase, destinationPath, context.stageDir, context.targetDir);
    await assertOwnedDirectory(ownership, operations);
    await operations.mkdir(destinationPath);
    await recordCreatedEntry(ownership, destinationPath, "directory", operations);
  }
}

async function verifyOwnedEntry(entry, operations) {
  const stats = await operations.lstat(entry.path);
  const expectedType = entry.type === "directory" ? stats.isDirectory() : stats.isFile();
  if (!expectedType || stats.isSymbolicLink() || !sameIdentity(stats, entry.stats)) {
    throw new Error(`owned entry identity changed: ${entry.path}`);
  }
}

async function cleanupOwnedDirectory(ownership, removeRoot, context, operations) {
  const errors = [];
  for (const entry of [...ownership.entries].reverse()) {
    try {
      await runBeforeMutation(operations, context.phase, entry.path, context.stageDir, context.targetDir);
      await assertOwnedDirectory(ownership, operations);
      await verifyOwnedEntry(entry, operations);
      if (entry.type === "directory") await operations.rmdir(entry.path);
      else await operations.unlink(entry.path);
    } catch (error) {
      errors.push(normalizeError(error));
    }
  }

  if (errors.length > 0) return errors;
  try {
    await runBeforeMutation(operations, context.phase, ownership.marker.path, context.stageDir, context.targetDir);
    await assertOwnedDirectory(ownership, operations);
    await operations.unlink(ownership.marker.path);
    await assertOwnedDirectoryIdentity(ownership, operations);
    if (removeRoot) {
      await runBeforeMutation(operations, context.phase, ownership.path, context.stageDir, context.targetDir);
      await assertOwnedDirectoryIdentity(ownership, operations);
      await operations.rmdir(ownership.path);
    }
  } catch (error) {
    errors.push(normalizeError(error));
  }
  return errors;
}

async function finalizeOwnedDirectory(ownership, context, operations) {
  await runBeforeMutation(operations, context.phase, ownership.marker.path, context.stageDir, context.targetDir);
  await assertOwnedDirectory(ownership, operations);
  await operations.unlink(ownership.marker.path);
}

export async function createTripProject({ pluginRoot, targetDir, recipe, starterDir }, testOperations = {}) {
  if (typeof pluginRoot !== "string" || pluginRoot.trim() === "") throw new Error("plugin root is required");
  if (typeof recipe !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipe)) {
    throw new Error("recipe name must use lowercase letters, numbers, and hyphens");
  }

  const operations = { ...DEFAULT_OPERATIONS, ...testOperations };
  if (typeof targetDir !== "string" || targetDir.trim() === "") await validateTargetDirectory(targetDir);
  const resolvedTarget = resolve(targetDir);
  const canonicalPluginRoot = await canonicalDirectory(pluginRoot, "plugin root", operations);
  if (resolvedTarget === canonicalPluginRoot) throw new Error("refusing broad target");
  try {
    if ((await operations.realpath(resolvedTarget)) === canonicalPluginRoot) throw new Error("refusing broad target");
  } catch (error) {
    if (error?.message === "refusing broad target") throw error;
    if (error?.code !== "ENOENT") throw error;
  }
  const targetState = await validateTargetDirectory(targetDir);
  const canonicalStarter = await canonicalDirectory(
    starterDir ?? join(canonicalPluginRoot, "starter/react"),
    "starter root",
    operations,
  );
  const recipeRoot = await canonicalDirectory(join(canonicalPluginRoot, "recipes"), "recipe root", operations);
  const recipeSource = await canonicalRecipeFile(join(recipeRoot, recipe, "recipe.css"), recipeRoot, operations);
  const canonicalParent = await operations.realpath(dirname(resolvedTarget));
  const canonicalTarget =
    targetState === "empty" ? await operations.realpath(resolvedTarget) : join(canonicalParent, basename(resolvedTarget));
  if (
    [canonicalPluginRoot, canonicalStarter, recipeRoot].some((sourceRoot) => overlaps(sourceRoot, canonicalTarget))
  ) {
    throw new Error("refusing overlapping target");
  }
  const stageDir = join(canonicalParent, `.laugh-tale-stage-${randomUUID()}`);
  let stageOwnership;
  let targetOwnership;
  let targetFinalized = false;
  let primaryError;

  try {
    stageOwnership = await createOwnedDirectory(stageDir, "stage", operations);
    const stageContext = { phase: "stage-copy", stageDir, targetDir: canonicalTarget };
    await copyTreeIntoOwnedDirectory(canonicalStarter, stageOwnership, stageContext, operations);
    const recipeTarget = join(stageOwnership.path, "src/ui/styles/recipe.css");
    const recipeDirectory = dirname(recipeTarget);
    await ensureOwnedDirectoryPath(stageOwnership, relative(stageOwnership.path, recipeDirectory), stageContext, operations);
    await copyFileIntoOwnedDirectory(recipeSource, recipeTarget, stageOwnership, stageContext, operations);

    targetOwnership =
      targetState === "missing"
        ? await createOwnedDirectory(canonicalTarget, "target", operations)
        : await adoptEmptyDirectory(canonicalTarget, "target", operations);
    if (targetState === "empty") await assertAdoptedDirectoryStillEmpty(targetOwnership, operations);
    const targetContext = { phase: "target-copy", stageDir, targetDir: canonicalTarget };
    await copyTreeIntoOwnedDirectory(stageOwnership.path, targetOwnership, targetContext, operations);
  } catch (error) {
    primaryError = normalizeError(error);
  }

  const errors = primaryError ? [primaryError] : [];
  if (targetOwnership && !targetFinalized && primaryError) {
    errors.push(
      ...(await cleanupOwnedDirectory(
        targetOwnership,
        targetState === "missing",
        { phase: "target-cleanup", stageDir, targetDir: canonicalTarget },
        operations,
      )),
    );
  }
  if (stageOwnership) {
    errors.push(
      ...(await cleanupOwnedDirectory(
        stageOwnership,
        true,
        { phase: "stage-cleanup", stageDir, targetDir: canonicalTarget },
        operations,
      )),
    );
  }

  if (errors.length === 0 && targetOwnership) {
    try {
      await finalizeOwnedDirectory(
        targetOwnership,
        { phase: "target-finalize", stageDir, targetDir: canonicalTarget },
        operations,
      );
      targetFinalized = true;
    } catch (error) {
      errors.push(normalizeError(error));
    }
  }

  if (errors.length > 0) throw combinedError(errors);
}

function parseArguments(arguments_) {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) return null;
    values.set(name, value);
  }
  if (![...values.keys()].every((name) => ["--target", "--recipe", "--starter"].includes(name))) return null;
  if (!values.has("--target") || !values.has("--recipe")) return null;
  return values;
}

function isMainModule() {
  return process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isMainModule()) {
  const arguments_ = parseArguments(process.argv.slice(2));
  if (!arguments_) {
    console.error("Usage: node create-trip-project.mjs --target /absolute/output/my-trip --recipe quiet-wood");
    process.exitCode = 1;
  } else {
    const pluginRoot = fileURLToPath(new URL("..", import.meta.url));
    try {
      await createTripProject({
        pluginRoot,
        targetDir: arguments_.get("--target"),
        recipe: arguments_.get("--recipe"),
        starterDir: arguments_.get("--starter"),
      });
      console.log(`Created trip project at ${resolve(arguments_.get("--target"))}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "trip project creation failed");
      process.exitCode = 1;
    }
  }
}
