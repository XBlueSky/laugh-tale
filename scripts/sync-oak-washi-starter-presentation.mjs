import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { mkdir, lstat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { hashProjectFiles, readProjectFileSet, replaceOwnedDirectoryAtomically } from "../plugins/eternal-pose/lib/atomic-publication.mjs";
import { materializeCopyCatalog } from "../plugins/eternal-pose/scripts/create-trip-project.mjs";
import { assertAncestors, snapshotAncestors } from "../plugins/eternal-pose/lib/path-safety.mjs";

const PRIVATE_COPY = new Set(["copy/catalog-schema.json", "copy/en.json", "copy/zh-Hant.json", "copy/resolve-copy.ts"]);

async function canonicalPresentation(recipeRoot, locale, authoredCatalogPath) {
  const inventory = await hashProjectFiles(recipeRoot);
  const names = [...inventory.keys()].filter(name => !PRIVATE_COPY.has(name) && name !== "copy/catalog.ts");
  const files = await readProjectFileSet({ projectDir: recipeRoot, paths: names });
  const materialized = await materializeCopyCatalog({ locale, recipeRoot: dirname(recipeRoot), authoredCatalogPath });
  files.set("copy/catalog.ts", Buffer.from(materialized.source));
  return new Map([...files].sort(([a], [b]) => a.localeCompare(b)));
}

export async function assertOakWashiPresentationIdentity(target, recipeRoot, locale, authoredCatalogPath) {
  const expected = await canonicalPresentation(recipeRoot, locale, authoredCatalogPath);
  await readProjectFileSet({ projectDir: target, paths: [...expected.keys()] });
  return assertInventory(target, expected);
}

async function assertInventory(target, expected) {
  const inventory = await hashProjectFiles(target);
  if ([...inventory.keys()].sort().join("\0") !== [...expected.keys()].sort().join("\0")) throw new Error("presentation inventory differs from canonical Oak");
  const hash = createHash("sha256");
  for (const [path, bytes] of expected) {
    if (inventory.get(path) !== createHash("sha256").update(bytes).digest("hex")) throw new Error(`presentation identity differs: ${path}`);
    hash.update(path).update("\0").update(bytes).update("\0");
  }
  return hash.digest("hex");
}

export async function syncOakWashiStarterPresentation({ recipeRoot, starterPresentationRoot, locale, backupDir }, operations = {}) {
  if (locale !== "zh-Hant-TW") throw new Error("starter locale must be exactly zh-Hant-TW");
  if (![recipeRoot, starterPresentationRoot, backupDir].every(path => typeof path === "string" && isAbsolute(path) && path === resolve(path))) throw new Error("sync paths must be absolute and normalized");
  if (!starterPresentationRoot.endsWith(`${sep}starter${sep}react${sep}src${sep}presentation`)) throw new Error("target must be the supplied starter/react/src/presentation root");
  const ancestors = await snapshotAncestors(starterPresentationRoot);
  await snapshotAncestors(backupDir);
  try { await lstat(backupDir); throw new Error("backup must be absent"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const files = await canonicalPresentation(recipeRoot, locale);
  const committed = await readProjectFileSet({ projectDir: recipeRoot, paths: ["copy/catalog.ts"] });
  if (!committed.get("copy/catalog.ts").equals(files.get("copy/catalog.ts"))) throw new Error("recipe default catalog must match canonical zh-Hant-TW materialization");
  const candidateDir = join(dirname(starterPresentationRoot), `.oak-presentation-${randomUUID()}`);
  await assertAncestors(ancestors);
  await mkdir(candidateDir);
  for (const [path, bytes] of files) {
    await mkdir(dirname(join(candidateDir, path)), { recursive: true });
    await writeFile(join(candidateDir, path), bytes, { flag: "wx" });
  }
  // The directory transaction owns its writer lock while invoking validators.
  const validate = target => assertInventory(target, files);
  await replaceOwnedDirectoryAtomically({
    targetDir: starterPresentationRoot, candidateDir, backupDir,
    validateExisting: target => hashProjectFiles(target),
    validateCandidate: validate, validateInstalled: validate,
  }, operations);
  return { backupDir, presentationSha256: await validate(starterPresentationRoot) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const names = new Map([["--recipe-root", "recipeRoot"], ["--starter-presentation-root", "starterPresentationRoot"], ["--locale", "locale"], ["--backup", "backupDir"]]);
  const args = process.argv.slice(2), request = {};
  try {
    if (args.length !== 8) throw new Error("all four sync options are required");
    for (let i = 0; i < args.length; i += 2) {
      const key = names.get(args[i]);
      if (!key || Object.hasOwn(request, key) || !args[i + 1]) throw new Error("unknown, duplicate, or missing sync option");
      request[key] = args[i + 1];
    }
    console.log(JSON.stringify(await syncOakWashiStarterPresentation(request)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
