import {
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import ts from "typescript";

export interface AuthoredWorldExpectation {
  id: string;
  requiredSourceSignals: RegExp[];
  forbiddenSourceSignals: RegExp[];
  requiredMapModes: string[];
  requiredStates: string[];
}

export interface AuthoredWorldFinding {
  code: string;
  path: string;
  message: string;
}

interface RecipeManifest {
  id?: unknown;
  presentation?: {
    source?: unknown;
    entry?: unknown;
    css?: unknown;
  };
  map?: { profile?: unknown };
  validation?: { viewports?: unknown };
}

interface SourceFile {
  absolutePath: string;
  path: string;
  source: string;
}

interface RootSignature {
  path: string;
  signature: string;
}

const REQUIRED_VIEWS = [
  "Home",
  "Experience",
  "SetupRequired",
  "Loading",
  "FatalError",
] as const;
const REQUIRED_VIEWPORTS = [320, 390, 430, 768, 1024, 1440] as const;
const CATALOG_IDS = [
  "field-atlas",
  "reset-arcade",
  "pocket-instrument",
  "vacation-os",
  "memory-cinema",
  "live-journey",
] as const;
const CUSTOMIZATION_LEVELS = [
  "Token customization",
  "Component customization",
  "Presentation customization",
  "Full UI replacement",
] as const;
const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".jsx",
  ".mjs",
  ".css",
  ".json",
] as const;

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function isWithin(parent: string, candidate: string): boolean {
  const child = relative(parent, candidate);
  return child === "" || (
    child !== ".." &&
    !child.startsWith(`..${sep}`) &&
    !isAbsolute(child)
  );
}

function findingOrder(
  left: AuthoredWorldFinding,
  right: AuthoredWorldFinding,
): number {
  return left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message);
}

function addFinding(
  findings: AuthoredWorldFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push({ code, path: toPosix(path), message });
}

function finish(findings: AuthoredWorldFinding[]): AuthoredWorldFinding[] {
  const unique = new Map<string, AuthoredWorldFinding>();
  for (const finding of findings) {
    unique.set(JSON.stringify(finding), finding);
  }
  return [...unique.values()].sort(findingOrder);
}

function regularLocalFile(
  boundary: string,
  candidate: string,
): string | undefined {
  const absolutePath = resolve(candidate);
  if (!isWithin(boundary, absolutePath)) return undefined;
  try {
    const stats = lstatSync(absolutePath);
    if (!stats.isFile() || stats.isSymbolicLink()) return undefined;
    const canonicalPath = realpathSync(absolutePath);
    return isWithin(boundary, canonicalPath) ? canonicalPath : undefined;
  } catch {
    return undefined;
  }
}

function readDeclaredText(
  recipeRoot: string,
  candidate: string,
  displayPath: string,
  findings: AuthoredWorldFinding[],
): SourceFile | undefined {
  const canonicalPath = regularLocalFile(recipeRoot, candidate);
  if (canonicalPath === undefined) {
    addFinding(
      findings,
      "unreadable-declared-file",
      displayPath,
      `Declared local file ${displayPath} must be a readable regular file`,
    );
    return undefined;
  }
  try {
    return {
      absolutePath: canonicalPath,
      path: toPosix(relative(recipeRoot, resolve(candidate))),
      source: readFileSync(canonicalPath, "utf8"),
    };
  } catch {
    addFinding(
      findings,
      "unreadable-declared-file",
      displayPath,
      `Declared local file ${displayPath} must be readable as text`,
    );
    return undefined;
  }
}

function stripComments(source: string): string {
  let output = "";
  let index = 0;
  let quote: "\"" | "'" | "`" | null = null;
  let escaped = false;
  while (index < source.length) {
    const character = source[index] ?? "";
    const next = source[index + 1] ?? "";
    if (quote !== null) {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      index += 1;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      output += character;
      index += 1;
      continue;
    }
    if (character === "/" && next === "/") {
      output += "  ";
      index += 2;
      while (index < source.length && source[index] !== "\n") {
        output += " ";
        index += 1;
      }
      continue;
    }
    if (character === "/" && next === "*") {
      output += "  ";
      index += 2;
      while (index < source.length) {
        if (source[index] === "*" && source[index + 1] === "/") {
          output += "  ";
          index += 2;
          break;
        }
        output += source[index] === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    output += character;
    index += 1;
  }
  return output;
}

interface DependencyDiscovery {
  specifiers: string[];
  unresolvedDynamicImports: number;
}

function scriptKind(path: string): ts.ScriptKind {
  switch (extname(path).toLowerCase()) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
      return ts.ScriptKind.JS;
    case ".json":
      return ts.ScriptKind.JSON;
    default:
      return ts.ScriptKind.TS;
  }
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function staticModuleSpecifier(expression: ts.Expression): string | undefined {
  const unwrapped = unwrapExpression(expression);
  return ts.isStringLiteral(unwrapped) || ts.isNoSubstitutionTemplateLiteral(unwrapped)
    ? unwrapped.text
    : undefined;
}

function typescriptDependencies(file: SourceFile): DependencyDiscovery {
  const sourceFile = ts.createSourceFile(
    file.absolutePath,
    file.source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file.absolutePath),
  );
  const specifiers = new Set<string>();
  let unresolvedDynamicImports = 0;
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.add(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const argument = node.arguments[0];
      const specifier = argument === undefined
        ? undefined
        : staticModuleSpecifier(argument);
      if (specifier !== undefined) {
        specifiers.add(specifier);
      } else {
        unresolvedDynamicImports += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return {
    specifiers: [...specifiers].sort((left, right) => left.localeCompare(right)),
    unresolvedDynamicImports,
  };
}

function skipCssTrivia(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    if (/\s/.test(source[index] ?? "")) {
      index += 1;
      continue;
    }
    if (source[index] === "/" && source[index + 1] === "*") {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === "*" && source[index + 1] === "/")
      ) {
        index += 1;
      }
      index = Math.min(index + 2, source.length);
      continue;
    }
    break;
  }
  return index;
}

function readCssQuoted(
  source: string,
  start: number,
): { end: number; value: string } | undefined {
  const quote = source[start];
  if (quote !== "\"" && quote !== "'") return undefined;
  let value = "";
  let index = start + 1;
  while (index < source.length) {
    const character = source[index] ?? "";
    if (character === "\\" && index + 1 < source.length) {
      value += source[index + 1] ?? "";
      index += 2;
      continue;
    }
    if (character === quote) return { end: index + 1, value };
    value += character;
    index += 1;
  }
  return undefined;
}

