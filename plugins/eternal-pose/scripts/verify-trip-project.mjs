import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { validateTripProject, projectSnapshot, summarize, finding, transactionFinding, parseArguments, invalidArgumentsResult } from "./validate-trip-project.mjs";
import { assertAncestors, inspectPath, readRegularFile, samePathIdentity, snapshotAncestors } from "../lib/path-safety.mjs";
const DEFAULT_OPERATIONS={lstat,mkdir,mkdtemp,open,readFile,readdir,realpath,rmdir,unlink,spawnSync};
const COMMANDS=[["test"],["run","type-check"],["run","lint"],["run","test:experience"],["run","test:a11y"],["run","build"]];
function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function normalizeError(error) {
  return error instanceof Error ? error : new Error("validation temp operation failed");
}

async function captureValidationParent(operations) {
  const path = await operations.realpath(tmpdir());
  const stats = await operations.lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("validation temp parent is unavailable");
  }
  return { path, stats };
}

async function assertValidationRootIdentity(ownership, operations) {
  if (ownership.stats === null) {
    throw new Error("validation temp ownership is uncertain");
  }
  try {
    const parentPath = await operations.realpath(dirname(ownership.path));
    const parentStats = await operations.lstat(parentPath);
    const beforeStats = await operations.lstat(ownership.path);
    const canonicalPath = await operations.realpath(ownership.path);
    const afterStats = await operations.lstat(ownership.path);
    if (
      parentPath !== ownership.parent.path ||
      !sameIdentity(parentStats, ownership.parent.stats) ||
      canonicalPath !== ownership.path ||
      basename(ownership.path).startsWith("eternal-pose-validation-") === false ||
      !beforeStats.isDirectory() ||
      beforeStats.isSymbolicLink() ||
      !afterStats.isDirectory() ||
      afterStats.isSymbolicLink() ||
      !sameIdentity(beforeStats, afterStats) ||
      !sameIdentity(afterStats, ownership.stats)
    ) {
      throw new Error("validation temp ownership changed");
    }
  } catch {
    throw new Error("validation temp ownership changed");
  }
}

async function assertValidationOwnership(ownership, operations) {
  await assertValidationRootIdentity(ownership, operations);
  if (ownership.marker.stats === null) {
    throw new Error("validation temp ownership is uncertain");
  }
  try {
    const stats = await operations.lstat(ownership.marker.path);
    const contents = await operations.readFile(ownership.marker.path, "utf8");
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      !sameIdentity(stats, ownership.marker.stats) ||
      contents !== ownership.marker.token
    ) {
      throw new Error("validation temp ownership changed");
    }
  } catch {
    throw new Error("validation temp ownership changed");
  }
}

async function verifyValidationEntry(entry, operations) {
  const stats = await operations.lstat(entry.path);
  const expectedType = entry.type === "directory" ? stats.isDirectory() : stats.isFile();
  if (!expectedType || stats.isSymbolicLink() || !sameIdentity(stats, entry.stats)) {
    throw new Error("validation temp entry ownership changed");
  }
}

async function assertValidationParentChain(ownership, destinationPath, operations) {
  await assertValidationOwnership(ownership, operations);
  const relativeParent = relative(ownership.path, dirname(destinationPath));
  if (relativeParent === ".." || relativeParent.startsWith(`..${sep}`) || isAbsolute(relativeParent)) {
    throw new Error("validation temp ownership changed");
  }
  let currentPath = ownership.path;
  for (const part of relativeParent.split(sep).filter(Boolean)) {
    currentPath = join(currentPath, part);
    const entry = ownership.entries.find(
      (candidate) => !candidate.removed && candidate.type === "directory" && candidate.path === currentPath,
    );
    if (entry === undefined) throw new Error("validation temp ownership changed");
    await verifyValidationEntry(entry, operations);
  }
}

