import { mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";
import { completeV2Project, readJson, repoRoot, snapshotTree } from "../generation/generated-project-v2-fixture.js";

const { upgradeTripProject } = await import(join(repoRoot, "plugins/eternal-pose/scripts/upgrade-trip-project.mjs")) as {
  upgradeTripProject: (request: { projectDir: string; packagesVersion: string; toolVersion: string }, operations?: { spawnSync?: (command: string, arguments_: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv; shell: false }) => { status: number | null }; beforeMutation?: (event: { phase: string; path: string }) => void | Promise<void> }) => Promise<Record<string, unknown>>;
};
const { recoverProjectFileTransaction } = await import(join(repoRoot, "plugins/eternal-pose/lib/atomic-publication.mjs")) as { recoverProjectFileTransaction: (projectDir: string) => Promise<string> };
const { validateTripProject } = await import(join(repoRoot, "plugins/eternal-pose/scripts/validate-trip-project.mjs")) as { validateTripProject: (root: string, mode: string) => Promise<{ counts: { errors: number }; findings: Array<{ code: string }> }> };
const { verifyTripProject } = await import(join(repoRoot, "plugins/eternal-pose/scripts/verify-trip-project.mjs")) as { verifyTripProject: (root: string, mode: string, operations?: { spawnSync: () => { status: number } }) => Promise<{ counts: { errors: number }; findings: Array<{ code: string }>; commands: Array<{ command: string; exitCode: number }> }> };

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
async function fixture() { const value = await completeV2Project(); roots.push(value.parent); return value; }
const packageNames = ["core", "react", "adapters", "testing"].map((name) => `@laugh-tale-island/${name}`);
function fakeNpm(version: string) {
  return (_command: string, _arguments: readonly string[], options: { cwd: string }) => {
    const path = join(options.cwd, "package-lock.json");
    const lock = readJson<{ packages: Record<string, { version?: string; resolved?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }> }>(path);
    for (const name of packageNames) {
      const section = name.endsWith("/testing") ? "devDependencies" : "dependencies";
      lock.packages[""][section]![name] = version;
      lock.packages[`node_modules/${name}`].version = version;
      lock.packages[`node_modules/${name}`].resolved = `https://registry.npmjs.org/${name}/-/${name.split("/")[1]}-${version}.tgz`;
    }
    // npm's lockfile-only step is the only external operation this harness replaces.
    writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
    return { status: 0 };
  };
}
function request(root: string) { return { projectDir: root, packagesVersion: "2.1.0", toolVersion: "2.1.0" }; }
function acceptedTree(root: string) { return Object.fromEntries(Object.entries(snapshotTree(root)).filter(([path]) => !path.startsWith(".laugh-tale-"))); }
function changeJson(path: string, change: (value: Record<string, unknown>) => void) {
  const value = readJson<Record<string, unknown>>(path);
  change(value);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
function makeAuthoredInput(root: string) {
  changeJson(join(root, "src/trip-content/trip-input.json"), (input) => {
    delete input.setupLocale;
    input.trip = { id: "trip", title: "Trip", locale: "en-US", timezone: "Etc/UTC", startDate: "2026-09-04", endDate: "2026-09-04", days: [{ id: "day", date: "2026-09-04", title: "Day", nodes: [] }], routes: [], candidateGroups: [], reservations: [], tasks: [] };
  });
}

test("upgrades a valid null-Trip starter's four exact pins and leaves all source bytes intact", async () => {
  const { root } = await fixture();
  const before = snapshotTree(root);
  const priorManifest = readJson<{ generatorVersion: string; recipe: unknown; enrichment: unknown }>(join(root, "eternal-pose.json"));
  const result = await upgradeTripProject(request(root), { spawnSync: fakeNpm("2.1.0") });
  const manifest = readJson<{ generatorVersion: string; lastUpgradeToolVersion: string; packages: Record<string, string>; recipe: unknown; enrichment: unknown }>(join(root, "eternal-pose.json"));
  expect(result).toEqual(manifest);
  expect(Object.values(manifest.packages)).toEqual(["2.1.0", "2.1.0", "2.1.0", "2.1.0"]);
  expect(manifest.lastUpgradeToolVersion).toBe("2.1.0");
  expect(manifest.generatorVersion).toBe(priorManifest.generatorVersion);
  expect(manifest.recipe).toEqual(priorManifest.recipe);
  expect(manifest.enrichment).toEqual(priorManifest.enrichment);
  const after = snapshotTree(root);
  for (const [path, bytes] of Object.entries(before)) if (!["package.json", "package-lock.json", "eternal-pose.json"].includes(path)) expect(after[path]).toBe(bytes);
  expect(readJson<{ trip: unknown }>(join(root, "src/trip-content/trip-input.json")).trip).toBeNull();
});

test("a non-null authored Trip keeps its authored bytes through the package upgrade", async () => {
  const { root } = await fixture();
  makeAuthoredInput(root);
  const before = snapshotTree(root);
  await upgradeTripProject(request(root), { spawnSync: fakeNpm("2.1.0") });
  const after = snapshotTree(root);
  for (const [path, bytes] of Object.entries(before)) if (!["package.json", "package-lock.json", "eternal-pose.json"].includes(path)) expect(after[path]).toBe(bytes);
});

test("installed dependency symlinks survive the upgrade unchanged", async () => {
  const { root } = await fixture();
  const dependency = join(root, "node_modules/fixture");
  const executable = join(root, "node_modules/.bin/fixture");
  mkdirSync(join(root, "node_modules/.bin"), { recursive: true });
  mkdirSync(dependency);
  writeFileSync(join(dependency, "cli"), "dependency executable\n");
  symlinkSync("../fixture/cli", executable);
  const before = snapshotTree(root);
  await upgradeTripProject(request(root), { spawnSync: fakeNpm("2.1.0") });
  expect(readlinkSync(executable)).toBe("../fixture/cli");
  const after = snapshotTree(root);
  for (const [path, bytes] of Object.entries(before)) if (!["package.json", "package-lock.json", "eternal-pose.json"].includes(path)) expect(after[path]).toBe(bytes);
});

test.each([
  ["schema 1", (root: string) => changeJson(join(root, "eternal-pose.json"), (value) => { value.schemaVersion = 1; }), /schema-v2/],
  ["target major 3", () => {}, /same presentation-contract major/],
  ["manifest/package drift", (root: string) => changeJson(join(root, "package.json"), (value) => { (value.dependencies as Record<string, string>)[packageNames[0]] = "2.0.1"; }), /ownership conflict/],
  ["multiple lockfiles", (root: string) => writeFileSync(join(root, "yarn.lock"), "foreign lock\n"), /unsupported lockfile/],
  ["pnpm lockfile", (root: string) => writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n"), /unsupported lockfile/],
  ["missing npm lockfile", (root: string) => rmSync(join(root, "package-lock.json")), /unsupported lockfile/],
  ["presentation rewrite", (root: string) => changeJson(join(root, "eternal-pose.json"), (value) => { value.presentationContractVersion = 3; }), /presentation-contract major/],
  ["null Trip with structural error", (root: string) => writeFileSync(join(root, "src/app/App.tsx"), "export default function App() { return null; }\n"), /presentation-entry-mismatch/],
] as const)("refuses %s without mutation", async (name, mutate, message) => {
  const { root } = await fixture();
  mutate(root);
  const before = snapshotTree(root);
  const target = name === "target major 3" ? { ...request(root), packagesVersion: "3.0.0" } : request(root);
  await expect(upgradeTripProject(target, { spawnSync: fakeNpm("2.1.0") })).rejects.toThrow(message);
  expect(snapshotTree(root)).toEqual(before);
});

test("npm receives a fixed lockfile-only command in a private stage and cannot change an installed project on failure", async () => {
  const { root } = await fixture();
  const before = snapshotTree(root);
  let called = false;
  await expect(upgradeTripProject(request(root), { spawnSync(command, args, options) {
    called = true;
    expect(command).toBe("npm");
    expect(args).toEqual(["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org"]);
    expect(options.cwd).not.toBe(root);
    expect(options.shell).toBe(false);
    expect(options.env).not.toHaveProperty("ETERNAL_POSE_GOOGLE_PLACES_API_KEY");
    expect(readJson<{ dependencies: Record<string, string> }>(join(options.cwd, "package.json")).dependencies[packageNames[0]]).toBe("2.1.0");
    return { status: 1 };
  } })).rejects.toThrow(/npm package-lock-only regeneration failed/);
  expect(called).toBe(true);
  expect(snapshotTree(root)).toEqual(before);
});

test.each(["upgrade-stage-package-write", "upgrade-stage-package-written", "upgrade-stage-lock-regenerate", "stage-write", "stage-fsync", "stage-validate", "journal-prepare", "file-rename", "journal-commit"])("rolls back a caught fault at %s without changing any project byte", async (phase) => {
  const { root } = await fixture();
  const before = snapshotTree(root);
  let injected = false;
  await expect(upgradeTripProject(request(root), { spawnSync: fakeNpm("2.1.0"), beforeMutation(event) {
    if (event.phase === phase && !injected) { injected = true; throw new Error(`injected ${phase}`); }
  } })).rejects.toThrow(`injected ${phase}`);
  expect(injected).toBe(true);
  expect(snapshotTree(root)).toEqual(before);
});

test("refuses npm changing an unrelated package declaration", async () => {
  const { root } = await fixture();
  const before = snapshotTree(root);
  await expect(upgradeTripProject(request(root), { spawnSync(command, args, options) {
    const result = fakeNpm("2.1.0")(command, args, options);
    changeJson(join(options.cwd, "package.json"), (value) => { (value.dependencies as Record<string, string>).react = "19.0.0"; });
    return result;
  } })).rejects.toThrow(/beyond the four upgrade pins/);
  expect(snapshotTree(root)).toEqual(before);
});

test.each([
  ["package.json", (value: Record<string, unknown>) => { value.description = "concurrent package edit"; }],
  ["package-lock.json", (value: Record<string, unknown>) => { value.description = "concurrent lock edit"; }],
  ["eternal-pose.json", (value: Record<string, unknown>) => { value.generatorVersion = "2.0.1"; }],
] as const)("preserves a concurrent %s edit made before publication", async (path, mutate) => {
  const { root } = await fixture();
  let foreign: Record<string, string> | undefined;
  await expect(upgradeTripProject(request(root), { spawnSync: fakeNpm("2.1.0"), beforeMutation(event) {
    if (event.phase === "upgrade-stage-package-written") {
      changeJson(join(root, path), mutate);
      foreign = acceptedTree(root);
    }
  } })).rejects.toThrow(/project generation changed during upgrade/);
  expect(foreign).toBeDefined();
  expect(acceptedTree(root)).toEqual(foreign);
});

test("writer reservation rejects an allowlisted edit before journal preparation", async () => {
  const { root } = await fixture();
  let foreign: Record<string, string> | undefined;
  let prepared = 0;
  await expect(upgradeTripProject(request(root), { spawnSync: fakeNpm("2.1.0"), beforeMutation(event) {
    if (event.phase === "stage-validate") {
      changeJson(join(root, "package.json"), (value) => { value.description = "edit under reservation"; });
      foreign = acceptedTree(root);
    }
    if (event.phase === "journal-prepare") prepared++;
  } })).rejects.toThrow(/project generation changed during upgrade/);
  expect(prepared).toBe(0);
  expect(acceptedTree(root)).toEqual(foreign);
});

test("offline npm config probe sees no authored scoped registry or user/global configuration", async () => {
  const { root } = await fixture();
  writeFileSync(join(root, ".npmrc"), "@laugh-tale-island:registry=https://mirror.example/\n");
  const before = snapshotTree(root);
  let probed = false;
  await upgradeTripProject(request(root), { spawnSync(command, args, options) {
    expect(args).toEqual(["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org"]);
    const probe = spawnSync(command, ["config", "get", "@laugh-tale-island:registry", "--offline", "--registry=https://registry.npmjs.org"], { cwd: options.cwd, env: options.env, shell: false, encoding: "utf8" });
    expect(probe.status).toBe(0);
    expect(probe.stdout.trim()).toBe("undefined");
    expect(readdirSync(options.cwd).sort()).toEqual(["package-lock.json", "package.json"]);
    expect(readFileSync(options.env.npm_config_userconfig!, "utf8")).toBe("");
    expect(readFileSync(options.env.npm_config_globalconfig!, "utf8")).toBe("");
    probed = true;
    return fakeNpm("2.1.0")(command, args, options);
  } });
  expect(probed).toBe(true);
  const after = snapshotTree(root);
  expect(after[".npmrc"]).toBe(before[".npmrc"]);
});

test.each([1, 2, 3])("rolls back after final rename #%s", async (occurrence) => {
  const { root } = await fixture();
  const before = snapshotTree(root);
  let seen = 0;
  await expect(upgradeTripProject(request(root), { spawnSync: fakeNpm("2.1.0"), beforeMutation(event) {
    if (event.phase === "file-rename" && ++seen === occurrence) throw new Error("injected rename");
  } })).rejects.toThrow("injected rename");
  expect(seen).toBe(occurrence);
  expect(snapshotTree(root)).toEqual(before);
});

test("concurrent static Validate and isolated Verify readers refuse the in-progress generation", async () => {
  const { root } = await fixture();
  makeAuthoredInput(root);
  expect((await validateTripProject(root, "registry")).counts.errors).toBe(0);
  let inspected = 0;
  await upgradeTripProject(request(root), { spawnSync: fakeNpm("2.1.0"), async beforeMutation(event) {
    if (event.phase !== "file-rename") return;
    const validation = await validateTripProject(root, "registry");
    const verification = await verifyTripProject(root, "registry", { spawnSync: () => ({ status: 0 }) });
    expect(validation.findings.map((finding) => finding.code)).toEqual(["project.transaction-in-progress"]);
    expect(verification.findings.map((finding) => finding.code)).toEqual(["project.transaction-in-progress"]);
    inspected++;
  } });
  expect(inspected).toBe(3);
  expect((await validateTripProject(root, "registry")).counts.errors).toBe(0);
  let executions = 0;
  const runner = () => { executions++; return { status: 0 }; };
  const uninstalled = await verifyTripProject(root, "registry", { spawnSync: runner });
  expect(uninstalled.findings.map(finding => finding.code)).toContain("project.invalid-installed-dependencies");
  expect(uninstalled.commands).toEqual([]);
  expect(executions).toBe(0);
  // Synthetic post-install inventory tests the installed-boundary contract with
  // an injected runner, not real upgraded package/runtime behavior.
  for (const name of packageNames) {
    const directory = join(root, "node_modules", name); mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name, version: "2.1.0" }));
  }
  mkdirSync(join(root, "node_modules/.bin"), { recursive: true });
  mkdirSync(join(root, "node_modules/owned-tools"));
  for (const name of ["vitest", "tsc", "eslint", "vite"]) {
    writeFileSync(join(root, "node_modules/owned-tools", name + ".mjs"), "process.exit(0);\n");
    symlinkSync("../owned-tools/" + name + ".mjs", join(root, "node_modules/.bin", name));
  }
  const installed = await verifyTripProject(root, "registry", { spawnSync: runner });
  expect(installed.counts.errors).toBe(0);
  expect(installed.commands.map(command => command.command)).toEqual(["npm test", "npm run type-check", "npm run lint", "npm run test:experience", "npm run test:a11y", "npm run build"]);
  expect(executions).toBe(6);
}, 60_000);

