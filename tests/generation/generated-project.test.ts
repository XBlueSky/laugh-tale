import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import {
  lstat as lstatPath,
  mkdtemp as mkdtempPath,
  realpath as realpathPath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";

interface ValidationFinding {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

interface CommandResult {
  command: string;
  exitCode: number;
}

interface ValidationResult {
  mode: "local" | "deploy" | null;
  counts: { errors: number; warnings: number };
  findings: ValidationFinding[];
  commands: CommandResult[];
  failedCommand: CommandResult | null;
}

const RESULT_PREFIX = "ETERNAL_POSE_VALIDATION_RESULT ";
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const starterRoot =
  process.env.LAUGH_TALE_STARTER_ROOT ?? join(repoRoot, "plugins/eternal-pose/starter/react");
const validator = join(repoRoot, "plugins/eternal-pose/scripts/validate-trip-project.mjs");
interface ValidationTestOperations {
  lstat?: (path: string) => Promise<Stats>;
  mkdtemp?: (prefix: string) => Promise<string>;
  realpath?: (path: string) => Promise<string>;
  spawnSync?: ValidationSpawn;
  importModule?: (url: string) => Promise<Record<string, unknown>>;
  beforeTempMutation?: (event: { phase: string; path: string; validationDir: string }) => void;
}
type ValidationSpawn = (
  command: string,
  arguments_: readonly string[],
  options?: { env?: NodeJS.ProcessEnv },
) => { status: number | null };
type RunValidation = (
  root: string,
  mode: "local" | "deploy",
  testOperations?: ValidationTestOperations,
) => Promise<ValidationResult>;
const { runValidation } = (await import(pathToFileURL(validator).href)) as {
  runValidation: RunValidation;
};
const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "eternal-pose-validator-test-"));
  temporaryRoots.push(root);
  return root;
}

function write(root: string, relativePath: string, contents: string): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function createControlledProject(root: string, tripReady: boolean): void {
  const scripts = {
    test: "node scripts/gate.mjs test",
    "type-check": "node scripts/gate.mjs type-check",
    lint: "node scripts/gate.mjs lint",
    build: "node scripts/build.mjs",
  };
  const packageJson = {
    name: "synthetic-generated-trip",
    version: "0.0.0",
    private: true,
    type: "module",
    scripts,
    dependencies: { "@laugh-tale/core": "0.1.0" },
  };
  const packageLock = {
    name: packageJson.name,
    version: packageJson.version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: packageJson.name,
        version: packageJson.version,
      },
    },
  };

  for (const directory of [
    "docs",
    "src/trip-content",
    "src/experience-shell",
    "src/providers/google",
    "src/ui",
    "tests/e2e",
  ]) {
    mkdirSync(join(root, directory), { recursive: true });
  }

  write(root, "README.md", "# Synthetic generated trip\n");
  write(root, "AGENTS.md", "Read docs/trip-experience-contract.md.\n");
  write(root, "CLAUDE.md", "Read docs/trip-experience-contract.md.\n");
  write(root, ".env.example", "VITE_GOOGLE_MAPS_API_KEY=\n");
  write(root, ".gitignore", ".env.local\n.cache/\ndist/\ncoverage/\n*.tsbuildinfo\n");
  write(root, "package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
  write(root, "package-lock.json", `${JSON.stringify(packageLock, null, 2)}\n`);
  write(root, "docs/trip-experience-contract.md", "# Synthetic contract\n");
  write(root, ".cache/pre-existing-cache.txt", "user-owned cache bytes\n");
  write(root, "dist/pre-existing-output.txt", "user-owned output bytes\n");
  write(
    root,
    "src/trip-content/test-trip.json",
    `${JSON.stringify({ trip: tripReady ? { id: "synthetic-trip" } : null }, null, 2)}\n`,
  );
  write(
    root,
    "scripts/gate.mjs",
    [
      'const gate = process.argv[2] ?? "unknown";',
      'console.log(`gate:${gate}`);',
      'if (process.env.ETERNAL_POSE_TEST_FAIL_GATE === gate) process.exitCode = 7;',
      "",
    ].join("\n"),
  );
  write(
    root,
    "scripts/build.mjs",
    [
      'import { mkdir, readFile, writeFile } from "node:fs/promises";',
      'import { isAbsolute, join } from "node:path";',
      "const output = process.env.ETERNAL_POSE_VALIDATION_OUT_DIR;",
      'if (output === undefined || !isAbsolute(output)) throw new Error("owned validation output required");',
      'const source = JSON.parse(await readFile(join(process.cwd(), "src/trip-content/test-trip.json"), "utf8"));',
      'await mkdir(join(output, "validation"), { recursive: true });',
      'await writeFile(join(output, "validation/readiness.mjs"), `export const tripContentReadiness = Object.freeze({ hasTripContent: ${source.trip !== null} });\\n`);',
      'console.log(`validation-output:${output}`);',
      'console.log("gate:build");',
      "",
    ].join("\n"),
  );
}

