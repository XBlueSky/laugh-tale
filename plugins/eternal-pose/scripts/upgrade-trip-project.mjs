import { spawnSync as nodeSpawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { readProjectFileSet, recoverProjectFileTransaction, replaceProjectFiles } from "../lib/atomic-publication.mjs";
import { canonicalizeJson } from "../lib/canonical-json.mjs";
import { assertManifestMatchesLedger, ETERNAL_POSE_PACKAGE_NAMES, parseTripProjectManifest, PRESENTATION_CONTRACT_VERSION } from "../lib/project-manifest-v2.mjs";
import { parsePlaceResolutionLedger } from "../lib/place-resolution-ledger.mjs";
import { parseTripProjectInputV2 } from "../lib/trip-project-input-v2.mjs";
import { readRegularFile } from "../lib/path-safety.mjs";
import { projectSnapshot, validateTripProject } from "./validate-trip-project.mjs";

export const UPGRADE_MUTATION_ALLOWLIST = Object.freeze(["package.json", "package-lock.json", "eternal-pose.json"]);
const PROJECT_FILES = [...UPGRADE_MUTATION_ALLOWLIST, "src/trip-content/trip-input.json", "src/trip-content/place-resolutions.json"];
const LOCKFILES = ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb"];
const SECTIONS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
const EXACT_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const ALLOWED = new Set(UPGRADE_MUTATION_ALLOWLIST);

function fail(message) { throw new Error(message); }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function json(bytes, path) { try { return JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { fail(`${path} must be valid JSON`); } }
function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function nonAllowlisted(files) { return new Map([...files].filter(([path]) => !ALLOWED.has(path)).map(([path, bytes]) => [path, hash(bytes)])); }
function sameHashes(left, right) { return left.size === right.size && [...left].every(([path, value]) => right.get(path) === value); }
function packageSection(name) { return name.endsWith("/testing") ? "devDependencies" : "dependencies"; }
function registryFindingAllowed(result, nullTrip) {
  const errors = result.findings.filter((item) => item.severity === "error");
  return errors.length === 0 || (nullTrip && errors.length === 1 && errors[0].code === "trip-content.missing" && errors[0].path === "src/trip-content/trip-input.json");
}
function requireRegistryReady(result, nullTrip) {
  if (!registryFindingAllowed(result, nullTrip)) fail(`registry validation failed: ${result.findings.filter((item) => item.severity === "error").map((item) => `${item.code} (${item.path})`).join(", ")}`);
}
function assertVersion(value, label) {
  if (typeof value !== "string" || !EXACT_VERSION.test(value)) fail(`${label} must be exact semver`);
  if (Number(value.split(".")[0]) !== PRESENTATION_CONTRACT_VERSION) fail(`${label} must use the same presentation-contract major`);
}
function assertOwnership(pkg, lock, manifest) {
  if (!object(pkg) || !object(lock) || lock.lockfileVersion !== 3 || !object(lock.packages) || !object(lock.packages[""])) fail("ownership conflict: invalid package or npm lockfile");
  if (pkg.name !== lock.name || pkg.version !== lock.version || pkg.name !== lock.packages[""].name || pkg.version !== lock.packages[""].version) fail("ownership conflict: root package lock identity differs");
  for (const name of ETERNAL_POSE_PACKAGE_NAMES) {
    const section = packageSection(name);
    const occurrences = SECTIONS.filter((key) => Object.hasOwn(pkg[key] ?? {}, name));
    const spec = pkg[section]?.[name];
    const entry = lock.packages[`node_modules/${name}`];
    if (occurrences.length !== 1 || occurrences[0] !== section || spec !== manifest.packages[name] || lock.packages[""][section]?.[name] !== spec || !object(entry) || entry.link || entry.version !== spec || typeof entry.resolved !== "string" || !entry.resolved.startsWith("https://registry.npmjs.org/")) fail(`ownership conflict: package and lock versions differ for ${name}`);
  }
}
function assertOnlyAllowedChange(before, after) {
  if (!sameHashes(nonAllowlisted(before), nonAllowlisted(after))) fail("non-allowlisted project source changed during upgrade staging");
}
async function snapshotStage(stage) { return (await projectSnapshot(stage)).files; }
function stageEnvironment(tempRoot) {
  return {
    PATH: process.env.PATH ?? "",
    HOME: tempRoot,
    TMPDIR: tempRoot,
    npm_config_userconfig: join(tempRoot, "user.npmrc"),
    npm_config_globalconfig: join(tempRoot, "global.npmrc"),
    npm_config_cache: join(tempRoot, "npm-cache"),
  };
}

/** Upgrade one installed schema-v2 project without changing authored source. */
export async function upgradeTripProject(request, testOperations) {
  if (!object(request) || typeof request.projectDir !== "string" || !isAbsolute(request.projectDir) || resolve(request.projectDir) !== request.projectDir) fail("project must be an absolute normalized path");
  const projectDir = request.projectDir;
  if (await realpath(projectDir) !== projectDir) fail("project must be a real directory");
  assertVersion(request.packagesVersion, "packagesVersion");
  assertVersion(request.toolVersion, "toolVersion");
  await recoverProjectFileTransaction(projectDir);
  const rootEntries = new Set(await readdir(projectDir));
  const lockfiles = LOCKFILES.filter((path) => rootEntries.has(path));
  if (lockfiles.length !== 1 || lockfiles[0] !== "package-lock.json") fail("unsupported lockfile: exactly one npm package-lock.json is required");
  const files = await readProjectFileSet({ projectDir, paths: PROJECT_FILES });
  const rawManifest = json(files.get("eternal-pose.json"), "eternal-pose.json");
  if (rawManifest?.schemaVersion !== 2) fail("upgrade requires a schema-v2 project");
  if (rawManifest.presentationContractVersion !== PRESENTATION_CONTRACT_VERSION) fail("upgrade requires the same presentation-contract major");
  const manifest = parseTripProjectManifest(rawManifest);
  const input = parseTripProjectInputV2(json(files.get("src/trip-content/trip-input.json"), "src/trip-content/trip-input.json"));
  const ledger = parsePlaceResolutionLedger(json(files.get("src/trip-content/place-resolutions.json"), "src/trip-content/place-resolutions.json"), input);
  assertManifestMatchesLedger(manifest, ledger);
  const pkg = json(files.get("package.json"), "package.json");
  const lock = json(files.get("package-lock.json"), "package-lock.json");
  assertOwnership(pkg, lock, manifest);
  const source = (await projectSnapshot(projectDir)).files;
  for (const [path, bytes] of files) if (!Buffer.from(source.get(path) ?? []).equals(bytes)) fail(`project changed during upgrade snapshot: ${path}`);
  const presentLockfiles = LOCKFILES.filter((path) => source.has(path));
  if (presentLockfiles.length !== 1 || presentLockfiles[0] !== "package-lock.json") fail("unsupported lockfile: exactly one npm package-lock.json is required");
  requireRegistryReady(await validateTripProject(projectDir, "registry"), input.trip === null);

  const nextPackage = globalThis.structuredClone(pkg);
  for (const name of ETERNAL_POSE_PACKAGE_NAMES) nextPackage[packageSection(name)][name] = request.packagesVersion;
  const nextManifest = parseTripProjectManifest({
    ...manifest,
    lastUpgradeToolVersion: request.toolVersion,
    packages: Object.fromEntries(ETERNAL_POSE_PACKAGE_NAMES.map((name) => [name, request.packagesVersion])),
  });
  const tempRoot = await realpath(await mkdtemp(join(await realpath(tmpdir()), "eternal-pose-upgrade-")));
  const stage = join(tempRoot, "project");
  const npmProject = join(tempRoot, "npm-project");
  try {
    await mkdir(stage);
    await mkdir(npmProject);
    await writeFile(join(tempRoot, "user.npmrc"), "");
    await writeFile(join(tempRoot, "global.npmrc"), "");
    for (const [path, bytes] of source) {
      await mkdir(dirname(join(stage, path)), { recursive: true });
      await writeFile(join(stage, path), bytes);
    }
    await testOperations?.beforeMutation?.({ phase: "upgrade-stage-package-write", path: join(stage, "package.json") });
    await writeFile(join(stage, "package.json"), `${JSON.stringify(nextPackage, null, 2)}\n`);
    await testOperations?.beforeMutation?.({ phase: "upgrade-stage-package-written", path: join(stage, "package.json") });
    await writeFile(join(npmProject, "package.json"), await readFile(join(stage, "package.json")));
    await writeFile(join(npmProject, "package-lock.json"), files.get("package-lock.json"));
    await testOperations?.beforeMutation?.({ phase: "upgrade-stage-lock-regenerate", path: join(stage, "package-lock.json") });
    const npm = testOperations?.spawnSync ?? nodeSpawnSync;
    const status = npm(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org"], { cwd: npmProject, shell: false, env: stageEnvironment(tempRoot) }).status;
    if (status !== 0) fail("npm package-lock-only regeneration failed");
    const npmPackage = await readRegularFile(join(npmProject, "package.json"));
    const npmLock = await readRegularFile(join(npmProject, "package-lock.json"));
    const stagedPackage = json(npmPackage.bytes, "staged package.json");
    const stagedLock = json(npmLock.bytes, "staged package-lock.json");
    if (canonicalizeJson(stagedPackage) !== canonicalizeJson(nextPackage)) fail("npm changed package.json beyond the four upgrade pins");
    assertOwnership(stagedPackage, stagedLock, nextManifest);
    await writeFile(join(stage, "package.json"), npmPackage.bytes);
    await writeFile(join(stage, "package-lock.json"), npmLock.bytes);
    await writeFile(join(stage, "eternal-pose.json"), `${canonicalizeJson(nextManifest)}\n`);
    const staged = await snapshotStage(stage);
    assertOnlyAllowedChange(source, staged);
    if (!staged.get("package.json").equals(npmPackage.bytes) || !staged.get("package-lock.json").equals(npmLock.bytes)) fail("staged package or lock changed during transfer");
    requireRegistryReady(await validateTripProject(stage, "registry"), input.trip === null);
    const replacements = new Map(UPGRADE_MUTATION_ALLOWLIST.map((path) => [path, staged.get(path)]));
    await replaceProjectFiles({
      projectDir,
      replacements,
      allowedPaths: new Set(UPGRADE_MUTATION_ALLOWLIST),
      validate: async (view) => {
        if (view !== projectDir) {
          for (const path of UPGRADE_MUTATION_ALLOWLIST) {
            const current = await readRegularFile(join(projectDir, path));
            if (!current.bytes.equals(files.get(path))) fail(`project generation changed during upgrade: ${path}`);
          }
          const candidate = await snapshotStage(view);
          assertOnlyAllowedChange(source, candidate);
          for (const [path, bytes] of replacements) if (!Buffer.from(candidate.get(path) ?? []).equals(bytes)) fail(`staged upgrade changed: ${path}`);
          requireRegistryReady(await validateTripProject(view, "registry"), input.trip === null);
        } else {
          for (const [path, bytes] of replacements) if (!Buffer.from(await readFile(join(projectDir, path))).equals(bytes)) fail(`installed upgrade changed: ${path}`);
        }
      },
    }, testOperations);
    return nextManifest;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
