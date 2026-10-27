import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Component, useLayoutEffect, useMemo, useState, } from "react";
import { createMemoryTripNavigationStore, validateTrip, } from "@laugh-tale-island/core";
import { useTripNavigation } from "./use-trip-navigation.js";
import { useDefaultProgressStore } from "./default-progress-store.js";
import { useTripProgress } from "./use-trip-progress.js";
import { useMinuteClock } from "./use-minute-clock.js";
import { projectHomeModel } from "./project-home-model.js";
import { ControllerStateFailure, normalizeControllerError, } from "./normalize-controller-error.js";
import { emitTripDiagnostic } from "./emit-trip-diagnostic.js";
import { createActionFacade, createProgressDelegates, useCommittedTripActions, } from "./trip-actions.js";
import { useTripExperienceWithProgress } from "./use-trip-experience.js";
import { BootstrapDiagnosticContext, useBootstrapProviders, } from "./use-runtime-providers.js";
class TripErrorBoundary extends Component {
    state = { caught: false, category: null };
    static getDerivedStateFromError() {
        return { caught: true, category: null };
    }
    componentDidCatch(error) {
        const category = error instanceof ControllerStateFailure ? "state" : "render";
        emitTripDiagnostic(this.props.onDiagnostic, {
            scope: "controller",
            phase: category,
            category,
            cause: error instanceof ControllerStateFailure ? error.cause : error,
        });
        this.setState({ category });
    }
    render() {
        if (!this.state.caught && !this.props.actionFailed)
            return this.props.children;
        const category = this.props.actionFailed ? "state" : this.state.category;
        if (category === null)
            return null;
        const FatalError = this.props.presentation.FatalError;
        return (_jsx(FatalError, { model: normalizeControllerError(category, this.props.recovery?.retryFatal !== undefined, false), actions: this.props.actions }));
    }
}
function validateContent(trip, supplied) {
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
    }
    catch (cause) {
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
function SetupContent({ outcome, ...props }) {
    const [reported, setReported] = useState(null);
    useLayoutEffect(() => {
        if (outcome.diagnostic)
            emitTripDiagnostic(props.onDiagnostic, outcome.diagnostic);
        setReported(outcome);
    }, [outcome, props.onDiagnostic]);
    if (reported !== outcome)
        return null;
    const SetupRequired = props.presentation.SetupRequired;
    return (_jsx(SetupRequired, { model: {
            issues: outcome.issues,
            capabilities: { retry: props.recovery?.retrySetup !== undefined },
        }, actions: props.actions }));
}
function HomeContent(props) {
    const { trip, presentation, actions, actionSlot } = props;
    const { state: navigation, store: navigationStore } = useTripNavigation(props.navigation);
    const { progress } = props;
    const instant = useMinuteClock(props.clock);
    const bootstrap = useBootstrapProviders(props.runtime, props.providerBootstrap, props.onDiagnostic);
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
        }
        catch (cause) {
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
        openHome: () => navigationStore.write({ surface: "home", dayId: null, ownerId: null }),
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
        return (_jsx(Loading, { model: {
                operation: "progress",
                owner: { kind: "surface", id: navigation.surface },
            }, actions: actions }));
    }
    const Home = presentation.Home;
    return _jsx(Home, { model: model, actions: actions });
}
function ExperienceView(props) {
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
    if (!props.progress.hydrated)
        return null;
    const Experience = props.presentation.Experience;
    return (_jsx(Experience, { model: controller.model, actions: props.actions, bindings: controller.bindings }));
}
function ExperienceContent(props) {
    const Loading = props.presentation.Loading;
    return (_jsxs(_Fragment, { children: [_jsx(ExperienceView, { ...props }), !props.progress.hydrated && (_jsx(Loading, { model: {
                    operation: "progress",
                    owner: { kind: "surface", id: "experience" },
                }, actions: props.actions }))] }));
}
function ValidContent(props) {
    const { state: navigation } = useTripNavigation(props.navigation);
    const store = useDefaultProgressStore(props.trip.id, props.progressStore);
    const progress = useTripProgress(props.trip, store);
    const [ledger] = useState(() => new Map());
    return (_jsx(BootstrapDiagnosticContext.Provider, { value: ledger, children: _jsx(ValidSurface, { ...props, store: store, progress: progress, surface: navigation.surface }) }));
}
function ValidSurface(props) {
    return props.surface === "experience" ? (_jsx(ExperienceContent, { ...props })) : (_jsx(HomeContent, { ...props }));
}
function ContentGate(props) {
    const outcome = useMemo(() => validateContent(props.trip, props.setupIssues), [props.trip, props.setupIssues]);
    if (props.trip === null || outcome.issues.length > 0)
        return _jsx(SetupContent, { ...props, outcome: outcome });
    return _jsx(ValidContent, { ...props, trip: props.trip }, props.trip.id);
}
export function TripController(props) {
    const [navigation] = useState(createMemoryTripNavigationStore);
    const [actionSlot] = useState(() => ({ current: {} }));
    const [recoverySlot] = useState(() => ({ current: {} }));
    const [actionFailed, setActionFailed] = useState(false);
    const [recoveryRevision, setRecoveryRevision] = useState(0);
    const [failureSlot] = useState(() => ({
        current: () => { },
    }));
    const [actions] = useState(() => createActionFacade(actionSlot, recoverySlot, failureSlot));
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
            failureSlot.current = () => { };
        };
    }, [failureSlot, props.onDiagnostic]);
    useCommittedTripActions(recoverySlot, {
        retrySetup: () => props.recovery?.retrySetup?.(),
        retryFatal: () => {
            if (props.recovery?.retryFatal === undefined)
                return;
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
    return (_jsx(TripErrorBoundary, { ...internal, actionFailed: actionFailed, children: _jsx(ContentGate, { ...internal }) }, recoveryRevision));
}
