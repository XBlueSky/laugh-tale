import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const SCANNER_PLUGIN_ROOT = await realpath(resolve(fileURLToPath(new URL("..", import.meta.url))));
const AUDITED_VENDOR_FILES = Object.freeze([
  { path: "vendor/@babel/parser/index.cjs", bytes: 513_214, sha256: "6969920ae0610df927b6b3e675d1309372c268e36d391652af8e3e0183cbe8f8", runtime: true },
  { path: "vendor/@babel/parser/LICENSE", bytes: 1_086, sha256: "2e97627cb278aa7556fb9e8817368302301a595b6c7582512b8d74c57b773652", attribution: true },
  { path: "vendor/@babel/parser/UPSTREAM.json", bytes: 385, sha256: "40944e9cadca6d230f6300b8de440baceed6b28674db746b3e6710878ff7242d", attribution: true },
  { path: "vendor/entities/package.json", bytes: 2_563, sha256: "86e28ac6361377a9c0a82dc7ce849b16bfcc6b13d862c563bbf9b3fe9267773a", attribution: true, runtime: true },
  { path: "vendor/entities/LICENSE", bytes: 1_260, sha256: "cb992345949ccd6e8394b2cd6c465f7b897c864f845937dbf64e8997f389e164", attribution: true },
  { path: "vendor/entities/UPSTREAM.json", bytes: 1_543, sha256: "ad5c00541bf118ab35677db49084f27dd3df097d19420869feb5d1d3e1a2e993", attribution: true },
  { path: "vendor/entities/dist/decode.js", bytes: 22_923, sha256: "5e3e1c938416abcb354ff4d7808f0a010d27d0e4170195c6f95f2e6895cb081a", runtime: true },
  { path: "vendor/entities/dist/decode-codepoint.js", bytes: 1_160, sha256: "f09dbc23d35abbf96718dfdd04def3c1d3444495541d050c69a12706ee76dbb1", runtime: true },
  { path: "vendor/entities/dist/generated/decode-data-html.js", bytes: 32_453, sha256: "a845d1bb8e661abad2642088c646031523dc58b6e8bd0453308b0d71c01c8b8f", runtime: true },
  { path: "vendor/entities/dist/generated/decode-data-xml.js", bytes: 314, sha256: "e11599611184b79a44d80cf0c135f4eeaf09e0ccac8845da54333177336a20ed", runtime: true },
  { path: "vendor/entities/dist/internal/bin-trie-flags.js", bytes: 942, sha256: "4f2d90d78b57cc2549cda4c53c7b5a1ca6176fcf746da1bd4ad4e6e9608ea89d", runtime: true },
  { path: "vendor/entities/dist/internal/decode-shared.js", bytes: 617, sha256: "51a2120afeae660916954be58f323c718b0415b78e9719c0b0279f49f3cc0d96", runtime: true },
  { path: "THIRD_PARTY_NOTICES.md", bytes: 701, sha256: "239c959a453dd994735fa7fb3105c461e64735bf66dba8d259a7f8da98560b45", attribution: true },
]);
let parseBabelProgram;
let parseBabelExpression;
let decodeHTML;
let decodeHTMLAttribute;

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function matchesAuditedFile(file) {
  try {
    const contents = await readFile(join(SCANNER_PLUGIN_ROOT, file.path));
    return contents.byteLength === file.bytes && sha256(contents) === file.sha256;
  } catch {
    return false;
  }
}

async function initializeScannerRuntime() {
  const runtimeFiles = AUDITED_VENDOR_FILES.filter((file) => file.runtime);
  if (!(await Promise.all(runtimeFiles.map(matchesAuditedFile))).every(Boolean)) return;
  try {
    const parser = require("../vendor/@babel/parser/index.cjs");
    const entities = await import(
      /* @vite-ignore */ new URL("../vendor/entities/dist/decode.js", import.meta.url).href
    );
    parseBabelProgram = parser.parse;
    parseBabelExpression = parser.parseExpression;
    decodeHTML = entities.decodeHTML;
    decodeHTMLAttribute = entities.decodeHTMLAttribute;
  } catch {
    // Scanner analysis fails closed when its audited runtime cannot be loaded.
  }
}

await initializeScannerRuntime();
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const HARD_SKIPPED_DIRECTORIES = new Set([".git", "coverage", "node_modules"]);
const BUILD_DIRECTORIES = new Set([".next", ".vite", "build", "coverage", "dist", "out", "playwright-report", "test-results"]);
const CACHE_DIRECTORIES = new Set([".cache", ".parcel-cache", ".turbo", "cache"]);
const DEFAULT_SCAN_OPERATIONS = { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rmdir, unlink };

