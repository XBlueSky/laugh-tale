import { mkdtemp, realpath, mkdir, writeFile, readFile, readdir, readlink, rm, rename, symlink, lstat } from "node:fs/promises";
import { fork, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

interface Event { phase: string; path: string; transactionId: string }
type Operations = { beforeMutation?: (event: Event) => void | Promise<void> };
interface API {
  publishCreatedProject(request: { targetDir: string; populate: (stage: string) => Promise<void>; validate: (stage: string) => Promise<void> }, operations?: Operations): Promise<void>;
  replaceProjectFiles(request: { projectDir: string; replacements: Map<string, string>; allowedPaths: Set<string>; validate: (stage: string) => Promise<void> }, operations?: Operations): Promise<void>;
  recoverProjectFileTransaction(project: string): Promise<string>;
  readProjectFileSet(request: { projectDir: string; paths: string[] }): Promise<Map<string, Uint8Array>>;
  writeArtifactAtomically(request: { destination: string; contents: string; mode: number; expectedDestinationSha256?: string | null }, operations?: Operations): Promise<void>;
  replaceOwnedDirectoryAtomically(request: { targetDir: string; candidateDir: string; backupDir: string; validateExisting: (path: string) => Promise<void>; validateCandidate: (path: string) => Promise<void>; validateInstalled: (path: string) => Promise<void> }, operations?: Operations): Promise<{ backupDir: string }>;
  hashProjectFiles(project: string, exclusions: Set<string>): Promise<Map<string, string>>;
}
const moduleUrl = new URL("../../plugins/eternal-pose/lib/atomic-publication.mjs", import.meta.url).href;
const api = await import(moduleUrl) as API;
const roots: string[] = [];
async function root() { const path = await realpath(await mkdtemp(join(tmpdir(), "atomic-publication-"))); roots.push(path); return path; }
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
function failOnceAt(phase: string): Operations { let failed = false; return { beforeMutation(event) { if (!failed && event.phase === phase) { failed = true; throw new Error(`injected ${phase}`); } } }; }
const noop = async () => {};
async function project() { const path = join(await root(), "project"); await mkdir(join(path, "src"), { recursive: true }); await writeFile(join(path, "manifest"), "old manifest"); await writeFile(join(path, "src/ledger"), "old ledger"); return path; }
function request(projectDir: string) { return { projectDir, replacements: new Map([["manifest", "new manifest"], ["src/ledger", "new ledger"]]), allowedPaths: new Set(["manifest", "src/ledger"]), validate: noop }; }
async function bytes(path: string) { return Promise.all([readFile(join(path, "manifest"), "utf8"), readFile(join(path, "src/ledger"), "utf8")]); }

test.each(["stage-create", "stage-populate", "stage-write", "stage-fsync", "stage-validate", "target-reserve", "target-rename", "directory-fsync"])("create rolls back failure at %s", async (phase) => {
  const targetDir = join(await root(), "trip");
  await expect(api.publishCreatedProject({ targetDir, populate: (stage) => writeFile(join(stage, "complete"), "complete"), validate: noop }, failOnceAt(phase))).rejects.toThrow("injected");
  await expect(readFile(join(targetDir, "complete"))).rejects.toThrow();
});
test.each(["stage-write", "stage-fsync", "journal-prepare", "file-backup", "file-rename", "file-set-validate", "directory-fsync", "journal-commit"])("file set rolls back failure at %s", async (phase) => {
  const path = await project();
  await expect(api.replaceProjectFiles(request(path), failOnceAt(phase))).rejects.toThrow("injected");
  expect(await bytes(path)).toEqual(["old manifest", "old ledger"]);
  expect((await readdir(path)).sort()).toEqual(["manifest", "src"]);
});

test("file-set success leaves only complete accepted files", async () => {
  const path = await project(); await api.replaceProjectFiles(request(path));
  expect(await bytes(path)).toEqual(["new manifest", "new ledger"]);
  expect((await readdir(path)).sort()).toEqual(["manifest", "src"]);
  expect(await readdir(join(path, "src"))).toEqual(["ledger"]);
  const accepted = await api.readProjectFileSet({ projectDir: path, paths: ["manifest", "src/ledger"] });
  expect([...accepted.values()].map((value) => Buffer.from(value).toString())).toEqual(["new manifest", "new ledger"]);
  expect(await api.recoverProjectFileTransaction(path)).toBe("clean");
});

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
test.each([false, true])("artifact creates/replaces complete bytes (existing=%s)", async (existing) => {
  const destination = join(await root(), "review.json");
  if (existing) await writeFile(destination, "old review");
  await api.writeArtifactAtomically({ destination, contents: "new review", mode: 0o600, expectedDestinationSha256: existing ? sha("old review") : null });
  expect(await readFile(destination, "utf8")).toBe("new review");
  expect((await lstat(destination)).mode & 0o777).toBe(0o600);
});
test.each(["stage-write", "stage-fsync", "stage-validate", "journal-prepare", "file-backup", "file-rename", "directory-fsync", "file-set-validate", "journal-commit"])("artifact restores old bytes on caught %s failure", async (phase) => {
  const destination = join(await root(), "review.json"); await writeFile(destination, "old review");
  await expect(api.writeArtifactAtomically({ destination, contents: "new review", mode: 0o600, expectedDestinationSha256: sha("old review") }, failOnceAt(phase))).rejects.toThrow("injected");
  expect(await readFile(destination, "utf8")).toBe("old review");
});
test("create publishes the complete validated project and removes staging records", async () => {
  const parent = await root(); const targetDir = join(parent, "trip");
  await api.publishCreatedProject({ targetDir, populate: (stage) => writeFile(join(stage, "complete"), "complete"), validate: async (stage) => { expect(await readFile(join(stage, "complete"), "utf8")).toBe("complete"); } });
  expect(await readFile(join(targetDir, "complete"), "utf8")).toBe("complete"); expect(await readdir(parent)).toEqual(["trip"]);
});
test.each([undefined, null, "incorrect"])("artifact rejects stale expectation %s", async (expectedDestinationSha256) => {
  const destination = join(await root(), "review.json"); await writeFile(destination, "old review");
  await expect(api.writeArtifactAtomically({ destination, contents: "new review", mode: 0o600, expectedDestinationSha256 })).rejects.toThrow("hash mismatch");
  expect(await readFile(destination, "utf8")).toBe("old review");
});
test.each([false, true])("artifact preserves destination appearing/changing after comparison (%s)", async (existing) => {
  const destination = join(await root(), "review.json");
  if (existing) await writeFile(destination, "old review");
  await expect(api.writeArtifactAtomically({ destination, contents: "new review", mode: 0o600, expectedDestinationSha256: existing ? sha("old review") : null }, { async beforeMutation(event) {
    if (event.phase === "journal-prepare") {
      if (existing) await rename(destination, `${destination}.saved`);
      await writeFile(destination, "foreign review");
    }
  } })).rejects.toThrow();
  expect(await readFile(destination, "utf8")).toBe("foreign review");
});

async function directoryRequest() {
  const targetDir = await project(); const parent = join(targetDir, ".."); const candidateDir = join(parent, "candidate"); const backupDir = join(parent, "backup");
  await mkdir(join(targetDir, "node_modules")); await writeFile(join(targetDir, "node_modules/ignored"), "ignored residue");
  await mkdir(join(candidateDir, "src"), { recursive: true }); await writeFile(join(candidateDir, "manifest"), "new manifest"); await writeFile(join(candidateDir, "src/ledger"), "new ledger");
  return { targetDir, candidateDir, backupDir, validateExisting: noop, validateCandidate: noop, validateInstalled: noop };
}
test.each(["stage-validate", "journal-prepare", "directory-backup", "directory-install", "directory-fsync", "file-set-validate", "journal-commit"])("directory replacement restores complete old tree on %s", async (phase) => {
  const req = await directoryRequest();
  await expect(api.replaceOwnedDirectoryAtomically(req, failOnceAt(phase))).rejects.toThrow("injected");
  expect(await bytes(req.targetDir)).toEqual(["old manifest", "old ledger"]);
  expect(await readFile(join(req.targetDir, "node_modules/ignored"), "utf8")).toBe("ignored residue");
  expect(await bytes(req.candidateDir)).toEqual(["new manifest", "new ledger"]);
});
test("directory commit retains old tree and inode at caller backup", async () => {
  const req = await directoryRequest(); const oldInode = (await lstat(req.targetDir)).ino;
  expect(await api.replaceOwnedDirectoryAtomically(req)).toEqual({ backupDir: req.backupDir });
  expect(await bytes(req.targetDir)).toEqual(["new manifest", "new ledger"]);
  expect((await lstat(req.backupDir)).ino).toBe(oldInode);
  expect(await readFile(join(req.backupDir, "node_modules/ignored"), "utf8")).toBe("ignored residue");
  expect((await readdir(join(req.targetDir, ".."))).sort()).toEqual(["backup", "project"]);
});
test.each(["targetDir", "candidateDir", "backupDir"] as const)("directory rejects symlink %s", async (key) => {
  const req = await directoryRequest(); const foreign = join(await root(), "foreign"); await mkdir(foreign);
  if (key !== "backupDir") await rename(req[key], `${req[key]}.saved`);
  await symlink(foreign, req[key]);
  await expect(api.replaceOwnedDirectoryAtomically(req)).rejects.toThrow();
  expect((await lstat(req[key])).isSymbolicLink()).toBe(true);
});
test("directory rejects preexisting backup and overlapping paths", async () => {
  const req = await directoryRequest(); await mkdir(req.backupDir);
  await expect(api.replaceOwnedDirectoryAtomically(req)).rejects.toThrow("backup absent");
  await expect(api.replaceOwnedDirectoryAtomically({ ...req, backupDir: join(req.targetDir, "backup") })).rejects.toThrow("disjoint");
});
test("directory rejects a different-device candidate before inspecting its tree", async ({ skip }) => {
  const req = await directoryRequest();
  if ((await lstat(req.targetDir)).dev === (await lstat("/dev")).dev) { skip(); return; }
  await expect(api.replaceOwnedDirectoryAtomically({ ...req, candidateDir: "/dev" })).rejects.toThrow("same device");
  expect(await bytes(req.targetDir)).toEqual(["old manifest", "old ledger"]);
});
test.each(["directory-backup", "directory-install"])("directory preserves a foreign destination immediately before %s", async (phase) => {
  const req = await directoryRequest(); let foreign = "";
  await expect(api.replaceOwnedDirectoryAtomically(req, { async beforeMutation(event) {
    if (event.phase !== phase) return;
    foreign = phase === "directory-backup" ? req.backupDir : req.targetDir;
    await mkdir(foreign); await writeFile(join(foreign, "keep"), "foreign");
  } })).rejects.toThrow();
  expect(await readFile(join(foreign, "keep"), "utf8")).toBe("foreign");
});

const worker = fileURLToPath(new URL("../fixtures/atomic-publication-crash-worker.mjs", import.meta.url));
async function pauseWriter(action: string, path: string, phase: string, occurrence = 1): Promise<ChildProcess> {
  const child = fork(worker, [action, path, phase, String(occurrence)], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  let stderr = ""; child.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });
  await new Promise<void>((resolve, reject) => { child.once("message", () => resolve()); child.once("exit", (code) => reject(new Error(`worker exited ${String(code)}: ${stderr}`))); child.once("error", reject); });
  return child;
}
async function killWriter(child: ChildProcess) { await new Promise<void>((resolve) => { child.once("exit", () => resolve()); child.kill("SIGKILL"); }); }
function recoverFresh(path: string) {
  const result = spawnSync(process.execPath, [worker, "recover", path], { encoding: "utf8" });
  expect(result.stderr).toBe(""); expect(result.status).toBe(0); return result.stdout;
}
test.each([
  ["file-backup", 1], ["file-rename", 1], ["file-backup", 2], ["file-rename", 2], ["directory-fsync", 1], ["file-set-validate", 1], ["cleanup", 1],
] as const)("real killed file writer recovers at %s #%s", async (phase, occurrence) => {
  const path = await project(); const child = await pauseWriter("files", path, phase, occurrence); await killWriter(child);
  const committed = phase === "cleanup";
  expect(recoverFresh(path)).toBe(committed ? "finalized" : "rolled-back");
  expect(await bytes(path)).toEqual(committed ? ["new manifest", "new ledger"] : ["old manifest", "old ledger"]);
  expect((await readdir(path)).sort()).toEqual(["manifest", "src"]);
});
test.each(["directory-backup", "directory-install", "directory-fsync", "file-set-validate", "cleanup"])("parent journal recovers killed directory writer at %s", async (phase) => {
  const req = await directoryRequest(); const child = await pauseWriter("directory", req.targetDir, phase);
  for (let i = 0; i < 3; i++) await expect(api.readProjectFileSet({ projectDir: req.targetDir, paths: ["manifest", "src/ledger"] })).rejects.toMatchObject({ code: "transaction-in-progress" });
  await killWriter(child);
  const committed = phase === "cleanup";
  expect(recoverFresh(req.targetDir)).toBe(committed ? "finalized" : "rolled-back");
  expect(await bytes(req.targetDir)).toEqual(committed ? ["new manifest", "new ledger"] : ["old manifest", "old ledger"]);
  expect(await readFile(join(committed ? req.backupDir : req.targetDir, "node_modules/ignored"), "utf8")).toBe("ignored residue");
});
test("active writer excludes a second writer and recovery, then dead writer is recoverable", async () => {
  const path = await project(); const child = await pauseWriter("files", path, "file-backup", 2);
  try {
    await expect(api.replaceProjectFiles(request(path))).rejects.toMatchObject({ code: "transaction-in-progress" });
    await expect(api.recoverProjectFileTransaction(path)).rejects.toMatchObject({ code: "transaction-in-progress" });
    for (let i = 0; i < 10; i++) await expect(api.readProjectFileSet({ projectDir: path, paths: ["manifest", "src/ledger"] })).rejects.toMatchObject({ code: "transaction-in-progress" });
  } finally { await killWriter(child); }
  expect(recoverFresh(path)).toBe("rolled-back");
  expect(await bytes(path)).toEqual(["old manifest", "old ledger"]);
});
test.each([["prepared", "rename", 1], ["prepared", "rename", 3], ["prepared", "unlink", 1], ["prepared", "rmdir", 1], ["prepared", "rmdir", 2], ["committed", "unlink", 1], ["committed", "unlink", 2], ["committed", "rmdir", 1], ["committed", "rmdir", 2]] as const)("interrupted recovery replays %s %s #%s", async (state, operation, occurrence) => {
  const path = await project();
  await killWriter(await pauseWriter("files", path, state === "prepared" ? "file-set-validate" : "cleanup"));
  await killWriter(await pauseWriter("recover-pause", path, operation, occurrence));
  expect(recoverFresh(path)).toBe(state === "prepared" ? "rolled-back" : "finalized");
  expect(await bytes(path)).toEqual(state === "prepared" ? ["old manifest", "old ledger"] : ["new manifest", "new ledger"]);
  expect((await readdir(path)).sort()).toEqual(["manifest", "src"]);
});
test("active recovery successor protects reclamation of a dead recovery claim", async () => {
  const path = await project(); await killWriter(await pauseWriter("files", path, "file-set-validate"));
  await killWriter(await pauseWriter("recover-pause", path, "rename"));
  const reclaimer = await pauseWriter("recover-pause", path, "claim");
  try {
    await expect(api.recoverProjectFileTransaction(path)).rejects.toMatchObject({ code: "transaction-in-progress" });
    await expect(api.replaceProjectFiles(request(path))).rejects.toMatchObject({ code: "transaction-in-progress" });
  } finally { await killWriter(reclaimer); }
  await killWriter(await pauseWriter("recover-pause", path, "unlink"));
  expect(recoverFresh(path)).toBe("rolled-back"); expect(await bytes(path)).toEqual(["old manifest", "old ledger"]);
  expect((await readdir(join(path, ".."))).sort()).toEqual(["project"]);
});
test.each([["rename", 1], ["unlink", 1], ["rmdir", 1], ["rmdir", 2]] as const)("interrupted Create recovery replays %s #%s", async (operation, occurrence) => {
  const parent = await root(); const path = join(parent, "created");
  await killWriter(await pauseWriter("create", path, "directory-fsync"));
  await killWriter(await pauseWriter("recover-pause", path, operation, occurrence));
  expect(recoverFresh(path)).toBe("rolled-back"); expect(await readdir(parent)).toEqual([]);
});
test("active recovery excludes writers and another recovery; repeated dead recoveries resume", async () => {
  const path = await project(); await killWriter(await pauseWriter("files", path, "file-set-validate"));
  const recovering = await pauseWriter("recover-pause", path, "rename");
  try {
    await expect(api.recoverProjectFileTransaction(path)).rejects.toMatchObject({ code: "transaction-in-progress" });
    await expect(api.replaceProjectFiles(request(path))).rejects.toMatchObject({ code: "transaction-in-progress" });
  } finally { await killWriter(recovering); }
  await killWriter(await pauseWriter("recover-pause", path, "rename"));
  expect(recoverFresh(path)).toBe("rolled-back"); expect(await bytes(path)).toEqual(["old manifest", "old ledger"]);
});
test("installed dependency symlinks are preserved in the complete candidate view", async () => {
  const path = await project(); await mkdir(join(path, "node_modules/.bin"), { recursive: true }); await mkdir(join(path, "node_modules/tool"));
  await writeFile(join(path, "node_modules/tool/cli"), "dependency executable"); await symlink("../tool/cli", join(path, "node_modules/.bin/tool"));
  const inode = (await lstat(join(path, "node_modules/.bin/tool"))).ino;
  await api.replaceProjectFiles({ ...request(path), validate: async (view) => { expect(await readlink(join(view, "node_modules/.bin/tool"))).toBe("../tool/cli"); expect(await readFile(join(view, "node_modules/tool/cli"), "utf8")).toBe("dependency executable"); } });
  expect(await bytes(path)).toEqual(["new manifest", "new ledger"]); expect((await lstat(join(path, "node_modules/.bin/tool"))).ino).toBe(inode);
});
test("staged copying failure preserves the useful error and cleans owned partial view", async () => {
  const path = await project(); let copied = 0;
  await expect(api.replaceProjectFiles(request(path), { beforeMutation(event) { if (event.phase === "stage-populate" && ++copied === 3) throw new Error("injected partial copy failure"); } })).rejects.toThrow("injected partial copy failure");
  expect(copied).toBe(3); expect(await bytes(path)).toEqual(["old manifest", "old ledger"]); expect((await readdir(path)).sort()).toEqual(["manifest", "src"]);
});
test("staged copying failure preserves foreign partial-stage entries and the original error", async () => {
  const path = await project(); const foreign = join(await root(), "keep"); await writeFile(foreign, "foreign"); let changedPath = "";
  let copied = 0;
  await expect(api.replaceProjectFiles(request(path), { async beforeMutation(event) {
    if (event.phase !== "stage-populate" || ++copied !== 3) return;
    const stage = join(event.path, "../.."); changedPath = join(stage, "manifest");
    await rename(changedPath, `${changedPath}.saved`); await symlink(foreign, changedPath); throw new Error("injected foreign partial stage");
  } })).rejects.toThrow("injected foreign partial stage");
  expect((await lstat(changedPath)).isSymbolicLink()).toBe(true); expect(await readFile(foreign, "utf8")).toBe("foreign"); expect(await bytes(path)).toEqual(["old manifest", "old ledger"]);
});
test("staged copying never adopts an unexpected child as its cleanup inventory", async () => {
  const path = await project(); let addedPath = ""; let copied = 0;
  await expect(api.replaceProjectFiles(request(path), { async beforeMutation(event) {
    if (event.phase !== "stage-populate" || ++copied !== 3) return;
    addedPath = join(event.path, "../../foreign"); await writeFile(addedPath, "foreign staged entry");
  } })).rejects.toThrow("tree identity or contents changed");
  expect(await readFile(addedPath, "utf8")).toBe("foreign staged entry"); expect(await bytes(path)).toEqual(["old manifest", "old ledger"]);
});
test("concurrent reader accepts only whole generations while writer advances", async () => {
  const path = await project(); const child = await pauseWriter("files", path, "file-backup", 2);
  let completed = false; let stderr = "";
  child.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });
  const exited = new Promise<void>((resolve, reject) => { child.once("exit", (code) => { completed = true; if (code === 0) resolve(); else reject(new Error(stderr)); }); });
  child.send("continue");
  let accepted = 0;
  do {
    try {
      const result = await api.readProjectFileSet({ projectDir: path, paths: ["manifest", "src/ledger"] });
      const values = [...result.values()].map((value) => Buffer.from(value).toString());
      expect([["old manifest", "old ledger"], ["new manifest", "new ledger"]]).toContainEqual(values); accepted++;
    } catch (error) { expect(error).toMatchObject({ code: "transaction-in-progress" }); }
  } while (!completed || accepted === 0);
  await exited;
});

