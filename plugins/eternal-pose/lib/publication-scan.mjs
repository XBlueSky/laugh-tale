import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { lstat, mkdtemp, open, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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

async function listStandaloneFilesWithGit(rootDir) {
  const metadataDir = await mkdtemp(join(tmpdir(), "laugh-tale-publication-git-"));
  const emptyGlobalExcludes = join(metadataDir, "global-excludes");
  try {
    await execFileAsync("git", ["init", "-q", "--bare", metadataDir], { encoding: "utf8", maxBuffer: 1024 * 1024 });
    await writeFile(emptyGlobalExcludes, "", { flag: "wx" });
    const { stdout } = await execFileAsync(
      "git",
      [
        `--git-dir=${metadataDir}`,
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
    return stdout
      .split("\0")
      .map(normalizeRelativePath)
      .filter(isContainedRelativePath)
      .sort();
  } finally {
    await rm(metadataDir, { recursive: true, force: true });
  }
}

async function publicationInventory(rootDir) {
  return (await listGitFiles(rootDir)) ?? listStandaloneFilesWithGit(rootDir);
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
    /(?:^|[^A-Za-z0-9])(?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|secret(?:[_-]?key)?|token|password|authorization|cookie)(?:[_-][A-Za-z0-9]+)*\s*[:=]\s*["']?(?!(?:<|your\b|replace\b|example\b|set-at-runtime\b|process\.env\b|import\.meta\.env\b))[A-Za-z0-9_./+~-]{16,}/im,
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
    /\b(?:booking|reservation|confirmation)(?:(?:[_-]?(?:reference|ref|number|no|code))|(?:\s+(?:reference|ref|number|no|code)))?\s*[:#=]\s*(?!(?:available|confirmed|pending|required|suggested|candidate|unverified|true|false)\b)[A-Z0-9][A-Z0-9-]{4,}\b/i,
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
    /\bpassport(?:\s+(?:number|no))?\s*[:#=]\s*[A-Z0-9][A-Z0-9-]{5,}\b/i,
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

export async function scanPublication(rootDir) {
  if (typeof rootDir !== "string" || rootDir.trim() === "") throw new Error("publication root is required");
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
  const inventory = await publicationInventory(canonicalRoot);
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
