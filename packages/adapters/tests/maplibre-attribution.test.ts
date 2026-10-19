// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountAttribution } from "../src/maplibre/attribution.js";
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });
it("places visible wrapping text inside usable region and observes its own size", () => {
  let resize!: () => void; const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect = disconnect; });
  const host = document.createElement("div"); document.body.append(host); const measured = vi.fn();
  const credit = mountAttribution(host, [{ text: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" }, { text: "<script>bad</script>", url: "https://example.org/" }], measured);
  const region = host.firstElementChild as HTMLElement;
  vi.spyOn(region, "getBoundingClientRect").mockReturnValue({ height: 48 } as DOMRect);
  credit.setLayout({ viewport: { width: 320, height: 568 }, occlusions: [], usableRegion: { x: 10, y: 50, width: 300, height: 200 }, edgeInsets: { top: 50, right: 10, bottom: 318, left: 10 } });
  resize();
  expect(region.style.right).toBe("18px"); expect(region.style.bottom).toBe("326px");
  expect(Number(region.style.zIndex)).toBeGreaterThan(4);
  expect(region.style.maxWidth).toBe("284px"); expect(measured).toHaveBeenLastCalledWith(48);
  expect(region.textContent).toContain("<script>bad</script>"); expect(region.querySelector("script")).toBeNull();
  credit.destroy(); credit.destroy(); expect(disconnect).toHaveBeenCalledOnce(); expect(host.childElementCount).toBe(0);
});
