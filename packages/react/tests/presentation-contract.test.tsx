import type {
  BusinessStatus,
  CameraIntent,
  EdgeInsets,
  ExperienceSelectionSource,
  FactCertainty,
  HeaderTransitionState,
  MarkerMode,
  OpeningHoursFacts,
  PlaceOpeningState,
  PlaceUnresolvedReason,
  ProviderFailureReason,
  ProviderUnavailableResult,
  RouteMode,
  SemanticOwnerState,
  SheetGeometry,
  SheetGeometryInput,
  SheetSnap,
  ShoppingStatus,
  TimingCertainty,
  Trip,
  TripNavigationStore,
  TripNode,
  TripProgressV1,
  TripTask,
  MapViewportMetrics,
  UsableRegion,
} from "@laugh-tale-island/core";
import type {
  MapAdapterV2,
  MapPresentationV2,
  MapVisualProfile,
  MarkerContentFactory,
  NavigationAdapterV2,
  NavigationRequestV2,
  PlaceAdapterV2,
  ProgressStore,
  RouteAdapterV2,
  UserLocationContentFactory,
} from "@laugh-tale-island/core/browser";
import type { ComponentProps, ComponentType, HTMLAttributes, RefCallback } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  BookingFactModel,
  CandidateDecisionModel,
  CandidateOptionModel,
  ChecklistItemModel,
  CompletionCountModel,
  CompletionItemModel,
  ExperienceBindings,
  ExperienceCapabilities,
  ExperienceClockModel,
  ExperienceDayModel,
  ExperienceMapModel,
  ExperienceModel,
  ExperiencePlaceModel,
  ExperienceReservationModel,
  ExperienceRouteModel,
  ExperienceSheetModel,
  ExperienceTaskModel,
  ExperienceTripIdentity,
  ExperienceViewProps,
  FatalErrorModel,
  FatalErrorViewProps,
  HomeCapabilities,
  HomeDaySummary,
  HomeLodgingFact,
  HomeModel,
  HomeReservationModel,
  HomeTaskModel,
  HomeViewProps,
  LoadingModel,
  LoadingViewProps,
  LocationModel,
  PersistenceModel,
  PlaceIdentityModel,
  PlaceStateModel,
  ProgressSummary,
  ProgressUpdate,
  ProviderBootstrapState,
  ProviderChannelStateModel,
  ProviderStateModel,
  RouteStateModel,
  SetupIssue,
  SetupRequiredModel,
  SetupRequiredViewProps,
  ShoppingItemModel,
  TimelineEntryModel,
  TimelineLogisticsGroupModel,
  TimelineNodeFactsModel,
  TimelineNodeModel,
  TimelineRouteEntryModel,
  TimingModel,
  TripActions,
  TripControllerProps,
  TripDiagnosticEvent,
  TripDiagnosticSink,
  TripPresentationV2,
  TripRecoveryHandlers,
  TripRuntimeAdapters,
} from "@laugh-tale-island/react";

type ExpectedCompletionCountModel = {
  readonly completed: number;
  readonly total: number;
};

type ExpectedTimingModel = {
  readonly date?: string;
  readonly endDate?: string;
  readonly start?: string;
  readonly end?: string;
  readonly dayOffset?: number;
  readonly certainty: TimingCertainty;
};

type ExpectedBookingFactModel = {
  readonly status: "confirmed" | "pending" | "none";
  readonly reference?: string;
  readonly url?: string;
  readonly arrivalBufferMinutes?: number;
};

type ExpectedPlaceIdentityModel = {
  readonly label: string;
  readonly certainty: FactCertainty;
  readonly resolution:
    | { readonly status: "resolved" }
    | { readonly status: "unresolved"; readonly reason: PlaceUnresolvedReason };
};

type ExpectedCompletionItemModel = {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
};

type ExpectedProgressSummary = {
  readonly trip: CompletionCountModel;
  readonly days: readonly ({ readonly dayId: string } & CompletionCountModel)[];
  readonly selectedCandidates: readonly {
    readonly groupId: string;
    readonly optionId: string;
  }[];
  readonly shopping: readonly {
    readonly itemId: string;
    readonly status: ShoppingStatus;
  }[];
  readonly skippedNodeIds: readonly string[];
  readonly completedIds: readonly string[];
};

type ExpectedPersistenceModel = {
  readonly status: "persistent" | "memory-only";
  readonly writable: boolean;
};

type ExpectedHomeDaySummary = {
  readonly id: string;
  readonly date: string;
  readonly title: string;
  readonly summary?: string;
  readonly routeLabel?: string;
  readonly ordinal: number;
  readonly effective: boolean;
  readonly progress: CompletionCountModel;
};

type ExpectedHomeLodgingFact = {
  readonly ownerId: string;
  readonly dayId: string;
  readonly title: string;
  readonly role: "base" | "check-in" | "check-out" | "return";
  readonly timing: TimingModel;
  readonly place?: PlaceIdentityModel;
  readonly booking?: BookingFactModel;
};

type ExpectedHomeTaskModel = {
  readonly id: string;
  readonly title: string;
  readonly scope: "pretrip" | "day";
  readonly dayId?: string;
  readonly note?: string;
  readonly completed: boolean;
  readonly children: readonly CompletionItemModel[];
};

type ExpectedHomeReservationModel = {
  readonly id: string;
  readonly title: string;
  readonly ownerId: string;
  readonly booking: BookingFactModel;
};