test.each(["file-rename", "directory-install"])("recovery preserves a foreign inode injected after crash at %s", async (phase) => {
  const req = await directoryRequest(); const action = phase === "file-rename" ? "files" : "directory";
  const child = await pauseWriter(action, req.targetDir, phase); await killWriter(child);
  const destination = action === "files" ? join(req.targetDir, "manifest") : req.targetDir;
  await mkdir(destination); const inode = (await lstat(destination)).ino;
  const result = spawnSync(process.execPath, [worker, "recover", req.targetDir], { encoding: "utf8" });
  expect(result.status).toBe(1); expect(result.stderr).toMatch(/foreign/); expect((await lstat(destination)).ino).toBe(inode);
  const parent = action === "files" ? req.targetDir : join(req.targetDir, "..");
  expect((await readdir(parent)).some((name) => name.startsWith(".laugh-tale-transaction-"))).toBe(true);
});
test.each(["symlink", "directory"])("artifact rejects nonregular destination %s", async (kind) => {
  const parent = await root(); const destination = join(parent, "artifact"); const foreign = join(parent, "foreign"); await writeFile(foreign, "keep");
  if (kind === "symlink") await symlink(foreign, destination); else await mkdir(destination);
  const inode = (await lstat(destination)).ino;
  await expect(api.writeArtifactAtomically({ destination, contents: "new", mode: 0o600 })).rejects.toThrow("regular file");
  expect((await lstat(destination)).ino).toBe(inode); expect(await readFile(foreign, "utf8")).toBe("keep");
});
test("malformed journal is preserved and readers refuse with typed code", async () => {
  const path = await project(); const journal = join(path, ".laugh-tale-transaction-foreign"); await writeFile(journal, "invalid");
  await expect(api.readProjectFileSet({ projectDir: path, paths: ["manifest"] })).rejects.toMatchObject({ code: "transaction-in-progress" });
  await expect(api.recoverProjectFileTransaction(path)).rejects.toThrow(); expect(await readFile(journal, "utf8")).toBe("invalid");
});

