import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";

import { describe, expect, test } from "vitest";

const repoRoot = process.cwd();
const recipeRoot = join(
  repoRoot,
  "plugins/eternal-pose/recipes-v2/oak-washi",
);
const presentationRoot = join(recipeRoot, "presentation");

function interfaceCopyPaths(path: string): string[] {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const interfaces = new Map(source.statements.filter(ts.isInterfaceDeclaration).map((entry) => [entry.name.text, entry]));
  const root = interfaces.get("OakWashiCopy");
  if (!root) throw new Error("OakWashiCopy interface is missing");
  const paths: string[] = [];
  function collect(members: ts.NodeArray<ts.TypeElement>, prefix: string) {
    for (const member of members) {
      if (!ts.isPropertySignature(member) || !member.type || !member.name || !ts.isIdentifier(member.name)) throw new Error("OakWashiCopy must use required named properties");
      const path = prefix ? `${prefix}.${member.name.text}` : member.name.text;
      if (member.questionToken) throw new Error(`optional copy property: ${path}`);
      if (member.type.kind === ts.SyntaxKind.StringKeyword) paths.push(path);
      else if (ts.isTypeLiteralNode(member.type)) collect(member.type.members, path);
      else if (ts.isTypeReferenceNode(member.type) && ts.isIdentifier(member.type.typeName)) {
        const referenced = interfaces.get(member.type.typeName.text);
        if (!referenced) throw new Error(`unknown copy interface: ${path}`);
        collect(referenced.members, path);
      } else throw new Error(`unsupported copy property type: ${path}`);
    }
  }
  collect(root.members, "");
  return paths.sort();
}

function schemaCopyPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid copy schema");
  const node = value as { type?: unknown; properties?: unknown };
  if (node.type === "string") return [prefix];
  if (node.type !== "object" || !node.properties || typeof node.properties !== "object" || Array.isArray(node.properties)) throw new Error("invalid copy schema node");
  return Object.entries(node.properties).flatMap(([key, child]) => schemaCopyPaths(child, prefix ? `${prefix}.${key}` : key)).sort();
}

const requiredFiles = [
  "README.md",
  "recipe.json",
  "provider-guides/google-map-style.json",
  "presentation/index.ts",
  "presentation/copy/schema.ts",
  "presentation/copy/catalog-schema.json",
  "presentation/copy/en.json",
  "presentation/copy/zh-Hant.json",
  "presentation/copy/resolve-copy.ts",
  "presentation/copy/catalog.ts",
  "presentation/styles/index.css",
  "presentation/styles/fonts.css",
  "presentation/styles/tokens.css",
  "presentation/styles/layers.css",
  "presentation/styles/layout.css",
  "presentation/styles/components.css",
  "presentation/styles/states.css",
  "presentation/styles/editorial.css",
  "presentation/styles/motion.css",
  "presentation/styles/accessibility.css",
  "presentation/assets/oak-washi-cartography.webp",
  "presentation/assets/huninn-regular.woff2",
  "presentation/assets/OFL-Huninn.txt",
  "presentation/assets/HUNINN-SOURCE.md",
  "presentation/assets/HUNINN-PARTITIONS.json",
  "presentation/assets/HUNINN-SUBSETS.json",
] as const;