function cssDependencies(file: SourceFile): DependencyDiscovery {
  const specifiers = new Set<string>();
  let index = 0;
  let braceDepth = 0;
  while (index < file.source.length) {
    const character = file.source[index] ?? "";
    if (character === "/" && file.source[index + 1] === "*") {
      index = skipCssTrivia(file.source, index);
      continue;
    }
    if (character === "\"" || character === "'") {
      const quoted = readCssQuoted(file.source, index);
      index = quoted?.end ?? file.source.length;
      continue;
    }
    if (character === "{") {
      braceDepth += 1;
      index += 1;
      continue;
    }
    if (character === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      index += 1;
      continue;
    }
    if (
      character !== "@" ||
      braceDepth !== 0 ||
      file.source.slice(index + 1, index + 7).toLowerCase() !== "import" ||
      /[a-z0-9_-]/i.test(file.source[index + 7] ?? "")
    ) {
      index += 1;
      continue;
    }

    let cursor = skipCssTrivia(file.source, index + 7);
    const direct = readCssQuoted(file.source, cursor);
    if (direct !== undefined) {
      specifiers.add(direct.value);
      index = direct.end;
      continue;
    }
    if (
      file.source.slice(cursor, cursor + 3).toLowerCase() !== "url" ||
      /[a-z0-9_-]/i.test(file.source[cursor + 3] ?? "")
    ) {
      index += 7;
      continue;
    }
    cursor = skipCssTrivia(file.source, cursor + 3);
    if (file.source[cursor] !== "(") {
      index = cursor;
      continue;
    }
    cursor = skipCssTrivia(file.source, cursor + 1);
    const quotedUrl = readCssQuoted(file.source, cursor);
    if (quotedUrl !== undefined) {
      const close = skipCssTrivia(file.source, quotedUrl.end);
      if (file.source[close] === ")") specifiers.add(quotedUrl.value);
      index = close + 1;
      continue;
    }
    const valueStart = cursor;
    while (
      cursor < file.source.length &&
      file.source[cursor] !== ")" &&
      file.source[cursor] !== "\"" &&
      file.source[cursor] !== "'" &&
      !(file.source[cursor] === "/" && file.source[cursor + 1] === "*")
    ) {
      cursor += 1;
    }
    if (file.source[cursor] === ")") {
      const value = file.source.slice(valueStart, cursor).trim();
      if (value !== "") specifiers.add(value);
    }
    index = cursor + 1;
  }
  return {
    specifiers: [...specifiers].sort((left, right) => left.localeCompare(right)),
    unresolvedDynamicImports: 0,
  };
}

function dependencies(file: SourceFile): DependencyDiscovery {
  if (file.path.endsWith(".css")) return cssDependencies(file);
  if (file.path.endsWith(".json")) {
    return { specifiers: [], unresolvedDynamicImports: 0 };
  }
  return typescriptDependencies(file);
}

type ImportSpecifierKind = "relative" | "bare" | "remote" | "unsafe";

function isBarePackageSpecifier(specifier: string): boolean {
  if (specifier === "" || specifier.includes("\\") || specifier.startsWith("#")) {
    return false;
  }
  const segments = specifier.split("/");
  const scoped = specifier.startsWith("@");
  const comparableSegments = scoped
    ? [segments[0]?.slice(1) ?? "", ...segments.slice(1)]
    : segments;
  if (comparableSegments.some((segment) =>
    segment === "" ||
    segment === "." ||
    segment === ".." ||
    !/^[a-z0-9_~.-]+$/i.test(segment)
  )) {
    return false;
  }
  return scoped
    ? segments.length >= 2
    : !specifier.startsWith(".");
}

function importSpecifierKind(specifier: string): ImportSpecifierKind {
  if (/^(?:https?|ftps?|wss?):/i.test(specifier)) return "remote";
  if (
    specifier.includes("\\") ||
    specifier.startsWith("/") ||
    /^[a-z]:[\\/]/i.test(specifier) ||
    /^[a-z][a-z0-9+.-]*:/i.test(specifier)
  ) {
    return "unsafe";
  }
  if (/^\.{1,2}(?:\/|$)/.test(specifier)) return "relative";
  return isBarePackageSpecifier(specifier) ? "bare" : "unsafe";
}

function importCandidates(candidate: string): string[] {
  const extension = extname(candidate);
  const candidates = extension === ""
    ? [
        candidate,
        ...SOURCE_EXTENSIONS.map((suffix) => `${candidate}${suffix}`),
        ...SOURCE_EXTENSIONS.map((suffix) => join(candidate, `index${suffix}`)),
      ]
    : [
        candidate,
        ...(extension === ".js"
          ? [
              candidate.slice(0, -extension.length) + ".ts",
              candidate.slice(0, -extension.length) + ".tsx",
              candidate.slice(0, -extension.length) + ".jsx",
            ]
          : []),
        ...(extension === ".mjs"
          ? [candidate.slice(0, -extension.length) + ".mts"]
          : []),
      ];
  return [...new Set(candidates)];
}

type LocalImportResolution =
  | { kind: "resolved"; path: string }
  | { kind: "controller-boundary" }
  | { kind: "unsafe" }
  | { kind: "unresolved" };

function resolveLocalImport(
  recipeRoot: string,
  presentationRoot: string,
  importer: string,
  specifier: string,
): LocalImportResolution {
  const unresolved = resolve(dirname(importer), specifier);
  const controllersRoot = join(recipeRoot, "controllers");
  if (isWithin(controllersRoot, unresolved)) {
    return { kind: "controller-boundary" };
  }
  if (!isWithin(presentationRoot, unresolved)) return { kind: "unsafe" };
  for (const candidate of importCandidates(unresolved)) {
    try {
      const stats = lstatSync(candidate);
      if (
        stats.isDirectory() &&
        candidate === unresolved &&
        extname(unresolved) === ""
      ) {
        continue;
      }
      if (!stats.isFile() || stats.isSymbolicLink()) return { kind: "unsafe" };
      const canonicalPath = realpathSync(candidate);
      if (!isWithin(presentationRoot, canonicalPath)) return { kind: "unsafe" };
      return { kind: "resolved", path: canonicalPath };
    } catch {
      // A missing candidate can still resolve through an extension or index.
    }
  }
  return { kind: "unresolved" };
}

