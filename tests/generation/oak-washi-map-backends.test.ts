// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { GoogleMapAdapter } from "@laugh-tale-island/adapters/google";
import { defineMapAdapterV2Contract } from "@laugh-tale-island/testing";
import type { MarkerContentHandle, UserLocationContentHandle } from "@laugh-tale-island/core/browser";
import { createRuntime, createContractHost, runtimeBridge } from "../../packages/testing/tests/fixtures/google-map-runtime.js";
import { oakWashiMapBindings } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/index.js";
import { mapContentCases } from "../fixtures/oak-washi/map-content-cases.js";

const styles = document.createElement("style");
styles.textContent = ["tokens", "components", "states", "accessibility"].map(name => readFileSync(`${process.cwd()}/plugins/eternal-pose/recipes-v2/oak-washi/presentation/styles/${name}.css`, "utf8")).join("\n");
document.head.append(styles);

for (const advanced of [false, true]) defineMapAdapterV2Contract(
  `Oak factories on ${advanced ? "AdvancedMarkerElement" : "OverlayView"}`,
  () => new GoogleMapAdapter(createRuntime(), { development: false, ...(advanced ? { mapId: "synthetic-map", cloudStyleProfileId: "contract-profile" } : {}) }),
  createContractHost,
  oakWashiMapBindings.createMarkerContent,
  oakWashiMapBindings.createUserLocationContent,
);

describe("recipe-owned backend identity", () => {
  test("both backends preserve exact factory DOM, selection, focus, clicks, location order and balanced cleanup", async () => {
    const snapshots: string[][] = [];
    for (const advanced of [false, true]) {
      const host = createContractHost();
      document.body.append(host);
      const bridge = runtimeBridge(host);
      const markerHandles: MarkerContentHandle[] = [];
      const userHandles: UserLocationContentHandle[] = [];
      const beforeMount: string[] = [];
      const markerDisposals = vi.fn();
      const userDisposals = vi.fn();
      const select = vi.fn();
      const adapter = new GoogleMapAdapter(createRuntime(), { development: false, ...(advanced ? { mapId: "synthetic-map", cloudStyleProfileId: "oak-washi" } : {}) });
      const config = {
        visualProfile: oakWashiMapBindings.mapVisualProfile,
        events: { onMarkerSelect: select, onRouteSelect: vi.fn(), onUnavailable: vi.fn() },
        createMarkerContent: ((descriptor) => {
          const handle = oakWashiMapBindings.createMarkerContent(descriptor);
          markerHandles.push(handle); beforeMount.push(handle.element.outerHTML);
          return { element: handle.element, update(next) { handle.update(next); }, dispose() { markerDisposals(); handle.dispose(); } };
        }) satisfies typeof oakWashiMapBindings.createMarkerContent,
        createUserLocationContent: ((descriptor) => {
          const handle = oakWashiMapBindings.createUserLocationContent(descriptor);
          userHandles.push(handle);
          return { element: handle.element, update(next) { bridge.sequence.push("oak-location-update"); handle.update(next); }, dispose() { userDisposals(); handle.dispose(); } };
        }) satisfies typeof oakWashiMapBindings.createUserLocationContent,
      };
      await adapter.mount(host, config);
      expect(bridge.currentMap?.options.disableDefaultUI).toBe(true);
      adapter.render({ markers: mapContentCases, routes: [] });
      expect(bridge.markerPlacements).toHaveLength(mapContentCases.length);
      const current: string[] = [];
      for (const [index, handle] of markerHandles.entries()) {
        expect(bridge.markerPlacements[index]?.element).toBe(handle.element);
        expect(handle.element.outerHTML).toBe(beforeMount[index]);
        expect(getComputedStyle(handle.element).width).toBe("44px");
        expect(getComputedStyle(handle.element).height).toBe("44px");
        handle.element.focus(); expect(document.activeElement).toBe(handle.element);
        bridge.markerPlacements[index]?.select(); expect(select).toHaveBeenLastCalledWith(mapContentCases[index]?.ownerId);
        current.push(handle.element.outerHTML);
      }
      expect(select).toHaveBeenCalledTimes(mapContentCases.length);
      adapter.render({ markers: mapContentCases.map(marker => ({ ...marker, states: ["selected"] })), routes: [] });
      current.push(...markerHandles.map(handle => handle.element.outerHTML));
      expect(markerHandles).toHaveLength(mapContentCases.length);
      adapter.setUserLocation({ lat: 25.1, lng: 121.1 });
      const user = userHandles[0];
      expect(bridge.markerPlacements.at(-1)?.element).toBe(user.element);
      const markup = user.element.outerHTML;
      expect(getComputedStyle(user.element.querySelector(".oak-location-halo")!).width).toBe("28px");
      expect(getComputedStyle(user.element.querySelector(".oak-location-core")!).width).toBe("14px");
      for (const coordinates of [{ lat: 25.2, lng: 121.2 }, { lat: 25.3, lng: 121.3 }]) {
        bridge.sequence.length = 0;
        adapter.setUserLocation(coordinates);
        expect(bridge.sequence).toEqual(["oak-location-update", "provider-position"]);
        expect(user.element.outerHTML).toBe(markup);
        expect(bridge.markerPlacements.at(-1)?.element).toBe(user.element);
      }
      current.push(markup); snapshots.push(current);
      adapter.setUserLocation(null); expect(userDisposals).toHaveBeenCalledTimes(1);
      adapter.setUserLocation({ lat: 25.4, lng: 121.4 });
      expect(userHandles).toHaveLength(2);
      await adapter.mount(host, config);
      expect(userDisposals).toHaveBeenCalledTimes(2);
      expect(markerDisposals).toHaveBeenCalledTimes(mapContentCases.length);
      adapter.setUserLocation({ lat: 25.5, lng: 121.5 });
      adapter.destroy(); adapter.destroy();
      expect(userDisposals).toHaveBeenCalledTimes(3);
      expect(markerHandles).toHaveLength(mapContentCases.length * 2);
      expect(markerDisposals).toHaveBeenCalledTimes(mapContentCases.length * 2);
      expect(host.childNodes).toHaveLength(0);
      for (const [index, handle] of markerHandles.entries()) { bridge.markerPlacements[index]?.select(); expect(handle.element.childNodes).toHaveLength(0); }
      expect(select).toHaveBeenCalledTimes(mapContentCases.length);
      host.remove();
    }
    expect(snapshots[0]).toEqual(snapshots[1]);
  });
});
