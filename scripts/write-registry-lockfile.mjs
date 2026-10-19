import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readProjectFileSet, writeArtifactAtomically } from "../plugins/eternal-pose/lib/atomic-publication.mjs";
import { assertAncestors, inspectPath, readRegularFile, samePathIdentity, snapshotAncestors } from "../plugins/eternal-pose/lib/path-safety.mjs";

const names = ["core", "react", "adapters", "testing"];
const packageNames = names.map((name) => `@laugh-tale-island/${name}`);
const internalPrefix = "@laugh-tale-island/";

function fail(message) { throw new Error(message); }
function object(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}
function exactInternalNames(section, expected, label) {
  const actual = Object.keys(object(section, label)).filter((name) => name.startsWith(internalPrefix)).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) fail(`${label} has missing or extra Laugh Tale packages`);
}
function localArchive(specifier, sourceLockPath) {
  if (typeof specifier !== "string" || !specifier.startsWith("file:")) fail("source lock must use local archive specifiers");
  const value = specifier.slice(5);
  return resolve(dirname(sourceLockPath), value);
}
function registryUrl(name) {
  return `https://registry.npmjs.org/@laugh-tale-island/${name}/-/${name}-2.0.0.tgz`;
}

// Inputs may be standalone artifacts in different directories. Each owner is
// journal-guarded without requiring a generated manifest or recovering source.
// Reserved attestation metadata cannot enter the shared writer path allowlist.
async function captureInputs(request) {
  const owners = new Map();
  const files = new Map();
  for (const field of ["sourceLockPath", "packageJsonPath", "attestationPath"]) {
    const path = resolve(request[field]), directory = dirname(path), name = basename(path);
    if (!owners.has(directory)) {
      await readProjectFileSet({ projectDir: directory, paths: [] });
      owners.set(directory, { ancestors: await snapshotAncestors(path), stat: await lstat(directory, { bigint: true }), paths: [] });
    }
    if (field !== "attestationPath" || name !== ".laugh-tale-local-candidates.json") owners.get(directory).paths.push(name);
    files.set(field, { path, directory, name });
  }
  for (const [directory, owner] of owners) owner.snapshot = await readProjectFileSet({ projectDir: directory, paths: owner.paths });
  for (const file of files.values()) {
    file.snapshot = await readRegularFile(file.path);
    const ordinary = owners.get(file.directory).snapshot.get(file.name);
    if (ordinary && !ordinary.equals(file.snapshot.bytes)) fail("source input changed during snapshot");
  }
  async function assertStable() {
    for (const [directory, owner] of owners) {
      const current = await readProjectFileSet({ projectDir: directory, paths: owner.paths });
      for (const [name, bytes] of owner.snapshot) if (!bytes.equals(current.get(name))) fail("source input changed during snapshot");
      await assertAncestors(owner.ancestors);
      const stat = await lstat(directory, { bigint: true });
      if (["dev", "ino", "mtimeNs", "ctimeNs"].some(key => stat[key] !== owner.stat[key])) fail("source owner directory changed during snapshot");
    }
    for (const file of files.values()) {
      const current = await readRegularFile(file.path);
      if (!samePathIdentity(file.snapshot.identity, current.identity) || file.snapshot.hash !== current.hash) fail("source input identity or bytes changed during snapshot");
    }
    // Bracket reserved artifacts as well as ordinary reads with real owner
    // guards. Recheck owner generations after all cross-directory reads.
    for (const [directory, owner] of owners) {
      await readProjectFileSet({ projectDir: directory, paths: [] });
      await assertAncestors(owner.ancestors);
      const stat = await lstat(directory, { bigint: true });
      if (["dev", "ino", "mtimeNs", "ctimeNs"].some(key => stat[key] !== owner.stat[key])) fail("source owner directory changed during snapshot");
    }
  }
  await assertStable();
  return { files, assertStable };
}

