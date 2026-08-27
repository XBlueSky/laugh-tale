export type BuiltInNodeKind = "transport" | "transfer" | "lodging" | "dining" | "shopping" | "sightseeing" | "experience" | "logistics";
export type TimingCertainty = "fixed" | "suggested" | "unknown";
export type Optionality = "core" | "optional" | "candidate";
export type RouteMode = "walking" | "transit" | "driving" | "flight";
export type FactCertainty = "confirmed" | "suggested" | "candidate" | "unverified";
export interface Coordinates {
    lat: number;
    lng: number;
}
export interface PlaceRef {
    name: string;
    coordinates?: Coordinates;
    provider?: {
        name: "google";
        placeId?: string;
    };
    certainty: FactCertainty;
}
export interface Timing {
    start?: string;
    end?: string;
    dayOffset?: number;
    certainty: TimingCertainty;
}
export interface Booking {
    status: "confirmed" | "pending" | "none";
    reference?: string;
    url?: string;
    arrivalBufferMinutes?: number;
}
export interface NodeCapabilities {
    place?: boolean;
    booking?: boolean;
    choice?: boolean;
    completion?: boolean;
    shopping?: boolean;
}
export interface CandidateOption {
    id: string;
    title: string;
    place?: PlaceRef;
    booking?: Booking;
    metadata?: Record<string, string>;
}
export interface CandidateGroup {
    id: string;
    parentNodeId: string;
    mode: "single" | "browse";
    defaultOptionId?: string;
    options: CandidateOption[];
}
export interface ChecklistItem {
    id: string;
    title: string;
}
export type ShoppingStatus = "pending" | "purchased" | "unavailable" | "skipped";
export interface ShoppingItem {
    id: string;
    title: string;
    priority?: "must" | "nice";
    initialStatus?: ShoppingStatus;
}
export interface NodeBase<K extends string, P> {
    id: string;
    dayId: string;
    kind: K;
    title: string;
    timing: Timing;
    optionality: Optionality;
    place?: PlaceRef;
    booking?: Booking;
    details?: string[];
    payload: P;
}
export type BuiltInNode = NodeBase<"transport", {
    mode: "walking" | "transit" | "driving";
    plan?: string;
}> | NodeBase<"transfer", {
    mode: "flight" | "rail" | "bus";
    terminal?: string;
}> | NodeBase<"lodging", {
    role: "base" | "check-in" | "check-out" | "return";
    checklist?: ChecklistItem[];
}> | NodeBase<"dining", {
    cuisine?: string;
    candidateGroupId?: string;
}> | NodeBase<"shopping", {
    items: ShoppingItem[];
}> | NodeBase<"sightseeing", {
    area?: string;
}> | NodeBase<"experience", {
    durationMinutes?: number;
}> | NodeBase<"logistics", {
    checklist: ChecklistItem[];
}>;
export type CustomNode = NodeBase<"custom", {
    customKind: string;
    capabilities: NodeCapabilities;
    data: Record<string, string | number | boolean>;
}>;
export type TripNode = BuiltInNode | CustomNode;
export interface TripTask {
    id: string;
    title: string;
    scope: "pretrip" | "day";
    dayId?: string;
    note?: string;
    children?: ChecklistItem[];
}
export interface Reservation {
    id: string;
    title: string;
    ownerId: string;
    booking: Booking;
}
export interface TripDay {
    id: string;
    date: string;
    title: string;
    summary?: string;
    nodes: TripNode[];
}
export interface RouteEdge {
    id: string;
    dayId: string;
    fromNodeId: string;
    toNodeId: string;
    mode: RouteMode;
    source: "manual" | "provider" | "recomposed";
    certainty: FactCertainty;
    durationMinutes?: number;
    distanceMeters?: number;
    summary?: string;
    navigation?: {
        origin: string;
        destination: string;
    };
}
export interface Trip {
    id: string;
    title: string;
    timezone: string;
    startDate: string;
    endDate: string;
    days: TripDay[];
    routes: RouteEdge[];
    candidateGroups: CandidateGroup[];
    reservations: Reservation[];
    tasks: TripTask[];
}
