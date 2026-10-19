import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { hashProjectFiles, readProjectFileSet, replaceOwnedDirectoryAtomically } from "../plugins/eternal-pose/lib/atomic-publication.mjs";
import { canonicalizeJson, sha256CanonicalJson } from "../plugins/eternal-pose/lib/canonical-json.mjs";
import { readRegularFile } from "../plugins/eternal-pose/lib/path-safety.mjs";
import { parseTripProjectInputV2 } from "../plugins/eternal-pose/lib/trip-project-input-v2.mjs";
import { parsePlaceResolutionLedger } from "../plugins/eternal-pose/lib/place-resolution-ledger.mjs";
import { assertManifestMatchesLedger, parseTripProjectManifest } from "../plugins/eternal-pose/lib/project-manifest-v2.mjs";
import { projectSnapshot, validateTripProject } from "../plugins/eternal-pose/scripts/validate-trip-project.mjs";

async function expectedBytes(path) {
  const files = await readProjectFileSet({ projectDir: dirname(path), paths: [basename(path)] });
  return files.get(basename(path));
}

export async function replaceGeneratedProject({ candidateDir, targetDir, backupDir, expectedInputPath, expectedResolutionsPath }, operations) {
  const paths = [candidateDir, targetDir, backupDir, expectedInputPath, expectedResolutionsPath];
  if (paths.some(path => !isAbsolute(path) || resolve(path) !== path) || ["/", homedir(), process.cwd()].includes(targetDir)) throw new Error("exact absolute non-broad paths required");
  const inputBytes = await expectedBytes(expectedInputPath), ledgerBytes = await expectedBytes(expectedResolutionsPath);
  const input = parseTripProjectInputV2(JSON.parse(inputBytes.toString("utf8")));
  const ledger = parsePlaceResolutionLedger(JSON.parse(ledgerBytes.toString("utf8")), input);
  const inputName = "src/trip-content/trip-input.json", ledgerName = "src/trip-content/place-resolutions.json";
  const candidateSnapshot = await projectSnapshot(candidateDir);
  const candidateFiles = candidateSnapshot.files;
  if (!candidateFiles.get(inputName).equals(inputBytes) || !candidateFiles.get(ledgerName).equals(ledgerBytes)) throw new Error("candidate input/ledger bytes differ from expected canonical artifacts");
  assertManifestMatchesLedger(JSON.parse(candidateFiles.get("eternal-pose.json").toString("utf8")), ledger);
  // Freeze publication bytes before validation. The journal-aware source
  // snapshot includes file identities/timestamps, so even a change restored
  // to the same bytes across validation cannot establish a new baseline.
  const candidateHashes = await hashProjectFiles(candidateDir);
  const validation = await validateTripProject(candidateDir, "local");
  if (validation.counts.errors) throw new Error("candidate is not a valid generated project");
  if ((await projectSnapshot(candidateDir)).hash !== candidateSnapshot.hash) throw new Error("candidate generation changed during validation");
  const installedTreeSha256 = sha256CanonicalJson([...candidateHashes]);
  const existing = await readProjectFileSet({ projectDir: targetDir, paths: ["eternal-pose.json", "package.json"] });
  const manifest = JSON.parse(existing.get("eternal-pose.json").toString("utf8"));
  const pkg = JSON.parse(existing.get("package.json").toString("utf8"));
  // Legacy v1 remains a supported replacement source. Its entire tree is retained.
  if (manifest.schemaVersion === 2) parseTripProjectManifest(manifest);
  else if (manifest.schemaVersion !== undefined || typeof manifest.generatorVersion !== "string" || typeof manifest.recipe !== "string" || !manifest.recipe || !manifest.packages?.["@laugh-tale-island/core"] || !manifest.packages?.["@laugh-tale-island/react"]) throw new Error("target is not a recognized generated project");
  if (!pkg.dependencies?.["@laugh-tale-island/core"] || !pkg.dependencies?.["@laugh-tale-island/react"]) throw new Error("target lacks generated package ownership");
  async function validateGeneration(path, expectedPath) {
    if (path !== expectedPath) throw new Error("validation escaped the exact requested target");
    // The transaction holds the writer lease here, so read its already-frozen
    // inventory directly rather than entering the external stable reader.
    for (const [name, expected] of [[inputName, inputBytes], [ledgerName, ledgerBytes]]) {
      if (!(await readRegularFile(join(path, name))).bytes.equals(expected)) throw new Error("canonical candidate bytes changed");
    }
    const actual = await hashProjectFiles(path);
    if (canonicalizeJson([...actual]) !== canonicalizeJson([...candidateHashes])) throw new Error("candidate generated source changed");
  }
  await replaceOwnedDirectoryAtomically({
    candidateDir, targetDir, backupDir,
    async validateExisting(path) {
      if (path !== targetDir) throw new Error("existing target escaped requested path");
      for (const [name, bytes] of existing) if (!(await readRegularFile(join(path, name))).bytes.equals(bytes)) throw new Error("existing generated target changed");
    },
    validateCandidate: path => validateGeneration(path, candidateDir),
    validateInstalled: path => validateGeneration(path, targetDir),
  }, operations);
  return { backupDir, installedTreeSha256 };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), flags = ["--candidate", "--target", "--backup", "--expected-input", "--expected-resolutions"];
  try {
    if (args.length !== 10 || flags.some((flag, index) => args[index * 2] !== flag)) throw new Error("usage: --candidate /absolute/candidate --target /absolute/target --backup /absolute/backup --expected-input /absolute/input.json --expected-resolutions /absolute/ledger.json");
    await replaceGeneratedProject({ candidateDir: args[1], targetDir: args[3], backupDir: args[5], expectedInputPath: args[7], expectedResolutionsPath: args[9] });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
