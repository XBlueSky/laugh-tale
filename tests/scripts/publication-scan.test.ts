import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { realpath as realpathPath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Script } from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, test } from "vitest";

interface PublicationFinding {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

interface TempMutationEvent {
  phase: string;
  path: string;
  metadataDir: string;
}
interface ScanTestOperations {
  beforeTempMutation?: (event: TempMutationEvent) => Promise<void> | void;
  realpath?: (path: string) => Promise<string>;
  unlink?: (path: string) => Promise<void>;
}
type ScanPublication = (rootDir: string, testOperations?: ScanTestOperations) => Promise<PublicationFinding[]>;
type ValidateTripProject = (rootDir: string) => Promise<PublicationFinding[]>;

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const publicationModuleUrl = pathToFileURL(join(repoRoot, "plugins/eternal-pose/lib/publication-scan.mjs")).href;
const { scanPublication } = (await import(publicationModuleUrl)) as { scanPublication: ScanPublication };
const scanScript = join(repoRoot, "plugins/eternal-pose/scripts/scan-publication.mjs");
const validateScript = join(repoRoot, "plugins/eternal-pose/scripts/validate-trip-project.mjs");
const validateModuleUrl = pathToFileURL(validateScript).href;
const { validateTripProject } = (await import(validateModuleUrl)) as { validateTripProject: ValidateTripProject };
const temporaryRoots: string[] = [];
const VALIDATION_RESULT_PREFIX = "ETERNAL_POSE_VALIDATION_RESULT ";
const babelVendorFiles = [
  { path: "index.cjs", bytes: 513_214, sha256: "6969920ae0610df927b6b3e675d1309372c268e36d391652af8e3e0183cbe8f8" },
  { path: "LICENSE", bytes: 1_086, sha256: "2e97627cb278aa7556fb9e8817368302301a595b6c7582512b8d74c57b773652" },
  { path: "UPSTREAM.json", bytes: 385, sha256: "40944e9cadca6d230f6300b8de440baceed6b28674db746b3e6710878ff7242d" },
] as const;
const entitiesVendorFiles = [
  { path: "package.json", bytes: 2_563, sha256: "86e28ac6361377a9c0a82dc7ce849b16bfcc6b13d862c563bbf9b3fe9267773a" },
  { path: "LICENSE", bytes: 1_260, sha256: "cb992345949ccd6e8394b2cd6c465f7b897c864f845937dbf64e8997f389e164" },
  { path: "dist/decode.js", bytes: 22_923, sha256: "5e3e1c938416abcb354ff4d7808f0a010d27d0e4170195c6f95f2e6895cb081a" },
  { path: "dist/decode-codepoint.js", bytes: 1_160, sha256: "f09dbc23d35abbf96718dfdd04def3c1d3444495541d050c69a12706ee76dbb1" },
  { path: "dist/generated/decode-data-html.js", bytes: 32_453, sha256: "a845d1bb8e661abad2642088c646031523dc58b6e8bd0453308b0d71c01c8b8f" },
  { path: "dist/generated/decode-data-xml.js", bytes: 314, sha256: "e11599611184b79a44d80cf0c135f4eeaf09e0ccac8845da54333177336a20ed" },
  { path: "dist/internal/bin-trie-flags.js", bytes: 942, sha256: "4f2d90d78b57cc2549cda4c53c7b5a1ca6176fcf746da1bd4ad4e6e9608ea89d" },
  { path: "dist/internal/decode-shared.js", bytes: 617, sha256: "51a2120afeae660916954be58f323c718b0415b78e9719c0b0279f49f3cc0d96" },
] as const;
const entitiesVendorRoot = join(repoRoot, "plugins/eternal-pose/vendor/entities");
const babelVendorRoot = join(repoRoot, "plugins/eternal-pose/vendor/@babel/parser");
const thirdPartyNotice = {
  path: "THIRD_PARTY_NOTICES.md",
  bytes: 701,
  sha256: "239c959a453dd994735fa7fb3105c461e64735bf66dba8d259a7f8da98560b45",
} as const;

function parseValidationResult(stdout: string): {
  counts: { errors: number; warnings: number };
  findings: PublicationFinding[];
} {
  const line = stdout
    .split("\n")
    .findLast((candidate) => candidate.startsWith(VALIDATION_RESULT_PREFIX));
  if (line === undefined) throw new Error("stable validation result is missing");
  return JSON.parse(line.slice(VALIDATION_RESULT_PREFIX.length)) as {
    counts: { errors: number; warnings: number };
    findings: PublicationFinding[];
  };
}

function createTemporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "eternal-pose-publication-"));
  temporaryRoots.push(root);
  return root;
}

function writeFixture(root: string, relativePath: string, contents: string | Uint8Array): void {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function findingCodes(findings: PublicationFinding[]): string[] {
  return findings.map((finding) => finding.code);
}

function findingAt(findings: PublicationFinding[], path: string, code?: string): boolean {
  return findings.some((finding) => finding.path === path && (code === undefined || finding.code === code));
}

function expectTypeScriptSyntaxValid(source: string): void {
  const diagnostics = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
    fileName: "scanner-fixture.ts",
    reportDiagnostics: true,
  }).diagnostics ?? [];
  expect(diagnostics.filter(({ category }) => category === ts.DiagnosticCategory.Error)).toEqual([]);
}

function sha256(contents: string | Uint8Array): string {
  return createHash("sha256").update(contents).digest("hex");
}

function copyEntitiesVendor(pluginRoot: string): void {
  for (const file of entitiesVendorFiles) {
    const target = join(pluginRoot, "vendor/entities", file.path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(entitiesVendorRoot, file.path), target);
  }
  copyFileSync(join(entitiesVendorRoot, "UPSTREAM.json"), join(pluginRoot, "vendor/entities/UPSTREAM.json"));
}

function copyScannerPlugin(pluginRoot: string): void {
  mkdirSync(join(pluginRoot, "lib"), { recursive: true });
  copyFileSync(join(repoRoot, "plugins/eternal-pose/lib/publication-scan.mjs"), join(pluginRoot, "lib/publication-scan.mjs"));
  for (const file of babelVendorFiles) {
    const target = join(pluginRoot, "vendor/@babel/parser", file.path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(babelVendorRoot, file.path), target);
  }
  copyEntitiesVendor(pluginRoot);
  copyFileSync(
    join(repoRoot, "plugins/eternal-pose", thirdPartyNotice.path),
    join(pluginRoot, thirdPartyNotice.path),
  );
}

async function importIsolatedScanner(pluginRoot: string): Promise<ScanPublication> {
  const scannerUrl = pathToFileURL(join(pluginRoot, "lib/publication-scan.mjs")).href;
  const module = (await import(`${scannerUrl}?test=${Date.now()}-${Math.random()}`)) as {
    scanPublication: ScanPublication;
  };
  return module.scanPublication;
}

function fileInventory(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    const relativePath = path.slice(root.length + 1).split("\\").join("/");
    return entry.isDirectory() ? fileInventory(root, path) : [relativePath];
  });
}

function createValidGeneratedProject(root: string): void {
  const files: Record<string, string> = {
    "README.md": "# Trip\n",
    "AGENTS.md": "Read docs/trip-experience-contract.md.\n",
    "CLAUDE.md": "Read docs/trip-experience-contract.md.\n",
    ".env.example": "GOOGLE_MAPS_API_KEY=\n",
    ".gitignore": ".env.local\ndist/\ncoverage/\n",
    "package.json": `${JSON.stringify({ scripts: { build: "node scripts/build.mjs", lint: "node scripts/pass.mjs", test: "node scripts/pass.mjs", "type-check": "node scripts/pass.mjs" } }, null, 2)}\n`,
    "package-lock.json": "{}\n",
    "docs/trip-experience-contract.md": "# Contract\n",
    "scripts/pass.mjs": "// Synthetic validation fixture command.\n",
    "scripts/build.mjs": [
      'import { mkdir, writeFile } from "node:fs/promises";',
      'import { join } from "node:path";',
      'const output = process.env.ETERNAL_POSE_VALIDATION_OUT_DIR;',
      'if (output === undefined) throw new Error("isolated output is required");',
      'const validation = join(output, "validation");',
      'await mkdir(validation, { recursive: true });',
      'await writeFile(join(validation, "readiness.mjs"), "export const tripContentReadiness = Object.freeze({ hasTripContent: false });\\n", { flag: "wx" });',
      "",
    ].join("\n"),
  };
  for (const [relativePath, contents] of Object.entries(files)) writeFixture(root, relativePath, contents);
  for (const relativePath of [
    "src/trip-content",
    "src/trip-core",
    "src/experience-shell",
    "src/providers/google",
    "src/ui",
    "tests/e2e",
  ]) {
    mkdirSync(join(root, relativePath), { recursive: true });
  }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("vendored Babel parser", () => {
  const vendorRoot = join(repoRoot, "plugins/eternal-pose/vendor/@babel/parser");
  const parserPath = join(vendorRoot, "index.cjs");
  const licensePath = join(vendorRoot, "LICENSE");
  const upstreamPath = join(vendorRoot, "UPSTREAM.json");

  test("pins the exact audited runtime, license, and upstream integrity metadata", () => {
    const parser = readFileSync(parserPath);
    const license = readFileSync(licensePath);
    const upstream = JSON.parse(readFileSync(upstreamPath, "utf8")) as Record<string, string>;
    const notice = readFileSync(join(repoRoot, "plugins/eternal-pose/THIRD_PARTY_NOTICES.md"), "utf8");

    expect(parser.byteLength).toBe(513_214);
    expect(sha256(parser)).toBe("6969920ae0610df927b6b3e675d1309372c268e36d391652af8e3e0183cbe8f8");
    expect(license.byteLength).toBe(1_086);
    expect(sha256(license)).toBe("2e97627cb278aa7556fb9e8817368302301a595b6c7582512b8d74c57b773652");
    expect(upstream).toEqual({
      name: "@babel/parser",
      version: "7.29.8",
      source: "https://registry.npmjs.org/@babel/parser/-/parser-7.29.8.tgz",
      integrity: "sha512-E8lTAYNB1KW+FH+VGJuZM1ioAx2E6oVlvQFRrf5P8ZZmsiJXYAD9vTFV7yyEURNzgh1dFqMZuO6tUwcARbqFCA==",
      vendoredFrom: "lib/index.js",
      vendoredSha256: "6969920ae0610df927b6b3e675d1309372c268e36d391652af8e3e0183cbe8f8",
      license: "MIT",
    });
    expect(notice).toContain("@babel/parser 7.29.8");
    expect(notice).toContain("vendor/@babel/parser/LICENSE");
  });

  test("loads and scans from an isolated plugin copy with no node_modules", () => {
    const isolatedRoot = createTemporaryRoot();
    const isolatedPlugin = join(isolatedRoot, "plugin");
    const isolatedProject = join(isolatedRoot, "project");
    mkdirSync(join(isolatedPlugin, "lib"), { recursive: true });
    mkdirSync(join(isolatedPlugin, "vendor/@babel/parser"), { recursive: true });
    copyFileSync(join(repoRoot, "plugins/eternal-pose/lib/publication-scan.mjs"), join(isolatedPlugin, "lib/publication-scan.mjs"));
    copyFileSync(parserPath, join(isolatedPlugin, "vendor/@babel/parser/index.cjs"));
    copyFileSync(licensePath, join(isolatedPlugin, "vendor/@babel/parser/LICENSE"));
    copyFileSync(upstreamPath, join(isolatedPlugin, "vendor/@babel/parser/UPSTREAM.json"));
    copyEntitiesVendor(isolatedPlugin);
    writeFixture(isolatedProject, "src/config.ts", "const apiKey = runtimeConfig();\n");

    const isolatedModuleUrl = pathToFileURL(join(isolatedPlugin, "lib/publication-scan.mjs")).href;
    const child = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `const { scanPublication } = await import(${JSON.stringify(isolatedModuleUrl)}); const findings = await scanPublication(${JSON.stringify(isolatedProject)}); process.stdout.write(JSON.stringify(findings));`,
      ],
      {
        cwd: isolatedRoot,
        encoding: "utf8",
        env: { ...process.env, NODE_PATH: "" },
      },
    );

    expect(readdirSync(isolatedRoot)).not.toContain("node_modules");
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual([]);
  });
});

describe("vendored WHATWG entity decoder", () => {
  test("pins the exact entities 8.0.0 decode closure, license, and upstream metadata", () => {
    expect(fileInventory(entitiesVendorRoot).sort()).toEqual(
      [...entitiesVendorFiles.map(({ path }) => path), "UPSTREAM.json"].sort(),
    );
    for (const file of entitiesVendorFiles) {
      const contents = readFileSync(join(entitiesVendorRoot, file.path));
      expect(contents.byteLength, file.path).toBe(file.bytes);
      expect(sha256(contents), file.path).toBe(file.sha256);
    }

    const packageJson = JSON.parse(readFileSync(join(entitiesVendorRoot, "package.json"), "utf8")) as Record<string, unknown>;
    const upstream = JSON.parse(readFileSync(join(entitiesVendorRoot, "UPSTREAM.json"), "utf8")) as Record<string, unknown>;
    const notice = readFileSync(join(repoRoot, "plugins/eternal-pose/THIRD_PARTY_NOTICES.md"), "utf8");
    expect(packageJson).toMatchObject({ name: "entities", version: "8.0.0", license: "BSD-2-Clause", type: "module" });
    expect(packageJson.dependencies).toBeUndefined();
    expect(upstream).toEqual({
      name: "entities",
      version: "8.0.0",
      source: "https://registry.npmjs.org/entities/-/entities-8.0.0.tgz",
      integrity: "sha512-zwfzJecQ/Uej6tusMqwAqU/6KL2XaB2VZ2Jg54Je6ahNBGNH6Ek6g3jjNCF0fG9EWQKGZNddNjU5F1ZQn/sBnA==",
      license: "BSD-2-Clause",
      files: entitiesVendorFiles.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
    });
    expect(notice).toContain("entities 8.0.0");
    expect(notice).toContain("vendor/entities/LICENSE");
  });

  test("loads the exact ESM closure without node_modules and preserves WHATWG modes", () => {
    const isolatedRoot = createTemporaryRoot();
    const isolatedPlugin = join(isolatedRoot, "plugin");
    copyEntitiesVendor(isolatedPlugin);
    const decoderUrl = pathToFileURL(join(isolatedPlugin, "vendor/entities/dist/decode.js")).href;
    const child = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        [
          `const { decodeHTML, decodeHTMLAttribute } = await import(${JSON.stringify(decoderUrl)});`,
          "const values = {",
          "  textLegacy: decodeHTML('&amp=next'),",
          "  attributeAmbiguous: decodeHTMLAttribute('&amp=next'),",
          "  numericLegacy: decodeHTMLAttribute('&#95next'),",
          "  hexadecimalLegacy: decodeHTML('&#x5fnext'),",
          "  nul: decodeHTML('&#0;'),",
          "  surrogate: decodeHTML('&#xD800;'),",
          "  overflow: decodeHTML('&#x110000;'),",
          "  c1: decodeHTML('&#x80;'),",
          "  unknown: decodeHTML('&zzNotARealEntity;'),",
          "  noDigits: decodeHTML('&#x;'),",
          "  onePass: decodeHTML('&amp;#95;'),",
          "  underBar: decodeHTML('&UnderBar;'),",
          "  fjlig: decodeHTML('&fjlig;'),",
          "  hyphen: decodeHTML('&hyphen;'),",
          "};",
          "process.stdout.write(JSON.stringify(values));",
        ].join("\n"),
      ],
      { cwd: isolatedRoot, encoding: "utf8", env: { ...process.env, NODE_PATH: "" } },
    );

    expect(readdirSync(isolatedRoot)).not.toContain("node_modules");
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({
      textLegacy: "&=next",
      attributeAmbiguous: "&amp=next",
      numericLegacy: "_next",
      hexadecimalLegacy: "_next",
      nul: "\ufffd",
      surrogate: "\ufffd",
      overflow: "\ufffd",
      c1: "€",
      unknown: "&zzNotARealEntity;",
      noDigits: "&#x;",
      onePass: "&#95;",
      underBar: "_",
      fjlig: "fj",
      hyphen: "‐",
    });
  });

  test("does not copy the publication-scanner vendor into a generated trip", async () => {
    const root = createTemporaryRoot();
    const target = join(await realpathPath(root), "generated-trip");
    const generator = join(repoRoot, "plugins/eternal-pose/scripts/create-trip-project.mjs");
    const child = spawnSync(
      process.execPath,
      [generator, "--target", target, "--recipe", "quiet-wood"],
      { cwd: root, encoding: "utf8" },
    );

    expect(child.status, child.stderr).toBe(0);
    expect(fileInventory(target).some((path) => path.startsWith("vendor/") || path.includes("entities"))).toBe(false);
  });
});

