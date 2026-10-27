import { type RefCallback } from "react";
import { type EdgeInsets, type MapLayoutSnapshot, type MapViewportMetrics } from "@laugh-tale-island/core";
export interface VisibleMapLayoutController {
    layout: MapLayoutSnapshot | null;
    revision: number;
    viewport: MapViewportMetrics;
    safeArea: EdgeInsets;
    reducedMotion: boolean;
    mapViewportRef: RefCallback<HTMLElement>;
    occlusionRef(id: string): RefCallback<HTMLElement>;
}
export declare function useVisibleMapLayout(): VisibleMapLayoutController;
