import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleMapAdapter, type GoogleMapsRuntime } from "@laugh-tale-island/adapters/google";
import type { MapMountConfig, MarkerDescriptor } from "@laugh-tale-island/core/browser";

afterEach(() => document.body.replaceChildren());

function harness(mapId: boolean, native = true) {
  const host = document.createElement("div"); document.body.appendChild(host);
  const placements: Array<{ wrapper: HTMLElement; options: Record<string, unknown>; zIndex?: number }> = [];
  const overlays: Array<{ draw(): void }> = [];
  class Map { unbindAll() {} }
  class Advanced {
    private value: unknown;
    private readonly wrapper = document.createElement("div");
    position: unknown;
    zIndex: number | undefined;
    collisionBehavior: unknown;
    constructor(readonly options: Record<string, unknown>) {
      this.value = options.map; this.position = options.position;
      this.zIndex = options.zIndex as number; this.collisionBehavior = options.collisionBehavior;
      this.wrapper.style.position = "absolute";
      this.wrapper.style.left = "320px"; this.wrapper.style.top = "240px";
      const anchorLeft = typeof options.anchorLeft === "string" ? options.anchorLeft : "-50%";
      const anchorTop = typeof options.anchorTop === "string" ? options.anchorTop : "-100%";
      this.wrapper.style.transform = `translate(${anchorLeft}, ${anchorTop})`;
      this.wrapper.appendChild(options.content as HTMLElement); host.appendChild(this.wrapper);
      placements.push({ wrapper: this.wrapper, options, get zIndex() { return (options.instance as Advanced).zIndex; } });
      options.instance = this;
    }
    get map() { return this.value; }
    set map(value: unknown) { this.value = value; if (value === null) this.wrapper.remove(); }
    addEventListener(_name: string, listener: EventListener) { this.wrapper.addEventListener("click", listener); }
    removeEventListener(_name: string, listener: EventListener) { this.wrapper.removeEventListener("click", listener); }
  }
  class Overlay {
    private mounted = false;
    setMap(value: unknown) {
      const own = this as unknown as { onAdd(): void; draw(): void; onRemove(): void };
      if (this.mounted) own.onRemove();
      this.mounted = value !== null;
      if (this.mounted) { own.onAdd(); own.draw(); overlays.push(own); }
    }
    getPanes() { return { overlayMouseTarget: host }; }
    getProjection() { return { fromLatLngToDivPixel: () => ({ x: 320, y: 240 }) }; }
  }
  const runtime = { Map, AdvancedMarkerElement: Advanced, OverlayView: Overlay, Polyline: class {}, SymbolPath: { CIRCLE: "circle" }, CollisionBehavior: { REQUIRED: "REQUIRED", REQUIRED_AND_HIDES_OPTIONAL: "REQUIRED_AND_HIDES_OPTIONAL", OPTIONAL_AND_HIDES_LOWER_PRIORITY: "OPTIONAL_AND_HIDES_LOWER_PRIORITY" } } as unknown as GoogleMapsRuntime;
  const elements: HTMLElement[] = [];
  const dispose = vi.fn(); const select = vi.fn();
  const config: MapMountConfig = {
    visualProfile: { id: "dom-profile", basemap: { mode: "neutral", density: "low", contrast: "soft", poi: "minimal", stationLabels: "legible", palette: { geometry: "#eee", label: "#111", labelStroke: "#fff", water: "#abc", park: "#bca", road: "#ddd" } }, routeStyle: () => null },
    events: { onMarkerSelect: select, onRouteSelect: vi.fn(), onUnavailable: vi.fn() },
    createMarkerContent(descriptor) {
      const element = document.createElement(native ? "button" : "div");
      if (!native) { element.setAttribute("role", "button"); element.tabIndex = 0; }
      element.setAttribute("aria-label", descriptor.label);
      element.style.width = "48px"; element.style.height = "40px";
      element.style.transform = "rotate(10deg)";
      elements.push(element);
      return { element, update(next) { element.style.transform = next.states.includes("selected") ? "scale(1.25) rotate(10deg)" : "rotate(10deg)"; }, dispose };
    },
    createUserLocationContent() { const element = document.createElement("span"); element.style.transform = "scale(0.8)"; elements.push(element); return { element, update: vi.fn(), dispose }; },
  };
  return { adapter: new GoogleMapAdapter(runtime, { development: false, ...(mapId ? { mapId: "configured-map", cloudStyleProfileId: "dom-profile" } : {}) }), config, host, placements, overlays, elements, dispose, select };
}