function collectReachableSource(
  recipeRoot: string,
  presentationRoot: string,
  seeds: readonly SourceFile[],
  findings: AuthoredWorldFinding[],
): SourceFile[] {
  // The import graph is the declaration boundary. Never enumerate the source
  // directory: an unrelated local draft must neither satisfy nor fail a recipe.
  const files = new Map<string, SourceFile>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined || files.has(file.absolutePath)) continue;
    files.set(file.absolutePath, file);
    const discovered = dependencies(file);
    if (discovered.unresolvedDynamicImports > 0) {
      addFinding(
        findings,
        "unresolved-dynamic-import",
        file.path,
        "Local dynamic import must use a static string literal",
      );
    }
    for (const specifier of discovered.specifiers) {
      const kind = importSpecifierKind(specifier);
      if (kind === "remote") {
        addFinding(
          findings,
          "forbidden-remote-import",
          file.path,
          `Presentation source must not import ${specifier}`,
        );
        continue;
      }
      if (kind === "bare" && !file.path.endsWith(".css")) continue;
      if (kind !== "relative") {
        addFinding(
          findings,
          "unsafe-import-specifier",
          file.path,
          file.path.endsWith(".css")
            ? `CSS @import ${specifier} must use a relative local path within presentation.source`
            : `Import ${specifier} must be a relative local path or a bare package specifier`,
        );
        continue;
      }
      const resolution = resolveLocalImport(
        recipeRoot,
        presentationRoot,
        file.absolutePath,
        specifier,
      );
      if (resolution.kind === "controller-boundary") continue;
      if (resolution.kind === "unsafe") {
        addFinding(
          findings,
          "unsafe-local-import",
          file.path,
          `Local import ${specifier} must resolve to a regular file within presentation.source`,
        );
        continue;
      }
      if (resolution.kind === "unresolved") {
        addFinding(
          findings,
          "unresolved-local-import",
          file.path,
          `Local import ${specifier} could not be resolved`,
        );
        continue;
      }
      if (files.has(resolution.path)) continue;
      try {
        queue.push({
          absolutePath: resolution.path,
          path: toPosix(relative(recipeRoot, resolution.path)),
          source: readFileSync(resolution.path, "utf8"),
        });
      } catch {
        addFinding(
          findings,
          "unresolved-local-import",
          file.path,
          `Local import ${specifier} could not be read`,
        );
      }
    }
  }
  return [...files.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function patternMatches(pattern: RegExp, source: string): boolean {
  const flags = pattern.flags.replaceAll("g", "").replaceAll("y", "");
  return new RegExp(pattern.source, flags).test(source);
}

function firstPatternMatch(
  files: readonly SourceFile[],
  pattern: RegExp,
): SourceFile | undefined {
  return files.find((file) => patternMatches(pattern, stripComments(file.source)));
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function literalPattern(value: string): RegExp {
  const flexible = escapePattern(value).replace(/\\[-_ ]+/g, "[-_\\s]+");
  return new RegExp(`(?:^|[^a-z0-9])${flexible}(?![a-z0-9])`, "i");
}

function requiredStatePattern(state: string): RegExp {
  switch (state.toLowerCase()) {
    case "empty":
      return /(?:\bempty\b|\bno\s+[a-z]|\.length\s*={2,3}\s*0)/i;
    case "route-error":
      return /(?:route[\w\s:_-]{0,40}(?:error|unavailable)|(?:retry|error|unavailable)[\w\s:_-]{0,40}route)/i;
    case "map-error":
      return /(?:map[\w\s:_-]{0,40}(?:error|unavailable)|(?:retry|error|unavailable)[\w\s:_-]{0,40}map)/i;
    default:
      return literalPattern(state);
  }
}

interface AstSourceFile {
  file: SourceFile;
  node: ts.SourceFile;
}

interface AstGraph {
  recipeRoot: string;
  presentationRoot: string;
  files: Map<string, AstSourceFile>;
}

interface ResolvedAstValue {
  file: AstSourceFile;
  node: ts.Node;
}

function createAstGraph(
  recipeRoot: string,
  presentationRoot: string,
  files: readonly SourceFile[],
): AstGraph {
  const astFiles = new Map<string, AstSourceFile>();
  for (const file of files) {
    if (file.path.endsWith(".css") || file.path.endsWith(".json")) continue;
    astFiles.set(file.absolutePath, {
      file,
      node: ts.createSourceFile(
        file.absolutePath,
        file.source,
        ts.ScriptTarget.Latest,
        true,
        scriptKind(file.absolutePath),
      ),
    });
  }
  return { recipeRoot, presentationRoot, files: astFiles };
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false);
}

function propertyNameText(name: ts.PropertyName | undefined): string | undefined {
  if (name === undefined) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) {
    return staticModuleSpecifier(name.expression);
  }
  return undefined;
}

function ownObjectProperty(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.ObjectLiteralElementLike | undefined {
  return object.properties.find((property) =>
    !ts.isSpreadAssignment(property) && propertyNameText(property.name) === name
  );
}

function propertyValue(property: ts.ObjectLiteralElementLike): ts.Node | undefined {
  if (ts.isPropertyAssignment(property)) return property.initializer;
  if (ts.isShorthandPropertyAssignment(property)) return property.name;
  if (ts.isMethodDeclaration(property) || ts.isGetAccessorDeclaration(property)) {
    return property;
  }
  return undefined;
}

function moduleAstFile(
  graph: AstGraph,
  importer: AstSourceFile,
  specifier: string,
): AstSourceFile | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const resolution = resolveLocalImport(
    graph.recipeRoot,
    graph.presentationRoot,
    importer.file.absolutePath,
    specifier,
  );
  return resolution.kind === "resolved" ? graph.files.get(resolution.path) : undefined;
}

function resolveNamespaceMember(
  graph: AstGraph,
  file: AstSourceFile,
  namespace: string,
  member: string,
  seen: Set<string>,
): ResolvedAstValue | undefined {
  for (const statement of file.node.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (
      bindings === undefined ||
      !ts.isNamespaceImport(bindings) ||
      bindings.name.text !== namespace
    ) {
      continue;
    }
    const target = moduleAstFile(graph, file, statement.moduleSpecifier.text);
    return target === undefined ? undefined : resolveExport(graph, target, member, seen);
  }
  return undefined;
}

function resolveValue(
  graph: AstGraph,
  file: AstSourceFile,
  node: ts.Node,
  seen: Set<string>,
): ResolvedAstValue | undefined {
  if (ts.isExpression(node)) {
    const expression = unwrapExpression(node);
    if (ts.isIdentifier(expression)) {
      return resolveSymbol(graph, file, expression.text, seen);
    }
    if (ts.isPropertyAccessExpression(expression)) {
      const base = unwrapExpression(expression.expression);
      if (ts.isIdentifier(base)) {
        const namespaceMember = resolveNamespaceMember(
          graph,
          file,
          base.text,
          expression.name.text,
          seen,
        );
        if (namespaceMember !== undefined) return namespaceMember;
      }
      const resolvedBase = resolveValue(graph, file, expression.expression, seen);
      if (resolvedBase !== undefined && ts.isObjectLiteralExpression(resolvedBase.node)) {
        const property = ownObjectProperty(resolvedBase.node, expression.name.text);
        const value = property === undefined ? undefined : propertyValue(property);
        return value === undefined
          ? undefined
          : resolveValue(graph, resolvedBase.file, value, seen);
      }
      return undefined;
    }
    if (
      ts.isElementAccessExpression(expression) &&
      expression.argumentExpression !== undefined
    ) {
      const member = staticModuleSpecifier(expression.argumentExpression);
      const base = unwrapExpression(expression.expression);
      if (member !== undefined && ts.isIdentifier(base)) {
        const namespaceMember = resolveNamespaceMember(
          graph,
          file,
          base.text,
          member,
          seen,
        );
        if (namespaceMember !== undefined) return namespaceMember;
      }
      const resolvedBase = resolveValue(graph, file, expression.expression, seen);
      if (
        member !== undefined &&
        resolvedBase !== undefined &&
        ts.isObjectLiteralExpression(resolvedBase.node)
      ) {
        const property = ownObjectProperty(resolvedBase.node, member);
        const value = property === undefined ? undefined : propertyValue(property);
        return value === undefined
          ? undefined
          : resolveValue(graph, resolvedBase.file, value, seen);
      }
      return undefined;
    }
    return { file, node: expression };
  }
  return { file, node };
}

