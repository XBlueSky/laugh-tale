// This file is included by the package's real tsc gate, not a Vitest runtime test.
import type * as Public from "@laugh-tale-island/react";

// Every frozen erased export must remain importable through the published root.
export type PublicTypeSnapshot = [
  Public.BookingFactModel, Public.CandidateDecisionModel, Public.CandidateOptionModel,
  Public.ChecklistItemModel, Public.CompletionCountModel, Public.CompletionItemModel,
  Public.ExperienceBindings, Public.ExperienceCapabilities, Public.ExperienceClockModel,
  Public.ExperienceDayModel, Public.ExperienceMapModel, Public.ExperienceModel,
  Public.ExperiencePlaceModel, Public.ExperienceReservationModel, Public.ExperienceRouteModel,
  Public.ExperienceSheetModel, Public.ExperienceTaskModel, Public.ExperienceTripIdentity,
  Public.ExperienceViewProps, Public.FatalErrorModel, Public.FatalErrorViewProps,
  Public.HomeCapabilities, Public.HomeDaySummary, Public.HomeLodgingFact,
  Public.HomeModel, Public.HomeReservationModel, Public.HomeTaskModel, Public.HomeViewProps,
  Public.LoadingModel, Public.LoadingViewProps, Public.LocationModel, Public.PersistenceModel,
  Public.PlaceIdentityModel, Public.PlaceStateModel, Public.ProgressSummary, Public.ProgressUpdate,
  Public.ProviderBootstrapState, Public.ProviderChannelStateModel, Public.ProviderStateModel,
  Public.RouteStateModel, Public.SetupIssue, Public.SetupRequiredModel, Public.SetupRequiredViewProps,
  Public.ShoppingItemModel, Public.TimelineEntryModel, Public.TimelineLogisticsGroupModel,
  Public.TimelineNodeFactsModel, Public.TimelineNodeModel, Public.TimelineRouteEntryModel,
  Public.TimingModel, Public.TripActions, Public.TripControllerProps, Public.TripDiagnosticEvent,
  Public.TripDiagnosticSink, Public.TripPresentationV2, Public.TripRecoveryHandlers,
  Public.TripRuntimeAdapters, Public.UseTripExperienceInput, Public.TripExperienceController,
];

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
export type AmendedFacts = [
  Assert<Equal<Public.ExperienceModel["days"], readonly Pick<Public.HomeDaySummary, "id" | "date" | "title" | "ordinal">[]>>,
  Assert<Equal<Public.TimelineNodeModel["booking"], Public.BookingFactModel | undefined>>,
  Assert<Equal<keyof Public.TripExperienceController, "model" | "actions" | "bindings">>,
  Assert<Equal<ReturnType<typeof Public.useTripExperience>, Public.TripExperienceController>>,
  Assert<Equal<Parameters<typeof Public.useTripExperience>[0], Public.UseTripExperienceInput>>,
  Assert<Equal<Parameters<typeof Public.TripController>[0], Public.TripControllerProps>>,
  Assert<Equal<keyof Public.HomeViewProps, "model" | "actions">>,
  Assert<Equal<keyof Public.ExperienceViewProps, "model" | "actions" | "bindings">>,
  Assert<Equal<keyof Public.SetupRequiredViewProps, "model" | "actions">>,
  Assert<Equal<keyof Public.LoadingViewProps, "model" | "actions">>,
  Assert<Equal<keyof Public.FatalErrorViewProps, "model" | "actions">>,
];

// Each exact retired name independently fails compilation if reintroduced.
// @ts-expect-error retired controller
export type NoAppController = Public.AppController;
// @ts-expect-error retired controller (TripExperienceController above remains valid)
export type NoExperienceController = Public.ExperienceController;
// @ts-expect-error retired presentation
export type NoTripPresentation = Public.TripPresentation;
// @ts-expect-error retired hook
export type NoExperienceHook = typeof Public.useTripExperienceController;
// @ts-expect-error private hook
export type NoCandidateHook = typeof Public.useCandidateDecision;
// @ts-expect-error private hook
export type NoOptionalCandidateHook = typeof Public.useOptionalCandidateDecision;
// @ts-expect-error private hook
export type NoSheetHook = typeof Public.useItinerarySheet;
// @ts-expect-error private hook
export type NoRouteHook = typeof Public.useRouteStates;
// @ts-expect-error private hook
export type NoProgressHook = typeof Public.useTripProgress;
// @ts-expect-error private hook
export type NoSelectionHook = typeof Public.useTripSelection;
// @ts-expect-error private hook
export type NoLocationHook = typeof Public.useUserLocation;
// @ts-expect-error incidental legacy controller types are private too
export type NoProgressController = Public.TripProgressController;
// @ts-expect-error incidental legacy selection types are private too
export type NoSelection = Public.TripSelection;
// @ts-expect-error incidental legacy selection controller is private too
export type NoSelectionController = Public.TripSelectionController;
// @ts-expect-error incidental legacy persistence type is private too
export type NoPersistenceStatus = Public.ProgressPersistenceStatus;
// @ts-expect-error incidental legacy route type is private too
export type NoRouteLoadState = Public.RouteLoadState;
// @ts-expect-error incidental legacy route type is private too
export type NoRouteStates = Public.RouteStates;
// @ts-expect-error incidental legacy route input is private too
export type NoRouteOptions = Public.UseRouteStatesOptions;
// @ts-expect-error incidental legacy location type is private too
export type NoLocationController = Public.UserLocationController;
// @ts-expect-error incidental legacy location type is private too
export type NoLocationStatus = Public.UserLocationStatus;
// @ts-expect-error incidental legacy decision type is private too
export type NoDecisionController = Public.CandidateDecisionController;
// @ts-expect-error incidental legacy trigger type is private too
export type NoCandidateTriggerProps = Public.CandidateTriggerProps;
// @ts-expect-error incidental legacy decision input is private too
export type NoDecisionOptions = Public.UseCandidateDecisionOptions;
