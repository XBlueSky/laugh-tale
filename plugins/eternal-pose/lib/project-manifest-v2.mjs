import { canonicalizeJson, sha256CanonicalJson } from "./canonical-json.mjs";

export const PROJECT_SCHEMA_VERSION = 2;
export const PRESENTATION_CONTRACT_VERSION = 2;
export const ETERNAL_POSE_PACKAGE_NAMES = Object.freeze([
  "@laugh-tale-island/core", "@laugh-tale-island/react", "@laugh-tale-island/adapters", "@laugh-tale-island/testing",
]);

const EXACT_SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
function fail(message) { throw new Error(message); }
function exactSemver(value, field) { if (typeof value !== "string" || !EXACT_SEMVER.test(value)) fail(`${field} must be exact semver`); return value; }
function exactSameMajorVersion(value, major, field = "lastUpgradeToolVersion") { exactSemver(value, field); if (Number(value.split(".")[0]) !== major) fail(`${field} must have major ${major}`); return value; }
function keys(value, allowed, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${field} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${field}: unknown field ${key}`);
  for (const key of allowed.filter((key) => key !== "lastUpgradeToolVersion")) if (!Object.hasOwn(value, key)) fail(`${field}: missing ${key}`);
}
function freeze(value) { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }

export function buildTripProjectManifest({ generatorVersion, recipeId, recipeSourceVersion, packageVersion, ledger, lastUpgradeToolVersion }) {
  if (recipeId !== "oak-washi") throw new Error("recipe.id must be oak-washi");
  const packages = Object.fromEntries(ETERNAL_POSE_PACKAGE_NAMES.map((name) => [name, exactSameMajorVersion(packageVersion, 2, `packages.${name}`)]));
  return freeze({
    schemaVersion: 2,
    generatorVersion: exactSemver(generatorVersion, "generatorVersion"),
    ...(lastUpgradeToolVersion === undefined ? {} : { lastUpgradeToolVersion: exactSameMajorVersion(lastUpgradeToolVersion, 2) }),
    recipe: { id: "oak-washi", sourceVersion: exactSemver(recipeSourceVersion, "recipe.sourceVersion") },
    presentationContractVersion: 2,
    packages,
    enrichment: { schemaVersion: 1, provenanceHash: sha256CanonicalJson(ledger) },
  });
}

export function parseTripProjectManifest(value) {
  const manifest = JSON.parse(canonicalizeJson(value));
  keys(manifest, ["schemaVersion", "generatorVersion", "lastUpgradeToolVersion", "recipe", "presentationContractVersion", "packages", "enrichment"], "manifest");
  if (manifest.schemaVersion !== 2 || manifest.presentationContractVersion !== 2) fail("manifest schema/presentation contract version invalid");
  exactSemver(manifest.generatorVersion, "generatorVersion");
  if (Object.hasOwn(manifest, "lastUpgradeToolVersion")) exactSameMajorVersion(manifest.lastUpgradeToolVersion, 2);
  keys(manifest.recipe, ["id", "sourceVersion"], "recipe");
  if (manifest.recipe.id !== "oak-washi") fail("recipe.id must be oak-washi");
  exactSemver(manifest.recipe.sourceVersion, "recipe.sourceVersion");
  keys(manifest.packages, ETERNAL_POSE_PACKAGE_NAMES, "packages");
  for (const name of ETERNAL_POSE_PACKAGE_NAMES) exactSameMajorVersion(manifest.packages[name], 2, `packages.${name}`);
  if (new Set(ETERNAL_POSE_PACKAGE_NAMES.map((name) => manifest.packages[name])).size !== 1) fail("packages must use one shared version");
  keys(manifest.enrichment, ["schemaVersion", "provenanceHash"], "enrichment");
  if (manifest.enrichment.schemaVersion !== 1 || !/^[0-9a-f]{64}$/.test(manifest.enrichment.provenanceHash)) fail("enrichment provenanceHash invalid");
  return freeze(manifest);
}

export function assertManifestMatchesLedger(manifest, ledger) {
  const parsed = parseTripProjectManifest(manifest);
  if (parsed.enrichment.provenanceHash !== sha256CanonicalJson(ledger)) fail("manifest ledger hash mismatch");
}