describe("audited vendor trust", () => {
  const auditedFiles = [
    ...babelVendorFiles.map((file) => ({ ...file, path: `vendor/@babel/parser/${file.path}` })),
    ...entitiesVendorFiles.map((file) => ({ ...file, path: `vendor/entities/${file.path}` })),
    {
      path: "vendor/entities/UPSTREAM.json",
      bytes: 1_543,
      sha256: "ad5c00541bf118ab35677db49084f27dd3df097d19420869feb5d1d3e1a2e993",
    },
    thirdPartyNotice,
  ] as const;

  test("keeps the exact scanner-adjacent audited inventory clean", async () => {
    const findings = await scanPublication(repoRoot);

    expect(findings.filter(({ path }) => path.includes("vendor/") || path === thirdPartyNotice.path)).toEqual([]);
  });

  test("rejects a byte mutation in every scanner-owned audited file without trusting target metadata", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = join(root, "plugin");
    copyScannerPlugin(pluginRoot);
    const mutation = Buffer.from("\n/* audited fixture mutation */\n");
    for (const file of auditedFiles) {
      const target = join(pluginRoot, file.path);
      const suffix = file.path.endsWith(".json") ? Buffer.from(" \n") : mutation;
      writeFileSync(target, Buffer.concat([readFileSync(target), suffix]));
    }

    const isolatedScan = await importIsolatedScanner(pluginRoot);
    const findings = await isolatedScan(pluginRoot);

    for (const file of auditedFiles) {
      expect(findingAt(findings, file.path, "vendor.integrity"), file.path).toBe(true);
    }
    expect(JSON.stringify(findings)).not.toContain("audited fixture mutation");
  });

  test("rejects a truncated audited file and preserves its state", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = join(root, "plugin");
    copyScannerPlugin(pluginRoot);
    const path = "vendor/entities/LICENSE";
    writeFileSync(join(pluginRoot, path), readFileSync(join(pluginRoot, path)).subarray(0, 16));

    const isolatedScan = await importIsolatedScanner(pluginRoot);
    const findings = await isolatedScan(pluginRoot);

    expect(findingAt(findings, path, "vendor.integrity")).toBe(true);
    expect(readFileSync(join(pluginRoot, path)).byteLength).toBe(16);
  });

  test("fails closed when a scanner-owned audited identity is missing", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = join(root, "plugin");
    copyScannerPlugin(pluginRoot);
    const path = "vendor/@babel/parser/LICENSE";
    rmSync(join(pluginRoot, path));

    const isolatedScan = await importIsolatedScanner(pluginRoot);
    const findings = await isolatedScan(pluginRoot);

    expect(findingAt(findings, path, "vendor.integrity")).toBe(true);
  });

  test("revokes the narrow email exception when an attribution identity is mutated", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = join(root, "plugin");
    copyScannerPlugin(pluginRoot);
    const path = "vendor/@babel/parser/LICENSE";
    const email = ["private", "@", "traveler", ".tools"].join("");
    writeFileSync(join(pluginRoot, path), `${readFileSync(join(pluginRoot, path), "utf8")}\n${email}\n`);

    const isolatedScan = await importIsolatedScanner(pluginRoot);
    const findings = await isolatedScan(pluginRoot);

    expect(findingAt(findings, path, "vendor.integrity")).toBe(true);
    expect(findingAt(findings, path, "artifact.unaudited-vendor")).toBe(true);
    expect(findingAt(findings, path, "privacy.email-address")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(email);
  });

  test("scans an added audited-vendor descendant normally and never echoes its value", async () => {
    const root = createTemporaryRoot();
    const pluginRoot = join(root, "plugin");
    copyScannerPlugin(pluginRoot);
    const email = ["private", "@", "traveler", ".tools"].join("");
    const path = "vendor/entities/dist/added-contact.txt";
    writeFixture(pluginRoot, path, `${email}\n`);

    const isolatedScan = await importIsolatedScanner(pluginRoot);
    const findings = await isolatedScan(pluginRoot);

    expect(findingAt(findings, path, "artifact.unaudited-vendor")).toBe(true);
    expect(findingAt(findings, path, "artifact.build-output")).toBe(true);
    expect(findingAt(findings, path, "privacy.email-address")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(email);
  });

  test.each([
    "Vendor/Entities/dist/case-lookalike.txt",
    "copied/vendor/entities/dist/path-lookalike.txt",
    "plugins/eternal-pose/vendor/entities/nested/dist/nested-lookalike.txt",
  ])("does not grant prefix trust to %s", async (path) => {
    const root = createTemporaryRoot();
    const email = ["private", "@", "traveler", ".tools"].join("");
    writeFixture(root, path, `${email}\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "artifact.unaudited-vendor")).toBe(true);
    expect(findingAt(findings, path, "artifact.build-output")).toBe(true);
    expect(findingAt(findings, path, "privacy.email-address")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(email);
  });

  test("does not trust an exact copied vendor package that is not scanner-adjacent", async () => {
    const root = createTemporaryRoot();
    const copiedPlugin = join(root, "copied-plugin");
    copyEntitiesVendor(copiedPlugin);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "copied-plugin/vendor/entities/package.json", "artifact.unaudited-vendor")).toBe(true);
    expect(findingAt(findings, "copied-plugin/vendor/entities/package.json", "privacy.email-address")).toBe(true);
    expect(findingAt(findings, "copied-plugin/vendor/entities/dist/decode.js", "artifact.build-output")).toBe(true);
  });
});

describe("publication safety findings", () => {
  test("does not trust a copied tree that only resembles an audited vendor prefix", async () => {
    const root = createTemporaryRoot();
    const upstreamEmail = ["author", "@", "upstream", ".tools"].join("");
    writeFixture(
      root,
      "plugins/eternal-pose/vendor/entities/dist/runtime.js",
      "export const runtimeValue = 1;\n",
    );
    writeFixture(
      root,
      "plugins/eternal-pose/vendor/entities/package.json",
      `${JSON.stringify({ name: "example", author: `Upstream <${upstreamEmail}>` })}\n`,
    );
    writeFixture(root, "plugins/eternal-pose/vendor/entities/src/contact.txt", `${upstreamEmail}\n`);
    writeFixture(root, "plugins/eternal-pose/vendor/example/dist/runtime.js", "export const generatedValue = 1;\n");
    writeFixture(root, "src/dist/runtime.js", "export const generatedValue = 1;\n");

    const findings = await scanPublication(root);

    expect(findingAt(findings, "plugins/eternal-pose/vendor/entities/dist/runtime.js", "artifact.build-output")).toBe(true);
    expect(findingAt(findings, "plugins/eternal-pose/vendor/entities/package.json", "artifact.unaudited-vendor")).toBe(true);
    expect(findingAt(findings, "plugins/eternal-pose/vendor/entities/package.json", "privacy.email-address")).toBe(true);
    expect(findingAt(findings, "plugins/eternal-pose/vendor/entities/src/contact.txt", "privacy.email-address")).toBe(true);
    expect(findingAt(findings, "plugins/eternal-pose/vendor/example/dist/runtime.js", "artifact.build-output")).toBe(true);
    expect(findingAt(findings, "src/dist/runtime.js", "artifact.build-output")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(upstreamEmail);
  });

  test("reports credential, privacy, artifact, and public-access risks with stable safe findings", async () => {
    const root = createTemporaryRoot();
    const googleKey = ["AI", "za", "G".repeat(35)].join("");
    const bearerToken = ["Bearer", " ", "tok_", "B".repeat(30)].join("");
    const bookingReference = ["Booking reference: ", "LT", "7Q", "9X2"].join("");
    const phoneNumber = ["+886", " 9", "12 345 678"].join("");
    const emailAddress = ["traveler", "@", "example", ".invalid"].join("");
    const envToken = ["PRIVATE_TOKEN=", "secret_", "E".repeat(28)].join("");
    const sensitiveValues = [googleKey, bearerToken, bookingReference, phoneNumber, emailAddress, envToken];

    writeFixture(root, "src/private-config.txt", [googleKey, bearerToken, bookingReference, phoneNumber].join("\n"));
    writeFixture(root, ".env.local", `${envToken}\n`);
    writeFixture(root, ".env.example", "GOOGLE_MAPS_API_KEY=\n# Add a local value; never commit it.\n");
    writeFixture(root, "tickets/boarding-pass-qr.png", Buffer.from([0, 1, 2, 3, 255]));
    writeFixture(root, "mail/travel-confirmation.eml", `From: ${emailAddress}\n`);
    writeFixture(root, "documents/passport-scan.pdf", Buffer.from([37, 80, 68, 70, 0, 1]));
    writeFixture(root, "dist/assets/app.js.map", "{}\n");
    writeFixture(root, "vercel.json", '{"public":true}\n');

    const findings = await scanPublication(root);
    const codes = findingCodes(findings);

    expect(codes).toContain("credential.google-api-key");
    expect(codes).toContain("credential.bearer-token");
    expect(codes).toContain("credential.env-file");
    expect(codes).toContain("privacy.booking-reference");
    expect(codes).toContain("privacy.phone-number");
    expect(codes).toContain("privacy.qr-artifact");
    expect(codes).toContain("privacy.raw-email");
    expect(codes).toContain("privacy.private-document");
    expect(codes).toContain("artifact.source-map");
    expect(codes).toContain("artifact.build-output");
    expect(codes).toContain("access.public-configuration");
    expect(findings.some((finding) => finding.path === ".env.example")).toBe(false);
    expect(findings.every((finding) => ["error", "warning"].includes(finding.severity))).toBe(true);
    expect(findings.every((finding) => Object.keys(finding).sort().join(",") === "code,message,path,severity")).toBe(true);
    expect(sensitiveValues.some((value) => JSON.stringify(findings).includes(value))).toBe(false);
  });

  test("does not confuse a booking status field with a booking reference", async () => {
    const root = createTemporaryRoot();
    writeFixture(root, "trip-content.md", "booking: confirmed or pending\n");

    const findings = await scanPublication(root);

    expect(findingAt(findings, "trip-content.md", "privacy.booking-reference")).toBe(false);
  });

  test.each([
    { identifier: "PRIVATE_TOKEN", suffix: "T" },
    { identifier: "STRIPE_SECRET_KEY", suffix: "S" },
  ])("recognizes separator-rich generic secret identifier $identifier", async ({ identifier, suffix }) => {
    const root = createTemporaryRoot();
    const value = ["runtime_", suffix.repeat(28)].join("");
    writeFixture(root, "config.txt", `${identifier}=${value}\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "config.txt", "credential.generic-secret")).toBe(true);
    expect(JSON.stringify(findings).includes(value)).toBe(false);
  });

  test.each([
    { key: '"PRIVATE_TOKEN"', separator: ":", quote: '"', suffix: "J" },
    { key: "'STRIPE_SECRET_KEY'", separator: ":", quote: "'", suffix: "T" },
  ])("recognizes quoted secret key $key with a quoted value", async ({ key, separator, quote, suffix }) => {
    const root = createTemporaryRoot();
    const value = ["runtime_", suffix.repeat(28)].join("");
    writeFixture(root, "quoted-config.ts", `${key}${separator} ${quote}${value}${quote}\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "quoted-config.ts", "credential.generic-secret")).toBe(true);
    expect(JSON.stringify(findings).includes(value)).toBe(false);
  });

  test.each([
    {
      path: "src/main.tsx",
      contents: "const apiKey = environmentString(import.meta.env.VITE_GOOGLE_MAPS_API_KEY).trim();\n",
    },
    {
      path: "src/providers/google/GooglePlaceAdapter.ts",
      contents: "this.apiKey = options.apiKey.trim();\n",
    },
    {
      path: "src/providers/google/GoogleRouteAdapter.ts",
      contents: "this.apiKey = options.apiKey.trim();\n",
    },
  ])("does not treat the generated runtime expression in $path as a literal secret", async ({ path, contents }) => {
    const root = createTemporaryRoot();
    writeFixture(root, path, contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "credential.generic-secret")).toBe(false);
  });

  test.each([
    {
      name: "double-quoted JSX brace",
      source: (secret: string) => `const view = <Map apiKey={"${secret}"} />;\n`,
    },
    {
      name: "single-quoted JSX brace",
      source: (secret: string) => `const view = <Map apiKey={'${secret}'} />;\n`,
    },
    {
      name: "backtick JSX brace",
      source: (secret: string) => `const view = <Map apiKey={\`${secret}\`} />;\n`,
    },
    {
      name: "parenthesized assignment",
      source: (secret: string) => `const apiKey = ("${secret}");\n`,
    },
    {
      name: "nested brace and parenthesis",
      source: (secret: string) => `const view = <Map apiKey={(('${secret}'))} />;\n`,
    },
    {
      name: "typed const assignment",
      source: (secret: string) => `const apiKey: string = "${secret}";\n`,
    },
    {
      name: "generic typed assignment with comment",
      source: (secret: string) => `const apiKey: Readonly<string> = /* release value */ "${secret}";\n`,
    },
    {
      name: "comment-separated assignment",
      source: (secret: string) => `const apiKey /* release value */ = '${secret}';\n`,
    },
    {
      name: "block comment before literal",
      source: (secret: string) => `const token = /* release value */ \`${secret}\`;\n`,
    },
    {
      name: "line comment before literal",
      source: (secret: string) => `const token = // release value\n"${secret}";\n`,
    },
    {
      name: "JSX brace block comment",
      source: (secret: string) => `const view = <Map apiKey={/* release value */ "${secret}"} />;\n`,
    },
    {
      name: "JSX brace line comment",
      source: (secret: string) => `const view = <Map apiKey={// release value\n'${secret}'} />;\n`,
    },
    {
      name: "literal with as assertion",
      source: (secret: string) => `const apiKey = "${secret}" as string;\n`,
    },
    {
      name: "literal with as const assertion",
      source: (secret: string) => `const apiKey = '${secret}' as const;\n`,
    },
    {
      name: "literal with satisfies assertion",
      source: (secret: string) => `const token = \`${secret}\` satisfies string;\n`,
    },
    {
      name: "literal with as assertion before ASI identifier assignment",
      source: (secret: string) => [
        `const apiKey = "${secret}" as string`,
        "harmless = runtimeConfig()",
        "",
      ].join("\n"),
    },
    {
      name: "class literal with satisfies before adjacent member",
      source: (secret: string) => [
        "class RuntimeConfig {",
        `  apiKey = "${secret}" satisfies string`,
        "  harmless = runtimeConfig()",
        "}",
        "",
      ].join("\n"),
    },
    {
      name: "JSX literal with as const assertion",
      source: (secret: string) => `const view = <Map apiKey={"${secret}" as const} />;\n`,
    },
    {
      name: "JSX literal with satisfies assertion",
      source: (secret: string) => `const view = <Map apiKey={'${secret}' satisfies string} />;\n`,
    },
    {
      name: "literal after more than 512 whitespace characters",
      source: (secret: string) => `const apiKey =${" ".repeat(700)}"${secret}";\n`,
    },
    {
      name: "literal after more than 512 comment characters",
      source: (secret: string) => `const token = /* ${"release-trivia-".repeat(50)} */ '${secret}' as const;\n`,
    },
    {
      name: "literal inside one line comment boundary",
      source: (secret: string) => `// apiKey: "${secret}"\nconst harmless = runtimeConfig();\n`,
    },
    {
      name: "literal inside one block comment boundary",
      source: (secret: string) => `/* token = '${secret}' as const */\nconst harmless = runtimeConfig();\n`,
    },
    {
      name: "line-comment literal with trailing prose",
      source: (secret: string) => `// apiKey: "${secret}" rotate after the release window\nconst harmless = runtimeConfig();\n`,
    },
    {
      name: "block-comment literal with trailing prose",
      source: (secret: string) => `/* token = '${secret}' keep only for the release window */\nconst harmless = runtimeConfig();\n`,
    },
    {
      name: "assignment inside template interpolation",
      source: (secret: string) => `const note = \`prefix \${(config.apiKey = "${secret}")} suffix\`;\n`,
    },
    {
      name: "optional class field initializer",
      source: (secret: string) => `class RuntimeConfig { apiKey?: string = "${secret}"; }\n`,
    },
    {
      name: "definite class field initializer",
      source: (secret: string) => `class RuntimeConfig { token!: string = '${secret}'; }\n`,
    },
    {
      name: "nullish logical assignment",
      source: (secret: string) => `config.apiKey ??= "${secret}";\n`,
    },
    {
      name: "or logical assignment",
      source: (secret: string) => `config.token ||= '${secret}';\n`,
    },
    {
      name: "and logical assignment",
      source: (secret: string) => `config.secret &&= \`${secret}\`;\n`,
    },
    {
      name: "double-quoted computed key assignment",
      source: (secret: string) => `config["apiKey"] = "${secret}";\n`,
    },
    {
      name: "single-quoted computed key assignment",
      source: (secret: string) => `config['token'] = '${secret}';\n`,
    },
    {
      name: "TypeScript prefix assertion",
      path: "src/prefix-assertion.ts",
      source: (secret: string) => `const apiKey = <string>"${secret}";\n`,
    },
    {
      name: "multiline union typed initializer",
      path: "src/multiline-union.ts",
      source: (secret: string) => [
        "class RuntimeConfig {",
        "  apiKey:",
        "    string |",
        "    undefined",
        `    = "${secret}"`,
        "}",
        "",
      ].join("\n"),
    },
    {
      name: "multiline intersection typed initializer",
      path: "src/multiline-intersection.ts",
      source: (secret: string) => [
        "class RuntimeConfig {",
        "  token:",
        "    RuntimeToken &",
        "    BrandedToken",
        `    = "${secret}"`,
        "}",
        "",
      ].join("\n"),
    },
    {
      name: "qualified generic multiline typed initializer",
      path: "src/qualified-generic.ts",
      source: (secret: string) => [
        "class RuntimeConfig {",
        "  secret:",
        "    Runtime",
        "      .Credential<",
        "        string",
        "      >",
        `    = "${secret}"`,
        "}",
        "",
      ].join("\n"),
    },
    {
      name: "typed initializer after more than 128 type tokens",
      path: "src/long-type.ts",
      source: (secret: string) => {
        const typeMembers = Array.from({ length: 140 }, (_, index) => `Type${index}`).join(" | ");
        return `const apiKey: ${typeMembers} = "${secret}";\n`;
      },
    },
  ])("rejects a $name literal without echoing it", async ({ name, source, path }) => {
    const root = createTemporaryRoot();
    const secret = ["runtime", "_", name[0], "L".repeat(27)].join("");
    const fixturePath = path ?? "src/literal-props.tsx";
    writeFixture(root, fixturePath, source(secret));

    const findings = await scanPublication(root);

    expect(findingAt(findings, fixturePath, "credential.generic-secret")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    "const view = <Map apiKey={runtimeKey} />;\n",
    "const view = <Map apiKey={(options.apiKey)} />;\n",
    "const view = <Map apiKey={environmentString(runtimeConfig())} />;\n",
    "const view = <Map apiKey={(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)} />;\n",
    "const view = <Map apiKey={process.env.GOOGLE_MAPS_API_KEY} />;\n",
    "const apiKey: string = options.apiKey;\n",
    "const apiKey = /* runtime */ runtimeConfig();\n",
    "const apiKey = runtimePrefix + options.apiKey;\n",
    "const apiKey = \"runtime_fallback_value\" + options.apiKey;\n",
    "const apiKey = \"runtime_fallback_value\" as string + options.apiKey;\n",
    "const view = <Map apiKey={/* runtime */ import.meta.env.VITE_GOOGLE_MAPS_API_KEY} />;\n",
    "const view = <Map apiKey={// runtime\nruntimeConfig()} />;\n",
    "const apiKey = runtimeTag`runtime_fallback_value`;\n",
    "const view = <Map apiKey={runtimeTag`runtime_fallback_value`} />;\n",
    "const apiKey = runtimeTag`runtime_${runtimeSuffix}`;\n",
    "const apiKey = `runtime_${runtimeSuffix}`;\n",
    "const note = `apiKey = \"runtime_harmless_literal_value\"`;\n",
    "const note = `prefix ${runtimeConfig()} suffix`;\n",
    "class RuntimeConfig { apiKey?: string = options.apiKey; }\n",
    "class RuntimeConfig { token!: string = runtimeToken(); }\n",
    "config.apiKey ??= options.apiKey;\n",
    "config.token ||= runtimeToken();\n",
    "config.secret &&= process.env.SECRET;\n",
    "config[\"apiKey\"] = runtimeConfig();\n",
    "config['token'] = options.token;\n",
    "const apiKey = <string>options.apiKey;\n",
    "const token = <string>runtimeConfig();\n",
    "const apiKey = <string>import.meta.env.VITE_GOOGLE_MAPS_API_KEY;\n",
    [
      "interface RuntimeOptions {",
      "  apiKey: string",
      "}",
      "const harmless = \"runtime_harmless_literal_value\";",
      "",
    ].join("\n"),
    [
      "// apiKey:",
      "const harmless = 'runtime_harmless_literal_value';",
      "",
    ].join("\n"),
    [
      "/* apiKey: */",
      "const harmless = `runtime_harmless_literal_value`;",
      "",
    ].join("\n"),
    [
      "const config = {",
      "  apiKey: runtimeKey,",
      "  label: \"runtime_harmless_literal_value\",",
      "};",
      "",
    ].join("\n"),
    [
      "class RuntimeConfig {",
      "  apiKey: string",
      "  harmless = \"runtime_harmless_literal_value\"",
      "}",
      "",
    ].join("\n"),
    [
      "class RuntimeConfig {",
      "  apiKey?: string",
      "  harmless = 'runtime_harmless_literal_value'",
      "}",
      "",
    ].join("\n"),
    [
      "class RuntimeConfig {",
      "  token!: string",
      "  harmless = `runtime_harmless_literal_value`",
      "}",
      "",
    ].join("\n"),
    [
      "// apiKey: configured by the runtime host",
      "const harmless = \"runtime_harmless_literal_value\";",
      "",
    ].join("\n"),
    [
      "// apiKey: configured by the runtime host",
      "// the example text is \"runtime_harmless_literal_value\"",
      "",
    ].join("\n"),
    [
      "const apiKey = options.apiKey as string",
      "harmless = \"runtime_harmless_literal_value\"",
      "",
    ].join("\n"),
    [
      "class RuntimeConfig {",
      "  apiKey = options.apiKey satisfies string",
      "  harmless = \"runtime_harmless_literal_value\"",
      "}",
      "",
    ].join("\n"),
  ])("accepts a non-literal JSX runtime expression %#", async (contents) => {
    const root = createTemporaryRoot();
    writeFixture(root, "src/runtime-props.tsx", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/runtime-props.tsx", "credential.generic-secret")).toBe(false);
  });

  test.each([
    {
      name: "line comment with unquoted value and trailing prose",
      source: (secret: string) => `// apiKey: ${secret} rotate after the release window\n`,
    },
    {
      name: "block comment with unquoted value and trailing prose",
      source: (secret: string) => `/* token = ${secret} keep only for the release window */\n`,
    },
  ])("rejects a $name without scanning beyond its comment", async ({ name, source }) => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", name[0], "C".repeat(27)].join("");
    writeFixture(root, "src/comment-secret.ts", source(secret));

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/comment-secret.ts", "credential.generic-secret")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    {
      name: "unterminated double-quoted string",
      source: (secret: string) => `const apiKey = "${secret}`,
    },
    {
      name: "unterminated single-quoted string",
      source: (secret: string) => `const token = '${secret}`,
    },
    {
      name: "unterminated template",
      source: (secret: string) => `const token = \`${secret}`,
    },
    {
      name: "unterminated block comment",
      source: (secret: string) => `/* apiKey: ${secret}`,
    },
    {
      name: "unterminated regular expression",
      source: () => "const matcher = /unterminated[abc",
    },
    {
      name: "unmatched opening parenthesis",
      source: () => "const value = (runtimeConfig();\n",
    },
    {
      name: "unmatched opening bracket",
      source: () => "const value = [runtimeConfig();\n",
    },
    {
      name: "unmatched opening brace",
      source: () => "function readRuntime() { return runtimeConfig();\n",
    },
    {
      name: "unmatched closing parenthesis",
      source: () => "const value = runtimeConfig());\n",
    },
    {
      name: "unmatched closing bracket",
      source: () => "const value = runtimeConfig()];\n",
    },
    {
      name: "unmatched closing brace",
      source: () => "const value = runtimeConfig(); }\n",
    },
    {
      name: "unterminated nested template interpolation",
      source: () => "const note = `prefix ${(() => { return runtimeConfig(); })()",
    },
    {
      name: "unmatched delimiter inside template interpolation",
      source: () => "const note = `prefix ${([runtimeConfig())}`;\n",
    },
  ])("fails closed with a stable finding for $name", async ({ name, source }) => {
    const root = createTemporaryRoot();
    const sensitiveValue = ["runtime_", name[0], "M".repeat(27)].join("");
    writeFixture(root, "src/malformed.ts", source(sensitiveValue));

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/malformed.ts", "scan.malformed-code")).toBe(true);
    expect(findings.find((finding) => finding.code === "scan.malformed-code")?.severity).toBe("error");
    expect(JSON.stringify(findings)).not.toContain(sensitiveValue);
  });

  test("fails closed instead of silently bypassing an exhausted syntax-analysis budget", async () => {
    const root = createTemporaryRoot();
    const elements = Array.from({ length: 120_000 }, () => "0").join(",");
    const contents = `const values = [${elements}];\n`;
    expectTypeScriptSyntaxValid(contents);
    writeFixture(root, "src/adversarial-syntax.ts", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/adversarial-syntax.ts", "scan.analysis-limit")).toBe(true);
    expect(findings.find((finding) => finding.code === "scan.analysis-limit")?.severity).toBe("error");
  });

  test.each([
    ["runtime-config.txt", "PRIVATE_TOKEN=process.env.PRIVATE_TOKEN\n"],
    ["runtime-config.yaml", "apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY\n"],
    ["runtime-config.json", '{"apiKey":"process.env.PRIVATE_TOKEN"}\n'],
  ])("accepts a non-code runtime environment reference in %s", async (path, contents) => {
    const root = createTemporaryRoot();
    writeFixture(root, path, contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "credential.generic-secret")).toBe(false);
  });

  test("accepts a valid CommonJS source without incompatible parser options", async () => {
    const root = createTemporaryRoot();
    writeFixture(root, "src/runtime-config.cjs", "module.exports = { apiKey: runtimeConfig() };\n");

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/runtime-config.cjs", "scan.malformed-code")).toBe(false);
    expect(findingAt(findings, "src/runtime-config.cjs", "credential.generic-secret")).toBe(false);
  });

  test("stops a postfix type at an ASI-delimited member assignment", async () => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", "A".repeat(28)].join("");
    const source = [
      `const apiKey = "${secret}" as string`,
      "config.harmless = runtimeConfig()",
      "",
    ].join("\n");
    expectTypeScriptSyntaxValid(source);
    writeFixture(root, "src/postfix-member-asi.ts", source);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/postfix-member-asi.ts", "credential.generic-secret")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test("does not cross an uninitialized typed declaration into a member assignment", async () => {
    const root = createTemporaryRoot();
    const source = [
      "let apiKey: string",
      'config.harmless = "runtime_harmless_literal_value"',
      "",
    ].join("\n");
    expectTypeScriptSyntaxValid(source);
    writeFixture(root, "src/typed-member-asi.ts", source);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/typed-member-asi.ts", "credential.generic-secret")).toBe(false);
  });

  test.each([
    {
      name: "control head",
      source: (secret: string) => `if (ready) /apiKey="${secret}";/.test(value);\n`,
    },
    {
      name: "statement block",
      source: (secret: string) => `{} /apiKey="${secret}";/.test(value);\n`,
    },
  ])("accepts a regex expression statement after a $name", async ({ name, source }) => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", name[0], "R".repeat(27)].join("");
    const contents = source(secret);
    expect(() => new Script(contents)).not.toThrow();
    writeFixture(root, "src/regex-statement.js", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/regex-statement.js", "credential.generic-secret")).toBe(false);
    expect(findingAt(findings, "src/regex-statement.js", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    "const ratio = service.if(ready) / divisor;\n",
    "const ratio = {} / divisor;\n",
  ])("keeps a slash in the parser-valid division expression %#", async (contents) => {
    const root = createTemporaryRoot();
    expect(() => new Script(contents)).not.toThrow();
    writeFixture(root, "src/division-expression.js", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/division-expression.js", "scan.malformed-code")).toBe(false);
    expect(findingAt(findings, "src/division-expression.js", "credential.generic-secret")).toBe(false);
  });

  test("fails closed for a regex literal escaped across an LF", async () => {
    const root = createTemporaryRoot();
    const contents = ["const matcher = /abc", "\\", "\n", "/;\n"].join("");
    expect(() => new Script(contents)).toThrow(SyntaxError);
    writeFixture(root, "src/escaped-regex-line.js", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/escaped-regex-line.js", "scan.malformed-code")).toBe(true);
  });

  test("accepts a quoted string continued across CRLF", async () => {
    const root = createTemporaryRoot();
    const contents = ['const note = "hello', "\\", "\r\n", 'world";\n'].join("");
    expect(() => new Script(contents)).not.toThrow();
    writeFixture(root, "src/crlf-string-continuation.js", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/crlf-string-continuation.js", "scan.malformed-code")).toBe(false);
  });

  test("detects a credential literal assigned through an escaped identifier", async () => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", "E".repeat(28)].join("");
    const contents = ["const api", "\\", `u004bey = "${secret}";\n`].join("");
    expectTypeScriptSyntaxValid(contents);
    writeFixture(root, "src/escaped-key.ts", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/escaped-key.ts", "credential.generic-secret")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test("unwraps balanced parentheses around a static computed key", async () => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", "P".repeat(28)].join("");
    const contents = `config[(("apiKey"))] = "${secret}";\n`;
    expect(() => new Script(contents)).not.toThrow();
    writeFixture(root, "src/parenthesized-key.js", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/parenthesized-key.js", "credential.generic-secret")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    {
      name: "newline as type",
      source: (secret: string) => `const apiKey = "${secret}" as\n string;\n`,
    },
    {
      name: "newline satisfies type",
      source: (secret: string) => `const apiKey = "${secret}" satisfies\n string;\n`,
    },
    {
      name: "Unicode line-separator ASI",
      source: (secret: string) =>
        `const apiKey = "${secret}" as string\u2028config.harmless = runtimeConfig();\n`,
    },
    {
      name: "multiline predicate type",
      source: (secret: string) =>
        `const apiKey: ((value: unknown) => value is\n string) = "${secret}" as never;\n`,
    },
    {
      name: "multiline abstract constructor type",
      source: (secret: string) =>
        `const apiKey: abstract\n new () => string = "${secret}" as never;\n`,
    },
    {
      name: "asserted parenthesized computed key",
      source: (secret: string) =>
        `config[(("apiKey" as const))] = "${secret}";\n`,
    },
  ])("rejects a direct literal across the $name grammar boundary", async ({ name, source }) => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", name[0], "N".repeat(27)].join("");
    const contents = source(secret);
    expectTypeScriptSyntaxValid(contents);
    writeFixture(root, "src/round-six-types.ts", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/round-six-types.ts", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "src/round-six-types.ts", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test("keeps a Unicode line-separator boundary after an uninitialized typed declaration", async () => {
    const root = createTemporaryRoot();
    const contents = [
      "let apiKey: string",
      'config.harmless = "runtime_harmless_literal_value";',
      "",
    ].join("\u2028");
    expectTypeScriptSyntaxValid(contents);
    writeFixture(root, "src/unicode-typed-boundary.ts", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/unicode-typed-boundary.ts", "credential.generic-secret")).toBe(false);
    expect(findingAt(findings, "src/unicode-typed-boundary.ts", "scan.malformed-code")).toBe(false);
  });

  test.each([
    {
      name: "class declaration",
      source: (secret: string) => `class C {} /apiKey="${secret}";/.test(value);\n`,
    },
    {
      name: "try/catch statement",
      source: (secret: string) => `try {} catch {} /apiKey="${secret}";/.test(value);\n`,
    },
    {
      name: "labeled block",
      source: (secret: string) => `label: {} /apiKey="${secret}";/.test(value);\n`,
    },
    {
      name: "function-expression division",
      source: () => "const ratio = function () {} / divisor;\n",
    },
  ])("accepts parser-valid regex/division context after a $name", async ({ name, source }) => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", name[0], "R".repeat(27)].join("");
    const contents = source(secret);
    expect(() => new Script(contents)).not.toThrow();
    writeFixture(root, "src/round-six-regex.js", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/round-six-regex.js", "credential.generic-secret")).toBe(false);
    expect(findingAt(findings, "src/round-six-regex.js", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    {
      path: "src/literal-binding.vue",
      source: (secret: string) => `<Map :api-key="'${secret}'" />\n`,
    },
    {
      path: "src/literal-binding.svelte",
      source: (secret: string) => `<Map api-key={ "${secret}" } />\n`,
    },
    {
      path: "src/literal-binding.astro",
      source: (secret: string) => `<Map api-key={ "${secret}" } />\n`,
    },
    {
      path: "src/unquoted-binding.vue",
      source: (secret: string) => `<Map api-key=${secret} />\n`,
    },
    {
      path: "src/unquoted-binding.svelte",
      source: (secret: string) => `<Map api-key=${secret} />\n`,
    },
    {
      path: "src/unquoted-binding.astro",
      source: (secret: string) => `<Map api-key=${secret} />\n`,
    },
  ])("rejects a static live-markup credential in $path", async ({ path, source }) => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", basename(path)[0], "M".repeat(27)].join("");
    writeFixture(root, path, source(secret));

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "credential.generic-secret")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    {
      path: "src/script-string.vue",
      contents: (secret: string) => [
        '<script setup lang="ts">',
        `const snippet = '<Map api-key="${secret}" />';`,
        "const apiKey = runtimeConfig();",
        "</script>",
        '<template><Map :api-key="runtimeKey" /></template>',
        "",
      ].join("\n"),
    },
    {
      path: "src/script-string.svelte",
      contents: (secret: string) => [
        '<script lang="ts">',
        `const snippet = '<Map api-key="${secret}" />';`,
        "const apiKey = runtimeConfig();",
        "</script>",
        "<Map api-key={runtimeKey} />",
        "",
      ].join("\n"),
    },
    {
      path: "src/frontmatter-string.astro",
      contents: (secret: string) => [
        "---",
        `const snippet = '<Map api-key="${secret}" />';`,
        "const apiKey = runtimeConfig();",
        "---",
        "<Map api-key={runtimeKey} />",
        "",
      ].join("\n"),
    },
    {
      path: "src/raw-style.vue",
      contents: (secret: string) => [
        "<style>",
        `.example::before { content: '<Map api-key="${secret}" />'; }`,
        "</style>",
        '<template><Map :api-key="runtimeKey" /></template>',
        "",
      ].join("\n"),
    },
  ])("does not scan script/frontmatter/style strings as live markup in $path", async ({ path, contents }) => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", basename(path)[0], "S".repeat(27)].join("");
    writeFixture(root, path, contents(secret));

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "credential.generic-secret")).toBe(false);
    expect(findingAt(findings, path, "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    ["src/unclosed-script.vue", '<script setup lang="ts">\nconst apiKey = runtimeConfig();\n'],
    ["src/unclosed-frontmatter.astro", "---\nconst apiKey = runtimeConfig();\n"],
    ["src/unclosed-binding.svelte", '<Map api-key={"runtime_literal_value" />\n'],
  ])("fails closed for malformed component source in %s", async (path, contents) => {
    const root = createTemporaryRoot();
    writeFixture(root, path, contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "scan.malformed-code")).toBe(true);
  });

  test("fails closed when component expression-boundary analysis is exhausted", async () => {
    const root = createTemporaryRoot();
    const adversarialLiteral = "}".repeat(600);
    writeFixture(root, "src/adversarial-binding.svelte", `<Map api-key={"${adversarialLiteral}"} />\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/adversarial-binding.svelte", "scan.analysis-limit")).toBe(true);
    expect(findings.find((finding) => finding.code === "scan.analysis-limit")?.severity).toBe("error");
  });

  test.each(["vue", "svelte", "astro"])(
    "detects a static hyphenated markup credential attribute in .%s",
    async (extension) => {
      const root = createTemporaryRoot();
      const secret = ["runtime_", extension[0], "H".repeat(27)].join("");
      const path = `src/static-attribute.${extension}`;
      writeFixture(root, path, `<Map api-key="${secret}" />\n`);

      const findings = await scanPublication(root);

      expect(findingAt(findings, path, "credential.generic-secret")).toBe(true);
      expect(JSON.stringify(findings)).not.toContain(secret);
    },
  );

  test.each([
    ["src/dynamic-attribute.vue", '<Map :api-key="runtimeKey" />\n'],
    ["src/dynamic-attribute.svelte", "<Map api-key={runtimeKey} />\n"],
    ["src/dynamic-attribute.astro", "<Map api-key={runtimeKey} />\n"],
    ["src/escaped-runtime.ts", ["const api", "\\", "u004bey = options.apiKey;\n"].join("")],
    ["src/dynamic-computed.ts", 'config[((runtimeKey))] = "runtime_harmless_literal_value";\n'],
    ["src/dynamic-computed-name.ts", 'config[apiKey] = "runtime_harmless_literal_value";\n'],
    ["src/dynamic-object-key.ts", 'const config = { [apiKey]: "runtime_harmless_literal_value" };\n'],
  ])("accepts the dynamic static-key lookalike in %s", async (path, contents) => {
    const root = createTemporaryRoot();
    writeFixture(root, path, contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "credential.generic-secret")).toBe(false);
  });

  test.each([
    {
      name: "private field initializer",
      source: (secret: string) => `class Vault { #apiKey = "${secret}"; }\n`,
    },
    {
      name: "private member assignment",
      source: (secret: string) => [
        "class Vault {",
        "  #apiKey = runtimeConfig();",
        `  replace() { this.#apiKey = "${secret}"; }`,
        "}",
        "",
      ].join("\n"),
    },
  ])("rejects a literal credential in a $name", async ({ name, source }) => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", name[0], "P".repeat(27)].join("");
    const contents = source(secret);
    expectTypeScriptSyntaxValid(contents);
    writeFixture(root, "src/private-key.ts", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/private-key.ts", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "src/private-key.ts", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test("accepts runtime values for private credential-shaped fields and members", async () => {
    const root = createTemporaryRoot();
    const contents = [
      "class Vault {",
      "  #apiKey = runtimeConfig();",
      "  replace(options: { apiKey: string }) { this.#apiKey = options.apiKey; }",
      "}",
      "",
    ].join("\n");
    expectTypeScriptSyntaxValid(contents);
    writeFixture(root, "src/private-runtime.ts", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/private-runtime.ts", "credential.generic-secret")).toBe(false);
    expect(findingAt(findings, "src/private-runtime.ts", "scan.malformed-code")).toBe(false);
  });

  test.each([
    ["event shorthand with modifiers", (secret: string) => `<button @click.stop.prevent="apiKey = '${secret}'; submit()" />\n`],
    ["v-on argument with modifiers", (secret: string) => `<button v-on:click.once="apiKey = '${secret}'; submit()" />\n`],
  ])("scans Vue $name as handler statements", async (name, source) => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", name[0], "V".repeat(27)].join("");
    writeFixture(root, "src/vue-handler.vue", source(secret));

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/vue-handler.vue", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "src/vue-handler.vue", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    ["v-if", (secret: string) => `apiKey = '${secret}'`],
    ["v-else-if", (secret: string) => `apiKey = '${secret}'`],
    ["v-show", (secret: string) => `apiKey = '${secret}'`],
    ["v-html", (secret: string) => `(apiKey = '${secret}', html)`],
    ["v-text", (secret: string) => `(apiKey = '${secret}', text)`],
    ["v-model", (secret: string) => `form[apiKey = '${secret}']`],
  ])("scans the Vue %s expression directive", async (directive, value) => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", directive[2], "E".repeat(27)].join("");
    writeFixture(root, "src/vue-expression.vue", `<section ${directive}="${value(secret)}" />\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/vue-expression.vue", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "src/vue-expression.vue", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    ["v-for iterable", (secret: string) => `<li v-for="item in (apiKey = '${secret}', items)" />\n`],
    ["dynamic bind argument", (secret: string) => `<Map :[field].prop="apiKey = '${secret}'" />\n`],
    ["dynamic event argument", (secret: string) => `<Map @[event].once="apiKey = '${secret}'; run()" />\n`],
    ["custom directive", (secret: string) => `<Map v-audit="apiKey = '${secret}'" />\n`],
  ])("scans the Vue %s executable surface", async (surface, source) => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", surface[0], "D".repeat(27)].join("");
    writeFixture(root, "src/vue-surface.vue", source(secret));

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/vue-surface.vue", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "src/vue-surface.vue", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    ["src/vue-runtime-handler.vue", '<button @click.stop="submit(options.apiKey); count += 1" />\n'],
    ["src/vue-runtime-expression.vue", '<section v-if="runtimeConfig()" v-show="options.visible" />\n'],
    ["src/vue-runtime-for.vue", '<li v-for="(item, index) in runtimeItems" :key="item.id" />\n'],
    ["src/vue-runtime-dynamic.vue", '<Map :[field].prop="runtimeKey" @[event].once="handle(runtimeKey)" />\n'],
    ["src/vue-static-custom.vue", '<Map custom-handler="apiKey = \'runtime_harmless_literal_value\'" />\n'],
  ])("accepts the harmless Vue surface in %s", async (path, contents) => {
    const root = createTemporaryRoot();
    writeFixture(root, path, contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "credential.generic-secret")).toBe(false);
    expect(findingAt(findings, path, "scan.malformed-code")).toBe(false);
  });

  test.each([
    ["src/vue-malformed-handler.vue", '<button @click="apiKey =" />\n'],
    ["src/vue-malformed-directive.vue", '<Map v-audit="apiKey =" />\n'],
    ["src/vue-malformed-argument.vue", '<Map :[field="runtimeKey" />\n'],
    ["src/vue-empty-event.vue", '<button @="run()" />\n'],
  ])("fails closed without echo for malformed Vue syntax in %s", async (path, contents) => {
    const root = createTemporaryRoot();
    writeFixture(root, path, contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "scan.malformed-code")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(contents);
  });

  test.each([
    ["attribute pipe modifier", (secret: string) => `<button on:click|once|preventDefault={() => { apiKey = "${secret}"; }} />\n`],
    ["ordinary brace expression", (secret: string) => `<p>{apiKey = "${secret}"}</p>\n`],
    ["spread expression", (secret: string) => `<Widget {...{ apiKey: "${secret}" }} />\n`],
    ["if block", (secret: string) => `{#if apiKey = "${secret}"}<p />{/if}\n`],
    ["each iterable", (secret: string) => `{#each (apiKey = "${secret}", items) as item}<p />{/each}\n`],
    ["await with then shorthand", (secret: string) => `{#await (apiKey = "${secret}", promise) then value}<p />{/await}\n`],
    ["await expression containing then text", (secret: string) => `{#await (apiKey = "${secret}", getPromise(" then "))}<p />{/await}\n`],
    ["else-if branch", (secret: string) => `{:else if apiKey = "${secret}"}\n`],
    ["then shorthand", (secret: string) => `{:then apiKey = "${secret}"}\n`],
    ["catch shorthand", (secret: string) => `{:catch apiKey = "${secret}"}\n`],
    ["html tag", (secret: string) => `{@html apiKey = "${secret}"}\n`],
    ["debug tag", (secret: string) => `{@debug apiKey = "${secret}"}\n`],
    ["const tag", (secret: string) => `{@const apiKey = "${secret}"}\n`],
    ["render tag", (secret: string) => `{@render render(apiKey = "${secret}")}\n`],
  ])("scans a credential assignment in the Svelte %s", async (surface, source) => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", surface[0], "S".repeat(27)].join("");
    writeFixture(root, "src/svelte-surface.svelte", source(secret));

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/svelte-surface.svelte", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "src/svelte-surface.svelte", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    ["src/svelte-runtime-event.svelte", '<button on:click|once={handleClick} />\n'],
    ["src/svelte-runtime-if.svelte", "{#if ready}<p />{:else if later}<p />{:else}<p />{/if}\n"],
    ["src/svelte-runtime-each.svelte", "{#each items as item, index (item.id)}<p />{/each}\n"],
    ["src/svelte-runtime-await.svelte", "{#await promise then value}<p />{:catch error}<p />{/await}\n"],
    ["src/svelte-runtime-await-text.svelte", "{#await getPromise(\" then \")}<p />{/await}\n"],
    ["src/svelte-runtime-tags.svelte", "{@html safeHtml}{@debug safeValue}{@const value = derive()}{@render render(value)}\n"],
  ])("accepts bounded harmless Svelte syntax in %s", async (path, contents) => {
    const root = createTemporaryRoot();
    writeFixture(root, path, contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "credential.generic-secret")).toBe(false);
    expect(findingAt(findings, path, "scan.malformed-code")).toBe(false);
  });

  test.each([
    ["src/svelte-malformed-block.svelte", "{#await promise then}<p />\n"],
    ["src/svelte-malformed-tag.svelte", "{@render apiKey = }\n"],
    ["src/svelte-empty-if.svelte", "{#if}<p />\n"],
    ["src/svelte-unsupported-block.svelte", "{#key runtimeConfig()}<p />{/key}\n"],
  ])("fails closed without echo for malformed Svelte syntax in %s", async (path, contents) => {
    const root = createTemporaryRoot();
    writeFixture(root, path, contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "scan.malformed-code")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(contents);
  });

  test.each([
    ["ordinary expression", (secret: string) => `<p>{apiKey = "${secret}"}</p>\n`],
    ["spread expression", (secret: string) => `<Widget {...{ apiKey: "${secret}" }} />\n`],
  ])("scans the Astro %s surface", async (surface, source) => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", surface[0], "A".repeat(27)].join("");
    writeFixture(root, "src/astro-surface.astro", source(secret));

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/astro-surface.astro", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "src/astro-surface.astro", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test("accepts a harmless Astro brace comment", async () => {
    const root = createTemporaryRoot();
    writeFixture(root, "src/astro-comment.astro", "{/* public rendering note */}<p />\n");

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/astro-comment.astro", "credential.generic-secret")).toBe(false);
    expect(findingAt(findings, "src/astro-comment.astro", "scan.malformed-code")).toBe(false);
  });

  test("accepts an Astro expression preceded by a harmless brace comment", async () => {
    const root = createTemporaryRoot();
    writeFixture(root, "src/astro-comment-expression.astro", "{/* rendering note */ runtimeValue}<p />\n");

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/astro-comment-expression.astro", "credential.generic-secret")).toBe(false);
    expect(findingAt(findings, "src/astro-comment-expression.astro", "scan.malformed-code")).toBe(false);
  });

  test("rejects a credential-shaped Astro brace comment without echoing it", async () => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", "C".repeat(28)].join("");
    writeFixture(root, "src/astro-secret-comment.astro", `{/* apiKey = ${secret} trailing prose */}<p />\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/astro-secret-comment.astro", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "src/astro-secret-comment.astro", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test("rejects a credential-shaped Astro comment before an expression", async () => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", "B".repeat(28)].join("");
    writeFixture(root, "src/astro-secret-comment-expression.astro", `{/* apiKey = ${secret} */ runtimeValue}<p />\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/astro-secret-comment-expression.astro", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "src/astro-secret-comment-expression.astro", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test("fails closed for an unterminated Astro brace comment", async () => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", "U".repeat(28)].join("");
    writeFixture(root, "src/astro-malformed-comment.astro", `{/* apiKey = ${secret} }<p />\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/astro-malformed-comment.astro", "scan.malformed-code")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    {
      path: "src/live-entity.vue",
      source: (secret: string) => `<p>accessToken&#58; runtime&#95;${secret}</p>\n`,
    },
    {
      path: "src/live-entity.svelte",
      source: (secret: string) => `<p>clientSecret&colon; runtime&lowbar;${secret}</p>\n`,
    },
    {
      path: "src/live-entity.astro",
      source: (secret: string) => `<p>refreshToken&#x3d;runtime&#x5f;${secret}</p>\n`,
    },
  ])("decodes a live-text credential once in $path", async ({ path, source }) => {
    const root = createTemporaryRoot();
    const suffix = [basename(path)[0], "E".repeat(27)].join("");
    const secret = `runtime_${suffix}`;
    writeFixture(root, path, source(suffix));

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, path, "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test("decodes an exact Google-key shape split by a numeric entity in live text", async () => {
    const root = createTemporaryRoot();
    const googleKey = ["AI", "za", "G".repeat(35)].join("");
    writeFixture(root, "src/live-google.vue", `<p>AI&#122;a${"G".repeat(35)}</p>\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/live-google.vue", "credential.google-api-key")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(googleKey);
  });

  test.each([
    {
      path: "src/live-bearer.svelte",
      code: "credential.bearer-token",
      source: (secret: string) => `<p>Bearer&#32;${secret}</p>\n`,
    },
    {
      path: "src/live-private-url.astro",
      code: "credential.private-url",
      source: (secret: string) => `<p>https://private.invalid/path?api_key&#61;${secret}</p>\n`,
    },
  ])("applies $code detection to decoded ordinary text", async ({ path, code, source }) => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", basename(path)[0], "L".repeat(27)].join("");
    writeFixture(root, path, source(secret));

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, code)).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test("decodes a semicolonless numeric reference in a literal markup attribute", async () => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", "N".repeat(28)].join("");
    writeFixture(root, "src/entity-attribute.vue", `<Map api-key="runtime&#95${"N".repeat(28)}" />\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/entity-attribute.vue", "credential.generic-secret")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test("applies exact detectors to an entity-decoded literal markup attribute", async () => {
    const root = createTemporaryRoot();
    const googleKey = ["AI", "za", "T".repeat(35)].join("");
    writeFixture(root, "src/entity-literal.vue", `<Map data-note="AI&#122;a${"T".repeat(35)}" />\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/entity-literal.vue", "credential.google-api-key")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(googleKey);
  });

  test("decodes quoted Vue directive source before parsing it", async () => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", "V".repeat(28)].join("");
    writeFixture(
      root,
      "src/entity-directive.vue",
      `<button @click="ready &amp;&amp; (apiKey = &quot;${secret}&quot;)" />\n`,
    );

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/entity-directive.vue", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "src/entity-directive.vue", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test("does not recursively decode a doubly encoded live literal", async () => {
    const root = createTemporaryRoot();
    const googleKey = ["AI", "za", "D".repeat(35)].join("");
    writeFixture(root, "src/double-entity.vue", `<p>AI&amp;#122;a${"D".repeat(35)}</p>\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/double-entity.vue", "credential.google-api-key")).toBe(false);
    expect(findingAt(findings, "src/double-entity.vue", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(googleKey);
  });

  test.each([
    ["unknown", "<p>apiKey&unknown;: runtime_UUUUUUUUUUUUUUUUUUUUUUUUUUUU</p>\n"],
    ["invalid numeric", "<p>apiKey&#x110000;: runtime_IIIIIIIIIIIIIIIIIIIIIIIIIIII</p>\n"],
  ])("leaves an %s entity literal", async (label, contents) => {
    const root = createTemporaryRoot();
    const path = `src/entity-${label.replace(" ", "-")}.vue`;
    writeFixture(root, path, contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "credential.generic-secret")).toBe(false);
    expect(findingAt(findings, path, "scan.malformed-code")).toBe(false);
  });

  test.each([
    ["src/entity-script.vue", `<script>const note = "AI&#122;a${"R".repeat(35)}";</script>\n`],
    ["src/entity-style.svelte", `<style>.note::after { content: "AI&#122;a${"R".repeat(35)}"; }</style>\n`],
    ["src/entity-frontmatter.astro", `---\nconst note = "AI&#122;a${"R".repeat(35)}";\n---\n<p />\n`],
    ["src/entity-brace.svelte", `<p>{"AI&#122;a${"R".repeat(35)}"}</p>\n`],
    ["src/entity-comment.vue", `<!-- AI&#122;a${"R".repeat(35)} -->\n`],
  ])("does not entity-decode raw code, style, frontmatter, brace, or comment content in %s", async (path, contents) => {
    const root = createTemporaryRoot();
    writeFixture(root, path, contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "credential.google-api-key")).toBe(false);
    expect(findingAt(findings, path, "scan.malformed-code")).toBe(false);
  });

  test.each([
    ["src/access-token.js", (secret: string) => `const accessToken = "${secret}";\n`],
    ["src/refresh-token.ts", (secret: string) => `class Config { refreshToken: string = "${secret}"; }\n`],
    ["src/authorization-token.ts", (secret: string) => `class Config { #authorizationToken = "${secret}"; }\n`],
    ["src/client-secret.ts", (secret: string) => `config.clientSecret = "${secret}";\n`],
    ["src/google-maps-key.ts", (secret: string) => `const config = { googleMapsApiKey: "${secret}" };\n`],
    ["src/bearer-token.ts", (secret: string) => `const bearerToken = "${secret}";\n`],
    ["src/session-cookie.tsx", (secret: string) => `const view = <Map sessionCookie="${secret}" />;\n`],
    ["src/user-password.vue", (secret: string) => `<Map user-password="${secret}" />\n`],
    ["src/pascal-token.ts", (secret: string) => `const AccessToken = "${secret}";\n`],
    ["src/acronym-key.ts", (secret: string) => `const GoogleMapsAPIKey = "${secret}";\n`],
  ])("canonicalizes a credential-shaped camel/Pascal/snake/kebab name in %s", async (path, source) => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", basename(path)[0], "C".repeat(27)].join("");
    writeFixture(root, path, source(secret));

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, path, "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    ["config.json", (secret: string) => `{"bearerToken":"${secret}"}\n`],
    ["config.yaml", (secret: string) => `session_cookie: ${secret}\n`],
    ["config.ini", (secret: string) => `google-maps-api-key=${secret}\n`],
    ["notes.txt", (secret: string) => `clientSecret = ${secret} trailing prose\n`],
    ["src/comment-name.ts", (secret: string) => `// userPassword = ${secret} trailing prose\n`],
  ])("shares credential-name canonicalization with non-code scanning in %s", async (path, source) => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", basename(path)[0], "K".repeat(27)].join("");
    writeFixture(root, path, source(secret));

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "credential.generic-secret")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each(["monkey", "tokenize", "passwordless", "secretary"])(
    "does not treat the lookalike name %s as a credential",
    async (name) => {
      const root = createTemporaryRoot();
      const secret = ["runtime_", name[0], "H".repeat(27)].join("");
      writeFixture(root, "src/name-lookalike.ts", `const ${name} = "${secret}";\n`);
      writeFixture(root, "name-lookalike.yaml", `${name}: ${secret}\n`);

      const findings = await scanPublication(root);

      expect(findingAt(findings, "src/name-lookalike.ts", "credential.generic-secret")).toBe(false);
      expect(findingAt(findings, "name-lookalike.yaml", "credential.generic-secret")).toBe(false);
    },
  );

  test("accepts runtime-derived values for every canonical credential name", async () => {
    const root = createTemporaryRoot();
    writeFixture(
      root,
      "src/runtime-names.ts",
      [
        "const accessToken = runtimeConfig();",
        "const refreshToken = options.refreshToken;",
        "const authorizationToken = process.env.AUTHORIZATION_TOKEN;",
        "const clientSecret = import.meta.env.CLIENT_SECRET;",
        "const googleMapsApiKey = resolveKey();",
        "const bearerToken = prefix + suffix;",
        "const sessionCookie = `runtime_${value}`;",
        "const userPassword = tagged`runtime_value`;",
        "",
      ].join("\n"),
    );

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/runtime-names.ts", "credential.generic-secret")).toBe(false);
    expect(findingAt(findings, "src/runtime-names.ts", "scan.malformed-code")).toBe(false);
  });

  test.each([
    ["dollar identifier", (secret: string) => `<Map :[key$]="accessToken = '${secret}'" />\n`],
    ["call expression", (secret: string) => `<Map v-bind:[resolveKey()]="accessToken = '${secret}'" />\n`],
    ["optional chain", (secret: string) => `<Map :[config?.field]="accessToken = '${secret}'" />\n`],
    ["operators", (secret: string) => `<Map :[ready?left:right]="accessToken = '${secret}'" />\n`],
    ["event expression", (secret: string) => `<Map @[events?.current].once="accessToken = '${secret}'; run()" />\n`],
  ])("scans a Vue dynamic argument with a %s", async (surface, source) => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", surface[0], "A".repeat(27)].join("");
    writeFixture(root, "src/vue-dynamic-name.vue", source(secret));

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/vue-dynamic-name.vue", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "src/vue-dynamic-name.vue", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test("keeps a Vue dynamic argument key dynamic when its value is a static literal", async () => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", "Y".repeat(28)].join("");
    writeFixture(root, "src/vue-dynamic-key.vue", `<Map :[googleMapsApiKey]="'${secret}'" />\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/vue-dynamic-key.vue", "credential.generic-secret")).toBe(false);
    expect(findingAt(findings, "src/vue-dynamic-key.vue", "scan.malformed-code")).toBe(false);
  });

  test.each([
    ["empty", '<Map :[]="runtimeKey" />\n'],
    ["unbalanced", '<Map :[resolveKey()="runtimeKey" />\n'],
    ["parser-invalid", '<Map :[call(]="runtimeKey" />\n'],
    ["whitespace boundary", '<Map :[config ?.field]="runtimeKey" />\n'],
  ])("fails closed for a Vue dynamic argument with an %s form", async (label, contents) => {
    const root = createTemporaryRoot();
    const path = `src/vue-dynamic-${label.replace(" ", "-")}.vue`;
    writeFixture(root, path, contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "scan.malformed-code")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(contents);
  });

  test.each([
    ["src/collapsed-api.js", (secret: string) => `const apikey = "${secret}";\n`],
    ["src/collapsed-secret.ts", (secret: string) => `class Vault { #SECRETKEY = "${secret}"; }\n`],
    ["src/collapsed-member.ts", (secret: string) => `config.Secretkey = "${secret}";\n`],
    ["src/collapsed-jsx.tsx", (secret: string) => `const view = <Map APIKEY="${secret}" />;\n`],
    ["src/collapsed-markup.vue", (secret: string) => `<Map googleMapsApikey="${secret}" />\n`],
    ["collapsed.json", (secret: string) => `{"secretkey":"${secret}"}\n`],
    ["collapsed.yaml", (secret: string) => `APIKEY: ${secret}\n`],
    ["collapsed.ini", (secret: string) => `secretkey=${secret}\n`],
    ["src/collapsed-comment.ts", (secret: string) => `// googleMapsApikey = ${secret}\n`],
  ])("detects a case-insensitive collapsed credential name in %s", async (path, source) => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", basename(path)[0], "P".repeat(27)].join("");
    writeFixture(root, path, source(secret));

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "credential.generic-secret")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each(["apikeyless", "secretkeyboard", "notapikey", "mysecretkeyring"])(
    "does not treat collapsed-name lookalike %s as a credential",
    async (name) => {
      const root = createTemporaryRoot();
      const secret = ["runtime_", name[0], "Q".repeat(27)].join("");
      writeFixture(root, "src/collapsed-lookalike.ts", `const ${name} = "${secret}";\n`);
      writeFixture(root, "collapsed-lookalike.yaml", `${name}: ${secret}\n`);

      const findings = await scanPublication(root);

      expect(findingAt(findings, "src/collapsed-lookalike.ts", "credential.generic-secret")).toBe(false);
      expect(findingAt(findings, "collapsed-lookalike.yaml", "credential.generic-secret")).toBe(false);
    },
  );

  test("keeps collapsed credential names safe when every value is runtime-derived", async () => {
    const root = createTemporaryRoot();
    writeFixture(
      root,
      "src/collapsed-runtime.ts",
      [
        "const apikey = runtimeConfig();",
        "const secretkey = options.secretkey;",
        "const APIKEY = process.env.API_KEY;",
        "const SECRETKEY = import.meta.env.SECRET_KEY;",
        "",
      ].join("\n"),
    );

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/collapsed-runtime.ts", "credential.generic-secret")).toBe(false);
    expect(findingAt(findings, "src/collapsed-runtime.ts", "scan.malformed-code")).toBe(false);
  });

  test("parses decoded JSON keys and direct string values at arbitrary iterative depth", async () => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", "J".repeat(28)].join("");
    writeFixture(
      root,
      "decoded.json",
      `{"outer":[{"api\\u004bey":"runtime\\u005f${"J".repeat(28)}"}]}\n`,
    );

    const findings = await scanPublication(root);

    expect(findingAt(findings, "decoded.json", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "decoded.json", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    {
      code: "credential.google-api-key",
      decoded: ["AI", "za", "G".repeat(35)].join(""),
      encoded: `AI\\u007Aa${"G".repeat(35)}`,
    },
    {
      code: "credential.bearer-token",
      decoded: ["Bearer", " ", "tok_", "B".repeat(28)].join(""),
      encoded: `Bearer\\u0020tok_${"B".repeat(28)}`,
    },
    {
      code: "credential.private-url",
      decoded: `https://private.invalid/path?api_key=${"U".repeat(24)}`,
      encoded: `https://private.invalid/path?api_key\\u003d${"U".repeat(24)}`,
    },
  ])("applies $code to every JSON-decoded string", async ({ code, decoded, encoded }) => {
    const root = createTemporaryRoot();
    writeFixture(root, "decoded-exact.json", `{"values":["${encoded}"]}\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "decoded-exact.json", code)).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(decoded);
  });

  test("fails closed without echo for malformed JSON", async () => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", "M".repeat(28)].join("");
    writeFixture(root, "malformed.json", `{"apiKey":"${secret}"\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "malformed.json", "scan.malformed-code")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test("fails closed before parsing a truncated JSON document", async () => {
    const root = createTemporaryRoot();
    writeFixture(root, "truncated.json", `{"safe":"value",${" ".repeat(2 * 1024 * 1024)}}`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "truncated.json", "scan.analysis-limit")).toBe(true);
  });

  test("bounds iterative JSON traversal", async () => {
    const root = createTemporaryRoot();
    writeFixture(root, "oversized-tree.json", `${JSON.stringify(Array.from({ length: 100_001 }, () => null))}\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "oversized-tree.json", "scan.analysis-limit")).toBe(true);
  });

  test.each([
    {
      label: "hex escape",
      source: (secret: string) => `"api\\tkey": "runtime\\x5f${secret}"\n`,
    },
    {
      label: "short unicode escape",
      source: (secret: string) => `"api\\u004bey": "runtime\\u005f${secret}"\n`,
    },
    {
      label: "long unicode escape",
      source: (secret: string) => `"api\\U0000004bey": "runtime\\U0000005f${secret}"\n`,
    },
    {
      label: "line continuation",
      source: (secret: string) => [`apiKey: "runtime_\\`, `  ${secret}"`, ""].join("\n"),
    },
    {
      label: "escaped backslash",
      source: (secret: string) => `"api\\\\key": "runtime_${secret}"\n`,
    },
    {
      label: "escaped quote",
      source: (secret: string) => `${JSON.stringify("api\"key")}: "runtime_${secret}"\n`,
    },
    {
      label: "named control",
      source: (secret: string) => `"api\\Nkey": "runtime_${secret}"\n`,
    },
  ])("decodes a YAML double-quoted credential using a $label", async ({ label, source }) => {
    const root = createTemporaryRoot();
    const suffix = [label[0], "Y".repeat(27)].join("");
    const secret = `runtime_${suffix}`;
    writeFixture(root, "decoded.yaml", source(suffix));

    const findings = await scanPublication(root);

    expect(findingAt(findings, "decoded.yaml", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "decoded.yaml", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    {
      code: "credential.google-api-key",
      decoded: ["AI", "za", "Y".repeat(35)].join(""),
      encoded: `AI\\x7Aa${"Y".repeat(35)}`,
    },
    {
      code: "credential.bearer-token",
      decoded: ["Bearer", " ", "tok_", "T".repeat(28)].join(""),
      encoded: `Bearer\\x20tok_${"T".repeat(28)}`,
    },
    {
      code: "credential.private-url",
      decoded: `https://private.invalid/path?api_key=${"P".repeat(24)}`,
      encoded: `https:\\/\\/private.invalid\\/path?api_key\\x3d${"P".repeat(24)}`,
    },
  ])("applies $code to a YAML-decoded double-quoted scalar", async ({ code, decoded, encoded }) => {
    const root = createTemporaryRoot();
    writeFixture(root, "decoded-exact.yaml", `note: "${encoded}"\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "decoded-exact.yaml", code)).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(decoded);
  });

  test.each([
    ["invalid escape", `apiKey: "runtime\\q${"I".repeat(28)}"\n`],
    ["surrogate", `apiKey: "runtime\\uD800${"S".repeat(28)}"\n`],
    ["overflow", `apiKey: "runtime\\U00110000${"O".repeat(28)}"\n`],
    ["invalid hex", `apiKey: "runtime\\xG0${"H".repeat(28)}"\n`],
    ["short unicode", `apiKey: "runtime\\u123${"L".repeat(28)}"\n`],
    ["unterminated", `apiKey: "runtime_${"U".repeat(28)}\n`],
  ])("fails closed without echo for a YAML relevant scalar with an %s", async (label, contents) => {
    const root = createTemporaryRoot();
    writeFixture(root, "malformed.yaml", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "malformed.yaml", "scan.malformed-code")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(contents);
  });

  test.each([
    ["single quoted YAML", "literal.yaml", `apiKey: 'runtime\\u005f${"S".repeat(28)}'\n`],
    ["plain YAML", "plain.yaml", `apiKey: runtime\\u005f${"P".repeat(28)}\n`],
    ["INI", "literal.ini", `apiKey="runtime\\u005f${"I".repeat(28)}"\n`],
    ["text", "literal.txt", `apiKey="runtime\\u005f${"T".repeat(28)}"\n`],
    ["YAML comment", "comment.yaml", `# apiKey: "runtime\\u005f${"C".repeat(28)}"\n`],
  ])("does not contextually decode a %s scalar", async (_label, path, contents) => {
    const root = createTemporaryRoot();
    writeFixture(root, path, contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "credential.generic-secret")).toBe(false);
    expect(findingAt(findings, path, "scan.malformed-code")).toBe(false);
  });

  test.each(["|", ">"])("does not decode quoted text inside a YAML %s block scalar", async (marker) => {
    const root = createTemporaryRoot();
    writeFixture(
      root,
      "block.yaml",
      [`note: ${marker}`, `  "AI\\x7Aa${"R".repeat(35)}`, ""].join("\n"),
    );

    const findings = await scanPublication(root);

    expect(findingAt(findings, "block.yaml", "credential.google-api-key")).toBe(false);
    expect(findingAt(findings, "block.yaml", "scan.malformed-code")).toBe(false);
  });

  test.each(["|-", "|+", "|2-", "|-2", "|2+", "|+2", ">2-", ">-2"])(
    "associates a YAML %s block scalar body with its credential key",
    async (header) => {
      const root = createTemporaryRoot();
      const secret = ["runtime_", "K".repeat(28)].join("");
      const indentation = /2/.test(header) ? "  " : " ";
      writeFixture(root, "block-association.yaml", `apiKey: ${header}\n${indentation}${secret}\n`);

      const findings = await scanPublication(root);

      expect(findingAt(findings, "block-association.yaml", "credential.generic-secret")).toBe(true);
      expect(findingAt(findings, "block-association.yaml", "scan.malformed-code")).toBe(false);
      expect(JSON.stringify(findings)).not.toContain(secret);
    },
  );

  test("auto-detects nested block indentation", async () => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", "N".repeat(28)].join("");
    writeFixture(root, "nested-block.yaml", `outer:\n  apiKey: >-\n      ${secret}\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "nested-block.yaml", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "nested-block.yaml", "scan.malformed-code")).toBe(false);
  });

  test("keeps a leading CRLF blank line inside an associated block scalar", async () => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", "R".repeat(28)].join("");
    writeFixture(root, "crlf-block.yaml", `apiKey: |-\r\n\r\n  ${secret}\r\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "crlf-block.yaml", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "crlf-block.yaml", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test("folds a folded block for exact detection but preserves a literal block newline", async () => {
    const root = createTemporaryRoot();
    const token = `tok_${"F".repeat(28)}`;
    writeFixture(root, "folded.yaml", `note: >-\n  Bearer\n  ${token}\n`);
    writeFixture(root, "literal-block.yaml", `note: |-\n  Bearer\n  ${token}\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "folded.yaml", "credential.bearer-token")).toBe(true);
    expect(findingAt(findings, "literal-block.yaml", "credential.bearer-token")).toBe(false);
  });

  test("never interprets escapes inside a YAML block scalar", async () => {
    const root = createTemporaryRoot();
    const decodedSecret = ["runtime_", "E".repeat(28)].join("");
    writeFixture(root, "raw-block.yaml", `apiKey: |-\n  runtime\\u005f${"E".repeat(28)}\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "raw-block.yaml", "credential.generic-secret")).toBe(false);
    expect(findingAt(findings, "raw-block.yaml", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(decodedSecret);
  });

  test("decodes double-quoted scalars inside nested flow collections", async () => {
    const root = createTemporaryRoot();
    const googleKey = ["AI", "za", "G".repeat(35)].join("");
    const bearer = ["Bearer", " ", "tok_", "B".repeat(28)].join("");
    writeFixture(
      root,
      "flow-exact.yaml",
      `values: [["AI\\x7Aa${"G".repeat(35)}"], {note: "Bearer\\u0020tok_${"B".repeat(28)}"}]\n`,
    );

    const findings = await scanPublication(root);

    expect(findingAt(findings, "flow-exact.yaml", "credential.google-api-key")).toBe(true);
    expect(findingAt(findings, "flow-exact.yaml", "credential.bearer-token")).toBe(true);
    expect(findingAt(findings, "flow-exact.yaml", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(googleKey);
    expect(JSON.stringify(findings)).not.toContain(bearer);
  });

  test("associates decoded keys and values inside a flow mapping", async () => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", "M".repeat(28)].join("");
    writeFixture(
      root,
      "flow-pair.yaml",
      `settings: {"api\\u004bey": "runtime\\u005f${"M".repeat(28)}"}\n`,
    );

    const findings = await scanPublication(root);

    expect(findingAt(findings, "flow-pair.yaml", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "flow-pair.yaml", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    {
      label: "plain key",
      source: (suffix: string) => `values: [apiKey: "runtime\\u005f${suffix}"]\n`,
    },
    {
      label: "decoded quoted key",
      source: (suffix: string) =>
        `values: ["api\\u004bey": "runtime\\u005f${suffix}"]\n`,
    },
    {
      label: "single-quoted key and plain value",
      source: (suffix: string) => `values: ['apiKey': runtime_${suffix}]\n`,
    },
  ])("associates a YAML flow-sequence compact mapping with a $label", async ({ label, source }) => {
    const root = createTemporaryRoot();
    const suffix = [label[0], "C".repeat(27)].join("");
    const secret = `runtime_${suffix}`;
    writeFixture(root, "flow-compact-pair.yaml", source(suffix));

    const findings = await scanPublication(root);

    expect(findingAt(findings, "flow-compact-pair.yaml", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "flow-compact-pair.yaml", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test("supports nested compact mappings and multiple flow-sequence entries", async () => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", "N".repeat(28)].join("");
    writeFixture(
      root,
      "flow-nested-compact.yaml",
      `values: [harmless: {nested: [safe:colon]}, apiKey: "${secret}", trailing: [safe]]\n`,
    );

    const findings = await scanPublication(root);

    expect(findingAt(findings, "flow-nested-compact.yaml", "credential.generic-secret")).toBe(true);
    expect(findingAt(findings, "flow-nested-compact.yaml", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    "values: [https://example.invalid/path, 12:34, foo:bar, urn:example:test]\n",
    "values: {https://example.invalid/path: safe, clock: 12:34, label: foo:bar}\n",
  ])("accepts YAML flow plain scalars whose colons are not mapping separators", async (contents) => {
    const root = createTemporaryRoot();
    writeFixture(root, "flow-colons.yaml", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "flow-colons.yaml", "scan.malformed-code")).toBe(false);
    expect(findingAt(findings, "flow-colons.yaml", "credential.generic-secret")).toBe(false);
  });

  test.each([
    'note: "safe" trailing\n',
    "note: 'safe' trailing\n",
    'note: "safe"#comment\n',
    "note: 'safe'#comment\n",
  ])("fails closed for trailing content after a quoted YAML block value", async (contents) => {
    const root = createTemporaryRoot();
    writeFixture(root, "quoted-trailing.yaml", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "quoted-trailing.yaml", "scan.malformed-code")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(contents);
  });

  test.each([
    'note: "safe" # comment\n',
    "note: 'safe'\n",
  ])("accepts an allowed remainder after a quoted YAML block value", async (contents) => {
    const root = createTemporaryRoot();
    writeFixture(root, "quoted-remainder.yaml", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "quoted-remainder.yaml", "scan.malformed-code")).toBe(false);
  });

  test("fails closed with an analysis limit before deeply nested YAML flow exhausts the stack", async () => {
    const root = createTemporaryRoot();
    const marker = ["deep_", "D".repeat(28)].join("");
    const depth = 12_000;
    const contents = `values: ${"[".repeat(depth)}${marker}${"]".repeat(depth)}\n`;
    writeFixture(root, "deep-flow.yaml", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "deep-flow.yaml", "scan.analysis-limit")).toBe(true);
    expect(findingAt(findings, "deep-flow.yaml", "scan.unreadable-file")).toBe(false);
    expect(findingAt(findings, "deep-flow.yaml", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(marker);
    expect(JSON.stringify(findings)).not.toContain(contents);
  });

  test("accepts a valid flow collection with CRLF termination", async () => {
    const root = createTemporaryRoot();
    writeFixture(root, "crlf-flow.yaml", "values: [\"safe\"]\r\nnext: safe\r\n");

    const findings = await scanPublication(root);

    expect(findingAt(findings, "crlf-flow.yaml", "scan.malformed-code")).toBe(false);
  });

  test.each(["|0", "|22", "|--", "|++", "|2+3", "|+-", ">x"])(
    "fails closed for an invalid YAML block header %s",
    async (header) => {
      const root = createTemporaryRoot();
      writeFixture(root, "invalid-block-header.yaml", `note: ${header}\n  harmless\n`);

      const findings = await scanPublication(root);

      expect(findingAt(findings, "invalid-block-header.yaml", "scan.malformed-code")).toBe(true);
    },
  );

  test("fails closed when an explicit block indentation level is violated", async () => {
    const root = createTemporaryRoot();
    writeFixture(root, "invalid-block-indent.yaml", "note: |2-\n harmless\n");

    const findings = await scanPublication(root);

    expect(findingAt(findings, "invalid-block-indent.yaml", "scan.malformed-code")).toBe(true);
  });

  test.each([
    ["unclosed sequence", "values: [\"safe\"\n"],
    ["missing separator", "values: [\"safe\" \"next\"]\n"],
    ["unclosed double quote", "values: [\"safe]\n"],
    ["mismatched close", "values: [{note: \"safe\"]}\n"],
    ["trailing flow content", "values: [\"safe\"] invalid\n"],
    ["unseparated flow comment", "values: [\"safe\"]#comment\n"],
  ])("fails closed for an %s in a YAML flow collection", async (label, contents) => {
    const root = createTemporaryRoot();
    writeFixture(root, "invalid-flow.yaml", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "invalid-flow.yaml", "scan.malformed-code")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(contents);
  });

  test("bounds YAML flow analysis work", async () => {
    const root = createTemporaryRoot();
    const values = Array.from({ length: 100_001 }, () => "safe").join(",");
    writeFixture(root, "flow-budget.yaml", `values: [${values}]\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "flow-budget.yaml", "scan.analysis-limit")).toBe(true);
  });

  test("fails closed when YAML input is truncated at the scanner byte budget", async () => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", "T".repeat(28)].join("");
    writeFixture(
      root,
      "truncated.yaml",
      `note: ${"x".repeat(2 * 1024 * 1024)}\napiKey: ${secret}\n`,
    );

    const findings = await scanPublication(root);

    expect(findingAt(findings, "truncated.yaml", "scan.analysis-limit")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each([
    {
      label: "StringLiteral",
      code: "credential.google-api-key",
      decoded: ["AI", "za", "L".repeat(35)].join(""),
      source: `send("AI\\x7Aa${"L".repeat(35)}");\n`,
    },
    {
      label: "DirectiveLiteral",
      code: "credential.bearer-token",
      decoded: ["Bearer", " ", "tok_", "D".repeat(28)].join(""),
      source: `"Bearer\\u0020tok_${"D".repeat(28)}";\n`,
    },
    {
      label: "static TemplateLiteral",
      code: "credential.private-url",
      decoded: `https://private.invalid/path?api_key=${"V".repeat(24)}`,
      source: `const note = \`https://private.invalid/path?api_key\\x3d${"V".repeat(24)}\`;\n`,
    },
  ])("applies $code to a Babel-decoded $label", async ({ code, decoded, source }) => {
    const root = createTemporaryRoot();
    writeFixture(root, "src/decoded-exact.ts", source);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/decoded-exact.ts", code)).toBe(true);
    expect(findingAt(findings, "src/decoded-exact.ts", "scan.malformed-code")).toBe(false);
    expect(JSON.stringify(findings)).not.toContain(decoded);
  });

  test.each([
    ["concatenation", `const note = "AI" + "\\x7Aa${"N".repeat(35)}";\n`],
    ["template interpolation", `const note = \`AI\${part}za${"N".repeat(35)}\`;\n`],
    ["comment", `// AI\\x7Aa${"N".repeat(35)}\nconst note = runtimeConfig();\n`],
  ])("does not reconstruct an exact detector across a Babel %s", async (label, source) => {
    const root = createTemporaryRoot();
    writeFixture(root, "src/decoded-negative.ts", source);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/decoded-negative.ts", "credential.google-api-key")).toBe(false);
    expect(findingAt(findings, "src/decoded-negative.ts", "scan.malformed-code")).toBe(false);
  });

  test("uses the complete WHATWG named-reference table in live text without echo", async () => {
    const root = createTemporaryRoot();
    const secret = ["runtime_", "W".repeat(28)].join("");
    writeFixture(root, "src/whatwg-name.vue", `<p>api&UnderBar;key: ${secret}</p>\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/whatwg-name.vue", "credential.generic-secret")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  const quotedSourceSecret = ["runtime_", "Q".repeat(28)].join("");
  const templateSourceSecret = ["runtime_", "B".repeat(28)].join("");
  const jsonSecret = ["runtime_", "J".repeat(28)].join("");
  const yamlSecret = ["runtime_", "Y".repeat(28)].join("");
  const textSecret = ["runtime_", "U".repeat(28)].join("");
  test.each([
    {
      path: "src/quoted-secret.ts",
      secret: quotedSourceSecret,
      assignment: `const apiKey = "${quotedSourceSecret}";\n`,
    },
    {
      path: "src/template-secret.ts",
      secret: templateSourceSecret,
      assignment: `const token = \`${templateSourceSecret}\`;\n`,
    },
    {
      path: "config.json",
      secret: jsonSecret,
      assignment: `"apiKey": "${jsonSecret}"\n`,
    },
    {
      path: "config.yaml",
      secret: yamlSecret,
      assignment: `secret_token: "${yamlSecret}"\n`,
    },
    {
      path: "config.txt",
      secret: textSecret,
      assignment: `PRIVATE_TOKEN=${textSecret}\n`,
    },
  ])("still rejects a literal generic secret in $path without echoing it", async ({ path, secret, assignment }) => {
    const root = createTemporaryRoot();
    writeFixture(root, path, assignment);

    const findings = await scanPublication(root);

    expect(findingAt(findings, path, "credential.generic-secret")).toBe(true);
    expect(JSON.stringify(findings)).not.toContain(secret);
  });

  test.each(["bookingReference", "booking_reference", "reservationReference"])(
    "recognizes %s as a booking-reference field",
    async (field) => {
      const root = createTemporaryRoot();
      const reference = ["LT", "8R", "4M7"].join("");
      writeFixture(root, "trip-content.txt", `${field}: ${reference}\n`);

      const findings = await scanPublication(root);

      expect(findingAt(findings, "trip-content.txt", "privacy.booking-reference")).toBe(true);
      expect(JSON.stringify(findings).includes(reference)).toBe(false);
    },
  );

  test.each([
    { key: '"bookingReference"', quote: '"', prefix: "LT" },
    { key: "'booking_reference'", quote: "'", prefix: "BR" },
  ])("recognizes quoted booking-reference key $key", async ({ key, quote, prefix }) => {
    const root = createTemporaryRoot();
    const reference = [prefix, "8R", "4M7"].join("");
    writeFixture(root, "quoted-trip.ts", `${key}: ${quote}${reference}${quote}\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "quoted-trip.ts", "privacy.booking-reference")).toBe(true);
    expect(JSON.stringify(findings).includes(reference)).toBe(false);
  });

  test.each([
    "booking: required",
    "reservation: available",
    "booking: confirmed",
    "booking: optional",
    "reservation: recommended",
  ])(
    "does not confuse status field %s with a reference",
    async (status) => {
      const root = createTemporaryRoot();
      writeFixture(root, "trip-content.txt", `${status}\n`);

      const findings = await scanPublication(root);

      expect(findingAt(findings, "trip-content.txt", "privacy.booking-reference")).toBe(false);
    },
  );

  test.each([
    { key: '"passportNumber"', quote: '"', prefix: "TT" },
    { key: "'passport_number'", quote: "'", prefix: "PP" },
  ])("recognizes quoted passport field $key", async ({ key, quote, prefix }) => {
    const root = createTemporaryRoot();
    const passportNumber = [prefix, "12", "34", "567"].join("");
    writeFixture(root, "traveler.ts", `${key}: ${quote}${passportNumber}${quote}\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "traveler.ts", "privacy.passport-number")).toBe(true);
    expect(JSON.stringify(findings).includes(passportNumber)).toBe(false);
  });

  test.each([
    ["taiwan-mobile", ["09", "12-", "345-", "678"]],
    ["japan-mobile", ["090", "-1234", "-5678"]],
    ["local-landline", ["02", "-2345", "-6789"]],
  ] as const)("recognizes bounded %s phone formats", async (_label, parts) => {
    const root = createTemporaryRoot();
    const phone = parts.join("");
    writeFixture(root, "contact.txt", `phone: ${phone}\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "contact.txt", "privacy.phone-number")).toBe(true);
    expect(JSON.stringify(findings).includes(phone)).toBe(false);
  });

  test.each(["2026-08-26", "35.6762, 139.6503", "version 22.13.0", "walk 12345678 steps"])(
    "does not classify non-phone numeric text %s",
    async (contents) => {
      const root = createTemporaryRoot();
      writeFixture(root, "facts.txt", `${contents}\n`);

      const findings = await scanPublication(root);

      expect(findingAt(findings, "facts.txt", "privacy.phone-number")).toBe(false);
    },
  );

  test("distinguishes reserved examples, explicit public business contact, and personal email", async () => {
    const root = createTemporaryRoot();
    const reservedEmail = ["traveler", "@", "example", ".com"].join("");
    const publicEmail = ["support", "@", "laugh-tale", ".dev"].join("");
    const personalEmail = ["traveler", "@", "personalmail", ".dev"].join("");
    writeFixture(root, "reserved-contact.txt", `Example email: ${reservedEmail}\n`);
    writeFixture(root, "public-contact.txt", `Public business email: ${publicEmail}\n`);
    writeFixture(root, "personal-contact.txt", `Traveler email: ${personalEmail}\n`);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "reserved-contact.txt", "privacy.email-address")).toBe(false);
    expect(findingAt(findings, "reserved-contact.txt", "privacy.public-contact-review")).toBe(false);
    expect(findingAt(findings, "public-contact.txt", "privacy.public-contact-review")).toBe(true);
    expect(findingAt(findings, "public-contact.txt", "privacy.email-address")).toBe(false);
    expect(findingAt(findings, "personal-contact.txt", "privacy.email-address")).toBe(true);
    expect([reservedEmail, publicEmail, personalEmail].some((value) => JSON.stringify(findings).includes(value))).toBe(false);
  });

  test.each([
    ["vercel.json", '{"buildCommand":"npm run build"}\n'],
    ["netlify.toml", '[build]\npublish = "dist"\n'],
    [".github/workflows/deploy.yml", "jobs:\n  deploy:\n    uses: actions/deploy-pages@v4\n"],
  ])("warns for realistic deploy configuration %s", async (relativePath, contents) => {
    const root = createTemporaryRoot();
    writeFixture(root, relativePath, contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, relativePath, "access.public-configuration")).toBe(true);
    expect(findings.find((finding) => finding.path === relativePath)?.severity).toBe("warning");
  });

  test("caps text reads, skips binary bodies, and still inspects sensitive filenames", async () => {
    const root = createTemporaryRoot();
    const googleKey = ["AI", "za", "K".repeat(35)].join("");
    writeFixture(root, "binary.dat", Buffer.concat([Buffer.from([0]), Buffer.from(googleKey)]));
    writeFixture(root, "oversized.txt", `${"x".repeat(2 * 1024 * 1024)}${googleKey}\n`);
    writeFixture(root, "private/ticket-qr.bin", Buffer.from([0, 8, 9]));

    const findings = await scanPublication(root);

    expect(findingAt(findings, "binary.dat", "credential.google-api-key")).toBe(false);
    expect(findingAt(findings, "oversized.txt", "credential.google-api-key")).toBe(false);
    expect(findingAt(findings, "private/ticket-qr.bin", "privacy.qr-artifact")).toBe(true);
  });

  test("fails closed when a code source exceeds the bounded text-read budget", async () => {
    const root = createTemporaryRoot();
    const contents = `const apiKey = runtimeConfig();\n${" ".repeat(2 * 1024 * 1024)}\n`;
    writeFixture(root, "src/oversized-code.ts", contents);

    const findings = await scanPublication(root);

    expect(findingAt(findings, "src/oversized-code.ts", "scan.analysis-limit")).toBe(true);
    expect(findings.find((finding) => finding.code === "scan.analysis-limit")?.severity).toBe("error");
  });

  test("fails closed when an incomplete project-creation marker remains even if ignored", async () => {
    const root = createTemporaryRoot();
    writeFixture(root, ".gitignore", ".laugh-tale-incomplete-*\n");
    writeFixture(root, ".laugh-tale-incomplete-test-fragment", "opaque ownership marker\n");

    const findings = await scanPublication(root);

    expect(findingAt(findings, ".laugh-tale-incomplete-test-fragment", "project.incomplete-publication")).toBe(true);
    expect(findings.find((finding) => finding.code === "project.incomplete-publication")?.severity).toBe("error");
  });
});

describe("publication inventory", () => {
  test("honors root gitignore entries outside a Git repository", async () => {
    const root = createTemporaryRoot();
    const ignoredKey = ["AI", "za", "I".repeat(35)].join("");
    writeFixture(root, ".gitignore", ".env.local\nignored/\n");
    writeFixture(root, ".env.local", `GOOGLE_MAPS_API_KEY=${ignoredKey}\n`);
    writeFixture(root, "ignored/config.txt", ignoredKey);
    writeFixture(root, ".env.production", "PUBLIC_DEPLOYMENT=true\n");

    const findings = await scanPublication(root);

    expect(findings.some((finding) => finding.path === ".env.local")).toBe(false);
    expect(findings.some((finding) => finding.path.startsWith("ignored/"))).toBe(false);
    expect(findingAt(findings, ".env.production", "credential.env-file")).toBe(true);
  });

  test("uses Git-compatible nested ignore, globstar, negation, bare-directory, and escaped-marker semantics", async () => {
    const root = createTemporaryRoot();
    const ignoredKey = ["AI", "za", "N".repeat(35)].join("");
    const publishableKey = ["AI", "za", "P".repeat(35)].join("");
    writeFixture(
      root,
      ".gitignore",
      ["ignored", "logs/**/*.secret", "!logs/**/keep.secret", "\\#private.txt", "\\!private.txt", ""].join("\n"),
    );
    writeFixture(root, "ignored/config.txt", ignoredKey);
    writeFixture(root, "logs/a/private.secret", ignoredKey);
    writeFixture(root, "logs/a/keep.secret", publishableKey);
    writeFixture(root, "#private.txt", ignoredKey);
    writeFixture(root, "!private.txt", ignoredKey);
    writeFixture(root, "nested/.gitignore", ".env.local\n");
    writeFixture(root, "nested/.env.local", `GOOGLE_MAPS_API_KEY=${ignoredKey}\n`);
    writeFixture(root, ".env.production", "PUBLIC_DEPLOYMENT=true\n");

    const findings = await scanPublication(root);

    expect(findings.some((finding) => finding.path.startsWith("ignored/"))).toBe(false);
    expect(findings.some((finding) => finding.path === "logs/a/private.secret")).toBe(false);
    expect(findingAt(findings, "logs/a/keep.secret", "credential.google-api-key")).toBe(true);
    expect(findings.some((finding) => finding.path === "#private.txt")).toBe(false);
    expect(findings.some((finding) => finding.path === "!private.txt")).toBe(false);
    expect(findings.some((finding) => finding.path === "nested/.env.local")).toBe(false);
    expect(findingAt(findings, ".env.production", "credential.env-file")).toBe(true);
    expect(JSON.stringify(findings).includes(publishableKey)).toBe(false);
  });

  test("treats a standalone project under an ignored parent worktree as its own publication boundary", async () => {
    const parent = createTemporaryRoot();
    const root = join(parent, "standalone");
    writeFixture(parent, ".gitignore", "standalone/\n");
    execFileSync("git", ["init", "-q", parent]);
    writeFixture(root, ".env.production", "PUBLIC_DEPLOYMENT=true\n");

    const findings = await scanPublication(root);

    expect(findingAt(findings, ".env.production", "credential.env-file")).toBe(true);
  });

  test("uses Git index and ignore semantics so ignored local secrets do not block but tracked ones fail closed", async () => {
    const root = createTemporaryRoot();
    const ignoredKey = ["AI", "za", "L".repeat(35)].join("");
    writeFixture(root, ".gitignore", ".env.local\n");
    writeFixture(root, ".env.local", `GOOGLE_MAPS_API_KEY=${ignoredKey}\n`);
    writeFixture(root, "README.md", "safe\n");
    execFileSync("git", ["init", "-q", root]);

    const ignoredFindings = await scanPublication(root);
    expect(ignoredFindings.some((finding) => finding.path === ".env.local")).toBe(false);

    execFileSync("git", ["-C", root, "add", "-f", ".env.local"]);
    const trackedFindings = await scanPublication(root);
    expect(findingAt(trackedFindings, ".env.local", "credential.env-file")).toBe(true);
    expect(findingAt(trackedFindings, ".env.local", "credential.google-api-key")).toBe(true);
    expect(JSON.stringify(trackedFindings).includes(ignoredKey)).toBe(false);
  });

  test("refuses cleanup when standalone Git metadata is replaced", async () => {
    const root = createTemporaryRoot();
    writeFixture(root, "README.md", "safe\n");
    let replacementDir: string | undefined;
    let displacedDir: string | undefined;

    await expect(
      scanPublication(root, {
        beforeTempMutation: ({ phase, metadataDir }) => {
          if (phase !== "temp-cleanup" || replacementDir !== undefined) return;
          replacementDir = metadataDir;
          displacedDir = `${metadataDir}-displaced`;
          temporaryRoots.push(replacementDir, displacedDir);
          renameSync(metadataDir, displacedDir);
          mkdirSync(metadataDir);
          writeFileSync(join(metadataDir, "foreign.txt"), "preserve\n");
        },
      }),
    ).rejects.toThrow("temporary Git metadata ownership changed");

    expect(replacementDir).toBeDefined();
    expect(displacedDir).toBeDefined();
    expect(readFileSync(join(replacementDir!, "foreign.txt"), "utf8")).toBe("preserve\n");
    expect(readdirSync(displacedDir!).some((name) => name.startsWith(".laugh-tale-incomplete-"))).toBe(true);
  });

  test("rejects standalone metadata replacement before its first canonical path proof", async () => {
    const root = createTemporaryRoot();
    writeFixture(root, "README.md", "safe\n");
    let replacementDir: string | undefined;
    let displacedDir: string | undefined;

    await expect(
      scanPublication(root, {
        realpath: async (path) => {
          if (replacementDir === undefined && basename(path).startsWith("laugh-tale-publication-git-")) {
            replacementDir = path;
            displacedDir = `${path}-displaced`;
            temporaryRoots.push(replacementDir, displacedDir);
            renameSync(path, displacedDir);
            mkdirSync(path);
            writeFileSync(join(path, "foreign.txt"), "preserve\n");
          }
          return realpathPath(path);
        },
      }),
    ).rejects.toThrow();

    expect(replacementDir).toBeDefined();
    expect(displacedDir).toBeDefined();
    expect(readdirSync(replacementDir!)).toEqual(["foreign.txt"]);
    expect(readFileSync(join(replacementDir!, "foreign.txt"), "utf8")).toBe("preserve\n");
    expect(readdirSync(displacedDir!)).toEqual([]);
  });

  test("leaves owned standalone Git metadata marked when per-entry cleanup fails", async () => {
    const root = createTemporaryRoot();
    writeFixture(root, "README.md", "safe\n");
    let metadataDir: string | undefined;

    await expect(
      scanPublication(root, {
        beforeTempMutation: ({ phase, metadataDir: currentMetadataDir }) => {
          if (phase !== "temp-cleanup" || metadataDir !== undefined) return;
          metadataDir = currentMetadataDir;
          temporaryRoots.push(metadataDir);
        },
        unlink: (path) => {
          if (path.endsWith("global-excludes")) {
            return Promise.reject(new Error("injected temporary metadata cleanup failure"));
          }
          return Promise.reject(new Error(`unexpected cleanup path: ${path}`));
        },
      }),
    ).rejects.toThrow("injected temporary metadata cleanup failure");

    expect(metadataDir).toBeDefined();
    expect(readdirSync(metadataDir!).some((name) => name.startsWith(".laugh-tale-incomplete-"))).toBe(true);
    expect(readFileSync(join(metadataDir!, "global-excludes"), "utf8")).toBe("");
  });
});

describe("publication CLIs", () => {
  test("scan CLI prints JSON counts and exits one only when errors exist", () => {
    const cleanRoot = createTemporaryRoot();
    writeFixture(cleanRoot, "README.md", "safe\n");
    const clean = spawnSync(process.execPath, [scanScript, cleanRoot], { encoding: "utf8" });
    const cleanPayload = JSON.parse(clean.stdout) as { counts: { errors: number; warnings: number } };

    expect(clean.status).toBe(0);
    expect(cleanPayload.counts).toEqual({ errors: 0, warnings: 0 });

    const unsafeRoot = createTemporaryRoot();
    writeFixture(unsafeRoot, ".env.local", "PRIVATE_TOKEN=set-at-runtime\n");
    const unsafe = spawnSync(process.execPath, [scanScript, unsafeRoot], { encoding: "utf8" });
    const unsafePayload = JSON.parse(unsafe.stdout) as { counts: { errors: number; warnings: number } };

    expect(unsafe.status).toBe(1);
    expect(unsafePayload.counts.errors).toBeGreaterThan(0);
  });

  test("validation CLI exits nonzero when generated-project files and scripts are missing", () => {
    const root = createTemporaryRoot();
    writeFixture(root, "README.md", "incomplete\n");

    const result = spawnSync(process.execPath, [validateScript, root, "--mode", "local"], { encoding: "utf8" });
    const payload = parseValidationResult(result.stdout);

    expect(result.status).toBe(1);
    expect(findingCodes(payload.findings)).toContain("project.missing-file");
  });
});

describe("generated-project validation", () => {
  test("accepts the complete approved generated-project contract", async () => {
    const root = createTemporaryRoot();
    createValidGeneratedProject(root);

    await expect(validateTripProject(root)).resolves.toEqual([]);
  });

  test.each([null, [], "package", 42])("rejects non-object package.json shape %#", async (packageShape) => {
    const root = createTemporaryRoot();
    createValidGeneratedProject(root);
    writeFixture(root, "package.json", `${JSON.stringify(packageShape)}\n`);

    const findings = await validateTripProject(root);

    expect(findingAt(findings, "package.json", "project.invalid-package-shape")).toBe(true);
  });

  test("rejects malformed package JSON", async () => {
    const root = createTemporaryRoot();
    createValidGeneratedProject(root);
    writeFixture(root, "package.json", "{ malformed\n");

    const findings = await validateTripProject(root);

    expect(findingAt(findings, "package.json", "project.invalid-package-json")).toBe(true);
  });

  test.each([null, [], "scripts"])("rejects non-object scripts shape %#", async (scriptsShape) => {
    const root = createTemporaryRoot();
    createValidGeneratedProject(root);
    writeFixture(root, "package.json", `${JSON.stringify({ scripts: scriptsShape })}\n`);

    const findings = await validateTripProject(root);

    expect(findingAt(findings, "package.json", "project.invalid-scripts")).toBe(true);
  });

  test("reports an exact missing required script", async () => {
    const root = createTemporaryRoot();
    createValidGeneratedProject(root);
    writeFixture(
      root,
      "package.json",
      `${JSON.stringify({ scripts: { build: "vite build", lint: "eslint .", test: "vitest run" } })}\n`,
    );

    const findings = await validateTripProject(root);

    expect(findingAt(findings, "package.json", "project.missing-script")).toBe(true);
    expect(findings.some((finding) => finding.code === "project.missing-script" && finding.message.includes("type-check"))).toBe(true);
  });

  test("reports missing approved files and source directories", async () => {
    const root = createTemporaryRoot();
    createValidGeneratedProject(root);
    rmSync(join(root, "AGENTS.md"));
    rmSync(join(root, "src/trip-core"), { recursive: true });

    const findings = await validateTripProject(root);

    expect(findingAt(findings, "AGENTS.md", "project.missing-file")).toBe(true);
    expect(findingAt(findings, "src/trip-core", "project.missing-directory")).toBe(true);
  });

  test("warning-only validation emits JSON and exits zero", () => {
    const root = createTemporaryRoot();
    createValidGeneratedProject(root);
    writeFixture(root, "vercel.json", '{"buildCommand":"npm run build"}\n');

    const result = spawnSync(process.execPath, [validateScript, root, "--mode", "local"], { encoding: "utf8" });
    const payload = parseValidationResult(result.stdout);

    expect(result.status).toBe(0);
    expect(payload.counts.errors).toBe(0);
    expect(payload.counts.warnings).toBeGreaterThan(0);
    expect(findingCodes(payload.findings)).toContain("access.public-configuration");
  });

  test("release-blocking validation emits JSON and exits one", () => {
    const root = createTemporaryRoot();
    createValidGeneratedProject(root);
    writeFixture(root, ".env.production", "PUBLIC_DEPLOYMENT=true\n");

    const result = spawnSync(process.execPath, [validateScript, root, "--mode", "local"], { encoding: "utf8" });
    const payload = parseValidationResult(result.stdout);

    expect(result.status).toBe(1);
    expect(payload.counts.errors).toBeGreaterThan(0);
    expect(findingCodes(payload.findings)).toContain("credential.env-file");
  });
});
