import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const script = join(repo, "scripts/sync-oak-washi-starter-presentation.mjs");
const recipeRoot = join(repo, "plugins/eternal-pose/recipes-v2/oak-washi/presentation");
const roots: string[] = [];
interface SyncRequest { recipeRoot: string; starterPresentationRoot: string; locale: string; backupDir: string }
interface SyncModule {
  syncOakWashiStarterPresentation: (request: SyncRequest, operations?: { beforeMutation: (context: { phase: string }) => void }) => Promise<{ presentationSha256: string; backupDir: string }>;
  assertOakWashiPresentationIdentity: (target: string, recipeRoot: string, locale: string) => Promise<string>;
}
function fixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "oak-sync-")); roots.push(root);
  const starterPresentationRoot = join(root, "starter/react/src/presentation");
  mkdirSync(starterPresentationRoot, { recursive: true });
  writeFileSync(join(starterPresentationRoot, "stale.ts"), "old complete tree");
  return { recipeRoot, starterPresentationRoot, locale: "zh-Hant-TW", backupDir: join(root, "backup") };
}
async function implementation() {
  expect(existsSync(script), "the deterministic sync command must exist").toBe(true);
  return import(pathToFileURL(script).href) as Promise<SyncModule>;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
test("replaces the complete stale tree and retains its exact backup", async () => {
  const request = fixture(); const { syncOakWashiStarterPresentation, assertOakWashiPresentationIdentity } = await implementation();
  const result = await syncOakWashiStarterPresentation(request);
  expect(result.presentationSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(readFileSync(join(request.backupDir, "stale.ts"), "utf8")).toBe("old complete tree");
  expect(existsSync(join(request.starterPresentationRoot, "stale.ts"))).toBe(false);
  await assertOakWashiPresentationIdentity(request.starterPresentationRoot, recipeRoot, "zh-Hant-TW");
  writeFileSync(join(request.starterPresentationRoot, "extra.ts"), "manual difference");
  await expect(assertOakWashiPresentationIdentity(request.starterPresentationRoot, recipeRoot, "zh-Hant-TW")).rejects.toThrow(/inventory|identity/);
});
test("committed starter and Meridian presentations exactly match the canonical Oak source", async () => {
  const { assertOakWashiPresentationIdentity } = await implementation();
  await assertOakWashiPresentationIdentity(join(repo, "plugins/eternal-pose/starter/react/src/presentation"), recipeRoot, "zh-Hant-TW");
  await assertOakWashiPresentationIdentity(join(repo, "examples/meridian/src/presentation"), recipeRoot, "zh-Hant-TW");
});
test.each(["en-US", "zh-Hant"])("refuses noncanonical locale %s without touching the old tree", async locale => {
  const request = fixture(); const { syncOakWashiStarterPresentation } = await implementation();
  await expect(syncOakWashiStarterPresentation({ ...request, locale })).rejects.toThrow(/locale/);
  expect(readFileSync(join(request.starterPresentationRoot, "stale.ts"), "utf8")).toBe("old complete tree");
});
test("refuses a preexisting backup and a target outside starter presentation", async () => {
  const request = fixture(); const { syncOakWashiStarterPresentation } = await implementation();
  mkdirSync(request.backupDir);
  await expect(syncOakWashiStarterPresentation(request)).rejects.toThrow(/backup/);
  await expect(syncOakWashiStarterPresentation({ ...request, starterPresentationRoot: dirname(request.starterPresentationRoot) })).rejects.toThrow(/starter.*presentation/);
});
test("refuses symlink ancestors before creating any candidate files", async () => {
  const request = fixture(); const { syncOakWashiStarterPresentation } = await implementation();
  const link = join(dirname(request.backupDir), "linked");
  symlinkSync(dirname(request.backupDir), link, "dir");
  const parent = dirname(request.starterPresentationRoot), before = readdirSync(parent);
  await expect(syncOakWashiStarterPresentation({ ...request, starterPresentationRoot: join(link, "starter/react/src/presentation") })).rejects.toThrow();
  expect(readdirSync(parent)).toEqual(before);
});
test.each(["directory-backup", "directory-install"])("recovers a complete old tree after %s failure", async operation => {
  const request = fixture(); const { syncOakWashiStarterPresentation } = await implementation();
  await expect(syncOakWashiStarterPresentation(request, { beforeMutation(context: { phase: string }) { if (context.phase === operation) throw new Error("injected rename failure"); } })).rejects.toThrow("injected rename failure");
  const { recoverProjectFileTransaction } = await import(pathToFileURL(join(repo, "plugins/eternal-pose/lib/atomic-publication.mjs")).href) as { recoverProjectFileTransaction: (path: string) => Promise<void> };
  await recoverProjectFileTransaction(request.starterPresentationRoot);
  expect(readFileSync(join(request.starterPresentationRoot, "stale.ts"), "utf8")).toBe("old complete tree");
});
test.each(["directory-backup", "directory-install"])("recovers after a process crash at %s", async phase => {
  const request = fixture(); await implementation();
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `import { syncOakWashiStarterPresentation } from ${JSON.stringify(pathToFileURL(script).href)}; await syncOakWashiStarterPresentation(${JSON.stringify(request)}, { beforeMutation(event) { if(event.phase === ${JSON.stringify(phase)}) process.kill(process.pid, 'SIGKILL'); } });`], { encoding: "utf8" });
  expect(child.signal).toBe("SIGKILL");
  const { recoverProjectFileTransaction } = await import(pathToFileURL(join(repo, "plugins/eternal-pose/lib/atomic-publication.mjs")).href) as { recoverProjectFileTransaction: (path: string) => Promise<void> };
  await recoverProjectFileTransaction(request.starterPresentationRoot);
  expect(readFileSync(join(request.starterPresentationRoot, "stale.ts"), "utf8")).toBe("old complete tree");
});
test("refuses a recipe whose committed default catalog disagrees with materialized locale", async () => {
  const request = fixture(); const { syncOakWashiStarterPresentation } = await implementation();
  const copiedRecipe = join(dirname(request.backupDir), "oak-washi");
  cpSync(dirname(recipeRoot), copiedRecipe, { recursive: true });
  writeFileSync(join(copiedRecipe, "presentation/copy/catalog.ts"), 'export const locale = "en-US";');
  await expect(syncOakWashiStarterPresentation({ ...request, recipeRoot: join(copiedRecipe, "presentation") })).rejects.toThrow(/catalog/);
  expect(readFileSync(join(request.starterPresentationRoot, "stale.ts"), "utf8")).toBe("old complete tree");
});