type ExpectedHomeCapabilities = {
  readonly openExperienceDayIds: readonly string[];
  readonly progress: {
    readonly completionIds: readonly string[];
    readonly skippableNodeIds: readonly string[];
    readonly shoppingItemIds: readonly string[];
    readonly resetTrip: boolean;
    readonly resetDayIds: readonly string[];
  };
};

type ExpectedHomeModel = {
  readonly identity: {
    readonly tripId: string;
    readonly title: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly locale: string;
    readonly timezone: string;
    readonly destinationLabel?: string;
    readonly travelerLabel?: string;
  };
  readonly effectiveEntryDayId: string;
  readonly days: readonly HomeDaySummary[];
  readonly lodging: readonly HomeLodgingFact[];
  readonly tasks: readonly HomeTaskModel[];
  readonly reservations: readonly HomeReservationModel[];
  readonly progress: ProgressSummary;
  readonly persistence: PersistenceModel;
  readonly providers: ProviderStateModel;
  readonly capabilities: HomeCapabilities;
};

type ExpectedExperienceTripIdentity = {
  readonly id: string;
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly locale: string;
  readonly timezone: string;
  readonly destinationLabel?: string;
  readonly travelerLabel?: string;
};

type ExpectedExperienceDayModel = {
  readonly id: string;
  readonly date: string;
  readonly title: string;
  readonly summary?: string;
  readonly routeLabel?: string;
  readonly ordinal: number;
  readonly orderedDayIds: readonly string[];
};

type ExpectedExperienceClockModel = {
  readonly instant: string;
  readonly timezone: string;
  readonly clockPlaceLabel?: string;
};

type ExpectedChecklistItemModel = {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
};

type ExpectedShoppingItemModel = {
  readonly id: string;
  readonly title: string;
  readonly note?: string;
  readonly priority?: "must" | "nice";
  readonly status: ShoppingStatus;
};

type ExpectedTimelineNodeFactsModel =
  | {
      readonly kind: "transport";
      readonly mode: "walking" | "transit" | "driving";
      readonly plan?: string;
    }
  | {
      readonly kind: "transfer";
      readonly mode: "unknown" | "flight" | "rail" | "bus";
      readonly terminal?: string;
    }
  | {
      readonly kind: "lodging";
      readonly role: "base" | "check-in" | "check-out" | "return";
      readonly checklist: readonly ChecklistItemModel[];
    }
  | {
      readonly kind: "dining";
      readonly cuisine?: string;
      readonly candidateGroupId?: string;
    }
  | { readonly kind: "shopping"; readonly items: readonly ShoppingItemModel[] }
  | { readonly kind: "sightseeing"; readonly area?: string }
  | { readonly kind: "experience"; readonly durationMinutes?: number }
  | {
      readonly kind: "logistics";
      readonly checklist: readonly ChecklistItemModel[];
    }
  | {
      readonly kind: "custom";
      readonly customKind: string;
      readonly data: Readonly<Record<string, string | number | boolean>>;
    };

type ExpectedTimelineNodeModel = {
  readonly kind: "node";
  readonly ownerId: string;
  readonly nodeId: string;
  readonly title: string;
  readonly sourceKind: string;
  readonly role: "primary" | "base" | "journey" | "task";
  readonly markerMode: MarkerMode;
  readonly displayIndex?: number;
  readonly ordinal?: string;
  readonly timing: TimingModel;
  readonly booking?: BookingFactModel;
  readonly states: readonly SemanticOwnerState[];
  readonly incomingRouteIds: readonly string[];
  readonly details: readonly string[];
  readonly facts: TimelineNodeFactsModel;
  readonly completion?: CompletionItemModel;
  readonly capabilities: {
    readonly select: boolean;
    readonly skip: boolean;
    readonly complete: boolean;
    readonly place: boolean;
    readonly booking: boolean;
    readonly shopping: boolean;
    readonly candidateGroupId?: string;
  };
};

type ExpectedTimelineRouteEntryModel = {
  readonly kind: "route";
  readonly ownerId: string;
  readonly routeId: string;
  readonly role: "connector";
  readonly states: readonly SemanticOwnerState[];
};

type ExpectedTimelineLogisticsGroupModel = {
  readonly kind: "logistics-group";
  readonly ownerId: string;
  readonly role: "logistics-group";
  readonly titleKey: "timeline.logisticsGroup";
  readonly childOwnerIds: readonly string[];
  readonly incomingRouteIds: readonly string[];
  readonly children: readonly TimelineNodeModel[];
  readonly progress: CompletionCountModel;
};

type ExpectedRouteStateModel =
  | { readonly status: "idle" | "loading" }
  | {
      readonly status: "ready";
      readonly durationMinutes: number;
      readonly distanceMeters?: number;
      readonly steps: readonly string[];
      readonly transitLines: readonly {
        readonly name?: string;
        readonly shortName?: string;
      }[];
    }
  | {
      readonly status: "unavailable";
      readonly reason: ProviderFailureReason;
      readonly retryable: boolean;
    };

type ExpectedExperienceRouteModel = {
  readonly routeId: string;
  readonly dayId: string;
  readonly fromOwnerId: string;
  readonly toOwnerId: string;
  readonly mode: RouteMode;
  readonly source: "manual" | "provider" | "recomposed";
  readonly certainty: FactCertainty;
  readonly authored: {
    readonly durationMinutes?: number;
    readonly distanceMeters?: number;
    readonly summary?: string;
  };
  readonly runtime: RouteStateModel;
  readonly selected: boolean;
  readonly selectionSource: ExperienceSelectionSource | null;
  readonly navigationAvailable: boolean;
};

