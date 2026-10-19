/** Pure scenario inputs. Presentation, authored copy and provider data are injected by consumers. */
export interface OakWashiVisualVariant {
  readonly id: string;
  readonly mode: "home" | "experience" | "setup" | "loading" | "fatal";
  readonly viewport: { readonly width: number; readonly height: number };
  readonly scenario: {
    readonly state: string;
    readonly sheet: "collapsed" | "half" | "expanded";
    readonly header: boolean;
    readonly textScale: 1 | 2;
    readonly media: "standard" | "grayscale" | "forced-colors" | "reduced-motion";
    readonly backend: "advanced" | "overlay";
    readonly safeArea: readonly [number, number, number, number];
  };
}
export interface OakWashiVisualCase {
  readonly id: string;
  readonly variants: readonly OakWashiVisualVariant[];
}
function variant(id: string, width = 390, height = 844, scenario: Partial<OakWashiVisualVariant["scenario"]> = {}, mode: OakWashiVisualVariant["mode"] = "experience"): OakWashiVisualVariant {
  return { id, mode, viewport: { width, height }, scenario: { state: id, sheet: "half", header: false, textScale: 1, media: "standard", backend: "advanced", safeArea: [0, 0, 0, 0], ...scenario } };
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export const oakWashiVisualCases: readonly OakWashiVisualCase[] = freeze([
  { id: "home", variants: [variant("zero-mobile", 390, 844, {}, "home"), variant("zero-desktop", 1024, 900, {}, "home")] },
  { id: "experience-default", variants: [variant("full-day")] },
  { id: "experience-collapsed-current", variants: [variant("current-next", 390, 844, { sheet: "collapsed" })] },
  { id: "experience-expanded-dense", variants: [variant("dense-half", 320, 568, { header: true }), variant("dense-expanded-small", 320, 568, { sheet: "expanded", header: true }), variant("dense-expanded", 430, 932, { sheet: "expanded", header: true })] },
  { id: "candidate-open", variants: ["open", "draft", "confirmed", "cancelled"].map(id => variant(id)) },
  { id: "candidate-zoom-200", variants: [variant("comparison", 320, 568, { textScale: 2, sheet: "expanded" })] },
  { id: "selection-truth", variants: [variant("selected-resolved"), variant("selected-unresolved"), variant("grayscale", 390, 844, { media: "grayscale" })] },
  { id: "route-state-matrix", variants: ["walking", "transit", "driving", "flight", "unknown", "loading", "external", "unavailable", "retry", "authored-fallback"].map(id => variant(id)) },
  { id: "opening-hours-matrix", variants: ["known-open", "known-closed", "absent", "incomplete", "overnight", "cross-midnight", "trip-timezone"].map(id => variant(id)) },
  { id: "camera-adversarial", variants: ["implausible-duration", "remote-point", "flight"].map(id => variant(id)) },
  { id: "marker-backends", variants: [variant("advanced", 390, 844, { backend: "advanced" }), variant("overlay", 390, 844, { backend: "overlay" })] },
  { id: "map-error", variants: [variant("runtime-failure")] },
  { id: "setup-states", variants: [variant("missing-content", 390, 844, {}, "setup"), variant("missing-key"), variant("loader-failure")] },
  { id: "loading-owned", variants: [variant("startup", 390, 844, {}, "loading"), variant("place"), variant("route")] },
  { id: "runtime-degraded", variants: [variant("fatal", 390, 844, {}, "fatal"), variant("memory-only"), variant("location-denied"), variant("location-unavailable")] },
  { id: "accessibility-media", variants: [variant("keyboard-focus"), variant("selected-error"), variant("forced-colors", 390, 844, { media: "forced-colors" }), variant("reduced-motion", 390, 844, { media: "reduced-motion" }), variant("asymmetric-safe-areas", 390, 844, { safeArea: [20, 13, 34, 7], header: true }), variant("text-reflow", 390, 844, { textScale: 2, header: true })] },
  { id: "desktop-bounded", variants: [[768, 1024], [1024, 900], [1440, 1000]].flatMap(([width, height]) => [variant(`default-${width}`, width, height, { header: true }), variant(`expanded-${width}`, width, height, { sheet: "expanded", header: true })]) },
]);
