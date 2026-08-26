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

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const recipesRoot = join(repoRoot, "plugins/eternal-pose/recipes");
const starterRecipePath = join(
  repoRoot,
  "plugins/eternal-pose/starter/react/src/ui/styles/recipe.css",
);
const baseCssPath = join(
  repoRoot,
  "plugins/eternal-pose/starter/react/src/ui/styles/base.css",
);
const expectedRecipeIds = [
  "native-minimal",
  "quiet-wood",
  "sticker-brutalist",
] as const;

const runtimeGeometryTokens = new Set([
  "--header-clearance",
  "--safe-area-bottom",
  "--safe-area-top",
]);

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

  test("publishes stable metadata with purposeful 180–220ms motion", () => {
    const recipes = loadRecipes();
    expect(recipes).toHaveLength(3);
    for (const recipe of recipes) {
      expect(Object.keys(recipe.metadata).sort()).toEqual([
        "cssFile",
        "id",
        "label",
        "motion",
        "register",
      ]);
      expect(recipe.metadata).toMatchObject({
        id: recipe.directory,
        register: "product",
        cssFile: "recipe.css",
        motion: {
          reducedMotionMs: 0,
        },
      });
      expect(recipe.metadata.label.trim().length).toBeGreaterThan(0);
      expect(recipe.metadata.motion.durationMs).toBeGreaterThanOrEqual(180);
      expect(recipe.metadata.motion.durationMs).toBeLessThanOrEqual(220);
      expect(recipe.metadata.motion.easing).toMatch(/^cubic-bezier\(/);
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
      for (const name of runtimeGeometryTokens) {
        expect(tokens.has(name), `${recipe.directory} must not own runtime geometry ${name}`).toBe(false);
      }
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
      expect(recipe.css).toMatch(/\[data-touch-target="44"\][^{]*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
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
        ["--color-marker-text", "--color-marker"],
        ...semanticSurfaceTokens.map((surface) => ["--color-text", surface]),
      ] as const;
      for (const [foreground, background] of pairs) {
        expect(
          contrastRatio(token(tokens, foreground), token(tokens, background)),
          `${recipe.directory}: ${foreground} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("keeps motion, forced colors, geometry, and compile-time isolation explicit", () => {
    const recipes = loadRecipes();
    expect(recipes).toHaveLength(3);
    for (const recipe of recipes) {
      expectSyntacticallyCompleteCss(recipe.css);
      expect(recipe.css).toContain("@media (prefers-reduced-motion: reduce)");
      expect(recipe.css).toContain("@media (forced-colors: active)");
      expect(recipe.css).toMatch(/--sheet-motion-duration:\s*0ms;/);
      expect(recipe.css).toMatch(/--component-motion-duration:\s*0ms;/);
      expect(recipe.css).not.toMatch(/forced-color-adjust\s*:\s*none/i);
      expect(recipe.css).not.toMatch(/\[data-(?:theme|recipe)|prefers-color-scheme/i);
      expect(recipe.css).not.toMatch(/\.itinerary-sheet\s*\{[^}]*(?:\bheight|\bbottom|\bmax-height|\bmin-height)\s*:/s);
      expect(recipe.css).not.toMatch(/\.trip-experience\s*\{[^}]*(?:\binset|\bposition|\bheight|\bwidth)\s*:/s);
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