test.each(["stage-root", "stage-child", "backup", "journal", "destination", "parent"])("preserves hostile %s identity", async (attack) => {
  const path = await project(); const foreign = join(await root(), "foreign"); await mkdir(foreign); await writeFile(join(foreign, "keep"), "foreign");
  let changedPath = ""; let changed = false;
  await expect(api.replaceProjectFiles(request(path), { async beforeMutation(event) {
    if (changed) return;
    if ((attack === "stage-root" && event.phase === "stage-validate") || (attack === "stage-child" && event.phase === "stage-fsync") || (attack === "destination" && event.phase === "file-backup") || (attack === "parent" && event.phase === "file-rename")) {
      changedPath = attack === "parent" ? path : event.path;
      await rename(changedPath, `${changedPath}.saved`); await symlink(foreign, changedPath); changed = true;
    } else if (attack === "backup" && event.phase === "file-rename") {
      changedPath = join(path, (await readdir(path)).find((name) => name.startsWith(".laugh-tale-backup-"))!);
      await rename(changedPath, `${changedPath}.saved`); await symlink(foreign, changedPath); changed = true;
    } else if (attack === "journal" && event.phase === "file-backup") {
      changedPath = join(path, (await readdir(path)).find((name) => name.startsWith(".laugh-tale-transaction-"))!);
      await rename(changedPath, `${changedPath}.saved`); await symlink(foreign, changedPath); changed = true;
    }
  } })).rejects.toThrow();
  expect(changed).toBe(true); expect((await lstat(changedPath)).isSymbolicLink()).toBe(true); expect(await readFile(join(foreign, "keep"), "utf8")).toBe("foreign");
});
test("hash inventory is stable, normalized, excludes named top-level trees", async () => {
  const path = await project(); await mkdir(join(path, "node_modules")); await writeFile(join(path, "node_modules/ignored"), "ignored");
  expect([...(await api.hashProjectFiles(path, new Set(["node_modules"]))).entries()]).toEqual([["manifest", sha("old manifest")], ["src/ledger", sha("old ledger")]]);
});
test("hash inventory rejects a symbolic project root and linked files", async () => {
  const path = await project(); const link = `${path}-link`; await symlink(path, link);
  await expect(api.hashProjectFiles(link, new Set())).rejects.toThrow("real tree directory");
  await symlink(join(path, "manifest"), join(path, "linked"));
  await expect(api.hashProjectFiles(path, new Set())).rejects.toThrow("symbolic links");
});
test("replacement refuses a path outside its allowlist", async () => {
  const path = await project(); await expect(api.replaceProjectFiles({ ...request(path), allowedPaths: new Set() })).rejects.toThrow("not allowlisted"); expect(await bytes(path)).toEqual(["old manifest", "old ledger"]);
});
test.each(["../escape", "/absolute", "src//ledger", "src/../manifest", "src\\ledger"])("rejects unsafe allowlisted path %s", async (name) => {
  const path = await project(); await expect(api.replaceProjectFiles({ ...request(path), replacements: new Map([[name, "new"]]), allowedPaths: new Set([name]) })).rejects.toThrow(); expect(await bytes(path)).toEqual(["old manifest", "old ledger"]);
});
