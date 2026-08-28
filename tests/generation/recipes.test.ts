import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

interface RecipeMetadata {
  id: string;
  label: string;
  register: "product";
  cssFile: "recipe.css";
  motion: {
    durationMs: number;
    easing: string;
    reducedMotionMs: 0;
  };
}

interface RecipeFixture {
  directory: string;
  metadata: RecipeMetadata;
  css: string;
  readme: string;
}

interface CssRule {
  selectors: string[];
  declarations: ReadonlyMap<string, string>;
  atRules: string[];
}

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const recipesRoot = join(repoRoot, "plugins/eternal-pose/recipes");
const starterRecipePath = join(
  repoRoot,
  "plugins/eternal-pose/starter/react/src/presentation/styles/recipe.css",
);
const baseCssPath = join(
  repoRoot,
  "plugins/eternal-pose/starter/react/src/presentation/styles/base.css",
);
const expectedRecipeIds = [
  "native-minimal",
  "quiet-wood",
  "sticker-brutalist",
] as const;

type ExpectedRecipeId = (typeof expectedRecipeIds)[number];

const expectedMetadataById: Record<ExpectedRecipeId, RecipeMetadata> = {
  "native-minimal": {
    id: "native-minimal",
    label: "Native Minimal",
    register: "product",
    cssFile: "recipe.css",
    motion: {
      durationMs: 180,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      reducedMotionMs: 0,
    },
  },
  "quiet-wood": {
    id: "quiet-wood",
    label: "Quiet Wood",
    register: "product",
    cssFile: "recipe.css",
    motion: {
      durationMs: 200,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      reducedMotionMs: 0,
    },
  },
  "sticker-brutalist": {
    id: "sticker-brutalist",
    label: "Sticker Brutalist",
    register: "product",
    cssFile: "recipe.css",
    motion: {
      durationMs: 180,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      reducedMotionMs: 0,
    },
  },
};

const runtimeGeometryTokens = new Set([
  "--header-clearance",
  "--map-padding-bottom",
  "--map-padding-top",
  "--safe-area-bottom",
  "--safe-area-top",
  "--sheet-ceiling",
]);

const runtimeLayoutProperties = new Set([
  "align-content",
  "align-items",
  "align-self",
  "block-size",
  "bottom",
  "clip",
  "clip-path",
  "display",
  "flex",
  "flex-basis",
  "flex-direction",
  "flex-flow",
  "flex-grow",
  "flex-shrink",
  "gap",
  "grid",
  "grid-area",
  "grid-template",
  "grid-template-areas",
  "grid-template-columns",
  "grid-template-rows",
  "height",
  "inline-size",
  "inset",
  "inset-block",
  "inset-block-end",
  "inset-block-start",
  "inset-inline",
  "inset-inline-end",
  "inset-inline-start",
  "isolation",
  "justify-content",
  "justify-items",
  "justify-self",
  "left",
  "margin",
  "margin-block",
  "margin-block-end",
  "margin-block-start",
  "margin-bottom",
  "margin-inline",
  "margin-inline-end",
  "margin-inline-start",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-block-size",
  "max-height",
  "max-inline-size",
  "max-width",
  "min-block-size",
  "min-height",
  "min-inline-size",
  "min-width",
  "object-fit",
  "overflow",
  "overflow-x",
  "overflow-y",
  "overscroll-behavior",
  "overscroll-behavior-block",
  "overscroll-behavior-inline",
  "padding",
  "padding-block",
  "padding-block-end",
  "padding-block-start",
  "padding-bottom",
  "padding-inline",
  "padding-inline-end",
  "padding-inline-start",
  "padding-left",
  "padding-right",
  "padding-top",
  "place-content",
  "place-items",
  "pointer-events",
  "position",
  "right",
  "top",
  "touch-action",
  "visibility",
  "width",
  "will-change",
  "z-index",
]);

const runtimeOwnedSelectors = [
  ".trip-experience",
  ".day-header",
  ".map-controls",
  ".itinerary-sheet",
  ".safe-area-probe",
  ".task-widget__dialog",
  ".reservation-panel__dialog",
  ".itinerary-map",
] as const;

const dimensionProperties = new Set([
  "block-size",
  "height",
  "inline-size",
  "max-block-size",
  "max-height",
  "max-inline-size",
  "max-width",
  "min-block-size",
  "min-height",
  "min-inline-size",
  "min-width",
  "width",
]);

