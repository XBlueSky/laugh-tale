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
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
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
const artifactLockRoot = join(repositoryTmpRoot, ".stage-starter-artifact.lock");
const consumerMarkerName = ".laugh-tale-staged-consumer.json";
const auxiliaryMarkerName = ".laugh-tale-staging-owner.json";
const lockOwnerName = "owner.json";
const artifactMarkerVersion = 2;
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

function identityFor(stat) {
  return { dev: String(stat.dev), ino: String(stat.ino) };
}

function sameIdentity(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino;
}

async function readMarkerSnapshot(path) {
  const stat = await statMaybe(path);
  if (stat === undefined) return undefined;
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`staging ownership marker must be a real file: ${path}`);
  }
  const source = await readFile(path, "utf8");
  let marker;
  try {
    marker = JSON.parse(source);
  } catch {
    return { identity: identityFor(stat), marker: undefined, source };
  }
  const currentStat = await lstat(path);
  if (!sameIdentity(identityFor(stat), identityFor(currentStat))) {
    throw new Error(`staging ownership marker identity changed while it was inspected: ${path}`);
  }
  return { identity: identityFor(stat), marker, source };
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
    return {
      target,
      relativeTarget,
      state: "missing",
      marker: undefined,
      markerSnapshot: undefined,
      targetIdentity: undefined,
    };
  }
  if (!targetStat.isDirectory()) throw new Error("staging target must be a directory");

  const entries = await readdir(target);
  if (entries.length === 0) {
    const currentStat = await lstat(target);
    if (!sameIdentity(identityFor(targetStat), identityFor(currentStat))) {
      throw new Error("staging target identity changed while it was inspected");
    }
    return {
      target,
      relativeTarget,
      state: "empty",
      marker: undefined,
      markerSnapshot: undefined,
      targetIdentity: identityFor(targetStat),
    };
  }
  const markerSnapshot = await readMarkerSnapshot(join(target, consumerMarkerName));
  const marker = markerSnapshot?.marker;
  if (!isConsumerMarker(marker, target)) {
    throw new Error("staging target refuses a non-empty unowned destination");
  }
  const currentStat = await lstat(target);
  if (!sameIdentity(identityFor(targetStat), identityFor(currentStat))) {
    throw new Error("staging target identity changed while it was inspected");
  }
  return {
    target,
    relativeTarget,
    state: "owned",
    marker,
    markerSnapshot,
    targetIdentity: identityFor(targetStat),
  };
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
      `${JSON.stringify(marker, null, 2)}\n`,
      { flag: "wx" },
    );
  } catch (error) {
    await rmdir(path).catch(() => undefined);
    throw error;
  }
}

async function updateAuxiliaryMarker(path, marker) {
  await writeFile(join(path, auxiliaryMarkerName), `${JSON.stringify(marker, null, 2)}\n`);
}

function validArtifactMarker(marker, kind, path) {
  return (
    marker?.kind === kind &&
    marker.version === artifactMarkerVersion &&
    typeof marker.invocation === "string" &&
    marker.invocation.length > 0 &&
    typeof marker.token === "string" &&
    marker.token.length > 0 &&
    marker.path === normalizedRelative(path) &&
    typeof marker.target === "string" &&
    marker.target.length > 0 &&
    Number.isInteger(marker.pid) &&
    marker.pid > 0 &&
    Number.isFinite(marker.createdAt)
  );
}

function validPackMarker(marker, path) {
  return (
    validArtifactMarker(marker, "laugh-tale-staging-packs", path) &&
    Array.isArray(marker.files) &&
    marker.files.every(
      (file) =>
        typeof file === "string" &&
        file.length > 0 &&
        file === basename(file) &&
        file.endsWith(".tgz"),
    ) &&
    new Set(marker.files).size === marker.files.length
  );
}

function packReferenceFor(marker, snapshot) {
  return {
    invocation: marker.invocation,
    path: marker.path,
    token: marker.token,
    ...(snapshot === undefined
      ? {}
      : {
          directoryIdentity: snapshot.directoryIdentity,
          markerIdentity: snapshot.markerIdentity,
          markerSource: snapshot.markerSource,
        }),
  };
}

function samePackReference(left, right) {
  return (
    left?.invocation === right?.invocation &&
    left?.path === right?.path &&
    left?.token === right?.token &&
    sameIdentity(left?.directoryIdentity, right?.directoryIdentity) &&
    sameIdentity(left?.markerIdentity, right?.markerIdentity) &&
    left?.markerSource === right?.markerSource
  );
}

