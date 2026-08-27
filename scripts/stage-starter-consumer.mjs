import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const starterRoot = join(repoRoot, "plugins/eternal-pose/starter/react");
const defaultStagedRoot = join(repoRoot, "tmp/staged-starter");
const packRoot = join(repoRoot, "tmp/staged-packs");
const EXCLUDED = new Set([
  "node_modules",
  "dist",
  "coverage",
  "test-results",
  "playwright-report",
  ".env.local",
  ".DS_Store",
]);

function run(command, commandArguments, cwd) {
  const result = spawnSync(command, commandArguments, { cwd, encoding: "utf8", shell: false });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${commandArguments.join(" ")} failed (${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

async function packWorkspacePackages() {
  await rm(packRoot, { recursive: true, force: true });
  await mkdir(packRoot, { recursive: true });
  const tarballs = [];
  for (const name of (await readdir(join(repoRoot, "packages"))).sort()) {
    const packageDir = join(repoRoot, "packages", name);
    run("npm", ["run", "build"], packageDir);
    const output = JSON.parse(
      run("npm", ["pack", "--json", "--pack-destination", packRoot], packageDir),
    );
    const filename = output[0]?.filename;
    if (typeof filename !== "string") {
      throw new Error(`npm pack reported no filename for packages/${name}`);
    }
    tarballs.push(join(packRoot, filename));
  }
  return tarballs;
}

function packageNameForTarball(tarball) {
  const filename = tarball.split(sep).at(-1) ?? "";
  const bareName = filename.replace(/^laugh-tale-island-/, "").replace(/-\d+\.\d+\.\d+.*\.tgz$/, "");
  return `@laugh-tale-island/${bareName}`;
}

export async function stageStarterConsumer({ install = true, outDir } = {}) {
  const stagedRoot = outDir === undefined ? defaultStagedRoot : resolve(outDir);
  const tarballs = await packWorkspacePackages();
  await rm(stagedRoot, { recursive: true, force: true });
  await mkdir(stagedRoot, { recursive: true });
  await cp(starterRoot, stagedRoot, {
    recursive: true,
    filter: (source) => {
      const relativePath = relative(starterRoot, source);
      if (relativePath === "") return true;
      return !relativePath.split(sep).some((part) => EXCLUDED.has(part));
    },
  });

  const manifestPath = join(stagedRoot, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const tarballByName = new Map(tarballs.map((tarball) => [packageNameForTarball(tarball), tarball]));
  for (const dependencyName of Object.keys(manifest.dependencies ?? {})) {
    if (!dependencyName.startsWith("@laugh-tale-island/")) continue;
    const tarball = tarballByName.get(dependencyName);
    if (tarball === undefined) throw new Error(`no packed tarball for ${dependencyName}`);
    manifest.dependencies[dependencyName] = `file:${tarball}`;
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await rm(join(stagedRoot, "package-lock.json"), { force: true });

  if (install) run("npm", ["install", "--no-audit", "--no-fund"], stagedRoot);
  return { stagedRoot, tarballs };
}

function isMainModule() {
  return (
    process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  );
}

if (isMainModule()) {
  const { stagedRoot: staged } = await stageStarterConsumer();
  console.log(`staged-starter:${staged}`);
}
