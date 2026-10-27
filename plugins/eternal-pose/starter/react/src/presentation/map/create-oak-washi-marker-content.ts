import type { MarkerContentFactory, MarkerDescriptor } from "@laugh-tale-island/core/browser";
import { BedDouble, Camera, CircleHelp, ClipboardList, Compass, ShoppingBag, TrainFront, Utensils, type LucideIcon } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { catalog, locale } from "../copy/catalog.js";

const kinds: Record<keyof typeof catalog.types, LucideIcon> = {
  custom: CircleHelp, dining: Utensils, experience: Compass, lodging: BedDouble,
  logistics: ClipboardList, shopping: ShoppingBag, sightseeing: Camera, transfer: CircleHelp, transport: TrainFront,
};

function icon(kind: keyof typeof kinds, size: number): SVGElement {
  const template = document.createElement("template");
  // Only trusted local Lucide components enter this static SVG serialization.
  template.innerHTML = renderToStaticMarkup(createElement(kinds[kind], { size, strokeWidth: 1.75, "aria-hidden": true, focusable: false }));
  return template.content.firstElementChild as SVGElement;
}

export const createOakWashiMarkerContent: MarkerContentFactory = descriptor => {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `oak-marker oak-locale--${locale.startsWith("zh-Hant") ? "zh-hant" : "en"}`;
  element.lang = locale;
  let disposed = false;
  const drop = document.createElement("span");
  drop.className = "oak-marker-drop";
  drop.setAttribute("aria-hidden", "true");
  const ordinal = document.createElement("span");
  ordinal.className = "oak-marker-ordinal";
  const badge = document.createElement("span");
  badge.className = "oak-marker-badge";
  badge.setAttribute("aria-hidden", "true");
  const baseGlyph = icon("lodging", 16);
  baseGlyph.classList.add("oak-marker-base-glyph");
  let renderedKind: keyof typeof kinds | undefined;
  element.append(drop);

  function update(next: MarkerDescriptor): void {
    if (disposed) return;
    const kind = Object.hasOwn(kinds, next.sourceKind) ? next.sourceKind as keyof typeof kinds : "custom";
    element.dataset.markerMode = next.markerMode;
    for (const state of Object.keys(catalog.status)) delete element.dataset[state];
    for (const state of next.states) element.dataset[state] = "true";
    element.setAttribute("aria-pressed", String(next.states.includes("selected")));
    element.setAttribute("aria-label", [next.markerMode === "numbered" ? next.ordinal : undefined, catalog.types[kind], catalog.timing[next.timing], next.label, ...next.states.map(state => catalog.status[state])].filter(Boolean).join(" · "));

    if (next.markerMode === "base") {
      ordinal.remove();
      badge.remove();
      if (baseGlyph.parentElement !== drop) drop.append(baseGlyph);
    } else {
      baseGlyph.remove();
      ordinal.textContent = next.ordinal ?? "";
      if (ordinal.parentElement !== drop) drop.append(ordinal);
      if (renderedKind !== kind) { badge.replaceChildren(icon(kind, 10)); renderedKind = kind; }
      if (badge.parentElement !== element) element.append(badge);
    }
  }
  update(descriptor);
  return { element, update, dispose() {
    if (disposed) return;
    disposed = true;
    drop.replaceChildren();
    badge.replaceChildren();
    ordinal.textContent = "";
    element.replaceChildren();
    element.remove();
  } };
};