function normalizeRelativePath(path) {
  return path.split(sep).join("/").replace(/^\.\//, "");
}

function isContainedRelativePath(path) {
  return path !== "" && path !== ".." && !path.startsWith("../") && !isAbsolute(path);
}

function finding(severity, code, path, message) {
  return { severity, code, path, message };
}

async function listGitFiles(rootDir) {
  let repositoryRoot;
  try {
    const { stdout } = await execFileAsync("git", ["-C", rootDir, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    repositoryRoot = await realpath(stdout.trim());
  } catch {
    return null;
  }
  if (repositoryRoot !== rootDir) return null;

  const { stdout } = await execFileAsync(
    "git",
    ["-C", rootDir, "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "."],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  return stdout
    .split("\0")
    .map(normalizeRelativePath)
    .filter(isContainedRelativePath)
    .sort();
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function normalizeError(error) {
  return error instanceof Error ? error : new Error("temporary Git metadata operation failed");
}

function combinedError(errors) {
  const normalized = errors.map(normalizeError);
  if (normalized.length === 1) return normalized[0];
  return new AggregateError(normalized, normalized.map((error) => error.message).join("; "));
}

async function captureTemporaryParent(operations) {
  const path = await operations.realpath(tmpdir());
  const stats = await operations.lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("temporary Git metadata parent ownership changed");
  }
  return { path, stats };
}

async function assertTemporaryParentIdentity(parent, operations) {
  try {
    const canonicalPath = await operations.realpath(parent.path);
    const stats = await operations.lstat(parent.path);
    if (
      canonicalPath !== parent.path ||
      !stats.isDirectory() ||
      stats.isSymbolicLink() ||
      !sameIdentity(stats, parent.stats)
    ) {
      throw new Error("temporary Git metadata parent ownership changed");
    }
  } catch {
    throw new Error("temporary Git metadata parent ownership changed");
  }
}

async function assertTemporaryRootIdentity(ownership, operations) {
  try {
    const parentPath = await operations.realpath(dirname(ownership.path));
    const parentStats = await operations.lstat(parentPath);
    const rootStats = await operations.lstat(ownership.path);
    if (
      parentPath !== ownership.parent.path ||
      !sameIdentity(parentStats, ownership.parent.stats) ||
      !rootStats.isDirectory() ||
      rootStats.isSymbolicLink() ||
      !sameIdentity(rootStats, ownership.stats)
    ) {
      throw new Error("temporary Git metadata ownership changed");
    }
  } catch {
    throw new Error("temporary Git metadata ownership changed");
  }
}

async function assertTemporaryOwnership(ownership, operations) {
  await assertTemporaryRootIdentity(ownership, operations);
  try {
    const markerStats = await operations.lstat(ownership.marker.path);
    const markerContents = await operations.readFile(ownership.marker.path, "utf8");
    if (
      !markerStats.isFile() ||
      markerStats.isSymbolicLink() ||
      !sameIdentity(markerStats, ownership.marker.stats) ||
      markerContents !== ownership.marker.token
    ) {
      throw new Error("temporary Git metadata ownership changed");
    }
  } catch {
    throw new Error("temporary Git metadata ownership changed");
  }
}

async function verifyTemporaryEntry(entry, operations) {
  const stats = await operations.lstat(entry.path);
  const expectedType = entry.type === "directory" ? stats.isDirectory() : stats.isFile();
  if (!expectedType || stats.isSymbolicLink() || !sameIdentity(stats, entry.stats)) {
    throw new Error("temporary Git metadata ownership changed");
  }
}

async function assertTemporaryParentChain(ownership, destinationPath, operations) {
  await assertTemporaryOwnership(ownership, operations);
  const relativeParent = relative(ownership.path, dirname(destinationPath));
  if (relativeParent === ".." || relativeParent.startsWith(`..${sep}`) || isAbsolute(relativeParent)) {
    throw new Error("temporary Git metadata ownership changed");
  }
  let currentPath = ownership.path;
  for (const part of relativeParent.split(sep).filter(Boolean)) {
    currentPath = join(currentPath, part);
    const entry = ownership.entries.find(
      (candidate) => !candidate.removed && candidate.type === "directory" && candidate.path === currentPath,
    );
    if (!entry) throw new Error("temporary Git metadata ownership changed");
    await verifyTemporaryEntry(entry, operations);
  }
}

async function createTemporaryEntry(ownership, relativePath, type, contents, operations) {
  const path = join(ownership.path, relativePath);
  await assertTemporaryParentChain(ownership, path, operations);
  if (ownership.tainted) throw new Error("temporary Git metadata ownership is uncertain");
  ownership.tainted = { path, type };
  if (type === "directory") {
    await operations.mkdir(path);
  } else {
    const handle = await operations.open(path, "wx", 0o600);
    let error;
    try {
      const handleStats = await handle.stat();
      const pathStats = await operations.lstat(path);
      if (
        !handleStats.isFile() ||
        !pathStats.isFile() ||
        pathStats.isSymbolicLink() ||
        !sameIdentity(handleStats, pathStats)
      ) {
        throw new Error("temporary Git metadata ownership changed");
      }
      ownership.entries.push({ path, type, stats: pathStats, removed: false });
      ownership.tainted = null;
      await assertTemporaryParentChain(ownership, path, operations);
      await handle.writeFile(contents);
    } catch (caught) {
      error = normalizeError(caught);
    }
    try {
      await handle.close();
    } catch (caught) {
      error = error ? combinedError([error, caught]) : normalizeError(caught);
    }
    if (error) throw error;
    return;
  }

  const stats = await operations.lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("temporary Git metadata ownership changed");
  ownership.entries.push({ path, type, stats, removed: false });
  ownership.tainted = null;
}

async function acquireTemporaryMetadata(acquisition, operations) {
  const parent = await captureTemporaryParent(operations);
  await assertTemporaryParentIdentity(parent, operations);
  const createdPath = resolve(await operations.mkdtemp(join(parent.path, "laugh-tale-publication-git-")));
  const path = join(parent.path, basename(createdPath));
  const ownership = {
    path,
    parent,
    stats: null,
    marker: {
      path: join(path, `.laugh-tale-incomplete-${randomUUID()}`),
      token: randomUUID(),
    },
    entries: [],
    tainted: { path, type: "root" },
  };
  acquisition.ownership = ownership;
  if (createdPath !== path) throw new Error("temporary Git metadata ownership changed");

  await assertTemporaryParentIdentity(parent, operations);
  const beforeStats = await operations.lstat(path);
  if (!beforeStats.isDirectory() || beforeStats.isSymbolicLink()) {
    throw new Error("temporary Git metadata ownership changed");
  }
  const canonicalPath = await operations.realpath(path);
  const afterStats = await operations.lstat(path);
  if (
    canonicalPath !== path ||
    !afterStats.isDirectory() ||
    afterStats.isSymbolicLink() ||
    !sameIdentity(beforeStats, afterStats)
  ) {
    throw new Error("temporary Git metadata ownership changed");
  }
  ownership.stats = afterStats;
  ownership.tainted = null;

  await assertTemporaryRootIdentity(ownership, operations);
  ownership.tainted = { path: ownership.marker.path, type: "marker" };
  const handle = await operations.open(ownership.marker.path, "wx", 0o600);
  try {
    const handleStats = await handle.stat();
    const pathStats = await operations.lstat(ownership.marker.path);
    if (
      !handleStats.isFile() ||
      !pathStats.isFile() ||
      pathStats.isSymbolicLink() ||
      !sameIdentity(handleStats, pathStats)
    ) {
      throw new Error("temporary Git metadata ownership changed");
    }
    ownership.marker.stats = pathStats;
    await handle.writeFile(ownership.marker.token);
    ownership.tainted = null;
  } finally {
    await handle.close();
  }
  await assertTemporaryOwnership(ownership, operations);
}

async function verifyTemporaryInventory(ownership, operations) {
  if (ownership.tainted) throw new Error("temporary Git metadata ownership is uncertain");
  await assertTemporaryOwnership(ownership, operations);
  const expected = new Map(
    ownership.entries.filter((entry) => !entry.removed).map((entry) => [entry.path, entry]),
  );
  const seen = new Set();

  async function walk(directory) {
    for (const entry of await operations.readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (path === ownership.marker.path) continue;
      const recorded = expected.get(path);
      if (!recorded) throw new Error("temporary Git metadata inventory changed");
      await verifyTemporaryEntry(recorded, operations);
      seen.add(path);
      if (recorded.type === "directory") await walk(path);
    }
  }

  await walk(ownership.path);
  if (seen.size !== expected.size) throw new Error("temporary Git metadata inventory changed");
}

async function runBeforeTempMutation(operations, phase, path, metadataDir) {
  await operations.beforeTempMutation?.({ phase, path, metadataDir });
}

async function cleanupTemporaryMetadata(ownership, operations) {
  try {
    await verifyTemporaryInventory(ownership, operations);
    for (const entry of [...ownership.entries].reverse()) {
      if (entry.removed) continue;
      await runBeforeTempMutation(operations, "temp-cleanup", entry.path, ownership.path);
      await assertTemporaryParentChain(ownership, entry.path, operations);
      await verifyTemporaryEntry(entry, operations);
      if (entry.type === "directory") await operations.rmdir(entry.path);
      else await operations.unlink(entry.path);
      entry.removed = true;
    }
    await verifyTemporaryInventory(ownership, operations);
    await runBeforeTempMutation(operations, "temp-cleanup", ownership.marker.path, ownership.path);
    await assertTemporaryOwnership(ownership, operations);
    await operations.unlink(ownership.marker.path);
    await runBeforeTempMutation(operations, "temp-cleanup", ownership.path, ownership.path);
    await assertTemporaryRootIdentity(ownership, operations);
    await operations.rmdir(ownership.path);
    return [];
  } catch (error) {
    return [normalizeError(error)];
  }
}

async function listStandaloneFilesWithGit(rootDir, operations) {
  const acquisition = { ownership: null };
  let ownership;
  let inventory;
  let primaryError;
  try {
    await acquireTemporaryMetadata(acquisition, operations);
    ownership = acquisition.ownership;
    await createTemporaryEntry(ownership, "objects", "directory", "", operations);
    await createTemporaryEntry(ownership, "refs", "directory", "", operations);
    await createTemporaryEntry(ownership, "HEAD", "file", "ref: refs/heads/main\n", operations);
    await createTemporaryEntry(ownership, "global-excludes", "file", "", operations);
    await verifyTemporaryInventory(ownership, operations);
    const emptyGlobalExcludes = join(ownership.path, "global-excludes");
    const { stdout } = await execFileAsync(
      "git",
      [
        `--git-dir=${ownership.path}`,
        `--work-tree=${rootDir}`,
        "-c",
        "core.bare=false",
        "-c",
        `core.excludesFile=${emptyGlobalExcludes}`,
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
      ],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    await verifyTemporaryInventory(ownership, operations);
    inventory = stdout
      .split("\0")
      .map(normalizeRelativePath)
      .filter(isContainedRelativePath)
      .sort();
  } catch (error) {
    ownership = acquisition.ownership;
    primaryError = normalizeError(error);
  }

  const errors = primaryError ? [primaryError] : [];
  if (ownership) errors.push(...(await cleanupTemporaryMetadata(ownership, operations)));
  if (errors.length > 0) throw combinedError(errors);
  return inventory;
}

async function publicationInventory(rootDir, operations) {
  return (await listGitFiles(rootDir)) ?? listStandaloneFilesWithGit(rootDir, operations);
}

function isBinary(buffer) {
  if (buffer.includes(0)) return true;
  const sampleLength = Math.min(buffer.length, 8192);
  let controlCharacters = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    const byte = buffer[index];
    if (byte < 7 || (byte > 13 && byte < 32)) controlCharacters += 1;
  }
  return sampleLength > 0 && controlCharacters / sampleLength > 0.1;
}

function auditedFilesWithinRoot(canonicalRoot) {
  const expected = new Map();
  for (const file of AUDITED_VENDOR_FILES) {
    const absolutePath = join(SCANNER_PLUGIN_ROOT, file.path);
    const relativePath = normalizeRelativePath(relative(canonicalRoot, absolutePath));
    if (isContainedRelativePath(relativePath)) expected.set(relativePath, { ...file, absolutePath });
  }
  return expected;
}

function resemblesAuditedVendorPath(path) {
  return /(?:^|\/)vendor\/(?:@babel\/parser|entities)(?:\/|$)/i.test(path);
}

async function auditVendorInventory(canonicalRoot, inventory) {
  const expected = auditedFilesWithinRoot(canonicalRoot);
  const inventoryPaths = new Set(inventory);
  const trustedFiles = new Set();
  const trustedAttribution = new Set();
  const findings = [];

  for (const [relativePath, file] of expected) {
    let trusted = false;
    if (inventoryPaths.has(relativePath)) {
      try {
        const stats = await lstat(file.absolutePath);
        const contents = await readFile(file.absolutePath);
        trusted =
          stats.isFile() &&
          !stats.isSymbolicLink() &&
          contents.byteLength === file.bytes &&
          sha256(contents) === file.sha256;
      } catch {
        trusted = false;
      }
    }
    if (trusted) {
      trustedFiles.add(relativePath);
      if (file.attribution) trustedAttribution.add(relativePath);
    } else {
      findings.push(
        finding(
          "error",
          "vendor.integrity",
          relativePath,
          `Audited vendor integrity could not be established at "${relativePath}".`,
        ),
      );
    }
  }

  for (const relativePath of inventory) {
    if (resemblesAuditedVendorPath(relativePath) && !trustedFiles.has(relativePath)) {
      findings.push(
        finding(
          "error",
          "artifact.unaudited-vendor",
          relativePath,
          `Unaudited vendor artifact detected at "${relativePath}".`,
        ),
      );
    }
  }

  return { findings, trustedAttribution, trustedFiles };
}

async function readTextPrefix(path, size) {
  const byteCount = Math.min(size, MAX_TEXT_BYTES);
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(byteCount);
    const { bytesRead } = await handle.read(buffer, 0, byteCount, 0);
    const body = buffer.subarray(0, bytesRead);
    return isBinary(body) ? null : body.toString("utf8");
  } finally {
    await handle.close();
  }
}

function filenameFindings(path, auditedVendorFile = false) {
  const findings = [];
  const lowerPath = path.toLowerCase();
  const lowerBasename = basename(lowerPath);
  const segments = lowerPath.split("/");

  if (lowerBasename.startsWith(".laugh-tale-incomplete-")) {
    findings.push(
      finding(
        "error",
        "project.incomplete-publication",
        path,
        `Incomplete project-creation marker detected at "${path}".`,
      ),
    );
  }
  if (lowerBasename.startsWith(".env") && lowerBasename !== ".env.example") {
    findings.push(finding("error", "credential.env-file", path, `Publishable environment file detected at "${path}".`));
  }
  if (/(?:^|[._/-])(?:qr|qrcode)(?:[._/-]|$)/i.test(lowerPath)) {
    findings.push(finding("error", "privacy.qr-artifact", path, `Ticket or QR artifact filename detected at "${path}".`));
  }
  if (/\.(?:eml|mbox|msg)$/i.test(lowerBasename)) {
    findings.push(finding("error", "privacy.raw-email", path, `Raw email export detected at "${path}".`));
  }
  if (/(?:passport|boarding[-_ ]?pass|ticket[-_ ]?(?:scan|copy)|attachment)/i.test(lowerPath)) {
    findings.push(finding("error", "privacy.private-document", path, `Private source document filename detected at "${path}".`));
  }
  if (/\.(?:css|js|mjs|cjs)\.map$/i.test(lowerBasename)) {
    findings.push(finding("warning", "artifact.source-map", path, `Source map is included in publication inventory at "${path}".`));
  }
  if (!auditedVendorFile && segments.some((segment) => BUILD_DIRECTORIES.has(segment))) {
    findings.push(finding("warning", "artifact.build-output", path, `Build or test output is included in publication inventory at "${path}".`));
  }
  if (segments.some((segment) => CACHE_DIRECTORIES.has(segment))) {
    findings.push(finding("warning", "artifact.cache", path, `Cache output is included in publication inventory at "${path}".`));
  }
  return findings;
}

const MAX_CODE_AST_NODES = 100_000;
const MAX_COMPONENT_EXPRESSION_ATTEMPTS = 512;
const MAX_COMPONENT_EXPRESSION_BYTES = 4 * 1024 * 1024;
const CODE_SOURCE_PATH = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/i;
const COMPONENT_SOURCE_PATH = /\.(?:vue|svelte|astro)$/i;
const DIRECT_ASSIGNMENT_OPERATORS = new Set(["=", "??=", "||=", "&&="]);
const TRANSPARENT_EXPRESSION_TYPES = new Set([
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "TSNonNullExpression",
  "TypeCastExpression",
]);
const AST_TRAVERSAL_IGNORED_KEYS = new Set([
  "comments",
  "errors",
  "extra",
  "leadingComments",
  "loc",
  "innerComments",
  "tokens",
  "trailingComments",
]);
const RUNTIME_REFERENCE_VALUE = /^(?:process\.env|import\.meta\.env)(?:\.|\[)/i;
const GOOGLE_API_KEY_LITERAL = /AIza[0-9A-Za-z_-]{35}/;
const BEARER_TOKEN_LITERAL = /\bBearer[ \t]+[A-Za-z0-9._~+/-]{20,}={0,2}/i;
const PRIVATE_URL_LITERAL =
  /https?:\/\/[^\s"']+[?&](?:access_token|api_key|key|signature|token|auth)=[^\s&#"']{8,}/i;
const DECODED_LITERAL_DETECTORS = [
  [GOOGLE_API_KEY_LITERAL, "credential.google-api-key"],
  [BEARER_TOKEN_LITERAL, "credential.bearer-token"],
  [PRIVATE_URL_LITERAL, "credential.private-url"],
];

class CodeAnalysisLimitError extends Error {}

function createLiteralAnalysisState() {
  return {
    analysisLimited: false,
    decodedLiteralCodes: new Set(),
    hasSecret: false,
    malformed: false,
  };
}

function createCodeAnalysisState() {
  return {
    ...createLiteralAnalysisState(),
    astNodes: 0,
    expressionAttempts: 0,
    expressionBytes: 0,
  };
}

function credentialNameTokens(name) {
  if (typeof name !== "string" || name === "") return [];
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
}

function isCredentialName(name) {
  const tokens = credentialNameTokens(name);
  if (tokens.some((token) => token === "apikey" || token === "secretkey")) return true;
  if (tokens.some((token) => ["authorization", "cookie", "password", "secret", "token"].includes(token))) {
    return true;
  }
  return tokens.some((token, index) => token === "api" && tokens[index + 1] === "key");
}

function analyzeDecodedSpecificLiteral(contents, state) {
  for (const [expression, code] of DECODED_LITERAL_DETECTORS) {
    if (expression.test(contents)) state.decodedLiteralCodes.add(code);
  }
}

function analyzeEncodedLiveText(contents, state) {
  if (typeof decodeHTML !== "function") {
    state.analysisLimited = true;
    return;
  }
  const decoded = decodeHTML(contents);
  if (containsNonCodeGenericSecret(decoded)) state.hasSecret = true;
  analyzeDecodedSpecificLiteral(decoded, state);
}

function decodeEncodedAttribute(contents, state) {
  if (typeof decodeHTMLAttribute !== "function") {
    state.analysisLimited = true;
    return contents;
  }
  return decodeHTMLAttribute(contents);
}

function lineTerminatorWidth(contents, cursor, limit) {
  if (cursor >= limit) return 0;
  if (contents[cursor] === "\r") return contents[cursor + 1] === "\n" && cursor + 1 < limit ? 2 : 1;
  return contents[cursor] === "\n" || contents[cursor] === "\u2028" || contents[cursor] === "\u2029" ? 1 : 0;
}

function readQuotedLiteral(contents, start, limit) {
  const quote = contents[start];
  let cursor = start + 1;
  while (cursor < limit) {
    if (contents[cursor] === "\\") {
      if (cursor + 1 >= limit) {
        return { closed: false, end: limit, value: contents.slice(start + 1, limit) };
      }
      const continuationWidth = lineTerminatorWidth(contents, cursor + 1, limit);
      cursor += continuationWidth > 0 ? continuationWidth + 1 : 2;
      continue;
    }
    if (contents[cursor] === quote) {
      return { closed: true, end: cursor + 1, value: contents.slice(start + 1, cursor) };
    }
    if (lineTerminatorWidth(contents, cursor, limit) > 0) {
      return { closed: false, end: cursor, value: contents.slice(start + 1, cursor) };
    }
    cursor += 1;
  }
  return { closed: false, end: limit, value: contents.slice(start + 1, limit) };
}

function isSecretLiteralValue(value) {
  return (
    /^[A-Za-z0-9_./+~-]{16,}={0,2}$/.test(value) &&
    !/^(?:<|your\b|replace\b|example\b|set-at-runtime\b)/i.test(value) &&
    !RUNTIME_REFERENCE_VALUE.test(value)
  );
}

function parserLanguage(path, languageHint) {
  const normalizedHint = languageHint?.trim().toLowerCase() ?? "";
  const typeScript =
    ["ts", "tsx", "typescript", "text/typescript"].includes(normalizedHint) ||
    /\.(?:[cm]?ts|tsx)$/i.test(path) ||
    normalizedHint === "astro";
  const jsx =
    ["jsx", "tsx", "astro"].includes(normalizedHint) ||
    /\.(?:jsx|tsx)$/i.test(path);
  return { jsx, typeScript };
}

function parserSourceType(path) {
  if (/\.(?:mjs|mts)$/i.test(path)) return "module";
  if (/\.(?:cjs|cts)$/i.test(path)) return "commonjs";
  return "unambiguous";
}

function babelParserOptions(path, languageHint) {
  const language = parserLanguage(path, languageHint);
  const plugins = ["decorators-legacy"];
  const sourceType = parserSourceType(path);
  if (language.typeScript) {
    plugins.push(["typescript", { dts: /\.d\.(?:ts|mts|cts)$/i.test(path) }]);
  }
  if (language.jsx) plugins.push("jsx");
  const options = {
    attachComment: false,
    createParenthesizedExpressions: true,
    errorRecovery: false,
    plugins,
    sourceType,
  };
  if (sourceType !== "commonjs") options.allowAwaitOutsideFunction = true;
  return options;
}

function componentExpressionParserOptions(path) {
  return {
    allowAwaitOutsideFunction: true,
    attachComment: false,
    createParenthesizedExpressions: true,
    errorRecovery: false,
    plugins: ["decorators-legacy", "typescript", "jsx"],
    sourceType: "unambiguous",
    sourceFilename: path,
  };
}

function isParserSyntaxError(error) {
  return (
    error instanceof SyntaxError ||
    error?.code === "BABEL_PARSER_SYNTAX_ERROR" ||
    error?.code === "BABEL_PARSER_SOURCETYPE_MODULE_REQUIRED"
  );
}

function unwrapTransparentExpression(node) {
  let current = node;
  const seen = new Set();
  while (
    current !== null &&
    typeof current === "object" &&
    TRANSPARENT_EXPRESSION_TYPES.has(current.type) &&
    current.expression !== undefined &&
    !seen.has(current)
  ) {
    seen.add(current);
    current = current.expression;
  }
  return current;
}

function staticLiteralValue(node) {
  const current = unwrapTransparentExpression(node);
  if (current?.type === "StringLiteral") return current.value;
  if (current?.type === "DirectiveLiteral") return current.extra?.expressionValue ?? current.value;
  if (current?.type !== "TemplateLiteral" || current.expressions?.length !== 0 || current.quasis?.length !== 1) {
    return null;
  }
  return current.quasis[0]?.value?.cooked ?? current.quasis[0]?.value?.raw ?? null;
}

function staticPropertyName(node) {
  const current = unwrapTransparentExpression(node);
  if (current?.type === "Identifier" || current?.type === "JSXIdentifier") return current.name;
  if (current?.type === "PrivateName") return staticPropertyName(current.id);
  return staticLiteralValue(current);
}

function staticComputedPropertyName(node) {
  const current = unwrapTransparentExpression(node);
  if (current?.type === "StringLiteral" || current?.type === "TemplateLiteral") {
    return staticLiteralValue(current);
  }
  return null;
}

function propertyDefinitionKeyName(node) {
  return node.computed ? staticComputedPropertyName(node.key) : staticPropertyName(node.key);
}

function directKeyName(node) {
  const current = unwrapTransparentExpression(node);
  if (current?.type === "Identifier" || current?.type === "JSXIdentifier") return current.name;
  if (current?.type === "MemberExpression" || current?.type === "OptionalMemberExpression") {
    return current.computed
      ? staticComputedPropertyName(current.property)
      : staticPropertyName(current.property);
  }
  return staticPropertyName(current);
}

function valueFromAssignmentPattern(node) {
  return node?.type === "AssignmentPattern" ? node.right : node;
}

function directSecretPair(name, valueNode) {
  if (!isCredentialName(name)) return false;
  const value = staticLiteralValue(valueFromAssignmentPattern(valueNode));
  return typeof value === "string" && isSecretLiteralValue(value);
}

function astNodeHasDirectSecret(node) {
  switch (node.type) {
    case "VariableDeclarator":
      return directSecretPair(directKeyName(node.id), node.init);
    case "AssignmentPattern":
      return directSecretPair(directKeyName(node.left), node.right);
    case "AssignmentExpression":
      return (
        DIRECT_ASSIGNMENT_OPERATORS.has(node.operator) &&
        directSecretPair(directKeyName(node.left), node.right)
      );
    case "ObjectProperty":
      return directSecretPair(propertyDefinitionKeyName(node), node.value);
    case "ClassProperty":
    case "ClassPrivateProperty":
    case "ClassAccessorProperty":
    case "TSPropertySignature":
      return directSecretPair(propertyDefinitionKeyName(node), node.value ?? node.initializer);
    case "TSEnumMember":
      return directSecretPair(staticPropertyName(node.id), node.initializer);
    case "JSXAttribute": {
      const value =
        node.value?.type === "JSXExpressionContainer" ? node.value.expression : node.value;
      return directSecretPair(staticPropertyName(node.name), value);
    }
    default:
      return false;
  }
}

function astChildren(node) {
  const children = [];
  for (const [key, value] of Object.entries(node)) {
    if (AST_TRAVERSAL_IGNORED_KEYS.has(key) || value === null || typeof value !== "object") continue;
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        if (value[index] !== null && typeof value[index] === "object" && typeof value[index].type === "string") {
          children.push(value[index]);
        }
      }
      continue;
    }
    if (typeof value.type === "string") children.push(value);
  }
  return children;
}

function analyzeAst(root, comments, state) {
  for (const comment of comments ?? []) {
    if (typeof comment?.value === "string" && containsNonCodeGenericSecret(comment.value)) {
      state.hasSecret = true;
    }
  }

  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    state.astNodes += 1;
    if (state.astNodes > MAX_CODE_AST_NODES) throw new CodeAnalysisLimitError();
    if (astNodeHasDirectSecret(node)) state.hasSecret = true;
    const literal = staticLiteralValue(node);
    if (typeof literal === "string") analyzeDecodedSpecificLiteral(literal, state);
    stack.push(...astChildren(node));
  }
}

function analyzeQuotedPropertyFragment(path, contents, state) {
  if (!/^\s*["']/.test(contents)) return;
  if (typeof parseBabelExpression !== "function") {
    state.analysisLimited = true;
    return;
  }
  try {
    const expression = parseBabelExpression(`({\n${contents}\n})`, componentExpressionParserOptions(path));
    analyzeAst(expression, expression.comments, state);
  } catch {
    // The complete-program parser still owns the stable malformed-code result.
  }
}

function analyzeProgramSource(path, contents, state, languageHint) {
  if (state.analysisLimited || state.malformed) return;
  if (typeof parseBabelProgram !== "function") {
    state.analysisLimited = true;
    return;
  }
  try {
    const ast = parseBabelProgram(contents, {
      ...babelParserOptions(path, languageHint),
      sourceFilename: path,
    });
    analyzeAst(ast.program, ast.comments, state);
  } catch (error) {
    if (error instanceof CodeAnalysisLimitError || error instanceof RangeError) {
      state.analysisLimited = true;
    } else {
      if (isParserSyntaxError(error)) analyzeQuotedPropertyFragment(path, contents, state);
      state.malformed = true;
    }
  }
}

function componentBindingArrow(contents) {
  const binding = contents.trim();
  if (binding === "") return null;
  return binding.startsWith("(") && binding.endsWith(")")
    ? `${binding} => undefined`
    : `(${binding}) => undefined`;
}

function componentExpressionParses(path, contents, state) {
  if (typeof parseBabelExpression !== "function") throw new CodeAnalysisLimitError();
  consumeExpressionProbe(state, contents);
  try {
    parseBabelExpression(contents, componentExpressionParserOptions(path));
    return true;
  } catch (error) {
    if (isParserSyntaxError(error)) return false;
    throw new CodeAnalysisLimitError();
  }
}

function svelteBindingAndKey(path, contents, state) {
  const directBinding = componentBindingArrow(contents);
  if (directBinding !== null && componentExpressionParses(path, directBinding, state)) {
    return { binding: directBinding, key: null };
  }

  const keyCandidates = [...contents.matchAll(/\s+\(/g)].reverse();
  for (const candidate of keyCandidates) {
    const keyStart = candidate.index + candidate[0].length - 1;
    const binding = componentBindingArrow(contents.slice(0, candidate.index));
    const key = contents.slice(keyStart).trim();
    if (
      binding !== null &&
      componentExpressionParses(path, binding, state) &&
      componentExpressionParses(path, key, state)
    ) {
      return { binding, key };
    }
  }
  return null;
}

function normalizeSvelteEachExpression(path, remainder, state) {
  const candidates = [...remainder.matchAll(/\s+as\s+/g)];
  for (const candidate of candidates) {
    const iterable = remainder.slice(0, candidate.index).trim();
    const bindingAndKey = svelteBindingAndKey(
      path,
      remainder.slice(candidate.index + candidate[0].length),
      state,
    );
    if (
      iterable !== "" &&
      bindingAndKey !== null &&
      componentExpressionParses(path, iterable, state)
    ) {
      return bindingAndKey.key === null
        ? `[(${iterable}), (${bindingAndKey.binding})]`
        : `[(${iterable}), (${bindingAndKey.binding}), (${bindingAndKey.key})]`;
    }
  }
  return "(";
}

function normalizeSvelteAwaitExpression(path, remainder, state) {
  if (componentExpressionParses(path, remainder, state)) return remainder;
  const candidates = [...remainder.matchAll(/\s+(?:then|catch)\s+/g)];
  for (const candidate of candidates) {
    const awaited = remainder.slice(0, candidate.index).trim();
    const bindingArrow = componentBindingArrow(
      remainder.slice(candidate.index + candidate[0].length),
    );
    if (
      awaited !== "" &&
      bindingArrow !== null &&
      componentExpressionParses(path, awaited, state) &&
      componentExpressionParses(path, bindingArrow, state)
    ) {
      return `[(${awaited}), (${bindingArrow})]`;
    }
  }
  return "(";
}

function normalizeFrameworkExpression(path, contents, componentType, state) {
  const expression = contents.trim();
  if (expression.startsWith("...")) return "[" + expression + "]";
  if (componentType !== "svelte") return expression;
  const directive = /^([#:@/])([A-Za-z][\w-]*)(?:\s+([\s\S]*))?$/.exec(expression);
  if (directive === null) return expression;
  const [, marker, name, remainder = ""] = directive;
  if (marker === "/") {
    return remainder === "" && ["if", "each", "await"].includes(name) ? "undefined" : "(";
  }
  if (marker === ":" && name === "else") {
    if (remainder === "") return "undefined";
    return remainder.startsWith("if ") ? remainder.slice(3) : "(";
  }
  if (marker === ":" && (name === "then" || name === "catch")) {
    const bindingArrow = componentBindingArrow(remainder);
    return bindingArrow === null ? "undefined" : bindingArrow;
  }
  if (marker === "#" && name === "each") return normalizeSvelteEachExpression(path, remainder, state);
  if (marker === "#" && name === "await") return normalizeSvelteAwaitExpression(path, remainder, state);
  if (marker === "#" && name === "if") return remainder === "" ? "(" : remainder;
  if (marker === "@" && name === "debug") return remainder === "" ? "undefined" : remainder;
  if (marker === "@" && ["html", "const", "render"].includes(name)) {
    return remainder === "" ? "(" : remainder;
  }
  return "(";
}

function consumeExpressionProbe(state, contents) {
  state.expressionAttempts += 1;
  state.expressionBytes += Buffer.byteLength(contents);
  if (
    state.expressionAttempts > MAX_COMPONENT_EXPRESSION_ATTEMPTS ||
    state.expressionBytes > MAX_COMPONENT_EXPRESSION_BYTES
  ) {
    throw new CodeAnalysisLimitError();
  }
}

function tryParseComponentExpression(path, contents, componentType, state) {
  if (typeof parseBabelExpression !== "function") throw new CodeAnalysisLimitError();
  const trimmed = contents.trim();
  if (componentType === "astro" && trimmed.startsWith("/*")) {
    const comment = /^\/\*([\s\S]*)\*\/$/.exec(trimmed);
    if (comment !== null) {
      consumeExpressionProbe(state, trimmed);
      return {
        comments: [{ type: "CommentBlock", value: comment[1] }],
        node: { type: "Identifier", name: "undefined" },
      };
    }
  }
  const expression = normalizeFrameworkExpression(path, contents, componentType, state);
  consumeExpressionProbe(state, expression);
  try {
    const node = parseBabelExpression(expression, componentExpressionParserOptions(path));
    return { comments: node.comments ?? [], node };
  } catch (error) {
    if (isParserSyntaxError(error)) return null;
    throw new CodeAnalysisLimitError();
  }
}

function analyzeComponentExpressionSource(path, contents, componentType, state) {
  const expression = tryParseComponentExpression(path, contents, componentType, state);
  if (expression === null) {
    state.malformed = true;
    return null;
  }
  analyzeComponentExpression(expression, state);
  return expression;
}

function analyzeComponentStatements(path, contents, state) {
  if (typeof parseBabelProgram !== "function") throw new CodeAnalysisLimitError();
  consumeExpressionProbe(state, contents);
  try {
    const ast = parseBabelProgram(contents, {
      ...componentExpressionParserOptions(path),
      allowReturnOutsideFunction: true,
    });
    analyzeAst(ast.program, ast.comments, state);
  } catch (error) {
    if (error instanceof CodeAnalysisLimitError || error instanceof RangeError) throw error;
    if (isParserSyntaxError(error)) {
      state.malformed = true;
      return;
    }
    throw new CodeAnalysisLimitError();
  }
}

function findBracedComponentExpression(path, contents, start, componentType, state) {
  let candidate = contents.indexOf("}", start + 1);
  while (candidate !== -1) {
    const parsed = tryParseComponentExpression(
      path,
      contents.slice(start + 1, candidate),
      componentType,
      state,
    );
    if (parsed !== null) return { ...parsed, end: candidate + 1 };
    candidate = contents.indexOf("}", candidate + 1);
  }
  return null;
}

function findVueInterpolation(path, contents, start, state) {
  let candidate = contents.indexOf("}}", start + 2);
  while (candidate !== -1) {
    const parsed = tryParseComponentExpression(path, contents.slice(start + 2, candidate), "vue", state);
    if (parsed !== null) return { ...parsed, end: candidate + 2 };
    candidate = contents.indexOf("}}", candidate + 1);
  }
  return null;
}

function analyzeComponentExpression(expression, state) {
  analyzeAst(expression.node, expression.comments, state);
}

function markupNameCharacter(character) {
  return (
    character !== undefined &&
    (character === "[" || character === "]" || /[A-Za-z0-9_.:@#|-]/.test(character))
  );
}

function readMarkupAttributeName(contents, start, componentType) {
  let bracketDepth = 0;
  let cursor = start;
  while (cursor < contents.length) {
    const character = contents[cursor];
    if (
      /\s/.test(character) ||
      character === "=" ||
      character === ">" ||
      character === '"' ||
      character === "'" ||
      (character === "/" && contents[cursor + 1] === ">")
    ) {
      break;
    }
    if (character === "[") {
      bracketDepth += 1;
    } else if (character === "]") {
      bracketDepth -= 1;
      if (bracketDepth < 0) return { cursor, malformed: true, name: contents.slice(start, cursor + 1) };
    } else if (bracketDepth === 0 && !markupNameCharacter(character)) {
      return { cursor, malformed: true, name: contents.slice(start, cursor + 1) };
    } else if (bracketDepth > 0 && componentType !== "vue") {
      return { cursor, malformed: true, name: contents.slice(start, cursor + 1) };
    }
    cursor += 1;
  }
  return {
    cursor,
    malformed: cursor === start || bracketDepth !== 0,
    name: contents.slice(start, cursor),
  };
}

function skipMarkupWhitespace(contents, start) {
  let cursor = start;
  while (cursor < contents.length && /\s/.test(contents[cursor])) cursor += 1;
  return cursor;
}

function readMarkupQuotedValue(contents, start) {
  const quote = contents[start];
  const end = contents.indexOf(quote, start + 1);
  if (end === -1) return { closed: false, end: contents.length, value: "" };
  return { closed: true, end: end + 1, value: contents.slice(start + 1, end) };
}

function balancedMarkupAttributeName(name) {
  let depth = 0;
  for (const character of name) {
    if (character === "[") depth += 1;
    if (character === "]") {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function stripDirectiveModifiers(name) {
  let bracketDepth = 0;
  for (let cursor = 0; cursor < name.length; cursor += 1) {
    if (name[cursor] === "[") bracketDepth += 1;
    else if (name[cursor] === "]") bracketDepth -= 1;
    else if (name[cursor] === "." && bracketDepth === 0) return name.slice(0, cursor);
  }
  return name;
}

function vueDirectiveDescriptor(name) {
  if (!balancedMarkupAttributeName(name)) return { malformed: true };
  const normalized = stripDirectiveModifiers(name);
  if ([":", "@", "v-bind:", "v-on:"].includes(normalized)) return { malformed: true };
  let directive;
  let argument = "";
  if (normalized.startsWith(":")) {
    directive = "bind";
    argument = normalized.slice(1);
  } else if (normalized.startsWith("@")) {
    directive = "on";
    argument = normalized.slice(1);
  } else if (normalized.startsWith("v-")) {
    const separator = normalized.indexOf(":", 2);
    directive = normalized.slice(2, separator === -1 ? undefined : separator);
    argument = separator === -1 ? "" : normalized.slice(separator + 1);
  } else {
    return null;
  }

  if (directive === "" || argument === "[]") return { malformed: true };
  let dynamicArgument = null;
  let bindingName = "";
  if (argument.startsWith("[") || argument.endsWith("]")) {
    if (!argument.startsWith("[") || !argument.endsWith("]")) return { malformed: true };
    dynamicArgument = argument.slice(1, -1).trim();
    if (dynamicArgument === "") return { malformed: true };
  } else if (directive === "bind") {
    bindingName = argument;
  }

  let valueKind = "expression";
  if (directive === "on" && argument !== "") valueKind = "statements";
  else if (directive === "for") valueKind = "vue-for";
  return { bindingName, directive, dynamicArgument, malformed: false, valueKind };
}

function analyzeVueForDirective(path, contents, state) {
  const candidates = [...contents.matchAll(/\s+(?:in|of)\s+/g)].reverse();
  for (const candidate of candidates) {
    const separator = candidate.index;
    const bindingArrow = componentBindingArrow(contents.slice(0, separator));
    const iterableSource = contents.slice(separator + candidate[0].length).trim();
    if (bindingArrow === null || iterableSource === "") continue;
    const binding = tryParseComponentExpression(path, bindingArrow, "vue", state);
    const iterable = tryParseComponentExpression(path, iterableSource, "vue", state);
    if (binding === null || iterable === null) continue;
    analyzeComponentExpression(binding, state);
    analyzeComponentExpression(iterable, state);
    return;
  }
  state.malformed = true;
}

function analyzeVueDirectiveArgument(path, descriptor, state) {
  if (descriptor.dynamicArgument === null) return;
  analyzeComponentExpressionSource(path, descriptor.dynamicArgument, "vue", state);
}

function analyzeMarkupAttribute(path, componentType, name, value, valueType, state) {
  const vueDescriptor = componentType === "vue" ? vueDirectiveDescriptor(name) : null;
  if (vueDescriptor?.malformed) {
    state.malformed = true;
    return;
  }
  if (vueDescriptor !== null) analyzeVueDirectiveArgument(path, vueDescriptor, state);
  if (state.malformed || valueType === "absent") return;

  if (valueType === "expression") {
    analyzeComponentExpression(value, state);
    const bindingName = vueDescriptor?.bindingName ?? name;
    if (directSecretPair(bindingName, value.node)) state.hasSecret = true;
    return;
  }
  if (vueDescriptor?.valueKind === "statements") {
    analyzeComponentStatements(path, value, state);
    return;
  }
  if (vueDescriptor?.valueKind === "vue-for") {
    analyzeVueForDirective(path, value, state);
    return;
  }
  if (vueDescriptor !== null) {
    const expression = analyzeComponentExpressionSource(path, value, componentType, state);
    if (expression !== null && directSecretPair(vueDescriptor.bindingName, expression.node)) {
      state.hasSecret = true;
    }
    return;
  }
  if (directSecretPair(name, { type: "StringLiteral", value })) state.hasSecret = true;
}

function parseMarkupStartTag(path, contents, start, componentType, state) {
  let cursor = start + 1;
  const nameStart = cursor;
  while (markupNameCharacter(contents[cursor])) cursor += 1;
  if (cursor === nameStart) return null;
  const tagName = contents.slice(nameStart, cursor);
  const attributes = new Map();

  while (cursor < contents.length) {
    cursor = skipMarkupWhitespace(contents, cursor);
    if (contents.startsWith("/>", cursor)) {
      return { attributes, cursor: cursor + 2, selfClosing: true, tagName };
    }
    if (contents[cursor] === ">") {
      return { attributes, cursor: cursor + 1, selfClosing: false, tagName };
    }
    if (contents[cursor] === "{") {
      const expression = findBracedComponentExpression(path, contents, cursor, componentType, state);
      if (expression === null) {
        state.malformed = true;
        return { attributes, cursor: contents.length, selfClosing: false, tagName };
      }
      analyzeComponentExpression(expression, state);
      cursor = expression.end;
      continue;
    }

    const attribute = readMarkupAttributeName(contents, cursor, componentType);
    cursor = attribute.cursor;
    if (attribute.malformed) {
      state.malformed = true;
      return { attributes, cursor: contents.length, selfClosing: false, tagName };
    }
    const attributeName = attribute.name;
    if (!balancedMarkupAttributeName(attributeName)) {
      state.malformed = true;
      return { attributes, cursor: contents.length, selfClosing: false, tagName };
    }
    cursor = skipMarkupWhitespace(contents, cursor);
    if (contents[cursor] !== "=") {
      attributes.set(attributeName.toLowerCase(), "");
      analyzeMarkupAttribute(path, componentType, attributeName, "", "absent", state);
      continue;
    }
    cursor = skipMarkupWhitespace(contents, cursor + 1);
    if (cursor >= contents.length) {
      state.malformed = true;
      return { attributes, cursor, selfClosing: false, tagName };
    }

    if (contents[cursor] === '"' || contents[cursor] === "'") {
      const literal = readMarkupQuotedValue(contents, cursor);
      if (!literal.closed) {
        state.malformed = true;
        return { attributes, cursor: contents.length, selfClosing: false, tagName };
      }
      const decodedValue = decodeEncodedAttribute(literal.value, state);
      attributes.set(attributeName.toLowerCase(), decodedValue);
      analyzeDecodedSpecificLiteral(decodedValue, state);
      analyzeMarkupAttribute(path, componentType, attributeName, decodedValue, "literal", state);
      cursor = literal.end;
      continue;
    }
    if (contents[cursor] === "{") {
      const expression = findBracedComponentExpression(path, contents, cursor, componentType, state);
      if (expression === null) {
        state.malformed = true;
        return { attributes, cursor: contents.length, selfClosing: false, tagName };
      }
      analyzeMarkupAttribute(path, componentType, attributeName, expression, "expression", state);
      cursor = expression.end;
      continue;
    }

    const valueStart = cursor;
    while (
      cursor < contents.length &&
      !/\s/.test(contents[cursor]) &&
      contents[cursor] !== ">" &&
      !contents.startsWith("/>", cursor)
    ) {
      cursor += 1;
    }
    if (cursor === valueStart) {
      state.malformed = true;
      return { attributes, cursor: contents.length, selfClosing: false, tagName };
    }
    const value = decodeEncodedAttribute(contents.slice(valueStart, cursor), state);
    attributes.set(attributeName.toLowerCase(), value);
    analyzeDecodedSpecificLiteral(value, state);
    analyzeMarkupAttribute(path, componentType, attributeName, value, "literal", state);
  }

  state.malformed = true;
  return { attributes, cursor, selfClosing: false, tagName };
}

function findRawElementClose(contents, lowerContents, start, tagName) {
  const prefix = "</" + tagName.toLowerCase();
  let candidate = lowerContents.indexOf(prefix, start);
  while (candidate !== -1) {
    const boundary = lowerContents[candidate + prefix.length];
    if (boundary === ">" || /\s/.test(boundary ?? "")) {
      const close = lowerContents.indexOf(">", candidate + prefix.length);
      if (close === -1) return null;
      return { bodyEnd: candidate, end: close + 1 };
    }
    candidate = lowerContents.indexOf(prefix, candidate + 1);
  }
  return null;
}

function scriptLanguage(attributes) {
  const language = attributes.get("lang")?.trim().toLowerCase();
  if (language) return language;
  const type = attributes.get("type")?.trim().toLowerCase();
  if (type?.includes("typescript")) return "ts";
  if (type?.includes("jsx")) return "jsx";
  return "js";
}

function scriptContainsCode(attributes) {
  const type = attributes.get("type")?.trim().toLowerCase();
  return (
    type === undefined ||
    type === "" ||
    type === "module" ||
    type.includes("javascript") ||
    type.includes("ecmascript") ||
    type.includes("typescript") ||
    type.includes("jsx")
  );
}

function consumeMarkupDeclaration(contents, start) {
  let cursor = start;
  let quote = null;
  while (cursor < contents.length) {
    const character = contents[cursor];
    if (quote !== null) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return cursor + 1;
    }
    cursor += 1;
  }
  return null;
}

function componentTypeForPath(path) {
  return path.slice(path.lastIndexOf(".") + 1).toLowerCase();
}

function analyzeMarkupSource(path, contents, start, state) {
  const componentType = componentTypeForPath(path);
  const lowerContents = contents.toLowerCase();
  let cursor = start;

  while (cursor < contents.length && !state.analysisLimited && !state.malformed) {
    if (contents.startsWith("<!--", cursor)) {
      const close = contents.indexOf("-->", cursor + 4);
      if (close === -1) {
        state.malformed = true;
        break;
      }
      if (containsNonCodeGenericSecret(contents.slice(cursor + 4, close))) state.hasSecret = true;
      cursor = close + 3;
      continue;
    }
    if (componentType === "vue" && contents.startsWith("{{", cursor)) {
      const interpolation = findVueInterpolation(path, contents, cursor, state);
      if (interpolation === null) {
        state.malformed = true;
        break;
      }
      analyzeComponentExpression(interpolation, state);
      cursor = interpolation.end;
      continue;
    }
    if ((componentType === "svelte" || componentType === "astro") && contents[cursor] === "{") {
      const expression = findBracedComponentExpression(path, contents, cursor, componentType, state);
      if (expression === null) {
        state.malformed = true;
        break;
      }
      analyzeComponentExpression(expression, state);
      cursor = expression.end;
      continue;
    }
    if (contents[cursor] !== "<") {
      const textStart = cursor;
      while (
        cursor < contents.length &&
        contents[cursor] !== "<" &&
        !(componentType === "vue" && contents.startsWith("{{", cursor)) &&
        !((componentType === "svelte" || componentType === "astro") && contents[cursor] === "{")
      ) {
        cursor += 1;
      }
      analyzeEncodedLiveText(contents.slice(textStart, cursor), state);
      continue;
    }
    if (contents.startsWith("</", cursor)) {
      const close = consumeMarkupDeclaration(contents, cursor + 2);
      if (close === null) {
        state.malformed = true;
        break;
      }
      cursor = close;
      continue;
    }
    if (contents.startsWith("<!", cursor) || contents.startsWith("<?", cursor)) {
      const close = consumeMarkupDeclaration(contents, cursor + 2);
      if (close === null) {
        state.malformed = true;
        break;
      }
      cursor = close;
      continue;
    }
    if (!/[A-Za-z]/.test(contents[cursor + 1] ?? "")) {
      cursor += 1;
      continue;
    }

    const tag = parseMarkupStartTag(path, contents, cursor, componentType, state);
    if (tag === null) {
      cursor += 1;
      continue;
    }
    cursor = tag.cursor;
    const lowerTagName = tag.tagName.toLowerCase();
    if (tag.selfClosing || (lowerTagName !== "script" && lowerTagName !== "style")) continue;
    const close = findRawElementClose(contents, lowerContents, cursor, lowerTagName);
    if (close === null) {
      state.malformed = true;
      break;
    }
    const body = contents.slice(cursor, close.bodyEnd);
    if (lowerTagName === "script") {
      if (scriptContainsCode(tag.attributes)) {
        analyzeProgramSource(path, body, state, scriptLanguage(tag.attributes));
      } else if (containsNonCodeGenericSecret(body)) {
        state.hasSecret = true;
      }
    }
    cursor = close.end;
  }
}

function lineEnd(contents, start) {
  const newline = contents.indexOf("\n", start);
  return newline === -1 ? contents.length : newline;
}

function lineContents(contents, start, end) {
  const withoutCarriageReturn = end > start && contents[end - 1] === "\r" ? end - 1 : end;
  return contents.slice(start, withoutCarriageReturn);
}

function astroFrontmatter(contents) {
  const firstStart = contents.charCodeAt(0) === 0xfeff ? 1 : 0;
  const firstEnd = lineEnd(contents, firstStart);
  if (lineContents(contents, firstStart, firstEnd).trim() !== "---") {
    return { body: null, markupStart: 0, malformed: false };
  }
  let cursor = firstEnd < contents.length ? firstEnd + 1 : contents.length;
  const bodyStart = cursor;
  while (cursor <= contents.length) {
    const end = lineEnd(contents, cursor);
    if (lineContents(contents, cursor, end).trim() === "---") {
      return {
        body: contents.slice(bodyStart, cursor),
        malformed: false,
        markupStart: end < contents.length ? end + 1 : end,
      };
    }
    if (end === contents.length) break;
    cursor = end + 1;
  }
  return { body: null, markupStart: contents.length, malformed: true };
}

function containsComponentGenericSecret(path, contents) {
  const state = createCodeAnalysisState();
  try {
    let markupStart = 0;
    if (/\.astro$/i.test(path)) {
      const frontmatter = astroFrontmatter(contents);
      if (frontmatter.malformed) {
        state.malformed = true;
        return state;
      }
      markupStart = frontmatter.markupStart;
      if (frontmatter.body !== null) analyzeProgramSource(path, frontmatter.body, state, "astro");
    }
    analyzeMarkupSource(path, contents, markupStart, state);
  } catch (error) {
    if (error instanceof CodeAnalysisLimitError || error instanceof RangeError) {
      state.analysisLimited = true;
    } else {
      state.malformed = true;
    }
  }
  return state;
}

function containsCodeGenericSecret(path, contents) {
  if (COMPONENT_SOURCE_PATH.test(path)) return containsComponentGenericSecret(path, contents);
  const state = createCodeAnalysisState();
  analyzeProgramSource(path, contents, state);
  return state;
}

function skipNonCodeTrivia(contents, start) {
  let cursor = start;
  while (cursor < contents.length && /\s/.test(contents[cursor])) cursor += 1;
  return cursor;
}

function containsNonCodeGenericSecret(contents) {
  const candidate = /(^|[^A-Za-z0-9_$])(?:(["'])([^"'\\\r\n]{1,128})\2|([A-Za-z_$][A-Za-z0-9_$-]{0,127}))(?=\s*[:=])/gim;
  let match;
  while ((match = candidate.exec(contents)) !== null) {
    if (!isCredentialName(match[3] ?? match[4])) continue;
    let cursor = skipNonCodeTrivia(contents, match.index + match[0].length);
    if (contents[cursor] !== ":" && contents[cursor] !== "=") continue;
    cursor = skipNonCodeTrivia(contents, cursor + 1);
    const quote = contents[cursor];
    if (quote === '"' || quote === "'" || quote === "`") {
      const literal = readQuotedLiteral(contents, cursor, contents.length);
      if (literal.closed && isSecretLiteralValue(literal.value)) return true;
      continue;
    }
    const unquoted = /^([A-Za-z0-9_./+~-]{16,}={0,2})/.exec(contents.slice(cursor));
    if (unquoted !== null && isSecretLiteralValue(unquoted[1])) return true;
  }
  return false;
}

function analyzeJsonSource(contents, truncated) {
  const state = createLiteralAnalysisState();
  if (truncated) {
    state.analysisLimited = true;
    return state;
  }

  let root;
  try {
    root = JSON.parse(contents);
  } catch {
    state.hasSecret = containsNonCodeGenericSecret(contents);
    state.malformed = true;
    return state;
  }

  const stack = [root];
  let visited = 0;
  while (stack.length > 0) {
    const value = stack.pop();
    visited += 1;
    if (visited > MAX_CODE_AST_NODES) {
      state.analysisLimited = true;
      return state;
    }
    if (typeof value === "string") {
      analyzeDecodedSpecificLiteral(value, state);
      continue;
    }
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) stack.push(value[index]);
      continue;
    }
    if (value === null || typeof value !== "object") continue;
    for (const [key, entryValue] of Object.entries(value)) {
      analyzeDecodedSpecificLiteral(key, state);
      if (typeof entryValue === "string" && isCredentialName(key) && isSecretLiteralValue(entryValue)) {
        state.hasSecret = true;
      }
      stack.push(entryValue);
    }
  }
  return state;
}

const YAML_DOUBLE_QUOTE_ESCAPES = new Map([
  ['"', '"'],
  ["/", "/"],
  ["0", "\0"],
  ["L", "\u2028"],
  ["N", "\u0085"],
  ["P", "\u2029"],
  ["_", "\u00a0"],
  ["a", "\x07"],
  ["b", "\b"],
  ["e", "\x1b"],
  ["f", "\f"],
  ["n", "\n"],
  ["r", "\r"],
  ["t", "\t"],
  ["v", "\v"],
  ["\\", "\\"],
  [" ", " "],
  ["\t", "\t"],
]);

function yamlUnicodeEscape(contents, start, digits) {
  const end = start + digits;
  const encoded = contents.slice(start, end);
  if (encoded.length !== digits || !/^[0-9A-Fa-f]+$/.test(encoded)) return null;
  const codePoint = Number.parseInt(encoded, 16);
  if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return null;
  return { end, value: String.fromCodePoint(codePoint) };
}

function skipYamlContinuationIndent(contents, start) {
  let cursor = start;
  while (contents[cursor] === " " || contents[cursor] === "\t") cursor += 1;
  return cursor;
}

function readYamlDoubleQuotedScalar(contents, start) {
  let cursor = start + 1;
  let value = "";
  while (cursor < contents.length) {
    const character = contents[cursor];
    if (character === '"') return { end: cursor + 1, malformed: false, value };
    if (character === "\\") {
      if (cursor + 1 >= contents.length) return { end: contents.length, malformed: true, value: "" };
      const continuationWidth = lineTerminatorWidth(contents, cursor + 1, contents.length);
      if (continuationWidth > 0) {
        cursor = skipYamlContinuationIndent(contents, cursor + 1 + continuationWidth);
        continue;
      }
      const escape = contents[cursor + 1];
      const unicodeDigits = escape === "x" ? 2 : escape === "u" ? 4 : escape === "U" ? 8 : 0;
      if (unicodeDigits > 0) {
        const decoded = yamlUnicodeEscape(contents, cursor + 2, unicodeDigits);
        if (decoded === null) return { end: cursor + 2 + unicodeDigits, malformed: true, value: "" };
        value += decoded.value;
        cursor = decoded.end;
        continue;
      }
      const decoded = YAML_DOUBLE_QUOTE_ESCAPES.get(escape);
      if (decoded === undefined) return { end: cursor + 2, malformed: true, value: "" };
      value += decoded;
      cursor += 2;
      continue;
    }
    const newlineWidth = lineTerminatorWidth(contents, cursor, contents.length);
    if (newlineWidth > 0) {
      value += " ";
      cursor = skipYamlContinuationIndent(contents, cursor + newlineWidth);
      continue;
    }
    value += character;
    cursor += 1;
  }
  return { end: contents.length, malformed: true, value: "" };
}

function readYamlSingleQuotedScalar(contents, start) {
  let cursor = start + 1;
  let value = "";
  while (cursor < contents.length) {
    if (contents[cursor] === "'") {
      if (contents[cursor + 1] === "'") {
        value += "'";
        cursor += 2;
        continue;
      }
      return { end: cursor + 1, malformed: false, value };
    }
    const newlineWidth = lineTerminatorWidth(contents, cursor, contents.length);
    if (newlineWidth > 0) {
      value += " ";
      cursor = skipYamlContinuationIndent(contents, cursor + newlineWidth);
      continue;
    }
    value += contents[cursor];
    cursor += 1;
  }
  return { end: contents.length, malformed: true, value: "" };
}

function skipYamlHorizontalWhitespace(contents, start, end) {
  let cursor = start;
  while (cursor < end && (contents[cursor] === " " || contents[cursor] === "\t")) cursor += 1;
  return cursor;
}

function yamlPlainValue(contents, start, end) {
  let valueEnd = end;
  for (let cursor = start; cursor < end; cursor += 1) {
    if (contents[cursor] === "#" && (cursor === start || /\s/.test(contents[cursor - 1]))) {
      valueEnd = cursor;
      break;
    }
  }
  return contents.slice(start, valueEnd).trim();
}

function nextYamlLine(contents, start) {
  const end = lineEnd(contents, start);
  return end < contents.length ? end + 1 : contents.length;
}

function yamlLineIndent(contents, start, end) {
  let cursor = start;
  while (cursor < end && contents[cursor] === " ") cursor += 1;
  return cursor - start;
}

function yamlPhysicalLineEnd(contents, start, end) {
  return end > start && contents[end - 1] === "\r" ? end - 1 : end;
}

const MAX_YAML_ANALYSIS_UNITS = 100_000;
// Each flow collection adds at most two parser frames. This hard ceiling keeps
// adversarial nesting bounded well below the JavaScript call-stack limit.
const MAX_YAML_FLOW_NESTING = 128;

function consumeYamlUnit(state) {
  state.yamlUnits += 1;
  if (state.yamlUnits <= MAX_YAML_ANALYSIS_UNITS) return true;
  state.analysisLimited = true;
  return false;
}

function analyzeYamlScalar(value, state) {
  analyzeDecodedSpecificLiteral(value, state);
}

function parseYamlBlockHeader(value) {
  if (value[0] !== "|" && value[0] !== ">") return null;
  let chomp = "clip";
  let indentation = null;
  for (const character of value.slice(1)) {
    if (character === "+" || character === "-") {
      if (chomp !== "clip") return { malformed: true };
      chomp = character === "+" ? "keep" : "strip";
    } else if (/^[1-9]$/.test(character)) {
      if (indentation !== null) return { malformed: true };
      indentation = Number(character);
    } else {
      return { malformed: true };
    }
  }
  return { chomp, indentation, malformed: false, style: value[0] === "|" ? "literal" : "folded" };
}

function foldYamlBlockLines(lines, style) {
  let value = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    value += line.text;
    if (!line.hasBreak) continue;
    if (style === "literal") {
      value += "\n";
      continue;
    }
    const next = lines[index + 1];
    value +=
      next !== undefined && !line.blank && !next.blank && !line.moreIndented && !next.moreIndented
        ? " "
        : "\n";
  }
  return value;
}

function chompYamlBlock(value, chomp) {
  if (chomp === "keep") return value;
  const stripped = value.replace(/\n+$/g, "");
  if (chomp === "strip" || stripped === value) return stripped;
  return stripped + "\n";
}

function parseYamlBlockScalar(contents, headerEnd, parentIndent, header, state) {
  let cursor = nextYamlLine(contents, headerEnd);
  let contentIndent = header.indentation === null ? null : parentIndent + header.indentation;
  const lines = [];

  while (cursor < contents.length && !state.analysisLimited && !state.malformed) {
    if (!consumeYamlUnit(state)) break;
    const currentLineEnd = lineEnd(contents, cursor);
    const physicalLineEnd = yamlPhysicalLineEnd(contents, cursor, currentLineEnd);
    const contentStart = skipYamlHorizontalWhitespace(contents, cursor, physicalLineEnd);
    if (contentStart >= physicalLineEnd) {
      lines.push({ blank: true, hasBreak: currentLineEnd < contents.length, moreIndented: false, text: "" });
      cursor = nextYamlLine(contents, currentLineEnd);
      continue;
    }

    const indent = yamlLineIndent(contents, cursor, physicalLineEnd);
    if (contents[cursor + indent] === "\t") {
      state.malformed = true;
      break;
    }
    if (contentIndent === null) {
      if (indent <= parentIndent) break;
      contentIndent = indent;
    }
    if (indent < contentIndent) {
      if (indent <= parentIndent) break;
      state.malformed = true;
      break;
    }

    const physicalLine = lineContents(contents, cursor, currentLineEnd);
    lines.push({
      blank: false,
      hasBreak: currentLineEnd < contents.length,
      moreIndented: indent > contentIndent,
      text: physicalLine.slice(contentIndent),
    });
    cursor = nextYamlLine(contents, currentLineEnd);
  }

  const value = chompYamlBlock(foldYamlBlockLines(lines, header.style), header.chomp);
  analyzeYamlScalar(value, state);
  return { end: cursor, value };
}

function isYamlFlowCommentStart(contents, cursor) {
  if (contents[cursor] !== "#") return false;
  if (cursor === 0) return true;
  return [" ", "\t", "\r", "\n"].includes(contents[cursor - 1]);
}

function skipYamlFlowTrivia(contents, start) {
  let cursor = start;
  while (cursor < contents.length) {
    while (cursor < contents.length && /\s/.test(contents[cursor])) cursor += 1;
    if (!isYamlFlowCommentStart(contents, cursor)) break;
    cursor = nextYamlLine(contents, cursor);
  }
  return cursor;
}

function malformedYamlFlow(contents, state) {
  if (!state.analysisLimited) state.malformed = true;
  return { end: contents.length, scalar: null };
}

function isYamlFlowMappingColon(contents, cursor) {
  if (contents[cursor] !== ":") return false;
  const following = contents[cursor + 1];
  return following === undefined || /\s/.test(following) || ",[]{}".includes(following);
}

function readYamlFlowPlain(contents, start) {
  let cursor = start;
  while (cursor < contents.length) {
    const character = contents[cursor];
    if (character === "," || character === "]" || character === "}" || character === "[" || character === "{") break;
    if (isYamlFlowMappingColon(contents, cursor)) break;
    if (character === "#" && (cursor === start || /\s/.test(contents[cursor - 1]))) break;
    cursor += 1;
  }
  const scalar = contents.slice(start, cursor).trim();
  return scalar === "" ? null : { end: cursor, scalar };
}

function parseYamlFlowNode(contents, start, state, depth = 0) {
  if (!consumeYamlUnit(state)) return { end: contents.length, scalar: null };
  const cursor = skipYamlFlowTrivia(contents, start);
  const character = contents[cursor];
  if (character === "[" || character === "{") {
    if (depth >= MAX_YAML_FLOW_NESTING) {
      state.analysisLimited = true;
      return { end: contents.length, scalar: null };
    }
    return character === "["
      ? parseYamlFlowSequence(contents, cursor, state, depth + 1)
      : parseYamlFlowMapping(contents, cursor, state, depth + 1);
  }
  if (character === '"') {
    const scalar = readYamlDoubleQuotedScalar(contents, cursor);
    if (scalar.malformed) return malformedYamlFlow(contents, state);
    analyzeYamlScalar(scalar.value, state);
    return { end: scalar.end, scalar: scalar.value };
  }
  if (character === "'") {
    const scalar = readYamlSingleQuotedScalar(contents, cursor);
    if (scalar.malformed) return malformedYamlFlow(contents, state);
    analyzeYamlScalar(scalar.value, state);
    return { end: scalar.end, scalar: scalar.value };
  }
  const plain = readYamlFlowPlain(contents, cursor);
  if (plain === null) return malformedYamlFlow(contents, state);
  analyzeYamlScalar(plain.scalar, state);
  return plain;
}

function associateYamlPair(key, value, state) {
  if (
    typeof key === "string" &&
    typeof value === "string" &&
    isCredentialName(key) &&
    isSecretLiteralValue(value.trim())
  ) {
    state.hasSecret = true;
  }
}

function parseYamlFlowSequence(contents, start, state, depth) {
  let cursor = skipYamlFlowTrivia(contents, start + 1);
  if (contents[cursor] === "]") return { end: cursor + 1, scalar: null };
  while (cursor < contents.length && !state.malformed && !state.analysisLimited) {
    const entry = parseYamlFlowNode(contents, cursor, state, depth);
    cursor = skipYamlFlowTrivia(contents, entry.end);
    if (contents[cursor] === ":") {
      cursor = skipYamlFlowTrivia(contents, cursor + 1);
      let value = { end: cursor, scalar: null };
      if (contents[cursor] !== "," && contents[cursor] !== "]") {
        value = parseYamlFlowNode(contents, cursor, state, depth);
      }
      associateYamlPair(entry.scalar, value.scalar, state);
      cursor = skipYamlFlowTrivia(contents, value.end);
    }
    if (contents[cursor] === "]") return { end: cursor + 1, scalar: null };
    if (contents[cursor] !== ",") return malformedYamlFlow(contents, state);
    cursor = skipYamlFlowTrivia(contents, cursor + 1);
    if (contents[cursor] === "]") return { end: cursor + 1, scalar: null };
  }
  return malformedYamlFlow(contents, state);
}

function parseYamlFlowMapping(contents, start, state, depth) {
  let cursor = skipYamlFlowTrivia(contents, start + 1);
  if (contents[cursor] === "}") return { end: cursor + 1, scalar: null };
  while (cursor < contents.length && !state.malformed && !state.analysisLimited) {
    const key = parseYamlFlowNode(contents, cursor, state, depth);
    cursor = skipYamlFlowTrivia(contents, key.end);
    let value = { end: cursor, scalar: null };
    if (contents[cursor] === ":") {
      cursor = skipYamlFlowTrivia(contents, cursor + 1);
      value = { end: cursor, scalar: null };
      if (contents[cursor] !== "," && contents[cursor] !== "}") {
        value = parseYamlFlowNode(contents, cursor, state, depth);
        cursor = skipYamlFlowTrivia(contents, value.end);
      }
      associateYamlPair(key.scalar, value.scalar, state);
    } else if (contents[cursor] !== "," && contents[cursor] !== "}") {
      return malformedYamlFlow(contents, state);
    }
    if (contents[cursor] === "}") return { end: cursor + 1, scalar: null };
    if (contents[cursor] !== ",") return malformedYamlFlow(contents, state);
    cursor = skipYamlFlowTrivia(contents, cursor + 1);
    if (contents[cursor] === "}") return { end: cursor + 1, scalar: null };
  }
  return malformedYamlFlow(contents, state);
}

function validateYamlFlowLineRemainder(contents, start, state) {
  if (state.malformed || state.analysisLimited) return;
  const end = lineEnd(contents, start);
  const physicalLineEnd = yamlPhysicalLineEnd(contents, start, end);
  const cursor = skipYamlHorizontalWhitespace(contents, start, physicalLineEnd);
  if (cursor < physicalLineEnd && (contents[cursor] !== "#" || cursor === start)) state.malformed = true;
}

function validateYamlQuotedLineRemainder(contents, start, state) {
  if (state.malformed || state.analysisLimited) return;
  const end = lineEnd(contents, start);
  const physicalLineEnd = yamlPhysicalLineEnd(contents, start, end);
  const cursor = skipYamlHorizontalWhitespace(contents, start, physicalLineEnd);
  if (cursor < physicalLineEnd && (contents[cursor] !== "#" || cursor === start)) state.malformed = true;
}

function findYamlMappingColon(contents, start, end) {
  for (let cursor = start; cursor < end; cursor += 1) {
    if (contents[cursor] !== ":") continue;
    const following = contents[cursor + 1];
    if (cursor + 1 >= end || /\s/.test(following ?? "") || "[{".includes(following ?? "")) return cursor;
  }
  return -1;
}

function analyzeYamlSource(contents, truncated) {
  const state = createLiteralAnalysisState();
  if (truncated) {
    state.analysisLimited = true;
    return state;
  }
  state.hasSecret = containsNonCodeGenericSecret(contents);
  state.yamlUnits = 0;

  let lineStart = 0;
  while (lineStart < contents.length && !state.malformed && !state.analysisLimited) {
    if (!consumeYamlUnit(state)) break;
    const currentLineEnd = lineEnd(contents, lineStart);
    const parentIndent = yamlLineIndent(contents, lineStart, currentLineEnd);
    let cursor = skipYamlHorizontalWhitespace(contents, lineStart, currentLineEnd);
    if (contents[cursor] === "#" || cursor >= currentLineEnd) {
      lineStart = nextYamlLine(contents, currentLineEnd);
      continue;
    }
    if (contents[cursor] === "-" && /\s/.test(contents[cursor + 1] ?? "")) {
      cursor = skipYamlHorizontalWhitespace(contents, cursor + 1, currentLineEnd);
    }

    if (contents[cursor] === "[" || contents[cursor] === "{") {
      const flow = parseYamlFlowNode(contents, cursor, state);
      validateYamlFlowLineRemainder(contents, flow.end, state);
      lineStart = nextYamlLine(contents, Math.max(currentLineEnd, flow.end));
      continue;
    }

    let key;
    let keyEnd;
    if (contents[cursor] === '"') {
      const scalar = readYamlDoubleQuotedScalar(contents, cursor);
      if (scalar.malformed) {
        state.malformed = true;
        break;
      }
      analyzeYamlScalar(scalar.value, state);
      key = scalar.value;
      keyEnd = scalar.end;
    } else if (contents[cursor] === "'") {
      const scalar = readYamlSingleQuotedScalar(contents, cursor);
      if (scalar.malformed) {
        state.malformed = true;
        break;
      }
      analyzeYamlScalar(scalar.value, state);
      key = scalar.value;
      keyEnd = scalar.end;
    } else {
      const colon = findYamlMappingColon(contents, cursor, currentLineEnd);
      if (colon === -1) {
        const scalar = yamlPlainValue(contents, cursor, currentLineEnd);
        const blockHeader = parseYamlBlockHeader(scalar);
        if (blockHeader !== null) {
          if (blockHeader.malformed) {
            state.malformed = true;
            break;
          }
          const block = parseYamlBlockScalar(contents, currentLineEnd, parentIndent, blockHeader, state);
          lineStart = block.end;
          continue;
        }
        analyzeYamlScalar(scalar, state);
        lineStart = nextYamlLine(contents, currentLineEnd);
        continue;
      }
      key = contents.slice(cursor, colon).trim();
      analyzeYamlScalar(key, state);
      keyEnd = colon;
    }

    const colon = skipYamlHorizontalWhitespace(contents, keyEnd, currentLineEnd);
    if (contents[colon] !== ":") {
      lineStart = nextYamlLine(contents, Math.max(currentLineEnd, keyEnd));
      continue;
    }
    const valueStart = skipYamlHorizontalWhitespace(contents, colon + 1, currentLineEnd);
    if (valueStart >= currentLineEnd || contents[valueStart] === "#") {
      lineStart = nextYamlLine(contents, currentLineEnd);
      continue;
    }

    if (contents[valueStart] === "[" || contents[valueStart] === "{") {
      const flow = parseYamlFlowNode(contents, valueStart, state);
      validateYamlFlowLineRemainder(contents, flow.end, state);
      lineStart = nextYamlLine(contents, Math.max(currentLineEnd, flow.end));
      continue;
    }

    let value;
    let valueEnd = currentLineEnd;
    if (contents[valueStart] === '"') {
      const scalar = readYamlDoubleQuotedScalar(contents, valueStart);
      if (scalar.malformed) {
        state.malformed = true;
        break;
      }
      analyzeYamlScalar(scalar.value, state);
      validateYamlQuotedLineRemainder(contents, scalar.end, state);
      value = scalar.value;
      valueEnd = scalar.end;
    } else if (contents[valueStart] === "'") {
      const scalar = readYamlSingleQuotedScalar(contents, valueStart);
      if (scalar.malformed) {
        state.malformed = true;
        break;
      }
      analyzeYamlScalar(scalar.value, state);
      validateYamlQuotedLineRemainder(contents, scalar.end, state);
      value = scalar.value;
      valueEnd = scalar.end;
    } else {
      value = yamlPlainValue(contents, valueStart, currentLineEnd);
      const blockHeader = parseYamlBlockHeader(value);
      if (blockHeader !== null) {
        if (blockHeader.malformed) {
          state.malformed = true;
          break;
        }
        const block = parseYamlBlockScalar(contents, currentLineEnd, parentIndent, blockHeader, state);
        associateYamlPair(key, block.value, state);
        lineStart = block.end;
        continue;
      }
      analyzeYamlScalar(value, state);
    }
    associateYamlPair(key, value, state);
    lineStart = nextYamlLine(contents, Math.max(currentLineEnd, valueEnd));
  }
  return state;
}

function containsGenericSecretLiteral(path, contents, truncated) {
  if (/\.json$/i.test(path)) return analyzeJsonSource(contents, truncated);
  if (/\.ya?ml$/i.test(path)) return analyzeYamlSource(contents, truncated);
  if (CODE_SOURCE_PATH.test(path) && truncated) {
    return {
      analysisLimited: true,
      decodedLiteralCodes: new Set(),
      hasSecret: false,
      malformed: false,
    };
  }
  if (CODE_SOURCE_PATH.test(path)) return containsCodeGenericSecret(path, contents);
  return {
    ...createLiteralAnalysisState(),
    hasSecret: containsNonCodeGenericSecret(contents),
  };
}

function contentFindings(path, contents, truncated = false, auditedAttribution = false) {
  const findings = [];
  const genericSecretScan = containsGenericSecretLiteral(path, contents, truncated);
  const addIfMatched = (expression, severity, code, ruleName, includeDecodedLiveText = false) => {
    if (expression.test(contents) || (includeDecodedLiveText && genericSecretScan.decodedLiteralCodes.has(code))) {
      findings.push(finding(severity, code, path, `${ruleName} detected in "${path}".`));
    }
  };

  addIfMatched(
    GOOGLE_API_KEY_LITERAL,
    "error",
    "credential.google-api-key",
    "Google API key-shaped literal",
    true,
  );
  addIfMatched(
    BEARER_TOKEN_LITERAL,
    "error",
    "credential.bearer-token",
    "Bearer token-shaped literal",
    true,
  );
  if (genericSecretScan.malformed) {
    findings.push(
      finding(
        "error",
        "scan.malformed-code",
        path,
        `Malformed code could not be safely inspected at "${path}".`,
      ),
    );
  }
  if (genericSecretScan.analysisLimited) {
    findings.push(
      finding(
        "error",
        "scan.analysis-limit",
        path,
        `Code credential analysis limit reached at "${path}".`,
      ),
    );
  }
  if (genericSecretScan.hasSecret) {
    findings.push(
      finding(
        "error",
        "credential.generic-secret",
        path,
        `Generic credential-shaped assignment detected in "${path}".`,
      ),
    );
  }
  addIfMatched(
    PRIVATE_URL_LITERAL,
    "error",
    "credential.private-url",
    "Credential-bearing private URL",
    true,
  );
  addIfMatched(/\b(?:set-)?cookie\s*:\s*[^\s;=]+=[^\s;]{12,}/i, "error", "credential.cookie", "Cookie-shaped literal");
  addIfMatched(
    /(?:^|[^A-Za-z0-9])["']?(?:booking|reservation|confirmation)(?:[_ -]?(?:reference|ref|number|no|code))["']?\s*[:#=]\s*["']?[A-Z0-9][A-Z0-9-]{4,}\b/im,
    "error",
    "privacy.booking-reference",
    "Booking reference-shaped literal",
  );
  addIfMatched(
    /(?<![\d.])(?:\+?(?:81|886)[ -]?(?:0)?(?:\d[ -]?){8,10}\d|0(?:9\d{2}[- ]?\d{3}[- ]?\d{3}|[1-9]\d?[- ]?\d{3,4}[- ]?\d{4}))(?![\d.])/,
    "error",
    "privacy.phone-number",
    "Telephone number-shaped literal",
  );
  addIfMatched(
    /(?:^|[^A-Za-z0-9])["']?passport(?:[_ -]?(?:number|no))?["']?\s*[:#=]\s*["']?[A-Z0-9][A-Z0-9-]{5,}\b/im,
    "error",
    "privacy.passport-number",
    "Passport number-shaped literal",
  );

  const reservedEmailDomain = (domain) =>
    ["example.com", "example.net", "example.org", "localhost"].includes(domain) ||
    [".example", ".invalid", ".localhost", ".test"].some((suffix) => domain.endsWith(suffix));
  const emailExpression = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,}|localhost)\b/gi;
  for (const line of contents.split(/\r?\n/)) {
    let match;
    while ((match = emailExpression.exec(line)) !== null) {
      if (reservedEmailDomain(match[1].toLowerCase())) continue;
      if (auditedAttribution) continue;
      if (/\b(?:public|business|support)\s+(?:contact|email)\b/i.test(line)) {
        findings.push(
          finding(
            "warning",
            "privacy.public-contact-review",
            path,
            `Explicit public or business contact requires review in "${path}".`,
          ),
        );
      } else {
        findings.push(finding("error", "privacy.email-address", path, `Personal email address detected in "${path}".`));
      }
    }
  }

  const hostingConfiguration = /(?:^|\/)(?:vercel\.json|netlify\.toml|firebase\.json|\.firebaserc|wrangler\.toml|render\.yaml|fly\.toml|amplify\.ya?ml)$/i.test(
    path,
  );
  const deployWorkflow =
    /(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i.test(path) &&
    /(?:deploy|pages|vercel|netlify|firebase|wrangler|cloudflare|render|amplify)/i.test(contents);
  if (hostingConfiguration || deployWorkflow) {
    findings.push(
      finding(
        "warning",
        "access.public-configuration",
        path,
        `Public-access hosting configuration requires explicit review at "${path}".`,
      ),
    );
  }
  return findings;
}

export async function scanPublication(rootDir, testOperations = {}) {
  if (typeof rootDir !== "string" || rootDir.trim() === "") throw new Error("publication root is required");
  const operations = { ...DEFAULT_SCAN_OPERATIONS, ...testOperations };
  const resolvedRoot = resolve(rootDir);
  const rootStats = await lstat(resolvedRoot);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error("publication root must be a non-symbolic-link directory");
  }
  const canonicalRoot = await realpath(resolvedRoot);

  const findings = [];
  const rootEntries = await readdir(canonicalRoot);
  for (const name of rootEntries.filter((entry) => entry.toLowerCase().startsWith(".laugh-tale-incomplete-"))) {
    findings.push(...filenameFindings(name));
  }
  const inventory = await publicationInventory(canonicalRoot, operations);
  const vendorAudit = await auditVendorInventory(canonicalRoot, inventory);
  findings.push(...vendorAudit.findings);
  for (const relativePath of inventory) {
    findings.push(...filenameFindings(relativePath, vendorAudit.trustedFiles.has(relativePath)));
    const fullPath = join(canonicalRoot, relativePath);
    let stats;
    try {
      stats = await lstat(fullPath);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      findings.push(finding("error", "scan.unreadable-file", relativePath, `Publication file could not be inspected at "${relativePath}".`));
      continue;
    }
    if (!stats.isFile()) continue;
    if (relativePath.split("/").some((segment) => HARD_SKIPPED_DIRECTORIES.has(segment))) continue;

    try {
      const contents = await readTextPrefix(fullPath, stats.size);
      if (contents !== null) {
        findings.push(
          ...contentFindings(
            relativePath,
            contents,
            stats.size > MAX_TEXT_BYTES,
            vendorAudit.trustedAttribution.has(relativePath),
          ),
        );
      }
    } catch {
      findings.push(finding("error", "scan.unreadable-file", relativePath, `Publication file could not be inspected at "${relativePath}".`));
    }
  }

  const unique = new Map();
  for (const item of findings) unique.set(`${item.severity}\0${item.code}\0${item.path}`, item);
  return [...unique.values()].sort((left, right) =>
    left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.severity.localeCompare(right.severity),
  );
}
