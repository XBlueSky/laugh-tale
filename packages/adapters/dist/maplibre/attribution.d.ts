import type { MapLayoutSnapshot } from "@laugh-tale-island/core";
export declare function mountAttribution(host: HTMLElement, entries: readonly {
    text: string;
    url: string;
}[], onHeight: (height: number) => void): {
    setLayout(layout: MapLayoutSnapshot | null): void;
    destroy(): void;
};
