import type { CameraIntent } from "@laugh-tale-island/core";
export declare function projectMapLibreCamera(intent: CameraIntent, legalHeight: number): {
    center: [number, number];
    zoom: number;
} | null;