export async function writeRegistryLockfile(request, testOperations) {
  const inputs = await captureInputs(request);
  const source = JSON.parse(inputs.files.get("sourceLockPath").snapshot.bytes.toString("utf8"));
  const manifest = JSON.parse(inputs.files.get("packageJsonPath").snapshot.bytes.toString("utf8"));
  const attestation = JSON.parse(inputs.files.get("attestationPath").snapshot.bytes.toString("utf8"));
  object(source, "source lock"); object(source.packages, "source lock packages");
  object(manifest, "package manifest"); object(attestation, "attestation");
  if (attestation.schemaVersion !== 1 || !Array.isArray(attestation.packages) || attestation.packages.length !== 4) fail("attestation must contain exactly four packages");
  const root = object(source.packages[""], "source root package");
  const expectedProduction = packageNames.slice(0, 3);
  const expectedDevelopment = packageNames.slice(3);
  for (const [section, expected] of [["dependencies", expectedProduction], ["devDependencies", expectedDevelopment]]) {
    exactInternalNames(root[section], expected, `source ${section}`);
    exactInternalNames(manifest[section], expected, `manifest ${section}`);
    for (const name of expected) if (manifest[section][name] !== "2.0.0") fail(`manifest ${name} must pin 2.0.0`);
  }
  if (manifest.devDependencies["axe-core"] !== "4.11.0" || root.devDependencies["axe-core"] !== "4.11.0") fail("axe-core must be pinned to 4.11.0");
  const sourceEntries = Object.keys(source.packages).filter((key) => key.includes("node_modules/@laugh-tale-island/"));
  if (sourceEntries.length !== 4 || sourceEntries.some((key) => !packageNames.some((name) => key === `node_modules/${name}`))) fail("source lock has missing or extra Laugh Tale package entries");

  const seenArchives = new Set();
  const archiveSnapshots = new Map();
  for (let index = 0; index < names.length; index += 1) {
    const shortName = names[index];
    const name = packageNames[index];
    const artifact = object(attestation.packages[index], `attestation package ${index}`);
    if (artifact.name !== name || artifact.version !== "2.0.0" || !isAbsolute(artifact.archive) || resolve(artifact.archive) !== artifact.archive || basename(artifact.archive) !== `laugh-tale-island-${shortName}-2.0.0.tgz` || !Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0 || !/^[a-f0-9]{64}$/.test(artifact.sha256) || !/^sha512-[A-Za-z0-9+/]+=*$/.test(artifact.integrity)) fail(`invalid attestation for ${name}`);
    const file = await readRegularFile(artifact.archive);
    const identity = `${file.identity.dev}:${file.identity.ino}`;
    if (seenArchives.has(identity)) fail(`${name} archive must be a distinct regular file`);
    seenArchives.add(identity);
    archiveSnapshots.set(artifact.archive, file);
    const bytes = file.bytes;
    if (bytes.length !== artifact.bytes || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256 || `sha512-${createHash("sha512").update(bytes).digest("base64")}` !== artifact.integrity) fail(`${name} archive size, sha256, or integrity mismatch`);
    const section = shortName === "testing" ? "devDependencies" : "dependencies";
    const local = localArchive(root[section][name], request.sourceLockPath);
    const entry = object(source.packages[`node_modules/${name}`], `source ${name}`);
    if (local !== artifact.archive || localArchive(entry.resolved, request.sourceLockPath) !== artifact.archive || entry.version !== "2.0.0" || entry.integrity !== artifact.integrity) fail(`source lock ${name} does not match its attested archive`);
    root[section][name] = "2.0.0";
    entry.resolved = registryUrl(shortName);
  }
  for (const name of packageNames) {
    const entry = source.packages[`node_modules/${name}`];
    if (!entry.resolved.startsWith("https://registry.npmjs.org/") || /^(?:file:|git|link:|workspace:)/.test(entry.resolved)) fail(`non-registry resolution for ${name}`);
  }
  const destinationState = await inspectPath(request.destinationLockPath);
  if (destinationState && destinationState.type !== "file") fail("destination lock must be a regular file");
  const expectedDestinationSha256 = destinationState ? (await readRegularFile(request.destinationLockPath)).hash : null;
  await testOperations?.afterInputSnapshot?.();
  for (const [path, snapshot] of archiveSnapshots) {
    const current = await readRegularFile(path);
    if (!samePathIdentity(snapshot.identity, current.identity) || snapshot.hash !== current.hash) fail("archive identity or bytes changed during snapshot");
  }
  await inputs.assertStable();
  // The completed snapshot is the read linearization point. Publication derives
  // frozen bytes; later source generations need not invalidate it. This check
  // precedes destination reservation, including when owners share a directory.
  await writeArtifactAtomically({ destination: request.destinationLockPath, contents: `${JSON.stringify(source, null, 2)}\n`, expectedDestinationSha256, mode: 0o644 }, testOperations);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flags = new Map();
  for (let index = 2; index < process.argv.length; index += 2) flags.set(process.argv[index], process.argv[index + 1]);
  const sourceLockPath = flags.get("--source-lock");
  const packageJsonPath = flags.get("--package-json");
  const attestationPath = flags.get("--attestation");
  const destinationLockPath = flags.get("--destination-lock");
  if (!sourceLockPath || !packageJsonPath || !attestationPath || !destinationLockPath || flags.size !== 4) fail("expected --source-lock, --package-json, --attestation, and --destination-lock");
  await writeRegistryLockfile({ sourceLockPath, packageJsonPath, attestationPath, destinationLockPath });
}