const sheetDescendantPropertyMatrix = new Map<string, ReadonlySet<string>>([
  [
    "itinerary-sheet__drag-handle",
    new Set([
      ...dimensionProperties,
      "flex",
      "flex-basis",
      "flex-grow",
      "flex-shrink",
      "pointer-events",
      "touch-action",
    ]),
  ],
  [
    "itinerary-sheet__toolbar",
    new Set([
      ...dimensionProperties,
      "display",
      "flex",
      "flex-basis",
      "flex-grow",
      "flex-shrink",
      "grid",
      "grid-template",
      "grid-template-areas",
      "grid-template-columns",
      "grid-template-rows",
      "overflow",
      "overflow-x",
      "overflow-y",
    ]),
  ],
  [
    "itinerary-sheet__heading",
    new Set([
      ...dimensionProperties,
      "display",
      "overflow",
      "overflow-x",
      "overflow-y",
    ]),
  ],
  [
    "itinerary-sheet__scroll",
    new Set([
      ...dimensionProperties,
      "display",
      "flex",
      "flex-basis",
      "flex-grow",
      "flex-shrink",
      "overflow",
      "overflow-x",
      "overflow-y",
      "overscroll-behavior",
      "overscroll-behavior-block",
      "overscroll-behavior-inline",
      "touch-action",
    ]),
  ],
]);

const knownTouchTargetClassNames = [
  "candidate-decision__option",
  "candidate-decision__trigger",
  "day-header__date",
  "icon-control",
  "itinerary-row",
  "itinerary-sheet__drag-handle",
  "reservation-panel__reveal",
  "route-connector",
  "shopping-status-select__control",
  "trip-home__day-action",
] as const;

const requiredRecipeTokens = [
  "--color-canvas",
  "--color-focus",
  "--color-selected",
  "--color-selected-text",
  "--sheet-motion-duration",
  "--component-motion-duration",
  "--motion-easing",
] as const;

const semanticSurfaceTokens = [
  "--color-transport-surface",
  "--color-transfer-surface",
  "--color-lodging-surface",
  "--color-dining-surface",
  "--color-shopping-surface",
  "--color-sightseeing-surface",
  "--color-experience-surface",
  "--color-logistics-surface",
  "--color-custom-surface",
  "--color-route-surface",
] as const;

const requiredComponentSelectors = [
  ".trip-experience",
  ".trip-home",
  ".trip-home__day-action",
  ".day-header",
  ".day-header__date",
  ".map-controls",
  ".map-degraded-state",
  ".map-marker",
  ".itinerary-sheet",
  ".itinerary-sheet__drag-handle",
  ".itinerary-row",
  ".timeline-entry__details",
  ".semantic-entry__body",
  ".route-connector",
  ".route-status",
  ".candidate-decision",
  ".candidate-decision__option",
  ".shopping-decision-panel",
  ".shopping-status-select__control",
  ".task-widget__dialog",
  ".reservation-panel__dialog",
  ".trip-progress-persistence",
  ".icon-control",
] as const;

