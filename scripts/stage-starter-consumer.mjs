import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createTripProject } from "../plugins/eternal-pose/scripts/create-trip-project.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const pluginRoot = join(repoRoot, "plugins/eternal-pose");
const starterRoot = join(repoRoot, "plugins/eternal-pose/starter/react");
const defaultRecipeCatalogRoot = join(pluginRoot, "recipes-v2");
const repositoryTmpRoot = join(repoRoot, "tmp");
const defaultStagedRoot = join(repositoryTmpRoot, "staged-starter");
const packBaseRoot = join(repositoryTmpRoot, "staged-packs");
const packageLockRoot = join(repositoryTmpRoot, ".stage-starter-package.lock");
const consumerMarkerName = ".laugh-tale-staged-consumer.json";
const auxiliaryMarkerName = ".laugh-tale-staging-owner.json";
const lockOwnerName = "owner.json";
const REMOVE_TREE_OPTIONS = {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 100,
};
const EXCLUDED = new Set([
  "node_modules",
  "dist",
  "coverage",
  "test-results",
  "playwright-report",
  ".env.local",
  ".DS_Store",
]);

function normalizedRelative(path) {
  return relative(repositoryTmpRoot, path).split(sep).join("/");
}

function relativeStagingPath(path) {
  const target = resolve(path);
  const relativeTarget = relative(repositoryTmpRoot, target);
  if (
    relativeTarget === "" ||
    relativeTarget === ".." ||
    relativeTarget.startsWith(`..${sep}`) ||
    isAbsolute(relativeTarget)
  ) {
    throw new Error("staging target must be a strict descendant of the repository tmp directory");
  }
  return { target, relativeTarget };
}

