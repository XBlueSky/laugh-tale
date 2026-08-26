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

const MAX_SECRET_SYNTAX_TOKENS = 128;
const GENERIC_SECRET_NAME =
  /^(?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|secret(?:[_-]?key)?|token|password|authorization|cookie)(?:[_-][A-Za-z0-9]+)*$/i;
const GENERIC_SECRET_KEY =
  /(^|[^A-Za-z0-9_$])(["']?(?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|secret(?:[_-]?key)?|token|password|authorization|cookie)(?:[_-][A-Za-z0-9]+)*["']?)(?![A-Za-z0-9_$])/gim;
const CODE_SOURCE_PATH = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/i;
const ASSIGNMENT_OPERATORS = new Set(["=", "??=", "||=", "&&="]);
const MULTI_CHARACTER_TOKENS = [
  "??=", "||=", "&&=", "===", "!==", "...", "=>", "/>", "?.", "??", "||", "&&",
  "==", "!=", "<=", ">=", "++", "--", "**", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=",
];
const DECLARATION_BOUNDARIES = new Set([
  "const", "let", "var", "class", "interface", "type", "function", "import", "export", "return", "throw",
]);
const MEMBER_BOUNDARY_MODIFIERS = new Set([
  "abstract", "accessor", "declare", "override", "private", "protected", "public", "readonly", "static",
]);
const POSTFIX_RUNTIME_OPERATORS = new Set([
  "+", "-", "*", "/", "%", "=", "??=", "||=", "&&=", "??", "||", "&&", "?", "!",
]);
const REGEX_PREFIX_KEYWORDS = new Set([
  "case", "delete", "do", "else", "in", "instanceof", "new", "return", "throw", "typeof", "void", "yield",
]);
const REGEX_PREFIX_TOKENS = new Set(["(", "[", "{", ",", ";", ":", "=", "=>", "?", "??", "||", "&&"]);
const MEMBER_BOUNDARY_TOKENS = new Set(["=", ":", "?", "!", "(", "["]);
const CODE_VALUE_BOUNDARIES = new Set([";", ",", "}", ")", "]", "/>"]);

function readQuotedLiteral(contents, start, limit) {
  const quote = contents[start];
  let cursor = start + 1;
  while (cursor < limit) {
    if (contents[cursor] === "\\") {
      cursor = Math.min(cursor + 2, limit);
      continue;
    }
    if (contents[cursor] === quote) {
      return { closed: true, end: cursor + 1, value: contents.slice(start + 1, cursor) };
    }
    cursor += 1;
  }
  return { closed: false, end: limit, value: contents.slice(start + 1, limit) };
}

function canStartRegex(previousToken) {
  if (previousToken === undefined) return true;
  if (previousToken.kind === "identifier" && REGEX_PREFIX_KEYWORDS.has(previousToken.value)) {
    return true;
  }
  return REGEX_PREFIX_TOKENS.has(previousToken.value);
}

function readRegexLiteral(contents, start, limit) {
  let cursor = start + 1;
  let inCharacterClass = false;
  while (cursor < limit) {
    if (contents[cursor] === "\\") {
      cursor = Math.min(cursor + 2, limit);
      continue;
    }
    if (contents[cursor] === "[") inCharacterClass = true;
    if (contents[cursor] === "]") inCharacterClass = false;
    if (contents[cursor] === "/" && !inCharacterClass) {
      cursor += 1;
      while (cursor < limit && /[A-Za-z]/.test(contents[cursor])) cursor += 1;
      return cursor;
    }
    if (contents[cursor] === "\n" || contents[cursor] === "\r") return start + 1;
    cursor += 1;
  }
  return start + 1;
}

function scanTemplateLiteral(contents, start, limit) {
  let cursor = start + 1;
  let value = "";
  let hasInterpolation = false;
  let hasLineBreak = false;
  const interpolationResults = [];
  while (cursor < limit) {
    const character = contents[cursor];
    if (character === "\\") {
      if (contents[cursor + 1] === "\n" || contents[cursor + 1] === "\r") hasLineBreak = true;
      value += contents.slice(cursor, Math.min(cursor + 2, limit));
      cursor = Math.min(cursor + 2, limit);
      continue;
    }
    if (character === "`") {
      return {
        closed: true,
        end: cursor + 1,
        hasInterpolation,
        hasLineBreak,
        interpolationResults,
        value,
      };
    }
    if (character === "$" && contents[cursor + 1] === "{") {
      hasInterpolation = true;
      const interpolation = tokenizeCodeSegment(contents, cursor + 2, limit, true, true);
      interpolationResults.push(interpolation);
      cursor = interpolation.cursor;
      if (contents[cursor] === "}") cursor += 1;
      continue;
    }
    if (character === "\n" || character === "\r") hasLineBreak = true;
    value += character;
    cursor += 1;
  }
  return { closed: false, end: limit, hasInterpolation, hasLineBreak, interpolationResults, value };
}

function tokenizeCodeSegment(contents, start = 0, limit = contents.length, stopOnClosingBrace = false, recognizeComments = true) {
  const tokens = [];
  const comments = [];
  let cursor = start;
  let braceDepth = 0;
  let pendingLineBreak = false;
  let previousSurfaceToken;

  const push = (kind, value, extra = {}) => {
    const token = { kind, value, lineBreakBefore: pendingLineBreak, ...extra };
    tokens.push(token);
    previousSurfaceToken = token;
    pendingLineBreak = false;
  };

  while (cursor < limit) {
    const character = contents[cursor];
    if (/\s/.test(character)) {
      if (character === "\n" || character === "\r") {
        pendingLineBreak = true;
      }
      cursor += 1;
      continue;
    }
    if (recognizeComments && contents.startsWith("//", cursor)) {
      const newline = contents.indexOf("\n", cursor + 2);
      const end = newline === -1 || newline >= limit ? limit : newline;
      comments.push(contents.slice(cursor + 2, end));
      cursor = end;
      continue;
    }
    if (recognizeComments && contents.startsWith("/*", cursor)) {
      const close = contents.indexOf("*/", cursor + 2);
      const contentEnd = close === -1 || close >= limit ? limit : close;
      const end = close === -1 || close + 2 > limit ? limit : close + 2;
      const text = contents.slice(cursor + 2, contentEnd);
      comments.push(text);
      if (/\r|\n/.test(text)) {
        pendingLineBreak = true;
      }
      cursor = end;
      continue;
    }
    if (character === '"' || character === "'") {
      const literal = readQuotedLiteral(contents, cursor, limit);
      push("string", literal.value, { static: literal.closed });
      cursor = literal.end;
      continue;
    }
    if (character === "`") {
      const template = scanTemplateLiteral(contents, cursor, limit);
      push("template", template.value, { static: template.closed && !template.hasInterpolation });
      for (const interpolation of template.interpolationResults) {
        tokens.push({ kind: "punctuation", value: "{", lineBreakBefore: false, virtual: true });
        tokens.push(...interpolation.tokens);
        tokens.push({ kind: "punctuation", value: "}", lineBreakBefore: false, virtual: true });
        comments.push(...interpolation.comments);
      }
      if (template.hasLineBreak) {
        pendingLineBreak = true;
      }
      cursor = template.end;
      continue;
    }
    if (character === "{") {
      braceDepth += 1;
      push("punctuation", character);
      cursor += 1;
      continue;
    }
    if (character === "}") {
      if (stopOnClosingBrace && braceDepth === 0) {
        return { comments, cursor, tokens };
      }
      if (braceDepth > 0) braceDepth -= 1;
      push("punctuation", character);
      cursor += 1;
      continue;
    }
    const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(contents.slice(cursor, limit));
    if (identifier !== null) {
      push("identifier", identifier[0]);
      cursor += identifier[0].length;
      continue;
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(contents.slice(cursor, limit));
    if (number !== null) {
      push("number", number[0]);
      cursor += number[0].length;
      continue;
    }
    if (character === "/" && !contents.startsWith("/>", cursor) && canStartRegex(previousSurfaceToken)) {
      const end = readRegexLiteral(contents, cursor, limit);
      if (end > cursor + 1) {
        push("regex", contents.slice(cursor, end));
        cursor = end;
        continue;
      }
    }
    const operator = MULTI_CHARACTER_TOKENS.find((candidate) => contents.startsWith(candidate, cursor));
    if (operator !== undefined) {
      push("punctuation", operator);
      cursor += operator.length;
      continue;
    }
    push("punctuation", character);
    cursor += 1;
  }
  return { comments, cursor, tokens };
}

function depthsAreZero(depths) {
  return Object.values(depths).every((depth) => depth === 0);
}

function looksLikeMemberBoundary(tokens, index) {
  const token = tokens[index];
  if (token === undefined) return true;
  if (token.value === "@" || DECLARATION_BOUNDARIES.has(token.value) || MEMBER_BOUNDARY_MODIFIERS.has(token.value)) {
    return true;
  }
  if (token.kind !== "identifier") return false;
  return MEMBER_BOUNDARY_TOKENS.has(tokens[index + 1]?.value);
}

function typedAssignmentValueStart(tokens, start) {
  const depths = { "(": 0, "[": 0, "{": 0, "<": 0 };
  const opening = new Set(Object.keys(depths));
  const closing = { ")": "(", "]": "[", "}": "{", ">": "<" };
  let hasTypeToken = false;
  for (let cursor = start, count = 0; cursor < tokens.length && count < MAX_SECRET_SYNTAX_TOKENS; cursor += 1, count += 1) {
    const token = tokens[cursor];
    const topLevel = depthsAreZero(depths);
    if (topLevel && token.lineBreakBefore && hasTypeToken && looksLikeMemberBoundary(tokens, cursor)) return null;
    const opener = closing[token.value];
    if (topLevel && (token.value === ";" || token.value === "," || opener !== undefined)) return null;
    if (topLevel && token.value === "=") return cursor + 1;
    if (opening.has(token.value)) {
      depths[token.value] += 1;
    } else if (opener !== undefined && depths[opener] > 0) {
      depths[opener] -= 1;
    }
    hasTypeToken = true;
  }
  return null;
}

function assignmentValueStarts(tokens, keyIndex) {
  const token = tokens[keyIndex];
  let cursor = keyIndex + 1;
  if (
    (token.kind === "string" || (token.kind === "template" && token.static)) &&
    tokens[keyIndex - 1]?.value === "[" &&
    tokens[keyIndex + 1]?.value === "]"
  ) {
    cursor = keyIndex + 2;
  }
  if (tokens[cursor]?.value === "?" || tokens[cursor]?.value === "!") cursor += 1;
  if (ASSIGNMENT_OPERATORS.has(tokens[cursor]?.value)) return [cursor + 1];
  if (tokens[cursor]?.value !== ":") return [];
  const directValue = cursor + 1;
  const typedValue = typedAssignmentValueStart(tokens, directValue);
  return typedValue === null ? [directValue] : [directValue, typedValue];
}

function prefixAssertionEnd(tokens, start) {
  if (tokens[start]?.value !== "<") return null;
  let depth = 0;
  let hasTypeToken = false;
  for (let cursor = start, count = 0; cursor < tokens.length && count < MAX_SECRET_SYNTAX_TOKENS; cursor += 1, count += 1) {
    if (tokens[cursor].value === "<") {
      depth += 1;
      continue;
    }
    if (tokens[cursor].value === ">") {
      depth -= 1;
      if (depth === 0) return hasTypeToken ? cursor + 1 : null;
      continue;
    }
    if (depth > 0) hasTypeToken = true;
  }
  return null;
}

function consumeTypeScriptPostfix(tokens, start, closers) {
  if (tokens[start]?.value !== "as" && tokens[start]?.value !== "satisfies") {
    return { cursor: start, valid: true };
  }
  const depths = { "(": 0, "[": 0, "{": 0, "<": 0 };
  const opening = new Set(Object.keys(depths));
  const closing = { ")": "(", "]": "[", "}": "{", ">": "<" };
  let cursor = start + 1;
  let hasTypeToken = false;
  let count = 0;
  while (cursor < tokens.length && count < MAX_SECRET_SYNTAX_TOKENS) {
    const token = tokens[cursor];
    const topLevel = depthsAreZero(depths);
    if (
      topLevel &&
      (token.value === ";" || token.value === "," || token.value === "/>" || closers.includes(token.value))
    ) {
      break;
    }
    if (topLevel && POSTFIX_RUNTIME_OPERATORS.has(token.value)) return { cursor, valid: false };
    if (topLevel && token.lineBreakBefore && DECLARATION_BOUNDARIES.has(token.value)) break;
    const opener = closing[token.value];
    if (opening.has(token.value)) {
      depths[token.value] += 1;
    } else if (opener !== undefined && depths[opener] > 0) {
      depths[opener] -= 1;
    }
    hasTypeToken = true;
    cursor += 1;
    count += 1;
  }
  return { cursor, valid: hasTypeToken && count < MAX_SECRET_SYNTAX_TOKENS };
}

function isSecretLiteralValue(value) {
  return (
    /^[A-Za-z0-9_./+~-]{16,}={0,2}$/.test(value) &&
    !/^(?:<|your\b|replace\b|example\b|set-at-runtime\b)/i.test(value)
  );
}

function isCodeValueBoundary(tokens, cursor) {
  const token = tokens[cursor];
  if (token === undefined) return true;
  if (CODE_VALUE_BOUNDARIES.has(token.value)) return true;
  return token.lineBreakBefore && (DECLARATION_BOUNDARIES.has(token.value) || looksLikeMemberBoundary(tokens, cursor));
}

function secretLiteralAt(tokens, start, allowTrailingProse) {
  const closers = [];
  let cursor = start;
  while (tokens[cursor]?.value === "{" || tokens[cursor]?.value === "(") {
    closers.push(tokens[cursor].value === "{" ? "}" : ")");
    cursor += 1;
  }
  while (tokens[cursor]?.value === "<") {
    const assertionEnd = prefixAssertionEnd(tokens, cursor);
    if (assertionEnd === null) return false;
    cursor = assertionEnd;
  }
  const literal = tokens[cursor];
  if (
    literal === undefined ||
    (literal.kind !== "string" && literal.kind !== "template") ||
    !literal.static ||
    !isSecretLiteralValue(literal.value)
  ) {
    return false;
  }
  cursor += 1;
  const postfix = consumeTypeScriptPostfix(tokens, cursor, closers);
  if (!postfix.valid) return false;
  cursor = postfix.cursor;
  for (const closer of closers.reverse()) {
    if (tokens[cursor]?.value !== closer) return false;
    cursor += 1;
  }
  return allowTrailingProse || isCodeValueBoundary(tokens, cursor);
}

function containsTokenizedSecret(tokens, allowTrailingProse = false) {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const isIdentifierKey = token.kind === "identifier" && GENERIC_SECRET_NAME.test(token.value);
    const isQuotedKey =
      (token.kind === "string" || (token.kind === "template" && token.static)) &&
      GENERIC_SECRET_NAME.test(token.value) &&
      (tokens[index + 1]?.value === ":" ||
        (tokens[index - 1]?.value === "[" && tokens[index + 1]?.value === "]"));
    if (!isIdentifierKey && !isQuotedKey) continue;
    for (const valueStart of assignmentValueStarts(tokens, index)) {
      if (secretLiteralAt(tokens, valueStart, allowTrailingProse)) return true;
    }
  }
  return false;
}

function containsCodeGenericSecret(contents) {
  const tokenized = tokenizeCodeSegment(contents);
  if (containsTokenizedSecret(tokenized.tokens)) return true;
  return tokenized.comments.some((comment) => {
    const commentTokens = tokenizeCodeSegment(comment, 0, comment.length, false, false).tokens;
    return containsTokenizedSecret(commentTokens, true);
  });
}

function skipNonCodeTrivia(contents, start) {
  let cursor = start;
  while (cursor < contents.length && /\s/.test(contents[cursor])) cursor += 1;
  return cursor;
}

function containsNonCodeGenericSecret(contents) {
  GENERIC_SECRET_KEY.lastIndex = 0;
  let match;
  while ((match = GENERIC_SECRET_KEY.exec(contents)) !== null) {
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

function containsGenericSecretLiteral(path, contents) {
  return CODE_SOURCE_PATH.test(path)
    ? containsCodeGenericSecret(contents)
    : containsNonCodeGenericSecret(contents);
}

function contentFindings(path, contents) {
  const findings = [];
  const addIfMatched = (expression, severity, code, ruleName) => {
    if (expression.test(contents)) findings.push(finding(severity, code, path, `${ruleName} detected in "${path}".`));
  };

  addIfMatched(/AIza[0-9A-Za-z_-]{35}/, "error", "credential.google-api-key", "Google API key-shaped literal");
  addIfMatched(/\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}/i, "error", "credential.bearer-token", "Bearer token-shaped literal");
  if (containsGenericSecretLiteral(path, contents)) {
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