function workerSource(root: string, failure: "committed-kill" | "recovery") {
  const moduleUrl = pathToFileURL(join(repoRoot, "plugins/eternal-pose/scripts/upgrade-trip-project.mjs")).href;
  return `
    import { readFileSync, writeFileSync } from "node:fs";
    import { upgradeTripProject } from ${JSON.stringify(moduleUrl)};
    const root = ${JSON.stringify(root)};
    function fakeNpm(_command, _args, options) {
      const path = options.cwd + "/package-lock.json";
      const lock = JSON.parse(readFileSync(path, "utf8"));
      for (const suffix of ["core", "react", "adapters", "testing"]) {
        const name = "@laugh-tale-island/" + suffix;
        const section = suffix === "testing" ? "devDependencies" : "dependencies";
        lock.packages[""][section][name] = "2.1.0";
        lock.packages["node_modules/" + name].version = "2.1.0";
        lock.packages["node_modules/" + name].resolved = "https://registry.npmjs.org/" + name + "/-/" + suffix + "-2.1.0.tgz";
      }
      writeFileSync(path, JSON.stringify(lock));
      return { status: 0 };
    }
    try {
      await upgradeTripProject({ projectDir: root, packagesVersion: "2.1.0", toolVersion: "2.1.0" }, {
        spawnSync: fakeNpm,
        beforeMutation(event) {
          if (${JSON.stringify(failure)} === "committed-kill" && event.phase === "cleanup") process.kill(process.pid, "SIGKILL");
          if (${JSON.stringify(failure)} === "recovery" && event.phase === "file-rename") throw new Error("injected rename");
          if (${JSON.stringify(failure)} === "recovery" && event.phase === "journal-recover") throw new Error("injected recovery");
        },
      });
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  `;
}
function runWorker(source: string): Promise<{ code: number | null; signal: NodeJS.Signals | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", source], { cwd: repoRoot, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (bytes: Buffer) => { stderr += bytes.toString(); });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, stderr }));
  });
}

