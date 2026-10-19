import type { Coordinates } from "./model.js";
export interface MapViewportMetrics {
    width: number;
    height: number;
}
export interface OcclusionRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface UsableRegion {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface EdgeInsets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}
export interface MapLayoutSnapshot {
    viewport: MapViewportMetrics;
    occlusions: readonly OcclusionRect[];
    usableRegion: UsableRegion;
    edgeInsets: EdgeInsets;
}
export declare function resolveMapLayout(viewport: MapViewportMetrics, occlusions: readonly OcclusionRect[]): MapLayoutSnapshot | null;
export declare function hasMaterialMapLayoutChange(previous: MapLayoutSnapshot | null, next: MapLayoutSnapshot | null): boolean;
export type CameraTransition = "animate" | "immediate";
export interface CameraIntentBase {
    intentId: string;
    transition: CameraTransition;
    viewport: MapViewportMetrics;
    usableRegion: UsableRegion;
    edgeInsets: EdgeInsets;
}
export interface FitCameraIntent extends CameraIntentBase {
    kind: "fit";
    points: readonly Coordinates[];
    paths: readonly (readonly Coordinates[])[];
    maximumZoom: number;
}
export interface FocusCameraIntent extends CameraIntentBase {
    kind: "focus";
    coordinate: Coordinates;
    targetZoom: number;
}
export interface RecenterUserCameraIntent extends CameraIntentBase {
    kind: "recenter-user";
    coordinate: Coordinates;
    targetZoom: number;
}
export type CameraIntent = FitCameraIntent | FocusCameraIntent | RecenterUserCameraIntent;
export interface CameraSnapshot {
    zoom: number;
}
export declare const CAMERA_POLICY_V2: Readonly<{
    readonly focusMinimumZoom: 15;
    readonly focusMaximumZoom: 18;
    readonly userLocationZoom: 16;
    readonly fitMaximumZoom: 15;
}>;
export interface CameraIntentContext {
    intentId: string;
    layout: MapLayoutSnapshot;
    reducedMotion: boolean;
}
export interface FitCameraGeometry {
    points: readonly Coordinates[];
    paths: readonly (readonly Coordinates[])[];
}
export declare function resolveFitCameraIntent(context: CameraIntentContext, geometry: FitCameraGeometry): FitCameraIntent | null;
export declare function resolveFocusCameraIntent(context: CameraIntentContext, coordinate: Coordinates, snapshot: CameraSnapshot | null): FocusCameraIntent | null;
export declare function resolveRecenterUserCameraIntent(context: CameraIntentContext, coordinate: Coordinates): RecenterUserCameraIntent | null;
export declare function reframeCameraIntent(intent: CameraIntent, layout: MapLayoutSnapshot): CameraIntent;
