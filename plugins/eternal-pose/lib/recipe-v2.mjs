import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";

export const RECIPE_SCHEMA_VERSION = 2;

const DEFAULT_OPERATIONS = { lstat, readFile, readdir, realpath };
const REQUIRED_VIEWPORTS = [320, 390, 430, 768, 1024, 1440];
const FEATURES = new Set(["media", "desktop-windows", "dense-telemetry"]);
const SCREENSHOTS = new Set(["home", "experience", "experience-expanded"]);

function isWithin(parent, candidate) {
  const relativePath = relative(parent, candidate);
  return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath));
}

function freezeArray(values) {
  return Object.freeze([...values]);
}

function fail(field, message) {
  throw new Error(`${field} ${message}`);
}

function nonblankString(value, field) {
  if (typeof value !== "string" || value.trim() === "") fail(field, "must be a nonblank string");
  return value;
}

function exactKeys(value, keys, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(field, "must be an object");
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${field}.${key}`, "is not allowed");
}

function enumValue(value, allowed, field) {
  if (!allowed.includes(value)) fail(field, `must be one of ${allowed.join(", ")}`);
  return value;
}

function uniqueEnumArray(value, allowed, field) {
  if (!Array.isArray(value) || value.length === 0) fail(field, "must be a non-empty array");
  const values = value.map((entry, index) => enumValue(entry, allowed, `${field}[${index}]`));
  if (new Set(values).size !== values.length) fail(field, "must not contain duplicates");
  return freezeArray(values);
}

function normalizedRelativePath(value, field) {
  const path = nonblankString(value, field);
  if (path.includes("\0")) fail(field, "must not contain NUL bytes");
  if (path.includes("\\")) fail(field, "must use normalized POSIX separators");
  if (posix.isAbsolute(path) || isAbsolute(path)) fail(field, "must be relative");
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) fail(field, "must not be a URL");
  const parts = path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    fail(field, "must be a normalized root-contained path");
  }
  return parts.join("/");
}

function normalizedPathArray(value, field) {
  if (!Array.isArray(value)) fail(field, "must be an array");
  const paths = value.map((entry, index) => normalizedRelativePath(entry, `${field}[${index}]`));
  if (new Set(paths).size !== paths.length) fail(field, "must not contain duplicates");
  return paths;
}

async function canonicalDirectory(path, field, operations) {
  const resolved = resolve(path);
  const stats = await operations.lstat(resolved);
  if (!stats.isDirectory() || stats.isSymbolicLink()) fail(field, "must be a non-symbolic-link directory");
  const canonical = await operations.realpath(resolved);
  if (canonical !== resolved) fail(field, "must be a non-symbolic-link directory");
  return canonical;
}

async function canonicalDeclaredPath(root, path, field, type, operations) {
  const normalized = normalizedRelativePath(path, field);
  const resolved = join(root, ...normalized.split("/"));
  if (!isWithin(root, resolved)) fail(field, "must be root-contained");
  let stats;
  try {
    stats = await operations.lstat(resolved);
  } catch (error) {
    if (error?.code === "ENOENT") fail(field, `must name an existing ${type}`);
    throw error;
  }
  const typeMatches = type === "directory" ? stats.isDirectory() : stats.isFile();
  if (!typeMatches || stats.isSymbolicLink()) fail(field, `must be a regular non-symbolic link ${type}`);
  const canonical = await operations.realpath(resolved);
  if (!isWithin(root, canonical)) fail(field, "must be root-contained");
  return canonical;
}

function parseManifest(contents) {
  try {
    return JSON.parse(contents);
  } catch {
    throw new Error("recipe.json must be valid JSON");
  }
}

function buildManifest(value, expectedId) {
  exactKeys(value, ["schemaVersion", "id", "label", "summary", "register", "presentation", "map", "motion", "features", "font", "validation"], "recipe");
  if (value.schemaVersion !== RECIPE_SCHEMA_VERSION) fail("schemaVersion", `must be ${RECIPE_SCHEMA_VERSION}`);
  const id = nonblankString(value.id, "id");
  if (id !== expectedId) fail("id", "must match the recipe directory");
  const label = nonblankString(value.label, "label");
  const summary = nonblankString(value.summary, "summary");
  const register = enumValue(value.register, ["product"], "register");

  exactKeys(value.presentation, ["source", "entry", "css", "assets"], "presentation");
  const presentation = {
    source: enumValue(value.presentation.source, ["presentation"], "presentation.source"),
    entry: normalizedRelativePath(value.presentation.entry, "presentation.entry"),
    css: normalizedPathArray(value.presentation.css, "presentation.css"),
    assets: normalizedPathArray(value.presentation.assets, "presentation.assets"),
  };

  exactKeys(value.map, ["profile", "googleStyleGuide"], "map");
  const map = {
    profile: normalizedRelativePath(value.map.profile, "map.profile"),
    ...(value.map.googleStyleGuide === undefined
      ? {}
      : { googleStyleGuide: normalizedRelativePath(value.map.googleStyleGuide, "map.googleStyleGuide") }),
  };

  exactKeys(value.motion, ["durationMs", "easing", "interruptible", "reducedMotion"], "motion");
  if (typeof value.motion.durationMs !== "number" || !Number.isFinite(value.motion.durationMs) || value.motion.durationMs < 0) {
    fail("motion.durationMs", "must be a finite non-negative number");
  }
  const motion = {
    durationMs: value.motion.durationMs,
    easing: nonblankString(value.motion.easing, "motion.easing"),
    interruptible: enumValue(value.motion.interruptible, [true], "motion.interruptible"),
    reducedMotion: enumValue(value.motion.reducedMotion, ["instant"], "motion.reducedMotion"),
  };

  const features = uniqueEnumArray(value.features, [...FEATURES], "features");

  exactKeys(value.font, ["policy", "assets", "license"], "font");
  const policy = enumValue(value.font.policy, ["system", "local-open-license"], "font.policy");
  const fontAssets = normalizedPathArray(value.font.assets, "font.assets");
  const license = value.font.license === undefined ? undefined : nonblankString(value.font.license, "font.license");
  if (policy === "local-open-license" && license === undefined) fail("font.license", "is required for local-open-license fonts");
  const font = { policy, assets: freezeArray(fontAssets), ...(license === undefined ? {} : { license }) };

  exactKeys(value.validation, ["viewports", "screenshots"], "validation");
  if (!Array.isArray(value.validation.viewports) || value.validation.viewports.length !== REQUIRED_VIEWPORTS.length) {
    fail("validation.viewports", "must contain each required viewport exactly once");
  }
  const viewports = value.validation.viewports.map((viewport, index) => {
    if (!Number.isInteger(viewport) || !REQUIRED_VIEWPORTS.includes(viewport)) fail(`validation.viewports[${index}]`, "is not supported");
    return viewport;
  });
  if (new Set(viewports).size !== viewports.length || !REQUIRED_VIEWPORTS.every((viewport) => viewports.includes(viewport))) {
    fail("validation.viewports", "must contain each required viewport exactly once");
  }
  const screenshots = uniqueEnumArray(value.validation.screenshots, [...SCREENSHOTS], "validation.screenshots");

  return Object.freeze({
    schemaVersion: RECIPE_SCHEMA_VERSION,
    id,
    label,
    summary,
    register,
    presentation: Object.freeze({ source: presentation.source, entry: presentation.entry, css: freezeArray(presentation.css), assets: freezeArray(presentation.assets) }),
    map: Object.freeze(map),
    motion: Object.freeze(motion),
    features,
    font: Object.freeze(font),
    validation: Object.freeze({ viewports: freezeArray(viewports), screenshots }),
  });
}

export async function loadRecipeV2(recipeDir, expectedId, operations_ = {}) {
  const operations = { ...DEFAULT_OPERATIONS, ...operations_ };
  const root = await canonicalDirectory(recipeDir, "recipe directory", operations);
  const manifestPath = await canonicalDeclaredPath(root, "recipe.json", "recipe.json", "file", operations);
  const manifest = buildManifest(parseManifest(await operations.readFile(manifestPath, "utf8")), expectedId);
  const presentationRoot = await canonicalDeclaredPath(root, manifest.presentation.source, "presentation.source", "directory", operations);
  const presentationEntry = await canonicalDeclaredPath(presentationRoot, manifest.presentation.entry, "presentation.entry", "file", operations);
  const cssFiles = freezeArray(await Promise.all(manifest.presentation.css.map((path, index) =>
    canonicalDeclaredPath(presentationRoot, path, `presentation.css[${index}]`, "file", operations),
  )));
  const assetRoots = freezeArray(await Promise.all(manifest.presentation.assets.map((path, index) =>
    canonicalDeclaredPath(presentationRoot, path, `presentation.assets[${index}]`, "directory", operations),
  )));
  const mapProfile = await canonicalDeclaredPath(root, manifest.map.profile, "map.profile", "file", operations);
  const googleStyleGuide = manifest.map.googleStyleGuide === undefined
    ? undefined
    : await canonicalDeclaredPath(root, manifest.map.googleStyleGuide, "map.googleStyleGuide", "file", operations);
  await Promise.all(manifest.font.assets.map((path, index) =>
    canonicalDeclaredPath(root, path, `font.assets[${index}]`, "file", operations),
  ));

  return Object.freeze({
    id: manifest.id,
    root,
    manifest,
    presentationRoot,
    presentationEntry,
    cssFiles,
    assetRoots,
    mapProfile,
    googleStyleGuide,
  });
}

export async function loadRecipeV2Catalog(catalogRoot, operations_ = {}) {
  const operations = { ...DEFAULT_OPERATIONS, ...operations_ };
  const root = await canonicalDirectory(catalogRoot, "recipe catalog root", operations);
  const entries = (await operations.readdir(root, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
  const recipes = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const recipeDir = join(root, entry.name);
    const manifestPath = await canonicalDeclaredPath(recipeDir, "recipe.json", "recipe.json", "file", operations);
    const expectedId = parseManifest(await operations.readFile(manifestPath, "utf8"))?.id;
    recipes.push(await loadRecipeV2(recipeDir, expectedId, operations));
  }
  recipes.sort((left, right) => left.id.localeCompare(right.id));
  const catalog = new Map();
  for (const recipe of recipes) {
    if (catalog.has(recipe.id)) throw new Error(`duplicate recipe id: ${recipe.id}`);
    catalog.set(recipe.id, recipe);
  }
  return catalog;
}
