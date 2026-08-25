import { lstat, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { parse, resolve } from "node:path";

function targetError(message) {
  return new Error(message);
}

export async function validateTargetDirectory(targetDir) {
  if (typeof targetDir !== "string" || targetDir.trim() === "") {
    throw targetError("target directory is required");
  }

  const resolvedTarget = resolve(targetDir);
  if (resolvedTarget === parse(resolvedTarget).root || resolvedTarget === resolve(homedir())) {
    throw targetError("refusing broad target");
  }

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

  const entries = await readdir(resolvedTarget);
  if (entries.length > 0) {
    throw targetError("target directory must be missing or empty");
  }
  return "empty";
}