function resolveSymbol(
  graph: AstGraph,
  file: AstSourceFile,
  name: string,
  seen: Set<string>,
): ResolvedAstValue | undefined {
  const key = `${file.file.absolutePath}\0local\0${name}`;
  if (seen.has(key)) return undefined;
  seen.add(key);
  for (const statement of file.node.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === name &&
          declaration.initializer !== undefined
        ) {
          return resolveValue(graph, file, declaration.initializer, seen);
        }
      }
    }
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name?.text === name
    ) {
      return { file, node: statement };
    }
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const clause = statement.importClause;
    const target = moduleAstFile(graph, file, statement.moduleSpecifier.text);
    if (target === undefined || clause === undefined) continue;
    if (clause.name?.text === name) {
      return resolveExport(graph, target, "default", seen);
    }
    if (
      clause.namedBindings !== undefined &&
      ts.isNamedImports(clause.namedBindings)
    ) {
      const binding = clause.namedBindings.elements.find((element) => element.name.text === name);
      if (binding !== undefined) {
        return resolveExport(
          graph,
          target,
          binding.propertyName?.text ?? binding.name.text,
          seen,
        );
      }
    }
  }
  return undefined;
}

function resolveExport(
  graph: AstGraph,
  file: AstSourceFile,
  name: string,
  seen: Set<string>,
): ResolvedAstValue | undefined {
  const key = `${file.file.absolutePath}\0export\0${name}`;
  if (seen.has(key)) return undefined;
  seen.add(key);
  for (const statement of file.node.statements) {
    if (
      name === "default" &&
      ts.isExportAssignment(statement) &&
      !statement.isExportEquals
    ) {
      return resolveValue(graph, file, statement.expression, seen);
    }
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword) &&
      (
        statement.name?.text === name ||
        (name === "default" && hasModifier(statement, ts.SyntaxKind.DefaultKeyword))
      )
    ) {
      return { file, node: statement };
    }
    if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === name &&
          declaration.initializer !== undefined
        ) {
          return resolveValue(graph, file, declaration.initializer, seen);
        }
      }
    }
    if (!ts.isExportDeclaration(statement)) continue;
    const target = statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
      ? moduleAstFile(graph, file, statement.moduleSpecifier.text)
      : undefined;
    if (
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    ) {
      const binding = statement.exportClause.elements.find((element) => element.name.text === name);
      if (binding === undefined) continue;
      const originalName = binding.propertyName?.text ?? binding.name.text;
      if (statement.moduleSpecifier === undefined) {
        return resolveSymbol(graph, file, originalName, seen);
      }
      return target === undefined
        ? undefined
        : resolveExport(graph, target, originalName, seen);
    }
    if (statement.exportClause === undefined && target !== undefined && name !== "default") {
      const resolved = resolveExport(graph, target, name, seen);
      if (resolved !== undefined) return resolved;
    }
  }
  return undefined;
}

function exportedPresentationObject(
  graph: AstGraph,
  entry: AstSourceFile | undefined,
): { file: AstSourceFile; object: ts.ObjectLiteralExpression } | undefined {
  if (entry === undefined) return undefined;
  const resolved = resolveExport(graph, entry, "presentation", new Set());
  return resolved !== undefined && ts.isObjectLiteralExpression(resolved.node)
    ? { file: resolved.file, object: resolved.node }
    : undefined;
}

function mediaRanges(css: string): Array<{ min: number; max: number }> {
  const ranges: Array<{ min: number; max: number }> = [];
  for (const match of stripComments(css).matchAll(/@media\s*([^{}]+)\{/gi)) {
    const query = match[1] ?? "";
    const minimums = [...query.matchAll(/min-width\s*:\s*(\d+(?:\.\d+)?)px/gi)]
      .map((entry) => Number(entry[1]));
    const maximums = [...query.matchAll(/max-width\s*:\s*(\d+(?:\.\d+)?)px/gi)]
      .map((entry) => Number(entry[1]));
    if (minimums.length === 0 && maximums.length === 0) continue;
    ranges.push({
      min: minimums.length === 0 ? Number.NEGATIVE_INFINITY : Math.max(...minimums),
      max: maximums.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...maximums),
    });
  }
  return ranges;
}

function normalizeClassName(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).sort().join(" ");
}

type JsxOpening = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function jsxAttributeName(attribute: ts.JsxAttribute): string {
  return attribute.name.getText().toLowerCase();
}

function jsxAttributeValue(
  attribute: ts.JsxAttribute,
  sourceFile: ts.SourceFile,
): string | undefined {
  const initializer = attribute.initializer;
  if (initializer === undefined) return "true";
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (ts.isJsxExpression(initializer) && initializer.expression !== undefined) {
    const expression = unwrapExpression(initializer.expression);
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return expression.text;
    }
    return expression.getText(sourceFile);
  }
  return undefined;
}

function openingAttribute(
  opening: JsxOpening,
  name: string,
): ts.JsxAttribute | undefined {
  return opening.attributes.properties.find((attribute): attribute is ts.JsxAttribute =>
    ts.isJsxAttribute(attribute) && jsxAttributeName(attribute) === name
  );
}

function openingHasTestId(
  opening: JsxOpening,
  testId: "trip-home" | "trip-experience",
  sourceFile: ts.SourceFile,
): boolean {
  const attribute = openingAttribute(opening, "data-testid");
  return attribute !== undefined && jsxAttributeValue(attribute, sourceFile) === testId;
}

