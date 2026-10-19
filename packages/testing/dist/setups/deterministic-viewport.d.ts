import type { MapViewportMetrics, OcclusionRect } from "@laugh-tale-island/core/browser";
export interface DeterministicViewportSetup {
    viewport: MapViewportMetrics;
    occlusions: readonly OcclusionRect[];
}
export declare function createDeterministicViewportSetup(input?: {
    width?: number;
    height?: number;
    occlusions?: readonly OcclusionRect[];
}): DeterministicViewportSetup;