type ExpectedPlaceStateModel =
  | { readonly status: "idle" | "loading" }
  | {
      readonly status: "ready";
      readonly formattedAddress?: string;
      readonly businessStatus?: BusinessStatus;
      readonly openingHours?: OpeningHoursFacts;
      readonly opening: PlaceOpeningState;
    }
  | {
      readonly status: "unavailable";
      readonly reason: ProviderFailureReason;
      readonly retryable: boolean;
    };

type ExpectedExperiencePlaceModel = {
  readonly ownerId: string;
  readonly place: PlaceIdentityModel;
  readonly runtime: PlaceStateModel;
  readonly navigationAvailable: boolean;
};

type ExpectedExperienceMapModel = {
  readonly presentation: MapPresentationV2;
  readonly provider: ProviderChannelStateModel;
  readonly cameraIntent: CameraIntent | null;
  readonly layout: {
    readonly viewport: MapViewportMetrics;
    readonly usableRegion: UsableRegion;
    readonly edgeInsets: EdgeInsets;
  } | null;
};

type ExpectedExperienceSheetModel = {
  readonly snap: SheetSnap;
  readonly geometry: SheetGeometry | null;
  readonly interactive: boolean;
};

type ExpectedCandidateOptionModel = {
  readonly id: string;
  readonly title: string;
  readonly ordinal: string;
  readonly place?: PlaceIdentityModel;
  readonly booking?: BookingFactModel;
  readonly selected: boolean;
  readonly draft: boolean;
};

type ExpectedCandidateDecisionModel = {
  readonly groupId: string;
  readonly parentOwnerId: string;
  readonly mode: "single" | "browse";
  readonly open: boolean;
  readonly sessionId: number | null;
  readonly committedOptionId?: string;
  readonly draftOptionId?: string;
  readonly options: readonly CandidateOptionModel[];
  readonly capabilities: {
    readonly previewOptionIds: readonly string[];
    readonly cancel: boolean;
    readonly confirm: boolean;
    readonly reopen: boolean;
  };
};

type ExpectedExperienceReservationModel = {
  readonly id: string;
  readonly title: string;
  readonly ownerId: string;
  readonly booking: BookingFactModel;
};

type ExpectedExperienceTaskModel = ExpectedHomeTaskModel;

type ExpectedLocationModel = {
  readonly status: "idle" | "requesting" | "active" | "denied" | "unavailable";
  readonly hasFix: boolean;
};

type ExpectedExperienceCapabilities = {
  readonly selectDayIds: readonly string[];
  readonly selectNodeIds: readonly string[];
  readonly selectRouteIds: readonly string[];
  readonly restoreAutomaticSelection: boolean;
  readonly returnToCurrent: boolean;
  readonly returnToLodging: boolean;
  readonly restoreFullDay: boolean;
  readonly retryMap: boolean;
  readonly retryRouteIds: readonly string[];
  readonly retryPlaceOwnerIds: readonly string[];
  readonly navigationOwnerIds: readonly string[];
  readonly location: {
    readonly begin: boolean;
    readonly recenter: boolean;
    readonly stop: boolean;
  };
  readonly sheetSnaps: readonly SheetSnap[];
  readonly progress: HomeCapabilities["progress"];
};

type ExpectedProviderChannelStateModel =
  | { readonly status: "idle" | "loading" | "ready"; readonly retryable: false }
  | {
      readonly status: "unavailable";
      readonly reason: ProviderFailureReason;
      readonly retryable: boolean;
    };

type ExpectedProviderStateModel = {
  readonly map: ProviderChannelStateModel;
  readonly routes: ProviderChannelStateModel;
  readonly places: ProviderChannelStateModel;
};

type ExpectedExperienceModel = {
  readonly trip: ExperienceTripIdentity;
  readonly day: ExperienceDayModel;
  readonly days: readonly Pick<HomeDaySummary, "id" | "date" | "title" | "ordinal">[];
  readonly clock: ExperienceClockModel;
  readonly owners: {
    readonly currentId: string | null;
    readonly nextId: string | null;
    readonly viewingId: string | null;
    readonly selectedId: string | null;
  };
  readonly itinerary: {
    readonly primaryCount: number;
    readonly collapsedOwnerId: string | null;
    readonly focusFallback: {
      readonly slot: "node" | "route";
      readonly ownerId: string;
    } | null;
  };
  readonly timeline: readonly TimelineEntryModel[];
  readonly routes: readonly ExperienceRouteModel[];
  readonly places: readonly ExperiencePlaceModel[];
  readonly map: ExperienceMapModel;
  readonly sheet: ExperienceSheetModel;
  readonly header: {
    readonly expanded: boolean;
    readonly revision: number;
    readonly transition: HeaderTransitionState | null;
  };
  readonly progress: ProgressSummary;
  readonly candidates: readonly CandidateDecisionModel[];
  readonly reservations: readonly ExperienceReservationModel[];
  readonly tasks: readonly ExperienceTaskModel[];
  readonly location: LocationModel;
  readonly persistence: PersistenceModel;
  readonly providers: ProviderStateModel;
  readonly capabilities: ExperienceCapabilities;
  readonly motion: "full" | "reduced";
};

type ExpectedSetupIssue =
  | { readonly kind: "missing-trip"; readonly copyKey: "setup.missingTrip" }
  | {
      readonly kind: "invalid-trip";
      readonly copyKey: "setup.invalidTrip";
      readonly paths: readonly string[];
    };

