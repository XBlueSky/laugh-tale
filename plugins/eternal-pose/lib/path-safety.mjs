import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, open, readdir, readlink, realpath, rmdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, parse, relative, resolve, sep } from "node:path";

function targetError(message) {
  return new Error(message);
}

// These snapshots are capability checks for cooperative local writers. All
// ancestors are checked again immediately before mutation; no links are followed.
export function pathIdentity(stats) {
  return { dev: String(stats.dev), ino: String(stats.ino), type: stats.isDirectory() ? "directory" : stats.isFile() ? "file" : stats.isSymbolicLink() ? "link" : "special" };
}

export async function inspectPath(path) {
  try { return pathIdentity(await lstat(path)); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export function samePathIdentity(a, b) {
  return a === null || b === null ? a === b : a.dev === b.dev && a.ino === b.ino && a.type === b.type;
}

export async function assertPathIdentity(path, expected) {
  if (!samePathIdentity(await inspectPath(path), expected)) throw new Error(`path identity changed: ${path}`);
}

export async function snapshotAncestors(path) {
  const absolute = resolve(path);
  const paths = [];
  let current = parse(absolute).root;
  for (const part of relative(current, absolute).split(sep).filter(Boolean)) {
    const identity = await inspectPath(current);
    if (identity?.type !== "directory") throw new Error(`unsafe ancestor: ${current}`);
    paths.push({ path: current, identity });
    current = join(current, part);
  }
  return paths;
}

export async function assertAncestors(ancestors) {
  for (const entry of ancestors) await assertPathIdentity(entry.path, entry.identity);
}

export async function readRegularFile(path) {
  const ancestors = await snapshotAncestors(path);
  const identity = await inspectPath(path);
  if (identity?.type !== "file") throw new Error(`expected regular file: ${path}`);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!samePathIdentity(identity, pathIdentity(await handle.stat()))) throw new Error(`file identity changed: ${path}`);
    const bytes = await handle.readFile();
    const hash = createHash("sha256").update(bytes).digest("hex");
    await assertAncestors(ancestors);
    await assertPathIdentity(path, identity);
    return { identity, hash, bytes };
  } finally { await handle.close(); }
}

export async function snapshotTree(path, excluded = new Set()) {
  const ancestors = await snapshotAncestors(path);
  if ((await inspectPath(path))?.type !== "directory") throw new Error(`expected real tree directory: ${path}`);
  const entries = [];
  async function visit(current, name) {
    const identity = await inspectPath(current);
    if (!identity) throw new Error(`tree disappeared: ${current}`);
    const entry = { name, identity };
    if (identity.type === "file") entry.hash = (await readRegularFile(current)).hash;
    else if (identity.type === "link") entry.link = await readlink(current);
    else if (identity.type !== "directory") throw new Error(`unsupported tree entry: ${current}`);
    entries.push(entry);
    if (identity.type === "directory") {
      for (const child of (await readdir(current)).sort()) {
        if (!name && excluded.has(child)) continue;
        await visit(join(current, child), name ? `${name}/${child}` : child);
      }
    }
    await assertPathIdentity(current, identity);
  }
  await visit(path, "");
  await assertAncestors(ancestors);
  return entries;
}

export async function assertTree(path, expected) {
  if (JSON.stringify(await snapshotTree(path)) !== JSON.stringify(expected)) throw new Error(`tree identity or contents changed: ${path}`);
}

export async function removeOwnedTree(path, inventory) {
  await assertTree(path, inventory);
  const ancestors = await snapshotAncestors(path);
  // Deliberately no recursive rm: verify every entry again before removing it.
  for (const entry of [...inventory].reverse()) {
    await assertAncestors(ancestors);
    const current = entry.name ? join(path, entry.name) : path;
    for (const parent of inventory) {
      if (parent.identity.type === "directory" && parent.name !== entry.name && (!parent.name || entry.name.startsWith(`${parent.name}/`))) {
        await assertPathIdentity(parent.name ? join(path, parent.name) : path, parent.identity);
      }
    }
    await assertPathIdentity(current, entry.identity);
    if (entry.identity.type === "directory") await rmdir(current);
    else await unlink(current);
  }
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
