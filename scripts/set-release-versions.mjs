import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultRepoRoot = fileURLToPath(new URL("..", import.meta.url));
const packages = ["core", "react", "adapters", "testing"];
const packageNames = Object.fromEntries(
  packages.map((name) => [name, `@laugh-tale-island/${name}`]),
);
const expectedDependencies = {
  core: [],
  react: [packageNames.core],
  adapters: [packageNames.core],
  testing: [packageNames.adapters, packageNames.core, packageNames.react],
};
const dependencySections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
const strictSemver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

async function readManifest(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeManifest(path, manifest) {
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateManifest(name, manifest) {
  if (!object(manifest) || manifest.name !== packageNames[name] || !strictSemver.test(manifest.version)) {
    throw new Error(`invalid internal dependency graph: invalid ${name} manifest identity or version`);
  }

  const expected = new Set(expectedDependencies[name]);
  const found = new Set();
  for (const sectionName of dependencySections) {
    const section = manifest[sectionName];
    if (section !== undefined && !object(section)) {
      throw new Error(`invalid internal dependency graph: ${name}.${sectionName} must be an object`);
    }
    for (const [dependency, dependencyVersion] of Object.entries(section ?? {})) {
      if (!dependency.startsWith("@laugh-tale-island/")) continue;
      if (
        sectionName !== "dependencies" ||
        !expected.has(dependency) ||
        found.has(dependency) ||
        typeof dependencyVersion !== "string" ||
        !strictSemver.test(dependencyVersion)
      ) {
        throw new Error(
          `invalid internal dependency graph: ${name}.${sectionName}.${dependency}`,
        );
      }
      found.add(dependency);
    }
  }

  for (const dependency of expected) {
    if (!found.has(dependency)) {
      throw new Error(`invalid internal dependency graph: ${name} is missing ${dependency}`);
    }
  }
}

function validateGraph(entries) {
  const manifestsByName = Object.fromEntries(
    entries.map(({ name, manifest }) => [name, manifest]),
  );
  const versions = new Set(entries.map(({ manifest }) => manifest.version));
  if (versions.size !== 1) {
    throw new Error("invalid internal dependency graph: package versions are not lockstep");
  }
  for (const { name, manifest } of entries) {
    for (const dependency of expectedDependencies[name]) {
      const dependencyName = dependency.slice("@laugh-tale-island/".length);
      if (manifest.dependencies[dependency] !== manifestsByName[dependencyName].version) {
        throw new Error(
          `invalid internal dependency graph: ${name}.dependencies.${dependency} is not pinned to its package version`,
        );
      }
    }
  }
}

export async function setReleaseVersions(version, { repoRoot = defaultRepoRoot } = {}) {
  if (!strictSemver.test(version)) {
    throw new Error(`not a valid semver version: ${version}`);
  }

  const entries = await Promise.all(
    packages.map(async (name) => {
      const path = join(repoRoot, "packages", name, "package.json");
      return { name, path, manifest: await readManifest(path) };
    }),
  );
  for (const { name, manifest } of entries) validateManifest(name, manifest);
  validateGraph(entries);

  for (const { name, manifest } of entries) {
    manifest.version = version;
    for (const dependency of expectedDependencies[name]) {
      manifest.dependencies[dependency] = version;
    }
  }
  for (const { path, manifest } of entries) await writeManifest(path, manifest);

  return { version, packages: [...packages] };
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  const version = process.argv[2];
  if (version === undefined) {
    console.error("usage: node scripts/set-release-versions.mjs <version>");
    process.exit(1);
  }
  await setReleaseVersions(version);
  console.log(`release-versions:${version}`);
}
