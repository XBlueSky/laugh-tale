import type { CandidateGroup, CandidateOption, Coordinates, MarkerMode, RouteEdge, TripNode, TimingCertainty } from "./model.js";
import { type NavigationTargetV2 } from "./navigation-target.js";
import type { EffectiveDay } from "./resolve-itinerary.js";
import type { RoutePresentation } from "./routes.js";
import type { SemanticOwnerState } from "./semantic-state.js";
export type NodeTimelineRole = "primary" | "base" | "journey" | "task";
export interface SemanticNodeProjection {
    kind: "node";
    ownerId: string;
    nodeId: string;
    label: string;
    sourceKind: TripNode["kind"];
    role: NodeTimelineRole;
    markerMode: MarkerMode;
    displayIndex?: number;
    ordinal?: string;
    timing: TimingCertainty;
    states: readonly SemanticOwnerState[];
    incomingRouteIds: readonly string[];
    navigationTarget: NavigationTargetV2 | null;
    node: TripNode;
}
export interface SemanticRouteProjection {
    kind: "route";
    ownerId: string;
    routeId: string;
    role: "connector";
    states: readonly SemanticOwnerState[];
    route: RoutePresentation;
}
export interface SemanticLogisticsGroupProjection {
    kind: "logistics-group";
    ownerId: string;
    role: "logistics-group";
    childOwnerIds: readonly string[];
    incomingRouteIds: readonly string[];
    children: readonly SemanticNodeProjection[];
}
export interface SemanticCandidateProjection {
    kind: "candidate";
    ownerId: string;
    optionId: string;
    parentOwnerId: string;
    label: string;
    sourceKind: TripNode["kind"];
    role: "primary";
    markerMode: "numbered";
    ordinal: string;
    timing: TimingCertainty;
    states: readonly SemanticOwnerState[];
    navigationTarget: NavigationTargetV2 | null;
    option: CandidateOption;
}
export interface SemanticMapOwnerProjection {
    ownerId: string;
    label: string;
    sourceKind: TripNode["kind"];
    markerMode: "numbered" | "base";
    displayIndex?: number;
    ordinal?: string;
    timing: TimingCertainty;
    states: readonly SemanticOwnerState[];
    coordinates: Coordinates;
}
export type SemanticTimelineEntry = SemanticNodeProjection | SemanticRouteProjection | SemanticLogisticsGroupProjection;
export interface DaySemanticProjection {
    entries: readonly SemanticTimelineEntry[];
    candidates: readonly SemanticCandidateProjection[];
    mapOwners: readonly SemanticMapOwnerProjection[];
}
export interface DaySemanticProjectionInput {
    day: EffectiveDay;
    routes: readonly RouteEdge[];
    candidateGroups: readonly CandidateGroup[];
    currentNodeId: string | null;
    nextNodeId: string | null;
    viewingOwnerId: string | null;
    selectedOwnerId: string | null;
    supportedNavigationProviders: readonly string[];
}
export declare function timelineRoleForNode(node: TripNode): NodeTimelineRole;
export declare function formatCandidateOrdinal(parentDisplayIndex: number, zeroBasedOptionIndex: number): string;
export declare function buildDaySemanticProjection(input: DaySemanticProjectionInput): DaySemanticProjection;
