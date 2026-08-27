// @vitest-environment jsdom

import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { cleanup, fireEvent, render, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import {
  buildMapPresentation,
  emptyTripProgress,
  nodeCompletionKey,
  resolveEffectiveItinerary,
  taskCompletionKey,
  type TripProgressV1,
} from "@laugh-tale-island/core";

import type {
  ExperienceActions,
  ExperienceBindings,
  ExperienceViewModel,
  HomeViewModel,
  MapVisualProfile,
  TripPresentation,
} from "../../plugins/eternal-pose/starter/react/src/controllers/presentation-contract.js";
import { completeTrip } from "../../plugins/eternal-pose/starter/react/src/trip-content/fixtures/complete-trip.js";

interface RecipeManifest {
  schemaVersion: number;
  id: string;
  register: string;
  presentation: {
    source: string;
    entry: string;
    css: string[];
    assets: string[];
  };
  map: { profile: string; googleStyleGuide?: string };
  motion: {
    durationMs: number;
    interruptible: boolean;
    reducedMotion: string;
  };
  features: string[];
  font: { policy: string; assets: string[]; license?: string };
  validation: { viewports: number[]; screenshots: string[] };
}

interface LoadedRecipe {
  manifest: RecipeManifest;
  presentationEntry: string;
  cssFiles: readonly string[];
  mapProfile: string;
  googleStyleGuide?: string;
}

interface RecipeV2Module {
  loadRecipeV2: (recipeDir: string, expectedId: string) => Promise<LoadedRecipe>;
}

interface ComposerModule {
  createTripProject: (options: {
    pluginRoot: string;
    targetDir: string;
    recipe: string;
    recipeCatalogRoot: string;
  }) => Promise<void>;
}

function hexRgb(color: string): readonly [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (match?.[1] === undefined) {
    throw new Error(`Expected an opaque six-digit hex color, received ${color}`);
  }
  const value = match[1];
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function relativeLuminance(color: string): number {
  const channels = hexRgb(color).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)]
    .sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

const repoRoot = process.cwd();
const pluginRoot = join(repoRoot, "plugins/eternal-pose");
const recipeRoot = join(pluginRoot, "recipes-v2/field-atlas");
const recipePresentationRoot = join(recipeRoot, "presentation");
mkdirSync(join(repoRoot, "tmp"), { recursive: true });
const composedParent = mkdtempSync(
  join(repoRoot, "tmp/field-atlas-contract-"),
);
const composedRoot = join(composedParent, "consumer");
const composedPresentationRoot = join(composedRoot, "src/presentation");
const presentationUrl = pathToFileURL(join(composedPresentationRoot, "index.ts")).href;
const profileUrl = pathToFileURL(
  join(composedPresentationRoot, "theme-map-profile.ts"),
).href;
const recipeV2Url = pathToFileURL(join(pluginRoot, "lib/recipe-v2.mjs")).href;
const composerUrl = pathToFileURL(
  join(pluginRoot, "scripts/create-trip-project.mjs"),
).href;
const composer = (await import(composerUrl)) as ComposerModule;
await composer.createTripProject({
  pluginRoot,
  targetDir: composedRoot,
  recipe: "field-atlas",
  recipeCatalogRoot: join(pluginRoot, "recipes-v2"),
});

const requiredFiles = [
  "README.md",
  "provider-guides/google-map-style.json",
  "recipe.json",
  "presentation/index.ts",
  "presentation/theme-map-profile.ts",
  "presentation/home/FieldAtlasHome.tsx",
  "presentation/experience/FieldAtlasExperience.tsx",
  "presentation/components/AtlasMapSurface.tsx",
  "presentation/components/AtlasTimeline.tsx",
  "presentation/components/AtlasDecisions.tsx",
  "presentation/components/AtlasUtilityPanels.tsx",
  "presentation/components/AtlasStates.tsx",
  "presentation/styles/index.css",
  "presentation/styles/tokens.css",
  "presentation/styles/layout.css",
  "presentation/styles/components.css",
  "presentation/styles/accessibility.css",
] as const;

beforeAll(() => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    writable: true,
    value: true,
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    },
  });
});

