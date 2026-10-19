import type {
  BusinessStatus,
  CameraIntent,
  EdgeInsets,
  ExperienceSelectionSource,
  FactCertainty,
  HeaderTransitionState,
  MapViewportMetrics,
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
  UsableRegion,
} from "@laugh-tale-island/core";
import type {
  MapAdapterV2,
  MapPresentationV2,
  MapVisualProfile,
  MarkerContentFactory,
  NavigationAdapterV2,
  PlaceAdapterV2,
  ProgressStore,
  RouteAdapterV2,
  UserLocationContentFactory,
} from "@laugh-tale-island/core/browser";
import type { ComponentType, HTMLAttributes, RefCallback } from "react";

export interface TripPresentationV2 {
  Home: ComponentType<HomeViewProps>;
  Experience: ComponentType<ExperienceViewProps>;
  SetupRequired: ComponentType<SetupRequiredViewProps>;
  Loading: ComponentType<LoadingViewProps>;
  FatalError: ComponentType<FatalErrorViewProps>;
  mapVisualProfile: MapVisualProfile;
  createMarkerContent: MarkerContentFactory;
  createUserLocationContent: UserLocationContentFactory;
}

export interface TripRuntimeAdapters {
  createMap?(): MapAdapterV2;
  /** Retry the host-owned SDK configuration without remounting the controller. */
  retryMapBootstrap?(): void;
  createRoutes?(): RouteAdapterV2;
  createPlaces?(): PlaceAdapterV2;
  navigation?: NavigationAdapterV2;
}

export interface ProviderBootstrapState {
  map?: ProviderUnavailableResult | { status: "loading"; retryable: false };
  routes?: ProviderUnavailableResult;
  places?: ProviderUnavailableResult;
}

export type TripDiagnosticEvent =
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

export type TripDiagnosticSink = (event: TripDiagnosticEvent) => void;

export interface TripControllerProps {
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
}

export interface TripRecoveryHandlers {
  retrySetup?(): void;
  retryFatal?(): void;
}

export interface HomeViewProps {
  readonly model: HomeModel;
  readonly actions: TripActions;
}

export interface ExperienceViewProps {
  readonly model: ExperienceModel;
  readonly actions: TripActions;
  readonly bindings: ExperienceBindings;
}

export interface SetupRequiredViewProps {
  readonly model: SetupRequiredModel;
  readonly actions: TripActions;
}

export interface LoadingViewProps {
  readonly model: LoadingModel;
  readonly actions: TripActions;
}

export interface FatalErrorViewProps {
  readonly model: FatalErrorModel;
  readonly actions: TripActions;
}

export interface HomeModel {
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
}

export interface CompletionCountModel {
  readonly completed: number;
  readonly total: number;
}

export interface TimingModel {
  readonly date?: string;
  readonly endDate?: string;
  readonly start?: string;
  readonly end?: string;
  readonly dayOffset?: number;
  readonly certainty: TimingCertainty;
}

export interface BookingFactModel {
  readonly status: "confirmed" | "pending" | "none";
  readonly reference?: string;
  readonly url?: string;
  readonly arrivalBufferMinutes?: number;
}

export interface PlaceIdentityModel {
  readonly label: string;
  readonly certainty: FactCertainty;
  readonly resolution:
    | { readonly status: "resolved" }
    | {
        readonly status: "unresolved";
        readonly reason: PlaceUnresolvedReason;
      };
}

