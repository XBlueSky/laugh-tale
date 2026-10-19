import { useCallback, useLayoutEffect, useMemo, useId, useRef, type RefCallback } from "react";
import type { ExperienceViewProps } from "@laugh-tale-island/react";
import { ChevronUp, House, LocateFixed } from "lucide-react";
import { catalog } from "../copy/catalog.js";
import { summarizeMapCoverage } from "../map/map-coverage.js";
import { ItineraryTimeline } from "../timeline/ItineraryTimeline.js";
import { CollapsedOwnerSummary } from "./CollapsedOwnerSummary.js";

export function ItinerarySheet({ model, actions, bindings, sheetRef }: ExperienceViewProps & { sheetRef?: RefCallback<HTMLElement> }) {
  const surface = bindings.sheet.getSurfaceProps();
  const sheetId = useId();
  const occlusion = useMemo(() => bindings.layout.occlusionRef("oak-sheet"), [bindings.layout]);
  const boundRef = surface.ref;
  const composedRef = useCallback((element: HTMLElement | null) => { boundRef(element); occlusion(element); sheetRef?.(element); }, [boundRef, occlusion, sheetRef]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const readingIntent = useRef({ dayId: model.day.id, ownerId: model.owners.selectedId, interrupted: false });
  const previousDayId = useRef(model.day.id);
  useLayoutEffect(() => {
    if (previousDayId.current !== model.day.id) {
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      previousDayId.current = model.day.id;
    }
  }, [model.day.id]);
  const collapsed = model.sheet.snap === "collapsed";
  useLayoutEffect(() => {
    if (readingIntent.current.dayId !== model.day.id || readingIntent.current.ownerId !== model.owners.selectedId) {
      readingIntent.current = { dayId: model.day.id, ownerId: model.owners.selectedId, interrupted: false };
    }
    const intent = readingIntent.current;
    const element = scrollRef.current?.closest<HTMLElement>(".oak-itinerary-sheet");
    if (collapsed || !element) return;
    let frame: number | null = null;
    const revealPartialControl = () => {
      frame = null;
      if (intent.interrupted || element.dataset.dragging === "true" || element.querySelector('dialog[open], [role="dialog"]')) return;
      const control = element.querySelector<HTMLElement>('.oak-row[data-selected="true"] .oak-row-selection, .oak-row[data-selected="true"] .oak-route-selection');
      if (!control) return;
      // Shared crowded-chrome scrolling also contains the heading; its
      // controller/native focus contract owns reveal rather than this inset.
      for (const port of [scrollRef.current]) {
        if (!port || !/^(auto|scroll)$/.test(getComputedStyle(port).overflowY)) continue;
        const target = control.getBoundingClientRect(), bounds = port.getBoundingClientRect();
        const top = bounds.top + port.clientTop, bottom = top + port.clientHeight;
        // A restored owner may start entirely below the new reading geometry.
        // Actual reading gestures are guarded separately, across snap changes.
        if (target.height > port.clientHeight) continue;
        // WebKit rounds scroll offsets to whole CSS pixels. Leave an inset so
        // a fractional correction cannot leave the control's last pixel clipped.
        const inset = target.height + 2 <= port.clientHeight ? 1 : 0;
        const delta = target.top < top + inset ? target.top - top - inset : target.bottom > bottom - inset ? target.bottom - bottom + inset : 0;
        if (Math.abs(delta) > 0.5) port.scrollTo({ top: port.scrollTop + delta, behavior: "instant" });
      }
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(revealPartialControl); };
    const interrupt = () => { intent.interrupted = true; };
    const inReadingPort = (target: EventTarget | null) => target instanceof Node && [scrollRef.current, bodyRef.current].some(port => port && /^(auto|scroll)$/.test(getComputedStyle(port).overflowY) && port.contains(target));
    const interruptPointer = (event: PointerEvent) => {
      if (inReadingPort(event.target) && !(event.target instanceof Element && event.target.closest("button, a, input, select, textarea"))) interrupt();
    };
    const interruptTouch = (event: TouchEvent) => { if (inReadingPort(event.target)) interrupt(); };
    const interruptKeyboard = (event: KeyboardEvent) => {
      if (["PageDown", "PageUp", "Home", "End", "ArrowDown", "ArrowUp"].includes(event.key) && inReadingPort(event.target)
        && !(event.target instanceof Element && event.target.closest("input, select, textarea"))) interrupt();
    };
    const interruptFocus = (event: FocusEvent) => {
      const row = event.target instanceof Element ? event.target.closest<HTMLElement>(".oak-row") : null;
      // Focus inside details is a reading target too. In particular candidate
      // cancellation restores its trigger, not the owner's summary above it.
      if (inReadingPort(event.target) && row && (row.dataset.selected !== "true"
        || event.target instanceof Element && !!event.target.closest(".oak-owner-details"))) interrupt();
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    for (const port of [element, scrollRef.current, bodyRef.current]) if (port) observer?.observe(port);
    // Fixed scrollport boxes do not resize when an earlier detail closes.
    // Observe each animated footprint so its selected successor stays visible
    // throughout reflow, unless the reader has taken over positioning.
    for (const detail of element.querySelectorAll(".oak-detail-motion")) observer?.observe(detail);
    const finishDisclosure = (event: TransitionEvent) => {
      if (event.target instanceof Element && event.target.classList.contains("oak-detail-motion") && event.propertyName === "grid-template-rows") schedule();
    };
    element.addEventListener("transitionend", finishDisclosure);
    element.addEventListener("wheel", interrupt, { passive: true });
    element.addEventListener("pointerdown", interruptPointer, { passive: true });
    element.addEventListener("touchmove", interruptTouch, { passive: true });
    element.addEventListener("keydown", interruptKeyboard);
    element.addEventListener("focusin", interruptFocus);
    schedule();
    return () => { observer?.disconnect(); if (frame !== null) cancelAnimationFrame(frame); element.removeEventListener("transitionend", finishDisclosure); element.removeEventListener("wheel", interrupt); element.removeEventListener("pointerdown", interruptPointer); element.removeEventListener("touchmove", interruptTouch); element.removeEventListener("keydown", interruptKeyboard); element.removeEventListener("focusin", interruptFocus); };
  }, [collapsed, model.day.id, model.sheet.snap, model.owners.selectedId]);
  useLayoutEffect(() => {
    const heading = headingRef.current;
    const scroll = scrollRef.current;
    if (!heading || !scroll) return;
    const alignRule = () => heading.style.setProperty("--oak-scrollbar-width", `${Math.max(0, scroll.offsetWidth - scroll.clientWidth)}px`);
    alignRule();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(alignRule);
    observer?.observe(scroll);
    window.addEventListener("resize", alignRule);
    return () => { observer?.disconnect(); window.removeEventListener("resize", alignRule); };
  }, [collapsed]);
  const expanded = model.sheet.snap === "expanded";
  const coverage = summarizeMapCoverage(model);
  const coverageTemplate = coverage.kind === "none" ? catalog.experience.mapCoverageNone : catalog.experience.mapCoveragePartial;
  const coverageNote = model.map.provider.status !== "ready" || coverage.total === 0 || coverage.kind === "complete"
    ? null : coverageTemplate.replace("{mapped}", String(coverage.mapped)).replace("{total}", String(coverage.total));
  const canToggle = model.sheet.interactive && model.capabilities.sheetSnaps.some(snap => expanded ? snap !== "expanded" : snap !== model.sheet.snap);
  const canReveal = model.capabilities.sheetSnaps.includes("expanded");
  const timelineActions = useMemo(() => ({
    ...actions,
    selectNode: (id: string) => { actions.selectNode(id); if (canReveal) actions.setSheetSnap("expanded"); },
    selectRoute: (id: string, source: "list" | "map") => { actions.selectRoute(id, source); if (source === "list" && canReveal) actions.setSheetSnap("expanded"); },
  }), [actions, canReveal]);
  return <section {...surface} id={sheetId} ref={composedRef} className={["oak-itinerary-sheet", surface.className].filter(Boolean).join(" ")} aria-label={catalog.accessibleNames.itinerarySheet} data-sheet-snap={model.sheet.snap}>
    <div className="oak-sheet-handle-row"><div {...bindings.sheet.getHandleProps()} className="oak-sheet-handle" role={model.sheet.interactive ? "separator" : undefined} tabIndex={model.sheet.interactive ? 0 : undefined} aria-orientation={model.sheet.interactive ? "horizontal" : undefined} aria-controls={model.sheet.interactive ? sheetId : undefined} aria-label={model.sheet.interactive ? catalog.accessibleNames.itinerarySheet : undefined}><span className="oak-sheet-grip" aria-hidden="true" /></div>{canToggle && <button type="button" className="oak-control oak-sheet-toggle" aria-label={expanded ? catalog.accessibleNames.collapseSheet : catalog.accessibleNames.expandSheet} onClick={() => actions.stepSheet(expanded ? "collapse" : "expand")}><ChevronUp className="oak-disclosure-arrow" size={18} strokeWidth={1.75} aria-hidden="true" /></button>}</div>
    {collapsed ? <>{coverageNote && <p className="oak-map-coverage-note" role="note" aria-label={catalog.provider.map}>{coverageNote}</p>}<CollapsedOwnerSummary model={model} actions={actions} bindings={bindings} /></> : <div className="oak-sheet-body" ref={bodyRef}>
      <div className="oak-sheet-heading" ref={headingRef}><h2>{catalog.experience.itinerary} <span>{catalog.experience.primaryCount.replace("{count}", String(model.itinerary.primaryCount))}</span></h2><div className="oak-sheet-actions">{model.capabilities.returnToCurrent && <button type="button" className="oak-control" aria-label={catalog.navigation.returnToCurrent} onClick={() => actions.returnToCurrent()}><LocateFixed size={18} strokeWidth={1.75} aria-hidden="true" /></button>}{model.capabilities.returnToLodging && <button type="button" className="oak-control" aria-label={catalog.navigation.returnToLodging} onClick={() => actions.returnToLodging()}><House size={18} strokeWidth={1.75} aria-hidden="true" /></button>}</div></div>
      {coverageNote && <p className="oak-map-coverage-note" role="note" aria-label={catalog.provider.map}>{coverageNote}</p>}
      <div className="oak-sheet-scroll" ref={scrollRef}><ItineraryTimeline model={model} actions={timelineActions} bindings={bindings} showDetails={expanded || !model.sheet.interactive} /></div>
    </div>}
  </section>;
}
