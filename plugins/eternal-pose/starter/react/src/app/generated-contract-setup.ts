import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { vi } from "vitest";

/** jsdom has no layout engine. Only shell measurement probes receive geometry;
 * target sizes are inspected from the generated project's actual CSS. */
export function setupContractDOM(width = 390, height = 844) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduced-motion"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  const style = document.createElement("style");
  style.dataset.contractStyle = "";
  style.textContent = readFileSync(resolve("src/presentation/styles/accessibility.css"), "utf8");
  document.head.append(style);
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "getBoundingClientRect")!;
  const originalMethod = descriptor.value as (this: HTMLElement) => DOMRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("oak-experience") || this.classList.contains("oak-map-content")) return new DOMRect(0, 0, width, height);
    if (this.classList.contains("oak-upper-clearance")) return new DOMRect(0, 0, width, 140);
    if (this.classList.contains("oak-geometry-collapsed")) return new DOMRect(0, 0, width, 104);
    if (this.classList.contains("oak-geometry-half")) return new DOMRect(0, 0, width, Math.round(height * 0.46));
    if (this.classList.contains("oak-geometry-legal")) return new DOMRect(0, 0, width, 44);
    return originalMethod.call(this);
  });
}