export interface CompletionItemModel {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

export interface ProgressSummary {
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
}

export interface PersistenceModel {
  readonly status: "persistent" | "memory-only";
  readonly writable: boolean;
}

export interface HomeDaySummary {
  readonly id: string;
  readonly date: string;
  readonly title: string;
  readonly summary?: string;
  readonly routeLabel?: string;
  readonly ordinal: number;
  readonly effective: boolean;
  readonly progress: CompletionCountModel;
}

export interface HomeLodgingFact {
  readonly ownerId: string;
  readonly dayId: string;
  readonly title: string;
  readonly role: "base" | "check-in" | "check-out" | "return";
  readonly timing: TimingModel;
  readonly place?: PlaceIdentityModel;
  readonly booking?: BookingFactModel;
}

export interface HomeTaskModel {
  readonly id: string;
  readonly title: string;
  readonly scope: "pretrip" | "day";
  readonly dayId?: string;
  readonly note?: string;
  readonly completed: boolean;
  readonly children: readonly CompletionItemModel[];
}

export interface HomeReservationModel {
  readonly id: string;
  readonly title: string;
  readonly ownerId: string;
  readonly booking: BookingFactModel;
  readonly destination?: { readonly dayId: string; readonly nodeId: string };
}

export interface HomeCapabilities {
  readonly openExperienceDayIds: readonly string[];
  readonly progress: {
    readonly completionIds: readonly string[];
    readonly skippableNodeIds: readonly string[];
    readonly shoppingItemIds: readonly string[];
    readonly resetTrip: boolean;
    readonly resetDayIds: readonly string[];
  };
}

export interface ExperienceModel {
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
}

export interface ExperienceTripIdentity {
  readonly id: string;
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly locale: string;
  readonly timezone: string;
  readonly destinationLabel?: string;
  readonly travelerLabel?: string;
}

export interface ExperienceDayModel {
  readonly id: string;
  readonly date: string;
  readonly title: string;
  readonly summary?: string;
  readonly routeLabel?: string;
  readonly ordinal: number;
  readonly orderedDayIds: readonly string[];
}

export interface ExperienceClockModel {
  readonly instant: string;
  readonly timezone: string;
  readonly clockPlaceLabel?: string;
}

export interface ChecklistItemModel {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

export interface ShoppingItemModel {
  readonly id: string;
  readonly title: string;
  readonly note?: string;
  readonly priority?: "must" | "nice";
  readonly status: ShoppingStatus;
}

export type TimelineNodeFactsModel =
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
  | {
      readonly kind: "shopping";
      readonly items: readonly ShoppingItemModel[];
    }
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

export interface TimelineNodeModel {
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
}

export interface TimelineRouteEntryModel {
  readonly kind: "route";
  readonly ownerId: string;
  readonly routeId: string;
  readonly role: "connector";
  readonly states: readonly SemanticOwnerState[];
}

export interface TimelineLogisticsGroupModel {
  readonly kind: "logistics-group";
  readonly ownerId: string;
  readonly role: "logistics-group";
  readonly titleKey: "timeline.logisticsGroup";
  readonly childOwnerIds: readonly string[];
  readonly incomingRouteIds: readonly string[];
  readonly children: readonly TimelineNodeModel[];
  readonly progress: CompletionCountModel;
}

export type TimelineEntryModel =
  | TimelineNodeModel
  | TimelineRouteEntryModel
  | TimelineLogisticsGroupModel;

export type RouteStateModel =
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

export interface ExperienceRouteModel {
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
}

export type PlaceStateModel =
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

export interface ExperiencePlaceModel {
  readonly ownerId: string;
  readonly place: PlaceIdentityModel;
  readonly runtime: PlaceStateModel;
  readonly navigationAvailable: boolean;
}

export interface ExperienceMapModel {
  readonly presentation: MapPresentationV2;
  readonly provider: ProviderChannelStateModel;
  readonly cameraIntent: CameraIntent | null;
  readonly layout: {
    readonly viewport: MapViewportMetrics;
    readonly usableRegion: UsableRegion;
    readonly edgeInsets: EdgeInsets;
  } | null;
}

export interface ExperienceSheetModel {
  readonly snap: SheetSnap;
  readonly geometry: SheetGeometry | null;
  readonly interactive: boolean;
}

export interface CandidateOptionModel {
  readonly id: string;
  readonly title: string;
  readonly ordinal: string;
  readonly place?: PlaceIdentityModel;
  readonly booking?: BookingFactModel;
  readonly selected: boolean;
  readonly draft: boolean;
}

export interface CandidateDecisionModel {
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
}

export interface ExperienceReservationModel {
  readonly id: string;
  readonly title: string;
  readonly ownerId: string;
  readonly booking: BookingFactModel;
}

export interface ExperienceTaskModel {
  readonly id: string;
  readonly title: string;
  readonly scope: "pretrip" | "day";
  readonly dayId?: string;
  readonly note?: string;
  readonly completed: boolean;
  readonly children: readonly CompletionItemModel[];
}

export interface LocationModel {
  readonly status: "idle" | "requesting" | "active" | "denied" | "unavailable";
  readonly hasFix: boolean;
}

export interface ExperienceCapabilities {
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
}

export type ProviderChannelStateModel =
  | { readonly status: "idle" | "loading" | "ready"; readonly retryable: false }
  | {
      readonly status: "unavailable";
      readonly reason: ProviderFailureReason;
      readonly retryable: boolean;
    };

export interface ProviderStateModel {
  readonly map: ProviderChannelStateModel;
  readonly routes: ProviderChannelStateModel;
  readonly places: ProviderChannelStateModel;
}

export type SetupIssue =
  | { readonly kind: "missing-trip"; readonly copyKey: "setup.missingTrip" }
  | {
      readonly kind: "invalid-trip";
      readonly copyKey: "setup.invalidTrip";
      readonly paths: readonly string[];
    };

export interface SetupRequiredModel {
  readonly issues: readonly SetupIssue[];
  readonly capabilities: {
    readonly retry: boolean;
  };
}

export interface LoadingModel {
  readonly operation: "progress" | "map" | "routes" | "places" | "location";
  readonly owner:
    | { readonly kind: "surface"; readonly id: "home" | "experience" }
    | { readonly kind: "owner"; readonly id: string };
}

export interface FatalErrorModel {
  readonly category: "render" | "state" | "provider";
  readonly copyKey: "fatal.render" | "fatal.state" | "fatal.provider";
  readonly retained: {
    readonly home: boolean;
    readonly itinerary: boolean;
    readonly externalNavigation: boolean;
  };
  readonly capabilities: { readonly retry: boolean; readonly openHome: boolean };
}

export type ProgressUpdate =
  | {
      readonly kind: "completion";
      readonly id: string;
      readonly completed: boolean;
    }
  | {
      readonly kind: "node-skipped";
      readonly nodeId: string;
      readonly skipped: boolean;
    }
  | {
      readonly kind: "shopping-status";
      readonly itemId: string;
      readonly status: ShoppingStatus;
    };

export interface TripActions {
  openExperience(dayId?: string): void;
  openReservation(reservationId: string): void;
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
}

export interface ExperienceBindings {
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
}