type ExpectedSetupRequiredModel = {
  readonly issues: readonly SetupIssue[];
  readonly capabilities: { readonly retry: boolean };
};

type ExpectedLoadingModel = {
  readonly operation: "progress" | "map" | "routes" | "places" | "location";
  readonly owner:
    | { readonly kind: "surface"; readonly id: "home" | "experience" }
    | { readonly kind: "owner"; readonly id: string };
};

type ExpectedFatalErrorModel = {
  readonly category: "render" | "state" | "provider";
  readonly copyKey: "fatal.render" | "fatal.state" | "fatal.provider";
  readonly retained: {
    readonly home: boolean;
    readonly itinerary: boolean;
    readonly externalNavigation: boolean;
  };
  readonly capabilities: { readonly retry: boolean; readonly openHome: boolean };
};

type ExpectedProgressUpdate =
  | { readonly kind: "completion"; readonly id: string; readonly completed: boolean }
  | { readonly kind: "node-skipped"; readonly nodeId: string; readonly skipped: boolean }
  | {
      readonly kind: "shopping-status";
      readonly itemId: string;
      readonly status: ShoppingStatus;
    };

type ExpectedTripRecoveryHandlers = {
  retrySetup?(): void;
  retryFatal?(): void;
};

type ExpectedProviderBootstrapState = {
  map?: ProviderUnavailableResult | { status: "loading"; retryable: false };
  routes?: ProviderUnavailableResult;
  places?: ProviderUnavailableResult;
};

type ExpectedTripRuntimeAdapters = {
  createMap?(): MapAdapterV2;
  retryMapBootstrap?(): void;
  createRoutes?(): RouteAdapterV2;
  createPlaces?(): PlaceAdapterV2;
  navigation?: NavigationAdapterV2;
};

type ExpectedTripDiagnosticEvent =
  | {
      readonly scope: "provider";
      readonly channel: "map" | "route" | "place";
      readonly phase: "bootstrap" | "request" | "runtime";
      readonly reason: ProviderFailureReason;
      readonly ownerId?: string;
      readonly diagnostic?: string;
      readonly cause?: unknown;
    }
  | {
      readonly scope: "controller";
      readonly phase: "validation" | "state" | "render";
      readonly category: FatalErrorModel["category"];
      readonly diagnostic?: string;
      readonly cause?: unknown;
    };

type ExpectedTripActions = {
  openExperience(dayId?: string): void;
  openHome(): void;
  selectDay(dayId: string): void;
  selectNode(nodeId: string): void;
  selectRoute(routeId: string, source: "list" | "map"): void;
  selectCandidate(ownerId: string): void;
  setSheetSnap(snap: SheetSnap): void;
  stepSheet(direction: "expand" | "collapse"): void;
  setHeaderExpanded(expanded: boolean): void;
  settleHeaderTransition(transitionId: number): void;
  restoreAutomaticSelection(): void;
  returnToCurrent(): void;
  returnToLodging(): void;
  restoreFullDay(): void;
  retryProvider(kind: "map" | "route" | "place", ownerId?: string): void;
  openNavigation(ownerId: string): void;
  beginLocation(): void;
  recenterLocation(): void;
  stopLocation(): void;
  previewCandidate(groupId: string, optionId: string): void;
  cancelCandidate(groupId: string): void;
  confirmCandidate(groupId: string): void;
  reopenCandidate(groupId: string): void;
  updateProgress(update: ProgressUpdate): void;
  resetProgress(scope: "trip" | "day", dayId?: string): void;
  retrySetup(): void;
  retryFatal(): void;
};

type ExpectedExperienceBindings = {
  layout: {
    mapViewportRef: RefCallback<HTMLElement>;
    occlusionRef(id: string): RefCallback<HTMLElement>;
  };
  sheet: {
    getSurfaceProps(): HTMLAttributes<HTMLElement> & { readonly ref: RefCallback<HTMLElement> };
    getHandleProps(): HTMLAttributes<HTMLElement>;
    setMeasuredGeometry(input: SheetGeometryInput): void;
  };
  owners: {
    nodeRef(ownerId: string): RefCallback<HTMLElement>;
    routeRef(ownerId: string): RefCallback<HTMLElement>;
  };
  focus: {
    dialogRef(ownerId: string): RefCallback<HTMLElement>;
    disclosureTriggerRef(ownerId: string): RefCallback<HTMLElement>;
    restoreTrigger(
      ownerId: string,
      fallback?: { slot: "node" | "route"; ownerId: string },
    ): void;
  };
};

type ExpectedTripPresentationV2 = {
  Home: ComponentType<HomeViewProps>;
  Experience: ComponentType<ExperienceViewProps>;
  SetupRequired: ComponentType<SetupRequiredViewProps>;
  Loading: ComponentType<LoadingViewProps>;
  FatalError: ComponentType<FatalErrorViewProps>;
  mapVisualProfile: MapVisualProfile;
  createMarkerContent: MarkerContentFactory;
  createUserLocationContent: UserLocationContentFactory;
};

type ExpectedTripControllerProps = {
  trip: Trip | null;
  presentation: TripPresentationV2;
  runtime?: TripRuntimeAdapters;
  providerBootstrap?: ProviderBootstrapState;
  navigationStore?: TripNavigationStore;
  progressStore?: ProgressStore;
  clock?: () => string;
  setupIssues?: readonly SetupIssue[];
  recovery?: TripRecoveryHandlers;
  onDiagnostic?: TripDiagnosticSink;
};

