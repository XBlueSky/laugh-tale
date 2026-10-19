import {
  Component,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createMemoryTripNavigationStore,
  validateTrip,
  type Trip,
  type TripNavigationStore,
} from "@laugh-tale-island/core";
import type {
  TripActions,
  TripControllerProps,
  SetupIssue,
  TripDiagnosticEvent,
  FatalErrorModel,
} from "./presentation-contract.js";
import { useTripNavigation } from "./use-trip-navigation.js";
import { useDefaultProgressStore } from "./default-progress-store.js";
import { useTripProgress, type TripProgressController } from "./use-trip-progress.js";
import { useMinuteClock } from "./use-minute-clock.js";
import { projectHomeModel } from "./project-home-model.js";
import {
  ControllerStateFailure,
  normalizeControllerError,
} from "./normalize-controller-error.js";
import { emitTripDiagnostic } from "./emit-trip-diagnostic.js";

import {
  createActionFacade,
  createProgressDelegates,
  useCommittedTripActions,
  type TripActionSlot,
} from "./trip-actions.js";
import { useTripExperienceWithProgress } from "./use-trip-experience.js";
import {
  BootstrapDiagnosticContext,
  useBootstrapProviders,
} from "./use-runtime-providers.js";
import type { ProgressStore } from "@laugh-tale-island/core/browser";

interface InternalProps extends TripControllerProps {
  actions: TripActions;
  actionSlot: TripActionSlot;
  navigation: TripNavigationStore;
}

interface BoundaryState {
  caught: boolean;
  category: FatalErrorModel["category"] | null;
}

class TripErrorBoundary extends Component<
  InternalProps & { children: ReactNode; actionFailed: boolean },
  BoundaryState
> {
  state: BoundaryState = { caught: false, category: null };

  static getDerivedStateFromError(): BoundaryState {
    return { caught: true, category: null };
  }

  componentDidCatch(error: unknown): void {
    const category =
      error instanceof ControllerStateFailure ? "state" : "render";
    emitTripDiagnostic(this.props.onDiagnostic, {
      scope: "controller",
      phase: category,
      category,
      cause: error instanceof ControllerStateFailure ? error.cause : error,
    });
    this.setState({ category });
  }

  render(): ReactNode {
    if (!this.state.caught && !this.props.actionFailed)
      return this.props.children;
    const category = this.props.actionFailed ? "state" : this.state.category;
    if (category === null) return null;
    const FatalError = this.props.presentation.FatalError;
    return (
      <FatalError
        model={normalizeControllerError(
          category,
          this.props.recovery?.retryFatal !== undefined,
          false,
        )}
        actions={this.props.actions}
      />
    );
  }
}

interface ValidationOutcome {
  issues: readonly SetupIssue[];
  diagnostic?: TripDiagnosticEvent;
}

function validateContent(
  trip: Trip | null,
  supplied: readonly SetupIssue[] | undefined,
): ValidationOutcome {
  if (trip === null)
    return {
      issues: supplied?.length
        ? supplied
        : [{ kind: "missing-trip", copyKey: "setup.missingTrip" }],
    };
  try {
    const result = validateTrip(trip);
    if (result.errors.length === 0 && trip.days.length > 0)
      return { issues: [] };
    return {
      issues: [
        {
          kind: "invalid-trip",
          copyKey: "setup.invalidTrip",
          paths: result.errors.length
            ? result.errors.map((issue) => issue.path)
            : ["days"],
        },
      ],
      diagnostic: {
        scope: "controller",
        phase: "validation",
        category: "state",
        cause: result,
      },
    };
  } catch (cause) {
    return {
      issues: [
        { kind: "invalid-trip", copyKey: "setup.invalidTrip", paths: [] },
      ],
      diagnostic: {
        scope: "controller",
        phase: "validation",
        category: "state",
        cause,
      },
    };
  }
}

function SetupContent({
  outcome,
  ...props
}: InternalProps & { outcome: ValidationOutcome }) {
  const [reported, setReported] = useState<ValidationOutcome | null>(null);
  useLayoutEffect(() => {
    if (outcome.diagnostic)
      emitTripDiagnostic(props.onDiagnostic, outcome.diagnostic);
    setReported(outcome);
  }, [outcome, props.onDiagnostic]);
  if (reported !== outcome) return null;
  const SetupRequired = props.presentation.SetupRequired;
  return (
    <SetupRequired
      model={{
        issues: outcome.issues,
        capabilities: { retry: props.recovery?.retrySetup !== undefined },
      }}
      actions={props.actions}
    />
  );
}