function recipeDirectories(): string[] {
  if (!existsSync(recipesRoot)) {
    return [];
  }
  return readdirSync(recipesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function loadRecipes(): RecipeFixture[] {
  return recipeDirectories().flatMap((directory) => {
    const root = join(recipesRoot, directory);
    const metadataPath = join(root, "recipe.json");
    const cssPath = join(root, "recipe.css");
    const readmePath = join(root, "README.md");
    if (
      !existsSync(metadataPath) ||
      !existsSync(cssPath) ||
      !existsSync(readmePath)
    ) {
      return [];
    }
    return [{
      directory,
      metadata: JSON.parse(readFileSync(metadataPath, "utf8")) as RecipeMetadata,
      css: readFileSync(cssPath, "utf8"),
      readme: readFileSync(readmePath, "utf8"),
    }];
  });
}

function splitCssList(value: string, delimiter: string): string[] {
  const items: string[] = [];
  let start = 0;
  let parentheses = 0;
  let brackets = 0;
  let quote: "\"" | "'" | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote !== null) {
      if (character === "\\") {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
    } else if (character === "(") {
      parentheses += 1;
    } else if (character === ")") {
      parentheses -= 1;
    } else if (character === "[") {
      brackets += 1;
    } else if (character === "]") {
      brackets -= 1;
    } else if (character === delimiter && parentheses === 0 && brackets === 0) {
      items.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  items.push(value.slice(start).trim());
  return items.filter((item) => item.length > 0);
}

function findCssBlockEnd(css: string, openingBrace: number): number {
  let depth = 1;
  let quote: "\"" | "'" | null = null;
  let inComment = false;
  for (let index = openingBrace + 1; index < css.length; index += 1) {
    const character = css[index];
    const next = css[index + 1];
    if (inComment) {
      if (character === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (character === "\\") {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "/" && next === "*") {
      inComment = true;
      index += 1;
    } else if (character === "\"" || character === "'") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throw new Error(`CSS block beginning at ${openingBrace} is not closed`);
}

function parseCssDeclarations(body: string): ReadonlyMap<string, string> {
  const declarations = new Map<string, string>();
  for (const item of splitCssList(body, ";")) {
    let parentheses = 0;
    let quote: "\"" | "'" | null = null;
    let colon = -1;
    for (let index = 0; index < item.length; index += 1) {
      const character = item[index];
      if (quote !== null) {
        if (character === "\\") {
          index += 1;
        } else if (character === quote) {
          quote = null;
        }
      } else if (character === "\"" || character === "'") {
        quote = character;
      } else if (character === "(") {
        parentheses += 1;
      } else if (character === ")") {
        parentheses -= 1;
      } else if (character === ":" && parentheses === 0) {
        colon = index;
        break;
      }
    }
    if (colon < 1) {
      continue;
    }
    const property = item.slice(0, colon).trim().toLowerCase();
    const value = item.slice(colon + 1).trim().replace(/\s*!important\s*$/i, "");
    if (/^(?:--[a-z0-9-]+|[a-z-]+)$/i.test(property) && value.length > 0) {
      declarations.set(property, value);
    }
  }
  return declarations;
}

function parseCssRules(css: string): CssRule[] {
  const rules: CssRule[] = [];

  function visit(source: string, atRules: string[]): void {
    let cursor = 0;
    while (cursor < source.length) {
      while (/\s|;/.test(source[cursor] ?? "")) {
        cursor += 1;
      }
      if (source.startsWith("/*", cursor)) {
        const commentEnd = source.indexOf("*/", cursor + 2);
        if (commentEnd === -1) {
          throw new Error("CSS contains an unterminated comment");
        }
        cursor = commentEnd + 2;
        continue;
      }
      if (cursor >= source.length) {
        break;
      }

      let openingBrace = -1;
      let quote: "\"" | "'" | null = null;
      let inComment = false;
      for (let index = cursor; index < source.length; index += 1) {
        const character = source[index];
        const next = source[index + 1];
        if (inComment) {
          if (character === "*" && next === "/") {
            inComment = false;
            index += 1;
          }
        } else if (quote !== null) {
          if (character === "\\") {
            index += 1;
          } else if (character === quote) {
            quote = null;
          }
        } else if (character === "/" && next === "*") {
          inComment = true;
          index += 1;
        } else if (character === "\"" || character === "'") {
          quote = character;
        } else if (character === "{") {
          openingBrace = index;
          break;
        }
      }
      if (openingBrace === -1) {
        break;
      }

      const header = source.slice(cursor, openingBrace).trim();
      const closingBrace = findCssBlockEnd(source, openingBrace);
      const body = source.slice(openingBrace + 1, closingBrace);
      if (header.startsWith("@")) {
        visit(body, [...atRules, header.replace(/\s+/g, " ").trim()]);
      } else {
        rules.push({
          selectors: splitCssList(header, ","),
          declarations: parseCssDeclarations(body),
          atRules,
        });
      }
      cursor = closingBrace + 1;
    }
  }

  visit(css, []);
  return rules;
}

function selectorHasClass(selector: string, className: string): boolean {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\.${escaped}(?![a-z0-9_-])`, "i").test(selector);
}

function normalizedAtRule(atRule: string): string {
  return atRule.replace(/\s+/g, " ").trim().toLowerCase();
}

function isInsideFeatureMedia(
  rule: CssRule,
  feature: "forced-colors" | "prefers-reduced-motion",
  value: "active" | "reduce",
): boolean {
  const pattern = new RegExp(`\\(${feature}\\s*:\\s*${value}\\)`, "i");
  return rule.atRules.some((atRule) =>
    normalizedAtRule(atRule).startsWith("@media ") && pattern.test(atRule),
  );
}

function tokenValues(rules: readonly CssRule[], name: string): string[] {
  return rules
    .filter((rule) =>
      rule.selectors.includes(":root") &&
      !isInsideFeatureMedia(rule, "forced-colors", "active"),
    )
    .map((rule) => rule.declarations.get(name))
    .filter((value): value is string => value !== undefined);
}

function forcedSelectedDateContractViolations(css: string): string[] {
  const expectedDeclarations = new Map([
    ["border-color", "Highlight"],
    ["color", "HighlightText"],
    ["background", "Highlight"],
  ]);
  const selectedDatePattern =
    /\.day-header__date\s*\[\s*aria-pressed\s*=\s*(?:"true"|'true'|true)\s*\]/i;
  const selectedRules = parseCssRules(css).filter((rule) =>
    isInsideFeatureMedia(rule, "forced-colors", "active") &&
    rule.selectors.some((selector) => selectedDatePattern.test(selector)),
  );
  const violations: string[] = [];
  for (const [property, expected] of expectedDeclarations) {
    const values = selectedRules
      .map((rule) => rule.declarations.get(property))
      .filter((value): value is string => value !== undefined);
    if (values.length === 0) {
      violations.push(`forced-color selected date is missing ${property}`);
    }
    for (const value of values) {
      if (value !== expected) {
        violations.push(`forced-color selected date ${property} must be ${expected}, received ${value}`);
      }
    }
  }
  return violations;
}

function layoutContractViolations(css: string): string[] {
  const violations: string[] = [];
  for (const rule of parseCssRules(css)) {
    for (const selector of rule.selectors) {
      for (const protectedSelector of runtimeOwnedSelectors) {
        if (!selectorHasClass(selector, protectedSelector.slice(1))) {
          continue;
        }
        for (const property of rule.declarations.keys()) {
          if (runtimeLayoutProperties.has(property)) {
            violations.push(`${selector} must not set runtime-owned ${property}`);
          }
        }
      }
      for (const [className, protectedProperties] of sheetDescendantPropertyMatrix) {
        if (!selectorHasClass(selector, className)) {
          continue;
        }
        for (const property of rule.declarations.keys()) {
          if (protectedProperties.has(property)) {
            violations.push(`${selector} must not set behavior-critical ${property}`);
          }
        }
      }
    }
  }
  return violations;
}

function runtimeGeometryTokenContractViolations(css: string): string[] {
  const violations: string[] = [];
  for (const rule of parseCssRules(css)) {
    for (const property of rule.declarations.keys()) {
      if (runtimeGeometryTokens.has(property)) {
        violations.push(property);
      }
    }
  }
  return violations;
}

function selectorMayTarget44pxControl(selector: string): boolean {
  return (
    /\[\s*data-touch-target\s*=\s*(?:"44"|'44'|44)\s*\]/i.test(selector) ||
    knownTouchTargetClassNames.some((className) => selectorHasClass(selector, className)) ||
    /(?:^|[\s>+~,:()])(?:button|a|input|label|select|\*)(?=$|[\s>+~.#:[(])/i.test(selector)
  );
}

function pixelLength(value: string): number | undefined {
  const match = value.match(/^(-?(?:\d+\.)?\d+)(px|r?em)?$/i);
  if (match === null) {
    return undefined;
  }
  const amount = Number.parseFloat(match[1] ?? "");
  const unit = match[2]?.toLowerCase();
  if (unit === undefined && amount !== 0) {
    return undefined;
  }
  return unit === "rem" || unit === "em" ? amount * 16 : amount;
}

const touchTargetSizeProperties = [
  { property: "width", axis: "inline", constraint: "size" },
  { property: "inline-size", axis: "inline", constraint: "size" },
  { property: "min-width", axis: "inline", constraint: "minimum" },
  { property: "min-inline-size", axis: "inline", constraint: "minimum" },
  { property: "max-width", axis: "inline", constraint: "maximum" },
  { property: "max-inline-size", axis: "inline", constraint: "maximum" },
  { property: "height", axis: "block", constraint: "size" },
  { property: "block-size", axis: "block", constraint: "size" },
  { property: "min-height", axis: "block", constraint: "minimum" },
  { property: "min-block-size", axis: "block", constraint: "minimum" },
  { property: "max-height", axis: "block", constraint: "maximum" },
  { property: "max-block-size", axis: "block", constraint: "maximum" },
] as const;

function touchTargetContractViolations(css: string): string[] {
  const violations: string[] = [];
  const protectedMinimumAxes = new Set<"inline" | "block">();
  for (const rule of parseCssRules(css)) {
    for (const selector of rule.selectors) {
      if (!selectorMayTarget44pxControl(selector)) {
        continue;
      }
      for (const { property, axis, constraint } of touchTargetSizeProperties) {
        const value = rule.declarations.get(property);
        if (value === undefined) {
          continue;
        }
        const pixels = pixelLength(value);
        if (constraint === "minimum" && pixels !== undefined && pixels >= 44) {
          protectedMinimumAxes.add(axis);
        }
        if (
          (constraint === "minimum" && (pixels === undefined || pixels < 44)) ||
          (constraint !== "minimum" && pixels !== undefined && pixels < 44)
        ) {
          violations.push(`${selector} cannot constrain ${property} to ${value}`);
        }
      }
    }
  }
  if (!protectedMinimumAxes.has("inline")) {
    violations.push("missing a 44px minimum touch-target inline axis");
  }
  if (!protectedMinimumAxes.has("block")) {
    violations.push("missing a 44px minimum touch-target block axis");
  }
  return violations;
}

function contrastContractViolations(css: string): string[] {
  const rules = parseCssRules(css);
  const violations: string[] = [];
  for (const focus of tokenValues(rules, "--color-focus")) {
    for (const adjacentToken of [
      "--color-canvas",
      "--color-surface",
      "--color-surface-subtle",
    ]) {
      for (const adjacent of tokenValues(rules, adjacentToken)) {
        if (contrastRatio(focus, adjacent) < 3) {
          violations.push(`focus ${focus} lacks 3:1 contrast against ${adjacentToken} ${adjacent}`);
        }
      }
    }
  }
  for (const foreground of tokenValues(rules, "--color-selected-text")) {
    for (const background of tokenValues(rules, "--color-marker-selected")) {
      if (contrastRatio(foreground, background) < 4.5) {
        violations.push(`selected marker ${foreground} on ${background} lacks 4.5:1 contrast`);
      }
    }
  }
  return violations;
}

function declaredTokens(css: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const match of css.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gim)) {
    const token = match[1];
    const value = match[2];
    if (token !== undefined && value !== undefined && !declarations.has(token)) {
      declarations.set(token, value.trim());
    }
  }
  return declarations;
}

function consumedTokens(css: string): Set<string> {
  return new Set(
    [...css.matchAll(/var\((--[a-z0-9-]+)/gi)]
      .map((match) => match[1])
      .filter((token): token is string => token !== undefined),
  );
}

function expectSyntacticallyCompleteCss(css: string): void {
  let depth = 0;
  let quote: "\"" | "'" | null = null;
  let inComment = false;
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    const next = css[index + 1];
    if (inComment) {
      if (character === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (character === "\\") {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "/" && next === "*") {
      inComment = true;
      index += 1;
    } else if (character === "\"" || character === "'") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      expect(depth, "CSS contains an unmatched closing brace").toBeGreaterThanOrEqual(0);
    }
  }
  expect(inComment, "CSS contains an unterminated comment").toBe(false);
  expect(quote, "CSS contains an unterminated string").toBeNull();
  expect(depth, "CSS contains an unclosed block").toBe(0);
  expect(css).not.toMatch(/@import\s|url\(\s*["']?https?:/i);
}

function hexToRgb(value: string): [number, number, number] {
  const match = value.match(/^#([0-9a-f]{6})$/i);
  const hex = match?.[1];
  if (hex === undefined) {
    throw new Error(`Expected a six-digit hex color, received ${value}`);
  }
  return [0, 2, 4].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  ) as [number, number, number];
}

function relativeLuminance(color: string): number {
  const channels = hexToRgb(color).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * (channels[0] ?? 0) +
    0.7152 * (channels[1] ?? 0) +
    0.0722 * (channels[2] ?? 0)
  );
}

function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function token(tokens: ReadonlyMap<string, string>, name: string): string {
  const value = tokens.get(name);
  if (value === undefined) {
    throw new Error(`Missing color token ${name}`);
  }
  return value;
}

describe("compile-time design recipe catalog", () => {
  test("contains exactly the three approved complete recipe directories", () => {
    expect(existsSync(recipesRoot)).toBe(true);
    expect(recipeDirectories()).toEqual(expectedRecipeIds);
    for (const id of expectedRecipeIds) {
      for (const file of ["recipe.json", "recipe.css", "README.md"]) {
        expect(existsSync(join(recipesRoot, id, file)), `${id}/${file}`).toBe(true);
      }
    }
  });

  test("publishes exact per-recipe metadata without undeclared motion keys", () => {
    const recipes = loadRecipes();
    expect(recipes).toHaveLength(3);
    for (const recipe of recipes) {
      const id = recipe.directory as ExpectedRecipeId;
      expect(recipe.metadata).toEqual(expectedMetadataById[id]);
    }
  });

  test("keeps metadata motion synchronized with normal and reduced CSS contracts", () => {
    const recipes = loadRecipes();
    expect(recipes).toHaveLength(3);
    for (const recipe of recipes) {
      const rules = parseCssRules(recipe.css);
      const normalRootRules = rules.filter((rule) =>
        rule.selectors.includes(":root") &&
        !isInsideFeatureMedia(rule, "prefers-reduced-motion", "reduce") &&
        !isInsideFeatureMedia(rule, "forced-colors", "active"),
      );
      const reducedRootRules = rules.filter((rule) =>
        rule.selectors.includes(":root") &&
        isInsideFeatureMedia(rule, "prefers-reduced-motion", "reduce"),
      );
      for (const [property, expected] of [
        ["--sheet-motion-duration", `${recipe.metadata.motion.durationMs}ms`],
        ["--shell-motion-duration", "var(--sheet-motion-duration)"],
        ["--motion-easing", recipe.metadata.motion.easing],
      ] as const) {
        const values = normalRootRules
          .map((rule) => rule.declarations.get(property))
          .filter((value): value is string => value !== undefined);
        expect(values.length, `${recipe.directory} normal ${property}`).toBeGreaterThan(0);
        expect(values, `${recipe.directory} normal ${property}`).toEqual(
          values.map(() => expected),
        );
      }
      for (const property of [
        "--sheet-motion-duration",
        "--shell-motion-duration",
        "--component-motion-duration",
      ] as const) {
        const values = reducedRootRules
          .map((rule) => rule.declarations.get(property))
          .filter((value): value is string => value !== undefined);
        const expected = `${recipe.metadata.motion.reducedMotionMs}ms`;
        expect(values.length, `${recipe.directory} reduced ${property}`).toBeGreaterThan(0);
        expect(values, `${recipe.directory} reduced ${property}`).toEqual(
          values.map(() => expected),
        );
      }
    }
  });

  test("uses one complete token and component-selector contract", () => {
    const baseCss = readFileSync(baseCssPath, "utf8");
    const baseTokens = [...consumedTokens(baseCss)]
      .filter((name) => !runtimeGeometryTokens.has(name))
      .sort();
    const recipes = loadRecipes();
    expect(recipes).toHaveLength(3);

    const tokenSets = recipes.map(({ css }) => [...declaredTokens(css).keys()].sort());
    expect(tokenSets[1]).toEqual(tokenSets[0]);
    expect(tokenSets[2]).toEqual(tokenSets[0]);

    for (const recipe of recipes) {
      const tokens = declaredTokens(recipe.css);
      for (const name of [...baseTokens, ...requiredRecipeTokens, ...semanticSurfaceTokens]) {
        expect(tokens.has(name), `${recipe.directory} must declare ${name}`).toBe(true);
      }
      expect(
        runtimeGeometryTokenContractViolations(recipe.css),
        `${recipe.directory} must not own runtime geometry tokens`,
      ).toEqual([]);
      for (const selector of requiredComponentSelectors) {
        expect(recipe.css, `${recipe.directory} must style ${selector}`).toContain(selector);
      }
      for (const kind of [
        "transport",
        "transfer",
        "lodging",
        "dining",
        "shopping",
        "sightseeing",
        "experience",
        "logistics",
        "custom",
      ]) {
        expect(recipe.css).toContain(`[data-kind="${kind}"]`);
      }
      expect(
        touchTargetContractViolations(recipe.css),
        `${recipe.directory} touch-target contract`,
      ).toEqual([]);
    }
  });

  test("keeps every small-text pairing at WCAG AA contrast", () => {
    const recipes = loadRecipes();
    expect(recipes).toHaveLength(3);
    for (const recipe of recipes) {
      const tokens = declaredTokens(recipe.css);
      const pairs = [
        ["--color-text", "--color-canvas"],
        ["--color-text-muted", "--color-canvas"],
        ["--color-text", "--color-surface"],
        ["--color-text-muted", "--color-surface"],
        ["--color-text", "--color-surface-subtle"],
        ["--color-text-muted", "--color-surface-subtle"],
        ["--color-accent-strong", "--color-accent-soft"],
        ["--color-selected-text", "--color-selected"],
        ["--color-selected-text", "--color-marker-selected"],
        ["--color-marker-text", "--color-marker"],
        ...semanticSurfaceTokens.map((surface) => ["--color-text", surface]),
      ] as const;
      for (const [foreground, background] of pairs) {
        expect(
          contrastRatio(token(tokens, foreground), token(tokens, background)),
          `${recipe.directory}: ${foreground} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrastContractViolations(recipe.css),
        `${recipe.directory} selected-marker and focus-indicator contrast`,
      ).toEqual([]);
    }
  });

  test("keeps forced-color selection and compile-time isolation explicit", () => {
    const recipes = loadRecipes();
    expect(recipes).toHaveLength(3);
    for (const recipe of recipes) {
      expectSyntacticallyCompleteCss(recipe.css);
      expect(recipe.css).toContain("@media (prefers-reduced-motion: reduce)");
      expect(recipe.css).toContain("@media (forced-colors: active)");
      expect(recipe.css).not.toMatch(/forced-color-adjust\s*:\s*none/i);
      expect(recipe.css).not.toMatch(/\[data-(?:theme|recipe)|prefers-color-scheme/i);
      expect(
        forcedSelectedDateContractViolations(recipe.css),
        `${recipe.directory} forced-color selected-date contract`,
      ).toEqual([]);
      expect(
        layoutContractViolations(recipe.css),
        `${recipe.directory} runtime geometry ownership`,
      ).toEqual([]);
    }
  });

  test("contract helpers reject contrast, geometry, dialog, and touch-target regressions", () => {
    const quietWood = loadRecipes().find(({ directory }) => directory === "quiet-wood");
    expect(quietWood).toBeDefined();
    const css = quietWood?.css ?? "";

    expect(
      contrastContractViolations(
        `${css}\n@media (max-width: 430px) { :root { --color-focus: #ffffff; } }`,
      ),
    ).toEqual(expect.arrayContaining([expect.stringContaining("focus #ffffff")]));
    expect(
      contrastContractViolations(
        `${css}\n@media (max-width: 430px) { :root { --color-marker-selected: #ffffff; } }`,
      ),
    ).toEqual(expect.arrayContaining([expect.stringContaining("selected marker")]));

    for (const mutation of [
      ".day-header { top: 0; }",
      ".map-controls { position: static; }",
      ".itinerary-sheet { right: 5rem; }",
      ".task-widget__dialog, .reservation-panel__dialog { inset: 0; }",
    ]) {
      expect(layoutContractViolations(`${css}\n${mutation}`), mutation).not.toEqual([]);
    }

    expect(
      touchTargetContractViolations(
        `${css}\n.unrelated, [data-touch-target="44"] { max-width: 40px; max-height: 40px; }`,
      ),
    ).toEqual(expect.arrayContaining([
      expect.stringContaining("max-width"),
      expect.stringContaining("max-height"),
    ]));
    expect(
      forcedSelectedDateContractViolations(
        `${css}\n@media (forced-colors: active) {
          .unrelated, .day-header__date[aria-pressed="true"] {
            border-color: transparent;
            color: CanvasText;
            background: Canvas;
          }
        }`,
      ),
    ).toEqual(expect.arrayContaining([
      expect.stringContaining("border-color"),
      expect.stringContaining("color"),
      expect.stringContaining("background"),
    ]));
  });

  test("rejects behavior-critical sheet and class-only touch-target mutations", () => {
    const quietWood = loadRecipes().find(({ directory }) => directory === "quiet-wood");
    expect(quietWood).toBeDefined();
    const css = quietWood?.css ?? "";

    expect.soft(
      layoutContractViolations(
        `${css}\n.itinerary-sheet__drag-handle {
          min-height: 20px;
          height: 20px;
          touch-action: auto;
        }`,
      ),
      "drag handle size and gesture ownership",
    ).not.toEqual([]);
    expect.soft(
      layoutContractViolations(
        `${css}\n.itinerary-sheet__scroll { overflow: hidden; }`,
      ),
      "sheet scroll ownership",
    ).not.toEqual([]);
    expect.soft(
      touchTargetContractViolations(
        `${css}\n.candidate-decision__trigger {
          min-width: 20px;
          min-height: 20px;
        }`,
      ),
      "class-only candidate trigger minimum",
    ).not.toEqual([]);

    expect(
      touchTargetContractViolations(
        `${css}\n.candidate-decision__trigger {
          width: 100%;
          min-width: 44px;
          min-height: 44px;
        }`,
      ),
      "a full-width candidate trigger with intact minimums is harmless presentation",
    ).toEqual([]);
  });

  test("rejects grouped later-media logical-size touch-target mutations", () => {
    const quietWood = loadRecipes().find(({ directory }) => directory === "quiet-wood");
    expect(quietWood).toBeDefined();
    const css = quietWood?.css ?? "";

    expect(
      touchTargetContractViolations(
        `${css}\n@media (max-width: 430px) {
          .unrelated, .candidate-decision__trigger {
            min-inline-size: 20px;
            min-block-size: 20px;
          }
        }`,
      ),
      "logical-size constraints cannot bypass either 44px axis",
    ).not.toEqual([]);

    expect(
      touchTargetContractViolations(`
        [data-touch-target="44"] {
          inline-size: 100%;
          min-inline-size: 44px;
          min-block-size: 44px;
        }
      `),
      "logical minima may satisfy both touch-target axes",
    ).toEqual([]);
  });

  test("rejects every runtime-owned geometry token mutation", () => {
    const quietWood = loadRecipes().find(({ directory }) => directory === "quiet-wood");
    expect(quietWood).toBeDefined();
    const css = quietWood?.css ?? "";

    for (const name of [
      "--sheet-ceiling",
      "--map-padding-top",
      "--map-padding-bottom",
    ]) {
      expect.soft(
        runtimeGeometryTokenContractViolations(`${css}\n:root { ${name}: 1px; }`),
        `${name} must be rejected as runtime-owned geometry`,
      ).toContain(name);
    }
  });

  test("rejects design slop, protected assets, and unsafe CSS payloads", () => {
    const recipes = loadRecipes();
    expect(recipes).toHaveLength(3);
    for (const recipe of recipes) {
      expect(recipe.css).not.toMatch(
        /linear-gradient|radial-gradient|conic-gradient|background-clip\s*:\s*text|backdrop-filter|data:image\/|ONE PIECE|Laboon/i,
      );
      expect(recipe.css).not.toMatch(/border-(?:left|right)\s*:\s*(?:[2-9]|[1-9][0-9])px/i);
      expect(recipe.readme).not.toMatch(/ONE PIECE|Laboon/i);
    }
  });

  test("documents direct use and safe AI replacement at all mobile widths", () => {
    const recipes = loadRecipes();
    expect(recipes).toHaveLength(3);
    for (const recipe of recipes) {
      for (const heading of [
        "Register",
        "Token contract",
        "Component rules",
        "Map, markers, and routes",
        "Motion",
        "Responsive behavior",
        "Accessibility",
        "Anti-patterns",
        "AI customization boundary",
      ]) {
        expect(recipe.readme, `${recipe.directory} README: ${heading}`).toContain(heading);
      }
      for (const width of ["320", "390", "430"]) {
        expect(recipe.readme).toContain(width);
      }
      expect(recipe.readme).toMatch(/replace|mix|rewrite/i);
      expect(recipe.readme).toMatch(/map\/list|map-list/i);
      expect(recipe.readme).toContain("44px");
    }
  });

  test("keeps Quiet Wood byte-identical to the starter default", () => {
    const quietWoodPath = join(recipesRoot, "quiet-wood", "recipe.css");
    expect(existsSync(quietWoodPath)).toBe(true);
    expect(readFileSync(starterRecipePath, "utf8")).toBe(
      existsSync(quietWoodPath) ? readFileSync(quietWoodPath, "utf8") : "",
    );
    expect(basename(starterRecipePath)).toBe("recipe.css");
  });
});