function returnedRootOpening(
  expression: ts.Expression,
  testId: "trip-home" | "trip-experience",
  sourceFile: ts.SourceFile,
): JsxOpening | undefined {
  const root = unwrapExpression(expression);
  if (ts.isJsxElement(root)) {
    if (openingHasTestId(root.openingElement, testId, sourceFile)) {
      return root.openingElement;
    }
    const tag = root.openingElement.tagName.getText(sourceFile);
    if (tag !== "Fragment" && tag !== "React.Fragment") return undefined;
    for (const child of root.children) {
      if (ts.isJsxElement(child)) {
        if (openingHasTestId(child.openingElement, testId, sourceFile)) {
          return child.openingElement;
        }
      } else if (ts.isJsxSelfClosingElement(child)) {
        if (openingHasTestId(child, testId, sourceFile)) return child;
      } else if (ts.isJsxExpression(child) && child.expression !== undefined) {
        const nested = returnedRootOpening(child.expression, testId, sourceFile);
        if (nested !== undefined) return nested;
      }
    }
    return undefined;
  }
  if (ts.isJsxSelfClosingElement(root)) {
    return openingHasTestId(root, testId, sourceFile) ? root : undefined;
  }
  if (ts.isJsxFragment(root)) {
    for (const child of root.children) {
      if (ts.isJsxElement(child)) {
        if (openingHasTestId(child.openingElement, testId, sourceFile)) {
          return child.openingElement;
        }
      } else if (ts.isJsxSelfClosingElement(child)) {
        if (openingHasTestId(child, testId, sourceFile)) return child;
      } else if (ts.isJsxExpression(child) && child.expression !== undefined) {
        const nested = returnedRootOpening(child.expression, testId, sourceFile);
        if (nested !== undefined) return nested;
      }
    }
    return undefined;
  }
  if (ts.isConditionalExpression(root)) {
    return returnedRootOpening(root.whenTrue, testId, sourceFile) ??
      returnedRootOpening(root.whenFalse, testId, sourceFile);
  }
  if (ts.isBinaryExpression(root)) {
    return returnedRootOpening(root.right, testId, sourceFile) ??
      returnedRootOpening(root.left, testId, sourceFile);
  }
  return undefined;
}

function isNestedFunction(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node);
}

