import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TripProgressController } from "@laugh-tale-island/react";
import { checklistCompletionKey, emptyTripProgress, taskCompletionKey } from "@laugh-tale-island/core";

import { PresentationErrorBoundary } from "../app/PresentationErrorBoundary";
import type {
  ExperienceActions,
  ExperienceBindings,
  ExperienceViewProps,
  FatalErrorViewProps,
  HomeActions,
  HomeViewProps,
  LoadingViewProps,
  SetupRequiredViewProps,
  TripPresentation,
} from "./presentation-contract";
import { useHomeController } from "./use-home-controller";
import { completeTrip } from "../trip-content/fixtures/complete-trip";

afterEach(cleanup);

const homeActions: HomeActions = {
  setCompleted: () => undefined,
  enterDay: () => undefined,
};

const controllerLike = {
  hydrated: true,
  progress: emptyTripProgress(),
  persistenceStatus: "persistent" as const,
  setCompleted: () => undefined,
};

const rejectedControllerProps: HomeViewProps = {
  // @ts-expect-error A progress controller is not a semantic home model.
  model: controllerLike,
  actions: homeActions,
};

const providerLike = { map: new Map<string, unknown>(), sdk: "provider runtime" };

const rejectedProviderProps: ExperienceViewProps = {
  // @ts-expect-error A provider object is not an experience view model.
  model: providerLike,
  actions: {} as ExperienceActions,
  bindings: {} as ExperienceBindings,
};

void rejectedControllerProps;
void rejectedProviderProps;

function createPresentation(home: ComponentType<HomeViewProps>): TripPresentation {
  const SetupSpy: ComponentType<SetupRequiredViewProps> = () => null;
  const LoadingSpy: ComponentType<LoadingViewProps> = () => null;
  const FatalSpy: ComponentType<FatalErrorViewProps> = () => null;
  const ExperienceSpy: ComponentType<ExperienceViewProps> = () => null;

  return {
    Home: home,
    Experience: ExperienceSpy,
    SetupRequired: SetupSpy,
    Loading: LoadingSpy,
    FatalError: FatalSpy,
    geometry: {
      header: { expanded: 148, collapsed: 72 },
      sheet: { collapsed: 128, minGap: 24 },
      desktopBreakpoint: 768,
    },
    mapProfile: {
      id: "test-profile",
      basemap: { mode: "neutral", density: "low", contrast: "soft", poi: "minimal" },
      candidateTitle: (sequenceNumber, index, option) =>
        `${sequenceNumber}:${index}:${option.title}`,
      marker: (place, index) => ({
        title: place.label,
        className: `marker-${index}`,
        label: place.label,
        parts: [{ className: "marker-label", text: place.label }],
        fallback: { fill: "#ffffff", stroke: "#000000", text: String(index + 1), size: 44, shape: "circle", strokeWidth: 3 },
      }),
      userLocation: () => ({
        title: "location",
        className: "location-marker",
        label: "location",
        parts: [{ className: "location-dot", text: "" }],
        fallback: { fill: "#000000", stroke: "#ffffff", text: "", size: 44, shape: "circle", strokeWidth: 3 },
      }),
      route: () => ({ stroke: "#000000", opacity: 1, width: 2 }),
    },
  };
}

function HomeControllerHarness({
  progressController,
  onEnterDay,
  presentation,
}: {
  progressController: Pick<
    TripProgressController,
    "progress" | "persistenceStatus" | "setCompleted"
  >;
  onEnterDay: (dayId: string) => void;
  presentation: TripPresentation;
}) {
  const props = useHomeController(completeTrip, progressController, onEnterDay);
  return <presentation.Home {...props} />;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.includes(".test.")
      ? [path]
      : [];
  });
}

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:\bfrom\s+|\bimport\s*)["']([^"']+)["']/g)].map(
    (match) => match[1] ?? "",
  );
}

