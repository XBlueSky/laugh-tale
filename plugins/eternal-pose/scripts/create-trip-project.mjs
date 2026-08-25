import { randomUUID } from "node:crypto";
import { copyFile, cp, lstat, mkdir, readdir, rename, rm, rmdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateTargetDirectory } from "../lib/path-safety.mjs";

const OMITTED_NAMES = new Set([
  ".DS_Store",
  ".git",
  ".next",
  ".vite",
  "Thumbs.db",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "playwright-report",
  "test-results",
]);

function isWithin(parent, candidate) {
  const relativePath = relative(parent, candidate);
  return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath));
}

function shouldCopyStarterEntry(starterDir, sourcePath) {
  const relativePath = relative(starterDir, sourcePath);
  if (relativePath === "") return true;
  return !relativePath.split(sep).some((part) => OMITTED_NAMES.has(part));
}

async function assertSafeParent(targetDir) {
  const parent = dirname(targetDir);
  const parentStats = await lstat(parent);
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
    throw new Error("target parent must be an existing non-symbolic-link directory");
  }
}

async function targetStillMissing(targetDir) {
  try {
    await lstat(targetDir);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

async function restoreVerifiedEmptyTarget(targetDir) {
  try {
    await mkdir(targetDir);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
}

export async function createTripProject({ pluginRoot, targetDir, recipe, starterDir }) {
  if (typeof pluginRoot !== "string" || pluginRoot.trim() === "") throw new Error("plugin root is required");
  if (typeof recipe !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipe)) {
    throw new Error("recipe name must use lowercase letters, numbers, and hyphens");
  }

  const resolvedPluginRoot = resolve(pluginRoot);
  const resolvedTarget = resolve(targetDir);
  const resolvedStarter = resolve(starterDir ?? join(resolvedPluginRoot, "starter/react"));
  if (resolvedTarget === resolvedPluginRoot || resolvedTarget === resolvedStarter || isWithin(resolvedStarter, resolvedTarget)) {
    throw new Error("refusing broad target");
  }

  const targetState = await validateTargetDirectory(resolvedTarget);
  await assertSafeParent(resolvedTarget);

  const recipeRoot = join(resolvedPluginRoot, "recipes");
  const recipeSource = resolve(recipeRoot, recipe, "recipe.css");
  if (!isWithin(recipeRoot, recipeSource)) throw new Error("recipe path escapes the plugin recipe directory");

  const stageDir = join(dirname(resolvedTarget), `.laugh-tale-stage-${randomUUID()}`);
  let removedEmptyTarget = false;
  let published = false;
  let stageOwned = false;

  try {
    await mkdir(stageDir);
    stageOwned = true;
    for (const entry of await readdir(resolvedStarter)) {
      await cp(join(resolvedStarter, entry), join(stageDir, entry), {
        recursive: true,
        errorOnExist: true,
        force: false,
        filter: (sourcePath) => shouldCopyStarterEntry(resolvedStarter, sourcePath),
      });
    }
    const recipeTarget = join(stageDir, "src/ui/styles/recipe.css");
    await mkdir(dirname(recipeTarget), { recursive: true });
    await copyFile(recipeSource, recipeTarget);

    if (targetState === "missing") {
      if (!(await targetStillMissing(resolvedTarget))) {
        throw new Error("target directory must be missing or empty");
      }
    } else {
      await rmdir(resolvedTarget);
      removedEmptyTarget = true;
    }

    await rename(stageDir, resolvedTarget);
    published = true;
  } catch (error) {
    if (!published && stageOwned) await rm(stageDir, { recursive: true, force: true });
    if (removedEmptyTarget) await restoreVerifiedEmptyTarget(resolvedTarget);
    throw error;
  }
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
