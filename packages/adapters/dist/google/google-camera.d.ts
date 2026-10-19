import type { Coordinates } from "@laugh-tale-island/core";
import type { CameraIntent } from "@laugh-tale-island/core/browser";
import type { GoogleMapsProjection, GoogleMapsRuntime } from "./google-config.js";
/** Translate a core-selected target/insets into Google's north-up world projection. */
export declare function projectImmediateCamera(runtime: GoogleMapsRuntime, projection: GoogleMapsProjection, intent: CameraIntent): {
    center: Coordinates;
    zoom: number;
    heading: 0;
    tilt: 0;
} | undefined;
