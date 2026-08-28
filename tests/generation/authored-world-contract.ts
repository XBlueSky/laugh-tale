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

function importSpecifiers(source: string): string[] {
  const withoutComments = stripComments(source);
  const specifiers = new Set<string>();
  const patterns = [
    /\b(?:import|export)\s+(?!\s*\()(?:type\s+)?(?:(?:(?!;)[\s\S])*?\s+from\s+)?["']([^"'\r\n]+)["']/g,
    /\bimport\s*\(\s*["']([^"'\r\n]+)["']\s*\)/g,
    /@import\s+(?:url\(\s*)?["']([^"'\r\n]+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of withoutComments.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.add(specifier);
    }
  }
  return [...specifiers].sort((left, right) => left.localeCompare(right));
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

function resolveLocalImport(
  presentationRoot: string,
  importer: string,
  specifier: string,
): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const unresolved = resolve(dirname(importer), specifier);
  if (!isWithin(presentationRoot, unresolved)) return undefined;
  for (const candidate of importCandidates(unresolved)) {
    const canonicalPath = regularLocalFile(presentationRoot, candidate);
    if (canonicalPath !== undefined) return canonicalPath;
  }
  return undefined;
}

function collectReachableSource(
  recipeRoot: string,
  presentationRoot: string,
  seeds: readonly SourceFile[],
): SourceFile[] {
  // The import graph is the declaration boundary. Never enumerate the source
  // directory: an unrelated local draft must neither satisfy nor fail a recipe.
  const files = new Map<string, SourceFile>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined || files.has(file.absolutePath)) continue;
    files.set(file.absolutePath, file);
    for (const specifier of importSpecifiers(file.source)) {
      const importedPath = resolveLocalImport(
        presentationRoot,
        file.absolutePath,
        specifier,
      );
      if (importedPath === undefined || files.has(importedPath)) continue;
      queue.push({
        absolutePath: importedPath,
        path: toPosix(relative(recipeRoot, importedPath)),
        source: readFileSync(importedPath, "utf8"),
      });
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

function findBalancedObject(source: string, marker: RegExp): string | undefined {
  const match = marker.exec(source);
  if (match === null) return undefined;
  const start = source.indexOf("{", match.index + match[0].length);
  if (start < 0) return undefined;
  let depth = 0;
  let quote: "\"" | "'" | "`" | null = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index] ?? "";
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return undefined;
}

function presentationObject(source: string): string | undefined {
  return findBalancedObject(
    stripComments(source),
    /\b(?:export\s+)?const\s+presentation\s*=/,
  );
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

function rootSignature(
  files: readonly SourceFile[],
  testId: "trip-home" | "trip-experience",
): RootSignature | undefined {
  const testIdPattern = escapePattern(testId);
  const pattern = new RegExp(
    `<([A-Za-z][A-Za-z0-9_.:-]*)\\b([^<>]*\\bdata-testid\\s*=\\s*["']${testIdPattern}["'][^<>]*)>`,
    "i",
  );
  for (const file of files) {
    const match = pattern.exec(stripComments(file.source));
    if (match === null) continue;
    const tag = (match[1] ?? "").toLowerCase();
    const attributes = match[2] ?? "";
    const staticClass = /\bclassName\s*=\s*["']([^"']*)["']/i.exec(attributes)?.[1];
    const dynamicClass = /\bclassName\s*=\s*\{([^}]*)\}/i.exec(attributes)?.[1];
    const className = normalizeClassName(staticClass ?? dynamicClass ?? "");
    const role = /\brole\s*=\s*["']([^"']*)["']/i.exec(attributes)?.[1]?.toLowerCase() ?? "";
    const dataAttributes = [...attributes.matchAll(/\b(data-[a-z0-9-]+)\s*=/gi)]
      .map((entry) => (entry[1] ?? "").toLowerCase())
      .filter((name) => name !== "data-testid")
      .sort()
      .join(",");
    return {
      path: file.path,
      signature: `${tag}|class=${className}|role=${role}|data=${dataAttributes}`,
    };
  }
  return undefined;
}

function axisAccessCount(source: string, axis: string): number {
  const propertyAccesses = source.match(
    new RegExp(`(?:\\?\\.|\\.)\\s*${escapePattern(axis)}\\b`, "g"),
  )?.length ?? 0;
  const destructures = source.match(
    new RegExp(`\\{[^{}]*\\b${escapePattern(axis)}\\b[^{}]*\\}\\s*=`, "g"),
  )?.length ?? 0;
  return propertyAccesses + destructures;
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
  const sourceFiles = collectReachableSource(root, presentationRoot, seeds);
  const analyzedFiles = sourceFiles.map((file) => ({
    ...file,
    source: stripComments(file.source),
  }));
  const profileSource = profileFile === undefined ? "" : stripComments(profileFile.source);
  const entrySource = entryFile === undefined ? "" : entryFile.source;
  const entryPath = entryFile?.path ?? "recipe.json";
  const objectSource = presentationObject(entrySource) ?? "";

  for (const view of REQUIRED_VIEWS) {
    const property = new RegExp(`(?:^|[,{\\n])\\s*${view}\\s*(?=[:,}\\n])`, "m");
    if (!property.test(objectSource)) {
      addFinding(
        findings,
        "missing-presentation-view",
        entryPath,
        `Presentation must export the ${view} view`,
      );
    }
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

  const markerToneCount = axisAccessCount(profileSource, "tone");
  // Runtime profile validation owns the exhaustive semantic fixture matrix.
  // These checks only prove that authored source consumes its semantic axes.
  if (markerToneCount < 2) {
    addFinding(
      findings,
      "missing-map-profile-axis",
      profileFile?.path ?? "recipe.json",
      "Map profile must consume marker and route tone fixtures",
    );
  }
  for (const axis of ["source", "certainty"] as const) {
    if (axisAccessCount(profileSource, axis) === 0) {
      addFinding(
        findings,
        "missing-map-profile-axis",
        profileFile?.path ?? "recipe.json",
        `Map profile must consume route ${axis} fixtures`,
      );
    }
  }
  for (const mode of [...new Set(expectation.requiredMapModes)]) {
    const quotedMode = new RegExp(`["']${escapePattern(mode)}["']`, "i");
    if (!quotedMode.test(profileSource)) {
      addFinding(
        findings,
        "missing-map-mode",
        profileFile?.path ?? "recipe.json",
        `Map profile must declare the ${mode} basemap mode`,
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
    const remoteImport = importSpecifiers(file.source).find((specifier) => /^https?:/i.test(specifier));
    if (remoteImport !== undefined) {
      addFinding(
        findings,
        "forbidden-remote-import",
        file.path,
        `Presentation source must not import ${remoteImport}`,
      );
    }
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

  const homeRoot = rootSignature(uiFiles, "trip-home");
  const experienceRoot = rootSignature(uiFiles, "trip-experience");
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
