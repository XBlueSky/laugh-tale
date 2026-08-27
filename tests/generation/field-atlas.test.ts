// @vitest-environment jsdom

import {
  existsSync,
  mkdtempSync,
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

const repoRoot = process.cwd();
const pluginRoot = join(repoRoot, "plugins/eternal-pose");
const recipeRoot = join(pluginRoot, "recipes-v2/field-atlas");
const recipePresentationRoot = join(recipeRoot, "presentation");
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
    ...(index === 1
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
    header: { expanded: true },
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
    });

    const profile = profileModule.fieldAtlasMapProfile as MapVisualProfile;
    expect(presentation.mapProfile).toBe(profile);
    expect(profile.basemap).toEqual({
      mode: "topographic",
      density: "high",
      contrast: "high",
      poi: "minimal",
    });
    const defaultMarker = profile.marker(
      {
        ownerId: "node:one",
        label: "Survey stop",
        coordinates: { lat: 10, lng: 20 },
        tone: "default",
      },
      0,
    );
    const selectedMarker = profile.marker(
      {
        ownerId: "node:two",
        label: "Selected stop",
        coordinates: { lat: 10.1, lng: 20.1 },
        tone: "selected",
      },
      1,
    );
    const completedMarker = profile.marker(
      {
        ownerId: "node:three",
        label: "Completed stop",
        coordinates: { lat: 10.2, lng: 20.2 },
        tone: "completed",
      },
      2,
    );
    expect(defaultMarker.parts.map(({ className }) => className)).toContain("stop-number");
    expect(selectedMarker.className).not.toBe(defaultMarker.className);
    expect(completedMarker.className).not.toBe(defaultMarker.className);
    expect(selectedMarker.fallback.stroke).not.toBe(defaultMarker.fallback.stroke);
    expect(completedMarker.parts.map(({ className }) => className)).toContain(
      "atlas-marker__completion",
    );

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
    expect(view.getByRole("navigation", { name: "進入每日行程" })).toHaveClass(
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
        name: new RegExp(`進入 Day 1.*${completeTrip.days[0]?.title ?? ""}`),
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
      view.getByRole("combobox", { name: "Travel journal 採買狀態" }),
    ).toHaveValue("purchased");
    expect(
      view.getByRole("button", { name: /開啟.*當日事項/ }),
    ).toBeVisible();
    expect(view.getByRole("button", { name: "開啟訂位資訊" })).toBeVisible();
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

    fireEvent.click(view.getByRole("button", { name: "回到旅行首頁" }));
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
    fireEvent.click(view.getByRole("button", { name: "確認選擇 Canal counter" }));
    expect(experienceActions.confirmCandidate).toHaveBeenCalledTimes(1);
    fireEvent.change(
      view.getByRole("combobox", { name: "Travel journal 採買狀態" }),
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

  test("documents customization, responsive accessibility, and the pending controller review", () => {
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
    expect(review).toMatch(/controller.*browser.*pending/i);
    expect(review).toMatch(/composition/i);
    expect(review).toMatch(/map grammar/i);
    expect(review).toMatch(/typography|density/i);
    expect(review).toMatch(/component language/i);
    expect(review).toMatch(/icon|status/i);
    expect(review).toMatch(/motion/i);
    expect(review).toMatch(/content framing/i);
    expect(review).toMatch(/grayscale.*pending/i);
    expect(review).toMatch(/accent substitution.*pending/i);
    expect(review).toMatch(/NPS|Felt|Mapbox/);
    expect(review).toMatch(/no.*asset|trade dress/i);
  });
});
