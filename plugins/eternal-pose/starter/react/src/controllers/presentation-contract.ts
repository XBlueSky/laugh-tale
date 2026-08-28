import type {
  ButtonHTMLAttributes,
  ComponentType,
  HTMLAttributes,
  RefCallback,
} from "react";

import type {
  CandidateGroup,
  CandidateOption,
  EffectiveDay,
  MapPlacePresentation,
  MapPresentation,
  MapRoutePresentation,
  RouteEdge,
  SheetGeometry,
  SheetSnap,
  ShoppingStatus,
  Trip,
  TripDay,
  TripNode,
  TripProgressV1,
  TripTask,
} from "@laugh-tale-island/core";
import type {
  CandidateTriggerProps,
  ProgressPersistenceStatus,
  RouteLoadState,
  TripSelection,
  UserLocationStatus,
} from "@laugh-tale-island/react";

export interface TripPresentation {
  Home: ComponentType<HomeViewProps>;
  Experience: ComponentType<ExperienceViewProps>;
  SetupRequired: ComponentType<SetupRequiredViewProps>;
  Loading: ComponentType<LoadingViewProps>;
  FatalError: ComponentType<FatalErrorViewProps>;
  geometry: PresentationGeometry;
  mapProfile: MapVisualProfile;
}

export type SetupIssue =
  | { kind: "trip-content" }
  | { kind: "provider-key" }
  | { kind: "provider-load"; reason: string };

export interface HomeViewProps {
  model: HomeViewModel;
  actions: HomeActions;
}

export interface HomeViewModel {
  trip: Trip;
  progress: TripProgressV1;
  pretripCompletion: { completed: number; total: number };
  reservationCounts: { confirmed: number; pending: number; none: number };
  persistence: ProgressPersistenceStatus;
}

export interface HomeActions {
  setCompleted: (id: string, completed: boolean) => void;
  enterDay: (dayId: string) => void;
}

export interface PresentationGeometry {
  header: { expanded: number; collapsed: number };
  sheet: { collapsed: number; minGap: number };
  desktopBreakpoint: number;
  map?: {
    mobileProviderClearance: number;
    desktopRailInset: boolean;
  };
}

export interface MapMarkerPart {
  className: string;
  text: string;
}

export interface MapMarkerVisual {
  title: string;
  className: string;
  label: string;
  parts: readonly MapMarkerPart[];
  fallback: {
    fill: string;
    stroke: string;
    labelColor: string;
    text: string;
    size: number;
    shape: "circle" | "square" | "diamond";
    strokeWidth: number;
  };
}

export interface MapRouteVisual {
  stroke: string;
  opacity: number;
  width: number;
  casing?: { stroke: string; opacity: number; width: number };
  dash?: number[];
}

export interface MapVisualProfile {
  id: string;
  basemap: {
    mode: "neutral" | "topographic" | "flat" | "technical" | "coastal" | "subdued";
    density: "low" | "medium" | "high";
    contrast: "soft" | "standard" | "high";
    poi: "minimal" | "standard";
  };
  candidateTitle: (
    sequenceNumber: number,
    index: number,
    option: CandidateOption,
  ) => string;
  marker: (place: MapPlacePresentation, index: number) => MapMarkerVisual;
  userLocation: () => MapMarkerVisual;
  route: (route: MapRoutePresentation) => MapRouteVisual;
}

export interface SetupRequiredViewProps {
  issue: SetupIssue;
}

export interface LoadingViewProps {
  kind: "progress";
}

export interface FatalErrorViewProps {
  model: { kind: "render" };
  actions: { retry: () => void };
}

export interface ExperienceViewProps {
  model: ExperienceViewModel;
  actions: ExperienceActions;
  bindings: ExperienceBindings;
}

export interface ExperienceViewModel {
  trip: Trip;
  effectiveDay: EffectiveDay;
  days: readonly TripDay[];
  clock: { instant: string; timezone: string };
  live: { currentNodeId: string | null; nextNodeId: string | null };
  selection: TripSelection;
  progress: TripProgressV1;
  persistence: ProgressPersistenceStatus;
  routes: readonly ExperienceRouteViewModel[];
  map: { presentation: MapPresentation; status: "mounting" | "ready" | "error" };
  viewport: { width: number; height: number; safeTop: number; safeBottom: number };
  motion: "full" | "reduced";
  header: { expanded: boolean; clearance: number };
  location: { status: UserLocationStatus };
  sheet: { snap: SheetSnap; geometry: SheetGeometry };
  candidate: CandidateViewModel | null;
  shopping: ShoppingViewModel | null;
  tasks: readonly TripTask[];
}

export interface ExperienceRouteViewModel {
  edge: RouteEdge;
  loadState?: RouteLoadState;
  selected: boolean;
  selectionSource: "list" | "map" | null;
  navigationHref?: string;
}

export interface CandidateViewModel {
  group: CandidateGroup;
  sourceNode: TripNode;
  sequenceNumber: number;
  committedOptionId?: string;
  open: boolean;
  sessionId: number | null;
  draftOptionId?: string;
}

export interface ShoppingViewModel {
  node: Extract<TripNode, { kind: "shopping" }>;
  statuses: Readonly<Record<string, ShoppingStatus>>;
}

export interface ExperienceBindings {
  map: { ref: RefCallback<HTMLDivElement> };
  sheet: {
    getSheetProps: () => HTMLAttributes<HTMLElement>;
    getHandleProps: () => ButtonHTMLAttributes<HTMLButtonElement>;
  };
  owners: {
    nodeRef: (nodeId: string) => RefCallback<HTMLElement>;
    routeRef: (routeId: string) => RefCallback<HTMLElement>;
  };
  candidate: {
    getTriggerProps: () => CandidateTriggerProps;
    registerOption: (optionId: string) => RefCallback<HTMLElement>;
  } | null;
}

export interface ExperienceActions {
  selectDay: (dayId: string) => void;
  selectNode: (nodeId: string) => void;
  selectRoute: (routeId: string, source: "list" | "map") => void;
  returnToNow: () => void;
  returnToLodging: () => void;
  returnHome: () => void;
  retryRoute: (routeId: string) => void;
  retryMap: () => void;
  openCandidate: () => void;
  closeCandidate: () => void;
  previewCandidate: (optionId: string) => void;
  confirmCandidate: () => void;
  setCompleted: (id: string, completed: boolean) => void;
  setShoppingStatus: (itemId: string, status: ShoppingStatus) => void;
  startLocation: () => void;
  recenterLocation: () => void;
  stopLocation: () => void;
  setHeaderExpanded: (expanded: boolean) => void;
  setSheetSnap: (snap: SheetSnap) => void;
}
