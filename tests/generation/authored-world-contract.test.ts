import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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
    `export { Home } from "./home";
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
};
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
  route: (route: { tone: string; source: string; certainty: string }) => ({
    className: \`route--\${route.tone} route-source--\${route.source} route-certainty--\${route.certainty}\`,
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
