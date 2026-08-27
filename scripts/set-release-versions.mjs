import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const corePackageName = "@laugh-tale-island/core";

async function readManifest(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeManifest(path, manifest) {
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function setReleaseVersions(version) {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`not a valid semver version: ${version}`);
  }

  const corePath = join(repoRoot, "packages/core/package.json");
  const core = await readManifest(corePath);
  core.version = version;
  await writeManifest(corePath, core);

  // react is released in lockstep with core and pins the exact core version it
  // was tested against — both the published peer range and the devDependency
  // used by its own test run.
  const reactPath = join(repoRoot, "packages/react/package.json");
  const react = await readManifest(reactPath);
  react.version = version;
  react.peerDependencies[corePackageName] = version;
  react.devDependencies[corePackageName] = version;
  await writeManifest(reactPath, react);

  return { version };
}

const version = process.argv[2];
if (version === undefined) {
  console.error("usage: node scripts/set-release-versions.mjs <version>");
  process.exit(1);
}
await setReleaseVersions(version);
console.log(`release-versions:${version}`);
