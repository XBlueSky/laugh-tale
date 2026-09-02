import { useEffect, useState } from "react";

export interface ViewportMetrics {
  width: number;
  height: number;
  safeTop: number;
  safeBottom: number;
}

const DEFAULT_VIEWPORT: ViewportMetrics = {
  width: 390,
  height: 844,
  safeTop: 0,
  safeBottom: 0,
};

function finitePixel(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function browserViewport(): ViewportMetrics {
  return typeof window === "undefined"
    ? DEFAULT_VIEWPORT
    : {
        width: window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
        safeTop: 0,
        safeBottom: 0,
      };
}

export function useViewportMetrics(): ViewportMetrics {
  const [metrics, setMetrics] = useState<ViewportMetrics>(browserViewport);

  useEffect(() => {
    const probe = document.createElement("div");
    probe.className = "safe-area-probe";
    Object.assign(probe.style, {
      position: "fixed",
      inset: "0 auto auto 0",
      width: "0",
      height: "0",
      overflow: "hidden",
      visibility: "hidden",
      pointerEvents: "none",
      paddingTop: "env(safe-area-inset-top)",
      paddingBottom: "env(safe-area-inset-bottom)",
    });
    probe.setAttribute("aria-hidden", "true");
    document.body.append(probe);

    const measure = (): void => {
      const computed = window.getComputedStyle(probe);
      const next: ViewportMetrics = {
        width: window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
        safeTop: finitePixel(computed.paddingTop),
        safeBottom: finitePixel(computed.paddingBottom),
      };
      setMetrics((current) =>
        current.width === next.width &&
        current.height === next.height &&
        current.safeTop === next.safeTop &&
        current.safeBottom === next.safeBottom
          ? current
          : next,
      );
    };

    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      probe.remove();
    };
  }, []);

  return metrics;
}

export function useReducedMotionPreference(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}