const expectedCopyPaths = [
  "accessibleNames.candidateDialog",
  "accessibleNames.collapseDayRail",
  "accessibleNames.collapseSheet",
  "accessibleNames.dayRail",
  "accessibleNames.expandDayRail",
  "accessibleNames.expandSheet",
  "accessibleNames.header",
  "accessibleNames.itinerarySheet",
  "accessibleNames.map",
  "accessibleNames.marker",
  "accessibleNames.openDetails",
  "accessibleNames.route",
  "accessibleNames.userLocation",
  "booking.confirmed",
  "booking.none",
  "booking.open",
  "booking.pending",
  "booking.reference",
  "candidate.browse",
  "candidate.cancel",
  "candidate.confirm",
  "candidate.draft",
  "candidate.open",
  "candidate.preview",
  "candidate.reopen",
  "candidate.selected",
  "candidate.single",
  "candidate.title",
  "candidate.unresolved",
  "certainty.candidate",
  "certainty.confirmed",
  "certainty.suggested",
  "certainty.unverified",
  "experience.collapseDayRail",
  "experience.collapseSheet",
  "experience.day",
  "experience.dayOfTrip",
  "experience.expandDayRail",
  "experience.expandSheet",
  "experience.home",
  "experience.itinerary",
  "experience.mapCoverageNone",
  "experience.mapCoveragePartial",
  "experience.primaryCount",
  "experience.summary",
  "experience.tripTime",
  "facts.area",
  "facts.arrivalBuffer",
  "facts.base",
  "facts.bus",
  "facts.checkIn",
  "facts.checkOut",
  "facts.checklist",
  "facts.cuisine",
  "facts.customKind",
  "facts.duration",
  "facts.false",
  "facts.meters",
  "facts.mode",
  "facts.must",
  "facts.nice",
  "facts.plan",
  "facts.priority",
  "facts.rail",
  "facts.return",
  "facts.status",
  "facts.terminal",
  "facts.true",
  "facts.unverifiedLocation",
  "facts.unverifiedLocationConsequence",
  "fatal.externalNavigationRetained",
  "fatal.homeRetained",
  "fatal.itineraryRetained",
  "fatal.openHome",
  "fatal.provider",
  "fatal.render",
  "fatal.retry",
  "fatal.state",
  "fatal.title",
  "home.dates",
  "home.days",
  "home.destination",
  "home.lodging",
  "home.noLodging",
  "home.noReservations",
  "home.noTasks",
  "home.openDay",
  "home.openExperience",
  "home.reservations",
  "home.tasks",
  "home.title",
  "home.travelers",
  "loading.experience",
  "loading.home",
  "loading.location",
  "loading.map",
  "loading.places",
  "loading.progress",
  "loading.routes",
  "loading.title",
  "location.active",
  "location.denied",
  "location.idle",
  "location.locate",
  "location.recenter",
  "location.requesting",
  "location.stop",
  "location.unavailable",
  "location.waitingForFix",
  "metadata.productName",
    "metadata.setupDescription",
    "metadata.setupTitle",
    "navigation.open",
    "navigation.restoreFullDay",
    "navigation.returnToCurrent",
    "navigation.returnToLodging",
    "navigation.unavailable",
  "openingHours.absent",
  "openingHours.alwaysOpen",
  "openingHours.closed",
  "openingHours.incomplete",
  "openingHours.invalid",
  "openingHours.open",
  "openingHours.permanentlyClosed",
  "openingHours.temporarilyClosed",
  "openingHours.unknown",
  "persistence.cancelReset",
  "persistence.confirmReset",
  "persistence.manageProgress",
  "persistence.memoryOnly",
  "persistence.memoryOnlyNotice",
  "persistence.persistent",
  "persistence.resetDay",
  "persistence.resetDayScope",
  "persistence.resetDone",
  "persistence.resetExplanation",
  "persistence.resetTrip",
  "progress.complete",
  "progress.completedOfTotal",
  "progress.markComplete",
  "progress.markIncomplete",
  "progress.pending",
  "progress.purchased",
  "progress.restore",
  "progress.skip",
  "progress.skipped",
  "progress.unavailable",
  "provider.cancelled",
  "provider.idle",
  "provider.implausibleResult",
  "provider.loaderFailed",
  "provider.loading",
  "provider.malformedResponse",
  "provider.map",
  "provider.missingConfiguration",
  "provider.network",
  "provider.notFound",
  "provider.places",
  "provider.ready",
  "provider.requestDenied",
  "provider.retry",
  "provider.routes",
  "provider.unavailable",
  "provider.unsupported",
  "roles.base",
  "roles.connector",
  "roles.journey",
  "roles.logisticsGroup",
  "roles.primary",
  "roles.task",
  "routes.authoredFallback",
  "routes.distance",
  "routes.driving",
  "routes.duration",
  "routes.external",
  "routes.flight",
  "routes.idle",
  "routes.loading",
  "routes.manual",
  "routes.noDetails",
  "routes.provider",
  "routes.ready",
  "routes.recomposed",
  "routes.retry",
  "routes.steps",
  "routes.transit",
  "routes.unavailable",
  "routes.unknown",
  "routes.walking",
  "setup.invalidTrip",
  "setup.missingTrip",
  "setup.retry",
  "setup.title",
  "status.candidate",
  "status.completed",
  "status.current",
  "status.next",
  "status.selected",
  "status.skipped",
  "status.unresolved",
  "status.viewing",
  "timeline.logisticsGroup",
  "timing.end",
  "timing.fixed",
  "timing.nextDay",
  "timing.range",
  "timing.start",
  "timing.suggested",
  "timing.unknown",
  "timing.untimed",
  "types.custom",
  "types.dining",
  "types.experience",
  "types.lodging",
  "types.logistics",
  "types.shopping",
  "types.sightseeing",
  "types.transfer",
  "types.transport",
] as const;