function componentReturnExpressions(node: ts.Node): ts.Expression[] | undefined {
  if (
    !ts.isFunctionDeclaration(node) &&
    !ts.isFunctionExpression(node) &&
    !ts.isArrowFunction(node) &&
    !ts.isMethodDeclaration(node)
  ) {
    return undefined;
  }
  if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) return [node.body];
  const body = node.body;
  if (body === undefined) return [];
  const expressions: ts.Expression[] = [];
  const visit = (child: ts.Node): void => {
    if (child !== body && isNestedFunction(child)) return;
    if (ts.isReturnStatement(child)) {
      if (child.expression !== undefined) expressions.push(child.expression);
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(body);
  return expressions;
}

function componentRootSignature(
  component: ResolvedAstValue | undefined,
  testId: "trip-home" | "trip-experience",
): RootSignature | undefined {
  if (component === undefined) return undefined;
  const returns = componentReturnExpressions(component.node);
  if (returns === undefined) return undefined;
  for (const expression of returns) {
    const opening = returnedRootOpening(expression, testId, component.file.node);
    if (opening === undefined) continue;
    const staticClass = openingAttribute(opening, "classname");
    const roleAttribute = openingAttribute(opening, "role");
    const className = normalizeClassName(
      staticClass === undefined
        ? ""
        : jsxAttributeValue(staticClass, component.file.node) ?? "",
    );
    const role = roleAttribute === undefined
      ? ""
      : (jsxAttributeValue(roleAttribute, component.file.node) ?? "").toLowerCase();
    const dataAttributes = opening.attributes.properties
      .filter((attribute): attribute is ts.JsxAttribute => ts.isJsxAttribute(attribute))
      .map(jsxAttributeName)
      .filter((name) => name.startsWith("data-") && name !== "data-testid")
      .sort()
      .join(",");
    return {
      path: component.file.file.path,
      signature: `${opening.tagName.getText(component.file.node).toLowerCase()}|class=${className}|role=${role}|data=${dataAttributes}`,
    };
  }
  return undefined;
}

interface ValueOrigin {
  axes: Set<string>;
  object: boolean;
}

type CallbackBindingSource =
  | { kind: "object" }
  | { axis: string; kind: "axis" }
  | { expression: ts.Expression; kind: "initializer" }
  | { kind: "destructure"; property: string; source: ts.Expression }
  | { kind: "unknown" };

interface CallbackBinding {
  declaration: ts.Identifier;
  source: CallbackBindingSource;
}

interface CallbackScope {
  bindings: Map<string, CallbackBinding[]>;
  parent?: CallbackScope;
}

function emptyOrigin(): ValueOrigin {
  return { axes: new Set(), object: false };
}

function mergeOrigin(target: ValueOrigin, source: ValueOrigin): void {
  for (const axis of source.axes) target.axes.add(axis);
  target.object ||= source.object;
}

function bindingElementProperty(element: ts.BindingElement): string | undefined {
  if (element.dotDotDotToken !== undefined || !ts.isIdentifier(element.name)) {
    return undefined;
  }
  return propertyNameText(element.propertyName ?? element.name);
}

function callbackAxes(callback: ts.Node): Set<string> {
  if (
    !ts.isFunctionDeclaration(callback) &&
    !ts.isFunctionExpression(callback) &&
    !ts.isArrowFunction(callback) &&
    !ts.isMethodDeclaration(callback)
  ) {
    return new Set();
  }
  const parameter = callback.parameters[0];
  if (parameter === undefined) return new Set();
  const body = callback.body;
  if (body === undefined) return new Set();
  const functionScope: CallbackScope = { bindings: new Map() };
  const nodeScopes = new WeakMap<ts.Node, CallbackScope>();

  const addBinding = (
    scope: CallbackScope,
    declaration: ts.Identifier,
    source: CallbackBindingSource,
  ): void => {
    const bindings = scope.bindings.get(declaration.text) ?? [];
    bindings.push({ declaration, source });
    scope.bindings.set(declaration.text, bindings);
    nodeScopes.set(declaration, scope);
  };

  const addUnknownBindingName = (
    name: ts.BindingName,
    scope: CallbackScope,
  ): void => {
    if (ts.isIdentifier(name)) {
      addBinding(scope, name, { kind: "unknown" });
      return;
    }
    for (const element of name.elements) {
      if (ts.isOmittedExpression(element)) continue;
      addUnknownBindingName(element.name, scope);
    }
  };

  const addObjectBindingPattern = (
    pattern: ts.ObjectBindingPattern,
    scope: CallbackScope,
    source: ts.Expression | undefined,
  ): void => {
    for (const element of pattern.elements) {
      const property = bindingElementProperty(element);
      if (
        source !== undefined &&
        property !== undefined &&
        ts.isIdentifier(element.name)
      ) {
        addBinding(scope, element.name, {
          kind: "destructure",
          property,
          source,
        });
      } else {
        addUnknownBindingName(element.name, scope);
      }
    }
  };

  for (const [index, currentParameter] of callback.parameters.entries()) {
    nodeScopes.set(currentParameter, functionScope);
    if (index === 0 && ts.isIdentifier(currentParameter.name)) {
      addBinding(functionScope, currentParameter.name, { kind: "object" });
    } else if (index === 0 && ts.isObjectBindingPattern(currentParameter.name)) {
      for (const element of currentParameter.name.elements) {
        const property = bindingElementProperty(element);
        if (property !== undefined && ts.isIdentifier(element.name)) {
          addBinding(functionScope, element.name, { axis: property, kind: "axis" });
        } else {
          addUnknownBindingName(element.name, functionScope);
        }
      }
    } else {
      addUnknownBindingName(currentParameter.name, functionScope);
    }
  }

  const registerVariable = (
    declaration: ts.VariableDeclaration,
    scope: CallbackScope,
  ): void => {
    const declarationList = declaration.parent;
    const bindingScope = ts.isVariableDeclarationList(declarationList) &&
        (declarationList.flags & ts.NodeFlags.BlockScoped) === 0
      ? functionScope
      : scope;
    if (ts.isIdentifier(declaration.name)) {
      addBinding(
        bindingScope,
        declaration.name,
        declaration.initializer === undefined
          ? { kind: "unknown" }
          : { expression: declaration.initializer, kind: "initializer" },
      );
    } else if (ts.isObjectBindingPattern(declaration.name)) {
      addObjectBindingPattern(declaration.name, bindingScope, declaration.initializer);
    } else {
      addUnknownBindingName(declaration.name, bindingScope);
    }
  };

  const mapBindingNameScope = (name: ts.BindingName, scope: CallbackScope): void => {
    nodeScopes.set(name, scope);
    if (ts.isIdentifier(name)) return;
    for (const element of name.elements) {
      if (ts.isOmittedExpression(element)) continue;
      nodeScopes.set(element, scope);
      mapBindingNameScope(element.name, scope);
      if (element.initializer !== undefined) visit(element.initializer, scope);
    }
  };

  const visit = (node: ts.Node, scope: CallbackScope): void => {
    nodeScopes.set(node, scope);
    if (node !== callback && ts.isFunctionDeclaration(node)) {
      if (node.name !== undefined) addBinding(scope, node.name, { kind: "unknown" });
      return;
    }
    if (node !== callback && isNestedFunction(node)) return;
    if (ts.isClassDeclaration(node)) {
      if (node.name !== undefined) addBinding(scope, node.name, { kind: "unknown" });
      return;
    }
    if (ts.isBlock(node)) {
      const blockScope: CallbackScope = { bindings: new Map(), parent: scope };
      nodeScopes.set(node, blockScope);
      for (const statement of node.statements) visit(statement, blockScope);
      return;
    }
    if (ts.isCatchClause(node)) {
      const catchScope: CallbackScope = { bindings: new Map(), parent: scope };
      nodeScopes.set(node, catchScope);
      if (node.variableDeclaration !== undefined) {
        addUnknownBindingName(node.variableDeclaration.name, catchScope);
        mapBindingNameScope(node.variableDeclaration.name, catchScope);
      }
      visit(node.block, catchScope);
      return;
    }
    if (ts.isVariableDeclaration(node)) {
      registerVariable(node, scope);
      mapBindingNameScope(node.name, scope);
      if (node.initializer !== undefined) visit(node.initializer, scope);
      return;
    }
    ts.forEachChild(node, (child) => visit(child, scope));
  };

  for (const currentParameter of callback.parameters) {
    mapBindingNameScope(currentParameter.name, functionScope);
    if (currentParameter.initializer !== undefined) {
      visit(currentParameter.initializer, functionScope);
    }
  }
  visit(body, functionScope);

  const resolvedBinding = (identifier: ts.Identifier): CallbackBinding | undefined => {
    let scope = nodeScopes.get(identifier);
    while (scope !== undefined) {
      const bindings = scope.bindings.get(identifier.text);
      if (bindings !== undefined && bindings.length > 0) {
        return bindings[bindings.length - 1];
      }
      scope = scope.parent;
    }
    return undefined;
  };

  function bindingOrigin(
    binding: CallbackBinding | undefined,
    seen: Set<CallbackBinding>,
  ): ValueOrigin {
    if (binding === undefined || seen.has(binding)) return emptyOrigin();
    const nextSeen = new Set(seen).add(binding);
    switch (binding.source.kind) {
      case "object":
        return { axes: new Set(), object: true };
      case "axis":
        return { axes: new Set([binding.source.axis]), object: false };
      case "initializer":
        return nodeOrigin(binding.source.expression, nextSeen);
      case "destructure": {
        const source = nodeOrigin(binding.source.source, nextSeen);
        return source.object
          ? { axes: new Set([binding.source.property]), object: false }
          : emptyOrigin();
      }
      case "unknown":
        return emptyOrigin();
    }
  }

  function nodeOrigin(node: ts.Node, seen: Set<CallbackBinding>): ValueOrigin {
    if (isNestedFunction(node)) return emptyOrigin();
    if (ts.isExpression(node)) {
      const unwrapped = unwrapExpression(node);
      if (unwrapped !== node) return nodeOrigin(unwrapped, seen);
    }
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      if (
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isBindingElement(parent) && parent.name === node) ||
        (ts.isVariableDeclaration(parent) && parent.name === node) ||
        (ts.isParameter(parent) && parent.name === node)
      ) {
        return emptyOrigin();
      }
      return bindingOrigin(resolvedBinding(node), seen);
    }
    if (ts.isPropertyAccessExpression(node)) {
      const base = nodeOrigin(node.expression, seen);
      return base.object
        ? { axes: new Set([node.name.text]), object: false }
        : base;
    }
    if (
      ts.isElementAccessExpression(node) &&
      node.argumentExpression !== undefined
    ) {
      const base = nodeOrigin(node.expression, seen);
      const property = staticModuleSpecifier(node.argumentExpression);
      const origin = emptyOrigin();
      mergeOrigin(origin, base);
      mergeOrigin(origin, nodeOrigin(node.argumentExpression, seen));
      origin.object = false;
      if (base.object && property !== undefined) origin.axes.add(property);
      return origin;
    }
    if (ts.isPropertyAssignment(node)) return nodeOrigin(node.initializer, seen);
    if (ts.isShorthandPropertyAssignment(node)) {
      return bindingOrigin(resolvedBinding(node.name), seen);
    }
    if (ts.isSpreadAssignment(node)) {
      const origin = nodeOrigin(node.expression, seen);
      origin.object = false;
      return origin;
    }
    const origin = emptyOrigin();
    ts.forEachChild(node, (child) => mergeOrigin(origin, nodeOrigin(child, seen)));
    origin.object = false;
    return origin;
  }

  const axes = new Set<string>();
  for (const expression of componentReturnExpressions(callback) ?? []) {
    const origin = nodeOrigin(expression, new Set());
    for (const axis of origin.axes) axes.add(axis);
  }
  return axes;
}

function resolvedObjectProperty(
  graph: AstGraph,
  owner: ResolvedAstValue,
  name: string,
): ResolvedAstValue | undefined {
  if (!ts.isObjectLiteralExpression(owner.node)) return undefined;
  const property = ownObjectProperty(owner.node, name);
  const value = property === undefined ? undefined : propertyValue(property);
  return value === undefined
    ? undefined
    : resolveValue(graph, owner.file, value, new Set());
}