async function acquireValidationDirectory(acquisition, operations) {
  const parent = await captureValidationParent(operations);
  const createdPath = resolve(await operations.mkdtemp(join(parent.path, "eternal-pose-validation-")));
  const path = join(parent.path, basename(createdPath));
  const ownership = {
    path,
    parent,
    stats: null,
    marker: {
      path: join(path, `.laugh-tale-incomplete-${randomUUID()}`),
      token: randomUUID(),
      stats: null,
    },
    protectedEntries: [],
    entries: [],
    tainted: { path, type: "root" },
  };
  acquisition.ownership = ownership;
  if (createdPath !== path) throw new Error("validation temp ownership changed");

  const beforeStats = await operations.lstat(path);
  const canonicalPath = await operations.realpath(path);
  const afterStats = await operations.lstat(path);
  if (
    canonicalPath !== path ||
    !beforeStats.isDirectory() ||
    beforeStats.isSymbolicLink() ||
    !afterStats.isDirectory() ||
    afterStats.isSymbolicLink() ||
    !sameIdentity(beforeStats, afterStats)
  ) {
    throw new Error("validation temp ownership changed");
  }
  ownership.stats = afterStats;
  ownership.tainted = null;

  await assertValidationRootIdentity(ownership, operations);
  ownership.tainted = { path: ownership.marker.path, type: "marker" };
  const handle = await operations.open(ownership.marker.path, "wx", 0o600);
  let primaryError;
  try {
    const handleStats = await handle.stat();
    const pathStats = await operations.lstat(ownership.marker.path);
    if (
      !handleStats.isFile() ||
      !pathStats.isFile() ||
      pathStats.isSymbolicLink() ||
      !sameIdentity(handleStats, pathStats)
    ) {
      throw new Error("validation temp ownership changed");
    }
    ownership.marker.stats = pathStats;
    await handle.writeFile(ownership.marker.token);
    ownership.tainted = null;
  } catch (error) {
    primaryError = normalizeError(error);
  }
  try {
    await handle.close();
  } catch (error) {
    primaryError ??= normalizeError(error);
  }
  if (primaryError !== undefined) throw primaryError;
  await assertValidationOwnership(ownership, operations);
  return ownership;
}

async function createValidationDirectoryEntry(ownership, name, operations) {
  const path = join(ownership.path, name);
  await assertValidationParentChain(ownership, path, operations);
  if (ownership.tainted !== null) throw new Error("validation temp ownership is uncertain");
  ownership.tainted = { path, type: "directory" };
  await operations.mkdir(path);
  const stats = await operations.lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("validation temp ownership changed");
  }
  const entry = { path, type: "directory", stats, removed: false };
  ownership.entries.push(entry);
  ownership.protectedEntries.push(entry);
  ownership.tainted = null;
}

async function captureValidationInventory(ownership, operations) {
  if (ownership.tainted !== null) throw new Error("validation temp ownership is uncertain");
  await assertValidationOwnership(ownership, operations);
  for (const entry of ownership.protectedEntries) await verifyValidationEntry(entry, operations);
  const captured = [];

  async function walk(directory) {
    const namesBefore = (await operations.readdir(directory)).sort();
    for (const name of namesBefore) {
      const path = join(directory, name);
      if (path === ownership.marker.path) {
        if (directory !== ownership.path) throw new Error("validation temp inventory changed");
        continue;
      }
      const beforeStats = await operations.lstat(path);
      const type = beforeStats.isDirectory() ? "directory" : beforeStats.isFile() ? "file" : null;
      if (type === null || beforeStats.isSymbolicLink()) {
        throw new Error("validation temp inventory changed");
      }
      captured.push({ path, type, stats: beforeStats, removed: false });
      if (type === "directory") await walk(path);
      const afterStats = await operations.lstat(path);
      if (!sameIdentity(beforeStats, afterStats)) throw new Error("validation temp inventory changed");
    }
    const namesAfter = (await operations.readdir(directory)).sort();
    if (JSON.stringify(namesAfter) !== JSON.stringify(namesBefore)) {
      throw new Error("validation temp inventory changed");
    }
  }

  await walk(ownership.path);
  ownership.entries = captured;
  await verifyValidationInventory(ownership, operations);
}

