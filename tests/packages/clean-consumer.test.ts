import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const temporaryRoots: string[] = [];

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function run(command: string, commandArguments: string[], cwd: string): string {
  const result = spawnSync(command, commandArguments, { cwd, encoding: "utf8", shell: false });
  expect(
    result.status,
    `${command} ${commandArguments.join(" ")}:\n${result.stdout}\n${result.stderr}`,
  ).toBe(0);
  return result.stdout;
}

function npm(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function pack(packageDir: string, destination: string): string {
  run(npm(), ["run", "build", "--ignore-scripts"], packageDir);
  const [report] = JSON.parse(
    run(npm(), ["pack", "--json", "--pack-destination", destination], packageDir),
  ) as Array<{ filename: string }>;
  return join(destination, report.filename);
}

describe("clean tarball consumer", () => {
  test.each(["google", "maplibre", "node"] as const)("isolates the selected %s SDK in an external NodeNext consumer", (provider) => {
    const root = mkdtempSync(join(realpathSync(tmpdir()), "laugh-tale-provider-"));
    temporaryRoots.push(root);
    const packs = join(root, "packs");
    mkdirSync(packs);
    const tarballs = Object.fromEntries(["core", "react", "adapters"].map(name => [
      `@laugh-tale-island/${name}`, `file:${pack(join(repoRoot, "packages", name), packs)}`,
    ]));
    const sdk = provider === "google" ? { "@googlemaps/js-api-loader": "2.1.1" }
      : provider === "maplibre" ? { "maplibre-gl": "6.10.0" } : {};
    writeFileSync(join(root, "package.json"), JSON.stringify({ private: true, type: "module", dependencies: {
      ...tarballs, ...sdk, react: "19.2.8", "react-dom": "19.2.8", "@types/react": "19.2.18", "@types/react-dom": "19.2.5", typescript: "5.9.3", vite: "8.2.2",
    } }));
    run(npm(), ["install", "--ignore-scripts", "--no-audit", "--no-fund"], root);
    expect(existsSync(join(root, "node_modules/maplibre-gl"))).toBe(provider === "maplibre");
    expect(existsSync(join(root, "node_modules/@googlemaps/js-api-loader"))).toBe(provider === "google");
    const subpath = provider === "node" ? "google/node" : provider;
    const constructor = provider === "node" ? "GooglePlaceSearchAdapter" : provider === "google" ? "GoogleMapAdapter" : "MapLibreMapAdapter";
    writeFileSync(join(root, "entry.ts"), `import { ${constructor} } from "@laugh-tale-island/adapters/${subpath}";\nimport type { MapAdapterV2 } from "@laugh-tale-island/core/browser";\nexport const adapter = ${constructor};\nexport type MapContract = MapAdapterV2;\n`);
    writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: {
      target: "ES2022", lib: ["ES2022", "DOM"], module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true,
    }, include: ["entry.ts"] }));
    run(join(root, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], root);
    // Public entry imports must remain lazy in Node even when both browser SDKs are absent.
    run(process.execPath, ["--input-type=module", "-e", `delete globalThis.window; delete globalThis.document; const m = await import('@laugh-tale-island/adapters/${subpath}'); if (typeof m.${constructor} !== 'function') throw Error('missing export');`], root);
    writeFileSync(join(root, "bundle.mjs"), `import { build } from 'vite';\nconst result = await build({ configFile:false, logLevel:'error', build:{ write:false, lib:{ entry:'entry.ts', formats:['es'] } } });\nconst chunks = [result].flat().flatMap(r => r.output).filter(o => o.type === 'chunk');\nconst modules = chunks.flatMap(c => Object.keys(c.modules));\nconst forbidden = ${JSON.stringify(provider === "maplibre" ? ["@googlemaps/js-api-loader"] : provider === "google" ? ["maplibre-gl"] : ["maplibre-gl", "@googlemaps/js-api-loader"])};\nfor (const value of forbidden) if (modules.some(m => m.includes(value))) throw Error('Unselected SDK bundled: '+value);\n`);
    run(process.execPath, ["bundle.mjs"], root);
  }, 600_000);

  test(
    "installs all four tarballs and uses every public entry without repository paths",
    () => {
      const root = mkdtempSync(join(realpathSync(tmpdir()), "laugh-tale-consumer-"));
      temporaryRoots.push(root);
      const packDestination = join(root, "packs");
      mkdirSync(packDestination);
      const coreTarball = pack(join(repoRoot, "packages/core"), packDestination);
      const reactTarball = pack(join(repoRoot, "packages/react"), packDestination);
      const adaptersTarball = pack(join(repoRoot, "packages/adapters"), packDestination);
      const testingTarball = pack(join(repoRoot, "packages/testing"), packDestination);

      const consumerRoot = join(root, "consumer");
      mkdirSync(join(consumerRoot, "src"), { recursive: true });
      writeFileSync(
        join(consumerRoot, "package.json"),
        `${JSON.stringify(
          {
            name: "laugh-tale-clean-consumer",
            private: true,
            type: "module",
            dependencies: {
              "@laugh-tale-island/core": `file:${coreTarball}`,
              "@laugh-tale-island/react": `file:${reactTarball}`,
              "@laugh-tale-island/adapters": `file:${adaptersTarball}`,
              "@laugh-tale-island/testing": `file:${testingTarball}`,
              "@googlemaps/js-api-loader": "2.1.1",
              react: "19.2.8",
              "react-dom": "19.2.8",
              vitest: "4.1.11",
              jsdom: "30.0.1",
            },
            devDependencies: {
              "@types/react": "19.2.18",
              "@types/react-dom": "19.2.5",
              typescript: "5.9.3",
            },
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(consumerRoot, "tsconfig.json"),
        `${JSON.stringify(
          {
            compilerOptions: {
              target: "ES2022",
              lib: ["ES2022", "DOM"],
              module: "NodeNext",
              moduleResolution: "NodeNext",
              jsx: "react-jsx",
              strict: true,
              noEmit: true,
            },
            include: ["src"],
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(consumerRoot, "src/core-consumer.ts"),
        [
          'import { buildTimelineEntries, emptyTripProgress, resolveEffectiveItinerary, validateTrip, type Trip } from "@laugh-tale-island/core";',
          'import type { MapAdapterV2, ProgressStore } from "@laugh-tale-island/core/browser";',
          'import { createPlaceSearchQuery, type PlaceSearchAdapter } from "@laugh-tale-island/core/enrichment";',
          "",
          "export function summarize(trip: Trip, store: ProgressStore, map: MapAdapterV2, search: PlaceSearchAdapter): number {",
          "  const validation = validateTrip(trip);",
          "  if (validation.errors.length > 0) return 0;",
          "  void store.read();",
          "  void map;",
          '  void search.search(createPlaceSearchQuery({ ownerId: "consumer", text: "harbor", locale: "en" }), new AbortController().signal);',
          "  const effective = resolveEffectiveItinerary(trip, emptyTripProgress());",
          "  const day = effective.days[0];",
          "  return day === undefined ? 0 : buildTimelineEntries(day, effective).length;",
          "}",
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(consumerRoot, "src/adapters-consumer.ts"),
        [
          'import { GooglePlaceAdapter, GoogleRouteAdapter, type GoogleMapsLoader } from "@laugh-tale-island/adapters/google";',
          'import { GooglePlaceSearchAdapter } from "@laugh-tale-island/adapters/google/node";',
          "",
          "export const adapterTypes = {",
          "  GooglePlaceAdapter,",
          "  GoogleRouteAdapter,",
          "  GooglePlaceSearchAdapter,",
          "};",
          "export type Loader = GoogleMapsLoader;",
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(consumerRoot, "src/testing-consumer.test.ts"),
        [
          'import { expect, test } from "vitest";',
          'import { adversarialPlaceFixtures, adversarialRouteFixtures, FakeRouteAdapterV2, syntheticTripV2 } from "@laugh-tale-island/testing";',
          "",
          'test("loads testing runtime exports inside the installed Vitest process", () => {',
          '  expect(typeof FakeRouteAdapterV2).toBe("function");',
          "  expect(new FakeRouteAdapterV2().testOnly).toBe(true);",
          '  expect(syntheticTripV2.id).toBe("trip-synthetic-v2");',
          '  expect(adversarialRouteFixtures.valid.expected).toEqual({ status: "ready" });',
          '  expect(adversarialPlaceFixtures.knownOpen.expected).toEqual({ status: "open" });',
          "});",
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(consumerRoot, "src/react-consumer.tsx"),
        `import type { Trip, ShoppingStatus } from "@laugh-tale-island/core";
import {
  TripController, useTripExperience,
  type HomeViewProps, type ExperienceViewProps, type SetupRequiredViewProps,
  type LoadingViewProps, type FatalErrorViewProps, type TripPresentationV2,
  type TripActions, type ProgressUpdate, type TripRecoveryHandlers,
  type UseTripExperienceInput, type TripExperienceController,
} from "@laugh-tale-island/react";
import { alternateTestPresentation } from "@laugh-tale-island/testing";

function progressControls(actions: TripActions, capabilities: HomeViewProps["model"]["capabilities"]["progress"]) {
  const updates: ProgressUpdate[] = [
    ...capabilities.completionIds.flatMap((id) => [true, false].map((completed): ProgressUpdate => ({ kind: "completion", id, completed }))),
    ...capabilities.skippableNodeIds.flatMap((nodeId) => [true, false].map((skipped): ProgressUpdate => ({ kind: "node-skipped", nodeId, skipped }))),
    ...capabilities.shoppingItemIds.flatMap((itemId) =>
      (["pending", "purchased", "unavailable", "skipped"] satisfies ShoppingStatus[])
        .map((status): ProgressUpdate => ({ kind: "shopping-status", itemId, status }))),
  ];
  return <section>
    {updates.map((update, index) => <button key={index} onClick={() => actions.updateProgress(update)}>{update.kind}</button>)}
    {capabilities.resetTrip && <button onClick={() => actions.resetProgress("trip")}>Reset trip</button>}
    {capabilities.resetDayIds.map((id) => <button key={id} onClick={() => actions.resetProgress("day", id)}>Reset day</button>)}
  </section>;
}
function Home({ model, actions }: HomeViewProps) {
  return <main><h1>{model.identity.title}</h1>
    {model.capabilities.openExperienceDayIds.map((id) => <button key={id} onClick={() => actions.openExperience(id)}>{id}</button>)}
    {progressControls(actions, model.capabilities.progress)}
  </main>;
}
function Experience({ model, actions, bindings }: ExperienceViewProps) {
  const surface = bindings.sheet.getSurfaceProps();
  const occlusion = bindings.layout.occlusionRef("consumer-sheet");
  return <main>
    <div ref={bindings.layout.mapViewportRef} />
    <section {...surface} ref={(element) => { surface.ref(element); occlusion(element); }} />
    {model.days.map((day) => <time key={day.id} dateTime={day.date}>{day.title} {day.ordinal}</time>)}
    {model.timeline.map((entry) => entry.kind === "node" && <article key={entry.ownerId} ref={bindings.owners.nodeRef(entry.ownerId)}>
      {entry.title} {entry.booking?.reference} {entry.booking?.arrivalBufferMinutes}
    </article>)}
    <button onClick={actions.openHome}>Home</button>
    {model.capabilities.retryMap && <button onClick={() => actions.retryProvider("map")}>Retry map</button>}
    {model.capabilities.retryRouteIds.map((id) => <button key={id} onClick={() => actions.retryProvider("route", id)}>Retry route</button>)}
    {model.capabilities.retryPlaceOwnerIds.map((id) => <button key={id} onClick={() => actions.retryProvider("place", id)}>Retry place</button>)}
    {model.capabilities.restoreAutomaticSelection && <button onClick={actions.restoreAutomaticSelection}>Automatic</button>}
    {model.capabilities.returnToCurrent && <button onClick={actions.returnToCurrent}>Current</button>}
    {model.capabilities.returnToLodging && <button onClick={actions.returnToLodging}>Lodging</button>}
    {model.capabilities.restoreFullDay && <button onClick={actions.restoreFullDay}>Full day</button>}
    {model.capabilities.navigationOwnerIds.map((id) => <button key={id} onClick={() => actions.openNavigation(id)}>Navigate</button>)}
    {model.capabilities.location.begin && <button onClick={actions.beginLocation}>Locate</button>}
    {model.capabilities.location.recenter && <button onClick={actions.recenterLocation}>Recenter</button>}
    {model.capabilities.location.stop && <button onClick={actions.stopLocation}>Stop</button>}
    {progressControls(actions, model.capabilities.progress)}
  </main>;
}
function SetupRequired({ model, actions }: SetupRequiredViewProps) {
  return <section>{model.issues.map((issue) => <p key={issue.kind}>{issue.copyKey}</p>)}
    {model.capabilities.retry && <button onClick={actions.retrySetup}>Retry setup</button>}
  </section>;
}
function Loading({ model }: LoadingViewProps) {
  return <output>{model.operation} {model.owner.kind} {model.owner.id}</output>;
}
function FatalError({ model, actions }: FatalErrorViewProps) {
  return <section>{model.copyKey}
    {model.capabilities.retry && <button onClick={actions.retryFatal}>Retry fatal</button>}
    {model.capabilities.openHome && <button onClick={actions.openHome}>Home</button>}
    <output>{String(model.retained.home)} {String(model.retained.itinerary)} {String(model.retained.externalNavigation)}</output>
  </section>;
}
export const presentation: TripPresentationV2 = {
  Home, Experience, SetupRequired, Loading, FatalError,
  mapVisualProfile: alternateTestPresentation.mapVisualProfile,
  createMarkerContent(descriptor) {
    const element = document.createElement("span");
    element.textContent = descriptor.label;
    return { element, update(next) { element.textContent = next.label; }, dispose() { element.remove(); } };
  },
  createUserLocationContent(descriptor) {
    const element = document.createElement("output");
    element.value = String(descriptor.coordinates.lat);
    return { element, update(next) { element.value = String(next.coordinates.lat); }, dispose() { element.remove(); } };
  },
};
export const recovery: TripRecoveryHandlers = { retrySetup() {}, retryFatal() {} };
export function Consumer({ trip }: { trip: Trip }) {
  return <TripController trip={trip} presentation={presentation} recovery={recovery} />;
}
export function useAdvancedConsumer(input: UseTripExperienceInput): TripExperienceController {
  return useTripExperience(input);
}
`,
      );

      writeFileSync(
        join(consumerRoot, "src/public-api.snapshot.ts"),
        readFileSync(join(repoRoot, "packages/react/tests/public-api.snapshot.ts"), "utf8"),
      );
      writeFileSync(
        join(consumerRoot, "src/presentation-consumer.test.tsx"),
        `import { afterEach, expect, test, vi } from "vitest";
import { act } from "react";
import type { HomeViewProps, ExperienceViewProps, TripPresentationV2 } from "@laugh-tale-island/react";
import type { ProgressStore } from "@laugh-tale-island/core/browser";
import { createMemoryTripNavigationStore } from "@laugh-tale-island/core";
import {
  alternateTestPresentation, renderTripContract, syntheticTripV2,
  FakeMapAdapterV2, FakeRouteAdapterV2, FakePlaceAdapterV2,
  FakeNavigationAdapterV2, FakeProgressStore,
} from "@laugh-tale-island/testing";

afterEach(() => vi.unstubAllGlobals());
test.each(["read-refusal", "write-refusal"])("installed controller retains memory-only progress across Home and Experience after %s", async (mode) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let latest!: HomeViewProps | ExperienceViewProps;
  const presentation: TripPresentationV2 = { ...alternateTestPresentation,
    Home(props) { latest = props; return null; },
    Experience(props) { latest = props; return null; },
  };
  let active = 0;
  const read = vi.fn<ProgressStore["read"]>(() => mode === "read-refusal" ? { status: "unavailable" } : { status: "ready", value: null });
  const write = vi.fn(() => false);
  const progressStore: ProgressStore = { read, write, subscribe: () => { active++; return () => { active--; }; } };
  const driver = renderTripContract({ trip: syntheticTripV2, presentation, progressStore, clock: () => "2042-03-04T12:00:00Z" });
  try {
    await driver.settle();
    const actions = latest.actions;
    await act(async () => { actions.updateProgress({ kind: "completion", id: "task:task-pretrip", completed: true }); });
    act(() => actions.openExperience("day-synthetic"));
    await driver.settle();
    expect(latest.model.progress.completedIds).toEqual(["task:task-pretrip"]);
    expect(latest.model.persistence).toEqual({ status: "memory-only", writable: false });
    act(() => {
      actions.updateProgress({ kind: "completion", id: "task:task-day", completed: true });
      actions.updateProgress({ kind: "node-skipped", nodeId: "node-shopping", skipped: true });
      actions.updateProgress({ kind: "shopping-status", itemId: "shopping-journal", status: "purchased" });
      actions.reopenCandidate("candidate-meal");
    });
    act(() => actions.previewCandidate("candidate-meal", "candidate-meal-b"));
    act(() => actions.confirmCandidate("candidate-meal"));
    act(() => actions.openHome());
    await driver.settle();
    expect(latest.actions).toBe(actions);
    expect(latest.model.progress.completedIds).toEqual(["task:task-pretrip", "task:task-day"]);
    expect(latest.model.progress.skippedNodeIds).toEqual(["node-shopping"]);
    expect(latest.model.progress.shopping).toEqual([{ itemId: "shopping-journal", status: "purchased" }]);
    expect(latest.model.progress.selectedCandidates).toEqual([{ groupId: "candidate-meal", optionId: "candidate-meal-b" }]);
    expect(latest.model.persistence).toEqual({ status: "memory-only", writable: false });
    act(() => actions.openExperience("day-synthetic"));
    await driver.settle();
    act(() => actions.resetProgress("day", "day-synthetic"));
    act(() => actions.openHome());
    await driver.settle();
    expect(latest.model.progress.completedIds).toEqual(["task:task-pretrip"]);
    expect(latest.model.progress.skippedNodeIds).toEqual([]);
    expect(latest.model.progress.shopping).toEqual([]);
    expect(latest.model.progress.selectedCandidates).toEqual([]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(mode === "read-refusal" ? 0 : 1);
    expect(active).toBe(1);
  } finally { driver.dispose(); }
  expect(active).toBe(0);
});
test("installed alternate presentation navigates and persists every progress mutation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const progressStore = new FakeProgressStore();
  const map = new FakeMapAdapterV2();
  const driver = renderTripContract({
    trip: syntheticTripV2, presentation: alternateTestPresentation, progressStore,
    navigationStore: createMemoryTripNavigationStore(),
    clock: () => "2042-03-04T14:30:00Z",
    runtime: {
      createMap: () => map,
      createRoutes: () => new FakeRouteAdapterV2(),
      createPlaces: () => new FakePlaceAdapterV2(),
      navigation: new FakeNavigationAdapterV2(),
    },
  });
  try {
    await driver.settle();
    expect(driver.get("home")).toBeInstanceOf(HTMLElement);
    expect(driver.ownerIds("day-choice")).toEqual(["day-synthetic"]);
    driver.activate("open-day", "day-synthetic");
    await driver.settle();
    expect(driver.get("experience")).toBeInstanceOf(HTMLElement);
    expect(driver.ownerIds("timeline-node")).toContain("node-shopping");
    expect(driver.states("timeline-node", "node-sightseeing")).toContain("current");
    driver.activate("update-completion", "node:node-transport");
    await driver.settle();
    expect(driver.value("progress-completion", "node:node-transport")).toBe("true");
    driver.activate("update-skipped", "node-shopping");
    await driver.settle();
    expect(driver.value("progress-skipped", "node-shopping")).toBe("true");
    driver.activate("update-shopping", "shopping-journal");
    await driver.settle();
    expect(driver.value("progress-shopping", "shopping-journal")).toBe("purchased");
    driver.activate("update-completion", "node:node-transport");
    driver.activate("update-skipped", "node-shopping");
    await driver.settle();
    expect(driver.value("progress-completion", "node:node-transport")).toBe("false");
    expect(driver.value("progress-skipped", "node-shopping")).toBe("false");
    expect(progressStore.writes.length).toBeGreaterThan(0);
  } finally {
    driver.dispose();
  }
  expect(progressStore.listenerCount).toBe(0);
  expect(document.querySelector('[data-test-fixture="trip-contract"]')).toBeNull();
});

test("installed alternate setup advertises and invokes supplied recovery", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let retries = 0;
  const driver = renderTripContract({
    trip: null, presentation: alternateTestPresentation,
    recovery: { retrySetup() { retries += 1; } },
  });
  try {
    await driver.settle();
    expect(driver.get("setup")).toBeInstanceOf(HTMLElement);
    driver.activate("retry-setup");
    expect(retries).toBe(1);
    expect(driver.query("experience")).toBeNull();
  } finally {
    driver.dispose();
  }
});
`,
      );

      run(npm(), ["install", "--no-audit", "--no-fund"], consumerRoot);

      const installedEntries = {
        core: "dist/index.js",
        react: "dist/index.js",
        adapters: "dist/google/index.js",
        testing: "dist/index.js",
      } as const;
      for (const [name, entry] of Object.entries(installedEntries)) {
        const installed = join(consumerRoot, "node_modules/@laugh-tale-island", name);
        expect(lstatSync(installed).isSymbolicLink(), `${name} must not be a symlink`).toBe(false);
        expect(realpathSync(installed), `${name} must live in the external consumer`).toBe(installed);
        expect(existsSync(join(installed, entry)), `${name} must contain ${entry}`).toBe(true);
        expect(existsSync(join(installed, "src"))).toBe(false);
        expect(readdirSync(installed).sort()).toEqual([
          "LICENSE",
          "README.md",
          "dist",
          "package.json",
        ]);
        for (const path of readdirSync(join(installed, "dist"), { recursive: true }) as string[]) {
          const file = join(installed, "dist", path);
          expect(lstatSync(file).isSymbolicLink(), `${name}/${path} must not be a symlink`).toBe(false);
          expect(path, `${name} installed artifact path`).not.toMatch(/(?:\.css$|\.test\.|(?:^|\/)(?:src|tests?)\/|recipes-v2|starter\/react)/);
          if (!/\.(?:js|ts)$/.test(path)) continue;
          const content = readFileSync(file, "utf8");
          expect(content, `${name}/${path} presentation contamination`).not.toMatch(
            /recipes-v2|starter\/react|["'][^"'\n]*\.css["']|lucide|Oak & Washi|Start your trip|尚未定位/,
          );
          if (name !== "testing") {
            expect(content, `${name}/${path} test contamination`).not.toMatch(
              /@laugh-tale-island\/testing|@testing-library|["']vitest["']|Fake(?:Map|Route|Place|Navigation|Progress)|syntheticTripV2|Test fixture:/,
            );
          }
          if (name === "core" || name === "react") {
            expect(content, `${name}/${path} SDK isolation`).not.toMatch(/@googlemaps|google\.maps/);
          }
        }
      }

      const tsc = join(consumerRoot, "node_modules/.bin/tsc");
      run(tsc, ["-p", "tsconfig.json"], consumerRoot);
      console.info(run(join(consumerRoot, "node_modules/.bin/vitest"), ["run", "--environment", "jsdom", "src/testing-consumer.test.ts", "src/presentation-consumer.test.tsx"], consumerRoot));

      const runtimeProbe = join(consumerRoot, "runtime-probe.mjs");
      writeFileSync(
        runtimeProbe,
        [
          'import * as core from "@laugh-tale-island/core";',
          'import * as browser from "@laugh-tale-island/core/browser";',
          'import * as enrichment from "@laugh-tale-island/core/enrichment";',
          'import * as react from "@laugh-tale-island/react";',
          'import * as google from "@laugh-tale-island/adapters/google";',
          'import * as googleNode from "@laugh-tale-island/adapters/google/node";',
          'if (typeof core.validateTrip !== "function") throw new Error("missing validateTrip");',
          'if (typeof browser.createLocalStorageProgressStore !== "function") throw new Error("missing createLocalStorageProgressStore");',
          'if (typeof enrichment.createPlaceSearchQuery !== "function") throw new Error("missing createPlaceSearchQuery");',
          'if (JSON.stringify(Object.keys(react).sort()) !== JSON.stringify(["TripController", "useTripExperience"])) throw new Error("unexpected React runtime exports");',
          'if (typeof google.GoogleRouteAdapter !== "function") throw new Error("missing GoogleRouteAdapter");',
          'if (typeof googleNode.GooglePlaceSearchAdapter !== "function") throw new Error("missing GooglePlaceSearchAdapter");',
          "const blocked = [",
          '  "@laugh-tale-island/core/validation",',
          '  "@laugh-tale-island/react/use-trip-progress",',
          '  "@laugh-tale-island/adapters/google/GoogleRouteAdapter",',
          '  "@laugh-tale-island/testing/fakes/FakeRouteAdapterV2",',
          "];",
          "for (const specifier of blocked) {",
          "  try {",
          "    await import(specifier);",
          '    throw new Error(`undeclared deep import resolved: ${specifier}`);',
          "  } catch (error) {",
          '    if (!(error instanceof Error) || error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;',
          "  }",
          "}",
          "",
        ].join("\n"),
      );
      run(process.execPath, [runtimeProbe], consumerRoot);
    },
    600_000,
  );
});