function packPathForReference(reference) {
  if (
    typeof reference?.invocation !== "string" ||
    reference.invocation.length === 0 ||
    typeof reference.path !== "string" ||
    typeof reference.token !== "string" ||
    reference.token.length === 0 ||
    typeof reference.directoryIdentity?.dev !== "string" ||
    typeof reference.directoryIdentity?.ino !== "string" ||
    typeof reference.markerIdentity?.dev !== "string" ||
    typeof reference.markerIdentity?.ino !== "string" ||
    typeof reference.markerSource !== "string"
  ) {
    throw new Error("invalid staged pack ownership reference");
  }
  const path = resolve(repositoryTmpRoot, reference.path);
  const { target } = relativeStagingPath(path);
  if (dirname(target) !== packBaseRoot || basename(target) !== reference.invocation) {
    throw new Error("staged pack ownership reference is outside its strict pack root");
  }
  return target;
}

async function capturePackReference(path) {
  await assertRealPathComponents(path);
  const directoryStat = await lstat(path);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error(`staged pack root must be a real directory: ${path}`);
  }
  const markerSnapshot = await readMarkerSnapshot(join(path, auxiliaryMarkerName));
  if (!validPackMarker(markerSnapshot?.marker, path)) {
    throw new Error(`staged pack root has invalid ownership metadata: ${path}`);
  }
  return packReferenceFor(markerSnapshot.marker, {
    directoryIdentity: identityFor(directoryStat),
    markerIdentity: markerSnapshot.identity,
    markerSource: markerSnapshot.source,
  });
}

async function readMatchingAuxiliaryMarker(path, expectedMarker) {
  await assertRealPathComponents(path);
  const snapshot = await readMarkerSnapshot(join(path, auxiliaryMarkerName));
  const marker = snapshot?.marker;
  if (
    !validArtifactMarker(marker, expectedMarker.kind, path) ||
    marker.invocation !== expectedMarker.invocation ||
    marker.token !== expectedMarker.token
  ) {
    throw new Error(`refusing to remove staging tree without matching ownership: ${path}`);
  }
  return { marker, snapshot };
}

async function removeOwnedPackTree(path, expectedReference, expectedTarget) {
  const { marker } = await readMatchingAuxiliaryMarker(path, {
    kind: "laugh-tale-staging-packs",
    invocation: expectedReference.invocation,
    token: expectedReference.token,
  });
  const currentReference = await capturePackReference(path);
  if (
    !validPackMarker(marker, path) ||
    !samePackReference(currentReference, expectedReference) ||
    (expectedTarget !== undefined && marker.target !== expectedTarget)
  ) {
    throw new Error(`refusing to remove pack tree without exact ownership: ${path}`);
  }
  const allowed = new Set([auxiliaryMarkerName, ...marker.files]);
  const entries = await readdir(path, { withFileTypes: true });
  if (
    entries.some(
      (entry) =>
        !allowed.has(entry.name) ||
        entry.isDirectory() ||
        entry.isSymbolicLink() ||
        (!entry.isFile() && entry.name !== auxiliaryMarkerName),
    )
  ) {
    throw new Error(`refusing to remove pack tree with unknown contents: ${path}`);
  }
  for (const file of marker.files) await unlink(join(path, file)).catch(missingOnly);
  const remaining = await readdir(path);
  if (remaining.some((entry) => entry !== auxiliaryMarkerName)) {
    throw new Error(`refusing to remove pack tree with unknown remaining contents: ${path}`);
  }
  await unlink(join(path, auxiliaryMarkerName));
  await rmdir(path);
}

function missingOnly(error) {
  if (error?.code !== "ENOENT") throw error;
}

async function removeOwnedCandidateTree(path, expectedMarker) {
  await assertRealPathComponents(path);
  const snapshot = await readMarkerSnapshot(join(path, consumerMarkerName));
  if (
    !isConsumerMarker(snapshot?.marker, resolve(repositoryTmpRoot, expectedMarker.target)) ||
    snapshot.marker.invocation !== expectedMarker.invocation ||
    snapshot.source !== expectedMarker.source
  ) {
    throw new Error(`refusing to remove candidate without exact ownership: ${path}`);
  }
  await rm(path, REMOVE_TREE_OPTIONS);
}

async function removeOwnedWorkTree(path, expectedMarker, candidateMarker) {
  await readMatchingAuxiliaryMarker(path, expectedMarker);
  const entries = await readdir(path);
  const allowed = new Set([auxiliaryMarkerName, ...(candidateMarker === undefined ? [] : ["consumer"])]);
  if (entries.some((entry) => !allowed.has(entry))) {
    throw new Error(`refusing to remove work tree with unknown contents: ${path}`);
  }
  if (entries.includes("consumer")) {
    if (candidateMarker === undefined) {
      throw new Error(`refusing to remove unverified candidate tree: ${path}`);
    }
    await removeOwnedCandidateTree(join(path, "consumer"), candidateMarker);
  }
  await unlink(join(path, auxiliaryMarkerName));
  await rmdir(path);
}

