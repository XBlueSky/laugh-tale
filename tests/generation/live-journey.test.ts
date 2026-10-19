// @vitest-environment jsdom

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, test, vi } from "vitest";

import { inspectAuthoredWorld } from "./authored-world-contract.js";

const repoRoot = process.cwd();
const recipeRoot = join(repoRoot, "plugins/eternal-pose/recipes-v2/live-journey");
const presentationRoot = join(recipeRoot, "presentation");

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return statSync(root).isDirectory()
    ? readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const path = join(root, entry.name);
        return entry.isDirectory() ? sourceFiles(path) : [path];
      })
    : [root];
}

function readRecipeSource(): string {
  return sourceFiles(recipeRoot)
    .filter((path) => /\.(?:ts|tsx|css|json)$/.test(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

afterEach(() => vi.restoreAllMocks());

describe("Live Journey recipe contract", () => {
  test("ships a complete schema-2 live presentation", () => {
    expect(existsSync(recipeRoot)).toBe(true);
    if (!existsSync(recipeRoot)) return;
    expect(existsSync(join(presentationRoot, "home/LiveJourneyHome.tsx"))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(recipeRoot, "recipe.json"), "utf8")) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      schemaVersion: 2,
      id: "live-journey",
      register: "product",
      presentation: {
        source: "presentation",
        entry: "index.ts",
        css: [
          "styles/index.css",
          "styles/tokens.css",
          "styles/layout.css",
          "styles/components.css",
          "styles/accessibility.css",
        ],
        assets: [],
      },
      map: {
        profile: "presentation/theme-map-profile.ts",
        googleStyleGuide: "provider-guides/google-map-style.json",
      },
      motion: { durationMs: 200, interruptible: true, reducedMotion: "instant" },
      features: ["dense-telemetry"],
      font: { policy: "system", assets: [] },
      validation: {
        viewports: [320, 390, 430, 768, 1024, 1440],
        screenshots: ["home", "experience", "experience-expanded"],
      },
    });
  });

  test("keeps live hierarchy grounded in controller facts", () => {
    expect(existsSync(recipeRoot)).toBe(true);
    if (!existsSync(recipeRoot)) return;

    expect(inspectAuthoredWorld(recipeRoot, {
      id: "live-journey",
      requiredSourceSignals: [
        /now-next/,
        /current-node-id/,
        /next-node-id/,
        /route-progress/,
        /urgency/,
        /completed-history/,
        /disruption/,
        /data-route-owner/,
      ],
      forbiddenSourceSignals: [
        /fake[- ]?telemetry|decorative[- ]?kpi|countdown|high[- ]?score|brand[- ]?red|pulse|scanner|automatic[- ]?scroll/i,
      ],
      requiredMapModes: ["neutral"],
      requiredStates: [
        "empty",
        "memory-only",
        "candidate",
        "shopping",
        "reservation",
        "task",
        "route-error",
        "map-error",
        "disruption",
        "route-progress",
        "completed-history",
      ],
    })).toEqual([]);

    const source = readRecipeSource();
    expect(source).toMatch(/data-current-node-id/);
    expect(source).toMatch(/data-next-node-id/);
    expect(source).toMatch(/box-shadow:\s*3px\s*3px/);
    expect(source).toMatch(/:active[^\x7b]*\x7b[^}]*transform:\s*translate\(/s);
    expect(source).not.toMatch(/(?:animation|@keyframes)[^\n]*(?:infinite|pulse|spin|float)/i);
    expect(source).not.toMatch(/linear-gradient|radial-gradient|backdrop-filter|blur\(/i);
    expect(source).not.toMatch(/https?:\/\//i);
    expect(source).not.toMatch(/font-size:\s*(?:1[0-3]|[0-9])px/);
    expect(source).not.toMatch(/p[^\x7b]*\x7b[^}]*text-transform:\s*uppercase/i);
  });

  test("uses independent neutral marker and route treatments", async () => {
    expect(existsSync(join(presentationRoot, "theme-map-profile.ts"))).toBe(true);
    if (!existsSync(join(presentationRoot, "theme-map-profile.ts"))) return;
    const profileModule = (await import(pathToFileURL(join(presentationRoot, "theme-map-profile.ts")).href)) as Record<string, unknown>;
    const profile = profileModule.liveJourneyMapProfile as {
      basemap: Record<string, string>;
      marker: (place: { label: string; tone: string }, index: number) => { fallback: { size: number; shape: string }; parts: readonly { className: string }[]; className: string };
      route: (route: { tone: string; source: string; certainty: string; mode: string }) => { width: number; opacity: number; dash?: number[]; casing?: { width: number } };
    };
    expect(profile.basemap).toEqual({ mode: "neutral", density: "medium", contrast: "high", poi: "standard" });
    const marker = profile.marker({ label: "Current stop", tone: "selected" }, 0);
    expect(marker.parts.map(({ className }) => className)).toContain("live-marker__status");
    expect(marker.fallback.size).toBeGreaterThanOrEqual(44);
    expect(marker.className).toContain("selected");
    const routeModes = ["walking", "transit", "flight"].map((mode) => profile.route({ tone: "default", source: "provider", certainty: "confirmed", mode }));
    expect(new Set(routeModes.map((route) => JSON.stringify(route))).size).toBe(3);
  });

  test("documents token, component, presentation, and full replacement paths", () => {
    expect(existsSync(join(recipeRoot, "README.md"))).toBe(true);
    if (!existsSync(join(recipeRoot, "README.md"))) return;
    const readme = readFileSync(join(recipeRoot, "README.md"), "utf8");
    for (const phrase of ["Token customization", "Component customization", "Presentation customization", "Full UI replacement"]) {
      expect(readme).toContain(phrase);
    }
  });
});