const node = (ownerId: string): TimelineNodeModel => ({
  kind: "node",
  ownerId,
  nodeId: ownerId,
  title: ownerId,
  sourceKind: "logistics",
  role: "task",
  markerMode: "none",
  timing: { certainty: "unknown" },
  states: [],
  incomingRouteIds: [],
  details: [],
  facts: { kind: "logistics", checklist: [] },
  capabilities: {
    select: true,
    skip: false,
    complete: true,
    place: false,
    booking: false,
    shopping: false,
  },
});

function typecheckOnly(check: () => void): void {
  void check;
}

function inspectFacts(facts: TimelineNodeFactsModel): string {
  // @ts-expect-error Presentation facts never expose the raw node payload.
  void facts.payload;
  switch (facts.kind) {
    case "transport":
      expectTypeOf(facts.mode).toEqualTypeOf<"walking" | "transit" | "driving">();
      expectTypeOf(facts.plan).toEqualTypeOf<string | undefined>();
      return facts.plan ?? facts.mode;
    case "transfer":
      expectTypeOf(facts.mode).toEqualTypeOf<"unknown" | "flight" | "rail" | "bus">();
      expectTypeOf(facts.terminal).toEqualTypeOf<string | undefined>();
      return facts.terminal ?? facts.mode;
    case "lodging":
      expectTypeOf(facts.role).toEqualTypeOf<"base" | "check-in" | "check-out" | "return">();
      expectTypeOf(facts.checklist).toEqualTypeOf<readonly ChecklistItemModel[]>();
      return facts.checklist.map(({ id, title, completed }) => `${id}:${title}:${completed}`).join();
    case "dining":
      expectTypeOf(facts.cuisine).toEqualTypeOf<string | undefined>();
      expectTypeOf(facts.candidateGroupId).toEqualTypeOf<string | undefined>();
      return facts.cuisine ?? facts.candidateGroupId ?? "";
    case "shopping":
      expectTypeOf(facts.items).toEqualTypeOf<readonly ShoppingItemModel[]>();
      return facts.items
        .map(({ id, title, priority, status }) => `${id}:${title}:${priority ?? ""}:${status}`)
        .join();
    case "sightseeing":
      expectTypeOf(facts.area).toEqualTypeOf<string | undefined>();
      return facts.area ?? "";
    case "experience":
      expectTypeOf(facts.durationMinutes).toEqualTypeOf<number | undefined>();
      return String(facts.durationMinutes ?? "");
    case "logistics":
      expectTypeOf(facts.checklist).toEqualTypeOf<readonly ChecklistItemModel[]>();
      return facts.checklist.map(({ id, title, completed }) => `${id}:${title}:${completed}`).join();
    case "custom":
      expectTypeOf(facts.customKind).toEqualTypeOf<string>();
      expectTypeOf(facts.data).toEqualTypeOf<
        Readonly<Record<string, string | number | boolean>>
      >();
      return facts.customKind;
    default:
      return facts satisfies never;
  }
}

