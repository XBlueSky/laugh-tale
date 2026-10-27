/** Pure scenario inputs. Presentation, authored copy and provider data are injected by consumers. */
export interface OakWashiVisualVariant {
    readonly id: string;
    readonly mode: "home" | "experience" | "setup" | "loading" | "fatal";
    readonly viewport: {
        readonly width: number;
        readonly height: number;
    };
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
export declare const oakWashiVisualCases: readonly OakWashiVisualCase[];