const descriptor = (ownerId: string, states: MarkerDescriptor["states"] = [], markerMode: MarkerDescriptor["markerMode"] = "numbered"): MarkerDescriptor => ({
  ownerId, label: ownerId, coordinates: { lat: 0, lng: 0 }, markerMode, sourceKind: markerMode === "base" ? "lodging" : "sightseeing", timing: "suggested", states,
});

describe.each([false, true])("Google DOM placement with Map ID %s", (mapId) => {
  it("preserves recipe transforms and the shared bottom-center anchor through updates/redraws", async () => {
    const h = harness(mapId); await h.adapter.mount(h.host, h.config);
    h.adapter.render({ markers: [descriptor("owner")], routes: [] });
    const element = h.elements[0]; const wrapper = element.parentElement!;
    expect(wrapper).not.toBe(h.host);
    expect(wrapper.style.position).toBe("absolute");
    expect(wrapper.style.left).toBe("320px"); expect(wrapper.style.top).toBe("240px");
    expect(wrapper.style.transform).toBe("translate(-50%, -100%)");
    expect(element.style.transform).toBe("rotate(10deg)");
    h.adapter.render({ markers: [descriptor("owner", ["selected"])], routes: [] });
    for (const overlay of h.overlays) overlay.draw();
    expect(h.elements).toHaveLength(1);
    expect(element.style.transform).toBe("scale(1.25) rotate(10deg)");
    expect(element.getAttribute("aria-label")).toBe("owner");
    expect(element.style.width).toBe("48px"); expect(element.style.height).toBe("40px");
    h.adapter.setUserLocation({ lat: 0, lng: 0 }); h.adapter.setUserLocation({ lat: 1, lng: 1 });
    expect(h.elements[1].style.transform).toBe("scale(0.8)");
    h.adapter.setUserLocation(null); h.adapter.destroy(); h.adapter.destroy();
    expect(h.dispose).toHaveBeenCalledTimes(2);
    expect(h.host.children).toHaveLength(0);
  });

  it("prioritizes coincident selected, candidate, primary and base owners and updates their ordering", async () => {
    const h = harness(mapId); await h.adapter.mount(h.host, h.config);
    const markers = [descriptor("base", [], "base"), descriptor("primary"), descriptor("candidate", ["candidate"]), descriptor("selected", ["selected"])];
    h.adapter.render({ markers, routes: [] });
    const priority = () => mapId ? h.placements.map((p) => p.zIndex) : h.elements.map((e) => Number(e.parentElement?.style.zIndex));
    expect(priority()).toEqual([1, 2, 3, 4]);
    h.adapter.render({ markers: [descriptor("base", ["selected"], "base"), descriptor("primary", ["candidate"]), descriptor("candidate"), descriptor("selected")], routes: [] });
    expect(priority()).toEqual([4, 3, 2, 2]);
    if (mapId) {
      expect(h.placements[0].options.collisionBehavior).toBe("OPTIONAL_AND_HIDES_LOWER_PRIORITY");
      expect((h.placements[0].options.instance as { collisionBehavior: string }).collisionBehavior).toBe("REQUIRED_AND_HIDES_OPTIONAL");
    }
    h.adapter.destroy();
  });

  it("activates a focused native recipe button exactly once for Enter and Space", async () => {
    const h = harness(mapId); await h.adapter.mount(h.host, h.config);
    h.adapter.render({ markers: [descriptor("button")], routes: [] });
    const user = userEvent.setup(); h.elements[0].focus();
    expect(document.activeElement).toBe(h.elements[0]);
    await user.keyboard("{Enter}"); expect(h.select).toHaveBeenCalledTimes(1);
    await user.keyboard(" "); expect(h.select).toHaveBeenCalledTimes(2);
    h.adapter.destroy(); await user.keyboard("{Enter}");
    expect(h.select).toHaveBeenCalledTimes(2);
  });
});

it("cancels the custom OverlayView Space default and emits one activation", async () => {
  const h = harness(false, false); await h.adapter.mount(h.host, h.config);
  h.adapter.render({ markers: [descriptor("custom")], routes: [] });
  const defaults: boolean[] = [];
  h.elements[0].addEventListener("keydown", (event) => { if (event.key === " ") defaults.push(event.defaultPrevented); });
  h.elements[0].focus(); await userEvent.setup().keyboard(" ");
  expect(h.select).toHaveBeenCalledExactlyOnceWith("custom");
  expect(defaults).toEqual([true]);
  h.adapter.destroy();
});