async function verifyValidationInventory(ownership, operations) {
  if (ownership.tainted !== null) throw new Error("validation temp ownership is uncertain");
  await assertValidationOwnership(ownership, operations);
  const expected = new Map(
    ownership.entries.filter((entry) => !entry.removed).map((entry) => [entry.path, entry]),
  );
  const seen = new Set();

  async function walk(directory) {
    for (const name of await operations.readdir(directory)) {
      const path = join(directory, name);
      if (path === ownership.marker.path) continue;
      const entry = expected.get(path);
      if (entry === undefined) throw new Error("validation temp inventory changed");
      await verifyValidationEntry(entry, operations);
      seen.add(path);
      if (entry.type === "directory") await walk(path);
    }
  }

  await walk(ownership.path);
  if (seen.size !== expected.size) throw new Error("validation temp inventory changed");
}

async function runBeforeTempMutation(operations, phase, path, validationDir) {
  await operations.beforeTempMutation?.({ phase, path, validationDir });
}

async function cleanOwnedValidationDirectory(ownership, operations) {
  try {
    await verifyValidationInventory(ownership, operations);
    for (const entry of [...ownership.entries].reverse()) {
      if (entry.removed) continue;
      await runBeforeTempMutation(operations, "validation-cleanup", entry.path, ownership.path);
      await assertValidationParentChain(ownership, entry.path, operations);
      await verifyValidationEntry(entry, operations);
      if (entry.type === "directory") await operations.rmdir(entry.path);
      else await operations.unlink(entry.path);
      entry.removed = true;
    }
    await verifyValidationInventory(ownership, operations);
    await runBeforeTempMutation(operations, "validation-cleanup", ownership.marker.path, ownership.path);
    await assertValidationOwnership(ownership, operations);
    await operations.unlink(ownership.marker.path);
    await runBeforeTempMutation(operations, "validation-cleanup", ownership.path, ownership.path);
    await assertValidationRootIdentity(ownership, operations);
    await operations.rmdir(ownership.path);
    return [];
  } catch (error) {
    return [normalizeError(error)];
  }
}


function commandEnvironment(ownership) {
 const environment={};
 for(const key of ["PATH","HOME","USERPROFILE","SystemRoot","SYSTEMROOT","WINDIR","TMPDIR","TEMP","TMP","LANG","LC_ALL","CI"]) if(process.env[key]!==undefined)environment[key]=process.env[key];
 environment.ETERNAL_POSE_VALIDATION_OUT_DIR=join(ownership.path,"output");
 environment.ETERNAL_POSE_VALIDATION_CACHE_DIR=join(ownership.path,"cache");
 environment.ETERNAL_POSE_VALIDATION_ENV_DIR=join(ownership.path,"environment");
 environment.npm_config_cache=join(ownership.path,"cache");
 environment.npm_config_userconfig=join(ownership.path,"environment","user.npmrc");
 environment.npm_config_globalconfig=join(ownership.path,"environment","global.npmrc");
 return environment;
}

async function installedDependencySnapshot(root, packages) {
 const inventory=[];
 const modules=join(root,"node_modules");
 async function directory(path) {
  const ancestors=await snapshotAncestors(path), identity=await inspectPath(path);
  if(identity?.type!=="directory" || await realpath(path)!==path)throw new Error("installed dependency directory must be real");
  await assertAncestors(ancestors);
  inventory.push({path,identity,ancestors});
 }
 await directory(modules);
 for(const [name,version] of Object.entries(packages)) {
  const packageRoot=join(modules,name);
  await directory(packageRoot);
  const file=await readRegularFile(join(packageRoot,"package.json"));
  const pkg=JSON.parse(file.bytes.toString("utf8"));
  if(pkg.name!==name || pkg.version!==version)throw new Error("installed package identity differs from manifest");
  inventory.push({path:join(packageRoot,"package.json"),identity:file.identity,hash:file.hash});
 }
 await directory(join(modules,".bin"));
 for(const name of ["vitest","tsc","eslint","vite"]) {
  const path=join(modules,".bin",name), identity=await inspectPath(path);
  if(!identity || !["file","link"].includes(identity.type))throw new Error("installed tool is missing");
  const target=await realpath(path);
  if(!target.startsWith(modules+sep))throw new Error("installed tool escapes project dependencies");
  const file=await readRegularFile(target), ancestors=await snapshotAncestors(target);
  if(!samePathIdentity(identity,await inspectPath(path)))throw new Error("installed tool identity changed");
  await assertAncestors(ancestors);
  inventory.push({path,identity,target,targetIdentity:file.identity,hash:file.hash,ancestors});
 }
 return JSON.stringify(inventory);
}

