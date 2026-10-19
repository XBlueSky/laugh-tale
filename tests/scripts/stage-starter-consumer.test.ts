import {
  closeSync,
  cpSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
const artifactLockRoot = join(repositoryTmpRoot, ".stage-starter-artifact.lock");
const artifactLockOwnerPath = join(artifactLockRoot, "owner.json");
const ownershipMarkerName = ".laugh-tale-staged-consumer.json";
const nonPackageWorkspaceDir = join(repoRoot, "packages/.staging-non-package");
const nonPackageWorkspaceFile = join(repoRoot, "packages/.staging-non-package-file");
const systemMetadataFile = join(repoRoot, "packages/.DS_Store");
const packageVersion = "2.0.0";
const packageBuildOrder = ["core", "react", "adapters", "testing"] as const;
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
  attestationPath: string;
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
      tripPath?: string;
      setupLocale?: string;
      copyCatalogPath?: string;
      resolutionsPath?: string;
    },
    testOperations?: {
      onCommand?: (observation: CommandObservation) => void;
      lockTimeoutMs?: number;
      lockPollMs?: number;
      lockStaleMs?: number;
      lockDeadOwnerGraceMs?: number;
      artifactGraceMs?: number;
      artifactLockDeadOwnerGraceMs?: number;
      artifactLockPollMs?: number;
      artifactLockStaleMs?: number;
      artifactLockTimeoutMs?: number;
      beforeLockOwnerPublish?: (context: {
        lockKind: "artifact" | "package";
        lockRoot: string;
        pendingOwnerPath: string;
      }) => void | Promise<void>;
      beforeLockOwnerCommit?: (context: {
        lockKind: "artifact" | "package";
        lockRoot: string;
        pendingOwnerPath: string;
      }) => void | Promise<void>;
      afterLockOwnerPublish?: (context: {
        lockKind: "artifact" | "package";
        lockRoot: string;
        pendingOwnerPath: string;
      }) => void | Promise<void>;
      beforePackageLockRelease?: () => void | Promise<void>;
      beforePackageLockRetire?: () => void | Promise<void>;
      afterLockOwnerValidated?: (context: {
        lockKind: "artifact" | "package";
        reason: "release" | "stale";
        removalPath: string;
        ownerPath: string;
      }) => void | Promise<void>;
      beforeArtifactLockRelease?: (context: {
        phase: string;
        workRoot?: string;
      }) => void | Promise<void>;
      isProcessAlive?: (pid: number) => boolean;
      afterTargetRevalidated?: (context: { target: string }) => void;
      afterStarterComposed?: (context: { candidate: string }) => void | Promise<void>;
      afterAttestationWrite?: (context: { candidate: string; path: string }) => void | Promise<void>;
      beforeAttestationFsync?: (context: { candidate: string; path: string }) => void | Promise<void>;
      afterAttestationValidated?: (context: { candidate: string; path: string }) => void | Promise<void>;
      beforeCandidateRename?: (context: {
        candidate: string;
        previous?: string;
      }) => void | Promise<void>;
      afterCandidateTarballValidated?: (context: {
        index: number;
        packageName: string;
        path: string;
      }) => void | Promise<void>;
      afterTarballRead?: (context: {
        packageName: string;
        path: string;
        phase: "candidate";
      }) => void | Promise<void>;
      beforeFinalPackMarkerUpdate?: (context: {
        artifacts: readonly {
          identity: { dev: string; ino: string };
          name: string;
          path: string;
        }[];
        packRoot: string;
      }) => void | Promise<void>;
      beforePreviousPackCleanup?: (context: { packRoot: string }) => void;
      beforePreviousCleanup?: (context: { previous: string }) => void;
      onCommandComplete?: (
        observation: CommandObservation & { durationMs: number; status: number | null },
      ) => void;
      transformCommandOutput?: (
        observation: CommandObservation & { stdout: string },
      ) => string;
    },
  ) => Promise<StageResult>;
  validateStagingTarget: (outDir: string) => Promise<unknown>;
  reclaimOrphanedStagingArtifacts: (testOperations?: {
    artifactGraceMs?: number;
    artifactLockDeadOwnerGraceMs?: number;
    artifactLockPollMs?: number;
    artifactLockTimeoutMs?: number;
    artifactLockStaleMs?: number;
    beforeLockOwnerPublish?: (context: {
      lockKind: "artifact" | "package";
      lockRoot: string;
      pendingOwnerPath: string;
    }) => void | Promise<void>;
    beforeLockOwnerCommit?: (context: {
      lockKind: "artifact" | "package";
      lockRoot: string;
      pendingOwnerPath: string;
    }) => void | Promise<void>;
    afterLockOwnerPublish?: (context: {
      lockKind: "artifact" | "package";
      lockRoot: string;
      pendingOwnerPath: string;
    }) => void | Promise<void>;
    afterLockOwnerValidated?: (context: {
      lockKind: "artifact" | "package";
      reason: "release" | "stale";
      removalPath: string;
      ownerPath: string;
    }) => void | Promise<void>;
    beforeArtifactLockRelease?: (context: {
      phase: string;
      workRoot?: string;
    }) => void | Promise<void>;
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

function expectWorkspaceTarballs(staged: string, tarballs: readonly string[]): void {
  const manifest = JSON.parse(readFileSync(join(staged, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const escapedVersion = packageVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  expect(tarballs).toHaveLength(4);
  expect(new Set(tarballs).size).toBe(tarballs.length);
  expect(tarballs.map((tarball) => basename(tarball))).toEqual(
    packageBuildOrder.map(
      (packageName) => `laugh-tale-island-${packageName}-${packageVersion}.tgz`,
    ),
  );
  expect(
    new Set(tarballs.map((tarball) => {
      const stat = lstatSync(tarball);
      return `${stat.dev}:${stat.ino}`;
    })).size,
  ).toBe(4);
  rememberPackRoots(tarballs);
  for (const tarball of tarballs) expect(existsSync(tarball)).toBe(true);
  expect(manifest.dependencies["@laugh-tale-island/core"]).toMatch(
    new RegExp(`^file:.*laugh-tale-island-core-${escapedVersion}\\.tgz$`),
  );
  expect(manifest.dependencies["@laugh-tale-island/react"]).toMatch(
    new RegExp(`^file:.*laugh-tale-island-react-${escapedVersion}\\.tgz$`),
  );
  expect(manifest.dependencies["@laugh-tale-island/adapters"]).toMatch(
    new RegExp(`^file:.*laugh-tale-island-adapters-${escapedVersion}\\.tgz$`),
  );
  expect(manifest.devDependencies["@laugh-tale-island/testing"]).toMatch(
    new RegExp(`^file:.*laugh-tale-island-testing-${escapedVersion}\\.tgz$`),
  );
  expect(manifest.dependencies["@laugh-tale-island/testing"]).toBeUndefined();
  expect(manifest.devDependencies["@laugh-tale-island/core"]).toBeUndefined();
  expect(manifest.devDependencies["@laugh-tale-island/react"]).toBeUndefined();
  expect(manifest.devDependencies["@laugh-tale-island/adapters"]).toBeUndefined();
  expect([
    manifest.dependencies["@laugh-tale-island/core"],
    manifest.dependencies["@laugh-tale-island/react"],
    manifest.dependencies["@laugh-tale-island/adapters"],
    manifest.devDependencies["@laugh-tale-island/testing"],
  ]).toEqual(tarballs.map((tarball) => `file:${tarball}`));
}

function manifestTarballs(candidate: string): string[] {
  const manifest = JSON.parse(readFileSync(join(candidate, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  return [
    manifest.dependencies["@laugh-tale-island/core"],
    manifest.dependencies["@laugh-tale-island/react"],
    manifest.dependencies["@laugh-tale-island/adapters"],
    manifest.devDependencies["@laugh-tale-island/testing"],
  ].map((specifier) => {
    if (!specifier.startsWith("file:")) throw new Error(`expected staged file specifier: ${specifier}`);
    return specifier.slice("file:".length);
  });
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

function pathIdentity(path: string): { dev: string; ino: string } {
  const stat = lstatSync(path);
  return { dev: String(stat.dev), ino: String(stat.ino) };
}

function tmpRelative(path: string): string {
  return relative(repositoryTmpRoot, path).split(sep).join("/");
}

function createOwnedPackFixture({
  createdAt,
  invocation,
  packPath,
  pid,
  target,
}: {
  createdAt: number;
  invocation: string;
  packPath: string;
  pid: number;
  target: string;
}): { artifact: string; reference: PackReference } {
  const artifact = join(packPath, "artifact.tgz");
  const markerPath = join(packPath, ".laugh-tale-staging-owner.json");
  const token = `pack-token-${invocation}`;
  const marker = {
    kind: "laugh-tale-staging-packs",
    version: 2,
    invocation,
    token,
    path: tmpRelative(packPath),
    target: tmpRelative(target),
    pid,
    createdAt,
    files: [basename(artifact)],
  };
  const markerSource = `${JSON.stringify(marker)}\n`;
  mkdirSync(packPath, { recursive: true });
  writeFileSync(markerPath, markerSource);
  writeFileSync(artifact, "owned pack artifact\n");
  return {
    artifact,
    reference: {
      invocation,
      path: marker.path,
      token,
      directoryIdentity: pathIdentity(packPath),
      markerIdentity: pathIdentity(markerPath),
      markerSource,
    },
  };
}

function createInterruptedWorkFixture({
  createdAt,
  invocation,
  pack,
  pid,
  target,
  workPath,
}: {
  createdAt: number;
  invocation: string;
  pack?: PackReference;
  pid: number;
  target: string;
  workPath: string;
}): { previous: string; priorMarkerSource: string } {
  const previous = join(workPath, "previous");
  const targetRelative = tmpRelative(target);
  const priorMarker = {
    kind: "laugh-tale-staged-consumer",
    version: 1,
    target: targetRelative,
    invocation: `prior-${invocation}`,
    ...(pack === undefined ? {} : { pack }),
  };
  const priorMarkerSource = `${JSON.stringify(priorMarker)}\n`;
  mkdirSync(previous, { recursive: true });
  writeFileSync(join(previous, ownershipMarkerName), priorMarkerSource);
  writeFileSync(join(previous, "consumer-sentinel.txt"), "restore this consumer exactly\n");
  writeFileSync(
    join(workPath, ".laugh-tale-staging-owner.json"),
    `${JSON.stringify({
      kind: "laugh-tale-staging-work",
      version: 2,
      invocation,
      token: `work-token-${invocation}`,
      path: tmpRelative(workPath),
      target: targetRelative,
      pid,
      createdAt,
      prior: {
        state: "owned",
        targetIdentity: pathIdentity(previous),
        marker: priorMarker,
        markerIdentity: pathIdentity(join(previous, ownershipMarkerName)),
        markerSource: priorMarkerSource,
      },
    })}\n`,
  );
  return { previous, priorMarkerSource };
}

function createCandidateFixture({
  invocation,
  pack,
  target,
  workPath,
}: {
  invocation: string;
  pack: PackReference;
  target: string;
  workPath: string;
}): string {
  const candidate = join(workPath, "consumer");
  mkdirSync(candidate);
  writeFileSync(
    join(candidate, ownershipMarkerName),
    `${JSON.stringify({
      kind: "laugh-tale-staged-consumer",
      version: 1,
      target: tmpRelative(target),
      invocation,
      pack,
    })}\n`,
  );
  writeFileSync(join(candidate, "candidate-sentinel.txt"), "candidate stays recoverable\n");
  return candidate;
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
  for (const workspace of packageBuildOrder) {
    const cwd = join(repoRoot, "packages", workspace);
    expect(
      commands.filter(
        (command) =>
          command.cwd === cwd &&
          command.command === "npm" &&
          command.commandArguments[0] === "run" &&
          command.commandArguments[1] === "build",
      ),
    ).toEqual([
      expect.objectContaining({ commandArguments: ["run", "build", "--ignore-scripts"] }),
    ]);
    expect(
      commands.filter(
        (command) =>
          command.cwd === cwd &&
          command.command === "npm" &&
          command.commandArguments[0] === "pack",
      ),
    ).toHaveLength(1);
  }

  expect(
    commands
      .filter(
        ({ command, commandArguments, cwd }) =>
          command === "npm" &&
          packageBuildOrder.some(
            (workspace) => cwd === join(repoRoot, "packages", workspace),
          ) &&
          ((commandArguments[0] === "run" && commandArguments[1] === "build") ||
            commandArguments[0] === "pack"),
      )
      .map(({ commandArguments, cwd }) => ({
        action: commandArguments[0] === "pack" ? "pack" : "build",
        workspace: basename(cwd),
      })),
  ).toEqual(
    packageBuildOrder.flatMap((workspace) => [
      { action: "build", workspace },
      { action: "pack", workspace },
    ]),
  );
}

function ownedPath(path: string): string {
  ownedCleanupPaths.push(path);
  return path;
}

function validSingleRecipeCatalog(): string {
  mkdirSync(repositoryTmpRoot, { recursive: true });
  const catalog = ownedPath(mkdtempSync(join(repositoryTmpRoot, "stage-valid-catalog-")));
  cpSync(join(repoRoot, "tests/fixtures/recipe-v2/valid"), join(catalog, "valid"), { recursive: true });
  return catalog;
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
  test("publishes installed lockfiles relative to the final consumer path", async () => {
    const outDir = stagedRoot("staged-installed-lockfiles-test");
    const result = await stageStarterConsumer({ outDir });
    expectWorkspaceTarballs(result.stagedRoot, result.tarballs);
    expect(result.attestationPath).toBe(join(outDir, ".laugh-tale-local-candidates.json"));
    const attestation = JSON.parse(readFileSync(result.attestationPath, "utf8")) as {
      schemaVersion: number;
      packages: Array<{ name: string; version: string; archive: string; bytes: number; sha256: string; integrity: string }>;
    };
    expect(attestation.schemaVersion).toBe(1);
    expect(attestation.packages.map((entry) => entry.name)).toEqual(packageBuildOrder.map((name) => `@laugh-tale-island/${name}`));
    for (let index = 0; index < result.tarballs.length; index += 1) {
      const bytes = readFileSync(result.tarballs[index]);
      const entry = attestation.packages[index];
      expect(entry.archive).toBe(result.tarballs[index]);
      expect(entry.version).toBe("2.0.0");
      expect(entry.bytes).toBe(bytes.length);
      expect(entry.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(entry.integrity).toBe(`sha512-${createHash("sha512").update(bytes).digest("base64")}`);
    }

    for (const lockfile of ["package-lock.json", "node_modules/.package-lock.json"]) {
      const lock = JSON.parse(readFileSync(join(outDir, lockfile), "utf8")) as {
        packages: Record<string, { resolved?: string }>;
      };
      for (let index = 0; index < packageBuildOrder.length; index += 1) {
        const packageName = packageBuildOrder[index];
        const expected = `file:${relative(outDir, result.tarballs[index]).split(sep).join("/")}`;
        expect(lock.packages[`node_modules/@laugh-tale-island/${packageName}`]?.resolved).toBe(
          expected,
        );
      }
    }

    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const installed = spawnSync(
      npm,
      [
        "ls",
        "@laugh-tale-island/core",
        "@laugh-tale-island/react",
        "@laugh-tale-island/adapters",
        "@laugh-tale-island/testing",
      ],
      { cwd: outDir, encoding: "utf8", shell: false },
    );
    expect(installed.status, `${installed.stdout}\n${installed.stderr}`).toBe(0);
  }, 120_000);

  test.each(["write", "fsync", "validation"])("restores the prior candidate when attestation %s fails", async (phase) => {
    const outDir = stagedRoot("staged-attestation-fault-test");
    const initial = await stageStarterConsumer({ install: false, outDir, setupLocale: "zh-Hant-TW" });
    rememberPackRoots(initial.tarballs);
    const previous = readFileSync(join(outDir, "package.json"), "utf8");
    await expect(stageStarterConsumer({ install: false, outDir, setupLocale: "zh-Hant-TW" }, {
      ...(phase === "write" ? { afterAttestationWrite: () => { throw new Error("injected attestation write failure"); } } : {}),
      ...(phase === "fsync" ? { beforeAttestationFsync: () => { throw new Error("injected attestation fsync failure"); } } : {}),
      ...(phase === "validation" ? { afterAttestationValidated: () => { throw new Error("injected attestation validation failure"); } } : {}),
    })).rejects.toThrow(`injected attestation ${phase} failure`);
    expect(readFileSync(join(outDir, "package.json"), "utf8")).toBe(previous);
    expect(readFileSync(initial.attestationPath, "utf8")).toContain("\"schemaVersion\": 1");
  }, 120_000);

  test("keeps the internal raw starter-copy API clean while ignoring non-package workspace entries", async () => {
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
    expect(existsSync(join(staged, "src/app/App.tsx"))).toBe(true);
    expect(existsSync(join(staged, "src/presentation/experience/FloatingDayHeader.tsx"))).toBe(true);
    expect(existsSync(join(staged, "package-lock.json"))).toBe(false);
    expect(existsSync(join(staged, "node_modules"))).toBe(false);
    expect(existsSync(join(staged, "dist"))).toBe(false);
    expectOwnedConsumer(staged);
    expectExactlyOneWorkspaceBuildAndPack(commands);
  }, 120_000);

  test("rejects an extra Laugh Tale workspace before any build", async () => {
    const outDir = stagedRoot("staged-extra-laugh-tale-package-test");
    const extra = ownedPath(join(repoRoot, "packages/.staging-extra-laugh-tale"));
    mkdirSync(extra);
    writeFileSync(join(extra, "package.json"), JSON.stringify({ name: "@laugh-tale-island/rogue", version: "2.0.0" }));
    await expect(stageStarterConsumer({ install: false, outDir }, {
      onCommand: () => { throw new Error("unexpected package build"); },
    })).rejects.toThrow(/extra Laugh Tale package/i);
    expect(existsSync(outDir)).toBe(false);
  }, 120_000);

  test("creates a canonical Oak setup before packing and installs all four attested packages", async () => {
    const outDir = stagedRoot("staged-oak-create-test");
    const { commands, testOperations } = observeCommands();
    const result = await stageStarterConsumer({ outDir, recipe: "oak-washi", setupLocale: "zh-Hant-TW" }, {
      ...testOperations,
      afterStarterComposed({ candidate }) {
        expect(commands).toEqual([]);
        expect(JSON.parse(readFileSync(join(candidate, "src/trip-content/trip-input.json"), "utf8"))).toMatchObject({ trip: null, setupLocale: "zh-Hant-TW" });
        expect(JSON.parse(readFileSync(join(candidate, "eternal-pose.json"), "utf8"))).toMatchObject({ schemaVersion: 2, recipe: { id: "oak-washi" } });
        expect(readFileSync(join(candidate, "src/presentation/copy/catalog.ts"))).toEqual(readFileSync(join(recipeCatalogRoot, "oak-washi/presentation/copy/catalog.ts")));
      },
    });
    expectWorkspaceTarballs(outDir, result.tarballs);
    expect(existsSync(result.attestationPath)).toBe(true);
    expectExactlyOneWorkspaceBuildAndPack(commands);
  }, 120_000);

  test("forwards real trip, authored catalog, and resolutions through exactly one Create", async () => {
    const outDir = stagedRoot("staged-oak-authored-test");
    const inputDir = ownedPath(mkdtempSync(join(repositoryTmpRoot, "oak-input-")));
    const tripPath = join(inputDir, "trip.json"), copyCatalogPath = join(inputDir, "copy.json"), resolutionsPath = join(inputDir, "ledger.json");
    const trip = { schemaVersion: 2, trip: { id: "forwarded", title: "Forwarded authored trip", locale: "en-GB", timezone: "Etc/UTC", startDate: "2042-04-18", endDate: "2042-04-18", days: [{ id: "one", date: "2042-04-18", title: "Authored day", nodes: [] }], routes: [], candidateGroups: [], reservations: [], tasks: [] }, enrichmentPolicy: { provider: "google", regionCode: "JP", locationBias: { center: { lat: 35, lng: 139 }, radiusMeters: 5000 } }, placeOwners: [] };
    const catalog = JSON.parse(readFileSync(join(recipeCatalogRoot, "oak-washi/presentation/copy/en.json"), "utf8")) as { metadata: { setupTitle: string } };
    catalog.metadata.setupTitle = "Authored staging title";
    const ledger = { schemaVersion: 1, provider: "google", entries: [] };
    writeFileSync(tripPath, JSON.stringify(trip));
    writeFileSync(copyCatalogPath, JSON.stringify({ locale: "en-GB", catalog }));
    writeFileSync(resolutionsPath, JSON.stringify(ledger));
    let compositions = 0;
    const result = await stageStarterConsumer({ outDir, install: false, tripPath, copyCatalogPath, resolutionsPath }, {
      afterStarterComposed({ candidate }) {
        compositions += 1;
        expect(JSON.parse(readFileSync(join(candidate, "src/trip-content/trip-input.json"), "utf8"))).toEqual(trip);
        expect(JSON.parse(readFileSync(join(candidate, "src/trip-content/place-resolutions.json"), "utf8"))).toEqual(ledger);
        const copy = readFileSync(join(candidate, "src/presentation/copy/catalog.ts"), "utf8");
        expect(copy).toContain("Authored staging title"); expect(copy).toContain("en-GB");
      },
    });
    rememberPackRoots(result.tarballs); expect(compositions).toBe(1);
  }, 120_000);

  test("executes the CI public npm staging command with its explicit setup locale", () => {
    const outDir = stagedRoot("staged-cli-default-oak-test");
    const command = readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8").split("\n").find(line => line.includes("run: npm run stage:starter"))!.split("run: ")[1].trim().split(/\s+/);
    const result = spawnSync(command[0], [...command.slice(1), "--out", outDir, "--no-install"], { encoding: "utf8", cwd: repoRoot });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const attestation = JSON.parse(readFileSync(join(outDir, ".laugh-tale-local-candidates.json"), "utf8")) as { packages: { archive: string }[] };
    rememberPackRoots(attestation.packages.map(item => item.archive));
    expect(JSON.parse(readFileSync(join(outDir, "eternal-pose.json"), "utf8"))).toMatchObject({ schemaVersion: 2, recipe: { id: "oak-washi" } });
    expect(JSON.parse(readFileSync(join(outDir, "src/trip-content/trip-input.json"), "utf8"))).toMatchObject({ trip: null, setupLocale: "en" });
    expect(existsSync(join(outDir, "src/presentation/copy/catalog.ts"))).toBe(true);
  }, 120_000);

  test("refuses a public CLI without trip or explicit locale before builds and publication", () => {
    const outDir = stagedRoot("staged-cli-missing-locale-test");
    const packsBefore = readdirSync(packRoot).sort();
    const probeRoot = ownedPath(mkdtempSync(join(repositoryTmpRoot, "cli-no-command-")));
    const commandMarker = join(probeRoot, "command-started");
    const preload = join(probeRoot, "observe-commands.mjs");
    writeFileSync(preload, `import childProcess from "node:child_process"; import { syncBuiltinESMExports } from "node:module"; import { writeFileSync } from "node:fs"; const spawn = childProcess.spawnSync; childProcess.spawnSync = (...args) => { writeFileSync(${JSON.stringify(commandMarker)}, String(args[0])); return spawn(...args); }; syncBuiltinESMExports();`);
    const result = spawnSync(process.execPath, ["--import", preload, script, "--out", outDir, "--no-install"], { encoding: "utf8" });
    if (existsSync(join(outDir, ".laugh-tale-local-candidates.json"))) {
      const attestation = JSON.parse(readFileSync(join(outDir, ".laugh-tale-local-candidates.json"), "utf8")) as { packages: { archive: string }[] };
      rememberPackRoots(attestation.packages.map(item => item.archive));
    }
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stderr).toMatch(/setup.locale/i);
    expect(result.stdout).not.toMatch(/tsc|staged-starter:/);
    expect(existsSync(commandMarker)).toBe(false);
    expect(existsSync(outDir)).toBe(false);
    expect(readdirSync(packRoot).sort()).toEqual(packsBefore);
  }, 120_000);

  test.each([
    ["--wat"], ["--out", "relative"], ["--out", "/tmp/a", "--out", "/tmp/b"],
    ["--recipe", "other"], ["--trip", "relative"], ["--copy-catalog", "relative"],
    ["--resolutions", "/tmp/ledger.json"], ["--trip", "/tmp/trip.json", "--setup-locale", "zh-Hant-TW"],
    ["--no-install", "--no-install"],
  ])("rejects invalid staging CLI arguments %j before work", (...args) => {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("node scripts/stage-starter-consumer.mjs [--out /absolute/staged-project] [--recipe oak-washi] [--trip /absolute/trip-input.json | --setup-locale zh-Hant-TW] [--copy-catalog /absolute/catalog.json] [--resolutions /absolute/place-resolutions.json] [--no-install]");
  });

  test.each(["prepared", "committed", "malformed"])("handles a %s Create file-set journal before dependency reads", async state => {
    const outDir = stagedRoot(`staged-oak-journal-${state}`);
    let composed = "";
    const run = stageStarterConsumer({ outDir, install: false, setupLocale: "zh-Hant-TW" }, {
      afterStarterComposed({ candidate }) {
        composed = candidate;
        if (state === "malformed") {
          ownedPath(dirname(candidate));
          writeFileSync(join(candidate, ".laugh-tale-transaction-malformed"), "{broken");
          return;
        }
        const module = pathToFileURL(join(repoRoot, "plugins/eternal-pose/lib/atomic-publication.mjs")).href;
        const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
          import { readFile } from 'node:fs/promises';
          import { replaceProjectFiles } from ${JSON.stringify(module)};
          const projectDir = ${JSON.stringify(candidate)};
          const names = ['eternal-pose.json', 'src/trip-content/place-resolutions.json'];
          const replacements = new Map(await Promise.all(names.map(async name => [name, await readFile(projectDir + '/' + name)])));
          await replaceProjectFiles({ projectDir, replacements, allowedPaths: new Set(names), validate: async () => {} }, { beforeMutation({phase}) { if (phase === ${JSON.stringify(state === "prepared" ? "file-set-validate" : "cleanup")}) process.kill(process.pid, 'SIGKILL'); } });
        `], { encoding: "utf8" });
        expect(result.signal).toBe("SIGKILL");
      },
      onCommand() { if (state === "malformed") throw new Error("must refuse journal before packing"); },
    });
    if (state === "malformed") {
      await expect(run).rejects.toThrow(/transaction|record|recover/);
      expect(existsSync(outDir)).toBe(false);
      expect(composed).not.toBe("");
    } else {
      const result = await run; rememberPackRoots(result.tarballs);
      expect(JSON.parse(readFileSync(join(outDir, "eternal-pose.json"), "utf8"))).toMatchObject({ schemaVersion: 2 });
    }
  }, 120_000);

  test("refuses source tampering after attestation and before publication", async () => {
    const outDir = stagedRoot("staged-oak-final-source-mutation");
    await expect(stageStarterConsumer({ outDir, install: false, setupLocale: "zh-Hant-TW" }, {
      afterAttestationWrite({ candidate }) { writeFileSync(join(candidate, "src/app/App.tsx"), "changed after validation"); },
    })).rejects.toThrow(/source identity changed/);
    expect(existsSync(outDir)).toBe(false);
  }, 120_000);
  test.each(["compose", "build", "pack", "install", "rename"])("retains the previous Oak consumer when %s fails", async phase => {
    const outDir = stagedRoot(`staged-oak-${phase}-fault`);
    const initial = await stageStarterConsumer({ outDir, install: false, setupLocale: "zh-Hant-TW" });
    rememberPackRoots(initial.tarballs);
    const previous = readFileSync(join(outDir, "eternal-pose.json"));
    const marker = readFileSync(join(outDir, ownershipMarkerName));
    const fail = () => { throw new Error(`injected Oak ${phase} failure`); };
    await expect(stageStarterConsumer({ outDir, install: phase === "install", setupLocale: "zh-Hant-TW" }, {
      afterStarterComposed() { if (phase === "compose") fail(); },
      onCommand({ commandArguments }) {
        if ((phase === "build" && commandArguments.includes("build")) || commandArguments[0] === phase) fail();
      },
      beforeCandidateRename() { if (phase === "rename") fail(); },
    })).rejects.toThrow(`injected Oak ${phase} failure`);
    expect(readFileSync(join(outDir, "eternal-pose.json"))).toEqual(previous);
    expect(readFileSync(join(outDir, ownershipMarkerName))).toEqual(marker);
  }, 120_000);
  test("refuses generated script tampering after dependency rewrite", async () => {
    const outDir = stagedRoot("staged-oak-script-mutation");
    await expect(stageStarterConsumer({ outDir, install: false, setupLocale: "zh-Hant-TW" }, {
      afterAttestationWrite({ candidate }) {
        const path = join(candidate, "package.json");
        const manifest = JSON.parse(readFileSync(path, "utf8")) as { scripts: Record<string, string> };
        manifest.scripts["test:experience"] = "echo bypassed";
        writeFileSync(path, JSON.stringify(manifest));
      },
    })).rejects.toThrow(/package identity changed/);
    expect(existsSync(outDir)).toBe(false);
  }, 120_000);

  test("rejects a retired staging recipe before packaging", async () => {
    const outDir = stagedRoot("staged-valid-recipe-test");
    const catalog = validSingleRecipeCatalog();
    const { commands, testOperations } = observeCommands();
    await expect(stageStarterConsumer(
      {
        install: false,
        outDir,
        recipe: "valid",
        recipeCatalogRoot: catalog,
      },
      testOperations,
    )).rejects.toThrow("only oak-washi is supported");
    expect(existsSync(outDir)).toBe(false);
    expect(commands).toEqual([]);
  }, 120_000);

  test("rejects composition before mutating package-build output", async () => {
    const outDir = stagedRoot("staged-unknown-recipe-test");
    const catalog = validSingleRecipeCatalog();
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
          recipeCatalogRoot: catalog,
        },
        testOperations,
      ),
    ).rejects.toThrow("only oak-washi is supported");

    expect(readFileSync(sentinel, "utf8")).toBe("keep\n");
    expect(existsSync(outDir)).toBe(false);
    expect(commands).toEqual([]);
  }, 120_000);

  test("rejects every unsafe staging target without changing its sentinel", async () => {
    mkdirSync(repositoryTmpRoot, { recursive: true });
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
    mkdirSync(repositoryTmpRoot, { recursive: true });
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

  test("refuses publication when the referenced testing tarball is no longer invocation-owned", async () => {
    const outDir = stagedRoot("staged-missing-testing-tarball-test");
    const initial = await stageStarterConsumer({ install: false, outDir });
    rememberPackRoots(initial.tarballs);
    const priorManifest = readFileSync(join(outDir, "package.json"));
    const priorMarker = readFileSync(join(outDir, ownershipMarkerName));
    const priorSentinel = join(outDir, "prior-consumer-must-survive.txt");
    writeFileSync(priorSentinel, "prior consumer remains authoritative\n");
    let removedTarball: string | undefined;

    await expect(
      stageStarterConsumer(
        { install: false, outDir },
        {
          onCommandComplete: ({ command, commandArguments, cwd, status }) => {
            if (
              command !== "npm" ||
              commandArguments[0] !== "pack" ||
              cwd !== join(repoRoot, "packages/testing") ||
              status !== 0
            ) {
              return;
            }
            const destinationIndex = commandArguments.indexOf("--pack-destination");
            if (destinationIndex < 0 || commandArguments[destinationIndex + 1] === undefined) {
              throw new Error("testing pack destination was not observable");
            }
            removedTarball = join(
              commandArguments[destinationIndex + 1],
              `laugh-tale-island-testing-${packageVersion}.tgz`,
            );
            unlinkSync(removedTarball);
          },
        },
      ),
    ).rejects.toThrow(/testing.*tarball|tarball.*testing|packed tarball/i);

    expect(removedTarball).toBeDefined();
    expect(readFileSync(join(outDir, "package.json"))).toEqual(priorManifest);
    expect(readFileSync(join(outDir, ownershipMarkerName))).toEqual(priorMarker);
    expect(readFileSync(priorSentinel, "utf8")).toBe(
      "prior consumer remains authoritative\n",
    );
    expect(existsSync(packageLockRoot)).toBe(false);
  }, 180_000);

  test.each([
    ["package name", "name", "@laugh-tale-island/not-core"],
    ["package version", "version", "2.0.1"],
    ["integrity", "integrity", "sha512-AAAAAAAA"],
  ] as const)(
    "rejects a core npm-pack report with the wrong %s",
    async (_label, field, replacement) => {
      const outDir = stagedRoot(`staged-invalid-pack-report-${field}`);
      const { commands, testOperations } = observeCommands();

      await expect(
        stageStarterConsumer(
          { install: false, outDir },
          {
            ...testOperations,
            transformCommandOutput: ({ command, commandArguments, cwd, stdout }) => {
              if (
                command !== "npm" ||
                commandArguments[0] !== "pack" ||
                cwd !== join(repoRoot, "packages/core")
              ) {
                return stdout;
              }
              const reports = JSON.parse(stdout) as Array<Record<string, unknown>>;
              reports[0][field] = replacement;
              const destinationIndex = commandArguments.indexOf("--pack-destination");
              if (destinationIndex >= 0 && commandArguments[destinationIndex + 1] !== undefined) {
                ownedPackRoots.push(commandArguments[destinationIndex + 1]);
              }
              return JSON.stringify(reports);
            },
          },
        ),
      ).rejects.toThrow(/npm pack reported|integrity|package version|artifact/i);

      expect(commands.map(({ cwd }) => cwd)).toEqual([
        join(repoRoot, "packages/core"),
        join(repoRoot, "packages/core"),
      ]);
      expect(existsSync(outDir)).toBe(false);
    },
    120_000,
  );

  test.each(["byte-swap", "duplicate-hardlink"] as const)(
    "rejects a %s across core and React artifacts and preserves the prior consumer",
    async (mutation) => {
      const outDir = stagedRoot(`staged-pack-${mutation}-test`);
      const initial = await stageStarterConsumer({ install: false, outDir });
      rememberPackRoots(initial.tarballs);
      const priorManifest = readFileSync(join(outDir, "package.json"));
      const priorMarker = readFileSync(join(outDir, ownershipMarkerName));
      const sentinel = join(outDir, "prior-pack-identity-sentinel.txt");
      writeFileSync(sentinel, "prior consumer remains authoritative\n");
      let mutated = false;

      await expect(
        stageStarterConsumer(
          { install: false, outDir },
          {
            onCommandComplete: ({ command, commandArguments, cwd, status }) => {
              if (
                mutated ||
                command !== "npm" ||
                commandArguments[0] !== "pack" ||
                cwd !== join(repoRoot, "packages/react") ||
                status !== 0
              ) {
                return;
              }
              const destinationIndex = commandArguments.indexOf("--pack-destination");
              const destination = commandArguments[destinationIndex + 1];
              if (destination === undefined) throw new Error("missing observed pack destination");
              const core = join(destination, `laugh-tale-island-core-${packageVersion}.tgz`);
              const react = join(destination, `laugh-tale-island-react-${packageVersion}.tgz`);
              rememberPackRoots([core, react]);
              if (mutation === "byte-swap") {
                const coreBytes = readFileSync(core);
                const reactBytes = readFileSync(react);
                writeFileSync(core, reactBytes);
                writeFileSync(react, coreBytes);
              } else {
                unlinkSync(react);
                linkSync(core, react);
              }
              mutated = true;
            },
          },
        ),
      ).rejects.toThrow(/tarball|artifact|integrity|identity|distinct|staging failed/i);

      expect(mutated).toBe(true);
      expect(readFileSync(join(outDir, "package.json"))).toEqual(priorManifest);
      expect(readFileSync(join(outDir, ownershipMarkerName))).toEqual(priorMarker);
      expect(readFileSync(sentinel, "utf8")).toBe("prior consumer remains authoritative\n");
    },
    180_000,
  );

  test.each(["in-place", "rename-replacement", "symlink-replacement"] as const)(
    "revalidates an %s tarball mutation after the publication hook and rolls back exactly",
    async (mutation) => {
      const outDir = stagedRoot(`staged-pack-late-${mutation}-test`);
      const initial = await stageStarterConsumer({ install: false, outDir });
      rememberPackRoots(initial.tarballs);
      const priorManifest = readFileSync(join(outDir, "package.json"));
      const priorMarker = readFileSync(join(outDir, ownershipMarkerName));
      const sentinel = join(outDir, "late-pack-mutation-sentinel.txt");
      writeFileSync(sentinel, "prior consumer remains authoritative\n");
      let mutatedPath: string | undefined;
      let originalPath: string | undefined;

      await expect(
        stageStarterConsumer(
          { install: false, outDir },
          {
            beforeCandidateRename: ({ candidate }) => {
              const tarballs = manifestTarballs(candidate);
              rememberPackRoots(tarballs);
              mutatedPath = tarballs[0];
              if (mutation === "in-place") {
                writeFileSync(mutatedPath, Buffer.concat([
                  readFileSync(mutatedPath),
                  Buffer.from("in-place foreign suffix\n"),
                ]));
                return;
              }
              originalPath = `${mutatedPath}.original`;
              renameSync(mutatedPath, originalPath);
              if (mutation === "rename-replacement") {
                writeFileSync(mutatedPath, "foreign replacement tarball bytes\n");
              } else {
                symlinkSync(originalPath, mutatedPath);
              }
            },
          },
        ),
      ).rejects.toThrow(/tarball|artifact|integrity|identity|staging failed/i);

      expect(mutatedPath).toBeDefined();
      if (mutation === "symlink-replacement") {
        expect(lstatSync(mutatedPath!).isSymbolicLink()).toBe(true);
      } else if (mutation === "rename-replacement") {
        expect(readFileSync(mutatedPath!, "utf8")).toBe("foreign replacement tarball bytes\n");
      }
      if (originalPath !== undefined) expect(existsSync(originalPath)).toBe(true);
      expect(readFileSync(join(outDir, "package.json"))).toEqual(priorManifest);
      expect(readFileSync(join(outDir, ownershipMarkerName))).toEqual(priorMarker);
      expect(readFileSync(sentinel, "utf8")).toBe("prior consumer remains authoritative\n");
    },
    180_000,
  );

  test("publishes a fresh tarball inode when a retained core fd is written after core validation", async () => {
    const outDir = stagedRoot("staged-pack-retained-fd-barrier-test");
    const initial = await stageStarterConsumer({ install: false, outDir });
    rememberPackRoots(initial.tarballs);
    let retainedFd: number | undefined;
    let retainedIdentity: { dev: string; ino: string } | undefined;
    let originalBytes: Buffer | undefined;
    let candidateCore: string | undefined;
    let mutated = false;

    try {
      const refreshed = await stageStarterConsumer(
        { install: false, outDir },
        {
          beforeCandidateRename: ({ candidate }) => {
            const tarballs = manifestTarballs(candidate);
            rememberPackRoots(tarballs);
            candidateCore = tarballs[0];
            originalBytes = readFileSync(candidateCore);
            retainedIdentity = pathIdentity(candidateCore);
            retainedFd = openSync(candidateCore, "r+");
          },
          afterCandidateTarballValidated: ({ index, packageName, path }) => {
            if (mutated || index !== 0) return;
            expect(packageName).toBe("@laugh-tale-island/core");
            expect(path).toBe(candidateCore);
            if (retainedFd === undefined || originalBytes === undefined) {
              throw new Error("core tarball fd was not retained before validation");
            }
            writeSync(retainedFd, Buffer.alloc(originalBytes.byteLength, 0x78), 0, originalBytes.byteLength, 0);
            mutated = true;
          },
        },
      );
      rememberPackRoots(refreshed.tarballs);

      expect(mutated).toBe(true);
      expect(candidateCore).toBeDefined();
      expect(retainedIdentity).toBeDefined();
      expect(pathIdentity(candidateCore!)).not.toEqual(retainedIdentity);
      expect(readFileSync(candidateCore!)).toEqual(originalBytes);
      expectWorkspaceTarballs(refreshed.stagedRoot, refreshed.tarballs);
    } finally {
      if (retainedFd !== undefined) closeSync(retainedFd);
    }
  }, 180_000);

  test.each(["same-inode-post-read", "symlink-aba"] as const)(
    "rejects a %s tarball mutation inside the final read barrier and rolls back exactly",
    async (mutation) => {
      const outDir = stagedRoot(`staged-pack-final-read-${mutation}-test`);
      const initial = await stageStarterConsumer({ install: false, outDir });
      rememberPackRoots(initial.tarballs);
      const priorManifest = readFileSync(join(outDir, "package.json"));
      const priorMarker = readFileSync(join(outDir, ownershipMarkerName));
      const sentinel = join(outDir, "final-read-mutation-sentinel.txt");
      writeFileSync(sentinel, "prior consumer remains authoritative\n");
      let candidateValidationStarted = false;
      let corePath: string | undefined;
      let retainedFd: number | undefined;
      let originalBytes: Buffer | undefined;
      let backupPath: string | undefined;
      let candidateWorkRoot: string | undefined;
      let mutated = false;

      try {
        await expect(
          stageStarterConsumer(
            { install: false, outDir },
            {
              beforeCandidateRename: ({ candidate }) => {
                candidateWorkRoot = dirname(candidate);
                const tarballs = manifestTarballs(candidate);
                rememberPackRoots(tarballs);
                corePath = tarballs[0];
                originalBytes = readFileSync(corePath);
                retainedFd = openSync(corePath, "r+");
                candidateValidationStarted = true;
              },
              afterTarballRead: ({ packageName, path, phase }) => {
                if (
                  mutated ||
                  !candidateValidationStarted ||
                  phase !== "candidate" ||
                  packageName !== "@laugh-tale-island/core"
                ) {
                  return;
                }
                expect(path).toBe(corePath);
                if (retainedFd === undefined || originalBytes === undefined || corePath === undefined) {
                  throw new Error("core tarball fd was not retained before the final read");
                }
                const foreignBytes = Buffer.alloc(originalBytes.byteLength, 0x79);
                if (mutation === "symlink-aba") {
                  backupPath = `${corePath}.aba-original`;
                  renameSync(corePath, backupPath);
                  symlinkSync(backupPath, corePath);
                  writeSync(retainedFd, foreignBytes, 0, foreignBytes.byteLength, 0);
                  unlinkSync(corePath);
                  renameSync(backupPath, corePath);
                } else {
                  writeSync(retainedFd, foreignBytes, 0, foreignBytes.byteLength, 0);
                }
                mutated = true;
              },
            },
          ),
        ).rejects.toThrow(/tarball|artifact|integrity|changed|staging failed/i);
      } finally {
        if (retainedFd !== undefined) closeSync(retainedFd);
      }

      expect(mutated).toBe(true);
      expect(backupPath === undefined || !existsSync(backupPath)).toBe(true);
      expect(candidateWorkRoot).toBeDefined();
      expect(existsSync(candidateWorkRoot!)).toBe(false);
      expect(readFileSync(join(outDir, "package.json"))).toEqual(priorManifest);
      expect(readFileSync(join(outDir, ownershipMarkerName))).toEqual(priorMarker);
      expect(readFileSync(sentinel, "utf8")).toBe("prior consumer remains authoritative\n");
    },
    180_000,
  );

  test("preserves a replaced private freeze file and rolls the prior consumer back", async () => {
    const outDir = stagedRoot("staged-pack-replaced-freeze-pending-test");
    const initial = await stageStarterConsumer({ install: false, outDir });
    rememberPackRoots(initial.tarballs);
    const priorManifest = readFileSync(join(outDir, "package.json"));
    const priorMarker = readFileSync(join(outDir, ownershipMarkerName));
    const sentinel = join(outDir, "freeze-pending-sentinel.txt");
    writeFileSync(sentinel, "prior consumer remains authoritative\n");
    let replacedPending: string | undefined;
    let preservedOriginal: string | undefined;

    await expect(
      stageStarterConsumer(
        { install: false, outDir },
        {
          beforeCandidateRename: ({ candidate }) => {
            ownedPath(dirname(candidate));
            rememberPackRoots(manifestTarballs(candidate));
          },
          afterCandidateTarballValidated: ({ index, path }) => {
            if (index !== 0 || replacedPending !== undefined) return;
            const root = dirname(path);
            const pendingName = readdirSync(root).find(
              (name) => name.includes(".freeze-") && name.endsWith(".pending"),
            );
            if (pendingName === undefined) throw new Error("private core freeze file was not observable");
            replacedPending = join(root, pendingName);
            preservedOriginal = `${replacedPending}.captured-original`;
            renameSync(replacedPending, preservedOriginal);
            writeFileSync(replacedPending, "foreign pending replacement must survive\n");
            throw new Error("injected private freeze replacement failure");
          },
        },
      ),
    ).rejects.toThrow(/freeze|pending|cleanup|staging failed/i);

    expect(replacedPending).toBeDefined();
    expect(readFileSync(replacedPending!, "utf8")).toBe(
      "foreign pending replacement must survive\n",
    );
    expect(preservedOriginal).toBeDefined();
    expect(existsSync(preservedOriginal!)).toBe(true);
    expect(readFileSync(join(outDir, "package.json"))).toEqual(priorManifest);
    expect(readFileSync(join(outDir, ownershipMarkerName))).toEqual(priorMarker);
    expect(readFileSync(sentinel, "utf8")).toBe("prior consumer remains authoritative\n");
  }, 180_000);

  test("aborts before the final pack-marker commit and restores the prior consumer", async () => {
    const outDir = stagedRoot("staged-pack-final-marker-failure-test");
    const initial = await stageStarterConsumer({ install: false, outDir });
    rememberPackRoots(initial.tarballs);
    const priorManifest = readFileSync(join(outDir, "package.json"));
    const priorMarker = readFileSync(join(outDir, ownershipMarkerName));
    const sentinel = join(outDir, "final-marker-failure-sentinel.txt");
    writeFileSync(sentinel, "prior consumer remains authoritative\n");
    let candidatePackRoot: string | undefined;
    let packMarkerBefore: Buffer | undefined;
    let hookCalled = false;

    await expect(
      stageStarterConsumer(
        { install: false, outDir },
        {
          beforeCandidateRename: ({ candidate }) => {
            ownedPath(dirname(candidate));
            const tarballs = manifestTarballs(candidate);
            rememberPackRoots(tarballs);
            candidatePackRoot = dirname(tarballs[0]);
            packMarkerBefore = readFileSync(
              join(candidatePackRoot, ".laugh-tale-staging-owner.json"),
            );
          },
          beforeFinalPackMarkerUpdate: ({ artifacts, packRoot: observedPackRoot }) => {
            hookCalled = true;
            expect(observedPackRoot).toBe(candidatePackRoot);
            expect(artifacts).toHaveLength(4);
            expect(
              readFileSync(join(observedPackRoot, ".laugh-tale-staging-owner.json")),
            ).toEqual(packMarkerBefore);
            throw new Error("injected final pack marker publication failure");
          },
        },
      ),
    ).rejects.toThrow(/marker publication failure|staging failed/i);

    expect(hookCalled).toBe(true);
    expect(candidatePackRoot).toBeDefined();
    expect(existsSync(candidatePackRoot!)).toBe(false);
    expect(readFileSync(join(outDir, "package.json"))).toEqual(priorManifest);
    expect(readFileSync(join(outDir, ownershipMarkerName))).toEqual(priorMarker);
    expect(readFileSync(sentinel, "utf8")).toBe("prior consumer remains authoritative\n");
  }, 180_000);

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
    expect(
      new Set(
        [...first.tarballs, ...second.tarballs].map((tarball) => {
          const stat = lstatSync(tarball);
          return `${stat.dev}:${stat.ino}`;
        }),
      ).size,
    ).toBe(8);
  }, 120_000);

  test("rejects npm-effective internal overrides before packing and preserves the prior consumer", async () => {
    const outDir = stagedRoot("staged-forbidden-section-test");
    const initial = await stageStarterConsumer({ install: false, outDir });
    rememberPackRoots(initial.tarballs);
    const priorManifest = readFileSync(join(outDir, "package.json"));
    const priorMarker = readFileSync(join(outDir, ownershipMarkerName));
    const sentinel = join(outDir, "prior-section-sentinel.txt");
    writeFileSync(sentinel, "prior consumer remains authoritative\n");
    const { commands, testOperations } = observeCommands();

    await expect(
      stageStarterConsumer(
        { install: false, outDir },
        {
          ...testOperations,
          afterStarterComposed: ({ candidate }) => {
            const manifestPath = join(candidate, "package.json");
            const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
              string,
              unknown
            >;
            manifest.optionalDependencies = {
              "@laugh-tale-island/core": "file:../hostile-core.tgz",
            };
            manifest.peerDependencies = {
              "@laugh-tale-island/testing": packageVersion,
            };
            writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
          },
        },
      ),
    ).rejects.toThrow(/optionalDependencies|peerDependencies|forbidden dependency section/i);

    expect(commands).toEqual([]);
    expect(readFileSync(join(outDir, "package.json"))).toEqual(priorManifest);
    expect(readFileSync(join(outDir, ownershipMarkerName))).toEqual(priorMarker);
    expect(readFileSync(sentinel, "utf8")).toBe("prior consumer remains authoritative\n");
  }, 120_000);

  test("bounds an active package lock wait without mutating its owner", async () => {
    const outDir = stagedRoot("staged-active-lock-timeout-test");
    ownedPath(packageLockRoot);
    mkdirSync(repositoryTmpRoot, { recursive: true });
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
    mkdirSync(repositoryTmpRoot, { recursive: true });
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

  test("rejects a symlinked package-lock owner without following or changing it", async () => {
    const outDir = stagedRoot("staged-symlink-lock-owner-test");
    ownedPath(packageLockRoot);
    const foreignOwner = ownedPath(join(repositoryTmpRoot, ".foreign-package-owner.json"));
    mkdirSync(repositoryTmpRoot, { recursive: true });
    mkdirSync(packageLockRoot);
    const source = `${JSON.stringify({
      kind: "laugh-tale-package-build-lock",
      version: 1,
      token: "foreign-symlink-owner",
      pid: process.pid,
      createdAt: Date.now(),
    })}\n`;
    writeFileSync(foreignOwner, source);
    symlinkSync(foreignOwner, lockOwnerPath);
    const { commands, testOperations } = observeCommands();

    await expect(
      stageStarterConsumer(
        { install: false, outDir },
        { ...testOperations, lockTimeoutMs: 25, lockPollMs: 5 },
      ),
    ).rejects.toThrow(/ownership marker must be a real file|symbolic link/i);

    expect(lstatSync(lockOwnerPath).isSymbolicLink()).toBe(true);
    expect(readFileSync(foreignOwner, "utf8")).toBe(source);
    expect(commands).toEqual([]);
  });

  test.each([
    ["package", "beforeLockOwnerPublish"],
    ["artifact", "beforeLockOwnerPublish"],
    ["package", "beforeLockOwnerCommit"],
    ["artifact", "beforeLockOwnerCommit"],
  ] as const)(
    "preserves the live %s canonical lock after stale initializer takeover at %s",
    async (lockKind, pauseHook) => {
      const canonical = ownedPath(lockKind === "package" ? packageLockRoot : artifactLockRoot);
      const ownerPath = join(canonical, "owner.json");
      const deferred = () => {
        let resolve!: () => void;
        const promise = new Promise<void>((done) => { resolve = done; });
        return { promise, resolve };
      };
      const pausedA = deferred();
      const resumeA = deferred();
      const pausedB = deferred();
      const resumeB = deferred();
      const initialEntries = new Set(readdirSync(repositoryTmpRoot));
      let contenderEntered = false;
      let initializerPublished = false;
      let invocation = 0;
      const run = (operations: NonNullable<Parameters<typeof stageStarterConsumer>[1]>) => {
        const bounded = {
          lockTimeoutMs: 50, lockPollMs: 1,
          artifactLockTimeoutMs: 50, artifactLockPollMs: 1,
          ...operations,
        };
        return (lockKind === "artifact"
          ? reclaimOrphanedStagingArtifacts(bounded)
          : stageStarterConsumer({ install: false, outDir: stagedRoot(`staged-takeover-${pauseHook}-${invocation++}`) }, bounded)
        ).then(() => undefined, (error: unknown) => error);
      };
      const a = run({
        afterLockOwnerPublish: (context) => {
          if (context.lockKind === lockKind) initializerPublished = true;
        },
        [pauseHook]: async (context: { lockKind: string; pendingOwnerPath: string }) => {
          if (context.lockKind !== lockKind) return;
          ownedPath(context.pendingOwnerPath);
          pausedA.resolve();
          await resumeA.promise;
          if (pauseHook === "beforeLockOwnerPublish") throw new Error("paused initializer failed");
        },
      });
      let b: Promise<unknown> | undefined;
      try {
        await Promise.race([pausedA.promise, a.then((error) => { throw error; })]);
        // Old initializers exposed this empty directory. The new protocol also
        // accepts such a legacy orphan while its own preparation stays private.
        if (!existsSync(canonical)) mkdirSync(canonical);
        const staleTime = new Date(Date.now() - 600_000);
        utimesSync(canonical, staleTime, staleTime);
        b = run({
          lockTimeoutMs: 5_000,
          artifactLockTimeoutMs: 5_000,
          afterLockOwnerPublish: async (context) => {
            if (context.lockKind !== lockKind) return;
            pausedB.resolve();
            await resumeB.promise;
            throw new Error("held owner stopped before work");
          },
        });
        await Promise.race([pausedB.promise, b.then((error) => { throw error; })]);
        const heldDirectory = pathIdentity(canonical);
        const heldOwner = pathIdentity(ownerPath);
        const heldSource = readFileSync(ownerPath);
        resumeA.resolve();
        expect(await a).toBeInstanceOf(Error);
        expect(initializerPublished).toBe(false);
        expect(existsSync(canonical)).toBe(true);
        expect(pathIdentity(canonical)).toEqual(heldDirectory);
        expect(pathIdentity(ownerPath)).toEqual(heldOwner);
        expect(readFileSync(ownerPath)).toEqual(heldSource);
        const c = await run({
          afterLockOwnerPublish: (context) => {
            if (context.lockKind !== lockKind) return;
            contenderEntered = true;
            throw new Error("contender incorrectly entered");
          },
        });
        expect(c).toBeInstanceOf(Error);
        expect(String(c)).toMatch(/timed out/);
        expect(contenderEntered).toBe(false);
        expect(readFileSync(ownerPath)).toEqual(heldSource);
      } finally {
        resumeA.resolve();
        resumeB.resolve();
        await a;
        await b;
        for (const entry of readdirSync(repositoryTmpRoot)) {
          if (!initialEntries.has(entry) && entry.startsWith(`.stage-starter-${lockKind}.`)) {
            ownedPath(join(repositoryTmpRoot, entry));
          }
        }
      }
    },
    120_000,
  );

  test.each(["package", "artifact"] as const)(
    "preserves a fresh legacy empty %s lock until the stale grace expires",
    async (lockKind) => {
      const canonical = ownedPath(lockKind === "package" ? packageLockRoot : artifactLockRoot);
      mkdirSync(canonical);
      const identity = pathIdentity(canonical);
      const operations = {
        lockTimeoutMs: 25, lockPollMs: 1,
        artifactLockTimeoutMs: 25, artifactLockPollMs: 1,
      };
      await expect(lockKind === "artifact"
        ? reclaimOrphanedStagingArtifacts(operations)
        : stageStarterConsumer({ install: false, outDir: stagedRoot("staged-fresh-legacy-lock-test") }, operations),
      ).rejects.toThrow(/timed out/);
      expect(pathIdentity(canonical)).toEqual(identity);
      expect(readdirSync(canonical)).toEqual([]);
    },
  );

  test.each([
    ["package", "beforeLockOwnerPublish", packageLockRoot],
    ["artifact", "beforeLockOwnerPublish", artifactLockRoot],
    ["package", "afterLockOwnerPublish", packageLockRoot],
    ["artifact", "afterLockOwnerPublish", artifactLockRoot],
  ] as const)(
    "cleans a %s lock after a caught %s hook exception without pending state becoming authoritative",
    async (lockKind, hookName, canonicalLockRoot) => {
      ownedPath(canonicalLockRoot);
      const outDir = stagedRoot(`staged-${lockKind}-${hookName}-exception-test`);
      let pendingOwnerPath: string | undefined;
      const hook = (context: {
        lockKind: "artifact" | "package";
        lockRoot: string;
        pendingOwnerPath: string;
      }): void => {
        if (context.lockKind !== lockKind || pendingOwnerPath !== undefined) return;
        pendingOwnerPath = ownedPath(context.pendingOwnerPath);
        expect(context.lockRoot).toBe(canonicalLockRoot);
        expect(existsSync(canonicalLockRoot)).toBe(hookName === "afterLockOwnerPublish");
        if (hookName === "afterLockOwnerPublish") {
          expect(readdirSync(canonicalLockRoot)).toEqual(["owner.json"]);
        }
        expect(existsSync(context.pendingOwnerPath)).toBe(
          hookName === "beforeLockOwnerPublish",
        );
        throw new Error(`injected ${hookName} exception`);
      };
      const operations = { [hookName]: hook };

      if (lockKind === "artifact") {
        await expect(reclaimOrphanedStagingArtifacts(operations)).rejects.toThrow(
          new RegExp(`injected ${hookName} exception`),
        );
      } else {
        await expect(
          stageStarterConsumer({ install: false, outDir }, operations),
        ).rejects.toThrow(new RegExp(`injected ${hookName} exception`));
      }

      expect(pendingOwnerPath).toBeDefined();
      expect(existsSync(canonicalLockRoot)).toBe(false);
      expect(existsSync(pendingOwnerPath!)).toBe(false);
    },
    120_000,
  );

  test.each(["package", "artifact"] as const)(
    "publishes a %s owner without leaving the old pending path as a writable alias",
    async (lockKind) => {
      const outDir = stagedRoot(`staged-${lockKind}-pending-alias-test`);
      ownedPath(lockKind === "package" ? packageLockRoot : artifactLockRoot);
      let pendingOwnerPath: string | undefined;
      let foreignSource: Buffer | undefined;
      const afterLockOwnerPublish = (context: {
        lockKind: "artifact" | "package";
        lockRoot: string;
        pendingOwnerPath: string;
      }): void => {
        if (context.lockKind !== lockKind || pendingOwnerPath !== undefined) return;
        pendingOwnerPath = ownedPath(context.pendingOwnerPath);
        const canonicalOwner = join(context.lockRoot, "owner.json");
        const canonicalSource = readFileSync(canonicalOwner);
        foreignSource = Buffer.alloc(canonicalSource.byteLength, 0x78);
        mkdirSync(ownedPath(dirname(context.pendingOwnerPath)), { recursive: true });
        writeFileSync(context.pendingOwnerPath, foreignSource);
        expect(readFileSync(canonicalOwner)).toEqual(canonicalSource);
        expect(pathIdentity(context.pendingOwnerPath)).not.toEqual(pathIdentity(canonicalOwner));
      };

      if (lockKind === "artifact") {
        await reclaimOrphanedStagingArtifacts({ afterLockOwnerPublish });
      } else {
        const result = await stageStarterConsumer(
          { install: false, outDir },
          { afterLockOwnerPublish },
        );
        rememberPackRoots(result.tarballs);
      }

      expect(pendingOwnerPath).toBeDefined();
      expect(foreignSource).toBeDefined();
      expect(readFileSync(pendingOwnerPath!)).toEqual(foreignSource);
      expect(existsSync(lockKind === "package" ? packageLockRoot : artifactLockRoot)).toBe(false);
    },
    120_000,
  );

  test.each([
    ["package", "symlink"],
    ["package", "directory"],
    ["artifact", "symlink"],
    ["artifact", "directory"],
  ] as const)(
    "preserves a foreign %s %s pending path without wedging the published lock",
    async (lockKind, replacementKind) => {
      const outDir = stagedRoot(
        `staged-${lockKind}-${replacementKind}-pending-replacement-test`,
      );
      ownedPath(lockKind === "package" ? packageLockRoot : artifactLockRoot);
      let pendingOwnerPath: string | undefined;
      let foreignTarget: string | undefined;
      const afterLockOwnerPublish = (context: {
        lockKind: "artifact" | "package";
        pendingOwnerPath: string;
      }): void => {
        if (context.lockKind !== lockKind || pendingOwnerPath !== undefined) return;
        pendingOwnerPath = ownedPath(context.pendingOwnerPath);
        if (existsSync(context.pendingOwnerPath)) unlinkSync(context.pendingOwnerPath);
        mkdirSync(ownedPath(dirname(context.pendingOwnerPath)), { recursive: true });
        if (replacementKind === "directory") {
          mkdirSync(context.pendingOwnerPath);
          return;
        }
        foreignTarget = ownedPath(`${context.pendingOwnerPath}.foreign`);
        writeFileSync(foreignTarget, `foreign pending target for ${lockKind}\n`);
        symlinkSync(foreignTarget, context.pendingOwnerPath);
      };

      if (lockKind === "artifact") {
        await reclaimOrphanedStagingArtifacts({ afterLockOwnerPublish });
      } else {
        const result = await stageStarterConsumer(
          { install: false, outDir },
          { afterLockOwnerPublish },
        );
        rememberPackRoots(result.tarballs);
      }

      expect(pendingOwnerPath).toBeDefined();
      const pendingStat = lstatSync(pendingOwnerPath!);
      expect(
        replacementKind === "directory"
          ? pendingStat.isDirectory()
          : pendingStat.isSymbolicLink(),
      ).toBe(true);
      if (foreignTarget !== undefined) {
        expect(readFileSync(foreignTarget, "utf8")).toBe(
          `foreign pending target for ${lockKind}\n`,
        );
      }
      expect(existsSync(lockKind === "package" ? packageLockRoot : artifactLockRoot)).toBe(false);
    },
    120_000,
  );

  test.each(["package", "artifact"] as const)(
    "preserves a replacement at the %s pending-owner path after canonical publication",
    async (lockKind) => {
      const outDir = stagedRoot(`staged-${lockKind}-pending-replacement-test`);
      const foreignSource = `foreign pending replacement for ${lockKind}\n`;
      let pendingOwnerPath: string | undefined;
      const afterLockOwnerPublish = (context: {
        lockKind: "artifact" | "package";
        pendingOwnerPath: string;
      }): void => {
        if (context.lockKind !== lockKind || pendingOwnerPath !== undefined) return;
        pendingOwnerPath = ownedPath(context.pendingOwnerPath);
        if (existsSync(context.pendingOwnerPath)) unlinkSync(context.pendingOwnerPath);
        mkdirSync(ownedPath(dirname(context.pendingOwnerPath)), { recursive: true });
        writeFileSync(context.pendingOwnerPath, foreignSource);
      };

      if (lockKind === "artifact") {
        await reclaimOrphanedStagingArtifacts({ afterLockOwnerPublish });
      } else {
        const result = await stageStarterConsumer(
          { install: false, outDir },
          { afterLockOwnerPublish },
        );
        rememberPackRoots(result.tarballs);
      }

      expect(pendingOwnerPath).toBeDefined();
      expect(readFileSync(pendingOwnerPath!, "utf8")).toBe(foreignSource);
    },
    120_000,
  );

  test("preserves a token-equal replacement when package-lock release loses owner identity", async () => {
    const outDir = stagedRoot("staged-package-release-owner-replacement-test");
    ownedPath(packageLockRoot);
    let replacementSource: string | undefined;

    await expect(
      stageStarterConsumer(
        { install: false, outDir },
        {
          beforePackageLockRelease: () => {
            const owner = JSON.parse(readFileSync(lockOwnerPath, "utf8")) as Record<
              string,
              unknown
            >;
            replacementSource = `${JSON.stringify({ ...owner, replacement: true })}\n`;
            unlinkSync(lockOwnerPath);
            writeFileSync(lockOwnerPath, replacementSource);
          },
        },
      ),
    ).rejects.toThrow(/package lock owner identity changed|ownership changed/i);

    expect(replacementSource).toBeDefined();
    expect(readFileSync(lockOwnerPath, "utf8")).toBe(replacementSource);
    expect(existsSync(outDir)).toBe(false);
  }, 120_000);

  test("preserves a token-equal replacement when dead package-lock retirement loses owner identity", async () => {
    const outDir = stagedRoot("staged-package-retire-owner-replacement-test");
    ownedPath(packageLockRoot);
    mkdirSync(repositoryTmpRoot, { recursive: true });
    mkdirSync(packageLockRoot);
    const original = {
      kind: "laugh-tale-package-build-lock",
      version: 1,
      token: "dead-lock-owner-replaced-during-retirement",
      pid: 424_242,
      createdAt: Date.now() - 2_000,
    };
    writeFileSync(lockOwnerPath, `${JSON.stringify(original)}\n`);
    const replacementSource = `${JSON.stringify({ ...original, replacement: true })}\n`;
    const { commands, testOperations } = observeCommands();

    await expect(
      stageStarterConsumer(
        { install: false, outDir },
        {
          ...testOperations,
          beforePackageLockRetire: () => {
            unlinkSync(lockOwnerPath);
            writeFileSync(lockOwnerPath, replacementSource);
          },
          lockDeadOwnerGraceMs: 0,
          lockPollMs: 1,
          isProcessAlive: () => false,
        },
      ),
    ).rejects.toThrow(/package lock owner identity changed|ownership changed/i);

    expect(readFileSync(lockOwnerPath, "utf8")).toBe(replacementSource);
    expect(commands).toEqual([]);
    expect(existsSync(outDir)).toBe(false);
  });

  test("preserves a package-lock owner mutated through a retained fd during release", async () => {
    const outDir = stagedRoot("staged-package-release-retained-fd-test");
    ownedPath(packageLockRoot);
    let ownerFd: number | undefined;
    let foreignSource: Buffer | undefined;
    let preservedRoot: string | undefined;
    let mutated = false;

    try {
      await expect(
        stageStarterConsumer(
          { install: false, outDir },
          {
            beforePackageLockRelease: () => {
              const source = readFileSync(lockOwnerPath);
              foreignSource = Buffer.alloc(source.byteLength, 0x78);
              ownerFd = openSync(lockOwnerPath, "r+");
            },
            afterLockOwnerValidated: ({ lockKind, reason, removalPath }) => {
              if (lockKind !== "package" || reason !== "release" || ownerFd === undefined) return;
              preservedRoot = ownedPath(removalPath);
              writeSync(ownerFd, foreignSource!, 0, foreignSource!.byteLength, 0);
              mutated = true;
            },
          },
        ),
      ).rejects.toThrow(/owner.*changed|ownership.*changed|retirement/i);
    } finally {
      if (ownerFd !== undefined) closeSync(ownerFd);
    }

    expect(mutated).toBe(true);
    expect(preservedRoot).toBeDefined();
    expect(readFileSync(join(preservedRoot!, "owner.json"))).toEqual(foreignSource);
    expect(existsSync(packageLockRoot)).toBe(false);
    expect(existsSync(outDir)).toBe(false);
  }, 120_000);

  test("preserves a dead package-lock owner mutated through a retained fd during retirement", async () => {
    const outDir = stagedRoot("staged-package-stale-retained-fd-test");
    ownedPath(packageLockRoot);
    mkdirSync(repositoryTmpRoot, { recursive: true });
    mkdirSync(packageLockRoot);
    const ownerSource = Buffer.from(`${JSON.stringify({
      kind: "laugh-tale-package-build-lock",
      version: 1,
      token: "dead-package-retained-fd",
      pid: 424_242,
      createdAt: Date.now() - 2_000,
    })}\n`);
    writeFileSync(lockOwnerPath, ownerSource);
    const foreignSource = Buffer.alloc(ownerSource.byteLength, 0x79);
    const ownerFd = openSync(lockOwnerPath, "r+");
    let preservedRoot: string | undefined;
    let mutated = false;

    try {
      await expect(
        stageStarterConsumer(
          { install: false, outDir },
          {
            afterLockOwnerValidated: ({ lockKind, reason, removalPath }) => {
              if (lockKind !== "package" || reason !== "stale") return;
              preservedRoot = ownedPath(removalPath);
              writeSync(ownerFd, foreignSource, 0, foreignSource.byteLength, 0);
              mutated = true;
            },
            lockDeadOwnerGraceMs: 0,
            lockPollMs: 1,
            isProcessAlive: () => false,
          },
        ),
      ).rejects.toThrow(/owner.*changed|ownership.*changed|retirement/i);
    } finally {
      closeSync(ownerFd);
    }

    expect(mutated).toBe(true);
    expect(preservedRoot).toBeDefined();
    expect(readFileSync(join(preservedRoot!, "owner.json"))).toEqual(foreignSource);
    expect(existsSync(packageLockRoot)).toBe(false);
    expect(existsSync(outDir)).toBe(false);
  }, 120_000);

  test("conservatively retires a token-verified lock whose owner is dead", async () => {
    const outDir = stagedRoot("staged-dead-lock-recovery-test");
    ownedPath(packageLockRoot);
    mkdirSync(repositoryTmpRoot, { recursive: true });
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

  test("bounds an active artifact lock without scanning or changing its owner", async () => {
    ownedPath(artifactLockRoot);
    mkdirSync(repositoryTmpRoot, { recursive: true });
    mkdirSync(artifactLockRoot);
    const owner = `${JSON.stringify({
      kind: "laugh-tale-artifact-cleanup-lock",
      version: 1,
      token: "active-artifact-owner",
      pid: process.pid,
      createdAt: Date.now(),
    })}\n`;
    writeFileSync(artifactLockOwnerPath, owner);

    await expect(
      reclaimOrphanedStagingArtifacts({
        artifactLockPollMs: 5,
        artifactLockTimeoutMs: 25,
        isProcessAlive: () => true,
      }),
    ).rejects.toThrow(/timed out after 25ms.*artifact cleanup lock/i);

    expect(readFileSync(artifactLockOwnerPath, "utf8")).toBe(owner);
  });

  test("does not observe partially published artifact lock owner metadata", async () => {
    ownedPath(artifactLockRoot);

    await Promise.all(
      Array.from({ length: 32 }, () =>
        reclaimOrphanedStagingArtifacts({
          artifactGraceMs: Number.MAX_SAFE_INTEGER,
          artifactLockPollMs: 1,
          artifactLockTimeoutMs: 5_000,
          isProcessAlive: () => true,
        }),
      ),
    );

    expect(existsSync(artifactLockRoot)).toBe(false);
  });

  test("rejects persistent malformed artifact lock ownership without changing it", async () => {
    ownedPath(artifactLockRoot);
    mkdirSync(repositoryTmpRoot, { recursive: true });
    mkdirSync(artifactLockRoot);
    writeFileSync(artifactLockOwnerPath, "{not valid json\n");

    await expect(
      reclaimOrphanedStagingArtifacts({
        artifactLockPollMs: 5,
        artifactLockTimeoutMs: 25,
      }),
    ).rejects.toThrow(/invalid ownership metadata/i);

    expect(readFileSync(artifactLockOwnerPath, "utf8")).toBe("{not valid json\n");
  });

  test("conservatively retires an exact artifact lock whose owner is dead", async () => {
    ownedPath(artifactLockRoot);
    mkdirSync(repositoryTmpRoot, { recursive: true });
    mkdirSync(artifactLockRoot);
    writeFileSync(
      artifactLockOwnerPath,
      `${JSON.stringify({
        kind: "laugh-tale-artifact-cleanup-lock",
        version: 1,
        token: "dead-artifact-owner",
        pid: 424_242,
        createdAt: Date.now() - 2_000,
      })}\n`,
    );

    await reclaimOrphanedStagingArtifacts({
      artifactLockDeadOwnerGraceMs: 0,
      artifactLockPollMs: 5,
      isProcessAlive: () => false,
    });

    expect(existsSync(artifactLockRoot)).toBe(false);
  });

  test("preserves an artifact-lock owner mutated through a retained fd during release", async () => {
    ownedPath(artifactLockRoot);
    let ownerFd: number | undefined;
    let foreignSource: Buffer | undefined;
    let preservedRoot: string | undefined;
    let mutated = false;

    try {
      await expect(
        reclaimOrphanedStagingArtifacts({
          beforeArtifactLockRelease: ({ phase }) => {
            if (phase !== "reclaim") return;
            const source = readFileSync(artifactLockOwnerPath);
            foreignSource = Buffer.alloc(source.byteLength, 0x78);
            ownerFd = openSync(artifactLockOwnerPath, "r+");
          },
          afterLockOwnerValidated: ({ lockKind, reason, removalPath }) => {
            if (lockKind !== "artifact" || reason !== "release" || ownerFd === undefined) return;
            preservedRoot = ownedPath(removalPath);
            writeSync(ownerFd, foreignSource!, 0, foreignSource!.byteLength, 0);
            mutated = true;
          },
        }),
      ).rejects.toThrow(/owner.*changed|ownership.*changed|retirement/i);
    } finally {
      if (ownerFd !== undefined) closeSync(ownerFd);
    }

    expect(mutated).toBe(true);
    expect(preservedRoot).toBeDefined();
    expect(readFileSync(join(preservedRoot!, "owner.json"))).toEqual(foreignSource);
    expect(existsSync(artifactLockRoot)).toBe(false);
  });

  test("preserves a dead artifact-lock owner mutated through a retained fd during retirement", async () => {
    ownedPath(artifactLockRoot);
    mkdirSync(repositoryTmpRoot, { recursive: true });
    mkdirSync(artifactLockRoot);
    const ownerSource = Buffer.from(`${JSON.stringify({
      kind: "laugh-tale-artifact-cleanup-lock",
      version: 1,
      token: "dead-artifact-retained-fd",
      pid: 424_242,
      createdAt: Date.now() - 2_000,
    })}\n`);
    writeFileSync(artifactLockOwnerPath, ownerSource);
    const foreignSource = Buffer.alloc(ownerSource.byteLength, 0x79);
    const ownerFd = openSync(artifactLockOwnerPath, "r+");
    let preservedRoot: string | undefined;
    let mutated = false;

    try {
      await expect(
        reclaimOrphanedStagingArtifacts({
          afterLockOwnerValidated: ({ lockKind, reason, removalPath }) => {
            if (lockKind !== "artifact" || reason !== "stale") return;
            preservedRoot = ownedPath(removalPath);
            writeSync(ownerFd, foreignSource, 0, foreignSource.byteLength, 0);
            mutated = true;
          },
          artifactLockDeadOwnerGraceMs: 0,
          artifactLockPollMs: 1,
          isProcessAlive: () => false,
        }),
      ).rejects.toThrow(/owner.*changed|ownership.*changed|retirement/i);
    } finally {
      closeSync(ownerFd);
    }

    expect(mutated).toBe(true);
    expect(preservedRoot).toBeDefined();
    expect(readFileSync(join(preservedRoot!, "owner.json"))).toEqual(foreignSource);
    expect(existsSync(artifactLockRoot)).toBe(false);
  });

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

  test("serializes artifact reclamation across the target publication gap", async () => {
    const outDir = stagedRoot("staged-reclaimer-publication-race-test");
    const initial = await stageStarterConsumer({ install: false, outDir });
    rememberPackRoots(initial.tarballs);
    let concurrentReclaim: Promise<unknown> | undefined;
    let reclaimSettled = false;

    const refreshed = await stageStarterConsumer(
      { install: false, outDir },
      {
        beforeCandidateRename: async () => {
          concurrentReclaim = reclaimOrphanedStagingArtifacts({ artifactGraceMs: 0 });
          void concurrentReclaim.then(
            () => {
              reclaimSettled = true;
            },
            () => {
              reclaimSettled = true;
            },
          );
          await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));
          expect(reclaimSettled).toBe(false);
        },
      },
    );
    rememberPackRoots(refreshed.tarballs);
    await concurrentReclaim;

    expectOwnedConsumer(outDir);
    for (const tarball of refreshed.tarballs) expect(existsSync(tarball)).toBe(true);
    expect(existsSync(dirname(initial.tarballs[0]))).toBe(false);
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

  test("reports artifact-lock release cleanup as committed publication success", async () => {
    const outDir = stagedRoot("staged-artifact-release-warning-test");
    const initial = await stageStarterConsumer({ install: false, outDir });
    rememberPackRoots(initial.tarballs);
    ownedPath(artifactLockRoot);
    const unknownLockEntry = join(artifactLockRoot, "unknown-release-sentinel.txt");

    const refreshed = await stageStarterConsumer(
      { install: false, outDir },
      {
        beforeCandidateRename: () => {
          writeFileSync(unknownLockEntry, "unknown lock bytes stay intact\n");
        },
      },
    );
    rememberPackRoots(refreshed.tarballs);

    expect(readConsumerMarker(outDir).invocation).toBe(readConsumerMarker(outDir).pack?.invocation);
    expect(existsSync(join(outDir, "package.json"))).toBe(true);
    expect(readFileSync(unknownLockEntry, "utf8")).toBe("unknown lock bytes stay intact\n");
    expect(refreshed.cleanupPending).toContain(artifactLockRoot);
    expect(refreshed.cleanupWarnings?.join("\n")).toMatch(
      /published consumer.*artifact-lock cleanup remains pending/i,
    );
  }, 120_000);

  test("reports changed artifact-lock ownership as committed publication success", async () => {
    const outDir = stagedRoot("staged-artifact-owner-warning-test");
    const initial = await stageStarterConsumer({ install: false, outDir });
    rememberPackRoots(initial.tarballs);
    ownedPath(artifactLockRoot);
    let changedOwnerSource: string | undefined;

    const refreshed = await stageStarterConsumer(
      { install: false, outDir },
      {
        beforeCandidateRename: () => {
          const owner = JSON.parse(readFileSync(artifactLockOwnerPath, "utf8")) as object;
          changedOwnerSource = `${JSON.stringify({ ...owner, changedByTest: true })}\n`;
          writeFileSync(artifactLockOwnerPath, changedOwnerSource);
        },
      },
    );
    rememberPackRoots(refreshed.tarballs);

    expect(readConsumerMarker(outDir).invocation).toBe(readConsumerMarker(outDir).pack?.invocation);
    expect(readFileSync(artifactLockOwnerPath, "utf8")).toBe(changedOwnerSource);
    expect(refreshed.cleanupPending).toContain(artifactLockRoot);
    expect(refreshed.cleanupWarnings?.join("\n")).toMatch(
      /published consumer.*artifact-lock cleanup remains pending/i,
    );
  }, 120_000);

  test("throws on artifact-lock release failure before publication", async () => {
    const outDir = stagedRoot("staged-artifact-prepublication-failure-test");
    let ownedWorkRoot: string | undefined;
    const unknownLockEntry = join(artifactLockRoot, "prepublication-unknown.txt");
    ownedPath(artifactLockRoot);

    await expect(
      stageStarterConsumer(
        { install: false, outDir },
        {
          artifactLockPollMs: 5,
          artifactLockTimeoutMs: 25,
          beforeArtifactLockRelease: ({ phase, workRoot }) => {
            if (phase !== "work-initialization") return;
            if (workRoot === undefined) throw new Error("missing owned work root context");
            ownedWorkRoot = ownedPath(workRoot);
            writeFileSync(unknownLockEntry, "prepublication lock bytes stay intact\n");
          },
        },
      ),
    ).rejects.toThrow(/artifact|owned cleanup/i);

    expect(existsSync(outDir)).toBe(false);
    expect(ownedWorkRoot).toBeDefined();
    expect(readFileSync(unknownLockEntry, "utf8")).toBe(
      "prepublication lock bytes stay intact\n",
    );
  });

  test("keeps the candidate pack when rollback must preserve unresolved work", async () => {
    const outDir = stagedRoot("staged-preserved-rollback-pack-test");
    const initial = await stageStarterConsumer({ install: false, outDir });
    rememberPackRoots(initial.tarballs);
    let preservedWorkRoot: string | undefined;
    let candidatePackRoot: string | undefined;
    const replacementSentinel = join(outDir, "replacement-sentinel.txt");

    await expect(
      stageStarterConsumer(
        { install: false, outDir },
        {
          beforeCandidateRename: ({ candidate }) => {
            preservedWorkRoot = dirname(candidate);
            const marker = readConsumerMarker(candidate);
            candidatePackRoot = join(repositoryTmpRoot, marker.pack!.path);
            rememberPackRoots([join(candidatePackRoot, "owned-by-test.tgz")]);
            mkdirSync(outDir);
            writeFileSync(replacementSentinel, "replacement remains untouched\n");
          },
        },
      ),
    ).rejects.toThrow(/rollback refused|target path was replaced/i);

    expect(preservedWorkRoot).toBeDefined();
    expect(candidatePackRoot).toBeDefined();
    ownedPath(preservedWorkRoot!);
    expect(readFileSync(replacementSentinel, "utf8")).toBe(
      "replacement remains untouched\n",
    );
    expect(readFileSync(join(preservedWorkRoot!, "consumer/package.json"), "utf8")).toContain(
      `file:${candidatePackRoot}`,
    );
    expect(
      readdirSync(candidatePackRoot!).filter((entry) => entry.endsWith(".tgz")),
    ).toHaveLength(4);
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
    for (const pending of second.cleanupPending ?? []) ownedPath(pending);
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

  test("refuses to restore an interrupted consumer through a replaced symlink parent", async () => {
    mkdirSync(repositoryTmpRoot, { recursive: true });
    const suffix = `${process.pid}-${Date.now()}`;
    const outsideRoot = ownedPath(mkdtempSync(join(tmpdir(), "laugh-tale-orphan-outside-")));
    const outsideSentinel = join(outsideRoot, "outside-sentinel.txt");
    const symlinkParent = ownedPath(join(repositoryTmpRoot, `.orphan-parent-${suffix}`));
    const target = join(symlinkParent, "nested", "consumer");
    const workPath = ownedPath(
      join(repositoryTmpRoot, `.stage-starter-work-symlink-${suffix}`),
    );
    writeFileSync(outsideSentinel, "outside bytes stay intact\n");
    mkdirSync(join(outsideRoot, "nested"));
    symlinkSync(outsideRoot, symlinkParent, "dir");
    const { previous } = createInterruptedWorkFixture({
      createdAt: Date.now() - 60_000,
      invocation: `symlink-${suffix}`,
      pid: 424_242,
      target,
      workPath,
    });

    const reclaimed = await reclaimOrphanedStagingArtifacts({
      artifactGraceMs: 0,
      isProcessAlive: () => false,
    });

    expect(readFileSync(outsideSentinel, "utf8")).toBe("outside bytes stay intact\n");
    expect(existsSync(target)).toBe(false);
    expect(readFileSync(join(previous, "consumer-sentinel.txt"), "utf8")).toBe(
      "restore this consumer exactly\n",
    );
    expect(reclaimed.preserved).toContain(workPath);
  });

  test("recovers an interrupted prior consumer before considering its exact pack orphaned", async () => {
    mkdirSync(repositoryTmpRoot, { recursive: true });
    const suffix = `${process.pid}-${Date.now()}`;
    const targetParent = ownedPath(join(repositoryTmpRoot, `.orphan-target-${suffix}`));
    const target = join(targetParent, "consumer");
    const workPath = ownedPath(
      join(repositoryTmpRoot, `.stage-starter-work-recovery-${suffix}`),
    );
    const fixturePackPath = ownedPath(join(packRoot, `recovery-${suffix}`));
    mkdirSync(targetParent);
    const { artifact, reference } = createOwnedPackFixture({
      createdAt: Date.now() - 60_000,
      invocation: `recovery-${suffix}`,
      packPath: fixturePackPath,
      pid: 424_242,
      target,
    });
    createInterruptedWorkFixture({
      createdAt: Date.now() - 60_000,
      invocation: `recovery-${suffix}`,
      pack: reference,
      pid: 424_242,
      target,
      workPath,
    });

    const reclaimed = await reclaimOrphanedStagingArtifacts({
      artifactGraceMs: 0,
      isProcessAlive: () => false,
    });

    expect(readFileSync(join(target, "consumer-sentinel.txt"), "utf8")).toBe(
      "restore this consumer exactly\n",
    );
    expect(readFileSync(artifact, "utf8")).toBe("owned pack artifact\n");
    expect(reclaimed.removed).toContain(workPath);
    expect(reclaimed.preserved).toContain(fixturePackPath);
  });

  test("keeps an exact prior pack referenced by a still-active interrupted refresh", async () => {
    mkdirSync(repositoryTmpRoot, { recursive: true });
    const suffix = `${process.pid}-${Date.now()}`;
    const targetParent = ownedPath(join(repositoryTmpRoot, `.active-target-${suffix}`));
    const target = join(targetParent, "consumer");
    const workPath = ownedPath(
      join(repositoryTmpRoot, `.stage-starter-work-active-${suffix}`),
    );
    const fixturePackPath = ownedPath(join(packRoot, `active-${suffix}`));
    mkdirSync(targetParent);
    const { artifact, reference } = createOwnedPackFixture({
      createdAt: Date.now() - 60_000,
      invocation: `active-${suffix}`,
      packPath: fixturePackPath,
      pid: 424_242,
      target,
    });
    const { previous } = createInterruptedWorkFixture({
      createdAt: Date.now(),
      invocation: `active-${suffix}`,
      pack: reference,
      pid: process.pid,
      target,
      workPath,
    });

    const reclaimed = await reclaimOrphanedStagingArtifacts({
      artifactGraceMs: 0,
      isProcessAlive: (pid) => pid === process.pid,
    });

    expect(readFileSync(artifact, "utf8")).toBe("owned pack artifact\n");
    expect(readFileSync(join(previous, "consumer-sentinel.txt"), "utf8")).toBe(
      "restore this consumer exactly\n",
    );
    expect(reclaimed.preserved).toEqual(
      expect.arrayContaining([workPath, fixturePackPath]),
    );
  });

  test("preserves prior and candidate packs while interrupted work cannot safely resolve", async () => {
    const suffix = `${process.pid}-${Date.now()}`;
    const targetParent = ownedPath(join(repositoryTmpRoot, `.blocked-target-${suffix}`));
    const target = join(targetParent, "consumer");
    const targetSentinel = join(target, "user-sentinel.txt");
    const workPath = ownedPath(
      join(repositoryTmpRoot, `.stage-starter-work-blocked-${suffix}`),
    );
    const priorPackPath = ownedPath(join(packRoot, `blocked-prior-${suffix}`));
    const candidatePackPath = ownedPath(join(packRoot, `blocked-candidate-${suffix}`));
    mkdirSync(target, { recursive: true });
    writeFileSync(targetSentinel, "unowned target stays intact\n");
    const priorPack = createOwnedPackFixture({
      createdAt: Date.now() - 60_000,
      invocation: `blocked-prior-${suffix}`,
      packPath: priorPackPath,
      pid: 424_242,
      target,
    });
    const candidatePack = createOwnedPackFixture({
      createdAt: Date.now() - 60_000,
      invocation: `blocked-candidate-${suffix}`,
      packPath: candidatePackPath,
      pid: 424_242,
      target,
    });
    createInterruptedWorkFixture({
      createdAt: Date.now() - 60_000,
      invocation: `blocked-candidate-${suffix}`,
      pack: priorPack.reference,
      pid: 424_242,
      target,
      workPath,
    });
    const candidate = createCandidateFixture({
      invocation: `blocked-candidate-${suffix}`,
      pack: candidatePack.reference,
      target,
      workPath,
    });

    const reclaimed = await reclaimOrphanedStagingArtifacts({
      artifactGraceMs: 0,
      isProcessAlive: () => false,
    });

    expect(readFileSync(targetSentinel, "utf8")).toBe("unowned target stays intact\n");
    expect(readFileSync(priorPack.artifact, "utf8")).toBe("owned pack artifact\n");
    expect(readFileSync(candidatePack.artifact, "utf8")).toBe("owned pack artifact\n");
    expect(readFileSync(join(candidate, "candidate-sentinel.txt"), "utf8")).toBe(
      "candidate stays recoverable\n",
    );
    expect(reclaimed.preserved).toEqual(
      expect.arrayContaining([workPath, priorPackPath, candidatePackPath]),
    );
  });
});
