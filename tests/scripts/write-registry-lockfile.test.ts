import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";

const script = join(fileURLToPath(new URL("../..", import.meta.url)), "scripts/write-registry-lockfile.mjs");
const { writeRegistryLockfile } = await import(pathToFileURL(script).href) as {
  writeRegistryLockfile: (request: { sourceLockPath: string; packageJsonPath: string; attestationPath: string; destinationLockPath: string }, operations?: { beforeMutation?: (context: { phase: string }) => void; afterInputSnapshot?: () => void }) => Promise<void>;
};

const names = ["core", "react", "adapters", "testing"] as const;
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "registry-lock-test-"));
  roots.push(root);
  const packages = names.map((shortName) => {
    const archive = join(root, `laugh-tale-island-${shortName}-2.0.0.tgz`);
    const contents = Buffer.from(`synthetic archive: ${shortName}`);
    writeFileSync(archive, contents);
    return {
      name: `@laugh-tale-island/${shortName}`, version: "2.0.0", archive,
      bytes: contents.length,
      sha256: createHash("sha256").update(contents).digest("hex"),
      integrity: `sha512-${createHash("sha512").update(contents).digest("base64")}`,
    };
  });
  const dependencies = Object.fromEntries(packages.slice(0, 3).map(({ name, archive }) => [name, `file:${archive}`]));
  const devDependencies = { [packages[3].name]: `file:${packages[3].archive}`, "axe-core": "4.11.0" };
  const lock = {
    name: "synthetic-consumer", version: "2.0.0", lockfileVersion: 3, requires: true,
    packages: {
      "": { name: "synthetic-consumer", version: "2.0.0", dependencies, devDependencies },
      ...Object.fromEntries(packages.map(({ name, archive, integrity }) => [`node_modules/${name}`, { version: "2.0.0", resolved: `file:${archive}`, integrity, dev: name.endsWith("/testing") }])),
      "node_modules/axe-core": { version: "4.11.0", resolved: "https://registry.npmjs.org/axe-core/-/axe-core-4.11.0.tgz", integrity: "synthetic-unrelated-integrity", dev: true },
      "node_modules/synthetic-unrelated": { version: "1.2.3", resolved: "https://registry.npmjs.org/synthetic-unrelated/-/synthetic-unrelated-1.2.3.tgz", integrity: "synthetic-unrelated-integrity", dependencies: { nested: "^2.0.0" } },
    } as Record<string, object>,
  };
  const manifest = { name: "synthetic-consumer", version: "2.0.0", dependencies: Object.fromEntries(packages.slice(0, 3).map(({ name }) => [name, "2.0.0"])), devDependencies: { [packages[3].name]: "2.0.0", "axe-core": "4.11.0" } };
  const sourceLockPath = join(root, "source-lock.json");
  const packageJsonPath = join(root, "package.json");
  const attestationPath = join(root, "attestation.json");
  const destinationLockPath = join(root, "destination-lock.json");
  writeFileSync(sourceLockPath, JSON.stringify(lock));
  writeFileSync(packageJsonPath, JSON.stringify(manifest));
  writeFileSync(attestationPath, JSON.stringify({ schemaVersion: 1, packages }));
  return { request: { sourceLockPath, packageJsonPath, attestationPath, destinationLockPath }, packages, lock };
}

test("derives exactly four registry entries while preserving unrelated parsed lock data", async () => {
  const { request, packages, lock } = fixture();
  await writeRegistryLockfile(request);
  const output = readFileSync(request.destinationLockPath, "utf8");
  expect(output).toBe(`${JSON.stringify(JSON.parse(output), null, 2)}\n`);
  const derived = JSON.parse(output) as { packages: Record<string, { version?: string; resolved?: string; integrity?: string; dev?: boolean; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }> };
  for (const artifact of packages) {
    const shortName = artifact.name.split("/")[1];
    const entry = derived.packages[`node_modules/${artifact.name}`];
    expect(entry).toEqual({ ...lock.packages[`node_modules/${artifact.name}`], resolved: `https://registry.npmjs.org/@laugh-tale-island/${shortName}/-/${shortName}-2.0.0.tgz` });
    expect(derived.packages[""][shortName === "testing" ? "devDependencies" : "dependencies"]?.[artifact.name]).toBe("2.0.0");
  }
  expect(derived.packages["node_modules/axe-core"]).toEqual(lock.packages["node_modules/axe-core"]);
  expect(derived.packages["node_modules/synthetic-unrelated"]).toEqual(lock.packages["node_modules/synthetic-unrelated"]);
});

