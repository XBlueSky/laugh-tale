import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const script = join(repoRoot, "scripts/stage-starter-consumer.mjs");
const repositoryTmpRoot = join(repoRoot, "tmp");
const starterRoot = join(repoRoot, "plugins/eternal-pose/starter/react");
const recipeCatalogRoot = join(repoRoot, "plugins/eternal-pose/recipes-v2");
const packRoot = join(repoRoot, "tmp/staged-packs");
const packageLockRoot = join(repositoryTmpRoot, ".stage-starter-package.lock");
const lockOwnerPath = join(packageLockRoot, "owner.json");
const ownershipMarkerName = ".laugh-tale-staged-consumer.json";
const nonPackageWorkspaceDir = join(repoRoot, "packages/.staging-non-package");
const nonPackageWorkspaceFile = join(repoRoot, "packages/.staging-non-package-file");
const systemMetadataFile = join(repoRoot, "packages/.DS_Store");
const coreVersion = (
  JSON.parse(readFileSync(join(repoRoot, "packages/core/package.json"), "utf8")) as {
    version: string;
  }
).version;
interface CommandObservation {
  command: string;
  commandArguments: string[];
  cwd: string;
}

interface PackReference {
  directoryIdentity: { dev: string; ino: string };
  invocation: string;
  markerIdentity: { dev: string; ino: string };
  markerSource: string;
  path: string;
  token: string;
}

interface StageResult {
  stagedRoot: string;
  tarballs: string[];
  cleanupPending?: string[];
  cleanupWarnings?: string[];
}

const { stageStarterConsumer, validateStagingTarget, reclaimOrphanedStagingArtifacts } = (await import(
  pathToFileURL(script).href
)) as {
  stageStarterConsumer: (
    options?: {
      install?: boolean;
      outDir?: string;
      recipe?: string;
      recipeCatalogRoot?: string;
    },
    testOperations?: {
      onCommand?: (observation: CommandObservation) => void;
      lockTimeoutMs?: number;
      lockPollMs?: number;
      lockDeadOwnerGraceMs?: number;
      artifactGraceMs?: number;
      isProcessAlive?: (pid: number) => boolean;
      afterTargetRevalidated?: (context: { target: string }) => void;
      beforeCandidateRename?: (context: { candidate: string; previous?: string }) => void;
      beforePreviousPackCleanup?: (context: { packRoot: string }) => void;
      beforePreviousCleanup?: (context: { previous: string }) => void;
    },
  ) => Promise<StageResult>;
  validateStagingTarget: (outDir: string) => Promise<unknown>;
  reclaimOrphanedStagingArtifacts: (testOperations?: {
    artifactGraceMs?: number;
    isProcessAlive?: (pid: number) => boolean;
  }) => Promise<{ removed: string[]; preserved: string[] }>;
};
const stagedRoots: string[] = [];
const ownedCleanupPaths: string[] = [];
const ownedPackRoots: string[] = [];

function stagedRoot(name: string): string {
  const root = join(repoRoot, `tmp/${name}`);
  stagedRoots.push(root);
  return root;
}

function filesBelow(root: string, current = root): string[] {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const path = join(current, entry.name);
    if (entry.isDirectory()) return filesBelow(root, path);
    return [relative(root, path).split(sep).join("/")];
  });
}

