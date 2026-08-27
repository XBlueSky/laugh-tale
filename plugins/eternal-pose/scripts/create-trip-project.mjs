import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, realpath, rmdir, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateTargetDirectory } from "../lib/path-safety.mjs";
import { loadRecipeV2Catalog } from "../lib/recipe-v2.mjs";

const OMITTED_NAMES = new Set([
  ".ds_store",
  ".cache",
  ".eslintcache",
  ".git",
  ".next",
  ".parcel-cache",
  ".turbo",
  ".vite",
  "thumbs.db",
  "build",
  "cache",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "playwright-report",
  "test-results",
]);
const LOCAL_CREDENTIAL_FILENAMES = new Set([
  "application_default_credentials.json",
  "google-services.json",
  "googleservice-info.plist",
]);
const LOCAL_CREDENTIAL_PATTERNS = [
  /^(?:credentials|(?:google[-_])?service[-_]?account(?:[-_]?key)?|client[-_]?secret)(?:[-_.][a-z0-9-]+)*\.json$/i,
  /^(?:id_rsa|id_ed25519)$/i,
  /\.(?:key|p12|pem|pfx)$/i,
];

const DEFAULT_OPERATIONS = { lstat, mkdir, open, readFile, readdir, realpath, rmdir, unlink, writeFile };

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
  const parts = relativePath.split(sep);
  const normalizedParts = parts.map((part) => part.toLowerCase());
  if (normalizedParts.some((part) => OMITTED_NAMES.has(part))) return false;

  const filename = normalizedParts.at(-1) ?? "";
  if (filename.startsWith(".env") && filename !== ".env.example") return false;
  if (filename.endsWith(".tsbuildinfo")) return false;
  if (/\.(?:css|[cm]?[jt]sx?)\.map$/i.test(filename)) return false;
  if (
    LOCAL_CREDENTIAL_FILENAMES.has(filename) ||
    LOCAL_CREDENTIAL_PATTERNS.some((pattern) => pattern.test(filename))
  ) {
    return false;
  }
  return true;
}