test("a killed writer after durable commit recovers the complete upgraded generation", async () => {
  const { root } = await fixture();
  const before = snapshotTree(root);
  const worker = await runWorker(workerSource(root, "committed-kill"));
  expect(worker.signal).toBe("SIGKILL");
  expect(await recoverProjectFileTransaction(root)).toBe("finalized");
  const after = snapshotTree(root);
  for (const [path, bytes] of Object.entries(before)) if (!["package.json", "package-lock.json", "eternal-pose.json"].includes(path)) expect(after[path]).toBe(bytes);
  expect(readJson<{ lastUpgradeToolVersion: string }>(join(root, "eternal-pose.json")).lastUpgradeToolVersion).toBe("2.1.0");
  expect((await validateTripProject(root, "registry")).findings.filter((finding) => finding.code !== "trip-content.missing").every((finding) => finding.code === "provider.google-key.unverified")).toBe(true);
});

test("a failed recovery after a prepared transaction can be replayed from a dead writer", async () => {
  const { root } = await fixture();
  const before = snapshotTree(root);
  const worker = await runWorker(workerSource(root, "recovery"));
  expect(worker.code).toBe(1);
  expect(worker.stderr).toContain("injected recovery");
  expect(await recoverProjectFileTransaction(root)).toBe("rolled-back");
  expect(snapshotTree(root)).toEqual(before);
});