function staticString(node: ts.Node | undefined): string | undefined {
  if (node === undefined || !ts.isExpression(node)) return undefined;
  const expression = unwrapExpression(node);
  return ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)
    ? expression.text
    : undefined;
}

function parseManifest(
  manifestFile: SourceFile,
  findings: AuthoredWorldFinding[],
): RecipeManifest | undefined {
  try {
    const value: unknown = JSON.parse(manifestFile.source);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("recipe manifest must be an object");
    }
    return value;
  } catch {
    addFinding(
      findings,
      "invalid-recipe-manifest",
      "recipe.json",
      "recipe.json must contain a valid object",
    );
    return undefined;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is number => typeof entry === "number")
    : [];
}

function declaredPath(
  root: string,
  value: unknown,
): { absolutePath: string; displayPath: string } | undefined {
  if (typeof value !== "string" || value.trim() === "" || isAbsolute(value)) {
    return undefined;
  }
  const absolutePath = resolve(root, value);
  if (!isWithin(root, absolutePath)) return undefined;
  return { absolutePath, displayPath: toPosix(value) };
}

export function inspectAuthoredWorld(
  recipeRoot: string,
  expectation: AuthoredWorldExpectation,
): AuthoredWorldFinding[] {
  const findings: AuthoredWorldFinding[] = [];
  let root: string;
  try {
    root = realpathSync(resolve(recipeRoot));
  } catch {
    return [{
      code: "unreadable-recipe-root",
      path: "recipe.json",
      message: "Recipe root must be a readable local directory",
    }];
  }

  const manifestFile = readDeclaredText(
    root,
    join(root, "recipe.json"),
    "recipe.json",
    findings,
  );
  if (manifestFile === undefined) return finish(findings);
  const manifest = parseManifest(manifestFile, findings);
  if (manifest === undefined) return finish(findings);

  if (manifest.id !== expectation.id) {
    addFinding(
      findings,
      "recipe-id-mismatch",
      "recipe.json",
      `Recipe id must be ${expectation.id}`,
    );
  }

  const presentationSource = declaredPath(root, manifest.presentation?.source);
  if (presentationSource === undefined) {
    addFinding(
      findings,
      "invalid-presentation-source",
      "recipe.json",
      "presentation.source must name a local recipe directory",
    );
    return finish(findings);
  }
  let presentationRoot: string;
  try {
    const stats = lstatSync(presentationSource.absolutePath);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new TypeError();
    presentationRoot = realpathSync(presentationSource.absolutePath);
    if (!isWithin(root, presentationRoot)) throw new TypeError();
  } catch {
    addFinding(
      findings,
      "invalid-presentation-source",
      presentationSource.displayPath,
      "presentation.source must name a local regular directory",
    );
    return finish(findings);
  }

  const entry = declaredPath(presentationRoot, manifest.presentation?.entry);
  const entryFile = entry === undefined
    ? undefined
    : readDeclaredText(root, entry.absolutePath, toPosix(relative(root, entry.absolutePath)), findings);
  if (entry === undefined) {
    addFinding(
      findings,
      "invalid-presentation-entry",
      "recipe.json",
      "presentation.entry must name a local source file",
    );
  }

  const cssFiles: SourceFile[] = [];
  for (const cssPath of stringArray(manifest.presentation?.css)) {
    const declaredCss = declaredPath(presentationRoot, cssPath);
    if (declaredCss === undefined) {
      addFinding(
        findings,
        "invalid-presentation-css",
        "recipe.json",
        `presentation.css contains an unsafe path: ${cssPath}`,
      );
      continue;
    }
    const cssFile = readDeclaredText(
      root,
      declaredCss.absolutePath,
      toPosix(relative(root, declaredCss.absolutePath)),
      findings,
    );
    if (cssFile !== undefined) cssFiles.push(cssFile);
  }

  const profile = declaredPath(root, manifest.map?.profile);
  const profileFile = profile === undefined
    ? undefined
    : readDeclaredText(root, profile.absolutePath, profile.displayPath, findings);
  if (profile === undefined) {
    addFinding(
      findings,
      "invalid-map-profile",
      "recipe.json",
      "map.profile must name a local source file",
    );
  }

  const readmeFile = readDeclaredText(
    root,
    join(root, "README.md"),
    "README.md",
    findings,
  );

  const seeds = [entryFile, ...cssFiles, profileFile]
    .filter((file): file is SourceFile => file !== undefined);
  const sourceFiles = collectReachableSource(root, presentationRoot, seeds, findings);
  const analyzedFiles = sourceFiles.map((file) => ({
    ...file,
    source: stripComments(file.source),
  }));
  const entryPath = entryFile?.path ?? "recipe.json";
  const astGraph = createAstGraph(root, presentationRoot, sourceFiles);
  const entryAst = entryFile === undefined
    ? undefined
    : astGraph.files.get(entryFile.absolutePath);
  const presentation = exportedPresentationObject(astGraph, entryAst);
  const presentationProperties = new Map<string, ts.ObjectLiteralElementLike>();
  if (presentation !== undefined) {
    for (const property of presentation.object.properties) {
      if (ts.isSpreadAssignment(property)) continue;
      const name = propertyNameText(property.name);
      if (name !== undefined && !presentationProperties.has(name)) {
        presentationProperties.set(name, property);
      }
    }
  }

  for (const view of REQUIRED_VIEWS) {
    if (!presentationProperties.has(view)) {
      addFinding(
        findings,
        "missing-presentation-view",
        entryPath,
        `Presentation must export the ${view} view`,
      );
    }
  }

  const presentationComponents = new Map<"Home" | "Experience", ResolvedAstValue>();
  for (const view of ["Home", "Experience"] as const) {
    const property = presentationProperties.get(view);
    const value = property === undefined ? undefined : propertyValue(property);
    const component = value === undefined || presentation === undefined
      ? undefined
      : resolveValue(astGraph, presentation.file, value, new Set());
    const isComponent = component !== undefined &&
      componentReturnExpressions(component.node) !== undefined;
    if (property !== undefined && !isComponent) {
      addFinding(
        findings,
        "unresolved-presentation-component",
        entryPath,
        `Presentation ${view} must resolve to a local component declaration`,
      );
      continue;
    }
    if (component !== undefined) presentationComponents.set(view, component);
  }

  const uiFiles = analyzedFiles.filter((file) =>
    !file.path.endsWith(".css") &&
    file.absolutePath !== profileFile?.absolutePath,
  );
  for (const state of [...new Set(expectation.requiredStates)]) {
    if (firstPatternMatch(uiFiles, requiredStatePattern(state)) === undefined) {
      addFinding(
        findings,
        "missing-state-treatment",
        entryPath,
        `Presentation source must include the ${state} treatment`,
      );
    }
  }

  for (const signal of expectation.requiredSourceSignals) {
    if (firstPatternMatch(analyzedFiles, signal) === undefined) {
      addFinding(
        findings,
        "missing-required-source-signal",
        entryPath,
        `Presentation source must include ${signal.toString()}`,
      );
    }
  }
  for (const signal of expectation.forbiddenSourceSignals) {
    const file = firstPatternMatch(analyzedFiles, signal);
    if (file !== undefined) {
      addFinding(
        findings,
        "forbidden-source-signal",
        file.path,
        `Presentation source must not include ${signal.toString()}`,
      );
    }
  }

  const mapProfileProperty = presentationProperties.get("mapProfile");
  const mapProfileValue = mapProfileProperty === undefined
    ? undefined
    : propertyValue(mapProfileProperty);
  const resolvedMapProfile = mapProfileValue === undefined || presentation === undefined
    ? undefined
    : resolveValue(astGraph, presentation.file, mapProfileValue, new Set());
  const actualMapProfile =
    resolvedMapProfile !== undefined &&
    ts.isObjectLiteralExpression(resolvedMapProfile.node) &&
    resolvedMapProfile.file.file.absolutePath === profileFile?.absolutePath
      ? resolvedMapProfile
      : undefined;
  if (actualMapProfile === undefined) {
    addFinding(
      findings,
      "unresolved-map-profile",
      entryPath,
      "Presentation mapProfile must resolve to the declared local map profile",
    );
  } else {
    // Runtime validation owns the exhaustive fixture matrix. This source check
    // proves that the actual exported callbacks consume their own parameters.
    const marker = resolvedObjectProperty(astGraph, actualMapProfile, "marker");
    const markerAxes = marker === undefined ? new Set<string>() : callbackAxes(marker.node);
    const route = resolvedObjectProperty(astGraph, actualMapProfile, "route");
    const routeAxes = route === undefined ? new Set<string>() : callbackAxes(route.node);
    const requiredAxes = [
      ["marker", "tone"],
      ["route", "tone"],
      ["route", "source"],
      ["route", "certainty"],
      ["route", "mode"],
    ] as const;
    for (const [callback, axis] of requiredAxes) {
      const axes = callback === "marker" ? markerAxes : routeAxes;
      if (axes.has(axis)) continue;
      addFinding(
        findings,
        "missing-map-profile-axis",
        profileFile?.path ?? "recipe.json",
        `Map profile ${callback} must consume its own ${axis} fixture`,
      );
    }

    const basemap = resolvedObjectProperty(astGraph, actualMapProfile, "basemap");
    const mode = basemap === undefined
      ? undefined
      : resolvedObjectProperty(astGraph, basemap, "mode");
    const actualMode = staticString(mode?.node);
    for (const requiredMode of [...new Set(expectation.requiredMapModes)]) {
      if (actualMode === requiredMode) continue;
      addFinding(
        findings,
        "missing-map-mode",
        profileFile?.path ?? "recipe.json",
        `Map profile must declare the ${requiredMode} basemap mode`,
      );
    }
  }

  const declaredViewports = numberArray(manifest.validation?.viewports);
  for (const viewport of REQUIRED_VIEWPORTS) {
    if (!declaredViewports.includes(viewport)) {
      addFinding(
        findings,
        "missing-declared-viewport",
        "recipe.json",
        `validation.viewports must declare ${viewport}`,
      );
    }
  }

  const reachableCssFiles = analyzedFiles.filter((file) => file.path.endsWith(".css"));
  const cssSource = reachableCssFiles.map((file) => file.source).join("\n");
  const cssPath = cssFiles[0]?.path ?? entryPath;
  const responsiveRanges = mediaRanges(cssSource);
  for (const viewport of REQUIRED_VIEWPORTS) {
    if (!responsiveRanges.some((range) => viewport >= range.min && viewport <= range.max)) {
      addFinding(
        findings,
        "missing-responsive-coverage",
        cssPath,
        `Declared CSS media queries must cover the ${viewport}px viewport`,
      );
    }
  }
  if (!/:focus-visible\b/i.test(cssSource)) {
    addFinding(
      findings,
      "missing-focus-visible",
      cssPath,
      "Declared CSS must include a :focus-visible treatment",
    );
  }
  if (!/@media\s*\(\s*forced-colors\s*:\s*active\s*\)/i.test(cssSource)) {
    addFinding(
      findings,
      "missing-forced-colors",
      cssPath,
      "Declared CSS must include @media (forced-colors: active)",
    );
  }
  if (!/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/i.test(cssSource)) {
    addFinding(
      findings,
      "missing-reduced-motion",
      cssPath,
      "Declared CSS must include @media (prefers-reduced-motion: reduce)",
    );
  }

  const forbiddenChecks = [
    ["forbidden-data-url", /url\(\s*["']?\s*data\s*:/i, "data URLs"],
    ["forbidden-gradient", /(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/i, "gradients"],
    ["forbidden-backdrop-filter", /(?:^|[;{\s])(?:-webkit-)?backdrop-filter\s*:/i, "backdrop filters"],
    ["forbidden-text-clip", /(?:-webkit-)?background-clip\s*:\s*text\b/i, "text background clipping"],
  ] as const;
  for (const file of analyzedFiles) {
    for (const [code, pattern, label] of forbiddenChecks) {
      if (pattern.test(file.source)) {
        addFinding(
          findings,
          code,
          file.path,
          `Presentation source must not use ${label}`,
        );
      }
    }
    for (const siblingId of CATALOG_IDS) {
      if (siblingId === expectation.id) continue;
      const siblingPattern = new RegExp(
        `(?:^|[^a-z0-9-])${escapePattern(siblingId)}(?![a-z0-9-])`,
        "i",
      );
      if (siblingPattern.test(file.source)) {
        addFinding(
          findings,
          "sibling-recipe-reference",
          file.path,
          `Presentation source must not reference sibling recipe ${siblingId}`,
        );
      }
    }
  }

  const readme = readmeFile?.source ?? "";
  for (const level of CUSTOMIZATION_LEVELS) {
    if (!new RegExp(escapePattern(level), "i").test(readme)) {
      addFinding(
        findings,
        "missing-customization-level",
        "README.md",
        `README must document ${level}`,
      );
    }
  }

  const homeRoot = componentRootSignature(
    presentationComponents.get("Home"),
    "trip-home",
  );
  const experienceRoot = componentRootSignature(
    presentationComponents.get("Experience"),
    "trip-experience",
  );
  if (homeRoot === undefined) {
    addFinding(
      findings,
      "missing-root-signature",
      entryPath,
      "Home must expose a source-visible trip-home root",
    );
  }
  if (experienceRoot === undefined) {
    addFinding(
      findings,
      "missing-root-signature",
      entryPath,
      "Experience must expose a source-visible trip-experience root",
    );
  }
  if (
    homeRoot !== undefined &&
    experienceRoot !== undefined &&
    homeRoot.signature === experienceRoot.signature
  ) {
    addFinding(
      findings,
      "identical-root-signature",
      experienceRoot.path,
      "Home and Experience must not use identical root signatures",
    );
  }

  return finish(findings);
}
