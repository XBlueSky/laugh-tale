# Eternal Pose v2 Phase 03: Presentation Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish and freeze a visually headless `TripPresentationV2` seam, move the complete trip controller into `@laugh-tale-island/react`, and make the starter run exclusively through that injected contract.

**Architecture:** Phase 01 supplies truthful domain projections and provider-neutral adapters; Phase 02 supplies pure choreography, camera intents, sheet behavior, and measured layout primitives. This phase composes them in React and exposes only grouped semantic models, defensive actions, and DOM bindings. The generated site retains runtime construction and every visible component, string, icon, style, marker element, and motion treatment.

**Tech Stack:** TypeScript 5.9, React 19.2, Vitest 4, Testing Library, jsdom, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-04-eternal-pose-v2-oak-washi-flagship-design.md`

## Global Constraints

- Start only after the Phase 02 gate is green. Consume its public core types plus its package-internal React hooks through relative imports; do not duplicate camera, sheet, layout, focus, lifecycle, or choreography policy.
- Read `plugins/eternal-pose/starter/react/AGENTS.md` and `plugins/eternal-pose/starter/react/docs/trip-experience-contract.md` before touching starter files.
- `packages/react/src/**` may contain no CSS import, icon package, visible copy, Google SDK symbol, recipe import, pixel constant, breakpoint, color, or typography choice.
- A presentation receives no reducer, controller object, provider object, Google object, mutable store, or raw diagnostic string.
- The same `TripActions` instance is supplied to every view. Capability records determine which controls are truthful to render; every action also rejects an invalid owner defensively.
- `plugins/eternal-pose/starter/react/src/presentation/**` is temporary generated presentation source in this phase. Phase 04 replaces it mechanically from the canonical Oak & Washi recipe.
- This is a clean v2 break. Delete the starter-local `TripPresentation`, `AppController`, and `useTripExperienceController`; do not add deprecated aliases or compatibility adapters.

---

### Task 1: Freeze the complete public contract in `@laugh-tale-island/react`

**Files:**
- Create: `packages/react/src/presentation-contract.ts`
- Create: `packages/react/tests/presentation-contract.test.tsx`
- Modify: `packages/react/src/index.ts`
- Modify: `packages/react/package.json`
- Modify: `packages/react/README.md`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `Trip`, `ShoppingStatus`, `ExperienceSelectionSource`, and semantic timeline/map/provider/sheet/camera types from `@laugh-tale-island/core`; `MapAdapterV2`, `RouteAdapterV2`, `PlaceAdapterV2`, `NavigationRequestV2`, `NavigationAdapterV2`, `MapVisualProfile`, `MarkerContentFactory`, `UserLocationContentFactory`, and `ProgressStore` from `@laugh-tale-island/core/browser`.
- Produces: the contract below from the package root. These exported names are frozen for the remaining v2 plans.

```ts
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
  createRoutes?(): RouteAdapterV2;
  createPlaces?(): PlaceAdapterV2;
  navigation?: NavigationAdapterV2;
}

export interface ProviderBootstrapState {
  map?: ProviderUnavailableResult;
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
```

`HomeModel` is grouped exactly as follows; it does not expose a raw `Trip`.

```ts
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
```

Every nested Home type is part of the same public contract; none is an alias to a raw `Trip`, node, task, reservation, or progress object:

```ts
export interface CompletionCountModel {
  readonly completed: number;
  readonly total: number;
}

export interface TimingModel {
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
```

`ExperienceModel` preserves composable facts and groups the Phase 01/02 values without changing their truth:

```ts
export interface ExperienceModel {
  readonly trip: ExperienceTripIdentity;
  readonly day: ExperienceDayModel;
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
```

The Experience family is frozen to the following serializable, presentation-safe shapes. Authored facts and runtime facts stay separate; unavailable provider shapes deliberately omit `diagnostic`.

```ts
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
      readonly mode: "flight" | "rail" | "bus";
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
```

Use tagged, serializable models for the exceptional views:

```ts
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
```

`SetupRequiredModel.capabilities.retry` is true only when `TripControllerProps.recovery.retrySetup` exists; `retrySetup()` delegates only in that case and is otherwise a defensive no-op. `FatalErrorModel.capabilities.retry` and `retryFatal()` follow the same rule for `recovery.retryFatal`. No package-owned reload, URL, settings screen, or configuration copy is invented.

The common action and binding surfaces are:

```ts
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
    getSurfaceProps(): HTMLAttributes<HTMLElement>;
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
```

- [ ] **Step 1: Add a compile-time contract test first**

Use `expectTypeOf` with minimal component functions and the Phase 01/02 types. Prove all five views receive the same `TripActions`, `Experience` alone receives bindings, `mapVisualProfile`, `createMarkerContent`, and `createUserLocationContent` are required, every nested Home/Experience model above is exported with the exact recursively readonly shape, and partial runtime factories and provider bootstrap failures are typed separately. Require a logistics group's exact semantic `titleKey` and ordered `children` to be complete readonly `TimelineNodeModel` values—not IDs alone—and assert `childOwnerIds` equals their owner IDs in order. Exhaustively narrow every `TimelineNodeFactsModel` variant and prove its authored optional facts, ordered checklist state, and ordered shopping item identity/title/priority/current status are available without a raw node payload. Require `owners.selectedId` plus the readonly itinerary summary (`primaryCount`, `collapsedOwnerId`, and typed `focusFallback`) so a presentation never chooses those policies. Exercise all three `ProgressUpdate` variants and prove a completion boolean cannot stand in for shopping/skipped truth. Prove Setup/Fatal retry capability is paired with the injected recovery handler. Prove `TripDiagnosticSink` can receive the full typed provider/controller union while no diagnostic/cause field can be assigned to a presentation model, and that a raw Trip/node/task/reservation/progress record or adapter/controller/provider object cannot be assigned either. Include `// @ts-expect-error` on the rejected assignments.

```bash
npm --workspace @laugh-tale-island/react test -- presentation-contract
```

Expected: FAIL because `TripPresentationV2`, the grouped models, and bindings are not exported.

- [ ] **Step 2: Add the contract types without behavior**

Create `presentation-contract.ts`, using the exact readonly records and discriminated unions above. Export the full type family—including nested foundation, Home, Experience, progress-update, recovery, provider, action, and binding types—from `src/index.ts`. No component implementation belongs in this file.

- [ ] **Step 3: Fix dependency placement**

Set `@laugh-tale-island/core` to exact `2.0.0` in `dependencies`; retain `react` and `react-dom` as peer dependencies and development dependencies. Do not add adapters or testing as dependencies.

- [ ] **Step 4: Run the focused contract and boundary checks**

```bash
npm --workspace @laugh-tale-island/react test -- presentation-contract boundaries exports
npm --workspace @laugh-tale-island/react run type-check
```

Expected: PASS; the boundary scan finds no visible strings, CSS, icon imports, Google names, or generated imports.

- [ ] **Step 5: Document only the public composition surface**

Add one README example that imports `TripController`, a local `presentation`, an explicitly constructed partial `runtime`, and provider bootstrap state derived by the app entry. The example must not render package-owned UI and must show that a provider diagnostic never enters presentation props.

- [ ] **Step 6: Commit the frozen type seam**

```bash
git add packages/react/src/presentation-contract.ts packages/react/src/index.ts packages/react/tests/presentation-contract.test.tsx packages/react/package.json packages/react/README.md package-lock.json
git diff --cached --check
git commit -m "feat(react): define the v2 presentation contract"
```

---

### Task 2: Package Home navigation and exceptional-state orchestration

**Files:**
- Create: `packages/react/src/trip-controller.tsx`
- Create: `packages/react/src/use-trip-navigation.ts`
- Create: `packages/react/src/project-home-model.ts`
- Create: `packages/react/src/normalize-controller-error.ts`
- Create: `packages/react/src/emit-trip-diagnostic.ts`
- Create: `packages/react/src/default-progress-store.ts`
- Create: `packages/react/tests/trip-controller.test.tsx`
- Create: `packages/react/tests/project-home-model.test.ts`
- Modify: `packages/react/src/index.ts`

**Interfaces:**
- Consumes: `TripNavigationStore`, core `createLocalStorageProgressStore`, effective-day selection, trip validation, progress projection, and the Task 1 view types.
- Produces: `TripController`, `TripControllerProps`, and a package-private error boundary which emits only normalized `FatalErrorModel`.

- [ ] **Step 1: Write navigation and Home projection failures**

Cover these cases in the first red test:

1. the injected store, not URL or component-local inference, chooses `home` versus `experience`;
2. `openExperience(validDay)` writes `{surface:"experience", dayId, ownerId:null}`;
3. an invalid requested day is ignored without corrupting the store;
4. `openHome()` preserves no stale owner;
5. Home's effective day uses manual, current, upcoming, then final-day order;
6. optional destination, traveler, and lodging records are absent rather than empty;
7. unhydrated progress selects `Loading` with operation `progress` and owner `home`;
8. a valid Trip without an injected `progressStore` creates one store per exact Trip ID with key `eternal-pose:trip-progress:v1:<tripId>`; an inaccessible/throwing browser store degrades to `memory-only`, and changing Trip IDs never reuses the previous store or progress;
9. an explicitly injected store is used unchanged and is never replaced by the default;
10. missing/invalid content selects `SetupRequired` without constructing adapters;
11. a valid trip plus missing-key or loader-failed bootstrap state remains on Home/Experience with a typed provider notice rather than selecting `SetupRequired`;
12. Setup retry is advertised and delegates only with an injected `recovery.retrySetup`; without it the capability is false and the action is a no-op;
13. validation/state/presentation render failures emit the exact `TripDiagnosticEvent` to `onDiagnostic` before projecting a sanitized Setup/Fatal model; sink absence or a sink that throws never changes controller behavior;
14. a presentation render throw selects `FatalError` without exposing the raw error string, and fatal retry follows the same capability/handler pairing.

```bash
npm --workspace @laugh-tale-island/react test -- trip-controller project-home-model
```

Expected: FAIL because `TripController` and the projection do not exist.

- [ ] **Step 2: Implement the navigation subscription**

Use `useSyncExternalStore` over the injected navigation store. When none is supplied, create one core in-memory navigation store once per controller mount. Route all surface/day/owner writes through that seam.

Resolve progress separately in `default-progress-store.ts`. An explicitly supplied `ProgressStore` always wins. Otherwise, for each validated non-null Trip ID, create exactly one `createLocalStorageProgressStore` with the literal key `eternal-pose:trip-progress:v1:${trip.id}` and retain it for that Trip identity; a Trip-ID change creates a new store and re-enters progress loading. Let the core store's unavailable read/write semantics drive `PersistenceModel { status: "memory-only", writable: false }`; do not silently share an in-memory store across Trip IDs or move this policy back into generated source.

- [ ] **Step 3: Implement the pure Home projection**

Map authored identity, ordered day summaries, lodging, tasks, reservations, progress, persistence, provider readiness, and capability facts into the exact frozen nested DTOs. Call core selectors for effective day and progress; do not calculate schedule state in React. Convert bootstrap failures to `{status, reason, retryable}` and drop `diagnostic` before creating `HomeModel`. Derive setup/fatal retry capabilities solely from the matching optional recovery handler and keep both public actions defensively inert when that handler is absent.

- [ ] **Step 4: Implement controller state selection and error normalization**

Keep the boundary class package-private. Add one package-private `emitTripDiagnostic(onDiagnostic, event)` helper that invokes the exact optional sink and contains a hostile/throwing sink without recursively reporting it. Emit validation, state, and render causes through that helper, but pass only `category`, `copyKey`, retained-content flags, and capabilities to `FatalError`. The package never logs, persists, displays, or sends diagnostics by itself.

- [ ] **Step 5: Prove Home and exceptional views remain presentation-injected**

Run the same tests with two visually distinct test components and assert only their semantic props and action calls. Do not snapshot markup owned by the test presentation.

```bash
npm --workspace @laugh-tale-island/react test -- trip-controller project-home-model boundaries
npm --workspace @laugh-tale-island/react run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit controller navigation**

```bash
git add packages/react/src/trip-controller.tsx packages/react/src/use-trip-navigation.ts packages/react/src/project-home-model.ts packages/react/src/normalize-controller-error.ts packages/react/src/emit-trip-diagnostic.ts packages/react/src/default-progress-store.ts packages/react/src/index.ts packages/react/tests/trip-controller.test.tsx packages/react/tests/project-home-model.test.ts
git diff --cached --check
git commit -m "feat(react): orchestrate v2 trip navigation"
```

---

### Task 3: Package the headless Experience controller

**Files:**
- Create: `packages/react/src/use-trip-experience.ts`
- Create: `packages/react/src/project-experience-model.ts`
- Create: `packages/react/src/use-runtime-providers.ts`
- Create: `packages/react/tests/use-trip-experience.test.tsx`
- Create: `packages/react/tests/project-experience-model.test.ts`
- Create: `packages/react/tests/runtime-provider-coordination.test.tsx`
- Modify: `packages/react/src/use-user-location.ts`
- Modify: `packages/react/tests/use-user-location.test.ts`
- Modify: `packages/react/src/trip-controller.tsx`
- Modify: `packages/react/src/index.ts`

**Interfaces:**
- Consumes: Phase 01 timeline/place/route projections and structured failures; Phase 02 choreography reducer, camera intent builder, sheet controller, layout registry, and adapter lifecycle primitives.
- Produces: `useTripExperience(input: UseTripExperienceInput): TripExperienceController` and the Experience branch of `TripController`.

```ts
export interface UseTripExperienceInput {
  trip: Trip;
  navigationStore: TripNavigationStore;
  progressStore: ProgressStore;
  presentation: Pick<
    TripPresentationV2,
    "mapVisualProfile" | "createMarkerContent" | "createUserLocationContent"
  >;
  runtime?: TripRuntimeAdapters;
  providerBootstrap?: ProviderBootstrapState;
  clock?: () => string;
  onDiagnostic?: TripDiagnosticSink;
}

export interface TripExperienceController {
  model: ExperienceModel;
  actions: TripActions;
  bindings: ExperienceBindings;
}
```

- [ ] **Step 1: Port the behavioral matrix into failing package tests**

Move behavior expectations—not starter implementations—from `plugins/eternal-pose/starter/react/src/controllers/use-trip-experience-controller.test.tsx`. Add explicit cases for:

- current, next, and viewing owners remaining independent;
- the validated choreography navigation owner projecting separately as `owners.selectedId` without overwriting current, next, or manual viewing truth;
- `itinerary.primaryCount` counting the complete projected primary rows and `itinerary.collapsedOwnerId` using the exact selected → current → next → first useful authored owner order, skipping stale, foreign, and skipped owners; “first useful” means the first top-level node—or first child encountered inside a logistics group—with `capabilities.select`, otherwise the first route entry that has a matching `ExperienceRouteModel`; a synthetic group owner never qualifies;
- `itinerary.focusFallback` resolving to the active validated node/route target, then the collapsed node/route target, or `null`, so a presentation never infers DOM fallback policy;
- `returnToCurrent` targeting only the actual current owner even when automatic/next/viewing differ, and `restoreAutomaticSelection` retaining its separate automatic target;
- `returnToLodging` targeting the first non-skipped effective-day lodging whose authored role is `base` or `return`; no eligible owner yields a false capability or state/camera change;
- total timeline-role and display-index projection, including logistics groups and unresolved primaries;
- every built-in/custom node projecting the matching discriminated `facts` variant: transport plan, transfer terminal, lodging role and complete ordered checklist, dining cuisine/candidate group, every shopping item with current status, sightseeing area, experience duration, logistics checklist, or cloned custom kind/data—never a raw payload or lossy boolean;
- each logistics group retaining `titleKey: "timeline.logisticsGroup"` plus every ordered child DTO with title, timing, states, details, facts, completion, and action capabilities; `childOwnerIds` must exactly mirror `children.map(ownerId)` and no child may be emitted as a second top-level row;
- stale route/place completions ignored after day or owner change;
- `unknown` routes retaining authored copy and never becoming walking;
- map absence yielding structured `missing-configuration` while itinerary actions still work;
- loader failure, runtime mount failure, and missing configuration remaining three distinct states with diagnostics stripped from the model;
- a mounted adapter's typed `onUnavailable` event and synchronous render/location/camera failure replacing only the map provider channel with its sanitized reason/retryability, never selecting SetupRequired or discarding itinerary state;
- bootstrap, map-runtime, route-request, and place-request failures each emit one exact developer diagnostic event with channel/phase/reason/owner/cause as applicable; stale/cancelled generations emit none, and a throwing sink cannot break retry or state projection;
- route/place retry cancelling the prior request;
- navigation capability absent for unresolved places;
- a navigable place opening exactly one destination-only `NavigationRequestV2`, a known internal route requiring both resolved endpoints and its exact mode, and an authored external route preserving only its explicit origin/destination; unknown/flight never acquire an inferred internal mode;
- missing navigation adapter, stale/foreign owner, invalid request, or adapter `open()` returning false leaving the capability/action defensive and producing no browser side effect;
- minute updates using the authored timezone and injected clock;
- reduced motion converting semantic camera transitions to immediate;
- responsive measured sheet geometry reaching the Phase 02 sheet hook without a package pixel constant;
- header expand/collapse revisions and transition-settle IDs surviving projection unchanged;
- every invalid owner/action being a no-op.
- geolocation permission denial, missing API, invalid coordinates, restart/stop, stale callbacks, unmount cleanup, and first-fix recenter retaining the existing behavior while location reaches the map only through the v2 lifecycle and recenter reaches it only as a semantic `recenter-user` camera request.

```bash
npm --workspace @laugh-tale-island/react test -- use-trip-experience project-experience-model runtime-provider-coordination use-user-location
```

Expected: FAIL because the packaged controller is missing.

- [ ] **Step 2: Implement pure model projection**

`projectExperienceModel` composes only core selectors and Phase 02 state. Preserve authored facts next to provider status. Map every node payload through one exhaustive projector into the matching `TimelineNodeFactsModel`: clone primitive custom data, preserve authored optional facts only when present, preserve checklist/item order and IDs/titles, join checklist completion and shopping status from the progress selector, and never expose or alias a raw payload. Map each core logistics projection's ordered `children` through that same node-DTO projector used for standalone nodes; assign the fixed semantic `titleKey`, require `childOwnerIds` to match that DTO order, and exclude those children from duplicate top-level emission. Project the validated choreography navigation owner independently as `owners.selectedId`; `owners.viewingId` remains the manual-viewing fact. Count every projected `primary` node once, including a primary nested in any future valid display aggregation, as `itinerary.primaryCount`. Resolve `itinerary.collapsedOwnerId` in the exact order selected, current, next, then authored timeline order: the first non-skipped top-level node or grouped child whose projected `capabilities.select` is true, otherwise the first non-skipped route entry with a matching `ExperienceRouteModel`; never use a synthetic logistics-group owner. Reject every candidate that is stale, belongs to another day, or has no projected node/route owner. Resolve `itinerary.focusFallback` to the active validated selected node/route, otherwise that collapsed node/route, otherwise `null`; expose the semantic slot and owner only, never an element. Derive `capabilities.returnToCurrent` from the exact non-null current owner, independently of next/viewing/automatic selection. Derive the lodging target in effective-day authored order from the first non-skipped lodging node whose authored payload role is `base` or `return`; when none exists, set `returnToLodging: false`. Build a package-private owner-to-`NavigationRequestV2` map: place owners use the core-projected destination alone; internal route requests exist only for walking/driving/transit with both resolved endpoints; an authored external route uses only its explicit nonblank origin/destination and optional supported mode. Unknown/flight never receive inferred internal directions. A public `navigationAvailable` bit is true only when a request and runtime navigation adapter both exist. Keep all action target IDs and requests package-internal rather than exposing unvalidated action arguments. It must not create display copy, flatten composable tones into one theme state, or inspect provider SDK data.

- [ ] **Step 3: Implement provider effect coordination**

Instantiate route/place adapters once per factory identity, attach an `AbortController` to every request, guard completion with owner plus request generation, and expose typed retry capabilities. Delegate map construction, replacement, retry, and destruction exclusively to Phase 02 `useMapAdapterLifecycle`; do not reproduce its generation logic. Build the lifecycle mount config from the presentation's exact visual profile plus both marker factories and controller-owned event callbacks. A bootstrap/request/lifecycle unavailable result—including the mounted adapter's typed `onUnavailable` event—first emits one exact event through `emitTripDiagnostic`, then updates only its matching provider channel; retain its exact reason/retryability, remove `diagnostic` and `cause` before projection, and expose retry only when the lifecycle says it is retryable. Cancelled/stale generations emit nothing. An absent factory never constructs a fake adapter. Reject a contradictory channel that supplies both a factory and bootstrap-unavailable state as normalized controller state failure.

- [ ] **Step 4: Implement the minute-clock and Experience hook**

Consume Phase 02 `useMinuteClock`, which aligns updates to the next minute and cancels timers on unmount; derive clock facts through core using the authored timezone. Migrate package-private `useUserLocation` off the deleted 1.0 adapter: it owns only geolocation watch/permission/generation state, returns its valid coordinate to `useMapAdapterLifecycle.userLocation`, and dispatches the first valid fix plus explicit recenter as the existing `recenter-user` choreography request. Preserve watch restart, denial/unavailable classification, invalid-coordinate rejection, stop/unmount cleanup, and stale-callback suppression; it must never call map methods directly. `returnToCurrent` and `returnToLodging` read only their internally validated targets and dispatch the matching Phase 02 events; absent, stale-day, skipped, or foreign targets are defensive no-ops. `openNavigation(ownerId)` reads only the package-private request for the current day, rechecks the matching capability and adapter identity, and calls `runtime.navigation.open(request)` exactly once; it never opens a URL, geocodes a label, invents an origin/mode, or retries a false result itself. Compose selection, progress, candidates, sheet, layout, focus, provider, location, header, and camera behavior without copying their reducers. Preserve `headerExpanded`, `headerRevision`, and `headerTransition` exactly, and dispatch the Phase 02 `set-header-expanded` and `settle-header-transition` events from the two public actions.

- [ ] **Step 5: Render Experience through the injected view**

In `TripController`, call `useTripExperience` only from an Experience child component so hooks remain structurally stable. Pass exactly `{model, actions, bindings}` to `presentation.Experience`.

- [ ] **Step 6: Run package gates**

```bash
npm --workspace @laugh-tale-island/react test
npm --workspace @laugh-tale-island/react run lint
npm --workspace @laugh-tale-island/react run type-check
npm --workspace @laugh-tale-island/react run build
```

Expected: PASS.

- [ ] **Step 7: Commit packaged orchestration**

```bash
git add packages/react/src/use-trip-experience.ts packages/react/src/project-experience-model.ts packages/react/src/use-runtime-providers.ts packages/react/src/use-user-location.ts packages/react/src/trip-controller.tsx packages/react/src/index.ts packages/react/tests/use-trip-experience.test.tsx packages/react/tests/project-experience-model.test.ts packages/react/tests/runtime-provider-coordination.test.tsx packages/react/tests/use-user-location.test.ts
git diff --cached --check
git commit -m "feat(react): package the trip experience controller"
```

---

### Task 4: Complete DOM layout, owner, and focus bindings

**Files:**
- Create: `packages/react/src/use-experience-bindings.ts`
- Create: `packages/react/tests/use-experience-bindings.test.tsx`
- Modify: `packages/react/src/use-trip-experience.ts`

**Interfaces:**
- Consumes by relative import: Phase 02 `useVisibleMapLayout`, `useMapAdapterLifecycle`, `useItinerarySheet`, and `useOwnerFocusRegistry`; consumes core `ExperienceCameraRequest`, the three camera resolvers, `SheetGeometryInput`, and `resolveSheetGeometry`.
- Produces: the complete `ExperienceBindings` object frozen in Task 1.

- [ ] **Step 1: Write composition failures without retesting Phase 02 internals**

Mock the four Phase 02 hooks at their relative module boundaries and use small jsdom elements only for ref fan-out. Prove:

1. the one public `mapViewportRef` fans every element and `null` to `useVisibleMapLayout.mapViewportRef`, `useMapAdapterLifecycle.mapRef`, and `useOwnerFocusRegistry.fallbackSurfaceRef` in stable order;
2. every `occlusionRef`, node ref, route ref, dialog ref, and disclosure-trigger ref is delegated unchanged to its owning Phase 02 hook;
3. `setMeasuredGeometry({collapsedHeight, halfHeight, expandedHeight})` passes those presentation-measured numbers through `resolveSheetGeometry` into `useItinerarySheet`, including a responsive second registration, with no package default or pixel constant;
4. surface and generic drag-band props from `useItinerarySheet` are returned unchanged, and a named button remains presentation-owned;
5. `restoreTrigger` delegates the semantic owner and optional node/route fallback to the focus registry;
6. lifecycle mount input receives the presentation's exact `mapVisualProfile`, `createMarkerContent`, and `createUserLocationContent` identities, and a typed `onUnavailable` callback updates controller map-provider state without exposing its diagnostic;
7. a layout revision delegates one reframed intent with the same semantic `intentId`; hook teardown remains owned by the four Phase 02 hooks rather than reimplemented here.

```bash
npm --workspace @laugh-tale-island/react test -- use-experience-bindings
```

Expected: FAIL because bindings are incomplete.

- [ ] **Step 2: Compose stable public refs and measured sheet input**

Memoize one fan-out callback for the map host and delegate named refs to the Phase 02 registries; do not build a second registry. A `null` map host must reach all three consumers. Supply the Phase 02 lifecycle with both presentation-owned DOM factories unchanged and a latest-value `MapEventsV2` whose terminal callback enters the Task 3 provider-state path. Hold the latest presentation-supplied `SheetGeometryInput`, normalize only through core, and pass it into the package-internal sheet hook. Until geometry is registered, expose inert sheet pointer/keyboard behavior rather than inventing dimensions. Never query by a recipe class name or `data-testid`.

- [ ] **Step 3: Resolve every semantic camera request from existing truth**

Use one exhaustive switch over `ExperienceCameraRequest`:

- `fit-day` calls one shared `buildDayFitGeometry(dayId)` that uses resolved map markers plus validated non-flight `MapPresentationV2.routes`; both day entry and `restore-full-day` reach this exact helper;
- `fit-candidate` uses only resolved coordinates belonging to that candidate group;
- `focus-owner` uses that owner's resolved marker coordinate and the map lifecycle's `getCameraSnapshot()`;
- `focus-route` calls the fit resolver with only that route's validated path, allowing an explicitly selected valid flight path while never adding flight to ordinary day bounds;
- `recenter-user` uses only the current valid location coordinate.

Pass the reducer's exact `intentId`, measured layout, and reduced-motion value to the Phase 02 core resolvers. Missing, unresolved, quarantined, stale-day, or mismatched-owner geometry returns no intent. Layout-only changes use `reframeCameraIntent`; they do not redispatch choreography or mint an ID. Delegate actual execution solely to `useMapAdapterLifecycle`.

- [ ] **Step 4: Expose focus restoration without DOM inference**

Delegate `restoreTrigger` to Phase 02 `useOwnerFocusRegistry`; presentation code calls it after committed candidate/disclosure close state and passes only `model.itinerary.focusFallback` when non-null. The registry, not this composition hook or the recipe, validates connected elements and falls back from the named trigger to that model-supplied active node/route and then the fanned-out map surface.

- [ ] **Step 5: Run composition and existing lifecycle gates twice**

```bash
npm --workspace @laugh-tale-island/react test -- use-experience-bindings use-owner-focus-registry runtime-provider-coordination --repeat=2
npm --workspace @laugh-tale-island/react run type-check
```

Expected: PASS with no leaked observer, frame, timer, or adapter assertion.

- [ ] **Step 6: Commit the binding layer**

```bash
git add packages/react/src/use-experience-bindings.ts packages/react/src/use-trip-experience.ts packages/react/tests/use-experience-bindings.test.tsx
git diff --cached --check
git commit -m "feat(react): expose measured experience bindings"
```

---

### Task 5: Prove the seam with a non-Oak test presentation

**Files:**
- Create: `packages/testing/src/presentation-driver.tsx`
- Create: `packages/testing/src/alternate-presentation.tsx`
- Create: `packages/testing/tests/presentation-driver.test.tsx`
- Modify: `packages/testing/src/index.ts`
- Modify: `packages/testing/package.json`

**Interfaces:**
- Consumes: `TripPresentationV2`, `TripController`, and the Phase 01 deterministic fake runtime/fixture.
- Produces: `createPresentationDriver`, `renderTripContract`, and `alternateTestPresentation`; all are test-only exports.

- [ ] **Step 1: Add a failing alternate-presentation contract test**

The alternate presentation uses plain semantic HTML and deliberately reverses the Oak composition: Home exposes only a day chooser; Experience renders itinerary before map and renders each logistics child from the supplied group DTO; itinerary-marker content is a text-only rectangle and user-location content is a distinct text-only crosshair. Drive it through the same controller and assert ordered logistics-child state/actions, navigation, owner selection, distinct restore-automatic/return-current/return-lodging behavior, sheet stepping, retry, candidate confirmation, all three progress-update variants, and user-location create/update/dispose.

```bash
npm --workspace @laugh-tale-island/testing test -- presentation-driver
```

Expected: FAIL because the driver and alternate presentation are absent.

- [ ] **Step 2: Implement the public test driver**

Expose semantic queries/actions by stable owner IDs and contract roles. Do not export Oak class names, localized labels, pixel values, or provider internals.

- [ ] **Step 3: Implement the alternate presentation**

All visible test copy must state that it is a test fixture. Supply a valid neutral map profile plus distinct itinerary-marker and user-location factories with create/update/dispose coverage.

- [ ] **Step 4: Add a dependency-direction assertion**

Scan production package sources and assert core imports no Eternal Pose package, react imports only core, adapters imports only core, and no production package imports testing or generated paths.

```bash
npm --workspace @laugh-tale-island/testing test
npm run type-check:packages
```

Expected: PASS.

- [ ] **Step 5: Commit the seam proof**

```bash
git add packages/testing/src/presentation-driver.tsx packages/testing/src/alternate-presentation.tsx packages/testing/src/index.ts packages/testing/tests/presentation-driver.test.tsx packages/testing/package.json package-lock.json
git diff --cached --check
git commit -m "test: prove the presentation seam is theme neutral"
```

---

### Task 6: Cut the generated starter over to the packaged controller

**Files:**
- Read first: `plugins/eternal-pose/starter/react/AGENTS.md`
- Read first: `plugins/eternal-pose/starter/react/docs/trip-experience-contract.md`
- Modify: `plugins/eternal-pose/starter/react/src/app/App.tsx`
- Modify: `plugins/eternal-pose/starter/react/src/app/PresentationErrorBoundary.tsx`
- Create: `plugins/eternal-pose/starter/react/src/app/use-document-metadata.ts`
- Create: `plugins/eternal-pose/starter/react/src/app/use-document-metadata.test.tsx`
- Create temporarily: `plugins/eternal-pose/starter/react/src/presentation/document-metadata-copy.ts`
- Modify: `plugins/eternal-pose/starter/react/src/main.tsx`
- Modify: `plugins/eternal-pose/starter/react/src/presentation/index.ts`
- Modify: presentation files importing `../controllers/presentation-contract`
- Modify: `plugins/eternal-pose/starter/react/package.json`
- Create: `plugins/eternal-pose/starter/react/src/app/App.test.tsx`
- Create: `plugins/eternal-pose/starter/react/src/app/package-boundary.test.ts`
- Delete: `plugins/eternal-pose/starter/react/src/controllers/**`
- Delete after Phase 01 extraction: `plugins/eternal-pose/starter/react/src/providers/**`

**Interfaces:**
- Consumes: `TripController` and `TripPresentationV2`; `@laugh-tale-island/adapters/google`; generated `trip-content`; local presentation.
- Produces: the three-area generated layout `src/app`, `src/presentation`, `src/trip-content` with no local behavior controller or provider implementation.

The app-local composition input carries `trip: Trip | null` and a required canonical `setupLocale: string` read from generated `trip-content/validation-entry`; `setupLocale` is used only when `trip` is null and is never sourced from the browser. It also carries the controller's optional runtime/store/clock/setup/recovery overrides. This app input is not added to the React package contract.

- [ ] **Step 1: Replace starter-local tests with a failing package-boundary test**

Assert all of the following:

- `src/controllers` and `src/providers` do not exist;
- `src/app` may import packages, `src/presentation`, and `src/trip-content` only;
- `src/presentation` imports contract types from `@laugh-tale-island/react`, never `src/app`, core reducers, core/browser adapters, adapters/google, environment values, or trip-content;
- no generated production file imports `@laugh-tale-island/testing`;
- `App` injects the local presentation—including both required DOM factories—into package `TripController`.
- one identical app-local metadata hook derives `<html lang>`, document title, description, Open Graph title/description, and application name from the authored Trip/setup locale plus the selected copy catalog; it contains no Tokyo literal/default/social image.
- developer diagnostics flow through the optional typed controller sink and never through presentation props or rendered copy.

```bash
npm --prefix plugins/eternal-pose/starter/react test -- package-boundary App
```

Expected: FAIL against the current starter-local controller/provider tree.

- [ ] **Step 2: Rewire the local presentation to v2 props**

Change type imports first. Adapt current components to consume the exact grouped semantic models and discriminated progress action without recreating current/next, index, route, camera, progress, or capability truth. Add a temporary local user-location content factory beside the temporary itinerary-marker factory so the complete seam compiles; Phase 04 replaces both mechanically. Keep their current visuals unchanged in this phase.

- [ ] **Step 3: Make `App` a composition-only module**

`App` accepts optional test overrides, otherwise receives the configured trip, canonical setup locale, runtime, and store from `main.tsx`, and renders:

```tsx
return (
  <TripController
    trip={trip}
    presentation={presentation}
    runtime={runtime}
    providerBootstrap={providerBootstrap}
    navigationStore={navigationStore}
    progressStore={progressStore}
    clock={clock}
    setupIssues={setupIssues}
  />
);
```

Omit optional props when absent under `exactOptionalPropertyTypes`.

Define a temporary local `DocumentMetadataCopy { productName, setupTitle, setupDescription }` value under presentation source and export it from the local presentation index; Phase 04 replaces it with the same shape projected from its validated catalog. Call `useDocumentMetadata` unconditionally before rendering the controller and pass `{ trip, setupLocale, copy: documentMetadataCopy }` rather than importing a package or hard-coding app strings. With a Trip, set `document.documentElement.lang` from exact canonical `trip.locale`, set document/OG title from authored `trip.title`, set description/OG description from authored `trip.destinationLabel` when present and otherwise the title, and set application name from `copy.productName`. With null Trip, use the required canonical `setupLocale` from generated content plus `copy.setupTitle` and `copy.setupDescription`. Remove `og:image` rather than supplying Tokyo/default art. Update all owned nodes in place when Trip/null/locale/copy input changes; never read browser locale, timezone, hostname, or route.

In `use-document-metadata.test.tsx`, cover a synthetic non-Tokyo Trip, null Trip, a runtime Trip/locale change, absent destination, an existing owned meta node, and an unrelated third-party meta node that must remain untouched. Scan source and the static HTML shell to reject Tokyo labels, `Asia/Tokyo`, `+09`, Tokyo coordinates, social image URLs, and fixed locale/title metadata.

- [ ] **Step 4: Move provider construction to `main.tsx`**

Import Google constructors only from `@laugh-tale-island/adapters/google`. Read `VITE_GOOGLE_MAPS_API_KEY`, optional map ID, and feature flags in the app entry. Convert `configureGoogleMaps` once: ready configuration supplies `runtime.createMap`; missing configuration supplies map/route/place `ProviderUnavailableResult` values with reason `missing-configuration`; loader failure supplies map reason `loader-failed` while any independently constructible route/place factories remain available. Pass this as `providerBootstrap`; never infer either condition from an absent runtime and never turn it into a `SetupIssue`. In development only, construct an `onDiagnostic` sink in `main.tsx` which writes the typed event to the developer console; production omits the prop. Tests prove the sink receives bootstrap/runtime/render detail but no diagnostic text reaches DOM, snapshots, document metadata, or user copy, and adapters never place credentials in a diagnostic. Omit optional props when absent under `exactOptionalPropertyTypes`.

- [ ] **Step 5: Delete extracted local behavior**

Remove the local controller and provider trees only after all imports point to packages. Do not keep transitional exports in `src/App.tsx` or duplicate files under another name.

- [ ] **Step 6: Run starter unit, boundary, and browser gates**

```bash
npm --prefix plugins/eternal-pose/starter/react test
npm --prefix plugins/eternal-pose/starter/react run type-check
npm --prefix plugins/eternal-pose/starter/react run lint
npm --prefix plugins/eternal-pose/starter/react run build
npm run stage:starter
npm run test:starter:staged
npm run test:e2e:staged
```

Expected: PASS. Staged tests resolve packed package artifacts, not workspace source aliases.

- [ ] **Step 7: Commit the starter cutover**

```bash
git add packages/react plugins/eternal-pose/starter/react package-lock.json
git diff --cached --check
git commit -m "refactor(starter): consume the packaged v2 controller"
```

---

### Task 7: Freeze Phase 03 exports and evidence

**Files:**
- Modify: `packages/react/tests/exports.test.ts`
- Modify: `packages/react/tests/boundaries.test.ts`
- Modify: `tests/packages/artifacts.test.ts`
- Modify: `tests/packages/clean-consumer.test.ts`
- Create: `packages/react/tests/public-api.snapshot.ts`

**Interfaces:**
- Consumes: all Phase 03 public exports and the four package tarballs.
- Produces: an explicit public API allowlist and clean-consumer proof that the seam works outside the monorepo.

- [ ] **Step 1: Add a failing public-export allowlist**

Freeze the runtime-value allowlist to exactly `TripController` and `useTripExperience`. Export the five view prop types; every foundation, Home, Experience, provider, progress-update, recovery, action, binding, runtime, and controller type frozen in Task 1 as erased TypeScript exports. Remove the six 1.0 hook values (`useCandidateDecision`, `useItinerarySheet`, `useRouteStates`, `useTripProgress`, `useTripSelection`, and `useUserLocation`) from the package root; the migrated modules remain package-private implementation seams. Explicitly reject `AppController`, `ExperienceController`, `TripPresentation`, and `useTripExperienceController` as well.

```bash
npm --workspace @laugh-tale-island/react test -- exports
```

Expected: FAIL until the old exports/files are fully absent and the v2 allowlist matches.

- [ ] **Step 2: Extend artifact tests to compile an external presentation**

Pack all four workspaces, install exact tarballs into the clean consumer, compile one TypeScript/React file that supplies all five views plus both DOM factories, exercises every discriminated progress mutation and recovery capability, and render it with deterministic testing adapters. Search installed production tarballs for recipe paths, visible starter copy, CSS, Google SDK imports in core/react, and test-only modules.

- [ ] **Step 3: Run the Phase 03 gate**

```bash
npm run build:packages
npm run test:packages
npm run lint:packages
npm run type-check:packages
npm test -- tests/packages/artifacts.test.ts tests/packages/clean-consumer.test.ts
npm run stage:starter
npm run test:starter:staged
npm run test:e2e:staged
```

Expected: every command exits 0. The clean consumer renders the alternate presentation and the staged starter renders its local presentation through the same contract.

- [ ] **Step 4: Review before freezing**

Use `superpowers:requesting-code-review`. Reviewer must check the contract against every bullet in the spec's Presentation Contract, Runtime Data Flow, Locale, and Error sections; verify package source is visually headless; and verify no starter behavior remains outside package composition.

- [ ] **Step 5: Commit the frozen seam gate**

```bash
git add packages/react/tests/exports.test.ts packages/react/tests/boundaries.test.ts packages/react/tests/public-api.snapshot.ts tests/packages/artifacts.test.ts tests/packages/clean-consumer.test.ts
git diff --cached --check
git commit -m "test: freeze the Eternal Pose v2 seam"
```

## Phase Gate

Phase 04 may start only when:

- the complete seven-command Task 7 gate is green;
- `rg -n 'TripPresentation(?!V2)|AppController|ExperienceController|useTripExperienceController' packages plugins/eternal-pose/starter/react/src --pcre2` has no production hit;
- `rg -n '\.css|lucide|@googlemaps|google\.maps|recipes-v2|starter/react' packages/react/src` has no hit;
- the alternate test presentation passes without importing Oak & Washi;
- reviewer records the seam as frozen with no blocker.

Record the gate date, exact commit, Node/npm versions, commands, and reviewer outcome in the execution log before beginning Phase 04.
