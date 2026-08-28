import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  inspectAuthoredWorld,
  type AuthoredWorldExpectation,
  type AuthoredWorldFinding,
} from "./authored-world-contract.js";

interface SyntheticManifest {
  schemaVersion: number;
  id: string;
  presentation: {
    source: string;
    entry: string;
    css: string[];
    assets: string[];
  };
  map: { profile: string };
  validation: { viewports: number[]; screenshots: string[] };
}

const requiredViewports = [320, 390, 430, 768, 1024, 1440];
const requiredStates = [
  "empty",
  "memory-only",
  "candidate",
  "shopping",
  "reservation",
  "task",
  "route-error",
  "map-error",
];
const temporaryRoots: string[] = [];

function write(root: string, path: string, contents: string): void {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function createSyntheticWorld(): string {
  const root = mkdtempSync(join(tmpdir(), "authored-world-contract-"));
  temporaryRoots.push(root);
  const manifest: SyntheticManifest = {
    schemaVersion: 2,
    id: "synthetic-world",
    presentation: {
      source: "presentation",
      entry: "index.ts",
      css: ["styles/index.css"],
      assets: [],
    },
    map: { profile: "presentation/theme-map-profile.ts" },
    validation: {
      viewports: requiredViewports,
      screenshots: ["home", "experience", "experience-expanded"],
    },
  };
  write(root, "recipe.json", `${JSON.stringify(manifest, null, 2)}\n`);
  write(
    root,
    "README.md",
    `# Synthetic World

## Customization levels

1. Token customization keeps the visual variables local.
2. Component customization replaces one visible module.
3. Presentation customization replaces the presentation tree.
4. Full UI replacement starts again from the headless contract.
`,
  );
  write(
    root,
    "presentation/index.ts",
    `import type { TripPresentation } from "../controllers/presentation-contract";

export { Home } from "./home";
export { Experience } from "./experience";
export { SetupRequired, Loading, FatalError } from "./states/index";
export { syntheticMapProfile } from "./theme-map-profile";

import { Home } from "./home";
import { Experience } from "./experience";
import { SetupRequired, Loading, FatalError } from "./states/index";
import { syntheticMapProfile } from "./theme-map-profile";

export const presentation = {
  Home,
  Experience,
  SetupRequired,
  Loading,
  FatalError,
  mapProfile: syntheticMapProfile,
} satisfies TripPresentation;
`,
  );
  write(
    root,
    "presentation/home.tsx",
    `export function Home() {
  const persistence = "memory-only";
  const items: string[] = [];
  return <main className="synthetic-home mission-select" data-testid="trip-home">
    <p data-contract-state={persistence}>Local progress only</p>
    {items.length === 0 ? <p data-contract-state="empty">No itinerary items.</p> : null}
  </main>;
}
`,
  );
  write(
    root,
    "presentation/experience.tsx",
    `const navigationExample = "https://example.test/directions";

export function Experience() {
  return <main className="synthetic-experience" data-testid="trip-experience">
    <section data-contract-state="candidate">Candidate comparison</section>
    <section data-contract-state="shopping">Shopping status</section>
    <section data-contract-state="reservation">Reservation disclosure</section>
    <section data-contract-state="task">Task checklist</section>
    <section data-contract-state="route-error">Retry route</section>
    <section data-contract-state="map-error">Retry map</section>
    <a href={navigationExample}>Directions</a>
  </main>;
}
`,
  );
  write(
    root,
    "presentation/states/index.tsx",
    `export function SetupRequired() { return <main data-state="setup-required" />; }
export function Loading() { return <main data-state="loading" />; }
export function FatalError() { return <main data-state="fatal-error" />; }
`,
  );
  write(
    root,
    "presentation/theme-map-profile.ts",
    `export const syntheticMapProfile = {
  id: "synthetic-world",
  basemap: { mode: "flat", density: "low", contrast: "high", poi: "minimal" },
  marker: (place: { tone: string }) => ({ className: \`marker--\${place.tone}\` }),
  userLocation: () => ({ className: "marker--location" }),
  route: (route: { tone: string; source: string; certainty: string; mode: string }) => ({
    className: \`route--\${route.tone} route-source--\${route.source} route-certainty--\${route.certainty} route-mode--\${route.mode}\`,
  }),
};
`,
  );
  write(
    root,
    "presentation/styles/index.css",
    `@import "./details.css";

button:focus-visible { outline: 3px solid currentColor; }

@media (max-width: 767px) {
  .synthetic-experience { grid-template-columns: 1fr; }
}

@media (min-width: 768px) {
  .synthetic-experience { grid-template-columns: 18rem 1fr; }
}

@media (forced-colors: active) {
  button:focus-visible { outline: 3px solid CanvasText; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0s; animation-duration: 0s; }
}
`,
  );
  write(root, "presentation/styles/details.css", ".stage-list { display: grid; }\n");
  return root;
}

function expectation(
  overrides: Partial<AuthoredWorldExpectation> = {},
): AuthoredWorldExpectation {
  return {
    id: "synthetic-world",
    requiredSourceSignals: [/mission-select/, /stage-list/],
    forbiddenSourceSignals: [/neon-grid/],
    requiredMapModes: ["flat"],
    requiredStates,
    ...overrides,
  };
}

function replace(root: string, path: string, from: string | RegExp, to = ""): void {
  const file = join(root, path);
  const source = readFileSync(file, "utf8");
  const next = source.replace(from, to);
  if (next === source) throw new Error(`Synthetic mutation did not change ${path}`);
  writeFileSync(file, next);
}

function mutateManifest(
  root: string,
  mutate: (manifest: SyntheticManifest) => void,
): void {
  const path = join(root, "recipe.json");
  const manifest = JSON.parse(readFileSync(path, "utf8")) as SyntheticManifest;
  mutate(manifest);
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function findingsWithCode(
  findings: readonly AuthoredWorldFinding[],
  code: string,
): AuthoredWorldFinding[] {
  return findings.filter((finding) => finding.code === code);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("inspectAuthoredWorld", () => {
  test("accepts a complete authored world and follows its local import graph", () => {
    const root = createSyntheticWorld();

    expect(inspectAuthoredWorld(root, expectation())).toEqual([]);
  });

  test.each([
    "Home",
    "Experience",
    "SetupRequired",
    "Loading",
    "FatalError",
  ])("reports a missing %s presentation view", (view) => {
    const root = createSyntheticWorld();
    replace(root, "presentation/index.ts", new RegExp(`^  ${view},\\n`, "m"));

    const findings = inspectAuthoredWorld(root, expectation());
    const missing = findingsWithCode(findings, "missing-presentation-view");

    expect(missing).toHaveLength(1);
    expect(missing[0]?.path).toBe("presentation/index.ts");
    expect(missing[0]?.message).toContain(view);
  });

  test("accepts quoted own presentation keys through type, parenthesis, as, and satisfies wrappers", () => {
    const root = createSyntheticWorld();
    replace(
      root,
      "presentation/index.ts",
      `export const presentation = {
  Home,
  Experience,
  SetupRequired,
  Loading,
  FatalError,
  mapProfile: syntheticMapProfile,
} satisfies TripPresentation;`,
      `export const presentation: TripPresentation = (({
  "Home": Home,
  'Experience': Experience,
  "SetupRequired": SetupRequired,
  'Loading': Loading,
  "FatalError": FatalError,
  mapProfile: syntheticMapProfile,
} as TripPresentation) satisfies TripPresentation);`,
    );

    expect(findingsWithCode(
      inspectAuthoredWorld(root, expectation()),
      "missing-presentation-view",
    )).toEqual([]);
  });

  test("resolves a presentation directly re-exported from a recipe-owned module", () => {
    const root = createSyntheticWorld();
    const entryPath = join(root, "presentation/index.ts");
    const entrySource = readFileSync(entryPath, "utf8");
    write(root, "presentation/world.ts", entrySource);
    write(root, "presentation/index.ts", 'export { presentation } from "./world";\n');

    expect(inspectAuthoredWorld(root, expectation())).toEqual([]);
  });

  test("resolves an entry-local value exported under the presentation name", () => {
    const root = createSyntheticWorld();
    replace(
      root,
      "presentation/index.ts",
      "export const presentation =",
      "const localPresentation =",
    );
    const entryPath = join(root, "presentation/index.ts");
    writeFileSync(
      entryPath,
      `${readFileSync(entryPath, "utf8")}\nexport { localPresentation as presentation };\n`,
    );

    expect(inspectAuthoredWorld(root, expectation())).toEqual([]);
  });

  test("resolves an imported alias exported under the presentation name", () => {
    const root = createSyntheticWorld();
    const entryPath = join(root, "presentation/index.ts");
    const worldSource = readFileSync(entryPath, "utf8").replace(
      "export const presentation =",
      "export const authoredWorld =",
    );
    write(root, "presentation/world.ts", worldSource);
    write(
      root,
      "presentation/index.ts",
      `import { authoredWorld as importedWorld } from "./world";
export { importedWorld as presentation };
`,
    );

    expect(inspectAuthoredWorld(root, expectation())).toEqual([]);
  });

  test.each([
    ["bare package", "external-presentation"],
    ["controller boundary", "../controllers/presentation-contract"],
  ])("does not let a complete local decoy satisfy a %s presentation re-export", (_label, target) => {
    const root = createSyntheticWorld();
    replace(
      root,
      "presentation/index.ts",
      "export const presentation =",
      "const localPresentation =",
    );
    const entryPath = join(root, "presentation/index.ts");
    writeFileSync(
      entryPath,
      `${readFileSync(entryPath, "utf8")}\nexport { localPresentation as presentation } from ${JSON.stringify(target)};\n`,
    );

    const findings = inspectAuthoredWorld(root, expectation());

    expect(findingsWithCode(findings, "missing-presentation-view")).toHaveLength(5);
    expect(findingsWithCode(findings, "missing-root-signature")).toHaveLength(2);
    expect(findingsWithCode(findings, "unresolved-map-profile")).toHaveLength(1);
  });

  test.each(["cyclic", "unresolved"])(
    "fails closed deterministically for a %s presentation export graph",
    (kind) => {
      const root = createSyntheticWorld();
      if (kind === "cyclic") {
        write(root, "presentation/index.ts", 'export { presentation } from "./cycle-a";\n');
        write(root, "presentation/cycle-a.ts", 'export { presentation } from "./cycle-b";\n');
        write(root, "presentation/cycle-b.ts", 'export { presentation } from "./cycle-a";\n');
      } else {
        write(root, "presentation/index.ts", 'export { missing as presentation } from "./world";\n');
        write(root, "presentation/world.ts", "export const other = {};\n");
      }

      const first = inspectAuthoredWorld(root, expectation());
      const second = inspectAuthoredWorld(root, expectation());

      expect(first).toEqual(second);
      expect(findingsWithCode(first, "missing-presentation-view")).toHaveLength(5);
      expect(findingsWithCode(first, "unresolved-map-profile")).toHaveLength(1);
    },
  );

  test("does not count nested, typed, or string presentation-key decoys", () => {
    const root = createSyntheticWorld();
    replace(
      root,
      "presentation/index.ts",
      "  Home,\n  Experience,",
      `  nested: { Home },
  keyLabel: "Home",
  Experience,`,
    );
    const entryPath = join(root, "presentation/index.ts");
    writeFileSync(
      entryPath,
      `${readFileSync(entryPath, "utf8")}
type PresentationShapeDecoy = { Home: unknown };
const deadPresentation = { Home } satisfies PresentationShapeDecoy;
void deadPresentation;
`,
    );

    const missing = findingsWithCode(
      inspectAuthoredWorld(root, expectation()),
      "missing-presentation-view",
    );

    expect(missing).toHaveLength(1);
    expect(missing[0]?.message).toContain("Home");
  });

  test("binds root signatures to the referenced components instead of reachable JSX decoys", () => {
    const root = createSyntheticWorld();
    const experiencePath = join(root, "presentation/experience.tsx");
    writeFileSync(
      experiencePath,
      `const deadHomeRoot = <main className="synthetic-experience" data-testid="trip-home" />;
${readFileSync(experiencePath, "utf8")}
void deadHomeRoot;
`,
    );

    const findings = inspectAuthoredWorld(root, expectation());

    expect(findingsWithCode(findings, "identical-root-signature")).toEqual([]);
    expect(findingsWithCode(findings, "missing-root-signature")).toEqual([]);
  });

  test("ignores quoted, typed, nested-function, and dead JSX root decoys", () => {
    const root = createSyntheticWorld();
    replace(
      root,
      "presentation/home.tsx",
      `export function Home() {
  const persistence = "memory-only";
  const items: string[] = [];
  return <main className="synthetic-home mission-select" data-testid="trip-home">
    <p data-contract-state={persistence}>Local progress only</p>
    {items.length === 0 ? <p data-contract-state="empty">No itinerary items.</p> : null}
  </main>;
}`,
      `const quotedRoot = '<main data-testid="trip-home" />';
type TypedRoot = { "trip-home": string };
const deadRoot = <main className="synthetic-home mission-select" data-testid="trip-home" />;
function nestedRootDecoy() {
  return <main className="synthetic-home mission-select" data-testid="trip-home" />;
}

export function Home() {
  const persistence = "memory-only";
  const items: string[] = [];
  void quotedRoot; void deadRoot; void nestedRootDecoy;
  return <section className="actual-home mission-select">
    <p data-contract-state={persistence}>Local progress only</p>
    {items.length === 0 ? <p data-contract-state="empty">No itinerary items.</p> : null}
  </section>;
}`,
    );

    const missing = findingsWithCode(
      inspectAuthoredWorld(root, expectation()),
      "missing-root-signature",
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]?.message).toContain("Home");
  });

  test("fails closed when an actual presentation component cannot be resolved", () => {
    const root = createSyntheticWorld();
    replace(root, "presentation/index.ts", "  Home,\n", "  Home: MissingHome,\n");

    const findings = inspectAuthoredWorld(root, expectation());

    expect(findingsWithCode(findings, "unresolved-presentation-component")).toEqual([
      {
        code: "unresolved-presentation-component",
        path: "presentation/index.ts",
        message: "Presentation Home must resolve to a local component declaration",
      },
    ]);
    const missingRoot = findingsWithCode(findings, "missing-root-signature");
    expect(missingRoot).toHaveLength(1);
    expect(missingRoot[0]?.message).toContain("Home");
  });

  test("resolves local arrow-expression and arrow-block presentation components", () => {
    const root = createSyntheticWorld();
    replace(root, "presentation/home.tsx", ' data-testid="trip-home"', "");
    replace(root, "presentation/experience.tsx", ' data-testid="trip-experience"', "");
    write(
      root,
      "presentation/local-components.tsx",
      `export const LocalHome = () => <main className="local-home" data-testid="trip-home" />;
export const LocalExperience = () => {
  return <main className="local-experience" data-testid="trip-experience" />;
};
`,
    );
    replace(
      root,
      "presentation/index.ts",
      `import { Home } from "./home";`,
      `import { Home } from "./home";
import { LocalHome, LocalExperience } from "./local-components";`,
    );
    replace(root, "presentation/index.ts", "  Home,\n", "  Home: LocalHome,\n");
    replace(root, "presentation/index.ts", "  Experience,\n", "  Experience: LocalExperience,\n");

    const findings = inspectAuthoredWorld(root, expectation());

    expect(findingsWithCode(findings, "unresolved-presentation-component")).toEqual([]);
    expect(findingsWithCode(findings, "missing-root-signature")).toEqual([]);
    expect(findingsWithCode(findings, "identical-root-signature")).toEqual([]);
  });

  test.each(requiredStates)("reports a missing %s treatment", (state) => {
    const root = createSyntheticWorld();
    const path = state === "empty" || state === "memory-only"
      ? "presentation/home.tsx"
      : "presentation/experience.tsx";
    if (state === "memory-only") {
      replace(root, path, /"memory-only"/g, '"local-only"');
    } else if (state === "empty") {
      replace(root, path, /items\.length === 0[\s\S]*? : null}/, "null");
    } else {
      replace(root, path, new RegExp(`^.*data-contract-state="${state}".*\\n`, "m"));
    }

    const findings = inspectAuthoredWorld(root, expectation());
    const missing = findingsWithCode(findings, "missing-state-treatment");

    expect(missing.some(({ message }) => message.includes(state))).toBe(true);
  });

  test.each([
    ["marker tone", /place\.tone/g, "place.label"],
    ["route tone", /route\.tone/g, "route.label"],
    ["route source", /route\.source/g, "route.label"],
    ["route certainty", /route\.certainty/g, "route.label"],
    ["route mode", /route\.mode/g, "route.label"],
  ] as const)("reports a map profile missing the %s fixture axis", (_axis, from, to) => {
    const root = createSyntheticWorld();
    replace(root, "presentation/theme-map-profile.ts", from, to);

    const findings = inspectAuthoredWorld(root, expectation());

    expect(findingsWithCode(findings, "missing-map-profile-axis")).toHaveLength(1);
  });

  test("reports an expectation-required basemap mode missing from the profile", () => {
    const root = createSyntheticWorld();
    replace(root, "presentation/theme-map-profile.ts", 'mode: "flat"', 'mode: "neutral"');

    const missing = findingsWithCode(
      inspectAuthoredWorld(root, expectation()),
      "missing-map-mode",
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]?.path).toBe("presentation/theme-map-profile.ts");
    expect(missing[0]?.message).toContain("flat");
  });

  test("does not let dead constants and unrelated callbacks satisfy the actual map profile", () => {
    const root = createSyntheticWorld();
    replace(root, "presentation/theme-map-profile.ts", /place\.tone/g, "place.label");
    replace(root, "presentation/theme-map-profile.ts", /route\.tone/g, "route.label");
    replace(root, "presentation/theme-map-profile.ts", /route\.source/g, "route.label");
    replace(root, "presentation/theme-map-profile.ts", /route\.certainty/g, "route.label");
    replace(root, "presentation/theme-map-profile.ts", /route\.mode/g, "route.label");
    const profilePath = join(root, "presentation/theme-map-profile.ts");
    writeFileSync(
      profilePath,
      `${readFileSync(profilePath, "utf8")}
const deadFlatMode = "flat";
const deadMarker = (place: { tone: string }) => place.tone;
const deadRoute = (route: { tone: string; source: string; certainty: string; mode: string }) =>
  [route.tone, route.source, route.certainty, route.mode];
void deadFlatMode; void deadMarker; void deadRoute;
`,
    );

    const missing = findingsWithCode(
      inspectAuthoredWorld(root, expectation()),
      "missing-map-profile-axis",
    );

    expect(missing.map(({ message }) => message)).toEqual([
      "Map profile marker must consume its own tone fixture",
      "Map profile route must consume its own certainty fixture",
      "Map profile route must consume its own mode fixture",
      "Map profile route must consume its own source fixture",
      "Map profile route must consume its own tone fixture",
    ]);
  });

  test("requires the actual basemap mode instead of a dead quoted mode", () => {
    const root = createSyntheticWorld();
    replace(root, "presentation/theme-map-profile.ts", 'mode: "flat"', 'mode: "neutral"');
    const profilePath = join(root, "presentation/theme-map-profile.ts");
    writeFileSync(
      profilePath,
      `${readFileSync(profilePath, "utf8")}
const deadRequiredMode = "flat";
void deadRequiredMode;
`,
    );

    expect(findingsWithCode(
      inspectAuthoredWorld(root, expectation()),
      "missing-map-mode",
    )).toHaveLength(1);
  });

  test("traces callback-owned aliases and destructuring back to map fixture parameters", () => {
    const root = createSyntheticWorld();
    replace(
      root,
      "presentation/theme-map-profile.ts",
      'marker: (place: { tone: string }) => ({ className: `marker--${place.tone}` }),',
      [
        "marker: (place: { tone: string }) => {",
        "    const markerFixture = place;",
        "    const { tone: markerTone } = markerFixture;",
        "    return { className: `marker--${markerTone}` };",
        "  },",
      ].join("\n"),
    );
    replace(
      root,
      "presentation/theme-map-profile.ts",
      [
        "route: (route: { tone: string; source: string; certainty: string; mode: string }) => ({",
        '    className: `route--${route.tone} route-source--${route.source} route-certainty--${route.certainty} route-mode--${route.mode}`,',
        "  }),",
      ].join("\n"),
      [
        "route: ({ tone, source: routeSource, certainty, mode }: {",
        "    tone: string;",
        "    source: string;",
        "    certainty: string;",
        "    mode: string;",
        "  }) => ({",
        '    className: `route--${tone} route-source--${routeSource} route-certainty--${certainty} route-mode--${mode}`,',
        "  }),",
      ].join("\n"),
    );

    expect(findingsWithCode(
      inspectAuthoredWorld(root, expectation()),
      "missing-map-profile-axis",
    )).toEqual([]);
  });

  test("traces const alias chains and renamed local destructuring to the route parameter", () => {
    const root = createSyntheticWorld();
    replace(
      root,
      "presentation/theme-map-profile.ts",
      [
        "route: (route: { tone: string; source: string; certainty: string; mode: string }) => ({",
        '    className: `route--${route.tone} route-source--${route.source} route-certainty--${route.certainty} route-mode--${route.mode}`,',
        "  }),",
      ].join("\n"),
      [
        "route: (route: { tone: string; source: string; certainty: string; mode: string }) => {",
        "    const routeFixture = route;",
        "    const routeAlias = routeFixture;",
        "    const { tone: routeTone, source: routeSource, certainty: routeCertainty, mode: routeMode } = routeAlias;",
        "    return {",
        "      className: `route--${routeTone} route-source--${routeSource} route-certainty--${routeCertainty} route-mode--${routeMode}` ,",
        "    };",
        "  },",
      ].join("\n"),
    );

    expect(findingsWithCode(
      inspectAuthoredWorld(root, expectation()),
      "missing-map-profile-axis",
    )).toEqual([]);
  });

  test.each([
    [
      "same-name nested block object",
      [
        "route: (route: { tone: string; source: string; certainty: string; mode: string }) => {",
        "    {",
        '      const route = { tone: "decoy", source: "decoy", certainty: "decoy", mode: "decoy" };',
        "      return { className: `${route.tone} ${route.source} ${route.certainty} ${route.mode}` };",
        "    }",
        "  },",
      ].join("\n"),
    ],
    [
      "same-name catch binding",
      [
        "route: (route: { tone: string; source: string; certainty: string; mode: string }) => {",
        "    try {",
        '      throw { tone: "decoy", source: "decoy", certainty: "decoy", mode: "decoy" };',
        "    } catch (route) {",
        "      return { className: `${route.tone} ${route.source} ${route.certainty} ${route.mode}` };",
        "    }",
        "  },",
      ].join("\n"),
    ],
    [
      "same-name nested function parameter",
      [
        "route: (route: { tone: string; source: string; certainty: string; mode: string }) => {",
        "    const renderRoute = (route: { tone: string; source: string; certainty: string; mode: string }) =>",
        "      `${route.tone} ${route.source} ${route.certainty} ${route.mode}`;",
        '    return { className: renderRoute({ tone: "decoy", source: "decoy", certainty: "decoy", mode: "decoy" }) };',
        "  },",
      ].join("\n"),
    ],
    [
      "destructuring source shadow",
      [
        "route: (route: { tone: string; source: string; certainty: string; mode: string }) => {",
        '    const decoy = { tone: "decoy", source: "decoy", certainty: "decoy", mode: "decoy" };',
        "    {",
        "      const route = decoy;",
        "      const { tone, source: routeSource, certainty, mode } = route;",
        "      return { className: `${tone} ${routeSource} ${certainty} ${mode}` };",
        "    }",
        "  },",
      ].join("\n"),
    ],
  ])("does not let a %s impersonate the route fixture", (_label, replacement) => {
    const root = createSyntheticWorld();
    replace(
      root,
      "presentation/theme-map-profile.ts",
      [
        "route: (route: { tone: string; source: string; certainty: string; mode: string }) => ({",
        '    className: `route--${route.tone} route-source--${route.source} route-certainty--${route.certainty} route-mode--${route.mode}`,',
        "  }),",
      ].join("\n"),
      replacement,
    );

    expect(findingsWithCode(
      inspectAuthoredWorld(root, expectation()),
      "missing-map-profile-axis",
    ).map(({ message }) => message)).toEqual([
      "Map profile route must consume its own certainty fixture",
      "Map profile route must consume its own mode fixture",
      "Map profile route must consume its own source fixture",
      "Map profile route must consume its own tone fixture",
    ]);
  });

  test("fails closed when presentation.mapProfile cannot resolve to the declared profile", () => {
    const root = createSyntheticWorld();
    replace(
      root,
      "presentation/index.ts",
      "  mapProfile: syntheticMapProfile,",
      "  mapProfile: MissingMapProfile,",
    );

    expect(findingsWithCode(
      inspectAuthoredWorld(root, expectation()),
      "unresolved-map-profile",
    )).toEqual([
      {
        code: "unresolved-map-profile",
        path: "presentation/index.ts",
        message: "Presentation mapProfile must resolve to the declared local map profile",
      },
    ]);
  });

  test("reports missing declared and source-level responsive viewport coverage", () => {
    const root = createSyntheticWorld();
    mutateManifest(root, (manifest) => {
      manifest.validation.viewports = manifest.validation.viewports.filter(
        (viewport) => viewport !== 390,
      );
    });
    replace(
      root,
      "presentation/styles/index.css",
      /@media \(max-width: 767px\) \{[\s\S]*?\}\n\n/,
    );

    const findings = inspectAuthoredWorld(root, expectation());

    const missingDeclaration = findingsWithCode(findings, "missing-declared-viewport");
    expect(missingDeclaration).toHaveLength(1);
    expect(missingDeclaration[0]?.path).toBe("recipe.json");
    expect(missingDeclaration[0]?.message).toContain("390");
    expect(findingsWithCode(findings, "missing-responsive-coverage").map(({ message }) => message)).toEqual([
      "Declared CSS media queries must cover the 320px viewport",
      "Declared CSS media queries must cover the 390px viewport",
      "Declared CSS media queries must cover the 430px viewport",
    ]);
  });

  test.each([
    ["focus-visible", ":focus-visible", "missing-focus-visible"],
    ["forced colors", "@media (forced-colors: active)", "missing-forced-colors"],
    ["reduced motion", "@media (prefers-reduced-motion: reduce)", "missing-reduced-motion"],
  ] as const)("reports missing %s CSS treatment", (_label, signal, code) => {
    const root = createSyntheticWorld();
    replace(
      root,
      "presentation/styles/index.css",
      new RegExp(signal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      signal.replaceAll("-", "_"),
    );

    expect(findingsWithCode(inspectAuthoredWorld(root, expectation()), code)).toHaveLength(1);
  });

  test.each([
    [
      "remote imports",
      "presentation/experience.tsx",
      '\nimport "https://example.test/copied-world.js";\n',
      "forbidden-remote-import",
    ],
    [
      "data URLs",
      "presentation/styles/details.css",
      '\n.foreign { background-image: url("data:image/svg+xml;base64,AAAA"); }\n',
      "forbidden-data-url",
    ],
    [
      "gradients",
      "presentation/styles/details.css",
      "\n.foreign { background: linear-gradient(red, blue); }\n",
      "forbidden-gradient",
    ],
    [
      "backdrop filters",
      "presentation/styles/details.css",
      "\n.foreign { -webkit-backdrop-filter: blur(8px); }\n",
      "forbidden-backdrop-filter",
    ],
    [
      "text background clipping",
      "presentation/styles/details.css",
      "\n.foreign { -webkit-background-clip: text; }\n",
      "forbidden-text-clip",
    ],
    [
      "sibling recipe IDs",
      "presentation/experience.tsx",
      '\nconst borrowedRecipe = "field-atlas";\n',
      "sibling-recipe-reference",
    ],
    [
      "expectation-specific forbidden signals",
      "presentation/experience.tsx",
      '\nconst visualLanguage = "neon-grid";\n',
      "forbidden-source-signal",
    ],
  ] as const)("rejects reachable %s", (_label, path, addition, code) => {
    const root = createSyntheticWorld();
    writeFileSync(join(root, path), `${readFileSync(join(root, path), "utf8")}${addition}`);

    expect(findingsWithCode(inspectAuthoredWorld(root, expectation()), code)).toEqual([
      expect.objectContaining({ path }),
    ]);
  });

  test.each([
    "Token customization",
    "Component customization",
    "Presentation customization",
    "Full UI replacement",
  ])("reports an undocumented %s level", (level) => {
    const root = createSyntheticWorld();
    replace(root, "README.md", level, "Undocumented customization");

    const missing = findingsWithCode(
      inspectAuthoredWorld(root, expectation()),
      "missing-customization-level",
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]?.path).toBe("README.md");
    expect(missing[0]?.message).toContain(level);
  });

  test("reports identical Home and Experience root signatures", () => {
    const root = createSyntheticWorld();
    replace(
      root,
      "presentation/experience.tsx",
      "synthetic-experience",
      "synthetic-home mission-select",
    );

    const identical = findingsWithCode(
      inspectAuthoredWorld(root, expectation()),
      "identical-root-signature",
    );
    expect(identical).toHaveLength(1);
    expect(identical[0]?.path).toBe("presentation/experience.tsx");
    expect(identical[0]?.message).toMatch(/Home.*Experience/i);
  });

  test("does not let undeclared files satisfy or poison the result", () => {
    const root = createSyntheticWorld();
    write(
      root,
      "presentation/foreign.tsx",
      `import "https://example.test/foreign.js";
const copied = "field-atlas";
const required = "mission-select";
const visual = "neon-grid linear-gradient";
`,
    );
    write(
      root,
      "presentation/styles/foreign.css",
      ":focus-visible { background: linear-gradient(red, blue); }\n",
    );

    expect(inspectAuthoredWorld(root, expectation())).toEqual([]);

    replace(root, "presentation/home.tsx", "mission-select", "mission-index");
    replace(root, "presentation/styles/index.css", /:focus-visible/g, ":focus_visible");
    const findings = inspectAuthoredWorld(root, expectation());

    const missingSignal = findingsWithCode(findings, "missing-required-source-signal");
    expect(missingSignal).toHaveLength(1);
    expect(missingSignal[0]?.message).toContain("mission-select");
    expect(findingsWithCode(findings, "missing-focus-visible")).toHaveLength(1);
    expect(findings.some(({ code }) => code.startsWith("forbidden-") || code === "sibling-recipe-reference")).toBe(false);
  });

  test("ignores import-like comments, strings, regexes, JSX text, and ordinary templates", () => {
    const root = createSyntheticWorld();
    write(
      root,
      "presentation/foreign.tsx",
      'import "https://example.test/poison.js";\nexport const poison = "field-atlas";\n',
    );
    const entryPath = join(root, "presentation/experience.tsx");
    writeFileSync(
      entryPath,
      `${readFileSync(entryPath, "utf8")}
// import "./foreign";
/* export { poison } from "./foreign"; */
const quotedImport = 'import "./foreign"';
const ordinaryTemplate = \`import("./foreign")\`;
const importPattern = /import\\("\\.\\/foreign"\\)/;
const jsxText = <span>import("./foreign")</span>;
void quotedImport; void ordinaryTemplate; void importPattern; void jsxText;
`,
    );

    expect(inspectAuthoredWorld(root, expectation())).toEqual([]);
  });

  test("follows literal dynamic imports with options and rejects remote ones", () => {
    const root = createSyntheticWorld();
    write(root, "presentation/dynamic-source.ts", 'export const dynamicSignal = "dynamic-stage";\n');
    const entryPath = join(root, "presentation/index.ts");
    writeFileSync(
      entryPath,
      `${readFileSync(entryPath, "utf8")}
void import(\`./dynamic-source\`, { with: { type: "json" } });
void import(\`https://example.test/remote.js\`, { with: { type: "javascript" } });
`,
    );

    const findings = inspectAuthoredWorld(root, expectation({
      requiredSourceSignals: [/mission-select/, /stage-list/, /dynamic-stage/],
    }));

    expect(findingsWithCode(findings, "missing-required-source-signal")).toEqual([]);
    expect(findingsWithCode(findings, "forbidden-remote-import")).toHaveLength(1);
  });

  test("fails closed for an interpolated local dynamic import", () => {
    const root = createSyntheticWorld();
    const entryPath = join(root, "presentation/index.ts");
    writeFileSync(
      entryPath,
      `${readFileSync(entryPath, "utf8")}
const selectedModule = "dynamic-source";
void import(\`./\${selectedModule}.tsx\`, { with: { type: "javascript" } });
`,
    );

    const findings = inspectAuthoredWorld(root, expectation());

    expect(findingsWithCode(findings, "unresolved-dynamic-import")).toEqual([
      {
        code: "unresolved-dynamic-import",
        path: "presentation/index.ts",
        message: "Local dynamic import must use a static string literal",
      },
    ]);
  });

  test.each([
    ["bare-looking expression", 'const target = "react"; void import(target);'],
    ["interpolated remote URL", 'const host = "example.test"; void import(`https://${host}/remote.js`);'],
    ["interpolated file URL", 'const fileName = "secret.ts"; void import(`file:///tmp/${fileName}`);'],
    ["interpolated data URL", 'const payload = "export default 1"; void import(`data:text/javascript,${payload}`);'],
  ])("fails closed for a non-literal dynamic import with a %s", (_label, statement) => {
    const root = createSyntheticWorld();
    const entryPath = join(root, "presentation/index.ts");
    writeFileSync(
      entryPath,
      `${readFileSync(entryPath, "utf8")}\n${statement}\n`,
    );

    expect(findingsWithCode(
      inspectAuthoredWorld(root, expectation()),
      "unresolved-dynamic-import",
    )).toEqual([
      {
        code: "unresolved-dynamic-import",
        path: "presentation/index.ts",
        message: "Local dynamic import must use a static string literal",
      },
    ]);
  });

  test.each([
    ["remote scheme", "ftp://example.test/world.js", "forbidden-remote-import"],
    ["file URL", "file:///tmp/outside.ts", "unsafe-import-specifier"],
    ["data URL", "data:text/javascript,export default 1", "unsafe-import-specifier"],
    ["absolute POSIX path", "/tmp/outside.ts", "unsafe-import-specifier"],
    ["absolute Windows slash path", "C:/outside.ts", "unsafe-import-specifier"],
    ["absolute Windows backslash path", "C:\\outside.ts", "unsafe-import-specifier"],
    ["UNC path", "\\\\server\\share\\outside.ts", "unsafe-import-specifier"],
    ["backslash package lookalike", "package\\subpath", "unsafe-import-specifier"],
  ])("rejects a static JS/TS %s", (_label, specifier, code) => {
    const root = createSyntheticWorld();
    const entryPath = join(root, "presentation/index.ts");
    writeFileSync(
      entryPath,
      `${readFileSync(entryPath, "utf8")}\nimport ${JSON.stringify(specifier)};\n`,
    );

    expect(findingsWithCode(inspectAuthoredWorld(root, expectation()), code)).toEqual([
      expect.objectContaining({ path: "presentation/index.ts" }),
    ]);
  });

  test("allows true bare JS/TS package specifiers", () => {
    const root = createSyntheticWorld();
    const entryPath = join(root, "presentation/index.ts");
    writeFileSync(
      entryPath,
      `${readFileSync(entryPath, "utf8")}\nimport "react";\nimport "@scope/package/subpath";\n`,
    );

    const findings = inspectAuthoredWorld(root, expectation());

    expect(findingsWithCode(findings, "unsafe-import-specifier")).toEqual([]);
    expect(findingsWithCode(findings, "forbidden-remote-import")).toEqual([]);
  });

  test.each([
    ["remote URL", "https://example.test/world.css", "forbidden-remote-import"],
    ["file URL", "file:///tmp/outside.css", "unsafe-import-specifier"],
    ["data URL", "data:text/css,.poison%7Bcolor:red%7D", "unsafe-import-specifier"],
    ["absolute POSIX path", "/tmp/outside.css", "unsafe-import-specifier"],
    ["absolute Windows path", "C:/outside.css", "unsafe-import-specifier"],
    ["UNC path", "\\\\server\\share\\outside.css", "unsafe-import-specifier"],
    ["backslash path", ".\\outside.css", "unsafe-import-specifier"],
    ["bare package", "reset-package", "unsafe-import-specifier"],
  ])("rejects a CSS @import %s", (_label, specifier, code) => {
    const root = createSyntheticWorld();
    const cssPath = join(root, "presentation/styles/index.css");
    writeFileSync(
      cssPath,
      `@import ${JSON.stringify(specifier)};\n${readFileSync(cssPath, "utf8")}`,
    );

    expect(findingsWithCode(inspectAuthoredWorld(root, expectation()), code)).toEqual([
      expect.objectContaining({ path: "presentation/styles/index.css" }),
    ]);
  });

  test("rejects an absolute import without reading or trusting its target", () => {
    const root = createSyntheticWorld();
    replace(root, "presentation/home.tsx", "mission-select", "mission-index");
    write(root, "outside.ts", 'import "https://example.test/poison.js"; export const signal = "mission-select";\n');
    const outsidePath = join(root, "outside.ts");
    const entryPath = join(root, "presentation/index.ts");
    writeFileSync(
      entryPath,
      `${readFileSync(entryPath, "utf8")}\nimport ${JSON.stringify(outsidePath)};\n`,
    );

    const findings = inspectAuthoredWorld(root, expectation());

    expect(findingsWithCode(findings, "unsafe-import-specifier")).toHaveLength(1);
    expect(findingsWithCode(findings, "missing-required-source-signal")).toHaveLength(1);
    expect(findingsWithCode(findings, "forbidden-remote-import")).toHaveLength(0);
  });

  test.each([
    '@import "./details.css";',
    "@import './details.css';",
    "@import url(./details.css);",
    '@import url("./details.css");',
    "@import /* local */ url( './details.css' );",
  ])("follows the CSS dependency form %s", (rule) => {
    const root = createSyntheticWorld();
    if (rule !== '@import "./details.css";') {
      replace(root, "presentation/styles/index.css", '@import "./details.css";', rule);
    }

    expect(inspectAuthoredWorld(root, expectation())).toEqual([]);
  });

  test("ignores CSS import-like comments and declaration strings", () => {
    const root = createSyntheticWorld();
    write(root, "presentation/styles/foreign.css", ".foreign { background: linear-gradient(red, blue); }\n");
    const cssPath = join(root, "presentation/styles/index.css");
    writeFileSync(
      cssPath,
      `${readFileSync(cssPath, "utf8")}
/* @import url("./foreign.css"); */
.import-example::before { content: '@import url("./foreign.css")'; }
`,
    );

    expect(inspectAuthoredWorld(root, expectation())).toEqual([]);
  });

  test("lets a reachable foreign file satisfy requirements and report poison", () => {
    const root = createSyntheticWorld();
    replace(root, "presentation/home.tsx", "mission-select", "mission-index");
    write(
      root,
      "presentation/foreign.tsx",
      'import "https://example.test/reachable-poison.js";\nexport const sourceSignal = "mission-select";\n',
    );
    const entryPath = join(root, "presentation/index.ts");
    writeFileSync(entryPath, `${readFileSync(entryPath, "utf8")}\nimport "./foreign";\n`);

    const findings = inspectAuthoredWorld(root, expectation());

    expect(findingsWithCode(findings, "missing-required-source-signal")).toEqual([]);
    expect(findingsWithCode(findings, "forbidden-remote-import")).toHaveLength(1);
  });

  test("rejects a reachable symbolic-link import without reading its target", () => {
    const root = createSyntheticWorld();
    replace(root, "presentation/home.tsx", "mission-select", "mission-index");
    write(root, "outside.ts", 'export const sourceSignal = "mission-select";\n');
    symlinkSync(join(root, "outside.ts"), join(root, "presentation/linked.ts"));
    const entryPath = join(root, "presentation/index.ts");
    writeFileSync(entryPath, `${readFileSync(entryPath, "utf8")}\nimport "./linked";\n`);

    const findings = inspectAuthoredWorld(root, expectation());

    expect(findingsWithCode(findings, "unsafe-local-import")).toHaveLength(1);
    expect(findingsWithCode(findings, "missing-required-source-signal")).toHaveLength(1);
  });

  test("rejects nonregular, escaping, and unresolved reachable imports", () => {
    const root = createSyntheticWorld();
    mkdirSync(join(root, "presentation/not-a-file.ts"));
    write(root, "outside.ts", 'import "https://example.test/outside-poison.js";\n');
    const entryPath = join(root, "presentation/index.ts");
    writeFileSync(
      entryPath,
      `${readFileSync(entryPath, "utf8")}
import "./not-a-file.ts";
import "../outside.ts";
import "./missing-local-module";
`,
    );

    const findings = inspectAuthoredWorld(root, expectation());

    expect(findingsWithCode(findings, "unsafe-local-import")).toHaveLength(2);
    expect(findingsWithCode(findings, "unresolved-local-import")).toHaveLength(1);
    expect(findingsWithCode(findings, "forbidden-remote-import")).toHaveLength(0);
  });

  test("returns de-duplicated findings in stable path/code/message order", () => {
    const root = createSyntheticWorld();
    replace(root, "README.md", "Token customization", "Missing token level");
    replace(root, "presentation/home.tsx", "mission-select", "mission-index");
    writeFileSync(
      join(root, "presentation/styles/details.css"),
      ".stage-list { background: linear-gradient(red, blue); backdrop-filter: blur(2px); }\n",
    );

    const first = inspectAuthoredWorld(root, expectation());
    const second = inspectAuthoredWorld(root, expectation());
    const sorted = [...first].sort((left, right) =>
      left.path.localeCompare(right.path) ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message),
    );

    expect(first).toEqual(second);
    expect(first).toEqual(sorted);
    expect(new Set(first.map((finding) => JSON.stringify(finding))).size).toBe(first.length);
  });
});
