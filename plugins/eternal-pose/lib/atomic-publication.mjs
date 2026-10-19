import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { lstat, mkdir, open, readdir, readlink, rename, symlink, unlink } from "node:fs/promises";
import { assertAncestors, assertPathIdentity, assertTree, inspectPath, pathIdentity, readRegularFile, removeOwnedTree, samePathIdentity, snapshotAncestors, snapshotTree, validateTargetDirectory } from "./path-safety.mjs";

const journalPrefix = ".laugh-tale-transaction-";
const fail = (message) => new Error(message);
function busy(message = "transaction in progress") { return Object.assign(fail(message), { code: "transaction-in-progress" }); }
function lockPath(target) { return join(dirname(target), `.laugh-tale-writer-${createHash("sha256").update(target).digest("hex")}`); }
const hook = async (ctx, phase, path) => { await ctx.operations?.beforeMutation?.({ phase, path, transactionId: ctx.id }); };

function safeRelative(path) {
  if (typeof path !== "string" || !path || isAbsolute(path) || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..") || path.split("/").some((part) => part.startsWith(".laugh-tale-"))) throw fail(`unsafe transaction path: ${path}`);
  return path;
}

export function assertAllowedReplacement(path, allowedPaths) {
  const normalized = path.split(sep).join("/");
  if (!allowedPaths.has(normalized)) {
    throw new Error(`transaction path is not allowlisted: ${normalized}`);
  }
  return normalized;
}

async function syncDirectory(path) {
  const ancestors = await snapshotAncestors(path);
  const identity = await inspectPath(path);
  if (identity?.type !== "directory") throw fail(`expected directory: ${path}`);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { await assertAncestors(ancestors); if (!samePathIdentity(identity, pathIdentity(await handle.stat()))) throw fail(`directory changed: ${path}`); await handle.sync(); }
  finally { await handle.close(); }
}

async function exclusiveRecord(path, value) {
  const handle = await open(path, "wx", 0o600);
  try { value.self = pathIdentity(await handle.stat()); await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
  finally { await handle.close(); }
  return value;
}

async function readRecord(path) {
  const file = await readRegularFile(path);
  let value;
  try { value = JSON.parse(file.bytes.toString("utf8")); } catch { throw fail(`invalid transaction record: ${path}`); }
  if (!samePathIdentity(file.identity, value?.self)) throw fail(`foreign transaction record: ${path}`);
  return { value, file };
}

async function removeRecord(path, record) {
  const current = await readRegularFile(path);
  if (!samePathIdentity(current.identity, record.file.identity) || current.hash !== record.file.hash) throw fail(`transaction record changed: ${path}`);
  await unlink(path);
}

function deadOwner(owner, kind = "laugh-tale-writer-v1") {
  if (owner.kind !== kind || owner.host !== hostname() || !Number.isSafeInteger(owner.pid) || owner.pid < 1 || typeof owner.id !== "string") throw busy("unverifiable writer reservation");
  try { process.kill(owner.pid, 0); return false; } catch (error) { if (error.code === "ESRCH") return true; throw busy("writer liveness cannot be established"); }
}

// Every dead claim is reclaimed behind its own exclusive successor. Thus a
// killed recovery can itself be recovered without racing another reclaimer.
async function claimRecovery(path, target) {
  const ancestors = await snapshotAncestors(path);
  const old = await inspectPath(path) ? await readRecord(path) : null;
  if (old && (old.value.target !== target || !deadOwner(old.value, "laugh-tale-recovery-v1"))) throw busy("active or foreign recovery owns project");
  const successor = `${path}.recovery`;
  let guard;
  if (old || await inspectPath(successor)) guard = await claimRecovery(successor, target);
  try {
    await assertAncestors(ancestors);
    if (old) {
      if (!deadOwner(old.value, "laugh-tale-recovery-v1")) throw busy("recovery owner became unverifiable");
      await removeRecord(path, old);
    }
    await exclusiveRecord(path, { kind: "laugh-tale-recovery-v1", id: randomUUID(), target, host: hostname(), pid: process.pid });
    const record = await readRecord(path);
    await syncDirectory(dirname(path));
    return { async release() { await assertAncestors(ancestors); await removeRecord(path, record); await syncDirectory(dirname(path)); } };
  } catch (error) {
    if (error.code === "EEXIST") throw busy("competing recovery owns project");
    throw error;
  } finally { if (guard) await guard.release(); }
}

async function reserve(target, operations) {
  const path = lockPath(target);
  const ancestors = await snapshotAncestors(path);
  const claim = `${path}.recovery`;
  let claimLease;
  let recovered = "clean";
  const old = await inspectPath(path) ? await readRecord(path) : null;
  if (old) {
    if (old.value.target !== target) throw busy("foreign writer reservation");
    if (!deadOwner(old.value)) throw busy("active writer owns project");
  }
  if (old || await inspectPath(claim)) {
    claimLease = await claimRecovery(claim, target);
    try {
      await assertAncestors(ancestors);
      if (old) {
        const again = await readRecord(path);
        if (again.file.hash !== old.file.hash || !deadOwner(again.value)) throw busy("writer reservation changed");
        recovered = await recoverInternal(target, old.value.id);
        await removeRecord(path, old);
      } else await assertPathIdentity(path, null);
    } catch (error) { await claimLease.release(); throw error; }
  }
  const id = randomUUID();
  try {
    await assertAncestors(ancestors);
    await exclusiveRecord(path, { kind: "laugh-tale-writer-v1", id, pid: process.pid, host: hostname(), target });
  } catch (error) {
    if (claimLease) await claimLease.release();
    if (error.code === "EEXIST") throw busy("competing writer reserved project");
    throw error;
  }
  const record = await readRecord(path);
  if (claimLease) await claimLease.release();
  await syncDirectory(dirname(path));
  return {
    id, target, operations, recovered, journal: null,
    async check() {
      await assertAncestors(ancestors);
      const now = await readRecord(path);
      if (now.file.hash !== record.file.hash) throw fail("writer reservation changed");
      if (this.journal) {
        const current = await readRecord(this.journal.path);
        if (current.file.hash !== this.journal.hash) throw fail("transaction journal changed");
      }
    },
    async release() { await assertAncestors(ancestors); await removeRecord(path, record); await syncDirectory(dirname(path)); },
  };
}

async function journalPaths(target) {
  const found = [];
  // Parent journals cover whole-directory replacement, including the interval
  // where target is absent or a newly installed directory has no inner journal.
  for (const directory of [dirname(target), target]) {
    const identity = await inspectPath(directory);
    if (!identity) continue;
    if (identity.type !== "directory") throw fail(`unsafe journal directory: ${directory}`);
    for (const name of await readdir(directory)) {
      if (!name.startsWith(journalPrefix)) continue;
      const path = join(directory, name);
      const record = await readRecord(path);
      if (record.value.target === target) found.push({ path, ...record });
      else if (directory === target || typeof record.value.target !== "string") throw fail(`foreign journal: ${path}`);
    }
  }
  if (found.length > 1) throw fail("multiple transaction journals require repair");
  return found;
}

async function prepare(ctx, record) {
  const path = join(record.kind === "directory" || record.kind === "create" ? dirname(ctx.target) : ctx.target, `${journalPrefix}${ctx.id}`);
  await hook(ctx, "journal-prepare", path);
  await ctx.check();
  await assertAncestors(record.ancestors);
  await exclusiveRecord(path, { version: 1, ...record, target: ctx.target, id: ctx.id, phase: "prepared" });
  ctx.journal = { path, hash: (await readRecord(path)).file.hash };
  await syncDirectory(dirname(path));
  return path;
}

async function commit(ctx, path) {
  await hook(ctx, "journal-commit", path);
  await ctx.check();
  const record = await readRecord(path);
  const temporary = join(dirname(path), `.laugh-tale-commit-${ctx.id}`);
  await exclusiveRecord(temporary, { ...record.value, phase: "committed" });
  await assertAncestors(record.value.ancestors);
  const current = await readRecord(path);
  if (current.file.hash !== record.file.hash) throw fail("journal changed before commit");
  await rename(temporary, path);
  ctx.journal = { path, hash: (await readRecord(path)).file.hash };
  await syncDirectory(dirname(path));
}

async function fileMatches(path, expected) {
  const identity = await inspectPath(path);
  if (!identity) return false;
  if (!expected || !samePathIdentity(identity, expected.identity) || (await readRegularFile(path)).hash !== expected.hash) throw fail(`foreign or changed transaction file: ${path}`);
  return true;
}

async function cleanStage(record) {
  if (!await inspectPath(record.stage)) return;
  const current = await snapshotTree(record.stage);
  for (const entry of current) {
    const original = record.inventory.find((item) => item.name === entry.name);
    if (JSON.stringify(entry) !== JSON.stringify(original)) throw fail(`foreign stage entry: ${record.stage}/${entry.name}`);
  }
  await removeOwnedTree(record.stage, current);
}

async function cleanUnpreparedStage(stage, inventory, ancestors, identity, originalError) {
  try { await assertAncestors(ancestors); await assertPathIdentity(stage, identity); await removeOwnedTree(stage, inventory); }
  catch (cleanupError) { throw new AggregateError([originalError, cleanupError], `${originalError.message}; cleanup refused: ${cleanupError.message}`, { cause: cleanupError }); }
}

function validateJournal(record, path, target, ownerId) {
  if (record.version !== 1 || !["prepared", "committed"].includes(record.phase) || !["files", "directory", "create"].includes(record.kind) || record.target !== target || record.id !== ownerId || !/^[0-9a-f-]{36}$/.test(record.id) || path !== join(record.kind === "files" ? target : dirname(target), `${journalPrefix}${record.id}`) || !Array.isArray(record.ancestors)) throw fail("invalid or foreign transaction journal");
  if (record.kind === "files") {
    if (!Array.isArray(record.files) || !record.files.length || record.stage !== join(target, `.laugh-tale-stage-${record.id}`) || !Array.isArray(record.inventory)) throw fail("invalid file transaction journal");
    const seen = new Set();
    for (const file of record.files) {
      safeRelative(file.name);
      if (seen.has(file.name) || file.backup !== join(dirname(join(target, file.name)), `.laugh-tale-backup-${record.id}-${seen.size}`) || file.candidatePath !== join(record.stage, file.name)) throw fail("invalid transaction file paths");
      seen.add(file.name);
    }
  } else {
    for (const other of [record.stage, ...(record.kind === "directory" ? [record.backup] : [])]) {
      if (!isAbsolute(other) || other === target || contains(target, other) || contains(other, target)) throw fail("invalid directory transaction paths");
    }
  }
}

async function recoverInternal(target, ownerId) {
  const [journal] = await journalPaths(target);
  if (!journal) return "clean";
  const record = journal.value;
  validateJournal(record, journal.path, target, ownerId);
  await assertAncestors(record.ancestors);
  if (record.kind === "files") await recoverFiles(record);
  else await recoverDirectory(record);
  await assertAncestors(record.ancestors);
  await removeRecord(journal.path, journal);
  await syncDirectory(dirname(journal.path));
  return record.phase === "committed" ? "finalized" : "rolled-back";
}

async function recoverFiles(record) {
  const states = [];
  // Inspect the entire set before changing any entry, so ambiguity is preserved.
  for (const file of record.files) {
    const destination = join(record.target, file.name);
    const identity = await inspectPath(destination);
    const installed = samePathIdentity(identity, file.candidate.identity);
    const original = file.original && samePathIdentity(identity, file.original.identity);
    if (identity && !installed && !original) throw fail(`foreign destination: ${destination}`);
    if (identity) await fileMatches(destination, installed ? file.candidate : file.original);
    const backup = await fileMatches(file.backup, file.original);
    const staged = await fileMatches(file.candidatePath, file.candidate);
    if ((backup && original) || (installed && staged) || (record.phase === "prepared" && file.original && !backup && !original) || (record.phase === "committed" && !installed)) throw fail("ambiguous transaction generation");
    states.push({ file, destination, installed, backup, original, staged });
  }
  const restored = states.every(({ file, original, installed, backup }) => !installed && !backup && (file.original ? original : true));
  if (states.some(({ installed, staged }) => !installed && !staged) && !(record.phase === "prepared" && restored)) throw fail("ambiguous transaction generation");
  for (const { file, destination, installed, backup } of states.reverse()) {
    await assertAncestors(record.ancestors);
    if (record.phase === "prepared") {
      if (installed) { await fileMatches(destination, file.candidate); await assertPathIdentity(file.candidatePath, null); await rename(destination, file.candidatePath); }
      if (backup) { await fileMatches(file.backup, file.original); await assertPathIdentity(destination, null); await rename(file.backup, destination); }
    } else if (backup) { await fileMatches(file.backup, file.original); await unlink(file.backup); }
    await syncDirectory(dirname(destination));
  }
  await cleanStage(record);
  await syncDirectory(record.target);
}

async function treeAt(path, inventory) {
  if (!await inspectPath(path)) return false;
  await assertTree(path, inventory);
  return true;
}

async function recoverDirectory(record) {
  if (record.kind === "create" && record.phase === "prepared") {
    // After the target has moved back, cleanup may already have removed any
    // subset of the owned stage, including its root. Absence is the old state.
    if (await inspectPath(record.target)) {
      await assertTree(record.target, record.inventory);
      await assertPathIdentity(record.stage, null);
      await rename(record.target, record.stage);
    }
    await cleanStage(record);
    await syncDirectory(dirname(record.target));
    return;
  }
  const targetIdentity = await inspectPath(record.target);
  const installed = samePathIdentity(targetIdentity, record.inventory[0].identity);
  const original = record.kind === "directory" && samePathIdentity(targetIdentity, record.oldInventory[0].identity);
  if (targetIdentity && !installed && !original) throw fail("foreign target directory");
  if (installed) await assertTree(record.target, record.inventory);
  if (original) await assertTree(record.target, record.oldInventory);
  const staged = await treeAt(record.stage, record.inventory);
  const backup = record.kind === "directory" && await treeAt(record.backup, record.oldInventory);
  if ((installed && staged) || (!installed && !staged) || (original && backup) || (record.kind === "directory" && !original && !backup) || (record.phase === "committed" && !installed)) throw fail("ambiguous directory generation");
  if (record.phase === "prepared") {
    if (installed) { await assertPathIdentity(record.stage, null); await rename(record.target, record.stage); }
    if (backup) { await assertPathIdentity(record.target, null); await rename(record.backup, record.target); }
    if (record.kind === "create") await removeOwnedTree(record.stage, record.inventory);
  }
  for (const parent of new Set([dirname(record.target), dirname(record.stage), ...(record.backup ? [dirname(record.backup)] : [])])) await syncDirectory(parent);
}

export async function recoverProjectFileTransaction(projectDir) {
  const target = resolve(projectDir);
  const ctx = await reserve(target);
  try { const result = await recoverInternal(target, ctx.id); return result === "clean" ? ctx.recovered : result; }
  finally { await ctx.release(); }
}

async function withWriter(target, operations, action) {
  const ctx = await reserve(target, operations);
  let preserveReservation = false;
  try { await recoverInternal(target, ctx.id); return await action(ctx); }
  catch (error) {
    try { await hook(ctx, "rollback", target); await ctx.check(); await hook(ctx, "journal-recover", target); await recoverInternal(target, ctx.id); }
    catch (recoveryError) { preserveReservation = true; throw new AggregateError([error, recoveryError], `${error.message}; recovery refused: ${recoveryError.message}`, { cause: recoveryError }); }
    throw error;
  } finally { if (!preserveReservation) await ctx.release(); }
}

async function syncStage(ctx, stage) {
  const inventory = await snapshotTree(stage);
  const ancestors = await snapshotAncestors(stage);
  async function checkFile(path, entry) { await assertAncestors(ancestors); await assertPathIdentity(stage, inventory[0].identity); await fileMatches(path, entry); }
  for (const entry of inventory) {
    if (entry.identity.type !== "file") continue;
    const path = join(stage, entry.name);
    await hook(ctx, "stage-write", path);
    await checkFile(path, entry);
    await hook(ctx, "stage-fsync", path);
    await checkFile(path, entry);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { if (!samePathIdentity(pathIdentity(await handle.stat()), entry.identity)) throw fail("stage file changed"); await handle.sync(); } finally { await handle.close(); }
  }
  await assertTree(stage, inventory);
  for (const entry of [...inventory].reverse()) if (entry.identity.type === "directory") await syncDirectory(join(stage, entry.name));
  return inventory;
}

export async function publishCreatedProject(request, operations) {
  const target = resolve(request.targetDir);
  if (await validateTargetDirectory(target) !== "missing") throw fail("new project target must be missing");
  return withWriter(target, operations, async (ctx) => {
    const stage = join(dirname(target), `.laugh-tale-stage-${ctx.id}`);
    const ancestors = await snapshotAncestors(target);
    let identity;
    let inventory;
    let prepared = false;
    try {
      await hook(ctx, "stage-create", stage); await assertAncestors(ancestors); await mkdir(stage); identity = await inspectPath(stage); inventory = await snapshotTree(stage);
      await hook(ctx, "stage-populate", stage); await assertPathIdentity(stage, identity); await request.populate(stage);
      await assertPathIdentity(stage, identity); inventory = await snapshotTree(stage); await syncStage(ctx, stage);
      await hook(ctx, "stage-validate", stage); await assertTree(stage, inventory); await request.validate(stage); await assertTree(stage, inventory);
      await hook(ctx, "target-reserve", target); await ctx.check(); await assertPathIdentity(target, null);
      const journal = await prepare(ctx, { kind: "create", stage, ancestors, inventory }); prepared = true;
      await hook(ctx, "target-rename", target); await ctx.check(); await assertAncestors(ancestors); await assertTree(stage, inventory); await assertPathIdentity(target, null); await rename(stage, target);
      await hook(ctx, "directory-fsync", dirname(target)); await assertAncestors(ancestors); await syncDirectory(dirname(target));
      await commit(ctx, journal); await hook(ctx, "cleanup", journal); await recoverInternal(target, ctx.id);
    } catch (error) {
      if (!prepared && identity && !await inspectPath(join(dirname(target), `${journalPrefix}${ctx.id}`))) await cleanUnpreparedStage(stage, inventory, ancestors, identity, error);
      throw error;
    }
  });
}

async function copyView(source, stage, excluded, owned, ctx) {
  const inventory = await snapshotTree(source, excluded);
  const sourceDirectories = new Map(inventory.filter((entry) => entry.identity.type === "directory").map((entry) => [entry.name, entry.identity]));
  const stageDirectories = new Map([["", owned[0].identity]]);
  async function checkParents(root, name, directories) {
    await assertPathIdentity(root, directories.get(""));
    const parts = name.split("/");
    for (let i = 1; i < parts.length; i++) { const parent = parts.slice(0, i).join("/"); await assertPathIdentity(join(root, parent), directories.get(parent)); }
  }
  for (const entry of inventory.slice(1)) {
    const destination = join(stage, entry.name);
    const original = join(source, entry.name);
    await hook(ctx, "stage-populate", destination);
    await assertAncestors(await snapshotAncestors(destination));
    await checkParents(stage, entry.name, stageDirectories);
    await checkParents(source, entry.name, sourceDirectories);
    await assertPathIdentity(original, entry.identity);
    if (entry.identity.type === "directory") {
      await mkdir(destination); owned.push({ name: entry.name, identity: await inspectPath(destination) });
      stageDirectories.set(entry.name, owned.at(-1).identity);
    } else if (entry.identity.type === "link") {
      if (await readlink(original) !== entry.link) throw fail(`source link changed: ${original}`);
      await symlink(entry.link, destination);
      owned.push({ name: entry.name, identity: await inspectPath(destination), link: entry.link });
    } else {
      const contents = await readRegularFile(original);
      if (contents.hash !== entry.hash || !samePathIdentity(contents.identity, entry.identity)) throw fail(`source file changed: ${original}`);
      const handle = await open(destination, "wx", (await lstat(original)).mode & 0o777);
      const identity = pathIdentity(await handle.stat());
      try { await handle.writeFile(contents.bytes); }
      finally {
        await handle.close();
        // A failed write can leave a partial file, but only this opened inode is
        // ours. Capture its actual bytes for safe cleanup; never adopt a swap.
        await assertPathIdentity(destination, identity);
        owned.push({ name: entry.name, identity, hash: (await readRegularFile(destination)).hash });
      }
    }
  }
  await assertTree(stage, owned);
}

async function replaceFiles(request, operations, artifact) {
  const target = resolve(request.projectDir);
  return withWriter(target, operations, async (ctx) => {
    const ancestors = [...await snapshotAncestors(target), { path: target, identity: await inspectPath(target) }];
    if (ancestors.at(-1).identity?.type !== "directory") throw fail("project must be a directory");
    const stage = join(target, `.laugh-tale-stage-${ctx.id}`);
    let identity;
    let inventory;
    let prepared = false;
    try {
      const files = [];
      for (const [name, contents] of request.replacements) {
        safeRelative(assertAllowedReplacement(name, request.allowedPaths));
        const destination = join(target, name);
        ancestors.push(...await snapshotAncestors(destination));
        const existing = await inspectPath(destination);
        const original = existing ? await readRegularFile(destination) : null;
        if (artifact) {
          if ((artifact.expectedDestinationSha256 ?? null) !== (original?.hash ?? null)) throw fail("destination expected hash mismatch");
        } else if (!original) throw fail(`replacement original missing: ${name}`);
        files.push({ name, contents, original: original && { identity: original.identity, hash: original.hash }, backup: join(dirname(destination), `.laugh-tale-backup-${ctx.id}-${files.length}`), candidatePath: join(stage, name) });
      }
      if (!files.length) throw fail("empty replacement set");
      await hook(ctx, "stage-create", stage); await assertAncestors(ancestors); await mkdir(stage); identity = await inspectPath(stage); inventory = await snapshotTree(stage);
      if (!artifact) await copyView(target, stage, new Set([`.laugh-tale-stage-${ctx.id}`]), inventory, ctx);
      inventory = await snapshotTree(stage);
      for (const file of files) {
        const before = await snapshotTree(stage);
        await hook(ctx, "stage-write", file.candidatePath); await assertAncestors(ancestors); await assertTree(stage, before);
        if (await inspectPath(file.candidatePath)) await unlink(file.candidatePath);
        const handle = await open(file.candidatePath, "wx", artifact?.mode ?? (await lstat(join(target, file.name))).mode & 0o777);
        const writtenIdentity = pathIdentity(await handle.stat());
        try { await handle.writeFile(file.contents); inventory = await snapshotTree(stage); await hook(ctx, "stage-fsync", file.candidatePath); await assertTree(stage, inventory); await assertPathIdentity(file.candidatePath, writtenIdentity); await handle.sync(); } finally { await handle.close(); }
        const candidate = await readRegularFile(file.candidatePath); file.candidate = { identity: candidate.identity, hash: candidate.hash }; delete file.contents;
      }
      inventory = await snapshotTree(stage);
      await hook(ctx, "stage-validate", stage); await assertTree(stage, inventory); await request.validate(stage); await assertTree(stage, inventory);
      for (const entry of [...inventory].reverse()) if (entry.identity.type === "directory") await syncDirectory(join(stage, entry.name));
      const journal = await prepare(ctx, { kind: "files", stage, inventory, files, ancestors }); prepared = true;
      for (const file of files) {
        const destination = join(target, file.name);
        if (file.original) {
          await hook(ctx, "file-backup", destination); await ctx.check(); await assertAncestors(ancestors); await fileMatches(destination, file.original); await assertPathIdentity(file.backup, null); await rename(destination, file.backup);
        }
        await hook(ctx, "file-rename", destination); await ctx.check(); await assertAncestors(ancestors); await fileMatches(file.candidatePath, file.candidate); await assertPathIdentity(destination, null); await rename(file.candidatePath, destination);
      }
      await hook(ctx, "directory-fsync", target); await assertAncestors(ancestors);
      for (const directory of new Set([target, ...files.map((file) => dirname(join(target, file.name)))])) await syncDirectory(directory);
      await hook(ctx, "file-set-validate", target); await request.validate(target);
      for (const file of files) await fileMatches(join(target, file.name), file.candidate);
      await commit(ctx, journal); await hook(ctx, "cleanup", journal); await recoverInternal(target, ctx.id);
    } catch (error) {
      if (!prepared && identity && !await inspectPath(join(target, `${journalPrefix}${ctx.id}`))) await cleanUnpreparedStage(stage, inventory, ancestors, identity, error);
      throw error;
    }
  });
}

export async function replaceProjectFiles(request, operations) { return replaceFiles(request, operations); }

export async function writeArtifactAtomically(request, operations) {
  const destination = resolve(request.destination);
  const projectDir = dirname(destination);
  const name = relative(projectDir, destination);
  return replaceFiles({ projectDir, replacements: new Map([[name, request.contents]]), allowedPaths: new Set([name]), validate: async () => {} }, operations, request);
}

function contains(parent, child) { return child.startsWith(`${parent}${sep}`); }

export async function replaceOwnedDirectoryAtomically(request, operations) {
  const { targetDir: target, candidateDir: stage, backupDir: backup } = request;
  const paths = [target, stage, backup];
  if (paths.some((path) => !isAbsolute(path) || path !== resolve(path)) || paths.some((a, i) => paths.some((b, j) => i !== j && (a === b || contains(a, b))))) throw fail("directory paths must be absolute and disjoint");
  return withWriter(target, operations, async (ctx) => {
    const ancestors = (await Promise.all(paths.map(snapshotAncestors))).flat();
    const [targetIdentity, candidateIdentity, backupIdentity] = await Promise.all(paths.map(inspectPath));
    if (targetIdentity?.type !== "directory" || candidateIdentity?.type !== "directory" || backupIdentity) throw fail("target/candidate must be directories and backup absent");
    if (targetIdentity.dev !== candidateIdentity.dev || targetIdentity.dev !== (await inspectPath(dirname(backup))).dev) throw fail("directory replacement requires same device");
    const oldInventory = await snapshotTree(target);
    const inventory = await syncStage(ctx, stage);
    await request.validateExisting(target); await hook(ctx, "stage-validate", stage); await request.validateCandidate(stage);
    await assertTree(target, oldInventory); await assertTree(stage, inventory);
    const journal = await prepare(ctx, { kind: "directory", stage, backup, oldInventory, inventory, ancestors });
    await hook(ctx, "directory-backup", target); await ctx.check(); await assertAncestors(ancestors); await assertTree(target, oldInventory); await assertPathIdentity(backup, null); await rename(target, backup);
    await hook(ctx, "directory-install", target); await ctx.check(); await assertAncestors(ancestors); await assertTree(stage, inventory); await assertPathIdentity(target, null); await rename(stage, target);
    await hook(ctx, "directory-fsync", dirname(target)); await assertAncestors(ancestors);
    for (const parent of new Set(paths.map(dirname))) await syncDirectory(parent);
    await hook(ctx, "file-set-validate", target); await request.validateInstalled(target); await assertTree(target, inventory); await assertTree(backup, oldInventory);
    await commit(ctx, journal); await hook(ctx, "cleanup", journal); await recoverInternal(target, ctx.id);
    return { backupDir: backup };
  });
}

export async function readProjectFileSet({ projectDir, paths }) {
  const target = resolve(projectDir);
  async function guard() {
    if (await inspectPath(lockPath(target)) || await inspectPath(`${lockPath(target)}.recovery`)) throw busy();
    try { if ((await journalPaths(target)).length) throw busy(); }
    catch { throw busy("transaction journal requires inspection"); }
  }
  await guard();
  const ancestors = await snapshotAncestors(target);
  const identity = await inspectPath(target);
  if (identity?.type !== "directory") { await guard(); throw fail("project directory missing"); }
  let before;
  try { before = await lstat(target, { bigint: true }); } catch { throw busy("project directory moved during read"); }
  const result = new Map();
  const snapshots = new Map();
  try {
    for (const name of paths) { safeRelative(name); const file = await readRegularFile(join(target, name)); snapshots.set(name, file); result.set(name, file.bytes); }
    // Also detect a writer that completed and removed its journal entirely
    // between our two guards (the directory identity alone would miss it).
    for (const [name, file] of snapshots) { const again = await readRegularFile(join(target, name)); if (!samePathIdentity(file.identity, again.identity) || file.hash !== again.hash) throw busy("file generation changed during read"); }
  }
  catch (error) {
    await guard();
    try {
      const after = await lstat(target, { bigint: true });
      if (before.ino !== after.ino || before.dev !== after.dev || before.ctimeNs !== after.ctimeNs || before.mtimeNs !== after.mtimeNs) throw busy();
    } catch { throw busy("project generation moved during read"); }
    throw error;
  }
  await guard();
  try {
    await assertAncestors(ancestors); await assertPathIdentity(target, identity);
    const after = await lstat(target, { bigint: true });
    if (before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw busy();
  } catch { throw busy("project directory changed during read"); }
  return result;
}

export async function hashProjectFiles(projectDir, excludedTopLevelNames) {
  const entries = await snapshotTree(resolve(projectDir), excludedTopLevelNames);
  const hashes = new Map();
  for (const entry of entries) {
    if (entry.identity.type === "link") throw fail(`hash inventory rejects symbolic links: ${entry.name}`);
    if (entry.identity.type === "file") hashes.set(entry.name, entry.hash);
  }
  return hashes;
}