async function statMaybe(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function readJsonMaybe(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

async function assertRealPathComponents(path) {
  const { target, relativeTarget } = relativeStagingPath(path);
  const tmpStat = await statMaybe(repositoryTmpRoot);
  if (tmpStat?.isSymbolicLink() || (tmpStat !== undefined && !tmpStat.isDirectory())) {
    throw new Error("staging target tmp root must be a real directory");
  }

  let current = repositoryTmpRoot;
  const targetParts = relativeTarget.split(sep);
  for (let index = 0; index < targetParts.length; index += 1) {
    current = join(current, targetParts[index]);
    const stat = await statMaybe(current);
    if (stat === undefined) break;
    if (stat.isSymbolicLink()) {
      throw new Error(`staging target contains a symbolic-link component: ${current}`);
    }
    if (index < targetParts.length - 1 && !stat.isDirectory()) {
      throw new Error(`staging target contains a non-directory component: ${current}`);
    }
  }
  return { target, relativeTarget };
}

function isConsumerMarker(marker, target) {
  return (
    marker?.kind === "laugh-tale-staged-consumer" &&
    marker.version === 1 &&
    marker.target === normalizedRelative(target) &&
    typeof marker.invocation === "string" &&
    marker.invocation.length > 0
  );
}

export async function validateStagingTarget(outDir) {
  const { target, relativeTarget } = await assertRealPathComponents(outDir);
  const targetStat = await statMaybe(target);
  if (targetStat === undefined) {
    return { target, relativeTarget, state: "missing", marker: undefined };
  }
  if (!targetStat.isDirectory()) throw new Error("staging target must be a directory");

  const entries = await readdir(target);
  if (entries.length === 0) {
    return { target, relativeTarget, state: "empty", marker: undefined };
  }
  const marker = await readJsonMaybe(join(target, consumerMarkerName));
  if (!isConsumerMarker(marker, target)) {
    throw new Error("staging target refuses a non-empty unowned destination");
  }
  return { target, relativeTarget, state: "owned", marker };
}

async function ensureRealDirectoryBelowTmp(path) {
  const target = resolve(path);
  const relativeTarget = relative(repositoryTmpRoot, target);
  if (target !== repositoryTmpRoot) relativeStagingPath(target);
  await mkdir(repositoryTmpRoot, { recursive: true });
  const tmpStat = await lstat(repositoryTmpRoot);
  if (tmpStat.isSymbolicLink() || !tmpStat.isDirectory()) {
    throw new Error("staging target tmp root must be a real directory");
  }

  if (target === repositoryTmpRoot) return;

  let current = repositoryTmpRoot;
  for (const part of relativeTarget.split(sep)) {
    current = join(current, part);
    let stat = await statMaybe(current);
    if (stat === undefined) {
      try {
        await mkdir(current);
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      stat = await lstat(current);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`staging target directory path is not a real directory: ${current}`);
    }
  }
}

async function createAuxiliaryDirectory(path, marker) {
  await ensureRealDirectoryBelowTmp(dirname(path));
  await mkdir(path);
  try {
    await writeFile(
      join(path, auxiliaryMarkerName),
      `${JSON.stringify({ ...marker, version: 1 }, null, 2)}\n`,
      { flag: "wx" },
    );
  } catch (error) {
    await rmdir(path).catch(() => undefined);
    throw error;
  }
}

async function removeOwnedAuxiliaryTree(path, expectedMarker) {
  await assertRealPathComponents(path);
  const marker = await readJsonMaybe(join(path, auxiliaryMarkerName));
  if (
    marker?.kind !== expectedMarker.kind ||
    marker.version !== 1 ||
    marker.invocation !== expectedMarker.invocation
  ) {
    throw new Error(`refusing to remove staging tree without matching ownership: ${path}`);
  }
  await rm(path, REMOVE_TREE_OPTIONS);
}

async function removeOwnedConsumerTree(path, expectedMarker) {
  await assertRealPathComponents(path);
  const marker = await readJsonMaybe(join(path, consumerMarkerName));
  if (
    marker?.kind !== "laugh-tale-staged-consumer" ||
    marker.version !== 1 ||
    marker.target !== expectedMarker.target ||
    marker.invocation !== expectedMarker.invocation
  ) {
    throw new Error(`refusing to remove consumer without matching ownership: ${path}`);
  }
  await rm(path, REMOVE_TREE_OPTIONS);
}

function run(command, commandArguments, cwd, testOperations) {
  testOperations?.onCommand?.({ command, commandArguments: [...commandArguments], cwd });
  const executable =
    command === "npm" && process.env.npm_execpath
      ? { command: process.execPath, arguments: [process.env.npm_execpath, ...commandArguments] }
      : {
          command: command === "npm" && process.platform === "win32" ? "npm.cmd" : command,
          arguments: commandArguments,
        };
  const result = spawnSync(executable.command, executable.arguments, {
    cwd,
    encoding: "utf8",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${commandArguments.join(" ")} failed (${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

function validLockOwner(owner) {
  return (
    owner?.kind === "laugh-tale-package-build-lock" &&
    owner.version === 1 &&
    typeof owner.token === "string" &&
    owner.token.length > 0 &&
    Number.isInteger(owner.pid) &&
    owner.pid > 0 &&
    Number.isFinite(owner.createdAt)
  );
}

async function readLockOwner() {
  let source;
  try {
    source = await readFile(join(packageLockRoot, lockOwnerName), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error("staging package lock has invalid ownership metadata", { cause: error });
  }
}

async function retireStaleLock(owner, token) {
  const currentOwner = await readLockOwner();
  if (!validLockOwner(currentOwner) || currentOwner.token !== owner.token) return false;
  const stalePath = join(repositoryTmpRoot, `.stage-starter-package.stale-${token}`);
  try {
    await rename(packageLockRoot, stalePath);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  const entries = await readdir(stalePath);
  if (entries.length !== 1 || entries[0] !== lockOwnerName) {
    throw new Error(`refusing to retire a stale staging lock with unknown contents: ${stalePath}`);
  }
  await unlink(join(stalePath, lockOwnerName));
  await rmdir(stalePath);
  return true;
}

async function acquirePackageLock(testOperations) {
  await ensureRealDirectoryBelowTmp(dirname(packageLockRoot));
  const token = randomUUID();
  const timeoutMs = testOperations?.lockTimeoutMs ?? 120_000;
  const pollMs = testOperations?.lockPollMs ?? 75;
  const staleMs = testOperations?.lockStaleMs ?? 300_000;
  const deadOwnerGraceMs = testOperations?.lockDeadOwnerGraceMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    try {
      await mkdir(packageLockRoot);
      const owner = {
        kind: "laugh-tale-package-build-lock",
        version: 1,
        token,
        pid: process.pid,
        createdAt: Date.now(),
      };
      try {
        await writeFile(join(packageLockRoot, lockOwnerName), `${JSON.stringify(owner)}\n`, {
          flag: "wx",
        });
      } catch (error) {
        await rmdir(packageLockRoot).catch(() => undefined);
        throw error;
      }
      return async () => {
        const currentOwner = await readLockOwner();
        if (!validLockOwner(currentOwner) || currentOwner.token !== token) {
          throw new Error("staging package lock ownership changed before release");
        }
        const entries = await readdir(packageLockRoot);
        if (entries.length !== 1 || entries[0] !== lockOwnerName) {
          throw new Error("staging package lock contains unknown files at release");
        }
        await unlink(join(packageLockRoot, lockOwnerName));
        await rmdir(packageLockRoot);
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }

    const lockStat = await statMaybe(packageLockRoot);
    if (lockStat?.isSymbolicLink() || (lockStat !== undefined && !lockStat.isDirectory())) {
      throw new Error("staging package lock path is not a real directory");
    }
    const owner = await readLockOwner();
    if (owner !== undefined && !validLockOwner(owner)) {
      throw new Error("staging package lock has invalid ownership metadata");
    }
    const ownerIsDead =
      validLockOwner(owner) &&
      !(testOperations?.isProcessAlive ?? processIsAlive)(owner.pid);
    if (ownerIsDead && Date.now() - owner.createdAt > deadOwnerGraceMs) {
      if (await retireStaleLock(owner, token)) continue;
    } else if (
      owner === undefined &&
      lockStat !== undefined &&
      Date.now() - lockStat.mtimeMs > staleMs &&
      (await readdir(packageLockRoot)).length === 0
    ) {
      const stalePath = join(repositoryTmpRoot, `.stage-starter-package.stale-${token}`);
      try {
        await rename(packageLockRoot, stalePath);
        await rmdir(stalePath);
        continue;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    await wait(pollMs);
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for the staging package build lock`);
}

async function withPackageLock(testOperations, operation) {
  const release = await acquirePackageLock(testOperations);
  let result;
  let operationError;
  try {
    result = await operation();
  } catch (error) {
    operationError = error;
  }

  try {
    await release();
  } catch (releaseError) {
    if (operationError !== undefined) {
      throw new AggregateError(
        [operationError, releaseError],
        "staging operation and package-lock release both failed",
      );
    }
    throw releaseError;
  }
  if (operationError !== undefined) throw operationError;
  return result;
}

async function packWorkspacePackages(packRoot, testOperations) {
  const tarballs = [];
  const packageEntries = await readdir(join(repoRoot, "packages"), { withFileTypes: true });
  const packageDirectories = packageEntries
    .filter((candidate) => candidate.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of packageDirectories) {
    const packageDir = join(repoRoot, "packages", entry.name);
    try {
      JSON.parse(await readFile(join(packageDir, "package.json"), "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    run("npm", ["run", "build"], packageDir, testOperations);
    const output = JSON.parse(
      run(
        "npm",
        ["pack", "--json", "--pack-destination", packRoot],
        packageDir,
        testOperations,
      ),
    );
    const filename = output[0]?.filename;
    if (typeof filename !== "string") {
      throw new Error(`npm pack reported no filename for packages/${entry.name}`);
    }
    tarballs.push(join(packRoot, filename));
  }
  return tarballs;
}

function packageNameForTarball(tarball) {
  const filename = tarball.split(sep).at(-1) ?? "";
  const bareName = filename.replace(/^laugh-tale-island-/, "").replace(/-\d+\.\d+\.\d+.*\.tgz$/, "");
  return `@laugh-tale-island/${bareName}`;
}

async function composeStarter({ stagedRoot, recipe, recipeCatalogRoot }) {
  if (recipe !== undefined) {
    await createTripProject({
      pluginRoot,
      targetDir: stagedRoot,
      recipe,
      starterDir: starterRoot,
      recipeCatalogRoot: recipeCatalogRoot ?? defaultRecipeCatalogRoot,
    });
    return;
  }

  await mkdir(stagedRoot);
  await cp(starterRoot, stagedRoot, {
    recursive: true,
    filter: (source) => {
      const relativePath = relative(starterRoot, source);
      if (relativePath === "") return true;
      return !relativePath.split(sep).some((part) => EXCLUDED.has(part));
    },
  });
}

async function writeConsumerMarker(stagedRoot, target, invocation) {
  const marker = {
    kind: "laugh-tale-staged-consumer",
    version: 1,
    target: normalizedRelative(target),
    invocation,
  };
  await writeFile(join(stagedRoot, consumerMarkerName), `${JSON.stringify(marker, null, 2)}\n`, {
    flag: "wx",
  });
  return marker;
}

function sameTargetState(initial, current) {
  if (initial.state !== current.state) return false;
  if (initial.state !== "owned") return true;
  return (
    initial.marker.target === current.marker.target &&
    initial.marker.invocation === current.marker.invocation
  );
}

async function publishCandidate({ candidate, targetState, workRoot, markPublished }) {
  await ensureRealDirectoryBelowTmp(dirname(targetState.target));
  const currentState = await validateStagingTarget(targetState.target);
  if (!sameTargetState(targetState, currentState)) {
    throw new Error("staging target changed while the replacement consumer was prepared");
  }

  const previous = join(workRoot, "previous");
  if (currentState.state !== "missing") await rename(currentState.target, previous);
  try {
    await rename(candidate, currentState.target);
    markPublished();
  } catch (error) {
    if (currentState.state !== "missing") await rename(previous, currentState.target);
    throw error;
  }

  if (currentState.state === "owned") {
    await removeOwnedConsumerTree(previous, currentState.marker);
  } else if (currentState.state === "empty") {
    await rmdir(previous);
  }
}

async function rewriteManifest(stagedRoot, tarballs) {
  const manifestPath = join(stagedRoot, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const tarballByName = new Map(tarballs.map((tarball) => [packageNameForTarball(tarball), tarball]));
  for (const dependencyName of Object.keys(manifest.dependencies ?? {})) {
    if (!dependencyName.startsWith("@laugh-tale-island/")) continue;
    const tarball = tarballByName.get(dependencyName);
    if (tarball === undefined) throw new Error(`no packed tarball for ${dependencyName}`);
    manifest.dependencies[dependencyName] = `file:${tarball}`;
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await rm(join(stagedRoot, "package-lock.json"), { force: true });
}

export async function stageStarterConsumer(
  { install = true, outDir, recipe, recipeCatalogRoot } = {},
  testOperations = {},
) {
  await mkdir(repositoryTmpRoot, { recursive: true });
  const targetState = await validateStagingTarget(
    outDir === undefined ? defaultStagedRoot : resolve(outDir),
  );
  const invocation = randomUUID();
  const workRoot = join(repositoryTmpRoot, `.stage-starter-work-${invocation}`);
  const candidate = join(workRoot, "consumer");
  const workMarker = { kind: "laugh-tale-staging-work", invocation };
  const packRoot = join(packBaseRoot, invocation);
  const packMarker = { kind: "laugh-tale-staging-packs", invocation };
  let workCreated = false;
  let packCreated = false;
  let published = false;

  try {
    await createAuxiliaryDirectory(workRoot, workMarker);
    workCreated = true;
    await composeStarter({ stagedRoot: candidate, recipe, recipeCatalogRoot });
    await writeConsumerMarker(candidate, targetState.target, invocation);

    const tarballs = await withPackageLock(testOperations, async () => {
      await ensureRealDirectoryBelowTmp(packBaseRoot);
      await createAuxiliaryDirectory(packRoot, packMarker);
      packCreated = true;
      const packed = await packWorkspacePackages(packRoot, testOperations);
      await rewriteManifest(candidate, packed);
      if (install) {
        run("npm", ["install", "--no-audit", "--no-fund"], candidate, testOperations);
      }
      await publishCandidate({
        candidate,
        targetState,
        workRoot,
        markPublished: () => {
          published = true;
        },
      });
      return packed;
    });

    await removeOwnedAuxiliaryTree(workRoot, workMarker);
    workCreated = false;
    return { stagedRoot: targetState.target, tarballs };
  } catch (error) {
    const cleanupErrors = [];
    if (!published && packCreated) {
      try {
        await removeOwnedAuxiliaryTree(packRoot, packMarker);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (!published && workCreated) {
      try {
        await removeOwnedAuxiliaryTree(workRoot, workMarker);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError([error, ...cleanupErrors], "staging failed and owned cleanup failed");
    }
    throw error;
  }
}

function isMainModule() {
  return (
    process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  );
}

if (isMainModule()) {
  const { stagedRoot: staged } = await stageStarterConsumer();
  console.log(`staged-starter:${staged}`);
}
