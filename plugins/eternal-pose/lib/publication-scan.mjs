import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const { parse: parseBabelProgram, parseExpression: parseBabelExpression } = require(
  "../vendor/@babel/parser/index.cjs",
);
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

const MAX_CODE_AST_NODES = 100_000;
const MAX_COMPONENT_EXPRESSION_ATTEMPTS = 512;
const MAX_COMPONENT_EXPRESSION_BYTES = 4 * 1024 * 1024;
const GENERIC_SECRET_NAME =
  /^(?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|secret(?:[_-]?key)?|token|password|authorization|cookie)(?:[_-][A-Za-z0-9]+)*$/i;
const GENERIC_SECRET_KEY =
  /(^|[^A-Za-z0-9_$])(["']?(?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|secret(?:[_-]?key)?|token|password|authorization|cookie)(?:[_-][A-Za-z0-9]+)*["']?)(?![A-Za-z0-9_$])/gim;
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

class CodeAnalysisLimitError extends Error {}

function createCodeAnalysisState() {
  return {
    analysisLimited: false,
    astNodes: 0,
    expressionAttempts: 0,
    expressionBytes: 0,
    hasSecret: false,
    malformed: false,
  };
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
  if (current?.type !== "TemplateLiteral" || current.expressions?.length !== 0 || current.quasis?.length !== 1) {
    return null;
  }
  return current.quasis[0]?.value?.cooked ?? current.quasis[0]?.value?.raw ?? null;
}

function staticPropertyName(node) {
  const current = unwrapTransparentExpression(node);
  if (current?.type === "Identifier" || current?.type === "JSXIdentifier") return current.name;
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
  if (typeof name !== "string" || !GENERIC_SECRET_NAME.test(name)) return false;
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
    stack.push(...astChildren(node));
  }
}

function analyzeQuotedPropertyFragment(path, contents, state) {
  if (!/^\s*["']/.test(contents)) return;
  try {
    const expression = parseBabelExpression(`({\n${contents}\n})`, componentExpressionParserOptions(path));
    analyzeAst(expression, expression.comments, state);
  } catch {
    // The complete-program parser still owns the stable malformed-code result.
  }
}

function analyzeProgramSource(path, contents, state, languageHint) {
  if (state.analysisLimited || state.malformed) return;
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

function normalizeFrameworkExpression(contents, componentType) {
  const expression = contents.trim();
  if (expression.startsWith("...")) return "[" + expression + "]";
  if (componentType !== "svelte") return expression;
  if (/^\/[A-Za-z][\w-]*$/.test(expression) || /^:else$/.test(expression)) return "undefined";
  const directive = /^([#:@/])([A-Za-z][\w-]*)(?:\s+([\s\S]*))?$/.exec(expression);
  if (directive === null) return expression;
  const [, marker, name, remainder = ""] = directive;
  if (marker === "/") return "undefined";
  if (marker === ":" && name === "else" && remainder.startsWith("if ")) return remainder.slice(3);
  if (marker === "#" && name === "each") {
    const asIndex = remainder.indexOf(" as ");
    return asIndex === -1 ? remainder : remainder.slice(0, asIndex);
  }
  if (marker === "@" && name === "const") return remainder;
  return remainder === "" ? "undefined" : remainder;
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
  const expression = normalizeFrameworkExpression(contents, componentType);
  consumeExpressionProbe(state, expression);
  try {
    const node = parseBabelExpression(expression, componentExpressionParserOptions(path));
    return { comments: node.comments ?? [], node };
  } catch (error) {
    if (isParserSyntaxError(error)) return null;
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
  return character !== undefined && /[A-Za-z0-9_.:@#-]/.test(character);
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

function markupBinding(name, componentType) {
  let normalized = name;
  let expression = false;
  if (componentType === "vue" && normalized.startsWith(":")) {
    normalized = normalized.slice(1);
    expression = true;
  } else if (componentType === "vue" && normalized.startsWith("v-bind:")) {
    normalized = normalized.slice("v-bind:".length);
    expression = true;
  } else if (componentType === "vue" && normalized === "v-bind") {
    normalized = "";
    expression = true;
  }
  normalized = normalized.split(".")[0];
  return { expression, name: normalized };
}

function analyzeMarkupAttribute(path, componentType, name, value, valueType, state) {
  const binding = markupBinding(name, componentType);
  if (valueType === "expression") {
    analyzeComponentExpression(value, state);
    if (directSecretPair(binding.name, value.node)) state.hasSecret = true;
    return;
  }
  if (binding.expression) {
    const expression = tryParseComponentExpression(path, value, componentType, state);
    if (expression === null) {
      state.malformed = true;
      return;
    }
    analyzeComponentExpression(expression, state);
    if (directSecretPair(binding.name, expression.node)) state.hasSecret = true;
    return;
  }
  if (directSecretPair(binding.name, { type: "StringLiteral", value })) state.hasSecret = true;
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

    const attributeStart = cursor;
    while (markupNameCharacter(contents[cursor])) cursor += 1;
    if (cursor === attributeStart) {
      state.malformed = true;
      return { attributes, cursor: contents.length, selfClosing: false, tagName };
    }
    const attributeName = contents.slice(attributeStart, cursor);
    cursor = skipMarkupWhitespace(contents, cursor);
    if (contents[cursor] !== "=") {
      attributes.set(attributeName.toLowerCase(), "");
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
      attributes.set(attributeName.toLowerCase(), literal.value);
      analyzeMarkupAttribute(path, componentType, attributeName, literal.value, "literal", state);
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
    const value = contents.slice(valueStart, cursor);
    attributes.set(attributeName.toLowerCase(), value);
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
      cursor += 1;
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

function containsGenericSecretLiteral(path, contents, truncated) {
  if (CODE_SOURCE_PATH.test(path) && truncated) {
    return { analysisLimited: true, hasSecret: false, malformed: false };
  }
  if (CODE_SOURCE_PATH.test(path)) return containsCodeGenericSecret(path, contents);
  return {
    analysisLimited: false,
    hasSecret: containsNonCodeGenericSecret(contents),
    malformed: false,
  };
}

function contentFindings(path, contents, truncated = false) {
  const findings = [];
  const addIfMatched = (expression, severity, code, ruleName) => {
    if (expression.test(contents)) findings.push(finding(severity, code, path, `${ruleName} detected in "${path}".`));
  };

  addIfMatched(/AIza[0-9A-Za-z_-]{35}/, "error", "credential.google-api-key", "Google API key-shaped literal");
  addIfMatched(/\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}/i, "error", "credential.bearer-token", "Bearer token-shaped literal");
  const genericSecretScan = containsGenericSecretLiteral(path, contents, truncated);
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
      if (contents !== null) {
        findings.push(...contentFindings(relativePath, contents, stats.size > MAX_TEXT_BYTES));
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