export async function verifyTripProject(root,mode,testOperations={}) {
 const operations={...DEFAULT_OPERATIONS,...testOperations};
 let beforeValidation;
 try { beforeValidation=await projectSnapshot(root); } catch { /* Static validation reports the exact read failure. */ }
 const initial=await validateTripProject(root,mode);
 const findings=[...initial.findings], commands=[];
 let failedCommand=null;
 if(initial.counts.errors)return {...initial,commands,failedCommand};
 const acquisition={ownership:null};
 let ownership, phase="ownership";
 try {
  const accepted=await projectSnapshot(root);
  if(!beforeValidation || accepted.hash!==beforeValidation.hash)throw Object.assign(new Error("Project generation changed during validation."),{code:"transaction-in-progress"});
  async function stable() {
   const current=await projectSnapshot(root);
   if(current.hash!==accepted.hash)throw Object.assign(new Error("Project generation changed."),{code:"transaction-in-progress"});
  }
  // Verify executes installed tools. Validate remains a static source check.
  // This bounds the four owned packages and standard tools, not arbitrary user
  // scripts or all transitive third-party code as an execution sandbox would.
  let installed;
  const packages=JSON.parse(accepted.files.get("eternal-pose.json").toString("utf8")).packages;
  async function installedStable() {
   try {
    const current=await installedDependencySnapshot(root,packages);
    if(installed!==undefined && installed!==current)throw new Error("installed dependency identity changed");
    installed=current;
   } catch {throw Object.assign(new Error("Installed dependencies are missing, changed, or escape the project."),{code:"invalid-installed-dependencies"});}
  }
  await installedStable();
  ownership=await acquireValidationDirectory(acquisition,operations);
  phase="validation";
  for(const name of ["output","cache","environment"])await createValidationDirectoryEntry(ownership,name,operations);
  await captureValidationInventory(ownership,operations);
  const env=commandEnvironment(ownership);
  for(const args of COMMANDS) {
   await stable();
   await installedStable();
   await verifyValidationInventory(ownership,operations);
   const result=operations.spawnSync(process.platform==="win32"?"npm.cmd":"npm",args,{cwd:root,env,shell:false,stdio:"inherit"});
   await stable();
   await captureValidationInventory(ownership,operations);
   const command={command:"npm "+args.join(" "),exitCode:result.status??1};
   commands.push(command);
   if(command.exitCode!==0){failedCommand=command;findings.push(finding("project.command-failed","package.json",command.command+" failed (exit "+command.exitCode+")."));break;}
  }
 }catch(error) {
  ownership=acquisition.ownership;
  findings.push(error.code==="transaction-in-progress"?transactionFinding():error.code==="invalid-installed-dependencies"?finding("project.invalid-installed-dependencies","node_modules","Installed dependencies are missing, changed, or escape the project."):finding(phase==="ownership"?"project.validation-ownership-failed":"project.validation-failure",".","Isolated verification could not complete safely."));
 }finally{
  if(ownership) {
   const errors=await cleanOwnedValidationDirectory(ownership,operations);
   if(errors.length)findings.push(finding("project.validation-cleanup-failed",".","Temporary output identity changed; preserved for inspection."));
  }
 }
 return {...summarize(mode,findings),commands,failedCommand};
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
 const request=parseArguments(process.argv.slice(2));
 const result=request?await verifyTripProject(request.root,request.mode):{...invalidArgumentsResult(),commands:[],failedCommand:null};
 console.log("ETERNAL_POSE_VERIFICATION_RESULT "+JSON.stringify(result));if(result.counts.errors)process.exitCode=1;
}
