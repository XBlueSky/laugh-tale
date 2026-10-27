import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export type Operations = { beforeMutation?: (event: { phase: string; path: string }) => void | Promise<void> };
export type Ledger = { schemaVersion: number; provider: string; entries: unknown[] };
export type Manifest = { enrichment: { provenanceHash: string }; [key: string]: unknown };
export const root = resolve(import.meta.dirname, "../..");
export const pluginRoot = join(root, "plugins/eternal-pose");
export const inputPath = join(root, "examples/meridian-input/trip-input.json");
export const exampleRoot = join(root, "examples/meridian");
export const paths = { input: "src/trip-content/trip-input.json", ledger: "src/trip-content/place-resolutions.json", manifest: "eternal-pose.json" };
const lib = join(pluginRoot, "lib");
const canonicalApi = await import(join(lib, "canonical-json.mjs")) as { canonicalizeJson: (value: unknown) => string };
export const { canonicalizeJson } = canonicalApi;
export const pretty = (value: unknown) => JSON.stringify(JSON.parse(canonicalizeJson(value)), null, 2) + "\n";
export const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8")) as T;
type CreateRequest = { pluginRoot: string; targetDir: string; tripPath?: string; setupLocale?: string; resolutionsPath?: string };
export async function create(request: CreateRequest) {
  const api = await import(join(pluginRoot, "scripts/create-trip-project.mjs")) as { createTripProject: (request: CreateRequest) => Promise<void> };
  return api.createTripProject(request);
}
export const atomic = await import(join(lib, "atomic-publication.mjs")) as {
  recoverProjectFileTransaction: (root: string) => Promise<string>;
  hashProjectFiles: (root: string, excludedTopLevelNames?: Set<string>) => Promise<Map<string, string>>;
};
export function failAt(phase: string): Operations {
  let failed = false;
  return { beforeMutation(event) { if (!failed && event.phase === phase) { failed = true; throw new Error("injected " + phase); } } };
}
export async function unresolvedLedger() {
  const api = await import(join(lib, "place-resolution-ledger.mjs")) as { unresolvedLedgerForInput: (input: unknown) => Ledger };
  return api.unresolvedLedgerForInput(await json<unknown>(inputPath));
}

export async function compareGeneratedProjects(starterRoot: string, generatedRoot: string) {
  const starter = await atomic.hashProjectFiles(starterRoot), generated = await atomic.hashProjectFiles(generatedRoot);
  const difference = [...new Set([...starter.keys(), ...generated.keys()])].sort().filter(path => starter.get(path) !== generated.get(path));
  const content = new Set([paths.input, paths.ledger, paths.manifest]);
  const presentationDifferences = difference.filter(path => path.startsWith("src/presentation/") || path.startsWith("public/theme-assets/"));
  const packageDifferences = difference.filter(path => ["package.json", "package-lock.json"].includes(path));
  const runtimeConfigurationDifferences = difference.filter(path => !content.has(path) && (path.startsWith("src/app/") || path === ".env.example" || path.startsWith("vite.") || path === "src/main.tsx"));
  const classified = new Set([...content, ...presentationDifferences, ...packageDifferences, ...runtimeConfigurationDifferences]);
  const a = await json<Manifest>(join(starterRoot, paths.manifest)), b = await json<Manifest>(join(generatedRoot, paths.manifest));
  function semanticDiff(left: unknown, right: unknown, prefix = ""): string[] {
    if (canonicalizeJson(left) === canonicalizeJson(right)) return [];
    if (left !== null && right !== null && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right)) {
      const l = left as Record<string, unknown>, r = right as Record<string, unknown>;
      return [...new Set([...Object.keys(l), ...Object.keys(r)])].sort().flatMap(key => !Object.hasOwn(l, key) || !Object.hasOwn(r, key) ? [prefix + key] : semanticDiff(l[key], r[key], prefix + key + "."));
    }
    return [prefix.replace(/\.$/, "")];
  }
  return { presentationDifferences, packageDifferences, runtimeConfigurationDifferences, manifestDifferences: semanticDiff(a, b), otherDifferences: difference.filter(path => !classified.has(path)) };
}