function run(command, commandArguments, cwd, testOperations) {
  const observation = { command, commandArguments: [...commandArguments], cwd };
  testOperations?.onCommand?.(observation);
  const startedAt = Date.now();
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
  testOperations?.onCommandComplete?.({
    ...observation,
    durationMs: Date.now() - startedAt,
    status: result.status,
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
        { cause: releaseError },
      );
    }
    throw releaseError;
  }
  if (operationError !== undefined) throw operationError;
  return result;
}

function validArtifactLockOwner(owner) {
  return (
    owner?.kind === "laugh-tale-artifact-cleanup-lock" &&
    owner.version === 1 &&
    typeof owner.token === "string" &&
    owner.token.length > 0 &&
    Number.isInteger(owner.pid) &&
    owner.pid > 0 &&
    Number.isFinite(owner.createdAt)
  );
}

async function captureArtifactLock() {
  const directoryStat = await lstat(artifactLockRoot);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error("staging artifact lock path is not a real directory");
  }
  const ownerSnapshot = await readMarkerSnapshot(join(artifactLockRoot, lockOwnerName));
  if (ownerSnapshot !== undefined && !validArtifactLockOwner(ownerSnapshot.marker)) {
    throw new Error("staging artifact lock has invalid ownership metadata");
  }
  const currentStat = await lstat(artifactLockRoot);
  if (!sameIdentity(identityFor(directoryStat), identityFor(currentStat))) {
    throw new Error("staging artifact lock identity changed while it was inspected");
  }
  return {
    directoryIdentity: identityFor(directoryStat),
    ownerSnapshot,
  };
}

async function rollbackRenamedArtifactLock(removalPath, cause) {
  if ((await statMaybe(artifactLockRoot)) !== undefined) {
    throw new AggregateError(
      [cause],
      `staging artifact lock changed during retirement; preserved unknown lock at ${removalPath}`,
    );
  }
  try {
    await rename(removalPath, artifactLockRoot);
  } catch (rollbackError) {
    throw new AggregateError(
      [cause, rollbackError],
      `staging artifact lock changed during retirement and could not be restored from ${removalPath}`,
      { cause: rollbackError },
    );
  }
  throw cause;
}

async function removeCapturedArtifactLock(captured, removalPath) {
  await rename(artifactLockRoot, removalPath);
  try {
    const removalStat = await lstat(removalPath);
    if (
      removalStat.isSymbolicLink() ||
      !removalStat.isDirectory() ||
      !sameIdentity(identityFor(removalStat), captured.directoryIdentity)
    ) {
      throw new Error("staging artifact lock directory identity changed before retirement");
    }
    const ownerSnapshot = await readMarkerSnapshot(join(removalPath, lockOwnerName));
    if (
      (captured.ownerSnapshot === undefined) !== (ownerSnapshot === undefined) ||
      (captured.ownerSnapshot !== undefined &&
        (!sameIdentity(captured.ownerSnapshot.identity, ownerSnapshot?.identity) ||
          captured.ownerSnapshot.source !== ownerSnapshot?.source))
    ) {
      throw new Error("staging artifact lock owner identity changed before retirement");
    }
    const entries = await readdir(removalPath);
    const expectedEntries = captured.ownerSnapshot === undefined ? [] : [lockOwnerName];
    if (
      entries.length !== expectedEntries.length ||
      entries.some((entry) => !expectedEntries.includes(entry))
    ) {
      throw new Error("staging artifact lock contains unknown files at retirement");
    }
  } catch (error) {
    await rollbackRenamedArtifactLock(removalPath, error);
  }
  if (captured.ownerSnapshot !== undefined) await unlink(join(removalPath, lockOwnerName));
  await rmdir(removalPath);
}

