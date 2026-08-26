import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const PLUGIN_NAME = "eternal-pose";
const VERSION = "0.1.0";
const STRICT_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const FORBIDDEN_MARKERS = /\[todo:|placeholder|example\.com/i;
const PROHIBITED_MANIFEST_COMPONENTS = ["commands", "agents", "hooks", "apps", "mcpServers", "mcp"];
const PROHIBITED_PLUGIN_PATHS = [
  "commands",
  "agents",
  "hooks",
  "apps",
  "mcp",
  ".mcp.json",
  ".app.json",
  "hooks.json",
];

function errorFor(errors, condition, message) {
  if (!condition) errors.push(message);
}

function readJson(rootUrl, relativePath, errors) {
  const targetUrl = new URL(relativePath, rootUrl);
  if (!existsSync(targetUrl)) {
    errors.push(`Missing ${relativePath}`);
    return null;
  }

  try {
    return JSON.parse(readFileSync(targetUrl, "utf8"));
  } catch (error) {
    errors.push(`Invalid JSON in ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function isRealRelativePath(rootUrl, value) {
  if (typeof value !== "string" || !value.startsWith("./") || value.includes("\\") || value.includes("..")) {
    return false;
  }
  return existsSync(new URL(value, rootUrl));
}

function validateManifest(errors, manifest, label, requiresSkills) {
  if (!manifest || typeof manifest !== "object") return;
  errorFor(errors, manifest.name === PLUGIN_NAME, `${label} manifest name must be ${PLUGIN_NAME}`);
  errorFor(errors, manifest.version === VERSION && STRICT_SEMVER.test(manifest.version), `${label} manifest version must be strict SemVer ${VERSION}`);
  errorFor(errors, typeof manifest.description === "string" && manifest.description.length > 0, `${label} manifest requires a description`);
  errorFor(errors, manifest.author?.name === "Laugh Tale contributors", `${label} manifest author.name must be Laugh Tale contributors`);
  errorFor(errors, manifest.license === "MIT", `${label} manifest license must be MIT`);
  errorFor(errors, !FORBIDDEN_MARKERS.test(JSON.stringify(manifest)), `${label} manifest contains an unfinished marker`);
  for (const component of PROHIBITED_MANIFEST_COMPONENTS) {
    errorFor(errors, !(component in manifest), `${label} manifest must not declare prohibited ${component}`);
  }
  if (requiresSkills) {
    errorFor(errors, manifest.skills === "./skills/", `${label} manifest skills must be ./skills/`);
    for (const key of ["displayName", "shortDescription", "longDescription", "developerName", "category", "brandColor"]) {
      errorFor(errors, typeof manifest.interface?.[key] === "string" && manifest.interface[key].trim().length > 0, `${label} interface.${key} must be a non-empty string`);
    }
  }
}

/**
 * Validate the portable, source-controlled contract shared by Claude Code and Codex.
 * @param {URL} repoRoot
 * @returns {Promise<string[]>}
 */
export async function validatePluginContracts(repoRoot) {
  const rootUrl = repoRoot instanceof URL ? repoRoot : pathToFileURL(repoRoot.endsWith("/") ? repoRoot : `${repoRoot}/`);
  const errors = [];
  const claudePlugin = readJson(rootUrl, "plugins/eternal-pose/.claude-plugin/plugin.json", errors);
  const codexPlugin = readJson(rootUrl, "plugins/eternal-pose/.codex-plugin/plugin.json", errors);
  const claudeMarketplace = readJson(rootUrl, ".claude-plugin/marketplace.json", errors);
  const codexMarketplace = readJson(rootUrl, ".agents/plugins/marketplace.json", errors);

  errorFor(errors, existsSync(new URL("LICENSE", rootUrl)), "Missing LICENSE");
  errorFor(errors, existsSync(new URL("NOTICE.md", rootUrl)), "Missing NOTICE.md");
  errorFor(errors, existsSync(new URL("plugins/eternal-pose/skills/eternal-pose/SKILL.md", rootUrl)), "Missing Eternal Pose SKILL.md");
  for (const relativePath of PROHIBITED_PLUGIN_PATHS) {
    const displayPath = relativePath.includes(".") ? relativePath : `${relativePath}/`;
    errorFor(errors, !existsSync(new URL(`plugins/eternal-pose/${relativePath}`, rootUrl)), `v1 must not include ${displayPath}`);
  }

  validateManifest(errors, claudePlugin, "Claude", false);
  validateManifest(errors, codexPlugin, "Codex", true);

  const claudeEntry = claudeMarketplace?.plugins?.[0];
  errorFor(errors, claudeMarketplace?.name === "laugh-tale", "Claude marketplace name must be laugh-tale");
  errorFor(errors, claudeEntry?.name === PLUGIN_NAME && claudeEntry?.version === VERSION, "Claude marketplace must expose eternal-pose@0.1.0");
  errorFor(errors, claudeEntry?.source === "./plugins/eternal-pose" && isRealRelativePath(rootUrl, claudeEntry?.source), "Claude marketplace source must be a real relative Eternal Pose path");

  const codexEntry = codexMarketplace?.plugins?.[0];
  errorFor(errors, codexMarketplace?.name === "laugh-tale", "Codex marketplace name must be laugh-tale");
  errorFor(errors, codexEntry?.name === PLUGIN_NAME && codexEntry?.version === VERSION, "Codex marketplace must expose eternal-pose@0.1.0");
  errorFor(errors, codexEntry?.category === "Developer Tools", "Codex marketplace category must be Developer Tools");
  errorFor(errors, codexEntry?.source?.source === "local" && codexEntry?.source?.path === "./plugins/eternal-pose" && isRealRelativePath(rootUrl, codexEntry?.source?.path), "Codex marketplace source must be a real relative Eternal Pose path");
  errorFor(errors, codexEntry?.policy?.installation === "AVAILABLE", "Codex marketplace policy.installation must be AVAILABLE");
  errorFor(errors, codexEntry?.policy?.authentication === "ON_INSTALL", "Codex marketplace policy.authentication must be ON_INSTALL");
  errorFor(errors, !("products" in (codexEntry?.policy ?? {})), "Codex marketplace must not include product gating in v1");

  if (claudePlugin && codexPlugin) {
    errorFor(errors, claudePlugin.version === codexPlugin.version, "Plugin manifests must use matching versions");
  }
  return errors;
}

async function main() {
  const errors = await validatePluginContracts(new URL("../", import.meta.url));
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Plugin contracts valid: ${PLUGIN_NAME}@${VERSION}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
