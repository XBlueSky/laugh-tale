import { type TripControllerProps, type TripPresentationV2, type TripRuntimeAdapters } from "@laugh-tale-island/react";
import { type OakWashiVisualCase, type OakWashiVisualVariant } from "../fixtures/oak-washi-visual-cases.js";
/** Injection only: the caller supplies all authored content, runtime adapters and presentation. */
export declare function renderOakWashiCase(visualCase: OakWashiVisualCase, variant: OakWashiVisualVariant, presentation: TripPresentationV2, adapters: TripRuntimeAdapters, props: Omit<TripControllerProps, "presentation" | "runtime">): import("react").FunctionComponentElement<TripControllerProps>;
