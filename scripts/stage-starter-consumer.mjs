import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  open,
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
import { readProjectFileSet, recoverProjectFileTransaction } from "../plugins/eternal-pose/lib/atomic-publication.mjs";
import { projectSnapshot } from "../plugins/eternal-pose/scripts/validate-trip-project.mjs";
import { parseTripProjectManifest, assertManifestMatchesLedger } from "../plugins/eternal-pose/lib/project-manifest-v2.mjs";
import { parseTripProjectInputV2 } from "../plugins/eternal-pose/lib/trip-project-input-v2.mjs";
import { parsePlaceResolutionLedger } from "../plugins/eternal-pose/lib/place-resolution-ledger.mjs";
import { assertOakWashiPresentationIdentity } from "./sync-oak-washi-starter-presentation.mjs";

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
const candidateAttestationName = ".laugh-tale-local-candidates.json";
const auxiliaryMarkerName = ".laugh-tale-staging-owner.json";
const lockOwnerName = "owner.json";
const artifactMarkerVersion = 2;
const PACKAGE_BUILD_ORDER = ["core", "react", "adapters", "testing"];
const INTERNAL_PACKAGE_PREFIX = "@laugh-tale-island/";
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

function fileStateFor(stat) {
  return {
    ...identityFor(stat),
    ctimeNs: String(stat.ctimeNs),
    mtimeNs: String(stat.mtimeNs),
    nlink: String(stat.nlink),
    size: String(stat.size),
  };
}

function sameFileState(left, right) {
  return (
    sameIdentity(left, right) &&
    left?.ctimeNs === right?.ctimeNs &&
    left?.mtimeNs === right?.mtimeNs &&
    left?.nlink === right?.nlink &&
    left?.size === right?.size
  );
}