test("rejects a changed archive and retains destination bytes", async () => {
  const { request, packages } = fixture();
  writeFileSync(request.destinationLockPath, "unchanged destination\n");
  writeFileSync(packages[0].archive, "mutated archive");
  await expect(writeRegistryLockfile(request)).rejects.toThrow(/sha256|archive|integrity/i);
  expect(readFileSync(request.destinationLockPath, "utf8")).toBe("unchanged destination\n");
});

test.each(["stage-write", "stage-fsync", "file-rename"])("an injected %s failure retains existing destination bytes", async (phaseToFail) => {
  const { request } = fixture();
  writeFileSync(request.destinationLockPath, "unchanged destination\n");
  await expect(writeRegistryLockfile(request, { beforeMutation: ({ phase }: { phase: string }) => {
    if (phase === phaseToFail) throw new Error(`injected ${phaseToFail} failure`);
  } })).rejects.toThrow(`injected ${phaseToFail} failure`);
  expect(readFileSync(request.destinationLockPath, "utf8")).toBe("unchanged destination\n");
});

test("rejects an extra internal package in the source lock", async () => {
  const { request, lock } = fixture();
  lock.packages["node_modules/@laugh-tale-island/rogue" as keyof typeof lock.packages] = { version: "2.0.0", resolved: "file:/tmp/rogue.tgz", integrity: "bad", dev: false };
  writeFileSync(request.sourceLockPath, JSON.stringify(lock));
  await expect(writeRegistryLockfile(request)).rejects.toThrow(/extra Laugh Tale/i);
});

test("rejects a Git source specifier for an internal package", async () => {
  const { request, lock } = fixture();
  const root = lock.packages[""] as { dependencies: Record<string, string> };
  root.dependencies["@laugh-tale-island/core"] = "git+ssh://example.invalid/core";
  writeFileSync(request.sourceLockPath, JSON.stringify(lock));
  await expect(writeRegistryLockfile(request)).rejects.toThrow(/local archive/i);
});

function splitFixture() {
  const data = fixture();
  const parent = dirname(data.request.sourceLockPath);
  const output = join(parent, "output"); mkdirSync(output);
  data.request.destinationLockPath = join(output, "result.json");
  for (const field of ["sourceLockPath", "packageJsonPath", "attestationPath"] as const) {
    const directory = join(parent, field); mkdirSync(directory);
    const path = join(directory, field === "attestationPath" ? ".laugh-tale-local-candidates.json" : field + ".json");
    renameSync(data.request[field], path); data.request[field] = path;
  }
  return data;
}

test("supports standalone split input directories and the real reserved attestation basename", async () => {
  const { request } = splitFixture();
  const inputs = [request.sourceLockPath, request.packageJsonPath, request.attestationPath].map(path => readFileSync(path));
  await writeRegistryLockfile(request);
  expect(readFileSync(request.destinationLockPath, "utf8")).toContain("https://registry.npmjs.org/");
  expect([request.sourceLockPath, request.packageJsonPath, request.attestationPath].map(path => readFileSync(path))).toEqual(inputs);
});
test("supports the real reserved attestation with same-directory source and destination ownership", async () => {
  const { request } = fixture();
  const path = join(dirname(request.attestationPath), ".laugh-tale-local-candidates.json");
  renameSync(request.attestationPath, path); request.attestationPath = path;
  const before = readFileSync(request.sourceLockPath);
  await writeRegistryLockfile(request);
  expect(readFileSync(request.destinationLockPath, "utf8")).toContain("https://registry.npmjs.org/");
  expect(readFileSync(request.sourceLockPath)).toEqual(before);
});

