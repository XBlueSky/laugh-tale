import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createTripProject } from "../plugins/eternal-pose/scripts/create-trip-project.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const pluginRoot = join(repoRoot, "plugins/eternal-pose");
const starterRoot = join(repoRoot, "plugins/eternal-pose/starter/react");
const defaultRecipeCatalogRoot = join(pluginRoot, "recipes-v2");
const defaultStagedRoot = join(repoRoot, "tmp/staged-starter");
const packRoot = join(repoRoot, "tmp/staged-packs");
const REMOVE_TREE_OPTIONS = {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 100,
};
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
  const executable =
    command === "npm" && process.env.npm_execpath
      ? { command: process.execPath, arguments: [process.env.npm_execpath, ...commandArguments] }
      : {
          command: command === "npm" && process.platform === "win32" ? "npm.cmd" : command,
          arguments: commandArguments,
        };
  const result = spawnSync(executable.command, executable.arguments, {
    cwd,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${commandArguments.join(" ")} failed (${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

async function packWorkspacePackages() {
  await rm(packRoot, REMOVE_TREE_OPTIONS);
  await mkdir(packRoot, { recursive: true });
  const tarballs = [];
  const packageEntries = await readdir(join(repoRoot, "packages"), { withFileTypes: true });
  const packageDirectories = packageEntries
    .filter((candidate) => candidate.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of packageDirectories) {
    const packageDir = join(repoRoot, "packages", entry.name);
    try {
      JSON.parse(await readFile(join(packageDir, "package.json"), "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    run("npm", ["run", "build"], packageDir);
    const output = JSON.parse(
      run("npm", ["pack", "--json", "--pack-destination", packRoot], packageDir),
    );
    const filename = output[0]?.filename;
    if (typeof filename !== "string") {
      throw new Error(`npm pack reported no filename for packages/${entry.name}`);
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

async function composeStarter({ stagedRoot, recipe, recipeCatalogRoot }) {
  await rm(stagedRoot, REMOVE_TREE_OPTIONS);
  await mkdir(dirname(stagedRoot), { recursive: true });
  if (recipe !== undefined) {
    await createTripProject({
      pluginRoot,
      targetDir: stagedRoot,
      recipe,
      starterDir: starterRoot,
      recipeCatalogRoot: recipeCatalogRoot ?? defaultRecipeCatalogRoot,
    });
    return;
  }

  await mkdir(stagedRoot, { recursive: true });
  await cp(starterRoot, stagedRoot, {
    recursive: true,
    filter: (source) => {
      const relativePath = relative(starterRoot, source);
      if (relativePath === "") return true;
      return !relativePath.split(sep).some((part) => EXCLUDED.has(part));
    },
  });
}

export async function stageStarterConsumer({
  install = true,
  outDir,
  recipe,
  recipeCatalogRoot,
} = {}) {
  const stagedRoot = outDir === undefined ? defaultStagedRoot : resolve(outDir);
  await composeStarter({ stagedRoot, recipe, recipeCatalogRoot });
  const tarballs = await packWorkspacePackages();

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
