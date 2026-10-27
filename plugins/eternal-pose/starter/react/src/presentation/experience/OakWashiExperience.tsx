import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import type { ExperienceViewProps } from "@laugh-tale-island/react";
import { catalog, locale } from "../copy/catalog.js";
import { OakWashiMapSurface } from "../map/OakWashiMapSurface.js";
import { OakWashiMapControls } from "../map/OakWashiMapControls.js";
import { summarizeMapCoverage } from "../map/map-coverage.js";
import { FloatingDayHeader } from "./FloatingDayHeader.js";
import { ItinerarySheet } from "./ItinerarySheet.js";
import { PersistenceNotice } from "../states/PersistenceNotice.js";
import { LocationState } from "../states/LocationState.js";

export function OakWashiExperience(props: ExperienceViewProps) {
  const { model, actions, bindings } = props;
  const root = useRef<HTMLDivElement | null>(null);
  const upper = useRef<HTMLDivElement | null>(null);
  const sheet = useRef<HTMLElement | null>(null);
  const header = useRef<HTMLElement | null>(null);
  const controls = useRef<HTMLElement | null>(null);
  const scrollingChrome = useRef(false);
  const scheduleMeasurement = useRef<(() => void) | null>(null);
  const publishedGeometry = useRef("");
  // The public binding is a stable, context-free callback.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const publishGeometry = bindings.sheet.setMeasuredGeometry;
  const headerOcclusion = useMemo(() => bindings.layout.occlusionRef("oak-header"), [bindings.layout]);
  const controlsOcclusion = useMemo(() => bindings.layout.occlusionRef("oak-controls"), [bindings.layout]);
  const statusOcclusion = useMemo(() => bindings.layout.occlusionRef("oak-provider-status"), [bindings.layout]);
  const upperOcclusion = useMemo(() => bindings.layout.occlusionRef("oak-upper-scrollport"), [bindings.layout]);
  const headerRef = useCallback((element: HTMLElement | null) => { header.current = element; headerOcclusion(scrollingChrome.current ? null : element); }, [headerOcclusion]);
  const controlsRef = useCallback((element: HTMLElement | null) => { controls.current = element; controlsOcclusion(scrollingChrome.current ? null : element); }, [controlsOcclusion]);
  const sheetRef = useCallback((element: HTMLElement | null) => { sheet.current = element; }, []);
  useLayoutEffect(() => {
    const surface = root.current;
    const top = upper.current;
    if (!surface || !top) return;
    // This is the recipe-owned sibling, never provider-owned map DOM.
    const status = Array.from(surface.children).find(child => child.classList.contains("oak-map-status")) as HTMLElement | undefined;
    const fineKeyboardScroll = (event: KeyboardEvent) => {
      if (event.target !== event.currentTarget || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
      const port = event.currentTarget as HTMLElement;
      if (port.scrollHeight <= port.clientHeight) return;
      event.preventDefault();
      port.scrollTop += event.key === "ArrowDown" ? 12 : -12;
    };
    top.addEventListener("keydown", fineKeyboardScroll);
    status?.addEventListener("keydown", fineKeyboardScroll);
    const collapsed = surface.querySelector<HTMLElement>(".oak-geometry-collapsed")!;
    const half = surface.querySelector<HTMLElement>(".oak-geometry-half")!;
    const legal = surface.querySelector<HTMLElement>(".oak-geometry-legal")!;
    statusOcclusion(status ?? null);
    let frame: number | null = null;
    let registeredMode: boolean | null = null;
    let observedStatus: Element | null = null;
    let observedSummary: Element | null = null;
    let observedAttribution: Element | null = null;
    const measure = () => {
      frame = null;
      const bounds = surface.getBoundingClientRect();
      const style = getComputedStyle(surface);
      const largeText = String(Number.parseFloat(style.fontSize) >= 20);
      if (surface.dataset.largeText !== largeText) surface.dataset.largeText = largeText;
      const gap = Number.parseFloat(style.getPropertyValue("--oak-clearance-gap")) || 0;
      const lane = legal.getBoundingClientRect().height;
      const compact = sheet.current?.querySelector<HTMLElement>(".oak-collapsed-summary");
      const coverageNote = sheet.current?.querySelector<HTMLElement>(".oak-map-coverage-note");
      const coverageStyle = coverageNote ? getComputedStyle(coverageNote) : null;
      const coverageHeight = coverageNote && coverageStyle && coverageStyle.position !== "absolute"
        ? coverageNote.getBoundingClientRect().height + (Number.parseFloat(coverageStyle.marginTop) || 0) + (Number.parseFloat(coverageStyle.marginBottom) || 0) : 0;
      const attribution = surface.querySelector<HTMLElement>('[aria-label="Map attribution"]');
      if (observedAttribution !== attribution) {
        if (observedAttribution) observer?.unobserve(observedAttribution);
        observedAttribution = attribution;
        if (observedAttribution) observer?.observe(observedAttribution);
      }
      const attributionBounds = attribution?.getBoundingClientRect();
      const statusContent = status?.firstElementChild ?? null;
      if (observedStatus !== statusContent) {
        if (observedStatus) observer?.unobserve(observedStatus);
        observedStatus = statusContent;
        if (observedStatus) observer?.observe(observedStatus);
      }
      if (observedSummary !== (compact ?? null)) {
        if (observedSummary) observer?.unobserve(observedSummary);
        observedSummary = compact ?? null;
        if (observedSummary) observer?.observe(observedSummary);
      }
      const handle = sheet.current?.querySelector<HTMLElement>(".oak-sheet-handle");
      const padding = Number.parseFloat(sheet.current ? getComputedStyle(sheet.current).paddingBottom : "") || 0;
      const collapsedHeight = Math.max(collapsed.getBoundingClientRect().height, (compact?.scrollHeight ?? 0) + (handle?.getBoundingClientRect().height ?? 0) + padding + coverageHeight);
      const topBounds = top.getBoundingClientRect();
      const statusBounds = status?.getBoundingClientRect();
      const topInset = Math.max(0, topBounds.top - bounds.top);
      const upperNeed = Math.max(top.scrollHeight, topBounds.height);
      const statusNeed = status ? Math.max(status.scrollHeight, statusBounds!.height) : 0;
      const collapsedBudget = Math.max(0, bounds.height - lane - collapsedHeight - topInset - gap);
      // At large text sizes the upper chrome must scroll before it consumes
      // the itinerary's entire readable area. The sheet remains a real target.
      const readableSheet = bounds.height < 500 ? collapsedHeight : Math.max(collapsedHeight, Math.min(bounds.height * (statusNeed > 0 ? 0.41 : 0.52), statusNeed > 0 ? 250 : 300));
      const readableBudget = Math.max(0, bounds.height - lane - readableSheet - topInset - gap);
      const crowded = upperNeed + (statusNeed > 0 ? gap + statusNeed : 0) > readableBudget;
      const sheetBounds = sheet.current?.getBoundingClientRect();
      const sideLane = attribution && sheetBounds && bounds.right - sheetBounds.right >= attributionBounds!.width + 16;
      // The provider's camera region can momentarily be stale on a date switch.
      // Place its legal credit from the actual sheet geometry, not that region.
      surface.style.setProperty("--oak-map-attribution-clearance", `${attributionBounds ? attributionBounds.height + 16 : 8}px`);
      surface.style.setProperty("--oak-map-attribution-bottom", crowded || sideLane || !sheetBounds
        ? "max(8px, env(safe-area-inset-bottom))" : `${bounds.bottom - sheetBounds.top + 8}px`);
      const budget = crowded ? readableBudget : collapsedBudget;
      surface.style.setProperty("--oak-chrome-budget", `${budget}px`);
      const chromeScroll = String(crowded);
      if (surface.dataset.chromeScroll !== chromeScroll) surface.dataset.chromeScroll = chromeScroll;
      if (crowded !== registeredMode) {
        registeredMode = crowded;
        scrollingChrome.current = crowded;
        headerOcclusion(crowded ? null : header.current);
        controlsOcclusion(crowded ? null : controls.current);
        upperOcclusion(crowded ? top : null);
      }
      if (crowded) {
        // Allocate from actual content need; retain a complete control in each
        // scroll region rather than dividing the remaining space equally.
        const minimum = Number.parseFloat(style.getPropertyValue("--oak-control-minimum")) || 44;
        const targetHeight = (element: HTMLElement) => Math.max(minimum, ...Array.from(element.querySelectorAll("button")).map(button => button.getBoundingClientRect().height));
        const upperMinimum = Math.min(upperNeed, targetHeight(top));
        // The notice's border and content padding must fit around the control,
        // including its focus outline. Measure stable box edges, not the
        // already allocated scrollport height, to avoid resize feedback.
        const statusStyle = status ? getComputedStyle(status) : null;
        const contentStyle = statusContent ? getComputedStyle(statusContent) : null;
        const statusEdges = [statusStyle?.borderTopWidth, statusStyle?.borderBottomWidth, contentStyle?.paddingTop, contentStyle?.paddingBottom]
          .reduce((sum, value) => sum + (Number.parseFloat(value ?? "") || 0), 0);
        const statusMinimum = status && statusNeed > 0 ? Math.min(statusNeed, targetHeight(status) + statusEdges) : 0;
        const usable = Math.max(0, budget - (statusNeed > 0 ? gap : 0));
        // Both chrome regions scroll. A tall date rail must not consume the
        // map notice's entire viewport (or make its retry control unreachable).
        const sharedMinimum = Math.min(minimum, usable / (statusNeed > 0 ? 2 : 1));
        const upperBudget = statusNeed > 0
          ? Math.min(upperNeed, Math.max(sharedMinimum, usable - Math.max(sharedMinimum, Math.min(statusMinimum, usable * 0.5))))
          : Math.min(upperNeed, usable);
        const statusBudget = Math.max(0, usable - upperBudget);
        surface.style.setProperty("--oak-upper-budget", `${upperBudget}px`);
        surface.style.setProperty("--oak-status-budget", `${statusBudget}px`);
        top.tabIndex = 0;
        if (status && statusNeed > 0) status.tabIndex = 0;
        const chromeSpace = usable < upperMinimum + statusMinimum ? "insufficient" : "bounded";
        if (surface.dataset.chromeSpace !== chromeSpace) surface.dataset.chromeSpace = chromeSpace;
      } else {
        surface.style.removeProperty("--oak-upper-budget");
        surface.style.removeProperty("--oak-status-budget");
        top.removeAttribute("tabindex");
        status?.removeAttribute("tabindex");
        if (surface.dataset.chromeSpace !== "available") surface.dataset.chromeSpace = "available";
      }
      const upperBottom = Math.max(0, top.getBoundingClientRect().bottom - bounds.top);
      surface.style.setProperty("--oak-map-header-clearance", `${upperBottom + gap}px`);
      const statusBoundsAfterHeader = status?.getBoundingClientRect();
      const statusBottom = statusBoundsAfterHeader && statusBoundsAfterHeader.height > 0 ? statusBoundsAfterHeader.bottom - bounds.top : 0;
      const floatingCreditGap = attribution && !sideLane && !crowded ? attributionBounds!.height + 16 : 0;
      const clearance = Math.max(upperBottom, statusBottom) + Math.max(gap, floatingCreditGap);
      const availableSheet = Math.max(0, bounds.height - clearance - lane);
      // Preserve a usable map band on ordinary phones. Short and crowded
      // screens give the readable itinerary and legal attribution priority.
      const mapPreview = bounds.width < 720 && !crowded && surface.dataset.largeText !== "true"
        ? Math.max(0, Math.min(124, availableSheet - 300)) : 0;
      const expandedHeight = availableSheet - mapPreview;
      surface.style.setProperty("--oak-sheet-ceiling", `${expandedHeight}px`);
      const next = { collapsedHeight, halfHeight: half.getBoundingClientRect().height, expandedHeight };
      const key = JSON.stringify(next);
      if (bounds.height > 0 && expandedHeight >= collapsedHeight && key !== publishedGeometry.current) { publishedGeometry.current = key; publishGeometry(next); }
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(measure); };
    scheduleMeasurement.current = schedule;
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    for (const element of [surface, top, header.current, controls.current, status, collapsed, half, legal, sheet.current, sheet.current?.querySelector(".oak-map-coverage-note")]) if (element) observer?.observe(element);
    const mapContent = surface.querySelector(".oak-map-content");
    const attributionObserver = mapContent && typeof MutationObserver === "function"
      ? new MutationObserver(() => {
        if (mapContent.querySelector('[aria-label="Map attribution"]') !== observedAttribution) schedule();
      }) : null;
    if (mapContent) attributionObserver?.observe(mapContent, { childList: true, subtree: true });
    const viewport = window.visualViewport;
    window.addEventListener("resize", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    measure();
    return () => {
      observer?.disconnect();
      attributionObserver?.disconnect();
      scheduleMeasurement.current = null;
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
      statusOcclusion(null);
      upperOcclusion(null);
      top.removeEventListener("keydown", fineKeyboardScroll);
      status?.removeEventListener("keydown", fineKeyboardScroll);
    };
  }, [publishGeometry, statusOcclusion, headerOcclusion, controlsOcclusion, upperOcclusion]);
  // A committed provider-state or owner change can replace an observed child
  // while its constrained parent retains exactly the same size.
  useLayoutEffect(() => { scheduleMeasurement.current?.(); });
  const coverage = summarizeMapCoverage(model);
  return <div ref={root} className={`oak-washi oak-experience oak-locale--${locale.startsWith("zh-Hant") ? "zh-hant" : "en"}`} lang={locale} data-motion={model.motion} data-header-phase={model.header.transition?.phase ?? "settled"} data-map-coverage={coverage.kind} data-map-density={coverage.total > 0 && coverage.mapped / coverage.total < 0.5 ? "sparse" : "mapped"} data-map-primary-count={coverage.total} aria-label={catalog.accessibleNames.header}>
    <OakWashiMapSurface provider={model.map.provider} mapViewportRef={bindings.layout.mapViewportRef} onRetry={model.capabilities.retryMap ? () => actions.retryProvider("map") : undefined} />
    <div className="oak-upper-clearance oak-header-rail" ref={upper}>
      <div className="oak-header-content" ref={headerRef}>
        <FloatingDayHeader model={model} actions={actions} />
        {(model.persistence.status !== "persistent" || model.location.status !== "idle") && <div className="oak-global-notices"><PersistenceNotice state={model.persistence} />{model.location.status !== "idle" && <LocationState state={model.location} />}</div>}
      </div>
      <div className="oak-controls-row" ref={controlsRef}><OakWashiMapControls capabilities={model.capabilities} actions={actions} /></div>
    </div>
    <ItinerarySheet {...props} sheetRef={sheetRef} />
    <div className="oak-geometry" aria-hidden="true" inert><div className="oak-geometry-collapsed" /><div className="oak-geometry-half" /><div className="oak-geometry-legal" /></div>
  </div>;
}
