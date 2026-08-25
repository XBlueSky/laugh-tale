import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { open, readFile, readdir, lstat } from "node:fs/promises";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const HARD_SKIPPED_DIRECTORIES = new Set([".git", "coverage", "node_modules"]);
const BUILD_DIRECTORIES = new Set([".next", ".vite", "build", "coverage", "dist", "out", "playwright-report", "test-results"]);
const CACHE_DIRECTORIES = new Set([".cache", ".parcel-cache", ".turbo", "cache"]);

function normalizeRelativePath(path) {
  return path.split(sep).join("/").replace(/^\.\//, "");
}

function isContainedRelativePath(path) {
  return path !== "" && path !== ".." && !path.startsWith("../") && !isAbsolute(path);
}

function finding(severity, code, path, message) {
  return { severity, code, path, message };
}

function globSource(pattern) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return source;
}

function parseIgnoreRules(contents) {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const negated = line.startsWith("!");
      const unsigned = negated ? line.slice(1) : line;
      const directory = unsigned.endsWith("/");
      const withoutTrailingSlash = directory ? unsigned.slice(0, -1) : unsigned;
      const anchored = withoutTrailingSlash.startsWith("/");
      const pattern = anchored ? withoutTrailingSlash.slice(1) : withoutTrailingSlash;
      const hasSlash = pattern.includes("/");
      const prefix = anchored || hasSlash ? "^" : "(?:^|/)";
      const suffix = directory ? "(?:/|$)" : "$";
      return { negated, expression: new RegExp(`${prefix}${globSource(pattern)}${suffix}`) };
    });
}

function isIgnored(path, rules) {
  let ignored = false;
  for (const rule of rules) {
    if (rule.expression.test(path)) ignored = !rule.negated;
  }
  return ignored;
}

async function listFallbackFiles(rootDir) {
  let ignoreRules = [];
  try {
    ignoreRules = parseIgnoreRules(await readFile(join(rootDir, ".gitignore"), "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const files = [];
  async function walk(directory, relativeDirectory = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = normalizeRelativePath(join(relativeDirectory, entry.name));
      if (entry.isDirectory() && HARD_SKIPPED_DIRECTORIES.has(entry.name)) continue;
      if (entry.isDirectory()) {
        await walk(join(directory, entry.name), relativePath);
      } else if (!isIgnored(relativePath, ignoreRules)) {
        files.push(relativePath);
      }
    }
  }

  await walk(rootDir);
  return files.sort();
}

async function listGitFiles(rootDir) {
  try {
    await execFileAsync("git", ["-C", rootDir, "rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
  } catch {
    return null;
  }

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

async function publicationInventory(rootDir) {
  return (await listGitFiles(rootDir)) ?? listFallbackFiles(rootDir);
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
    /\b(?:api[_-]?key|secret|token|password|authorization|cookie)\b\s*[:=]\s*["']?(?!(?:<|your\b|replace\b|example\b|set-at-runtime\b|process\.env\b|import\.meta\.env\b))[A-Za-z0-9_./+~-]{16,}/i,
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
    /\b(?:booking|reservation|confirmation)(?:\s+(?:reference|ref|number|no|code))?\s*[:#=]\s*(?!(?:confirmed|pending|suggested|candidate|unverified|true|false)\b)[A-Z0-9][A-Z0-9-]{4,}\b/i,
    "error",
    "privacy.booking-reference",
    "Booking reference-shaped literal",
  );
  addIfMatched(/\+\d{1,3}(?:[\s().-]*\d){7,14}\b/, "error", "privacy.phone-number", "Telephone number-shaped literal");
  addIfMatched(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, "error", "privacy.email-address", "Email address");
  addIfMatched(
    /\bpassport(?:\s+(?:number|no))?\s*[:#=]\s*[A-Z0-9][A-Z0-9-]{5,}\b/i,
    "error",
    "privacy.passport-number",
    "Passport number-shaped literal",
  );

  if (
    /(?:^|\/)(?:vercel\.json|netlify\.toml|firebase\.json|wrangler\.toml)$/i.test(path) &&
    /(?:"public"\s*:\s*true|visibility\s*[=:]\s*["']?public|"private"\s*:\s*false|access\s*[=:]\s*["']?public)/i.test(contents)
  ) {
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

export async function scanPublication(rootDir) {
  if (typeof rootDir !== "string" || rootDir.trim() === "") throw new Error("publication root is required");
  const resolvedRoot = resolve(rootDir);
  const rootStats = await lstat(resolvedRoot);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error("publication root must be a non-symbolic-link directory");
  }

  const findings = [];
  const inventory = await publicationInventory(resolvedRoot);
  for (const relativePath of inventory) {
    findings.push(...filenameFindings(relativePath));
    const fullPath = join(resolvedRoot, relativePath);
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