function childEnvironment(values: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.VITE_GOOGLE_MAPS_API_KEY;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete environment[key];
    else environment[key] = value;
  }
  return environment;
}

function runValidator(
  arguments_: string[],
  environment: NodeJS.ProcessEnv = childEnvironment(),
): ReturnType<typeof spawnSync> & { validation: ValidationResult } {
  const result = spawnSync(process.execPath, [validator, ...arguments_], {
    encoding: "utf8",
    env: environment,
  });
  const resultLine = result.stdout
    .split("\n")
    .findLast((line) => line.startsWith(RESULT_PREFIX));
  expect(resultLine, `missing stable validation result in stdout:\n${result.stdout}`).toBeDefined();
  return {
    ...result,
    validation: JSON.parse(resultLine!.slice(RESULT_PREFIX.length)) as ValidationResult,
  };
}

function snapshotTree(root: string): Record<string, string> {
  const output: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const relativePath = relative(root, path);
      const stats = lstatSync(path);
      if (entry.isDirectory()) {
        output[`${relativePath}/`] = `${stats.mode}:${stats.mtimeMs}`;
        visit(path);
      } else {
        output[relativePath] = `${stats.mode}:${stats.mtimeMs}:${readFileSync(path).toString("base64")}`;
      }
    }
  };
  visit(root);
  return output;
}