async function acquireArtifactLock(testOperations) {
  await ensureRealDirectoryBelowTmp(repositoryTmpRoot);
  const token = randomUUID();
  const timeoutMs = testOperations?.artifactLockTimeoutMs ?? 120_000;
  const pollMs = testOperations?.artifactLockPollMs ?? 75;
  const staleMs = testOperations?.artifactLockStaleMs ?? 300_000;
  const deadOwnerGraceMs = testOperations?.artifactLockDeadOwnerGraceMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    try {
      await mkdir(artifactLockRoot);
      const owner = {
        kind: "laugh-tale-artifact-cleanup-lock",
        version: 1,
        token,
        pid: process.pid,
        createdAt: Date.now(),
      };
      try {
        await writeFile(join(artifactLockRoot, lockOwnerName), `${JSON.stringify(owner)}\n`, {
          flag: "wx",
        });
        const captured = await captureArtifactLock();
        return async () => {
          const removalPath = join(
            repositoryTmpRoot,
            `.stage-starter-artifact.release-${token}`,
          );
          await removeCapturedArtifactLock(captured, removalPath);
        };
      } catch (error) {
        await rmdir(artifactLockRoot).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }

    const captured = await captureArtifactLock();
    const owner = captured.ownerSnapshot?.marker;
    const ownerIsDead =
      validArtifactLockOwner(owner) &&
      !(testOperations?.isProcessAlive ?? processIsAlive)(owner.pid);
    if (ownerIsDead && Date.now() - owner.createdAt > deadOwnerGraceMs) {
      const stalePath = join(
        repositoryTmpRoot,
        `.stage-starter-artifact.stale-${token}`,
      );
      await removeCapturedArtifactLock(captured, stalePath);
      continue;
    }
    if (
      owner === undefined &&
      Date.now() - (await lstat(artifactLockRoot)).mtimeMs > staleMs
    ) {
      const stalePath = join(
        repositoryTmpRoot,
        `.stage-starter-artifact.stale-${token}`,
      );
      await removeCapturedArtifactLock(captured, stalePath);
      continue;
    }
    await wait(pollMs);
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for the staging artifact cleanup lock`);
}

async function withArtifactLock(
  testOperations,
  operation,
  { phase = "unspecified", releaseContext = {}, onReleaseError } = {},
) {
  const release = await acquireArtifactLock(testOperations);
  let result;
  let operationError;
  let releaseError;
  try {
    result = await operation();
  } catch (error) {
    operationError = error;
  }
  try {
    await testOperations?.beforeArtifactLockRelease?.({ phase, ...releaseContext });
  } catch (error) {
    releaseError = error;
  }
  try {
    await release();
  } catch (error) {
    releaseError =
      releaseError === undefined
        ? error
        : new AggregateError(
            [releaseError, error],
            "artifact-lock release hook and retirement both failed",
          );
  }
  if (releaseError !== undefined) {
    if (operationError !== undefined) {
      throw new AggregateError(
        [operationError, releaseError],
        "staging operation and artifact-lock release both failed",
      );
    }
    if (onReleaseError !== undefined) {
      return onReleaseError(result, releaseError);
    }
    throw releaseError;
  }
  if (operationError !== undefined) throw operationError;
  return result;
}

async function packWorkspacePackages(packRoot, testOperations, onPacked) {
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
    await onPacked?.([...tarballs]);
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

async function writeConsumerMarker(stagedRoot, target, invocation, pack, exclusive = true) {
  const marker = {
    kind: "laugh-tale-staged-consumer",
    version: 1,
    target: normalizedRelative(target),
    invocation,
    pack,
  };
  const source = `${JSON.stringify(marker, null, 2)}\n`;
  await writeFile(join(stagedRoot, consumerMarkerName), source, {
    flag: exclusive ? "wx" : "w",
  });
  const snapshot = await readMarkerSnapshot(join(stagedRoot, consumerMarkerName));
  return { ...snapshot, invocation, marker, source, target: marker.target };
}

function sameTargetState(initial, current) {
  if (initial.state !== current.state) return false;
  if (!sameIdentity(initial.targetIdentity, current.targetIdentity)) return false;
  if (initial.state !== "owned") return true;
  return (
    initial.marker.target === current.marker.target &&
    initial.marker.invocation === current.marker.invocation &&
    sameIdentity(initial.markerSnapshot.identity, current.markerSnapshot.identity) &&
    initial.markerSnapshot.source === current.markerSnapshot.source
  );
}

function serializableTargetState(targetState) {
  return {
    state: targetState.state,
    targetIdentity: targetState.targetIdentity,
    marker: targetState.marker,
    markerIdentity: targetState.markerSnapshot?.identity,
    markerSource: targetState.markerSnapshot?.source,
  };
}

async function assertRenamedTargetIdentity(previous, targetState) {
  const previousStat = await lstat(previous);
  if (
    previousStat.isSymbolicLink() ||
    !previousStat.isDirectory() ||
    !sameIdentity(identityFor(previousStat), targetState.targetIdentity)
  ) {
    throw new Error("staging target directory identity changed before publication");
  }
  if (targetState.state === "empty") {
    if ((await readdir(previous)).length !== 0) {
      throw new Error("staging target empty-directory state changed before publication");
    }
    return;
  }
  if (targetState.state !== "owned") {
    throw new Error("staging target publication state is invalid");
  }
  const markerSnapshot = await readMarkerSnapshot(join(previous, consumerMarkerName));
  if (
    markerSnapshot === undefined ||
    !sameIdentity(markerSnapshot.identity, targetState.markerSnapshot.identity) ||
    markerSnapshot.source !== targetState.markerSnapshot.source
  ) {
    throw new Error("staging target ownership-marker identity changed before publication");
  }
}

function preserveWork(error) {
  if (error !== null && typeof error === "object") error.stagingPreserveWork = true;
  return error;
}

async function rollbackMovedTarget(previous, target, cause) {
  try {
    await assertRealPathComponents(previous);
    await assertRealPathComponents(target);
  } catch (pathError) {
    throw preserveWork(
      new AggregateError(
        [cause, pathError],
        "staging publication rollback refused because a path component changed",
      ),
    );
  }
  if ((await statMaybe(target)) !== undefined) {
    throw preserveWork(
      new AggregateError(
        [cause],
        "staging publication rollback refused because the target path was replaced",
      ),
    );
  }
  try {
    await rename(previous, target);
  } catch (rollbackError) {
    throw preserveWork(
      new AggregateError(
        [cause, rollbackError],
        "staging publication failed and the prior target could not be restored",
      ),
    );
  }
  throw cause;
}

async function removeAuthorizedPrevious(previous, targetState) {
  await assertRealPathComponents(previous);
  await assertRenamedTargetIdentity(previous, targetState);
  if (targetState.state === "owned") {
    await rm(previous, REMOVE_TREE_OPTIONS);
    return;
  }
  await rmdir(previous);
}

async function publishCandidate({
  candidate,
  targetState,
  workRoot,
  markPublished,
  testOperations,
}) {
  await ensureRealDirectoryBelowTmp(dirname(targetState.target));
  const currentState = await validateStagingTarget(targetState.target);
  if (!sameTargetState(targetState, currentState)) {
    throw new Error("staging target changed while the replacement consumer was prepared");
  }
  await testOperations?.afterTargetRevalidated?.({ target: targetState.target });
  await assertRealPathComponents(targetState.target);

  const previous = join(workRoot, "previous");
  if (currentState.state !== "missing") {
    await rename(currentState.target, previous);
    try {
      await assertRenamedTargetIdentity(previous, currentState);
    } catch (error) {
      await rollbackMovedTarget(previous, currentState.target, error);
    }
  }
  try {
    await testOperations?.beforeCandidateRename?.({
      candidate,
      previous: currentState.state === "missing" ? undefined : previous,
    });
    await assertRealPathComponents(candidate);
    await assertRealPathComponents(currentState.target);
    await rename(candidate, currentState.target);
    markPublished();
  } catch (error) {
    if (currentState.state !== "missing") {
      await rollbackMovedTarget(previous, currentState.target, error);
    }
    throw error;
  }

  if (currentState.state !== "missing") {
    try {
      await testOperations?.beforePreviousCleanup?.({ previous });
      await removeAuthorizedPrevious(previous, currentState);
    } catch (error) {
      return {
        cleanupPending: [workRoot],
        cleanupWarnings: [
          `published consumer; prior-output cleanup remains pending: ${error instanceof Error ? error.message : String(error)}`,
        ],
        previousRemoved: false,
      };
    }
  }
  return { cleanupPending: [], cleanupWarnings: [], previousRemoved: true };
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

function targetStateFromWorkMarker(marker) {
  const target = resolve(repositoryTmpRoot, marker.target);
  relativeStagingPath(target);
  const prior = marker.prior;
  if (
    prior === undefined ||
    !["missing", "empty", "owned"].includes(prior.state) ||
    (prior.state === "missing" && prior.targetIdentity !== undefined) ||
    (prior.state !== "missing" &&
      (typeof prior.targetIdentity?.dev !== "string" ||
        typeof prior.targetIdentity?.ino !== "string")) ||
    (prior.state === "owned" &&
      (typeof prior.markerSource !== "string" ||
        typeof prior.markerIdentity?.dev !== "string" ||
        typeof prior.markerIdentity?.ino !== "string" ||
        !isConsumerMarker(prior.marker, target)))
  ) {
    throw new Error("staging work marker has invalid prior-target ownership");
  }
  return {
    target,
    relativeTarget: relative(repositoryTmpRoot, target),
    state: prior.state,
    marker: prior.marker,
    markerSnapshot:
      prior.state === "owned"
        ? { identity: prior.markerIdentity, marker: prior.marker, source: prior.markerSource }
        : undefined,
    targetIdentity: prior.targetIdentity,
  };
}

async function packIsReferenced(marker, reference) {
  let target;
  try {
    target = resolve(repositoryTmpRoot, marker.target);
    relativeStagingPath(target);
    await assertRealPathComponents(target);
  } catch {
    return false;
  }
  const targetStat = await statMaybe(target);
  if (targetStat === undefined || !targetStat.isDirectory() || targetStat.isSymbolicLink()) {
    return false;
  }
  let snapshot;
  try {
    snapshot = await readMarkerSnapshot(join(target, consumerMarkerName));
  } catch {
    return false;
  }
  return (
    isConsumerMarker(snapshot?.marker, target) &&
    samePackReference(snapshot.marker.pack, reference)
  );
}

async function reclaimOrphanPack(path, marker) {
  const reference = await capturePackReference(path);
  if (await packIsReferenced(marker, reference)) return false;
  await removeOwnedPackTree(path, reference, marker.target);
  return true;
}

async function removeWorkMarkerOnly(path) {
  await assertRealPathComponents(path);
  const remaining = await readdir(path);
  if (remaining.some((entry) => entry !== auxiliaryMarkerName)) {
    throw new Error(`refusing to remove work tree with unknown remaining contents: ${path}`);
  }
  await unlink(join(path, auxiliaryMarkerName));
  await rmdir(path);
}

async function removePriorPackForTargetState(targetState) {
  if (targetState.marker?.pack === undefined) return;
  const priorPackPath = packPathForReference(targetState.marker.pack);
  if ((await statMaybe(priorPackPath)) === undefined) return;
  await removeOwnedPackTree(
    priorPackPath,
    targetState.marker.pack,
    targetState.marker.target,
  );
}

async function reclaimOrphanWork(path, marker) {
  await assertRealPathComponents(path);
  const entries = await readdir(path);
  if (entries.some((entry) => ![auxiliaryMarkerName, "consumer", "previous"].includes(entry))) {
    return false;
  }
  const targetState = targetStateFromWorkMarker(marker);
  await assertRealPathComponents(targetState.target);
  const candidatePath = join(path, "consumer");
  const previousPath = join(path, "previous");
  const candidateExists = entries.includes("consumer");
  const previousExists = entries.includes("previous");
  let candidateMarker;
  if (candidateExists) {
    await assertRealPathComponents(candidatePath);
    const snapshot = await readMarkerSnapshot(join(candidatePath, consumerMarkerName));
    if (
      !isConsumerMarker(snapshot?.marker, targetState.target) ||
      snapshot.marker.invocation !== marker.invocation
    ) {
      return false;
    }
    candidateMarker = { ...snapshot, invocation: marker.invocation, target: marker.target };
  }

  if (previousExists) {
    await assertRealPathComponents(previousPath);
    try {
      await assertRenamedTargetIdentity(previousPath, targetState);
    } catch {
      return false;
    }
    await assertRealPathComponents(targetState.target);
    const targetStat = await statMaybe(targetState.target);
    if (targetStat === undefined) {
      await assertRealPathComponents(previousPath);
      await assertRealPathComponents(targetState.target);
      await rename(previousPath, targetState.target);
    } else {
      let currentSnapshot;
      try {
        currentSnapshot = await readMarkerSnapshot(join(targetState.target, consumerMarkerName));
      } catch {
        return false;
      }
      if (
        !isConsumerMarker(currentSnapshot?.marker, targetState.target) ||
        currentSnapshot.marker.invocation !== marker.invocation
      ) {
        return false;
      }
      await removeAuthorizedPrevious(previousPath, targetState);
      try {
        await removePriorPackForTargetState(targetState);
      } catch {
        return false;
      }
    }
  }

  if (!previousExists && !candidateExists && targetState.marker?.pack !== undefined) {
    let currentSnapshot;
    try {
      await assertRealPathComponents(targetState.target);
      currentSnapshot = await readMarkerSnapshot(join(targetState.target, consumerMarkerName));
    } catch {
      return false;
    }
    if (!isConsumerMarker(currentSnapshot?.marker, targetState.target)) return false;
    if (currentSnapshot.marker.invocation === marker.invocation) {
      try {
        await removePriorPackForTargetState(targetState);
      } catch {
        return false;
      }
    } else if (currentSnapshot.marker.invocation !== targetState.marker.invocation) {
      return false;
    }
  }

  if (candidateExists) await removeOwnedCandidateTree(candidatePath, candidateMarker);
  await removeWorkMarkerOnly(path);
  return true;
}

function artifactOwnerIsExpired(marker, testOperations) {
  const graceMs = testOperations?.artifactGraceMs ?? 300_000;
  const isAlive = testOperations?.isProcessAlive ?? processIsAlive;
  const referenceTime = marker.releasedAt ?? marker.createdAt;
  if (Date.now() - referenceTime < graceMs) return false;
  return marker.status === "cleanup-pending" || !isAlive(marker.pid);
}

async function reclaimOrphanedStagingArtifactsUnlocked(testOperations = {}) {
  const removed = [];
  const preserved = [];
  const protectedPackPaths = new Set();
  await ensureRealDirectoryBelowTmp(repositoryTmpRoot);

  const protectPackReference = (reference) => {
    if (reference === undefined) return;
    try {
      protectedPackPaths.add(packPathForReference(reference));
    } catch {
      // Invalid references cannot authorize deletion or identify a managed pack.
    }
  };

  const inspectWork = async (path) => {
    let snapshot;
    let marker;
    const workClaims = [];
    try {
      await assertRealPathComponents(path);
      snapshot = await readMarkerSnapshot(join(path, auxiliaryMarkerName));
      marker = snapshot?.marker;
      if (!validArtifactMarker(marker, "laugh-tale-staging-work", path)) {
        preserved.push(path);
        return;
      }
      const targetState = targetStateFromWorkMarker(marker);
      if (targetState.marker?.pack !== undefined) workClaims.push(targetState.marker.pack);
      const entries = await readdir(path);
      if (entries.includes("consumer")) {
        const candidatePath = join(path, "consumer");
        try {
          await assertRealPathComponents(candidatePath);
          const candidateSnapshot = await readMarkerSnapshot(
            join(candidatePath, consumerMarkerName),
          );
          if (
            isConsumerMarker(candidateSnapshot?.marker, targetState.target) &&
            candidateSnapshot.marker.invocation === marker.invocation &&
            candidateSnapshot.marker.pack !== undefined
          ) {
            workClaims.push(candidateSnapshot.marker.pack);
          }
        } catch {
          // The work tree itself remains preserved; known prior claims still protect packs.
        }
      }

      if (!artifactOwnerIsExpired(marker, testOperations)) {
        preserved.push(path);
        for (const claim of workClaims) protectPackReference(claim);
        return;
      }
      const wasRemoved = await reclaimOrphanWork(path, marker);
      (wasRemoved ? removed : preserved).push(path);
      if (!wasRemoved) for (const claim of workClaims) protectPackReference(claim);
    } catch {
      preserved.push(path);
      for (const claim of workClaims) protectPackReference(claim);
    }
  };

  const tmpEntries = await readdir(repositoryTmpRoot, { withFileTypes: true });
  for (const entry of tmpEntries) {
    if (!entry.name.startsWith(".stage-starter-work-")) continue;
    const path = join(repositoryTmpRoot, entry.name);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      preserved.push(path);
      continue;
    }
    await inspectWork(path);
  }

  const packBaseStat = await statMaybe(packBaseRoot);
  if (packBaseStat?.isDirectory() && !packBaseStat.isSymbolicLink()) {
    await assertRealPathComponents(packBaseRoot);
    for (const entry of await readdir(packBaseRoot, { withFileTypes: true })) {
      const path = join(packBaseRoot, entry.name);
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        preserved.push(path);
        continue;
      }
      if (protectedPackPaths.has(path)) {
        preserved.push(path);
        continue;
      }
      try {
        await assertRealPathComponents(path);
        const snapshot = await readMarkerSnapshot(join(path, auxiliaryMarkerName));
        const marker = snapshot?.marker;
        if (
          !validPackMarker(marker, path) ||
          !artifactOwnerIsExpired(marker, testOperations)
        ) {
          preserved.push(path);
          continue;
        }
        const wasRemoved = await reclaimOrphanPack(path, marker);
        (wasRemoved ? removed : preserved).push(path);
      } catch {
        preserved.push(path);
      }
    }
  }
  return { removed, preserved };
}

export async function reclaimOrphanedStagingArtifacts(testOperations = {}) {
  return withArtifactLock(
    testOperations,
    () => reclaimOrphanedStagingArtifactsUnlocked(testOperations),
    { phase: "reclaim" },
  );
}

export async function stageStarterConsumer(
  { install = true, outDir, recipe, recipeCatalogRoot } = {},
  testOperations = {},
) {
  const requestedTarget = outDir === undefined ? defaultStagedRoot : resolve(outDir);
  const invocation = randomUUID();
  const workRoot = join(repositoryTmpRoot, `.stage-starter-work-${invocation}`);
  const candidate = join(workRoot, "consumer");
  const packRoot = join(packBaseRoot, invocation);
  let targetState;
  let workMarker;
  let packMarker;
  let packReference;
  let workCreated = false;
  let packCreated = false;
  let published = false;
  let candidateMarker;

  try {
    await reclaimOrphanedStagingArtifacts(testOperations);
    await withArtifactLock(
      testOperations,
      async () => {
        targetState = await validateStagingTarget(requestedTarget);
        workMarker = {
          kind: "laugh-tale-staging-work",
          version: artifactMarkerVersion,
          invocation,
          token: randomUUID(),
          path: normalizedRelative(workRoot),
          target: normalizedRelative(targetState.target),
          pid: process.pid,
          createdAt: Date.now(),
          prior: serializableTargetState(targetState),
        };
        packMarker = {
          kind: "laugh-tale-staging-packs",
          version: artifactMarkerVersion,
          invocation,
          token: randomUUID(),
          path: normalizedRelative(packRoot),
          target: normalizedRelative(targetState.target),
          pid: process.pid,
          createdAt: Date.now(),
          files: [],
        };
        packReference = packReferenceFor(packMarker);
        await createAuxiliaryDirectory(workRoot, workMarker);
        workCreated = true;
      },
      { phase: "work-initialization", releaseContext: { workRoot } },
    );
    await composeStarter({ stagedRoot: candidate, recipe, recipeCatalogRoot });
    candidateMarker = await writeConsumerMarker(
      candidate,
      targetState.target,
      invocation,
      packReference,
    );

    const packaged = await withPackageLock(testOperations, async () => {
      await ensureRealDirectoryBelowTmp(packBaseRoot);
      await createAuxiliaryDirectory(packRoot, packMarker);
      packCreated = true;
      const tarballs = await packWorkspacePackages(packRoot, testOperations, async (packed) => {
        packMarker.files = packed.map((tarball) => basename(tarball));
        await updateAuxiliaryMarker(packRoot, packMarker);
      });
      return { packReference: await capturePackReference(packRoot), tarballs };
    });
    const { tarballs } = packaged;
    packReference = packaged.packReference;
    candidateMarker = await writeConsumerMarker(
      candidate,
      targetState.target,
      invocation,
      packReference,
      false,
    );

    await rewriteManifest(candidate, tarballs);
    if (install) {
      run("npm", ["install", "--no-audit", "--no-fund"], candidate, testOperations);
    }
    return await withArtifactLock(
      testOperations,
      async () => {
        const publication = await publishCandidate({
          candidate,
          targetState,
          workRoot,
          testOperations,
          markPublished: () => {
            published = true;
          },
        });
        const cleanupPending = [...publication.cleanupPending];
        const cleanupWarnings = [...publication.cleanupWarnings];

        if (publication.previousRemoved && targetState.marker?.pack !== undefined) {
          try {
            const previousPackRoot = packPathForReference(targetState.marker.pack);
            await testOperations?.beforePreviousPackCleanup?.({ packRoot: previousPackRoot });
            await removePriorPackForTargetState(targetState);
          } catch (error) {
            let pendingPath;
            try {
              pendingPath = packPathForReference(targetState.marker.pack);
            } catch {
              pendingPath = undefined;
            }
            if (pendingPath !== undefined) cleanupPending.push(pendingPath);
            if (!cleanupPending.includes(workRoot)) cleanupPending.push(workRoot);
            cleanupWarnings.push(
              `published consumer; prior-pack cleanup remains pending: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        if (!cleanupPending.includes(workRoot)) {
          try {
            await removeOwnedWorkTree(workRoot, workMarker, candidateMarker);
            workCreated = false;
          } catch (error) {
            cleanupPending.push(workRoot);
            cleanupWarnings.push(
              `published consumer; staging-work cleanup remains pending: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        if (cleanupPending.includes(workRoot)) {
          workMarker.status = "cleanup-pending";
          workMarker.releasedAt = Date.now();
          try {
            await updateAuxiliaryMarker(workRoot, workMarker);
          } catch (error) {
            cleanupWarnings.push(
              `published consumer; could not record retryable work cleanup: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        return {
          stagedRoot: targetState.target,
          tarballs,
          ...(cleanupPending.length === 0 ? {} : { cleanupPending }),
          ...(cleanupWarnings.length === 0 ? {} : { cleanupWarnings }),
        };
      },
      {
        phase: "publication",
        releaseContext: { workRoot, target: targetState.target },
        onReleaseError: (result, error) => {
          if (!published) throw error;
          return {
            ...result,
            cleanupPending: [...new Set([...(result.cleanupPending ?? []), artifactLockRoot])],
            cleanupWarnings: [
              ...(result.cleanupWarnings ?? []),
              `published consumer; artifact-lock cleanup remains pending: ${error instanceof Error ? error.message : String(error)}`,
            ],
          };
        },
      },
    );
  } catch (error) {
    const cleanupErrors = [];
    if (!published && (packCreated || workCreated)) {
      try {
        await withArtifactLock(
          testOperations,
          async () => {
            if (error?.stagingPreserveWork && workCreated) {
              workMarker.status = "cleanup-pending";
              workMarker.releasedAt = Date.now();
              await updateAuxiliaryMarker(workRoot, workMarker);
              return;
            }
            if (packCreated) {
              const cleanupReference = await capturePackReference(packRoot);
              await removeOwnedPackTree(packRoot, cleanupReference, packMarker.target);
            }
            if (workCreated) {
              await removeOwnedWorkTree(workRoot, workMarker, candidateMarker);
              workCreated = false;
            }
          },
          { phase: "failure-cleanup", releaseContext: { workRoot } },
        );
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError([error, ...cleanupErrors], "staging failed and owned cleanup failed", {
        cause: error,
      });
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
