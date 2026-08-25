import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
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

async function acquireTemporaryMetadata(operations) {
  const createdPath = await operations.mkdtemp(join(tmpdir(), "laugh-tale-publication-git-"));
  const path = await operations.realpath(createdPath);
  const parentPath = await operations.realpath(dirname(path));
  const ownership = {
    path,
    parent: { path: parentPath, stats: await operations.lstat(parentPath) },
    stats: await operations.lstat(path),
    marker: {
      path: join(path, `.laugh-tale-incomplete-${randomUUID()}`),
      token: randomUUID(),
    },
    entries: [],
    tainted: null,
  };
  if (!ownership.stats.isDirectory() || ownership.stats.isSymbolicLink()) {
    throw new Error("temporary Git metadata ownership changed");
  }

  await assertTemporaryRootIdentity(ownership, operations);
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
  } finally {
    await handle.close();
  }
  await assertTemporaryOwnership(ownership, operations);
  return ownership;
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
  let ownership;
  let inventory;
  let primaryError;
  try {
    ownership = await acquireTemporaryMetadata(operations);
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

function filenameFindings(path) {
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
  if (segments.some((segment) => BUILD_DIRECTORIES.has(segment))) {
    findings.push(finding("warning", "artifact.build-output", path, `Build or test output is included in publication inventory at "${path}".`));
  }
  if (segments.some((segment) => CACHE_DIRECTORIES.has(segment))) {
    findings.push(finding("warning", "artifact.cache", path, `Cache output is included in publication inventory at "${path}".`));
  }
  return findings;
}

function contentFindings(path, contents) {
  const findings = [];
  const addIfMatched = (expression, severity, code, ruleName) => {
    if (expression.test(contents)) findings.push(finding(severity, code, path, `${ruleName} detected in "${path}".`));
  };

  addIfMatched(/AIza[0-9A-Za-z_-]{35}/, "error", "credential.google-api-key", "Google API key-shaped literal");
  addIfMatched(/\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}/i, "error", "credential.bearer-token", "Bearer token-shaped literal");
  addIfMatched(
    /(?:^|[^A-Za-z0-9])["']?(?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|secret(?:[_-]?key)?|token|password|authorization|cookie)(?:[_-][A-Za-z0-9]+)*["']?\s*[:=]\s*["']?(?!(?:<|your\b|replace\b|example\b|set-at-runtime\b|process\.env\b|import\.meta\.env\b))[A-Za-z0-9_./+~-]{16,}/im,
    "error",
    "credential.generic-secret",
    "Generic credential-shaped assignment",
  );
  addIfMatched(
    /https?:\/\/[^\s"']+[?&](?:access_token|api_key|key|signature|token|auth)=[^\s&#"']{8,}/i,
    "error",
    "credential.private-url",
    "Credential-bearing private URL",
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
  for (const relativePath of inventory) {
    findings.push(...filenameFindings(relativePath));
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
      if (contents !== null) findings.push(...contentFindings(relativePath, contents));
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