function successfulValidationSpawn(): ValidationSpawn {
  return ((_command, arguments_, options) => {
    if (arguments_.at(-1) === "build") {
      const environment = options?.env as NodeJS.ProcessEnv;
      const output = environment.ETERNAL_POSE_VALIDATION_OUT_DIR!;
      mkdirSync(join(output, "validation"), { recursive: true });
      writeFileSync(
        join(output, "validation/readiness.mjs"),
        "export const tripContentReadiness = { hasTripContent: true };\n",
      );
    }
    return { status: 0 };
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("generated project validation", () => {
  test("accepts a generated site without src/trip-core", async () => {
    const root = temporaryRoot();
    createControlledProject(root, false);

    const result = await runValidation(root, "local", { spawnSync: successfulValidationSpawn() });

    expect(result.findings.filter((finding) => finding.code === "project.missing-directory")).toEqual([]);
  });

  test("rejects missing and non-exact @laugh-tale package specifiers", async () => {
    const root = temporaryRoot();
    createControlledProject(root, false);
    const manifestPath = join(root, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      dependencies: Record<string, string>;
    };

    manifest.dependencies["@laugh-tale/core"] = "^0.1.0";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    let result = await runValidation(root, "local", { spawnSync: successfulValidationSpawn() });
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: "error", code: "project.invalid-package-specifier" }),
    ]));

    manifest.dependencies["@laugh-tale/core"] = "file:../somewhere/core.tgz";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    result = await runValidation(root, "local", { spawnSync: successfulValidationSpawn() });
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: "error", code: "project.invalid-package-specifier" }),
    ]));

    delete manifest.dependencies["@laugh-tale/core"];
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    result = await runValidation(root, "local", { spawnSync: successfulValidationSpawn() });
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: "error", code: "project.missing-package-dependency" }),
    ]));
  });

  test("provisionally owns a new temp root before the first identity read and preserves uncertainty", async () => {
    const root = temporaryRoot();
    createControlledProject(root, true);
    let validationDir: string | undefined;
    let failed = false;

    const result = await runValidation(root, "local", {
      mkdtemp: async (prefix) => {
        validationDir = await mkdtempPath(prefix);
        temporaryRoots.push(validationDir);
        return validationDir;
      },
      lstat: async (path) => {
        if (!failed && basename(path).startsWith("eternal-pose-validation-")) {
          failed = true;
          throw new Error("injected first identity read failure");
        }
        return lstatPath(path);
      },
    });

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "project.validation-ownership-failed" }),
      expect.objectContaining({ code: "project.validation-cleanup-failed" }),
    ]));
    expect(validationDir).toBeDefined();
    expect(readdirSync(validationDir!)).toEqual([]);
  });

  test("preserves both paths when acquisition races with a replacement", async () => {
    const root = temporaryRoot();
    createControlledProject(root, true);
    let replacementDir: string | undefined;
    let displacedDir: string | undefined;

    const result = await runValidation(root, "local", {
      realpath: async (path) => {
        if (replacementDir === undefined && basename(path).startsWith("eternal-pose-validation-")) {
          replacementDir = path;
          displacedDir = `${path}-displaced`;
          temporaryRoots.push(replacementDir, displacedDir);
          renameSync(path, displacedDir);
          mkdirSync(path);
          writeFileSync(join(path, "foreign.txt"), "preserve\n");
        }
        return realpathPath(path);
      },
    });

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "project.validation-ownership-failed" }),
      expect.objectContaining({ code: "project.validation-cleanup-failed" }),
    ]));
    expect(readFileSync(join(replacementDir!, "foreign.txt"), "utf8")).toBe("preserve\n");
    expect(readdirSync(displacedDir!)).toEqual([]);
  });

  test("refuses recursive cleanup when an owned validation root is replaced", async () => {
    const root = temporaryRoot();
    createControlledProject(root, true);
    let replacementDir: string | undefined;
    let displacedDir: string | undefined;

    const result = await runValidation(root, "local", {
      spawnSync: successfulValidationSpawn(),
      importModule: () => Promise.resolve({ tripContentReadiness: { hasTripContent: true } }),
      beforeTempMutation: ({ phase, validationDir }) => {
        if (phase !== "validation-cleanup" || replacementDir !== undefined) return;
        replacementDir = validationDir;
        displacedDir = `${validationDir}-displaced`;
        temporaryRoots.push(replacementDir, displacedDir);
        renameSync(validationDir, displacedDir);
        mkdirSync(validationDir);
        writeFileSync(join(validationDir, "foreign.txt"), "preserve\n");
      },
    });

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "project.validation-cleanup-failed" }),
    ]));
    expect(readFileSync(join(replacementDir!, "foreign.txt"), "utf8")).toBe("preserve\n");
    expect(readdirSync(displacedDir!).some((name) => name.startsWith(".laugh-tale-incomplete-"))).toBe(true);
  });

  test("detects a child-command replacement race and preserves foreign state", async () => {
    const root = temporaryRoot();
    createControlledProject(root, true);
    let replacementDir: string | undefined;
    let displacedDir: string | undefined;

    const result = await runValidation(root, "local", {
      spawnSync: ((_command, _arguments, options) => {
        if (replacementDir === undefined) {
          const environment = options?.env as NodeJS.ProcessEnv;
          replacementDir = dirname(environment.ETERNAL_POSE_VALIDATION_OUT_DIR!);
          displacedDir = `${replacementDir}-displaced`;
          temporaryRoots.push(replacementDir, displacedDir);
          renameSync(replacementDir, displacedDir);
          mkdirSync(replacementDir);
          writeFileSync(join(replacementDir, "foreign.txt"), "preserve\n");
        }
        return { status: 0 };
      }),
    });

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "project.validation-failure" }),
      expect.objectContaining({ code: "project.validation-cleanup-failed" }),
    ]));
    expect(readFileSync(join(replacementDir!, "foreign.txt"), "utf8")).toBe("preserve\n");
  });

  test.each([
    {
      name: "spawn failure",
      operations: {
        spawnSync: () => {
          throw new Error("injected spawn failure");
        },
      },
      expectedCode: "project.validation-failure",
    },
    {
      name: "build failure",
      operations: (() => {
        let call = 0;
        return {
          spawnSync: () => ({ status: ++call === 4 ? 7 : 0 }),
        };
      })(),
      expectedCode: "project.command-failed",
    },
    {
      name: "readiness import failure",
      operations: {
        spawnSync: successfulValidationSpawn(),
        importModule: vi.fn(() => Promise.reject(new Error("injected import failure"))),
      },
      expectedCode: "project.validation-failure",
    },
    {
      name: "malformed readiness",
      operations: {
        spawnSync: successfulValidationSpawn(),
        importModule: vi.fn(() =>
          Promise.resolve({ tripContentReadiness: { hasTripContent: "yes" } })),
      },
      expectedCode: "project.validation-failure",
    },
  ])("cleans its exact owned temp root after $name", async ({ operations, expectedCode }) => {
    const root = temporaryRoot();
    createControlledProject(root, true);
    let validationDir: string | undefined;

    const result = await runValidation(root, "local", {
      ...operations,
      mkdtemp: async (prefix) => {
        validationDir = await mkdtempPath(prefix);
        return validationDir;
      },
    });

    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: expectedCode }),
    ]));
    if ("importModule" in operations) {
      expect(operations.importModule).toHaveBeenCalledTimes(1);
    }
    expect(validationDir).toBeDefined();
    expect(existsSync(validationDir!)).toBe(false);
  });

  test("removes the normal external validation tree after deterministic readiness import", async () => {
    const root = temporaryRoot();
    createControlledProject(root, true);
    let validationDir: string | undefined;

    const result = await runValidation(root, "local", {
      mkdtemp: async (prefix) => {
        validationDir = await mkdtempPath(prefix);
        return validationDir;
      },
      spawnSync: successfulValidationSpawn(),
      importModule: () => Promise.resolve({ tripContentReadiness: { hasTripContent: true } }),
    });

    expect(result.counts.errors).toBe(0);
    expect(validationDir).toBeDefined();
    expect(existsSync(validationDir!)).toBe(false);
  });

  test(
    "builds an importable readiness-only entry at the validator's exact path",
    async () => {
      const root = temporaryRoot();
      const output = join(root, "output");
      const cache = join(root, "cache");
      const environmentRoot = join(root, "environment");
      mkdirSync(environmentRoot);
      const environment = childEnvironment({
        ETERNAL_POSE_VALIDATION_OUT_DIR: output,
        ETERNAL_POSE_VALIDATION_CACHE_DIR: cache,
        ETERNAL_POSE_VALIDATION_ENV_DIR: environmentRoot,
      });
      const executable = process.platform === "win32" ? "npm.cmd" : "npm";

      const result = spawnSync(executable, ["run", "build"], {
        cwd: starterRoot,
        encoding: "utf8",
        env: environment,
        shell: false,
      });

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const entryPath = join(output, "validation/readiness.mjs");
      const built = (await import(pathToFileURL(entryPath).href)) as Record<
        string,
        unknown
      >;
      expect(Object.keys(built)).toEqual(["tripContentReadiness"]);
      expect(built.tripContentReadiness).toEqual({ hasTripContent: false });
    },
    15_000,
  );

  test("local mode runs every gate read-only and reports intentional setup gaps as warnings", () => {
    const root = temporaryRoot();
    createControlledProject(root, false);
    const sourceBefore = snapshotTree(root);

    const result = runValidator([root, "--mode", "local"]);

    expect(result.status).toBe(0);
    expect(result.validation.mode).toBe("local");
    expect(result.validation.commands).toEqual([
      { command: "npm test", exitCode: 0 },
      { command: "npm run type-check", exitCode: 0 },
      { command: "npm run lint", exitCode: 0 },
      { command: "npm run build", exitCode: 0 },
    ]);
    expect(result.validation.failedCommand).toBeNull();
    expect(result.validation.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: "warning", code: "trip-content.missing" }),
      expect.objectContaining({ severity: "warning", code: "provider.google-key.missing" }),
    ]));
    expect(snapshotTree(root)).toEqual(sourceBefore);
    expect(readFileSync(join(root, ".cache/pre-existing-cache.txt"), "utf8")).toBe(
      "user-owned cache bytes\n",
    );
    expect(readFileSync(join(root, "dist/pre-existing-output.txt"), "utf8")).toBe(
      "user-owned output bytes\n",
    );
    const validatorOutput =
      typeof result.stdout === "string"
        ? result.stdout
        : result.stdout.toString("utf8");
    const outputLine = validatorOutput
      .split("\n")
      .find((line) => line.startsWith("validation-output:"));
    expect(outputLine).toBeDefined();
    const ownedOutput = outputLine?.slice("validation-output:".length) ?? "";
    expect(isAbsolute(ownedOutput)).toBe(true);
    expect(existsSync(dirname(ownedOutput))).toBe(false);
  });

  test("deploy mode promotes both readiness gaps to stable release-blocking codes", () => {
    const root = temporaryRoot();
    createControlledProject(root, false);

    const result = runValidator(["--mode", "deploy", root]);

    expect(result.status).toBe(1);
    expect(result.validation.mode).toBe("deploy");
    expect(result.validation.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: "error", code: "trip-content.missing" }),
      expect.objectContaining({ severity: "error", code: "provider.google-key.missing" }),
    ]));
    expect(result.validation.commands.at(-1)).toEqual({ command: "npm run build", exitCode: 0 });
  });

  test("a built non-null trip and runtime-only key clear readiness without persisting or printing the key", () => {
    const root = temporaryRoot();
    createControlledProject(root, true);
    const runtimeKey = ["test", "-runtime", "-key"].join("");

    const result = runValidator(
      [root, "--mode", "deploy"],
      childEnvironment({ VITE_GOOGLE_MAPS_API_KEY: runtimeKey }),
    );

    expect(result.status).toBe(0);
    expect(result.validation.findings.some(({ code }) => code === "trip-content.missing")).toBe(false);
    expect(result.validation.findings.some(({ code }) => code === "provider.google-key.missing")).toBe(false);
    expect(result.stdout).not.toContain(runtimeKey);
    expect(result.stderr).not.toContain(runtimeKey);
    expect(JSON.stringify(snapshotTree(root))).not.toContain(runtimeKey);
  });

  test("publication or file-contract errors fail closed before any project command", () => {
    const root = temporaryRoot();
    createControlledProject(root, true);
    write(root, ".env.production", "PUBLIC_DEPLOYMENT=true\n");

    const result = runValidator([root, "--mode", "local"]);

    expect(result.status).toBe(1);
    expect(result.validation.commands).toEqual([]);
    expect(result.validation.failedCommand).toBeNull();
    expect(result.stdout).not.toContain("gate:test");
    expect(result.validation.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "credential.env-file", severity: "error" }),
    ]));
  });

  test("returns the exact failing command and exit code and stops later gates", () => {
    const root = temporaryRoot();
    createControlledProject(root, true);

    const result = runValidator(
      [root, "--mode", "local"],
      childEnvironment({ ETERNAL_POSE_TEST_FAIL_GATE: "type-check" }),
    );

    expect(result.status).toBe(1);
    expect(result.validation.failedCommand).toEqual({ command: "npm run type-check", exitCode: 7 });
    expect(result.validation.commands).toEqual([
      { command: "npm test", exitCode: 0 },
      { command: "npm run type-check", exitCode: 7 },
    ]);
    expect(result.stdout).not.toContain("gate:lint");
    expect(result.stdout).not.toContain("gate:build");
  });

  test.each([
    ["missing mode", (root: string) => [root]],
    ["duplicate mode", (root: string) => [root, "--mode", "local", "--mode", "deploy"]],
    ["duplicate root", (root: string) => [root, root, "--mode", "local"]],
    ["unknown option", (root: string) => [root, "--mode", "local", "--other", "value"]],
    ["relative root", () => ["relative/project", "--mode", "local"]],
    ["unsupported mode", (root: string) => [root, "--mode", "release"]],
  ])("rejects %s with a stable argument finding before commands", (_label, argumentsFor) => {
    const root = temporaryRoot();
    createControlledProject(root, true);
    const arguments_ = argumentsFor(root);
    expect(arguments_.filter((argument) => !argument.startsWith("--") && argument.includes("/")).every((path) => path === "relative/project" || isAbsolute(path))).toBe(true);

    const result = runValidator(arguments_);

    expect(result.status).toBe(1);
    expect(result.validation.mode).toBeNull();
    expect(result.validation.commands).toEqual([]);
    expect(result.validation.findings).toEqual([
      expect.objectContaining({ severity: "error", code: "project.invalid-arguments" }),
    ]);
  });
});
