import { mkdtempSync, readFileSync, readdirSync, realpathSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface Finding { severity: "error" | "warning"; code: string; path: string; message: string }
export interface ValidationResult { mode: string | null; counts: {errors:number;warnings:number}; findings:Finding[] }
export interface ProjectPackage { dependencies:Record<string,string>;devDependencies:Record<string,string> }
export interface LockEntry {name:string;version:string;resolved:string;dependencies:Record<string,string>;devDependencies:Record<string,string>}
export interface ProjectLock { packages:Record<string,LockEntry> }
export function readJson<T>(path: string): T { return JSON.parse(readFileSync(path,"utf8")) as T; }

export const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
export function write(root: string, path: string, contents: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), contents);
}
export async function completeV2Project() {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), "eternal-pose-v2-test-"));
  const root = join(parent, "project");
  const { createTripProject } = await import(pathToFileURL(join(repoRoot,"plugins/eternal-pose/scripts/create-trip-project.mjs")).href) as {createTripProject:(request:{pluginRoot:string;targetDir:string;setupLocale:string})=>Promise<void>};
  await createTripProject({ pluginRoot: join(repoRoot, "plugins/eternal-pose"), targetDir: root, setupLocale: "en-US" });
  return { root, parent };
}
export function snapshotTree(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  function visit(path: string) {
    for (const name of readdirSync(path)) {
      const child = join(path, name); const stat = lstatSync(child);
      if (stat.isDirectory()) visit(child);
      else result[relative(root, child)] = `${stat.mode}:${stat.mtimeMs}:${readFileSync(child).toString("base64")}`;
    }
  }
  visit(root); return result;
}