function expectWorkspaceTarballs(staged: string, tarballs: readonly string[]): void {
  const manifest = JSON.parse(readFileSync(join(staged, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
  };
  const escapedVersion = coreVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  expect(tarballs).toHaveLength(2);
  expect(new Set(tarballs).size).toBe(tarballs.length);
  rememberPackRoots(tarballs);
  for (const tarball of tarballs) expect(existsSync(tarball)).toBe(true);
  expect(manifest.dependencies["@laugh-tale-island/core"]).toMatch(
    new RegExp(`^file:.*laugh-tale-island-core-${escapedVersion}\\.tgz$`),
  );
  expect(manifest.dependencies["@laugh-tale-island/react"]).toMatch(
    /^file:.*laugh-tale-island-react-\d+\.\d+\.\d+.*\.tgz$/,
  );
}

function rememberPackRoots(tarballs: readonly string[]): void {
  for (const root of new Set(tarballs.map((tarball) => dirname(tarball)))) {
    if (!ownedPackRoots.includes(root)) ownedPackRoots.push(root);
  }
}

function readConsumerMarker(staged: string): {
  invocation: string;
  pack?: PackReference;
  target: string;
} {
  return JSON.parse(readFileSync(join(staged, ownershipMarkerName), "utf8")) as {
    invocation: string;
    pack?: PackReference;
    target: string;
  };
}

function expectOwnedConsumer(staged: string): void {
  expect(JSON.parse(readFileSync(join(staged, ownershipMarkerName), "utf8"))).toMatchObject({
    kind: "laugh-tale-staged-consumer",
    version: 1,
    target: relative(repositoryTmpRoot, staged).split(sep).join("/"),
  });
}

function observeCommands(): {
  commands: CommandObservation[];
  testOperations: { onCommand: (observation: CommandObservation) => void };
} {
  const commands: CommandObservation[] = [];
  return {
    commands,
    testOperations: {
      onCommand: (observation) => commands.push(observation),
    },
  };
}

function expectExactlyOneWorkspaceBuildAndPack(commands: readonly CommandObservation[]): void {
  for (const workspace of ["core", "react"]) {
    const cwd = join(repoRoot, "packages", workspace);
    expect(
      commands.filter(
        (command) =>
          command.cwd === cwd &&
          command.command === "npm" &&
          command.commandArguments.join(" ") === "run build",
      ),
    ).toHaveLength(1);
    expect(
      commands.filter(
        (command) =>
          command.cwd === cwd &&
          command.command === "npm" &&
          command.commandArguments[0] === "pack",
      ),
    ).toHaveLength(1);
  }
}

function ownedPath(path: string): string {
  ownedCleanupPaths.push(path);
  return path;
}

afterEach(() => {
  for (const root of stagedRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  for (const root of ownedPackRoots.splice(0).reverse()) {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  for (const path of ownedCleanupPaths.splice(0).reverse()) {
    if (!existsSync(path) && !lstatMaybe(path)) continue;
    const stat = lstatSync(path);
    if (stat.isDirectory() && !stat.isSymbolicLink()) rmSync(path, { recursive: true, force: true });
    else unlinkSync(path);
  }
  rmSync(nonPackageWorkspaceDir, { recursive: true, force: true });
  rmSync(nonPackageWorkspaceFile, { force: true });
});

function lstatMaybe(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

describe("stage-starter-consumer", () => {
  test("keeps the public starter-copy path clean while ignoring non-package workspace entries", async () => {
    const outDir = stagedRoot("staged-public-starter-test");
    const systemMetadataWasPresent = existsSync(systemMetadataFile);
    mkdirSync(nonPackageWorkspaceDir);
    writeFileSync(join(nonPackageWorkspaceDir, "README.md"), "not a package\n");
    writeFileSync(nonPackageWorkspaceFile, "owned non-package fixture\n");
    const { commands, testOperations } = observeCommands();
    const { stagedRoot: staged, tarballs } = await stageStarterConsumer(
      {
        install: false,
        outDir,
      },
      testOperations,
    );

    expect(staged).toBe(outDir);
    expectWorkspaceTarballs(staged, tarballs);
    expect(readFileSync(nonPackageWorkspaceFile, "utf8")).toBe("owned non-package fixture\n");
    // Finder owns this file and may rewrite or replace its directory metadata.
    // Only the dedicated fixture above carries deterministic byte assertions.
    if (systemMetadataWasPresent) expect(existsSync(systemMetadataFile)).toBe(true);
    expect(existsSync(join(staged, "src/App.tsx"))).toBe(true);
    expect(existsSync(join(staged, "src/presentation/DayHeader.tsx"))).toBe(true);
    expect(existsSync(join(staged, "package-lock.json"))).toBe(false);
    expect(existsSync(join(staged, "node_modules"))).toBe(false);
    expect(existsSync(join(staged, "dist"))).toBe(false);
    expectOwnedConsumer(staged);
    expectExactlyOneWorkspaceBuildAndPack(commands);
  }, 120_000);

  test("composes only the selected schema-2 authored presentation before packaging", async () => {
    const outDir = stagedRoot("staged-field-atlas-test");
    const { commands, testOperations } = observeCommands();
    const { stagedRoot: staged, tarballs } = await stageStarterConsumer(
      {
        install: false,
        outDir,
        recipe: "field-atlas",
        recipeCatalogRoot,
      },
      testOperations,
    );

    expect(staged).toBe(outDir);
    expectWorkspaceTarballs(staged, tarballs);
    expect(JSON.parse(readFileSync(join(staged, "eternal-pose.json"), "utf8"))).toMatchObject({
      recipe: "field-atlas",
      recipeSchemaVersion: 2,
    });
    expect(filesBelow(join(staged, "src/presentation")).sort()).toEqual([
      "README.md",
      "components/AtlasDecisions.tsx",
      "components/AtlasMapSurface.tsx",
      "components/AtlasStates.tsx",
      "components/AtlasTimeline.tsx",
      "components/AtlasUtilityPanels.tsx",
      "experience/FieldAtlasExperience.tsx",
      "home/FieldAtlasHome.tsx",
      "index.ts",
      "styles/accessibility.css",
      "styles/components.css",
      "styles/index.css",
      "styles/layout.css",
      "styles/tokens.css",
      "theme-map-profile.ts",
    ]);
    expect(existsSync(join(staged, "recipes-v2"))).toBe(false);
    expect(existsSync(join(staged, "recipe.json"))).toBe(false);
    expect(existsSync(join(staged, "node_modules"))).toBe(false);
    expect(existsSync(join(staged, "dist"))).toBe(false);
    expect(existsSync(join(staged, "package-lock.json"))).toBe(false);
    expectOwnedConsumer(staged);
    expectExactlyOneWorkspaceBuildAndPack(commands);
  }, 120_000);

  test("rejects composition before mutating package-build output", async () => {
    const outDir = stagedRoot("staged-unknown-recipe-test");
    const sentinel = ownedPath(join(packRoot, "composition-must-precede-packing.txt"));
    mkdirSync(packRoot, { recursive: true });
    writeFileSync(sentinel, "keep\n");

    const { commands, testOperations } = observeCommands();
    await expect(
      stageStarterConsumer(
        {
          install: false,
          outDir,
          recipe: "unknown-recipe",
          recipeCatalogRoot,
        },
        testOperations,
      ),
    ).rejects.toThrow("unknown recipe id: unknown-recipe");

    expect(readFileSync(sentinel, "utf8")).toBe("keep\n");
    expect(existsSync(outDir)).toBe(false);
    expect(commands).toEqual([]);
  }, 120_000);

  test("rejects every unsafe staging target without changing its sentinel", async () => {
    const repoSentinel = ownedPath(join(repoRoot, ".stage-target-repo-sentinel"));
    const tmpSentinel = ownedPath(join(repositoryTmpRoot, ".stage-target-tmp-sentinel"));
    const sourceSentinel = ownedPath(join(starterRoot, ".stage-target-source-sentinel"));
    const outsideRoot = ownedPath(mkdtempSync(join(tmpdir(), "laugh-tale-stage-outside-")));
    const outsideSentinel = join(outsideRoot, "sentinel.txt");
    const symlinkRealRoot = ownedPath(join(repositoryTmpRoot, ".stage-target-real"));
    const symlinkPath = ownedPath(join(repositoryTmpRoot, ".stage-target-link"));
    const symlinkSentinel = join(symlinkRealRoot, "sentinel.txt");
    const unownedRoot = ownedPath(join(repositoryTmpRoot, ".stage-target-unowned"));
    const unownedSentinel = join(unownedRoot, "sentinel.txt");
    const sentinels = [
      repoSentinel,
      tmpSentinel,
      sourceSentinel,
      outsideSentinel,
      symlinkSentinel,
      unownedSentinel,
    ];

    writeFileSync(repoSentinel, "repo sentinel\n");
    writeFileSync(tmpSentinel, "tmp sentinel\n");
    writeFileSync(sourceSentinel, "source sentinel\n");
    writeFileSync(outsideSentinel, "outside sentinel\n");
    mkdirSync(symlinkRealRoot);
    writeFileSync(symlinkSentinel, "symlink sentinel\n");
    symlinkSync(symlinkRealRoot, symlinkPath, "dir");
    mkdirSync(unownedRoot);
    writeFileSync(unownedSentinel, "unowned sentinel\n");
    const before = new Map(sentinels.map((sentinel) => [sentinel, readFileSync(sentinel)]));

    for (const unsafeTarget of [
      repoRoot,
      repositoryTmpRoot,
      starterRoot,
      outsideRoot,
      join(symlinkPath, "consumer"),
      unownedRoot,
    ]) {
      await expect(validateStagingTarget(unsafeTarget)).rejects.toThrow(/staging target/i);
    }

    for (const sentinel of sentinels) {
      expect(readFileSync(sentinel)).toEqual(before.get(sentinel));
    }
  });

  test("refuses a non-empty unowned destination through the staging API", async () => {
    const outDir = ownedPath(join(repositoryTmpRoot, ".stage-target-api-unowned"));
    const sentinel = join(outDir, "sentinel.txt");
    mkdirSync(outDir);
    writeFileSync(sentinel, "must remain byte-for-byte\n");
    const before = readFileSync(sentinel);
    const { commands, testOperations } = observeCommands();

    await expect(
      stageStarterConsumer(
        {
          install: false,
          outDir,
          recipe: "unknown-recipe",
          recipeCatalogRoot,
        },
        testOperations,
      ),
    ).rejects.toThrow(/non-empty unowned destination/i);

    expect(readFileSync(sentinel)).toEqual(before);
    expect(commands).toEqual([]);
  });

  test("keeps a prior owned consumer intact on partial failure and refreshes it on retry", async () => {
    const outDir = stagedRoot("staged-refresh-retry-test");
    const initial = await stageStarterConsumer({ install: false, outDir });
    rememberPackRoots(initial.tarballs);
    const priorManifest = readFileSync(join(outDir, "package.json"));
    const priorMarker = readFileSync(join(outDir, ownershipMarkerName));
    const priorSentinel = join(outDir, "prior-output-sentinel.txt");
    writeFileSync(priorSentinel, "old output remains until publication\n");

    await expect(
      stageStarterConsumer(
        { install: false, outDir },
        {
          onCommand: ({ command, commandArguments }) => {
            if (command === "npm" && commandArguments[0] === "pack") {
              throw new Error("injected pack publication failure");
            }
          },
        },
      ),
    ).rejects.toThrow("injected pack publication failure");

    expect(readFileSync(join(outDir, "package.json"))).toEqual(priorManifest);
    expect(readFileSync(join(outDir, ownershipMarkerName))).toEqual(priorMarker);
    expect(readFileSync(priorSentinel, "utf8")).toBe("old output remains until publication\n");
    expect(existsSync(packageLockRoot)).toBe(false);

    const retried = await stageStarterConsumer({ install: false, outDir });
    rememberPackRoots(retried.tarballs);
    expectOwnedConsumer(outDir);
    expect(existsSync(priorSentinel)).toBe(false);
  }, 120_000);

  test("keeps each successful invocation's packed artifacts distinct and alive", async () => {
    const firstOutDir = stagedRoot("staged-pack-lifetime-a");
    const secondOutDir = stagedRoot("staged-pack-lifetime-b");
    const first = await stageStarterConsumer({ install: false, outDir: firstOutDir });
    const second = await stageStarterConsumer({ install: false, outDir: secondOutDir });
    rememberPackRoots(first.tarballs);
    rememberPackRoots(second.tarballs);

    expect(dirname(first.tarballs[0])).not.toBe(dirname(second.tarballs[0]));
    for (const tarball of [...first.tarballs, ...second.tarballs]) {
      expect(existsSync(tarball)).toBe(true);
    }
  }, 120_000);

  test("bounds an active package lock wait without mutating its owner", async () => {
    const outDir = stagedRoot("staged-active-lock-timeout-test");
    ownedPath(packageLockRoot);
    mkdirSync(packageLockRoot);
    const owner = `${JSON.stringify({
      kind: "laugh-tale-package-build-lock",
      version: 1,
      token: "active-lock-owner",
      pid: process.pid,
      createdAt: Date.now(),
    })}\n`;
    writeFileSync(lockOwnerPath, owner);
    const { commands, testOperations } = observeCommands();

    await expect(
      stageStarterConsumer(
        { install: false, outDir },
        {
          ...testOperations,
          lockTimeoutMs: 25,
          lockPollMs: 5,
          isProcessAlive: () => true,
        },
      ),
    ).rejects.toThrow(/timed out after 25ms/i);

    expect(readFileSync(lockOwnerPath, "utf8")).toBe(owner);
    expect(existsSync(outDir)).toBe(false);
    expect(commands).toEqual([]);
  });

  test("rejects malformed lock ownership without swallowing or changing it", async () => {
    const outDir = stagedRoot("staged-invalid-lock-test");
    ownedPath(packageLockRoot);
    mkdirSync(packageLockRoot);
    writeFileSync(lockOwnerPath, "{not valid json\n");

    await expect(
      stageStarterConsumer(
        { install: false, outDir },
        { lockTimeoutMs: 25, lockPollMs: 5 },
      ),
    ).rejects.toThrow(/invalid ownership metadata/i);

    expect(readFileSync(lockOwnerPath, "utf8")).toBe("{not valid json\n");
    expect(existsSync(outDir)).toBe(false);
  });

  test("conservatively retires a token-verified lock whose owner is dead", async () => {
    const outDir = stagedRoot("staged-dead-lock-recovery-test");
    ownedPath(packageLockRoot);
    mkdirSync(packageLockRoot);
    writeFileSync(
      lockOwnerPath,
      `${JSON.stringify({
        kind: "laugh-tale-package-build-lock",
        version: 1,
        token: "dead-lock-owner",
        pid: 424_242,
        createdAt: Date.now() - 2_000,
      })}\n`,
    );
    const { commands, testOperations } = observeCommands();

    const result = await stageStarterConsumer(
      { install: false, outDir },
      {
        ...testOperations,
        lockDeadOwnerGraceMs: 0,
        lockPollMs: 5,
        isProcessAlive: () => false,
      },
    );
    rememberPackRoots(result.tarballs);

    expectOwnedConsumer(result.stagedRoot);
    expectExactlyOneWorkspaceBuildAndPack(commands);
    expect(existsSync(packageLockRoot)).toBe(false);
  }, 120_000);

  test("rolls back when the authorized target identity is swapped after revalidation", async () => {
    const outDir = stagedRoot("staged-identity-swap-test");
    const initial = await stageStarterConsumer({ install: false, outDir });
    rememberPackRoots(initial.tarballs);
    const originalSentinel = join(outDir, "original-sentinel.txt");
    writeFileSync(originalSentinel, "authorized bytes stay intact\n");
    const authorizedBackup = ownedPath(
      join(repositoryTmpRoot, `.stage-identity-authorized-${process.pid}-${Date.now()}`),
    );
    const replacementSentinel = join(outDir, "replacement-sentinel.txt");

    await expect(
      stageStarterConsumer(
        { install: false, outDir },
        {
          afterTargetRevalidated: () => {
            renameSync(outDir, authorizedBackup);
            mkdirSync(outDir);
            writeFileSync(replacementSentinel, "replacement bytes stay intact\n");
          },
        },
      ),
    ).rejects.toThrow(/identity.*changed|changed.*identity/i);

    expect(readFileSync(replacementSentinel, "utf8")).toBe("replacement bytes stay intact\n");
    expect(readFileSync(join(authorizedBackup, "original-sentinel.txt"), "utf8")).toBe(
      "authorized bytes stay intact\n",
    );
    expect(existsSync(join(outDir, "package.json"))).toBe(false);
    expect(existsSync(packageLockRoot)).toBe(false);
  }, 120_000);

  test("restores the exact prior consumer when candidate publication rename fails", async () => {
    const outDir = stagedRoot("staged-candidate-rename-failure-test");
    const initial = await stageStarterConsumer({ install: false, outDir });
    rememberPackRoots(initial.tarballs);
    const priorMarker = readFileSync(join(outDir, ownershipMarkerName));
    const priorSentinel = join(outDir, "prior-candidate-failure-sentinel.txt");
    writeFileSync(priorSentinel, "restore this exact consumer\n");
    const candidateBackup = ownedPath(
      join(repositoryTmpRoot, `.stage-candidate-backup-${process.pid}-${Date.now()}`),
    );

    await expect(
      stageStarterConsumer(
        { install: false, outDir },
        {
          beforeCandidateRename: ({ candidate }) => {
            renameSync(candidate, candidateBackup);
          },
        },
      ),
    ).rejects.toThrow();

    expect(readFileSync(join(outDir, ownershipMarkerName))).toEqual(priorMarker);
    expect(readFileSync(priorSentinel, "utf8")).toBe("restore this exact consumer\n");
    expect(existsSync(packageLockRoot)).toBe(false);
  }, 120_000);

  test("reports post-publication cleanup as recoverable success without deleting unknown data", async () => {
    const outDir = stagedRoot("staged-post-publication-cleanup-test");
    const initial = await stageStarterConsumer({ install: false, outDir });
    rememberPackRoots(initial.tarballs);
    const priorSentinel = join(outDir, "prior-cleanup-sentinel.txt");
    writeFileSync(priorSentinel, "do not delete on cleanup mismatch\n");

    const refreshed = await stageStarterConsumer(
      { install: false, outDir },
      {
        beforePreviousCleanup: ({ previous }) => {
          const markerPath = join(previous, ownershipMarkerName);
          writeFileSync(markerPath, `${readFileSync(markerPath, "utf8")} `);
        },
      },
    );
    rememberPackRoots(refreshed.tarballs);

    expect(readConsumerMarker(outDir).invocation).toBe(readConsumerMarker(outDir).pack?.invocation);
    expect(refreshed.cleanupWarnings?.join("\n")).toMatch(/cleanup|ownership|identity/i);
    expect(refreshed.cleanupPending).toHaveLength(1);
    const [recoveryRoot] = refreshed.cleanupPending!;
    ownedPath(recoveryRoot);
    expect(readFileSync(join(recoveryRoot, "previous/prior-cleanup-sentinel.txt"), "utf8")).toBe(
      "do not delete on cleanup mismatch\n",
    );
    expect(existsSync(join(outDir, "package.json"))).toBe(true);
    expect(existsSync(packageLockRoot)).toBe(false);
  }, 120_000);

  test("records pack ownership and reclaims only the previous consumer's exact pack on refresh", async () => {
    const outDir = stagedRoot("staged-pack-refresh-test");
    const first = await stageStarterConsumer({ install: false, outDir });
    rememberPackRoots(first.tarballs);
    const firstPackRoot = dirname(first.tarballs[0]);
    const firstMarker = readConsumerMarker(outDir);

    expect(firstMarker.pack).toMatchObject({
      invocation: firstMarker.invocation,
      path: relative(repositoryTmpRoot, firstPackRoot).split(sep).join("/"),
    });
    expect(firstMarker.pack?.token).toMatch(/^[0-9a-f-]+$/i);
    expect(typeof firstMarker.pack?.directoryIdentity.dev).toBe("string");
    expect(typeof firstMarker.pack?.directoryIdentity.ino).toBe("string");
    expect(typeof firstMarker.pack?.markerIdentity.dev).toBe("string");
    expect(typeof firstMarker.pack?.markerIdentity.ino).toBe("string");
    expect(firstMarker.pack?.markerSource).toContain(firstMarker.pack!.token);

    const second = await stageStarterConsumer({ install: false, outDir });
    rememberPackRoots(second.tarballs);
    const secondPackRoot = dirname(second.tarballs[0]);

    expect(secondPackRoot).not.toBe(firstPackRoot);
    expect(existsSync(firstPackRoot)).toBe(false);
    expect(existsSync(secondPackRoot)).toBe(true);
    expect(readConsumerMarker(outDir).pack?.path).toBe(
      relative(repositoryTmpRoot, secondPackRoot).split(sep).join("/"),
    );
  }, 120_000);

  test("preserves a replaced prior pack root whose copied marker no longer has the authorized identity", async () => {
    const outDir = stagedRoot("staged-pack-identity-swap-test");
    const first = await stageStarterConsumer({ install: false, outDir });
    rememberPackRoots(first.tarballs);
    const firstPackRoot = dirname(first.tarballs[0]);
    const ownerSource = readFileSync(join(firstPackRoot, ".laugh-tale-staging-owner.json"), "utf8");
    const originalPackBackup = ownedPath(
      join(repositoryTmpRoot, `.stage-pack-identity-authorized-${process.pid}-${Date.now()}`),
    );
    const replacementSentinel = join(firstPackRoot, "replacement-pack-sentinel.txt");

    const second = await stageStarterConsumer(
      { install: false, outDir },
      {
        beforePreviousPackCleanup: ({ packRoot: previousPackRoot }) => {
          expect(previousPackRoot).toBe(firstPackRoot);
          renameSync(previousPackRoot, originalPackBackup);
          mkdirSync(previousPackRoot);
          writeFileSync(join(previousPackRoot, ".laugh-tale-staging-owner.json"), ownerSource);
          writeFileSync(replacementSentinel, "replacement pack stays byte-for-byte\n");
        },
      },
    );
    rememberPackRoots(second.tarballs);

    expect(readFileSync(replacementSentinel, "utf8")).toBe(
      "replacement pack stays byte-for-byte\n",
    );
    expect(existsSync(join(originalPackBackup, basename(first.tarballs[0])))).toBe(true);
    expect(second.cleanupWarnings?.join("\n")).toMatch(/prior-pack cleanup remains pending/i);
    expect(second.cleanupPending).toContain(firstPackRoot);
    expect(existsSync(join(outDir, "package.json"))).toBe(true);
  }, 120_000);

  test("reclaims only dead, expired, exactly-owned orphan artifacts and preserves unknown entries", async () => {
    mkdirSync(packRoot, { recursive: true });
    const suffix = `${process.pid}-${Date.now()}`;
    const orphanPack = ownedPath(join(packRoot, `orphan-${suffix}`));
    const guardedPack = ownedPath(join(packRoot, `guarded-${suffix}`));
    const orphanWork = ownedPath(join(repositoryTmpRoot, `.stage-starter-work-orphan-${suffix}`));
    const unknownWork = ownedPath(join(repositoryTmpRoot, `.stage-starter-work-unknown-${suffix}`));
    const unknownPackEntry = join(guardedPack, "unknown-sentinel.txt");
    const unknownWorkEntry = join(unknownWork, "unknown-sentinel.txt");
    const oldCreatedAt = Date.now() - 60_000;

    for (const [path, marker] of [
      [
        orphanPack,
        {
          kind: "laugh-tale-staging-packs",
          version: 2,
          invocation: `orphan-${suffix}`,
          token: `pack-token-${suffix}`,
          path: relative(repositoryTmpRoot, orphanPack).split(sep).join("/"),
          target: `orphan-target-${suffix}/consumer`,
          pid: 424_242,
          createdAt: oldCreatedAt,
          files: ["artifact.tgz"],
        },
      ],
      [
        guardedPack,
        {
          kind: "laugh-tale-staging-packs",
          version: 2,
          invocation: `guarded-${suffix}`,
          token: `guarded-token-${suffix}`,
          path: relative(repositoryTmpRoot, guardedPack).split(sep).join("/"),
          target: `guarded-target-${suffix}/consumer`,
          pid: 424_242,
          createdAt: oldCreatedAt,
          files: ["artifact.tgz"],
        },
      ],
    ] as const) {
      mkdirSync(path);
      writeFileSync(join(path, ".laugh-tale-staging-owner.json"), `${JSON.stringify(marker)}\n`);
      writeFileSync(join(path, "artifact.tgz"), "owned artifact\n");
    }
    writeFileSync(unknownPackEntry, "unknown pack bytes\n");

    mkdirSync(orphanWork);
    writeFileSync(
      join(orphanWork, ".laugh-tale-staging-owner.json"),
      `${JSON.stringify({
        kind: "laugh-tale-staging-work",
        version: 2,
        invocation: `work-${suffix}`,
        token: `work-token-${suffix}`,
        path: relative(repositoryTmpRoot, orphanWork).split(sep).join("/"),
        target: `work-target-${suffix}/consumer`,
        pid: 424_242,
        createdAt: oldCreatedAt,
        prior: { state: "missing" },
      })}\n`,
    );
    mkdirSync(unknownWork);
    writeFileSync(unknownWorkEntry, "unknown work bytes\n");

    const reclaimed = await reclaimOrphanedStagingArtifacts({
      artifactGraceMs: 0,
      isProcessAlive: () => false,
    });

    expect(reclaimed.removed).toEqual(expect.arrayContaining([orphanPack, orphanWork]));
    expect(existsSync(orphanPack)).toBe(false);
    expect(existsSync(orphanWork)).toBe(false);
    expect(readFileSync(unknownPackEntry, "utf8")).toBe("unknown pack bytes\n");
    expect(readFileSync(unknownWorkEntry, "utf8")).toBe("unknown work bytes\n");
    expect(reclaimed.preserved).toEqual(expect.arrayContaining([guardedPack, unknownWork]));
  });
});