test.each(["sourceLockPath", "packageJsonPath", "attestationPath", "parent"] as const)("refuses %s source journal before publishing a separate destination", async field => {
  const { request } = splitFixture();
  const directory = field === "parent" ? dirname(dirname(request.sourceLockPath)) : dirname(request[field]);
  const journal = join(directory, ".laugh-tale-transaction-00000000-0000-0000-0000-000000000001");
  writeFileSync(journal, "malformed journal evidence");
  const inputs = [request.sourceLockPath, request.packageJsonPath, request.attestationPath].map(path => readFileSync(path));
  await expect(writeRegistryLockfile(request)).rejects.toThrow(/transaction|journal/i);
  expect(existsSync(request.destinationLockPath)).toBe(false);
  expect(readFileSync(journal, "utf8")).toBe("malformed journal evidence");
  expect([request.sourceLockPath, request.packageJsonPath, request.attestationPath].map(path => readFileSync(path))).toEqual(inputs);
});

test.each(["bytes", "identity", "reserved-attestation", "parent-journal", "owner-directory"])("refuses aggregate input %s changes before destination reservation", async mutation => {
  const { request } = splitFixture();
  writeFileSync(request.destinationLockPath, "old destination");
  let injectedInputs: Buffer[] = [];
  await expect(writeRegistryLockfile(request, { afterInputSnapshot() {
    if (mutation === "bytes") writeFileSync(request.packageJsonPath, readFileSync(request.packageJsonPath, "utf8") + "\n");
    if (mutation === "identity") { const bytes = readFileSync(request.sourceLockPath); renameSync(request.sourceLockPath, request.sourceLockPath + ".old"); writeFileSync(request.sourceLockPath, bytes); }
    if (mutation === "reserved-attestation") writeFileSync(request.attestationPath, readFileSync(request.attestationPath, "utf8") + "\n");
    if (mutation === "parent-journal") writeFileSync(join(dirname(dirname(request.sourceLockPath)), ".laugh-tale-transaction-injected"), "malformed");
    if (mutation === "owner-directory") { const path = dirname(request.attestationPath); renameSync(path, path + ".old"); mkdirSync(path); writeFileSync(request.attestationPath, readFileSync(join(path + ".old", ".laugh-tale-local-candidates.json"))); }
    injectedInputs = [request.sourceLockPath, request.packageJsonPath, request.attestationPath].map(path => readFileSync(path));
  } })).rejects.toThrow(/changed|transaction|journal/i);
  expect(readFileSync(request.destinationLockPath, "utf8")).toBe("old destination");
  expect([request.sourceLockPath, request.packageJsonPath, request.attestationPath].map(path => readFileSync(path))).toEqual(injectedInputs);
});

test("rejects an archive whose ancestor is a symlink even when its digest matches", async () => {
  const { request, packages, lock } = fixture(); const root = dirname(request.sourceLockPath);
  const real = join(root, "archives"); mkdirSync(real);
  const link = join(root, "linked-archives"); symlinkSync(real, link, "dir");
  const artifact = packages[0]; const name = "laugh-tale-island-core-2.0.0.tgz";
  renameSync(artifact.archive, join(real, name)); artifact.archive = join(link, name);
  (lock.packages[""] as { dependencies: Record<string, string> }).dependencies[artifact.name] = "file:" + artifact.archive;
  (lock.packages["node_modules/" + artifact.name] as { resolved: string }).resolved = "file:" + artifact.archive;
  writeFileSync(request.sourceLockPath, JSON.stringify(lock)); writeFileSync(request.attestationPath, JSON.stringify({ schemaVersion: 1, packages }));
  await expect(writeRegistryLockfile(request)).rejects.toThrow(/ancestor|identity|regular/i);
  expect(existsSync(request.destinationLockPath)).toBe(false);
});
