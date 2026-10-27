import type { Coordinates, ProviderUnavailableResult } from "@laugh-tale-island/core";
import type { MapAdapterV2, MarkerContentFactory, UserLocationContentFactory } from "@laugh-tale-island/core/browser";
export declare const MAP_ADAPTER_V2_CONTRACT_BRIDGE: unique symbol;
export interface MapContractPlacement {
    readonly element: HTMLElement;
    readonly initialPosition: Coordinates;
    readonly positionUpdates: readonly Coordinates[];
    readonly detachCount: number;
    select(): void;
}
export interface MapContractRoute {
    readonly creation: MapContractRouteMutation;
    readonly updates: readonly MapContractRouteMutation[];
    readonly detachCount: number;
    select(): void;
}
export interface MapContractRouteMutation {
    readonly edgeId: string;
    readonly geometry: readonly Coordinates[];
    readonly paint: {
        readonly color: string;
        readonly opacity: number;
        readonly width: number;
    };
    readonly clickable: boolean;
    readonly mapAssociated: boolean;
}
export interface MapAdapterV2ContractBridge {
    readonly sequence: string[];
    readonly mapConstructions: number;
    readonly markerPlacements: readonly MapContractPlacement[];
    readonly routePlacements: readonly MapContractRoute[];
    readonly fitCalls: readonly (readonly unknown[])[];
    readonly immediateCameraCalls: readonly unknown[];
    readonly animatedCameraCalls: readonly unknown[];
    readonly panByCalls: readonly unknown[];
    readonly zoomWrites: readonly number[];
    readonly expectedUnavailable: ProviderUnavailableResult;
    zoom: number;
    routeOwner(edgeId: string): void;
    idle(): void;
    unavailable(): void;
}
export declare function defineMapAdapterV2Contract(label: string, createAdapter: () => MapAdapterV2, createHost: () => HTMLElement, createMarkerContent: MarkerContentFactory, createUserLocationContent: UserLocationContentFactory): void;
