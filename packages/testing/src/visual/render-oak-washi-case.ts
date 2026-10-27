import { createElement } from "react";
import { TripController, type TripControllerProps, type TripPresentationV2, type TripRuntimeAdapters } from "@laugh-tale-island/react";
import { oakWashiVisualCases, type OakWashiVisualCase, type OakWashiVisualVariant } from "../fixtures/oak-washi-visual-cases.js";

/** Injection only: the caller supplies all authored content, runtime adapters and presentation. */
export function renderOakWashiCase(
  visualCase: OakWashiVisualCase,
  variant: OakWashiVisualVariant,
  presentation: TripPresentationV2,
  adapters: TripRuntimeAdapters,
  props: Omit<TripControllerProps, "presentation" | "runtime">,
) {
  const matches = oakWashiVisualCases.filter(item => item.id === visualCase.id);
  if (matches.length !== 1 || matches[0] !== visualCase || !visualCase.variants.includes(variant)) throw new TypeError("Unknown or duplicate visual case/variant");
  if (!presentation || !adapters) throw new TypeError("An explicit presentation and adapters are required");
  return createElement(TripController, { ...props, presentation, runtime: adapters });
}