describe("local presentation contract", () => {
  it("delivers derived home facts and semantic actions without controller or provider objects", () => {
    const setCompleted = vi.fn();
    const enterDay = vi.fn();
    function HomeSpy({ model, actions }: HomeViewProps) {
      return (
        <>
          <output data-testid="pretrip-completion">
            {model.pretripCompletion.completed}/{model.pretripCompletion.total}
          </output>
          <output data-testid="reservation-counts">
            {model.reservationCounts.confirmed}/{model.reservationCounts.pending}/
            {model.reservationCounts.none}
          </output>
          <output data-testid="persistence">{model.persistence}</output>
          <output data-testid="home-model-keys">{Object.keys(model).sort().join(",")}</output>
          <button type="button" onClick={() => actions.setCompleted("task-pretrip-documents", true)}>
            complete
          </button>
          <button type="button" onClick={() => actions.enterDay("day-2040-06-12")}>
            enter
          </button>
        </>
      );
    }
    const presentation = createPresentation(HomeSpy);
    const progressController = {
      progress: {
        ...emptyTripProgress(),
        completedIds: [
          taskCompletionKey("task-pretrip-documents"),
          checklistCompletionKey("task-child-identification"),
        ],
      },
      persistenceStatus: "memory-only" as const,
      setCompleted,
    };

    render(
      <HomeControllerHarness
        progressController={progressController}
        onEnterDay={enterDay}
        presentation={presentation}
      />,
    );

    expect(screen.getByTestId("pretrip-completion")).toHaveTextContent("2/3");
    expect(screen.getByTestId("reservation-counts")).toHaveTextContent("1/1/0");
    expect(screen.getByTestId("persistence")).toHaveTextContent("memory-only");
    expect(screen.getByTestId("home-model-keys")).toHaveTextContent(
      "persistence,pretripCompletion,progress,reservationCounts,trip",
    );

    fireEvent.click(screen.getByRole("button", { name: "complete" }));
    fireEvent.click(screen.getByRole("button", { name: "enter" }));

    expect(setCompleted).toHaveBeenCalledWith("task-pretrip-documents", true);
    expect(enterDay).toHaveBeenCalledWith("day-2040-06-12");
  });

  it("renders the selected fatal view with a semantic retry action and no exception text", () => {
    let shouldThrow = true;
    const rawError = "synthetic renderer failure that must not reach the view";
    function FatalSpy({ model, actions }: FatalErrorViewProps) {
      return (
        <>
          <output data-testid="fatal-kind">{model.kind}</output>
          <button type="button" onClick={() => actions.retry()}>
            retry
          </button>
        </>
      );
    }
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    function CrashableChild() {
      if (shouldThrow) {
        throw new Error(rawError);
      }
      return <output data-testid="recovered">recovered</output>;
    }

    render(
      <PresentationErrorBoundary FatalError={FatalSpy}>
        <CrashableChild />
      </PresentationErrorBoundary>,
    );

    expect(screen.getByTestId("fatal-kind")).toHaveTextContent("render");
    expect(screen.queryByText(rawError)).not.toBeInTheDocument();
    act(() => {
      shouldThrow = false;
      fireEvent.click(screen.getByRole("button", { name: "retry" }));
    });

    expect(screen.getByTestId("recovered")).toBeVisible();
    consoleError.mockRestore();
  });

  it("keeps controller source free of visible presentation and provider imports", () => {
    const controllerDirectory = dirname(fileURLToPath(import.meta.url));
    const controllerFiles = sourceFiles(controllerDirectory);
    const forbidden = [
      /import\s+.*\.css["']/,
      /lucide/i,
      /google\.maps/i,
      /<(?:main|header|button)\b/i,
      /[\u4e00-\u9fff]/u,
      /Trip overview|Trip content required|Map configuration required|Map unavailable/,
    ];

    for (const file of controllerFiles) {
      const source = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(source, `${file} must not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("keeps controllers and providers independent from local presentation modules", () => {
    const controllerDirectory = dirname(fileURLToPath(import.meta.url));
    const providerDirectory = resolve(controllerDirectory, "../providers");
    const presentationDirectory = resolve(controllerDirectory, "../presentation");

    for (const file of [
      ...sourceFiles(controllerDirectory),
      ...sourceFiles(providerDirectory),
    ]) {
      for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
        const target = resolve(dirname(file), specifier);
        expect(
          target === presentationDirectory ||
            target.startsWith(`${presentationDirectory}${sep}`),
          `${file} must not import presentation`,
        ).toBe(false);
      }
    }
  });

  it("keeps package sources independent from starter implementation files", () => {
    const controllerDirectory = dirname(fileURLToPath(import.meta.url));
    const repositoryDirectory = resolve(controllerDirectory, "../../../../../..");
    const packagesDirectory = join(repositoryDirectory, "packages");
    const packageFiles = readdirSync(packagesDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => sourceFiles(join(packagesDirectory, entry.name, "src")));

    for (const file of packageFiles) {
      expect(readFileSync(file, "utf8"), `${file} must not import the starter`).not.toMatch(
        /plugins\/eternal-pose\/starter\/react|starter\/react\/src/,
      );
    }
  });

  it("contains every CSS and icon import within the presentation directory", () => {
    const controllerDirectory = dirname(fileURLToPath(import.meta.url));
    const sourceDirectory = resolve(controllerDirectory, "..");

    for (const file of sourceFiles(sourceDirectory)) {
      const hasVisualImport = importSpecifiers(readFileSync(file, "utf8")).some(
        (specifier) => specifier.endsWith(".css") || specifier === "lucide-react",
      );
      if (hasVisualImport) {
        expect(relative(sourceDirectory, file).startsWith(`presentation${sep}`)).toBe(true);
      }
    }
  });

  it("routes production presentation imports through the presentation index", () => {
    const controllerDirectory = dirname(fileURLToPath(import.meta.url));
    const sourceDirectory = resolve(controllerDirectory, "..");
    const presentationDirectory = join(sourceDirectory, "presentation");

    for (const file of sourceFiles(sourceDirectory)) {
      if (file.startsWith(`${presentationDirectory}${sep}`)) continue;
      for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
        const target = resolve(dirname(file), specifier);
        if (
          target !== presentationDirectory &&
          !target.startsWith(`${presentationDirectory}${sep}`)
        ) {
          continue;
        }
        expect(
          target,
          `${file} must import the presentation index rather than a view module`,
        ).toBe(presentationDirectory);
      }
    }
  });
});