function HomeContent(
  props: InternalProps & { trip: Trip; progress: TripProgressController },
) {
  const { trip, presentation, actions, actionSlot } = props;
  const { state: navigation, store: navigationStore } = useTripNavigation(
    props.navigation,
  );
  const { progress } = props;
  const instant = useMinuteClock(props.clock);
  const bootstrap = useBootstrapProviders(
    props.runtime,
    props.providerBootstrap,
    props.onDiagnostic,
  );
  const model = useMemo(() => {
    try {
      return projectHomeModel({
        trip,
        progress: progress.progress,
        persistenceStatus: progress.persistenceStatus,
        instant,
        manualDayId: navigation.dayId,
        providerBootstrap: bootstrap.published,
      });
    } catch (cause) {
      throw new ControllerStateFailure(cause);
    }
  }, [
    trip,
    progress.progress,
    progress.persistenceStatus,
    instant,
    navigation.dayId,
    bootstrap.published,
  ]);
  useCommittedTripActions(actionSlot, {
    openHome: () =>
      navigationStore.write({ surface: "home", dayId: null, ownerId: null }),
    openExperience: (dayId = model.effectiveEntryDayId) => {
      if (model.capabilities.openExperienceDayIds.includes(dayId))
        navigationStore.write({ surface: "experience", dayId, ownerId: null });
    },
    openReservation: (reservationId) => {
      const target = model.reservations.find(reservation => reservation.id === reservationId)?.destination;
      if (target && model.capabilities.openExperienceDayIds.includes(target.dayId))
        navigationStore.write({ surface: "experience", dayId: target.dayId, ownerId: target.nodeId });
    },
    ...createProgressDelegates(progress, model.capabilities.progress),
  });
  if (!progress.hydrated) {
    const Loading = presentation.Loading;
    return (
      <Loading
        model={{
          operation: "progress",
          owner: { kind: "surface", id: navigation.surface },
        }}
        actions={actions}
      />
    );
  }
  const Home = presentation.Home;
  return <Home model={model} actions={actions} />;
}

function ExperienceView(
  props: InternalProps & { trip: Trip; store: ProgressStore; progress: TripProgressController },
) {
  const controller = useTripExperienceWithProgress({
    trip: props.trip,
    navigationStore: props.navigation,
    progressStore: props.store,
    presentation: props.presentation,
    ...(props.runtime === undefined ? {} : { runtime: props.runtime }),
    ...(props.providerBootstrap === undefined
      ? {}
      : { providerBootstrap: props.providerBootstrap }),
    ...(props.clock === undefined ? {} : { clock: props.clock }),
    ...(props.onDiagnostic === undefined
      ? {}
      : { onDiagnostic: props.onDiagnostic }),
  }, props.progress);
  useCommittedTripActions(props.actionSlot, controller.actions);
  if (!props.progress.hydrated) return null;
  const Experience = props.presentation.Experience;
  return (
    <Experience
      model={controller.model}
      actions={props.actions}
      bindings={controller.bindings}
    />
  );
}

function ExperienceContent(
  props: InternalProps & { trip: Trip; store: ProgressStore; progress: TripProgressController },
) {
  const Loading = props.presentation.Loading;
  return (
    <>
      <ExperienceView {...props} />
      {!props.progress.hydrated && (
        <Loading
          model={{
            operation: "progress",
            owner: { kind: "surface", id: "experience" },
          }}
          actions={props.actions}
        />
      )}
    </>
  );
}

function ValidContent(props: InternalProps & { trip: Trip }) {
  const { state: navigation } = useTripNavigation(props.navigation);
  const store = useDefaultProgressStore(props.trip.id, props.progressStore);
  const progress = useTripProgress(props.trip, store);
  const [ledger] = useState(() => new Map());
  return (
    <BootstrapDiagnosticContext.Provider value={ledger}>
      <ValidSurface {...props} store={store} progress={progress} surface={navigation.surface} />
    </BootstrapDiagnosticContext.Provider>
  );
}

function ValidSurface(
  props: InternalProps & {
    trip: Trip;
    store: ProgressStore;
    progress: TripProgressController;
    surface: "home" | "experience";
  },
) {
  return props.surface === "experience" ? (
    <ExperienceContent {...props} />
  ) : (
    <HomeContent {...props} />
  );
}

function ContentGate(props: InternalProps) {
  const outcome = useMemo(
    () => validateContent(props.trip, props.setupIssues),
    [props.trip, props.setupIssues],
  );
  if (props.trip === null || outcome.issues.length > 0)
    return <SetupContent {...props} outcome={outcome} />;
  return <ValidContent key={props.trip.id} {...props} trip={props.trip} />;
}

export function TripController(props: TripControllerProps) {
  const [navigation] = useState(createMemoryTripNavigationStore);
  const [actionSlot] = useState<TripActionSlot>(() => ({ current: {} }));
  const [recoverySlot] = useState<TripActionSlot>(() => ({ current: {} }));
  const [actionFailed, setActionFailed] = useState(false);
  const [recoveryRevision, setRecoveryRevision] = useState(0);
  const [failureSlot] = useState<{ current: (cause: unknown) => void }>(() => ({
    current: () => {},
  }));
  const [actions] = useState(() =>
    createActionFacade(actionSlot, recoverySlot, failureSlot),
  );
  useLayoutEffect(() => {
    failureSlot.current = (cause) => {
      emitTripDiagnostic(props.onDiagnostic, {
        scope: "controller",
        phase: "state",
        category: "state",
        cause: cause instanceof ControllerStateFailure ? cause.cause : cause,
      });
      setActionFailed(true);
    };
    return () => {
      failureSlot.current = () => {};
    };
  }, [failureSlot, props.onDiagnostic]);
  useCommittedTripActions(recoverySlot, {
    retrySetup: () => props.recovery?.retrySetup?.(),
    retryFatal: () => {
      if (props.recovery?.retryFatal === undefined) return;
      props.recovery.retryFatal();
      setActionFailed(false);
      setRecoveryRevision((revision) => revision + 1);
    },
  });
  const internal = {
    ...props,
    navigation: props.navigationStore ?? navigation,
    actions,
    actionSlot,
  };
  return (
    <TripErrorBoundary
      key={recoveryRevision}
      {...internal}
      actionFailed={actionFailed}
    >
      <ContentGate {...internal} />
    </TripErrorBoundary>
  );
}