function shouldCopyStarterEntryExceptPresentation(starterDir, sourcePath) {
  const relativePath = relative(starterDir, sourcePath);
  return (
    relativePath !== join("src", "presentation") &&
    !relativePath.startsWith(`${join("src", "presentation")}${sep}`) &&
    shouldCopyStarterEntry(starterDir, sourcePath)
  );
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

function beginOwnedMutation(ownership, path, type) {
  if (ownership.tainted) throw new Error(`${ownership.label} ownership is uncertain`);
  ownership.tainted = { path, type };
}

async function acquireMarker(ownership, operations) {
  await assertOwnedDirectoryIdentity(ownership, operations);
  beginOwnedMutation(ownership, ownership.marker.path, "marker");
  try {
    await operations.writeFile(ownership.marker.path, ownership.marker.token, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (await missing(ownership.marker.path, operations)) ownership.tainted = null;
    throw error;
  }

  const stats = await operations.lstat(ownership.marker.path);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("ownership marker must be a regular file");
  ownership.marker.stats = stats;
  ownership.tainted = null;
}

async function acquireOwnershipMarker(ownership, removeRootOnFailure, operations) {
  try {
    await acquireMarker(ownership, operations);
  } catch (error) {
    const errors = [normalizeError(error)];
    if (!ownership.tainted) {
      try {
        await assertOwnedDirectoryIdentity(ownership, operations);
        if ((await operations.readdir(ownership.path)).length !== 0) {
          throw new Error(`${ownership.label} inventory changed`, { cause: error });
        }
        if (removeRootOnFailure) {
          await operations.rmdir(ownership.path);
          ownership.removed = true;
        }
      } catch (cleanupError) {
        errors.push(normalizeError(cleanupError));
      }
    }
    throw combinedError(errors);
  }
  return ownership;
}

async function prepareOwnedDirectory(path, label, operations) {
  const parent = await captureParent(path, operations);
  const canonicalPath = join(parent.path, basename(path));
  return {
    label,
    path: canonicalPath,
    parent,
    stats: null,
    marker: { path: join(canonicalPath, `.laugh-tale-incomplete-${randomUUID()}`), token: randomUUID() },
    entries: [],
    tainted: { path: canonicalPath, type: "root" },
    removed: false,
  };
}

async function createOwnedDirectory(ownership, operations) {
  await operations.mkdir(ownership.path);
  const stats = await operations.lstat(ownership.path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`${ownership.label} ownership changed`);
  ownership.stats = stats;
  ownership.tainted = null;
  return acquireOwnershipMarker(ownership, true, operations);
}

async function captureExistingEmptyTarget(path, operations) {
  const stats = await operations.lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("target ownership changed");
  if ((await operations.realpath(path)) !== path) throw new Error("target ownership changed");
  if ((await operations.readdir(path)).length !== 0) throw new Error("target directory must be missing or empty");
  return { stats };
}

async function adoptEmptyDirectory(path, label, expectedTarget, operations) {
  const parent = await captureParent(path, operations);
  const canonicalPath = join(parent.path, basename(path));
  if (canonicalPath !== path) throw new Error(`${label} ownership changed`);
  const stats = await operations.lstat(canonicalPath);
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    !sameIdentity(stats, expectedTarget.stats) ||
    (await operations.realpath(canonicalPath)) !== canonicalPath
  ) {
    throw new Error(`${label} ownership changed`);
  }
  const entriesBefore = await operations.readdir(canonicalPath);
  if (entriesBefore.length > 0) throw new Error("target directory must be missing or empty");
  const ownership = {
    label,
    path: canonicalPath,
    parent,
    stats,
    marker: { path: join(canonicalPath, `.laugh-tale-incomplete-${randomUUID()}`), token: randomUUID() },
    entries: [],
    tainted: null,
  };
  return acquireOwnershipMarker(ownership, false, operations);
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
  ownership.entries.push({ path, type, stats, removed: false });
  ownership.tainted = null;
}

async function recordedDirectory(ownership, path) {
  return ownership.entries.find((entry) => !entry.removed && entry.path === path && entry.type === "directory");
}

async function assertOwnedParentChain(ownership, destinationPath, operations) {
  await assertOwnedDirectory(ownership, operations);
  const relativeParent = relative(ownership.path, dirname(destinationPath));
  if (relativeParent === ".." || relativeParent.startsWith(`..${sep}`) || isAbsolute(relativeParent)) {
    throw new Error(`${ownership.label} ownership changed`);
  }

  let currentPath = ownership.path;
  for (const part of relativeParent.split(sep).filter(Boolean)) {
    currentPath = join(currentPath, part);
    const entry = await recordedDirectory(ownership, currentPath);
    if (!entry) throw new Error(`${ownership.label} ownership changed`);
    await verifyOwnedEntry(entry, operations);
  }
}

async function writeBufferIntoOwnedDirectory(contents, mode, destinationPath, ownership, context, operations) {
  await runBeforeMutation(operations, context.phase, destinationPath, context.stageDir, context.targetDir);
  await assertOwnedParentChain(ownership, destinationPath, operations);
  beginOwnedMutation(ownership, destinationPath, "file");
  let handle;
  let primaryError;
  try {
    handle = await operations.open(destinationPath, "wx", mode & 0o777);
    const handleStats = await handle.stat();
    const pathStats = await operations.lstat(destinationPath);
    if (
      !handleStats.isFile() ||
      !pathStats.isFile() ||
      pathStats.isSymbolicLink() ||
      !sameIdentity(handleStats, pathStats)
    ) {
      throw new Error("created file identity changed");
    }
    ownership.entries.push({ path: destinationPath, type: "file", stats: pathStats, removed: false });
    ownership.tainted = null;
    await runBeforeMutation(operations, context.phase, destinationPath, context.stageDir, context.targetDir);
    await assertOwnedParentChain(ownership, destinationPath, operations);
    await verifyOwnedEntry(ownership.entries.at(-1), operations);
    await handle.writeFile(contents);
  } catch (error) {
    primaryError = normalizeError(error);
  }
  const errors = primaryError ? [primaryError] : [];
  if (handle) {
    try {
      await handle.close();
    } catch (error) {
      errors.push(normalizeError(error));
    }
  }
  if (errors.length > 0) throw combinedError(errors);
}

async function copyFileIntoOwnedDirectory(sourcePath, sourceStats, destinationPath, ownership, context, operations) {
  const beforeRead = await operations.lstat(sourcePath);
  if (!beforeRead.isFile() || beforeRead.isSymbolicLink() || !sameIdentity(beforeRead, sourceStats)) {
    throw new Error("source file identity changed");
  }
  const contents = await operations.readFile(sourcePath);
  const afterRead = await operations.lstat(sourcePath);
  if (!afterRead.isFile() || afterRead.isSymbolicLink() || !sameIdentity(afterRead, beforeRead)) {
    throw new Error("source file identity changed");
  }
  await writeBufferIntoOwnedDirectory(
    contents,
    sourceStats.mode,
    destinationPath,
    ownership,
    context,
    operations,
  );
}

async function copyTreeIntoOwnedDirectory(sourceRoot, ownership, context, operations, relativeDirectory = "", options = {}) {
  const destinationPrefix = options.destinationPrefix ?? "";
  const shouldCopy = options.shouldCopy ?? shouldCopyStarterEntry;
  const skipStarterRecipe = options.skipStarterRecipe ?? false;
  if (relativeDirectory === "" && destinationPrefix !== "") {
    await ensureOwnedDirectoryPath(ownership, destinationPrefix, context, operations);
  }
  const sourceDirectory = join(sourceRoot, relativeDirectory);
  const directoryStats = await operations.lstat(sourceDirectory);
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw new Error(`source tree must not contain symbolic links: ${relativeDirectory || "."}`);
  }
  const canonicalDirectoryPath = await operations.realpath(sourceDirectory);
  if (!isWithin(sourceRoot, canonicalDirectoryPath)) {
    throw new Error(`source tree path escapes source root: ${relativeDirectory || "."}`);
  }
  const entries = (await operations.readdir(sourceDirectory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  for (const entry of entries) {
    const relativePath = join(relativeDirectory, entry.name);
    const sourcePath = join(sourceRoot, relativePath);
    if (!shouldCopy(sourceRoot, sourcePath) || entry.name.startsWith(".laugh-tale-incomplete-")) continue;
    const sourceStats = await operations.lstat(sourcePath);
    if (sourceStats.isSymbolicLink()) throw new Error(`source tree must not contain symbolic links: ${relativePath}`);
    const destinationPath = join(ownership.path, destinationPrefix, relativePath);
    if (sourceStats.isDirectory()) {
      await runBeforeMutation(operations, context.phase, destinationPath, context.stageDir, context.targetDir);
      await assertOwnedParentChain(ownership, destinationPath, operations);
      beginOwnedMutation(ownership, destinationPath, "directory");
      await operations.mkdir(destinationPath);
      await recordCreatedEntry(ownership, destinationPath, "directory", operations);
      await copyTreeIntoOwnedDirectory(sourceRoot, ownership, context, operations, relativePath, options);
    } else if (sourceStats.isFile()) {
      if (skipStarterRecipe && relativePath === join("src", "ui", "styles", "recipe.css") && context.phase === "stage-copy") continue;
      await copyFileIntoOwnedDirectory(sourcePath, sourceStats, destinationPath, ownership, context, operations);
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
    if (!(await missing(destinationPath, operations))) {
      const entry = await recordedDirectory(ownership, destinationPath);
      if (!entry) {
        ownership.tainted = { path: destinationPath, type: "foreign-entry" };
        throw new Error(`${ownership.label} ownership changed`);
      }
      await verifyOwnedEntry(entry, operations);
      continue;
    }
    await runBeforeMutation(operations, context.phase, destinationPath, context.stageDir, context.targetDir);
    await assertOwnedParentChain(ownership, destinationPath, operations);
    beginOwnedMutation(ownership, destinationPath, "directory");
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

async function verifyOwnedInventory(ownership, operations) {
  if (ownership.tainted) throw new Error(`${ownership.label} ownership is uncertain`);
  await assertOwnedDirectory(ownership, operations);
  const expected = new Map(
    ownership.entries.filter((entry) => !entry.removed).map((entry) => [entry.path, entry]),
  );
  const seen = new Set();

  async function walk(directory) {
    const entries = await operations.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (path === ownership.marker.path) {
        if (directory !== ownership.path) throw new Error(`${ownership.label} inventory changed`);
        continue;
      }
      const recorded = expected.get(path);
      if (!recorded) throw new Error(`${ownership.label} inventory changed`);
      await verifyOwnedEntry(recorded, operations);
      seen.add(path);
      if (recorded.type === "directory") await walk(path);
    }
  }

  await walk(ownership.path);
  if (seen.size !== expected.size) throw new Error(`${ownership.label} inventory changed`);
}

async function cleanupOwnedDirectory(ownership, removeRoot, context, operations) {
  if (ownership.removed) return [];
  const errors = [];
  try {
    await verifyOwnedInventory(ownership, operations);
  } catch (error) {
    return [normalizeError(error)];
  }

  for (const entry of [...ownership.entries].reverse()) {
    if (entry.removed) continue;
    try {
      await runBeforeMutation(operations, context.phase, entry.path, context.stageDir, context.targetDir);
      await assertOwnedParentChain(ownership, entry.path, operations);
      await verifyOwnedEntry(entry, operations);
      if (entry.type === "directory") await operations.rmdir(entry.path);
      else await operations.unlink(entry.path);
      entry.removed = true;
    } catch (error) {
      errors.push(normalizeError(error));
      break;
    }
  }

  if (errors.length > 0) return errors;
  try {
    await verifyOwnedInventory(ownership, operations);
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
  await verifyOwnedInventory(ownership, operations);
  await operations.unlink(ownership.marker.path);
}

export async function createTripProject({ pluginRoot, targetDir, recipe, starterDir, recipeCatalogRoot }, testOperations = {}) {
  if (typeof pluginRoot !== "string" || pluginRoot.trim() === "") throw new Error("plugin root is required");
  if (typeof recipe !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipe)) {
    throw new Error("recipe name must use lowercase letters, numbers, and hyphens");
  }

  const operations = { ...DEFAULT_OPERATIONS, ...testOperations };
  if (typeof targetDir !== "string" || targetDir.trim() === "") await validateTargetDirectory(targetDir);
  const resolvedTarget = resolve(targetDir);
  const canonicalPluginRoot = await canonicalDirectory(pluginRoot, "plugin root", operations);
  if (resolvedTarget === canonicalPluginRoot) throw new Error("refusing broad target");
  const targetState = await validateTargetDirectory(targetDir);
  const existingTarget = targetState === "empty" ? await captureExistingEmptyTarget(resolvedTarget, operations) : null;
  const canonicalStarter = await canonicalDirectory(
    starterDir ?? resolve(canonicalPluginRoot, "starter/react"),
    "starter root",
    operations,
  );
  const canonicalRecipeCatalog = recipeCatalogRoot === undefined
    ? null
    : await canonicalDirectory(recipeCatalogRoot, "recipe catalog root", operations);
  const recipeV2 = canonicalRecipeCatalog === null
    ? null
    : (await loadRecipeV2Catalog(canonicalRecipeCatalog, operations)).get(recipe);
  if (canonicalRecipeCatalog !== null && !recipeV2) throw new Error(`unknown recipe id: ${recipe}`);
  const recipeRoot = recipeV2
    ? recipeV2.root
    : await canonicalDirectory(resolve(canonicalPluginRoot, "recipes"), "recipe root", operations);
  const recipeSource = recipeV2
    ? null
    : await canonicalRecipeFile(resolve(recipeRoot, recipe, "recipe.css"), recipeRoot, operations);
  const recipeReadme = recipeV2
    ? await canonicalRecipeFile(join(recipeV2.root, "README.md"), recipeV2.root, operations)
    : null;
  const canonicalParent = await operations.realpath(dirname(resolvedTarget));
  const canonicalTarget = join(canonicalParent, basename(resolvedTarget));
  if (canonicalTarget !== resolvedTarget) throw new Error("target ownership changed");
  if (
    [canonicalPluginRoot, canonicalStarter, recipeRoot, canonicalRecipeCatalog]
      .filter(Boolean)
      .some((sourceRoot) => overlaps(sourceRoot, canonicalTarget))
  ) {
    throw new Error("refusing overlapping target");
  }
  const stageDir = join(canonicalParent, `.laugh-tale-stage-${randomUUID()}`);
  let stageOwnership;
  let targetOwnership;
  let targetFinalized = false;
  let primaryError;

  try {
    stageOwnership = await prepareOwnedDirectory(stageDir, "stage", operations);
    await createOwnedDirectory(stageOwnership, operations);
    const stageContext = { phase: "stage-copy", stageDir, targetDir: canonicalTarget };
    await copyTreeIntoOwnedDirectory(canonicalStarter, stageOwnership, stageContext, operations, "", {
      skipStarterRecipe: !recipeV2,
      shouldCopy: recipeV2 ? shouldCopyStarterEntryExceptPresentation : shouldCopyStarterEntry,
    });
    if (recipeV2) {
      await copyTreeIntoOwnedDirectory(recipeV2.presentationRoot, stageOwnership, stageContext, operations, "", {
        destinationPrefix: join("src", "presentation"),
        shouldCopy: () => true,
      });
      const presentationReadme = join(stageOwnership.path, "src/presentation/README.md");
      await ensureOwnedDirectoryPath(
        stageOwnership,
        relative(stageOwnership.path, dirname(presentationReadme)),
        stageContext,
        operations,
      );
      await copyFileIntoOwnedDirectory(
        recipeReadme,
        await operations.lstat(recipeReadme),
        presentationReadme,
        stageOwnership,
        stageContext,
        operations,
      );
      for (const assetRoot of recipeV2.assetRoots) {
        await copyTreeIntoOwnedDirectory(assetRoot, stageOwnership, stageContext, operations, "", {
          destinationPrefix: join("public", "theme-assets"),
          shouldCopy: () => true,
        });
      }
      if (recipeV2.googleStyleGuide) {
        const guideTarget = join(stageOwnership.path, "docs/provider-guides/google-map-style.json");
        await ensureOwnedDirectoryPath(
          stageOwnership,
          relative(stageOwnership.path, dirname(guideTarget)),
          stageContext,
          operations,
        );
        await copyFileIntoOwnedDirectory(
          recipeV2.googleStyleGuide,
          await operations.lstat(recipeV2.googleStyleGuide),
          guideTarget,
          stageOwnership,
          stageContext,
          operations,
        );
      }
    } else {
      const recipeTarget = join(stageOwnership.path, "src/ui/styles/recipe.css");
      const recipeDirectory = dirname(recipeTarget);
      await ensureOwnedDirectoryPath(stageOwnership, relative(stageOwnership.path, recipeDirectory), stageContext, operations);
      await copyFileIntoOwnedDirectory(
        recipeSource,
        await operations.lstat(recipeSource),
        recipeTarget,
        stageOwnership,
        stageContext,
        operations,
      );
    }
    let starterPackages = {};
    try {
      const starterManifest = JSON.parse(
        await operations.readFile(join(stageOwnership.path, "package.json"), "utf8"),
      );
      const dependencies = starterManifest?.dependencies;
      if (dependencies !== null && typeof dependencies === "object" && !Array.isArray(dependencies)) {
        starterPackages = Object.fromEntries(
          Object.entries(dependencies).filter(
            ([name, version]) => name.startsWith("@laugh-tale-island/") && typeof version === "string",
          ),
        );
      }
    } catch {
      starterPackages = {};
    }
    await writeBufferIntoOwnedDirectory(
      JSON.stringify({
        generatorVersion: "0.1.0",
        recipe,
        ...(recipeV2 ? { recipeSchemaVersion: 2 } : {}),
        packages: starterPackages,
      }, null, 2),
      0o644,
      join(stageOwnership.path, "eternal-pose.json"),
      stageOwnership,
      stageContext,
      operations,
    );
    await verifyOwnedInventory(stageOwnership, operations);

    if (targetState === "missing") {
      targetOwnership = await prepareOwnedDirectory(canonicalTarget, "target", operations);
      await createOwnedDirectory(targetOwnership, operations);
    } else {
      targetOwnership = await adoptEmptyDirectory(canonicalTarget, "target", existingTarget, operations);
    }
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
