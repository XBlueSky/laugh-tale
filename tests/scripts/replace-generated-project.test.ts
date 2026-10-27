import { fork } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { atomic, create, failAt, inputPath, paths, pluginRoot, pretty, root, unresolvedLedger, type Operations } from "../fixtures/public-release.js";
const roots: string[] = [];
const validatorPath = join(pluginRoot, "scripts/validate-trip-project.mjs");
const scannerPath = join(pluginRoot, "lib/publication-analysis.mjs");
const pathSafetyPath = join(pluginRoot, "lib/path-safety.mjs");
const atomicPath = join(pluginRoot, "lib/atomic-publication.mjs");
afterEach(async () => {
  vi.doUnmock(validatorPath); vi.doUnmock(scannerPath); vi.doUnmock(pathSafetyPath); vi.doUnmock(atomicPath); vi.resetModules();
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
type Request = { candidateDir: string; targetDir: string; backupDir: string; expectedInputPath: string; expectedResolutionsPath: string };
async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "public-replace-"))); roots.push(directory);
  const targetDir = join(directory, "target"), candidateDir = join(directory, "candidate"), backupDir = join(directory, "backup");
  const expectedResolutionsPath = join(directory, "ledger.json");
  await writeFile(expectedResolutionsPath, pretty(await unresolvedLedger()));
  await create({ pluginRoot, targetDir, setupLocale: "zh-Hant-TW" });
  await mkdir(join(targetDir, "node_modules")); await writeFile(join(targetDir, "node_modules/old-residue"), "old dependency residue");
  await mkdir(join(targetDir, "dist")); await writeFile(join(targetDir, "dist/old-residue"), "old build residue");
  await create({ pluginRoot, targetDir: candidateDir, tripPath: inputPath, resolutionsPath: expectedResolutionsPath });
  const request = { candidateDir, targetDir, backupDir, expectedInputPath: inputPath, expectedResolutionsPath };
  const { replaceGeneratedProject } = await import(join(root, "scripts/replace-generated-project.mjs")) as { replaceGeneratedProject: (request: Request, operations?: Operations) => Promise<{ backupDir: string; installedTreeSha256: string }> };
  return { request, directory, run: (operations?: Operations) => replaceGeneratedProject(request, operations), old: await atomic.hashProjectFiles(targetDir), candidate: await atomic.hashProjectFiles(candidateDir) };
}
test("whole-directory replacement installs exact Create output and retains complete old tree", async () => {
  const f = await fixture(), oldInode = (await lstat(f.request.targetDir)).ino;
  const result = await f.run();
  expect(result.backupDir).toBe(f.request.backupDir); expect(result.installedTreeSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(await atomic.hashProjectFiles(f.request.targetDir)).toEqual(f.candidate);
  expect(await atomic.hashProjectFiles(f.request.backupDir)).toEqual(f.old);
  expect((await lstat(f.request.backupDir)).ino).toBe(oldInode);
  await expect(lstat(f.request.candidateDir)).rejects.toThrow();
}, 60_000);
test.each(["stage-validate", "directory-backup", "directory-install", "file-set-validate"])("failure at %s restores complete old generation and candidate", async phase => {
  const f = await fixture(); await expect(f.run(failAt(phase))).rejects.toThrow("injected");
  expect(await atomic.hashProjectFiles(f.request.targetDir)).toEqual(f.old);
  expect(await atomic.hashProjectFiles(f.request.candidateDir)).toEqual(f.candidate);
  await expect(lstat(f.request.backupDir)).rejects.toThrow();
}, 60_000);
test.each(["different-input", "different-ledger", "preexisting-backup", "candidate-link", "target-link", "traversal"])("rejects %s without changing the target", async mutation => {
  const f = await fixture();
  if (mutation === "different-input") await writeFile(join(f.request.candidateDir, paths.input), "{}");
  if (mutation === "different-ledger") await writeFile(join(f.request.candidateDir, paths.ledger), "{}");
  if (mutation === "preexisting-backup") await mkdir(f.request.backupDir);
  if (mutation === "candidate-link" || mutation === "target-link") {
    const path = mutation === "candidate-link" ? f.request.candidateDir : f.request.targetDir;
    await rename(path, path + ".saved"); await symlink(path + ".saved", path);
  }
  if (mutation === "traversal") f.request.targetDir = join(f.directory, "elsewhere") + "/../target";
  await expect(f.run()).rejects.toThrow();
  expect(await atomic.hashProjectFiles(mutation === "target-link" ? f.request.targetDir + ".saved" : join(f.directory, "target"))).toEqual(f.old);
}, 60_000);
test("valid candidate reaches the same-device refusal and preserves all three paths", async () => {
  const f = await fixture();
  let mismatches = 0;
  let replacing = false;
  vi.doMock(atomicPath, async () => {
    const actual = await vi.importActual<{ replaceOwnedDirectoryAtomically: (...args: unknown[]) => Promise<unknown> }>(atomicPath);
    return { ...actual, async replaceOwnedDirectoryAtomically(...args: unknown[]) {
      replacing = true;
      try { return await actual.replaceOwnedDirectoryAtomically(...args); }
      finally { replacing = false; }
    } };
  });
  vi.doMock(pathSafetyPath, async () => {
    const actual = await vi.importActual<{ inspectPath: (path: string) => Promise<{ dev: string; ino: string; type: string } | null> }>(pathSafetyPath);
    return { ...actual, async inspectPath(path: string) {
      const identity = await actual.inspectPath(path);
      if (!replacing || path !== f.request.candidateDir || identity === null) return identity;
      mismatches++;
      return { ...identity, dev: identity.dev + "-other-device" };
    } };
  });
  vi.resetModules();
  const { replaceGeneratedProject } = await import(join(root, "scripts/replace-generated-project.mjs")) as { replaceGeneratedProject: (request: Request) => Promise<unknown> };
  await expect(replaceGeneratedProject(f.request)).rejects.toThrow("directory replacement requires same device");
  expect(mismatches).toBeGreaterThan(0);
  expect(await atomic.hashProjectFiles(f.request.targetDir)).toEqual(f.old);
  expect(await atomic.hashProjectFiles(f.request.candidateDir)).toEqual(f.candidate);
  await expect(lstat(f.request.backupDir)).rejects.toThrow();
}, 60_000);
test.each(["during-validation", "after-validation-script", "after-validation-manifest", "after-validation-journal", "after-validation-link"])("rejects %s mutation without publishing unvalidated bytes", async mutation => {
  const f = await fixture();
  const candidate = f.request.candidateDir;
  const originalInput = await readFile(join(candidate, paths.input));
  const originalLedger = await readFile(join(candidate, paths.ledger));
  let changed = false;
  async function changeSource() {
    if (changed) return;
    changed = true;
    if (mutation === "after-validation-manifest") {
      await writeFile(join(candidate, paths.manifest), "{}");
    } else if (mutation === "after-validation-journal") {
      await writeFile(join(candidate, ".laugh-tale-transaction-arrived"), "{}");
    } else if (mutation === "after-validation-link") {
      const source = join(candidate, "src/main.tsx");
      await rename(source, source + ".saved"); await symlink(source + ".saved", source);
    } else {
      const packagePath = join(candidate, "package.json");
      const pkg = JSON.parse(await readFile(packagePath, "utf8")) as { scripts: Record<string, string> };
      delete pkg.scripts.build;
      await writeFile(packagePath, pretty(pkg));
    }
  }
  if (mutation === "during-validation") {
    vi.doMock(scannerPath, async () => {
      const actual = await vi.importActual<{ scanPublicationSnapshot: (directory: string, files: Map<string, Buffer>) => Promise<unknown[]> }>(scannerPath);
      return { ...actual, async scanPublicationSnapshot(directory: string, files: Map<string, Buffer>) {
        const result = await actual.scanPublicationSnapshot(directory, files);
        if (directory === candidate) await changeSource();
        return result;
      } };
    });
  } else {
    vi.doMock(validatorPath, async () => {
      const actual = await vi.importActual<{ validateTripProject: (directory: string, mode: string) => Promise<{ counts: { errors: number } }> }>(validatorPath);
      return { ...actual, async validateTripProject(directory: string, mode: string) {
        const result = await actual.validateTripProject(directory, mode);
        if (directory === candidate && result.counts.errors === 0) await changeSource();
        return result;
      } };
    });
  }
  vi.resetModules();
  const { replaceGeneratedProject } = await import(join(root, "scripts/replace-generated-project.mjs")) as { replaceGeneratedProject: (request: Request) => Promise<unknown> };
  await expect(replaceGeneratedProject(f.request)).rejects.toThrow();
  expect(changed).toBe(true);
  expect(await atomic.hashProjectFiles(f.request.targetDir)).toEqual(f.old);
  await expect(lstat(f.request.backupDir)).rejects.toThrow();
  expect(await readFile(join(candidate, paths.input))).toEqual(originalInput);
  expect(await readFile(join(candidate, paths.ledger))).toEqual(originalLedger);
  if (mutation === "after-validation-link") expect((await lstat(join(candidate, "src/main.tsx"))).isSymbolicLink()).toBe(true);
}, 60_000);
test.each(["directory-backup", "directory-install", "file-set-validate"])("crash at %s recovers the complete old generation", async phase => {
  const f = await fixture();
  const child = fork(join(root, "tests/fixtures/generated-replacement-crash.mjs"), [JSON.stringify(f.request), phase], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  let stderr = ""; child.stderr?.on("data", (bytes: Buffer) => { stderr += bytes.toString(); });
  try {
    await new Promise<void>((resolve, reject) => { child.once("message", () => resolve()); child.once("error", reject); child.once("exit", code => reject(new Error(`early child exit ${code}: ${stderr}`))); });
  } finally {
    if (child.exitCode === null && child.signalCode === null) await new Promise<void>(resolve => { child.once("exit", () => resolve()); child.kill("SIGKILL"); });
  }
  expect(await atomic.recoverProjectFileTransaction(f.request.targetDir)).toBe("rolled-back");
  expect(await atomic.hashProjectFiles(f.request.targetDir)).toEqual(f.old);
  expect(await atomic.hashProjectFiles(f.request.candidateDir)).toEqual(f.candidate);
}, 60_000);