describe("v2 presentation contract", () => {
  it("exports the exact readonly Home model family", () => {
    expectTypeOf<CompletionCountModel>().toEqualTypeOf<ExpectedCompletionCountModel>();
    expectTypeOf<TimingModel>().toEqualTypeOf<ExpectedTimingModel>();
    expectTypeOf<BookingFactModel>().toEqualTypeOf<ExpectedBookingFactModel>();
    expectTypeOf<PlaceIdentityModel>().toEqualTypeOf<ExpectedPlaceIdentityModel>();
    expectTypeOf<CompletionItemModel>().toEqualTypeOf<ExpectedCompletionItemModel>();
    expectTypeOf<ProgressSummary>().toEqualTypeOf<ExpectedProgressSummary>();
    expectTypeOf<PersistenceModel>().toEqualTypeOf<ExpectedPersistenceModel>();
    expectTypeOf<HomeDaySummary>().toEqualTypeOf<ExpectedHomeDaySummary>();
    expectTypeOf<HomeLodgingFact>().toEqualTypeOf<ExpectedHomeLodgingFact>();
    expectTypeOf<HomeTaskModel>().toEqualTypeOf<ExpectedHomeTaskModel>();
    expectTypeOf<HomeReservationModel>().toEqualTypeOf<ExpectedHomeReservationModel>();
    expectTypeOf<HomeCapabilities>().toEqualTypeOf<ExpectedHomeCapabilities>();
    expectTypeOf<HomeModel>().toEqualTypeOf<ExpectedHomeModel>();

    typecheckOnly(() => {
      const home = {} as HomeModel;
      // @ts-expect-error Home model identity is readonly.
      home.identity = {} as HomeModel["identity"];
      // @ts-expect-error Nested Home identity is readonly.
      home.identity.title = "changed";
      // @ts-expect-error Lodging is a required readonly array.
      home.lodging[0] = home.lodging[1];
    });
  });

  it("exports the exact readonly Experience model family", () => {
    expectTypeOf<ExperienceTripIdentity>().toEqualTypeOf<ExpectedExperienceTripIdentity>();
    expectTypeOf<ExperienceDayModel>().toEqualTypeOf<ExpectedExperienceDayModel>();
    expectTypeOf<ExperienceClockModel>().toEqualTypeOf<ExpectedExperienceClockModel>();
    expectTypeOf<ChecklistItemModel>().toEqualTypeOf<ExpectedChecklistItemModel>();
    expectTypeOf<ShoppingItemModel>().toEqualTypeOf<ExpectedShoppingItemModel>();
    expectTypeOf<TimelineNodeFactsModel>().toEqualTypeOf<ExpectedTimelineNodeFactsModel>();
    expectTypeOf<TimelineNodeModel>().toEqualTypeOf<ExpectedTimelineNodeModel>();
    expectTypeOf<TimelineRouteEntryModel>().toEqualTypeOf<ExpectedTimelineRouteEntryModel>();
    expectTypeOf<TimelineLogisticsGroupModel>().toEqualTypeOf<
      ExpectedTimelineLogisticsGroupModel
    >();
    expectTypeOf<TimelineEntryModel>().toEqualTypeOf<
      TimelineNodeModel | TimelineRouteEntryModel | TimelineLogisticsGroupModel
    >();
    expectTypeOf<RouteStateModel>().toEqualTypeOf<ExpectedRouteStateModel>();
    expectTypeOf<ExperienceRouteModel>().toEqualTypeOf<ExpectedExperienceRouteModel>();
    expectTypeOf<PlaceStateModel>().toEqualTypeOf<ExpectedPlaceStateModel>();
    expectTypeOf<ExperiencePlaceModel>().toEqualTypeOf<ExpectedExperiencePlaceModel>();
    expectTypeOf<ExperienceMapModel>().toEqualTypeOf<ExpectedExperienceMapModel>();
    expectTypeOf<ExperienceSheetModel>().toEqualTypeOf<ExpectedExperienceSheetModel>();
    expectTypeOf<CandidateOptionModel>().toEqualTypeOf<ExpectedCandidateOptionModel>();
    expectTypeOf<CandidateDecisionModel>().toEqualTypeOf<ExpectedCandidateDecisionModel>();
    expectTypeOf<ExperienceReservationModel>().toEqualTypeOf<
      ExpectedExperienceReservationModel
    >();
    expectTypeOf<ExperienceTaskModel>().toEqualTypeOf<ExpectedExperienceTaskModel>();
    expectTypeOf<LocationModel>().toEqualTypeOf<ExpectedLocationModel>();
    expectTypeOf<ExperienceCapabilities>().toEqualTypeOf<ExpectedExperienceCapabilities>();
    expectTypeOf<ProviderChannelStateModel>().toEqualTypeOf<
      ExpectedProviderChannelStateModel
    >();
    expectTypeOf<ProviderStateModel>().toEqualTypeOf<ExpectedProviderStateModel>();
    expectTypeOf<ExperienceModel>().toEqualTypeOf<ExpectedExperienceModel>();

    expectTypeOf<ExperienceModel["owners"]["selectedId"]>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<ExperienceModel["itinerary"]>().toEqualTypeOf<{
      readonly primaryCount: number;
      readonly collapsedOwnerId: string | null;
      readonly focusFallback: {
        readonly slot: "node" | "route";
        readonly ownerId: string;
      } | null;
    }>();
  });

  it("keeps logistics children complete and ordered", () => {
    const children = [node("node-a"), node("node-b")] as const;
    const group: TimelineLogisticsGroupModel = {
      kind: "logistics-group",
      ownerId: "group",
      role: "logistics-group",
      titleKey: "timeline.logisticsGroup",
      childOwnerIds: ["node-a", "node-b"],
      incomingRouteIds: [],
      children,
      progress: { completed: 0, total: 2 },
    };

    expectTypeOf(group.titleKey).toEqualTypeOf<"timeline.logisticsGroup">();
    expectTypeOf(group.children).toEqualTypeOf<readonly TimelineNodeModel[]>();
    expect(group.childOwnerIds).toEqual(group.children.map(({ ownerId }) => ownerId));

    // @ts-expect-error Children are complete node models, not owner IDs.
    const idsOnly: TimelineLogisticsGroupModel = { ...group, children: ["node-a"] };
    void idsOnly;
  });

  it("narrows every authored node-fact variant without a raw payload", () => {
    const facts: readonly TimelineNodeFactsModel[] = [
      { kind: "transport", mode: "walking", plan: "river path" },
      { kind: "transfer", mode: "rail", terminal: "1" },
      {
        kind: "lodging",
        role: "check-in",
        checklist: [{ id: "passport", title: "Passport", completed: true }],
      },
      { kind: "dining", cuisine: "regional", candidateGroupId: "dinner" },
      {
        kind: "shopping",
        items: [{ id: "tea", title: "Tea", priority: "must", status: "purchased" }],
      },
      { kind: "sightseeing", area: "harbor" },
      { kind: "experience", durationMinutes: 90 },
      {
        kind: "logistics",
        checklist: [{ id: "ticket", title: "Ticket", completed: false }],
      },
      { kind: "custom", customKind: "ceremony", data: { reserved: true } },
    ];

    expect(facts.map(inspectFacts)).toHaveLength(9);
  });

  it("exports exceptional, progress, diagnostics, runtime, action, and binding seams", () => {
    expectTypeOf<SetupIssue>().toEqualTypeOf<ExpectedSetupIssue>();
    expectTypeOf<SetupRequiredModel>().toEqualTypeOf<ExpectedSetupRequiredModel>();
    expectTypeOf<LoadingModel>().toEqualTypeOf<ExpectedLoadingModel>();
    expectTypeOf<FatalErrorModel>().toEqualTypeOf<ExpectedFatalErrorModel>();
    expectTypeOf<ProgressUpdate>().toEqualTypeOf<ExpectedProgressUpdate>();
    expectTypeOf<TripRecoveryHandlers>().toEqualTypeOf<ExpectedTripRecoveryHandlers>();
    expectTypeOf<ProviderBootstrapState>().toEqualTypeOf<ExpectedProviderBootstrapState>();
    expectTypeOf<TripRuntimeAdapters>().toEqualTypeOf<ExpectedTripRuntimeAdapters>();
    expectTypeOf<TripDiagnosticEvent>().toEqualTypeOf<ExpectedTripDiagnosticEvent>();
    expectTypeOf<TripDiagnosticSink>().toEqualTypeOf<(event: TripDiagnosticEvent) => void>();
    expectTypeOf<TripActions>().toEqualTypeOf<ExpectedTripActions>();
    expectTypeOf<ExperienceBindings>().toEqualTypeOf<ExpectedExperienceBindings>();
    expectTypeOf<TripPresentationV2>().toEqualTypeOf<ExpectedTripPresentationV2>();
    expectTypeOf<TripControllerProps>().toEqualTypeOf<ExpectedTripControllerProps>();

    expectTypeOf<NavigationAdapterV2["open"]>().parameters.toEqualTypeOf<[
      NavigationRequestV2,
    ]>();
  });

  it("gives all views one action type and bindings only to Experience", () => {
    expectTypeOf<HomeViewProps>().toEqualTypeOf<{
      readonly model: HomeModel;
      readonly actions: TripActions;
    }>();
    expectTypeOf<ExperienceViewProps>().toEqualTypeOf<{
      readonly model: ExperienceModel;
      readonly actions: TripActions;
      readonly bindings: ExperienceBindings;
    }>();
    expectTypeOf<SetupRequiredViewProps>().toEqualTypeOf<{
      readonly model: SetupRequiredModel;
      readonly actions: TripActions;
    }>();
    expectTypeOf<LoadingViewProps>().toEqualTypeOf<{
      readonly model: LoadingModel;
      readonly actions: TripActions;
    }>();
    expectTypeOf<FatalErrorViewProps>().toEqualTypeOf<{
      readonly model: FatalErrorModel;
      readonly actions: TripActions;
    }>();
    expectTypeOf<ComponentProps<TripPresentationV2["Home"]>["actions"]>().toEqualTypeOf<
      TripActions
    >();
    expectTypeOf<
      ComponentProps<TripPresentationV2["Experience"]>["actions"]
    >().toEqualTypeOf<TripActions>();
    expectTypeOf<
      ComponentProps<TripPresentationV2["SetupRequired"]>["actions"]
    >().toEqualTypeOf<TripActions>();
    expectTypeOf<ComponentProps<TripPresentationV2["Loading"]>["actions"]>().toEqualTypeOf<
      TripActions
    >();
    expectTypeOf<
      ComponentProps<TripPresentationV2["FatalError"]>["actions"]
    >().toEqualTypeOf<TripActions>();
    expectTypeOf<
      ComponentProps<TripPresentationV2["Experience"]>["bindings"]
    >().toEqualTypeOf<ExperienceBindings>();

    // @ts-expect-error Home presentations never receive package bindings.
    type HomeBindings = ComponentProps<TripPresentationV2["Home"]>["bindings"];
    // @ts-expect-error Setup presentations never receive package bindings.
    type SetupBindings = ComponentProps<TripPresentationV2["SetupRequired"]>["bindings"];
    // @ts-expect-error Loading presentations never receive package bindings.
    type LoadingBindings = ComponentProps<TripPresentationV2["Loading"]>["bindings"];
    // @ts-expect-error Exceptional presentations never receive package bindings.
    type FatalBindings = ComponentProps<TripPresentationV2["FatalError"]>["bindings"];
    void (0 as unknown as HomeBindings);
    void (0 as unknown as SetupBindings);
    void (0 as unknown as LoadingBindings);
    void (0 as unknown as FatalBindings);
  });

  it("requires both content factories and the visual profile", () => {
    const Empty = () => null;
    const profile = {} as MapVisualProfile;
    const marker: MarkerContentFactory = () => {
      throw new Error();
    };
    const location: UserLocationContentFactory = () => {
      throw new Error();
    };
    const complete: TripPresentationV2 = {
      Home: Empty,
      Experience: Empty,
      SetupRequired: Empty,
      Loading: Empty,
      FatalError: Empty,
      mapVisualProfile: profile,
      createMarkerContent: marker,
      createUserLocationContent: location,
    };
    expect(complete.createMarkerContent).toBe(marker);
    expect(complete.createUserLocationContent).toBe(location);

    // @ts-expect-error Both content factories are required.
    const missingFactories: TripPresentationV2 = {
      Home: Empty,
      Experience: Empty,
      SetupRequired: Empty,
      Loading: Empty,
      FatalError: Empty,
      mapVisualProfile: profile,
    };
    void missingFactories;

    // @ts-expect-error The visual profile is required.
    const missingProfile: TripPresentationV2 = {
      Home: Empty,
      Experience: Empty,
      SetupRequired: Empty,
      Loading: Empty,
      FatalError: Empty,
      createMarkerContent: marker,
      createUserLocationContent: location,
    };
    void missingProfile;
  });

  it("keeps partial runtimes, bootstrap failures, and recovery independently typed", () => {
    const runtime: TripRuntimeAdapters = {};
    const bootstrap: ProviderBootstrapState = {
      map: {
        status: "unavailable",
        reason: "missing-configuration",
        retryable: false,
        diagnostic: "app-only evidence",
      },
    };
    const recovery: TripRecoveryHandlers = {
      retrySetup() {},
      retryFatal() {},
    };
    expectTypeOf<TripRuntimeAdapters["createMap"]>().toEqualTypeOf<
      (() => MapAdapterV2) | undefined
    >();
    expectTypeOf<TripRuntimeAdapters["createRoutes"]>().toEqualTypeOf<
      (() => RouteAdapterV2) | undefined
    >();
    expectTypeOf<TripRuntimeAdapters["createPlaces"]>().toEqualTypeOf<
      (() => PlaceAdapterV2) | undefined
    >();
    expectTypeOf<TripRuntimeAdapters["navigation"]>().toEqualTypeOf<
      NavigationAdapterV2 | undefined
    >();
    expectTypeOf<ProviderBootstrapState["map"]>().toEqualTypeOf<
      ProviderUnavailableResult | { status: "loading"; retryable: false } | undefined
    >();
    expectTypeOf<TripRecoveryHandlers["retrySetup"]>().toEqualTypeOf<
      (() => void) | undefined
    >();
    expectTypeOf<SetupRequiredModel["capabilities"]["retry"]>().toEqualTypeOf<boolean>();
    expectTypeOf<FatalErrorModel["capabilities"]["retry"]>().toEqualTypeOf<boolean>();
    expect(runtime).toEqual({});
    expect(Object.keys(recovery)).toEqual(["retrySetup", "retryFatal"]);
    expect(bootstrap.map).toMatchObject({ diagnostic: "app-only evidence" });
  });

  it("keeps progress variants and diagnostic evidence distinct", () => {
    const updates: readonly ProgressUpdate[] = [
      { kind: "completion", id: "checklist:item", completed: true },
      { kind: "node-skipped", nodeId: "node", skipped: true },
      { kind: "shopping-status", itemId: "tea", status: "purchased" },
    ];
    expect(updates).toHaveLength(3);

    const providerEvent: TripDiagnosticEvent = {
      scope: "provider",
      channel: "route",
      phase: "request",
      reason: "network",
      ownerId: "route-1",
      diagnostic: "private evidence",
      cause: new Error("private cause"),
    };
    const controllerEvent: TripDiagnosticEvent = {
      scope: "controller",
      phase: "validation",
      category: "state",
      diagnostic: "private evidence",
      cause: { private: true },
    };
    const received: TripDiagnosticEvent[] = [];
    const sink: TripDiagnosticSink = (event) => received.push(event);
    sink(providerEvent);
    sink(controllerEvent);
    expect(received).toEqual([providerEvent, controllerEvent]);

    const invalidShopping: ProgressUpdate = {
      kind: "shopping-status",
      itemId: "tea",
      status: "pending",
      // @ts-expect-error Completion truth cannot replace shopping status.
      completed: true,
    };
    const invalidSkipped: ProgressUpdate = {
      kind: "node-skipped",
      nodeId: "node",
      skipped: false,
      // @ts-expect-error Completion truth cannot replace skipped truth.
      completed: false,
    };
    void invalidShopping;
    void invalidSkipped;
  });

  it("rejects incompatible raw records and presentation diagnostic fields", () => {
    typecheckOnly(() => {
      const rawTrip = {} as Trip;
      const rawNode = {} as TripNode;
      const rawTask = {} as TripTask;
      const rawProgress = {} as TripProgressV1;
      const adapter = {} as MapAdapterV2;
      const controller = {} as TripNavigationStore;
      const provider = {} as ProviderUnavailableResult;

      // @ts-expect-error Home is a grouped model, never a raw Trip.
      const home: HomeModel = rawTrip;
      // @ts-expect-error Timeline nodes never expose raw node records.
      const timelineNode: TimelineNodeModel = rawNode;
      // @ts-expect-error Tasks are projected completion models.
      const task: HomeTaskModel = rawTask;
      // @ts-expect-error Progress is a grouped readonly summary.
      const progress: ProgressSummary = rawProgress;
      // @ts-expect-error Map adapters cannot enter map presentation models.
      const map: ExperienceMapModel = adapter;
      // @ts-expect-error Controller stores cannot enter Experience models.
      const experience: ExperienceModel = controller;
      // @ts-expect-error Bootstrap provider failures are not grouped provider state.
      const providers: ProviderStateModel = provider;
      void [home, timelineNode, task, progress, map, experience, providers];
    });

    const rawReservationRecord: HomeReservationModel = {
      id: "reservation",
      title: "Reservation",
      ownerId: "owner",
      booking: { status: "confirmed" },
      // @ts-expect-error Presentation reservation literals reject raw excess fields.
      providerPayload: { reference: "raw" },
    };

    const providerState: ProviderChannelStateModel = {
      status: "unavailable",
      reason: "network",
      retryable: true,
      // @ts-expect-error Presentation provider state omits diagnostic evidence.
      diagnostic: "private",
    };
    const fatal: FatalErrorModel = {
      category: "provider",
      copyKey: "fatal.provider",
      retained: { home: true, itinerary: true, externalNavigation: false },
      capabilities: { retry: true, openHome: true },
      // @ts-expect-error Presentation error models omit raw causes.
      cause: new Error("private"),
    };
    void providerState;
    void fatal;
    void rawReservationRecord;
  });
});