const expectedTokens = {
  "--oak-canvas": "#f6f2ea",
  "--oak-surface": "#fbf9f5",
  "--oak-surface-muted": "#f2ede4",
  "--oak-surface-strong": "#fffdf9",
  "--oak-ink": "#352f2a",
  "--oak-ink-muted": "#766e65",
  "--oak-rule": "#d8d0c4",
  "--oak-route-teal": "#6f8f8c",
  "--oak-accent": "#b86f4b",
  "--oak-accent-surface": "#f2e3d9",
  "--oak-warning": "#9a7338",
  "--oak-focus": "#8f5036",
  "--oak-map-surface": "#e8e2d8",
} as const;

function collectFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? collectFiles(path) : [path];
    });
}

function isWithin(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return (
    fromRoot === "" ||
    (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`))
  );
}

function parseJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function serializeCatalogModule(locale: string, catalog: unknown): string {
  return [
    'import type { OakWashiCopy } from "./schema.js";',
    "",
    `export const locale = ${JSON.stringify(locale)};`,
    "",
    `export const catalog = ${JSON.stringify(catalog, null, 2)} satisfies OakWashiCopy;`,
    "",
  ].join("\n");
}

function containsEmojiOrIcon(value: string): boolean {
  return (
    /\p{Extended_Pictographic}/u.test(value) ||
    /\p{Regional_Indicator}/u.test(value) ||
    /[\u{1F3FB}-\u{1F3FF}]/u.test(value) ||
    value.includes("\u20e3") ||
    value.includes("\ufe0f")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copyPaths(value: unknown, prefix = ""): string[] {
  if (!isRecord(value)) throw new TypeError(`${prefix || "catalog"} must be an object`);
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return typeof child === "string" ? [path] : copyPaths(child, path);
  });
}

function expectRecursivelySorted(value: unknown, path = "catalog"): void {
  if (!isRecord(value)) return;
  const keys = Object.keys(value);
  expect(keys, `${path} keys`).toEqual([...keys].sort());
  for (const [key, child] of Object.entries(value)) {
    expectRecursivelySorted(child, `${path}.${key}`);
  }
}

function expectClosedSchema(schema: unknown, value: unknown, path = "catalog"): void {
  expect(isRecord(schema), `${path} schema`).toBe(true);
  expect(isRecord(value), path).toBe(true);
  if (!isRecord(schema) || !isRecord(value)) return;
  expect(schema.type, `${path} type`).toBe("object");
  expect(schema.additionalProperties, `${path} additionalProperties`).toBe(false);
  expect(isRecord(schema.properties), `${path} properties`).toBe(true);
  if (!isRecord(schema.properties)) return;
  const propertyKeys = Object.keys(schema.properties);
  expect(schema.required, `${path} required`).toEqual(propertyKeys);
  expect(Object.keys(value), `${path} source keys`).toEqual(propertyKeys);
  for (const key of propertyKeys) {
    const childSchema = schema.properties[key];
    const childValue = value[key];
    expect(isRecord(childSchema), `${path}.${key} schema`).toBe(true);
    if (!isRecord(childSchema)) continue;
    expect(childSchema).not.toHaveProperty("default");
    expect(childSchema).not.toHaveProperty("fallback");
    if (childSchema.type === "string") {
      expect(typeof childValue, `${path}.${key}`).toBe("string");
    } else {
      expectClosedSchema(childSchema, childValue, `${path}.${key}`);
    }
  }
}

describe("Oak & Washi canonical foundation", () => {
  test("ships an attributed, complete local Huninn web font", () => {
    const asset = readFileSync(join(presentationRoot, "assets/huninn-regular.woff2"));
    expect(asset.subarray(0, 4).toString()).toBe("wOF2");
    expect(asset.byteLength).toBe(2_123_816);
    expect(createHash("sha256").update(asset).digest("hex")).toBe("e2a95d2a13e0ce0c10198356eb1e0aa323494adfd0847afdd50e4695a5c747ee");
    expect(readFileSync(join(presentationRoot, "assets/OFL-Huninn.txt"), "utf8")).toContain("SIL OPEN FONT LICENSE");
    expect(readFileSync(join(presentationRoot, "assets/HUNINN-SOURCE.md"), "utf8")).toContain("google/fonts");
    const fonts = readFileSync(join(presentationRoot, "styles/fonts.css"), "utf8");
    expect(fonts).toContain('font-family: "Oak Huninn"');
    expect(fonts).toContain("font-display: swap");
    expect(fonts).not.toContain('../assets/huninn-regular.woff2');
  });

  test("materializes every required canonical file without links or path escape", () => {
    expect(existsSync(recipeRoot)).toBe(true);
    for (const relativePath of requiredFiles) {
      const path = resolve(recipeRoot, relativePath);
      expect(isWithin(recipeRoot, path), relativePath).toBe(true);
      const stats = lstatSync(path);
      expect(stats.isFile(), relativePath).toBe(true);
      expect(stats.isSymbolicLink(), relativePath).toBe(false);
      expect(isWithin(realpathSync(recipeRoot), realpathSync(path)), relativePath).toBe(
        true,
      );
    }
  });

  test("declares the approved canonical recipe contract", () => {
    const manifest = parseJson(join(recipeRoot, "recipe.json"));
    expect(manifest).toEqual({
      schemaVersion: 2,
      id: "oak-washi",
      label: "Oak & Washi",
      summary:
        "A quiet, precise map-first travel workspace with warm surfaces, thin rules, and semantic route detail.",
      register: "product",
      presentation: {
        source: "presentation",
        entry: "index.ts",
        css: ["styles/index.css"],
        assets: [],
        copy: {
          schema: "copy/catalog-schema.json",
          references: {
            en: "copy/en.json",
            "zh-Hant": "copy/zh-Hant.json",
          },
          resolver: "copy/resolve-copy.ts",
          output: "copy/catalog.ts",
        },
      },
      map: {
        profile: "presentation/map/oak-washi-map-profile.ts",
        googleStyleGuide: "provider-guides/google-map-style.json",
      },
      motion: {
        durationMs: 220,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        interruptible: true,
        reducedMotion: "instant",
      },
      features: [],
      font: {
        policy: "local-open-license",
        assets: [...readFileSync(join(presentationRoot, "styles/fonts.css"), "utf8").matchAll(/url\("\.\.\/assets\/([^"/]+)"\)/g)].map((match) => `presentation/assets/${match[1]}`),
        license: "presentation/assets/OFL-Huninn.txt",
      },
      validation: {
        viewports: [320, 390, 430, 768, 1024, 1440],
        screenshots: [
          "home",
          "experience-default",
          "experience-collapsed-current",
          "experience-expanded-dense",
          "candidate-open",
          "candidate-zoom-200",
          "selection-truth",
          "route-state-matrix",
          "opening-hours-matrix",
          "camera-adversarial",
          "marker-backends",
          "map-error",
          "setup-states",
          "loading-owned",
          "runtime-degraded",
          "accessibility-media",
          "desktop-bounded",
        ],
      },
    });

    if (!isRecord(manifest) || !isRecord(manifest.presentation)) return;
    const copy = manifest.presentation.copy;
    expect(isRecord(copy)).toBe(true);
    if (!isRecord(copy) || !isRecord(copy.references)) return;
    expect(Object.keys(copy.references)).toEqual(["en", "zh-Hant"]);
    const inputs = [copy.schema, ...Object.values(copy.references), copy.resolver];
    expect(new Set(inputs).size).toBe(inputs.length);
    expect(inputs).not.toContain(copy.output);
    for (const relativePath of [...inputs, copy.output]) {
      expect(typeof relativePath).toBe("string");
      if (typeof relativePath !== "string") continue;
      expect(relativePath).not.toMatch(/(?:^|\/)\.\.(?:\/|$)|^(?:\/|[a-z]+:)/i);
      const path = resolve(presentationRoot, relativePath);
      expect(isWithin(presentationRoot, path), relativePath).toBe(true);
      expect(lstatSync(path).isSymbolicLink(), relativePath).toBe(false);
    }

    const googleGuide = parseJson(
      join(recipeRoot, "provider-guides/google-map-style.json"),
    );
    const googleGuideSource = JSON.stringify(googleGuide);
    for (const color of [
      "#eee8de",
      "#5e574f",
      "#f8f4ed",
      "#d9e2df",
      "#e3e6d8",
      "#faf7f1",
    ]) {
      expect(googleGuideSource).toContain(color);
    }
    expect(googleGuideSource).toContain('"featureType":"poi"');
    expect(googleGuideSource).toContain('"featureType":"transit.station"');
  });

  test("uses one CSS import graph and the exact approved semantic tokens", () => {
    const styleRoot = join(presentationRoot, "styles");
    const cssFiles = collectFiles(styleRoot).filter((path) => path.endsWith(".css"));
    const indexSource = readFileSync(join(styleRoot, "index.css"), "utf8");
    expect(indexSource.match(/@import\s+/g)).toHaveLength(9);
    expect(indexSource).toContain('@import "./fonts.css";');
    expect(indexSource).toContain('@import "./tokens.css";');
    expect(indexSource).toContain('@import "./layers.css";');
    expect(indexSource).toContain('@import "./layout.css";');
    expect(indexSource).toContain('@import "./components.css";');
    expect(indexSource).toContain('@import "./states.css";');
    expect(indexSource).toContain('@import "./editorial.css";');
    expect(indexSource).toContain('@import "./accessibility.css";');
    for (const path of cssFiles.filter((path) => !path.endsWith("index.css"))) {
      expect(readFileSync(path, "utf8"), relative(styleRoot, path)).not.toMatch(
        /@import\s+/,
      );
    }

    const tokens = readFileSync(join(styleRoot, "tokens.css"), "utf8");
    for (const [name, value] of Object.entries(expectedTokens)) {
      expect(tokens).toContain(`${name}: ${value};`);
    }
    expect(tokens).toContain("--oak-motion-expand: 220ms;");
    expect(tokens).toContain("--oak-motion-collapse: 160ms;");
    expect(tokens).toContain("--oak-motion-sheet: 220ms;");
    expect(tokens).toContain(
      "--oak-motion-easing: cubic-bezier(0.22, 1, 0.36, 1);",
    );
    expect(tokens).toContain(
      '--oak-font-ui: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    );
    expect(tokens).toContain('--oak-font-zh-hant: "Oak Huninn", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif;');
    expect(tokens).toContain('--oak-font-ja: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif;');
    expect(tokens).toContain("--oak-safe-area-top: env(safe-area-inset-top, 0px);");
    expect(tokens).toContain("--oak-safe-area-right: env(safe-area-inset-right, 0px);");
    expect(tokens).toContain("--oak-safe-area-bottom: env(safe-area-inset-bottom, 0px);");
    expect(tokens).toContain("--oak-safe-area-left: env(safe-area-inset-left, 0px);");

    const layers = readFileSync(join(styleRoot, "layers.css"), "utf8");
    expect(layers).toContain("--oak-layer-map-content: 0;");
    expect(layers).toContain("--oak-layer-routes: 10;");
    expect(layers).toContain("--oak-layer-markers: 20;");
    expect(layers).toContain("--oak-layer-attribution: 30;");
    expect(layers).toContain("--oak-layer-map-controls: 40;");
    expect(layers).toContain("--oak-layer-header: 50;");
    expect(layers).toContain("--oak-layer-sheet: 60;");
    expect(layers).toContain("--oak-layer-modal: 70;");

    const accessibility = readFileSync(
      join(styleRoot, "accessibility.css"),
      "utf8",
    );
    expect(accessibility).toContain("outline: 3px solid var(--oak-focus);");
    expect(accessibility).toContain("@media (prefers-reduced-motion: reduce)");
    expect(accessibility).toContain("@media (forced-colors: active)");

    const allSource = collectFiles(recipeRoot)
      .filter((path) => /\.(?:css|json|ts|tsx)$/.test(path))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    // The bundled illustration and owner-approved local font are intentional;
    // keep all external image and font requests forbidden.
    const allowedAssets = new Set([
      "oak-washi-cartography.webp",
      ...(parseJson(join(presentationRoot, "assets/HUNINN-SUBSETS.json")) as { subsets: { file: string }[] }).subsets.map((entry) => entry.file),
    ]);
    const usedAssets = new Set<string>();
    for (const url of allSource.match(/url\s*\([^)]*\)/gi) ?? []) {
      const asset = url.match(/^url\("\.\.\/assets\/([^"/]+)"(?:,\s*import\.meta\.url)?\)$/i)?.[1];
      expect(asset, url).toBeDefined();
      expect(allowedAssets.has(asset!), url).toBe(true);
      expect(lstatSync(join(presentationRoot, "assets", asset!)).isFile(), url).toBe(true);
      usedAssets.add(asset!);
    }
    expect(usedAssets).toEqual(allowedAssets);
    expect(allSource).not.toMatch(/(?:linear|radial|conic)-gradient\s*\(/i);
    expect(allSource).not.toMatch(/backdrop-filter\s*:/i);
    expect(allSource).not.toMatch(/emoji/i);
    // Generated coverage must retain every source glyph, including U+1F426.
    // The authored UI remains subject to the existing emoji/icon prohibition.
    const authoredSource = collectFiles(recipeRoot)
      .filter((path) => /\.(?:css|json|ts|tsx)$/.test(path) && !path.endsWith("fonts.css") && !/HUNINN-(?:PARTITIONS|SUBSETS)\.json$/.test(path))
      .map((path) => readFileSync(path, "utf8")).join("\n");
    expect(authoredSource).not.toMatch(/U\+1F[0-9A-F]{3}/i);
    expect(containsEmojiOrIcon("位置 📍")).toBe(true);
    expect(containsEmojiOrIcon("航班 ✈︎")).toBe(true);
    expect(containsEmojiOrIcon("第 1️⃣ 天")).toBe(true);
    expect(containsEmojiOrIcon("台灣 🇹🇼")).toBe(true);
    expect(containsEmojiOrIcon("第 1 天・台北 101")).toBe(false);
    expect(containsEmojiOrIcon("Oak & Washi © 2026")).toBe(true);
    expect(containsEmojiOrIcon(allSource)).toBe(false);
    expect(allSource).not.toMatch(
      /from\s+["'](?:react-icons|@heroicons|@fortawesome|@phosphor-icons|@tabler\/icons)/,
    );
    expect(allSource).not.toMatch(/--oak-(?:transport|transfer|lodging|dining|shopping|sightseeing|experience|logistics)-color\s*:/);
  });

  test("defines a closed complete bilingual catalog and deterministic materialization", async () => {
    const schema = parseJson(join(presentationRoot, "copy/catalog-schema.json"));
    const en = parseJson(join(presentationRoot, "copy/en.json"));
    const zhHant = parseJson(join(presentationRoot, "copy/zh-Hant.json"));
    const catalogSource = readFileSync(
      join(presentationRoot, "copy/catalog.ts"),
      "utf8",
    );
    const resolverSource = readFileSync(
      join(presentationRoot, "copy/resolve-copy.ts"),
      "utf8",
    );

    expect(copyPaths(en).sort()).toEqual([...expectedCopyPaths]);
    expect(copyPaths(zhHant).sort()).toEqual([...expectedCopyPaths]);
    const interfacePaths = interfaceCopyPaths(join(presentationRoot, "copy/schema.ts"));
    expect(copyPaths(en).sort()).toEqual(interfacePaths);
    expect(copyPaths(zhHant).sort()).toEqual(interfacePaths);
    expect(schemaCopyPaths(schema)).toEqual(interfacePaths);
    expectClosedSchema(schema, en);
    expectClosedSchema(schema, zhHant);
    expectRecursivelySorted(en, "en");
    expectRecursivelySorted(zhHant, "zh-Hant");
    expect(catalogSource).not.toMatch(
      /(?:en|zh-Hant)\.json|catalog-schema\.json|resolve-copy/,
    );
    expect(resolverSource).not.toMatch(/navigator(?:\.language|\.languages)?/);
    for (const path of collectFiles(presentationRoot).filter((entry) =>
      /\.(?:ts|tsx)$/.test(entry),
    )) {
      if (path.endsWith("copy/resolve-copy.ts")) continue;
      expect(readFileSync(path, "utf8"), relative(presentationRoot, path)).not.toMatch(
        /(?:en|zh-Hant)\.json|catalog-schema\.json|resolve-copy/,
      );
    }

    expect(en).toMatchObject({
      metadata: {
        productName: "Eternal Pose",
        setupDescription: "Add a valid trip to begin planning.",
        setupTitle: "Set up your trip",
      },
    });
    expect(zhHant).toMatchObject({
      metadata: {
        productName: "Eternal Pose",
        setupDescription: "加入有效的旅程資料即可開始規劃。",
        setupTitle: "設定你的旅程",
      },
    });

    const resolverModule = (await import(
      pathToFileURL(join(presentationRoot, "copy/resolve-copy.ts")).href
    )) as {
      resolveOakWashiCopy(locale: string): unknown;
    };
    const catalogModule = (await import(
      pathToFileURL(join(presentationRoot, "copy/catalog.ts")).href
    )) as { locale: string; catalog: unknown };
    const entryModule = (await import(
      pathToFileURL(join(presentationRoot, "index.ts")).href
    )) as Record<string, unknown>;

    expect(resolverModule.resolveOakWashiCopy("en")).toEqual(en);
    expect(resolverModule.resolveOakWashiCopy("en-US")).toEqual(en);
    expect(resolverModule.resolveOakWashiCopy("zh-Hant")).toEqual(zhHant);
    expect(resolverModule.resolveOakWashiCopy("zh-Hant-TW")).toEqual(zhHant);
    for (const unsupported of ["zh", "zh-Hans", "zh-CN", "ja", "fr-FR"]) {
      expect(() => resolverModule.resolveOakWashiCopy(unsupported)).toThrow(
        `Unsupported Oak & Washi locale: ${unsupported}`,
      );
    }

    expect(catalogModule.locale).toBe("zh-Hant-TW");
    expect(catalogModule.catalog).toEqual(
      resolverModule.resolveOakWashiCopy("zh-Hant-TW"),
    );
    const expectedCatalogSource = serializeCatalogModule(
      "zh-Hant-TW",
      resolverModule.resolveOakWashiCopy("zh-Hant-TW"),
    );
    const expectedEnglishSource = serializeCatalogModule(
      "en",
      resolverModule.resolveOakWashiCopy("en"),
    );
    expect(catalogSource).toBe(expectedCatalogSource);
    expect(expectedCatalogSource).not.toContain("\r");
    expect(expectedCatalogSource.endsWith("\n")).toBe(true);
    expect(expectedCatalogSource).toContain(
      'export const locale = "zh-Hant-TW";',
    );
    expect(expectedCatalogSource).toContain('\n  "accessibleNames": {\n');
    expect(catalogSource.replaceAll("\n", "\r\n")).not.toBe(
      expectedCatalogSource,
    );
    expect(catalogSource.replace('  "accessibleNames"', '    "accessibleNames"')).not.toBe(
      expectedCatalogSource,
    );
    expect(catalogSource.replace('"zh-Hant-TW"', "'zh-Hant-TW'")).not.toBe(
      expectedCatalogSource,
    );
    expect(expectedEnglishSource).toBe(
      [
        'import type { OakWashiCopy } from "./schema.js";',
        "",
        'export const locale = "en";',
        "",
        `export const catalog = ${readFileSync(join(presentationRoot, "copy/en.json"), "utf8").trimEnd()} satisfies OakWashiCopy;`,
        "",
      ].join("\n"),
    );
    expect(`${JSON.stringify(catalogModule.catalog, null, 2)}\n`).toBe(
      readFileSync(join(presentationRoot, "copy/zh-Hant.json"), "utf8"),
    );
    expect(`${JSON.stringify(resolverModule.resolveOakWashiCopy("en"), null, 2)}\n`).toBe(
      readFileSync(join(presentationRoot, "copy/en.json"), "utf8"),
    );
    expect(Object.keys(entryModule).sort()).toEqual([
      "OakWashiExperience",
      "OakWashiFatalError",
      "OakWashiHome",
      "OakWashiLoading",
      "OakWashiSetupRequired",
      "catalog",
      "createOakWashiMarkerContent",
      "createOakWashiUserLocationContent",
      "documentMetadataCopy",
      "locale",
      "oakWashiMapBindings",
      "oakWashiMapVisualProfile",
      "presentation",
    ]);
    expect(entryModule.catalog).toBe(catalogModule.catalog);
    expect(entryModule.locale).toBe(catalogModule.locale);
    expect(entryModule.documentMetadataCopy).toBe(
      (catalogModule.catalog as { metadata: unknown }).metadata,
    );
  });

  test("enables root TSX verification without changing package-builder isolation", async () => {
    const packageJson = parseJson(join(repoRoot, "package.json"));
    expect(packageJson).toMatchObject({
      devDependencies: {
        "@testing-library/jest-dom": "7.0.1",
        "@testing-library/react": "16.3.3",
        "@testing-library/user-event": "14.6.8",
        "@types/react": "19.3.0",
        "@types/react-dom": "19.3.0",
        jsdom: "30.0.1",
        "lucide-react": "1.61.0",
        motion: "14.6.0",
        react: "19.3.1",
        "react-dom": "19.3.1",
      },
    });

    const tsconfig = parseJson(join(repoRoot, "tsconfig.json"));
    expect(tsconfig).toMatchObject({
      compilerOptions: {
        jsx: "react-jsx",
        resolveJsonModule: true,
      },
    });
    if (!isRecord(tsconfig) || !Array.isArray(tsconfig.include)) return;
    expect(tsconfig.include).toEqual(
      expect.arrayContaining([
        "tests/**/*.ts",
        "tests/**/*.tsx",
        "plugins/eternal-pose/recipes-v2/**/*.ts",
        "plugins/eternal-pose/recipes-v2/**/*.tsx",
        "eslint.config.js",
        "vitest.config.ts",
      ]),
    );

    const eslintModule = (await import(
      `${pathToFileURL(join(repoRoot, "eslint.config.js")).href}?oak-washi`
    )) as { default: { files?: string[] }[] };
    const lintGlobs = eslintModule.default.flatMap((entry) => entry.files ?? []);
    expect(lintGlobs).toContain("tests/**/*.{ts,tsx}");
    expect(lintGlobs).toContain("plugins/eternal-pose/recipes-v2/**/*.{ts,tsx}");

    const vitestModule = (await import(
      `${pathToFileURL(join(repoRoot, "vitest.config.ts")).href}?oak-washi`
    )) as {
      default: {
        test: {
          projects: {
            test: {
              name: string;
              include: string[];
              exclude?: string[];
              fileParallelism?: boolean;
            };
          }[];
        };
      };
    };
    const projects = vitestModule.default.test.projects;
    expect(projects[0]?.test.include).toEqual(["tests/**/*.test.{ts,tsx}"]);
    expect(projects[0]?.test.exclude).toEqual([
      "tests/packages/artifacts.test.ts",
      "tests/packages/clean-consumer.test.ts",
      "tests/scripts/stage-starter-consumer-concurrency.test.ts",
      "tests/scripts/stage-starter-consumer.test.ts",
    ]);
    expect(projects[1]?.test).toMatchObject({
      name: "package-builders",
      fileParallelism: false,
    });
  });
});