async function readHandleContents(handle, size, label) {
  if (size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} is too large to inspect safely`);
  }
  const contents = Buffer.alloc(Number(size));
  let offset = 0;
  while (offset < contents.byteLength) {
    const { bytesRead } = await handle.read(
      contents,
      offset,
      contents.byteLength - offset,
      offset,
    );
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  if (offset !== contents.byteLength) {
    throw new Error(`${label} changed length while inspected`);
  }
  return contents;
}

async function openRealFileSnapshot(path, label, afterRead) {
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    if (error?.code === "ELOOP") {
      throw new Error(`${label} must be a real file: ${path}`, { cause: error });
    }
    throw error;
  }
  try {
    const initialStat = await handle.stat({ bigint: true });
    if (!initialStat.isFile() || initialStat.isSymbolicLink()) {
      throw new Error(`${label} must be a real file: ${path}`);
    }
    const contents = await readHandleContents(handle, initialStat.size, label);
    await afterRead?.();
    const currentStat = await handle.stat({ bigint: true });
    const pathStat = await lstat(path, { bigint: true });
    const state = fileStateFor(initialStat);
    if (
      !currentStat.isFile() ||
      pathStat.isSymbolicLink() ||
      !pathStat.isFile() ||
      !sameFileState(state, fileStateFor(currentStat)) ||
      !sameFileState(state, fileStateFor(pathStat))
    ) {
      throw new Error(`${label} identity or contents changed while inspected: ${path}`);
    }
    return {
      contents,
      handle,
      identity: identityFor(initialStat),
      state,
    };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function verifyOpenFileSnapshot(opened, path, label) {
  const initialStat = await opened.handle.stat({ bigint: true });
  const contents = await readHandleContents(opened.handle, initialStat.size, label);
  const currentStat = await opened.handle.stat({ bigint: true });
  let pathStat;
  try {
    pathStat = await lstat(path, { bigint: true });
  } catch (error) {
    throw new Error(`${label} path changed while inspected: ${path}`, { cause: error });
  }
  if (
    !initialStat.isFile() ||
    !currentStat.isFile() ||
    pathStat.isSymbolicLink() ||
    !pathStat.isFile() ||
    !sameFileState(opened.state, fileStateFor(initialStat)) ||
    !sameFileState(opened.state, fileStateFor(currentStat)) ||
    !sameFileState(opened.state, fileStateFor(pathStat)) ||
    !contents.equals(opened.contents)
  ) {
    throw new Error(`${label} identity or contents changed after validation: ${path}`);
  }
  return opened;
}

async function recaptureRenamedOpenFileSnapshot(opened, path, label) {
  const initialStat = await opened.handle.stat({ bigint: true });
  const contents = await readHandleContents(opened.handle, initialStat.size, label);
  const currentStat = await opened.handle.stat({ bigint: true });
  const pathStat = await lstat(path, { bigint: true });
  const state = fileStateFor(initialStat);
  if (
    !initialStat.isFile() ||
    !currentStat.isFile() ||
    pathStat.isSymbolicLink() ||
    !pathStat.isFile() ||
    !sameIdentity(opened.identity, identityFor(initialStat)) ||
    !sameFileState(state, fileStateFor(currentStat)) ||
    !sameFileState(state, fileStateFor(pathStat)) ||
    !contents.equals(opened.contents)
  ) {
    throw new Error(`${label} identity or contents changed across quarantine: ${path}`);
  }
  opened.state = state;
  return opened;
}

function markerSnapshotFromOpenedFile(opened) {
  const source = opened.contents.toString("utf8");
  let marker;
  try {
    marker = JSON.parse(source);
  } catch {
    marker = undefined;
  }
  return { identity: opened.identity, marker, source, state: opened.state };
}

async function readMarkerSnapshot(path) {
  const opened = await openRealFileSnapshot(path, "staging ownership marker");
  if (opened === undefined) return undefined;
  const snapshot = markerSnapshotFromOpenedFile(opened);
  await opened.handle.close();
  return snapshot;
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
    new Set(marker.files).size === marker.files.length &&
    (marker.artifacts === undefined ||
      (Array.isArray(marker.artifacts) &&
        marker.artifacts.every(
          (artifact) =>
            artifact !== null &&
            typeof artifact === "object" &&
            typeof artifact.digest === "string" &&
            artifact.digest.length > 0 &&
            typeof artifact.filename === "string" &&
            marker.files.includes(artifact.filename) &&
            typeof artifact.identity?.dev === "string" &&
            typeof artifact.identity?.ino === "string" &&
            typeof artifact.integrity === "string" &&
            artifact.integrity === `sha512-${artifact.digest}` &&
            typeof artifact.name === "string" &&
            artifact.name.startsWith(INTERNAL_PACKAGE_PREFIX) &&
            Number.isSafeInteger(artifact.size) &&
            artifact.size >= 0 &&
            typeof artifact.version === "string" &&
            artifact.version.length > 0,
        ) &&
        new Set(marker.artifacts.map((artifact) => artifact.filename)).size ===
          marker.artifacts.length &&
        new Set(
          marker.artifacts.map(
            (artifact) => `${artifact.identity.dev}:${artifact.identity.ino}`,
          ),
        ).size === marker.artifacts.length))
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
  for (const artifact of marker.artifacts ?? []) {
    await revalidateTarballArtifact(
      { ...artifact, path: join(path, artifact.filename) },
      path,
    );
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
  const output =
    testOperations?.transformCommandOutput?.({ ...observation, stdout: result.stdout }) ??
    result.stdout;
  if (typeof output !== "string") {
    throw new Error("staging command-output transform must return a string");
  }
  return output;
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

function lockChanged(message, cause) {
  const error = new Error(message, { cause });
  error.code = "ESTAGINGLOCKCHANGED";
  return error;
}

function sameMarkerSnapshot(left, right) {
  return (
    (left === undefined) === (right === undefined) &&
    (left === undefined ||
      (sameIdentity(left.identity, right?.identity) &&
        sameFileState(left.state, right?.state) &&
        left.source === right?.source))
  );
}

async function captureLock(lockRoot, validOwner, label) {
  let directoryStat;
  try {
    directoryStat = await lstat(lockRoot);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw lockChanged(`${label} disappeared while inspected`, error);
    }
    throw error;
  }
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error(`${label} path is not a real directory`);
  }
  let ownerSnapshot;
  try {
    ownerSnapshot = await readMarkerSnapshot(join(lockRoot, lockOwnerName));
  } catch (error) {
    if (
      error?.code === "ENOENT" ||
      (error instanceof Error && error.message.includes("identity changed while it was inspected"))
    ) {
      throw lockChanged(`${label} owner changed while inspected`, error);
    }
    throw error;
  }
  if (ownerSnapshot !== undefined && !validOwner(ownerSnapshot.marker)) {
    throw new Error(`${label} has invalid ownership metadata`);
  }
  let currentStat;
  try {
    currentStat = await lstat(lockRoot);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw lockChanged(`${label} disappeared while inspected`, error);
    }
    throw error;
  }
  if (!sameIdentity(identityFor(directoryStat), identityFor(currentStat))) {
    throw lockChanged(`${label} identity changed while it was inspected`);
  }
  return {
    directoryIdentity: identityFor(directoryStat),
    directoryMtimeMs: directoryStat.mtimeMs,
    ownerSnapshot,
  };
}

async function rollbackRenamedLock(lockRoot, removalPath, label, cause) {
  if ((await statMaybe(lockRoot)) !== undefined) {
    throw new AggregateError(
      [cause],
      `${label} changed during retirement; preserved unknown lock at ${removalPath}`,
    );
  }
  try {
    await rename(removalPath, lockRoot);
  } catch (rollbackError) {
    throw new AggregateError(
      [cause, rollbackError],
      `${label} changed during retirement and could not be restored from ${removalPath}`,
      { cause: rollbackError },
    );
  }
  throw cause;
}

function preserveLockQuarantine(error, label) {
  const cause = error instanceof Error ? error : new Error(String(error));
  const preserved = new Error(`${label} owner changed during retirement; preserved quarantine`, {
    cause,
  });
  preserved.stagingPreserveLockQuarantine = true;
  return preserved;
}

async function removeCapturedLock(
  lockRoot,
  captured,
  removalPath,
  label,
  { testOperations, lockKind, reason },
) {
  try {
    await rename(lockRoot, removalPath);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  let openedOwner;
  let ownerQuarantinePath;
  try {
    const removalStat = await lstat(removalPath);
    if (
      removalStat.isSymbolicLink() ||
      !removalStat.isDirectory() ||
      !sameIdentity(identityFor(removalStat), captured.directoryIdentity)
    ) {
      throw new Error(`${label} directory identity changed before retirement`);
    }
    const ownerPath = join(removalPath, lockOwnerName);
    openedOwner = await openRealFileSnapshot(ownerPath, `${label} owner`);
    const ownerSnapshot =
      openedOwner === undefined ? undefined : markerSnapshotFromOpenedFile(openedOwner);
    if (!sameMarkerSnapshot(captured.ownerSnapshot, ownerSnapshot)) {
      throw new Error(`${label} owner identity changed before retirement`);
    }
    if (ownerSnapshot !== undefined) {
      await testOperations?.afterLockOwnerValidated?.({
        lockKind,
        reason,
        removalPath,
        ownerPath: join(removalPath, lockOwnerName),
      });
      try {
        await verifyOpenFileSnapshot(openedOwner, ownerPath, `${label} owner`);
      } catch (error) {
        throw preserveLockQuarantine(error, label);
      }
    }
    const entries = await readdir(removalPath);
    const expectedEntries = captured.ownerSnapshot === undefined ? [] : [lockOwnerName];
    if (
      entries.length !== expectedEntries.length ||
      entries.some((entry) => !expectedEntries.includes(entry))
    ) {
      throw new Error(`${label} contains unknown files at retirement`);
    }
    if (openedOwner !== undefined) {
      ownerQuarantinePath = join(
        repositoryTmpRoot,
        `.stage-starter-${lockKind}.owner-retired-${randomUUID()}`,
      );
      await rename(ownerPath, ownerQuarantinePath);
      try {
        await recaptureRenamedOpenFileSnapshot(
          openedOwner,
          ownerQuarantinePath,
          `${label} owner`,
        );
      } catch (error) {
        throw preserveLockQuarantine(error, label);
      }
      await openedOwner.handle.close();
      openedOwner = undefined;
      await unlink(ownerQuarantinePath);
      ownerQuarantinePath = undefined;
    }
  } catch (error) {
    if (openedOwner !== undefined) {
      await openedOwner.handle.close().catch(() => {});
    }
    if (error?.stagingPreserveLockQuarantine) throw error;
    await rollbackRenamedLock(lockRoot, removalPath, label, error);
  }
  await rmdir(removalPath);
  return true;
}

async function publishLockOwner(lockRoot, owner, token, lockKind, testOperations) {
  // Let the existing wait/reclaim path apply its grace period to observed legacy
  // empty directories. The rename below arbitrates competing new publications.
  if ((await statMaybe(lockRoot)) !== undefined) return undefined;
  const privateRoot = join(
    repositoryTmpRoot,
    `.stage-starter-${lockKind}.owner-${token}-${randomUUID()}.pending`,
  );
  const pendingOwnerPath = join(privateRoot, lockOwnerName);
  const validOwner = lockKind === "package" ? validLockOwner : validArtifactLockOwner;
  const label = `staging ${lockKind} lock`;
  await mkdir(privateRoot);
  const directoryIdentity = identityFor(await lstat(privateRoot));
  let ownerSnapshot;
  let published = false;
  try {
    await writeFile(pendingOwnerPath, `${JSON.stringify(owner)}\n`, { flag: "wx" });
    ownerSnapshot = await readMarkerSnapshot(pendingOwnerPath);
    const context = { lockKind, lockRoot, pendingOwnerPath };
    await testOperations?.beforeLockOwnerPublish?.(context);
    const prepared = await captureLock(privateRoot, validOwner, label);
    assertPublishedLockCapture(prepared, directoryIdentity, ownerSnapshot, label);
    const entries = await readdir(privateRoot);
    if (entries.length !== 1 || entries[0] !== lockOwnerName) {
      throw new Error(`${label} private directory contains unknown files`);
    }
    await testOperations?.beforeLockOwnerCommit?.(context);
    // A cooperating owner publishes a nonempty directory in one operation.
    // Directory rename cannot overwrite another live owner's nonempty lock.
    try {
      await rename(privateRoot, lockRoot);
    } catch (error) {
      if (error?.code !== "EEXIST" && error?.code !== "ENOTEMPTY") throw error;
      await cleanupFailedCreatedLock(privateRoot, directoryIdentity, ownerSnapshot, token, lockKind);
      return undefined;
    }
    published = true;
    await testOperations?.afterLockOwnerPublish?.(context);
    const captured = await captureLock(lockRoot, validOwner, label);
    assertPublishedLockCapture(captured, directoryIdentity, ownerSnapshot, label);
    return captured;
  } catch (error) {
    try {
      await cleanupFailedCreatedLock(
        published ? lockRoot : privateRoot, directoryIdentity, ownerSnapshot, token, lockKind,
      );
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], `${label} acquisition and owned cleanup both failed`, {
        cause: cleanupError,
      });
    }
    throw error;
  }
}

async function cleanupFailedCreatedLock(
  lockRoot,
  directoryIdentity,
  ownerSnapshot,
  token,
  lockKind,
) {
  const currentStat = await statMaybe(lockRoot);
  if (
    currentStat === undefined ||
    currentStat.isSymbolicLink() ||
    !currentStat.isDirectory() ||
    !sameIdentity(identityFor(currentStat), directoryIdentity)
  ) {
    return;
  }
  const label = `staging ${lockKind} lock`;
  let captured;
  try {
    captured = await captureLock(
      lockRoot, lockKind === "package" ? validLockOwner : validArtifactLockOwner, label,
    );
  } catch {
    return;
  }
  if (
    !sameIdentity(captured.directoryIdentity, directoryIdentity) ||
    !sameMarkerSnapshot(captured.ownerSnapshot, ownerSnapshot)
  ) return;
  // Check before mutating; retirement verifies the renamed identity and restores
  // the canonical path if a detected replacement raced that check.
  await removeCapturedLock(
    lockRoot, captured,
    join(repositoryTmpRoot, `.stage-starter-${lockKind}.failed-${token}-${randomUUID()}`),
    label, { lockKind, reason: "failed" },
  );
}

function assertPublishedLockCapture(captured, directoryIdentity, ownerSnapshot, label) {
  if (
    !sameIdentity(captured.directoryIdentity, directoryIdentity) ||
    !sameMarkerSnapshot(captured.ownerSnapshot, ownerSnapshot)
  ) {
    throw new Error(`${label} identity changed during owner publication`);
  }
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
    const published = await publishLockOwner(
      packageLockRoot,
      {
        kind: "laugh-tale-package-build-lock",
        version: 1,
        token,
        pid: process.pid,
        createdAt: Date.now(),
      },
      token,
      "package",
      testOperations,
    );
    if (published !== undefined) {
      return async () => {
        await removeCapturedLock(
          packageLockRoot,
          published,
          join(repositoryTmpRoot, `.stage-starter-package.release-${token}`),
          "staging package lock",
          { testOperations, lockKind: "package", reason: "release" },
        );
      };
    }

    let captured;
    try {
      captured = await captureLock(
        packageLockRoot,
        validLockOwner,
        "staging package lock",
      );
    } catch (error) {
      if (error?.code === "ESTAGINGLOCKCHANGED") continue;
      throw error;
    }
    const owner = captured.ownerSnapshot?.marker;
    const ownerIsDead =
      validLockOwner(owner) &&
      !(testOperations?.isProcessAlive ?? processIsAlive)(owner.pid);
    if (ownerIsDead && Date.now() - owner.createdAt > deadOwnerGraceMs) {
      await testOperations?.beforePackageLockRetire?.();
      if (
        await removeCapturedLock(
          packageLockRoot,
          captured,
          join(repositoryTmpRoot, `.stage-starter-package.stale-${token}`),
          "staging package lock",
          { testOperations, lockKind: "package", reason: "stale" },
        )
      ) {
        continue;
      }
    } else if (
      owner === undefined &&
      Date.now() - captured.directoryMtimeMs > staleMs
    ) {
      if (
        await removeCapturedLock(
          packageLockRoot,
          captured,
          join(repositoryTmpRoot, `.stage-starter-package.stale-${token}`),
          "staging package lock",
          { testOperations, lockKind: "package", reason: "stale" },
        )
      ) {
        continue;
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
    await testOperations?.beforePackageLockRelease?.();
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
  return captureLock(
    artifactLockRoot,
    validArtifactLockOwner,
    "staging artifact lock",
  );
}

async function removeCapturedArtifactLock(captured, removalPath, testOperations, reason) {
  return removeCapturedLock(
    artifactLockRoot,
    captured,
    removalPath,
    "staging artifact lock",
    { testOperations, lockKind: "artifact", reason },
  );
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
    const published = await publishLockOwner(
      artifactLockRoot,
      {
        kind: "laugh-tale-artifact-cleanup-lock",
        version: 1,
        token,
        pid: process.pid,
        createdAt: Date.now(),
      },
      token,
      "artifact",
      testOperations,
    );
    if (published !== undefined) {
      return async () => {
        await removeCapturedLock(
          artifactLockRoot,
          published,
          join(repositoryTmpRoot, `.stage-starter-artifact.release-${token}`),
          "staging artifact lock",
          { testOperations, lockKind: "artifact", reason: "release" },
        );
      };
    }

    let captured;
    try {
      captured = await captureArtifactLock();
    } catch (error) {
      if (error?.code === "ESTAGINGLOCKCHANGED") continue;
      throw error;
    }
    const owner = captured.ownerSnapshot?.marker;
    const ownerIsDead =
      validArtifactLockOwner(owner) &&
      !(testOperations?.isProcessAlive ?? processIsAlive)(owner.pid);
    if (ownerIsDead && Date.now() - owner.createdAt > deadOwnerGraceMs) {
      const stalePath = join(
        repositoryTmpRoot,
        `.stage-starter-artifact.stale-${token}`,
      );
      await removeCapturedArtifactLock(captured, stalePath, testOperations, "stale");
      continue;
    }
    if (
      owner === undefined &&
      Date.now() - captured.directoryMtimeMs > staleMs
    ) {
      const stalePath = join(
        repositoryTmpRoot,
        `.stage-starter-artifact.stale-${token}`,
      );
      await removeCapturedArtifactLock(captured, stalePath, testOperations, "stale");
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
  const artifacts = [];
  const packedPaths = [];
  const packageDescriptors = [];
  const packagesRoot = join(repoRoot, "packages");
  for (const entry of await readdir(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || PACKAGE_BUILD_ORDER.includes(entry.name)) continue;
    let manifest;
    try {
      manifest = JSON.parse(await readFile(join(packagesRoot, entry.name, "package.json"), "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (typeof manifest?.name === "string" && manifest.name.startsWith(INTERNAL_PACKAGE_PREFIX)) {
      throw new Error(`extra Laugh Tale package workspace: packages/${entry.name}`);
    }
  }
  for (const directoryName of PACKAGE_BUILD_ORDER) {
    const packageDir = join(repoRoot, "packages", directoryName);
    const expectedName = `@laugh-tale-island/${directoryName}`;
    let manifest;
    try {
      manifest = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8"));
    } catch (error) {
      throw new Error(`cannot read the required workspace manifest for packages/${directoryName}`, {
        cause: error,
      });
    }
    if (
      manifest === null ||
      typeof manifest !== "object" ||
      Array.isArray(manifest) ||
      manifest.name !== expectedName
    ) {
      throw new Error(
        `packages/${directoryName} must declare the expected package name "${expectedName}"`,
      );
    }
    if (typeof manifest.version !== "string" || manifest.version.length === 0) {
      throw new Error(`packages/${directoryName} must declare a package version`);
    }
    packageDescriptors.push({
      directoryName,
      expectedFilename: `laugh-tale-island-${directoryName}-${manifest.version}.tgz`,
      expectedName,
      expectedVersion: manifest.version,
      packageDir,
    });
  }

  for (const {
    directoryName,
    expectedFilename,
    expectedName,
    expectedVersion,
    packageDir,
  } of packageDescriptors) {
    run("npm", ["run", "build", "--ignore-scripts"], packageDir, testOperations);
    const output = JSON.parse(
      run(
        "npm",
        ["pack", "--json", "--pack-destination", packRoot],
        packageDir,
        testOperations,
      ),
    );
    const report = output[0];
    const filename = report?.filename;
    const expectedPath = join(packRoot, expectedFilename);
    const expectedStat = await statMaybe(expectedPath);
    if (
      expectedStat !== undefined &&
      expectedStat.isFile() &&
      !expectedStat.isSymbolicLink()
    ) {
      packedPaths.push(expectedPath);
      await onPacked?.([...packedPaths], [...artifacts]);
    }
    if (
      output.length !== 1 ||
      report?.name !== expectedName ||
      report?.version !== expectedVersion ||
      typeof filename !== "string" ||
      filename !== expectedFilename ||
      typeof report?.integrity !== "string" ||
      report.integrity.length === 0
    ) {
      throw new Error(`npm pack reported an invalid artifact for packages/${directoryName}`);
    }
    const artifact = await captureTarballArtifact({
      expectedName,
      expectedVersion,
      filename,
      integrity: report.integrity,
      path: expectedPath,
    });
    if (
      artifacts.some((candidate) => sameIdentity(candidate.identity, artifact.identity))
    ) {
      throw new Error("packed tarballs must have four distinct file identities");
    }
    artifacts.push(artifact);
    await onPacked?.([...packedPaths], [...artifacts]);
  }
  return artifacts;
}

async function openTarballState(path, packageName, testOperations, phase) {
  const opened = await openRealFileSnapshot(
    path,
    `packed tarball for ${packageName}`,
    phase === "candidate"
      ? () => testOperations?.afterTarballRead?.({ packageName, path, phase })
      : undefined,
  );
  if (opened === undefined) {
    throw new Error(`packed tarball for ${packageName} is missing`);
  }
  return {
    ...opened,
    digest: createHash("sha512").update(opened.contents).digest("base64"),
    size: opened.contents.byteLength,
  };
}

async function readTarballState(path, packageName, testOperations, phase) {
  const opened = await openTarballState(
    path,
    packageName,
    testOperations,
    phase,
  );
  await opened.handle.close();
  return { identity: opened.identity, digest: opened.digest, size: opened.size };
}

async function captureTarballArtifact({
  expectedName,
  expectedVersion,
  filename,
  integrity,
  path,
}) {
  const state = await readTarballState(path, expectedName);
  const computedIntegrity = `sha512-${state.digest}`;
  if (integrity !== computedIntegrity) {
    throw new Error(`npm pack integrity does not match the ${expectedName} tarball contents`);
  }
  return {
    digest: state.digest,
    filename,
    identity: state.identity,
    integrity,
    name: expectedName,
    path: resolve(path),
    size: state.size,
    version: expectedVersion,
  };
}

async function revalidateTarballArtifact(artifact, packRoot, testOperations, phase) {
  if (
    resolve(artifact.path) !== artifact.path ||
    dirname(artifact.path) !== resolve(packRoot) ||
    basename(artifact.path) !== artifact.filename
  ) {
    throw new Error(`packed tarball for ${artifact.name} is outside its invocation pack root`);
  }
  const state = await readTarballState(
    artifact.path,
    artifact.name,
    testOperations,
    phase,
  );
  if (
    !sameIdentity(state.identity, artifact.identity) ||
    state.size !== artifact.size ||
    state.digest !== artifact.digest ||
    `sha512-${state.digest}` !== artifact.integrity
  ) {
    throw new Error(`packed tarball for ${artifact.name} no longer matches its pack-time identity and integrity`);
  }
}

function serializableTarballArtifact(artifact) {
  return {
    digest: artifact.digest,
    filename: artifact.filename,
    identity: artifact.identity,
    integrity: artifact.integrity,
    name: artifact.name,
    size: artifact.size,
    version: artifact.version,
  };
}

async function composeStarter({ stagedRoot, recipe, recipeCatalogRoot, tripPath, setupLocale, copyCatalogPath, resolutionsPath }) {
  if ([recipe, tripPath, setupLocale, copyCatalogPath, resolutionsPath].some(value => value !== undefined)) {
    await createTripProject({
      pluginRoot,
      targetDir: stagedRoot,
      recipe,
      starterDir: starterRoot,
      recipeCatalogRoot: recipeCatalogRoot ?? defaultRecipeCatalogRoot,
      tripPath, setupLocale, copyCatalogPath, resolutionsPath,
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

function dependencySection(manifest, sectionName) {
  const section = manifest[sectionName];
  if (section === undefined) return {};
  if (section === null || typeof section !== "object" || Array.isArray(section)) {
    throw new Error(`staged manifest ${sectionName} must be an object`);
  }
  return section;
}

function validateForbiddenInternalSections(manifest) {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("staged manifest must contain a JSON object");
  }
  for (const sectionName of ["dependencies", "devDependencies"]) {
    dependencySection(manifest, sectionName);
  }
  for (const sectionName of ["optionalDependencies", "peerDependencies"]) {
    const section = dependencySection(manifest, sectionName);
    const internalNames = Object.keys(section).filter((name) =>
      name.startsWith(INTERNAL_PACKAGE_PREFIX),
    );
    if (internalNames.length > 0) {
      throw new Error(
        `staged manifest declares ${internalNames.join(", ")} in forbidden dependency section ${sectionName}`,
      );
    }
  }
}

async function readAndValidateStagedManifest(stagedRoot) {
  const manifestPath = join(stagedRoot, "package.json");
  const files = await readProjectFileSet({ projectDir: stagedRoot, paths: ["package.json"] });
  const manifest = JSON.parse(files.get("package.json").toString("utf8"));
  validateForbiddenInternalSections(manifest);
  return { manifest, manifestPath };
}

// This is the private installed-artifact seam. Public candidate readiness still
// requires a Trip, and public local validation still requires registry pins.
async function validateCreatedSource(candidate, request, baseline) {
  const snapshot = await projectSnapshot(candidate);
  const json = path => JSON.parse(snapshot.files.get(path)?.toString("utf8") ?? "null");
  const manifest = parseTripProjectManifest(json("eternal-pose.json"));
  const input = parseTripProjectInputV2(json("src/trip-content/trip-input.json"));
  const ledger = parsePlaceResolutionLedger(json("src/trip-content/place-resolutions.json"), input);
  assertManifestMatchesLedger(manifest, ledger);
  const locale = input.trip?.locale ?? input.setupLocale;
  await assertOakWashiPresentationIdentity(join(candidate, "src/presentation"), join(request.recipeCatalogRoot ?? defaultRecipeCatalogRoot, "oak-washi/presentation"), locale, request.copyCatalogPath);
  const source = new Map([...snapshot.files].filter(([path]) => path !== "package.json" && path !== "package-lock.json" && !path.startsWith(".laugh-tale-")));
  const pkg = json("package.json");
  for (const name of PACKAGE_BUILD_ORDER) delete pkg[name === "testing" ? "devDependencies" : "dependencies"][`${INTERNAL_PACKAGE_PREFIX}${name}`];
  const packageIdentity = JSON.stringify(pkg);
  if (baseline && packageIdentity !== baseline.packageIdentity) throw new Error("created project package identity changed before publication");
  if (baseline && (source.size !== baseline.source.size || [...source].some(([path, bytes]) => !baseline.source.get(path)?.equals(bytes)))) throw new Error("created project source identity changed before publication");
  const after = await projectSnapshot(candidate);
  if (after.hash !== snapshot.hash) throw new Error("created project snapshot changed during structural validation");
  return { source, packageIdentity };
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
  finalizeCandidate,
  targetState,
  workRoot,
  markPublished,
  validateCandidate,
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
    await validateCandidate();
    await assertRealPathComponents(candidate);
    await assertRealPathComponents(currentState.target);
    await finalizeCandidate();
    await validateCandidate();
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

async function invocationTarballMap(artifacts, packRoot) {
  if (artifacts.length !== PACKAGE_BUILD_ORDER.length) {
    throw new Error("staging requires one packed tarball for every Laugh Tale package");
  }
  const tarballByName = new Map();
  for (let index = 0; index < PACKAGE_BUILD_ORDER.length; index += 1) {
    const expectedName = `@laugh-tale-island/${PACKAGE_BUILD_ORDER[index]}`;
    const artifact = artifacts[index];
    if (artifact?.name !== expectedName) {
      throw new Error(`packed tarball for ${expectedName} is not owned by this invocation`);
    }
    await revalidateTarballArtifact(artifact, packRoot);
    if (tarballByName.has(expectedName)) {
      throw new Error(`duplicate packed tarball for ${expectedName}`);
    }
    if (
      [...tarballByName.values()].some((candidate) =>
        sameIdentity(candidate.identity, artifact.identity),
      )
    ) {
      throw new Error("packed tarballs must have four distinct file identities");
    }
    tarballByName.set(expectedName, artifact);
  }
  return tarballByName;
}

function tarballStateMatchesArtifact(state, artifact) {
  return (
    sameIdentity(state.identity, artifact.identity) &&
    state.size === artifact.size &&
    state.digest === artifact.digest &&
    `sha512-${state.digest}` === artifact.integrity
  );
}

async function removeExactFrozenPending(snapshot) {
  const state = await readTarballState(snapshot.pendingPath, snapshot.artifact.name);
  if (
    !sameIdentity(state.identity, snapshot.pendingIdentity) ||
    state.size !== snapshot.artifact.size ||
    state.digest !== snapshot.artifact.digest
  ) {
    throw new Error(
      `refusing to remove a replaced frozen tarball for ${snapshot.artifact.name}`,
    );
  }
  await unlink(snapshot.pendingPath);
}

async function freezeCandidateTarballs({
  artifacts,
  candidate,
  invocation,
  packMarker,
  packRoot,
  target,
  testOperations,
}) {
  const frozen = [];
  try {
    for (let index = 0; index < PACKAGE_BUILD_ORDER.length; index += 1) {
      const artifact = artifacts[index];
      const expectedName = `@laugh-tale-island/${PACKAGE_BUILD_ORDER[index]}`;
      if (
        artifact?.name !== expectedName ||
        resolve(artifact.path) !== artifact.path ||
        dirname(artifact.path) !== resolve(packRoot) ||
        basename(artifact.path) !== artifact.filename
      ) {
        throw new Error(`packed tarball for ${expectedName} is not owned by this invocation`);
      }

      const source = await openTarballState(
        artifact.path,
        artifact.name,
        testOperations,
        "candidate",
      );
      let contents;
      try {
        if (!tarballStateMatchesArtifact(source, artifact)) {
          throw new Error(
            `packed tarball for ${artifact.name} no longer matches its pack-time identity and integrity`,
          );
        }
        contents = Buffer.from(source.contents);
      } finally {
        await source.handle.close();
      }

      const pendingPath = join(
        packRoot,
        `.${artifact.filename}.freeze-${invocation}-${randomUUID()}.pending`,
      );
      await writeFile(pendingPath, contents, { flag: "wx", mode: 0o600 });
      const pendingState = await readTarballState(pendingPath, artifact.name);
      if (
        pendingState.size !== artifact.size ||
        pendingState.digest !== artifact.digest ||
        `sha512-${pendingState.digest}` !== artifact.integrity ||
        sameIdentity(pendingState.identity, artifact.identity) ||
        frozen.some(
          (candidateSnapshot) =>
            sameIdentity(candidateSnapshot.pendingIdentity, pendingState.identity) ||
            sameIdentity(candidateSnapshot.artifact.identity, pendingState.identity),
        ) ||
        artifacts.some((candidateArtifact) =>
          sameIdentity(candidateArtifact.identity, pendingState.identity),
        )
      ) {
        throw new Error(
          `frozen tarball for ${artifact.name} does not have a distinct pack-time-bound identity and integrity`,
        );
      }
      const snapshot = {
        artifact: { ...artifact, identity: pendingState.identity },
        pendingIdentity: pendingState.identity,
        pendingPath,
      };
      frozen.push(snapshot);

      // This adversarial boundary is intentionally after a trusted copy exists. A writer
      // retaining the old canonical fd can now affect only the inode we are about to retire.
      await testOperations?.afterCandidateTarballValidated?.({
        index,
        packageName: artifact.name,
        path: artifact.path,
      });
    }

    await testOperations?.beforeFinalPackMarkerUpdate?.({
      artifacts: frozen.map(({ artifact }) => artifact),
      packRoot,
    });

    // Revalidate every private inode after all hooks, then replace the four canonical
    // paths. Old canonical fds cannot reach the fresh inodes. This cooperative CLI
    // does not isolate these paths from arbitrary same-user writes after validation.
    for (const snapshot of frozen) {
      const state = await readTarballState(
        snapshot.pendingPath,
        snapshot.artifact.name,
      );
      if (
        !sameIdentity(state.identity, snapshot.pendingIdentity) ||
        state.size !== snapshot.artifact.size ||
        state.digest !== snapshot.artifact.digest ||
        `sha512-${state.digest}` !== snapshot.artifact.integrity
      ) {
        throw new Error(
          `frozen tarball for ${snapshot.artifact.name} changed before publication`,
        );
      }
    }

    for (const snapshot of frozen) {
      await rename(snapshot.pendingPath, snapshot.artifact.path);
      snapshot.pendingPath = undefined;
      const currentStat = await lstat(snapshot.artifact.path);
      if (
        currentStat.isSymbolicLink() ||
        !currentStat.isFile() ||
        !sameIdentity(identityFor(currentStat), snapshot.pendingIdentity)
      ) {
        throw new Error(
          `frozen tarball for ${snapshot.artifact.name} changed during publication`,
        );
      }
    }

    const finalArtifacts = frozen.map(({ artifact }) => artifact);
    artifacts.splice(0, artifacts.length, ...finalArtifacts);
    packMarker.artifacts = finalArtifacts.map(serializableTarballArtifact);
    await updateAuxiliaryMarker(packRoot, packMarker);
    const packReference = await capturePackReference(packRoot);
    const candidateMarker = await writeConsumerMarker(
      candidate,
      target,
      invocation,
      packReference,
      false,
    );
    return { candidateMarker, packReference };
  } catch (error) {
    const cleanupErrors = [];
    for (const snapshot of frozen) {
      if (snapshot.pendingPath === undefined) continue;
      try {
        await removeExactFrozenPending(snapshot);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        "tarball freeze failed and exact pending cleanup failed",
        { cause: error },
      );
    }
    throw error;
  }
}

async function rewriteManifest(stagedRoot, artifacts, packRoot) {
  const { manifest, manifestPath } = await readAndValidateStagedManifest(stagedRoot);
  const tarballByName = await invocationTarballMap(artifacts, packRoot);
  for (const sectionName of ["dependencies", "devDependencies"]) {
    const dependencies = dependencySection(manifest, sectionName);
    for (const dependencyName of Object.keys(dependencies)) {
      if (!dependencyName.startsWith("@laugh-tale-island/")) continue;
      const artifact = tarballByName.get(dependencyName);
      if (artifact === undefined) throw new Error(`no packed tarball for ${dependencyName}`);
      dependencies[dependencyName] = `file:${artifact.path}`;
    }
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await rm(join(stagedRoot, "package-lock.json"), { force: true });
}

function lockfileTarballSpecifier(root, artifactPath) {
  return `file:${relative(root, artifactPath).split(sep).join("/")}`;
}

async function normalizeInstalledLockfiles(candidate, target, artifacts, packRoot) {
  const tarballByName = await invocationTarballMap(artifacts, packRoot);
  const lockfiles = [];
  for (const relativePath of ["package-lock.json", "node_modules/.package-lock.json"]) {
    const path = join(candidate, relativePath);
    let lockfile;
    try {
      lockfile = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      throw new Error(`cannot read installed ${relativePath}`, { cause: error });
    }
    if (
      lockfile === null ||
      typeof lockfile !== "object" ||
      Array.isArray(lockfile) ||
      lockfile.packages === null ||
      typeof lockfile.packages !== "object" ||
      Array.isArray(lockfile.packages)
    ) {
      throw new Error(`installed ${relativePath} has invalid package metadata`);
    }
    for (const [packageName, artifact] of tarballByName) {
      const entry = lockfile.packages[`node_modules/${packageName}`];
      if (
        entry === null ||
        typeof entry !== "object" ||
        Array.isArray(entry) ||
        entry.resolved !== lockfileTarballSpecifier(candidate, artifact.path)
      ) {
        throw new Error(`installed ${relativePath} is not bound to ${packageName}`);
      }
    }
    lockfiles.push({ lockfile, path });
  }

  for (const { lockfile, path } of lockfiles) {
    for (const [packageName, artifact] of tarballByName) {
      lockfile.packages[`node_modules/${packageName}`].resolved =
        lockfileTarballSpecifier(target, artifact.path);
    }
    await writeFile(path, `${JSON.stringify(lockfile, null, 2)}\n`);
  }
}

async function validateCandidatePackageBindings(stagedRoot, artifacts, packRoot) {
  const { manifest } = await readAndValidateStagedManifest(stagedRoot);
  const tarballByName = await invocationTarballMap(artifacts, packRoot);
  const expectedPlacement = {
    "@laugh-tale-island/adapters": "dependencies",
    "@laugh-tale-island/core": "dependencies",
    "@laugh-tale-island/react": "dependencies",
    "@laugh-tale-island/testing": "devDependencies",
  };
  for (const [packageName, expectedSection] of Object.entries(expectedPlacement)) {
    const otherSection = expectedSection === "dependencies" ? "devDependencies" : "dependencies";
    const expectedDependencies = dependencySection(manifest, expectedSection);
    const otherDependencies = dependencySection(manifest, otherSection);
    const artifact = tarballByName.get(packageName);
    if (
      artifact === undefined ||
      expectedDependencies[packageName] !== `file:${artifact.path}` ||
      Object.hasOwn(otherDependencies, packageName)
    ) {
      throw new Error(`staged manifest is not bound to the packed tarball for ${packageName}`);
    }
  }
  for (const sectionName of ["dependencies", "devDependencies"]) {
    for (const packageName of Object.keys(dependencySection(manifest, sectionName))) {
      if (
        packageName.startsWith(INTERNAL_PACKAGE_PREFIX) &&
        !Object.hasOwn(expectedPlacement, packageName)
      ) {
        throw new Error(`staged manifest references an unowned tarball for ${packageName}`);
      }
    }
  }
}

async function writeCandidateAttestation(candidate, artifacts, testOperations) {
  const path = join(candidate, candidateAttestationName);
  const packages = [];
  for (let index = 0; index < PACKAGE_BUILD_ORDER.length; index += 1) {
    const artifact = artifacts[index];
    const expectedName = `@laugh-tale-island/${PACKAGE_BUILD_ORDER[index]}`;
    if (artifact?.name !== expectedName || artifact.version !== "2.0.0") {
      throw new Error(`invalid attested package ${expectedName}`);
    }
    const opened = await openRealFileSnapshot(artifact.path, `attested archive for ${expectedName}`);
    if (!opened) throw new Error(`missing attested archive for ${expectedName}`);
    try {
      const bytes = opened.contents;
      if (bytes.length !== artifact.size || `sha512-${createHash("sha512").update(bytes).digest("base64")}` !== artifact.integrity) {
        throw new Error(`attested archive for ${expectedName} changed`);
      }
      packages.push({
        name: expectedName,
        version: "2.0.0",
        archive: artifact.path,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        integrity: artifact.integrity,
      });
    } finally {
      await opened.handle.close();
    }
  }
  const contents = `${JSON.stringify({ schemaVersion: 1, packages }, null, 2)}\n`;
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(contents);
    await testOperations?.afterAttestationWrite?.({ candidate, path });
    await testOperations?.beforeAttestationFsync?.({ candidate, path });
    await handle.sync();
  } finally {
    await handle.close();
  }
  const saved = await openRealFileSnapshot(path, "candidate attestation");
  if (!saved) throw new Error("candidate attestation missing after write");
  try {
    if (saved.contents.toString("utf8") !== contents) throw new Error("candidate attestation changed after write");
  } finally {
    await saved.handle.close();
  }
  await testOperations?.afterAttestationValidated?.({ candidate, path });
  return path;
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
  { install = true, outDir, recipe, recipeCatalogRoot, tripPath, setupLocale, copyCatalogPath, resolutionsPath } = {},
  testOperations = {},
) {
  const createRequest = { recipe, recipeCatalogRoot, tripPath, setupLocale, copyCatalogPath, resolutionsPath };
  const usesCreate = [recipe, tripPath, setupLocale, copyCatalogPath, resolutionsPath].some(value => value !== undefined);
  if (tripPath !== undefined && setupLocale !== undefined) throw new Error("trip and setup-locale are mutually exclusive");
  if (resolutionsPath !== undefined && tripPath === undefined) throw new Error("resolutions require a trip");
  for (const path of [outDir, tripPath, copyCatalogPath, resolutionsPath]) if (path !== undefined && !isAbsolute(path)) throw new Error("staging paths must be absolute");
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
          artifacts: [],
        };
        packReference = packReferenceFor(packMarker);
        await createAuxiliaryDirectory(workRoot, workMarker);
        workCreated = true;
      },
      { phase: "work-initialization", releaseContext: { workRoot } },
    );
    await composeStarter({ stagedRoot: candidate, ...createRequest });
    candidateMarker = await writeConsumerMarker(
      candidate,
      targetState.target,
      invocation,
      packReference,
    );
    await testOperations?.afterStarterComposed?.({ candidate });
    try { await recoverProjectFileTransaction(candidate); }
    catch (error) { error.stagingPreserveWork = true; throw error; }
    const sourceIdentity = usesCreate ? await validateCreatedSource(candidate, createRequest) : undefined;
    await readAndValidateStagedManifest(candidate);

    const packaged = await withPackageLock(testOperations, async () => {
      await ensureRealDirectoryBelowTmp(packBaseRoot);
      await createAuxiliaryDirectory(packRoot, packMarker);
      packCreated = true;
      const artifacts = await packWorkspacePackages(
        packRoot,
        testOperations,
        async (packed, capturedArtifacts) => {
          packMarker.files = packed.map((tarball) => basename(tarball));
          packMarker.artifacts = capturedArtifacts.map(serializableTarballArtifact);
          await updateAuxiliaryMarker(packRoot, packMarker);
        },
      );
      return { artifacts, packReference: await capturePackReference(packRoot) };
    });
    const { artifacts } = packaged;
    const tarballs = artifacts.map((artifact) => artifact.path);
    packReference = packaged.packReference;
    candidateMarker = await writeConsumerMarker(
      candidate,
      targetState.target,
      invocation,
      packReference,
      false,
    );

    await rewriteManifest(candidate, artifacts, packRoot);
    if (install) {
      run("npm", ["install", "--no-audit", "--no-fund"], candidate, testOperations);
      await normalizeInstalledLockfiles(candidate, targetState.target, artifacts, packRoot);
    }
    return await withArtifactLock(
      testOperations,
      async () => {
        const publication = await publishCandidate({
          candidate,
          targetState,
          workRoot,
          testOperations,
          validateCandidate: async () => {
            if (usesCreate) await validateCreatedSource(candidate, createRequest, sourceIdentity);
            await validateCandidatePackageBindings(candidate, artifacts, packRoot);
          },
          finalizeCandidate: async () => {
            const finalized = await freezeCandidateTarballs({
              artifacts,
              candidate,
              invocation,
              packMarker,
              packRoot,
              target: targetState.target,
              testOperations,
            });
            packReference = finalized.packReference;
            candidateMarker = finalized.candidateMarker;
            await writeCandidateAttestation(candidate, artifacts, testOperations);
          },
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
          attestationPath: join(targetState.target, candidateAttestationName),
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
    // A live file-set writer owns entries inside the candidate. Preserve the
    // complete work tree for its recovery rather than racing recursive cleanup.
    if (error?.code === "transaction-in-progress") error.stagingPreserveWork = true;
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
            const ownedCleanupErrors = [];
            if (packCreated) {
              try {
                const cleanupReference = await capturePackReference(packRoot);
                await removeOwnedPackTree(packRoot, cleanupReference, packMarker.target);
              } catch (cleanupError) {
                ownedCleanupErrors.push(cleanupError);
              }
            }
            if (workCreated) {
              try {
                await removeOwnedWorkTree(workRoot, workMarker, candidateMarker);
                workCreated = false;
              } catch (cleanupError) {
                ownedCleanupErrors.push(cleanupError);
              }
            }
            if (ownedCleanupErrors.length > 0) {
              throw new AggregateError(
                ownedCleanupErrors,
                "one or more owned staging trees require recovery",
              );
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
  const usage = "node scripts/stage-starter-consumer.mjs [--out /absolute/staged-project] [--recipe oak-washi] [--trip /absolute/trip-input.json | --setup-locale zh-Hant-TW] [--copy-catalog /absolute/catalog.json] [--resolutions /absolute/place-resolutions.json] [--no-install]";
  const args = process.argv.slice(2), options = {}, seen = new Set();
  const flags = new Map([["--out", "outDir"], ["--recipe", "recipe"], ["--trip", "tripPath"], ["--setup-locale", "setupLocale"], ["--copy-catalog", "copyCatalogPath"], ["--resolutions", "resolutionsPath"]]);
  try {
    for (let i = 0; i < args.length; i++) {
      const flag = args[i];
      if (seen.has(flag)) throw new Error(usage);
      seen.add(flag);
      if (flag === "--no-install") { options.install = false; continue; }
      const key = flags.get(flag), value = args[++i];
      if (!key || !value || value.startsWith("--")) throw new Error(usage);
      options[key] = value;
    }
    if (options.recipe !== undefined && options.recipe !== "oak-washi" || options.tripPath && options.setupLocale || options.resolutionsPath && !options.tripPath || [options.outDir, options.tripPath, options.copyCatalogPath, options.resolutionsPath].some(path => path !== undefined && !isAbsolute(path))) throw new Error(usage);
    const { stagedRoot: staged } = await stageStarterConsumer({ ...options, recipe: options.recipe ?? "oak-washi" });
    console.log(`staged-starter:${staged}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