afterAll(() => {
  rmSync(composedParent, { recursive: true, force: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function readManifest(): RecipeManifest {
  return JSON.parse(
    readFileSync(join(recipeRoot, "recipe.json"), "utf8"),
  ) as RecipeManifest;
}

function collectFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? collectFiles(path) : [path];
    });
}

function combinedSource(root: string, extensions: readonly string[]): string {
  return collectFiles(root)
    .filter((path) => extensions.some((extension) => path.endsWith(extension)))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

async function loadPresentation(): Promise<TripPresentation> {
  const module = (await import(presentationUrl)) as {
    presentation: TripPresentation;
  };
  return module.presentation;
}

function actions(): ExperienceActions {
  return {
    selectDay: vi.fn(),
    selectNode: vi.fn(),
    selectRoute: vi.fn(),
    returnToNow: vi.fn(),
    returnToLodging: vi.fn(),
    returnHome: vi.fn(),
    retryRoute: vi.fn(),
    retryMap: vi.fn(),
    openCandidate: vi.fn(),
    closeCandidate: vi.fn(),
    previewCandidate: vi.fn(),
    confirmCandidate: vi.fn(),
    setCompleted: vi.fn(),
    setShoppingStatus: vi.fn(),
    startLocation: vi.fn(),
    recenterLocation: vi.fn(),
    stopLocation: vi.fn(),
    setHeaderExpanded: vi.fn(),
    setSheetSnap: vi.fn(),
  };
}

function syntheticExperience(
  overrides: Partial<ExperienceViewModel> = {},
): ExperienceViewModel {
  const progress: TripProgressV1 = {
    ...emptyTripProgress(),
    completedIds: [
      nodeCompletionKey("node-transport"),
      taskCompletionKey("task-day-water"),
    ],
    shoppingStatuses: { "shopping-item-journal": "purchased" },
  };
  const effectiveTrip = resolveEffectiveItinerary(completeTrip, progress);
  const effectiveDay = effectiveTrip.days[0];
  if (effectiveDay === undefined) throw new Error("synthetic day is required");
  const routeResults = Object.fromEntries(
    effectiveTrip.routes.map((edge, index) => [
      edge.id,
      index === 0
        ? { status: "unavailable" as const, reason: "Synthetic unavailable" }
        : {
            status: "ready" as const,
            durationMinutes: 12 + index,
            path: [
              { lat: 10 + index / 100, lng: 20 + index / 100 },
              { lat: 10.01 + index / 100, lng: 20.01 + index / 100 },
            ],
            steps: [`Synthetic route step ${index}`],
          },
    ]),
  );
  const routes = effectiveTrip.routes.map((edge, index) => ({
    edge,
    loadState: routeResults[edge.id],
    selected: index === 1,
    selectionSource: index === 1 ? ("map" as const) : null,
    ...(index <= 1
      ? { navigationHref: "https://example.test/directions" }
      : {}),
  }));
  const candidateGroup = completeTrip.candidateGroups[0];
  const candidateSource = completeTrip.days[0]?.nodes.find(
    ({ id }) => id === candidateGroup?.parentNodeId,
  );
  const shoppingNode = completeTrip.days[0]?.nodes.find(
    (node) => node.kind === "shopping",
  );
  if (
    candidateGroup === undefined ||
    candidateSource === undefined ||
    shoppingNode?.kind !== "shopping"
  ) {
    throw new Error("synthetic decision fixtures are required");
  }

  return {
    trip: completeTrip,
    effectiveDay,
    days: completeTrip.days,
    clock: { instant: "2040-06-12T08:30:00Z", timezone: "Etc/UTC" },
    live: {
      currentNodeId: effectiveDay.nodes[0]?.sourceNodeId ?? null,
      nextNodeId: effectiveDay.nodes[1]?.sourceNodeId ?? null,
    },
    selection: { nodeId: effectiveDay.nodes[1]?.sourceNodeId ?? null, source: "manual" },
    progress,
    persistence: "persistent",
    routes,
    map: {
      presentation: buildMapPresentation(effectiveDay, {
        selectedNodeId: effectiveDay.nodes[1]?.sourceNodeId,
        selectedRouteId: effectiveTrip.routes[1]?.id,
        routes: effectiveTrip.routes,
        routeResults,
      }),
      status: "ready",
    },
    viewport: { width: 390, height: 844, safeTop: 0, safeBottom: 0 },
    motion: "full",
    header: { expanded: true, clearance: 148 },
    location: { status: "active" },
    sheet: {
      snap: "half",
      geometry: { collapsed: 128, half: 340, expanded: 640, ceiling: 640 },
    },
    candidate: {
      group: candidateGroup,
      sourceNode: candidateSource,
      sequenceNumber: 4,
      committedOptionId: candidateGroup.defaultOptionId,
      open: true,
      sessionId: 1,
      draftOptionId: candidateGroup.options[1]?.id,
    },
    shopping: {
      node: shoppingNode,
      statuses: progress.shoppingStatuses,
    },
    tasks: completeTrip.tasks.filter(({ scope }) => scope === "day"),
    ...overrides,
  };
}

function bindings(
  model: ExperienceViewModel,
  experienceActions: ExperienceActions,
): ExperienceBindings {
  return {
    map: { ref: () => undefined },
    sheet: {
      getSheetProps: () => ({
        role: "region",
        "data-snap": model.sheet.snap,
        style: { height: `${model.sheet.geometry[model.sheet.snap]}px` },
      }),
      getHandleProps: () => ({
        "aria-keyshortcuts": "ArrowUp ArrowDown Home End",
        onPointerDown: () => undefined,
      }),
    },
    owners: {
      nodeRef: () => () => undefined,
      routeRef: () => () => undefined,
    },
    candidate: {
      getTriggerProps: () => ({
        ref: () => undefined,
        onClick: experienceActions.openCandidate,
        "aria-expanded": model.candidate?.open ?? false,
      }),
      registerOption: () => () => undefined,
    },
  };
}

describe("Field Atlas recipe contract", () => {
  test("exists as the complete declared schema-2 recipe", async () => {
    expect(existsSync(recipeRoot)).toBe(true);
    expect(requiredFiles.filter((path) => !existsSync(join(recipeRoot, path)))).toEqual([]);
    expect(requiredFiles.every((path) => statSync(join(recipeRoot, path)).isFile())).toBe(true);

    const manifest = readManifest();
    expect(manifest).toMatchObject({
      schemaVersion: 2,
      id: "field-atlas",
      register: "product",
      presentation: {
        source: "presentation",
        entry: "index.ts",
        assets: [],
      },
      map: {
        profile: "presentation/theme-map-profile.ts",
        googleStyleGuide: "provider-guides/google-map-style.json",
      },
      motion: {
        interruptible: true,
        reducedMotion: "instant",
      },
      font: { policy: "system", assets: [] },
      validation: {
        viewports: [320, 390, 430, 768, 1024, 1440],
        screenshots: ["home", "experience", "experience-expanded"],
      },
    });
    expect(manifest.presentation.css).toEqual([
      "styles/index.css",
      "styles/tokens.css",
      "styles/layout.css",
      "styles/components.css",
      "styles/accessibility.css",
    ]);
    expect(manifest.font.license).toBeUndefined();
    expect(manifest.motion.durationMs).toBeGreaterThan(0);
    expect(manifest.motion.durationMs).toBeLessThanOrEqual(250);

    const { loadRecipeV2 } = (await import(recipeV2Url)) as RecipeV2Module;
    const loaded = await loadRecipeV2(recipeRoot, "field-atlas");
    expect(loaded.manifest).toEqual(expect.objectContaining({ id: "field-atlas" }));
    expect(loaded.presentationEntry).toBe(join(recipePresentationRoot, "index.ts"));
    expect(loaded.cssFiles).toHaveLength(5);
    expect(loaded.mapProfile).toBe(join(recipePresentationRoot, "theme-map-profile.ts"));
    expect(loaded.googleStyleGuide).toBe(
      join(recipeRoot, "provider-guides/google-map-style.json"),
    );
  });

  test("exposes exactly one presentation object and a separate validated map profile", async () => {
    const presentationModule = (await import(presentationUrl)) as Record<string, unknown>;
    const profileModule = (await import(profileUrl)) as Record<string, unknown>;
    expect(Object.keys(presentationModule)).toEqual(["presentation"]);
    expect(Object.keys(profileModule)).toEqual(["fieldAtlasMapProfile"]);

    const presentation = presentationModule.presentation as TripPresentation;
    expect(Object.keys(presentation)).toEqual([
      "Home",
      "Experience",
      "SetupRequired",
      "Loading",
      "FatalError",
      "geometry",
      "mapProfile",
    ]);
    expect(presentation.geometry).toEqual({
      header: { expanded: 148, collapsed: 72 },
      sheet: { collapsed: 128, minGap: 24 },
      desktopBreakpoint: 768,
      map: {
        mobileProviderClearance: 176,
        desktopRailInset: true,
      },
    });

    const profile = profileModule.fieldAtlasMapProfile as MapVisualProfile;
    expect(presentation.mapProfile).toBe(profile);
    expect(profile.basemap).toEqual({
      mode: "topographic",
      density: "high",
      contrast: "high",
      poi: "minimal",
    });
    const tones = ["default", "candidate", "selected", "completed", "skipped"] as const;
    const markers = Object.fromEntries(
      tones.map((tone, index) => [
        tone,
        profile.marker(
          {
            ownerId: `node:${tone}`,
            label: `${tone} survey stop`,
            coordinates: { lat: 10 + index / 10, lng: 20 + index / 10 },
            tone,
          },
          index,
        ),
      ]),
    ) as Record<(typeof tones)[number], ReturnType<MapVisualProfile["marker"]>>;
    const defaultMarker = markers.default;
    const selectedMarker = markers.selected;
    const completedMarker = markers.completed;
    expect(defaultMarker.parts.map(({ className }) => className)).toContain("stop-number");
    expect(selectedMarker.className).not.toBe(defaultMarker.className);
    expect(completedMarker.className).not.toBe(defaultMarker.className);
    expect(completedMarker.parts.map(({ className }) => className)).toContain(
      "atlas-marker__completion",
    );
    for (const marker of Object.values(markers)) {
      expect(marker.fallback.size).toBeGreaterThanOrEqual(44);
      expect(marker.fallback.strokeWidth).toBeGreaterThan(0);
      expect(contrastRatio(marker.fallback.fill, marker.fallback.labelColor)).toBeGreaterThanOrEqual(4.5);
    }
    const userLocation = profile.userLocation();
    expect(contrastRatio(
      userLocation.fallback.fill,
      userLocation.fallback.labelColor,
    )).toBeGreaterThanOrEqual(4.5);
    expect([
      selectedMarker.fallback.shape,
      selectedMarker.fallback.strokeWidth,
      selectedMarker.fallback.text,
    ]).not.toEqual([
      defaultMarker.fallback.shape,
      defaultMarker.fallback.strokeWidth,
      defaultMarker.fallback.text,
    ]);
    expect([
      completedMarker.fallback.shape,
      completedMarker.fallback.strokeWidth,
      completedMarker.fallback.text,
    ]).not.toEqual([
      defaultMarker.fallback.shape,
      defaultMarker.fallback.strokeWidth,
      defaultMarker.fallback.text,
    ]);

    const routeBase = {
      edgeId: "route-one",
      path: [
        { lat: 10, lng: 20 },
        { lat: 10.1, lng: 20.1 },
      ],
      source: "recomposed" as const,
      certainty: "unverified" as const,
      mode: "walking" as const,
    };
    const uncertain = profile.route({ ...routeBase, tone: "default" });
    const selected = profile.route({ ...routeBase, tone: "selected" });
    expect(uncertain.casing).toBeDefined();
    expect(uncertain.dash).toEqual(expect.arrayContaining([expect.any(Number)]));
    expect(selected.width).toBeGreaterThan(uncertain.width);
  });

  test("uses a distinct ruled atlas structure with local system-font resources only", () => {
    const presentationSource = combinedSource(recipePresentationRoot, [".ts", ".tsx"]);
    const cssSource = combinedSource(join(recipePresentationRoot, "styles"), [".css"]);
    const componentsSource = readFileSync(
      join(recipePresentationRoot, "styles/components.css"),
      "utf8",
    );
    const runtimeSource = `${presentationSource}\n${cssSource}`;

    expect(runtimeSource).toMatch(/atlas-index/);
    expect(runtimeSource).toMatch(/atlas-legend/);
    expect(runtimeSource).toMatch(/route-band/);
    expect(runtimeSource).toMatch(/stop-number/);
    expect(runtimeSource).toMatch(/data-current/);
    expect(runtimeSource).toMatch(/data-selected/);
    expect(runtimeSource).toMatch(/data-snap/);
    expect(runtimeSource).toMatch(/--atlas-accent/);
    expect(runtimeSource).not.toMatch(/scrapbook|torn|stamp|script-font/i);
    expect(runtimeSource).not.toMatch(/starter\/react\/src\/presentation/);
    expect(runtimeSource).not.toMatch(/from\s+["'][^"']*\/presentation\//);
    expect(cssSource).not.toMatch(/linear-gradient|radial-gradient|backdrop-filter|blur\(/i);
    expect(cssSource).not.toMatch(/beige|terracotta|parchment|paper/i);
    expect(cssSource).toMatch(/ui-monospace/);
    expect(cssSource).toMatch(/system-ui/);
    expect(cssSource).toMatch(/gmp-advanced-marker[^}]*min-width:\s*44px/is);
    expect(cssSource).toMatch(/gmp-advanced-marker[^}]*:focus-visible/is);
    expect(cssSource).toMatch(/\.atlas-marker\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/is);
    expect(cssSource).toMatch(/\.itinerary-map\s*\{[^}]*width:\s*auto[^}]*height:\s*auto/is);
    expect(cssSource).not.toMatch(/\.atlas-map-surface\s*,\s*\.itinerary-map\s*\{/);
    expect(cssSource).toMatch(/\.atlas-day-index__primary strong\s*\{[^}]*white-space:\s*normal/is);
    expect(cssSource).toMatch(/\.atlas-detail-surface__heading strong\s*\{[^}]*white-space:\s*normal/is);
    expect(componentsSource).not.toMatch(/@media\s*\(max-width:\s*30rem\)/i);
    expect(componentsSource).toMatch(/@media\s*\(min-width:\s*768px\)[^{]*\{[\s\S]*\.atlas-day-index__rail\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/i);
    expect(componentsSource).toMatch(/@container\s+field-atlas\s*\(max-width:\s*15rem\)[^{]*\{[\s\S]*\.atlas-detail-surface__heading[\s\S]*grid-column:\s*1\s*\/\s*-1/i);
    expect(cssSource).toMatch(/container-type:\s*inline-size/i);
    expect(cssSource).toMatch(/@container\s+field-atlas\s*\(max-width:\s*15rem\)/i);
    expect(presentationSource).toMatch(/className="atlas-responsive-layout"/);
    expect(presentationSource).not.toMatch(/\p{Script=Han}/u);

    const allRecipeSource = collectFiles(recipeRoot)
      .filter((path) => !path.endsWith("README.md"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(allRecipeSource).not.toMatch(/https?:\/\//i);
    expect(cssSource).not.toMatch(/@import\s+url|@font-face|url\s*\(/i);
    expect(readManifest().presentation.assets).toEqual([]);

    const css = readManifest().presentation.css;
    expect(new Set(css).size).toBe(css.length);
    expect(
      collectFiles(recipeRoot)
        .map((path) => relative(recipeRoot, path))
        .filter((path) => path.startsWith("assets/")),
    ).toEqual([]);
  });

  test("renders the home folio without rewriting trip-authored content", async () => {
    const presentation = await loadPresentation();
    const setCompleted = vi.fn();
    const enterDay = vi.fn();
    const model: HomeViewModel = {
      trip: completeTrip,
      progress: {
        ...emptyTripProgress(),
        completedIds: [taskCompletionKey("task-pretrip-documents")],
      },
      pretripCompletion: { completed: 1, total: 3 },
      reservationCounts: { confirmed: 1, pending: 1, none: 0 },
      persistence: "memory-only",
    };
    const view = render(
      createElement(presentation.Home, {
        model,
        actions: { setCompleted, enterDay },
      }),
    );

    expect(view.getByTestId("trip-home")).toHaveClass("atlas-home");
    expect(view.getByRole("heading", { name: completeTrip.title })).toBeVisible();
    expect(view.getAllByText(completeTrip.days[0]?.title ?? "missing").length).toBeGreaterThan(0);
    expect(view.getByRole("navigation", { name: "Enter daily itinerary" })).toHaveClass(
      "atlas-index",
    );
    expect(view.getByRole("region", { name: "Route overview" })).toBeVisible();
    expect(view.getByRole("region", { name: "Readiness facts" })).toBeVisible();
    expect(view.getByRole("region", { name: "Reservation ledger" })).toBeVisible();
    expect(view.getByRole("status")).toHaveAttribute(
      "data-persistence-status",
      "memory-only",
    );
    fireEvent.click(
      view.getByRole("button", {
        name: new RegExp(`Enter Day 1.*${completeTrip.days[0]?.title ?? ""}`),
      }),
    );
    expect(enterDay).toHaveBeenCalledWith(completeTrip.days[0]?.id);
    fireEvent.click(
      view.getByRole("checkbox", { name: "Prepare travel documents" }),
    );
    expect(setCompleted).toHaveBeenCalledWith(
      taskCompletionKey("task-pretrip-documents"),
      false,
    );
  });

  test("keeps non-English authored trip content verbatim while recipe controls stay English", async () => {
    const presentation = await loadPresentation();
    const authoredTrip: HomeViewModel["trip"] = {
      ...completeTrip,
      title: "合成群島旅行",
      days: completeTrip.days.map((day, dayIndex) => ({
        ...day,
        title: dayIndex === 0 ? "港灣田野日" : day.title,
        nodes: day.nodes.map((node) => ({
          ...node,
          title:
            node.id === "node-transport"
              ? "海港接駁"
              : node.id === "node-dining"
                ? "午餐選擇"
                : node.title,
        })),
      })),
      candidateGroups: completeTrip.candidateGroups.map((group, groupIndex) => ({
        ...group,
        options: group.options.map((option, optionIndex) => ({
          ...option,
          title: groupIndex === 0 && optionIndex === 1 ? "運河小館" : option.title,
        })),
      })),
      tasks: completeTrip.tasks.map((task) => ({
        ...task,
        title:
          task.id === "task-pretrip-documents"
            ? "準備旅行文件"
            : task.id === "task-day-water"
              ? "補充水瓶"
              : task.title,
      })),
      reservations: completeTrip.reservations.map((reservation, index) => ({
        ...reservation,
        title: index === 0 ? "天文台預約" : reservation.title,
      })),
    };
    const home = render(
      createElement(presentation.Home, {
        model: {
          trip: authoredTrip,
          progress: emptyTripProgress(),
          pretripCompletion: { completed: 0, total: 3 },
          reservationCounts: { confirmed: 1, pending: 1, none: 0 },
          persistence: "persistent",
        },
        actions: { setCompleted: vi.fn(), enterDay: vi.fn() },
      }),
    );

    expect(home.getByRole("heading", { name: "合成群島旅行" })).toBeVisible();
    expect(home.getByRole("button", { name: "Enter Day 1 · 港灣田野日" })).toBeVisible();
    expect(home.getByRole("checkbox", { name: "準備旅行文件" })).toBeVisible();
    expect(home.getByText("天文台預約")).toBeVisible();
    expect(home.getByRole("navigation", { name: "Enter daily itinerary" })).toBeVisible();
    home.unmount();

    const effectiveTrip = resolveEffectiveItinerary(authoredTrip, emptyTripProgress());
    const effectiveDay = effectiveTrip.days[0];
    const candidateGroup = authoredTrip.candidateGroups[0];
    const candidateSource = authoredTrip.days[0]?.nodes.find(
      ({ id }) => id === candidateGroup?.parentNodeId,
    );
    if (
      effectiveDay === undefined ||
      candidateGroup === undefined ||
      candidateSource === undefined
    ) {
      throw new Error("authored locale fixtures are required");
    }
    const baseModel = syntheticExperience();
    const experienceModel = syntheticExperience({
      trip: authoredTrip,
      days: authoredTrip.days,
      effectiveDay,
      tasks: authoredTrip.tasks.filter(({ scope }) => scope === "day"),
      candidate: {
        ...baseModel.candidate!,
        group: candidateGroup,
        sourceNode: candidateSource,
        draftOptionId: candidateGroup.options[1]?.id,
      },
    });
    const experienceActions = actions();
    const experience = render(
      createElement(presentation.Experience, {
        model: experienceModel,
        actions: experienceActions,
        bindings: bindings(experienceModel, experienceActions),
      }),
    );

    expect(experience.getByTitle("合成群島旅行")).toHaveTextContent("合成群島旅行");
    expect(experience.getByRole("button", { name: /Day 1: 港灣田野日/ })).toBeVisible();
    expect(experience.getByRole("button", { name: /海港接駁/ })).toBeVisible();
    expect(experience.getByRole("radio", { name: /運河小館/ })).toBeVisible();
    expect(experience.getByRole("button", { name: "Open tasks for 港灣田野日" })).toBeVisible();
    expect(experience.getByText("補充水瓶")).toBeInTheDocument();
    expect(experience.getByText("天文台預約")).toBeInTheDocument();
    expect(experience.getByRole("navigation", { name: "Trip dates" })).toBeVisible();
    expect(experience.getByRole("toolbar", { name: "Map controls" })).toBeVisible();

  });

  test("renders every experience sub-state and preserves controller actions and bindings", async () => {
    const presentation = await loadPresentation();
    const model = syntheticExperience();
    const experienceActions = actions();
    const view = render(
      createElement(presentation.Experience, {
        model,
        actions: experienceActions,
        bindings: bindings(model, experienceActions),
      }),
    );

    const experience = view.getByTestId("trip-experience");
    expect(experience).toHaveClass("field-atlas-experience");
    expect(view.getByRole("region", { name: "Trip map" })).toHaveAttribute(
      "data-map-canvas",
      "persistent",
    );
    expect(view.getByRole("navigation", { name: "Trip dates" })).toHaveClass(
      "atlas-index",
    );
    expect(view.getByRole("list", { name: "Day itinerary" })).toHaveClass(
      "atlas-timeline",
    );
    expect(view.getByRole("region", { name: "Itinerary" })).toHaveAttribute(
      "data-snap",
      "half",
    );
    expect(view.getByRole("button", { name: /Harbor shuttle/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(
      view.getByRole("button", { name: /Inter-island transfer/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(view.getByRole("radio", { name: /Canal counter/ })).toBeChecked();
    expect(
      view.getByRole("combobox", { name: "Travel journal shopping status" }),
    ).toHaveValue("purchased");
    expect(
      view.getByRole("button", { name: /Open tasks for .*day/ }),
    ).toBeVisible();
    expect(view.getByRole("button", { name: "Open reservation information" })).toBeVisible();
    expect(view.getByText("Synthetic unavailable")).toBeVisible();
    expect(view.getByText("Tuesday, 12 June 2040")).toBeVisible();
    for (const semantic of [
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
      expect(experience.querySelector(`[data-semantic="${semantic}"]`)).not.toBeNull();
    }
    fireEvent.click(view.getByRole("button", { name: "Return to trip home" }));
    expect(experienceActions.returnHome).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole("button", { name: "Retry route" }));
    expect(experienceActions.retryRoute).toHaveBeenCalledWith(
      model.routes[0]?.edge.id,
    );
    fireEvent.click(view.getByRole("button", { name: "Set collapsed itinerary" }));
    fireEvent.click(view.getByRole("button", { name: "Set half itinerary" }));
    fireEvent.click(view.getByRole("button", { name: "Set expanded itinerary" }));
    expect(experienceActions.setSheetSnap).toHaveBeenNthCalledWith(1, "collapsed");
    expect(experienceActions.setSheetSnap).toHaveBeenNthCalledWith(2, "half");
    expect(experienceActions.setSheetSnap).toHaveBeenNthCalledWith(3, "expanded");
    fireEvent.click(view.getByRole("button", { name: "Confirm Canal counter" }));
    expect(experienceActions.confirmCandidate).toHaveBeenCalledTimes(1);
    fireEvent.change(
      view.getByRole("combobox", { name: "Travel journal shopping status" }),
      { target: { value: "skipped" } },
    );
    expect(experienceActions.setShoppingStatus).toHaveBeenCalledWith(
      "shopping-item-journal",
      "skipped",
    );
    fireEvent.click(view.getByRole("button", { name: "Recenter my location" }));
    expect(experienceActions.recenterLocation).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole("button", { name: "Stop location sharing" }));
    expect(experienceActions.stopLocation).toHaveBeenCalledTimes(1);

    const selectedRoute = experience.querySelector<HTMLElement>(
      ".route-band[data-selected='true']",
    );
    expect(selectedRoute).not.toBeNull();
    expect(selectedRoute).toHaveClass("route-band");
    const stopNumbers = experience.querySelectorAll(".stop-number");
    expect(stopNumbers.length).toBeGreaterThan(0);
  });

  test("keeps route recovery and safe authored navigation in one owner shell", async () => {
    const presentation = await loadPresentation();
    const base = syntheticExperience();
    const route = base.routes[0];
    if (route === undefined) throw new Error("synthetic route is required");
    const experienceActions = actions();
    const loadingModel = syntheticExperience({
      routes: base.routes.map((entry, index) =>
        index === 0
          ? {
              ...entry,
              loadState: { status: "loading" as const },
              navigationHref: "https://example.test/fallback-directions",
            }
          : entry,
      ),
    });
    const view = render(
      createElement(presentation.Experience, {
        model: loadingModel,
        actions: experienceActions,
        bindings: bindings(loadingModel, experienceActions),
      }),
    );

    const loadingStatus = view.getByRole("status", { name: "Loading route" });
    const loadingShell = loadingStatus.closest(".route-band-shell");
    expect(loadingShell).not.toBeNull();
    expect(within(loadingShell as HTMLElement).getByRole("button", { name: "Retry route" })).toBeVisible();
    expect(within(loadingShell as HTMLElement).getByRole("link", { name: /Open live .* directions/ })).toHaveAttribute(
      "href",
      "https://example.test/fallback-directions",
    );
    fireEvent.click(within(loadingShell as HTMLElement).getByRole("button", { name: "Retry route" }));
    expect(experienceActions.retryRoute).toHaveBeenCalledWith(route.edge.id);

    const unavailableModel = syntheticExperience();
    view.rerender(
      createElement(presentation.Experience, {
        model: unavailableModel,
        actions: experienceActions,
        bindings: bindings(unavailableModel, experienceActions),
      }),
    );
    const unavailableStatus = view.getByRole("status", { name: "Route unavailable" });
    const unavailableShell = unavailableStatus.closest(".route-band-shell");
    expect(unavailableShell).not.toBeNull();
    expect(within(unavailableShell as HTMLElement).getByRole("button", { name: "Retry route" })).toBeVisible();
    expect(within(unavailableShell as HTMLElement).getByRole("link", { name: /Open live .* directions/ })).toBeVisible();

    const unsafeModel = syntheticExperience({
      routes: base.routes.map((entry, index) =>
        index === 0
          ? { ...entry, navigationHref: "javascript:alert(1)" }
          : entry,
      ),
    });
    view.rerender(
      createElement(presentation.Experience, {
        model: unsafeModel,
        actions: experienceActions,
        bindings: bindings(unsafeModel, experienceActions),
      }),
    );
    const unsafeShell = view.getByRole("status", { name: "Route unavailable" }).closest(".route-band-shell");
    expect(unsafeShell).not.toBeNull();
    expect(within(unsafeShell as HTMLElement).queryByRole("link")).toBeNull();
  });

  test("bounds the provider canvas above every mobile sheet snap without remounting it", async () => {
    const presentation = await loadPresentation();
    const experienceActions = actions();
    const base = syntheticExperience();
    const view = render(
      createElement(presentation.Experience, {
        model: base,
        actions: experienceActions,
        bindings: bindings(base, experienceActions),
      }),
    );
    const canvas = view.getByTestId("itinerary-map");
    expect(canvas).toHaveAttribute("data-provider-canvas", "bounded");

    for (const snap of ["collapsed", "half", "expanded"] as const) {
      const model = syntheticExperience({
        sheet: { ...base.sheet, snap },
      });
      view.rerender(
        createElement(presentation.Experience, {
          model,
          actions: experienceActions,
          bindings: bindings(model, experienceActions),
        }),
      );
      const shell = view.getByTestId("trip-experience");
      expect(shell.style.getPropertyValue("--header-clearance")).toBe("148px");
      expect(shell.style.getPropertyValue("--map-provider-bottom")).toBe(
        `${model.sheet.geometry[snap] + 8}px`,
      );
      expect(view.getByTestId("itinerary-map")).toBe(canvas);
    }
  });

  test("scrolls controller-selected owners nearest on selection, return-now, day, and restore without stealing focus", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      const presentation = await loadPresentation();
      const experienceActions = actions();
      const initial = syntheticExperience();
      const registered = new Map<string, HTMLElement>();
      const ownerBindings = (model: ExperienceViewModel): ExperienceBindings => ({
        ...bindings(model, experienceActions),
        owners: {
          nodeRef: (nodeId) => (element) => {
            if (element === null) registered.delete(nodeId);
            else registered.set(nodeId, element);
          },
          routeRef: () => () => undefined,
        },
      });
      const view = render(
        createElement(presentation.Experience, {
          model: initial,
          actions: experienceActions,
          bindings: ownerBindings(initial),
        }),
      );
      const home = view.getByRole("button", { name: "Return to trip home" });
      home.focus();
      scrollIntoView.mockClear();

      const nowNodeId = initial.live.currentNodeId;
      if (nowNodeId === null) throw new Error("synthetic current node is required");
      const returnedNow = syntheticExperience({
        selection: { nodeId: nowNodeId, source: "automatic" },
      });
      view.rerender(
        createElement(presentation.Experience, {
          model: returnedNow,
          actions: experienceActions,
          bindings: ownerBindings(returnedNow),
        }),
      );
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(registered.get(nowNodeId));
      expect(document.activeElement).toBe(home);

      const changedEffectiveDay = {
        ...initial.effectiveDay,
        day: { ...initial.effectiveDay.day, id: "day-restored-selection" },
      };
      const dayNodeId = changedEffectiveDay.nodes[0]?.sourceNodeId;
      if (dayNodeId === undefined) {
        throw new Error("synthetic second day owner is required");
      }
      scrollIntoView.mockClear();
      const changedDay = syntheticExperience({
        effectiveDay: changedEffectiveDay,
        live: { currentNodeId: dayNodeId, nextNodeId: null },
        selection: { nodeId: dayNodeId, source: "manual" },
      });
      view.rerender(
        createElement(presentation.Experience, {
          model: changedDay,
          actions: experienceActions,
          bindings: ownerBindings(changedDay),
        }),
      );
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(registered.get(dayNodeId));
      expect(document.activeElement).toBe(home);

      const collapsed = syntheticExperience({
        effectiveDay: changedDay.effectiveDay,
        live: changedDay.live,
        selection: changedDay.selection,
        sheet: { ...changedDay.sheet, snap: "collapsed" },
      });
      view.rerender(
        createElement(presentation.Experience, {
          model: collapsed,
          actions: experienceActions,
          bindings: ownerBindings(collapsed),
        }),
      );
      expect(registered.has(dayNodeId)).toBe(false);
      scrollIntoView.mockClear();
      const restored = syntheticExperience({
        effectiveDay: changedDay.effectiveDay,
        live: changedDay.live,
        selection: changedDay.selection,
        sheet: { ...changedDay.sheet, snap: "expanded" },
      });
      view.rerender(
        createElement(presentation.Experience, {
          model: restored,
          actions: experienceActions,
          bindings: ownerBindings(restored),
        }),
      );
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(registered.get(dayNodeId));
      expect(document.activeElement).toBe(home);
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  test("renders map failure, setup, loading, and fatal recovery states", async () => {
    const presentation = await loadPresentation();
    const model = syntheticExperience({
      map: { presentation: { places: [], routes: [] }, status: "error" },
      candidate: null,
      shopping: null,
      tasks: [],
    });
    const experienceActions = actions();
    const mapView = render(
      createElement(presentation.Experience, {
        model,
        actions: experienceActions,
        bindings: { ...bindings(model, experienceActions), candidate: null },
      }),
    );
    const mapAlert = mapView.getByRole("alert");
    expect(mapAlert).toHaveTextContent("Map unavailable");
    fireEvent.click(within(mapAlert).getByRole("button", { name: "Retry map" }));
    expect(experienceActions.retryMap).toHaveBeenCalledTimes(1);
    mapView.unmount();

    for (const issue of [
      { kind: "trip-content" as const },
      { kind: "provider-key" as const },
      { kind: "provider-load" as const, reason: "Synthetic provider failure" },
    ]) {
      const setup = render(createElement(presentation.SetupRequired, { issue }));
      expect(setup.getByRole("main")).toHaveAttribute(
        "data-state",
        "setup-required",
      );
      expect(setup.getByRole("alert")).toBeVisible();
      setup.unmount();
    }

    const loading = render(createElement(presentation.Loading, { kind: "progress" }));
    expect(loading.getByRole("status")).toHaveAttribute("data-state", "loading");
    expect(loading.getByRole("status")).toHaveAccessibleName("Loading trip progress");
    loading.unmount();

    const retry = vi.fn();
    const fatal = render(
      createElement(presentation.FatalError, {
        model: { kind: "render" },
        actions: { retry },
      }),
    );
    expect(fatal.getByRole("alert")).toHaveAttribute("data-state", "fatal");
    fireEvent.click(fatal.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  test("documents customization, responsive accessibility, and completed controller evidence", () => {
    const readme = readFileSync(join(recipeRoot, "README.md"), "utf8");
    for (const phrase of [
      "Token customization",
      "Component customization",
      "Presentation customization",
      "Full UI replacement",
      "320",
      "390",
      "430",
      "768",
      "1024",
      "1440",
      "200%",
      "forced colors",
      "reduced motion",
      "44",
      "VITE_GOOGLE_MAP_ID",
      "no npm theme dependency",
      "no runtime theme selector",
    ]) {
      expect(readme.toLowerCase()).toContain(phrase.toLowerCase());
    }
    expect(readme).toMatch(/rounded card grid|pill cluster/i);
    expect(readme).toMatch(/gradient|blur|glass/i);
    expect(readme).toMatch(/beige|terracotta/i);

    const review = readFileSync(
      join(repoRoot, "docs/theme-reviews/field-atlas.md"),
      "utf8",
    );
    expect(review).toMatch(/controller browser matrix:\s*complete/i);
    expect(review).not.toMatch(/pending/i);
    for (const phrase of [
      "2, 3, and 4 authored days",
      "internally horizontal-scrollable",
      "144px",
      "160px",
      "Traditional Chinese authored content",
    ]) {
      expect(review).toContain(phrase);
    }
    expect(review).toMatch(/composition/i);
    expect(review).toMatch(/map grammar/i);
    expect(review).toMatch(/typography|density/i);
    expect(review).toMatch(/component language/i);
    expect(review).toMatch(/icon|status/i);
    expect(review).toMatch(/motion/i);
    expect(review).toMatch(/content framing/i);
    expect(review).toMatch(/grayscale[\s\S]*completed/i);
    expect(review).toMatch(/accent substitution[\s\S]*completed/i);
    expect(review).toMatch(/1440[\s\S]*title[\s\S]*220x46/i);
    expect(review).toMatch(/320[\s\S]*140\/140/i);
    expect(review).toMatch(/forced-colors[\s\S]*playwright/i);
    expect(review).toMatch(/NPS|Felt|Mapbox/);
    expect(review).toMatch(/no.*asset|trade dress/i);

    for (const capture of [
      "field-atlas-grayscale.png",
      "field-atlas-accent-substitution.png",
    ]) {
      const png = readFileSync(
        join(repoRoot, "docs/theme-reviews/assets", capture),
      );
      expect(Array.from(png.subarray(0, 8)), capture).toEqual([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      expect(png.length, capture).toBeGreaterThan(100_000);
      expect(png.readUInt32BE(16), `${capture} width`).toBe(1440);
      expect(png.readUInt32BE(20), `${capture} height`).toBe(1000);
    }
  });
});
