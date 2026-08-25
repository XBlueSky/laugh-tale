import { lstat, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, parse, relative, resolve, sep } from "node:path";

function targetError(message) {
  return new Error(message);
}

async function inspectTargetComponents(resolvedTarget) {
  const root = parse(resolvedTarget).root;
  const components = relative(root, resolvedTarget).split(sep).filter(Boolean);
  let currentPath = root;
  for (const component of components) {
    currentPath = join(currentPath, component);
    let stats;
    try {
      stats = await lstat(currentPath);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    if (stats.isSymbolicLink()) {
      if (currentPath === resolvedTarget) throw targetError("target must not be a symbolic link");
      throw targetError("target path components must not be symbolic links");
    }
  }
}

export async function validateTargetDirectory(targetDir) {
  if (typeof targetDir !== "string" || targetDir.trim() === "") {
    throw targetError("target directory is required");
  }

  const resolvedTarget = resolve(targetDir);
  const canonicalHome = await realpath(resolve(homedir()));
  if (resolvedTarget === parse(resolvedTarget).root || resolvedTarget === canonicalHome) {
    throw targetError("refusing broad target");
  }
  await inspectTargetComponents(resolvedTarget);

  let targetStats;
  try {
    targetStats = await lstat(resolvedTarget);
  } catch (error) {
    if (error?.code === "ENOENT") return "missing";
    throw error;
  }

  if (targetStats.isSymbolicLink()) {
    throw targetError("target must not be a symbolic link");
  }
  if (!targetStats.isDirectory()) {
    throw targetError("target directory must be missing or empty");
  }
  if ((await realpath(resolvedTarget)) === canonicalHome) throw targetError("refusing broad target");

  const entries = await readdir(resolvedTarget);
  if (entries.length > 0) {
    throw targetError("target directory must be missing or empty");
  }
  return "empty";
}
